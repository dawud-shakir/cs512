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
flat out vec3 vFlatColor; // Flat shading

void main() {
  vec4 p = uModelView * vec4(aPosition, 1.0);
  vec3 n = normalize(transpose(inverse(mat3(uModelView))) * aNormal);
  vPosition = p.xyz;
  vNormal = n;
  vColor = shadeSurface(p.xyz, n, uColor);
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
flat in vec3 vFlatColor;

out vec4 fragColor;

void main() {
  

  vec3 c;
  if (uShading == 0)
    c = vFlatColor;
  else if (uShading == 1)
    c = vColor;
  else
  /********************************************
   * Renormalize because the rasterizer's interpolation can change the normal’s length
   ********************************************/
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

// Uniform locations, refreshed whenever the shader program is recompiled.
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
// gl.clearColor(0, 0, 0, 1);

// Light gray background
gl.clearColor(0.85, 0.86, 0.88, 1);
