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

* `wesl-cts update` — rebuild `wesl-rs-web` and `cts`.
* `wesl-cts update wesl --path <wesl-rs-web>` — change the path to `wesl-rs-web` crate and rebuild it.
* `wesl-cts run` — run every test in `passing_tests.txt`, stopping and printing
  the detail on the first failure.
* `wesl-cts run <query>` — run a single CTS query instead of the whole file.
* `wesl-cts run --tests failing_tests.txt --expect-fail` — ensure failing_tests fail.

[CTS]: https://github.com/gpuweb/cts
[`wesl-rs`]: https://github.com/webgpu-tools/wesl-rs
