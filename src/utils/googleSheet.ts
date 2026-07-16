import { v4 as uuid } from 'uuid';
import type { Invoice, InvoiceItem } from 'types/invoice';

export type SheetInvoice = Invoice & {
    orderId?: string;
    orderStatus?: string;
    orderShipStatus?: string;
    customerShipStatus?: 'pending' | 'shipped';
    updatedAt?: string;
    revision?: string | number;
};

export type SheetRow = {
    date?: string;
    orderId?: string;
    itemId?: string;
    invoiceNo?: string;
    customer?: string;
    model?: string;
    qty?: number | string;
    price?: number | string;
    total?: number | string;
    salesPerson?: string;
    paymentStatus?: string;
    orderStatus?: string;
    orderShipStatus?: string;
    orderShipDcc?: string;
    customerShipStatus?: string;
    customerShip?: string;
    shippingStatus?: string;
    updatedAt?: string;
    revision?: string | number;
};

export type SheetResponse = {
    success?: boolean;
    message?: string;
    data?: SheetRow[];
};

export const GOOGLE_SHEET_WEB_APP_URL =
    'https://script.google.com/macros/s/AKfycbw89yajiSI_8Y_jBBWS_GeUSUHKuf_bO7O6Tk4KbrRfn8KwzJ9g_QPR0WUeY536qohLxg/exec';

export const cleanText = (value: unknown): string =>
    String(value ?? '').trim();

export const toNumber = (value: unknown): number => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

export const generateOrderId = () => {
    return `ORD-${Date.now()}-${uuid()
        .slice(0, 8)
        .toUpperCase()}`;
};

export const normalizePaymentStatus = (
    value?: string
): 'paid' | 'pending' | 'deposit' => {
    const status = cleanText(value).toLowerCase();

    if (status === 'paid') {
        return 'paid';
    }

    if (status === 'deposit') {
        return 'deposit';
    }

    return 'pending';
};

export const normalizeOrderStatus = (
    value?: string
): string => {
    const status = cleanText(value).toLowerCase();

    if (
        status === 'cancel' ||
        status === 'cancelled' ||
        status === 'canceled'
    ) {
        return 'Cancel';
    }

    return 'Active';
};

export const normalizeCustomerShipStatus = (
    value?: string
): 'pending' | 'shipped' => {
    return cleanText(value).toLowerCase() === 'shipped'
        ? 'shipped'
        : 'pending';
};

export const normalizeOrderShipStatus = (
    value?: string
): string => {
    const status = cleanText(value).toLowerCase();

    if (!status) {
        return '';
    }

    if (
        status === 'ready' ||
        status === 'ready to ship'
    ) {
        return 'Ready to Ship';
    }

    if (
        status === 'process' ||
        status === 'processing' ||
        status === 'in process'
    ) {
        return 'In Process';
    }

    if (
        status === 'dcc' ||
        status === 'dcc dispatch' ||
        status === 'dcc dispatched' ||
        status === 'dispatch' ||
        status === 'dispatched'
    ) {
        return 'DCC Dispatch';
    }

    return cleanText(value);
};

export const formatDateForSheet = (
    dateValue?: string
) => {
    const raw = cleanText(dateValue)
        .replace(/-at\s+at\s+/gi, ' at ')
        .replace(/-at\s+/gi, ' at ')
        .replace(/\s+at\s+at\s+/gi, ' at ')
        .replace(/\s+/g, ' ')
        .trim();

    const existingDateTime = raw.match(
        /^(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{4})(?:\s+at\s+|\s+)(\d{1,2}):(\d{2})$/i
    );

    if (existingDateTime) {
        const [
            ,
            ddRaw,
            monRaw,
            yyyy,
            hhRaw,
            mm,
        ] = existingDateTime;

        const mon =
            monRaw.charAt(0).toUpperCase() +
            monRaw.slice(1, 3).toLowerCase();

        return `${ddRaw.padStart(
            2,
            '0'
        )}-${mon}-${yyyy} at ${hhRaw.padStart(
            2,
            '0'
        )}:${mm}`;
    }

    const existingDateOnly = raw.match(
        /^(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{4})$/i
    );

    const nowDubaiTime = new Intl.DateTimeFormat(
        'en-GB',
        {
            timeZone: 'Asia/Dubai',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }
    ).format(new Date());

    if (existingDateOnly) {
        const [, ddRaw, monRaw, yyyy] =
            existingDateOnly;

        const mon =
            monRaw.charAt(0).toUpperCase() +
            monRaw.slice(1, 3).toLowerCase();

        return `${ddRaw.padStart(
            2,
            '0'
        )}-${mon}-${yyyy} at ${nowDubaiTime}`;
    }

    const date = raw ? new Date(raw) : new Date();

    const safeDate = Number.isNaN(date.getTime())
        ? new Date()
        : date;

    return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Dubai',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    })
        .format(safeDate)
        .replace(',', '')
        .replace(
            /^(\d{2}) ([A-Za-z]{3}) (\d{4}) (\d{2}):(\d{2})$/,
            '$1-$2-$3 at $4:$5'
        );
};

const MONTHS: Record<string, number> = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
};

export const parseSheetDate = (
    value?: unknown
): string => {
    const raw = cleanText(value)
        .replace(/-at\s+at\s+/gi, ' at ')
        .replace(/-at\s+/gi, ' at ')
        .replace(/\s+at\s+at\s+/gi, ' at ')
        .replace(/,/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (!raw) {
        return '';
    }

    const parsedDirect = Date.parse(raw);

    if (Number.isFinite(parsedDirect)) {
        return new Date(parsedDirect).toISOString();
    }

    const match = raw.match(
        /^(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{4})(?:\s+at\s+|\s+)?(?:(\d{1,2}):(\d{2}))?$/i
    );

    if (match) {
        const [
            ,
            dayRaw,
            monthRaw,
            yearRaw,
            hourRaw = '0',
            minuteRaw = '0',
        ] = match;

        const month =
            MONTHS[
                monthRaw
                    .slice(0, 3)
                    .toLowerCase()
            ];

        const day = Number(dayRaw);
        const year = Number(yearRaw);
        const hour = Number(hourRaw);
        const minute = Number(minuteRaw);

        if (
            Number.isFinite(day) &&
            Number.isFinite(year) &&
            Number.isFinite(month) &&
            Number.isFinite(hour) &&
            Number.isFinite(minute)
        ) {
            return new Date(
                Date.UTC(
                    year,
                    month,
                    day,
                    hour - 4,
                    minute,
                    0
                )
            ).toISOString();
        }
    }

    return raw;
};

export const getInvoiceKey = (
    invoice: SheetInvoice
): string => {
    return cleanText(
        invoice.orderId || invoice.invoiceNumber
    );
};

export const getSortTimestamp = (
    invoice: SheetInvoice
): number => {
    const revision = Number(invoice.revision);

    if (
        Number.isFinite(revision) &&
        revision > 0
    ) {
        return revision;
    }

    const updated = Date.parse(
        cleanText(invoice.updatedAt)
    );

    if (Number.isFinite(updated)) {
        return updated;
    }

    const invoiceDate = Date.parse(
        cleanText(invoice.invoiceDate)
    );

    if (Number.isFinite(invoiceDate)) {
        return invoiceDate;
    }

    return 0;
};

const isSameOrNewer = (
    candidate: SheetInvoice,
    current?: SheetInvoice
): boolean => {
    if (!current) {
        return true;
    }

    return (
        getSortTimestamp(candidate) >=
        getSortTimestamp(current)
    );
};

export const mergeInvoices = (
    localInvoices: SheetInvoice[],
    sheetInvoices: SheetInvoice[]
): SheetInvoice[] => {
    const merged = new Map<
        string,
        SheetInvoice
    >();

    localInvoices.forEach((invoice) => {
        const key = getInvoiceKey(invoice);

        if (key) {
            merged.set(key, invoice);
        }
    });

    sheetInvoices.forEach((sheetInvoice) => {
        const key = getInvoiceKey(sheetInvoice);

        if (!key) {
            return;
        }

        const localInvoice = merged.get(key);

        const latest = isSameOrNewer(
            sheetInvoice,
            localInvoice
        )
            ? sheetInvoice
            : localInvoice;

        const older =
            latest === sheetInvoice
                ? localInvoice
                : sheetInvoice;

        merged.set(key, {
            ...((older || {}) as SheetInvoice),
            ...(latest as SheetInvoice),

            customerShipStatus:
                localInvoice?.customerShipStatus ===
                    'shipped' ||
                sheetInvoice.customerShipStatus ===
                    'shipped'
                    ? 'shipped'
                    : 'pending',

            orderShipStatus:
                cleanText(
                    sheetInvoice.orderShipStatus
                ) ||
                localInvoice?.orderShipStatus ||
                '',
        } as SheetInvoice);
    });

    return Array.from(merged.values())
        .filter(
            (invoice) =>
                normalizeOrderStatus(
                    invoice.orderStatus
                ) !== 'Cancel'
        )
        .sort(
            (a, b) =>
                getSortTimestamp(b) -
                getSortTimestamp(a)
        );
};

export const groupSheetRowsToInvoices = (
    rows: SheetRow[]
): SheetInvoice[] => {
    const grouped = new Map<
        string,
        SheetInvoice
    >();

    const itemSeenByInvoice = new Map<
        string,
        Set<string>
    >();

    rows.forEach((row) => {
        const orderStatus =
            normalizeOrderStatus(
                row.orderStatus
            );

        const customerShipStatus =
            normalizeCustomerShipStatus(
                row.customerShipStatus ||
                    row.customerShip ||
                    row.shippingStatus
            );

        if (orderStatus === 'Cancel') {
            return;
        }

        const orderId = cleanText(row.orderId);

        const invoiceNumber = cleanText(
            row.invoiceNo || orderId
        );

        const key = orderId || invoiceNumber;

        if (!key) {
            return;
        }

        const model = cleanText(row.model);
        const qty = toNumber(row.qty);
        const price = Number(row.price);

        if (
            !model ||
            qty <= 0 ||
            !Number.isFinite(price) ||
            price === 0
        ) {
            return;
        }

        const sheetTotal = Number(row.total);

        const rowTotal = Number.isFinite(
            sheetTotal
        )
            ? sheetTotal
            : qty * price;

        const orderShipStatus =
            normalizeOrderShipStatus(
                row.orderShipStatus ||
                    row.orderShipDcc
            );

        const updatedAt =
            cleanText(row.updatedAt) ||
            parseSheetDate(row.date);

        const revision = row.revision || 0;

        const itemId =
            cleanText(row.itemId) ||
            `${key}-${model}-${qty}-${price}`;

        const itemKey =
            itemId ||
            `${model}|${qty}|${price}`;

        if (!itemSeenByInvoice.has(key)) {
            itemSeenByInvoice.set(
                key,
                new Set<string>()
            );
        }

        const seen =
            itemSeenByInvoice.get(key)!;

        if (seen.has(itemKey)) {
            return;
        }

        seen.add(itemKey);

        const item: InvoiceItem = {
            id: itemId,
            model,
            qty,
            price,
        };

        const existing = grouped.get(key);

        if (existing) {
            existing.items.push(item);
            existing.subtotal += rowTotal;
            existing.total += rowTotal;

            if (orderShipStatus) {
                existing.orderShipStatus =
                    orderShipStatus;
            }

            if (
                customerShipStatus ===
                'shipped'
            ) {
                existing.customerShipStatus =
                    'shipped';
            }

            if (
                Number(revision) >
                Number(
                    existing.revision || 0
                )
            ) {
                existing.revision = revision;
            }

            if (
                Date.parse(updatedAt) >
                Date.parse(
                    cleanText(
                        existing.updatedAt
                    )
                )
            ) {
                existing.updatedAt =
                    updatedAt;
            }

            return;
        }

        grouped.set(key, {
            orderId,
            invoiceNumber,
            customerName: cleanText(
                row.customer
            ),
            salesRepresentative: cleanText(
                row.salesPerson
            ),
            invoiceDate: parseSheetDate(
                row.date
            ),
            items: [item],
            subtotal: rowTotal,
            total: rowTotal,
            depositAmount: 0,
            paymentStatus:
                normalizePaymentStatus(
                    row.paymentStatus
                ),
            orderStatus,
            orderShipStatus,
            customerShipStatus,
            updatedAt,
            revision,
        });
    });

    return Array.from(
        grouped.values()
    ).sort(
        (a, b) =>
            getSortTimestamp(b) -
            getSortTimestamp(a)
    );
};

export const buildHistoryUrl = (
    salesPerson?: string,
    extra?: Record<string, string>
): string => {
    const params = new URLSearchParams();

    if (salesPerson) {
        params.set(
            'salesPerson',
            salesPerson
        );
    }

    Object.entries(extra || {}).forEach(
        ([key, value]) => {
            if (value) {
                params.set(key, value);
            }
        }
    );

    return `/api/sheet-history?${params.toString()}`;
};

const parseHistoryParams = (
    url: string
): URLSearchParams => {
    const parsed = new URL(
        url,
        window.location.origin
    );

    const params = new URLSearchParams(
        parsed.search
    );

    params.delete('_');

    return params;
};

const fetchSheetHistoryFromProxy = async (
    url: string
): Promise<SheetResponse> => {
    const response = await fetch(url, {
        method: 'GET',
        cache: 'default',
        headers: {
            Accept: 'application/json',
        },
    });

    const json = (await response
        .json()
        .catch(() => ({
            success: false,
            message:
                'Invalid backend response',
        }))) as SheetResponse;

    if (
        !response.ok ||
        json?.success === false ||
        !Array.isArray(json.data)
    ) {
        throw new Error(
            json?.message ||
                'Could not load invoice history'
        );
    }

    return json;
};

const fetchSheetHistoryByJsonp = (
    url: string
): Promise<SheetResponse> => {
    return new Promise(
        (resolve, reject) => {
            const callbackName =
                `__truecellInvoiceHistory_${Date.now()}_${Math.random()
                    .toString(36)
                    .slice(2)}`;

            const params =
                parseHistoryParams(url);

            let completed = false;

            let script:
                | HTMLScriptElement
                | null =
                document.createElement(
                    'script'
                );

            const cleanup = () => {
                if (completed) {
                    return;
                }

                completed = true;

                window.clearTimeout(
                    timeoutId
                );

                try {
                    delete (window as any)[
                        callbackName
                    ];
                } catch {
                    (window as any)[
                        callbackName
                    ] = undefined;
                }

                if (
                    script?.parentNode
                ) {
                    script.parentNode.removeChild(
                        script
                    );
                }

                script = null;
            };

            const timeoutId =
                window.setTimeout(() => {
                    cleanup();

                    reject(
                        new Error(
                            'Google Sheet request timed out'
                        )
                    );
                }, 20000);

            (window as any)[
                callbackName
            ] = (json: SheetResponse) => {
                cleanup();

                if (
                    !json?.success ||
                    !Array.isArray(json.data)
                ) {
                    reject(
                        new Error(
                            json?.message ||
                                'Invalid Google Sheet response'
                        )
                    );

                    return;
                }

                resolve(json);
            };

            params.set(
                'callback',
                callbackName
            );

            params.set(
                '_',
                String(Date.now())
            );

            script.onerror = () => {
                cleanup();

                reject(
                    new Error(
                        'Could not connect to Google Sheet'
                    )
                );
            };

            script.async = true;

            script.src =
                `${GOOGLE_SHEET_WEB_APP_URL}?${params.toString()}`;

            document.body.appendChild(
                script
            );
        }
    );
};

export const fetchSheetHistory = async (
    url: string
): Promise<SheetResponse> => {
    try {
        return await fetchSheetHistoryFromProxy(
            url
        );
    } catch (proxyError) {
        console.warn(
            'Proxy history load failed, trying Apps Script JSONP fallback:',
            proxyError
        );

        return fetchSheetHistoryByJsonp(
            url
        );
    }
};

const postToSheetProxy = async (
    payload: Record<string, unknown>
) => {
    const response = await fetch(
        '/api/sheet-save',
        {
            method: 'POST',
            cache: 'no-store',
            headers: {
                'Content-Type':
                    'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify(payload),
        }
    );

    const json = (await response
        .json()
        .catch(() => ({
            success: false,
            message:
                'Invalid backend save response',
        }))) as Record<string, unknown>;

    if (
        !response.ok ||
        json?.success === false
    ) {
        throw new Error(
            cleanText(json?.message) ||
                'Google Sheet save failed'
        );
    }

    return json;
};

const postToSheetDirect = async (
    payload: Record<string, unknown>
) => {
    await fetch(
        GOOGLE_SHEET_WEB_APP_URL,
        {
            method: 'POST',
            mode: 'no-cors',
            cache: 'no-store',
            headers: {
                'Content-Type':
                    'text/plain;charset=utf-8',
            },
            body: JSON.stringify(payload),
        }
    );

    return {
        success: true,
        directFallback: true,
    };
};

export const postToGoogleSheet = async (
    payload: Record<string, unknown>
) => {
    try {
        return await postToSheetProxy(
            payload
        );
    } catch (proxyError) {
        console.warn(
            'Proxy save failed, trying Apps Script direct fallback:',
            proxyError
        );

        return postToSheetDirect(payload);
    }
};

const normalizeInvoiceItems = (
    invoice: SheetInvoice
): InvoiceItem[] => {
    return (invoice.items || []).filter(
        (item) => {
            const price = Number(
                item.price
            );

            return (
                cleanText(item.model) &&
                toNumber(item.qty) > 0 &&
                Number.isFinite(price) &&
                price !== 0
            );
        }
    );
};

export const fetchInvoiceFromSheet =
    async (
        invoice: SheetInvoice
    ): Promise<SheetInvoice | null> => {
        const orderId = cleanText(
            invoice.orderId
        );

        const invoiceNumber =
            cleanText(
                invoice.invoiceNumber
            );

        const url = buildHistoryUrl(
            invoice.salesRepresentative,
            orderId
                ? { orderId }
                : {
                      invoiceNo:
                          invoiceNumber,
                  }
        );

        const json =
            await fetchSheetHistory(url);

        if (
            !json?.success ||
            !Array.isArray(json.data)
        ) {
            throw new Error(
                json?.message ||
                    'Invalid backend response'
            );
        }

        const grouped =
            groupSheetRowsToInvoices(
                json.data
            );

        return (
            grouped.find((item) => {
                return (
                    getInvoiceKey(item) ===
                        getInvoiceKey(
                            invoice
                        ) ||
                    cleanText(
                        item.invoiceNumber
                    ) === invoiceNumber
                );
            }) || null
        );
    };

export const syncInvoiceToGoogleSheet =
    async (
        invoice: SheetInvoice,
        previousInvoice?: SheetInvoice
    ): Promise<SheetInvoice> => {
        const orderId =
            invoice.orderId ||
            generateOrderId();

        const now =
            new Date().toISOString();

        const revision = Date.now();

        const payload = {
            action: 'save',

            orderId,

            previousOrderId:
                previousInvoice?.orderId ||
                previousInvoice?.invoiceNumber ||
                '',

            previousInvoiceNo:
                previousInvoice?.invoiceNumber ||
                '',

            date: formatDateForSheet(
                invoice.updatedAt ||
                    invoice.invoiceDate ||
                    now
            ),

            invoiceNo:
                invoice.invoiceNumber,

            customer:
                invoice.customerName,

            salesPerson:
                invoice.salesRepresentative,

            paymentStatus:
                invoice.paymentStatus,

            orderStatus:
                invoice.orderStatus,

            orderShipStatus:
                invoice.orderShipStatus,

            customerShipStatus:
                invoice.customerShipStatus ===
                'shipped'
                    ? 'shipped'
                    : 'pending',

            items: normalizeInvoiceItems(
                invoice
            ).map((item) => ({
                id: item.id || uuid(),
                model: item.model,
                qty: toNumber(item.qty),
                price: Number(
                    item.price
                ),
            })),
        };

        const response =
            (await postToGoogleSheet(
                payload
            )) as {
                updatedAt?: unknown;
                revision?: unknown;
                directFallback?: boolean;
            };

        return {
            ...invoice,
            orderId,

            updatedAt:
                cleanText(
                    response.updatedAt
                ) ||
                invoice.updatedAt ||
                now,

            revision:
                cleanText(
                    response.revision
                ) ||
                invoice.revision ||
                revision,

            syncStatus:
                response.directFallback
                    ? 'pending'
                    : 'synced',
        };
    };

export const cancelInvoiceInGoogleSheet = (
    invoice: SheetInvoice
) => {
    const orderId = cleanText(
        invoice.orderId ||
            invoice.invoiceNumber
    );

    const invoiceNumber = cleanText(
        invoice.invoiceNumber
    );

    return postToGoogleSheet({
        action: 'cancelOrder',
        orderId,
        previousOrderId:
            invoiceNumber,
        invoiceNo: invoiceNumber,
        invoiceNumber,
    });
};

export const updateCustomerShipInGoogleSheet =
    (invoice: SheetInvoice) => {
        const orderId = cleanText(
            invoice.orderId ||
                invoice.invoiceNumber
        );

        const invoiceNumber =
            cleanText(
                invoice.invoiceNumber
            );

        return postToGoogleSheet({
            action:
                'updateCustomerShipStatus',
            orderId,
            previousOrderId:
                invoiceNumber,
            invoiceNo: invoiceNumber,
            invoiceNumber,
            customerShipStatus:
                'Shipped',
        });
    };