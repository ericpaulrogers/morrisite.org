# Ask the guide: the answer service

This folder holds the small server program (a Cloudflare Worker) behind the site's "Ask the guide"
page. It answers only from the guide's own pages, checks each answer against those pages before
returning it, and keeps no record of the questions.

GitHub deploys it automatically (`.github/workflows/ask-the-guide.yml`) every time the site's pages
change, so its passages always match the published site. Until the secrets below are set, the job
does nothing. GitHub Pages does not serve this folder, because its name starts with an underscore.

## One-time setup (about 30 minutes, all in web pages)

Keys go only into the account pages named below, never into email or chat.

### 1. Anthropic: the API key and a spending limit
1. Sign in to the Claude Console (platform.claude.com) and set up billing with a small prepaid credit.
2. Set a **monthly spending limit** (for example $10). It caps the bill whatever the traffic.
3. Create an API key named `morrisite-ask` and keep the window open for step 3.

### 2. Cloudflare: the free account
1. Create a free account at dash.cloudflare.com.
2. Open **Workers & Pages** once and choose a `workers.dev` subdomain (any name).
3. **Turnstile** (the human check): add a widget named `morrisite ask` for the hostname
   `morrisite.org`, mode *Managed*. Note the **site key** (public) and the **secret key**.
4. **KV** (the visitor counts): create a namespace named `morrisite-ask-rate` and note its **ID**.
5. **API token**: My Profile › API Tokens › Create Token › template *Edit Cloudflare Workers*.
   Note the token, and the **Account ID** shown on the Workers & Pages overview.

### 3. GitHub: hand the keys to the deploy job
In this repository: Settings › Secrets and variables › Actions.

| Secrets tab | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | the Cloudflare API token |
| `CLOUDFLARE_ACCOUNT_ID` | the Cloudflare Account ID |
| `ANTHROPIC_API_KEY` | the Anthropic API key |
| `TURNSTILE_SECRET` | the Turnstile secret key |
| `TEST_TOKEN` | any long made-up phrase (lets the test job skip the human check) |

| Variables tab | Value |
|---|---|
| `RATE_KV_ID` | the KV namespace ID |

### 4. First deploy and the live tests
Actions › *Ask the guide* › Run workflow (leave "Run the live tests" ticked). The job summary gives
the Worker's address and a table of about 20 test questions answered by the real model
(about a cent). Then the page itself (`ask.html`) can be built with the Worker address and the
Turnstile site key. It stays off the site until the reviewed answers and test results are approved.

## Running costs (November 2026 prices)
- Claude Haiku 5.5: about $0.0005 per AI answer; at most about $7.50 a month at the 500-a-day cap.
- Reviewed answers, people lookups and questions the guide has nothing on never reach the model.
- Cloudflare: free plan. Each question takes about 1–3 ms of the 10 ms allowed, because the
  search index is precomputed (`pack_index.mjs`). The free storage allowance (1,000 writes a day)
  matches the 500-question daily cap.

## Settings (wrangler.toml)
`MODEL` (claude-haiku-5-5), `HOURLY_PER_IP` (15), `DAILY_TOTAL` (500), `ALLOWED_ORIGIN`.

## Files
- `worker.js`: the server program. `askcore.js`: search, people lookup, prompt, answer checks (shared with the page).
- `build_index.py`: splits the published pages into passages. `pack_index.mjs`: precomputes the search index.
- `live_tests.mjs`, `tests.json`: tests with the real model, run from the GitHub job.
