import boidVertWGSL from './boid.vert.wgsl?raw';
import boidFragWGSL from './boid.frag.wgsl?raw';
import boidComputeWGSL from './boid.compute.wgsl?raw';

// Number of boids
const NUM_BOIDS = 30000;

const canvas = document.getElementById("canvas") as HTMLCanvasElement;

// WebGPU device initialization
if (!navigator.gpu) {
    throw new Error("WebGPU not supported on this browser.");
    console.log('1');
}

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) {
    throw new Error("No appropriate GPUAdapter found.");
}

const device = await adapter.requestDevice();

// Canvas configuration
const context = canvas.getContext("webgpu");
if (!context) {
    throw new Error("WebGPU context not available.");
}
const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
    device: device,
    format: canvasFormat,
});

// Create a buffer with the vertices for a single boid.
const vertices = new Float32Array([
//  X,     Y
    0,     1,
    0,     -1,
    3,     0,
]);
const vertexBuffer = device.createBuffer({
    label: "Boid vertices",
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(vertexBuffer, 0, vertices);

const vertexBufferLayout: GPUVertexBufferLayout = {
    arrayStride: 8,
    attributes: [{
        format: 'float32x2' as GPUVertexFormat,
        offset: 0,
        shaderLocation: 0, // Position. Matches @location(0) in the @vertex shader.
    }],
};

const canvasSize = new Float32Array([canvas.width, canvas.height]);
const canvasSizeBuffer = device.createBuffer({
    label: "Canvas size uniform",
    size: canvasSize.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

// Resize the canvas to fill the window and update the context.
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  // Update uniform buffer with new size
  const newSize = new Float32Array([canvas.width, canvas.height]);
  device.queue.writeBuffer(canvasSizeBuffer, 0, newSize);
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas(); // set initial size

function getBoidParams() {
    return {
        separationWeight: parseFloat((document.getElementById('sepWeight') as HTMLInputElement).value),
        separationRange: parseFloat((document.getElementById('sepRange') as HTMLInputElement).value),
        cohesionWeight: parseFloat((document.getElementById('cohWeight') as HTMLInputElement).value),
        cohesionRange: parseFloat((document.getElementById('cohRange') as HTMLInputElement).value),
        alignmentWeight: parseFloat((document.getElementById('aliWeight') as HTMLInputElement).value),
        alignmentRange: parseFloat((document.getElementById('aliRange') as HTMLInputElement).value),
        shapeWeight: parseFloat((document.getElementById('shapeWeight') as HTMLInputElement).value),
        shapeRange: parseFloat((document.getElementById('shapeRange') as HTMLInputElement).value),
    };
}

function getBoidParamsArray() {
    const p = getBoidParams();
    // 8 floats for 16-byte alignment (WGSL std140)
    return new Float32Array([
        p.separationWeight,
        p.separationRange,
        p.cohesionWeight,
        p.cohesionRange,
        p.alignmentWeight,
        p.alignmentRange,
        p.shapeWeight,
        p.shapeRange,
    ]);
}

const paramsBuffer = device.createBuffer({
    size: 8 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(paramsBuffer, 0, getBoidParamsArray());

// Optional: update displayed values live
['sepWeight','sepRange','cohWeight','cohRange','aliWeight','aliRange', 'shapeWeight', 'shapeRange'].forEach(id => {
    const input = document.getElementById(id) as HTMLInputElement;
    const span = document.getElementById(id+'Val') as HTMLElement;
    input.addEventListener('input', () => { span.textContent = input.value; });
});

// Replace placeholders in WGSL with actual values
const boidVertWGSLWithSize = boidVertWGSL
    .replace(/canvasWidth/g, canvas.width.toString())
    .replace(/canvasHeight/g, canvas.height.toString());

// Create the shader that will render the boids.
const boidShaderModuleVert = device.createShaderModule({
    label: "Boid vertex shader",
    code: boidVertWGSLWithSize
});
const boidShaderModuleFrag = device.createShaderModule({
    label: "Boid fragment shader",
    code: boidFragWGSL
});

const boidComputeModule = device.createShaderModule({
    label: "Boid compute shader",
    code: boidComputeWGSL
});

// Each boid: [pos.x, pos.y, vel.x, vel.y]
const boidData = new Float32Array(NUM_BOIDS * 4);
for (let i = 0; i < NUM_BOIDS; ++i) {
    const px = Math.random() * canvas.width;
    const py = Math.random() * canvas.height;
    const vx = (Math.random() - 0.5) * 2;
    const vy = (Math.random() - 0.5) * 2;
    boidData.set([px, py, vx, vy], i * 4);
}

const boidStorageBuffer = device.createBuffer({
    label: "Boid storage buffer",
    size: boidData.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
});
new Float32Array(boidStorageBuffer.getMappedRange()).set(boidData);
boidStorageBuffer.unmap();

const computeBindGroupLayout = device.createBindGroupLayout({
    entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
    ]
});

const computePipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [computeBindGroupLayout]
});

const boidComputePipeline = device.createComputePipeline({
    layout: computePipelineLayout,
    compute: {
        module: boidComputeModule,
        entryPoint: "main"
    }
});

// Bind group for compute pipeline (read_write storage)
const boidComputeBindGroup = device.createBindGroup({
    label: "Boid Compute Bind Group",
    layout: computeBindGroupLayout,
    entries: [
        { binding: 0, resource: { buffer: boidStorageBuffer } },
        { binding: 1, resource: { buffer: canvasSizeBuffer } },
        { binding: 2, resource: { buffer: paramsBuffer } },
    ]
});

// Create a pipeline that renders the boid.
const boidPipeline = device.createRenderPipeline({
    label: "Boid pipeline",
    layout: "auto",
    vertex: {
        module: boidShaderModuleVert,
        entryPoint: "vertexMain",
        buffers: [vertexBufferLayout]
    },
    fragment: {
        module: boidShaderModuleFrag,
        entryPoint: "fragmentMain",
        targets: [{
            format: canvasFormat,
            blend: {
                color: {
                    srcFactor: "src-alpha",
                    dstFactor: "one-minus-src-alpha",
                    operation: "add"
                },
                alpha: {
                    srcFactor: "one",
                    dstFactor: "one-minus-src-alpha",
                    operation: "add"
                }
            }
        }]
    }
});


// Bind group for render pipeline (read-only storage)
const boidBindGroup = device.createBindGroup({
    label: "Boid Render Bind Group",
    layout: boidPipeline.getBindGroupLayout(0),
    entries: [
        { binding: 0, resource: { buffer: boidStorageBuffer } },
        { binding: 1, resource: { buffer: canvasSizeBuffer } },
    ]
});

function frame() {
    if (!context) {
        throw new Error("WebGPU context not available.");
    }

    // --- UPDATE PARAMS BUFFER EVERY FRAME ---
    device.queue.writeBuffer(paramsBuffer, 0, getBoidParamsArray());

    // 1. Update boids with compute shader
    const computeEncoder = device.createCommandEncoder();
    const computePass = computeEncoder.beginComputePass();
    computePass.setPipeline(boidComputePipeline);
    computePass.setBindGroup(0, boidComputeBindGroup);
    computePass.dispatchWorkgroups(Math.ceil(NUM_BOIDS / 64));
    computePass.end();
    device.queue.submit([computeEncoder.finish()]);

    // 2. Render boids
    const renderEncoder = device.createCommandEncoder();
    const pass = renderEncoder.beginRenderPass({
        colorAttachments: [{
            view: context.getCurrentTexture().createView(),
            loadOp: "clear",
            clearValue: { r: 0.05, g: 0.05, b: 0.05, a: 1.0 },
            storeOp: "store",
        }]
    });
    pass.setPipeline(boidPipeline);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.setBindGroup(0, boidBindGroup);
    pass.draw(vertices.length / 2, NUM_BOIDS);
    pass.end();
    device.queue.submit([renderEncoder.finish()]);

    requestAnimationFrame(frame);
}

frame();