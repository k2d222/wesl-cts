#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
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
const WESL_CPU_DIR = resolve(ROOT, "wesl-cpu");
const GPU_PROVIDER = resolve(WESL_CPU_DIR, "index.ts");

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
        process.stdout.write(output);
        if (expectFail) {
          console.error(`\nUNEXPECTED PASS (expected failure): ${query}\n`);
        } else {
          console.error(`\nFAILED: ${query}\n`);
        }
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

/**
 * Rebuilds wesl-rs-web and reinstalls it into wesl-cpu.
 * `cratePath`, when given, is the path to the wesl-rs-web crate; it becomes
 * wesl-cpu's "wesl-rs-web" dependency. When omitted, the crate is derived from
 * the current dependency.
 */
function updateWesl(cratePathArg?: string): void {
  const pkgPath = resolve(WESL_CPU_DIR, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  let cratePath: string;

  if (cratePathArg !== undefined) {
    cratePath = resolve(process.cwd(), cratePathArg);
    if (!existsSync(cratePath)) {
      console.error(`wesl-rs-web path not found: ${cratePath}`);
      process.exit(1);
    }
    // npm file: deps are resolved relative to the package that declares them.
    const rel = relative(WESL_CPU_DIR, cratePath);
    pkg.dependencies["wesl-rs-web"] = `file:${rel}`;
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
    console.log(`set wesl-rs-web dependency to file:${rel}`);
  } else {
    const dep: string = pkg.dependencies["wesl-rs-web"] ?? "";
    if (!dep.startsWith("file:")) {
      console.error(
        `wesl-rs-web dependency is not a file: path; pass --path <wesl-rs-web crate>`,
      );
      process.exit(1);
    }
    cratePath = resolve(WESL_CPU_DIR, dep.slice("file:".length));
  }

  build("npm", ["run", "build"], cratePath);
  build("npm", ["install"], WESL_CPU_DIR);
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
    path: option({
      type: optional(string),
      long: "path",
      description:
        "Path to the wesl-rs-web package to use as wesl-cpu's dependency.",
    }),
  },
  handler: ({ target, path }) => {
    if (target === "wesl") {
      updateWesl(path);
    } else if (target === "cts") {
      updateCts();
    } else {
      updateWesl(path);
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
