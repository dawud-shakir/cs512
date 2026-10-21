// Interactive controls
let dragRotX = 0, dragRotY = -0.5;      // mouse drag

let camX = 0, camY = 0, camZ = -7;

//let camX = 0, camY = 0, camZ = -10;      // arrow keys, w, s
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

const SHADINGS = ["flat", "gouraud", "phong"];
const selected = group => document.querySelector(`input[name="${group}"]:checked`).value;

function drawNode(node, frame) {
  const m = materials[node.material ?? "default"];
  gl.uniform3fv(uniforms["uSpecularColor"], new Float32Array(m.SpecularColor));
  gl.uniform3fv(uniforms["uDiffuseColor"], new Float32Array(m.DiffuseColor));
  gl.uniform3fv(uniforms["uAmbientColor"], new Float32Array(m.AmbientColor));
  gl.uniform1f(uniforms["uKa"], m.Ka);
  gl.uniform1f(uniforms["uKd"], m.Kd);
  gl.uniform1f(uniforms["uKs"], m.Ks);
  gl.uniform1f(uniforms["uAlpha"], m.Alpha);

  gl.uniformMatrix4fv(uniforms["uModelView"], false, multiply(frame, node.shape));
  gl.uniform3fv(uniforms["uColor"], node.color);
  
  gl.bindVertexArray(node.mesh.vao);
  gl.drawElements(gl.TRIANGLES, node.mesh.count, gl.UNSIGNED_SHORT, 0);
}

// Pass 1: compute every node's frame. The root frame is the view matrix, so
// the frames come out in eye space, which is what the shader works in.
function updateFrames(root, rootFrame) {
  const stack = [[root, rootFrame]];
  while (stack.length > 0) {
    const [node, parentFrame] = stack.pop();
    node.frame = multiply(parentFrame, node.pose ?? identity());
    for (const child of node.children ?? []) stack.push([child, node.frame]);
  }
}

// Pass 2: the lights are nodes, so read position and direction from their frames.
const lightNodes = Object.values(nodes).filter(node => node.light);
if (lightNodes.length !== NUM_LIGHTS)
  console.warn(`the scene has ${lightNodes.length} lights but the shader expects ${NUM_LIGHTS}`);

function uploadLights() {
  const positions = [], directions = [], colors = [];
  for (const node of lightNodes) {
    positions.push(...transformPoint(node.frame, [0, 0, 0]));
    directions.push(...normalize(transformDirection(node.frame, node.light.spotDir)));
    colors.push(...node.light.color);
  }
  gl.uniform3fv(uniforms["uLightPos"], new Float32Array(positions));
  gl.uniform3fv(uniforms["uSpotDir"], new Float32Array(directions));
  gl.uniform3fv(uniforms["uLightColor"], new Float32Array(colors));
}

// Pass 3: draw every node that has a mesh.
function drawTree(root) {
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node.shape) drawNode(node, node.frame);
    for (const child of node.children ?? []) stack.push(child);
  }
}

// Render loop
let lastTime = 0;
function render(time) {
  const t = time / 1000;
  const dt = Math.min(t - lastTime, 0.1);   // seconds since last frame, capped after a background tab
  if (spinning) spinAngle += t - lastTime;
  lastTime = t;
  advanceAnimations(dt);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Camera moves with the keys; the lights ride along in the scene graph.
  const view = translate(camX, camY, camZ);
  gl.uniformMatrix4fv(uniforms["uProjection"], false, projection);
  gl.uniform1i(uniforms["uLightType"], selected("lighting") === "spot" ? 1 : 0);

  gl.uniform1f(uniforms["uCutoff"], spotLightTerms["Cutoff"]);  // cone's half-angle
  gl.uniform1f(uniforms["uSpotExponent"], spotLightTerms["SpotExponent"]);

  gl.uniform1i(uniforms["uShading"], SHADINGS.indexOf(selected("shading")));

// Whole-model rotation
  const axisRotation = ROTATE[axisSelect.value](sliderAngle * Math.PI / 180 + spinAngle);
  const rotation = multiply(rotateY(dragRotY), rotateX(dragRotX), axisRotation); 

  scene.pose = rotation;

  updateFrames(scene, view);   // eye-space frame for every node
  uploadLights();
  drawTree(scene);
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
