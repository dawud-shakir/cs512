const devTools = (() => {
  const DROP_POINTS = [[9.2, 29], [9.2, 60.8], [9.2, 72]];
  const state = {
    open: false,
    speed: 0.35,
    paused: false,
    stepPending: false,
    bloom: true,
    trail: true,
    shadows: true,
    palette: -1,
    mirror: 0.3,
    floor: PLAIN_FLOOR,
  };

  const style = document.createElement("style");
  style.textContent = `
    #devBtn {
      position: fixed; top: calc(max(12px, env(safe-area-inset-top)) + 118px); right: 136px; z-index: 10;
      padding: 5px 14px; font: 600 13px system-ui, sans-serif; color: #9fe6ff; cursor: pointer;
      text-shadow: 0 0 6px #39c6ff; touch-action: manipulation;
      background: rgba(2, 10, 26, 0.85); border: 1px solid rgba(80, 200, 255, 0.6); border-radius: 20px;
      box-shadow: 0 0 10px rgba(40, 160, 255, 0.45), inset 0 0 8px rgba(40, 160, 255, 0.25);
    }
    #devPanel {
      display: none; position: fixed; top: calc(max(12px, env(safe-area-inset-top)) + 154px); right: 16px;
      z-index: 10; width: 252px; padding: 10px 12px; border-radius: 14px; box-sizing: border-box;
      font: 600 12px system-ui, sans-serif; color: #dff6ff;
      background: rgba(2, 10, 26, 0.92); border: 1px solid rgba(80, 200, 255, 0.55);
      box-shadow: 0 0 16px rgba(20, 120, 255, 0.35), inset 0 0 10px rgba(40, 160, 255, 0.18);
    }
    #devPanel.open { display: flex; flex-direction: column; gap: 8px; }
    .dev-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
    .dev-row input[type="range"] { flex: 1; accent-color: #39c6ff; touch-action: auto; }
    .dev-row output { min-width: 3.1em; text-align: right; font-family: monospace; color: #9fe6ff; }
    .dev-btns { display: flex; gap: 5px; flex-wrap: wrap; }
    .dev-btns button {
      flex: 1; min-width: 44px; padding: 4px 6px; font: 600 11px system-ui, sans-serif;
      color: #dff6ff; cursor: pointer; touch-action: manipulation; background: rgba(12, 28, 56, 0.9);
      border: 1px solid rgba(80, 200, 255, 0.45); border-radius: 8px;
    }
    .dev-btns button.active { background: #39c6ff; color: #02060f; border-color: #39c6ff; }
    .dev-swatches { display: flex; gap: 6px; }
    .dev-swatches button {
      width: 48px; height: 30px; padding: 0; cursor: pointer; touch-action: manipulation; opacity: 0.55;
      background: center / cover; border: 1px solid rgba(80, 200, 255, 0.3); border-radius: 6px;
    }
    .dev-swatches button.active { opacity: 1; border-color: #9fe6ff; box-shadow: 0 0 8px #39c6ff; }
    .dev-checks { display: flex; gap: 10px; flex-wrap: wrap; font-size: 12px; color: #a9d6f0; }
    .dev-checks label { display: flex; align-items: center; gap: 4px; cursor: pointer; }
    .dev-checks input { accent-color: #39c6ff; margin: 0; }
    #devStats {
      font: 500 11px/1.4 monospace; color: #9fe6ff; white-space: pre;
      padding-top: 6px; border-top: 1px solid rgba(80, 200, 255, 0.25);
    }
  `;
  document.head.appendChild(style);

  const btn = document.createElement("button");
  btn.id = "devBtn";
  btn.textContent = "🛠 Dev (`)";

  const panel = document.createElement("div");
  panel.id = "devPanel";
  panel.innerHTML = `
    <div class="dev-row">
      <span>Floor</span>
      <div class="dev-swatches" id="devFloors">
        <button title="Circuit (F)" style="background-image: url(textures/thumbs/circuit.png)"></button>
        <button title="Conformal (F)" style="background-image: url(textures/thumbs/conformal.png)"></button>
        <button class="active" title="Plain (F)" style="background-image: url(textures/thumbs/plain.png)"></button>
      </div>
    </div>
    <div class="dev-row">
      <span>Mirror</span>
      <input id="devMirror" type="range" min="0" max="1" step="0.1" value="0.3">
      <output id="devMirrorValue">0.3</output>
    </div>
    <div class="dev-row">
      <span>Speed</span>
      <input id="devSpeed" type="range" min="0.05" max="2" step="0.05" value="0.35">
      <output id="devSpeedValue">0.35x</output>
    </div>
    <div class="dev-btns">
      <button id="devPause">Pause (P)</button>
      <button id="devStep">+1 Frame</button>
      <button id="devSpeedReset">1x</button>
    </div>
    <div class="dev-btns">
      <button data-drop="0">L1</button>
      <button data-drop="1">L2</button>
      <button data-drop="2">L3</button>
      <button data-drop="plunger">Plunger</button>
    </div>
    <div class="dev-btns" id="devPalettes">
      <button data-palette="-1" class="active">Auto</button>
      <button data-palette="0">Blue</button>
      <button data-palette="1">Pink</button>
      <button data-palette="2">Amber</button>
    </div>
    <div class="dev-checks">
      <label><input id="devBloom" type="checkbox" checked> Bloom</label>
      <label><input id="devTrail" type="checkbox" checked> Trail</label>
      <label><input id="devShadows" type="checkbox" checked> Shadows</label>
    </div>
    <div id="devStats"></div>
  `;

  document.body.append(btn, panel);

  const speedInput = panel.querySelector("#devSpeed");
  const speedOutput = panel.querySelector("#devSpeedValue");
  const pauseBtn = panel.querySelector("#devPause");
  const statsEl = panel.querySelector("#devStats");
  const paletteBtns = [...panel.querySelectorAll("#devPalettes button")];
  const floorBtns = [...panel.querySelectorAll("#devFloors button")];
  const mirrorInput = panel.querySelector("#devMirror");
  const mirrorOutput = panel.querySelector("#devMirrorValue");

  function setFloor(i) {
    state.floor = i;
    floorBtns.forEach((b, k) => b.classList.toggle("active", k === i));
  }

  function setMirror(v) {
    state.mirror = Number(v);
    mirrorOutput.textContent = state.mirror.toFixed(1);
  }

  function toggle(force) {
    state.open = typeof force === "boolean" ? force : !state.open;
    panel.classList.toggle("open", state.open);
    btn.blur();
  }

  function setSpeed(v) {
    state.speed = Math.min(2, Math.max(0.05, Number(v) || 1));
    speedInput.value = String(state.speed);
    speedOutput.textContent = `${state.speed.toFixed(2)}x`;
  }

  function setPaused(p) {
    state.paused = Boolean(p);
    pauseBtn.textContent = state.paused ? "Resume (P)" : "Pause (P)";
    pauseBtn.classList.toggle("active", state.paused);
  }

  function teleport(target) {
    if (game.balls <= 0) game.balls = 3;
    if (target === "plunger") {
      resetBall();
    } else {
      const i = Number(target);
      game.ball.p = [...DROP_POINTS[i]];
      game.ball.v = [0, 0];
      game.ball.rotation = identity();
      game.charging = false;
      game.charge = 0;
      game.field = i;
      game.state = "play";
    }
    if (typeof trail !== "undefined") trail.length = 0;
    if (typeof chaseEye !== "undefined") chaseEye = null;
    if (typeof chaseTarget !== "undefined") chaseTarget = null;
  }

  btn.addEventListener("click", () => toggle());
  floorBtns.forEach((b, i) => b.addEventListener("click", () => { setFloor(i); b.blur(); }));
  mirrorInput.addEventListener("input", () => setMirror(mirrorInput.value));
  mirrorInput.addEventListener("change", () => mirrorInput.blur());
  speedInput.addEventListener("input", () => setSpeed(speedInput.value));
  speedInput.addEventListener("change", () => speedInput.blur());
  panel.querySelector("#devSpeedReset").addEventListener("click", e => { setSpeed(1); e.target.blur(); });
  pauseBtn.addEventListener("click", e => { setPaused(!state.paused); e.target.blur(); });
  panel.querySelector("#devStep").addEventListener("click", e => {
    if (!state.paused) setPaused(true);
    state.stepPending = true;
    e.target.blur();
  });

  for (const dropBtn of panel.querySelectorAll("[data-drop]")) {
    dropBtn.addEventListener("click", () => {
      teleport(dropBtn.dataset.drop);
      dropBtn.blur();
    });
  }

  for (const pBtn of paletteBtns) {
    pBtn.addEventListener("click", () => {
      state.palette = Number(pBtn.dataset.palette);
      for (const b of paletteBtns) b.classList.toggle("active", b === pBtn);
      pBtn.blur();
    });
  }

  for (const [id, key] of [["devBloom", "bloom"], ["devTrail", "trail"], ["devShadows", "shadows"]]) {
    const el = panel.querySelector(`#${id}`);
    el.addEventListener("change", () => { state[key] = el.checked; el.blur(); });
  }

  let fps = 60;

  return {
    state,
    toggle,
    setSpeed,
    setPaused,
    teleport,
    handleKey(code, down) {
      if (code === "Backquote") {
        if (down) toggle();
        return true;
      }
      if (code === "KeyF") {
        if (down) setFloor((state.floor + 1) % floorBtns.length);
        return true;
      }
      if (code === "KeyP" && (state.open || state.paused)) {
        if (down) setPaused(!state.paused);
        return true;
      }
      return false;
    },
    stepDt(dt) {
      if (!state.paused) return dt * state.speed;
      if (state.stepPending) {
        state.stepPending = false;
        return 1 / 60;
      }
      return 0;
    },
    renderOptions(simDt) {
      return {
        bloom: state.bloom,
        trail: state.trail,
        shadows: state.shadows,
        palette: state.palette,
        mirror: state.mirror,
        floor: state.floor,
        simDt,
      };
    },
    updateStats(dt, zoom) {
      if (!state.open) return;
      if (dt > 0) fps = fps * 0.9 + (1 / dt) * 0.1;
      const [x, y] = game.ball.p, [vx, vy] = game.ball.v;
      statsEl.textContent =
        `FPS ${fps.toFixed(0).padStart(3)}   Field ${game.field + 1}   ${state.paused ? "PAUSED" : `${state.speed.toFixed(2)}x`}\n` +
        `Ball (${x.toFixed(2)}, ${y.toFixed(2)})  |v| ${Math.hypot(vx, vy).toFixed(1)}\n` +
        `Cam  y:${orbitYaw.toFixed(2)} p:${orbitPitch.toFixed(2)} z:${zoom.toFixed(2)}`;
    },
  };
})();
