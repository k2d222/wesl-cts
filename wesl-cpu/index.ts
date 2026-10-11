import InitWesl, * as Wesl from "wesl-rs-web";
await InitWesl()

// @ts-ignore
const DEBUG = process.env.DEBUG === "0" ? false : !!process.env.DEBUG;

if (DEBUG) {
  Wesl.init_log("Debug");
  console.log("wesl-cpu initializing");
} else {
  Wesl.init_log("Info");
}

// The interface that exposes creation of the GPU, and optional interface to code coverage.
interface GPUProviderModule {
  // @returns a GPU with the given flags
  create(flags: string[]): GPU;
  // An optional interface to a CodeCoverageProvider
  coverage?: CodeCoverageProvider;
}

interface CodeCoverageProvider {
  // Starts collecting code coverage
  begin(): void;
  // Ends collecting of code coverage, returning the coverage data.
  // This data is opaque (implementation defined).
  end(): string;
}

function displayError(kind: string, ...msg: any[]) {
  if (DEBUG) {
    console.error(`\x1b[41m[${kind}]\x1b[0m`, ...msg);
    debugger;
  }
}

function displayDebug(kind: string, ...msg: any[]) {
  if (DEBUG) {
    console.debug(`\x1b[42m[${kind}]\x1b[0m`, ...msg);
    debugger;
  }
}

class CPUPipelineError extends DOMException implements GPUPipelineError {
  __brand: "GPUPipelineError";
  reason: GPUPipelineErrorReason;

  constructor(
    message?: string,
    options: GPUPipelineErrorInit = { reason: "internal" },
  ) {
    super();
    this.__brand = "GPUPipelineError";
    this.reason = options.reason;
    displayError("GPUPipelineError", message);
  }
}

const Error = CPUPipelineError;

const CPUSupportedLimits: GPUSupportedLimits = {
  __brand: "GPUSupportedLimits",
  maxTextureDimension1D: 8192,
  maxTextureDimension2D: 8192,
  maxTextureDimension3D: 2048,
  maxTextureArrayLayers: 256,
  maxBindGroups: 4,
  maxBindGroupsPlusVertexBuffers: 24,
  maxBindingsPerBindGroup: 640,
  maxDynamicUniformBuffersPerPipelineLayout: 8,
  maxDynamicStorageBuffersPerPipelineLayout: 4,
  maxSampledTexturesPerShaderStage: 16,
  maxSamplersPerShaderStage: 16,
  maxStorageBuffersPerShaderStage: 8,
  maxStorageTexturesPerShaderStage: 4,
  maxUniformBuffersPerShaderStage: 12,
  maxUniformBufferBindingSize: 65536,
  maxStorageBufferBindingSize: 134217728,
  minUniformBufferOffsetAlignment: 256,
  minStorageBufferOffsetAlignment: 256,
  maxVertexBuffers: 8,
  maxBufferSize: 268435456,
  maxVertexAttributes: 16,
  maxVertexBufferArrayStride: 2048,
  maxInterStageShaderVariables: 60,
  maxColorAttachments: 8,
  maxColorAttachmentBytesPerSample: 32,
  maxComputeWorkgroupStorageSize: 16384,
  maxComputeInvocationsPerWorkgroup: 256,
  maxComputeWorkgroupSizeX: 256,
  maxComputeWorkgroupSizeY: 256,
  maxComputeWorkgroupSizeZ: 64,
  maxComputeWorkgroupsPerDimension: 65535,
};

class CPUValidationError implements GPUValidationError {
  __brand: "GPUValidationError";
  message: string;

  constructor(message: string) {
    this.__brand = "GPUValidationError";
    this.message = message;
  }
}

class CPUInternalError implements GPUInternalError {
  __brand: "GPUInternalError";
  message: string;

  constructor(message: string) {
    this.__brand = "GPUInternalError";
    this.message = message;
  }
}

class CPUQueue implements GPUQueue {
  __brand: "GPUQueue";
  label: string;

  _onWorkDone: Promise<undefined>;

  constructor() {
    this.__brand = "GPUQueue";
    this.label = "";

    this._onWorkDone = Promise.resolve(undefined);
  }
  submit(commandBuffers: Iterable<GPUCommandBuffer>): undefined {
    // console.log('command buffers', commandBuffers)
    // throw new Error("Method not implemented: submit")
  }
  onSubmittedWorkDone(): Promise<undefined> {
    return this._onWorkDone;
  }
  writeBuffer(
    buffer: GPUBuffer,
    bufferOffset: GPUSize64,
    data: BufferSource | SharedArrayBuffer,
    dataOffset?: GPUSize64,
    size?: GPUSize64,
  ): undefined {
    throw new Error("Method not implemented: writeBuffer");
  }
  writeTexture(
    destination: GPUTexelCopyTextureInfo,
    data: BufferSource | SharedArrayBuffer,
    dataLayout: GPUTexelCopyBufferLayout,
    size: GPUExtent3DStrict,
  ): undefined {
    throw new Error("Method not implemented: writeTexture");
  }
  copyExternalImageToTexture(
    source: GPUCopyExternalImageSourceInfo,
    destination: GPUCopyExternalImageDestInfo,
    copySize: GPUExtent3DStrict,
  ): undefined {
    throw new Error("Method not implemented: copyExternalImageToTexture");
  }
}

class CPUShaderModule implements GPUShaderModule {
  __brand: "GPUShaderModule";
  label: string;

  _descriptor: GPUShaderModuleDescriptor;
  _messages: GPUCompilationMessage[];
  _device: CPUDevice;

  constructor(descriptor: GPUShaderModuleDescriptor, device: CPUDevice) {
    this.__brand = "GPUShaderModule";
    this.label = descriptor.label ?? "";

    this._descriptor = descriptor;
    this._messages = [];
    this._device = device;

    try {
      let res = Wesl.run({
        command: "Compile",
        files: { "package::main": descriptor.code },
        main: "package::main",
        mangler: "none",
        sourcemap: true,
        imports: false,
        condcomp: false,
        visibility: false,
        generics: false,
        strip: false,
        lower: false,
        validate: false,
        naga: false,
        lazy: false,
        keep: undefined,
        keep_main: false,
        mangle_main: false,
        features: {},
      }) as string;
      displayDebug("COMPILE", res);
    } catch (e) {
      const err = e as Wesl.Error;
      displayError("COMPILE", err.message, "\n", err.source);
      // TODO: diagnostic source location is incorrect
      // const diagnostic = err.diagnostics[0]
      this._messages.push({
        __brand: "GPUCompilationMessage",
        message: err.message,
        type: "error",
        lineNum: 0,
        linePos: 0,
        offset: 0,
        length: 0,
        // offset: diagnostic.span.start,
        // length: diagnostic.span.end - diagnostic.span.start
      });
      const scope = this._device._errorScopes.at(
        this._device._errorScopes.length - 1,
      );
      if (scope && scope.filter === "validation") {
        scope.errors.push(new GPUValidationError(err.message));
      }
    }
  }
  async getCompilationInfo(): Promise<GPUCompilationInfo> {
    return {
      __brand: "GPUCompilationInfo",
      messages: this._messages,
    };
  }
}

type CPUProgrammableStage = GPUProgrammableStage & {
  module: CPUShaderModule;
};

type CPUComputePipelineDescriptor = GPUComputePipelineDescriptor & {
  compute: CPUProgrammableStage;
};

function getEntryPoint(wesl: any, stage: string): any | null {
  for (const decl of wesl.global_declarations) {
    if (decl.node.Function) {
      const entryAttr = decl.node.Function.attributes.find(
        (attr: any) => attr.node === stage,
      );
      if (entryAttr) {
        return decl.node.Function;
      }
    }
  }
  return null;
}

function getStaticUsages(wesl: any, entryPoint: Object): any[] {
  const res = [];

  for (const decl of wesl.global_declarations) {
    if (decl.node.Declaration) {
      const entryAttr = decl.node.Declaration.attributes.find(
        (attr: any) => attr.node.Group,
      );
      if (entryAttr) {
        res.push(decl.node.Declaration);
      }
    }
  }

  return res;

  // TODO
  // const entry = wesl.global_declarations.find((decl: any) => decl.Function?.name === entryPoint)
  // for (const stat of entry.Function.body.statements) {
  // }
}

// algorithm reference: https://gpuweb.github.io/gpuweb/#default-pipeline-layout
function createDefaultPipelineLayout(device: CPUDevice, code: string) {
  let groupCount = 0;

  let wesl;
  try {
    wesl = Wesl.run({
      command: "Dump",
      source: code,
    });
    // displayDebug("DUMP", wesl);
  } catch (e) {
    let err = e as Wesl.Error;
    displayError("DUMP", err.message, "\n", err.source);
    throw new Error(err.message);
  }

  let groupDescs = Array.from({ length: device.limits.maxBindGroups }).map(
    () => ({ entries: [] }) as CPUBindGroupLayoutDescriptor,
  );
  const shaderStage = GPUShaderStage.COMPUTE;
  const entryPoint = getEntryPoint(wesl, "Compute");
  if (!entryPoint) throw new Error("entryPoint is null");
  const staticUsages = getStaticUsages(wesl, entryPoint);

  for (const resource of staticUsages) {
    const group = Number(
      resource.attributes.find((attr: any) => attr.node.Group).node.Group.node
        .Literal.AbstractInt,
    );
    const binding = Number(
      resource.attributes.find((attr: any) => attr.node.Binding).node.Binding
        .node.Literal.AbstractInt,
    );
    const entry: GPUBindGroupLayoutEntry = {
      binding: binding,
      visibility: shaderStage,
      // TODO steps 6-10
    };
    if (resource.kind.Var && resource.kind.Var.includes("Storage")) {
      const bufferLayout: GPUBufferBindingLayout = {
        minBindingSize: 0, // TODO
        type: resource.kind.Var.includes("ReadWrite")
          ? "storage"
          : "read-only-storage",
      };
      entry.buffer = bufferLayout;
    }
    groupCount = Math.max(groupCount, group + 1);
    if (false) {
      // TODO step 12
    } else {
      (groupDescs[group].entries as GPUBindGroupLayoutEntry[]).push(entry);
    }
  }

  const groupLayouts = [];
  for (let i = 0; i < groupCount; ++i) {
    const groupDesc = groupDescs[i];
    const bindGroupLayout = device.createBindGroupLayout(groupDesc);
    // TODO step 6.2
    groupLayouts.push(bindGroupLayout);
  }
  const desc: CPUPipelineLayoutDescriptor = { bindGroupLayouts: groupLayouts };
  return [device.createPipelineLayout(desc), wesl];
}

class CPUComputePipeline implements GPUComputePipeline {
  __brand: "GPUComputePipeline";
  label: string;

  _descriptor: CPUComputePipelineDescriptor;

  constructor(descriptor: CPUComputePipelineDescriptor) {
    this.__brand = "GPUComputePipeline";
    this.label = descriptor.label ?? "";
    this._descriptor = descriptor;

    if (descriptor.layout === "auto") {
      const device = descriptor.compute.module._device;
      const code = descriptor.compute.module._descriptor.code;
      const [layout, wesl] = createDefaultPipelineLayout(device, code);
      descriptor.layout = layout!;
      if (!descriptor.compute.entryPoint) {
        const entry = getEntryPoint(wesl, "Compute");
        if (!entry) throw new Error("no compute entry point in shader");
        descriptor.compute.entryPoint = entry.ident;
      }
    } else {
      throw new Error("todo");
    }
  }
  getBindGroupLayout(index: number): CPUBindGroupLayout {
    const layout = this._descriptor.layout as CPUPipelineLayout;
    const bg = layout._descriptor.bindGroupLayouts[index];
    if (!bg) throw new Error("no bind group layout " + index);
    return bg;
  }
}

class CPURenderPipeline implements GPURenderPipeline {
  __brand: "GPURenderPipeline";
  label: string;

  _descriptor: GPURenderPipelineDescriptor;

  constructor(descriptor: GPURenderPipelineDescriptor) {
    this.__brand = "GPURenderPipeline";
    this.label = descriptor.label ?? "";
    this._descriptor = descriptor;
  }
  getBindGroupLayout(index: number): GPUBindGroupLayout {
    const layout = this._descriptor.layout as CPUPipelineLayout;
    const bg = layout._descriptor.bindGroupLayouts[index];
    if (bg === null) throw new Error("no bind group layout " + index);
    return bg;
  }
}

class CPUBindGroup implements GPUBindGroup {
  __brand: "GPUBindGroup";
  label: string;

  _descriptor: GPUBindGroupDescriptor;

  constructor(descriptor: GPUBindGroupDescriptor) {
    this.__brand = "GPUBindGroup";
    this.label = descriptor.label ?? "";
    this._descriptor = descriptor;
  }
}

interface CPUBindGroupLayoutDescriptor extends GPUObjectDescriptorBase {
  entries: GPUBindGroupLayoutEntry[];
}

class CPUBindGroupLayout implements GPUBindGroupLayout {
  __brand: "GPUBindGroupLayout";
  label: string;

  _descriptor: CPUBindGroupLayoutDescriptor;

  constructor(descriptor: CPUBindGroupLayoutDescriptor) {
    this.__brand = "GPUBindGroupLayout";
    this.label = descriptor.label ?? "";
    this._descriptor = descriptor;
  }
}

interface CPUPipelineLayoutDescriptor extends GPUPipelineLayoutDescriptor {
  bindGroupLayouts: (CPUBindGroupLayout | null)[];
}

class CPUPipelineLayout implements GPUPipelineLayout {
  __brand: "GPUPipelineLayout";
  label: string;

  _descriptor: CPUPipelineLayoutDescriptor;

  constructor(descriptor: CPUPipelineLayoutDescriptor) {
    this.__brand = "GPUPipelineLayout";
    this.label = descriptor.label ?? "";
    this._descriptor = descriptor;
  }
}

class CPUBuffer implements GPUBuffer {
  __brand: "GPUBuffer";
  label: string;
  size: number;
  usage: number;
  mapState: GPUBufferMapState;

  _descriptor: GPUBufferDescriptor;
  _buffer: ArrayBuffer;
  _mappedRange?: [ArrayBuffer, number];

  constructor(descriptor: GPUBufferDescriptor) {
    this.__brand = "GPUBuffer";
    this.label = descriptor.label ?? "";
    this.size = descriptor.size;
    this.usage = descriptor.usage;
    this.mapState = descriptor.mappedAtCreation ? "mapped" : "unmapped";
    this._buffer = new ArrayBuffer(this.size);

    this._descriptor = descriptor;
  }
  async mapAsync(
    mode: GPUMapModeFlags,
    offset?: GPUSize64,
    size?: GPUSize64,
  ): Promise<undefined> {
    this.mapState = "mapped";
    // console.log(mode, offset, size)
    // throw new Error("Method not implemented: mapAsync")
  }
  getMappedRange(offset?: GPUSize64, size?: GPUSize64): ArrayBuffer {
    const off = offset ?? 0;
    const siz = size ?? this._buffer.byteLength - off;
    const buf = this._buffer.slice(off, off + siz);
    this._mappedRange = [buf, off];
    return buf;
  }
  unmap(): undefined {
    if (!this._mappedRange)
      throw new Error("unmap() called but GPUBuffer was not mapped");
    const [arr, off] = this._mappedRange;
    this.mapState = "unmapped";
    this._mappedRange = undefined;
    new Uint8Array(this._buffer).set(new Uint8Array(arr), off);
  }
  destroy(): undefined {}
}

class CPUPassEncoder {
  label: string;

  _bindGroups: {
    index: GPUIndex32;
    bindGroup: CPUBindGroup | null;
    dynamicOffsetsData?: Uint32Array;
    dynamicOffsetsDataStart?: GPUSize64;
    dynamicOffsetsDataLength?: GPUSize32;
  }[];

  constructor() {
    this.label = "";
    this._bindGroups = [];
  }

  setBindGroup(
    index: GPUIndex32,
    bindGroup: CPUBindGroup | null,
    dynamicOffsetsData?: Uint32Array,
    dynamicOffsetsDataStart?: GPUSize64,
    dynamicOffsetsDataLength?: GPUSize32,
  ): undefined {
    this._bindGroups[index] = {
      index,
      bindGroup,
      dynamicOffsetsData,
      dynamicOffsetsDataStart,
      dynamicOffsetsDataLength,
    };
  }
}

class CPUComputePassEncoder
  extends CPUPassEncoder
  implements GPUComputePassEncoder
{
  __brand: "GPUComputePassEncoder";

  _descriptor?: GPUComputePassDescriptor;
  _pipeline?: CPUComputePipeline;

  constructor(descriptor?: GPUComputePassDescriptor) {
    super();
    this.__brand = "GPUComputePassEncoder";
    this.label = descriptor?.label ?? "";
    this._descriptor = descriptor;
  }
  setPipeline(pipeline: CPUComputePipeline): undefined {
    this._pipeline = pipeline;
  }
  dispatchWorkgroups(
    workgroupCountX: GPUSize32,
    workgroupCountY: GPUSize32 = 1,
    workgroupCountZ: GPUSize32 = 1,
  ): undefined {
    if (!this._pipeline) throw new Error("no pipeline set");
    const entry = this._pipeline._descriptor.compute.entryPoint;
    const code = this._pipeline._descriptor.compute.module._descriptor.code;
    if (!entry || !code) {
      console.error(
        "compute GpuProgrammableStage:",
        this._pipeline._descriptor.compute,
      );
      debugger;
      throw new Error("cannot dispatch with no entrypoint/code");
    }

    let bindings: Wesl.Binding[] = [];
    for (const g of this._bindGroups) {
      // TODO dynamic offsets (g.dynamic*)
      if (g.bindGroup) {
        for (const e of g.bindGroup._descriptor.entries) {
          if ("buffer" in e.resource) {
            const buf = e.resource.buffer as CPUBuffer;
            const off = e.resource.offset ?? 0;
            const end = e.resource.size ?? buf._buffer.byteLength - off;
            const data = new Uint8Array(buf._buffer, off, end);
            const usage = e.resource.buffer.usage;
            const groupLayout = this._pipeline.getBindGroupLayout(g.index);
            const layout = groupLayout._descriptor.entries.find(
              (b) => b.binding === e.binding,
            );
            if (!layout) throw new Error("no binding layout " + e.binding);
            let kind: Wesl.BindingType;
            if (layout.buffer) {
              if (!layout.buffer.type) throw new Error("no buffer type");
              kind = layout.buffer.type;
            } else if (
              layout.externalTexture ||
              layout.sampler ||
              layout.storageTexture ||
              layout.texture
            ) {
              throw new Error("TODO binding type");
            } else {
              kind = "uniform";
            }
            bindings.push({
              group: g.index,
              binding: e.binding,
              kind: kind,
              data: data, // TODO why is the uint8array not supported?
            });
          }
        }
      }
    }

    let runArgs: Wesl.Command = {
      command: "Exec",
      files: { "package::main": code },
      main: "package::main",
      mangler: "none",
      sourcemap: true,
      imports: false,
      condcomp: false,
      visibility: false,
      generics: false,
      strip: false,
      lower: false,
      validate: false,
      naga: false,
      lazy: false,
      keep: undefined,
      keep_main: false,
      mangle_main: false,
      features: {},
      entrypoint: entry,
      resources: bindings,
      overrides: {},
      builtins: {},
      user_inputs: {},
    };

    let workgroupSizeX = 1, workgroupSizeY = 1, workgroupSizeZ = 1;

    let workgroupSizeAttr = /@\s*workgroup_size\s*\(\s*(\d+)\s*(,\s*(\d+)\s*(,\s*(\d+)\s*)?)?\)/.exec(code);
    if (workgroupSizeAttr) {
      workgroupSizeX = workgroupSizeAttr[1] ? parseInt(workgroupSizeAttr[1]) : 1;
      workgroupSizeY = workgroupSizeAttr[2] ? parseInt(workgroupSizeAttr[2]) : 1;
      workgroupSizeZ = workgroupSizeAttr[3] ? parseInt(workgroupSizeAttr[3]) : 1;
    }
    displayDebug("WORKGROUP", workgroupSizeX, workgroupSizeY, workgroupSizeZ);

    const numWorkgroups = workgroupCountX * workgroupCountY * workgroupCountZ;
    const workgroupSize = workgroupSizeX * workgroupSizeY * workgroupSizeZ;
    const numInvocations = numWorkgroups * workgroupSize;

    try {
      for (let i = 0; i < numInvocations; i++) {
        const localIndex = i % workgroupSize;
        const localIdX = localIndex % workgroupSizeX
        const localIdY = Math.floor(localIndex / workgroupSizeX) % workgroupSizeY
        const localIdZ = Math.floor(localIndex / workgroupSizeX / workgroupSizeY) % workgroupSizeZ
        const workgroupIndex = Math.floor(i / workgroupSize)
        const workgroupIdX = workgroupIndex % workgroupCountX
        const workgroupIdY = Math.floor(workgroupIndex / workgroupCountX) % workgroupCountY
        const workgroupIdZ = Math.floor(workgroupIndex / workgroupCountX / workgroupCountY) % workgroupCountZ
        const globalIdX = localIdX + workgroupIdX * workgroupSizeX
        const globalIdY = localIdY + workgroupIdY * workgroupSizeY
        const globalIdZ = localIdZ + workgroupIdZ * workgroupSizeZ
        runArgs.builtins = {
          "local_invocation_id": `vec3<u32>(${localIdX}, ${localIdY}, ${localIdZ})`,
          "local_invocation_index": `${localIndex}u`,
          "global_invocation_id": `vec3<u32>(${globalIdX}, ${globalIdY}, ${globalIdZ})`,
          "global_invocation_index": `${i}u`,
          "workgroup_id": `vec3<u32>(${workgroupIdX}, ${workgroupIdY}, ${workgroupIdZ})`,
          "workgroup_index": `${workgroupIndex}u`,
          "num_workgroups": `vec3<u32>(${workgroupCountX}, ${workgroupCountY}, ${workgroupCountZ})`,
        }
        displayDebug("BUILTINS", runArgs.builtins)
        bindings = Wesl.run(runArgs) as Wesl.Binding[];
        runArgs.resources = bindings
      }

      displayDebug("EXEC", bindings);

      for (const g of this._bindGroups) {
        // TODO dynamic offsets (g.dynamic*)
        if (g.bindGroup) {
          for (const e of g.bindGroup._descriptor.entries) {
            if ("buffer" in e.resource) {
              const buf = e.resource.buffer as CPUBuffer;
              const newBuf = bindings.find(
                (b) => b.group === g.index && b.binding === e.binding,
              )?.data;
              if (!newBuf) {
                throw new Error(
                  `wesl did not return binding g=${g.index} b=${e.binding}`,
                );
              }
              const off = e.resource.offset ?? 0;
              const end = e.resource.size ?? buf._buffer.byteLength - off;
              if (DEBUG && end !== newBuf.byteLength) {
                console.error(
                  "binding changed size, size: ",
                  end,
                  "offset: ",
                  off,
                  ", old binding:",
                  buf._buffer,
                  "new binding:",
                  newBuf.buffer,
                );
                // throw new Error("binding changed size");
              }
              new Uint8Array(buf._buffer, off, end).set(newBuf);
            }
          }
        }
      }
    } catch (e) {
      const err = e as Wesl.Error;
      displayError("EXEC", err.message, "\n", err.source);

      const device = this._pipeline._descriptor.compute.module._device;
      const scope = device._errorScopes.at(device._errorScopes.length - 1);
      if (scope && scope.filter === "internal") {
        scope.errors.push(new GPUInternalError(err.message));
      }
    }
  }
  dispatchWorkgroupsIndirect(
    indirectBuffer: GPUBuffer,
    indirectOffset: GPUSize64,
  ): undefined {
    throw new Error("Method not implemented: dispatchWorkgroupsIndirect");
  }
  end(): undefined {}
  pushDebugGroup(groupLabel: string): undefined {
    throw new Error("Method not implemented: pushDebugGroup");
  }
  popDebugGroup(): undefined {
    throw new Error("Method not implemented: popDebugGroup");
  }
  insertDebugMarker(markerLabel: string): undefined {
    throw new Error("Method not implemented: insertDebugMarker");
  }
}

class CPURenderPassEncoder
  extends CPUPassEncoder
  implements GPURenderPassEncoder
{
  __brand: "GPURenderPassEncoder";

  _descriptor: GPURenderPassDescriptor;
  _pipeline?: GPURenderPipeline;

  constructor(descriptor: GPURenderPassDescriptor) {
    super();
    this.__brand = "GPURenderPassEncoder";
    this.label = descriptor.label ?? "";
    this._descriptor = descriptor;
  }
  setViewport(
    x: number,
    y: number,
    width: number,
    height: number,
    minDepth: number,
    maxDepth: number,
  ): undefined {
    throw new Error("Method not implemented: setViewport");
  }
  setScissorRect(
    x: GPUIntegerCoordinate,
    y: GPUIntegerCoordinate,
    width: GPUIntegerCoordinate,
    height: GPUIntegerCoordinate,
  ): undefined {
    throw new Error("Method not implemented: setScissorRect");
  }
  setBlendConstant(color: GPUColor): undefined {
    throw new Error("Method not implemented: setBlendConstant");
  }
  setStencilReference(reference: GPUStencilValue): undefined {
    throw new Error("Method not implemented: setStencilReference");
  }
  beginOcclusionQuery(queryIndex: GPUSize32): undefined {
    throw new Error("Method not implemented: beginOcclusionQuery");
  }
  endOcclusionQuery(): undefined {
    throw new Error("Method not implemented: endOcclusionQuery");
  }
  executeBundles(bundles: Iterable<GPURenderBundle>): undefined {
    throw new Error("Method not implemented: executeBundles");
  }
  end(): undefined {
    throw new Error("Method not implemented: end");
  }
  pushDebugGroup(groupLabel: string): undefined {
    throw new Error("Method not implemented: pushDebugGroup");
  }
  popDebugGroup(): undefined {
    throw new Error("Method not implemented: popDebugGroup");
  }
  insertDebugMarker(markerLabel: string): undefined {
    throw new Error("Method not implemented: insertDebugMarker");
  }
  setPipeline(pipeline: GPURenderPipeline): undefined {
    this._pipeline = pipeline;
  }
  setIndexBuffer(
    buffer: GPUBuffer,
    indexFormat: GPUIndexFormat,
    offset?: GPUSize64,
    size?: GPUSize64,
  ): undefined {
    throw new Error("Method not implemented: setIndexBuffer");
  }
  setVertexBuffer(
    slot: GPUIndex32,
    buffer: GPUBuffer | null,
    offset?: GPUSize64,
    size?: GPUSize64,
  ): undefined {
    throw new Error("Method not implemented: setVertexBuffer");
  }
  draw(
    vertexCount: GPUSize32,
    instanceCount?: GPUSize32,
    firstVertex?: GPUSize32,
    firstInstance?: GPUSize32,
  ): undefined {
    throw new Error("Method not implemented: draw");
  }
  drawIndexed(
    indexCount: GPUSize32,
    instanceCount?: GPUSize32,
    firstIndex?: GPUSize32,
    baseVertex?: GPUSignedOffset32,
    firstInstance?: GPUSize32,
  ): undefined {
    throw new Error("Method not implemented: drawIndexed");
  }
  drawIndirect(
    indirectBuffer: GPUBuffer,
    indirectOffset: GPUSize64,
  ): undefined {
    throw new Error("Method not implemented: drawIndirect");
  }
  drawIndexedIndirect(
    indirectBuffer: GPUBuffer,
    indirectOffset: GPUSize64,
  ): undefined {
    throw new Error("Method not implemented: drawIndexedIndirect");
  }
}

class CPUCommandBuffer implements GPUCommandBuffer {
  __brand: "GPUCommandBuffer";
  label: string;

  _commands: any[];

  constructor() {
    this.__brand = "GPUCommandBuffer";
    this.label = "";

    this._commands = [];
  }
}

class CPUCommandEncoder implements GPUCommandEncoder {
  __brand: "GPUCommandEncoder";
  label: string;

  _descriptor?: GPUCommandEncoderDescriptor;
  _buffer: CPUCommandBuffer;

  constructor(descriptor?: GPUCommandEncoderDescriptor) {
    this.__brand = "GPUCommandEncoder";
    this.label = "";
    this._descriptor = descriptor;
    this._buffer = new CPUCommandBuffer();
  }
  beginRenderPass(descriptor: GPURenderPassDescriptor): GPURenderPassEncoder {
    const pass = new CPURenderPassEncoder(descriptor);
    this._buffer._commands.push(pass);
    return pass;
  }
  beginComputePass(
    descriptor?: GPUComputePassDescriptor,
  ): GPUComputePassEncoder {
    const pass = new CPUComputePassEncoder(descriptor);
    this._buffer._commands.push(pass);
    return pass;
  }
  copyBufferToBuffer(
    source: CPUBuffer,
    sourceOffset: GPUSize64,
    destination: CPUBuffer,
    destinationOffset: GPUSize64,
    size: GPUSize64,
  ): undefined {
    const src = new Uint8Array(source._buffer, sourceOffset, size);
    const dst = new Uint8Array(destination._buffer, destinationOffset);
    dst.set(src);
  }
  copyBufferToTexture(
    source: GPUTexelCopyBufferInfo,
    destination: GPUTexelCopyTextureInfo,
    copySize: GPUExtent3DStrict,
  ): undefined {
    throw new Error("Method not implemented: copyBufferToTexture");
  }
  copyTextureToBuffer(
    source: GPUTexelCopyTextureInfo,
    destination: GPUTexelCopyBufferInfo,
    copySize: GPUExtent3DStrict,
  ): undefined {
    throw new Error("Method not implemented: copyTextureToBuffer");
  }
  copyTextureToTexture(
    source: GPUTexelCopyTextureInfo,
    destination: GPUTexelCopyTextureInfo,
    copySize: GPUExtent3DStrict,
  ): undefined {
    throw new Error("Method not implemented: copyTextureToTexture");
  }
  clearBuffer(
    buffer: GPUBuffer,
    offset?: GPUSize64,
    size?: GPUSize64,
  ): undefined {
    throw new Error("Method not implemented: clearBuffer");
  }
  resolveQuerySet(
    querySet: GPUQuerySet,
    firstQuery: GPUSize32,
    queryCount: GPUSize32,
    destination: GPUBuffer,
    destinationOffset: GPUSize64,
  ): undefined {
    throw new Error("Method not implemented: resolveQuerySet");
  }
  finish(descriptor?: GPUCommandBufferDescriptor): GPUCommandBuffer {
    return this._buffer;
  }
  pushDebugGroup(groupLabel: string): undefined {
    throw new Error("Method not implemented: pushDebugGroup");
  }
  popDebugGroup(): undefined {
    throw new Error("Method not implemented: popDebugGroup");
  }
  insertDebugMarker(markerLabel: string): undefined {
    throw new Error("Method not implemented: insertDebugMarker");
  }
}

class CPUDevice implements GPUDevice {
  __brand: "GPUDevice";
  features: GPUSupportedFeatures;
  limits: GPUSupportedLimits;
  queue: GPUQueue;
  lost: Promise<GPUDeviceLostInfo>;
  onuncapturederror:
    | ((this: GPUDevice, ev: GPUUncapturedErrorEvent) => any)
    | null;
  label: string;

  _errorScopes: { filter: GPUErrorFilter; errors: GPUError[] }[];
  _lostResolve?: (info: GPUDeviceLostInfo) => void;

  constructor() {
    this.__brand = "GPUDevice";
    this.features = new Set([
      "depth-clip-control",
      "depth32float-stencil8",
      "texture-compression-bc",
      "texture-compression-bc-sliced-3d",
      "texture-compression-etc2",
      "texture-compression-astc",
      "texture-compression-astc-sliced-3d",
      "timestamp-query",
      "indirect-first-instance",
      "shader-f16",
      "rg11b10ufloat-renderable",
      "bgra8unorm-storage",
      "float32-filterable",
      "float32-blendable",
      "clip-distances",
      "dual-source-blending",
    ]);
    this.limits = CPUSupportedLimits;
    this.queue = new CPUQueue();
    this.lost = new Promise((resolve) => {
      this._lostResolve = resolve;
    });
    this.onuncapturederror = null;
    this.label = "";

    this._errorScopes = [];
  }
  destroy(): undefined {
    this._lostResolve?.({
      __brand: "GPUDeviceLostInfo",
      reason: "destroyed",
      message: "GPUDevice was destroyed",
    });
  }
  createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer {
    return new CPUBuffer(descriptor);
  }
  createTexture(descriptor: GPUTextureDescriptor): GPUTexture {
    throw new Error("Method not implemented: createTexture");
  }
  createSampler(descriptor?: GPUSamplerDescriptor): GPUSampler {
    throw new Error("Method not implemented: createSampler");
  }
  importExternalTexture(
    descriptor: GPUExternalTextureDescriptor,
  ): GPUExternalTexture {
    throw new Error("Method not implemented: importExternalTexture");
  }
  createBindGroupLayout(
    descriptor: CPUBindGroupLayoutDescriptor,
  ): CPUBindGroupLayout {
    return new CPUBindGroupLayout(descriptor);
  }
  createPipelineLayout(
    descriptor: CPUPipelineLayoutDescriptor,
  ): GPUPipelineLayout {
    return new CPUPipelineLayout(descriptor);
  }
  createBindGroup(descriptor: GPUBindGroupDescriptor): GPUBindGroup {
    return new CPUBindGroup(descriptor);
  }
  createShaderModule(descriptor: GPUShaderModuleDescriptor): CPUShaderModule {
    return new CPUShaderModule(descriptor, this);
  }
  createComputePipeline(
    descriptor: CPUComputePipelineDescriptor,
  ): GPUComputePipeline {
    return new CPUComputePipeline(descriptor);
  }
  createRenderPipeline(
    descriptor: GPURenderPipelineDescriptor,
  ): GPURenderPipeline {
    return new CPURenderPipeline(descriptor);
  }
  async createComputePipelineAsync(
    descriptor: CPUComputePipelineDescriptor,
  ): Promise<GPUComputePipeline> {
    return this.createComputePipeline(descriptor);
  }
  async createRenderPipelineAsync(
    descriptor: GPURenderPipelineDescriptor,
  ): Promise<GPURenderPipeline> {
    return this.createRenderPipeline(descriptor);
  }
  createCommandEncoder(
    descriptor?: GPUCommandEncoderDescriptor,
  ): GPUCommandEncoder {
    return new CPUCommandEncoder(descriptor);
  }
  createRenderBundleEncoder(
    descriptor: GPURenderBundleEncoderDescriptor,
  ): GPURenderBundleEncoder {
    throw new Error("Method not implemented: createRenderBundleEncoder");
  }
  createQuerySet(descriptor: GPUQuerySetDescriptor): GPUQuerySet {
    throw new Error("Method not implemented: createQuerySet");
  }
  pushErrorScope(filter: GPUErrorFilter): undefined {
    this._errorScopes.push({ filter, errors: [] });
  }
  async popErrorScope(): Promise<GPUError | null> {
    const scope = this._errorScopes.pop();
    if (!scope) {
      throw new DOMException("Error scope stack is empty", "OperationError");
    }
    return scope.errors.at(0) ?? null;
  }
  addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean,
  ): void {
    throw new Error("Method not implemented: addEventListener");
  }
  dispatchEvent(event: Event): boolean {
    throw new Error("Method not implemented: dispatchEvent");
  }
  removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: EventListenerOptions | boolean,
  ): void {
    throw new Error("Method not implemented: removeEventListener");
  }
}

const CPUAdapterInfo: GPUAdapterInfo = {
  __brand: "GPUAdapterInfo",
  vendor: "WESL",
  architecture: "",
  device: "CPU",
  description: "the WESL CPU executor",
};

class CPUAdapter implements GPUAdapter {
  __brand: "GPUAdapter";
  features: GPUSupportedFeatures;
  limits: GPUSupportedLimits;
  info: GPUAdapterInfo;
  isFallbackAdapter: boolean;

  constructor() {
    this.__brand = "GPUAdapter";
    this.features = new Set([
      "depth-clip-control",
      "depth32float-stencil8",
      "texture-compression-bc",
      "texture-compression-bc-sliced-3d",
      "texture-compression-etc2",
      "texture-compression-astc",
      "texture-compression-astc-sliced-3d",
      "timestamp-query",
      "indirect-first-instance",
      "shader-f16",
      "rg11b10ufloat-renderable",
      "bgra8unorm-storage",
      "float32-filterable",
      "float32-blendable",
      "clip-distances",
      "dual-source-blending",
    ]);
    this.limits = CPUSupportedLimits;
    this.info = CPUAdapterInfo;
    this.isFallbackAdapter = false;
  }

  async requestDevice(descriptor?: GPUDeviceDescriptor): Promise<GPUDevice> {
    return new CPUDevice();
  }
}

class CPU implements GPU {
  __brand: "GPU";
  wgslLanguageFeatures: WGSLLanguageFeatures;

  constructor() {
    this.__brand = "GPU";
    this.wgslLanguageFeatures = new Set([
      "shader-f16",
      "clip-distances",
      "dual-source-blending",
    ]);
  }
  async requestAdapter(
    options?: GPURequestAdapterOptions,
  ): Promise<GPUAdapter | null> {
    return new CPUAdapter();
  }
  getPreferredCanvasFormat(): GPUTextureFormat {
    throw new Error("Method not implemented: getPreferredCanvasFormat");
  }
}

const mod: GPUProviderModule = {
  create: function (flags: string[]): GPU {
    return new CPU();
  },
};

globalThis.GPUBufferUsage = {
  MAP_READ: 1,
  MAP_WRITE: 2,
  COPY_SRC: 4,
  COPY_DST: 8,
  INDEX: 16,
  VERTEX: 32,
  UNIFORM: 64,
  STORAGE: 128,
  INDIRECT: 256,
  QUERY_RESOLVE: 512,
};

globalThis.GPUColorWrite = {
  RED: 1,
  GREEN: 2,
  BLUE: 4,
  ALPHA: 8,
  ALL: 15,
};

globalThis.GPUMapMode = {
  READ: 1,
  WRITE: 2,
};

globalThis.GPUShaderStage = {
  VERTEX: 1,
  FRAGMENT: 2,
  COMPUTE: 4,
};

globalThis.GPUTextureUsage = {
  COPY_SRC: 1,
  COPY_DST: 2,
  TEXTURE_BINDING: 4,
  STORAGE_BINDING: 8,
  RENDER_ATTACHMENT: 16,
};

globalThis.GPUPipelineError = CPUPipelineError;

// @ts-ignore
globalThis.GPUDevice = CPUDevice;
globalThis.GPUValidationError = CPUValidationError;
globalThis.GPUInternalError = CPUInternalError;
export const create = mod.create;
