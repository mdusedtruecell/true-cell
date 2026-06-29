export interface SalesRep {
    id: number;
    name: string;
    code: string;
}

export const SALES_REPS: SalesRep[] = [
    { id: 3, name: 'Atif Pardesi', code: 'TC1024' },
    { id: 1, name: 'Shahid Khalid', code: 'TC1058' },
    { id: 2, name: 'M Usaid', code: 'TC1133' },
    { id: 3, name: 'Shazen Khan', code: 'TC1187' },
    { id: 3, name: 'Faisal Ahmed', code: 'TC1245' },
    { id: 3, name: 'Talha Amdani', code: 'TC1310' },
    { id: 3, name: 'Humaira Abdul Ghani', code: 'TC1376' },
    { id: 3, name: 'Hamadou Mounkaila', code: 'TC1449' },
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
