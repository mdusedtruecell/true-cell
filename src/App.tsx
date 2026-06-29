import React from 'react';
import AppRoutes from 'routes/AppRoutes';
import './App.css';
import { ToastProvider } from 'components/Toast/Toast';

const App: React.FC = () => {
    return (
        <ToastProvider>
            <AppRoutes />
        </ToastProvider>
    );
};

export default App;
