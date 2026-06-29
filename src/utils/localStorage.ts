const parseJson = <T = any>(value: string, key: string): T | null => {
    try {
        return JSON.parse(value) as T;
    } catch (error) {
        console.warn(`[localStorage] Invalid JSON found for key "${key}". The value was ignored.`, error);
        return null;
    }
};

export const setDraft = (key: string, value: any): boolean => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (error) {
        console.error(`[localStorage] Failed to save key "${key}".`, error);
        return false;
    }
};

export const getDraft = <T = any>(key: string): T | null => {
    try {
        const value = localStorage.getItem(key);
        return value ? parseJson<T>(value, key) : null;
    } catch (error) {
        console.error(`[localStorage] Failed to read key "${key}".`, error);
        return null;
    }
};

export const removeDraft = (key: string): boolean => {
    try {
        localStorage.removeItem(key);
        return true;
    } catch (error) {
        console.error(`[localStorage] Failed to remove key "${key}".`, error);
        return false;
    }
};

export const setItem = (key: string, value: any) => setDraft(key, value);
export const getItem = <T = any>(key: string): T | null => getDraft<T>(key);
export const removeItem = (key: string) => removeDraft(key);
