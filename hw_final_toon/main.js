const FLIPPER_KEYS = {
  ArrowLeft: 0, KeyZ: 0, ShiftLeft: 0,
  ArrowRight: 1, Slash: 1, ShiftRight: 1,
};
const TILT_KEYS = { KeyA: 0, KeyD: 1, KeyS: 2, KeyW: 3 };
const PLUNGER_KEYS = new Set(["Space", "ArrowDown"]);

const CAP_FOR = { ShiftLeft: "KeyZ", ShiftRight: "Slash", ArrowDown: "Space" };
function showKey(code, down) {
  const cap = document.querySelector(`kbd[data-code="${CAP_FOR[code] ?? code}"]`);
  if (cap) cap.classList.toggle("down", down);
}

function onKey(e, down) {
  if (down) setTouchMode(false);
  if (e.repeat) return;
  showKey(e.code, down);
  if (e.code in FLIPPER_KEYS) setFlipper(FLIPPER_KEYS[e.code], down);
  else if (e.code in TILT_KEYS) setTilt(TILT_KEYS[e.code], down);
  else if (PLUNGER_KEYS.has(e.code)) setPlunger(down);
  else if (e.code === "KeyC") { if (down) toggleCamera(); }
  else return;
  e.preventDefault();
}
window.addEventListener("keydown", e => onKey(e, true));
window.addEventListener("keyup", e => onKey(e, false));

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

let ballCam = false;
const cameraBtn = document.getElementById("cameraBtn");
function toggleCamera() {
  ballCam = !ballCam;
  cameraBtn.textContent = ballCam ? "🎥 Table Cam (C)" : "🎥 Ball Cam (C)";
}
cameraBtn.addEventListener("click", toggleCamera);

let zoom = 1;
window.addEventListener("wheel", e => {
  e.preventDefault();
  zoom = Math.min(4, Math.max(0.5, zoom * Math.exp(-e.deltaY * 0.002)));
}, { passive: false });

let screenInsets = { top: 0, bottom: 0 };

function measureInsets() {
  const rects = [...document.querySelectorAll("#hud, #controls, .pad, #touchLaunch")]
    .map(el => el.getBoundingClientRect()).filter(r => r.height > 0);
  const h = window.innerHeight;
  const padsBeside = document.body.classList.contains("touch") && window.innerWidth > h;
  screenInsets = {
    top: Math.max(0, ...rects.filter(r => r.top < h / 2).map(r => r.bottom)),
    bottom: padsBeside ? 0 : Math.max(0, ...rects.filter(r => r.top >= h / 2).map(r => h - r.top)),
  };
}
window.addEventListener("resize", measureInsets);

function setTouchMode(on) {
  if (document.body.classList.contains("touch") === on) return;
  document.body.classList.toggle("touch", on);
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
newGame();
updateHud();
measureInsets();

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 1 / 30);
  last = now;
  stepPhysics(dt);
  render(screenInsets, ballCam, zoom);
  updateHud();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
