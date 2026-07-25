// Core logic for Page Pulse. Kept dependency-free (no cheerio/jsdom) so the
// project installs in seconds and has one less thing to break in a hurry —
// see README "Design decisions" for why.

function extractTag(html, tagName) {
  const match = html.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return match ? match[1].trim() : null;
}

function extractMetaDescription(html) {
  const match = html.match(/<meta[^>]+name=["']description["'][^>]*>/i);
  if (!match) return null;
  const contentMatch = match[0].match(/content=["']([^"']*)["']/i);
  return contentMatch ? contentMatch[1].trim() : null;
}

function countTag(html, tagName) {
  const matches = html.match(new RegExp(`<${tagName}[^>]*>`, 'gi'));
  return matches ? matches.length : 0;
}

function countImagesMissingAlt(html) {
  const imgTags = html.match(/<img[^>]*>/gi) || [];
  let missing = 0;
  for (const tag of imgTags) {
    const altMatch = tag.match(/alt=["']([^"']*)["']/i);
    if (!altMatch || altMatch[1].trim() === '') missing++;
  }
  return { total: imgTags.length, missing };
}

function approximateWordCount(html) {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyHtml = bodyMatch ? bodyMatch[1] : html;
  const withoutScripts = bodyHtml
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const text = withoutScripts
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&#39;|&quot;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return 0;
  return text.split(' ').length;
}

function isValidUrl(input) {
  try {
    const u = new URL(input);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// Blocks obvious private/internal/loopback hosts so this "fetch any URL" tool
// can't be used to probe internal network services (a real SSRF risk for any
// server-side URL fetcher). This is a literal-hostname check, not full DNS
// resolution — see README for the limitation.
const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^169\.254\./, // link-local; also used by cloud metadata endpoints
  /^\[?::1\]?$/,
];

function isBlockedHost(hostname) {
  return PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

function parseReport(html) {
  const title = extractTag(html, 'title');
  const metaDescription = extractMetaDescription(html);
  const h1Count = countTag(html, 'h1');
  const { total: imageCount, missing: imagesMissingAlt } = countImagesMissingAlt(html);
  const wordCount = approximateWordCount(html);

  return { title, metaDescription, h1Count, imageCount, imagesMissingAlt, wordCount };
}

// Turns the raw stats into one score + letter grade, so the result reads
// like a quick verdict instead of a spreadsheet of numbers.
function computeHealthScore({ ok, title, metaDescription, h1Count, imageCount, imagesMissingAlt, responseTimeMs }) {
  let score = 0;
  const notes = [];

  if (ok) score += 20;
  else notes.push('Page did not return a healthy (2xx) status code.');

  if (title && title.length >= 10 && title.length <= 60) {
    score += 20;
  } else if (title) {
    score += 10;
    notes.push('Title exists but is outside the ideal 10–60 character range.');
  } else {
    notes.push('Missing a <title> tag.');
  }

  if (metaDescription) score += 15;
  else notes.push('Missing a meta description.');

  if (h1Count === 1) {
    score += 15;
  } else if (h1Count === 0) {
    notes.push('No H1 heading found.');
  } else {
    score += 5;
    notes.push('More than one H1 heading found — usually should be exactly one.');
  }

  if (imageCount === 0) {
    score += 15;
  } else {
    const cleanRatio = 1 - imagesMissingAlt / imageCount;
    score += Math.round(15 * cleanRatio);
    if (imagesMissingAlt > 0) notes.push(`${imagesMissingAlt} image(s) missing alt text.`);
  }

  if (responseTimeMs < 1000) {
    score += 15;
  } else if (responseTimeMs < 3000) {
    score += 8;
    notes.push('Response time is a bit slow (1–3s).');
  } else {
    notes.push('Response time is slow (3s+).');
  }

  const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'D';
  return { score, grade, notes };
}

async function auditUrl(url, { timeoutMs = 8000, fetchImpl = fetch } = {}) {
  if (!isValidUrl(url)) {
    const err = new Error('Invalid URL. Include http:// or https:// and a valid domain.');
    err.code = 'INVALID_URL';
    throw err;
  }

  const { hostname } = new URL(url);
  if (isBlockedHost(hostname)) {
    const err = new Error('That host is not allowed. Private and internal addresses are blocked for security.');
    err.code = 'BLOCKED_HOST';
    throw err;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  let response;
  try {
    response = await fetchImpl(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'PagePulse/1.0 (+https://digitalheroesco.com)' },
    });
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') {
      const err = new Error(`Request timed out after ${timeoutMs}ms.`);
      err.code = 'TIMEOUT';
      throw err;
    }
    const err = new Error(`Could not reach that URL (${e.message}).`);
    err.code = 'FETCH_FAILED';
    throw err;
  }
  clearTimeout(timeoutId);

  const responseTimeMs = Date.now() - start;
  const contentType = response.headers.get('content-type') || '';

  if (!contentType.toLowerCase().includes('text/html')) {
    const err = new Error(`That URL returned "${contentType || 'an unknown content type'}", not an HTML page.`);
    err.code = 'NOT_HTML';
    err.status = response.status;
    err.responseTimeMs = responseTimeMs;
    throw err;
  }

  const html = await response.text();
  const parsed = parseReport(html);
  const finalUrl = response.url || url;

  const base = {
    url,
    finalUrl,
    redirected: finalUrl !== url,
    status: response.status,
    ok: response.ok,
    responseTimeMs,
    ...parsed,
  };

  return { ...base, healthScore: computeHealthScore(base) };
}

module.exports = { isValidUrl, isBlockedHost, parseReport, computeHealthScore, auditUrl };
