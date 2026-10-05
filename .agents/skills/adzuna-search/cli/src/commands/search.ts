import { apiGet, baseUrl, credentials, toResult, writeError, MissingKeyError, type AdzunaSearchResponse, type JobResult } from "../helpers.js"

export interface SearchOpts {
  query?: string
  exclude?: string
  titleOnly: boolean
  location?: string
  distance?: number // km
  jobage?: number // days
  salaryMin?: number
  salaryMax?: number
  type?: "permanent" | "contract"
  hours?: "full" | "part"
  category?: string
  sort?: "date" | "relevance" | "salary"
  country: string
  page: number
  limit: number
  format: "json" | "table" | "plain"
}

export function buildUrl(opts: SearchOpts, creds: { appId: string; appKey: string }): string {
  const p = new URLSearchParams()
  p.set("app_id", creds.appId)
  p.set("app_key", creds.appKey)
  p.set("results_per_page", String(opts.limit))
  if (opts.query) p.set(opts.titleOnly ? "title_only" : "what", opts.query)
  if (opts.exclude) p.set("what_exclude", opts.exclude)
  if (opts.location) p.set("where", opts.location)
  if (opts.distance !== undefined) p.set("distance", String(opts.distance))
  if (opts.jobage !== undefined) p.set("max_days_old", String(opts.jobage))
  if (opts.salaryMin !== undefined) p.set("salary_min", String(opts.salaryMin))
  if (opts.salaryMax !== undefined) p.set("salary_max", String(opts.salaryMax))
  if (opts.type) p.set(opts.type, "1")
  if (opts.hours === "full") p.set("full_time", "1")
  if (opts.hours === "part") p.set("part_time", "1")
  if (opts.category) p.set("category", opts.category)
  if (opts.sort) p.set("sort_by", opts.sort)
  return `${baseUrl()}/jobs/${opts.country}/search/${opts.page}?${p.toString()}`
}

function renderTable(rows: JobResult[]): string {
  if (rows.length === 0) return "No results."
  const columns: Array<[string, number, (r: JobResult) => string]> = [
    ["ID", 10, (r) => r.id],
    ["TITLE", 38, (r) => r.title],
    ["COMPANY", 24, (r) => r.company ?? "—"],
    ["LOCATION", 20, (r) => r.location ?? "—"],
    ["SALARY", 18, (r) => (r.salary ? r.salary + (r.salary_is_estimate ? "*" : "") : "—")],
    ["DATE", 10, (r) => r.date ?? "—"],
  ]
  const row = (cells: string[]) => cells.map((c, i) => c.slice(0, columns[i][1]).padEnd(columns[i][1])).join("  ")
  const header = row(columns.map((c) => c[0]))
  const lines = [header, "-".repeat(header.length), ...rows.map((r) => row(columns.map((c) => c[2](r))))]
  if (rows.some((r) => r.salary_is_estimate)) lines.push("", "* salary estimated by Adzuna, not stated in the ad")
  lines.push("", "Jobs by Adzuna")
  return lines.join("\n")
}

function renderPlain(rows: JobResult[]): string {
  if (rows.length === 0) return "No results."
  const blocks = rows.map((r) =>
    [
      r.title,
      `  ${r.company ?? "—"} · ${r.location ?? "—"} · ${r.salary ? r.salary + (r.salary_is_estimate ? " (estimated)" : "") : "salary not shown"} · ${r.date ?? "—"}`,
      r.snippet ? `  ${r.snippet}` : null,
      `  id: ${r.id}`,
      `  ${r.url}`,
    ]
      .filter((l) => l !== null)
      .join("\n"),
  )
  return blocks.join("\n\n") + "\n\nJobs by Adzuna"
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const body = await apiGet<AdzunaSearchResponse>(buildUrl(opts, credentials()))
    const rows = (body.results ?? []).map((j) => toResult(j, opts.country))

    if (opts.format === "table") {
      process.stdout.write(renderTable(rows) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(renderPlain(rows) + "\n")
    } else {
      const meta = { count: rows.length, page: opts.page, total: body.count ?? rows.length, source: "Jobs by Adzuna" }
      process.stdout.write(JSON.stringify({ meta, results: rows }, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), e instanceof MissingKeyError ? "NO_API_KEY" : "SEARCH_FAILED")
    return 1
  }
}
