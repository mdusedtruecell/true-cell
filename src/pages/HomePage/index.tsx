import React from 'react';
import { useNavigate } from 'react-router-dom';
import SalesRepDropdown from 'components/SalesRepDropdown/SalesRepDropdown';
import logoImg from '../../assets/truecell_logo.png';
import invoiceIcon from '../../assets/create_invoice.png';
import iconShield from '../../assets/trusted_quality.png';
import iconRibbon from '../../assets/best_price.png';
import iconHeadset from '../../assets/reliable.png';
import { useInvoiceStore } from 'store/invoiceStore';

export const HomePage: React.FC = () => {
    const navigate = useNavigate();
    const rep = useInvoiceStore((s: any) => s.selectedRepresentative);

    return (
        <div className="page home-container">
            <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Logo - pinned to top */}
                <div className="logo-area">
                    <img src={logoImg} alt="Truecell Electronics Trading LLC" />
                </div>

                {/* Dropdown + Create Invoice card - centered in remaining space */}
                <div className="scroll-area home-scroll-area">
                    {/* Sales rep picker */}
                    <SalesRepDropdown />

                    {/* Create invoice card */}
                    <div className="home-card create-invoice-block">
                        <img src={invoiceIcon} alt="Create Invoice" />
                        <h3>Create Invoice</h3>
                        <p>Create Beautiful Invoice in Seconds &amp; Share Instantly</p>
                        <button
                            disabled={!rep}
                            onClick={() => navigate('/invoice/new')}
                        >
                            Create New Invoice
                        </button>
                    </div>
                </div>

                {/* Footer nav */}
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

export default HomePage;