// ---- Joint control ----------------------------------------------------------
// Each joint turns about its own axis. Angles are absolute degrees: the scene's
// joint transforms are pure translations, so a slider reads the actual angle.
const JOINTS = {
  basePivot: rotateY,
  shoulderPivot: rotateZ,
  elbowPivot: rotateZ,
  wristPivot: rotateZ,
  gripperPivot: rotateY,
  "fingerPivot_-1": rotateZ,
  fingerPivot_1: rotateZ,
  "fingerTipPivot_-1": rotateZ,
  fingerTipPivot_1: rotateZ,
};

// Degrees per joint. This is the source of truth: sliders snap to their step,
// so they cannot hold the fractional angles an animation passes through.
const currentAngles = {};

function setJoint(name, degrees) {
  currentAngles[name] = degrees;
  nodes[name].pose = multiply(nodes[name].joint, JOINTS[name](rad(degrees)));
  document.getElementById(name).value = degrees;                            // display only
  document.getElementById(name + "Value").textContent = Math.round(degrees) + "°";
}

// ---- Animation --------------------------------------------------------------
// A queue of keyframe steps. Each step interpolates every joint it lists from
// where that joint was when the step began to its target, over `duration`
// seconds with smoothstep easing. All joints in a step start and arrive together.
//   animate({ basePivot: -5 });                          // half a second
//   animate({ shoulderPivot: 40, elbowPivot: 20 }, 2);   // runs after the first step finishes
const animationQueue = [];

function animate(targets, duration = 0.5) {
  animationQueue.push({ targets, duration, elapsed: 0, start: null });
}

// Called once per frame with the elapsed time in seconds.
function advanceAnimations(dt) {
  const step = animationQueue[0];
  if (!step) return;
  if (!step.start) step.start = { ...currentAngles };          // capture where we are on the first frame
  step.elapsed += dt;
  const p = step.duration > 0 ? Math.min(step.elapsed / step.duration, 1) : 1;
  const eased = p * p * (3 - 2 * p);                           // smoothstep: ease in, ease out
  for (const [name, target] of Object.entries(step.targets)) {
    const start = step.start[name];
    setJoint(name, p === 1 ? target : start + (target - start) * eased);
  }
  if (p === 1) animationQueue.shift();
}

// Sliders: start at the rest pose, then follow the user.
for (const name in JOINTS) {
  setJoint(name, restPose[name]);
  document.getElementById(name).addEventListener("input", e => {
    animationQueue.length = 0;            // grabbing a slider cancels scripted motion
    setJoint(name, Number(e.target.value));
  });
}

// Gripper open/close button.
const GRIPPER_POSES = {
  open:   { "fingerPivot_-1": 15,  fingerPivot_1: -15, "fingerTipPivot_-1": 0,   fingerTipPivot_1: 0 },
  closed: { "fingerPivot_-1": -10, fingerPivot_1: 10,  "fingerTipPivot_-1": -15, fingerTipPivot_1: 15 },
};
let gripperOpen = false;
const gripperButton = document.getElementById("gripperButton");
gripperButton.addEventListener("click", () => {
  gripperOpen = !gripperOpen;
  animationQueue.length = 0;              // start from wherever the fingers are right now
  animate(GRIPPER_POSES[gripperOpen ? "open" : "closed"]);
  gripperButton.textContent = gripperOpen ? "Close Gripper" : "Open Gripper";
});

// Arm button: fold the arm up over the base, then unfold it straight up.
const ARM_POSES = {
  compressed: { shoulderPivot: -70, elbowPivot: 130, wristPivot: -130 },   // Z-fold
  extended:   { shoulderPivot: 0,   elbowPivot: 0,   wristPivot: 0 },      // every link vertical
};
document.getElementById("armButton").addEventListener("click", () => {
  animationQueue.length = 0;
  animate(ARM_POSES.compressed, 1.0);
  animate(ARM_POSES.extended, 1.5);
});
