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
    updateCustomerShipInGoogleSheet,
} from 'utils/googleSheet';
import whatsappIcon from '../../assets/whatsapp.png';
import deleteIcon from '../../assets/delete.png';
import plusIcon from '../../assets/plus_icon.png';
import editIcon from '../../assets/edit_i.png';

const HISTORY_REFRESH_MS = 10000;

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

export const HistoryPage: React.FC = () => {
    const navigate = useNavigate();
    const { push } = useToast();

    const loggedInRep = useInvoiceStore((s: any) => s.loggedInRep);
    const deleteFromHistory = useInvoiceStore((s: any) => s.deleteFromHistory);
    const saveInvoice = useInvoiceStore((s: any) => s.saveInvoice);
    const updateInHistory = useInvoiceStore((s: any) => s.updateInHistory);

    const [sheetInvoices, setSheetInvoices] = useState<SheetInvoice[]>([]);
    const [isSyncing, setIsSyncing] = useState(false);
    const [hasLoadedHistory, setHasLoadedHistory] = useState(false);
    const [historyError, setHistoryError] = useState('');
    const [cancelTarget, setCancelTarget] = useState<SheetInvoice | null>(null);
    const [shipTarget, setShipTarget] = useState<SheetInvoice | null>(null);
    const [shareInvoice, setShareInvoice] = useState<SheetInvoice | null>(null);
    const [hiddenInvoiceKeys, setHiddenInvoiceKeys] = useState<string[]>([]);

    const pdfRef = useRef<HTMLDivElement | null>(null);
    const loadingRef = useRef(false);

    const repInvoices = useMemo(() => {
        const hiddenSet = new Set(hiddenInvoiceKeys);

        return sheetInvoices
            .filter((invoice) => !hiddenSet.has(getInvoiceKey(invoice)))
            .sort((a, b) => getSortTimestamp(b) - getSortTimestamp(a));
    }, [hiddenInvoiceKeys, sheetInvoices]);

    const totalAmount = repInvoices.reduce((sum, inv) => sum + inv.total, 0);

    const loadHistoryFromSheet = useCallback(
        async () => {
            if (!loggedInRep?.name) return;
            if (loadingRef.current) return;

            loadingRef.current = true;
            setIsSyncing(true);

            try {
                const json = await fetchSheetHistory(buildHistoryUrl(loggedInRep.name));

                if (!json?.success || !Array.isArray(json.data)) {
                    throw new Error(json?.message || 'Invalid backend response');
                }

                const invoices = groupSheetRowsToInvoices(json.data as SheetRow[])
                    .sort((a, b) => getSortTimestamp(b) - getSortTimestamp(a));

                setSheetInvoices(invoices);
                setHasLoadedHistory(true);
                setHistoryError('');

                setHiddenInvoiceKeys((current) => {
                    if (current.length === 0) return current;

                    const liveKeys = new Set(invoices.map((invoice) => getInvoiceKey(invoice)));

                    return current.filter((key) => liveKeys.has(key));
                });

                invoices.forEach((invoice) => {
                    updateInHistory(invoice as Invoice);
                });
            } catch (error) {
                console.error('Failed to load invoice history:', error);
                setHistoryError('Could not load latest invoices. Please refresh and try again.');
                setHasLoadedHistory(true);
            } finally {
                loadingRef.current = false;
                setIsSyncing(false);
            }
        },
        [loggedInRep?.name, updateInHistory]
    );

    useEffect(() => {
        if (!loggedInRep?.name) return;

        void loadHistoryFromSheet();

        const intervalId = window.setInterval(() => {
            void loadHistoryFromSheet();
        }, HISTORY_REFRESH_MS);

        const handleFocus = () => {
            if (document.visibilityState === 'visible') {
                void loadHistoryFromSheet();
            }
        };

        document.addEventListener('visibilitychange', handleFocus);
        window.addEventListener('focus', handleFocus);

        return () => {
            window.clearInterval(intervalId);
            document.removeEventListener('visibilitychange', handleFocus);
            window.removeEventListener('focus', handleFocus);
        };
    }, [loadHistoryFromSheet, loggedInRep?.name]);

    const handleEdit = (invoice: SheetInvoice) => {
        saveInvoice(invoice);
        navigate('/invoice/new', { state: { invoice, isEditing: true } });
    };

    const confirmCancel = () => {
        if (!cancelTarget) return;

        const key = getInvoiceKey(cancelTarget);

        setHiddenInvoiceKeys((current) =>
            current.includes(key) ? current : [...current, key]
        );

        setSheetInvoices((current) =>
            current.filter((invoice) => getInvoiceKey(invoice) !== key)
        );

        deleteFromHistory(cancelTarget.invoiceNumber);
        setCancelTarget(null);
        push('Order cancelled successfully');

        void cancelInvoiceInGoogleSheet(cancelTarget).then(() => {
            window.setTimeout(() => void loadHistoryFromSheet(), 1200);
            window.setTimeout(() => void loadHistoryFromSheet(), 3500);
        });
    };

    const confirmCustomerShip = () => {
        if (!shipTarget) return;

        const updatedInvoice: SheetInvoice = {
            ...shipTarget,
            customerShipStatus: 'shipped',
            updatedAt: new Date().toISOString(),
            revision: Date.now(),
        };

        const updatedKey = getInvoiceKey(updatedInvoice);

        setSheetInvoices((current) =>
            current.map((item) =>
                getInvoiceKey(item) === updatedKey
                    ? {
                          ...item,
                          customerShipStatus: 'shipped' as const,
                          updatedAt: updatedInvoice.updatedAt,
                          revision: updatedInvoice.revision,
                      }
                    : item
            )
        );

        updateInHistory(updatedInvoice as Invoice);
        setShipTarget(null);
        push('Order marked as shipped');

        void updateCustomerShipInGoogleSheet(updatedInvoice).then(() => {
            window.setTimeout(() => void loadHistoryFromSheet(), 1200);
            window.setTimeout(() => void loadHistoryFromSheet(), 3500);
        });
    };

    const handleShare = (invoice: SheetInvoice) => {
        setShareInvoice(invoice);

        setTimeout(async () => {
            if (!pdfRef.current) {
                push('Could not prepare invoice for sharing');
                setShareInvoice(null);
                return;
            }

            try {
                const blob = await generatePdf(pdfRef.current);

                const file = new File([blob], getPdfFilename(invoice), {
                    type: 'application/pdf',
                });

                // @ts-ignore
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    // @ts-ignore
                    await navigator.share({
                        files: [file],
                        title: `Invoice ${invoice.invoiceNumber}`,
                    });
                } else {
                    const url = URL.createObjectURL(blob);
                    window.open(url, '_blank');

                    setTimeout(() => URL.revokeObjectURL(url), 10000);

                    const message = buildWhatsappMessage(invoice);
                    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`);
                }
            } catch {
                push('Failed to share invoice');
            } finally {
                setShareInvoice(null);
            }
        }, 300);
    };

    const statusLabel = (s?: string) => {
        if (s === 'paid') return 'PAID';
        if (s === 'deposit') return 'Deposit';
        return 'PENDING';
    };

    const statusClass = (s?: string) => {
        if (s === 'paid') return 'badge badge--paid';
        if (s === 'deposit') return 'badge badge--deposit';
        return 'badge badge--pending';
    };

    const shipStatusStyle = (status?: string): React.CSSProperties => {
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
            return { ...base, background: '#777777' };
        }

        if (s === 'in process') {
            return { ...base, background: '#f05a28' };
        }

        if (s === 'dcc dispatch') {
            return { ...base, background: '#a10070' };
        }

        return { ...base, background: '#777777' };
    };

    const customerShippedStyle = (): React.CSSProperties => {
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
        if (!hasLoadedHistory || isSyncing) {
            return 'Syncing latest invoices...';
        }

        if (historyError) {
            return historyError;
        }

        return 'No invoices yet.';
    };

    return (
        <div className="page history-page">
            <div className="history-header">
                <h2 className="history-welcome">Welcome {loggedInRep?.name}</h2>
            </div>

            <div className="history-stats p-40-20">
                <div className="stat-block">
                    <div className="stat-label">Total Invoices</div>
                    <div className="stat-value">{repInvoices.length}</div>
                </div>

                <div className="stat-block stat-block--accent">
                    <div className="stat-label">Total Amount</div>
                    <div className="stat-value">{totalAmount.toLocaleString()}</div>
                </div>
            </div>

            <main className="history-list-container">
                {repInvoices.length === 0 ? (
                    <div className="history-empty">
                        <p>{emptyMessage()}</p>

                        {hasLoadedHistory && !historyError && !isSyncing && (
                            <p>
                                Tap <strong>+</strong> to create your first invoice.
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="history-scroll">
                        {repInvoices.map((inv) => (
                            <div
                                key={inv.orderId || inv.invoiceNumber}
                                className="history-card"
                            >
                                <div className="history-card-top padd-14">
                                    <span className="history-inv-num">
                                        {inv.invoiceNumber}
                                    </span>

                                    <div
                                        style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'flex-end',
                                            gap: 7,
                                        }}
                                    >
                                        <span className={statusClass(inv.paymentStatus)}>
                                            {statusLabel(inv.paymentStatus)}
                                        </span>

                                        {cleanText(inv.orderShipStatus) && (
                                            <span style={shipStatusStyle(inv.orderShipStatus)}>
                                                {inv.orderShipStatus}
                                            </span>
                                        )}

                                        {inv.customerShipStatus === 'shipped' && (
                                            <span style={customerShippedStyle()}>
                                                Shipped
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="history-customer padd-14">
                                    Customer : {inv.customerName}
                                </div>

                                <div className="history-amount padd-14">
                                    {inv.total.toLocaleString()}
                                </div>

                                <div className="history-actions">
                                    <button
                                        className="h-action-btn"
                                        onClick={() => handleEdit(inv)}
                                    >
                                        Edit
                                        <img
                                            src={editIcon}
                                            alt=""
                                            style={{ width: 20, height: 20 }}
                                        />
                                    </button>

                                    <button
                                        className="h-action-btn h-action-btn--ship"
                                        onClick={() => setShipTarget(inv)}
                                        title={
                                            inv.customerShipStatus === 'shipped'
                                                ? 'Already shipped'
                                                : 'Mark customer ship as shipped'
                                        }
                                    >
                                        Ship
                                        <ShipIcon />
                                    </button>

                                    <button
                                        className="h-action-btn h-action-btn--share"
                                        onClick={() => handleShare(inv)}
                                    >
                                        Share
                                        <img
                                            src={whatsappIcon}
                                            alt=""
                                            style={{ width: 20, height: 20 }}
                                        />
                                    </button>

                                    <button
                                        className="h-action-btn h-action-btn--del"
                                        onClick={() => setCancelTarget(inv)}
                                    >
                                        Cancel
                                        <img
                                            src={deleteIcon}
                                            alt=""
                                            style={{ width: 20, height: 20 }}
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
                    onClick={() => navigate('/invoice/new')}
                    aria-label="Create new invoice"
                >
                    <img src={plusIcon} alt="Create Invoice" className="plus-p-b" />
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
                    <InvoicePrintView invoice={shareInvoice} ref={pdfRef} />
                </div>
            )}

            <ConfirmDialog
                open={!!cancelTarget}
                title="Cancel Order"
                description="Are you sure you want to cancel this order? It will be removed from invoice history, but it will stay in Google Sheet as Cancel."
                confirmLabel="Cancel Order"
                onConfirm={confirmCancel}
                onClose={() => setCancelTarget(null)}
            />

            <ConfirmDialog
                open={!!shipTarget}
                title="Ship Order"
                description="Do you want to mark this order as shipped?"
                confirmLabel="Shipped"
                onConfirm={confirmCustomerShip}
                onClose={() => setShipTarget(null)}
            />
        </div>
    );
};

export default HistoryPage;