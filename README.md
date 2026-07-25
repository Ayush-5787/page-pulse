# Page Pulse

A small tool that audits any URL: paste a link, get back its HTTP status, response
time, title, meta description, heading count, image accessibility gaps, and an
approximate word count.

Live: [add your deployed URL here]
Repo: [add your GitHub URL here]

## Setup

```bash
npm install
npm run dev      # starts the app at http://localhost:3000
npm test         # runs the test suite
```

Requires Node.js 18+ (for native `fetch` and `AbortController`).

## API contract

**POST** `/api/audit`

Request body:
```json
{ "url": "https://example.com" }
```

Success response — `200 OK`:
```json
{
  "url": "https://example.com",
  "finalUrl": "https://example.com/",
  "redirected": false,
  "status": 200,
  "ok": true,
  "responseTimeMs": 184,
  "title": "Example Domain",
  "metaDescription": null,
  "h1Count": 1,
  "imageCount": 0,
  "imagesMissingAlt": 0,
  "wordCount": 28,
  "healthScore": {
    "score": 85,
    "grade": "A",
    "notes": ["Missing a meta description."]
  }
}
```

Error responses — shape is always `{ "error": string, "code": string }`:

| Situation | Status | code |
|---|---|---|
| Missing `url` field | 400 | `MISSING_URL` |
| Malformed URL / wrong protocol | 400 | `INVALID_URL` |
| Target is a private/internal address (see design decision 4) | 403 | `BLOCKED_HOST` |
| Target didn't respond in time (8s) | 504 | `TIMEOUT` |
| Target returned non-HTML (e.g. a JSON API, a PDF, an image) | 422 | `NOT_HTML` |
| DNS failure, connection refused, etc. | 502 | `FETCH_FAILED` |
| Wrong HTTP method | 405 | `METHOD_NOT_ALLOWED` |

## Design decisions

1. **No HTML-parsing dependency (no cheerio/jsdom).** The extraction logic
   (`lib/audit.js`) uses small, targeted regular expressions instead of a full DOM
   parser. For the fields this tool needs — a title, one meta tag, a tag count, an
   attribute check — a full parser is more machinery than the job requires, and
   dropping it means `npm install` has nothing heavy to fetch. The trade-off is
   real: regex parsing is less robust against deeply malformed or unusual HTML
   than a proper DOM parser. If this tool needed to handle arbitrary hostile
   markup at scale, I'd switch to `cheerio`.

2. **Parsing logic is separated from the network call.** `parseReport(html)` is a
   pure function that takes a string and returns an object — no fetching inside
   it. `auditUrl()` handles the network side and calls `parseReport` once it has
   the HTML. This is what makes the test suite possible without hitting the
   network: the parsing tests feed it raw HTML strings directly, and the
   error-path tests inject a mock `fetchImpl` instead of mocking the global
   `fetch`.

3. **Errors are typed, not just thrown.** Every failure path attaches a `code`
   (`INVALID_URL`, `BLOCKED_HOST`, `TIMEOUT`, `NOT_HTML`, `FETCH_FAILED`) to the
   error object. The API route maps each code to a specific HTTP status instead
   of collapsing every failure into a generic 500. This means a client (or a
   future caller of this API) can branch on `code` instead of parsing an error
   string.

4. **The tool blocks requests to private/internal addresses (basic SSRF
   protection).** This app fetches whatever URL a visitor gives it — which
   means, without a check, anyone could point it at `http://192.168.1.1` or
   `http://localhost:PORT` and use this server as a proxy to probe a network it
   shouldn't be able to reach. `isBlockedHost()` blocks obvious loopback and
   private-IP ranges before any request goes out. Limitation, stated honestly:
   this checks the literal hostname in the URL, not the IP it actually resolves
   to — a determined attacker could still get around it with DNS rebinding. A
   production version would resolve the hostname first and check the resulting
   IP, but the literal check covers the common case and demonstrates the
   awareness without over-engineering a training task.

5. **The report includes a computed health score, not just raw numbers.**
   `computeHealthScore()` turns the six raw fields into one 0–100 score, a
   letter grade, and a short list of what's actually wrong. This wasn't
   explicitly asked for, but a URL auditor that returns a wall of numbers with
   no verdict is less useful than one that tells you, at a glance, whether the
   page is actually healthy — the score is fully derived from the same data
   already being returned, so it costs nothing to compute and adds a genuine
   "so what" to the report.

## AI use disclosure

*(Edit this before submitting — see the note in the chat for what to say here.)*
