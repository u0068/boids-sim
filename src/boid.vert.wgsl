struct Boid {
    pos: vec2f,
    vel: vec2f
};

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) angle: f32,
    @location(1) speed: f32,
};

@group(0) @binding(0) var<storage, read> boids: array<Boid>;
@group(0) @binding(1) var<uniform> canvasSize: vec2f;

@vertex
fn vertexMain(
    @location(0) position: vec2f,
    @builtin(instance_index) instance: u32
) -> VertexOutput {
    let boid = boids[instance];

    // Use stored angle for smooth turning
    let angle = atan2(boid.vel.y, boid.vel.x);

    // Rotate the local vertex position
    let c = cos(angle);
    let s = sin(angle);
    let rotated = vec2f(
        position.x * c - position.y * s,
        position.x * s + position.y * c
    );

    // World position
    let scale = 1.5;
    let world = boid.pos + rotated * scale;

    // Convert to NDC, flipping Y
    let ndc = vec2f(
        (world.x / canvasSize.x) * 2.0 - 1.0,
        1.0 - (world.y / canvasSize.y) * 2.0
    );

    let speed = length(boid.vel);

    var out: VertexOutput;
    out.position = vec4f(ndc, 0, 1);
    out.angle = angle;
    out.speed = speed;
    return out;
}