import React, { useRef, useEffect } from 'react';
import { useInvoiceStore } from 'store/invoiceStore';
import { getItem } from 'utils/localStorage';
import { generatePdf } from 'utils/pdf';
import Header from 'components/Header/Header';
import { useLocation } from 'react-router-dom';
import InvoicePrintView from 'components/InvoicePrintView/InvoicePrintView';


export const InvoicePreviewPage: React.FC = () => {
    const storeInvoice = useInvoiceStore((s: any) => s.currentInvoice);
    let invoice = storeInvoice ?? null;

    if (!invoice) {
        const last = getItem<string>('last-invoice');
        if (last) {
            invoice = getItem<any>(`invoice-${last}`) ?? null;
        }
    }

    const ref = useRef<HTMLDivElement | null>(null);

    const handleDownload = async () => {
        if (!ref.current || !invoice) return;
        try {
            await generatePdf(ref.current, `${invoice.invoiceNumber}.pdf`);
        } catch (err) {
            console.error(err);
            alert('Failed to generate PDF');
        }
    };

    const handlePrint = () => {
        window.print();
    };

    const handleShare = async () => {
        if (!ref.current || !invoice) return;
        try {
            const blob = await generatePdf(ref.current);
            const file = new File([blob], `${invoice.invoiceNumber}.pdf`, { type: 'application/pdf' });

            // Use Web Share API if available (mobile/Chromium browsers)
            // Fallback: open PDF in new tab for manual sharing/download
            // @ts-ignore
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                // @ts-ignore
                await navigator.share({ files: [file], title: `Invoice ${invoice.invoiceNumber}`, text: `Invoice ${invoice.invoiceNumber}` });
            } else {
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
                setTimeout(() => URL.revokeObjectURL(url), 10000);
            }
        } catch (err) {
            console.error(err);
            alert('Failed to generate/share PDF');
        }
    };

    const location = useLocation();
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        if (params.get('share')) {
            // small delay to ensure layout/render is stable for html2canvas
            setTimeout(() => { void handleShare(); }, 300);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.search]);

    if (!invoice) {
        return (
            <div className="page">
                <Header title="Invoice" left={<button onClick={() => window.history.back()}>◀</button>} />
                <main>
                    <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>
                        No invoice found.
                    </div>
                </main>
            </div>
        );
    }

    
    return (
        <div className="page invoice-preview">

            <main>
                <div className="scroll-area">
                    {/* Printable invoice card */}
                    <InvoicePrintView invoice={invoice} ref={ref} />

                    {/* Download / Print */}
                    <div className="preview-actions">
                        <button onClick={handleDownload}>Download PDF</button>
                        <button onClick={handleShare} style={{ background: 'var(--whatsapp)', color: '#fff' }}>
                            Share
                        </button>
                        <button onClick={handlePrint} style={{ background: 'transparent', border: '2px solid var(--primary)', color: 'var(--primary)' }}>
                            Print
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default InvoicePreviewPage;
