import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface Result {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Runs the built CLI. Output is returned untrimmed so tests can check exact bytes. */
function runCLI(args: string[], input?: string, env: Record<string, string> = {}): Promise<Result> {
  return new Promise((resolve) => {
    const child = spawn("node", ["dist/index.js", ...args], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => (stdout += data.toString()));
    child.stderr.on("data", (data) => (stderr += data.toString()));
    child.on("close", (code) => resolve({ stdout, stderr, exitCode: code ?? 0 }));
    child.stdin.on("error", () => undefined);
    child.stdin.end(input);
  });
}

const lines = (text: string): string[] => (text === "" ? [] : text.replace(/\n$/, "").split("\n"));

const DOC = JSON.stringify({
  service: { name: "checkout", status: "degraded", retries: 2 },
  deployments: [
    { region: "us-central1", version: "2026.05.22" },
    { region: "us-east1", version: "2026.05.21" },
  ],
});

describe("agent features", () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "gronify-agent-"));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe("result caps", () => {
    test("flatten --limit emits at most n lines and says so on stderr only", async () => {
      const result = await runCLI(["--no-color", "flatten", "--limit", "3"], DOC);

      expect(result.exitCode).toBe(0);
      expect(lines(result.stdout)).toEqual(["json = {}", "json.service = {}", 'json.service.name = "checkout"']);
      expect(result.stderr.trim()).toBe("Stopped after 3 lines (--limit); there may be more");
    });

    test("flatten --limit larger than the output prints everything and no notice", async () => {
      const result = await runCLI(["--no-color", "flatten", "--limit", "1000"], DOC);

      expect(result.exitCode).toBe(0);
      expect(lines(result.stdout)).toHaveLength(12);
      expect(result.stderr).toBe("");
    });

    test("search -m stops after n matching lines", async () => {
      const result = await runCLI(["--no-color", "search", "-m", "2", "region"], DOC);

      expect(result.exitCode).toBe(0);
      expect(lines(result.stdout)).toEqual(['json.deployments[0].region = "us-central1"', 'json.deployments[1].region = "us-east1"']);
      expect(result.stderr.trim()).toBe("Stopped after 2 matches (--max-count); there may be more");
    });

    test("search --max-count 1 returns the first match in document order", async () => {
      const result = await runCLI(["--no-color", "search", "--max-count", "1", "e"], DOC);

      expect(lines(result.stdout)).toEqual(["json.service = {}"]);
    });

    test("search -m with -v caps the non-matching lines", async () => {
      const result = await runCLI(["--no-color", "search", "-v", "-m", "2", "deployments"], DOC);

      expect(lines(result.stdout)).toEqual(["json = {}", "json.service = {}"]);
      expect(result.stderr.trim()).toBe("Stopped after 2 lines (--max-count); there may be more");
    });

    test("search --count with -m counts up to n", async () => {
      const unlimited = await runCLI(["--no-color", "search", "--count", "e"], DOC);
      const capped = await runCLI(["--no-color", "search", "--count", "-m", "3", "e"], DOC);
      const roomy = await runCLI(["--no-color", "search", "--count", "-m", "50", "region"], DOC);

      expect(Number(unlimited.stdout)).toBeGreaterThan(3);
      expect(capped.exitCode).toBe(0);
      expect(capped.stdout.trim()).toBe("3");
      expect(capped.stderr.trim()).toBe("Stopped counting at 3 matches (--max-count)");
      expect(roomy.stdout.trim()).toBe("2");
      expect(roomy.stderr).toBe("");
    });

    test("-m larger than the number of matches is a plain search", async () => {
      const result = await runCLI(["--no-color", "search", "-m", "99", "region"], DOC);

      expect(lines(result.stdout)).toHaveLength(2);
      expect(result.stderr).toBe("");
    });

    test("a cap that equals the number of matches still reports it was reached", async () => {
      const result = await runCLI(["--no-color", "search", "-m", "2", "region"], DOC);

      expect(lines(result.stdout)).toHaveLength(2);
      expect(result.stderr).toContain("Stopped after 2 matches");
    });

    test.each(["0", "-1", "1.5", "abc", "", "1e3", "0x10", "9007199254740993", " 5"])("rejects %j as a cap", async (value) => {
      for (const args of [
        ["search", "-m", value, "x"],
        ["flatten", "--limit", value],
      ]) {
        const result = await runCLI(args, "{}");

        expect(result.exitCode).toBe(1);
        expect(result.stdout).toBe("");
        expect(result.stderr).toContain("Must be a positive integer");
      }
    });

    test("rejects a missing value", async () => {
      const result = await runCLI(["search", "x", "-m"], "{}");

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("argument missing");
    });

    test("stops reading a stdin that never ends", async () => {
      // Valid JSON prefix, then silence: only an early exit can finish this run.
      const result = await new Promise<Result & { signal: NodeJS.Signals | null }>((resolve, reject) => {
        const child = spawn("node", ["dist/index.js", "--no-color", "search", "-m", "2", "status"]);
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (data) => (stdout += data.toString()));
        child.stderr.on("data", (data) => (stderr += data.toString()));
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error("did not stop after the cap; it is still waiting for input"));
        }, 8_000);
        child.on("close", (code, signal) => {
          clearTimeout(timer);
          resolve({ stdout, stderr, exitCode: code ?? -1, signal });
        });
        child.stdin.on("error", () => undefined);
        child.stdin.write('[{"status":"a"},{"status":"b"},{"status":"c"},');
      });

      expect(result.signal).toBeNull();
      expect(result.exitCode).toBe(0);
      expect(lines(result.stdout)).toEqual(['json[0].status = "a"', 'json[1].status = "b"']);
      expect(result.stderr).toContain("Stopped after 2 matches");
    }, 15_000);

    test("flatten --limit also stops a stdin that never ends", async () => {
      const exit = await new Promise<number | null>((resolve, reject) => {
        const child = spawn("node", ["dist/index.js", "--no-color", "flatten", "--limit", "2"]);
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error("did not stop after the limit"));
        }, 8_000);
        child.on("close", (code) => {
          clearTimeout(timer);
          resolve(code);
        });
        child.stdout.resume();
        child.stdin.on("error", () => undefined);
        child.stdin.write("[1,2,3,");
      });

      expect(exit).toBe(0);
    }, 15_000);

    test("never reads or validates the input after the cap", async () => {
      const file = join(dir, "bad-tail.json");
      writeFileSync(file, '[{"status":1},{"status":2}, this is not json');

      const capped = await runCLI(["--no-color", "search", "-m", "2", file, "status"]);
      const uncapped = await runCLI(["--no-color", "search", file, "status"]);

      expect(capped.exitCode).toBe(0);
      expect(lines(capped.stdout)).toEqual(["json[0].status = 1", "json[1].status = 2"]);
      expect(uncapped.exitCode).toBe(1);
    });

    test("still reports a syntax error found before the cap", async () => {
      const result = await runCLI(["--no-color", "flatten", "--limit", "50"], '{"a":1,}');

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("trailing commas");
    });

    test("stops early on a large file and returns quickly", async () => {
      const file = join(dir, "large.json");
      const record = '{"id":1,"user":{"name":"alice","email":"a@example.com"},"status":"ok","score":0}';
      writeFileSync(file, `[${new Array(250_000).fill(record).join(",")}]`);
      expect(statSync(file).size).toBeGreaterThan(19 * 1024 * 1024);

      const started = Date.now();
      const result = await runCLI(["--no-color", "search", "-m", "3", file, "status"]);
      const elapsed = Date.now() - started;

      expect(result.exitCode).toBe(0);
      expect(lines(result.stdout)).toHaveLength(3);
      // A full pass over this file takes 0.1 s or more; process start-up alone is most of this budget.
      expect(elapsed).toBeLessThan(5_000);
    });

    describe("with -o", () => {
      let work: string;

      beforeEach(() => {
        work = mkdtempSync(join(dir, "out-"));
      });

      const tempFiles = (): string[] => readdirSync(work).filter((name) => name.endsWith(".tmp"));

      test("commits the capped output atomically", async () => {
        const target = join(work, "capped.gron");
        writeFileSync(target, "old\n");
        chmodSync(target, 0o640);

        const result = await runCLI(["--no-color", "-o", target, "search", "-m", "2", "region"], DOC);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBe("");
        expect(lines(readFileSync(target, "utf8"))).toEqual([
          'json.deployments[0].region = "us-central1"',
          'json.deployments[1].region = "us-east1"',
        ]);
        expect(statSync(target).mode & 0o777).toBe(0o640);
        expect(result.stderr).toContain("Stopped after 2 matches");
        expect(result.stderr).toContain(`Output written to ${target}`);
        expect(tempFiles()).toEqual([]);
        expect(readdirSync(work)).toEqual(["capped.gron"]);
      });

      test("flatten --limit with -o writes exactly n lines", async () => {
        const target = join(work, "limited.gron");

        const result = await runCLI(["--no-color", "-o", target, "flatten", "--limit", "4"], DOC);

        expect(result.exitCode).toBe(0);
        expect(lines(readFileSync(target, "utf8"))).toHaveLength(4);
        expect(tempFiles()).toEqual([]);
      });

      test("replaces the input file in place when the cap ends the read early", async () => {
        const target = join(work, "self.json");
        writeFileSync(target, DOC);

        const result = await runCLI(["--no-color", "-o", target, "flatten", target, "--limit", "2"]);

        expect(result.exitCode).toBe(0);
        expect(readFileSync(target, "utf8")).toBe("json = {}\njson.service = {}\n");
        expect(tempFiles()).toEqual([]);
      });

      test("leaves an existing file untouched when the input is invalid before the cap", async () => {
        const target = join(work, "keep.gron");
        writeFileSync(target, "precious\n");

        const result = await runCLI(["--no-color", "-o", target, "search", "-m", "100", "a"], '{"a":[1,2,');

        expect(result.exitCode).toBe(1);
        expect(readFileSync(target, "utf8")).toBe("precious\n");
        expect(tempFiles()).toEqual([]);
      });

      test("creates no file when nothing matches", async () => {
        const target = join(work, "none.gron");

        const result = await runCLI(["--no-color", "-o", target, "search", "-m", "5", "no-such-text"], DOC);

        expect(result.exitCode).toBe(0);
        expect(existsSync(target)).toBe(false);
        expect(tempFiles()).toEqual([]);
      });

      test("--count with -m and -o writes the capped count", async () => {
        const target = join(work, "count.txt");

        const result = await runCLI(["--no-color", "-o", target, "search", "--count", "-m", "3", "e"], DOC);

        expect(result.exitCode).toBe(0);
        expect(readFileSync(target, "utf8")).toBe("3\n");
      });
    });
  });

  describe("--sort", () => {
    const UNSORTED = '{"b":{"z":1,"a":[3,{"y":1,"x":2}]},"a":0,"10":"ten","2":"two","B":null}';

    test("flatten keeps document order by default", async () => {
      const result = await runCLI(["--no-color", "flatten"], UNSORTED);

      expect(lines(result.stdout)).toEqual([
        "json = {}",
        "json.b = {}",
        "json.b.z = 1",
        "json.b.a = []",
        "json.b.a[0] = 3",
        "json.b.a[1] = {}",
        "json.b.a[1].y = 1",
        "json.b.a[1].x = 2",
        "json.a = 0",
        'json["10"] = "ten"',
        'json["2"] = "two"',
        "json.B = null",
      ]);
    });

    test("flatten --sort orders keys at every level and keeps array order", async () => {
      const result = await runCLI(["--no-color", "flatten", "--sort"], UNSORTED);

      expect(result.exitCode).toBe(0);
      expect(lines(result.stdout)).toEqual([
        "json = {}",
        'json["10"] = "ten"',
        'json["2"] = "two"',
        "json.B = null",
        "json.a = 0",
        "json.b = {}",
        "json.b.a = []",
        "json.b.a[0] = 3",
        "json.b.a[1] = {}",
        "json.b.a[1].x = 2",
        "json.b.a[1].y = 1",
        "json.b.z = 1",
      ]);
      expect(result.stderr).toBe("");
    });

    test("--sort output is identical for documents that differ only in key order", async () => {
      const one = await runCLI(["--no-color", "flatten", "--sort"], '{"a":1,"b":{"c":2,"d":3}}');
      const two = await runCLI(["--no-color", "flatten", "--sort"], '{"b":{"d":3,"c":2},"a":1}');

      expect(one.stdout).toBe(two.stdout);
    });

    test("search --sort filters first and sorts what is left", async () => {
      const result = await runCLI(["--no-color", "search", "--sort", "--regex", "\\.(x|y|z|a) = "], UNSORTED);

      expect(lines(result.stdout)).toEqual(["json.a = 0", "json.b.a = []", "json.b.a[1].x = 2", "json.b.a[1].y = 1", "json.b.z = 1"]);
    });

    test("search --sort with -v sorts the lines that did not match", async () => {
      const result = await runCLI(["--no-color", "search", "--sort", "-v", "--case-sensitive", "json.b"], UNSORTED);

      expect(lines(result.stdout)).toEqual(["json = {}", 'json["10"] = "ten"', 'json["2"] = "two"', "json.B = null", "json.a = 0"]);
    });

    test("--sort has no effect on --count", async () => {
      const sorted = await runCLI(["--no-color", "search", "--sort", "--count", "json"], UNSORTED);
      const plain = await runCLI(["--no-color", "search", "--count", "json"], UNSORTED);

      expect(sorted.stdout).toBe(plain.stdout);
    });

    test("--sort with --limit takes the first lines of the sorted order", async () => {
      const result = await runCLI(["--no-color", "flatten", "--sort", "--limit", "3"], UNSORTED);

      expect(lines(result.stdout)).toEqual(["json = {}", 'json["10"] = "ten"', 'json["2"] = "two"']);
      expect(result.stderr).toContain("Stopped after 3 lines (--limit)");
    });

    test("--sort with -m takes the first matches of the sorted order", async () => {
      const result = await runCLI(["--no-color", "search", "--sort", "-m", "1", "json.b."], UNSORTED);

      expect(lines(result.stdout)).toEqual(["json.b.a = []"]);
    });

    test("--sort works with -o", async () => {
      const target = join(dir, "sorted.gron");

      const result = await runCLI(["--no-color", "-o", target, "flatten", "--sort"], '{"b":1,"a":2}');

      expect(result.exitCode).toBe(0);
      expect(readFileSync(target, "utf8")).toBe("json = {}\njson.a = 2\njson.b = 1\n");
    });

    test("--sort output round-trips through unflatten", async () => {
      const flat = await runCLI(["--no-color", "flatten", "--sort"], UNSORTED);
      const back = await runCLI(["--no-color", "unflatten"], flat.stdout);

      expect(JSON.parse(back.stdout)).toEqual(JSON.parse(UNSORTED));
    });

    test("sorts a document much larger than the in-memory limit through a temp file", async () => {
      const members: string[] = [];
      for (let i = 0; i < 6000; i += 1) {
        const id = (i * 7919) % 6000;
        members.push(`"k${id}":{"name":"n${id}","tags":["x","y"],"deep":{"z":1,"a":${id}}}`);
      }
      const text = `{${members.join(",")}}`;
      const roomy = await runCLI(["--no-color", "flatten", "--sort"], text);
      const tight = await runCLI(["--no-color", "flatten", "--sort"], text, { GRONIFY_SORT_MEMORY: "2048" });

      expect(tight.exitCode).toBe(0);
      expect(tight.stdout).toBe(roomy.stdout);
      const keys = lines(roomy.stdout)
        .map((line) => /^json\.(k\d+) = \{\}$/.exec(line)?.[1])
        .filter((key): key is string => key !== undefined);
      expect(keys).toHaveLength(6000);
      expect(keys).toEqual([...keys].sort());
    });

    test("reports invalid JSON with exit 1", async () => {
      const result = await runCLI(["--no-color", "flatten", "--sort"], '{"a":');

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Unexpected end of input");
    });

    test("is described in --help, with its memory behaviour", async () => {
      for (const command of ["flatten", "search"]) {
        const result = await runCLI([command, "--help"]);

        expect(result.stdout).toContain("--sort");
        expect(result.stdout).toContain("Default: document order");
        expect(result.stdout).toContain("Memory");
      }
    });
  });

  describe("numbers are preserved", () => {
    const text = '{"id":12345678901234567890,"price":1.10,"ids":[12345678901234567890,1.10,1e2,-0],"name":"n"}';

    test("the premise: parsing and re-printing loses them", () => {
      const roundTripped = JSON.stringify(JSON.parse(text));

      expect(roundTripped).not.toContain("12345678901234567890");
      expect(roundTripped).not.toContain("1.10");
    });

    test("flatten prints 12345678901234567890 and 1.10 exactly", async () => {
      const result = await runCLI(["--no-color", "flatten"], text);

      expect(lines(result.stdout)).toEqual([
        "json = {}",
        "json.id = 12345678901234567890",
        "json.price = 1.10",
        "json.ids = []",
        "json.ids[0] = 12345678901234567890",
        "json.ids[1] = 1.10",
        "json.ids[2] = 1e2",
        "json.ids[3] = -0",
        'json.name = "n"',
      ]);
    });

    test("flatten --sort prints them exactly too", async () => {
      const result = await runCLI(["--no-color", "flatten", "--sort"], text);

      expect(result.stdout).toContain("json.id = 12345678901234567890\n");
      expect(result.stdout).toContain("json.price = 1.10\n");
      expect(result.stdout).toContain("json.ids[0] = 12345678901234567890\n");
    });

    test("search finds them and prints the original digits", async () => {
      const big = await runCLI(["--no-color", "search", "12345678901234567890"], text);
      const price = await runCLI(["--no-color", "search", "price"], text);
      const fixed = await runCLI(["--no-color", "search", "= 1.10"], text);

      expect(lines(big.stdout)).toEqual(["json.id = 12345678901234567890", "json.ids[0] = 12345678901234567890"]);
      expect(lines(price.stdout)).toEqual(["json.price = 1.10"]);
      expect(lines(fixed.stdout)).toEqual(["json.price = 1.10", "json.ids[1] = 1.10"]);
    });

    test("search finds nothing for the rounded value 12345678901234567000", async () => {
      const result = await runCLI(["--no-color", "search", "12345678901234567000"], text);

      expect(result.stdout).toBe("");
    });

    test("search from a file keeps them", async () => {
      const file = join(dir, "numbers.json");
      writeFileSync(file, text);

      const result = await runCLI(["--no-color", "search", file, "price", "--sort", "-m", "5"]);

      expect(lines(result.stdout)).toEqual(["json.price = 1.10"]);
    });
  });

  describe("--exit-status", () => {
    test("search exits 0 when it matches", async () => {
      const result = await runCLI(["--no-color", "search", "--exit-status", "region"], DOC);

      expect(result.exitCode).toBe(0);
      expect(lines(result.stdout)).toHaveLength(2);
    });

    test("search exits 1 when nothing matches", async () => {
      const result = await runCLI(["--no-color", "search", "--exit-status", "no-such-text"], DOC);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("No matches found");
    });

    test("without the flag a search with no matches still exits 0", async () => {
      const result = await runCLI(["--no-color", "search", "no-such-text"], DOC);

      expect(result.exitCode).toBe(0);
    });

    test("--count prints 0 and exits 1 when nothing matches", async () => {
      const none = await runCLI(["--no-color", "search", "--count", "--exit-status", "no-such-text"], DOC);
      const some = await runCLI(["--no-color", "search", "--count", "--exit-status", "region"], DOC);

      expect(none.stdout.trim()).toBe("0");
      expect(none.exitCode).toBe(1);
      expect(some.stdout.trim()).toBe("2");
      expect(some.exitCode).toBe(0);
    });

    test("-v exits 1 when every line matches", async () => {
      const everything = await runCLI(["--no-color", "search", "-v", "--exit-status", "json"], DOC);
      const some = await runCLI(["--no-color", "search", "-v", "--exit-status", "region"], DOC);

      expect(everything.exitCode).toBe(1);
      expect(some.exitCode).toBe(0);
    });

    test("a cap that was reached is a success", async () => {
      const result = await runCLI(["--no-color", "search", "--exit-status", "-m", "1", "region"], DOC);

      expect(result.exitCode).toBe(0);
    });

    test("works for a file argument and with --sort", async () => {
      const file = join(dir, "status.json");
      writeFileSync(file, DOC);

      const hit = await runCLI(["--no-color", "search", file, "status", "--exit-status", "--sort"]);
      const miss = await runCLI(["--no-color", "search", file, "nope", "--exit-status", "--sort"]);

      expect(hit.exitCode).toBe(0);
      expect(miss.exitCode).toBe(1);
    });

    test("errors exit 2, so they differ from 'no match'", async () => {
      const invalidJson = await runCLI(["--no-color", "search", "--exit-status", "a"], '{"a":');
      const invalidRegex = await runCLI(["--no-color", "search", "--exit-status", "--regex", "("], DOC);
      const missingFile = await runCLI(["--no-color", "search", join(dir, "missing.json"), "a", "--exit-status"]);

      for (const result of [invalidJson, invalidRegex, missingFile]) {
        expect(result.exitCode).toBe(2);
        expect(result.stderr).toContain("Error:");
      }
    });

    test("usage errors exit 2 too", async () => {
      const badCap = await runCLI(["search", "--exit-status", "-m", "0", "x"], DOC);
      const unknownOption = await runCLI(["search", "--exit-status", "--nope", "x"], DOC);

      expect(badCap.exitCode).toBe(2);
      expect(unknownOption.exitCode).toBe(2);
    });

    test("errors keep exit 1 without the flag", async () => {
      const invalidJson = await runCLI(["--no-color", "search", "a"], '{"a":');
      const badCap = await runCLI(["search", "-m", "0", "x"], DOC);

      expect(invalidJson.exitCode).toBe(1);
      expect(badCap.exitCode).toBe(1);
    });

    test("help and version still exit 0", async () => {
      expect((await runCLI(["search", "--help"])).exitCode).toBe(0);
      expect((await runCLI(["--version"])).exitCode).toBe(0);
    });

    test("is listed in the search help", async () => {
      const search = await runCLI(["search", "--help"]);
      const flatten = await runCLI(["flatten", "--help"]);

      expect(search.stdout).toContain("--exit-status");
      expect(search.stdout).toContain("--max-count");
      expect(flatten.stdout).toContain("--limit");
    });
  });
});
