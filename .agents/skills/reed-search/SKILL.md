---
name: reed-search
version: 1.0.0
description: >
  Use this skill to search live UK job listings on reed.co.uk through Reed's
  official Jobseeker API, or to fetch the full text of a specific Reed posting.
  Covers every sector (office, trades, care, retail, hospitality, tech, public
  sector) and filters by town/postcode radius, salary, contract type, hours, and
  direct-employer vs agency. Trigger phrases: find a job in the UK, UK job search,
  jobs near <town>, Reed jobs, vacancies in Cornwall/Devon/<county>, look up this
  Reed job posting.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/reed-search/cli/src/cli.ts *)
---

# Reed Search Skill

Search live UK job listings from **[reed.co.uk](https://www.reed.co.uk)**, one of
the UK's largest job boards, via its **official Jobseeker API**: structured JSON,
no HTML scraping, nothing to break when the site is redesigned. **Zero runtime
dependencies.** It runs with just `bun`.

## 🔑 Needs a free API key

Register at <https://www.reed.co.uk/developers/jobseeker> and put the key in the
`.env` file at the repo root (gitignored; see `.env.example`):

```
REED_API_KEY=<your key>
```

Bun loads `.env` from the directory you run the CLI from, so run it from the repo
root as shown below. Without a key every call exits `1` with code `NO_API_KEY` and
a message saying where to get one. That is a setup problem, not a broken portal:
`/scrape` should report it and carry on with the other portals.

## When to use this skill

- Search UK jobs by keyword near a town, city, county or postcode
- Filter by salary band, permanent/contract/temp, full/part time, direct employers only
- Get the full description, closing date and apply link of a specific Reed job

## Commands

### Search job listings

```bash
bun run .agents/skills/reed-search/cli/src/cli.ts search [-q "<keywords>"] [-l "<place>"] [flags]
```

Key flags:
- `--query <text>` / `-q` — keywords (title, skill, role)
- `--location <text>` / `-l` — town, city, county or postcode (`Truro`, `TR1`, `Cornwall`)
- `--distance <miles>` — radius around `--location` (Reed's default is 10)
- `--jobage <days>` — keep jobs posted within N days. **Client-side**: the API has no
  date parameter, so this trims the page fetched. `meta.returned` shows how many came
  back before trimming; raise `--limit` if a recency-filtered page looks thin.
- `--salary-min <n>` / `--salary-max <n>` — annual salary bounds
- `--type permanent|contract|temp`
- `--hours full|part`
- `--employer direct|agency` — direct employers only, or recruitment agencies only
- `--graduate` — graduate roles only
- `--page <n>`, `--limit <n>` / `-n` (1–100, default 25)
- `--format json|table|plain` — default `json`

Put flags after the command name. A bare boolean flag (`--graduate`) must not be
directly followed by a positional word.

### Fetch full job detail

```bash
bun run .agents/skills/reed-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is a search result's `id`; a `https://www.reed.co.uk/jobs/<slug>/<id>` URL also
works. Returns the full (HTML-stripped) description, salary text, contract type,
hours, posted and closing dates, application count, and the external apply URL
when the employer takes applications off-site.

## Usage examples

```bash
# Web developer roles within 30 miles of Truro, table view
bun run .agents/skills/reed-search/cli/src/cli.ts search -q "web developer" -l "Truro" --distance 30 --format table

# Permanent marketing jobs in Cornwall from the last fortnight
bun run .agents/skills/reed-search/cli/src/cli.ts search -q "marketing" -l "Cornwall" --type permanent --jobage 14 --format table

# Direct employers only, £35k+
bun run .agents/skills/reed-search/cli/src/cli.ts search -q "project manager" -l "Plymouth" --employer direct --salary-min 35000

# Full details for one job
bun run .agents/skills/reed-search/cli/src/cli.ts detail 54321987 --format plain
```

## Output

Search JSON is `{ "meta": { "count", "page", "total", "returned" }, "results": [...] }`.
Each result carries `id`, `title`, `company`, `location`, `date` (posted,
`YYYY-MM-DD`), `deadline` (closing date), `salary`, `applications` and `url`.
Missing values are `null`. Errors go to **stderr** as `{ "error", "code" }` with exit
code `1`. Codes: `NO_API_KEY`, `BAD_ARG`, `BAD_ID`, `NOT_FOUND`, `SEARCH_FAILED`,
`DETAIL_FAILED`.

## Notes

- `deadline` is Reed's listing expiry date. It is a good proxy for the closing date,
  but the employer's own deadline in the description wins if they differ.
- `applications` is how many people applied through Reed so far. It is a rough
  competition signal, not a reason to skip a strong fit.
- Many Reed listings come from recruitment agencies, and the same role often
  appears from several agencies. `--employer direct` removes agency duplicates.
- Salaries hidden by the advertiser come back as `null`.
- The API retries 429/5xx with backoff. A rejected key fails fast with `NO_API_KEY`.
- Endpoint and field reference: `url-reference.md`.
