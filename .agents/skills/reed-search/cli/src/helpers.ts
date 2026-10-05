// Data source: the official reed.co.uk Jobseeker API (JSON). Unlike the
// HTML-scraping portals there is no markup to parse, but it does need a free API
// key (https://www.reed.co.uk/developers/jobseeker), sent as the HTTP Basic
// username with an empty password. The key is read from REED_API_KEY, which bun
// loads from a `.env` file in the directory the CLI is run from (the repo root
// for /scrape).

export const BASE_URL = "https://www.reed.co.uk/api/1.0"
export const SIGNUP_URL = "https://www.reed.co.uk/developers/jobseeker"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

/** A missing key is a setup problem, not a portal failure, so it gets its own code. */
export class MissingKeyError extends Error {}

export function apiKey(): string {
  const key = (process.env.REED_API_KEY ?? "").trim()
  if (!key) {
    throw new MissingKeyError(
      `REED_API_KEY is not set. Get a free key at ${SIGNUP_URL} and add ` +
        `REED_API_KEY=<key> to the .env file at the repo root.`,
    )
  }
  return key
}

const UA = "ai-job-search reed-search-skill/1.0"

/**
 * GET JSON from the Reed API. Retries 429/5xx with backoff; returns `null` on a
 * 404. A rejected key (401/403) fails fast with a clear message, since retrying
 * cannot fix it.
 */
export async function apiGet<T>(path: string): Promise<T | null> {
  const auth = "Basic " + btoa(`${apiKey()}:`)
  const url = `${BASE_URL}${path}`
  const maxRetries = 4
  let delay = 500

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let response: Response
    try {
      response = await fetch(url, {
        headers: { Authorization: auth, "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      })
    } catch (e) {
      throw new Error(`could not reach the Reed API (${e instanceof Error ? e.message : String(e)})`)
    }

    if (response.status === 401 || response.status === 403) {
      throw new MissingKeyError(
        `the Reed API rejected REED_API_KEY (${response.status}). Check the key at ${SIGNUP_URL}.`,
      )
    }
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Reed API request failed: ${response.status} ${response.statusText}`)
      }
      await new Promise((r) => setTimeout(r, delay + Math.floor(Math.random() * 500)))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return null
    if (!response.ok) {
      throw new Error(`Reed API request failed: ${response.status} ${response.statusText}`)
    }
    const body = (await response.json().catch(() => null)) as T | null
    if (body === null) throw new Error("Reed API returned an unparseable response body")
    return body
  }
  throw new Error("Reed API request failed after retries")
}

/** One job in a /search response (the fields this skill reads). */
export interface ReedSearchJob {
  jobId: number
  employerId?: number
  employerName?: string | null
  jobTitle: string
  locationName?: string | null
  minimumSalary?: number | null
  maximumSalary?: number | null
  currency?: string | null
  expirationDate?: string | null // dd/mm/yyyy
  date?: string | null // dd/mm/yyyy
  jobDescription?: string | null // a short snippet in search results
  applications?: number | null
  jobUrl?: string | null
}

export interface ReedSearchResponse {
  results: ReedSearchJob[]
  totalResults?: number
}

/** A /jobs/{id} response (the fields this skill reads). */
export interface ReedJobDetail {
  jobId: number
  employerName?: string | null
  jobTitle: string
  locationName?: string | null
  minimumSalary?: number | null
  maximumSalary?: number | null
  currency?: string | null
  salaryType?: string | null
  salary?: string | null
  datePosted?: string | null // dd/mm/yyyy
  expirationDate?: string | null // dd/mm/yyyy
  externalUrl?: string | null
  jobUrl?: string | null
  partTime?: boolean | null
  fullTime?: boolean | null
  contractType?: string | null
  jobDescription?: string | null // full HTML
  applicationCount?: number | null
}

/** A search result in the portal-skill contract shape; missing values are null. */
export interface JobResult {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null // YYYY-MM-DD
  deadline: string | null // YYYY-MM-DD
  salary: string | null
  applications: number | null
  url: string
}

export interface JobDetailResult extends JobResult {
  employment_type: string | null
  hours: string | null
  apply_url: string | null
  description: string | null
}

/** Reed dates are dd/mm/yyyy; convert to ISO YYYY-MM-DD. Anything else -> null. */
export function isoDate(raw: string | null | undefined): string | null {
  if (!raw) return null
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
}

export function formatSalary(
  min: number | null | undefined,
  max: number | null | undefined,
  currency: string | null | undefined,
): string | null {
  if (min == null && max == null) return null
  const sym = !currency || currency === "GBP" ? "£" : `${currency} `
  const fmt = (n: number) => `${sym}${Math.round(n).toLocaleString("en-GB")}`
  if (min != null && max != null && min !== max) return `${fmt(min)}–${fmt(max)}`
  return fmt((min ?? max) as number)
}

function jobUrl(id: number, url: string | null | undefined): string {
  return url || `https://www.reed.co.uk/jobs/${id}`
}

export function toResult(j: ReedSearchJob): JobResult {
  return {
    id: String(j.jobId),
    title: j.jobTitle || "(untitled)",
    company: j.employerName || null,
    location: j.locationName || null,
    date: isoDate(j.date),
    deadline: isoDate(j.expirationDate),
    salary: formatSalary(j.minimumSalary, j.maximumSalary, j.currency),
    applications: j.applications ?? null,
    url: jobUrl(j.jobId, j.jobUrl),
  }
}

export function toDetail(j: ReedJobDetail): JobDetailResult {
  const hours = j.fullTime ? "full-time" : j.partTime ? "part-time" : null
  return {
    id: String(j.jobId),
    title: j.jobTitle || "(untitled)",
    company: j.employerName || null,
    location: j.locationName || null,
    date: isoDate(j.datePosted),
    deadline: isoDate(j.expirationDate),
    salary: j.salary || formatSalary(j.minimumSalary, j.maximumSalary, j.currency),
    applications: j.applicationCount ?? null,
    url: jobUrl(j.jobId, j.jobUrl),
    employment_type: j.contractType || null,
    hours,
    apply_url: j.externalUrl || null,
    description: cleanHtml(j.jobDescription),
  }
}

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&pound;/g, "£")
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&amp;/g, "&")
}

/** Strip a description's HTML into readable prose. Null for empty input. */
export function cleanHtml(html: string | null | undefined): string | null {
  if (!html) return null
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
  const text = decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return text || null
}

/** A Reed job id from a bare id or a reed.co.uk/jobs/<slug>/<id> URL. */
export function parseJobId(input: string): string | null {
  const trimmed = input.trim()
  if (/^\d+$/.test(trimmed)) return trimmed
  const m = trimmed.match(/reed\.co\.uk\/jobs\/(?:[^/?#]+\/)?(\d+)/)
  return m ? m[1] : null
}

/** True when an ISO date is within the last `days` days of `now`. Undated jobs pass. */
export function withinDays(iso: string | null, days: number, now: Date = new Date()): boolean {
  if (!iso) return true
  const posted = Date.parse(`${iso}T00:00:00Z`)
  if (isNaN(posted)) return true
  return now.getTime() - posted <= days * 86_400_000
}
