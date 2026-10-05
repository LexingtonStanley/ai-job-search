// Data source: the official Adzuna Jobs API (JSON). Adzuna aggregates postings
// from employer sites and other boards, so it is the broadest UK source here.
// Needs a free app id + key (https://developer.adzuna.com), read from
// ADZUNA_APP_ID / ADZUNA_APP_KEY, which bun loads from a `.env` file in the
// directory the CLI is run from (the repo root for /scrape).
//
// The API has no job-by-id endpoint and returns only a ~500-character snippet
// of each description, so this skill is search-only: the full posting lives at
// the result's `url`.

export const SIGNUP_URL = "https://developer.adzuna.com"
export const COUNTRIES = [
  "gb", "at", "au", "be", "br", "ca", "ch", "de", "es", "fr", "in", "it", "mx", "nl", "nz", "pl", "sg", "us", "za",
]

export function baseUrl(): string {
  const raw = (process.env.ADZUNA_API_URL ?? "").trim()
  return (raw || "https://api.adzuna.com/v1/api").replace(/\/+$/, "")
}

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

/** A missing or rejected key is a setup problem, not a portal failure. */
export class MissingKeyError extends Error {}

export function credentials(): { appId: string; appKey: string } {
  const appId = (process.env.ADZUNA_APP_ID ?? "").trim()
  const appKey = (process.env.ADZUNA_APP_KEY ?? "").trim()
  if (!appId || !appKey) {
    throw new MissingKeyError(
      `ADZUNA_APP_ID and ADZUNA_APP_KEY must both be set. Get a free pair at ${SIGNUP_URL} ` +
        `and add them to the .env file at the repo root.`,
    )
  }
  return { appId, appKey }
}

const UA = "ai-job-search adzuna-search-skill/1.0"

/**
 * GET JSON from the Adzuna API. Retries 429/5xx with backoff. A rejected key
 * (401/403) fails fast, since retrying cannot fix it.
 */
export async function apiGet<T>(url: string): Promise<T> {
  const maxRetries = 4
  let delay = 1000

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let response: Response
    try {
      response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      })
    } catch (e) {
      throw new Error(`could not reach the Adzuna API (${e instanceof Error ? e.message : String(e)})`)
    }

    if (response.status === 401 || response.status === 403) {
      throw new MissingKeyError(
        `the Adzuna API rejected ADZUNA_APP_ID/ADZUNA_APP_KEY (${response.status}). Check them at ${SIGNUP_URL}.`,
      )
    }
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Adzuna API request failed: ${response.status} ${response.statusText}`)
      }
      await new Promise((r) => setTimeout(r, delay + Math.floor(Math.random() * 500)))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    const body = (await response.json().catch(() => null)) as (T & { display?: string; exception?: string }) | null
    if (!response.ok) {
      // Adzuna explains bad parameters in `display` (e.g. an unknown category tag).
      throw new Error(body?.display || body?.exception || `Adzuna API request failed: ${response.status} ${response.statusText}`)
    }
    if (body === null) throw new Error("Adzuna API returned an unparseable response body")
    return body
  }
  throw new Error("Adzuna API request failed after retries")
}

/** One job in a search response (the fields this skill reads). */
export interface AdzunaJob {
  id: string
  title: string
  description?: string | null // a snippet, not the full posting
  created?: string | null // ISO timestamp
  redirect_url: string
  company?: { display_name?: string | null } | null
  location?: { display_name?: string | null; area?: string[] } | null
  salary_min?: number | null
  salary_max?: number | null
  salary_is_predicted?: number | string | null // 1 = Adzuna's estimate, not the advertiser's
  contract_type?: string | null // permanent | contract
  contract_time?: string | null // full_time | part_time
  category?: { label?: string | null; tag?: string | null } | null
}

export interface AdzunaSearchResponse {
  count?: number
  mean?: number
  results: AdzunaJob[]
}

/** A search result in the portal-skill contract shape; missing values are null. */
export interface JobResult {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null // YYYY-MM-DD
  salary: string | null
  salary_is_estimate: boolean
  employment_type: string | null
  hours: string | null
  category: string | null
  snippet: string | null
  url: string
}

export function formatSalary(min: number | null | undefined, max: number | null | undefined, country: string): string | null {
  if (min == null && max == null) return null
  const sym: Record<string, string> = { gb: "£", us: "$", au: "A$", ca: "C$", nz: "NZ$", sg: "S$" }
  const prefix = sym[country] ?? ""
  const fmt = (n: number) => `${prefix}${Math.round(n).toLocaleString("en-GB")}`
  if (min != null && max != null && Math.round(min) !== Math.round(max)) return `${fmt(min)}–${fmt(max)}`
  return fmt((min ?? max) as number)
}

export function toResult(j: AdzunaJob, country: string): JobResult {
  const hours = j.contract_time === "full_time" ? "full-time" : j.contract_time === "part_time" ? "part-time" : null
  return {
    id: String(j.id),
    title: cleanText(j.title) || "(untitled)",
    company: cleanText(j.company?.display_name),
    location: cleanText(j.location?.display_name),
    date: j.created ? j.created.slice(0, 10) : null,
    salary: formatSalary(j.salary_min, j.salary_max, country),
    salary_is_estimate: String(j.salary_is_predicted ?? "0") === "1",
    employment_type: j.contract_type || null,
    hours,
    category: j.category?.label || null,
    snippet: cleanText(j.description),
    url: j.redirect_url,
  }
}

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

/**
 * Strip tags (Adzuna wraps matched keywords in <strong>), decode entities and
 * collapse whitespace. Null for empty input.
 */
export function cleanText(raw: string | null | undefined): string | null {
  if (!raw) return null
  const text = raw
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;?/g, " ")
    .replace(/&pound;/g, "£")
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
  return text || null
}
