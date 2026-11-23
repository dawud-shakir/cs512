const FLIPPER_KEYS = {
  ArrowLeft: 0, KeyZ: 0, ShiftLeft: 0,
  ArrowRight: 1, Slash: 1, ShiftRight: 1,
};
const TILT_KEYS = { KeyA: 0, KeyD: 1, KeyS: 2, KeyW: 3 };
const PLUNGER_KEYS = new Set(["Space", "ArrowDown"]);

const SOUNDS = {
  flipper: "sounds/flipper_press.wav",
  launch: "sounds/ball_launch.wav",
  bumper: "sounds/ball_hits_bumper.wav",
  wall: "sounds/ball_hits_wall.wav",
};
const SOUND_GAP = 0.08;
const audio = new AudioContext();
const soundBuffers = {}, lastPlayed = {};
for (const [name, src] of Object.entries(SOUNDS))
  fetch(src).then(r => r.arrayBuffer()).then(data => audio.decodeAudioData(data))
    .then(buffer => { soundBuffers[name] = buffer; });

function playSound(name) {
  if (!soundBuffers[name] || audio.currentTime - (lastPlayed[name] ?? -SOUND_GAP) < SOUND_GAP) return;
  lastPlayed[name] = audio.currentTime;
  const source = audio.createBufferSource();
  source.buffer = soundBuffers[name];
  source.connect(audio.destination);
  source.start();
}

const heldKeys = new Set();
function hasHeldKey(predicate) {
  for (const k of heldKeys) if (predicate(k)) return true;
  return false;
}

function startAudio() {
  if (!help.open) audio.resume();
}
for (const type of ["keydown", "pointerdown"]) window.addEventListener(type, startAudio, true);

const help = document.getElementById("help");
function toggleHelp() {
  if (help.open) help.close();
  else { help.showModal(); audio.suspend(); }
}
help.addEventListener("close", startAudio);
document.getElementById("helpBtn").addEventListener("click", toggleHelp);

function onKey(e, down) {
  if (down) setTouchMode(false);
  if (e.repeat) return;
  if (down) heldKeys.add(e.code);
  else heldKeys.delete(e.code);
  if (e.code === "KeyH" || (e.code === "Escape" && help.open)) { if (down) toggleHelp(); }
  else if (down && help.open) return;
  else if (e.code in FLIPPER_KEYS) {
    const side = FLIPPER_KEYS[e.code];
    setFlipper(side, hasHeldKey(k => FLIPPER_KEYS[k] === side));
  } else if (e.code in TILT_KEYS) {
    const dir = TILT_KEYS[e.code];
    setTilt(dir, hasHeldKey(k => TILT_KEYS[k] === dir));
  } else if (PLUNGER_KEYS.has(e.code)) {
    const held = hasHeldKey(k => PLUNGER_KEYS.has(k));
    if (down || !held) setPlunger(held);
  } else if (e.code === "KeyC") {
    if (down) toggleCamera();
  } else if (typeof devTools === "undefined" || !devTools.handleKey(e.code, down)) return;
  e.preventDefault();
}
window.addEventListener("keydown", e => onKey(e, true));
window.addEventListener("keyup", e => onKey(e, false));

function releaseAllInputs() {
  if (heldKeys.size === 0) return;
  heldKeys.clear();
  setFlipper(0, false);
  setFlipper(1, false);
  for (let i = 0; i < 4; i++) setTilt(i, false);
  if (game.charging) {
    game.charging = false;
    game.charge = 0;
  }
}
window.addEventListener("blur", releaseAllInputs);
document.addEventListener("visibilitychange", () => { if (document.hidden) releaseAllInputs(); });

function holdControl(el, onChange) {
  const fingers = new Set();
  el.addEventListener("pointerdown", e => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    if (fingers.size === 0) { onChange(true); el.classList.add("down"); }
    fingers.add(e.pointerId);
  });
  const release = e => {
    if (!fingers.delete(e.pointerId) || fingers.size > 0) return;
    onChange(false);
    el.classList.remove("down");
  };
  el.addEventListener("pointerup", release);
  el.addEventListener("pointercancel", release);
}

const flipperControl = i => down => {
  setFlipper(i, down);
  if (down) navigator.vibrate?.(8);
};
holdControl(document.getElementById("touchLeft"), flipperControl(0));
holdControl(document.getElementById("touchRight"), flipperControl(1));
holdControl(document.getElementById("touchLaunch"), setPlunger);

window.addEventListener("pointerdown", e => { if (e.pointerType === "touch") setTouchMode(true); }, true);
window.addEventListener("contextmenu", e => e.preventDefault());

const CAMERAS = [
  { name: "Ball Cam", ballCam: true, yaw: 0, pitch: 0, zoom: 1 },
  { name: "Table Cam", ballCam: false, yaw: 0, pitch: 0, zoom: 1 },
  { name: "Corner Cam", ballCam: false, yaw: -5.42, pitch: -0.328, zoom: 1.98 },
];
let cameraIndex = 0;
const cameraBtn = document.getElementById("cameraBtn");
function setCamera(i) {
  cameraIndex = i;
  orbitYaw = CAMERAS[i].yaw;
  orbitPitch = CAMERAS[i].pitch;
  zoom = CAMERAS[i].zoom;
  cameraBtn.textContent = `${CAMERAS[(i + 1) % CAMERAS.length].name} (C)`;
}
function toggleCamera() {
  setCamera((cameraIndex + 1) % CAMERAS.length);
}
cameraBtn.addEventListener("click", toggleCamera);

const difficultySlider = document.getElementById("difficultySlider");
const difficultyValue = document.getElementById("difficultyValue");
function setDifficulty() {
  game.difficulty = difficultySlider.value / 10;
  difficultyValue.textContent = difficultySlider.value;
}
difficultySlider.addEventListener("input", setDifficulty);
difficultySlider.addEventListener("change", () => difficultySlider.blur());
setDifficulty();

let zoom = 1;
window.addEventListener("wheel", e => {
  if (help.open) return;
  e.preventDefault();
  zoom = Math.min(4, Math.max(0.5, zoom * Math.exp(-e.deltaY * 0.002)));
}, { passive: false });

canvas.addEventListener("pointerdown", e => canvas.setPointerCapture(e.pointerId));
canvas.addEventListener("pointermove", e => {
  if (canvas.hasPointerCapture(e.pointerId)) orbitCamera(e.movementX, e.movementY);
});
canvas.addEventListener("dblclick", () => setCamera(cameraIndex));

let screenInsets = { top: 0, bottom: 0 };

function measureInsets() {
  const rects = [...document.querySelectorAll("#hud, .setting, #helpBtn, #cameraBtn, .pad, #touchLaunch")]
    .map(el => el.getBoundingClientRect()).filter(r => r.height > 0);
  const h = window.innerHeight;
  const padsBeside = document.body.classList.contains("touch") && window.innerWidth > h;
  screenInsets = {
    top: Math.max(0, ...rects.filter(r => r.top < h / 2).map(r => r.bottom)),
    bottom: padsBeside ? 0 : Math.max(0, ...rects.filter(r => r.top >= h / 2).map(r => h - r.top)),
  };
}
window.addEventListener("resize", measureInsets);

const escherControls = document.getElementById("escherControls");

function setTouchMode(on) {
  if (document.body.classList.contains("touch") === on) return;
  document.body.classList.toggle("touch", on);
  if (escherControls) escherControls.open = !on;
  measureInsets();
}

const hud = document.getElementById("hud");
function updateHud() {
  const touch = document.body.classList.contains("touch");
  const status = game.state === "over" ? (touch ? "GAME OVER - tap LAUNCH" : "GAME OVER - press Space")
    : game.state === "ready" ? (touch ? "Hold LAUNCH" : "Hold Space to launch") : "";
  hud.textContent = `Score ${game.score}   Balls ${game.balls}   Level ${game.field + 1}   ${status}`;
}

document.body.classList.toggle("touch", matchMedia("(pointer: coarse)").matches);
if (escherControls) escherControls.open = !document.body.classList.contains("touch");
newGame();
updateHud();
measureInsets();

let last;
function frame(now) {
  const dt = Math.max(0, Math.min((now - last) / 1000, 1 / 30));
  last = now;
  const hasDev = typeof devTools !== "undefined";
  const simDt = hasDev ? devTools.stepDt(dt) : dt;
  if (!help.open) stepPhysics(simDt);
  for (const name of game.sounds) playSound(name);
  game.sounds.clear();
  render(dt, screenInsets, CAMERAS[cameraIndex].ballCam, zoom, hasDev ? devTools.renderOptions(simDt) : undefined);
  updateHud();
  if (hasDev) devTools.updateStats(dt, zoom);
  requestAnimationFrame(frame);
}
requestAnimationFrame(now => { last = now; requestAnimationFrame(frame); });
