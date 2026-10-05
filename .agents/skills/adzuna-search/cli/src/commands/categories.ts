import { apiGet, baseUrl, credentials, writeError, MissingKeyError } from "../helpers.js"

export interface CategoriesOpts {
  country: string
  format: "json" | "table"
}

interface CategoriesResponse {
  results: Array<{ label: string; tag: string }>
}

/** List the live category tags for a market, for use with `search --category`. */
export async function runCategories(opts: CategoriesOpts): Promise<number> {
  try {
    const { appId, appKey } = credentials()
    const p = new URLSearchParams({ app_id: appId, app_key: appKey })
    const body = await apiGet<CategoriesResponse>(`${baseUrl()}/jobs/${opts.country}/categories?${p.toString()}`)
    const rows = (body.results ?? []).map((c) => ({ tag: c.tag, label: c.label }))
    if (opts.format === "table") {
      const width = Math.max(3, ...rows.map((r) => r.tag.length))
      const lines = rows.map((r) => `${r.tag.padEnd(width)}  ${r.label}`)
      process.stdout.write([`${"TAG".padEnd(width)}  LABEL`, ...lines].join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify({ meta: { count: rows.length, country: opts.country }, results: rows }, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), e instanceof MissingKeyError ? "NO_API_KEY" : "CATEGORIES_FAILED")
    return 1
  }
}
