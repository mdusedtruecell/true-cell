const APPS_SCRIPT_URL =
    'https://script.google.com/macros/s/AKfycbw89yajiSI_8Y_jBBWS_GeUSUHKuf_bO7O6Tk4KbrRfn8KwzJ9g_QPR0WUeY536qohLxg/exec';

const firstValue = (value: unknown): string => {
    if (Array.isArray(value)) return String(value[0] ?? '').trim();
    return String(value ?? '').trim();
};

export default async function handler(req: any, res: any) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    if (req.method !== 'GET') {
        return res.status(405).json({
            success: false,
            message: 'Method not allowed',
        });
    }

    try {
        const params = new URLSearchParams();

        const salesPerson = firstValue(req.query.salesPerson);
        const orderId = firstValue(req.query.orderId);
        const invoiceNo = firstValue(req.query.invoiceNo || req.query.invoiceNumber);
        const includeCanceled = firstValue(req.query.includeCanceled);

        if (salesPerson) params.set('salesPerson', salesPerson);
        if (orderId) params.set('orderId', orderId);
        if (invoiceNo) params.set('invoiceNo', invoiceNo);
        if (includeCanceled) params.set('includeCanceled', includeCanceled);

        params.set('_', String(Date.now()));

        const url = `${APPS_SCRIPT_URL}?${params.toString()}`;

        const response = await fetch(url, {
            method: 'GET',
            redirect: 'follow',
            cache: 'no-store',
        });

        const text = await response.text();

        let json: any;

        try {
            json = JSON.parse(text);
        } catch {
            return res.status(502).json({
                success: false,
                message: 'Invalid backend response',
                preview: text.slice(0, 200),
            });
        }

        if (!response.ok || json?.success === false) {
            return res.status(502).json({
                success: false,
                message: json?.message || 'Backend history request failed',
            });
        }

        return res.status(200).json(json);
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: error?.message || 'Could not load invoice history',
        });
    }
}