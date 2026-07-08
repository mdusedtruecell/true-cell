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
import {
    type SheetInvoice,
    generateOrderId,
    syncInvoiceToGoogleSheet,
    postToGoogleSheet,
    cleanText,
} from 'utils/googleSheet';
import backbtn from '../../assets/back.png';
import deleteicon from '../../assets/delete.png';
import whatsappicon from '../../assets/whatsapp.png';
import redDelete from '../../assets/row_delete.png';

type FormValues = SheetInvoice & {
    paymentReceived?: boolean;
};

const DRAFT_KEY = 'invoice-draft';

const defaultItem = (): InvoiceItem => ({
    id: uuid(),
    model: '',
    qty: undefined,
    price: undefined,
});

export const deleteInvoiceFromGoogleSheet = (invoice: SheetInvoice) => {
    const orderId = cleanText(invoice.orderId || invoice.invoiceNumber);
    const invoiceNumber = cleanText(invoice.invoiceNumber);

    return postToGoogleSheet({
        action: 'deleteOrder',
        orderId,
        previousOrderId: invoiceNumber,
        invoiceNo: invoiceNumber,
        invoiceNumber,
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
    const saveLockRef = useRef(false);
    const hasSavedRef = useRef(false);

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
            updatedAt: editInvoice?.updatedAt ?? draft?.updatedAt ?? new Date().toISOString(),
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
    const [isSaving, setIsSaving] = useState(false);
    const [hasSavedInvoice, setHasSavedInvoice] = useState(false);

    const markInvoiceSaved = () => {
        hasSavedRef.current = true;
        setHasSavedInvoice(true);
    };

    const resetSaveStatus = () => {
        saveLockRef.current = false;
        hasSavedRef.current = false;
        setIsSaving(false);
        setHasSavedInvoice(false);
    };

    useEffect(() => {
        if (isEditing) return;

        const subscription = watch((value) => {
            setDraft(DRAFT_KEY, value as any);
        }) as any;

        return () => subscription?.unsubscribe?.();
    }, [watch, isEditing]);

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
            updatedAt: new Date().toISOString(),
            items: [defaultItem()],
            subtotal: 0,
            total: 0,
            depositAmount: 0,
            customerShipStatus: 'pending',
            paymentReceived: false,
        } as FormValues);

        resetSaveStatus();
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

        const nowIso = new Date().toISOString();

        initialOrderIdRef.current = orderId;
        setValue('orderId' as any, orderId as any);

        return {
            ...data,
            orderId,
            invoiceNumber: number,
            invoiceDate: data.invoiceDate || editInvoice?.invoiceDate || nowIso,
            updatedAt: nowIso,
            subtotal,
            total,
            depositAmount: Number(data.depositAmount) || 0,
            paymentStatus: data.paymentReceived
                ? 'paid'
                : Number(data.depositAmount) > 0
                    ? 'deposit'
                    : 'pending',
            customerShipStatus: data.customerShipStatus || editInvoice?.customerShipStatus || 'pending',
            syncStatus: 'pending',
        };
    };

    const persistInvoice = async (invoice: SheetInvoice): Promise<SheetInvoice> => {
        const localInvoice: SheetInvoice = {
            ...invoice,
            syncStatus: 'pending',
        };

        saveInvoiceToStore(localInvoice as Invoice);
        setDraft(`invoice-${localInvoice.invoiceNumber}`, localInvoice);
        setDraft('last-invoice', localInvoice.invoiceNumber);

        if (isEditing) {
            updateInHistory(localInvoice as Invoice);
        } else {
            addToHistory(localInvoice as Invoice);
        }

        removeDraft(DRAFT_KEY);

        const finalInvoice: SheetInvoice = {
            ...localInvoice,
            syncStatus: 'synced',
        };

        saveInvoiceToStore(finalInvoice as Invoice);
        updateInHistory(finalInvoice as Invoice);
        setDraft(`invoice-${finalInvoice.invoiceNumber}`, finalInvoice);
        setDraft('last-invoice', finalInvoice.invoiceNumber);

        void syncInvoiceToGoogleSheet(
            localInvoice,
            isEditing ? editInvoice : undefined
        )
            .then((syncedInvoice) => {
                const updatedInvoice: SheetInvoice = {
                    ...finalInvoice,
                    ...syncedInvoice,
                    syncStatus: 'synced',
                };

                saveInvoiceToStore(updatedInvoice as Invoice);
                updateInHistory(updatedInvoice as Invoice);
                setDraft(`invoice-${updatedInvoice.invoiceNumber}`, updatedInvoice);
                setDraft('last-invoice', updatedInvoice.invoiceNumber);
            })
            .catch((error) => {
                console.error('Background Google Sheet save failed:', error);

                updateInHistory({
                    ...localInvoice,
                    syncStatus: 'failed',
                } as Invoice);
            });

        return finalInvoice;
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

    const onSave = async (data: any) => {
        if (saveLockRef.current || hasSavedRef.current) return;

        saveLockRef.current = true;
        setIsSaving(true);

        const number = getUniqueInvoiceNumber(data);
        setValue('invoiceNumber', number);

        const invoice = buildInvoice(data, number);

        try {
            await persistInvoice(invoice);
            markInvoiceSaved();
            push('Invoice saved successfully');
        } catch (error) {
            console.error('Invoice save failed:', error);
            push('Could not save invoice. Please check your internet and try again.');
        } finally {
            saveLockRef.current = false;
            setIsSaving(false);
        }
    };

    const shareWhatsApp = async () => {
        if (saveLockRef.current) {
            push('Please wait, invoice is saving.');
            return;
        }

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

        let invoiceForShare: SheetInvoice = invoice;

        if (!hasSavedRef.current) {
            saveLockRef.current = true;
            setIsSaving(true);

            try {
                invoiceForShare = await persistInvoice(invoice);
                markInvoiceSaved();
                push('Invoice saved successfully');
            } catch (error) {
                console.error('Invoice save before share failed:', error);
                push('Could not save invoice. Please check your internet and try again.');
                saveLockRef.current = false;
                setIsSaving(false);
                return;
            } finally {
                saveLockRef.current = false;
                setIsSaving(false);
            }
        }

        try {
            if (!pdfRef.current) {
                push('Preparing invoice. Please try again.');
                return;
            }

            const blob = await generatePdf(pdfRef.current);
            const file = new File([blob], getPdfFilename(invoiceForShare as Invoice), {
                type: 'application/pdf',
            });

            // @ts-ignore - browser support depends on device
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                // @ts-ignore - browser support depends on device
                await navigator.share({
                    files: [file],
                    title: `Invoice ${invoiceForShare.invoiceNumber}`,
                    text: `Invoice ${invoiceForShare.invoiceNumber}`,
                });

                return;
            }

            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');

            setTimeout(() => {
                URL.revokeObjectURL(url);
            }, 10000);

            const message = buildWhatsappMessage(invoiceForShare as Invoice);
            window.open(`https://wa.me/?text=${encodeURIComponent(message)}`);
        } catch (error) {
            console.error('Failed to generate/share PDF:', error);
            push('Failed to share invoice');
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
                                                    validate: (value) => {
                                                        const price = Number(value);

                                                        if (!Number.isFinite(price)) {
                                                            return 'Price required';
                                                        }

                                                        if (price === 0) {
                                                            return 'Price cannot be 0';
                                                        }

                                                        return true;
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

                <div className="page-footer">
                    <div className="actions actions--three">
                        <button
                            type="button"
                            className="wa"
                            onClick={handleSubmit(onPreview)}
                            disabled={isSaving}
                        >
                            Preview
                        </button>

                        <button
                            type="button"
                            className="btn-save"
                            onClick={handleSubmit(onSave)}
                            disabled={isSaving || hasSavedInvoice}
                        >
                            {isSaving ? 'Saving...' : hasSavedInvoice ? 'Saved' : 'Save'}
                        </button>

                        <button
                            type="button"
                            className="wa"
                            onClick={shareWhatsApp}
                            disabled={isSaving}
                        >
                            <img src={whatsappicon} alt="WhatsApp" />
                            Share
                        </button>
                    </div>

                    <div className="powered-text powered-text--light">
                        Powered by Truecell Electronics Trading LLC
                    </div>
                </div>
            </main>

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
                            invoiceDate: watch().invoiceDate || new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
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