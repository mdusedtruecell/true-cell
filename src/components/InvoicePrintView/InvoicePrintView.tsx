import React from 'react';
import type { Invoice } from 'types/invoice';
import logoImg from '../../assets/logo_invoice.png';

type Props = {
    invoice: Invoice;
};

const TERMS = [
    'Payment Accepted Directly to through Company.',
    'Kindly Collect your Receipt for all Transaction including Cash Payment. Company Will not be responsible if Brian stocks Directly to salesman or the third party.',
    'To Claim any further assistance you should be with our Documents.',
];

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

    const totalQty = invoice.items.reduce(
        (sum: number, item: any) => sum + (Number(item.qty) || 0),
        0
    );

    const computedTotal = invoice.items.reduce(
        (sum: number, item: any) => sum + (Number(item.qty) || 0) * (Number(item.price) || 0),
        0
    );

    const paymentStatus = invoice.paymentStatus ?? 'pending';
    const isPaid = paymentStatus === 'paid';
    const isDeposit = paymentStatus === 'deposit';
    const depositAmt = Number(invoice.depositAmount) || 0;
    const pendingAmt = Math.max(0, computedTotal - depositAmt);

    return (
        <div className="invoice-container" ref={ref}>
            {/* Header: logo + date/time */}
            <div className="invoice-top">
                <img className="invoice-logo-mark" src={logoImg} alt="Truecell Electronics Trading LLC" />
                <div className="invoice-datetime">
                    <div>Date : {formattedDate}</div>
                    <div>Time : {formattedTime}</div>
                </div>
            </div>

            {/* Bill To */}
            <div className="invoice-bill-to">
                <div className="bill-to-label">Bill To</div>
                <div className="bill-to-pills">
                    <span className="bill-pill bill-pill--rep">{invoice.customerName}</span>
                    <span className="bill-pill bill-pill--rep">{invoice.salesRepresentative}</span>
                </div>
            </div>

            {/* Items table */}
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

            {/* Total row */}
            <div className="invoice-total">
                <div className="total-label">Total</div>
                <div className="total-qty">{totalQty}</div>
                <div className="total-value">{computedTotal.toFixed(2)}</div>
            </div>

            {/* Payment section */}
            {isPaid && (
                <div className="payment-bar payment-bar--paid">
                    <span>Full Payment Received</span>
                    <span>{computedTotal.toFixed(2)}</span>
                </div>
            )}

            {isDeposit && (
                <>
                    <div className="payment-bar payment-bar--deposit">
                        <span>Deposit</span>
                        <span>{depositAmt.toFixed(2)}</span>
                    </div>
                    <div className="payment-bar payment-bar--pending-amount">
                        <span>Pending Amount</span>
                        <span>{pendingAmt.toFixed(2)}</span>
                    </div>
                </>
            )}

            {!isPaid && !isDeposit && (
                <div className="payment-bar payment-bar--pending">
                    <span>Payment Pending</span>
                    <span>{computedTotal.toFixed(2)}</span>
                </div>
            )}

            {/* Terms & Conditions */}
            <div className="invoice-terms">
                <div className="terms-title">Terms &amp; Condition</div>
                <ol className="terms-list">
                    {TERMS.map((t, i) => (
                        <li key={i}>{t}</li>
                    ))}
                </ol>
            </div>
        </div>
    );
});

InvoicePrintView.displayName = 'InvoicePrintView';

export default InvoicePrintView;
