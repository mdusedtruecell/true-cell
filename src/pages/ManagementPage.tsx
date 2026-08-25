import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SALES_REPS } from 'api/salesRepApi';
import { useInvoiceStore } from 'store/invoiceStore';
import invoiceIcon from 'assets/create_invoice.png';
import {
    buildHistoryUrl,
    cleanText,
    fetchSheetHistory,
    groupSheetRowsToInvoices,
    GOOGLE_SHEET_WEB_APP_URL,
    type SheetInvoice,
    type SheetRow,
} from 'utils/googleSheet';

const ACCENT = '#b30b63';
const ACCENT_DARK = '#79003f';
const PAGE_BG = '#f5f5f7';
const TEXT = '#2b2b2b';
const MUTED = '#777777';
const MAX_WIDTH = 420;

type InvoiceFilter = 'all' | 'invoiced' | 'pending';

type ManagedInvoice = SheetInvoice & {
    invoiceState: 'invoiced' | 'pending';
    invoicedNumber?: string;
};

type ManagedSheetRow = SheetRow & {
    invoiced?: string;
};

const HistoryIcon = () => (
    <svg
        width="42"
        height="42"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 3v6h6" />
        <path d="M12 7v5l3 2" />
    </svg>
);

const BackIcon = () => (
    <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <path d="M19 12H5" />
        <path d="m12 19-7-7 7-7" />
    </svg>
);

const ChevronIcon = () => (
    <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <path d="m9 18 6-6-6-6" />
    </svg>
);

const normalizeInvoicedState = (
    value: unknown
): 'invoiced' | 'pending' =>
    cleanText(value) ? 'invoiced' : 'pending';

const formatCompactAmount = (value: number): string => {
    const amount = Number(value) || 0;
    const absolute = Math.abs(amount);

    if (absolute >= 1000000) {
        const compact = amount / 1000000;
        return `${compact.toFixed(compact >= 10 ? 1 : 2).replace(/\.0+$|(?<=\.[0-9])0$/, '')}M`;
    }

    if (absolute >= 1000) {
        const compact = amount / 1000;
        return `${compact.toFixed(compact >= 100 ? 0 : compact >= 10 ? 1 : 2).replace(/\.0+$|(?<=\.[0-9])0$/, '')}k`;
    }

    return amount.toLocaleString(undefined, {
        maximumFractionDigits: 2,
    });
};


const buildManagedInvoices = (
    rows: ManagedSheetRow[]
): ManagedInvoice[] => {
    const invoicedNumberByInvoice = new Map<string, string>();
    const orderStatusByInvoice = new Map<string, string>();

    rows.forEach((row) => {
        const key = cleanText(row.orderId || row.invoiceNo);
        if (!key) return;

        const invoicedNumber = cleanText(row.invoiced);
        if (invoicedNumber) {
            invoicedNumberByInvoice.set(key, invoicedNumber);
        }

        const orderStatus = cleanText(row.orderStatus);
        if (orderStatus) {
            orderStatusByInvoice.set(key, orderStatus);
        }
    });

    /*
     * IMPORTANT:
     * The shared groupSheetRowsToInvoices() helper intentionally removes
     * Order Status = Cancel for normal salesperson history.
     *
     * Admin/Accounts history must show EVERY invoice physically present
     * in Google Sheet, so only for this page we temporarily neutralize
     * orderStatus while grouping, then restore the real status afterwards.
     *
     * This keeps normal salesperson behavior completely unchanged.
     */
    const rowsForAdminGrouping = rows.map((row) => ({
        ...row,
        orderStatus: 'Confirm',
    }));

    return groupSheetRowsToInvoices(rowsForAdminGrouping)
        .map((invoice) => {
            const key = cleanText(
                invoice.orderId || invoice.invoiceNumber
            );

            const invoicedNumber =
                invoicedNumberByInvoice.get(key) || '';

            const realOrderStatus =
                orderStatusByInvoice.get(key) ||
                invoice.orderStatus;

            return {
                ...invoice,
                orderStatus: realOrderStatus,
                invoicedNumber,
                invoiceState: normalizeInvoicedState(invoicedNumber),
            } as ManagedInvoice;
        });
};

const MASTER_CACHE_KEY = 'truecell-management-all-history:v5';
const PENDING_INVOICED_SYNC_KEY = 'truecell-management-pending-invoiced:v2';
const OLD_PENDING_INVOICED_SYNC_KEY = 'truecell-management-pending-invoiced:v1';
const SALESPERSON_SYNC_MS = 6000;
const PENDING_RETRY_MS = 10000;
const PENDING_SERVER_GRACE_MS = 5000;
const PREVIEW_RETURN_STATE_KEY =
    'truecell-management-preview-return:v1';

type MasterCache = {
    savedAt: number;
    rows: ManagedSheetRow[];
};

type ManagementRestoreState = {
    selectedSalesPerson: string;
    invoiceFilter: InvoiceFilter;
};

type PendingInvoicedWrite = {
    key: string;
    orderId: string;
    invoiceNumber: string;
    invoicedNumber: string;
    createdAt: number;
    lastAttemptAt: number;
};

const consumePreviewReturnState =
    (): ManagementRestoreState | null => {
        try {
            const raw = sessionStorage.getItem(
                PREVIEW_RETURN_STATE_KEY
            );

            if (!raw) return null;

            sessionStorage.removeItem(
                PREVIEW_RETURN_STATE_KEY
            );

            const parsed = JSON.parse(raw);

            const selectedSalesPerson = cleanText(
                parsed?.selectedSalesPerson
            );

            const invoiceFilter: InvoiceFilter =
                parsed?.invoiceFilter === 'invoiced' ||
                parsed?.invoiceFilter === 'pending'
                    ? parsed.invoiceFilter
                    : 'all';

            if (!selectedSalesPerson) {
                return null;
            }

            return {
                selectedSalesPerson,
                invoiceFilter,
            };
        } catch {
            try {
                sessionStorage.removeItem(
                    PREVIEW_RETURN_STATE_KEY
                );
            } catch {
                // Ignore storage cleanup failures.
            }

            return null;
        }
    };

const getRowInvoiceKey = (row: ManagedSheetRow): string =>
    cleanText(row.orderId || row.invoiceNo);

const fetchRowsDirectFromAppsScript = (
    extra?: Record<string, string>
): Promise<ManagedSheetRow[]> => {
    return new Promise((resolve, reject) => {
        const callbackName =
            `__truecellManagementHistory_${Date.now()}_${Math.random()
                .toString(36)
                .slice(2)}`;

        const params = new URLSearchParams();

        Object.entries(extra || {}).forEach(([key, value]) => {
            if (value) {
                params.set(key, value);
            }
        });

        params.set('callback', callbackName);
        params.set('_', String(Date.now()));

        let finished = false;
        const script = document.createElement('script');

        const cleanup = () => {
            if (finished) return;
            finished = true;

            window.clearTimeout(timeoutId);

            try {
                delete (window as any)[callbackName];
            } catch {
                (window as any)[callbackName] = undefined;
            }

            if (script.parentNode) {
                script.parentNode.removeChild(script);
            }
        };

        const timeoutId = window.setTimeout(() => {
            cleanup();
            reject(new Error('Apps Script history request timed out'));
        }, 10000);

        (window as any)[callbackName] = (json: any) => {
            cleanup();

            if (
                !json?.success ||
                !Array.isArray(json.data)
            ) {
                reject(
                    new Error(
                        json?.message ||
                            'Invalid Apps Script history response'
                    )
                );
                return;
            }

            resolve(json.data as ManagedSheetRow[]);
        };

        script.onerror = () => {
            cleanup();
            reject(
                new Error(
                    'Could not connect directly to Apps Script'
                )
            );
        };

        script.async = true;
        script.src =
            `${GOOGLE_SHEET_WEB_APP_URL}?${params.toString()}`;

        document.body.appendChild(script);
    });
};

const readPendingInvoicedWrites = (): PendingInvoicedWrite[] => {
    try {
        const raw = localStorage.getItem(PENDING_INVOICED_SYNC_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const writePendingInvoicedWrites = (
    writes: PendingInvoicedWrite[]
) => {
    try {
        if (writes.length === 0) {
            localStorage.removeItem(PENDING_INVOICED_SYNC_KEY);
            return;
        }
        localStorage.setItem(
            PENDING_INVOICED_SYNC_KEY,
            JSON.stringify(writes)
        );
    } catch {
        // Pending sync persistence is best effort only.
    }
};

const persistMasterRows = (rows: ManagedSheetRow[]) => {
    try {
        const payload: MasterCache = {
            savedAt: Date.now(),
            rows,
        };
        localStorage.setItem(
            MASTER_CACHE_KEY,
            JSON.stringify(payload)
        );
    } catch {
        // Browser cache is optional.
    }
};

const applyPendingOverlay = (
    serverRows: ManagedSheetRow[]
): ManagedSheetRow[] => {
    const pending = readPendingInvoicedWrites();
    if (pending.length === 0) return serverRows;

    let mergedRows = [...serverRows];
    const stillPending: PendingInvoicedWrite[] = [];

    pending.forEach((write) => {
        const matching = mergedRows.filter((row) => {
            const rowKey = getRowInvoiceKey(row);
            return (
                rowKey === write.key ||
                cleanText(row.invoiceNo) === write.invoiceNumber
            );
        });

        const confirmed =
            matching.length > 0 &&
            matching.every(
                (row) =>
                    cleanText(row.invoiced) === write.invoicedNumber
            );

        if (confirmed) {
            return;
        }

        const serverInvoicedNumber =
            matching
                .map((row) => cleanText(row.invoiced))
                .find(Boolean) || '';

        const pendingAge =
            Date.now() - Number(write.createdAt || 0);

        /*
         * A fresh non-empty value already present in Google Sheet is
         * authoritative after a very short optimistic grace period.
         * Retry attempts do NOT reset this timer.
         */
        if (
            serverInvoicedNumber &&
            serverInvoicedNumber !== write.invoicedNumber &&
            pendingAge >= PENDING_SERVER_GRACE_MS
        ) {
            return;
        }

        stillPending.push(write);
        mergedRows = mergedRows.map((row) => {
            const rowKey = getRowInvoiceKey(row);
            const isMatch =
                rowKey === write.key ||
                cleanText(row.invoiceNo) === write.invoiceNumber;

            return isMatch
                ? {
                      ...row,
                      invoiced: write.invoicedNumber,
                  }
                : row;
        });
    });

    writePendingInvoicedWrites(stillPending);
    return mergedRows;
};

const queueInvoicedWrite = (write: PendingInvoicedWrite) => {
    const current = readPendingInvoicedWrites().filter(
        (item) => item.key !== write.key
    );
    current.push(write);
    writePendingInvoicedWrites(current);
};

const flushPendingInvoicedWrites = async () => {
    const current = readPendingInvoicedWrites();
    if (current.length === 0) return;

    const now = Date.now();
    const next = [...current];

    await Promise.all(
        current.map(async (write, index) => {
            if (
                write.lastAttemptAt &&
                now - write.lastAttemptAt < PENDING_RETRY_MS
            ) {
                return;
            }

            next[index] = {
                ...write,
                lastAttemptAt: now,
            };

            try {
                await fetch(GOOGLE_SHEET_WEB_APP_URL, {
                    method: 'POST',
                    mode: 'no-cors',
                    cache: 'no-store',
                    headers: {
                        'Content-Type': 'text/plain;charset=utf-8',
                    },
                    body: JSON.stringify({
                        action: 'setInvoicedNumber',
                        orderId:
                            write.orderId || write.invoiceNumber,
                        invoiceNo: write.invoiceNumber,
                        invoiceNumber: write.invoiceNumber,
                        invoicedNumber: write.invoicedNumber,
                    }),
                });
            } catch (error) {
                console.warn(
                    'Background invoice-number sync will retry:',
                    error
                );
            }
        })
    );

    // Keep the write queued until a later GET confirms it actually exists
    // in the sheet. This also protects the optimistic UI from stale reads.
    writePendingInvoicedWrites(next);
};


export const ManagementPage: React.FC = () => {
    const navigate = useNavigate();
    const saveInvoice = useInvoiceStore((s: any) => s.saveInvoice);

    const [previewReturnState] =
        useState<ManagementRestoreState | null>(
            () => consumePreviewReturnState()
        );

    const [view, setView] = useState<'menu' | 'history'>(
        previewReturnState ? 'history' : 'menu'
    );
    const [selectedSalesPerson, setSelectedSalesPerson] =
        useState(
            previewReturnState?.selectedSalesPerson || ''
        );
    const [masterRows, setMasterRows] = useState<ManagedSheetRow[]>([]);
    const [hasMasterSnapshot, setHasMasterSnapshot] = useState(false);
    const [initialSyncFinished, setInitialSyncFinished] = useState(false);
    const [allInvoices, setAllInvoices] = useState<ManagedInvoice[]>([]);
    const [invoiceFilter, setInvoiceFilter] =
        useState<InvoiceFilter>(
            previewReturnState?.invoiceFilter || 'all'
        );
    const [filterOpen, setFilterOpen] = useState(false);
    const filterRef = useRef<HTMLDivElement | null>(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [invoiceNumberInputs, setInvoiceNumberInputs] = useState<Record<string, string>>({});
    const [savingInvoiceKey] = useState('');
    const [saveError, setSaveError] = useState<Record<string, string>>({});
    const personSyncInFlightRef = useRef(false);

    /*
     * Browser cache is only for instant first paint.
     * We do NOT download the whole Sheet in the background anymore.
     * The selected salesperson is refreshed separately below.
     */
    useEffect(() => {
        try {
            const raw = localStorage.getItem(MASTER_CACHE_KEY);

            if (raw) {
                const parsed = JSON.parse(raw) as MasterCache;

                if (Array.isArray(parsed?.rows)) {
                    setMasterRows(parsed.rows);
                    setHasMasterSnapshot(true);
                }
            }
        } catch {
            // Ignore damaged cache. It will rebuild from salesperson sync.
        }

        try {
            localStorage.removeItem(
                OLD_PENDING_INVOICED_SYNC_KEY
            );
        } catch {
            // Ignore old-cache cleanup failures.
        }

        /*
         * Only queued Invoice Number writes are retried here.
         * If the queue is empty, this timer sends ZERO requests.
         */
        const pendingSyncTimer = window.setInterval(() => {
            void flushPendingInvoicedWrites();
        }, PENDING_RETRY_MS);

        void flushPendingInvoicedWrites();

        return () => {
            window.clearInterval(pendingSyncTimer);
        };
    }, []);

    /*
     * Selected salesperson sync — same fast idea as the normal History page:
     * 1) show cached rows immediately;
     * 2) fetch ONLY this salesperson from Apps Script;
     * 3) successful response replaces this salesperson's cached rows exactly;
     * 4) repeat every 6 seconds only while this page is visible.
     *
     * The repeating request goes DIRECTLY to Apps Script, so it does not use
     * a Vercel function. Vercel is used only once as fallback if the immediate
     * direct request fails.
     */
    useEffect(() => {
        if (!selectedSalesPerson) {
            setAllInvoices([]);
            setLoading(false);
            setError('');
            return;
        }

        let active = true;
        let firstRequest = true;

        const target = cleanText(
            selectedSalesPerson
        ).toLowerCase();

        const cachedPersonRows = masterRows.filter(
            (row) =>
                cleanText(row.salesPerson).toLowerCase() === target
        );

        if (cachedPersonRows.length > 0) {
            setAllInvoices(
                buildManagedInvoices(cachedPersonRows)
            );
            setLoading(false);
            setError('');
        } else {
            setAllInvoices([]);
            setLoading(true);
            setError('');
        }

        setInitialSyncFinished(false);

        const replaceSalesPersonSnapshot = (
            serverRows: ManagedSheetRow[]
        ) => {
            if (!active) return;

            /*
             * Sheet is final truth for row existence.
             * Pending overlay may temporarily protect only an Invoice Number
             * that was just saved from this UI; it never resurrects deleted rows.
             */
            const freshPersonRows =
                applyPendingOverlay(serverRows);

            setMasterRows((current) => {
                const otherSalesPeople = current.filter(
                    (row) =>
                        cleanText(row.salesPerson).toLowerCase() !== target
                );

                const nextRows = [
                    ...otherSalesPeople,
                    ...freshPersonRows,
                ];

                persistMasterRows(nextRows);
                return nextRows;
            });

            setAllInvoices(
                buildManagedInvoices(freshPersonRows)
            );
            setHasMasterSnapshot(true);
            setInitialSyncFinished(true);
            setLoading(false);
            setError('');
        };

        const syncSelectedSalesPerson = async (
            allowVercelFallback: boolean
        ) => {
            if (personSyncInFlightRef.current) {
                return;
            }

            personSyncInFlightRef.current = true;

            try {
                let rows: ManagedSheetRow[];

                try {
                    rows = await fetchRowsDirectFromAppsScript({
                        salesPerson: selectedSalesPerson,
                        includeCanceled: 'true',
                    });
                } catch (directError) {
                    if (!allowVercelFallback) {
                        throw directError;
                    }

                    const response = await fetchSheetHistory(
                        buildHistoryUrl(
                            selectedSalesPerson,
                            {
                                includeCanceled: 'true',
                            }
                        )
                    );

                    if (
                        !response?.success ||
                        !Array.isArray(response.data)
                    ) {
                        throw new Error(
                            response?.message ||
                                'Could not load invoice history'
                        );
                    }

                    rows =
                        response.data as ManagedSheetRow[];
                }

                replaceSalesPersonSnapshot(rows);
            } catch (syncError) {
                console.warn(
                    'Salesperson invoice sync failed:',
                    syncError
                );

                if (
                    active &&
                    firstRequest &&
                    cachedPersonRows.length === 0
                ) {
                    setLoading(false);
                    setInitialSyncFinished(true);
                    setError(
                        'Could not load invoice history. Retrying automatically...'
                    );
                }
            } finally {
                firstRequest = false;
                personSyncInFlightRef.current = false;
            }
        };

        // Immediate refresh when salesperson is opened.
        void syncSelectedSalesPerson(true);

        // Then direct Apps Script refresh every 6 sec while user is on this page.
        const timer = window.setInterval(() => {
            if (
                document.visibilityState === 'visible'
            ) {
                void syncSelectedSalesPerson(false);
            }
        }, SALESPERSON_SYNC_MS);

        // Also refresh immediately when browser returns to this tab.
        const handleVisibility = () => {
            if (
                document.visibilityState === 'visible'
            ) {
                void syncSelectedSalesPerson(false);
            }
        };

        document.addEventListener(
            'visibilitychange',
            handleVisibility
        );

        return () => {
            active = false;
            window.clearInterval(timer);
            document.removeEventListener(
                'visibilitychange',
                handleVisibility
            );
            personSyncInFlightRef.current = false;
        };
    }, [selectedSalesPerson]);

    useEffect(() => {
        if (!filterOpen) return;

        const handleOutsideClick = (event: PointerEvent) => {
            const target = event.target as Node | null;

            if (
                target &&
                filterRef.current &&
                !filterRef.current.contains(target)
            ) {
                setFilterOpen(false);
            }
        };

        document.addEventListener(
            'pointerdown',
            handleOutsideClick
        );

        return () => {
            document.removeEventListener(
                'pointerdown',
                handleOutsideClick
            );
        };
    }, [filterOpen]);

    const selectedInvoices = useMemo(() => {
        if (!selectedSalesPerson) {
            return [];
        }

        const target =
            cleanText(
                selectedSalesPerson
            ).toLowerCase();

        return allInvoices.filter((invoice) => {
            const sameSalesPerson =
                cleanText(
                    invoice.salesRepresentative
                ).toLowerCase() === target;

            const isShipped =
                cleanText(
                    invoice.customerShipStatus
                ).toLowerCase() === 'shipped';

            return sameSalesPerson && isShipped;
        });
    }, [allInvoices, selectedSalesPerson]);

    const filteredInvoices = useMemo(() => {
        if (invoiceFilter === 'all') {
            return selectedInvoices;
        }

        return selectedInvoices.filter(
            (invoice) =>
                invoice.invoiceState === invoiceFilter
        );
    }, [invoiceFilter, selectedInvoices]);

    const totals = useMemo(() => {
        return filteredInvoices.reduce(
            (result, invoice) => {
                result.amount +=
                    Number(invoice.total) || 0;

                result.qty +=
                    (invoice.items || []).reduce(
                        (sum, item) =>
                            sum +
                            (Number(item.qty) || 0),
                        0
                    );

                return result;
            },
            {
                amount: 0,
                qty: 0,
            }
        );
    }, [filteredInvoices]);

    const handlePreviewInvoice = (invoice: ManagedInvoice) => {
        try {
            sessionStorage.setItem(
                PREVIEW_RETURN_STATE_KEY,
                JSON.stringify({
                    selectedSalesPerson,
                    invoiceFilter,
                })
            );
        } catch {
            // Navigation still works even if sessionStorage is unavailable.
        }

        saveInvoice(invoice as any);
        navigate('/invoice/preview');
    };

    const handleSaveInvoicedNumber = (invoice: ManagedInvoice) => {
        const key = cleanText(
            invoice.orderId || invoice.invoiceNumber
        );

        const invoicedNumber = cleanText(
            invoiceNumberInputs[key]
        );

        if (!key || !invoicedNumber) {
            return;
        }

        setSaveError((current) => ({
            ...current,
            [key]: '',
        }));

        const nowIso = new Date().toISOString();
        const revision = String(Date.now());

        // OPTIMISTIC UI: the user sees INVOICED immediately.
        setAllInvoices((current) =>
            current.map((item) => {
                const itemKey = cleanText(
                    item.orderId || item.invoiceNumber
                );

                if (itemKey !== key) return item;

                return {
                    ...item,
                    invoicedNumber,
                    invoiceState: 'invoiced',
                    updatedAt: nowIso,
                    revision,
                };
            })
        );

        setMasterRows((current) => {
            const updated = current.map((row) => {
                const rowKey = getRowInvoiceKey(row);
                const isMatch =
                    rowKey === key ||
                    cleanText(row.invoiceNo) ===
                        cleanText(invoice.invoiceNumber);

                if (!isMatch) return row;

                return {
                    ...row,
                    invoiced: invoicedNumber,
                    updatedAt: nowIso,
                    revision,
                };
            });

            persistMasterRows(updated);
            return updated;
        });

        setInvoiceNumberInputs((current) => ({
            ...current,
            [key]: '',
        }));

        // Queue the real sheet write. The UI never waits for Google Sheets.
        queueInvoicedWrite({
            key,
            orderId: cleanText(
                invoice.orderId || invoice.invoiceNumber
            ),
            invoiceNumber: cleanText(invoice.invoiceNumber),
            invoicedNumber,
            createdAt: Date.now(),
            lastAttemptAt: 0,
        });

        void flushPendingInvoicedWrites();

        // Quietly verify only this invoice after Save.
        // This is a direct Apps Script GET, not a Vercel API call.
        window.setTimeout(() => {
            void (async () => {
                try {
                    const targetRows =
                        await fetchRowsDirectFromAppsScript({
                            orderId: cleanText(
                                invoice.orderId ||
                                    invoice.invoiceNumber
                            ),
                        });

                    if (targetRows.length === 0) {
                        return;
                    }

                    setMasterRows((current) => {
                        const targetKey = key;
                        const untouched = current.filter(
                            (row) => {
                                const rowKey =
                                    getRowInvoiceKey(row);

                                return !(
                                    rowKey === targetKey ||
                                    cleanText(row.invoiceNo) ===
                                        cleanText(
                                            invoice.invoiceNumber
                                        )
                                );
                            }
                        );

                        const merged =
                            applyPendingOverlay([
                                ...untouched,
                                ...targetRows,
                            ]);

                        persistMasterRows(merged);
                        return merged;
                    });
                } catch {
                    // Background verification is best effort.
                }
            })();
        }, 3000);
    };

    const pageStyle: React.CSSProperties = {
        width: '100%',
        maxWidth: MAX_WIDTH,
        minHeight: '100vh',
        margin: '0 auto',
        background: PAGE_BG,
        color: TEXT,
        boxSizing: 'border-box',
    };

    /* =========================================================
       ACCOUNTS DASHBOARD
    ========================================================= */

    if (view === 'menu') {
        return (
            <div
                style={{
                    ...pageStyle,
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                <header
                    style={{
                        background: `linear-gradient(135deg, ${ACCENT_DARK}, ${ACCENT})`,
                        color: '#fff',
                        padding: '26px 20px 27px',
                        borderBottomLeftRadius: 22,
                        borderBottomRightRadius: 22,
                        textAlign: 'center',
                        boxShadow:
                            '0 7px 20px rgba(121, 0, 63, 0.12)',
                    }}
                >
                    <div
                        style={{
                            fontSize: 22,
                            fontWeight: 700,
                            lineHeight: 1.25,
                        }}
                    >
                        Accounts Dashboard
                    </div>

                    <div
                        style={{
                            fontSize: 13,
                            fontWeight: 400,
                            marginTop: 6,
                            opacity: 0.92,
                            lineHeight: 1.35,
                        }}
                    >
                        Create invoices or review invoiced history
                    </div>
                </header>

                <main
                    style={{
                        flex: 1,
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: 18,
                        padding: '25px 24px 65px',
                        boxSizing: 'border-box',
                    }}
                >
                    {/* CREATE INVOICE */}

                    <button
                        type="button"
                        onClick={() =>
                            navigate('/history')
                        }
                        style={{
                            width: '100%',
                            maxWidth: 350,
                            minHeight: 122,
                            border:
                                '1px solid #f0dce7',
                            borderRadius: 20,
                            background: '#fff',
                            padding: '18px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 16,
                            textAlign: 'left',
                            cursor: 'pointer',
                            boxShadow:
                                '0 7px 20px rgba(0,0,0,0.055)',
                            boxSizing: 'border-box',
                        }}
                    >
                        <div
                            style={{
                                width: 64,
                                height: 64,
                                minWidth: 64,
                                borderRadius: 18,
                                background: '#fff0f7',
                                color: ACCENT,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <img
                                src={invoiceIcon}
                                alt=""
                                style={{
                                    width: 43,
                                    height: 43,
                                    objectFit: 'contain',
                                }}
                            />
                        </div>

                        <div
                            style={{
                                flex: 1,
                                minWidth: 0,
                            }}
                        >
                            <div
                                style={{
                                    color: ACCENT,
                                    fontSize: 18,
                                    fontWeight: 700,
                                    lineHeight: 1.25,
                                }}
                            >
                                Create Invoice
                            </div>

                            <div
                                style={{
                                    color: MUTED,
                                    fontSize: 13,
                                    fontWeight: 400,
                                    lineHeight: 1.35,
                                    marginTop: 5,
                                }}
                            >
                                Create a New Customer Invoice
                            </div>
                        </div>

                        <div
                            style={{
                                color: ACCENT,
                                display: 'flex',
                                alignItems: 'center',
                            }}
                        >
                            <ChevronIcon />
                        </div>
                    </button>

                    {/* ALL INVOICE HISTORY */}

                    <button
                        type="button"
                        onClick={() =>
                            setView('history')
                        }
                        style={{
                            width: '100%',
                            maxWidth: 350,
                            minHeight: 122,
                            border:
                                '1px solid #f0dce7',
                            borderRadius: 20,
                            background: '#fff',
                            padding: '18px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 16,
                            textAlign: 'left',
                            cursor: 'pointer',
                            boxShadow:
                                '0 7px 20px rgba(0,0,0,0.055)',
                            boxSizing: 'border-box',
                        }}
                    >
                        <div
                            style={{
                                width: 64,
                                height: 64,
                                minWidth: 64,
                                borderRadius: 18,
                                background: '#fff0f7',
                                color: ACCENT,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <HistoryIcon />
                        </div>

                        <div
                            style={{
                                flex: 1,
                                minWidth: 0,
                            }}
                        >
                            <div
                                style={{
                                    color: ACCENT,
                                    fontSize: 18,
                                    fontWeight: 700,
                                    lineHeight: 1.25,
                                }}
                            >
                                All Invoice History
                            </div>

                            <div
                                style={{
                                    color: MUTED,
                                    fontSize: 13,
                                    fontWeight: 400,
                                    lineHeight: 1.35,
                                    marginTop: 5,
                                }}
                            >
                                Review Invoices By Salesperson
                            </div>
                        </div>

                        <div
                            style={{
                                color: ACCENT,
                                display: 'flex',
                                alignItems: 'center',
                            }}
                        >
                            <ChevronIcon />
                        </div>
                    </button>
                </main>
            </div>
        );
    }

    /* =========================================================
       ALL INVOICE HISTORY
    ========================================================= */

    return (
        <div style={pageStyle}>
            {/* HEADER */}

            <header
                style={{
                    position: 'relative',
                    height: 92,
                    background: `linear-gradient(135deg, ${ACCENT_DARK}, ${ACCENT})`,
                    color: '#fff',
                    borderBottomLeftRadius: 22,
                    borderBottomRightRadius: 22,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    boxSizing: 'border-box',
                    boxShadow:
                        '0 7px 20px rgba(121,0,63,0.12)',
                }}
            >
                <button
                    type="button"
                    onClick={() => {
                        setAllInvoices([]);
                        setError('');
                        setView('menu');
                        setSelectedSalesPerson('');
                        setInvoiceFilter('all');
                        setFilterOpen(false);
                    }}
                    aria-label="Back"
                    style={{
                        position: 'absolute',
                        left: 18,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: 42,
                        height: 42,
                        borderRadius: 12,
                        border:
                            '1px solid rgba(255,255,255,0.35)',
                        background:
                            'rgba(255,255,255,0.10)',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                    }}
                >
                    <BackIcon />
                </button>

                <div
                    style={{
                        width: '100%',
                        padding: '0 72px',
                        boxSizing: 'border-box',
                    }}
                >
                    <div
                        style={{
                            fontSize: 20,
                            fontWeight: 700,
                            lineHeight: 1.2,
                        }}
                    >
                        All Invoice History
                    </div>

                    <div
                        style={{
                            fontSize: 12,
                            fontWeight: 400,
                            opacity: 0.9,
                            marginTop: 4,
                            lineHeight: 1.3,
                        }}
                    >
                        {selectedSalesPerson
                            ? selectedSalesPerson
                            : 'Choose a salesperson'}
                    </div>
                </div>
            </header>

            {/* =====================================================
                SALESPERSON SELECT SCREEN
            ====================================================== */}

            {!selectedSalesPerson && (
                <main
                    style={{
                        minHeight:
                            'calc(100vh - 92px)',
                        width: '100%',
                        padding: '24px 20px 55px',
                        boxSizing: 'border-box',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <div
                        style={{
                            width: '100%',
                            maxWidth: 370,
                            background: '#fff',
                            borderRadius: 20,
                            padding: '19px 16px 17px',
                            boxSizing: 'border-box',
                            boxShadow:
                                '0 7px 20px rgba(0,0,0,0.055)',
                        }}
                    >
                        <div
                            style={{
                                textAlign: 'center',
                                fontSize: 16,
                                fontWeight: 700,
                                color: '#3e3e3e',
                                marginBottom: 16,
                                lineHeight: 1.25,
                            }}
                        >
                            Select Sales Person
                        </div>

                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns:
                                    'repeat(2, minmax(0, 1fr))',
                                gap: 10,
                            }}
                        >
                            {SALES_REPS.map((rep) => (
                                <button
                                    key={rep.name}
                                    type="button"
                                    onClick={() => {
                                        setAllInvoices([]);
                                        setError('');
                                        setLoading(true);
                                        setSelectedSalesPerson(
                                            rep.name
                                        );
                                        setInvoiceFilter(
                                            'all'
                                        );
                                        setFilterOpen(false);
                                    }}
                                    style={{
                                        minHeight: 43,
                                        border:
                                            '1px solid #dfdfdf',
                                        borderRadius: 12,
                                        background: '#fff',
                                        color: '#3d3d3d',
                                        fontSize: 13,
                                        fontWeight: 600,
                                        padding: '8px 7px',
                                        cursor: 'pointer',
                                    }}
                                >
                                    {rep.name}
                                </button>
                            ))}
                        </div>
                    </div>
                </main>
            )}

            {/* =====================================================
                SELECTED SALESPERSON
            ====================================================== */}

            {selectedSalesPerson && (
                <main
                    style={{
                        width: '100%',
                        padding: '20px 18px 35px',
                        boxSizing: 'border-box',
                    }}
                >
                    <div
                        style={{
                            width: '100%',
                            maxWidth: 370,
                            margin: '0 auto',
                        }}
                    >
                        {/* SALESPERSON NAME */}

                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent:
                                    'space-between',
                                gap: 12,
                                marginBottom: 13,
                            }}
                        >
                            <div
                                style={{
                                    fontSize: 16,
                                    fontWeight: 700,
                                    color: TEXT,
                                }}
                            >
                                {selectedSalesPerson}
                            </div>

                            <button
                                type="button"
                                onClick={() => {
                                    setAllInvoices([]);
                                    setError('');
                                    setLoading(false);
                                    setSelectedSalesPerson(
                                        ''
                                    );
                                    setInvoiceFilter(
                                        'all'
                                    );
                                    setFilterOpen(false);
                                }}
                                style={{
                                    border:
                                        `1px solid ${ACCENT}`,
                                    borderRadius: 10,
                                    background: '#fff',
                                    color: ACCENT,
                                    padding: '7px 11px',
                                    fontSize: 12,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                }}
                            >
                                Change
                            </button>
                        </div>

                        {/* FILTER - custom dropdown so browser/mobile native menu never appears */}

                        <div
                            ref={filterRef}
                            style={{
                                position: 'relative',
                                width: '100%',
                                maxWidth: 330,
                                margin: '0 auto 14px',
                                zIndex: 20,
                            }}
                        >
                            <button
                                type="button"
                                onClick={() =>
                                    setFilterOpen(
                                        (current) => !current
                                    )
                                }
                                style={{
                                    position: 'relative',
                                    width: '100%',
                                    height: 50,
                                    borderRadius: 13,
                                    border: filterOpen
                                        ? `1px solid ${ACCENT}`
                                        : '1px solid #dddddd',
                                    background: '#fff',
                                    color: TEXT,
                                    padding: '0 44px',
                                    fontSize: 14,
                                    fontWeight: 600,
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                    outline: 'none',
                                    boxShadow: filterOpen
                                        ? '0 5px 16px rgba(179,11,99,0.10)'
                                        : '0 4px 13px rgba(0,0,0,0.035)',
                                    boxSizing: 'border-box',
                                }}
                            >
                                {invoiceFilter === 'all'
                                    ? 'All'
                                    : invoiceFilter === 'invoiced'
                                      ? 'Invoiced'
                                      : 'Pending'}

                                <span
                                    aria-hidden="true"
                                    style={{
                                        position: 'absolute',
                                        right: 16,
                                        top: '50%',
                                        transform: filterOpen
                                            ? 'translateY(-50%) rotate(180deg)'
                                            : 'translateY(-50%)',
                                        width: 0,
                                        height: 0,
                                        borderLeft: '5px solid transparent',
                                        borderRight: '5px solid transparent',
                                        borderTop: `6px solid ${ACCENT}`,
                                        transition: 'transform 0.15s ease',
                                    }}
                                />
                            </button>

                            {filterOpen && (
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: 57,
                                        left: 0,
                                        right: 0,
                                        padding: 6,
                                        borderRadius: 14,
                                        border: '1px solid #eadbe3',
                                        background: '#fff',
                                        boxShadow:
                                            '0 12px 28px rgba(0,0,0,0.12)',
                                        overflow: 'hidden',
                                    }}
                                >
                                    {(
                                        [
                                            ['all', 'All'],
                                            ['invoiced', 'Invoiced'],
                                            ['pending', 'Pending'],
                                        ] as const
                                    ).map(([value, label]) => {
                                        const active =
                                            invoiceFilter === value;

                                        return (
                                            <button
                                                key={value}
                                                type="button"
                                                onClick={() => {
                                                    setInvoiceFilter(
                                                        value
                                                    );
                                                    setFilterOpen(
                                                        false
                                                    );
                                                }}
                                                style={{
                                                    width: '100%',
                                                    minHeight: 42,
                                                    border: 'none',
                                                    borderRadius: 10,
                                                    background: active
                                                        ? '#fff0f7'
                                                        : '#fff',
                                                    color: active
                                                        ? ACCENT
                                                        : TEXT,
                                                    fontSize: 14,
                                                    fontWeight: active
                                                        ? 700
                                                        : 500,
                                                    textAlign: 'center',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                {label}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* LOADING */}

                        {loading && (
                            <div
                                style={{
                                    textAlign: 'center',
                                    color: MUTED,
                                    padding: '35px 10px',
                                    fontSize: 13,
                                }}
                            >
                                Loading invoice history...
                            </div>
                        )}

                        {/* ERROR */}

                        {!loading && error && (
                            <div
                                style={{
                                    background:
                                        '#fff2f2',
                                    border:
                                        '1px solid #ffd0d0',
                                    borderRadius: 14,
                                    padding: 14,
                                    color: '#b3261e',
                                    fontSize: 13,
                                    boxSizing:
                                        'border-box',
                                }}
                            >
                                {error}
                            </div>
                        )}

                        {/* DATA */}

                        {!loading && !error && (
                            <>
                                {/* TOTAL CARDS */}

                                <div
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns:
                                            'repeat(2, minmax(0, 1fr))',
                                        gap: 10,
                                    }}
                                >
                                    <div
                                        style={{
                                            background:
                                                ACCENT,
                                            borderRadius: 16,
                                            padding:
                                                '15px 10px',
                                            textAlign:
                                                'center',
                                            boxShadow:
                                                '0 5px 16px rgba(179,11,99,0.14)',
                                        }}
                                    >
                                        <div
                                            style={{
                                                color:
                                                    'rgba(255,255,255,0.86)',
                                                fontSize: 11,
                                                fontWeight: 500,
                                            }}
                                        >
                                            Total Amount
                                        </div>

                                        <div
                                            style={{
                                                color: '#fff',
                                                fontSize: 21,
                                                fontWeight: 700,
                                                marginTop: 5,
                                            }}
                                        >
                                            {formatCompactAmount(
                                                totals.amount
                                            )}
                                        </div>
                                    </div>

                                    <div
                                        style={{
                                            background:
                                                '#fff',
                                            borderRadius: 16,
                                            padding:
                                                '15px 10px',
                                            textAlign:
                                                'center',
                                            boxShadow:
                                                '0 5px 16px rgba(0,0,0,0.055)',
                                        }}
                                    >
                                        <div
                                            style={{
                                                color: MUTED,
                                                fontSize: 11,
                                                fontWeight: 500,
                                            }}
                                        >
                                            Total Quantity
                                        </div>

                                        <div
                                            style={{
                                                color: ACCENT,
                                                fontSize: 21,
                                                fontWeight: 700,
                                                marginTop: 5,
                                            }}
                                        >
                                            {totals.qty.toLocaleString()}
                                        </div>
                                    </div>
                                </div>

                                {/* INVOICE LIST */}

                                <div
                                    style={{
                                        display: 'flex',
                                        flexDirection:
                                            'column',
                                        gap: 10,
                                        marginTop: 14,
                                    }}
                                >
                                    {filteredInvoices.length ===
                                    0 ? (
                                        <div
                                            style={{
                                                background:
                                                    '#fff',
                                                borderRadius: 15,
                                                padding: 22,
                                                textAlign:
                                                    'center',
                                                color: MUTED,
                                                fontSize: 13,
                                                boxShadow:
                                                    '0 4px 13px rgba(0,0,0,0.045)',
                                            }}
                                        >
                                            No invoices found.
                                        </div>
                                    ) : (
                                        filteredInvoices.map(
                                            (invoice) => {
                                                const invoiceQty =
                                                    (
                                                        invoice.items ||
                                                        []
                                                    ).reduce(
                                                        (
                                                            sum,
                                                            item
                                                        ) =>
                                                            sum +
                                                            (Number(
                                                                item.qty
                                                            ) ||
                                                                0),
                                                        0
                                                    );

                                                const isInvoiced =
                                                    invoice.invoiceState ===
                                                    'invoiced';

                                                return (
                                                    <div
                                                        key={
                                                            invoice.orderId ||
                                                            invoice.invoiceNumber
                                                        }
                                                        style={{
                                                            background:
                                                                '#fff',
                                                            borderRadius: 16,
                                                            minHeight: 168,
                                                            padding:
                                                                '15px 14px 14px',
                                                            boxShadow:
                                                                '0 4px 13px rgba(0,0,0,0.045)',
                                                            boxSizing: 'border-box',
                                                        }}
                                                    >
                                                        <div
                                                            style={{
                                                                display:
                                                                    'flex',
                                                                justifyContent:
                                                                    'space-between',
                                                                alignItems:
                                                                    'flex-start',
                                                                gap: 12,
                                                            }}
                                                        >
                                                            <div
                                                                style={{
                                                                    minWidth: 0,
                                                                    flex: 1,
                                                                }}
                                                            >
                                                                <div
                                                                    style={{
                                                                        color: ACCENT,
                                                                        fontSize: 14,
                                                                        fontWeight: 700,
                                                                    }}
                                                                >
                                                                    {
                                                                        invoice.invoiceNumber
                                                                    }
                                                                </div>

                                                                <div
                                                                    style={{
                                                                        color: MUTED,
                                                                        fontSize: 12,
                                                                        marginTop: 4,
                                                                        overflow:
                                                                            'hidden',
                                                                        textOverflow:
                                                                            'ellipsis',
                                                                        whiteSpace:
                                                                            'nowrap',
                                                                    }}
                                                                >
                                                                    {
                                                                        invoice.customerName
                                                                    }
                                                                </div>
                                                            </div>

                                                            <div
                                                                style={{
                                                                    textAlign:
                                                                        'right',
                                                                    flexShrink: 0,
                                                                }}
                                                            >
                                                                <div
                                                                    style={{
                                                                        color: TEXT,
                                                                        fontSize: 14,
                                                                        fontWeight: 700,
                                                                    }}
                                                                >
                                                                    {formatCompactAmount(
                                                                        Number(
                                                                            invoice.total
                                                                        ) || 0
                                                                    )}
                                                                </div>

                                                                <div
                                                                    style={{
                                                                        color: MUTED,
                                                                        fontSize: 11,
                                                                        marginTop: 4,
                                                                    }}
                                                                >
                                                                    Qty{' '}
                                                                    {invoiceQty.toLocaleString()}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div
                                                            style={{
                                                                marginTop: 12,
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: 8,
                                                            }}
                                                        >
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    handlePreviewInvoice(
                                                                        invoice
                                                                    )
                                                                }
                                                                style={{
                                                                    height: 36,
                                                                    minWidth: 76,
                                                                    padding: '0 12px',
                                                                    borderRadius: 10,
                                                                    border: `1px solid ${ACCENT}`,
                                                                    background: '#fff',
                                                                    color: ACCENT,
                                                                    fontSize: 12,
                                                                    fontWeight: 700,
                                                                    cursor: 'pointer',
                                                                }}
                                                            >
                                                                Preview
                                                            </button>

                                                            {!isInvoiced && (
                                                                <>
                                                                    <input
                                                                        value={
                                                                            invoiceNumberInputs[
                                                                                cleanText(
                                                                                    invoice.orderId ||
                                                                                        invoice.invoiceNumber
                                                                                )
                                                                            ] || ''
                                                                        }
                                                                        onChange={(event) => {
                                                                            const key =
                                                                                cleanText(
                                                                                    invoice.orderId ||
                                                                                        invoice.invoiceNumber
                                                                                );

                                                                            setInvoiceNumberInputs(
                                                                                (current) => ({
                                                                                    ...current,
                                                                                    [key]:
                                                                                        event.target.value,
                                                                                })
                                                                            );
                                                                        }}
                                                                        onKeyDown={(event) => {
                                                                            if (
                                                                                event.key ===
                                                                                'Enter'
                                                                            ) {
                                                                                event.preventDefault();
                                                                                void handleSaveInvoicedNumber(
                                                                                    invoice
                                                                                );
                                                                            }
                                                                        }}
                                                                        placeholder="Invoice No."
                                                                        style={{
                                                                            flex: 1,
                                                                            minWidth: 0,
                                                                            height: 36,
                                                                            border: '1px solid #dedede',
                                                                            borderRadius: 10,
                                                                            padding: '0 10px',
                                                                            fontSize: 12,
                                                                            outline: 'none',
                                                                            boxSizing: 'border-box',
                                                                        }}
                                                                    />

                                                                    <button
                                                                        type="button"
                                                                        disabled={
                                                                            !cleanText(
                                                                                invoiceNumberInputs[
                                                                                    cleanText(
                                                                                        invoice.orderId ||
                                                                                            invoice.invoiceNumber
                                                                                    )
                                                                                ]
                                                                            ) ||
                                                                            savingInvoiceKey ===
                                                                                cleanText(
                                                                                    invoice.orderId ||
                                                                                        invoice.invoiceNumber
                                                                                )
                                                                        }
                                                                        onClick={() =>
                                                                            void handleSaveInvoicedNumber(
                                                                                invoice
                                                                            )
                                                                        }
                                                                        style={{
                                                                            height: 36,
                                                                            minWidth: 58,
                                                                            padding: '0 10px',
                                                                            border: 'none',
                                                                            borderRadius: 10,
                                                                            background: ACCENT,
                                                                            color: '#fff',
                                                                            fontSize: 12,
                                                                            fontWeight: 700,
                                                                            cursor: 'pointer',
                                                                            opacity:
                                                                                !cleanText(
                                                                                    invoiceNumberInputs[
                                                                                        cleanText(
                                                                                            invoice.orderId ||
                                                                                                invoice.invoiceNumber
                                                                                        )
                                                                                    ]
                                                                                ) ||
                                                                                savingInvoiceKey ===
                                                                                    cleanText(
                                                                                        invoice.orderId ||
                                                                                            invoice.invoiceNumber
                                                                                    )
                                                                                    ? 0.5
                                                                                    : 1,
                                                                        }}
                                                                    >
                                                                        {savingInvoiceKey ===
                                                                        cleanText(
                                                                            invoice.orderId ||
                                                                                invoice.invoiceNumber
                                                                        )
                                                                            ? '...'
                                                                            : 'Save'}
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>

                                                        {saveError[
                                                            cleanText(
                                                                invoice.orderId ||
                                                                    invoice.invoiceNumber
                                                            )
                                                        ] && (
                                                            <div
                                                                style={{
                                                                    color: '#b3261e',
                                                                    fontSize: 11,
                                                                    marginTop: 7,
                                                                }}
                                                            >
                                                                {
                                                                    saveError[
                                                                        cleanText(
                                                                            invoice.orderId ||
                                                                                invoice.invoiceNumber
                                                                        )
                                                                    ]
                                                                }
                                                            </div>
                                                        )}

                                                        <div
                                                            style={{
                                                                marginTop: 10,
                                                                display: 'flex',
                                                                justifyContent: 'flex-end',
                                                            }}
                                                        >
                                                            <span
                                                                style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    minHeight: 25,
                                                                    maxWidth: '100%',
                                                                    padding: '0 9px',
                                                                    borderRadius: 7,
                                                                    background: isInvoiced
                                                                        ? '#e8f7ee'
                                                                        : '#fff4dc',
                                                                    color: isInvoiced
                                                                        ? '#118744'
                                                                        : '#9a6a00',
                                                                    fontSize: 10,
                                                                    fontWeight: 700,
                                                                    whiteSpace: 'nowrap',
                                                                    overflow: 'hidden',
                                                                    textOverflow: 'ellipsis',
                                                                }}
                                                            >
                                                                {isInvoiced
                                                                    ? `INVOICED · ${invoice.invoicedNumber}`
                                                                    : 'PENDING'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                );
                                            }
                                        )
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </main>
            )}
        </div>
    );
};

export default ManagementPage;