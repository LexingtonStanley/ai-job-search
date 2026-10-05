import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { buildQuery, runSearch, type SearchOpts } from "../src/commands/search";
import { runDetail } from "../src/commands/detail";
import { cleanHtml, formatSalary, isoDate, parseJobId, withinDays, type ReedJobDetail, type ReedSearchJob } from "../src/helpers";

const originalFetch = globalThis.fetch;
const originalStdoutWrite = process.stdout.write;
const originalStderrWrite = process.stderr.write;
const originalKey = process.env.REED_API_KEY;

let requests: Array<{ url: string; init?: RequestInit }> = [];

function capture(stream: "stdout" | "stderr"): { get: () => string } {
  let buf = "";
  process[stream].write = ((chunk: string | Uint8Array) => {
    buf += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  return { get: () => buf };
}

function mockFetch(status: number, body: unknown): void {
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

function job(overrides: Partial<ReedSearchJob> = {}): ReedSearchJob {
  return {
    jobId: 54321987,
    employerId: 1,
    employerName: "Kernow Digital Ltd",
    jobTitle: "Web Developer",
    locationName: "Truro",
    minimumSalary: 30000,
    maximumSalary: 38000,
    currency: "GBP",
    expirationDate: "12/11/2026",
    date: "28/09/2026",
    jobDescription: "Build &amp; ship...",
    applications: 7,
    jobUrl: "https://www.reed.co.uk/jobs/web-developer/54321987",
    ...overrides,
  };
}

const opts: SearchOpts = { graduate: false, page: 1, limit: 25, format: "json" };

beforeEach(() => {
  requests = [];
  process.env.REED_API_KEY = "test-key";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.stdout.write = originalStdoutWrite;
  process.stderr.write = originalStderrWrite;
  if (originalKey === undefined) delete process.env.REED_API_KEY;
  else process.env.REED_API_KEY = originalKey;
});

describe("buildQuery", () => {
  test("maps flags to Reed's parameter names", () => {
    const p = buildQuery({
      ...opts,
      query: "web developer",
      location: "Truro",
      distance: 30,
      salaryMin: 25000,
      type: "permanent",
      hours: "full",
      employer: "direct",
      graduate: true,
      page: 3,
      limit: 20,
    });
    expect(p.get("keywords")).toBe("web developer");
    expect(p.get("locationName")).toBe("Truro");
    expect(p.get("distanceFromLocation")).toBe("30");
    expect(p.get("minimumSalary")).toBe("25000");
    expect(p.get("permanent")).toBe("true");
    expect(p.get("fullTime")).toBe("true");
    expect(p.get("postedByDirectEmployer")).toBe("true");
    expect(p.get("graduate")).toBe("true");
    expect(p.get("resultsToTake")).toBe("20");
    expect(p.get("resultsToSkip")).toBe("40");
  });

  test("leaves unset filters out", () => {
    const p = buildQuery(opts);
    expect([...p.keys()].sort()).toEqual(["resultsToSkip", "resultsToTake"]);
  });
});

describe("runSearch", () => {
  test("sends the key as the Basic auth username with an empty password", async () => {
    mockFetch(200, { results: [], totalResults: 0 });
    capture("stdout");
    await runSearch(opts);
    const auth = new Headers(requests[0].init?.headers).get("Authorization");
    expect(auth).toBe("Basic " + btoa("test-key:"));
    expect(requests[0].url).toStartWith("https://www.reed.co.uk/api/1.0/search?");
  });

  test("reshapes results into the portal contract", async () => {
    mockFetch(200, { results: [job()], totalResults: 1 });
    const out = capture("stdout");
    expect(await runSearch(opts)).toBe(0);
    const parsed = JSON.parse(out.get());
    expect(parsed.meta).toEqual({ count: 1, page: 1, total: 1, returned: 1 });
    expect(parsed.results[0]).toEqual({
      id: "54321987",
      title: "Web Developer",
      company: "Kernow Digital Ltd",
      location: "Truro",
      date: "2026-09-28",
      deadline: "2026-11-12",
      salary: "£30,000–£38,000",
      applications: 7,
      url: "https://www.reed.co.uk/jobs/web-developer/54321987",
    });
  });

  test("--jobage drops older postings client-side", async () => {
    const recent = new Date(Date.now() - 2 * 86_400_000);
    const dmy = `${recent.getUTCDate()}/${recent.getUTCMonth() + 1}/${recent.getUTCFullYear()}`;
    mockFetch(200, { results: [job({ jobId: 1, date: dmy }), job({ jobId: 2, date: "01/01/2020" })], totalResults: 2 });
    const out = capture("stdout");
    await runSearch({ ...opts, jobage: 14 });
    const parsed = JSON.parse(out.get());
    expect(parsed.results.map((r: { id: string }) => r.id)).toEqual(["1"]);
    expect(parsed.meta.returned).toBe(2);
  });

  test("a missing key fails with NO_API_KEY before any request", async () => {
    process.env.REED_API_KEY = "";
    mockFetch(200, { results: [] });
    const err = capture("stderr");
    expect(await runSearch(opts)).toBe(1);
    expect(JSON.parse(err.get()).code).toBe("NO_API_KEY");
    expect(requests.length).toBe(0);
  });

  test("a rejected key fails fast with NO_API_KEY", async () => {
    mockFetch(401, "");
    const err = capture("stderr");
    expect(await runSearch(opts)).toBe(1);
    expect(JSON.parse(err.get()).code).toBe("NO_API_KEY");
    expect(requests.length).toBe(1);
  });

  test("table output renders a row per job", async () => {
    mockFetch(200, { results: [job()], totalResults: 1 });
    const out = capture("stdout");
    await runSearch({ ...opts, format: "table" });
    expect(out.get()).toContain("Kernow Digital Ltd");
    expect(out.get()).toContain("54321987");
  });
});

describe("runDetail", () => {
  const detail: ReedJobDetail = {
    jobId: 54321987,
    employerName: "Kernow Digital Ltd",
    jobTitle: "Web Developer",
    locationName: "Truro",
    minimumSalary: 30000,
    maximumSalary: 38000,
    currency: "GBP",
    salary: "£30,000 - £38,000 per annum",
    datePosted: "28/09/2026",
    expirationDate: "12/11/2026",
    externalUrl: "https://careers.example.com/apply/1",
    jobUrl: "https://www.reed.co.uk/jobs/web-developer/54321987",
    fullTime: true,
    partTime: false,
    contractType: "Permanent",
    jobDescription: "<p>Join us in Truro.</p><ul><li>TypeScript</li><li>Rock &amp; roll</li></ul>",
    applicationCount: 7,
  };

  test("fetches /jobs/{id} from a URL and cleans the description", async () => {
    mockFetch(200, detail);
    const out = capture("stdout");
    expect(await runDetail({ id: "https://www.reed.co.uk/jobs/web-developer/54321987?source=x", format: "json" })).toBe(0);
    expect(requests[0].url).toBe("https://www.reed.co.uk/api/1.0/jobs/54321987");
    const parsed = JSON.parse(out.get());
    expect(parsed.description).toBe("Join us in Truro.\nTypeScript\nRock & roll");
    expect(parsed.salary).toBe("£30,000 - £38,000 per annum");
    expect(parsed.hours).toBe("full-time");
    expect(parsed.apply_url).toBe("https://careers.example.com/apply/1");
  });

  test("an empty body is NOT_FOUND", async () => {
    mockFetch(200, {});
    const err = capture("stderr");
    expect(await runDetail({ id: "1", format: "json" })).toBe(1);
    expect(JSON.parse(err.get()).code).toBe("NOT_FOUND");
  });

  test("an unparseable id is BAD_ID", async () => {
    const err = capture("stderr");
    expect(await runDetail({ id: "not-a-job", format: "json" })).toBe(1);
    expect(JSON.parse(err.get()).code).toBe("BAD_ID");
  });
});

describe("helpers", () => {
  test("isoDate converts dd/mm/yyyy", () => {
    expect(isoDate("1/9/2026")).toBe("2026-09-01");
    expect(isoDate("2026-09-01")).toBeNull();
    expect(isoDate(null)).toBeNull();
  });

  test("formatSalary", () => {
    expect(formatSalary(30000, 30000, "GBP")).toBe("£30,000");
    expect(formatSalary(null, 40000, "GBP")).toBe("£40,000");
    expect(formatSalary(null, null, "GBP")).toBeNull();
    expect(formatSalary(50000, 60000, "EUR")).toBe("EUR 50,000–EUR 60,000");
  });

  test("parseJobId", () => {
    expect(parseJobId("54321987")).toBe("54321987");
    expect(parseJobId("https://www.reed.co.uk/jobs/54321987")).toBe("54321987");
    expect(parseJobId("https://example.com/54321987")).toBeNull();
  });

  test("withinDays keeps undated jobs", () => {
    const now = new Date("2026-10-01T12:00:00Z");
    expect(withinDays("2026-09-25", 14, now)).toBe(true);
    expect(withinDays("2026-09-01", 14, now)).toBe(false);
    expect(withinDays(null, 14, now)).toBe(true);
  });

  test("cleanHtml decodes double-escaped entities only once", () => {
    expect(cleanHtml("A &amp;lt; B")).toBe("A &lt; B");
  });
});
