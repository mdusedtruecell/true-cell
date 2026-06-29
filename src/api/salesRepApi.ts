export interface SalesRep {
    id: number;
    name: string;
    code: string;
}

export const SALES_REPS: SalesRep[] = [
    { id: 1, name: 'Shahid Khalid', code: 'TC0050' },
    { id: 2, name: 'Ahmed', code: 'TC0663' },
    { id: 3, name: 'John Doe', code: 'TC0777' },
    { id: 3, name: 'Atif Pardesi', code: 'TC0777' },
];

export const fetchSalesReps = async (): Promise<SalesRep[]> => {
    return new Promise((resolve) => {
        setTimeout(() => resolve(SALES_REPS), 400);
    });
};

export const validateLogin = (name: string, code: string): SalesRep | null => {
    return SALES_REPS.find(
        r =>
            r.name.toLowerCase() === name.toLowerCase().trim() &&
            r.code === code.trim()
    ) ?? null;
};
