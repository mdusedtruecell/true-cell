import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PersistStorage, StorageValue } from 'zustand/middleware';
import type { Invoice } from 'types/invoice';

export interface LoggedInRep {
    id: number;
    name: string;
    code: string;
}

interface InvoiceStore {
    loggedInRep: LoggedInRep | null;
    selectedRepresentative: string | null;
    currentInvoice: Invoice | null;
    invoiceHistory: Invoice[];
    setLoggedInRep: (rep: LoggedInRep | null) => void;
    setRepresentative: (name: string | null) => void;
    saveInvoice: (invoice: Invoice) => void;
    addToHistory: (invoice: Invoice) => void;
    updateInHistory: (invoice: Invoice) => void;
    deleteFromHistory: (invoiceNumber: string) => void;
    clearInvoice: () => void;
}

type PersistedInvoiceStore = Partial<InvoiceStore>;

const cleanText = (value: unknown): string => String(value ?? '').trim();

const getInvoiceKey = (invoice: Partial<Invoice>): string => {
    return cleanText(invoice.orderId || invoice.invoiceNumber);
};

const getInvoiceTimestamp = (invoice: Partial<Invoice>): number => {
    const revision = Number(invoice.revision);

    if (Number.isFinite(revision) && revision > 0) {
        return revision;
    }

    const updatedAt = Date.parse(cleanText(invoice.updatedAt));

    if (Number.isFinite(updatedAt)) {
        return updatedAt;
    }

    const invoiceDate = Date.parse(cleanText(invoice.invoiceDate));

    if (Number.isFinite(invoiceDate)) {
        return invoiceDate;
    }

    return 0;
};

const isInvoice = (value: unknown): value is Invoice => {
    if (!value || typeof value !== 'object') return false;

    const invoice = value as Partial<Invoice>;

    return (
        typeof invoice.invoiceNumber === 'string' &&
        invoice.invoiceNumber.trim().length > 0 &&
        typeof invoice.customerName === 'string' &&
        typeof invoice.salesRepresentative === 'string' &&
        Array.isArray(invoice.items)
    );
};

const normalizeHistory = (history: unknown): Invoice[] => {
    if (!Array.isArray(history)) return [];

    const seen = new Set<string>();
    const cleanHistory: Invoice[] = [];

    for (const item of history) {
        if (!isInvoice(item)) continue;

        const invoiceNumber = item.invoiceNumber.trim();
        const key = getInvoiceKey(item);

        if (!invoiceNumber || !key || seen.has(key)) continue;

        const items = (item.items || []).filter((row) => cleanText(row.model));

        if (items.length === 0) continue;

        seen.add(key);

        cleanHistory.push({
            ...item,
            invoiceNumber,
            orderId: cleanText(item.orderId),
            items,
            updatedAt: cleanText(item.updatedAt) || item.invoiceDate,
        });
    }

    return cleanHistory.sort((a, b) => getInvoiceTimestamp(b) - getInvoiceTimestamp(a));
};

const upsertHistory = (history: Invoice[], invoice: Invoice): Invoice[] => {
    const invoiceNumber = cleanText(invoice.invoiceNumber);

    const cleanInvoice = {
        ...invoice,
        invoiceNumber,
        orderId: cleanText(invoice.orderId),
        updatedAt: cleanText(invoice.updatedAt) || new Date().toISOString(),
    };

    const cleanHistory = normalizeHistory(history);
    const key = getInvoiceKey(cleanInvoice);

    return normalizeHistory([
        cleanInvoice,
        ...cleanHistory.filter((item) => {
            return (
                getInvoiceKey(item) !== key &&
                cleanText(item.invoiceNumber) !== invoiceNumber
            );
        }),
    ]);
};

const invoiceStoreStorage: PersistStorage<InvoiceStore> = {
    getItem: (name): StorageValue<InvoiceStore> | null => {
        try {
            const value = localStorage.getItem(name);
            return value ? (JSON.parse(value) as StorageValue<InvoiceStore>) : null;
        } catch (error) {
            console.error(`[invoice-store] Stored data for "${name}" could not be parsed and was reset.`, error);

            try {
                localStorage.removeItem(name);
            } catch {
                // Browser localStorage blocked, ignore.
            }

            return null;
        }
    },

    setItem: (name, value): void => {
        try {
            localStorage.setItem(name, JSON.stringify(value));
        } catch (error) {
            console.error(`[invoice-store] Failed to persist "${name}". Browser storage may be full or blocked.`, error);
        }
    },

    removeItem: (name): void => {
        try {
            localStorage.removeItem(name);
        } catch (error) {
            console.error(`[invoice-store] Failed to remove "${name}".`, error);
        }
    },
};

export const useInvoiceStore = create<InvoiceStore>()(
    persist(
        (set) => ({
            loggedInRep: null,
            selectedRepresentative: null,
            currentInvoice: null,
            invoiceHistory: [],

            setLoggedInRep: (rep) =>
                set({
                    loggedInRep: rep,
                    selectedRepresentative: rep?.name ?? null,
                }),

            setRepresentative: (name) =>
                set({
                    selectedRepresentative: name,
                }),

            saveInvoice: (invoice) =>
                set({
                    currentInvoice: invoice,
                }),

            addToHistory: (invoice) =>
                set((state) => ({
                    invoiceHistory: upsertHistory(state.invoiceHistory, invoice),
                })),

            updateInHistory: (invoice) =>
                set((state) => ({
                    invoiceHistory: upsertHistory(state.invoiceHistory, invoice),
                })),

            deleteFromHistory: (invoiceNumber) =>
                set((state) => ({
                    invoiceHistory: normalizeHistory(state.invoiceHistory).filter(
                        (invoice) => cleanText(invoice.invoiceNumber) !== cleanText(invoiceNumber)
                    ),
                })),

            clearInvoice: () =>
                set({
                    currentInvoice: null,
                }),
        }),
        {
            name: 'invoice-store',
            storage: invoiceStoreStorage,
            version: 2,

            partialize: (state) => ({
                loggedInRep: state.loggedInRep,
                selectedRepresentative: state.selectedRepresentative,
                currentInvoice: state.currentInvoice,
                invoiceHistory: normalizeHistory(state.invoiceHistory),
            }),

            merge: (persistedState, currentState) => {
                const persisted = persistedState as PersistedInvoiceStore | undefined;

                return {
                    ...currentState,
                    ...persisted,
                    currentInvoice: isInvoice(persisted?.currentInvoice)
                        ? persisted.currentInvoice
                        : null,
                    invoiceHistory: normalizeHistory(persisted?.invoiceHistory),
                };
            },
        }
    )
);