export interface SalesRep {
    id: number;
    name: string;
}

export const fetchSalesReps = async (): Promise<SalesRep[]> => {
    // Mock API with small delay
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve([
                { id: 1, name: 'Atif Pardesi' },
                { id: 2, name: 'Faisal Ahmed' },
                { id: 2, name: 'Shezan Khan' },
                { id: 2, name: 'Shahid Khalid' },
                { id: 2, name: 'Hamadou Mounkaila' },
                { id: 2, name: 'Talha Amdani' },
                { id: 2, name: 'Humaira Abdul Ghani' },
                { id: 2, name: 'M Usaid' },
            ]);
        }, 400);
    });
};
