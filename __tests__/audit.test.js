const { isValidUrl, isBlockedHost, parseReport, computeHealthScore, auditUrl } = require('../lib/audit');

describe('isValidUrl', () => {
  test('accepts valid http(s) urls', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('http://example.com/path?q=1')).toBe(true);
  });

  test('rejects non-http(s) or malformed input', () => {
    expect(isValidUrl('not a url')).toBe(false);
    expect(isValidUrl('ftp://example.com')).toBe(false);
    expect(isValidUrl('')).toBe(false);
  });
});

describe('parseReport — happy path', () => {
  const html = `
    <html>
      <head>
        <title>  Example Page  </title>
        <meta name="description" content="A sample page for testing.">
      </head>
      <body>
        <h1>Welcome</h1>
        <h1>Second heading</h1>
        <img src="a.png" alt="A photo">
        <img src="b.png" alt="">
        <img src="c.png">
        <p>This is some simple body text used to check word counting properly.</p>
      </body>
    </html>
  `;
  const report = parseReport(html);

  test('extracts a trimmed title', () => {
    expect(report.title).toBe('Example Page');
  });

  test('extracts the meta description', () => {
    expect(report.metaDescription).toBe('A sample page for testing.');
  });

  test('counts h1 tags', () => {
    expect(report.h1Count).toBe(2);
  });

  test('counts images and flags missing/empty alt text', () => {
    expect(report.imageCount).toBe(3);
    expect(report.imagesMissingAlt).toBe(2); // one empty alt="", one absent
  });

  test('approximates a sensible word count from body text', () => {
    expect(report.wordCount).toBe(15);
  });
});

describe('parseReport — sparse page', () => {
  test('handles a page with no title, meta, or images without throwing', () => {
    const html = '<html><body><p>Just text.</p></body></html>';
    const report = parseReport(html);
    expect(report.title).toBeNull();
    expect(report.metaDescription).toBeNull();
    expect(report.h1Count).toBe(0);
    expect(report.imageCount).toBe(0);
  });
});

describe('auditUrl — failure case 1: invalid URL', () => {
  test('rejects before making any network call', async () => {
    await expect(auditUrl('not-a-url')).rejects.toThrow('Invalid URL');
  });
});

describe('auditUrl — failure case 2: non-HTML response', () => {
  test('rejects a JSON/non-HTML response with a clear error', async () => {
    const mockFetch = async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () => '{}',
    });

    await expect(auditUrl('https://example.com/data.json', { fetchImpl: mockFetch })).rejects.toThrow(
      'did not return'
    );
  });
});

describe('auditUrl — happy path (mocked network)', () => {
  test('returns a full report for a normal HTML response', async () => {
    const html = '<html><head><title>Hi</title></head><body><h1>Hi</h1></body></html>';
    const mockFetch = async () => ({
      ok: true,
      status: 200,
      url: 'https://example.com',
      headers: { get: () => 'text/html; charset=utf-8' },
      text: async () => html,
    });

    const result = await auditUrl('https://example.com', { fetchImpl: mockFetch });
    expect(result.status).toBe(200);
    expect(result.title).toBe('Hi');
    expect(typeof result.responseTimeMs).toBe('number');
    expect(typeof result.healthScore.score).toBe('number');
  });

  test('flags redirects and reports the final URL', async () => {
    const mockFetch = async () => ({
      ok: true,
      status: 200,
      url: 'https://example.com/final-page',
      headers: { get: () => 'text/html' },
      text: async () => '<html><body><h1>hi</h1></body></html>',
    });

    const result = await auditUrl('https://example.com/old-page', { fetchImpl: mockFetch });
    expect(result.redirected).toBe(true);
    expect(result.finalUrl).toBe('https://example.com/final-page');
  });
});

describe('isBlockedHost — SSRF protection', () => {
  test('blocks common internal/private hosts', () => {
    expect(isBlockedHost('localhost')).toBe(true);
    expect(isBlockedHost('127.0.0.1')).toBe(true);
    expect(isBlockedHost('192.168.1.5')).toBe(true);
    expect(isBlockedHost('10.0.0.1')).toBe(true);
    expect(isBlockedHost('172.20.0.1')).toBe(true);
  });

  test('does not block public domains', () => {
    expect(isBlockedHost('example.com')).toBe(false);
    expect(isBlockedHost('172.15.0.1')).toBe(false); // just outside the blocked 172.16-31 range
  });
});

describe('auditUrl — failure case 3: blocked private host', () => {
  test('refuses to audit a private/internal address', async () => {
    await expect(auditUrl('http://192.168.1.1/admin')).rejects.toThrow('not allowed');
  });
});

describe('computeHealthScore', () => {
  test('gives a strong page a high score and grade A', () => {
    const result = computeHealthScore({
      ok: true,
      title: 'A Perfectly Reasonable Page Title',
      metaDescription: 'A clear description of the page.',
      h1Count: 1,
      imageCount: 2,
      imagesMissingAlt: 0,
      responseTimeMs: 200,
    });
    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.grade).toBe('A');
    expect(result.notes).toHaveLength(0);
  });

  test('gives a broken page a low score with explanatory notes', () => {
    const result = computeHealthScore({
      ok: false,
      title: null,
      metaDescription: null,
      h1Count: 0,
      imageCount: 5,
      imagesMissingAlt: 5,
      responseTimeMs: 5000,
    });
    expect(result.score).toBeLessThan(50);
    expect(result.grade).toBe('D');
    expect(result.notes.length).toBeGreaterThan(0);
  });
});
