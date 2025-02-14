# WESL-CPU

A 'fake' WebGPU implementation to test CPU WGSL implementations.

# Naga and Wesl TODOs

where naga fails:
* declaring variables that shadow predeclared types (is now allowed by wgsl)
  * `webgpu:shader,validation,parse,shadow_builtins:*`
* declaring variables with reserved names (is not allowed by wgsl)
* shadowing errors
  * `var read : i32; var<storage, read> a: i32;` => `webgpu:shader,validation,parse,shadow_builtins:shadow_hides_access_mode`
  * `let atomicLoad = 4; _ = atomicLoad(&a);` => `webgpu:shader,validation,parse,shadow_builtins:shadow_hides_builtin_atomic`
* `textureBarrier()` not implemented?
  * `webgpu:shader,validation,parse,shadow_builtins:shadow_hides_builtin_barriers`
* `textureGather()` only accepts `vecN<f32>` coords
  * `webgpu:shader,validation,parse,shadow_builtins:shadow_hides_builtin_texture`
  * seems to be a regression in v22 => v23
  * overall, it seems that naga does not perform any implicit conversions for builtin function calls.
*

# Running

cd cts/
clear && node ./tools/run_node --colors --gpu-provider (realpath ../wesl-cpu/) 'webgpu:shader,validation,parse,*'

# Update wesl-web

get wesl-web from the playground
wasm-pack build wesl-web --dev --target nodejs --out-dir path/to/wesl-cts/wesl-cpu/wesl-web --no-default-features --features naga,wesl
