#!/usr/bin/env bun
// Self-contained CLI for the official reed.co.uk Jobseeker API (UK market).
// No external CLI framework and zero runtime dependencies. Needs a free API key
// in REED_API_KEY (bun loads it from a .env file in the working directory).

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"
import { SIGNUP_URL } from "./helpers.js"

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

const HELP = `reed-cli — search UK jobs on reed.co.uk via its official API

USAGE
  bun run src/cli.ts search [-q "<keywords>"] [-l "<place>"] [flags] [--format json|table|plain]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Keywords (title, skill, role).
  --location, -l <text>   Town, city, county or postcode, e.g. "Truro", "TR1", "Cornwall".
  --distance <miles>      Radius around --location. Reed's default is 10.
  --jobage <days>         Keep jobs posted within N days. Filtered client-side: the
                          API has no date parameter, so this trims the page fetched.
  --salary-min <n>        Minimum annual salary, e.g. 30000.
  --salary-max <n>        Maximum annual salary.
  --type <t>              permanent | contract | temp
  --hours <h>             full | part
  --employer <e>          direct (employers only) | agency (recruiters only)
  --graduate              Graduate roles only.
  --page <n>              1-indexed page. Default 1.
  --limit, -n <n>         Results per page, 1-100. Default 25.
  --format <fmt>          json (default) | table | plain.

DETAIL
  <id|url>                A Reed job id (a search result's id) or a reed.co.uk/jobs/... URL.

EXAMPLES
  bun run src/cli.ts search -q "web developer" -l "Truro" --distance 30 --format table
  bun run src/cli.ts search -q "marketing" -l "Cornwall" --type permanent --jobage 14
  bun run src/cli.ts detail 54321987 --format plain

Needs REED_API_KEY (free: ${SIGNUP_URL}), in the environment or a .env file.
`

const ENUMS: Record<string, string[]> = {
  type: ["permanent", "contract", "temp"],
  hours: ["full", "part"],
  employer: ["direct", "agency"],
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

  if (cmd === "search") {
    const ints: Record<string, number | undefined> = {}
    for (const name of ["distance", "jobage", "salary-min", "salary-max", "page", "limit"]) {
      if (flags[name] === undefined) continue
      const v = parseInt(flags[name] as string, 10)
      if (isNaN(v) || v < 0) return badArg(`--${name} must be a non-negative number, got "${flags[name]}"`)
      ints[name] = v
    }
    for (const [name, allowed] of Object.entries(ENUMS)) {
      if (flags[name] !== undefined && !allowed.includes(flags[name] as string)) {
        return badArg(`--${name} must be one of ${allowed.join(" | ")}, got "${flags[name]}"`)
      }
    }
    const fmt = (flags.format as string) || "json"
    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query : undefined,
      location: typeof flags.location === "string" ? flags.location : undefined,
      distance: ints.distance,
      jobage: ints.jobage,
      salaryMin: ints["salary-min"],
      salaryMax: ints["salary-max"],
      type: flags.type as SearchOpts["type"],
      hours: flags.hours as SearchOpts["hours"],
      employer: flags.employer as SearchOpts["employer"],
      graduate: flags.graduate === true,
      page: Math.max(1, ints.page ?? 1),
      limit: Math.min(100, Math.max(1, ints.limit ?? 25)),
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) {
      process.stderr.write(JSON.stringify({ error: "detail requires an <id|url>", code: "NO_ID" }) + "\n")
      return 1
    }
    const opts: DetailOpts = { id, format: flags.format === "plain" ? "plain" : "json" }
    return runDetail(opts)
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
