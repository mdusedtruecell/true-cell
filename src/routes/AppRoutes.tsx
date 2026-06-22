import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import HomePage from 'pages/HomePage';
import CreateInvoicePage from 'pages/CreateInvoicePage';
import InvoicePreviewPage from 'pages/InvoicePreviewPage';

export const AppRoutes: React.FC = () => {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/invoice/new" element={<CreateInvoicePage />} />
                <Route path="/invoice/preview" element={<InvoicePreviewPage />} />
                <Route path="/invoice" element={<Navigate to="/invoice/new" replace />} />
            </Routes>
        </BrowserRouter>
    );
};

export default AppRoutes;
