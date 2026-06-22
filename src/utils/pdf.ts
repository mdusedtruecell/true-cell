import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

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
