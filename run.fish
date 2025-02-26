#!/usr/bin/env fish

set -a failing_tests 'webgpu:shader,execution,expression,access,array,index:runtime_sized:elementType="i32";indexType="i32"' # @builtin(local_invocation_id)
set -a failing_tests 'webgpu:shader,execution,expression,access,matrix,index:non_const_index:columns=4;rows=4' # @builtin(local_invocation_id)
set -a failing_tests 'webgpu:shader,execution,expression,access,structure,index:buffer_pointer:member_types=["i32","u32","f32","f16","vec3f","vec4i"];inputSource="storage"' # TODO for pointer storage evaluation

set -a passing_tests 'webgpu:shader,execution,expression,access,vector,*'
set -a passing_tests 'webgpu:shader,execution,expression,binary,af_addition:*'
set -a passing_tests 'webgpu:shader,execution,expression,call,user,*'
set -a passing_tests 'webgpu:shader,execution,expression,constructor,*'
set -a passing_tests 'webgpu:shader,execution,expression,precedence,*'
set -a passing_tests 'webgpu:shader,execution,expression,unary,*'


set test $argv[1]

cd cts

set cli deno run --allow-read --allow-env out/common/runtime/cmdline.js

if test $test
    echo running $test
    $cli --colors --gpu-provider (realpath ../wesl-cpu/index.ts) $test
else
    for test in $passing_tests
        echo running $test
        $cli --colors --gpu-provider (realpath ../wesl-cpu/index.ts) $test
    end
end
