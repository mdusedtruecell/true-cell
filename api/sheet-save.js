const https = require('https');

const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbw89yajiSI_8Y_jBBWS_GeUSUHKuf_bO7O6Tk4KbrRfn8KwzJ9g_QPR0WUeY536qohLxg/exec';

function readBody(req) {
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

function postText(url, payload, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const body = JSON.stringify(payload || {});

    const options = {
      method: 'POST',
      hostname: parsedUrl.hostname,
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const request = https.request(options, (response) => {
      const statusCode = response.statusCode || 0;
      const location = response.headers.location;

      if (
        location &&
        [301, 302, 303, 307, 308].includes(statusCode) &&
        redirectCount < 5
      ) {
        response.resume();
        resolve(postText(location, payload, redirectCount + 1));
        return;
      }

      let responseBody = '';

      response.on('data', (chunk) => {
        responseBody += chunk;
      });

      response.on('end', () => {
        resolve({
          statusCode,
          body: responseBody,
        });
      });
    });

    request.on('error', reject);

    request.setTimeout(15000, function () {
      this.destroy(new Error('Backend save timed out'));
    });

    request.write(body);
    request.end();
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
    const rawBody = await readBody(req);
    const payload =
      typeof req.body === 'object' && req.body
        ? req.body
        : JSON.parse(rawBody || '{}');

    const result = await postText(APPS_SCRIPT_URL, payload);

    let json;

    try {
      json = JSON.parse(result.body);
    } catch (error) {
      return res.status(502).json({
        success: false,
        message: 'Invalid backend save response',
        preview: String(result.body || '').slice(0, 200),
      });
    }

    if (result.statusCode < 200 || result.statusCode >= 300 || json.success === false) {
      return res.status(502).json({
        success: false,
        message: json.message || 'Backend save failed',
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