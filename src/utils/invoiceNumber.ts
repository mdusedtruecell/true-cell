import { getItem, setItem } from './localStorage';

export const getNextInvoiceNumber = (): string => {
    const year = new Date().getFullYear();
    const key = `invoice-seq-${year}`;
    const last = getItem<number>(key) ?? 0;
    const next = last + 1;
    setItem(key, next);
    return `INV-${year}-${String(next).padStart(4, '0')}`;
};
