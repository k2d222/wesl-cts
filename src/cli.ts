#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  command,
  flag,
  subcommands,
  positional,
  option,
  optional,
  oneOf,
  run,
  string,
} from "cmd-ts";

// The package root is one level above dist/ (where this file lives once built).
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const CTS_DIR = resolve(ROOT, "cts");
const RUN_DENO = resolve(CTS_DIR, "tools/run_deno");
const GPU_PROVIDER = resolve(ROOT, "wesl-cpu/index.ts");
const WESL_RS_DIR = resolve(ROOT, "../../wesl-rs");

function readTests(file: string): string[] {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) {
    console.error(`test file not found: ${path}`);
    process.exit(1);
  }
  return readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

/** Runs a single CTS query. Returns the exit code and captured output. */
function runOne(test: string): { code: number; output: string } {
  const result = spawnSync(
    RUN_DENO,
    ["--colors", "--gpu-provider", GPU_PROVIDER, test],
    { cwd: CTS_DIR, encoding: "utf8" },
  );
  const output = (result.stdout ?? "") + (result.stderr ?? "");
  return { code: result.status ?? 1, output };
}

const runCmd = command({
  name: "run",
  description:
    "Run CTS tests. Stops and prints detail on the first unexpected result.",
  args: {
    test: positional({
      type: optional(string),
      displayName: "test",
      description: "A single CTS query to run instead of the whole test file.",
    }),
    tests: option({
      type: string,
      long: "tests",
      description: "Test list file to run (one query per line).",
      defaultValue: () => "passing_tests.txt",
    }),
    expectFail: flag({
      long: "expect-fail",
      description:
        "Expect each test to fail: report ok when it fails, error when it passes.",
    }),
  },
  handler: ({ test, tests, expectFail }) => {
    const queries = test ? [test] : readTests(tests);

    for (const query of queries) {
      console.log(`running ${query}`);
      const { code, output } = runOne(query);
      const passed = code === 0;
      const ok = expectFail ? !passed : passed;

      if (!ok) {
        if (expectFail) {
          console.error(`\nUNEXPECTED PASS (expected failure): ${query}\n`);
        } else {
          console.error(`\nFAILED: ${query}\n`);
        }
        process.stdout.write(output);
        process.exit(1);
      }
    }

    console.log(
      expectFail
        ? "\nall tests failed as expected ✓"
        : "\nall tests passed ✓",
    );
  },
});

/** Runs a build command, exiting on failure. */
function build(cmd: string, args: string[], cwd: string): void {
  console.log(`\n> ${cmd} ${args.join(" ")}  (in ${cwd})`);
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if ((result.status ?? 1) !== 0) {
    console.error(`build failed: ${cmd} ${args.join(" ")}`);
    process.exit(1);
  }
}

function updateWesl(): void {
  build("cargo", ["xtask", "wesl-rs-web", "--release"], WESL_RS_DIR);
}

function updateCts(): void {
  build("npm", ["run", "standalone"], CTS_DIR);
}

const updateCmd = command({
  name: "update",
  description: "Build wesl-rs-web and cts. Builds both when no target is given.",
  args: {
    target: positional({
      type: optional(oneOf(["wesl", "cts"])),
      displayName: "target",
      description: "Only update 'wesl' or 'cts' instead of both.",
    }),
  },
  handler: ({ target }) => {
    if (target === "wesl") {
      updateWesl();
    } else if (target === "cts") {
      updateCts();
    } else {
      updateWesl();
      updateCts();
    }
  },
});

const cli = subcommands({
  name: "wesl-cts",
  description: "Run the WGSL Conformance Test Suite with wesl-rs.",
  cmds: { run: runCmd, update: updateCmd },
});

// Default to `run` when no subcommand is given.
const argv = process.argv.slice(2);
const known = new Set(["run", "update"]);
const normalized =
  argv.length === 0 || (!known.has(argv[0]) && !["--help", "-h"].includes(argv[0]))
    ? ["run", ...argv]
    : argv;

run(cli, normalized);
