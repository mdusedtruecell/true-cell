export interface InvoiceItem {
    id: string;
    model: string;
    qty?: number;
    price?: number;
}

export interface Invoice {
    invoiceNumber: string;
    customerName: string;
    salesRepresentative: string;
    invoiceDate: string;
    items: InvoiceItem[];
    subtotal: number;
    total: number;
    depositAmount?: number;
    paymentStatus?: 'paid' | 'pending' | 'deposit';
}
