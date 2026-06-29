import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import type { Invoice } from 'types/invoice';

export const getPdfFilename = (invoice: Invoice): string => {
    const firstName = invoice.customerName.trim().split(/\s+/)[0] || 'Invoice';
    const date = new Date(invoice.invoiceDate);
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yy = String(date.getFullYear()).slice(-2);
    return `${firstName}-${dd}-${mm}-${yy}.pdf`;
};

// Generates a PDF from an element and returns a Blob. If `filename` is provided
// the PDF will also be saved/downloaded using jsPDF's save().
export async function generatePdf(element: HTMLElement, filename?: string): Promise<Blob> {
    try {
        const canvas = await html2canvas(element, { scale: 2 });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();

        const imgProps = (pdf as any).getImageProperties(imgData);
        const imgWidthMm = (imgProps.width * 0.264583); // px to mm approx
        const imgHeightMm = (imgProps.height * 0.264583);

        const ratio = Math.min(pageWidth / imgWidthMm, pageHeight / imgHeightMm);
        const w = imgWidthMm * ratio;
        const h = imgHeightMm * ratio;

        pdf.addImage(imgData, 'PNG', (pageWidth - w) / 2, 10, w, h);

        if (filename) {
            pdf.save(filename);
        }

        const blob = pdf.output('blob');
        return blob;
    } catch (e) {
        throw e;
    }
}
