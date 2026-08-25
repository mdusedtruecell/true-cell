import React, { useEffect } from 'react';
import {
    BrowserRouter,
    Routes,
    Route,
    Navigate,
} from 'react-router-dom';
import { useInvoiceStore } from 'store/invoiceStore';
import { validateLogin } from 'api/salesRepApi';
import LoginPage from 'pages/LoginPage';
import HomePage from 'pages/HomePage';
import HistoryPage from 'pages/HistoryPage';
import CreateInvoicePage from 'pages/CreateInvoicePage';
import InvoicePreviewPage from 'pages/InvoicePreviewPage';
import ManagementPage from 'pages/ManagementPage';


const hasAllInvoiceAccess = (rep: any): boolean =>
    !!rep &&
    (rep.canAccessAllInvoices === true ||
        String(rep.name || '').toLowerCase().trim() === 'accounts');

const ProtectedRoute: React.FC<{
    children: React.ReactNode;
}> = ({ children }) => {
    const loggedInRep = useInvoiceStore(
        (s: any) => s.loggedInRep
    );

    if (!loggedInRep) {
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
};

const AllInvoiceAccessRoute: React.FC<{
    children: React.ReactNode;
}> = ({ children }) => {
    const loggedInRep = useInvoiceStore(
        (s: any) => s.loggedInRep
    );

    if (!loggedInRep) {
        return <Navigate to="/" replace />;
    }

    if (!hasAllInvoiceAccess(loggedInRep)) {
        return <Navigate to="/history" replace />;
    }

    return <>{children}</>;
};

export const AppRoutes: React.FC = () => {
    const loggedInRep = useInvoiceStore(
        (s: any) => s.loggedInRep
    );

    const setLoggedInRep = useInvoiceStore(
        (s: any) => s.setLoggedInRep
    );

    /*
     * Remove stale persisted logins.
     * Example: the old Management / TCADMIN login may still be saved
     * in browser localStorage even after removing it from salesRepApi.
     */
    useEffect(() => {
        if (!loggedInRep) {
            return;
        }

        const stillValid = validateLogin(
            String(loggedInRep.name || ''),
            String(loggedInRep.code || '')
        );

        if (!stillValid) {
            setLoggedInRep(null);
        }
    }, [
        loggedInRep?.name,
        loggedInRep?.code,
        setLoggedInRep,
    ]);

    const currentLoginIsValid =
        !loggedInRep ||
        !!validateLogin(
            String(loggedInRep.name || ''),
            String(loggedInRep.code || '')
        );

    if (!currentLoginIsValid) {
        return (
            <BrowserRouter>
                <Routes>
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </BrowserRouter>
        );
    }

    const loggedInHome =
        hasAllInvoiceAccess(loggedInRep)
            ? '/management'
            : '/history';

    return (
        <BrowserRouter>
            <Routes>
                <Route
                    path="/"
                    element={
                        loggedInRep ? (
                            <Navigate
                                to={loggedInHome}
                                replace
                            />
                        ) : (
                            <LoginPage />
                        )
                    }
                />

                <Route
                    path="/management"
                    element={
                        <AllInvoiceAccessRoute>
                            <ManagementPage />
                        </AllInvoiceAccessRoute>
                    }
                />

                <Route
                    path="/history"
                    element={
                        <ProtectedRoute>
                            <HistoryPage />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/invoice/new"
                    element={
                        <ProtectedRoute>
                            <CreateInvoicePage />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/invoice/preview"
                    element={
                        <ProtectedRoute>
                            <InvoicePreviewPage />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/home"
                    element={
                        <ProtectedRoute>
                            <HomePage />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/invoice"
                    element={
                        <Navigate
                            to="/invoice/new"
                            replace
                        />
                    }
                />

                <Route
                    path="*"
                    element={<Navigate to="/" replace />}
                />
            </Routes>
        </BrowserRouter>
    );
};

export default AppRoutes;