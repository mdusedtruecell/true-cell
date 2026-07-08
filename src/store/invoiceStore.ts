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
    cancelledInvoiceKeys: string[];

    setLoggedInRep: (rep: LoggedInRep | null) => void;
    setRepresentative: (name: string | null) => void;
    saveInvoice: (invoice: Invoice) => void;
    addToHistory: (invoice: Invoice) => void;
    updateInHistory: (invoice: Invoice) => void;
    deleteFromHistory: (invoiceKey: string) => void;
    addCancelledInvoiceKey: (invoiceKey: string) => void;
    removeCancelledInvoiceKey: (invoiceKey: string) => void;
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

const isCanceledInvoice = (invoice: Partial<Invoice>): boolean => {
    const status = cleanText(invoice.orderStatus).toLowerCase();

    return status === 'cancel' || status === 'cancelled' || status === 'canceled';
};

const normalizeKeyList = (keys: unknown): string[] => {
    if (!Array.isArray(keys)) return [];

    return Array.from(
        new Set(
            keys
                .map((key) => cleanText(key))
                .filter(Boolean)
        )
    );
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

const invoiceMatchesKey = (invoice: Partial<Invoice>, keyToMatch: string): boolean => {
    const cleanKey = cleanText(keyToMatch);

    if (!cleanKey) return false;

    return (
        getInvoiceKey(invoice) === cleanKey ||
        cleanText(invoice.invoiceNumber) === cleanKey ||
        cleanText(invoice.orderId) === cleanKey
    );
};

const isInvoiceBlacklisted = (invoice: Partial<Invoice>, cancelledKeys: string[]): boolean => {
    const key = getInvoiceKey(invoice);
    const invoiceNumber = cleanText(invoice.invoiceNumber);
    const orderId = cleanText(invoice.orderId);

    return cancelledKeys.some((cancelledKey) => {
        return cancelledKey === key || cancelledKey === invoiceNumber || cancelledKey === orderId;
    });
};

const normalizeHistory = (history: unknown, cancelledKeys: string[] = []): Invoice[] => {
    const cleanCancelledKeys = normalizeKeyList(cancelledKeys);

    if (!Array.isArray(history)) return [];

    const seen = new Set<string>();
    const cleanHistory: Invoice[] = [];

    for (const item of history) {
        if (!isInvoice(item)) continue;

        const invoiceNumber = cleanText(item.invoiceNumber);
        const key = getInvoiceKey(item);

        if (!invoiceNumber || !key || seen.has(key)) continue;
        if (isCanceledInvoice(item)) continue;
        if (isInvoiceBlacklisted(item, cleanCancelledKeys)) continue;

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

const upsertHistory = (history: Invoice[], invoice: Invoice, cancelledKeys: string[] = []): Invoice[] => {
    const cleanCancelledKeys = normalizeKeyList(cancelledKeys);
    const invoiceNumber = cleanText(invoice.invoiceNumber);
    const key = getInvoiceKey(invoice);

    if (!invoiceNumber || !key) {
        return normalizeHistory(history, cleanCancelledKeys);
    }

    if (isCanceledInvoice(invoice) || isInvoiceBlacklisted(invoice, cleanCancelledKeys)) {
        return normalizeHistory(history, cleanCancelledKeys).filter(
            (item) => !invoiceMatchesKey(item, key) && !invoiceMatchesKey(item, invoiceNumber)
        );
    }

    const cleanInvoice: Invoice = {
        ...invoice,
        invoiceNumber,
        orderId: cleanText(invoice.orderId),
        updatedAt: cleanText(invoice.updatedAt) || new Date().toISOString(),
    };

    return normalizeHistory(
        [
            cleanInvoice,
            ...normalizeHistory(history, cleanCancelledKeys).filter((item) => {
                return (
                    getInvoiceKey(item) !== key &&
                    cleanText(item.invoiceNumber) !== invoiceNumber
                );
            }),
        ],
        cleanCancelledKeys
    );
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
                // ignore
            }

            return null;
        }
    },

    setItem: (name, value): void => {
        try {
            localStorage.setItem(name, JSON.stringify(value));
        } catch (error) {
            console.error(`[invoice-store] Failed to persist "${name}".`, error);
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
        (set, get) => ({
            loggedInRep: null,
            selectedRepresentative: null,
            currentInvoice: null,
            invoiceHistory: [],
            cancelledInvoiceKeys: [],

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
                    invoiceHistory: upsertHistory(
                        state.invoiceHistory,
                        invoice,
                        state.cancelledInvoiceKeys
                    ),
                })),

            updateInHistory: (invoice) =>
                set((state) => ({
                    invoiceHistory: upsertHistory(
                        state.invoiceHistory,
                        invoice,
                        state.cancelledInvoiceKeys
                    ),
                })),

            deleteFromHistory: (invoiceKey) =>
                set((state) => ({
                    invoiceHistory: normalizeHistory(
                        state.invoiceHistory,
                        state.cancelledInvoiceKeys
                    ).filter((invoice) => !invoiceMatchesKey(invoice, invoiceKey)),
                })),

            addCancelledInvoiceKey: (invoiceKey) => {
                const cleanKey = cleanText(invoiceKey);

                if (!cleanKey) return;

                set((state) => {
                    const nextCancelledKeys = normalizeKeyList([
                        ...state.cancelledInvoiceKeys,
                        cleanKey,
                    ]);

                    return {
                        cancelledInvoiceKeys: nextCancelledKeys,
                        invoiceHistory: normalizeHistory(
                            state.invoiceHistory,
                            nextCancelledKeys
                        ).filter((invoice) => !invoiceMatchesKey(invoice, cleanKey)),
                        currentInvoice:
                            state.currentInvoice && invoiceMatchesKey(state.currentInvoice, cleanKey)
                                ? null
                                : state.currentInvoice,
                    };
                });
            },

            removeCancelledInvoiceKey: (invoiceKey) => {
                const cleanKey = cleanText(invoiceKey);

                if (!cleanKey) return;

                set((state) => {
                    const nextCancelledKeys = state.cancelledInvoiceKeys.filter(
                        (key) => key !== cleanKey
                    );

                    return {
                        cancelledInvoiceKeys: nextCancelledKeys,
                        invoiceHistory: normalizeHistory(
                            state.invoiceHistory,
                            nextCancelledKeys
                        ),
                    };
                });
            },

            clearInvoice: () =>
                set({
                    currentInvoice: null,
                }),
        }),
        {
            name: 'invoice-store',
            storage: invoiceStoreStorage,
            version: 3,

            partialize: (state) => ({
                loggedInRep: state.loggedInRep,
                selectedRepresentative: state.selectedRepresentative,
                currentInvoice: state.currentInvoice,
                invoiceHistory: normalizeHistory(
                    state.invoiceHistory,
                    state.cancelledInvoiceKeys
                ),
                cancelledInvoiceKeys: normalizeKeyList(state.cancelledInvoiceKeys),
            }),

            merge: (persistedState, currentState) => {
                const persisted = persistedState as PersistedInvoiceStore | undefined;
                const cancelledInvoiceKeys = normalizeKeyList(persisted?.cancelledInvoiceKeys);

                return {
                    ...currentState,
                    ...persisted,
                    cancelledInvoiceKeys,
                    currentInvoice:
                        isInvoice(persisted?.currentInvoice) &&
                        !isInvoiceBlacklisted(persisted.currentInvoice, cancelledInvoiceKeys)
                            ? persisted.currentInvoice
                            : null,
                    invoiceHistory: normalizeHistory(
                        persisted?.invoiceHistory,
                        cancelledInvoiceKeys
                    ),
                };
            },
        }
    )
);