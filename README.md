# WESL-CTS

Run the WGSL Conformance Test Suite ([CTS]) with [`wesl-rs`].

* `cts/` is a patched version of the CTS.
* `wesl-cpu/` is a 'fake' WebGPU implementation that dispatches shader compilation commands to `wesl-rs-web`.

# Running

Install the CLI (builds `dist/` via the `prepare` script):

```sh
npm install
npm link   # optional: exposes the `wesl-cts` command globally
```

Then use `wesl-cts` (or `node dist/cli.js`):

* `wesl-cts run` — run every test in `passing_tests.txt`, stopping and printing
  the detail on the first failure. `run` is the default, so plain `wesl-cts`
  works too.
* `wesl-cts run <query>` — run a single CTS query instead of the whole file.
* `wesl-cts run --tests failing_tests.txt` — run a different test list.
* `wesl-cts run --tests failing_tests.txt --expect-fail` — expect failures
  (reports ok when a test fails, error when it passes).
* `wesl-cts update` — rebuild `wesl-rs-web` and `cts`.
* `wesl-cts update wesl` / `wesl-cts update cts` — rebuild only one of them.

Tests are listed one query per line in `passing_tests.txt` and
`failing_tests.txt`. Lines starting with `#` are ignored.

[CTS]: https://github.com/gpuweb/cts
[`wesl-rs`]: https://github.com/webgpu-tools/wesl-rs
