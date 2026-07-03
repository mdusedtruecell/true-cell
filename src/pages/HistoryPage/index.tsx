import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInvoiceStore } from 'store/invoiceStore';
import ConfirmDialog from 'components/ConfirmDialog/ConfirmDialog';
import InvoicePrintView from 'components/InvoicePrintView/InvoicePrintView';
import { generatePdf, getPdfFilename } from 'utils/pdf';
import { buildWhatsappMessage } from 'utils/whatsapp';
import { useToast } from 'components/Toast/Toast';
import type { Invoice, InvoiceItem } from 'types/invoice';
import whatsappIcon from '../../assets/whatsapp.png';
import deleteIcon from '../../assets/delete.png';
import plusIcon from '../../assets/plus_icon.png';
import editIcon from '../../assets/edit_i.png';

type SheetInvoice = Invoice & {
    orderId?: string;
    orderStatus?: string;
    orderShipStatus?: string;
};

type SheetRow = {
    date?: string;
    orderId?: string;
    itemId?: string;
    invoiceNo?: string;
    customer?: string;
    model?: string;
    qty?: number | string;
    price?: number | string;
    total?: number | string;
    salesPerson?: string;
    paymentStatus?: string;
    orderStatus?: string;
    orderShipStatus?: string;
};

const GOOGLE_SHEET_WEB_APP_URL =
    'https://script.google.com/macros/s/AKfycbw89yajiSI_8Y_jBBWS_GeUSUHKuf_bO7O6Tk4KbrRfn8KwzJ9g_QPR0WUeY536qohLxg/exec';

const cleanText = (value: unknown): string => String(value ?? '').trim();

const toNumber = (value: unknown): number => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

const normalizePaymentStatus = (value?: string): 'paid' | 'pending' | 'deposit' => {
    const status = cleanText(value).toLowerCase();

    if (status === 'paid') return 'paid';
    if (status === 'deposit') return 'deposit';
    return 'pending';
};

const normalizeOrderStatus = (value?: string): string => {
    const status = cleanText(value).toLowerCase();

    if (status === 'cancel' || status === 'cancelled' || status === 'canceled') {
        return 'Cancel';
    }

    return 'Active';
};

const parseSheetDate = (value?: string): string => {
    const raw = cleanText(value);

    if (!raw) return new Date().toISOString();

    const clean = raw.replace(/\s+at\s+/i, ' ');
    const parsed = new Date(clean);

    if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
    }

    return new Date().toISOString();
};

const getInvoiceKey = (invoice: SheetInvoice): string => {
    return cleanText(invoice.orderId || invoice.invoiceNumber);
};

const groupSheetRowsToInvoices = (rows: SheetRow[]): SheetInvoice[] => {
    const grouped = new Map<string, SheetInvoice>();

    rows.forEach((row) => {
        const orderStatus = normalizeOrderStatus(row.orderStatus);

        // Cancel orders sheet me rahenge, lekin app history me show nahi honge.
        if (orderStatus === 'Cancel') return;

        const orderId = cleanText(row.orderId);
        const invoiceNumber = cleanText(row.invoiceNo || orderId);
        const key = orderId || invoiceNumber;

        if (!key) return;

        const qty = toNumber(row.qty);
        const price = toNumber(row.price);
        const rowTotal = toNumber(row.total) || qty * price;

        const item: InvoiceItem = {
            id: cleanText(row.itemId) || `${key}-${grouped.get(key)?.items.length ?? 0}`,
            model: cleanText(row.model),
            qty,
            price,
        };

        const existing = grouped.get(key);

        if (existing) {
            existing.items.push(item);
            existing.subtotal += rowTotal;
            existing.total += rowTotal;

            // Agar kisi row me latest ship status filled hai to card pe wahi show karo.
            if (cleanText(row.orderShipStatus)) {
                existing.orderShipStatus = cleanText(row.orderShipStatus);
            }

            return;
        }

        grouped.set(key, {
            orderId,
            invoiceNumber,
            customerName: cleanText(row.customer),
            salesRepresentative: cleanText(row.salesPerson),
            invoiceDate: parseSheetDate(row.date),
            items: [item],
            subtotal: rowTotal,
            total: rowTotal,
            depositAmount: 0,
            paymentStatus: normalizePaymentStatus(row.paymentStatus),
            orderStatus,
            orderShipStatus: cleanText(row.orderShipStatus),
        });
    });

    return Array.from(grouped.values()).sort((a, b) => {
        const dateA = new Date(a.invoiceDate).getTime();
        const dateB = new Date(b.invoiceDate).getTime();
        return dateB - dateA;
    });
};

const buildHistoryUrl = (salesPerson?: string): string => {
    const params = new URLSearchParams();

    if (salesPerson) {
        params.set('salesPerson', salesPerson);
    }

    params.set('_', String(Date.now()));

    return `${GOOGLE_SHEET_WEB_APP_URL}?${params.toString()}`;
};

const cancelInvoiceInGoogleSheet = (invoice: SheetInvoice) => {
    if (!GOOGLE_SHEET_WEB_APP_URL || GOOGLE_SHEET_WEB_APP_URL.includes('PASTE_')) {
        console.error('Google Sheet Web App URL missing in HistoryPage');
        return;
    }

    const orderId = cleanText(invoice.orderId || invoice.invoiceNumber);
    const invoiceNumber = cleanText(invoice.invoiceNumber);

    const payload = {
        action: 'cancelOrder',
        orderId,
        previousOrderId: invoiceNumber,
        invoiceNo: invoiceNumber,
        invoiceNumber,
    };

    console.log('Cancelling order in Google Sheet:', payload);

    void fetch(GOOGLE_SHEET_WEB_APP_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
            'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(payload),
    }).catch((error) => {
        console.error('Google Sheet cancel failed:', error);
    });
};

export const HistoryPage: React.FC = () => {
    const navigate = useNavigate();
    const { push } = useToast();

    const loggedInRep = useInvoiceStore((s: any) => s.loggedInRep);
    const invoiceHistory: SheetInvoice[] = useInvoiceStore((s: any) => s.invoiceHistory);
    const deleteFromHistory = useInvoiceStore((s: any) => s.deleteFromHistory);
    const saveInvoice = useInvoiceStore((s: any) => s.saveInvoice);
    const updateInHistory = useInvoiceStore((s: any) => s.updateInHistory);

    const [sheetInvoices, setSheetInvoices] = useState<SheetInvoice[]>([]);
    const [sheetLoaded, setSheetLoaded] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [cancelTarget, setCancelTarget] = useState<SheetInvoice | null>(null);
    const [shareInvoice, setShareInvoice] = useState<SheetInvoice | null>(null);

    const pdfRef = useRef<HTMLDivElement | null>(null);

    const localRepInvoices = invoiceHistory.filter((inv) => {
        const isSameRep = inv.salesRepresentative === loggedInRep?.name;
        const isActive = normalizeOrderStatus(inv.orderStatus) !== 'Cancel';
        return isSameRep && isActive;
    });

    const repInvoices = sheetLoaded ? sheetInvoices : localRepInvoices;

    const totalAmount = repInvoices.reduce((sum, inv) => sum + inv.total, 0);

    useEffect(() => {
        if (!loggedInRep?.name) return;

        let isMounted = true;

        const loadHistoryFromSheet = async () => {
            setIsSyncing(true);

            try {
                const response = await fetch(buildHistoryUrl(loggedInRep.name), {
                    method: 'GET',
                    cache: 'no-store',
                });

                const json = await response.json();

                if (!json?.success || !Array.isArray(json.data)) {
                    throw new Error(json?.message || 'Invalid Google Sheet response');
                }

                const invoices = groupSheetRowsToInvoices(json.data as SheetRow[]);

                if (!isMounted) return;

                setSheetInvoices(invoices);
                setSheetLoaded(true);

                // Local storage bhi update kar do taake offline/open reload me latest data rahe.
                invoices.forEach((invoice) => {
                    updateInHistory(invoice as Invoice);
                });
            } catch (error) {
                console.error('Failed to load Google Sheet history:', error);

                if (!isMounted) return;

                setSheetLoaded(false);
                push('Could not sync Google Sheet history. Showing local history.');
            } finally {
                if (isMounted) {
                    setIsSyncing(false);
                }
            }
        };

        void loadHistoryFromSheet();

        return () => {
            isMounted = false;
        };
    }, [loggedInRep?.name, push, updateInHistory]);

    const handleEdit = (invoice: SheetInvoice) => {
        saveInvoice(invoice);
        navigate('/invoice/new', { state: { invoice, isEditing: true } });
    };

    const confirmCancel = () => {
        if (!cancelTarget) return;

        // ✅ Sheet me Order Status = Cancel hoga. Sheet rows delete nahi hongi.
        cancelInvoiceInGoogleSheet(cancelTarget);

        // ✅ App history se card remove hoga.
        deleteFromHistory(cancelTarget.invoiceNumber);
        setSheetInvoices((current) =>
            current.filter((invoice) => getInvoiceKey(invoice) !== getInvoiceKey(cancelTarget))
        );

        setCancelTarget(null);
        push('Order cancelled successfully');
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
                        <p>{isSyncing ? 'Loading invoices...' : 'No invoices yet.'}</p>
                        {!isSyncing && (
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
                description="Are you sure you want to cancel this order? It will be removed from app history, but it will stay in Google Sheet as Cancel."
                confirmLabel="Cancel Order"
                onConfirm={confirmCancel}
                onClose={() => setCancelTarget(null)}
            />
        </div>
    );
};

export default HistoryPage;
