import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInvoiceStore } from 'store/invoiceStore';
import ConfirmDialog from 'components/ConfirmDialog/ConfirmDialog';
import InvoicePrintView from 'components/InvoicePrintView/InvoicePrintView';
import { generatePdf, getPdfFilename } from 'utils/pdf';
import { buildWhatsappMessage } from 'utils/whatsapp';
import { useToast } from 'components/Toast/Toast';
import type { Invoice } from 'types/invoice';
import whatsappIcon from '../../assets/whatsapp.png';
import deleteIcon from '../../assets/delete.png';
import plusIcon from '../../assets/plus_icon.png';
import editIcon from '../../assets/edit_i.png';

type SheetInvoice = Invoice & {
    orderId?: string;
};

const GOOGLE_SHEET_WEB_APP_URL =
    'https://script.google.com/macros/s/AKfycbw89yajiSI_8Y_jBBWS_GeUSUHKuf_bO7O6Tk4KbrRfn8KwzJ9g_QPR0WUeY536qohLxg/exec';

// ✅ IMPORTANT:
// Delete ke liye deleteOrder nahi use kar rahe.
// Same working save route use karenge with empty items.
// Apps Script same orderId/invoiceNo wali rows delete karega aur kuch append nahi karega.
const deleteInvoiceFromGoogleSheet = (invoice: SheetInvoice) => {
    if (!GOOGLE_SHEET_WEB_APP_URL || GOOGLE_SHEET_WEB_APP_URL.includes('PASTE_')) {
        console.error('Google Sheet Web App URL missing in HistoryPage');
        return;
    }

    const orderId = String(invoice.orderId || invoice.invoiceNumber || '').trim();
    const invoiceNumber = String(invoice.invoiceNumber || '').trim();

    const payload = {
        action: 'save',

        // ✅ Main tracking
        orderId,

        // ✅ Backup matching
        previousOrderId: invoiceNumber,
        invoiceNo: invoiceNumber,
        invoiceNumber,

        // ✅ Required fields
        date: new Date().toISOString(),
        customer: invoice.customerName || '',
        salesPerson: invoice.salesRepresentative || '',
        paymentStatus: invoice.paymentStatus || 'pending',

        // ✅ Empty items means delete old rows and add nothing
        items: [],
    };

    console.log('Deleting invoice from Google Sheet using save-empty:', payload);

    void fetch(GOOGLE_SHEET_WEB_APP_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
            'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(payload),
    }).catch((error) => {
        console.error('Google Sheet delete failed:', error);
    });
};

export const HistoryPage: React.FC = () => {
    const navigate = useNavigate();
    const { push } = useToast();

    const loggedInRep = useInvoiceStore((s: any) => s.loggedInRep);
    const invoiceHistory: SheetInvoice[] = useInvoiceStore((s: any) => s.invoiceHistory);
    const deleteFromHistory = useInvoiceStore((s: any) => s.deleteFromHistory);
    const saveInvoice = useInvoiceStore((s: any) => s.saveInvoice);

    const repInvoices = invoiceHistory.filter(
        (inv) => inv.salesRepresentative === loggedInRep?.name
    );

    const totalAmount = repInvoices.reduce((sum, inv) => sum + inv.total, 0);

    const [deleteTarget, setDeleteTarget] = useState<SheetInvoice | null>(null);
    const [shareInvoice, setShareInvoice] = useState<SheetInvoice | null>(null);

    const pdfRef = useRef<HTMLDivElement | null>(null);

    const handleEdit = (invoice: SheetInvoice) => {
        saveInvoice(invoice);
        navigate('/invoice/new', { state: { invoice, isEditing: true } });
    };

    const confirmDelete = () => {
        if (!deleteTarget) return;

        // ✅ Sheet se delete
        deleteInvoiceFromGoogleSheet(deleteTarget);

        // ✅ App history se delete
        deleteFromHistory(deleteTarget.invoiceNumber);

        setDeleteTarget(null);
        push('Invoice deleted successfully');
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
                        <p>No invoices yet.</p>
                        <p>
                            Tap <strong>+</strong> to create your first invoice.
                        </p>
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

                                    <span className={statusClass(inv.paymentStatus)}>
                                        {statusLabel(inv.paymentStatus)}
                                    </span>
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
                                        onClick={() => setDeleteTarget(inv)}
                                    >
                                        Delete
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
                open={!!deleteTarget}
                title="Delete Invoice"
                description="Are you sure you want to delete this invoice? This cannot be undone."
                confirmLabel="Delete"
                onConfirm={confirmDelete}
                onClose={() => setDeleteTarget(null)}
            />
        </div>
    );
};

export default HistoryPage;