import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { validateLogin } from 'api/salesRepApi';
import { useInvoiceStore } from 'store/invoiceStore';
import logoImg from '../../assets/truecell_logo.png';
import invoiceIcon from '../../assets/create_invoice.png';
import iconShield from '../../assets/trusted_quality.png';
import iconRibbon from '../../assets/best_price.png';
import iconHeadset from '../../assets/reliable.png';

export const LoginPage: React.FC = () => {
    const navigate = useNavigate();
    const setLoggedInRep = useInvoiceStore((s: any) => s.setLoggedInRep);

    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [error, setError] = useState('');

    const handleLogin = () => {
        if (!name.trim() || !code.trim()) {
            setError('Please enter your name and code');
            return;
        }
        const rep = validateLogin(name, code);
        if (!rep) {
            setError('Invalid Secret Code');
            return;
        }
        setLoggedInRep(rep);
        navigate('/history', { replace: true });
    };

    return (
        <div className="page login-page">
            <main className="login-main">
                <div className="login-content">
                    <div className="login-logo-area">
                        <img src={logoImg} alt="Truecell Electronics Trading LLC" className="login-logo" />
                    </div>

                    <div className="home-card create-invoice-block w-100 my-20">
                        <img src={invoiceIcon} alt="Create Invoice" />
                        <h3>Create Invoice</h3>
                        <p>Create Beautiful Invoice in Seconds &amp; Share Instantly</p>
                    </div>

                    <div className="login-form">
                        <div className="login-input-group">
                            <span className="login-input-icon" aria-hidden="true">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                    <circle cx="12" cy="7" r="4" />
                                </svg>
                            </span>
                            <input
                                type="text"
                                placeholder="Enter Your Name..."
                                value={name}
                                onChange={e => { setName(e.target.value); setError(''); }}
                                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                                autoComplete="off"
                            />
                        </div>

                        <div className="login-input-group">
                            <span className="login-input-icon" aria-hidden="true">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                </svg>
                            </span>
                            <input
                                type="password"
                                placeholder="Enter Your Code..."
                                value={code}
                                onChange={e => { setCode(e.target.value); setError(''); }}
                                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                                autoComplete="off"
                            />
                        </div>

                        {error && <div className="login-error" role="alert">{error}</div>}

                        <button className="login-btn" onClick={handleLogin}>
                            Login
                        </button>
                    </div>
                </div>

                <div className="footer-nav" role="navigation" aria-label="bottom navigation">
                    <div className="nav-item">
                        <img src={iconShield} alt="" aria-hidden="true" />
                        <span>Trusted Quality</span>
                    </div>
                    <div className="nav-item">
                        <img src={iconRibbon} alt="" aria-hidden="true" />
                        <span>Best Prices</span>
                    </div>
                    <div className="nav-item">
                        <img src={iconHeadset} alt="" aria-hidden="true" />
                        <span>Reliable Service</span>
                    </div>
                </div>
                <div className="powered-text">Powered by Truecell Electronics Trading LLC</div>
            </main>
        </div>
    );
};

export default LoginPage;
