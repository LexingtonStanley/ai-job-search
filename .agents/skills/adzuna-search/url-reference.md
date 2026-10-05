# Adzuna Jobs API reference

The endpoints, parameters and response fields this skill depends on. Update this
file (and `cli/src/helpers.ts`) if the API changes. Official docs:
<https://developer.adzuna.com/docs/search>. Base URL
`https://api.adzuna.com/v1/api` (overridable via `ADZUNA_API_URL`).

## Authentication

`app_id` and `app_key` query parameters on every request. A bad pair returns
`401`/`403`.

## `GET /jobs/{country}/search/{page}`

| Param | CLI flag | Notes |
|-------|----------|-------|
| `what` | `--query` | keywords anywhere in the ad |
| `title_only` | `--query` with `--title-only` | keywords in the title only |
| `what_exclude` | `--exclude` | space-separated words to exclude |
| `where` | `--location` | place name or postcode |
| `distance` | `--distance` | **kilometres** |
| `max_days_old` | `--jobage` | server-side |
| `salary_min` / `salary_max` | `--salary-min` / `--salary-max` | |
| `permanent` / `contract` | `--type` | `1` |
| `full_time` / `part_time` | `--hours` | `1` |
| `category` | `--category` | a tag from `/categories` |
| `sort_by` | `--sort` | `date`, `relevance`, `salary` |
| `results_per_page` | `--limit` | max 50 |

Response: `{ "count", "mean", "results": [ ... ] }`. Fields read per result: `id`,
`title`, `description` (a ~500-character snippet, may contain `<strong>`
highlights), `created` (ISO), `redirect_url`, `company.display_name`,
`location.display_name`, `salary_min`, `salary_max`, `salary_is_predicted`
(`1` = Adzuna's estimate), `contract_type`, `contract_time`, `category.label`.

Errors with a body carry `display` (human message) and `exception` (code).

## `GET /jobs/{country}/categories`

`{ "results": [ { "label", "tag" } ] }`.

## Not available

No job-by-id endpoint and no full descriptions. Fetch `redirect_url` for the
complete ad.

## Verification status

Built 2026-10-01 against the published docs above (the search response fixture in
`cli/tests/commands.test.ts` follows the documented example). Confirm against a
live response the first time credentials are available.
