const VERTEX_SHADER = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;
in vec3 aTangent;
in vec2 aTexCoord;

uniform mat4 uModelView;
uniform mat4 uProjection;

out vec3 vPosition;
out vec3 vNormal;
out vec3 vTangent;
out vec3 vBitangent;
out vec2 vTexCoord;

void main() {
  vec4 p = uModelView * vec4(aPosition, 1.0);
  vPosition = p.xyz;
  // Inverse transpose for potential non-uniform scalings
  mat3 mv = mat3(uModelView);
  vNormal = transpose(inverse(mv)) * aNormal;
  vTangent = mv * aTangent;
  vBitangent = cross(vNormal, vTangent);
  vTexCoord = aTexCoord;
  gl_Position = uProjection * p;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

const int NUM_LIGHTS = 5;
const int NO_MAPPING = 0, TEXTURE_MAPPING = 1, BUMP_MAPPING = 2, NORMAL_MAPPING = 3, TEXTURE_NORMAL_MAPPING = 4;
const float bumpStrength = 3.0;


in vec3 vPosition;
in vec3 vNormal;
in vec3 vTangent;
in vec3 vBitangent;
in vec2 vTexCoord;

uniform vec3 uLightPos[NUM_LIGHTS];   // eye space
uniform vec3 uLightColor[NUM_LIGHTS];
uniform vec3 uSpotDir[NUM_LIGHTS];
uniform float uCutoff[NUM_LIGHTS];

uniform vec3 uColor;
uniform float uKa;
uniform float uKd;
uniform float uKs;
uniform float uShininess;
uniform float uAlpha;

uniform sampler2D uTexture;
uniform sampler2D uNormalMap;
uniform int uMapping;

out vec4 fragColor;

float height(vec2 uv) {
  return dot(texture(uTexture, uv).rgb, vec3(0.299, 0.587, 0.114));
}

vec3 perturbedNormal(vec3 N) {
  if (uMapping != BUMP_MAPPING && uMapping != NORMAL_MAPPING && uMapping != TEXTURE_NORMAL_MAPPING) return N;
  mat3 TBN = mat3(normalize(vTangent), normalize(vBitangent), N);
  if (uMapping == NORMAL_MAPPING) {
    vec3 tangentNormal = texture(uTexture, vTexCoord).rgb * 2.0 - 1.0;
    return normalize(TBN * tangentNormal);
  }
  if (uMapping == TEXTURE_NORMAL_MAPPING) {
    vec3 tangentNormal = texture(uNormalMap, vTexCoord).rgb * 2.0 - 1.0;
    return normalize(TBN * tangentNormal);
  }

  vec2 texel = 1.0 / vec2(textureSize(uTexture, 0));
  float h = height(vTexCoord);
  float hu = height(vTexCoord + vec2(texel.x, 0.0));
  float hv = height(vTexCoord + vec2(0.0, texel.y));
  vec3 bumpNormal = vec3((hu - h) * bumpStrength, (hv - h) * bumpStrength, 1.0);
  return normalize(TBN * bumpNormal);
}

vec3 calculateLight(int i, vec3 N, vec3 V, vec3 color) {
  vec3 L = normalize(uLightPos[i] - vPosition);
  vec3 R = reflect(-L, N);
  float diff = max(dot(N, L), 0.0);
  float spec = pow(max(dot(V, R), 0.0), uShininess);

  float d = length(uLightPos[i] - vPosition);
  float attenuation = 1.0 / (1.0 + 0.09 * d + 0.032 * d * d);
  float spot = step(uCutoff[i], dot(-L, uSpotDir[i]));

  return spot * attenuation * uLightColor[i] * (uKd * diff * color + uKs * spec);
}

void main() {
  vec3 color = uMapping == TEXTURE_MAPPING || uMapping == BUMP_MAPPING || uMapping == TEXTURE_NORMAL_MAPPING ? uColor * texture(uTexture, vTexCoord).rgb : uColor;
  vec3 N = perturbedNormal(normalize(vNormal));
  vec3 V = normalize(-vPosition);           // camera sits at the origin

  vec3 result = uKa * color;
  for (int i = 0; i < NUM_LIGHTS; i++) result += calculateLight(i, N, V, color);
  fragColor = vec4(result, uAlpha);
}
`;

const NO_MAPPING = 0, TEXTURE_MAPPING = 1, BUMP_MAPPING = 2, NORMAL_MAPPING = 3, TEXTURE_NORMAL_MAPPING = 4;

// WebGL setup
const canvas = document.getElementById("glcanvas");
const gl = canvas.getContext("webgl2");

function compile(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

// Fixed attribute slots, so the meshes stay valid when the shaders are recompiled
const ATTRIBUTES = { aPosition: 0, aNormal: 1, aTexCoord: 2, aTangent: 3};

function createProgram(vsSource, fsSource) {
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSource));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSource));
  for (const name in ATTRIBUTES) gl.bindAttribLocation(prog, ATTRIBUTES[name], name);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  return prog;
}


function bindAttribute(name, data, size) {
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.vertexAttribPointer(ATTRIBUTES[name], size, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(ATTRIBUTES[name]);
}

function createMesh({ positions, normals, tangents, texCoords, indices }) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vertices = positions.length / 3;
  bindAttribute("aPosition", positions, 3);
  bindAttribute("aNormal", normals, 3);
  bindAttribute("aTangent", tangents ?? new Float32Array(vertices * 3), 3);
  bindAttribute("aTexCoord", texCoords ?? new Float32Array(vertices * 2), 2);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  return { vao, count: indices.length };
}

const cubeMesh = createMesh(createCube());
const cylinderMesh = createMesh(createCylinder(32));
const sphereMesh = createMesh(createSphere(32));
const torusMesh = createMesh(createTorus(32));
const floorMesh = createMesh(createGrid(2.5));
const wallMesh = createMesh(createGrid(2.5, 2.25));
const coneMesh = createMesh(createCone(32));


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
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  };
  image.src = url;
  return texture;
}

const floorTexture = loadTexture("textures/floor.png");
const floorNormalMap = loadTexture("textures/floor_nmap.png");
const wallTexture = loadTexture("textures/wallpaper_tex.png");
const wallNormalMap = loadTexture("textures/wallpaper_nmap.png");
const ivoryTexture = loadTexture("textures/ivory_polymer.png");
const ivoryNormalMap = loadTexture("textures/ivory_polymer_nmap.png");
const charcoalTexture = loadTexture("textures/charcoal_polymer.png");
const rubberTexture = loadTexture("textures/black_rubber.png");
const beachBallTexture = loadTexture("textures/beach_ball.png");
const beachBallNormalMap = loadTexture("textures/beach_ball_nmap.png");
const cubeHexagonTexture = loadTexture("textures/cube_hexagon.png");
const sunTexture = loadTexture("textures/sun.png");
const playmatTexture = loadTexture("textures/playmat.png");
const playmatNormalMap = loadTexture("textures/playmat_nmap.png");
const signTexture = loadTexture("textures/sign_tex.png");
const signNormalMap = loadTexture("textures/sign_nmap.png");

const videoElement = document.createElement("video");
//videoElement.src = "textures/flintstones.mp4";
videoElement.src = "textures/gen3_video.mp4";

videoElement.loop = true;
videoElement.muted = true;
videoElement.play();

const videoTexture = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, videoTexture);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255]));
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

function updateVideoTexture() {
  if (videoElement.readyState >= videoElement.HAVE_CURRENT_DATA) {
    gl.bindTexture(gl.TEXTURE_2D, videoTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoElement);
  }
}

const materials = {
  default:  { Ka: 0.20, Kd: 0.80, Ks: 0.50, shininess: 32, },
  ivory:    { Ka: 0.75, Kd: 0.60, Ks: 0.10, shininess: 12, texture: ivoryTexture },
  charcoal: { Ka: 0.20, Kd: 0.75, Ks: 0.45, shininess: 60, texture: charcoalTexture },
  rubber:   { Ka: 0.10, Kd: 0.70, Ks: 0.05, shininess: 8, texture: rubberTexture },
  floor:    { Ka: 0.30, Kd: 0.85, Ks: 0.10, shininess: 16, },
  wall:     { Ka: 0.40, Kd: 0.80, Ks: 0.02, shininess: 8, },
  beachBall: { Ka: 0.40, Kd: 0.80, Ks: 0.30, shininess: 32 },
  cubeHexagon: { Ka: 0.20, Kd: 0.80, Ks: 0.50, shininess: 32, texture: cubeHexagonTexture },
  window:    { Ka: 0.40, Kd: 0.80, Ks: 0.02, shininess: 8, uAlpha: 0.2 },
  sun:    { Ka: 1.0, Kd: 0.3, Ks: 0.0, shininess: 8  },

};

for (const material of Object.values(materials)) {
    material.uAlpha ??= 1.0;    // opaque default
}
 
function node(name, mesh, material, ...transforms) {
  return { name, mesh, material, shape: multiply(...transforms) };
}

function textured(node, texture, mapping = BUMP_MAPPING, normalMap = null) {
  return Object.assign(node, { texture, mapping, normalMap });
}

function light(name, position, color = [1, 1, 1], spotDir = null) {
  const cutoff = spotDir ? Math.cos(Math.PI / 4) : -1;
  return { name, joint: translate(...position), light: { color, spotDir: normalize(spotDir ?? [0, -1, 0]), cutoff } };
}

function segment(name, length, radius, [startClear, endClear]) {
  const collar = (suffix, y) => node(`${name}_${suffix}`, cylinderMesh, "charcoal", translate(0, y, 0), scale(radius + 0.02, 0.07, radius + 0.02));
  return [
    textured(node(name, cylinderMesh, "ivory", translate(0, length / 2, 0), scale(radius, length / 2, radius)), ivoryTexture, TEXTURE_NORMAL_MAPPING, ivoryNormalMap),
    collar("collar_0", startClear + 0.09),
    collar("collar_1", length - endClear - 0.09),
  ];
}

function jointRings(name, radius) {
  const half = radius * .25;//0.55;
  const axis = rotateX(Math.PI / 2);
  return [node(`${name}_band`, cylinderMesh, "ivory", axis, scale(radius, half, radius))].concat([-1, 1].flatMap(side => [
    node(`${name}_rim_${side}`, torusMesh, "charcoal", translate(0, 0, side * half), axis, scale(radius * 0.84, radius * 0.84, radius * 0.84)),
    textured(node(`${name}_cap_${side}`, cylinderMesh, "ivory", translate(0, 0, side * (half + radius * 0.12)), axis, scale(radius * 0.84, radius * 0.10, radius * 0.84)), ivoryTexture, TEXTURE_NORMAL_MAPPING, ivoryNormalMap),
    node(`${name}_seam_${side}`, cylinderMesh, "charcoal", translate(0, 0, side * (half + radius * 0.23)), axis, scale(radius * 0.68, radius * 0.02, radius * 0.68)),
    node(`${name}_hub_${side}`, cylinderMesh, "charcoal", translate(0, 0, side * (half + radius * 0.26)), axis, scale(radius * 0.54, radius * 0.04, radius * 0.54)),
  ]));
}

const upperLength = 2.4;
const foreLength = 2.0;

const scene = {
  name: "scene",
  children: [
    {
      name: "room",
      children: [
        textured(node("floor", floorMesh, "floor", translate(0, -1.9, 0), scale(5, 1, 5)), floorTexture, TEXTURE_NORMAL_MAPPING, floorNormalMap),
        {
          name: "backWall",
          joint: translate(0, 0, -5),
          children: [
            textured(node("backWallFace", wallMesh, "wall", translate(0, 1.1, 0), rotateX(Math.PI / 2), scale(5, 1, 3)), wallTexture, TEXTURE_NORMAL_MAPPING, wallNormalMap),
            {
              name: "tv",
              joint: translate(2.6, 0, -0.5),
              children: [
                textured(node("screen", cubeMesh, "default", translate(0, 1.4, 0), scale(1.1, 1.5, 0.6)), videoTexture),
                textured(node("sign", cubeMesh, "wall", rotateZ(rad(10)), translate(0, .6, .2), scale(0.75, 0.5, 0.55)), signTexture, TEXTURE_NORMAL_MAPPING, signNormalMap),
              ]// sign_y = 3.5 for above
            },
            {
              name: "window",
              joint: translate(-2.4, 2.0, -0.5),
              children: [
                textured(node("windowFrame", cubeMesh, "cubeHexagon", scale(2, 2, 0.6))),

                // Window "glass"
                textured(node("pane0", cubeMesh, "window", translate(-0.875, -0.9, 0), scale(0.8, 0.8, 0.7))),
                textured(node("pane1", cubeMesh, "window", translate(0.875, -0.9, 0), scale(0.8, 0.8, 0.7))),
                textured(node("pane2", cubeMesh, "window", translate(-0.875, 0.9, 0), scale(0.8, 0.8, 0.7))),
                textured(node("pane3", cubeMesh, "window", translate(0.875, 0.9, 0), scale(0.8, 0.8, 0.7))),

                textured(node("sun", sphereMesh, "sun", translate(0.875, 0.9, -11.5), scale(0.8, 0.8, 0.8)), sunTexture, BUMP_MAPPING),

                light("windowLight", [-0.875, -0.9, 0], [1, 2, .4], [0, -1, 1]),
              ]
            },
          ]
        },
        {
          name: "leftWall",
          joint: translate(-5, 0, 0),
          children: [
            textured(node("leftWallFace", wallMesh, "wall", translate(0, 1.1, 0), rotateZ(-Math.PI / 2), rotateY(Math.PI / 2), scale(5, 1, 3)), wallTexture, TEXTURE_NORMAL_MAPPING, wallNormalMap),
          ]
        },
      ]
    },

    textured(node("cone", coneMesh, "beachBall", translate(3.2, -1.1, 2.6), scale(0.8, 0.8, 0.8)), beachBallTexture, BUMP_MAPPING),
    textured(node("ball", sphereMesh, "beachBall", translate(-1, -1.20, -2), scale(0.3, 0.3, 0.3)), beachBallTexture, TEXTURE_NORMAL_MAPPING, beachBallNormalMap),

    light("ceilingLight", [0, 3.8, 0]),
    light("sideLight", [2.5, 4.5, 1]),
    //light("backLight", [-3.5, 3.0, -2.5]),
    //light("frontLight", [2.5, 2.0, 6.5], [1, 1, 1], [0.1, -0.45, -0.9]),

    // Floor light for simulated ray bounces 
    light("floorLight", [3.2, -1.9, 3.5], [0.3, 0.3, 0.3]),

    {
      name: "playmat",
      joint: translate(-1.0, -2.6, 0.6),
      children: [
        textured(node("mat", cylinderMesh, "default", scale(2.8, 0.9, 2.8)), playmatTexture, TEXTURE_NORMAL_MAPPING, playmatNormalMap),

        node("cube0", cubeMesh, "cubeHexagon", translate(1.4, 1.15, 1.0), scale(0.2, 0.2, 0.2)),
        node("cube1", cubeMesh, "cubeHexagon", translate(-0.6, 1.15, 1.2), scale(0.2, 0.2, 0.2)),
        node("cube2", cubeMesh, "cubeHexagon", translate(-1.8, 1.15, 0.6), scale(0.2, 0.2, 0.2)),
        node("cube3", cubeMesh, "cubeHexagon", translate(0.4, 1.15, 1.6), scale(0.2, 0.2, 0.2)),

        {
          name: "Baby Gen",
          joint: multiply(translate(0, 1.15, -0.6), scale(0.5, 0.5, 0.5)),
          children: [
            textured(node("base", cylinderMesh, "ivory", translate(0, 0.35, 0), scale(0.60, 0.35, 0.60)), ivoryTexture, TEXTURE_NORMAL_MAPPING, ivoryNormalMap),
            node("baseFoot", torusMesh, "charcoal", translate(0, 0.145, 0), scale(0.58, 0.58, 0.58)),
            node("baseSeam", cylinderMesh, "charcoal", translate(0, 0.685, 0), scale(0.61, 0.015, 0.61)),
            {
              name: "basePivot",
              joint: translate(0, 0.70, 0),
              children: [
                node("baseCollar", cylinderMesh, "charcoal", translate(0, 0.15, 0), scale(0.43, 0.15, 0.43)),
                {
                  name: "shoulderPivot",
                  joint: translate(0, 0.40, 0),
                  children: [
                    ...jointRings("shoulder", 0.43),
                    ...segment("upperArm", upperLength, 0.22, [0.43, 0.39]),
                    {
                      name: "elbowPivot",
                      joint: translate(0, upperLength, 0),
                      children: [
                        ...jointRings("elbow", 0.39),
                        ...segment("forearm", foreLength, 0.19, [0.39, 0.30]),
                        {
                          name: "wristPivot",
                          joint: translate(0, foreLength, 0),
                          children: [
                            ...jointRings("wrist", 0.30),
                            node("wristCollar", cylinderMesh, "charcoal", translate(0, 0.34, 0), scale(0.24, 0.16, 0.24)),
                            node("wristCamera", cubeMesh, "charcoal", translate(0, 0.36, 0.28), scale(0.11, 0.09, 0.07)),
                            node("wristLens", sphereMesh, "charcoal", translate(0, 0.46, 0.28), scale(0.04, 0.04, 0.04)),
                            {
                              name: "gripperPivot",
                              joint: translate(0, 0.50, 0),
                              children: [
                                node("gripperPalm", cubeMesh, "charcoal", translate(0, 0.13, 0), scale(0.34, 0.13, 0.22)),
                                light("gripperLight", [0, 0.13, 0.26], [1, 0, 0], [0, 1, 0]),
                                ...[["Left", -1], ["Right", 1]].map(([hand, side]) => ({
                                  name: `fingerPivot${hand}`,
                                  joint: translate(side * 0.25, 0.26, 0),
                                  children: [
                                    node(`fingerUpper${hand}`, cubeMesh, "ivory", translate(0, 0.17, 0), scale(0.075, 0.17, 0.10)),
                                    {
                                      name: `fingerTipPivot${hand}`,
                                      joint: translate(0, 0.34, 0),
                                      children: [
                                        node(`fingerTip${hand}`, cubeMesh, "rubber", translate(0, 0.13, 0), scale(0.075, 0.13, 0.10))
                                      ]
                                    }
                                  ]
                                }))
                              ]
                            }
                          ]
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
};

function indexNodes(node, byName = {}) {
  node.pose = node.joint ?? identity();
  if (node.name) byName[node.name] = node;
  for (const child of node.children ?? []) indexNodes(child, byName);
  return byName;
}
const nodes = indexNodes(scene);
const lightNodes = Object.values(nodes).filter(node => node.light);

// Shader editors
const vertEditor = document.getElementById("vertEditor");
const fragEditor = document.getElementById("fragEditor");
const shaderError = document.getElementById("shaderError");
vertEditor.value = VERTEX_SHADER;
fragEditor.value = FRAGMENT_SHADER;

const UNIFORMS = ["uModelView", "uProjection", "uLightPos", "uLightColor", "uSpotDir", "uCutoff",
                  "uColor", "uKa", "uKd", "uKs", "uShininess",  "uMapping", "uAlpha", "uTexture", "uNormalMap"];
let program;
const uniforms = {};

function updateProgram() {
  try {
    const prog = createProgram(vertEditor.value, fragEditor.value);
    gl.deleteProgram(program);
    program = prog;
    gl.useProgram(program);
    for (const name of UNIFORMS) uniforms[name] = gl.getUniformLocation(program, name);
    gl.uniform1i(uniforms["uTexture"], 0);  
    gl.uniform1i(uniforms["uNormalMap"], 1);  
    shaderError.textContent = "";
  } catch (e) {
    shaderError.textContent = e.message.replace(/\0/g, "");  // some drivers end the log with \0
  }
}
updateProgram();
vertEditor.addEventListener("input", updateProgram);
fragEditor.addEventListener("input", updateProgram);

function updateFrames(root, rootFrame) {
  const stack = [[root, rootFrame]];
  while (stack.length > 0) {
    const [node, parentFrame] = stack.pop();
    node.frame = multiply(parentFrame, node.pose);
    for (const child of node.children ?? []) stack.push([child, node.frame]);
  }
}

const JOINTS = {
  basePivot: rotateY,
  shoulderPivot: rotateZ,
  elbowPivot: rotateZ,
  wristPivot: rotateZ,
  gripperPivot: rotateY,
  fingerPivotLeft: rotateZ,
  fingerPivotRight: rotateZ,
  fingerTipPivotLeft: rotateZ,
  fingerTipPivotRight: rotateZ,
};

const startPose = {
  basePivot: 0, shoulderPivot: -30, elbowPivot: -80, wristPivot: -70, gripperPivot: 0,
  fingerPivotLeft: -8, fingerPivotRight: 8, fingerTipPivotLeft: -12, fingerTipPivotRight: 12,
};

function setJoint(name, degrees) {
  nodes[name].pose = multiply(nodes[name].joint, JOINTS[name](rad(degrees)));
}
for (const name in JOINTS) setJoint(name, startPose[name]);

gl.enable(gl.DEPTH_TEST);


gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

gl.clearColor(0.53, 0.81, 0.92, 1);
const projection = perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 100);

// Interactive controls
let dragRotX = 0.28, dragRotY = 0.5;    // mouse drag
let cameraPos = [0, 0, -12];
// let camX = 0, camY = 0, camZ = -10.8;  // arrow keys, w, s
let sliderAngle = 0;                    // degrees
let spinning = false, spinAngle = 0;    // Start/Stop button

let mouseDown = false, lastX, lastY;
canvas.addEventListener("mousedown", e => { mouseDown = true; lastX = e.clientX; lastY = e.clientY; });
window.addEventListener("mouseup", () => mouseDown = false);
window.addEventListener("mousemove", e => {
  if (!mouseDown) return;
  dragRotY += (e.clientX - lastX) * 0.01;
  dragRotX += (e.clientY - lastY) * 0.01;
  lastX = e.clientX; lastY = e.clientY;
});
canvas.addEventListener("wheel", e => {
  e.preventDefault();
  cameraPos[2] = Math.min(-0.1, Math.max(-100, cameraPos[2] + e.deltaY * 0.01));
}, { passive: false });

document.addEventListener("keydown", e => {
  if (e.target === vertEditor || e.target === fragEditor) return;  // let the editors use the keys
  const step = 0.2;
  switch (e.key) {
    case "ArrowUp": cameraPos[1] -= step; break;
    case "ArrowDown": cameraPos[1] += step; break;
    case "ArrowLeft": cameraPos[0] += step; break;
    case "ArrowRight": cameraPos[0] -= step; break;
    case "w": cameraPos[2] += step; break;
    case "s": cameraPos[2] -= step; break;
    default: return;
  }
  e.preventDefault();  // keep the arrow keys from scrolling the page
});

const axisSelect = document.getElementById("axisSelect");
document.getElementById("slider").addEventListener("input", e => {
  sliderAngle = Number(e.target.value);
  document.getElementById("sliderValue").textContent = sliderAngle;
});
document.getElementById("spinButton").addEventListener("click", () => spinning = !spinning);

function uploadLights(view) {
  const positions = [], colors = [], directions = [], cutoffs = [];
  for (const node of lightNodes) {
    const frame = multiply(view, node.frame);
    positions.push(...transformPoint(frame, [0, 0, 0]));
    directions.push(...normalize(transformDirection(frame, node.light.spotDir)));
    colors.push(...node.light.color);
    cutoffs.push(node.light.cutoff);
  }
  gl.uniform3fv(uniforms.uLightPos, new Float32Array(positions));
  gl.uniform3fv(uniforms.uSpotDir, new Float32Array(directions));
  gl.uniform3fv(uniforms.uLightColor, new Float32Array(colors));
  gl.uniform1fv(uniforms.uCutoff, new Float32Array(cutoffs));
}

function drawNode(node, view) {
  const m = materials[node.material];
  gl.uniform3fv(uniforms.uColor, m.color ?? [1, 1, 1]);
  gl.uniform1f(uniforms.uKa, m.Ka);
  gl.uniform1f(uniforms.uKd, m.Kd);
  gl.uniform1f(uniforms.uKs, m.Ks);
  gl.uniform1f(uniforms.uShininess, m.shininess);
  gl.uniform1f(uniforms.uAlpha, m.uAlpha);

  const texture = node.texture ?? m.texture;
  gl.uniform1i(uniforms.uMapping, texture ? (node.mapping ?? BUMP_MAPPING) : NO_MAPPING);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, node.normalMap ?? null);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture ?? null);

  gl.uniformMatrix4fv(uniforms.uModelView, false, multiply(view, node.frame, node.shape));
  gl.bindVertexArray(node.mesh.vao);
  gl.drawElements(gl.TRIANGLES, node.mesh.count, gl.UNSIGNED_SHORT, 0);
}

function drawTree(root, view) {
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node.mesh) drawNode(node, view);
    for (const child of node.children ?? []) stack.push(child);
  }
}

// Render loop
let lastTime = 0;
function render(time) {
  const t = time / 1000;
  if (spinning) spinAngle += t - lastTime;
  lastTime = t;
  updateVideoTexture();
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Camera moves with the keys; the light stays fixed
  const view = translate(cameraPos[0], cameraPos[1], cameraPos[2]);
  gl.uniformMatrix4fv(uniforms.uProjection, false, projection);

  // Whole-model rotation
  const axisRotation = ROTATE[axisSelect.value](sliderAngle * Math.PI / 180 + spinAngle);
  scene.pose = multiply(rotateY(dragRotY), rotateX(dragRotX), axisRotation);

  updateFrames(scene, identity());
  uploadLights(view);
  drawTree(scene, view);
  requestAnimationFrame(render);
}
requestAnimationFrame(render);

