import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// Network-free: every case fails validation (or the key check) before a request.
// Runs from an empty temp dir with REED_API_KEY blanked so a real .env can't leak in.
const CLI_PATH = join(import.meta.dir, "../src/cli.ts");
const EMPTY_DIR = mkdtempSync(join(tmpdir(), "reed-cli-test-"));

async function run(args: string[]): Promise<{ code?: string; exitCode: number; stdout: string }> {
  const proc = Bun.spawn(["bun", "run", CLI_PATH, ...args], {
    cwd: EMPTY_DIR,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, REED_API_KEY: "" },
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  let code: string | undefined;
  try {
    code = JSON.parse(stderr.trim()).code;
  } catch {}
  return { code, exitCode, stdout };
}

describe("reed CLI flag validation", () => {
  for (const name of ["distance", "jobage", "salary-min", "salary-max", "page", "limit"]) {
    test(`--${name} non-numeric exits 1 with BAD_ARG`, async () => {
      const r = await run(["search", `--${name}`, "lots"]);
      expect(r.exitCode).toBe(1);
      expect(r.code).toBe("BAD_ARG");
    });
  }

  for (const [name, bad] of [["type", "freelance"], ["hours", "some"], ["employer", "everyone"]]) {
    test(`--${name} ${bad} exits 1 with BAD_ARG`, async () => {
      const r = await run(["search", `--${name}`, bad]);
      expect(r.code).toBe("BAD_ARG");
    });
  }

  test("valid flags pass validation and stop at the missing key", async () => {
    const r = await run(["search", "-q", "developer", "-l", "Truro", "--type", "permanent", "--jobage", "14"]);
    expect(r.exitCode).toBe(1);
    expect(r.code).toBe("NO_API_KEY");
  });

  test("detail without an id is NO_ID", async () => {
    expect((await run(["detail"])).code).toBe("NO_ID");
  });

  test("unknown command is BAD_CMD", async () => {
    expect((await run(["frobnicate"])).code).toBe("BAD_CMD");
  });

  test("no command prints help and exits 1", async () => {
    const r = await run([]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toContain("REED_API_KEY");
  });
});
