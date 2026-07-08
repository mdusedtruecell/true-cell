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

export const SHEET_REQUEST_TIMEOUT_MS = 12000;

export const cleanText = (value: unknown): string => String(value ?? '').trim();

export const toNumber = (value: unknown): number => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

export const generateOrderId = () => {
    return `ORD-${Date.now()}-${uuid().slice(0, 8).toUpperCase()}`;
};

export const normalizePaymentStatus = (value?: string): 'paid' | 'pending' | 'deposit' => {
    const status = cleanText(value).toLowerCase();
    if (status === 'paid') return 'paid';
    if (status === 'deposit') return 'deposit';
    return 'pending';
};

export const normalizeOrderStatus = (value?: string): string => {
    const status = cleanText(value).toLowerCase();
    if (status === 'cancel' || status === 'cancelled' || status === 'canceled') return 'Cancel';
    return 'Active';
};

export const normalizeCustomerShipStatus = (value?: string): 'pending' | 'shipped' => {
    return cleanText(value).toLowerCase() === 'shipped' ? 'shipped' : 'pending';
};

export const normalizeOrderShipStatus = (value?: string): string => {
    const status = cleanText(value).toLowerCase();

    if (!status) return '';
    if (status === 'ready' || status === 'ready to ship') return 'Ready to Ship';
    if (status === 'process' || status === 'processing' || status === 'in process') return 'In Process';

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

export const formatDateForSheet = (dateValue?: string) => {
    const date = dateValue ? new Date(dateValue) : new Date();
    const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;

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
        .replaceAll(' ', '-')
        .replace(/-(\d{2}:\d{2})$/, ' at $1');
};

const MONTHS: Record<string, string> = {
    jan: '01',
    feb: '02',
    mar: '03',
    apr: '04',
    may: '05',
    jun: '06',
    jul: '07',
    aug: '08',
    sep: '09',
    oct: '10',
    nov: '11',
    dec: '12',
};

export const parseSheetDate = (value?: string): string => {
    const raw = cleanText(value);
    if (!raw) return new Date().toISOString();

    const direct = new Date(raw);
    if (!Number.isNaN(direct.getTime())) return direct.toISOString();

    const match = raw.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{4})(?:\s+at\s+|\s+)(\d{1,2}):(\d{2})/i);

    if (match) {
        const [, ddRaw, monRaw, yyyy, hhRaw, mm] = match;
        const month = MONTHS[monRaw.toLowerCase()];

        if (month) {
            const dd = ddRaw.padStart(2, '0');
            const hh = hhRaw.padStart(2, '0');
            const parsed = new Date(`${yyyy}-${month}-${dd}T${hh}:${mm}:00+04:00`);

            if (!Number.isNaN(parsed.getTime())) {
                return parsed.toISOString();
            }
        }
    }

    return new Date().toISOString();
};

export const getInvoiceKey = (invoice: SheetInvoice): string => {
    return cleanText(invoice.orderId || invoice.invoiceNumber);
};

export const getSortTimestamp = (invoice: SheetInvoice): number => {
    const revision = Number(invoice.revision);

    if (Number.isFinite(revision) && revision > 0) {
        return revision;
    }

    const updated = Date.parse(cleanText(invoice.updatedAt));

    if (Number.isFinite(updated)) {
        return updated;
    }

    const invoiceDate = Date.parse(cleanText(invoice.invoiceDate));

    if (Number.isFinite(invoiceDate)) {
        return invoiceDate;
    }

    return 0;
};

const isSameOrNewer = (candidate: SheetInvoice, current?: SheetInvoice): boolean => {
    if (!current) return true;
    return getSortTimestamp(candidate) >= getSortTimestamp(current);
};

export const mergeInvoices = (localInvoices: SheetInvoice[], sheetInvoices: SheetInvoice[]): SheetInvoice[] => {
    const merged = new Map<string, SheetInvoice>();

    localInvoices.forEach((invoice) => {
        const key = getInvoiceKey(invoice);
        if (key) merged.set(key, invoice);
    });

    sheetInvoices.forEach((sheetInvoice) => {
        const key = getInvoiceKey(sheetInvoice);
        if (!key) return;

        const localInvoice = merged.get(key);
        const latest = isSameOrNewer(sheetInvoice, localInvoice) ? sheetInvoice : localInvoice;
        const older = latest === sheetInvoice ? localInvoice : sheetInvoice;

        merged.set(key, {
            ...(older || {}),
            ...latest,
            customerShipStatus:
                localInvoice?.customerShipStatus === 'shipped' || sheetInvoice.customerShipStatus === 'shipped'
                    ? 'shipped'
                    : 'pending',
            orderShipStatus: cleanText(sheetInvoice.orderShipStatus) || localInvoice?.orderShipStatus || '',
        });
    });

    return Array.from(merged.values())
        .filter((invoice) => normalizeOrderStatus(invoice.orderStatus) !== 'Cancel')
        .sort((a, b) => getSortTimestamp(b) - getSortTimestamp(a));
};

export const groupSheetRowsToInvoices = (rows: SheetRow[]): SheetInvoice[] => {
    const grouped = new Map<string, SheetInvoice>();
    const itemSeenByInvoice = new Map<string, Set<string>>();

    rows.forEach((row) => {
        const orderStatus = normalizeOrderStatus(row.orderStatus);
        const customerShipStatus = normalizeCustomerShipStatus(row.customerShipStatus || row.customerShip || row.shippingStatus);

        if (orderStatus === 'Cancel') return;

        const orderId = cleanText(row.orderId);
        const invoiceNumber = cleanText(row.invoiceNo || orderId);
        const key = orderId || invoiceNumber;

        if (!key) return;

        const model = cleanText(row.model);
        const qty = toNumber(row.qty);
        const price = toNumber(row.price);

        if (!model || qty <= 0 || price === 0) return;

        const rowTotal = toNumber(row.total) || qty * price;
        const orderShipStatus = normalizeOrderShipStatus(row.orderShipStatus || row.orderShipDcc);
        const updatedAt = cleanText(row.updatedAt) || parseSheetDate(row.date);
        const revision = row.revision || 0;
        const itemId = cleanText(row.itemId) || `${key}-${model}-${qty}-${price}`;
        const itemKey = itemId || `${model}|${qty}|${price}`;

        if (!itemSeenByInvoice.has(key)) {
            itemSeenByInvoice.set(key, new Set<string>());
        }

        const seen = itemSeenByInvoice.get(key)!;

        if (seen.has(itemKey)) return;

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
                existing.orderShipStatus = orderShipStatus;
            }

            if (customerShipStatus === 'shipped') {
                existing.customerShipStatus = 'shipped';
            }

            if (Number(revision) > Number(existing.revision || 0)) {
                existing.revision = revision;
            }

            if (Date.parse(updatedAt) > Date.parse(cleanText(existing.updatedAt))) {
                existing.updatedAt = updatedAt;
            }

            return;
        }

        grouped.set(key, {
            orderId,
            invoiceNumber,
            customerName: cleanText(row.customer),
            salesRepresentative: cleanText(row.salesPerson),
            invoiceDate: parseSheetDate(row.date),
            items: [item],
            subtotal: rowTotal,
            total: rowTotal,
            depositAmount: 0,
            paymentStatus: normalizePaymentStatus(row.paymentStatus),
            orderStatus,
            orderShipStatus,
            customerShipStatus,
            updatedAt,
            revision,
        });
    });

    return Array.from(grouped.values()).sort((a, b) => getSortTimestamp(b) - getSortTimestamp(a));
};

export const buildHistoryUrl = (salesPerson?: string, extra?: Record<string, string>): string => {
    const params = new URLSearchParams();

    if (salesPerson) {
        params.set('salesPerson', salesPerson);
    }

    Object.entries(extra || {}).forEach(([key, value]) => {
        if (value) {
            params.set(key, value);
        }
    });

    params.set('_', String(Date.now()));

    return `${GOOGLE_SHEET_WEB_APP_URL}?${params.toString()}`;
};

export const jsonpRequest = <T,>(url: string): Promise<T> => {
    return new Promise((resolve, reject) => {
        const callbackName = `__truecellSheetCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const script = document.createElement('script');
        let timeout = 0;

        const cleanup = () => {
            window.clearTimeout(timeout);
            script.remove();
            delete (window as any)[callbackName];
        };

        timeout = window.setTimeout(() => {
            cleanup();
            reject(new Error('Google Sheet request timed out'));
        }, SHEET_REQUEST_TIMEOUT_MS);

        (window as any)[callbackName] = (data: T) => {
            cleanup();
            resolve(data);
        };

        script.onerror = () => {
            cleanup();
            reject(new Error('Google Sheet JSONP request failed'));
        };

        const separator = url.includes('?') ? '&' : '?';
        script.src = `${url}${separator}callback=${encodeURIComponent(callbackName)}`;
        document.body.appendChild(script);
    });
};

export const fetchSheetHistory = async (url: string): Promise<SheetResponse> => {
    return jsonpRequest<SheetResponse>(url);
};

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export const postToGoogleSheet = async (payload: Record<string, unknown>) => {
    if (!GOOGLE_SHEET_WEB_APP_URL || GOOGLE_SHEET_WEB_APP_URL.includes('PASTE_')) {
        throw new Error('Google Sheet Web App URL missing');
    }

    await fetch(GOOGLE_SHEET_WEB_APP_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
            'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(payload),
    });
};

const normalizeInvoiceItems = (invoice: SheetInvoice): InvoiceItem[] => {
    return (invoice.items || []).filter((item) => {
        return cleanText(item.model) && toNumber(item.qty) > 0 && toNumber(item.price) !== 0;
    });
};

const invoiceMatchesExpected = (actual: SheetInvoice, expected: SheetInvoice): boolean => {
    if (cleanText(actual.invoiceNumber) !== cleanText(expected.invoiceNumber)) {
        return false;
    }

    if (cleanText(actual.customerName).toLowerCase() !== cleanText(expected.customerName).toLowerCase()) {
        return false;
    }

    const actualItems = normalizeInvoiceItems(actual);
    const expectedItems = normalizeInvoiceItems(expected);

    if (actualItems.length !== expectedItems.length) {
        return false;
    }

    const actualById = new Map(actualItems.map((item) => [cleanText(item.id), item]));

    return expectedItems.every((expectedItem) => {
        const byId = actualById.get(cleanText(expectedItem.id));

        if (byId) {
            return (
                cleanText(byId.model) === cleanText(expectedItem.model) &&
                toNumber(byId.qty) === toNumber(expectedItem.qty) &&
                toNumber(byId.price) === toNumber(expectedItem.price)
            );
        }

        return actualItems.some((actualItem) => {
            return (
                cleanText(actualItem.model) === cleanText(expectedItem.model) &&
                toNumber(actualItem.qty) === toNumber(expectedItem.qty) &&
                toNumber(actualItem.price) === toNumber(expectedItem.price)
            );
        });
    });
};

export const fetchInvoiceFromSheet = async (invoice: SheetInvoice): Promise<SheetInvoice | null> => {
    const orderId = cleanText(invoice.orderId);
    const invoiceNumber = cleanText(invoice.invoiceNumber);
    const url = buildHistoryUrl(invoice.salesRepresentative, orderId ? { orderId } : { invoiceNo: invoiceNumber });
    const json = await fetchSheetHistory(url);

    if (!json?.success || !Array.isArray(json.data)) {
        throw new Error(json?.message || 'Invalid Google Sheet response');
    }

    const grouped = groupSheetRowsToInvoices(json.data);

    return grouped.find((item) => {
        return getInvoiceKey(item) === getInvoiceKey(invoice) || cleanText(item.invoiceNumber) === invoiceNumber;
    }) || null;
};

export const verifyInvoiceInSheet = async (invoice: SheetInvoice): Promise<SheetInvoice> => {
    const retryDelays = [1200, 2500, 5000, 8000];
    let lastFound: SheetInvoice | null = null;

    for (const retryDelay of retryDelays) {
        await delay(retryDelay);

        const found = await fetchInvoiceFromSheet(invoice);

        if (found) {
            lastFound = found;
        }

        if (found && invoiceMatchesExpected(found, invoice)) {
            return found;
        }
    }

    throw new Error(
        lastFound
            ? 'Google Sheet updated with old invoice data, latest edit not verified yet'
            : 'Invoice not found in Google Sheet after save'
    );
};

export const syncInvoiceToGoogleSheet = async (
    invoice: SheetInvoice,
    previousInvoice?: SheetInvoice
): Promise<SheetInvoice> => {
    const orderId = invoice.orderId || generateOrderId();
    const now = new Date().toISOString();
    const revision = Date.now();

    const payload = {
        action: 'save',
        orderId,
        previousOrderId: previousInvoice?.orderId || previousInvoice?.invoiceNumber || '',
        previousInvoiceNo: previousInvoice?.invoiceNumber || '',
        date: formatDateForSheet(invoice.updatedAt || invoice.invoiceDate || now),
        invoiceNo: invoice.invoiceNumber,
        customer: invoice.customerName,
        salesPerson: invoice.salesRepresentative,
        paymentStatus: invoice.paymentStatus,
        orderStatus: invoice.orderStatus,
        orderShipStatus: invoice.orderShipStatus,
        customerShipStatus: invoice.customerShipStatus === 'shipped' ? 'shipped' : 'pending',
        items: normalizeInvoiceItems(invoice).map((item) => ({
            id: item.id || uuid(),
            model: item.model,
            qty: toNumber(item.qty),
            price: Number(item.price),
        })),
    };

    await postToGoogleSheet(payload);

    return {
        ...invoice,
        orderId,
        updatedAt: invoice.updatedAt || now,
        revision: invoice.revision || revision,
        syncStatus: 'synced',
    };
};

export const cancelInvoiceInGoogleSheet = (invoice: SheetInvoice) => {
    const orderId = cleanText(invoice.orderId || invoice.invoiceNumber);
    const invoiceNumber = cleanText(invoice.invoiceNumber);

    return postToGoogleSheet({
        action: 'cancelOrder',
        orderId,
        previousOrderId: invoiceNumber,
        invoiceNo: invoiceNumber,
        invoiceNumber,
    });
};

export const updateCustomerShipInGoogleSheet = (invoice: SheetInvoice) => {
    const orderId = cleanText(invoice.orderId || invoice.invoiceNumber);
    const invoiceNumber = cleanText(invoice.invoiceNumber);

    return postToGoogleSheet({
        action: 'updateCustomerShipStatus',
        orderId,
        previousOrderId: invoiceNumber,
        invoiceNo: invoiceNumber,
        invoiceNumber,
        customerShipStatus: 'Shipped',
    });
};