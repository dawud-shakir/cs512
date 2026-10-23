const NUM_LIGHTS = 4;

const LIGHTING_GLSL = `
const int NUM_LIGHTS = ${NUM_LIGHTS};

uniform vec3 uLightPos[NUM_LIGHTS];   // eye space
uniform vec3 uSpotDir[NUM_LIGHTS];
uniform vec3 uLightColor[NUM_LIGHTS];
uniform vec3 uColor;

uniform float uKa;
uniform float uKd;
uniform float uKs;
uniform float uAlpha;

uniform highp int uShading;
uniform highp int uLightType;

uniform float uCutoff;
uniform float uSpotExponent;

uniform vec3 uSpecularColor;
uniform vec3 uDiffuseColor;
uniform vec3 uAmbientColor;

vec3 calculateLight(vec3 lightPos, vec3 lightColor, vec3 position, vec3 normal, vec3 viewDir, vec3 color) {
    vec3 lightDir = normalize(lightPos - position);
    float cosTheta = max(dot(normal, lightDir), 0.0);
    vec3 diffuse = uKd * uDiffuseColor * lightColor * cosTheta * color;

    float spec = 0.0;
    if (cosTheta > 0.0)
    {
      vec3 reflectDir = reflect(-lightDir, normal);
      spec = pow(max(dot(viewDir, reflectDir), 0.0), uAlpha);
    }
    vec3 specular = uKs * uSpecularColor * lightColor * spec;

    float d = length(lightPos - position);
    float f_att = 1.0/(1.0 + 0.09*d + 0.032*d*d);

    return f_att * (diffuse + specular);
}

float spotFactor(int i, vec3 position) {
  if (uLightType == 0) return 1.0;
  vec3 lightToSurface = normalize(position - uLightPos[i]);
  float c = dot(lightToSurface, uSpotDir[i]);
  return (c >= uCutoff) ? pow(c, uSpotExponent) : 0.0;
}

vec3 shadeSurface(vec3 position, vec3 normal, vec3 color) {
  vec3 viewDir = normalize(-position);

  vec3 result = uKa * uAmbientColor * color;

  for (int i = 0; i < NUM_LIGHTS; ++i) {
    result += spotFactor(i, position) * calculateLight(uLightPos[i], uLightColor[i], position, normal, viewDir, color);
  }

  return result;
}
`;

const VERTEX_SHADER = `#version 300 es
precision highp float;
in vec3 aPosition;
in vec3 aNormal;

uniform mat4 uModelView;
uniform mat4 uProjection;
${LIGHTING_GLSL}

out vec3 vPosition;
out vec3 vNormal;
out vec3 vColor;
flat out vec3 vFlatPosition;

void main() {
  vec4 p = uModelView * vec4(aPosition, 1.0);
  vec3 n = normalize(transpose(inverse(mat3(uModelView))) * aNormal);
  vPosition = p.xyz;
  vFlatPosition = p.xyz;
  vNormal = n;
  vColor = shadeSurface(p.xyz, n, uColor);

  gl_Position = uProjection * p;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
${LIGHTING_GLSL}

in vec3 vPosition;
in vec3 vNormal;
in vec3 vColor;
flat in vec3 vFlatPosition;

out vec4 fragColor;

void main() {
  vec3 faceNormal = normalize(cross(dFdx(vPosition), dFdy(vPosition)));

  vec3 c;
  if (uShading == 0)
    c = shadeSurface(vFlatPosition, faceNormal, uColor);
  else if (uShading == 1)
    c = vColor;
  else
    c = shadeSurface(vPosition, normalize(vNormal), uColor);

  fragColor = vec4(c, 1.0);
}
`;

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
const ATTRIBUTES = { aPosition: 0, aNormal: 1 };

function createProgram(vsSource, fsSource) {
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSource));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSource));
  for (const name in ATTRIBUTES) gl.bindAttribLocation(prog, ATTRIBUTES[name], name);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  return prog;
}

// Shader editors
const vertEditor = document.getElementById("vertEditor");
const fragEditor = document.getElementById("fragEditor");
const shaderError = document.getElementById("shaderError");
vertEditor.value = VERTEX_SHADER;
fragEditor.value = FRAGMENT_SHADER;

let program;

const uniforms = {};

function updateProgram() {
  try {
    const prog = createProgram(vertEditor.value, fragEditor.value);
    gl.deleteProgram(program);
    program = prog;
    gl.useProgram(program);
    uniforms["uModelView"] = gl.getUniformLocation(program, "uModelView");
    uniforms["uProjection"] = gl.getUniformLocation(program, "uProjection");
    uniforms["uLightPos"] = gl.getUniformLocation(program, "uLightPos[0]");
    uniforms["uColor"] = gl.getUniformLocation(program, "uColor");

    uniforms["uKa"] = gl.getUniformLocation(program, "uKa");
    uniforms["uKd"] = gl.getUniformLocation(program, "uKd");
    uniforms["uKs"] = gl.getUniformLocation(program, "uKs");
    uniforms["uAlpha"] = gl.getUniformLocation(program, "uAlpha");

    uniforms["uShading"] = gl.getUniformLocation(program, "uShading");
    uniforms["uLightType"] = gl.getUniformLocation(program, "uLightType");

    uniforms["uSpotDir"] = gl.getUniformLocation(program, "uSpotDir[0]");
    uniforms["uCutoff"] = gl.getUniformLocation(program, "uCutoff");
    uniforms["uSpotExponent"] = gl.getUniformLocation(program, "uSpotExponent");

    uniforms["uSpecularColor"] = gl.getUniformLocation(program, "uSpecularColor");
    uniforms["uDiffuseColor"] = gl.getUniformLocation(program, "uDiffuseColor");
    uniforms["uAmbientColor"] = gl.getUniformLocation(program, "uAmbientColor");
    uniforms["uLightColor"] = gl.getUniformLocation(program, "uLightColor[0]");

    shaderError.textContent = "";
  } catch (e) {
    shaderError.textContent = e.message.replace(/\0/g, "");  // some drivers end the log with \0
  }
}
updateProgram();
vertEditor.addEventListener("input", updateProgram);
fragEditor.addEventListener("input", updateProgram);

function bindAttribute(name, data) {
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.vertexAttribPointer(ATTRIBUTES[name], 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(ATTRIBUTES[name]);
}

function createMesh({ positions, normals, indices }) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  bindAttribute("aPosition", positions);
  bindAttribute("aNormal", normals);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  return { vao, count: indices.length };
}

gl.enable(gl.DEPTH_TEST);

gl.clearColor(0.85, 0.86, 0.88, 1);

const cubeMesh = createMesh(createCube());
const cylinderMesh = createMesh(createCylinder(32));
const sphereMesh = createMesh(createSphere(32));
const coneMesh = createMesh(createCone(32));
const tubeMesh = createMesh(createTube(32));
const gearMesh = createMesh(createGear(12 * 16, 0.7));
const gridMesh = createMesh(createGrid(100));




const lightsTerms = {
  Ka: 0.2, Kd: 0.8, Ks: 0.5, Alpha: 32.0
};

const materials = {
  default: {
    Ka: 0.2, Kd: 0.8, Ks: 0.5, Alpha: 32.0,
    AmbientColor:  [1, 1, 1],
    DiffuseColor:  [1, 1, 1],
    SpecularColor: [1, 1, 1],
  },

  shell: {
    Ka: 0.35, Kd: 0.85, Ks: 0.35, Alpha: 40,
    AmbientColor:  [0.92, 0.93, 0.95],
    DiffuseColor:  [0.92, 0.93, 0.95],
    SpecularColor: [1.00, 1.00, 1.00],
  },

  joints: {
    Ka: 0.15, Kd: 0.70, Ks: 0.45, Alpha: 70,
    AmbientColor:  [0.15, 0.16, 0.18],
    DiffuseColor:  [0.15, 0.16, 0.18],
    SpecularColor: [0.60, 0.60, 0.62],
  },

  seam: {
    Ka: 0.40, Kd: 0.85, Ks: 0.30, Alpha: 30,
    AmbientColor:  [0.10, 0.58, 0.86],
    DiffuseColor:  [0.10, 0.58, 0.86],
    SpecularColor: [0.80, 0.90, 1.00],
  },

  aluminum: {
    Ka: 0.15, Kd: 0.55, Ks: 0.70, Alpha: 90,
    AmbientColor:  [0.72, 0.74, 0.77],
    DiffuseColor:  [0.72, 0.74, 0.77],
    SpecularColor: [1.00, 1.00, 1.00],
  },

  copper: {
    Ka: 0.30, Kd: 0.70, Ks: 0.60, Alpha: 40,
    AmbientColor:  [0.78, 0.26, 0.18],
    DiffuseColor:  [0.78, 0.26, 0.18],
    SpecularColor: [1.00, 0.80, 0.70],
  },

  brass: {
    Ka: 0.25, Kd: 0.65, Ks: 0.70, Alpha: 60,
    AmbientColor:  [0.75, 0.60, 0.22],
    DiffuseColor:  [0.75, 0.60, 0.22],
    SpecularColor: [1.00, 0.95, 0.80],
  },

  rubber: {
    Ka: 0.10, Kd: 0.60, Ks: 0.05, Alpha: 8,
    AmbientColor:  [0.05, 0.05, 0.05],
    DiffuseColor:  [0.05, 0.05, 0.05],
    SpecularColor: [0.30, 0.30, 0.30],
  },

  floor: {
    Ka: 0.30, Kd: 0.85, Ks: 0.10, Alpha: 16,
    AmbientColor:  [0.34, 0.40, 0.50],
    DiffuseColor:  [0.34, 0.40, 0.50],
    SpecularColor: [0.80, 0.85, 0.90],
  },

  wall: {
    Ka: 0.40, Kd: 0.80, Ks: 0.02, Alpha: 8,
    AmbientColor:  [0.50, 0.56, 0.66],
    DiffuseColor:  [0.50, 0.56, 0.66],
    SpecularColor: [0.50, 0.50, 0.50],
  },
};
const spotLightTerms = {
  Cutoff: Math.cos(Math.PI / 4), SpotExponent: 0.0,
};
let ambientLevel = 1;
const BACKGROUND = [0.7, 0.7, 0.7];


function armObject(name, mesh, material, position, size) {
  return {
    name,
    mesh,
    material,
    color: [1, 1, 1],
    shape: multiply(
      translate.apply(null, position),
      scale.apply(null, size)
    )
  };
}

function lightObject(name, position, spotDir = [0, -1, 0], color = [1, 1, 1]) {
  return {
    name,
    joint: translate.apply(null, position),
    light: { color, gain: 1, position, spotDir: normalize(spotDir) }
  };
}

function component(name, mesh, material) {
  const transforms = Array.prototype.slice.call(arguments, 3);
  return { name, mesh, material, color: [1, 1, 1], shape: multiply.apply(null, transforms) };
}

function segment(name, length, radius, [startClear, endClear]) {
  const collar = (suffix, y) => armObject(`${name}_${suffix}`, cylinderMesh, "joints", [0, y, 0], [radius + 0.02, 0.07, radius + 0.02]);
  return [
    armObject(name, cylinderMesh, "shell", [0, length / 2, 0], [radius, length / 2, radius]),
    collar("collar_0", startClear + 0.09),
    collar("collar_1", length - endClear - 0.09),
  ];
}

function jointObject(name, radius) {
  const half = radius * 0.55;
  const axis = rotateX(Math.PI / 2);
  return [
    component(`${name}_band`, cylinderMesh, "shell", axis, scale(radius, half, radius))
  ].concat([-1, 1].flatMap(side => [
      component(`${name}_rim_${side}`, tubeMesh, "joints", translate(0, 0, side * half), axis, scale(radius * 0.84, radius * 0.84, radius * 0.84)),
      component(`${name}_cap_${side}`, cylinderMesh, "shell", translate(0, 0, side * (half + radius * 0.12)), axis, scale(radius * 0.84, radius * 0.10, radius * 0.84)),
      component(`${name}_seam_${side}`, cylinderMesh, "seam", translate(0, 0, side * (half + radius * 0.23)), axis, scale(radius * 0.68, radius * 0.02, radius * 0.68)),
      component(`${name}_hub_${side}`, cylinderMesh, "joints", translate(0, 0, side * (half + radius * 0.26)), axis, scale(radius * 0.54, radius * 0.04, radius * 0.54)),
    ]));
}

const upperLength = 2.4;
const foreLength = 2.0;

const startPose = {
  basePivot: 0,
  shoulderPivot: -30,
  elbowPivot: -80,
  wristPivot: -70,
  gripperPivot: 0,
  fingerPivotLeft: -8,  fingerPivotRight: 8,
  fingerTipPivotLeft: -12, fingerTipPivotRight: 12,
};

const camera = { name: "camera" };

const scene = {
  name: "scene",
  children: [
    component("floor", gridMesh, "floor", translate(0, -1.9, 0), scale(20, 1, 20)),
    component("backWall", gridMesh, "wall", translate(0, 6.1, -20), rotateX(Math.PI / 2), scale(20, 1, 8)),
    component("leftWall", gridMesh, "wall", translate(-20, 6.1, 0), rotateZ(-Math.PI / 2), scale(8, 1, 20)),

    {
      name: "gear",
      joint: translate(1.2, -1.81, 1.6),
      mesh: gearMesh,
      material: "copper",
      color: [1, 1, 1],
      shape: scale(0.6, 0.6, 0.6)
    },

    lightObject("ceilingLight", [0, 4, 0]),
    lightObject("sideLight", [2.5, 1.5, 1]),
    lightObject("backLight", [-4, 3.5, -2.5]),

    {
      name: "Gen-Mini",
      joint: translate(-1.6, -1.9, 0),
      children: [
        armObject("base", cylinderMesh, "shell", [0, 0.35, 0], [0.60, 0.35, 0.60]),
        component("baseFoot", tubeMesh, "joints", translate(0, 0.145, 0), scale(0.58, 0.58, 0.58)),
        component("baseSeam", cylinderMesh, "seam", translate(0, 0.685, 0), scale(0.61, 0.015, 0.61)),

        {
          name: "basePivot",
          joint: translate(0, 0.70, 0),
          children: [
            armObject(
              "baseCollar",
              cylinderMesh,
              "joints",
              [0, 0.15, 0],
              [0.43, 0.15, 0.43]
            ),

            {
              name: "shoulderPivot",
              joint: translate(0, 0.40, 0),
              children: [].concat(
                jointObject("shoulder", 0.43),

                segment("upperArm", upperLength, 0.22, [0.43, 0.39]),

                {
                  name: "elbowPivot",
                  joint: translate(0, upperLength, 0),
                  children: [].concat(
                    jointObject("elbow", 0.39),

                    segment("forearm", foreLength, 0.19, [0.39, 0.30]),

                    {
                      name: "wristPivot",
                      joint: translate(0, foreLength, 0),
                      children: [].concat(
                        jointObject("wrist", 0.30),

                        armObject("wristCollar", cylinderMesh, "joints", [0, 0.34, 0], [0.24, 0.16, 0.24]),
                        armObject("wristCamera", cubeMesh, "rubber", [0, 0.36, 0.28], [0.11, 0.09, 0.07]),
                        armObject("wristLens", sphereMesh, "joints", [0, 0.46, 0.28], [0.04, 0.04, 0.04]),

                        {
                          name: "gripperPivot",
                          joint: translate(0, 0.50, 0),
                          children: [].concat(
                            armObject("gripperPalm", cubeMesh, "joints", [0, 0.13, 0], [0.34, 0.13, 0.22]),

                            lightObject("gripperLight", [0, 0.13, 0.26], [0, 1, 0], [1,0,0]),

                            [["Left", -1], ["Right", 1]].map(([hand, side]) => ({
                              name: `fingerPivot${hand}`,
                              joint: translate(side * 0.25, 0.26, 0),
                              children: [
                                armObject(
                                  `fingerUpper${hand}`,
                                  cubeMesh,
                                  "aluminum",
                                  [0, 0.17, 0],
                                  [0.075, 0.17, 0.10]
                                ),

                                {
                                  name: `fingerTipPivot${hand}`,
                                  joint: translate(0, 0.34, 0),
                                  children: [
                                    armObject(
                                      `fingerTip${hand}`,
                                      cubeMesh,
                                      "rubber",
                                      [0, 0.13, 0],
                                      [0.075, 0.13, 0.10]
                                    )
                                  ]
                                }
                              ]
                            }))
                          )
                        }
                      )
                    }
                  )
                }
              )
            }
          ]
        }
      ]
    }
  ]
};


function indexNodes(node, byName = {}, parent = null) {
  node.pose = node.joint ?? identity();
  node.parent = parent;
  
  if (node.name) {
    if (byName[node.name]) console.warn(`duplicate node name: ${node.name}`);
    byName[node.name] = node;
  }
  for (const child of node.children ?? []) indexNodes(child, byName, node);
  return byName;
}
const root = { name: "root", children: [camera, scene] };
const nodes = indexNodes(root);

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

const currentAngles = {};

function setJoint(name, degrees) {
  currentAngles[name] = degrees;
  nodes[name].pose = multiply(nodes[name].joint, JOINTS[name](rad(degrees)));
  document.getElementById(name).value = degrees;
  document.getElementById(name + "Value").textContent = Math.round(degrees) + "°";
}

const animationQueue = [];

function clearQueue() {
  const kept = animationQueue.filter(step => step.keep);
  animationQueue.length = 0;
  animationQueue.push(...kept);
}

function animate(targets, duration = 0.5) {
  animationQueue.push({ targets, duration, elapsed: 0, start: null });
}

function advanceAnimations(dt) {
  const step = animationQueue[0];
  if (!step) return;
  if (!step.start) step.start = { ...currentAngles };
  step.elapsed += dt;
  const p = step.duration > 0 ? Math.min(step.elapsed / step.duration, 1) : 1;
  const eased = p * p * (3 - 2 * p);
  for (const [name, target] of Object.entries(step.targets)) {
    const start = step.start[name];
    setJoint(name, p === 1 ? target : start + (target - start) * eased);
  }
  step.update?.(p);
  if (p === 1) {
    animationQueue.shift();
    step.done?.();
  }
}

for (const name in JOINTS) {
  setJoint(name, startPose[name]);
  document.getElementById(name).addEventListener("input", e => {
    clearQueue();
    setJoint(name, Number(e.target.value));
  });
}

const GRIPPER_POSES = {
  open:   { fingerPivotLeft: 15,  fingerPivotRight: -15, fingerTipPivotLeft: 0,   fingerTipPivotRight: 0 },
  closed: { fingerPivotLeft: -10, fingerPivotRight: 10,  fingerTipPivotLeft: -15, fingerTipPivotRight: 15 },
};
let gripperOpen = false;
const gripperButton = document.getElementById("gripperButton");

function gripper(open) {
  gripperOpen = open;
  gripperButton.textContent = open ? "Close Gripper" : "Open Gripper";
  return GRIPPER_POSES[open ? "open" : "closed"];
}

const gearHeld = () => nodes.gear.parent === nodes.gripperPivot;

gripperButton.addEventListener("click", () => {
  clearQueue();
  if (gearHeld()) dropGear();
  else animationQueue.push({ targets: gripper(!gripperOpen), duration: 0.5, elapsed: 0, start: null });
});

const ARM_POSES = {
  compressed: { shoulderPivot: -70, elbowPivot: 130, wristPivot: -130 },
  extended:   { shoulderPivot: 0,   elbowPivot: 0,   wristPivot: 0 },
};
document.getElementById("armButton").addEventListener("click", () => {
  clearQueue();
  animationQueue.push({ targets: ARM_POSES.compressed, duration: 1.0, elapsed: 0, start: null });
  animationQueue.push({ targets: ARM_POSES.extended, duration: 1.5, elapsed: 0, start: null });
});

const deg = radians => radians * 180 / Math.PI;
const FLOOR_Y = -1.9;
const GEAR_RADIUS = 0.6 * 1.15;
const GEAR_THICKNESS = 0.6 * 0.3;

function reparent(node, parent) {
  updateFrames(scene, identity());
  node.parent.children.splice(node.parent.children.indexOf(node), 1);
  parent.children.push(node);
  node.joint = node.pose = multiply(rigidInverse(parent.frame), node.frame);
  node.parent = parent;
}

function armPose(d, h) {
  const reach = Math.min(Math.max(Math.hypot(d, h), upperLength - foreLength + 0.01), upperLength + foreLength - 0.01);
  const elbow = -Math.acos((reach * reach - upperLength ** 2 - foreLength ** 2) / (2 * upperLength * foreLength));
  const shoulder = Math.atan2(-d, h) - Math.atan2(foreLength * Math.sin(elbow), upperLength + foreLength * Math.cos(elbow));
  return { shoulderPivot: deg(shoulder), elbowPivot: deg(elbow), wristPivot: -180 - deg(shoulder) - deg(elbow) };
}

const gearButton = document.getElementById("gearButton");

function pickUpGear() {
  updateFrames(scene, identity());
  const m = multiply(rigidInverse(nodes["Gen-Mini"].frame), nodes.gear.frame);
  const [gx, gy, gz] = [m[12], m[13], m[14]];
  const d = Math.hypot(gx, gz);
  const hover = armPose(d, gy + 1.19);
  const grasp = armPose(d, gy + 0.19);
  animationQueue.push({ targets: { basePivot: deg(Math.atan2(-gz, gx)), ...hover, ...gripper(false) }, duration: 1.2, elapsed: 0, start: null });
  animationQueue.push({ targets: grasp, duration: 0.6, elapsed: 0, start: null });
  animationQueue.push({ targets: gripper(true), duration: 0.3, elapsed: 0, start: null, done: () => {
    updateFrames(scene, identity());
    const tip = multiply(rigidInverse(nodes.gear.frame), nodes.fingerTipPivotRight.frame);
    if (Math.hypot(tip[12], tip[14]) > 0.42 || Math.abs(tip[13]) > 0.5) return;
    reparent(nodes.gear, nodes.gripperPivot);
    gearButton.textContent = "Drop Gear";
  } });
  animationQueue.push({ targets: hover, duration: 0.6, elapsed: 0, start: null });
}

function dropGear() {
  animationQueue.push({ targets: gripper(false), duration: 0.3, elapsed: 0, start: null, done: () => {
    reparent(nodes.gear, scene);
    gearButton.textContent = "Pick Up Gear";
    settleGear();
  } });
}

function settleGear() {
  const gear = nodes.gear, m = gear.joint;
  const [sx, sy, sz] = [m[12], m[13], m[14]];
  const [bx, bz] = [nodes["Gen-Mini"].joint[12], nodes["Gen-Mini"].joint[14]];
  const d = Math.hypot(sx - bx, sz - bz);
  updateFrames(scene, identity());
  const base = multiply(rigidInverse(scene.frame), nodes.basePivot.frame);
  const away = d > 1e-3 ? [(sx - bx) / d, (sz - bz) / d] : [base[0], base[2]];
  const [lx, lz] = d < 1.4 ? [bx + away[0] * 1.4, bz + away[1] * 1.4] : [sx, sz];
  const spin = new Float32Array(m);
  spin[12] = spin[13] = spin[14] = 0;
  const axis = m[5] < 0 ? [-m[4], -m[5], -m[6]] : [m[4], m[5], m[6]];
  const tilt = Math.acos(Math.min(axis[1], 1));
  const side = cross(axis, [0, 1, 0]);
  const k = normalize(Math.hypot(...side) > 1e-3 ? side : [m[8], m[9], m[10]]);
  const rest = tau => FLOOR_Y + GEAR_RADIUS * Math.abs(Math.sin(tau)) + GEAR_THICKNESS / 2 * Math.abs(Math.cos(tau));
  const height = Math.max(sy - rest(tilt), 0);
  const wobble = 0.3 * Math.min(height, 1);
  const place = (tau, [x, y, z]) => { gear.joint = gear.pose = multiply(translate(x, y, z), rotateAxis(k, tilt - tau), spin); };
  animationQueue.push({ keep: true, targets: {}, duration: Math.sqrt(height / 5), elapsed: 0, start: null, update: p => place(tilt, [sx + (lx - sx) * p, sy - height * p * p, sz + (lz - sz) * p]) });
  animationQueue.push({ keep: true, targets: {}, duration: 1.5, elapsed: 0, start: null, update: p => {
    const phase = 2 * Math.PI * (2 * p + 5 * p * p);
    const tau = (tilt * Math.cos(phase) + wobble * Math.sin(phase)) * (1 - p) * Math.exp(-3 * p);
    place(tau, [lx, rest(tau), lz]);
  } });
}

gearButton.addEventListener("click", () => {
  clearQueue();
  if (gearHeld()) dropGear();
  else pickUpGear();
});

const materialControls = document.getElementById("materialControls");
const byMaterial = name => Object.values(nodes).filter(node => node.material === name);

const OBJECTS = {
  "Segments": byMaterial("shell"),
  "Joints": byMaterial("joints"),
  "Fingers": byMaterial("aluminum"),
  "Gear": [nodes.gear],
  "Floor": [nodes.floor],
  "Walls": [nodes.backWall, nodes.leftWall],
};

for (const [label, members] of Object.entries(OBJECTS)) {
  const row = document.createElement("div");
  row.className = "control-row";
  row.innerHTML = `<label>${label}:</label><select></select><input type="range" min="1" max="200" step="1"><span></span>`;
  const select = row.querySelector("select"), slider = row.querySelector("input"), value = row.querySelector("span");
  for (const name of Object.keys(materials)) select.add(new Option(name, name));
  const showShininess = alpha => {
    slider.value = alpha;
    value.textContent = alpha;
  };
  const initial = members[0].material;
  select.value = initial;
  showShininess(materials[initial].Alpha);
  select.addEventListener("input", () => {
    const name = select.value === "default" ? initial : select.value;
    for (const node of members) {
      node.material = name;
      delete node.alpha;
    }
    showShininess(materials[name].Alpha);
  });
  slider.addEventListener("input", () => {
    for (const node of members) node.alpha = Number(slider.value);
    value.textContent = slider.value;
  });
  materialControls.appendChild(row);
}

let dragRotX = 0, dragRotY = -0.5;      // mouse drag

let camX = 0, camY = 0, camZ = 15;

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
   camZ -= e.deltaY * 0.01;
   camZ = Math.max(0.1, Math.min(100, camZ));
   },
   { passive: false } 
);

document.addEventListener("keydown", e => {
  if (e.target === vertEditor || e.target === fragEditor) return;  // let the editors use the keys
  const step = 0.2;
  switch (e.key) {
    case "ArrowUp": camY += step; break;
    case "ArrowDown": camY -= step; break;
    case "ArrowLeft": camX -= step; break;
    case "ArrowRight": camX += step; break;
    case "w": camZ -= step; break;
    case "s": camZ += step; break;
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

const SHADINGS = ["flat", "gouraud", "phong"];
const selected = group => document.querySelector(`input[name="${group}"]:checked`).value;

function drawNode(node, view) {
  const m = materials[node.material] ?? materials.default;
  gl.uniform3fv(uniforms["uSpecularColor"], new Float32Array(m.SpecularColor));
  gl.uniform3fv(uniforms["uDiffuseColor"], new Float32Array(m.DiffuseColor));
  gl.uniform3fv(uniforms["uAmbientColor"], new Float32Array(m.AmbientColor));
  gl.uniform1f(uniforms["uKa"], m.Ka);
  gl.uniform1f(uniforms["uKd"], m.Kd);
  gl.uniform1f(uniforms["uKs"], m.Ks);
  gl.uniform1f(uniforms["uAlpha"], node.alpha ?? m.Alpha);

  gl.uniformMatrix4fv(uniforms["uModelView"], false, multiply(view, node.frame, node.shape));
  gl.uniform3fv(uniforms["uColor"], node.color);
  
  gl.bindVertexArray(node.mesh.vao);
  gl.drawElements(gl.TRIANGLES, node.mesh.count, gl.UNSIGNED_SHORT, 0);
}

function updateFrames(root, rootFrame) {
  const stack = [[root, rootFrame]];
  while (stack.length > 0) {
    const [node, parentFrame] = stack.pop();
    node.frame = multiply(parentFrame, node.pose ?? identity());
    for (const child of node.children ?? []) stack.push([child, node.frame]);
  }
}

const lightNodes = Object.values(nodes).filter(node => node.light);

function uploadLights(view) {
  const positions = [], directions = [], colors = [];
  for (const node of lightNodes) {
    const frame = multiply(view, node.frame);
    positions.push(...transformPoint(frame, [0, 0, 0]));
    directions.push(...normalize(transformDirection(frame, node.light.spotDir)));
    colors.push(...node.light.color);
  }
  gl.uniform3fv(uniforms["uLightPos"], new Float32Array(positions));
  gl.uniform3fv(uniforms["uSpotDir"], new Float32Array(directions));
  gl.uniform3fv(uniforms["uLightColor"], new Float32Array(colors));
}

function drawTree(root, view) {
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node.shape) drawNode(node, view);
    for (const child of node.children ?? []) stack.push(child);
  }
}

// Render loop
let lastTime = 0;
function render(time) {
  const t = time / 1000;
  const dt = Math.min(t - lastTime, 0.1);
  if (spinning) spinAngle += t - lastTime;
  lastTime = t;
  advanceAnimations(dt);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const projection = perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 100);
  gl.uniformMatrix4fv(uniforms["uProjection"], false, projection);
  gl.uniform1i(uniforms["uLightType"], selected("lighting") === "spot" ? 1 : 0);

  gl.uniform1f(uniforms["uCutoff"], spotLightTerms["Cutoff"]);
  gl.uniform1f(uniforms["uSpotExponent"], spotLightTerms["SpotExponent"]);

  gl.uniform1i(uniforms["uShading"], SHADINGS.indexOf(selected("shading")));

// Whole-model rotation
  const axisRotation = ROTATE[axisSelect.value](sliderAngle * Math.PI / 180 + spinAngle);
  const rotation = multiply(rotateY(dragRotY), rotateX(dragRotX), axisRotation); 

  scene.pose = rotation;
  camera.pose = translate(camX, camY, camZ);

  updateFrames(root, identity());
  const view = rigidInverse(camera.frame);
  uploadLights(view);
  drawTree(root, view);
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
