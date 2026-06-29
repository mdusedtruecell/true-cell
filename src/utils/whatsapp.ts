import type { Invoice } from 'types/invoice';

export const buildWhatsappMessage = (invoice: Invoice): string => {
    const lines: string[] = [];
    lines.push('TRUECELL ELECTRONICS TRADING LLC', '');
    lines.push(`Invoice No: ${invoice.invoiceNumber}`, '');
    lines.push(`Customer: ${invoice.customerName}`, '');
    lines.push('Items', '');
    invoice.items.forEach((it: any, idx: number) => {
        lines.push(`${idx + 1}. ${it.model}`);
        lines.push(`Qty: ${it.qty}`);
        lines.push(`Price: ${it.price} AED`, '');
    });
    lines.push(`Total AED: ${invoice.total}`, '', 'Thank You');
    return lines.join('\n');
};
