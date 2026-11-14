const VERTEX_SHADER = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;
in vec2 aTexCoord;

uniform mat4 uModelView;
uniform mat4 uProjection;
uniform mat4 uShadowMatrix;
uniform vec2 uTexRepeat;

out vec3 vPosition;
out vec3 vNormal;
out vec2 vTexCoord;
out vec3 vShadowCoord;

void main() {
  vec4 p = uModelView * vec4(aPosition, 1.0);
  vPosition = p.xyz;
  vNormal = transpose(inverse(mat3(uModelView))) * aNormal;
  vTexCoord = aTexCoord * uTexRepeat;
  vShadowCoord = (uShadowMatrix * vec4(aPosition, 1.0)).xyz;
  gl_Position = uProjection * p;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

const int NO_MAPPING = 0, EMISSION_MAPPING = 1;
const float Ka = 1.6;
const float Kd = 0.6;
const float FOG_START = 22.0, FOG_DENSITY = 0.02;

in vec3 vPosition;
in vec3 vNormal;
in vec2 vTexCoord;
in vec3 vShadowCoord;

uniform vec3 uLightDir[2];
uniform vec3 uLightColor[2];
uniform vec3 uUp;
uniform vec3 uFogColor;
uniform vec3 uSkyColor;

uniform vec3 uColor;
uniform vec3 uEmissive;
uniform vec3 uTopEmissive;
uniform float uKs;
uniform float uShininess;
uniform float uReflectivity;

uniform sampler2D uTexture;
uniform highp sampler2DShadow uShadowMap;
uniform int uMapping;

out vec4 fragColor;

vec3 calculateLight(int i, vec3 N, vec3 V, vec3 color) {
  vec3 L = normalize(uLightDir[i]);
  vec3 H = normalize(L + V);
  float diff = max(dot(N, L), 0.0);
  float spec = diff > 0.0 ? pow(max(dot(N, H), 0.0), uShininess) : 0.0;
  return uLightColor[i] * (Kd * diff * color + uKs * spec);
}

vec3 environment(vec3 R) {
  float h = dot(R, uUp);
  vec3 horizon = 4.0 * uFogColor;
  return h > 0.0 ? mix(horizon, uSkyColor, smoothstep(0.0, 0.5, h))
                 : mix(horizon, vec3(0.01), smoothstep(0.0, 0.2, -h));
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(-vPosition);
  float depthTest = texture(uShadowMap, vShadowCoord);
  bool inShadowMap = all(greaterThan(vShadowCoord, vec3(0.0))) && all(lessThan(vShadowCoord, vec3(1.0)));
  float shadow = inShadowMap ? smoothstep(0.3, 0.7, depthTest) : 1.0;

  vec3 result = Ka * uFogColor * uColor;
  result += shadow * calculateLight(0, N, V, uColor);
  result += calculateLight(1, N, V, uColor);

  float F = uReflectivity + (1.0 - uReflectivity) * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  result += (uReflectivity > 0.0 ? F : 0.0) * environment(reflect(-V, N));

  vec3 emission = uMapping == EMISSION_MAPPING ? uEmissive * texture(uTexture, vTexCoord).rgb : uEmissive;
  result += emission + uTopEmissive * smoothstep(0.7, 0.9, dot(N, uUp));

  float d = FOG_DENSITY * max(length(vPosition) - FOG_START, 0.0);
  fragColor = vec4(mix(uFogColor, result, exp(-d * d)), 1.0);
}
`;

const SHADOW_VERTEX_SHADER = `#version 300 es
in vec3 aPosition;
uniform mat4 uLightMVP;

void main() {
  gl_Position = uLightMVP * vec4(aPosition, 1.0);
}
`;

const SHADOW_FRAGMENT_SHADER = `#version 300 es
precision mediump float;
void main() {}
`;

const TRAIL_VERTEX_SHADER = `#version 300 es
in vec3 aPosition;
in vec2 aTexCoord;

uniform mat4 uModelView;
uniform mat4 uProjection;

out vec2 vTexCoord;

void main() {
  vTexCoord = aTexCoord;
  gl_Position = uProjection * uModelView * vec4(aPosition, 1.0);
}
`;

const TRAIL_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vTexCoord;

uniform vec3 uColor;

out vec4 fragColor;

void main() {
  float fade = 1.0 - vTexCoord.x;
  float core = 1.0 - vTexCoord.y * vTexCoord.y;
  fragColor = vec4(uColor * core * fade * fade, 1.0);
}
`;

const POST_VERTEX_SHADER = `#version 300 es
const vec2 corners[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
out vec2 vUv;

void main() {
  vec2 p = corners[gl_VertexID];
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

const BLUR_FRAGMENT_SHADER = `#version 300 es
precision highp float;

// Precomputed weights for a 9-sample Gaussian blur

const float WEIGHTS[5] = float[5](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216); 
in vec2 vUv;

uniform sampler2D uImage;
uniform vec2 uStep;
uniform float uThreshold;

out vec4 fragColor;

vec3 bright(vec2 uv) {
  return max(texture(uImage, uv).rgb - uThreshold, 0.0);
}

void main() {
  vec3 sum = WEIGHTS[0] * bright(vUv);
  for (int i = 1; i < 5; i++)
    sum += WEIGHTS[i] * (bright(vUv + float(i) * uStep) + bright(vUv - float(i) * uStep));
  fragColor = vec4(sum, 1.0);
}
`;

const COMPOSITE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

const float BLOOM_STRENGTH = 0.35;
const float EXPOSURE = 1.4;

in vec2 vUv;

uniform sampler2D uScene;
uniform sampler2D uBloom0;
uniform sampler2D uBloom1;
uniform sampler2D uBloom2;
uniform sampler2D uBloom3;

out vec4 fragColor;

void main() {
  vec3 bloom = texture(uBloom0, vUv).rgb + texture(uBloom1, vUv).rgb
             + texture(uBloom2, vUv).rgb + texture(uBloom3, vUv).rgb;
  vec3 hdr = EXPOSURE * (texture(uScene, vUv).rgb + BLOOM_STRENGTH * bloom);
  vec2 c = vUv - 0.5;
  fragColor = vec4(hdr / (1.0 + hdr) * (1.0 - 0.6 * dot(c, c)), 1.0);
}
`;

const NO_MAPPING = 0, EMISSION_MAPPING = 1;

const LIGHTS = [
  { pos: [-22, 8, 22], color: [0.55, 0.65, 0.85] },
  { pos: [10, -8, 14], color: [0.12, 0.16, 0.28] },
];

const PALETTES = [
  { fog: [0.03, 0.12, 0.32], sky: [0.0, 0.02, 0.08], rail: [0.8, 2.6, 5.0], flipper: [2.2, 4.4, 5.0], bumper: [0.6, 1.8, 5.0],
    insert: [0.5, 1.6, 3.6], grid: [0.1, 0.4, 0.9], trail: [2.0, 4.5, 7.0], block: [0.05, 0.2, 0.48] },
  { fog: [0.13, 0.02, 0.12], sky: [0.03, 0.0, 0.03], rail: [1.0, 3.6, 4.2], flipper: [1.6, 4.4, 4.8], bumper: [5.0, 0.8, 3.2],
    insert: [3.0, 0.4, 1.8], grid: [0.9, 0.12, 0.6], trail: [7.0, 2.6, 5.4], block: [0.48, 0.07, 0.38] },
  { fog: [0.16, 0.06, 0.01], sky: [0.04, 0.01, 0.0], rail: [5.0, 2.0, 0.4], flipper: [5.0, 4.0, 1.0], bumper: [5.0, 1.4, 0.3],
    insert: [3.0, 1.2, 0.2], grid: [0.9, 0.35, 0.06], trail: [7.0, 4.6, 1.6], block: [0.48, 0.19, 0.04] },
];

const SHADOW_MAP_SIZE = 2048;
const BLOOM_LEVELS = 4, BLOOM_THRESHOLD = 1.0;
const TRAIL_LENGTH = 40, TRAIL_WIDTH = 0.4, TRAIL_HEIGHT = 0.25;

const CABINET = {
  rim: 1.2,
  front: -2.5,
  wallTop: 1.2,
  floor: -0.6,
  base: -1.4,
};
const WALL_HEIGHT = 1.0, WALL_THICK = 0.32;
const FLIPPER_HEIGHT = 0.65;

const GROUND = { x0: -100, y0: -90, x1: 120, y1: 150, cell: 4 };
const BLOCKS = [
  [-15, -4, -7, 6, 2.5], [-11, 9, -4, 17, 5], [-18, 14, -12, 26, 8], [-9, 22, -4, 30, 3.5], [-16, 31, -6, 40, 6],
  [24, -2, 31, 7, 4], [25, 10, 33, 20, 7], [30, 22, 38, 30, 3], [25, 28, 31, 38, 5],
  [-8, 50, -2, 58, 4], [21, 57, 28, 64, 7], [21, 43, 30, 54, 3], [-20, 46, -10, 58, 9], [34, 40, 44, 50, 10],
  [-14, 64, -6, 74, 6], [24, 68, 33, 78, 4], [-20, 78, -10, 90, 9], [22, 84, 32, 92, 6],
  [2, 88, 10, 96, 5], [12, 86, 20, 94, 8], [-10, 96, 0, 104, 4], [24, 98, 34, 108, 7],
];

const CAMERA = {
  wide: { eye: [0, -37, 29], target: [0, -4, 0] },
  tall: { eye: [0, -24, 42], target: [0, -2.5, 0] },
};

const canvas = document.getElementById("glcanvas");
const gl = canvas.getContext("webgl2", { powerPreference: "high-performance" });
if (!gl.getExtension("EXT_color_buffer_float")) throw new Error("EXT_color_buffer_float is not supported");

function compile(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

const ATTRIBUTES = { aPosition: 0, aNormal: 1, aTexCoord: 2 };

function createProgram(vsSource, fsSource) {
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSource));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSource));
  for (const name in ATTRIBUTES) gl.bindAttribLocation(prog, ATTRIBUTES[name], name);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  return prog;
}

function getUniforms(prog, names) {
  const uniforms = {};
  for (const name of names) uniforms[name] = gl.getUniformLocation(prog, name);
  return uniforms;
}

const program = createProgram(VERTEX_SHADER, FRAGMENT_SHADER);
const uniforms = getUniforms(program, ["uModelView", "uProjection", "uShadowMatrix", "uTexRepeat", "uLightDir",
  "uLightColor", "uUp", "uFogColor", "uSkyColor", "uColor", "uEmissive", "uTopEmissive", "uKs", "uShininess",
  "uReflectivity", "uMapping", "uTexture", "uShadowMap"]);
gl.useProgram(program);
gl.uniform1i(uniforms.uTexture, 0);
gl.uniform1i(uniforms.uShadowMap, 1);

const shadowProgram = createProgram(SHADOW_VERTEX_SHADER, SHADOW_FRAGMENT_SHADER);
const uLightMVP = gl.getUniformLocation(shadowProgram, "uLightMVP");

const trailProgram = createProgram(TRAIL_VERTEX_SHADER, TRAIL_FRAGMENT_SHADER);
const trailUniforms = getUniforms(trailProgram, ["uModelView", "uProjection", "uColor"]);

const blurProgram = createProgram(POST_VERTEX_SHADER, BLUR_FRAGMENT_SHADER);
const blurUniforms = getUniforms(blurProgram, ["uImage", "uStep", "uThreshold"]);
gl.useProgram(blurProgram);
gl.uniform1i(blurUniforms.uImage, 0);

const compositeProgram = createProgram(POST_VERTEX_SHADER, COMPOSITE_FRAGMENT_SHADER);
const compositeUniforms = getUniforms(compositeProgram, ["uScene", "uBloom0", "uBloom1", "uBloom2", "uBloom3"]);
gl.useProgram(compositeProgram);
["uScene", "uBloom0", "uBloom1", "uBloom2", "uBloom3"].forEach((name, i) => gl.uniform1i(compositeUniforms[name], i));

const shadowMap = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, shadowMap);
gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
const shadowFramebuffer = gl.createFramebuffer();
gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFramebuffer);
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shadowMap, 0);

function createTarget() {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  return { texture, framebuffer, width: 1, height: 1 };
}

function createRenderbuffer() {
  const renderbuffer = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);
  return renderbuffer;
}

const sceneTarget = createTarget();
const bloomLevels = [];
for (let i = 0; i < BLOOM_LEVELS; i++) bloomLevels.push({ temp: createTarget(), blur: createTarget() });

const colorRenderbuffer = createRenderbuffer();
const depthRenderbuffer = createRenderbuffer();
const samples = Math.min(4, gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA16F, gl.SAMPLES)[0]);
const msaaFramebuffer = gl.createFramebuffer();
gl.bindFramebuffer(gl.FRAMEBUFFER, msaaFramebuffer);
gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, colorRenderbuffer);
gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRenderbuffer);
gl.bindFramebuffer(gl.FRAMEBUFFER, null);

function sizeTarget(target, w, h) {
  target.width = w;
  target.height = h;
  gl.bindTexture(gl.TEXTURE_2D, target.texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
}

function resizeTargets(w, h) {
  gl.bindRenderbuffer(gl.RENDERBUFFER, colorRenderbuffer);
  gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA16F, w, h);
  gl.bindRenderbuffer(gl.RENDERBUFFER, depthRenderbuffer);
  gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h);
  sizeTarget(sceneTarget, w, h);
  bloomLevels.forEach((level, i) => {
    const lw = Math.max(1, w >> (i + 1)), lh = Math.max(1, h >> (i + 1));
    sizeTarget(level.temp, lw, lh);
    sizeTarget(level.blur, lw, lh);
  });
}

function resolveScene() {
  const w = canvas.width, h = canvas.height;
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msaaFramebuffer);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, sceneTarget.framebuffer);
  gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
}

function bindAttribute(name, data, size) {
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.vertexAttribPointer(ATTRIBUTES[name], size, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(ATTRIBUTES[name]);
}

function createMesh({ positions, normals, texCoords, indices }) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  bindAttribute("aPosition", positions, 3);
  bindAttribute("aNormal", normals, 3);
  bindAttribute("aTexCoord", texCoords, 2);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  return { vao, count: indices.length };
}

const cubeMesh = createMesh(createCube());
const cylinderMesh = createMesh(createCylinder(32));
const sphereMesh = createMesh(createSphere(32));
const flipperMesh = createMesh(createFlipper(table.flippers[0].length, table.flippers[0].radius, 16));

function createTrailBuffer(name, size) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, TRAIL_LENGTH * 2 * size * 4, gl.DYNAMIC_DRAW);
  gl.vertexAttribPointer(ATTRIBUTES[name], size, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(ATTRIBUTES[name]);
  return buffer;
}

const trailVao = gl.createVertexArray();
gl.bindVertexArray(trailVao);
const trailPositionBuffer = createTrailBuffer("aPosition", 3);
const trailTexCoordBuffer = createTrailBuffer("aTexCoord", 2);
gl.bindVertexArray(null);
const trailPositions = new Float32Array(TRAIL_LENGTH * 6);
const trailTexCoords = new Float32Array(TRAIL_LENGTH * 4);
const trail = [];

function loadTexture(url) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255]));

  const image = new Image();
  image.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);  // images start at the top row, texture coordinates at the bottom
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  };
  image.src = url;
  return texture;
}

const fieldTextures = ["textures/neon/playfield.png", "textures/neon/field2.png", "textures/neon/field3.png"].map(loadTexture);
const gridTexture = loadTexture("textures/neon/grid.png");

const palette = structuredClone(PALETTES[0]);

const MATERIALS = {
  playfield: { color: [0.04, 0.05, 0.08], ks: 0.5, shininess: 40, emissive: palette.insert },
  ground: { color: [0.02, 0.025, 0.04], ks: 0.2, shininess: 16, emissive: palette.grid, texture: gridTexture,
            repeat: [(GROUND.x1 - GROUND.x0) / GROUND.cell, (GROUND.y1 - GROUND.y0) / GROUND.cell] },
  block: { color: [0.06, 0.075, 0.1], ks: 0.2, shininess: 16, top: palette.block },
  cabinet: { color: [0.03, 0.035, 0.05], ks: 0.4, shininess: 40 },
  rail: { color: [0.05, 0.05, 0.06], ks: 0.4, shininess: 40, emissive: palette.rail },
  wall: { color: [0.05, 0.06, 0.09], ks: 0.6, shininess: 60, top: palette.rail },
  bumper: { color: [0.05, 0.06, 0.09], ks: 0.6, shininess: 60 },
  bumperRing: { color: [0, 0, 0], ks: 0, shininess: 1, emissive: palette.bumper },
  bumperCap: { color: [0.05, 0.06, 0.09], ks: 0.6, shininess: 60, top: palette.bumper },
  flipper: { color: [0.1, 0.1, 0.1], ks: 0.4, shininess: 40, emissive: palette.flipper },
  knob: { color: [0.05, 0.05, 0.06], ks: 0.6, shininess: 60, emissive: palette.flipper },
  rubber: { color: [0.03, 0.03, 0.04], ks: 0.2, shininess: 24 },
  ball: { color: [0.2, 0.22, 0.26], ks: 1.2, shininess: 160, reflect: 0.8 },
  steel: { color: [0.15, 0.16, 0.18], ks: 0.8, shininess: 80, reflect: 0.4 },
};

const fieldMaterials = fieldTextures.map(texture => ({ ...MATERIALS.playfield, texture }));

function updatePalette() {
  const target = PALETTES[(3 - game.balls) % PALETTES.length];
  for (const key in palette)
    palette[key].forEach((v, i) => { palette[key][i] = v + (target[key][i] - v) * 0.04; });
}

gl.enable(gl.DEPTH_TEST);

const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const add = (a, b) => a.map((v, i) => v + b[i]);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rect = f => [f.x0, f.y0, f.x1, f.y1];
const center = ([x0, y0, x1, y1]) => [(x0 + x1) / 2, (y0 + y1) / 2, 0];

function fitCorners([x0, y0, x1, y1]) {
  const corners = [];
  for (const x of [x0 - CABINET.rim, x1 + CABINET.rim])
    for (const y of [y0 + CABINET.front, y1 + CABINET.rim])
      for (const z of [CABINET.base, CABINET.wallTop]) corners.push([x, y, z]);
  return corners;
}

function fitProjection(view, W, H, insets, corners, zoom) {
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (const c of corners) {
    const [x, y, z] = transformPoint(view, c);
    xmin = Math.min(xmin, x / -z); xmax = Math.max(xmax, x / -z);
    ymin = Math.min(ymin, y / -z); ymax = Math.max(ymax, y / -z);
  }
  const margin = 1.04, usable = H - insets.top - insets.bottom;
  const fit = Math.max((xmax - xmin) * margin / W, (ymax - ymin) * margin / usable);
  const s = fit / zoom, slack = Math.max(0, fit - s);
  const cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2;
  const [bx, by, bz] = transformPoint(multiply(view, board), [game.ball.p[0], game.ball.p[1], BALL_RADIUS]);
  const fx = clamp(bx / -bz, cx - slack * W / 2, cx + slack * W / 2);
  const fy = clamp(by / -bz, cy - slack * usable / 2, cy + slack * usable / 2);
  const bottom = fy - s * (insets.bottom + usable / 2);
  return frustum(fx - s * W / 2, fx + s * W / 2, bottom, bottom + s * H, 1, 200);
}

let chaseEye = null, chaseTarget = null, cameraRect = null;

function chaseView() {
  const [x, y] = game.ball.p, vx = game.ball.v[0];
  const eye = [x + vx * 0.02, y - 3.2, 1.85], target = [x + vx * 0.08, y + 5, 0.4];
  chaseEye = chaseEye ? lerp(chaseEye, eye, 0.22) : eye;
  chaseTarget = chaseTarget ? lerp(chaseTarget, target, 0.22) : target;
  return lookAt(transformPoint(board, chaseEye), transformPoint(board, chaseTarget), [0, 0, 1]);
}

const TABLE_CENTER = center(rect(table.fields[0]));
const lightView = lookAt(LIGHTS[0].pos, TABLE_CENTER, [0, 0, 1]);

function lightProjection() {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const [x, y, z] of table.fields.flatMap(f => fitCorners(rect(f))))
    for (const dy of [0, -1.5]) {
      const p = transformPoint(lightView, transformPoint(board, [x, y + dy, z]));
      for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); }
    }
  return ortho(lo[0], hi[0], lo[1], hi[1], -hi[2] - 1, -lo[2] + 1);
}

let view, board, parent, lightViewProjection, shadowMatrix;
let shadowPass = false;
const BLACK = [0, 0, 0];

function draw(mesh, model, mat, boost = 1) {
  if (shadowPass) {
    gl.uniformMatrix4fv(uLightMVP, false, multiply(lightViewProjection, parent, model));
  } else {
    gl.uniformMatrix4fv(uniforms.uModelView, false, multiply(view, parent, model));
    gl.uniformMatrix4fv(uniforms.uShadowMatrix, false, multiply(shadowMatrix, parent, model));
    gl.uniform3fv(uniforms.uColor, mat.color);
    gl.uniform3fv(uniforms.uEmissive, (mat.emissive ?? BLACK).map(v => v * boost));
    gl.uniform3fv(uniforms.uTopEmissive, (mat.top ?? BLACK).map(v => v * boost));
    gl.uniform1f(uniforms.uKs, mat.ks);
    gl.uniform1f(uniforms.uShininess, mat.shininess);
    gl.uniform1f(uniforms.uReflectivity, mat.reflect ?? 0);
    gl.uniform2fv(uniforms.uTexRepeat, mat.repeat ?? [1, 1]);
    gl.uniform1i(uniforms.uMapping, mat.texture ? EMISSION_MAPPING : NO_MAPPING);
    gl.bindTexture(gl.TEXTURE_2D, mat.texture ?? null);
  }
  gl.bindVertexArray(mesh.vao);
  gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
}

const box = (x0, y0, z0, x1, y1, z1) =>
  multiply(translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), scale((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2));

const upright = rotateX(Math.PI / 2);
const post = (x, y, r, z0, h) => multiply(translate(x, y, z0 + h / 2), upright, scale(r, h / 2, r));

function split(a, b, holes) {
  const pieces = [];
  for (const [h0, h1] of holes) { pieces.push([a, h0]); a = h1; }
  return [...pieces, [a, b]];
}

function drawCabinet(field, i) {
  const { x0, y0, x1, y1 } = field;
  const { rim, front, wallTop, floor, base } = CABINET;
  const y = i === 0 ? y0 + front : y0;
  const holes = table.gates.filter(g => g.below === field)
    .map(g => [g.x - GATE_HALF - WALL_THICK / 2, g.x + GATE_HALF + WALL_THICK / 2]);
  draw(cubeMesh, box(x0, y, floor, x1, y1, 0), fieldMaterials[i]);
  draw(cubeMesh, box(x0 - rim, y, base, x1 + rim, y1 + rim, floor), MATERIALS.cabinet);
  for (const [h0, h1] of holes) draw(cubeMesh, box(h0, y1, floor, h1, y1 + rim, 0), MATERIALS.cabinet);

  const walls = [
    [x0 - rim, y, x0, y1 + rim],
    [x1, y, x1 + rim, y1 + rim],
    ...split(x0, x1, holes).map(([a, b]) => [a, y1, b, y1 + rim]),
  ];
  if (i === 0) walls.push([x0 - rim, y - 0.4, x1 + rim, y]);
  for (const [a0, b0, a1, b1] of walls) draw(cubeMesh, box(a0, b0, floor, a1, b1, wallTop), MATERIALS.cabinet);

  const e = 0.16, X0 = x0 - rim, X1 = x1 + rim, Y0 = i === 0 ? y - 0.4 : y, Y1 = y1 + rim;
  const rails = [
    [X0, Y0, X0 + e, Y1],
    [X1 - e, Y0, X1, Y1],
    ...split(X0, X1, holes).map(([a, b]) => [a, Y1 - e, b, Y1]),
  ];
  if (i === 0) rails.push([X0, Y0, X1, Y0 + e]);
  for (const [a0, b0, a1, b1] of rails) draw(cubeMesh, box(a0, b0, wallTop, a1, b1, wallTop + 0.05), MATERIALS.rail);
}

function drawWall({ a, b, hidden }) {
  if (hidden) return;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  draw(cubeMesh, multiply(translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, WALL_HEIGHT / 2),
    rotateZ(angle), scale(len / 2, WALL_THICK / 2, WALL_HEIGHT / 2)), MATERIALS.wall);
  draw(cylinderMesh, post(a[0], a[1], WALL_THICK / 2, 0, WALL_HEIGHT), MATERIALS.wall);
  draw(cylinderMesh, post(b[0], b[1], WALL_THICK / 2, 0, WALL_HEIGHT), MATERIALS.wall);
}

function drawBumper(bp) {
  const flash = 1 + bp.lit * 25;
  const [x, y] = bp.c;
  draw(cylinderMesh, post(x, y, bp.r * 0.90, 0, 0.95), MATERIALS.bumper);
  draw(cylinderMesh, post(x, y, bp.r * 1.02, 0.12, 0.28), MATERIALS.bumperRing, flash);
  draw(cylinderMesh, post(x, y, bp.r * 0.75, 0.95, 0.14), MATERIALS.bumperCap, flash);
}

function drawFlipper(f) {
  const worldAngle = f.side > 0 ? f.angle : Math.PI - f.angle;
  const frame = multiply(translate(f.pivot[0], f.pivot[1], 0), rotateZ(worldAngle));
  const h = FLIPPER_HEIGHT;
  draw(flipperMesh, multiply(frame, scale(1, 1, 0.25)), MATERIALS.rubber);
  draw(flipperMesh, multiply(frame, translate(0, 0, 0.25), scale(1, 1, h - 0.25)), MATERIALS.flipper, f.pressed ? 1.6 : 1);
  draw(cylinderMesh, multiply(frame, post(0, 0, 0.22, h, 0.08)), MATERIALS.steel);
}

function drawPlunger() {
  const x = (LANE_X + table.fields[0].x1) / 2;
  const pull = game.charge * 1.2;
  draw(cylinderMesh, multiply(translate(x, -0.8 - pull, 0.5), scale(0.16, 1.1, 0.16)), MATERIALS.steel);
  draw(sphereMesh, multiply(translate(x, -1.9 - pull, 0.5), scale(0.38, 0.38, 0.38)), MATERIALS.knob, 0.15 + game.charge);
  draw(cylinderMesh, multiply(translate(x, 0.25 - pull, 0.5), scale(0.35, 0.15, 0.35)), MATERIALS.rubber);
}

function drawBall() {
  const [x, y] = game.ball.p;
  draw(sphereMesh, multiply(translate(x, y, BALL_RADIUS), game.ball.rotation, scale(BALL_RADIUS, BALL_RADIUS, BALL_RADIUS)), MATERIALS.ball);
}

function drawScene() {
  parent = board;
  table.fields.forEach(drawCabinet);
  table.walls.forEach(drawWall);
  table.bumpers.forEach(drawBumper);
  table.flippers.forEach(drawFlipper);
  drawPlunger();
  drawBall();
}

function drawWorld() {
  const { x0, y0, x1, y1 } = GROUND, base = CABINET.base;
  parent = identity();
  draw(cubeMesh, box(x0, y0, base - 0.2, x1, y1, base), MATERIALS.ground);
  for (const [bx0, by0, bx1, by1, h] of BLOCKS) draw(cubeMesh, box(bx0, by0, base, bx1, by1, base + h), MATERIALS.block);
}

function updateTrail() {
  if (game.state !== "play") trail.length = 0;
  else trail.unshift([...game.ball.p]);
  if (trail.length > TRAIL_LENGTH) trail.pop();
}

function drawTrail(projection) {
  if (trail.length < 2) return;
  trail.forEach(([x, y], i) => {
    const [ax, ay] = trail[Math.max(i - 1, 0)], [bx, by] = trail[Math.min(i + 1, trail.length - 1)];
    const len = Math.hypot(ax - bx, ay - by) || 1;
    const age = i / (TRAIL_LENGTH - 1), w = TRAIL_WIDTH * (1 - age);
    const nx = -(ay - by) / len * w, ny = (ax - bx) / len * w;
    trailPositions.set([x + nx, y + ny, TRAIL_HEIGHT, x - nx, y - ny, TRAIL_HEIGHT], i * 6);
    trailTexCoords.set([age, 1, age, -1], i * 4);
  });
  gl.useProgram(trailProgram);
  gl.uniformMatrix4fv(trailUniforms.uModelView, false, multiply(view, board));
  gl.uniformMatrix4fv(trailUniforms.uProjection, false, projection);
  gl.uniform3fv(trailUniforms.uColor, palette.trail);
  gl.bindBuffer(gl.ARRAY_BUFFER, trailPositionBuffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, trailPositions, 0, trail.length * 6);
  gl.bindBuffer(gl.ARRAY_BUFFER, trailTexCoordBuffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, trailTexCoords, 0, trail.length * 4);
  gl.bindVertexArray(trailVao);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.depthMask(false);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, trail.length * 2);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
}

function blurPass(source, target, step, threshold) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
  gl.viewport(0, 0, target.width, target.height);
  gl.bindTexture(gl.TEXTURE_2D, source.texture);
  gl.uniform2fv(blurUniforms.uStep, step);
  gl.uniform1f(blurUniforms.uThreshold, threshold);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function drawBloom() {
  gl.useProgram(blurProgram);
  gl.activeTexture(gl.TEXTURE0);
  let source = sceneTarget, threshold = BLOOM_THRESHOLD;
  for (const level of bloomLevels) {
    blurPass(source, level.temp, [1 / level.temp.width, 0], threshold);
    blurPass(level.temp, level.blur, [0, 1 / level.blur.height], 0);
    source = level.blur;
    threshold = 0;
  }
}

function drawComposite() {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.useProgram(compositeProgram);
  [sceneTarget, ...bloomLevels.map(level => level.blur)].forEach((target, i) => {
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, target.texture);
  });
  gl.activeTexture(gl.TEXTURE0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width === w && canvas.height === h) return;
  canvas.width = w;
  canvas.height = h;
  resizeTargets(w, h);
}

function render(insets, ballCam, zoom) {
  resize();
  updatePalette();
  updateTrail();
  const field = rect(table.fields[game.field]);
  cameraRect = cameraRect ? lerp(cameraRect, field, 0.08) : field;
  const c = center(cameraRect);
  board = multiply(translate(c[0], c[1], 0), rotateY(game.tilt[0]), rotateX(-game.tilt[1]), translate(-c[0], -c[1], 0));
  lightViewProjection = multiply(lightProjection(), lightView);
  shadowMatrix = multiply(translate(0.5, 0.5, 0.5), scale(0.5, 0.5, 0.5), lightViewProjection);

  gl.useProgram(shadowProgram);
  gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFramebuffer);
  gl.viewport(0, 0, SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.POLYGON_OFFSET_FILL);
  gl.polygonOffset(2, 4);
  shadowPass = true;
  drawScene();
  shadowPass = false;
  gl.disable(gl.POLYGON_OFFSET_FILL);

  let projection;
  if (ballCam) {
    view = chaseView();
    projection = perspective(2 * Math.atan(Math.tan(65 * Math.PI / 360) / zoom), canvas.width / canvas.height, 0.2, 120);
  } else {
    chaseEye = chaseTarget = null;
    const tall = Math.min(1, Math.max(0, (1.1 - canvas.width / canvas.height) / 0.6));
    view = lookAt(add(c, lerp(CAMERA.wide.eye, CAMERA.tall.eye, tall)),
                  add(c, lerp(CAMERA.wide.target, CAMERA.tall.target, tall)), [0, 0, 1]);
    projection = fitProjection(view, canvas.clientWidth, canvas.clientHeight, insets, fitCorners(cameraRect), zoom);
  }

  gl.useProgram(program);
  gl.bindFramebuffer(gl.FRAMEBUFFER, msaaFramebuffer);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.uniformMatrix4fv(uniforms.uProjection, false, projection);
  gl.uniform3fv(uniforms.uLightDir, LIGHTS.flatMap(l => transformDirection(view, l.pos.map((v, i) => v - TABLE_CENTER[i]))));
  gl.uniform3fv(uniforms.uLightColor, LIGHTS.flatMap(l => l.color));
  gl.uniform3fv(uniforms.uUp, transformDirection(view, [0, 0, 1]));
  gl.uniform3fv(uniforms.uFogColor, palette.fog);
  gl.uniform3fv(uniforms.uSkyColor, palette.sky);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, shadowMap);
  gl.activeTexture(gl.TEXTURE0);
  gl.clearColor(palette.fog[0], palette.fog[1], palette.fog[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  drawScene();
  drawWorld();
  drawTrail(projection);
  resolveScene();

  gl.disable(gl.DEPTH_TEST);
  gl.bindVertexArray(null);
  drawBloom();
  drawComposite();
  gl.enable(gl.DEPTH_TEST);
}
