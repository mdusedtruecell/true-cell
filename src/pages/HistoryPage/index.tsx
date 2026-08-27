import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useInvoiceStore } from 'store/invoiceStore';
import ConfirmDialog from 'components/ConfirmDialog/ConfirmDialog';
import InvoicePrintView from 'components/InvoicePrintView/InvoicePrintView';
import { generatePdf, getPdfFilename } from 'utils/pdf';
import { buildWhatsappMessage } from 'utils/whatsapp';
import { useToast } from 'components/Toast/Toast';
import Header from 'components/Header/Header';
import type { Invoice } from 'types/invoice';
import {
    type SheetInvoice,
    type SheetRow,
    buildHistoryUrl,
    cancelInvoiceInGoogleSheet,
    cleanText,
    fetchSheetHistory,
    GOOGLE_SHEET_WEB_APP_URL,
    getInvoiceKey,
    getSortTimestamp,
    groupSheetRowsToInvoices,
    mergeInvoices,
    normalizeOrderStatus,
    updateCustomerShipInGoogleSheet,
} from 'utils/googleSheet';
import whatsappIcon from '../../assets/whatsapp.png';
import deleteIcon from '../../assets/delete.png';
import plusIcon from '../../assets/plus_icon.png';
import editIcon from '../../assets/edit_i.png';
import backbtn from '../../assets/back.png';

const HISTORY_REFRESH_MS = 5000;
const HISTORY_MIN_REFRESH_GAP_MS = 3500;

const fetchSalesHistoryDirect = (
    salesPerson: string
): Promise<{ success?: boolean; message?: string; data?: SheetRow[] }> => {
    return new Promise((resolve, reject) => {
        const callbackName =
            `__truecellFastHistory_${Date.now()}_${Math.random()
                .toString(36)
                .slice(2)}`;

        const params = new URLSearchParams();
        params.set('salesPerson', salesPerson);
        params.set('callback', callbackName);
        params.set('_', String(Date.now()));

        const script = document.createElement('script');
        let done = false;

        const cleanup = () => {
            if (done) return;
            done = true;
            window.clearTimeout(timeoutId);

            try {
                delete (window as any)[callbackName];
            } catch {
                (window as any)[callbackName] = undefined;
            }

            if (script.parentNode) {
                script.parentNode.removeChild(script);
            }
        };

        const timeoutId = window.setTimeout(() => {
            cleanup();
            reject(new Error('Google Sheet sync timed out'));
        }, 10000);

        (window as any)[callbackName] = (json: any) => {
            cleanup();

            if (!json?.success || !Array.isArray(json.data)) {
                reject(
                    new Error(
                        json?.message ||
                            'Invalid Google Sheet response'
                    )
                );
                return;
            }

            resolve(json);
        };

        script.onerror = () => {
            cleanup();
            reject(new Error('Could not connect to Google Sheet'));
        };

        script.async = true;
        script.src =
            `${GOOGLE_SHEET_WEB_APP_URL}?${params.toString()}`;

        document.body.appendChild(script);
    });
};

const ShipIcon = () => (
    <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
    >
        <path
            d="M3 7H14V16H3V7Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
        />
        <path
            d="M14 10H18.2L21 13.2V16H14V10Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
        />
        <circle
            cx="7"
            cy="18"
            r="1.8"
            stroke="currentColor"
            strokeWidth="1.8"
        />
        <circle
            cx="18"
            cy="18"
            r="1.8"
            stroke="currentColor"
            strokeWidth="1.8"
        />
    </svg>
);

const isCancelledByKey = (
    invoice: SheetInvoice,
    cancelledKeys: string[]
) => {
    const key = getInvoiceKey(invoice);
    const invoiceNumber = cleanText(invoice.invoiceNumber);
    const orderId = cleanText(invoice.orderId);

    return cancelledKeys.some((cancelledKey) => {
        return (
            cancelledKey === key ||
            cancelledKey === invoiceNumber ||
            cancelledKey === orderId
        );
    });
};


/*
 * Keep invoice cards in creation order.
 * Later Ship / DCC / payment / status updates may change revision/updatedAt,
 * but must never move an existing invoice up or down.
 */
const getInvoiceCreatedTimestamp = (
    invoice: SheetInvoice
): number => {
    const created = Date.parse(
        cleanText(invoice.invoiceDate)
    );

    if (Number.isFinite(created)) {
        return created;
    }

    return getSortTimestamp(invoice);
};

export const HistoryPage: React.FC = () => {
    const navigate = useNavigate();
    const { push } = useToast();

    const loggedInRep = useInvoiceStore(
        (s: any) => s.loggedInRep
    );

    const canReturnToAccountsDashboard =
        loggedInRep?.canAccessAllInvoices === true ||
        cleanText(loggedInRep?.name).toLowerCase() === 'accounts';

    const invoiceHistory: SheetInvoice[] = useInvoiceStore(
        (s: any) => s.invoiceHistory
    );

    const cancelledInvoiceKeys: string[] = useInvoiceStore(
        (s: any) => s.cancelledInvoiceKeys || []
    );

    const deleteFromHistory = useInvoiceStore(
        (s: any) => s.deleteFromHistory
    );

    const addCancelledInvoiceKey = useInvoiceStore(
        (s: any) => s.addCancelledInvoiceKey
    );

    const saveInvoice = useInvoiceStore(
        (s: any) => s.saveInvoice
    );

    const updateInHistory = useInvoiceStore(
        (s: any) => s.updateInHistory
    );

    const [sheetInvoices, setSheetInvoices] = useState<
        SheetInvoice[]
    >([]);

    const [isSyncing, setIsSyncing] = useState(false);
    const [hasLoadedHistory, setHasLoadedHistory] =
        useState(false);

    const [historyError, setHistoryError] = useState('');

    const [cancelTarget, setCancelTarget] =
        useState<SheetInvoice | null>(null);

    const [shipTarget, setShipTarget] =
        useState<SheetInvoice | null>(null);

    const [shareInvoice, setShareInvoice] =
        useState<SheetInvoice | null>(null);

    const pdfRef = useRef<HTMLDivElement | null>(null);
    const loadingRef = useRef(false);
    const lastHistoryLoadRef = useRef(0);

    const localRepInvoices = useMemo(() => {
        return invoiceHistory
            .filter((invoice) => {
                const sameRep =
                    cleanText(
                        invoice.salesRepresentative
                    ).toLowerCase() ===
                    cleanText(
                        loggedInRep?.name
                    ).toLowerCase();

                const active =
                    normalizeOrderStatus(
                        invoice.orderStatus
                    ) !== 'Cancel';

                const cancelled = isCancelledByKey(
                    invoice,
                    cancelledInvoiceKeys
                );

                return sameRep && active && !cancelled;
            })
            .sort(
                (a, b) =>
                    getInvoiceCreatedTimestamp(b) -
                    getInvoiceCreatedTimestamp(a)
            );
    }, [
        cancelledInvoiceKeys,
        invoiceHistory,
        loggedInRep?.name,
    ]);

    const sheetActiveInvoices = useMemo(() => {
        return sheetInvoices
            .filter((invoice) => {
                const active =
                    normalizeOrderStatus(
                        invoice.orderStatus
                    ) !== 'Cancel';

                const cancelled = isCancelledByKey(
                    invoice,
                    cancelledInvoiceKeys
                );

                return active && !cancelled;
            })
            .sort(
                (a, b) =>
                    getInvoiceCreatedTimestamp(b) -
                    getInvoiceCreatedTimestamp(a)
            );
    }, [cancelledInvoiceKeys, sheetInvoices]);

    const repInvoices = useMemo(() => {
        if (!hasLoadedHistory) {
            return localRepInvoices;
        }

        return mergeInvoices(
            localRepInvoices,
            sheetActiveInvoices
        )
            .filter(
                (invoice) =>
                    !isCancelledByKey(
                        invoice,
                        cancelledInvoiceKeys
                    )
            )
            .sort(
                (a, b) =>
                    getInvoiceCreatedTimestamp(b) -
                    getInvoiceCreatedTimestamp(a)
            );
    }, [
        cancelledInvoiceKeys,
        hasLoadedHistory,
        localRepInvoices,
        sheetActiveInvoices,
    ]);

    const totalAmount = repInvoices.reduce(
        (sum, invoice) => sum + invoice.total,
        0
    );

    const loadHistoryFromSheet = useCallback(
        async (
            force = false,
            directOnly = false
        ) => {
            if (!loggedInRep?.name) {
                setHasLoadedHistory(true);
                setIsSyncing(false);
                return;
            }

            if (loadingRef.current) {
                return;
            }

            if (
                !force &&
                Date.now() - lastHistoryLoadRef.current <
                    HISTORY_MIN_REFRESH_GAP_MS
            ) {
                return;
            }

            loadingRef.current = true;
            lastHistoryLoadRef.current = Date.now();

            setIsSyncing(true);
            setHistoryError('');

            try {
                let json: {
                    success?: boolean;
                    message?: string;
                    data?: SheetRow[];
                };

                try {
                    /*
                     * Fast path: direct Apps Script read.
                     * Background 5-second refreshes never touch Vercel.
                     */
                    json = await fetchSalesHistoryDirect(
                        loggedInRep.name
                    );
                } catch (directError) {
                    if (directOnly) {
                        throw directError;
                    }

                    /*
                     * One normal proxy fallback is allowed for opening/manual
                     * refresh reliability, but NOT for the 5-second timer.
                     */
                    json = await fetchSheetHistory(
                        buildHistoryUrl(loggedInRep.name)
                    );
                }

                if (
                    !json?.success ||
                    !Array.isArray(json.data)
                ) {
                    throw new Error(
                        json?.message ||
                            'Invalid invoice history response'
                    );
                }

                const sheetHistoryInvoices =
                    groupSheetRowsToInvoices(
                        json.data as SheetRow[]
                    )
                        .filter((invoice) => {
                            return (
                                normalizeOrderStatus(
                                    invoice.orderStatus
                                ) !== 'Cancel' &&
                                !isCancelledByKey(
                                    invoice,
                                    cancelledInvoiceKeys
                                )
                            );
                        })
                        .sort(
                            (a, b) =>
                                getInvoiceCreatedTimestamp(b) -
                                getInvoiceCreatedTimestamp(a)
                        );

                /*
                 * Local cache is ONLY for instant display.
                 *
                 * Once Google Sheet successfully returns an invoice,
                 * Sheet status becomes the final truth. This prevents an
                 * old locally-saved "Shipped" status from staying Shipped
                 * when the actual Sheet says Pending.
                 */
                const latestLocalInvoices =
                    (
                        useInvoiceStore.getState()
                            .invoiceHistory || []
                    )
                        .filter((invoice) => {
                            const sameRep =
                                cleanText(
                                    invoice.salesRepresentative
                                ).toLowerCase() ===
                                cleanText(
                                    loggedInRep.name
                                ).toLowerCase();

                            return (
                                sameRep &&
                                normalizeOrderStatus(
                                    invoice.orderStatus
                                ) !== 'Cancel' &&
                                !isCancelledByKey(
                                    invoice,
                                    cancelledInvoiceKeys
                                )
                            );
                        }) as SheetInvoice[];

                const mergedInvoices = mergeInvoices(
                    latestLocalInvoices,
                    sheetHistoryInvoices
                );

                const sheetInvoiceByKey = new Map<
                    string,
                    SheetInvoice
                >();

                sheetHistoryInvoices.forEach(
                    (sheetInvoice) => {
                        const key =
                            getInvoiceKey(sheetInvoice);

                        if (key) {
                            sheetInvoiceByKey.set(
                                key,
                                sheetInvoice
                            );
                        }

                        const invoiceNumber =
                            cleanText(
                                sheetInvoice.invoiceNumber
                            );

                        if (invoiceNumber) {
                            sheetInvoiceByKey.set(
                                invoiceNumber,
                                sheetInvoice
                            );
                        }
                    }
                );

                const invoices = mergedInvoices
                    .map((invoice) => {
                        const sheetInvoice =
                            sheetInvoiceByKey.get(
                                getInvoiceKey(invoice)
                            ) ||
                            sheetInvoiceByKey.get(
                                cleanText(
                                    invoice.invoiceNumber
                                )
                            );

                        if (!sheetInvoice) {
                            return invoice;
                        }

                        return {
                            ...invoice,

                            /*
                             * These fields must follow Sheet after
                             * every successful sync.
                             */
                            paymentStatus:
                                sheetInvoice.paymentStatus,
                            orderStatus:
                                sheetInvoice.orderStatus,
                            orderShipStatus:
                                sheetInvoice.orderShipStatus,
                            customerShipStatus:
                                sheetInvoice.customerShipStatus,

                            /*
                             * Keep Sheet metadata too, but display order
                             * still uses invoiceDate only.
                             */
                            updatedAt:
                                sheetInvoice.updatedAt ||
                                invoice.updatedAt,
                            revision:
                                sheetInvoice.revision ||
                                invoice.revision,
                        } as SheetInvoice;
                    })
                    .sort(
                        (a, b) =>
                            getInvoiceCreatedTimestamp(b) -
                            getInvoiceCreatedTimestamp(a)
                    );

                setSheetInvoices(invoices);
                setHasLoadedHistory(true);
                setHistoryError('');

                invoices.forEach((invoice) => {
                    updateInHistory(invoice as Invoice);
                });
            } catch (error) {
                console.error(
                    'History sync failed:',
                    error
                );

                setHistoryError(
                    'Could not load latest invoices. Showing saved local invoices.'
                );

                setHasLoadedHistory(true);
            } finally {
                loadingRef.current = false;
                setIsSyncing(false);
            }
        },
        [
            cancelledInvoiceKeys,
            loggedInRep?.name,
            updateInHistory,
        ]
    );

    useEffect(() => {
        if (!loggedInRep?.name) {
            setHasLoadedHistory(true);
            setIsSyncing(false);
            return;
        }

        // Cache is already visible; quietly get a fresh Sheet snapshot now.
        void loadHistoryFromSheet(true, false);

        const intervalId = window.setInterval(() => {
            if (
                document.visibilityState === 'visible'
            ) {
                // Fast direct Apps Script sync. No Vercel request here.
                void loadHistoryFromSheet(true, true);
            }
        }, HISTORY_REFRESH_MS);

        const handleFocus = () => {
            if (
                document.visibilityState === 'visible'
            ) {
                // Coming back to the tab should refresh immediately.
                void loadHistoryFromSheet(true, true);
            }
        };

        document.addEventListener(
            'visibilitychange',
            handleFocus
        );

        window.addEventListener('focus', handleFocus);

        return () => {
            window.clearInterval(intervalId);

            document.removeEventListener(
                'visibilitychange',
                handleFocus
            );

            window.removeEventListener(
                'focus',
                handleFocus
            );
        };
    }, [loadHistoryFromSheet, loggedInRep?.name]);

    const handleEdit = (invoice: SheetInvoice) => {
        saveInvoice(invoice);

        navigate('/invoice/new', {
            state: {
                invoice,
                isEditing: true,
            },
        });
    };

    const confirmCancel = () => {
        if (!cancelTarget) {
            return;
        }

        const key = getInvoiceKey(cancelTarget);

        const invoiceNumber = cleanText(
            cancelTarget.invoiceNumber
        );

        const orderId = cleanText(
            cancelTarget.orderId
        );

        [key, invoiceNumber, orderId].forEach(
            (cancelKey) => {
                if (cancelKey) {
                    addCancelledInvoiceKey(cancelKey);
                    deleteFromHistory(cancelKey);
                }
            }
        );

        setSheetInvoices((current) =>
            current.filter((invoice) => {
                return (
                    getInvoiceKey(invoice) !== key &&
                    cleanText(
                        invoice.invoiceNumber
                    ) !== invoiceNumber &&
                    cleanText(invoice.orderId) !==
                        orderId
                );
            })
        );

        setCancelTarget(null);
        push('Order cancelled successfully');

        void cancelInvoiceInGoogleSheet(cancelTarget)
            .then(() => {
                window.setTimeout(
                    () =>
                        void loadHistoryFromSheet(
                            true
                        ),
                    1200
                );

                window.setTimeout(
                    () =>
                        void loadHistoryFromSheet(
                            true
                        ),
                    3500
                );
            })
            .catch((error) => {
                console.error(
                    'Cancel sync failed:',
                    error
                );

                push(
                    'Order cancelled locally. Backend sync failed, please refresh.'
                );
            });
    };

    const handleShipClick = (
        invoice: SheetInvoice
    ) => {
        if (
            invoice.customerShipStatus ===
            'shipped'
        ) {
            push('This order is already shipped.');
            return;
        }

        /*
         * NO network request on Ship click.
         * The 5-second background Sheet sync keeps this value fresh.
         * Result: message/popup appears instantly.
         */
        const dccStatus = cleanText(
            invoice.orderShipStatus
        ).toLowerCase();

        if (dccStatus !== 'dcc dispatch') {
            push(
                'Cannot ship yet. DCC Dispatch is not completed for this order.'
            );
            return;
        }

        setShipTarget(invoice);
    };

    const confirmCustomerShip = () => {
        if (!shipTarget) {
            return;
        }

        const updatedInvoice: SheetInvoice = {
            ...shipTarget,
            customerShipStatus: 'shipped',
            updatedAt: new Date().toISOString(),
            revision: Date.now(),
        };

        const updatedKey =
            getInvoiceKey(updatedInvoice);

        setSheetInvoices((current) =>
            current.map((item) =>
                getInvoiceKey(item) === updatedKey
                    ? {
                          ...item,
                          customerShipStatus:
                              'shipped' as const,
                          updatedAt:
                              updatedInvoice.updatedAt,
                          revision:
                              updatedInvoice.revision,
                      }
                    : item
            )
        );

        updateInHistory(updatedInvoice as Invoice);

        setShipTarget(null);
        push('Order marked as shipped');

        /*
         * Shipped localStorage mein turant save hai.
         * Backend update background mein chalega.
         *
         * Yahan automatic refresh nahi karna, warna delayed ya
         * stale Sheet response local Shipped ko hata sakta tha.
         */
        void updateCustomerShipInGoogleSheet(
            updatedInvoice
        )
            .then(() => {
                /*
                 * Local UI was instant. Now quietly confirm the final
                 * state from Sheet so local cache cannot remain stale.
                 */
                window.setTimeout(
                    () =>
                        void loadHistoryFromSheet(
                            true
                        ),
                    900
                );
            })
            .catch((error) => {
                console.error(
                    'Ship sync failed:',
                    error
                );

                push(
                    'Ship update could not be saved. Restoring status from Google Sheet.'
                );

                /*
                 * If write failed, immediately let Sheet truth replace
                 * the optimistic local Shipped status.
                 */
                window.setTimeout(
                    () =>
                        void loadHistoryFromSheet(
                            true
                        ),
                    300
                );
            });
    };

    const handleShare = (invoice: SheetInvoice) => {
        setShareInvoice(invoice);

        setTimeout(async () => {
            if (!pdfRef.current) {
                push(
                    'Could not prepare invoice for sharing'
                );
                setShareInvoice(null);
                return;
            }

            try {
                const blob = await generatePdf(
                    pdfRef.current
                );

                const file = new File(
                    [blob],
                    getPdfFilename(invoice),
                    {
                        type: 'application/pdf',
                    }
                );

                // @ts-ignore
                if (
                    navigator.canShare &&
                    navigator.canShare({
                        files: [file],
                    })
                ) {
                    // @ts-ignore
                    await navigator.share({
                        files: [file],
                        title: `Invoice ${invoice.invoiceNumber}`,
                    });
                } else {
                    const url =
                        URL.createObjectURL(blob);

                    window.open(url, '_blank');

                    setTimeout(
                        () =>
                            URL.revokeObjectURL(url),
                        10000
                    );

                    const message =
                        buildWhatsappMessage(invoice);

                    window.open(
                        `https://wa.me/?text=${encodeURIComponent(
                            message
                        )}`
                    );
                }
            } catch (error) {
                console.error(
                    'Share failed:',
                    error
                );

                push('Failed to share invoice');
            } finally {
                setShareInvoice(null);
            }
        }, 300);
    };

    const statusLabel = (status?: string) => {
        if (status === 'paid') {
            return 'PAID';
        }

        if (status === 'deposit') {
            return 'Deposit';
        }

        return 'PENDING';
    };

    const statusClass = (status?: string) => {
        if (status === 'paid') {
            return 'badge badge--paid';
        }

        if (status === 'deposit') {
            return 'badge badge--deposit';
        }

        return 'badge badge--pending';
    };

    const shipStatusStyle = (
        status?: string
    ): React.CSSProperties => {
        const normalizedStatus =
            cleanText(status).toLowerCase();

        const base: React.CSSProperties = {
            fontSize: 12,
            fontWeight: 600,
            padding: '4px 10px',
            borderRadius: 5,
            color: '#fff',
            minWidth: 90,
            textAlign: 'center',
        };

        if (normalizedStatus === 'ready to ship') {
            return {
                ...base,
                background: '#777777',
            };
        }

        if (normalizedStatus === 'in process') {
            return {
                ...base,
                background: '#f05a28',
            };
        }

        if (normalizedStatus === 'dcc dispatch') {
            return {
                ...base,
                background: '#a10070',
            };
        }

        return {
            ...base,
            background: '#777777',
        };
    };

    const customerShippedStyle =
        (): React.CSSProperties => {
            return {
                fontSize: 12,
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: 5,
                color: '#fff',
                background: '#188a3b',
                minWidth: 90,
                textAlign: 'center',
            };
        };

    const emptyMessage = () => {
        if (repInvoices.length > 0) {
            return '';
        }

        if (!hasLoadedHistory) {
            return 'Loading saved invoices...';
        }

        if (historyError) {
            return historyError;
        }

        if (isSyncing) {
            return 'Syncing latest invoices...';
        }

        return 'No invoices yet.';
    };

    return (
        <div className="page history-page">
            <Header
                title={`Welcome ${loggedInRep?.name || ''}`}
                left={
                    canReturnToAccountsDashboard ? (
                        <button
                            type="button"
                            onClick={() => navigate('/management')}
                            aria-label="Back to Accounts Dashboard"
                        >
                            <img
                                src={backbtn}
                                alt="Back"
                            />
                        </button>
                    ) : undefined
                }
            />

            <div className="history-stats p-40-20">
                <div className="stat-block">
                    <div className="stat-label">
                        Total Invoices
                    </div>

                    <div className="stat-value">
                        {repInvoices.length}
                    </div>
                </div>

                <div className="stat-block stat-block--accent">
                    <div className="stat-label">
                        Total Amount
                    </div>

                    <div className="stat-value">
                        {totalAmount.toLocaleString()}
                    </div>
                </div>
            </div>

            <main className="history-list-container">
                {repInvoices.length === 0 ? (
                    <div className="history-empty">
                        <p>{emptyMessage()}</p>

                        {hasLoadedHistory &&
                            !historyError &&
                            !isSyncing && (
                                <p>
                                    Tap{' '}
                                    <strong>+</strong>{' '}
                                    to create your first
                                    invoice.
                                </p>
                            )}
                    </div>
                ) : (
                    <div className="history-scroll">
                        {repInvoices.map(
                            (invoice) => (
                                <div
                                    key={
                                        invoice.orderId ||
                                        invoice.invoiceNumber
                                    }
                                    className="history-card"
                                >
                                    <div className="history-card-top padd-14">
                                        <span className="history-inv-num">
                                            {
                                                invoice.invoiceNumber
                                            }
                                        </span>

                                        <div
                                            style={{
                                                display:
                                                    'flex',
                                                flexDirection:
                                                    'column',
                                                alignItems:
                                                    'flex-end',
                                                gap: 7,
                                            }}
                                        >
                                            <span
                                                className={statusClass(
                                                    invoice.paymentStatus
                                                )}
                                            >
                                                {statusLabel(
                                                    invoice.paymentStatus
                                                )}
                                            </span>

                                            {cleanText(
                                                invoice.orderShipStatus
                                            ) && (
                                                <span
                                                    style={shipStatusStyle(
                                                        invoice.orderShipStatus
                                                    )}
                                                >
                                                    {
                                                        invoice.orderShipStatus
                                                    }
                                                </span>
                                            )}

                                            {invoice.customerShipStatus ===
                                                'shipped' && (
                                                <span
                                                    style={customerShippedStyle()}
                                                >
                                                    Shipped
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="history-customer padd-14">
                                        Customer :{' '}
                                        {
                                            invoice.customerName
                                        }
                                    </div>

                                    <div className="history-amount padd-14">
                                        {invoice.total.toLocaleString()}
                                    </div>

                                    <div className="history-actions">
                                        <button
                                            className="h-action-btn"
                                            onClick={() =>
                                                handleEdit(
                                                    invoice
                                                )
                                            }
                                        >
                                            Edit

                                            <img
                                                src={
                                                    editIcon
                                                }
                                                alt=""
                                                style={{
                                                    width: 20,
                                                    height: 20,
                                                }}
                                            />
                                        </button>

                                        <button
                                            className="h-action-btn h-action-btn--ship"
                                            onClick={() =>
                                                handleShipClick(
                                                    invoice
                                                )
                                            }
                                            title={
                                                invoice.customerShipStatus ===
                                                'shipped'
                                                    ? 'Already shipped'
                                                    : 'Mark customer ship as shipped'
                                            }
                                        >
                                            Ship
                                            <ShipIcon />
                                        </button>

                                        <button
                                            className="h-action-btn h-action-btn--share"
                                            onClick={() =>
                                                handleShare(
                                                    invoice
                                                )
                                            }
                                        >
                                            Share

                                            <img
                                                src={
                                                    whatsappIcon
                                                }
                                                alt=""
                                                style={{
                                                    width: 20,
                                                    height: 20,
                                                }}
                                            />
                                        </button>

                                        <button
                                            className="h-action-btn h-action-btn--del"
                                            onClick={() =>
                                                setCancelTarget(
                                                    invoice
                                                )
                                            }
                                        >
                                            Cancel

                                            <img
                                                src={
                                                    deleteIcon
                                                }
                                                alt=""
                                                style={{
                                                    width: 20,
                                                    height: 20,
                                                }}
                                            />
                                        </button>
                                    </div>
                                </div>
                            )
                        )}
                    </div>
                )}
            </main>

            <div className="history-footer">
                <button
                    className="fab-btn"
                    onClick={() =>
                        navigate('/invoice/new')
                    }
                    aria-label="Create new invoice"
                >
                    <img
                        src={plusIcon}
                        alt="Create Invoice"
                        className="plus-p-b"
                    />
                </button>
            </div>

            {shareInvoice && (
                <div
                    style={{
                        position: 'fixed',
                        left: 0,
                        top: 0,
                        width: '100%',
                        opacity: 0,
                        pointerEvents: 'none',
                        zIndex: -1,
                    }}
                    aria-hidden
                >
                    <InvoicePrintView
                        invoice={shareInvoice}
                        ref={pdfRef}
                    />
                </div>
            )}

            <ConfirmDialog
                open={!!cancelTarget}
                title="Cancel Order"
                description="Are you sure you want to cancel this order? It will be removed from invoice history, but it will stay in Google Sheet as Cancel."
                confirmLabel="Cancel Order"
                onConfirm={confirmCancel}
                onClose={() =>
                    setCancelTarget(null)
                }
            />

            <ConfirmDialog
                open={!!shipTarget}
                title="Ship Order"
                description="Do you want to mark this order as shipped?"
                confirmLabel="Shipped"
                onConfirm={confirmCustomerShip}
                onClose={() =>
                    setShipTarget(null)
                }
            />
        </div>
    );
};

export default HistoryPage;