import { auditUrl } from '../../lib/audit';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed. Use POST.', code: 'METHOD_NOT_ALLOWED' });
  }

  const { url } = req.body || {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Please provide a "url" string in the request body.', code: 'MISSING_URL' });
  }

  try {
    const report = await auditUrl(url);
    return res.status(200).json(report);
  } catch (err) {
    const statusByCode = {
      INVALID_URL: 400,
      BLOCKED_HOST: 403,
      TIMEOUT: 504,
      NOT_HTML: 422,
      FETCH_FAILED: 502,
    };
    const status = statusByCode[err.code] || 500;
    return res.status(status).json({ error: err.message, code: err.code || 'UNKNOWN' });
  }
};
