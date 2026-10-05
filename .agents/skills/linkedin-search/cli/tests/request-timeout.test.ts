import { afterEach, describe, expect, test } from "bun:test";
import { htmlFetch, RateLimitedError } from "../src/helpers";

// A stalled upstream connection (accepted socket, no response) would otherwise
// hang the CLI forever - fetch has no default timeout. Assert the request
// wrapper carries an AbortSignal timeout. Fails on the pre-fix code (no signal).
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("htmlFetch request timeout", () => {
  test("passes an AbortSignal timeout to fetch", async () => {
    let init: RequestInit | undefined;
    globalThis.fetch = (async (_url: string | URL | Request, i?: RequestInit) => {
      init = i;
      return new Response("<html></html>", { status: 200 });
    }) as unknown as typeof fetch;

    await htmlFetch("https://www.linkedin.com/jobs-guest/jobs/api/x");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("htmlFetch throttling", () => {
  test("persistent 429 ends in a RateLimitedError after a bounded number of attempts", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response("", { status: 429 });
    }) as unknown as typeof fetch;

    await expect(htmlFetch("https://www.linkedin.com/jobs-guest/jobs/api/x", { baseDelayMs: 1 })).rejects.toBeInstanceOf(
      RateLimitedError,
    );
    expect(calls).toBe(5);
  });

  test("a 429 followed by a 200 recovers", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return calls === 1 ? new Response("", { status: 429 }) : new Response("<li>ok</li>", { status: 200 });
    }) as unknown as typeof fetch;

    expect(await htmlFetch("https://www.linkedin.com/jobs-guest/jobs/api/x", { baseDelayMs: 1 })).toBe("<li>ok</li>");
  });
});
