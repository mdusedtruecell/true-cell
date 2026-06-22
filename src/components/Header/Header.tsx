import React from 'react';

interface Props {
    title?: string;
    left?: React.ReactNode;
    right?: React.ReactNode;
    bgPrimary?: boolean;
}

export const Header: React.FC<Props> = ({ title, left, right, bgPrimary = true }) => {
    return (
        <header className={"app-header" + (bgPrimary ? ' primary' : '')}>
            <div className="header-left">{left}</div>
            <div className="header-title">{title}</div>
            <div className="header-right">{right}</div>
        </header>
    );
};

export default Header;
