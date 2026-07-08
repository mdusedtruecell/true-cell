const https = require('https');

const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbw89yajiSI_8Y_jBBWS_GeUSUHKuf_bO7O6Tk4KbrRfn8KwzJ9g_QPR0WUeY536qohLxg/exec';

function requestText(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        const statusCode = response.statusCode || 0;
        const location = response.headers.location;

        if (
          location &&
          [301, 302, 303, 307, 308].includes(statusCode) &&
          redirectCount < 5
        ) {
          response.resume();
          resolve(requestText(location, redirectCount + 1));
          return;
        }

        let body = '';

        response.on('data', (chunk) => {
          body += chunk;
        });

        response.on('end', () => {
          resolve({
            statusCode,
            body,
          });
        });
      })
      .on('error', reject)
      .setTimeout(15000, function () {
        this.destroy(new Error('Backend request timed out'));
      });
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed',
    });
  }

  try {
    const fullUrl = new URL(req.url, 'https://invoice.truecelldxb.com');
    const params = new URLSearchParams();

    const salesPerson = fullUrl.searchParams.get('salesPerson') || '';
    const orderId = fullUrl.searchParams.get('orderId') || '';
    const invoiceNo =
      fullUrl.searchParams.get('invoiceNo') ||
      fullUrl.searchParams.get('invoiceNumber') ||
      '';
    const includeCanceled = fullUrl.searchParams.get('includeCanceled') || '';

    if (salesPerson) params.set('salesPerson', salesPerson);
    if (orderId) params.set('orderId', orderId);
    if (invoiceNo) params.set('invoiceNo', invoiceNo);
    if (includeCanceled) params.set('includeCanceled', includeCanceled);

    params.set('_', String(Date.now()));

    const url = `${APPS_SCRIPT_URL}?${params.toString()}`;
    const result = await requestText(url);

    let json;

    try {
      json = JSON.parse(result.body);
    } catch (error) {
      return res.status(502).json({
        success: false,
        message: 'Invalid backend response',
        preview: String(result.body || '').slice(0, 200),
      });
    }

    if (result.statusCode < 200 || result.statusCode >= 300 || json.success === false) {
      return res.status(502).json({
        success: false,
        message: json.message || 'Backend history request failed',
      });
    }

    return res.status(200).json(json);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error && error.message ? error.message : 'Could not load invoice history',
    });
  }
};