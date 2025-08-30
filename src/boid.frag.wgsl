fn hsv2rgb(h: f32, s: f32, v: f32) -> vec3f {
    let c = v * s;
    let h_ = h * 6.0;
    let x = c * (1.0 - abs(h_ % 2.0 - 1.0));
    var rgb = vec3f(0.0, 0.0, 0.0);

    if (h_ < 1.0) {
        rgb = vec3f(c, x, 0.0);
    } else if (h_ < 2.0) {
        rgb = vec3f(x, c, 0.0);
    } else if (h_ < 3.0) {
        rgb = vec3f(0.0, c, x);
    } else if (h_ < 4.0) {
        rgb = vec3f(0.0, x, c);
    } else if (h_ < 5.0) {
        rgb = vec3f(x, 0.0, c);
    } else {
        rgb = vec3f(c, 0.0, x);
    }

    let m = v - c;
    return rgb + vec3f(m, m, m);
}

@fragment
fn fragmentMain(
    @location(0) angle: f32,
    @location(1) speed: f32
) -> @location(0) vec4f {
    // Map angle [-PI, PI] to [0, 1] for hue
    let hue = (angle + 3.1415926) / (2.0 * 3.1415926);
    let color = hsv2rgb(hue, speed/2.0, 1.0);
    return vec4f(color, 1.0);
}