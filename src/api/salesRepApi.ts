export interface SalesRep {
    id: number;
    name: string;
    code: string;
    canAccessAllInvoices?: boolean;
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

/*
 * Special Accounts access user.
 *
 * Login:
 * Username: accounts
 * Code: TCACCOUNTS
 *
 * Reference email only:
 * accounts@truecelldxb.com
 *
 * Kept OUT of SALES_REPS so "accounts" never appears
 * in the Sales Person selector.
 */
const ACCESS_USERS: SalesRep[] = [
    {
        id: 100,
        name: 'accounts',
        code: 'TCACCOUNTS',
        canAccessAllInvoices: true,
    },
];

export const fetchSalesReps = async (): Promise<SalesRep[]> => {
    return new Promise((resolve) => {
        setTimeout(() => resolve(SALES_REPS), 400);
    });
};

export const validateLogin = (
    name: string,
    code: string
): SalesRep | null => {
    const normalizedName = name.toLowerCase().trim();
    const normalizedCode = code.trim();

    const regularRep = SALES_REPS.find(
        (rep) =>
            rep.name.toLowerCase() === normalizedName &&
            rep.code === normalizedCode
    );

    if (regularRep) {
        return regularRep;
    }

    return (
        ACCESS_USERS.find(
            (user) =>
                user.name.toLowerCase() === normalizedName &&
                user.code === normalizedCode
        ) ?? null
    );
};