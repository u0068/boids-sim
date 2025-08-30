struct Boid {
    pos: vec2f,
    vel: vec2f,
};

struct BoidParams {
    separationWeight: f32,
    separationRange: f32,
    cohesionWeight: f32,
    cohesionRange: f32,
    alignmentWeight: f32,
    alignmentRange: f32,
    shapeWeight: f32,
    shapeRange: f32,
};

fn cross(a: vec2f, b: vec2f) -> f32 {
    return a.x * b.y - a.y * b.x;
}

@group(0) @binding(0) var<storage, read_write> boids: array<Boid>;
@group(0) @binding(1) var<uniform> canvasSize: vec2f;
@group(0) @binding(2) var<uniform> params: BoidParams;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let idx = id.x;
    if (idx >= arrayLength(&boids)) { return; }

    var boid = boids[idx];

    // Loop through all the boids, simple O(N^2) approach
    // For each boid, calculate acceleration based on alignment, cohesion, separation
    var perceivedCenterOffset = vec2f(0, 0); // relative to boid
    var perceivedVelocity = vec2f(0, 0);
    var cohesionNeighborCount = 0.0;
    var alignmentNeighborCount = 0.0;
    for (var i: u32 = 0u; i < arrayLength(&boids); i = i + 1u) {
        if (i == idx) { continue; }
        let other = boids[i];
        var offset = other.pos - boid.pos;
        // Wrap around edges
        offset = vec2f(
            (offset.x + canvasSize.x * 1.5) % canvasSize.x - canvasSize.x * 0.5,
            (offset.y + canvasSize.y * 1.5) % canvasSize.y - canvasSize.y * 0.5
        );
        let dist = length(offset);

        // Separation
        if (dist < params.separationRange && dist > 0.0) {
            boid.vel = boid.vel - (offset / (dist*dist)) * params.separationWeight;
        }

        // Cohesion
        if (dist < params.cohesionRange) {
            cohesionNeighborCount = cohesionNeighborCount + 1.0;
            perceivedCenterOffset = perceivedCenterOffset + offset;
        }

        // Alignment
        if (dist < params.alignmentRange) {
            alignmentNeighborCount = alignmentNeighborCount + 1.0;
            perceivedVelocity = perceivedVelocity + other.vel;
        }

        if (dist < params.shapeRange && dist > 0.0) {
            let dot_product = dot(normalize(boid.vel), normalize(offset)) * dot(other.vel, boid.vel);
            boid.vel = boid.vel + offset * dot_product * params.shapeWeight * abs(params.shapeWeight) / (dist*dist);
        }
    }
    if (cohesionNeighborCount > 0.0) {
        perceivedCenterOffset = perceivedCenterOffset / cohesionNeighborCount;
        // Cohesion: steer towards perceived center
        boid.vel = boid.vel + perceivedCenterOffset * params.cohesionWeight;
    }
    if (alignmentNeighborCount > 0.0) {
        // Alignment: match velocity
        perceivedVelocity = perceivedVelocity / alignmentNeighborCount;
        boid.vel = boid.vel + (perceivedVelocity - boid.vel) * params.alignmentWeight;
    }


    // A small random jitter
    // let angle = (fract(sin(f32(idx) * 12.9898) * 43758.5453) - 0.5) * 0.05;
    // let c = cos(angle);
    // let s = sin(angle);
    // boid.vel = vec2f(
    //     boid.vel.x * c - boid.vel.y * s,
    //     boid.vel.x * s + boid.vel.y * c
    // );

    //boid.vel = boid.vel * 0.99; // some damping

    if (length(boid.vel) > 3.0) {
        boid.vel = normalize(boid.vel) * 3.0; // max speed
    }
    if (length(boid.vel) < 1.0) {
        boid.vel = normalize(boid.vel) * 1.0; // min speed
    }

    // Update position
    boid.pos = boid.pos + boid.vel;

    // Wrap around screen
    boid.pos = vec2f(
        (boid.pos.x + canvasSize.x) % canvasSize.x,
        (boid.pos.y + canvasSize.y) % canvasSize.y
    );

    boids[idx] = boid;
}