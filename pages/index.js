import { useState } from 'react';
import Head from 'next/head';

const STAT_LABELS = {
  status: 'HTTP status',
  responseTimeMs: 'Response time',
  wordCount: 'Word count (approx.)',
  h1Count: 'H1 tags',
  imageCount: 'Images found',
  imagesMissingAlt: 'Images missing alt text',
};

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function runAudit(e) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong.');
      } else {
        setResult(data);
      }
    } catch (err) {
      setError('Could not reach the audit service. Try again in a moment.');
    } finally {
      setLoading(false);
    }
  }

  const pulseState = loading ? 'scanning' : error ? 'flat' : result ? 'healthy' : 'idle';

  return (
    <>
      <Head>
        <title>Page Pulse — instant URL audits</title>
        <meta name="description" content="Paste a URL, get an instant health report: status, speed, and on-page basics." />
      </Head>

      <main className="page">
        <div className="eyebrow">URL AUDIT TOOL</div>
        <h1>Page Pulse</h1>
        <p className="tagline">Paste a URL. Get its vitals back in seconds.</p>

        <form onSubmit={runAudit} className="form">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            aria-label="URL to audit"
            required
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Scanning…' : 'Run audit'}
          </button>
        </form>

        <svg className="pulseline" viewBox="0 0 600 60" preserveAspectRatio="none" aria-hidden="true">
          <polyline
            className={`pulse-path pulse-${pulseState}`}
            fill="none"
            strokeWidth="2"
            points="0,30 60,30 90,10 120,50 150,30 300,30 330,8 360,52 390,30 600,30"
          />
        </svg>

        {error && (
          <div className="card error">
            <div className="card-title">Audit failed</div>
            <p>{error}</p>
          </div>
        )}

        {result && (
          <div className="card">
            <div className="card-title-row">
              <div className="card-title">Report for {result.url}</div>
              {result.healthScore && (
                <div className={`score-badge grade-${result.healthScore.grade}`}>
                  {result.healthScore.score}/100 · {result.healthScore.grade}
                </div>
              )}
            </div>

            {result.redirected && (
              <p className="redirect-note">Redirected to {result.finalUrl}</p>
            )}

            <div className="stats">
              {Object.entries(STAT_LABELS).map(([key, label]) => (
                <div className="stat" key={key}>
                  <div className="stat-label">{label}</div>
                  <div className="stat-value">
                    {key === 'responseTimeMs' ? `${result[key]} ms` : String(result[key])}
                  </div>
                </div>
              ))}
            </div>

            {result.healthScore && result.healthScore.notes.length > 0 && (
              <div className="notes">
                <div className="stat-label">What would improve the score</div>
                <ul>
                  {result.healthScore.notes.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="text-fields">
              <div>
                <div className="stat-label">Title</div>
                <div className="text-value">{result.title || '— not found —'}</div>
              </div>
              <div>
                <div className="stat-label">Meta description</div>
                <div className="text-value">{result.metaDescription || '— not found —'}</div>
              </div>
            </div>
          </div>
        )}

        <footer>
          Built for Digital Heroes Training Task —{' '}
          <a href="https://digitalheroesco.com" target="_blank" rel="noreferrer">
            digitalheroesco.com
          </a>
        </footer>
      </main>

      <style jsx>{`
        .page {
          max-width: 640px;
          margin: 0 auto;
          padding: 64px 20px 40px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
        .eyebrow {
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          letter-spacing: 0.14em;
          color: var(--pulse);
        }
        h1 {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 44px;
          margin: 10px 0 6px;
        }
        .tagline {
          color: var(--muted);
          margin: 0 0 32px;
        }
        .form {
          display: flex;
          gap: 10px;
          width: 100%;
        }
        input {
          flex: 1;
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: var(--radius);
          padding: 12px 14px;
          color: var(--text);
          font-size: 15px;
        }
        input:focus {
          outline: 2px solid var(--pulse);
          outline-offset: 1px;
        }
        button {
          background: var(--pulse);
          color: var(--ink);
          border: none;
          border-radius: var(--radius);
          padding: 12px 20px;
          font-weight: 600;
          cursor: pointer;
        }
        button:disabled {
          opacity: 0.6;
          cursor: default;
        }
        button:focus-visible {
          outline: 2px solid var(--text);
          outline-offset: 2px;
        }
        .pulseline {
          width: 100%;
          height: 44px;
          margin: 22px 0 6px;
        }
        .pulse-path {
          stroke: var(--line);
        }
        .pulse-idle {
          stroke: var(--line);
        }
        .pulse-scanning {
          stroke: var(--pulse);
          stroke-dasharray: 12 8;
          animation: travel 1s linear infinite;
        }
        .pulse-healthy {
          stroke: var(--pulse);
        }
        .pulse-flat {
          stroke: var(--danger);
        }
        @keyframes travel {
          to {
            stroke-dashoffset: -40;
          }
        }
        .card {
          width: 100%;
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: var(--radius);
          padding: 22px;
          margin-top: 18px;
          text-align: left;
        }
        .card.error {
          border-color: var(--danger);
        }
        .card-title {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 16px;
          margin-bottom: 14px;
          word-break: break-all;
        }
        .card-title-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          flex-wrap: wrap;
        }
        .card-title-row .card-title {
          margin-bottom: 0;
          flex: 1;
          min-width: 0;
        }
        .score-badge {
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
          font-weight: 600;
          padding: 4px 10px;
          border-radius: 999px;
          white-space: nowrap;
          border: 1px solid var(--line);
        }
        .grade-A,
        .grade-B {
          color: var(--pulse);
          border-color: var(--pulse);
        }
        .grade-C {
          color: var(--warn);
          border-color: var(--warn);
        }
        .grade-D {
          color: var(--danger);
          border-color: var(--danger);
        }
        .redirect-note {
          font-size: 13px;
          color: var(--muted);
          margin: 8px 0 14px;
          word-break: break-all;
        }
        .notes {
          margin-top: 18px;
          padding-top: 14px;
          border-top: 1px solid var(--line);
        }
        .notes ul {
          margin: 8px 0 0;
          padding-left: 18px;
          font-size: 13px;
          color: var(--text);
        }
        .notes li {
          margin-bottom: 4px;
        }
        .stats {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 14px;
          margin-bottom: 18px;
        }
        .stat-label {
          font-size: 12px;
          color: var(--muted);
          margin-bottom: 4px;
        }
        .stat-value,
        .text-value {
          font-family: 'JetBrains Mono', monospace;
          font-size: 15px;
        }
        .text-fields {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding-top: 14px;
          border-top: 1px solid var(--line);
        }
        .text-value {
          font-size: 14px;
          color: var(--text);
        }
        footer {
          margin-top: 48px;
          font-size: 12px;
          color: var(--muted);
        }
        @media (max-width: 480px) {
          h1 {
            font-size: 34px;
          }
          .form {
            flex-direction: column;
          }
          .stats {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </>
  );
}
