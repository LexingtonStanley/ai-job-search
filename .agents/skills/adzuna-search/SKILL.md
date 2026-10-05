---
name: adzuna-search
version: 1.0.0
description: >
  Use this skill to search live UK job listings (and the other Adzuna markets: US,
  DE, FR, AU, CA, ...) through Adzuna's official Jobs API. Adzuna aggregates ads
  from employer career sites and other job boards, so it is the broadest single
  UK source, across every sector. Filters by place and radius, recency, salary,
  contract type, hours, and category. Trigger phrases: find a job in the UK, UK
  job search, jobs near <town>, vacancies in <county>, Adzuna jobs, broad job
  search across boards.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/adzuna-search/cli/src/cli.ts *)
---

# Adzuna Search Skill

Search live job listings via the **official [Adzuna](https://www.adzuna.co.uk) Jobs
API**. Adzuna aggregates ads from employer career pages and many other boards, so one
query reaches far beyond a single site. Structured JSON, no HTML scraping, **zero
runtime dependencies**. It runs with just `bun`. The UK (`gb`) is the default
market; `--country` switches to any other Adzuna market.

## 🔑 Needs a free app id + key

Register at <https://developer.adzuna.com> and put both values in the `.env` file at
the repo root (gitignored; see `.env.example`):

```
ADZUNA_APP_ID=<your app id>
ADZUNA_APP_KEY=<your app key>
```

Bun loads `.env` from the directory you run the CLI from, so run it from the repo
root as shown below. Without credentials every call exits `1` with code
`NO_API_KEY`. That is a setup problem, not a broken portal: `/scrape` should report
it and carry on with the other portals.

## ⚠️ Search-only: no detail command

The Adzuna API has **no job-by-id lookup** and returns only a ~500-character
`snippet` of each description. To read a full posting (for `/scrape` Step 2 or
`/apply`), fetch the result's `url` with WebFetch. It is an Adzuna landing link that
redirects to the original ad. Running `detail` exits `1` with code
`NO_DETAIL_ENDPOINT`; the `/scrape health` detail probe should treat that as
expected, not as a failure.

## When to use this skill

- Broad UK job search by keyword near a town, county, region or postcode
- Filter by recency (server-side), salary, permanent/contract, full/part time, category
- Sweep many boards at once when a niche board has no CLI of its own

## Commands

### Search job listings

```bash
bun run .agents/skills/adzuna-search/cli/src/cli.ts search [-q "<keywords>"] [-l "<place>"] [flags]
```

Key flags:
- `--query <text>` / `-q` — keywords, matched anywhere in the ad
- `--title-only` — match `--query` against job titles only (much tighter results)
- `--exclude <words>` — drop ads containing any of these words, e.g. `--exclude "senior lead"`
- `--location <text>` / `-l` — town, county, region or postcode (`Truro`, `Cornwall`, `South West England`)
- `--distance <km>` — radius around `--location`, **in kilometres**
- `--jobage <days>` — posted within N days (server-side, exact)
- `--salary-min <n>` / `--salary-max <n>` — annual salary bounds
- `--type permanent|contract`
- `--hours full|part`
- `--category <tag>` — an Adzuna category tag such as `it-jobs`. List the live tags
  with the `categories` command below; never guess one. An unknown tag is rejected
  with Adzuna's own message.
- `--sort date|relevance|salary` — default is Adzuna's own ranking
- `--country <cc>` — default `gb`
- `--page <n>`, `--limit <n>` / `-n` (1–50, default 25)
- `--format json|table|plain` — default `json`

Put flags after the command name. A bare boolean flag (`--title-only`) must not be
directly followed by a positional word.

### List category tags

```bash
bun run .agents/skills/adzuna-search/cli/src/cli.ts categories [--country <cc>] [--format json|table]
```

## Usage examples

```bash
# Web developer roles within 40 km of Truro, newest first
bun run .agents/skills/adzuna-search/cli/src/cli.ts search -q "web developer" -l "Truro" --distance 40 --sort date --format table

# Anything titled "operations manager" in Cornwall from the last fortnight
bun run .agents/skills/adzuna-search/cli/src/cli.ts search -q "operations manager" --title-only -l "Cornwall" --jobage 14 --format table

# Permanent IT jobs across the South West
bun run .agents/skills/adzuna-search/cli/src/cli.ts search --category it-jobs -l "South West England" --type permanent --format table
```

## Output

Search JSON is `{ "meta": { "count", "page", "total", "source" }, "results": [...] }`.
Each result carries `id`, `title`, `company`, `location`, `date` (`YYYY-MM-DD`),
`salary`, `salary_is_estimate`, `employment_type`, `hours`, `category`, `snippet` and
`url`. Missing values are `null`. Errors go to **stderr** as `{ "error", "code" }`
with exit code `1`. Codes: `NO_API_KEY`, `BAD_ARG`, `SEARCH_FAILED`,
`NO_DETAIL_ENDPOINT`.

## Notes

- **`salary_is_estimate: true` means Adzuna guessed the salary**; the advertiser did
  not state it. Never quote an estimated salary to the user as the advertised figure.
  Table output marks it with `*`.
- Because Adzuna aggregates, the same job often also appears on Reed or LinkedIn.
  `/scrape`'s dedupe on company + title handles that; the URLs will differ.
- Adzuna's terms ask for attribution when showing its results, so table and plain
  output end with "Jobs by Adzuna" and JSON carries `meta.source`.
- The free tier is rate-limited. A `/scrape` run makes a handful of calls, well
  inside it. The CLI retries 429/5xx with backoff.
- Endpoint and field reference: `url-reference.md`.
