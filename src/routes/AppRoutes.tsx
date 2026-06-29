import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useInvoiceStore } from 'store/invoiceStore';
import LoginPage from 'pages/LoginPage';
import HomePage from 'pages/HomePage';
import HistoryPage from 'pages/HistoryPage';
import CreateInvoicePage from 'pages/CreateInvoicePage';
import InvoicePreviewPage from 'pages/InvoicePreviewPage';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const loggedInRep = useInvoiceStore((s: any) => s.loggedInRep);
    if (!loggedInRep) return <Navigate to="/" replace />;
    return <>{children}</>;
};

export const AppRoutes: React.FC = () => {
    const loggedInRep = useInvoiceStore((s: any) => s.loggedInRep);

    return (
        <BrowserRouter>
            <Routes>
                {/* Login — redirects to history if already authenticated */}
                <Route
                    path="/"
                    element={loggedInRep ? <Navigate to="/history" replace /> : <LoginPage />}
                />

                {/* History dashboard */}
                <Route
                    path="/history"
                    element={<ProtectedRoute><HistoryPage /></ProtectedRoute>}
                />

                {/* Create / edit invoice */}
                <Route
                    path="/invoice/new"
                    element={<ProtectedRoute><CreateInvoicePage /></ProtectedRoute>}
                />

                {/* Invoice preview */}
                <Route
                    path="/invoice/preview"
                    element={<ProtectedRoute><InvoicePreviewPage /></ProtectedRoute>}
                />

                {/* Legacy home route kept for backwards compat */}
                <Route
                    path="/home"
                    element={<ProtectedRoute><HomePage /></ProtectedRoute>}
                />

                <Route path="/invoice" element={<Navigate to="/invoice/new" replace />} />

                {/* Catch-all */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
};

export default AppRoutes;
