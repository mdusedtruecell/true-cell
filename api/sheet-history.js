const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbw89yajiSI_8Y_jBBWS_GeUSUHKuf_bO7O6Tk4KbrRfn8KwzJ9g_QPR0WUeY536qohLxg/exec';

module.exports = async function handler(req, res) {
  res.setHeader(
    'Cache-Control',
    'public, s-maxage=60, stale-while-revalidate=300'
  );

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed',
    });
  }

  try {
    const requestUrl = new URL(
      req.url,
      'https://invoice.truecelldxb.com'
    );

    const params = new URLSearchParams();

    const salesPerson =
      requestUrl.searchParams.get('salesPerson') || '';

    const orderId =
      requestUrl.searchParams.get('orderId') || '';

    const invoiceNo =
      requestUrl.searchParams.get('invoiceNo') ||
      requestUrl.searchParams.get('invoiceNumber') ||
      '';

    const includeCanceled =
      requestUrl.searchParams.get('includeCanceled') || '';

    if (salesPerson) {
      params.set('salesPerson', salesPerson);
    }

    if (orderId) {
      params.set('orderId', orderId);
    }

    if (invoiceNo) {
      params.set('invoiceNo', invoiceNo);
    }

    if (includeCanceled) {
      params.set('includeCanceled', includeCanceled);
    }

    const url =
      `${APPS_SCRIPT_URL}?${params.toString()}`;

    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        Accept: 'application/json,text/plain,*/*',
      },
    });

    const text = await response.text();

    let json;

    try {
      json = JSON.parse(text);
    } catch (error) {
      return res.status(502).json({
        success: false,
        message: 'Invalid Google Sheet response',
        preview: String(text || '').slice(0, 300),
      });
    }

    if (!response.ok || json.success === false) {
      return res.status(502).json({
        success: false,
        message:
          json.message ||
          'Google Sheet history request failed',
      });
    }

    return res.status(200).json(json);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message:
        error && error.message
          ? error.message
          : 'Could not load invoice history',
    });
  }
};