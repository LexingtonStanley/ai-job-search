import { apiGet, toResult, withinDays, writeError, MissingKeyError, type JobResult, type ReedSearchResponse } from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  distance?: number // miles
  jobage?: number // days; client-side filter (the API has no date parameter)
  salaryMin?: number
  salaryMax?: number
  type?: "permanent" | "contract" | "temp"
  hours?: "full" | "part"
  employer?: "direct" | "agency"
  graduate: boolean
  page: number
  limit: number
  format: "json" | "table" | "plain"
}

export function buildQuery(opts: SearchOpts): URLSearchParams {
  const p = new URLSearchParams()
  if (opts.query) p.set("keywords", opts.query)
  if (opts.location) p.set("locationName", opts.location)
  if (opts.distance !== undefined) p.set("distanceFromLocation", String(opts.distance))
  if (opts.salaryMin !== undefined) p.set("minimumSalary", String(opts.salaryMin))
  if (opts.salaryMax !== undefined) p.set("maximumSalary", String(opts.salaryMax))
  if (opts.type) p.set(opts.type, "true")
  if (opts.hours === "full") p.set("fullTime", "true")
  if (opts.hours === "part") p.set("partTime", "true")
  if (opts.employer === "direct") p.set("postedByDirectEmployer", "true")
  if (opts.employer === "agency") p.set("postedByRecruitmentAgency", "true")
  if (opts.graduate) p.set("graduate", "true")
  p.set("resultsToTake", String(opts.limit))
  p.set("resultsToSkip", String((opts.page - 1) * opts.limit))
  return p
}

function renderTable(rows: JobResult[]): string {
  if (rows.length === 0) return "No results."
  const columns: Array<[string, number, (r: JobResult) => string]> = [
    ["ID", 9, (r) => r.id],
    ["TITLE", 38, (r) => r.title],
    ["COMPANY", 24, (r) => r.company ?? "—"],
    ["LOCATION", 18, (r) => r.location ?? "—"],
    ["SALARY", 18, (r) => r.salary ?? "—"],
    ["DATE", 10, (r) => r.date ?? "—"],
  ]
  const row = (cells: string[]) => cells.map((c, i) => c.slice(0, columns[i][1]).padEnd(columns[i][1])).join("  ")
  const header = row(columns.map((c) => c[0]))
  return [header, "-".repeat(header.length), ...rows.map((r) => row(columns.map((c) => c[2](r))))].join("\n")
}

function renderPlain(rows: JobResult[]): string {
  if (rows.length === 0) return "No results."
  return rows
    .map((r) =>
      [
        r.title,
        `  ${r.company ?? "—"} · ${r.location ?? "—"} · ${r.salary ?? "salary not shown"} · ${r.date ?? "—"}`,
        `  id: ${r.id}`,
        `  ${r.url}`,
      ].join("\n"),
    )
    .join("\n\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const body = await apiGet<ReedSearchResponse>(`/search?${buildQuery(opts).toString()}`)
    let rows = (body?.results ?? []).map(toResult)
    const returned = rows.length
    if (opts.jobage !== undefined) rows = rows.filter((r) => withinDays(r.date, opts.jobage as number))

    if (opts.format === "table") {
      process.stdout.write(renderTable(rows) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(renderPlain(rows) + "\n")
    } else {
      const meta = { count: rows.length, page: opts.page, total: body?.totalResults ?? returned, returned }
      process.stdout.write(JSON.stringify({ meta, results: rows }, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), e instanceof MissingKeyError ? "NO_API_KEY" : "SEARCH_FAILED")
    return 1
  }
}
