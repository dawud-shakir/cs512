// LIGHTING_GLSL is shared by both vertex and fragment shader

const LIGHTING_GLSL = `
const int NUM_LIGHTS = 3;

uniform vec3 uLightPos[NUM_LIGHTS]; // eye space
uniform vec3 uColor;

uniform float uKa;  // how strongly the material reflects ambient light
uniform float uKd;  // matte appearance
uniform float uKs;  // strength of shiny patch
uniform float uAlpha; // sharpness of shiny patch

uniform highp int uShading; // 0-flat, 1-gouraud, 2-phong

uniform vec3 uSpotDir[NUM_LIGHTS];
uniform float uCutoff;
uniform float uSpotExponent;

uniform vec3 uSpecularColor;
uniform vec3 uDiffuseColor;
uniform vec3 uAmbientColor;

uniform vec3 uLightColor;

vec3 calculateLight(vec3 lightPos, vec3 position, vec3 normal, vec3 viewDir, vec3 color) {
    // Diffuse
    vec3 lightDir = normalize(lightPos - position);    // points towards light
    float cosTheta = max(dot(normal, lightDir), 0.0);  // how aligned is the surface normal and light
    vec3 diffuse = uKd * cosTheta * color; 

    // Specular
    float spec = 0.0;
    if (cosTheta > 0.0) 
    { // only when the surface faces the light
      vec3 reflectDir = reflect(-lightDir, normal);
      spec = pow(max(dot(viewDir, reflectDir), 0.0), uAlpha);
    }
    vec3 specular = uKs * spec * vec3(1.0);

    float d = length(lightPos - position);
    float f_att = 1.0/(1.0 + 0.09*d + 0.032*d*d);     // smooth natural fade

    return f_att * (diffuse + specular);
}

vec3 shadeSurface(vec3 position, vec3 normal, vec3 color) {
  vec3 viewDir = normalize(-position);  // camera is at the origin
  
  // Ambient (only computed once, not per light)
  vec3 result = uKa * color;

  for (int i = 0; i < NUM_LIGHTS; ++i) {
    result += calculateLight(uLightPos[i], position, normal, viewDir, color);
  }

  return result;
}

vec3 calculateSpotLight(vec3 position, vec3 normal, vec3 color) {
  vec3 viewDir = normalize(-position);  // camera is at the origin
  
  

  // Ambient (only computed once, not per light)
  vec3 result = uKa * color;

  for (int i = 0; i < NUM_LIGHTS; ++i) {
    vec3 lightToSurface = normalize(position - uLightPos[i]);
    vec3 lightDir = normalize(uLightPos[i] - position);
    float c = dot(lightToSurface, normalize(uSpotDir[i]));
    float spot = (c >= uCutoff) ? pow(c, uSpotExponent) : 0.0;  
  
    result += spot * calculateLight(uLightPos[i], position, normal, viewDir, color);
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

out vec3 vPosition; // Phong
out vec3 vNormal; // Phong
out vec3 vColor; // Gouraud
flat out vec3 vFlatColor; // Flat shading (flat - same for triangle)


void main() {
  vec4 p = uModelView * vec4(aPosition, 1.0);
  vec3 n = normalize(transpose(inverse(mat3(uModelView))) * aNormal);
  vPosition = p.xyz;
  vNormal = n;
  vColor = shadeSurface(p.xyz, n, uColor);
  // vColor = calculateSpotLight(p.xyz, n, uColor);
  vFlatColor = vColor;

  gl_Position = uProjection * p;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
${LIGHTING_GLSL}

in vec3 vPosition;
in vec3 vNormal;
in vec3 vColor; // Gouraud
flat in vec3 vFlatColor; // Flat shading (flat - same for triangle)

out vec4 fragColor;


void main() {
  
  /********************************************
   * Normalize here because the rasterizer's interpolation can change the normal’s length
   ********************************************/
  vec3 c;
  if (uShading == 0) {
    c = vFlatColor;
  } else if (uShading == 1) {
    c = vColor;
  }
  else { c = shadeSurface(vPosition, normalize(vNormal), uColor); }
  // else { c = calculateSpotLight(vPosition, normalize(vNormal), uColor); }

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

let program, uModelView, uProjection, uLightPos, uColor;

let uKa, uKd, uKs, uAlpha; 

let uShading;

let uSpotDir, uCutoff, uSpotExponent;

let uSpecularColor, uDiffuseColor, uAmbientColor, uLightColor;

function updateProgram() {
  try {
    const prog = createProgram(vertEditor.value, fragEditor.value);
    gl.deleteProgram(program);
    program = prog;
    gl.useProgram(program);
    uModelView = gl.getUniformLocation(program, "uModelView");
    uProjection = gl.getUniformLocation(program, "uProjection");
    uLightPos = gl.getUniformLocation(program, "uLightPos[0]");
    uColor = gl.getUniformLocation(program, "uColor");

    uKa = gl.getUniformLocation(program, "uKa");
    uKd = gl.getUniformLocation(program, "uKd");
    uKs = gl.getUniformLocation(program, "uKs");
    uAlpha = gl.getUniformLocation(program, "uAlpha");

    uShading = gl.getUniformLocation(program, "uShading");

    uSpotDir = gl.getUniformLocation(program, "uSpotDir[0]");
    uCutoff = gl.getUniformLocation(program, "uCutoff");
    uSpotExponent = gl.getUniformLocation(program, "uSpotExponent");

    uSpecularColor = gl.getUniformLocation(program, "uSpecularColor");
    uDiffuseColor = gl.getUniformLocation(program, "uDiffuseColor");
    uAmbientColor = gl.getUniformLocation(program, "uAmbientColor");
    uLightColor = gl.getUniformLocation(program, "uLightColor");

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

const cubeMesh = createMesh(createCube());
const cylinderMesh = createMesh(createCylinder(32));
const sphereMesh = createMesh(createSphere(32));
const coneMesh = createMesh(createCone(32));
const tubeMesh = createMesh(createTube(32));
const gearMesh = createMesh(createGear(12 * 16));

gl.enable(gl.DEPTH_TEST);
gl.clearColor(0, 0, 0, 1);
const projection = perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 100);


// const lightWorld = [3, 4, 5];
// const lightWorld = [0, 1, 0];
const light_dist = 4.0; 
const lightsWorld = [
  [light_dist, 0, 0],
  [0, light_dist, 0],
  [0, 0, light_dist],
];

const lightsSpotDir = [];

for (let i = 0; i < 3; ++i) {
  let spherePos = [0, 2, 0];
  spherePos[i] -= lightsWorld;
  // lightsSpotDir.push(normalize(spherePos));
  lightsSpotDir.push(normalize([-1,-1,-1]));
  
}

const lightsTerms = {
  Ka: 0.2, Kd: 0.8, Ks: 0.5, Alpha: 32.0
};

const materials = {
  housing: {
    Ka: 0.1, Kd: 0.75, Ks: 0.25, Alpha: 32.0,
    diffuseColor:  [0.12, 0.13, 0.14],
    specularColor: [1.0, 1.0, 1.0],
  },
  metal: {
    Ka: 0.1, Kd: 0.25, Ks: 0.75, Alpha: 64.0,
    diffuseColor:  [0.55, 0.57, 0.60],
    specularColor: [0.90, 0.92, 0.95],
  },
};

const spotLightTerms = {
  Cutoff: Math.cos(Math.PI / 4), SpotExponent: 0.0,
};



// Interactive controls
let dragRotX = 0, dragRotY = -0.5;      // mouse drag
let camX = 0, camY = 0, camZ = -10;      // arrow keys, w, s
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
   e.preventDefault(); // do not scroll the page instead
   camZ += e.deltaY * 0.01;
   camZ = Math.max(-100, Math.min(-0.1, camZ)); // Keep the camera translation between -100 and -0.1.
   },
   { passive: false } 
);

document.addEventListener("keydown", e => {
  if (e.target === vertEditor || e.target === fragEditor) return;  // let the editors use the keys
  const step = 0.2;
  switch (e.key) {
    case "ArrowUp": camY -= step; break;
    case "ArrowDown": camY += step; break;
    case "ArrowLeft": camX += step; break;
    case "ArrowRight": camX -= step; break;
    case "w": camZ += step; break;
    case "s": camZ -= step; break;
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


document.getElementById("shadingSelect").addEventListener("change", (event) => {
  selectedShading = event.target.selectedIndex;
  console.log("Selected:", selectedShading);
  gl.uniform1i(uShading, selectedShading);
});

// function createNode(mesh=null, color=null, shape=null, joint=identity()) {
//   return { mesh, color, shape, joint, children: [] };
// }


const scene = {
  name: "scene",
  children: [
    {
      name: "floor",
      mesh: cubeMesh,
      color: [0, 0, 0.5],
      shape: multiply(translate(0, -2.5, 0), scale(20, 0.6, 20))
    },
    // {
    //   name: "flat sphere",
    //   mesh: sphereMesh,
    //   color: [1, 1, 1], // white
    //   shape: multiply(translate(0, 2, 0), scale(1, 1, 1))
    // },
    //     {
    //   name: "cone",
    //   mesh: coneMesh,
    //   color: [1, 1, 1], // white
    //   shape: multiply(translate(0, 2, 0), scale(1, 1, 1))
    // },
           {
      name: "tube",
      mesh: tubeMesh,
      // material: "metal",
      color: [1, 1, 1], // white
      shape: multiply(translate(0, 2, 0), scale(1, 1, 1))
    },
    {
      name: "gearPivot0",
      joint: translate(0, 0.5, 0),
      children: [
        {
          name: "gear0",
          mesh: gearMesh,
          color: [1, 0.2, 0.2],
          shape: scale(0.3, 0.6, 0.3)
        },
        {
          name: "link0",
          mesh: cubeMesh,
          color: [0.2, 0.4, 1],
          shape: multiply(translate(0, 1.0, 0), scale(0.2, 0.5, 0.2))
        },
        {
          name: "gearPivot1",
          joint: multiply(translate(0, 1.5, 0), rotateX(Math.PI / 2)),
          children: [
            {
              name: "gear1",
              mesh: gearMesh,
              color: [1, 0.2, 0.2],
              shape: scale(0.3, 0.6, 0.3)
            },
            {
              name: "link1",
              mesh: cubeMesh,
              color: [0.5, 0.4, 1],
              shape: multiply(translate(0, 1.0, 0), scale(0.2, 0.5, 0.2))
            }
          ]
        }
      ]
    }
  ]
};

// Name -> node lookup, built once so the render loop can reach any node
// directly, e.g. nodes.gearPivot1.joint = ...
function indexNodes(node, byName = {}) {
  if (node.name) {
    if (byName[node.name]) console.warn(`duplicate node name: ${node.name}`);
    byName[node.name] = node;
  }
  for (const child of node.children ?? []) indexNodes(child, byName); 
  return byName;
}
const nodes = indexNodes(scene);


function drawNode(node, frame) {
  if (node.material) {
     gl.uniform1f(uKa, materials[node.material].uKa);
     gl.uniform1f(uKd, materials[node.material].uKd);
     gl.uniform1f(uKs, materials[node.material].uKs);
     gl.uniform1f(uAlpha, materials[node.material].uAlpha);

  } else {
    gl.uniform1f(uKa, lightsTerms["Ka"]);
    gl.uniform1f(uKd, lightsTerms["Kd"]);
    gl.uniform1f(uKs, lightsTerms["Ks"]);
    gl.uniform1f(uAlpha, lightsTerms["Alpha"]);
  }
  gl.uniformMatrix4fv(uModelView, false, multiply(frame, node.shape));
  gl.uniform3fv(uColor, node.color);
  
  gl.bindVertexArray(node.mesh.vao);
  gl.drawElements(gl.TRIANGLES, node.mesh.count, gl.UNSIGNED_SHORT, 0);
}

//Data structure
function drawTree(root, rootFrame) {
  const stack = [[root, rootFrame]];
  while (stack.length > 0) {
    const [node, parentFrame] = stack.pop();
    const frame = multiply(parentFrame, node.joint ?? identity());
    if (node.shape) drawNode(node, frame);
    for (const child of node.children ?? []) stack.push([child, frame]);

  }
}

// Render loop
let lastTime = 0;
function render(time) {
  const t = time / 1000;
  if (spinning) spinAngle += t - lastTime;
  lastTime = t;
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Camera moves with the keys; the light stays fixed in the world.
  const view = translate(camX, camY, camZ);
  gl.uniformMatrix4fv(uProjection, false, projection);
 // gl.uniform3fv(uLightPos, transformPoint(view, lightWorld));
 
gl.uniform3fv(uLightPos, new Float32Array(
  lightsWorld.flatMap(p => transformPoint(view, p))
));
gl.uniform3fv(uSpotDir, new Float32Array(lightsSpotDir.flat()));
// gl.uniform1f(uKa, lightsTerms["Ka"]);
// gl.uniform1f(uKd, lightsTerms["Kd"]);
// gl.uniform1f(uKs, lightsTerms["Ks"]);
// gl.uniform1f(uAlpha, lightsTerms["Alpha"]);



gl.uniform1f(uCutoff, spotLightTerms["Cutoff"]);  // cone's half-angle
gl.uniform1f(uSpotExponent, spotLightTerms["SpotExponent"]);

  // Whole-model rotation
  const axisRotation = ROTATE[axisSelect.value](sliderAngle * Math.PI / 180 + spinAngle);
  const rotation = multiply(rotateY(dragRotY), rotateX(dragRotX), axisRotation); 

  scene.joint = rotation;


  nodes.gearPivot1.joint = multiply(nodes.gearPivot1.joint, rotateY(0.5 * Math.sin(t)));
  //   floor.joint = identity();

  // // Lower arm (root)
  // gear0.joint =  multiply(translate(0, -2, 0), rotation, rotateZ(0)); // rotateZ(0.5 * Math.sin(t))

  // // Upper arm (child)
  // link0.joint = multiply(translate(0, 1.2, 0), rotateZ(0)); // rotateZ(Math.sin(1.5 * t))

  // gear1.joint = identity();



  drawTree(scene, view);
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
