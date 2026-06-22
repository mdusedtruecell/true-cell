import React from 'react';
import type { Invoice } from 'types/invoice';
import logoImg from '../../assets/logo_invoice.png';

type Props = {
    invoice: Invoice;
};

const InvoicePrintView = React.forwardRef<HTMLDivElement, Props>(({ invoice }, ref) => {
    const formattedDate = new Date(invoice.invoiceDate).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
    });

    const formattedTime = new Date(invoice.invoiceDate).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    });

    const totalQty = invoice.items.reduce((sum: number, item: any) => sum + (Number(item.qty) || 0), 0);

    const computedTotal = invoice.items.reduce(
        (sum: number, item: any) => sum + (Number(item.qty) || 0) * (Number(item.price) || 0),
        0,
    );

    // NOTE: `paymentStatus` isn't on the Invoice type I was given — add it there
    // (e.g. 'paid' | 'pending') and this will switch the bar automatically.
    // Defaults to "Payment Received" if the field is missing.
    const isPaid = (invoice as any).paymentStatus
        ? (invoice as any).paymentStatus === 'paid'
        : true;

    return (
        <div className="invoice-container" ref={ref}>
            <div className="invoice-top">
                <img className="invoice-logo-mark" src={logoImg} alt="Truecell Electronics Trading LLC" />
                <div className="invoice-datetime">
                    <div>Date : {formattedDate}</div>
                    <div>Time : {formattedTime}</div>
                </div>
            </div>

            <div className="invoice-meta">
                <div className="bill-side">
                    <div className="bill-label">Bill To</div>
                    <div className="bill-name">{invoice.customerName}</div>
                </div>
                <div className="rep-side">
                    <div className="rep-pill">{invoice.salesRepresentative}</div>
                </div>
            </div>

            <table className="items-table">
                <colgroup>
                    <col className="col-model" />
                    <col className="col-qty" />
                    <col className="col-price" />
                    <col className="col-total" />
                </colgroup>
                <thead>
                    <tr>
                        <th>Model</th>
                        <th>Qty</th>
                        <th>Price</th>
                        <th>Total</th>
                    </tr>
                </thead>
                <tbody>
                    {invoice.items.map((item: any) => {
                        const qty = Number(item.qty) || 0;
                        const price = Number(item.price) || 0;
                        const rowTotal = qty * price;
                        return (
                            <tr key={item.id}>
                                <td>{item.model}</td>
                                <td>{qty}</td>
                                <td>{price.toFixed(2)}</td>
                                <td>{rowTotal.toFixed(2)}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            <div className="invoice-total">
                <div className="total-label">Total</div>
                <div className="total-qty">{totalQty}</div>
                <div className="total-value">{computedTotal.toFixed(2)}</div>
            </div>

            <div className={`payment-status-bar ${isPaid ? 'payment-status-bar--paid' : 'payment-status-bar--pending'}`}>
                <span>{isPaid ? 'Payment Received' : 'Payment Pending'}</span>
                <span>{invoice.total.toFixed(2)}</span>
            </div>
        </div>
    );
});

export default InvoicePrintView;