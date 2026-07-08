const APPS_SCRIPT_URL =
    'https://script.google.com/macros/s/AKfycbw89yajiSI_8Y_jBBWS_GeUSUHKuf_bO7O6Tk4KbrRfn8KwzJ9g_QPR0WUeY536qohLxg/exec';

export default async function handler(req: any, res: any) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            message: 'Method not allowed',
        });
    }

    try {
        const payload =
            typeof req.body === 'string'
                ? JSON.parse(req.body || '{}')
                : req.body || {};

        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            redirect: 'follow',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8',
            },
            body: JSON.stringify(payload),
        });

        const text = await response.text();

        let json: any;

        try {
            json = JSON.parse(text);
        } catch {
            return res.status(502).json({
                success: false,
                message: 'Invalid backend save response',
                preview: text.slice(0, 200),
            });
        }

        if (!response.ok || json?.success === false) {
            return res.status(502).json({
                success: false,
                message: json?.message || 'Backend save failed',
            });
        }

        return res.status(200).json(json);
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: error?.message || 'Could not save invoice',
        });
    }
}