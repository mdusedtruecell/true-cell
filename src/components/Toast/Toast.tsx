import React, { createContext, useContext, useState } from 'react';
import { createPortal } from 'react-dom';

type Toast = { id: string; message: string };

const ToastContext = createContext<{ push: (msg: string) => void }>({ push: () => { } });

export const useToast = () => useContext(ToastContext);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const push = (message: string) => {
        const id = String(Date.now());
        setToasts((s) => [...s, { id, message }]);
        setTimeout(() => setToasts((s) => s.filter((t) => t.id !== id)), 4000);
    };

    return (
        <ToastContext.Provider value={{ push }}>
            {children}
            {createPortal(
                <div className="toast-root" aria-live="polite">
                    {toasts.map((t) => (
                        <div key={t.id} className="toast">{t.message}</div>
                    ))}
                </div>,
                document.body
            )}
        </ToastContext.Provider>
    );
};

export default ToastProvider;
