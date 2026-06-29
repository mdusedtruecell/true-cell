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
        if (!invoiceNumber || seen.has(invoiceNumber)) continue;

        seen.add(invoiceNumber);
        cleanHistory.push({ ...item, invoiceNumber });
    }

    return cleanHistory;
};

const upsertHistory = (history: Invoice[], invoice: Invoice): Invoice[] => {
    const invoiceNumber = invoice.invoiceNumber.trim();
    const cleanInvoice = { ...invoice, invoiceNumber };
    const cleanHistory = normalizeHistory(history);

    return [
        cleanInvoice,
        ...cleanHistory.filter((item) => item.invoiceNumber.trim() !== invoiceNumber),
    ];
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
                // Nothing else to do if the browser blocks localStorage access.
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
                set({ loggedInRep: rep, selectedRepresentative: rep?.name ?? null }),
            setRepresentative: (name) => set({ selectedRepresentative: name }),
            saveInvoice: (invoice) => set({ currentInvoice: invoice }),
            addToHistory: (invoice) =>
                set((state) => ({
                    invoiceHistory: upsertHistory(state.invoiceHistory, invoice),
                })),
            updateInHistory: (invoice) =>
                set((state) => ({
                    // Update if present; add if missing so a save never disappears.
                    invoiceHistory: upsertHistory(state.invoiceHistory, invoice),
                })),
            deleteFromHistory: (invoiceNumber) =>
                set((state) => ({
                    invoiceHistory: normalizeHistory(state.invoiceHistory).filter(
                        (invoice) => invoice.invoiceNumber.trim() !== invoiceNumber.trim()
                    ),
                })),
            clearInvoice: () => set({ currentInvoice: null }),
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
