import React, { useEffect, useRef, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { v4 as uuid } from 'uuid';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Invoice, InvoiceItem } from 'types/invoice';
import { getDraft, removeDraft, setDraft } from 'utils/localStorage';
import { generateInvoiceNumber } from 'utils/invoiceNumber';
import { useInvoiceCalculations } from 'hooks/useInvoiceCalculations';
import { useInvoiceStore } from 'store/invoiceStore';
import ConfirmDialog from 'components/ConfirmDialog/ConfirmDialog';
import Header from 'components/Header/Header';
import { buildWhatsappMessage } from 'utils/whatsapp';
import InvoicePrintView from 'components/InvoicePrintView/InvoicePrintView';
import { generatePdf, getPdfFilename } from 'utils/pdf';
import { useToast } from 'components/Toast/Toast';
import backbtn from '../../assets/back.png';
import deleteicon from '../../assets/delete.png';
import whatsappicon from '../../assets/whatsapp.png';
import redDelete from '../../assets/row_delete.png';

type SheetInvoice = Invoice & {
    orderId?: string;
    customerShipStatus?: 'pending' | 'shipped';
};

type FormValues = SheetInvoice & {
    paymentReceived?: boolean;
};

const DRAFT_KEY = 'invoice-draft';

// ✅ Apps Script Web App URL yahan paste karo.
// Important: /exec wala deployed URL use karna hai, /dev wala nahi.
const GOOGLE_SHEET_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbw89yajiSI_8Y_jBBWS_GeUSUHKuf_bO7O6Tk4KbrRfn8KwzJ9g_QPR0WUeY536qohLxg/exec';

const defaultItem = (): InvoiceItem => ({
    id: uuid(),
    model: '',
    qty: undefined,
    price: undefined,
});

// ✅ Order ID invoice number se alag aur unique hoga
const generateOrderId = () => {
    return `ORD-${Date.now()}-${uuid().slice(0, 8).toUpperCase()}`;
};

// ✅ Sheet ke liye readable Dubai date format
const formatDateForSheet = (dateValue?: string) => {
    const date = dateValue ? new Date(dateValue) : new Date();

    if (Number.isNaN(date.getTime())) {
        return new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Dubai',
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        })
            .format(new Date())
            .replace(',', '')
            .replaceAll(' ', '-')
            .replace(/-(\d{2}:\d{2})$/, ' $1');
    }

    return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Dubai',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    })
        .format(date)
        .replace(',', '')
        .replaceAll(' ', '-')
        .replace(/-(\d{2}:\d{2})$/, ' $1');
};

// ✅ Sheet me full invoice save/edit/overwrite
const syncInvoiceToGoogleSheet = (
    invoice: SheetInvoice,
    previousInvoice?: SheetInvoice
) => {
    if (!GOOGLE_SHEET_WEB_APP_URL || GOOGLE_SHEET_WEB_APP_URL.includes('PASTE_')) {
        console.warn('Google Sheet Web App URL missing');
        return;
    }

    const orderId = invoice.orderId || generateOrderId();

    const payload = {
        action: 'save',

        // ✅ Main tracking ID
        orderId,

        // ✅ Edit/migration ke liye old ID bhi bhej rahe hain
        previousOrderId:
            previousInvoice?.orderId ||
            previousInvoice?.invoiceNumber ||
            '',

        // ✅ Date ab clean format me sheet me jayegi
        date: formatDateForSheet(invoice.invoiceDate),

        // ✅ Invoice number alag rahega
        invoiceNo: invoice.invoiceNumber,

        customer: invoice.customerName,
        salesPerson: invoice.salesRepresentative,
        paymentStatus: invoice.paymentStatus,
        customerShipStatus: invoice.customerShipStatus === 'shipped' ? 'shipped' : undefined,

        items: invoice.items.map((item) => ({
            id: item.id || uuid(),
            model: item.model,
            qty: Number(item.qty) || 0,
            price: Number(item.price) || 0,
        })),
    };

    void fetch(GOOGLE_SHEET_WEB_APP_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
            'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(payload),
    })
        .then(() => {
            console.log('Google Sheet sync request sent');
        })
        .catch((error) => {
            console.error('Google Sheet sync failed:', error);
        });
};

// ✅ Invoice delete ke liye helper
// Isko us file me call karna jahan actual invoice delete hoti hai.
export const deleteInvoiceFromGoogleSheet = (invoice: SheetInvoice) => {
    if (!GOOGLE_SHEET_WEB_APP_URL || GOOGLE_SHEET_WEB_APP_URL.includes('PASTE_')) {
        console.warn('Google Sheet Web App URL missing');
        return;
    }

    const payload = {
        action: 'deleteOrder',
        orderId: invoice.orderId || invoice.invoiceNumber,
        previousOrderId: invoice.invoiceNumber,
    };

    void fetch(GOOGLE_SHEET_WEB_APP_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
            'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(payload),
    }).catch((error) => {
        console.error('Google Sheet delete failed:', error);
    });
};

export const CreateInvoicePage: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();

    const editInvoice = (location.state as any)?.invoice as SheetInvoice | undefined;
    const isEditing = !!(location.state as any)?.isEditing;

    const selectedRep = useInvoiceStore((s: any) => s.selectedRepresentative);
    const saveInvoiceToStore = useInvoiceStore((s: any) => s.saveInvoice);
    const addToHistory = useInvoiceStore((s: any) => s.addToHistory);
    const updateInHistory = useInvoiceStore((s: any) => s.updateInHistory);
    const invoiceHistory: Invoice[] = useInvoiceStore((s: any) => s.invoiceHistory);

    const pdfRef = useRef<HTMLDivElement | null>(null);
    const { push } = useToast();

    const draft = isEditing ? null : (getDraft<Partial<SheetInvoice>>(DRAFT_KEY) ?? null);

    const initialOrderIdRef = useRef<string>(
        editInvoice?.orderId || draft?.orderId || generateOrderId()
    );

    const {
        register,
        control,
        handleSubmit,
        watch,
        reset,
        trigger,
        setValue,
        formState: { errors },
    } = useForm<FormValues>({
        defaultValues: {
            orderId: editInvoice?.orderId ?? draft?.orderId ?? initialOrderIdRef.current,
            invoiceNumber: editInvoice?.invoiceNumber ?? draft?.invoiceNumber ?? '',
            customerName: editInvoice?.customerName ?? draft?.customerName ?? '',
            salesRepresentative:
                editInvoice?.salesRepresentative ??
                draft?.salesRepresentative ??
                selectedRep ??
                '',
            invoiceDate: editInvoice?.invoiceDate ?? draft?.invoiceDate ?? new Date().toISOString(),
            items: editInvoice?.items ?? draft?.items ?? [defaultItem()],
            subtotal: editInvoice?.subtotal ?? draft?.subtotal ?? 0,
            total: editInvoice?.total ?? draft?.total ?? 0,
            depositAmount: editInvoice?.depositAmount ?? draft?.depositAmount ?? 0,
            customerShipStatus: editInvoice?.customerShipStatus ?? draft?.customerShipStatus ?? 'pending',
            paymentReceived: editInvoice
                ? editInvoice.paymentStatus === 'paid'
                : draft?.paymentStatus === 'paid',
        },
    });

    const { fields, append, remove } = useFieldArray<FormValues, 'items'>({
        control,
        name: 'items',
    });

    const watchedItems = useWatch({ control, name: 'items' }) as InvoiceItem[];
    const { subtotal, total } = useInvoiceCalculations((watchedItems || []) as InvoiceItem[]);

    const [confirmOpen, setConfirmOpen] = useState(false);
    const [isSaved, setIsSaved] = useState(false);

    // Auto-save draft. Edit mode me draft save nahi hoga.
    useEffect(() => {
        if (isEditing) return;

        const subscription = watch((value) => {
            setDraft(DRAFT_KEY, value as any);
        }) as any;

        return () => subscription?.unsubscribe?.();
    }, [watch, isEditing]);

    // Computed total ko form values me update karo.
    useEffect(() => {
        setValue('subtotal', subtotal as any);
        setValue('total', total as any);
    }, [subtotal, total, setValue]);

    const onClear = () => setConfirmOpen(true);

    const confirmClear = () => {
        removeDraft(DRAFT_KEY);

        const newOrderId = generateOrderId();
        initialOrderIdRef.current = newOrderId;

        reset({
            orderId: newOrderId,
            invoiceNumber: '',
            customerName: '',
            salesRepresentative: selectedRep ?? '',
            invoiceDate: new Date().toISOString(),
            items: [defaultItem()],
            subtotal: 0,
            total: 0,
            depositAmount: 0,
            customerShipStatus: 'pending',
            paymentReceived: false,
        } as FormValues);

        setIsSaved(false);
        setConfirmOpen(false);
    };

    const existingNumbers = invoiceHistory.map((invoice) => invoice.invoiceNumber);

    const getUniqueInvoiceNumber = (data: Partial<Invoice>): string => {
        const enteredNumber = String(data.invoiceNumber ?? '').trim();

        const numbersToCheck = isEditing
            ? existingNumbers.filter((number) => number !== editInvoice?.invoiceNumber)
            : existingNumbers;

        if (enteredNumber && !numbersToCheck.includes(enteredNumber)) {
            return enteredNumber;
        }

        return generateInvoiceNumber(data.customerName || 'TC', numbersToCheck);
    };

    const buildInvoice = (data: any, number: string): SheetInvoice => {
        const orderId = String(
            data.orderId || initialOrderIdRef.current || generateOrderId()
        ).trim();

        initialOrderIdRef.current = orderId;
        setValue('orderId' as any, orderId as any);

        return {
            ...data,
            orderId,
            invoiceNumber: number,
            invoiceDate: new Date().toISOString(),
            subtotal,
            total,
            depositAmount: Number(data.depositAmount) || 0,
            paymentStatus: data.paymentReceived
                ? 'paid'
                : Number(data.depositAmount) > 0
                    ? 'deposit'
                    : 'pending',
            customerShipStatus: data.customerShipStatus || editInvoice?.customerShipStatus || 'pending',
        };
    };

    const persistInvoice = (invoice: SheetInvoice) => {
        saveInvoiceToStore(invoice as Invoice);
        setDraft(`invoice-${invoice.invoiceNumber}`, invoice);
        setDraft('last-invoice', invoice.invoiceNumber);

        if (isEditing) {
            updateInHistory(invoice as Invoice);
        } else {
            addToHistory(invoice as Invoice);
        }

        removeDraft(DRAFT_KEY);
        setIsSaved(true);

        // ✅ Save/edit dono cases me sheet overwrite hogi
        syncInvoiceToGoogleSheet(
            invoice,
            isEditing ? editInvoice : undefined
        );
    };

    const onPreview = (data: any) => {
        const number = getUniqueInvoiceNumber(data);
        setValue('invoiceNumber', number);

        const invoice = buildInvoice(data, number);

        saveInvoiceToStore(invoice as Invoice);
        setDraft(`invoice-${number}`, invoice);
        setDraft('last-invoice', number);

        navigate('/invoice/preview');
    };

    const onSave = (data: any) => {
        const number = getUniqueInvoiceNumber(data);
        setValue('invoiceNumber', number);

        const invoice = buildInvoice(data, number);

        persistInvoice(invoice);
        push('Invoice saved successfully');
    };

    const shareWhatsApp = async () => {
        const itemsCount = fields.length;
        const fieldNames: string[] = ['customerName', 'salesRepresentative'];

        for (let i = 0; i < itemsCount; i++) {
            fieldNames.push(`items.${i}.model`, `items.${i}.qty`, `items.${i}.price`);
        }

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
        const number = getUniqueInvoiceNumber(data);
        setValue('invoiceNumber', number);

        const invoice = buildInvoice(data, number);

        persistInvoice(invoice);

        try {
            if (!pdfRef.current) {
                push('Preparing invoice. Please try again.');
                return;
            }

            const blob = await generatePdf(pdfRef.current);
            const file = new File([blob], getPdfFilename(invoice as Invoice), {
                type: 'application/pdf',
            });

            // @ts-ignore - browser support depends on device
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                // @ts-ignore - browser support depends on device
                await navigator.share({
                    files: [file],
                    title: `Invoice ${invoice.invoiceNumber}`,
                    text: `Invoice ${invoice.invoiceNumber}`,
                });
                return;
            }

            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');

            setTimeout(() => {
                URL.revokeObjectURL(url);
            }, 10000);

            const message = buildWhatsappMessage(invoice as Invoice);
            window.open(`https://wa.me/?text=${encodeURIComponent(message)}`);
        } catch (error) {
            console.error('Failed to generate/share PDF:', error);
            push('Failed to generate/share PDF');
        }
    };

    const watchedDeposit = watch('depositAmount');
    const watchedPaymentReceived = watch('paymentReceived');

    return (
        <div className="page create-invoice-page">
            <Header
                title={isEditing ? 'Edit Invoice' : 'New Invoice'}
                left={
                    <button type="button" onClick={() => navigate(-1)} aria-label="Go back">
                        <img src={backbtn} alt="Back" />
                    </button>
                }
                right={
                    <button type="button" onClick={onClear} aria-label="Clear invoice">
                        <img src={deleteicon} alt="Clear" />
                    </button>
                }
            />

            <main>
                <div className="create-invoice">
                    {/* Customer card */}
                    <div className="invoice-card">
                        <div className="customer-row">
                            <span className="label">Customer Name</span>
                        </div>

                        <div className="form-row" style={{ marginBottom: 0 }}>
                            <input
                                {...register('customerName', {
                                    required: 'Customer name required',
                                    minLength: {
                                        value: 3,
                                        message: 'Min 3 chars',
                                    },
                                })}
                                placeholder="type customer name"
                            />

                            {errors.customerName?.message && (
                                <div className="error">
                                    {String(errors.customerName.message)}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Items card */}
                    <div className="invoice-card invoice-card--items">
                        <div className="items">
                            <div className="items-label">Items</div>

                            <div className="table-head">
                                <div>Model</div>
                                <div>Qty</div>
                                <div>Price (AED)</div>
                                <div />
                            </div>

                            <div className="items-scroll">
                                {fields.map((field: any, idx: number) => (
                                    <div className="item-row" key={field.id}>
                                        <div className="field-col">
                                            <input
                                                className={
                                                    (errors as any)?.items?.[idx]?.model
                                                        ? 'input-error'
                                                        : ''
                                                }
                                                {...register(`items.${idx}.model` as const, {
                                                    required: 'Model required',
                                                })}
                                                defaultValue={(field as any).model}
                                                placeholder="Model"
                                            />
                                        </div>

                                        <div className="field-col">
                                            <input
                                                className={
                                                    (errors as any)?.items?.[idx]?.qty
                                                        ? 'input-error'
                                                        : ''
                                                }
                                                type="number"
                                                {...register(`items.${idx}.qty` as const, {
                                                    valueAsNumber: true,
                                                    required: 'Qty required',
                                                    min: {
                                                        value: 1,
                                                        message: 'Min 1',
                                                    },
                                                })}
                                                defaultValue={(field as any).qty ?? ''}
                                                placeholder="0"
                                                onInput={() => {
                                                    void trigger(`items.${idx}.qty` as any);
                                                }}
                                            />
                                        </div>

                                        <div className="field-col">
                                            <input
                                                className={
                                                    (errors as any)?.items?.[idx]?.price
                                                        ? 'input-error'
                                                        : ''
                                                }
                                                type="number"
                                                {...register(`items.${idx}.price` as const, {
                                                    valueAsNumber: true,
                                                    required: 'Price required',
                                                    min: {
                                                        value: 0.01,
                                                        message: 'Min 0.01',
                                                    },
                                                })}
                                                defaultValue={(field as any).price ?? ''}
                                                placeholder="0"
                                                onInput={() => {
                                                    void trigger(`items.${idx}.price` as any);
                                                }}
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
                            const idx = fields.length - 1;

                            if (idx >= 0) {
                                const valid = await trigger([
                                    `items.${idx}.model`,
                                    `items.${idx}.qty`,
                                    `items.${idx}.price`,
                                ] as any);

                                if (!valid) return;
                            }

                            append(defaultItem());
                        }}
                    >
                        + Add item
                    </button>

                    {/* Deposit + Total */}
                    <div className="invoice-card invoice-card--summary">
                        <div className="deposit-total-row">
                            <div className="deposit-col">
                                <label className="deposit-label">Deposit Amount</label>

                                <input
                                    type="number"
                                    className="deposit-input"
                                    {...register('depositAmount', {
                                        valueAsNumber: true,
                                        min: 0,
                                    })}
                                    placeholder="0"
                                    min={0}
                                />
                            </div>

                            <div className="total-col">
                                <span className="total-label-sm">Total</span>
                                <span className="total-value-sm">{total.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="payment-check-row">
                            <input type="checkbox" {...register('paymentReceived')} />
                            <span>Full Payment Received</span>
                        </label>
                    </div>
                </div>

                {/* Footer */}
                <div className="page-footer">
                    <div className="actions actions--three">
                        <button
                            type="button"
                            className="wa"
                            onClick={handleSubmit(onPreview)}
                        >
                            Preview
                        </button>

                        <button
                            type="button"
                            className="btn-save"
                            onClick={handleSubmit(onSave)}
                            disabled={isSaved}
                        >
                            {isSaved ? 'Saved' : 'Save'}
                        </button>

                        <button type="button" className="wa" onClick={shareWhatsApp}>
                            <img src={whatsappicon} alt="WhatsApp" />
                            Share
                        </button>
                    </div>

                    <div className="powered-text powered-text--light">
                        Powered by Truecell Electronics Trading LLC
                    </div>
                </div>
            </main>

            {/* Hidden print view for PDF generation */}
            <div
                style={{
                    position: 'fixed',
                    left: 0,
                    top: 0,
                    width: '100%',
                    opacity: 0,
                    pointerEvents: 'none',
                    zIndex: -1,
                }}
                aria-hidden
            >
                <InvoicePrintView
                    invoice={
                        {
                            orderId: watch().orderId || initialOrderIdRef.current,
                            invoiceNumber:
                                watch().invoiceNumber ||
                                generateInvoiceNumber(
                                    watch().customerName || 'TC',
                                    existingNumbers
                                ),
                            customerName: watch().customerName || '',
                            salesRepresentative: watch().salesRepresentative || '',
                            invoiceDate: new Date().toISOString(),
                            items: watch().items || [defaultItem()],
                            subtotal,
                            total,
                            depositAmount: Number(watchedDeposit) || 0,
                            paymentStatus: watchedPaymentReceived
                                ? 'paid'
                                : Number(watchedDeposit) > 0
                                    ? 'deposit'
                                    : 'pending',
                            customerShipStatus: editInvoice?.customerShipStatus || 'pending',
                        } as SheetInvoice
                    }
                    ref={pdfRef}
                />
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