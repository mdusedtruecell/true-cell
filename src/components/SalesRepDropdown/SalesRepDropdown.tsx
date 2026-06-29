import React, { useEffect, useRef, useState } from 'react';
import { fetchSalesReps, SalesRep } from 'api/salesRepApi';
import { useInvoiceStore } from 'store/invoiceStore';

interface Props {
    value?: string | null;
    onChange?: (name: string | null) => void;
}

export const SalesRepDropdown: React.FC<Props> = ({ value, onChange }) => {
    const [reps, setReps] = useState<SalesRep[]>([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const setRepresentative = useInvoiceStore((s: any) => s.setRepresentative);
    const selectedRepresentative = useInvoiceStore((s: any) => s.selectedRepresentative);

    useEffect(() => {
        setLoading(true);
        fetchSalesReps()
            .then((r: SalesRep[]) => setReps(r))
            .finally(() => setLoading(false));
    }, []);

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleSelect = (name: string | null) => {
        setRepresentative(name);
        onChange?.(name);
        setOpen(false);
    };

    // If the parent provides a `value` prop use it, otherwise fall back to the global store value.
    const displayValue = (value !== undefined ? value : selectedRepresentative) || null;

    return (
        <div
            className="salesrep-dropdown"
            ref={containerRef}
            style={{ position: 'relative' }}
        >
            {/* Trigger button */}
            <button
                type="button"
                className="rep-trigger"
                onClick={() => !loading && setOpen((o) => !o)}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label="Select Sales Representative"
                disabled={loading}
            >
                <span style={{ color: displayValue ? 'var(--text)' : 'var(--muted)' }}>
                    {loading ? 'Loading…' : (displayValue ?? 'Choose Sales Representative')}
                </span>
                <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--muted)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    style={{
                        transition: 'transform 0.2s',
                        transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                        flexShrink: 0,
                    }}
                    aria-hidden="true"
                >
                    <path d="M6 9l6 6 6-6" />
                </svg>
            </button>

            {/* Dropdown panel */}
            {open && (
                <ul
                    className="rep-listbox"
                    role="listbox"
                    aria-label="Sales Representatives"
                >
                    <li
                        role="option"
                        aria-selected={!displayValue}
                        className={`rep-option rep-option--placeholder${!displayValue ? ' rep-option--selected' : ''}`}
                        onClick={() => handleSelect(null)}
                    >
                        Select representative
                    </li>
                    {reps.map((r) => (
                        <li
                            key={r.id}
                            role="option"
                            aria-selected={displayValue === r.name}
                            className={`rep-option${displayValue === r.name ? ' rep-option--selected' : ''}`}
                            onClick={() => handleSelect(r.name)}
                        >
                            {r.name}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default SalesRepDropdown;