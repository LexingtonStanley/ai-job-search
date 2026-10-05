import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { buildUrl, runSearch, type SearchOpts } from "../src/commands/search";
import { cleanText, formatSalary, toResult, type AdzunaJob } from "../src/helpers";

const originalFetch = globalThis.fetch;
const originalStdoutWrite = process.stdout.write;
const originalStderrWrite = process.stderr.write;
const originalEnv = { id: process.env.ADZUNA_APP_ID, key: process.env.ADZUNA_APP_KEY };

let requests: string[] = [];

function capture(stream: "stdout" | "stderr"): { get: () => string } {
  let buf = "";
  process[stream].write = ((chunk: string | Uint8Array) => {
    buf += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  return { get: () => buf };
}

function mockFetch(status: number, body: unknown): void {
  globalThis.fetch = (async (url: string | URL | Request) => {
    requests.push(String(url));
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

// Shape taken from the example response in Adzuna's search docs.
function job(overrides: Partial<AdzunaJob> = {}): AdzunaJob {
  return {
    id: "4890123456",
    title: " <strong>Web</strong> Developer ",
    description: "Kernow Digital are hiring a <strong>web</strong> developer&nbsp;in Truro &amp; Falmouth...",
    created: "2026-09-28T09:14:02Z",
    redirect_url: "https://www.adzuna.co.uk/jobs/land/ad/4890123456?se=abc",
    company: { display_name: "Kernow Digital Ltd" },
    location: { display_name: "Truro, Cornwall", area: ["UK", "South West England", "Cornwall", "Truro"] },
    salary_min: 30000,
    salary_max: 38000,
    salary_is_predicted: "0",
    contract_type: "permanent",
    contract_time: "full_time",
    category: { label: "IT Jobs", tag: "it-jobs" },
    ...overrides,
  };
}

const opts: SearchOpts = { titleOnly: false, country: "gb", page: 1, limit: 25, format: "json" };
const creds = { appId: "id123", appKey: "key456" };

beforeEach(() => {
  requests = [];
  process.env.ADZUNA_APP_ID = creds.appId;
  process.env.ADZUNA_APP_KEY = creds.appKey;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.stdout.write = originalStdoutWrite;
  process.stderr.write = originalStderrWrite;
  for (const [name, v] of [["ADZUNA_APP_ID", originalEnv.id], ["ADZUNA_APP_KEY", originalEnv.key]] as const) {
    if (v === undefined) delete process.env[name];
    else process.env[name] = v;
  }
});

describe("buildUrl", () => {
  test("puts country and page in the path and maps flags to Adzuna params", () => {
    const url = new URL(
      buildUrl(
        {
          ...opts,
          query: "web developer",
          exclude: "senior",
          location: "Truro",
          distance: 40,
          jobage: 14,
          salaryMin: 25000,
          type: "permanent",
          hours: "full",
          category: "it-jobs",
          sort: "date",
          page: 2,
          limit: 10,
        },
        creds,
      ),
    );
    expect(url.pathname).toBe("/v1/api/jobs/gb/search/2");
    const p = url.searchParams;
    expect(p.get("app_id")).toBe("id123");
    expect(p.get("app_key")).toBe("key456");
    expect(p.get("what")).toBe("web developer");
    expect(p.get("what_exclude")).toBe("senior");
    expect(p.get("where")).toBe("Truro");
    expect(p.get("distance")).toBe("40");
    expect(p.get("max_days_old")).toBe("14");
    expect(p.get("salary_min")).toBe("25000");
    expect(p.get("permanent")).toBe("1");
    expect(p.get("full_time")).toBe("1");
    expect(p.get("category")).toBe("it-jobs");
    expect(p.get("sort_by")).toBe("date");
    expect(p.get("results_per_page")).toBe("10");
  });

  test("--title-only sends the query as title_only", () => {
    const p = new URL(buildUrl({ ...opts, query: "nurse", titleOnly: true }, creds)).searchParams;
    expect(p.get("title_only")).toBe("nurse");
    expect(p.has("what")).toBe(false);
  });
});

describe("runSearch", () => {
  test("reshapes results into the portal contract", async () => {
    mockFetch(200, { count: 1, mean: 34000, results: [job()] });
    const out = capture("stdout");
    expect(await runSearch(opts)).toBe(0);
    const parsed = JSON.parse(out.get());
    expect(parsed.meta).toEqual({ count: 1, page: 1, total: 1, source: "Jobs by Adzuna" });
    expect(parsed.results[0]).toEqual({
      id: "4890123456",
      title: "Web Developer",
      company: "Kernow Digital Ltd",
      location: "Truro, Cornwall",
      date: "2026-09-28",
      salary: "£30,000–£38,000",
      salary_is_estimate: false,
      employment_type: "permanent",
      hours: "full-time",
      category: "IT Jobs",
      snippet: "Kernow Digital are hiring a web developer in Truro & Falmouth...",
      url: "https://www.adzuna.co.uk/jobs/land/ad/4890123456?se=abc",
    });
  });

  test("flags Adzuna's estimated salaries", async () => {
    mockFetch(200, { count: 1, results: [job({ salary_is_predicted: 1 })] });
    const out = capture("stdout");
    await runSearch({ ...opts, format: "table" });
    expect(out.get()).toContain("£30,000–£38,000*");
    expect(out.get()).toContain("estimated by Adzuna");
    expect(out.get()).toContain("Jobs by Adzuna");
  });

  test("missing credentials fail with NO_API_KEY before any request", async () => {
    process.env.ADZUNA_APP_KEY = "";
    mockFetch(200, { results: [] });
    const err = capture("stderr");
    expect(await runSearch(opts)).toBe(1);
    expect(JSON.parse(err.get()).code).toBe("NO_API_KEY");
    expect(requests.length).toBe(0);
  });

  test("rejected credentials fail fast with NO_API_KEY", async () => {
    mockFetch(401, { exception: "AUTH_FAIL" });
    const err = capture("stderr");
    expect(await runSearch(opts)).toBe(1);
    expect(JSON.parse(err.get()).code).toBe("NO_API_KEY");
    expect(requests.length).toBe(1);
  });

  test("a 400 surfaces Adzuna's own explanation", async () => {
    mockFetch(400, { display: "Unknown category tag 'it'", exception: "BAD_ARGUMENT" });
    const err = capture("stderr");
    expect(await runSearch({ ...opts, category: "it" })).toBe(1);
    const parsed = JSON.parse(err.get());
    expect(parsed.code).toBe("SEARCH_FAILED");
    expect(parsed.error).toContain("Unknown category tag");
  });
});

describe("helpers", () => {
  test("cleanText strips highlight tags and decodes entities once", () => {
    expect(cleanText("<strong>Java</strong>&nbspDeveloper")).toBe("Java Developer");
    expect(cleanText("A &amp;lt; B")).toBe("A &lt; B");
    expect(cleanText("  ")).toBeNull();
  });

  test("formatSalary uses the market's currency", () => {
    expect(formatSalary(30000, 30000, "gb")).toBe("£30,000");
    expect(formatSalary(80000, 90000, "us")).toBe("$80,000–$90,000");
    expect(formatSalary(50000, null, "de")).toBe("50,000");
    expect(formatSalary(null, null, "gb")).toBeNull();
  });

  test("toResult tolerates a sparse job", () => {
    const r = toResult({ id: "1", title: "Cleaner", redirect_url: "https://www.adzuna.co.uk/jobs/land/ad/1" }, "gb");
    expect(r).toMatchObject({ company: null, location: null, date: null, salary: null, hours: null, snippet: null });
  });
});

describe("runCategories", () => {
  test("lists tags for the market", async () => {
    const { runCategories } = await import("../src/commands/categories");
    mockFetch(200, { results: [{ label: "IT Jobs", tag: "it-jobs" }, { label: "Teaching Jobs", tag: "teaching-jobs" }] });
    const out = capture("stdout");
    expect(await runCategories({ country: "gb", format: "json" })).toBe(0);
    expect(new URL(requests[0]).pathname).toBe("/v1/api/jobs/gb/categories");
    expect(JSON.parse(out.get()).results).toEqual([
      { tag: "it-jobs", label: "IT Jobs" },
      { tag: "teaching-jobs", label: "Teaching Jobs" },
    ]);
  });
});
