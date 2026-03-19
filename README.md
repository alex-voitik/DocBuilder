# Datadog Doc Builder

Generate a Google Sheets-ready documentation spreadsheet for any combination of Datadog products and tech stacks — sourced live from [docs.datadoghq.com](https://docs.datadoghq.com).

---

## What it does

1. Enter one or more Datadog products (APM, Log Management, Synthetics, etc.)
2. Optionally add tech stacks per product (Python, Node.js, Java, Go, etc.) — leave empty to get **all** documentation for that product
3. Click **Generate Documentation** — the app searches Datadog's own documentation index in real time
4. Filter results by category using the checkbox panel
5. Export a CSV that opens directly in Google Sheets

Each row in the output contains:

| Column | Example |
|---|---|
| Product | `APM` |
| Tech Stack | `Python` or `Overview & Setup` |
| Category | `Tracing > Trace Collection > Libraries > Python` |
| Page Title | `Tracing Python Applications` |
| Documentation URL | `https://docs.datadoghq.com/tracing/...` |

---

## Running locally

**Requirements:** Node.js 18+

```bash
# Install dependencies
npm install

# Start both the dev server and API
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

The Vite dev server proxies `/api` requests to the Express backend running on port 3001. Both are started together with `npm run dev`.

To stop: `Ctrl+C`

---

## Deploying to Vercel

The repo is pre-configured for Vercel:

- **Frontend** — Vite build served as static files
- **Backend** — `api/search.ts` runs as a serverless function, automatically mapped to `/api/search`

Steps:
1. Push the repo to GitHub
2. Go to [vercel.com/new](https://vercel.com/new) and import the repo
3. No settings need changing — Vercel auto-detects Vite and the `api/` directory
4. Click **Deploy**

---

## How search works

Datadog's documentation site uses [Typesense](https://typesense.org/) as its search engine. This app queries that same index directly using the public read-only API key embedded in the Datadog docs frontend, so results are always live and reflect the current state of the documentation.

For each product + tech stack pair the app runs two types of queries concurrently:

- **Tech-specific search** — `"{product} {techStack}"` returning up to 100 results
- **Overview & Setup search** — `"{product}"` filtered to shallow URL paths (depth ≤ 2), returning up to 5 top-level landing pages

When no tech stack is provided, it paginates through all results for the product (up to ~1,000).

Duplicate pages are eliminated by stripping URL anchor fragments and deduplicating on the base URL.

---

## Project structure

```
.
├── api/
│   └── search.ts          # Vercel serverless function (production)
├── server/
│   ├── index.ts           # Express dev server (local only)
│   └── search.ts          # Core search logic shared by both
├── src/
│   ├── App.tsx
│   ├── components/
│   │   ├── CategoryFilter.tsx
│   │   ├── ProductEntryCard.tsx
│   │   └── ResultsTable.tsx
│   ├── utils/
│   │   └── exportCsv.ts
│   └── types.ts
├── vercel.json
└── vite.config.ts
```
