import React, { useEffect, useState, useRef } from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { v4 as uuid } from 'uuid';
import { useNavigate } from 'react-router-dom';
import type { Invoice, InvoiceItem } from 'types/invoice';
import { getDraft, removeDraft, setDraft } from 'utils/localStorage';
import { getNextInvoiceNumber } from 'utils/invoiceNumber';
import { useInvoiceCalculations } from 'hooks/useInvoiceCalculations';
import { useInvoiceStore } from 'store/invoiceStore';
import ConfirmDialog from 'components/ConfirmDialog/ConfirmDialog';
import Header from 'components/Header/Header';
import { buildWhatsappMessage } from 'utils/whatsapp';
import InvoicePrintView from 'components/InvoicePrintView/InvoicePrintView';
import { generatePdf } from 'utils/pdf';
import { useToast } from 'components/Toast/Toast';
import backbtn from '../../assets/back.png';
import deleteicon from '../../assets/delete.png';
import whatsappicon from '../../assets/whatsapp.png';
import redDelete from '../../assets/row_delete.png';

type FormValues = Invoice & { paymentReceived?: boolean };

const DRAFT_KEY = 'invoice-draft';

const defaultItem = (): InvoiceItem => ({
    id: uuid(),
    model: '',
    qty: undefined,
    price: undefined,
});

export const CreateInvoicePage: React.FC = () => {
    const navigate = useNavigate();
    const selectedRep = useInvoiceStore((s: any) => s.selectedRepresentative);
    const saveInvoiceToStore = useInvoiceStore((s: any) => s.saveInvoice);

    const draft = getDraft<Partial<Invoice>>(DRAFT_KEY) ?? null;

    const {
        register,
        control,
        handleSubmit,
        watch,
        reset,
        trigger,
        formState: { errors },
    } = useForm<FormValues>({
        defaultValues: {
            invoiceNumber: draft?.invoiceNumber ?? '',
            customerName: draft?.customerName ?? '',
            salesRepresentative: draft?.salesRepresentative ?? selectedRep ?? '',
            invoiceDate: draft?.invoiceDate ?? new Date().toISOString(),
            items: draft?.items ?? [defaultItem()],
            subtotal: draft?.subtotal ?? 0,
            total: draft?.total ?? 0,
            paymentReceived: !!(draft?.paymentStatus === 'paid'),
        },
    });

    const { fields, append, remove } = useFieldArray<FormValues, 'items'>({
        control,
        name: 'items',
    });

    const watchedItems = useWatch({ control, name: 'items' }) as InvoiceItem[];
    const { subtotal, total } = useInvoiceCalculations((watchedItems || []) as InvoiceItem[]);

    // Auto-save draft
    useEffect(() => {
        const subscription = watch((value) => {
            setDraft(DRAFT_KEY, value as any);
        }) as any;
        return () => subscription?.unsubscribe?.();
    }, [watch]);

    // Sync totals
    useEffect(() => {
        const currentDraft = getDraft(DRAFT_KEY) ?? {};
        reset(
            { ...currentDraft, subtotal, total, paymentReceived: !!(currentDraft.paymentStatus === 'paid') },
            { keepValues: true }
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [subtotal, total]);

    const [confirmOpen, setConfirmOpen] = useState(false);
    useEffect(() => {
    if (selectedRep) {
        reset((values) => ({
            ...values,
            salesRepresentative: selectedRep,
        }));
    }
}, [selectedRep, reset]);

    const onClear = () => setConfirmOpen(true);

    const confirmClear = () => {
        removeDraft(DRAFT_KEY);
        reset({
            invoiceNumber: '',
            customerName: '',
            salesRepresentative: selectedRep ?? '',
            invoiceDate: new Date().toISOString(),
            items: [defaultItem()],
            subtotal: 0,
            total: 0,
            paymentReceived: false,
        });
        setConfirmOpen(false);
    };

    const onMakeSalesOrder = (data: any) => {
        if (!data.items || data.items.length === 0) {
            return alert('At least one item required');
        }
        const invoiceNumber = data.invoiceNumber || getNextInvoiceNumber();
        const invoice: Invoice = {
            ...data,
            invoiceNumber,
            invoiceDate: new Date().toISOString(),
            subtotal,
            total,
            paymentStatus: data.paymentReceived ? 'paid' : 'pending',
        };
        saveInvoiceToStore(invoice);
        setDraft(`invoice-${invoiceNumber}`, invoice);
        setDraft('last-invoice', invoiceNumber);
        navigate('/invoice/preview');
    };

    const pdfRef = useRef<HTMLDivElement | null>(null);
    const { push } = useToast();

    const shareWhatsApp = async () => {
        // validate customer and sales rep and all item rows before sharing
        const itemsCount = fields.length;
        const fieldNames: string[] = ['customerName', 'salesRepresentative'];
        for (let i = 0; i < itemsCount; i++) {
            fieldNames.push(`items.${i}.model`, `items.${i}.qty`, `items.${i}.price`);
        }
        // ensure a sales representative is selected (comes from store/defaultValues)
        const currentRep = watch().salesRepresentative || selectedRep;
        if (!currentRep) {
            push('Please select a sales representative before sharing');
            return;
        }

        const allValid = await trigger(fieldNames as any);
        if (!allValid) {
            push('Please fill all required fields before sharing');
            return;
        }

        const data = watch();
        const invoiceNumber = data.invoiceNumber || getNextInvoiceNumber();
        const invoice: Invoice = {
            ...data,
            invoiceNumber,
            invoiceDate: new Date().toISOString(),
            subtotal,
            total,
            paymentStatus: data.paymentReceived ? 'paid' : 'pending',
        };

        saveInvoiceToStore(invoice);
        setDraft(`invoice-${invoiceNumber}`, invoice);
        setDraft('last-invoice', invoiceNumber);

        // Generate PDF from a hidden but rendered copy (must be in DOM and visible to html2canvas)
        try {
            if (!pdfRef.current) {
                push('Preparing invoice preview for PDF generation. Please try again.');
                return;
            }
            const blob = await generatePdf(pdfRef.current);
            const file = new File([blob], `${invoice.invoiceNumber}.pdf`, { type: 'application/pdf' });

            // Attempt Web Share API (requires user gesture)
            // @ts-ignore
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                // @ts-ignore
                await navigator.share({ files: [file], title: `Invoice ${invoice.invoiceNumber}`, text: `Invoice ${invoice.invoiceNumber}` });
                return;
            }

            // Fallback: open PDF in new tab and show text share link
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
            setTimeout(() => URL.revokeObjectURL(url), 10000);

            const message = buildWhatsappMessage(invoice);
            // Open WhatsApp web with text fallback so user can attach the downloaded PDF manually
            window.open(`https://wa.me/?text=${encodeURIComponent(message)}`);
        } catch (err) {
            console.error(err);
            push('Failed to generate/share PDF');
        }
    };

    return (
        <div className="page create-invoice-page">
            <Header
                title="New Invoice"
                left={
                    <button onClick={() => navigate(-1)} aria-label="Go back">
                        <img src={backbtn} alt="Back" />
                    </button>
                }
                right={
                    <button onClick={onClear} aria-label="Clear invoice">
                        <img src={deleteicon} alt="Clear" />
                    </button>
                }
            />

            <main>
                <div className="create-invoice">

                    {/* Customer card */}
                    <div className="invoice-card">
                        {/* Customer row */}
                        <div className="customer-row">
                            <span className="label">Customer Name</span>
                        </div>

                        {/* Customer name input */}
                        <div className="form-row" style={{ marginBottom: 0 }}>
                            <input
                                {...register('customerName', {
                                    required: 'Customer name required',
                                    minLength: { value: 3, message: 'Min 3 chars' },
                                })}
                                placeholder="type customer name"
                            />
                            {errors.customerName?.message && (
                                <div className="error">{String(errors.customerName.message)}</div>
                            )}
                        </div>
                    </div>

                    {/* Items card */}
                    <div className="invoice-card invoice-card--items">
                        <div className="items">
                            <div className="items-label">Items</div>

                            {/* Table header */}
                            <div className="table-head">
                                <div>Model</div>
                                <div>Qty</div>
                                <div>Price (AED)</div>
                                <div />
                            </div>

                            {/* Scrollable rows */}
                            <div className="items-scroll">
                                {fields.map((field: any, idx: number) => (
                                    <div className="item-row" key={field.id}>
                                        <div className="field-col">
                                            <input
                                                className={(errors as any)?.items?.[idx]?.model ? 'input-error' : ''}
                                                {...register(`items.${idx}.model` as const, {
                                                    required: 'Model required',
                                                })}
                                                defaultValue={(field as any).model}
                                                placeholder="Model"
                                            />
                                        </div>

                                        <div className="field-col">
                                            <input
                                                className={(errors as any)?.items?.[idx]?.qty ? 'input-error' : ''}
                                                type="number"
                                                {...register(`items.${idx}.qty` as const, {
                                                    valueAsNumber: true,
                                                    required: 'Qty required',
                                                    min: { value: 1, message: 'Min 1' },
                                                })}
                                                defaultValue={(field as any).qty ?? ''}
                                                placeholder="0"
                                                onInput={() => { void trigger(`items.${idx}.qty`); }}
                                            />
                                        </div>

                                        <div className="field-col">
                                            <input
                                                className={(errors as any)?.items?.[idx]?.price ? 'input-error' : ''}
                                                type="number"
                                                {...register(`items.${idx}.price` as const, {
                                                    valueAsNumber: true,
                                                    required: 'Price required',
                                                    min: { value: 0.01, message: 'Min 0.01' },
                                                })}
                                                defaultValue={(field as any).price ?? ''}
                                                placeholder="0"
                                                onInput={() => { void trigger(`items.${idx}.price`); }}
                                            />
                                        </div>

                                        <button
                                            type="button"
                                            className="remove-btn"
                                            onClick={() => remove(idx)}
                                            aria-label={`Remove item ${idx + 1}`}
                                        >
                                            <img src={redDelete} alt="Remove" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <button
                        type="button"
                        className="add-item"
                        onClick={async () => {
                            // validate previous row before adding a new one
                            const idx = fields.length - 1;
                            if (idx >= 0) {
                                const valid = await trigger([`items.${idx}.model`, `items.${idx}.qty`, `items.${idx}.price`]);
                                if (!valid) return;
                            }
                            append(defaultItem());
                        }}
                    >
                        + Add item
                    </button>

                    {/* Summary card */}
                    <div className="invoice-card invoice-card--summary">
                        {/* Summary */}
                        <div className="summary">
                            {/* <div>
                                <span>Sub Total</span>
                                <span>{subtotal.toFixed(2)}</span>
                            </div> */}
                            <div className="total">
                                <span>Total AED</span>
                                <span>{total.toFixed(2)} AED</span>
                            </div>
                        </div>
                    </div>
                    <div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input type="checkbox" {...register('paymentReceived')} />
                            <span>Payment received</span>
                        </label>
                    </div>
                </div>

                {/* Fixed bottom footer */}
                <div className="page-footer">
                    {/* Action buttons */}
                    <div className="actions">
                        <button
                            type="button"
                            className="btn-sales-order"
                            onClick={handleSubmit(onMakeSalesOrder)}
                        >
                            Make Sales Order
                        </button>
                        <button
                            type="button"
                            className="wa"
                            onClick={shareWhatsApp}
                        >
                            <img src={whatsappicon} alt="WhatsApp" />
                            Share WhatsApp
                        </button>
                    </div>

                    {/* Powered by */}
                    <div className="powered-text powered-text--light">Powered by Truecell Electronics Trading LLC</div>
                </div>
            </main>

            {/* Hidden printable invoice for PDF generation (offscreen but rendered) */}
            <div style={{ position: 'fixed', left: 0, top: 0, width: '100%', opacity: 0, pointerEvents: 'none', zIndex: -1 }} aria-hidden>
                <InvoicePrintView invoice={{
                    invoiceNumber: watch().invoiceNumber || getNextInvoiceNumber(),
                    customerName: watch().customerName || '',
                    salesRepresentative: watch().salesRepresentative || '',
                    invoiceDate: new Date().toISOString(),
                    items: watch().items || [defaultItem()],
                    subtotal,
                    total,
                    paymentStatus: watch()?.paymentReceived ? 'paid' : 'pending',
                } as Invoice} ref={pdfRef} />
            </div>

            <ConfirmDialog
                open={confirmOpen}
                title="Clear Invoice"
                description="Are you sure you want to clear the invoice draft?"
                onConfirm={confirmClear}
                onClose={() => setConfirmOpen(false)}
            />
        </div>
    );
};

export default CreateInvoicePage;