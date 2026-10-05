#!/usr/bin/env bun
// Self-contained CLI for the official Adzuna Jobs API (UK by default, plus the
// other Adzuna markets). No external CLI framework and zero runtime
// dependencies. Needs a free app id + key in ADZUNA_APP_ID / ADZUNA_APP_KEY
// (bun loads them from a .env file in the working directory).

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runCategories } from "./commands/categories.js"
import { COUNTRIES, SIGNUP_URL } from "./helpers.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

const ALIAS: Record<string, string> = { q: "query", l: "location", n: "limit" }

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith("-")) {
      ;(flags._ as string[]).push(a)
      continue
    }
    const name = a.replace(/^-+/, "")
    const key = ALIAS[name] ?? name
    const next = argv[i + 1]
    let value: string | boolean = true
    if (next !== undefined && !next.startsWith("-")) {
      value = next
      i++
    }
    flags[key] = value
  }
  return flags
}

const HELP = `adzuna-cli — search UK (and other) jobs via the official Adzuna API

USAGE
  bun run src/cli.ts search [-q "<keywords>"] [-l "<place>"] [flags] [--format json|table|plain]
  bun run src/cli.ts categories [--country <cc>] [--format json|table]

SEARCH FLAGS
  --query, -q <text>      Keywords, matched anywhere in the ad.
  --title-only            Match --query against job titles only.
  --exclude <words>       Drop ads containing any of these words (space-separated).
  --location, -l <text>   Town, county, region or postcode, e.g. "Truro", "Cornwall".
  --distance <km>         Radius around --location, in kilometres.
  --jobage <days>         Posted within N days (server-side).
  --salary-min <n>        Minimum annual salary.
  --salary-max <n>        Maximum annual salary.
  --type <t>              permanent | contract
  --hours <h>             full | part
  --category <tag>        Adzuna category tag, e.g. it-jobs. List them with: categories
  --sort <s>              date | relevance | salary. Default: Adzuna's own ranking.
  --country <cc>          Market, default gb. One of: ${COUNTRIES.join(", ")}
  --page <n>              1-indexed page. Default 1.
  --limit, -n <n>         Results per page, 1-50. Default 25.
  --format <fmt>          json (default) | table | plain.

There is no detail command: the Adzuna API has no job-by-id lookup and returns
only a snippet of each description. Open a result's url for the full posting.

EXAMPLES
  bun run src/cli.ts search -q "web developer" -l "Truro" --distance 40 --format table
  bun run src/cli.ts search -q "marketing manager" -l "Cornwall" --jobage 14 --sort date
  bun run src/cli.ts search --category it-jobs -l "South West England" --type permanent

Needs ADZUNA_APP_ID and ADZUNA_APP_KEY (free: ${SIGNUP_URL}), in the environment or a .env file.
`

const ENUMS: Record<string, string[]> = {
  type: ["permanent", "contract"],
  hours: ["full", "part"],
  sort: ["date", "relevance", "salary"],
  country: COUNTRIES,
}

function badArg(error: string): number {
  process.stderr.write(JSON.stringify({ error, code: "BAD_ARG" }) + "\n")
  return 1
}

async function main(): Promise<number> {
  const flags = parseFlags(process.argv.slice(2))
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  if (cmd === "detail") {
    process.stderr.write(
      JSON.stringify({
        error: "the Adzuna API has no job-by-id lookup; fetch the search result's url for the full posting",
        code: "NO_DETAIL_ENDPOINT",
      }) + "\n",
    )
    return 1
  }

  if (cmd === "categories") {
    const country = typeof flags.country === "string" ? flags.country.toLowerCase() : "gb"
    if (!COUNTRIES.includes(country)) return badArg(`--country must be one of ${COUNTRIES.join(" | ")}, got "${country}"`)
    return runCategories({ country, format: flags.format === "table" ? "table" : "json" })
  }

  if (cmd === "search") {
    const ints: Record<string, number | undefined> = {}
    for (const name of ["distance", "jobage", "salary-min", "salary-max", "page", "limit"]) {
      if (flags[name] === undefined) continue
      const v = parseInt(flags[name] as string, 10)
      if (isNaN(v) || v < 0) return badArg(`--${name} must be a non-negative number, got "${flags[name]}"`)
      ints[name] = v
    }
    if (typeof flags.country === "string") flags.country = flags.country.toLowerCase()
    for (const [name, allowed] of Object.entries(ENUMS)) {
      if (flags[name] !== undefined && !allowed.includes(flags[name] as string)) {
        return badArg(`--${name} must be one of ${allowed.join(" | ")}, got "${flags[name]}"`)
      }
    }
    const str = (v: Flags[string] | undefined) => (typeof v === "string" ? v : undefined)
    const fmt = str(flags.format) ?? "json"
    const opts: SearchOpts = {
      query: str(flags.query),
      exclude: str(flags.exclude),
      titleOnly: flags["title-only"] === true,
      location: str(flags.location),
      distance: ints.distance,
      jobage: ints.jobage,
      salaryMin: ints["salary-min"],
      salaryMax: ints["salary-max"],
      type: flags.type as SearchOpts["type"],
      hours: flags.hours as SearchOpts["hours"],
      category: str(flags.category),
      sort: flags.sort as SearchOpts["sort"],
      country: str(flags.country) ?? "gb",
      page: Math.max(1, ints.page ?? 1),
      limit: Math.min(50, Math.max(1, ints.limit ?? 25)),
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  process.stderr.write(JSON.stringify({ error: `Unknown command "${cmd}"`, code: "BAD_CMD" }) + "\n")
  return 1
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e), code: "INTERNAL_ERROR" }) + "\n",
    )
    process.exit(1)
  })
