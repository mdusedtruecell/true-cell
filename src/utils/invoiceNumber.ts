import { getItem, setItem } from './localStorage';

export const generateInvoiceNumber = (customerName: string, existingNumbers: string[]): string => {
    const prefix = customerName.replace(/\s+/g, '').substring(0, 2).toUpperCase() || 'TC';
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yy = String(now.getFullYear()).slice(-2);
    const base = `${prefix}-${dd}-${mm}-${yy}`;

    if (!existingNumbers.includes(base)) return base;

    let counter = 2;
    while (existingNumbers.includes(`${base}-${counter}`)) counter++;
    return `${base}-${counter}`;
};

export const getNextInvoiceNumber = (): string => {
    const year = new Date().getFullYear();
    const key = `invoice-seq-${year}`;
    const last = getItem<number>(key) ?? 0;
    const next = last + 1;
    setItem(key, next);
    return `INV-${year}-${String(next).padStart(4, '0')}`;
};
