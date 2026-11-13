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

const int NO_MAPPING = 0, TEXTURE_MAPPING = 1;
const vec3 Ka = vec3(0.46, 0.50, 0.58);
const float Kd = 0.6;

in vec3 vPosition;
in vec3 vNormal;
in vec2 vTexCoord;
in vec3 vShadowCoord;

uniform vec3 uLightDir[2];
uniform vec3 uLightColor[2];

uniform vec3 uColor;
uniform vec3 uEmissive;
uniform float uKs;
uniform float uShininess;

uniform sampler2D uTexture;
uniform highp sampler2DShadow uShadowMap;
uniform int uMapping;

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 fragNormal;

vec3 calculateLight(int i, vec3 N, vec3 V, vec3 color) {
  vec3 L = normalize(uLightDir[i]);
  vec3 H = normalize(L + V);
  float diff = smoothstep(0.16, 0.22, dot(N, L));
  float spec = smoothstep(0.45, 0.50, pow(max(dot(N, H), 0.0), uShininess)) * diff;
  return uLightColor[i] * (Kd * diff * color + uKs * spec);
}

void main() {
  vec3 color = uMapping == NO_MAPPING ? uColor : uColor * texture(uTexture, vTexCoord).rgb;
  vec3 N = normalize(vNormal);
  vec3 V = normalize(-vPosition);
  float shadow = smoothstep(0.3, 0.7, texture(uShadowMap, vShadowCoord));

  vec3 result = Ka * color + uEmissive;
  result += shadow * calculateLight(0, N, V, color);
  result += calculateLight(1, N, V, color);
  fragColor = vec4(result, 1.0);
  fragNormal = vec4(N * 0.5 + 0.5, 1.0);
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

const POST_VERTEX_SHADER = `#version 300 es
const vec2 corners[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
out vec2 vUv;

void main() {
  vec2 p = corners[gl_VertexID];
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

const POST_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;

uniform sampler2D uScene;
uniform sampler2D uNormals;
uniform sampler2D uDepth;
uniform vec2 uDepthParams;
uniform float uOutlineWidth;
uniform vec3 uOutlineColor;

out vec4 fragColor;

float linearDepth(vec2 uv) {
  float z = texture(uDepth, uv).r * 2.0 - 1.0;
  return uDepthParams.y / (z + uDepthParams.x);
}

float normalDiff(vec3 n, vec2 uv) {
  return 1.0 - dot(n, texture(uNormals, uv).rgb * 2.0 - 1.0);
}

void main() {
  vec2 dx = vec2(uOutlineWidth / float(textureSize(uDepth, 0).x), 0.0);
  vec2 dy = vec2(0.0, uOutlineWidth / float(textureSize(uDepth, 0).y));
  float d = linearDepth(vUv);
  float depthEdge = (abs(linearDepth(vUv - dx) + linearDepth(vUv + dx) - 2.0 * d)
                   + abs(linearDepth(vUv - dy) + linearDepth(vUv + dy) - 2.0 * d)) / d;
  vec3 n = texture(uNormals, vUv).rgb * 2.0 - 1.0;
  float normalEdge = max(max(normalDiff(n, vUv - dx), normalDiff(n, vUv + dx)),
                         max(normalDiff(n, vUv - dy), normalDiff(n, vUv + dy)));
  float edge = max(smoothstep(0.02, 0.05, depthEdge), smoothstep(0.3, 0.5, normalEdge));
  fragColor = vec4(mix(texture(uScene, vUv).rgb, uOutlineColor, edge), 1.0);
}
`;

const NO_MAPPING = 0, TEXTURE_MAPPING = 1;

const LIGHTS = [
  { pos: [-22, 8, 22], color: [1.05, 1.0, 0.9] },
  { pos: [10, -8, 14], color: [0.2, 0.25, 0.32] },
];

const SKY = [0.56, 0.80, 0.94];
const OUTLINE_COLOR = [0.08, 0.07, 0.12];
const SHADOW_MAP_SIZE = 2048;

const CABINET = {
  rim: 1.2,
  front: -2.5,
  wallTop: 1.2,
  floor: -0.6,
  base: -1.4,
};
const WALL_HEIGHT = 1.0, WALL_THICK = 0.32;
const FLIPPER_HEIGHT = 0.65;

const CAMERA = {
  wide: { eye: [10, -19, 29], target: [10, 14, 0] },
  tall: { eye: [10, -6, 42], target: [10, 15.5, 0] },
};

const canvas = document.getElementById("glcanvas");
const gl = canvas.getContext("webgl2", { powerPreference: "high-performance" });

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
  "uLightColor", "uColor", "uEmissive", "uKs", "uShininess", "uMapping", "uTexture", "uShadowMap"]);
gl.useProgram(program);
gl.uniform1i(uniforms.uTexture, 0);
gl.uniform1i(uniforms.uShadowMap, 1);

const shadowProgram = createProgram(SHADOW_VERTEX_SHADER, SHADOW_FRAGMENT_SHADER);
const uLightMVP = gl.getUniformLocation(shadowProgram, "uLightMVP");

const postProgram = createProgram(POST_VERTEX_SHADER, POST_FRAGMENT_SHADER);
const postUniforms = getUniforms(postProgram, ["uScene", "uNormals", "uDepth", "uDepthParams", "uOutlineWidth", "uOutlineColor"]);
gl.useProgram(postProgram);
gl.uniform1i(postUniforms.uScene, 0);
gl.uniform1i(postUniforms.uNormals, 1);
gl.uniform1i(postUniforms.uDepth, 2);
gl.uniform3fv(postUniforms.uOutlineColor, OUTLINE_COLOR);

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

function createTarget(attachment, internalFormat, format, type) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const renderbuffer = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);
  return { attachment, internalFormat, format, type, texture, renderbuffer };
}

const targets = [
  createTarget(gl.COLOR_ATTACHMENT0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE),
  createTarget(gl.COLOR_ATTACHMENT1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE),
  createTarget(gl.DEPTH_ATTACHMENT, gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT),
];
const [sceneTarget, normalTarget, depthTarget] = targets;
const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES));

const msaaFramebuffer = gl.createFramebuffer();
const resolveFramebuffer = gl.createFramebuffer();
for (const t of targets) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, msaaFramebuffer);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, t.attachment, gl.RENDERBUFFER, t.renderbuffer);
  gl.bindFramebuffer(gl.FRAMEBUFFER, resolveFramebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, t.attachment, gl.TEXTURE_2D, t.texture, 0);
}
gl.bindFramebuffer(gl.FRAMEBUFFER, msaaFramebuffer);
gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
gl.bindFramebuffer(gl.FRAMEBUFFER, null);

function resizeTargets(w, h) {
  for (const t of targets) {
    gl.bindTexture(gl.TEXTURE_2D, t.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, t.internalFormat, w, h, 0, t.format, t.type, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, t.renderbuffer);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, t.internalFormat, w, h);
  }
}

function resolveTargets() {
  const w = canvas.width, h = canvas.height;
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msaaFramebuffer);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, resolveFramebuffer);
  gl.readBuffer(gl.COLOR_ATTACHMENT0);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.NONE]);
  gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.NEAREST);
  gl.readBuffer(gl.COLOR_ATTACHMENT1);
  gl.drawBuffers([gl.NONE, gl.COLOR_ATTACHMENT1]);
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

const seaTexture = loadTexture("textures/toon/sea.png");
const planksTexture = loadTexture("textures/toon/planks.png");
const woodTexture = loadTexture("textures/toon/wood.png");
const capTexture = loadTexture("textures/toon/cap.png");
const bumperTexture = loadTexture("textures/toon/bumper.png");
const ballTexture = loadTexture("textures/toon/ball.png");

const MATERIALS = {
  playfield: { ks: 0.25, shininess: 20, texture: seaTexture },
  cabinet: { ks: 0.1, shininess: 24, texture: planksTexture, repeat: [4, 1] },
  cabinetSide: { ks: 0.1, shininess: 24, texture: planksTexture, repeat: [1, 6] },
  rail: { color: [0.98, 0.80, 0.30], ks: 0.5, shininess: 64 },
  bumper: { ks: 0.15, shininess: 32, texture: bumperTexture },
  bumperCap: { ks: 0.3, shininess: 48, texture: capTexture },
  flipper: { ks: 0.25, shininess: 40, texture: woodTexture },
  rubber: { color: [0.16, 0.22, 0.30], ks: 0.15, shininess: 24 },
  ball: { ks: 0.6, shininess: 90, texture: ballTexture },
  steel: { color: [0.86, 0.90, 0.95], ks: 0.6, shininess: 90 },
};

gl.enable(gl.DEPTH_TEST);

const lerp3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

const FIT_CORNERS = [];
for (const x of [-CABINET.rim, table.width + CABINET.rim])
  for (const y of [CABINET.front, table.height + CABINET.rim])
    for (const z of [CABINET.base, CABINET.wallTop]) FIT_CORNERS.push([x, y, z]);

function fitProjection(view, W, H, insets) {
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (const c of FIT_CORNERS) {
    const [x, y, z] = transformPoint(view, c);
    xmin = Math.min(xmin, x / -z); xmax = Math.max(xmax, x / -z);
    ymin = Math.min(ymin, y / -z); ymax = Math.max(ymax, y / -z);
  }
  const margin = 1.04, usable = H - insets.top - insets.bottom;
  const s = Math.max((xmax - xmin) * margin / W, (ymax - ymin) * margin / usable);
  const cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2;
  const bottom = cy - s * (insets.bottom + usable / 2);
  return frustum(cx - s * W / 2, cx + s * W / 2, bottom, bottom + s * H, 1, 200);
}

let chaseEye = null, chaseTarget = null;

function chaseView() {
  const [x, y] = game.ball.p, vx = game.ball.v[0];
  const eye = [x + vx * 0.02, y - 3.2, 1.85], target = [x + vx * 0.08, y + 5, 0.4];
  chaseEye = chaseEye ? lerp3(chaseEye, eye, 0.22) : eye;
  chaseTarget = chaseTarget ? lerp3(chaseTarget, target, 0.22) : target;
  return lookAt(chaseEye, chaseTarget, [0, 0, 1]);
}

const TABLE_CENTER = [table.width / 2, table.height / 2, 0];
const lightView = lookAt(LIGHTS[0].pos, TABLE_CENTER, [0, 0, 1]);

function lightProjection() {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const [x, y, z] of FIT_CORNERS)
    for (const dy of [0, -1.5]) {
      const p = transformPoint(lightView, [x, y + dy, z]);
      for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p[i]); hi[i] = Math.max(hi[i], p[i]); }
    }
  return ortho(lo[0], hi[0], lo[1], hi[1], -hi[2] - 1, -lo[2] + 1);
}

const lightViewProjection = multiply(lightProjection(), lightView);
const shadowMatrix = multiply(translate(0.5, 0.5, 0.5), scale(0.5, 0.5, 0.5), lightViewProjection);

let view;
let shadowPass = false;

function draw(mesh, model, mat, emissive = [0, 0, 0]) {
  if (shadowPass) {
    gl.uniformMatrix4fv(uLightMVP, false, multiply(lightViewProjection, model));
  } else {
    gl.uniformMatrix4fv(uniforms.uModelView, false, multiply(view, model));
    gl.uniformMatrix4fv(uniforms.uShadowMatrix, false, multiply(shadowMatrix, model));
    gl.uniform3fv(uniforms.uColor, mat.color ?? [1, 1, 1]);
    gl.uniform3fv(uniforms.uEmissive, emissive);
    gl.uniform1f(uniforms.uKs, mat.ks);
    gl.uniform1f(uniforms.uShininess, mat.shininess);
    gl.uniform2fv(uniforms.uTexRepeat, mat.repeat ?? [1, 1]);
    gl.uniform1i(uniforms.uMapping, mat.texture ? TEXTURE_MAPPING : NO_MAPPING);
    gl.bindTexture(gl.TEXTURE_2D, mat.texture ?? null);
  }
  gl.bindVertexArray(mesh.vao);
  gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
}

const box = (x0, y0, z0, x1, y1, z1) =>
  multiply(translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), scale((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2));

const upright = rotateX(Math.PI / 2);
const post = (x, y, r, z0, h) => multiply(translate(x, y, z0 + h / 2), upright, scale(r, h / 2, r));

function drawCabinet() {
  const { width: w, height: h } = table;
  const { rim, front, wallTop, floor, base } = CABINET;
  draw(cubeMesh, box(0, front, floor, w, h, 0), MATERIALS.playfield);
  draw(cubeMesh, box(-rim, front, base, w + rim, h + rim, floor), MATERIALS.cabinet);
  for (const [x0, y0, x1, y1, mat] of [
    [-rim, front, 0, h + rim, MATERIALS.cabinetSide],
    [w, front, w + rim, h + rim, MATERIALS.cabinetSide],
    [0, h, w, h + rim, MATERIALS.cabinet],
    [-rim, front - 0.4, w + rim, front, MATERIALS.cabinet],
  ]) {
    draw(cubeMesh, box(x0, y0, floor, x1, y1, wallTop), mat);
    draw(cubeMesh, box(x0, y0, wallTop, x1, y1, wallTop + 0.12), MATERIALS.rail);
  }
}

function drawWall({ a, b, hidden }) {
  if (hidden) return;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  draw(cubeMesh, multiply(translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, WALL_HEIGHT / 2),
    rotateZ(angle), scale(len / 2, WALL_THICK / 2, WALL_HEIGHT / 2)), MATERIALS.rail);
  draw(cylinderMesh, post(a[0], a[1], WALL_THICK / 2, 0, WALL_HEIGHT), MATERIALS.rail);
  draw(cylinderMesh, post(b[0], b[1], WALL_THICK / 2, 0, WALL_HEIGHT), MATERIALS.rail);
}

function drawBumper(bp) {
  const glow = bp.lit > 0 ? [1.8, 1.3, 0.45] : [0.15, 0.10, 0.03];
  const [x, y] = bp.c;
  draw(cylinderMesh, post(x, y, bp.r * 0.90, 0, 0.95), MATERIALS.bumper, glow);
  draw(cylinderMesh, post(x, y, bp.r * 1.02, 0.12, 0.28), MATERIALS.rubber);
  draw(cylinderMesh, post(x, y, bp.r * 0.75, 0.95, 0.14), MATERIALS.bumperCap, glow.map(g => g * 0.6));
}

function drawFlipper(f) {
  const worldAngle = f.side > 0 ? f.angle : Math.PI - f.angle;
  const frame = multiply(translate(f.pivot[0], f.pivot[1], 0), rotateZ(worldAngle));
  const h = FLIPPER_HEIGHT;
  draw(flipperMesh, multiply(frame, scale(1, 1, 0.25)), MATERIALS.rubber);
  draw(flipperMesh, multiply(frame, translate(0, 0, 0.25), scale(1, 1, h - 0.25)), MATERIALS.flipper);
  draw(cylinderMesh, multiply(frame, post(0, 0, 0.22, h, 0.08)), MATERIALS.rail);
}

function drawPlunger() {
  const x = (LANE_X + table.width) / 2;
  const pull = game.charge * 1.2;
  draw(cylinderMesh, multiply(translate(x, -0.8 - pull, 0.5), scale(0.16, 1.1, 0.16)), MATERIALS.steel);
  draw(sphereMesh, multiply(translate(x, -1.9 - pull, 0.5), scale(0.38, 0.38, 0.38)), MATERIALS.rail);
  draw(cylinderMesh, multiply(translate(x, 0.25 - pull, 0.5), scale(0.35, 0.15, 0.35)), MATERIALS.rubber);
}

function drawBall() {
  const [x, y] = game.ball.p;
  draw(sphereMesh, multiply(translate(x, y, BALL_RADIUS), game.ball.rotation, scale(BALL_RADIUS, BALL_RADIUS, BALL_RADIUS)), MATERIALS.ball);
}

function drawScene() {
  drawCabinet();
  table.walls.forEach(drawWall);
  table.bumpers.forEach(drawBumper);
  table.flippers.forEach(drawFlipper);
  drawPlunger();
  drawBall();
}

let outlineWidth = 1;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width === w && canvas.height === h) return;
  canvas.width = w;
  canvas.height = h;
  resizeTargets(w, h);
  outlineWidth = dpr;
}

function render(insets, ballCam) {
  resize();

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
    projection = perspective(65 * Math.PI / 180, canvas.width / canvas.height, 0.2, 120);
  } else {
    chaseEye = chaseTarget = null;
    const tall = Math.min(1, Math.max(0, (1.1 - canvas.width / canvas.height) / 0.6));
    view = lookAt(lerp3(CAMERA.wide.eye, CAMERA.tall.eye, tall),
                  lerp3(CAMERA.wide.target, CAMERA.tall.target, tall), [0, 0, 1]);
    projection = fitProjection(view, canvas.clientWidth, canvas.clientHeight, insets);
  }

  gl.useProgram(program);
  gl.bindFramebuffer(gl.FRAMEBUFFER, msaaFramebuffer);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.uniformMatrix4fv(uniforms.uProjection, false, projection);
  gl.uniform3fv(uniforms.uLightDir, LIGHTS.flatMap(l => transformDirection(view, l.pos.map((v, i) => v - TABLE_CENTER[i]))));
  gl.uniform3fv(uniforms.uLightColor, LIGHTS.flatMap(l => l.color));
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, shadowMap);
  gl.activeTexture(gl.TEXTURE0);
  gl.clearColor(SKY[0], SKY[1], SKY[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  drawScene();
  resolveTargets();

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.useProgram(postProgram);
  gl.uniform2f(postUniforms.uDepthParams, projection[10], projection[14]);
  gl.uniform1f(postUniforms.uOutlineWidth, outlineWidth);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, depthTarget.texture);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, normalTarget.texture);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sceneTarget.texture);
  gl.disable(gl.DEPTH_TEST);
  gl.bindVertexArray(null);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.enable(gl.DEPTH_TEST);
}
