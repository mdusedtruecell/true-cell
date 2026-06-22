export const setDraft = (key: string, value: any) => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        // ignore
    }
};

export const getDraft = <T = any>(key: string): T | null => {
    try {
        const v = localStorage.getItem(key);
        return v ? JSON.parse(v) as T : null;
    } catch (e) {
        return null;
    }
};

export const removeDraft = (key: string) => {
    try {
        localStorage.removeItem(key);
    } catch (e) { }
};

export const setItem = (key: string, value: any) => setDraft(key, value);
export const getItem = <T = any>(key: string): T | null => getDraft<T>(key);
