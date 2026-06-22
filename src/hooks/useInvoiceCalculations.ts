import { useMemo } from 'react';
import type { InvoiceItem } from 'types/invoice';

export const useInvoiceCalculations = (items: InvoiceItem[]) => {
    const lines = useMemo(() => items.map((it) => {
        const qty = Number((it as any).qty) || 0;
        const price = Number((it as any).price) || 0;
        return { ...it, lineTotal: Math.max(0, qty) * Math.max(0, price) };
    }), [items]);
    const subtotal = useMemo(() => lines.reduce((s, l) => s + (l as any).lineTotal, 0), [lines]);
    const total = subtotal;
    return { lines, subtotal, total };
};
