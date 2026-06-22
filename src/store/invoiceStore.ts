import create from 'zustand';
import { persist } from 'zustand/middleware';
import type { Invoice } from 'types/invoice';

// Persist selectedRepresentative so the chosen sales rep survives page reloads.

interface InvoiceStore {
    selectedRepresentative: string | null;
    currentInvoice: Invoice | null;
    setRepresentative: (name: string | null) => void;
    saveInvoice: (invoice: Invoice) => void;
    clearInvoice: () => void;
}

export const useInvoiceStore = create<InvoiceStore>()(
    persist(
        (set) => ({
            selectedRepresentative: null,
            currentInvoice: null,
            setRepresentative: (name) => set({ selectedRepresentative: name }),
            saveInvoice: (invoice) => set({ currentInvoice: invoice }),
            clearInvoice: () => set({ currentInvoice: null })
        }),
        {
            name: 'invoice-store',
            // Persist selectedRepresentative and currentInvoice so selection and last invoice persist.
            partialize: (state) => ({ selectedRepresentative: state.selectedRepresentative, currentInvoice: state.currentInvoice })
        }
    )
);
