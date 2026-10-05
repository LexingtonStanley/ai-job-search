import { apiGet, parseJobId, toDetail, writeError, MissingKeyError, type ReedJobDetail } from "../helpers.js"

export interface DetailOpts {
  id: string // a Reed job id or a reed.co.uk/jobs/... URL
  format: "json" | "plain"
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = parseJobId(opts.id)
  if (!id) {
    writeError(`could not parse a Reed job id from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const body = await apiGet<ReedJobDetail>(`/jobs/${id}`)
    // Reed answers an unknown id with 404 or with an empty object, depending on the id.
    if (!body || !body.jobId) {
      writeError("job not found (it may have expired)", "NOT_FOUND")
      return 1
    }
    const job = toDetail(body)

    if (opts.format === "plain") {
      const lines: Array<string | null> = [
        job.title,
        `${job.company ?? "—"} · ${job.location ?? "—"}`,
        job.date ? `Posted: ${job.date}` : null,
        job.deadline ? `Closes: ${job.deadline}` : null,
        job.salary ? `Salary: ${job.salary}` : null,
        job.employment_type ? `Contract: ${job.employment_type}` : null,
        job.hours ? `Hours: ${job.hours}` : null,
        job.applications != null ? `Applications so far: ${job.applications}` : null,
        "",
        job.description ?? "(no description)",
        "",
        `URL: ${job.url}`,
        job.apply_url ? `Apply: ${job.apply_url}` : null,
        `id: ${job.id}`,
      ]
      // null = field absent; "" = a deliberate blank separator line.
      process.stdout.write(lines.filter((l) => l !== null).join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), e instanceof MissingKeyError ? "NO_API_KEY" : "DETAIL_FAILED")
    return 1
  }
}
