const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbw89yajiSI_8Y_jBBWS_GeUSUHKuf_bO7O6Tk4KbrRfn8KwzJ9g_QPR0WUeY536qohLxg/exec';

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
    });

    req.on('end', () => {
      resolve(body);
    });

    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed',
    });
  }

  try {
    let payload = req.body;

    if (!payload || typeof payload !== 'object') {
      const rawBody = await readBody(req);
      payload = JSON.parse(rawBody || '{}');
    }

    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
        Accept: 'application/json,text/plain,*/*',
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();

    let json;

    try {
      json = JSON.parse(text);
    } catch (error) {
      return res.status(502).json({
        success: false,
        message: 'Invalid Google Sheet save response',
        preview: String(text || '').slice(0, 300),
      });
    }

    if (!response.ok || json.success === false) {
      return res.status(502).json({
        success: false,
        message: json.message || 'Google Sheet save failed',
      });
    }

    return res.status(200).json(json);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error && error.message ? error.message : 'Could not save invoice',
    });
  }
};