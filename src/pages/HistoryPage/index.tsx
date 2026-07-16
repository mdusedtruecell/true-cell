import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInvoiceStore } from 'store/invoiceStore';
import ConfirmDialog from 'components/ConfirmDialog/ConfirmDialog';
import InvoicePrintView from 'components/InvoicePrintView/InvoicePrintView';
import { generatePdf, getPdfFilename } from 'utils/pdf';
import { buildWhatsappMessage } from 'utils/whatsapp';
import { useToast } from 'components/Toast/Toast';
import type { Invoice } from 'types/invoice';
import {
    type SheetInvoice,
    type SheetRow,
    buildHistoryUrl,
    cancelInvoiceInGoogleSheet,
    cleanText,
    fetchSheetHistory,
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

const HISTORY_REFRESH_MS = 5 * 60 * 1000;
const HISTORY_MIN_REFRESH_GAP_MS = 30 * 1000;

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
        <circle cx="7" cy="18" r="1.8" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="18" cy="18" r="1.8" stroke="currentColor" strokeWidth="1.8" />
    </svg>
);

const isCancelledByKey = (invoice: SheetInvoice, cancelledKeys: string[]) => {
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

export const HistoryPage: React.FC = () => {
    const navigate = useNavigate();
    const { push } = useToast();

    const loggedInRep = useInvoiceStore((s: any) => s.loggedInRep);
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
    const saveInvoice = useInvoiceStore((s: any) => s.saveInvoice);
    const updateInHistory = useInvoiceStore(
        (s: any) => s.updateInHistory
    );

    const [sheetInvoices, setSheetInvoices] = useState<SheetInvoice[]>([]);
    const [isSyncing, setIsSyncing] = useState(false);
    const [hasLoadedHistory, setHasLoadedHistory] = useState(false);
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
                    cleanText(invoice.salesRepresentative).toLowerCase() ===
                    cleanText(loggedInRep?.name).toLowerCase();

                const active =
                    normalizeOrderStatus(invoice.orderStatus) !== 'Cancel';

                const cancelled = isCancelledByKey(
                    invoice,
                    cancelledInvoiceKeys
                );

                return sameRep && active && !cancelled;
            })
            .sort(
                (a, b) =>
                    getSortTimestamp(b) - getSortTimestamp(a)
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
                    normalizeOrderStatus(invoice.orderStatus) !== 'Cancel';

                const cancelled = isCancelledByKey(
                    invoice,
                    cancelledInvoiceKeys
                );

                return active && !cancelled;
            })
            .sort(
                (a, b) =>
                    getSortTimestamp(b) - getSortTimestamp(a)
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
                    getSortTimestamp(b) - getSortTimestamp(a)
            );
    }, [
        cancelledInvoiceKeys,
        hasLoadedHistory,
        localRepInvoices,
        sheetActiveInvoices,
    ]);

    const totalAmount = repInvoices.reduce(
        (sum, inv) => sum + inv.total,
        0
    );

    const loadHistoryFromSheet = useCallback(
        async (force = false) => {
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
                const json = await fetchSheetHistory(
                    buildHistoryUrl(loggedInRep.name)
                );

                if (
                    !json?.success ||
                    !Array.isArray(json.data)
                ) {
                    throw new Error(
                        json?.message ||
                            'Invalid invoice history response'
                    );
                }

                const invoices = groupSheetRowsToInvoices(
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
                            getSortTimestamp(b) -
                            getSortTimestamp(a)
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

        // History page open hote hi invoices load hongi.
        void loadHistoryFromSheet();

        // Page open rehne par har 5 minute refresh hoga.
        // Background tab mein request nahi jayegi.
        const intervalId = window.setInterval(() => {
            if (
                document.visibilityState === 'visible'
            ) {
                void loadHistoryFromSheet();
            }
        }, HISTORY_REFRESH_MS);

        // User tab ya window par wapas aaye to latest data check hoga.
        // 30-second throttle duplicate requests rokega.
        const handleFocus = () => {
            if (
                document.visibilityState === 'visible'
            ) {
                void loadHistoryFromSheet();
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
        const orderId = cleanText(cancelTarget.orderId);

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
                    cleanText(invoice.invoiceNumber) !==
                        invoiceNumber &&
                    cleanText(invoice.orderId) !== orderId
                );
            })
        );

        setCancelTarget(null);
        push('Order cancelled successfully');

        void cancelInvoiceInGoogleSheet(cancelTarget)
            .then(() => {
                // Cancel ke baad latest result turant verify hoga.
                window.setTimeout(
                    () =>
                        void loadHistoryFromSheet(true),
                    1200
                );

                window.setTimeout(
                    () =>
                        void loadHistoryFromSheet(true),
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

        void updateCustomerShipInGoogleSheet(
            updatedInvoice
        )
            .then(() => {
                // Shipping update ke baad immediate verification.
                window.setTimeout(
                    () =>
                        void loadHistoryFromSheet(true),
                    1200
                );

                window.setTimeout(
                    () =>
                        void loadHistoryFromSheet(true),
                    3500
                );
            })
            .catch((error) => {
                console.error(
                    'Ship sync failed:',
                    error
                );

                push(
                    'Order marked shipped locally. Backend sync failed, please refresh.'
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

    const statusLabel = (s?: string) => {
        if (s === 'paid') {
            return 'PAID';
        }

        if (s === 'deposit') {
            return 'Deposit';
        }

        return 'PENDING';
    };

    const statusClass = (s?: string) => {
        if (s === 'paid') {
            return 'badge badge--paid';
        }

        if (s === 'deposit') {
            return 'badge badge--deposit';
        }

        return 'badge badge--pending';
    };

    const shipStatusStyle = (
        status?: string
    ): React.CSSProperties => {
        const s = cleanText(status).toLowerCase();

        const base: React.CSSProperties = {
            fontSize: 12,
            fontWeight: 600,
            padding: '4px 10px',
            borderRadius: 5,
            color: '#fff',
            minWidth: 90,
            textAlign: 'center',
        };

        if (s === 'ready to ship') {
            return {
                ...base,
                background: '#777777',
            };
        }

        if (s === 'in process') {
            return {
                ...base,
                background: '#f05a28',
            };
        }

        if (s === 'dcc dispatch') {
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
            <div className="history-header">
                <h2 className="history-welcome">
                    Welcome {loggedInRep?.name}
                </h2>
            </div>

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
                                    <strong>+</strong> to
                                    create your first
                                    invoice.
                                </p>
                            )}
                    </div>
                ) : (
                    <div className="history-scroll">
                        {repInvoices.map((inv) => (
                            <div
                                key={
                                    inv.orderId ||
                                    inv.invoiceNumber
                                }
                                className="history-card"
                            >
                                <div className="history-card-top padd-14">
                                    <span className="history-inv-num">
                                        {
                                            inv.invoiceNumber
                                        }
                                    </span>

                                    <div
                                        style={{
                                            display: 'flex',
                                            flexDirection:
                                                'column',
                                            alignItems:
                                                'flex-end',
                                            gap: 7,
                                        }}
                                    >
                                        <span
                                            className={statusClass(
                                                inv.paymentStatus
                                            )}
                                        >
                                            {statusLabel(
                                                inv.paymentStatus
                                            )}
                                        </span>

                                        {cleanText(
                                            inv.orderShipStatus
                                        ) && (
                                            <span
                                                style={shipStatusStyle(
                                                    inv.orderShipStatus
                                                )}
                                            >
                                                {
                                                    inv.orderShipStatus
                                                }
                                            </span>
                                        )}

                                        {inv.customerShipStatus ===
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
                                    {inv.customerName}
                                </div>

                                <div className="history-amount padd-14">
                                    {inv.total.toLocaleString()}
                                </div>

                                <div className="history-actions">
                                    <button
                                        className="h-action-btn"
                                        onClick={() =>
                                            handleEdit(
                                                inv
                                            )
                                        }
                                    >
                                        Edit

                                        <img
                                            src={editIcon}
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
                                            setShipTarget(
                                                inv
                                            )
                                        }
                                        title={
                                            inv.customerShipStatus ===
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
                                                inv
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
                                                inv
                                            )
                                        }
                                    >
                                        Cancel

                                        <img
                                            src={deleteIcon}
                                            alt=""
                                            style={{
                                                width: 20,
                                                height: 20,
                                            }}
                                        />
                                    </button>
                                </div>
                            </div>
                        ))}
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