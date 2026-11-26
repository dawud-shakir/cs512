const builder = (() => {
  const SNAP = 0.2;
  const PICK = 9;
  const COLORS = {
    background: "#020a1c", grid: "rgba(80, 200, 255, 0.07)",
    field: "rgba(12, 36, 80, 0.5)", fieldEdge: "rgba(80, 200, 255, 0.3)", label: "rgba(159, 230, 255, 0.5)",
    wall: "#39c6ff", hidden: "rgba(57, 198, 255, 0.4)", flipper: "#ffb347", bumper: "#ff4fd8", arrow: "#7dffb0",
    lit: "#ffffff", ball: "#ffffff", selected: "#ffffff", warning: "#ff9f43",
    lane: "rgba(255, 255, 255, 0.35)", drain: "rgba(255, 120, 120, 0.6)",
  };
  const HINTS = {
    none: "Click a part to select it. Shift- or ⌘-click adds more, and shift- or ⌘-drag selects a box. Drag empty space to pan.",
    bumpers: "Drag the bumper to move it. Drag the small handle on its right to change its size.",
    flippers: "Drag the pivot to move the flipper. Drag its tip to set the resting angle.",
    walls: "Drag a corner to move it or a midpoint to bend that piece. Drag the line to move the whole wall. "
      + "Double-click the line to add a corner, or double-click a corner to remove it.",
    arrows: "Drag either end to aim the row, or the arrows to move it. Each arrow boosts more than the one before it.",
    fields: "Drag a corner to resize the field. Drag the marker on the top edge to move the opening to the next field.",
    bottom: "Drag a corner to resize. Drag the flipper pivots to set the drain.",
    launch: "Drag the launcher by its base to move it. Drag the handle at the top of its lane to set how far the lane reaches. "
      + "The ball always launches straight up.",
    play: "Z or ← and / or → flip. Space launches. Click the table to drop the ball there. Esc stops.",
  };
  const FLIPPER_KEYS = { KeyZ: 0, ArrowLeft: 0, Slash: 1, ArrowRight: 1 };
  const NUDGE_KEYS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };

  const el = id => document.getElementById(id);
  const canvas = el("mapCanvas"), ctx = canvas.getContext("2d");
  const view = { x: 10, y: 40, zoom: 10 };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const clone = v => structuredClone(v);
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const nearSegment = (p, a, b) => distance(p, closestOnSegment(p, a, b));

  let map = mapFormat.template("classic"), compiled = null, selected = [], notes = [];
  const single = () => (selected.length === 1 ? selected[0] : null);
  const same = (a, b) => a && b && a.type === b.type && a.index === b.index;
  const isSelected = sel => selected.some(s => same(s, sel));
  const past = [], future = [];
  let drag = null, pending = null, playing = false, lastFrame = 0, hover = null, pointer = null, clipboard = null;

  function toWorld(e) {
    const r = canvas.getBoundingClientRect();
    return [view.x + (e.clientX - r.left - r.width / 2) / view.zoom, view.y - (e.clientY - r.top - r.height / 2) / view.zoom];
  }

  function toScreen(p) {
    return [(p[0] - view.x) * view.zoom + canvas.clientWidth / 2, (view.y - p[1]) * view.zoom + canvas.clientHeight / 2];
  }

  const snapValue = v => (el("snap").checked ? Math.round(Math.round(v / SNAP) * SNAP * 1e6) / 1e6 : v);
  const snapPoint = p => p.map(snapValue);
  const round = (v, step = SNAP) => Math.round(v / step) * step;

  function object(sel = single()) {
    return !sel ? null : sel.type === "launch" ? map.launch : map[sel.type][sel.index];
  }

  function setStatus(message) {
    el("status").textContent = message;
  }

  function setHint() {
    const s = single();
    el("hint").textContent = playing ? HINTS.play
      : selected.length > 1 ? `${selected.length} parts selected. Drag to move them together, Delete removes them, `
        + "shift-click adds or removes one."
      : !s ? HINTS.none
      : s.type === "fields" && s.index === 0 ? HINTS.bottom
      : HINTS[s.type];
  }

  function fitView() {
    const f = map.fields;
    const x0 = Math.min(...f.map(v => v.x0)), x1 = Math.max(...f.map(v => v.x1));
    const y0 = f[0].y0 - 2, y1 = Math.max(...f.map(v => v.y1));
    view.x = (x0 + x1) / 2;
    view.y = (y0 + y1) / 2;
    view.zoom = clamp(Math.min((canvas.clientWidth - 60) / (x1 - x0), (canvas.clientHeight - 90) / (y1 - y0)), 3, 60);
    draw();
  }

  function tidyField(i) {
    const f = map.fields[i], above = map.fields[i + 1], below = map.fields[i - 1];
    if (i === 0) {
      f.x1 = Math.max(f.x1, f.x0 + 11);
      f.y1 = Math.max(f.y1, f.y0 + 14);
      f.drain[0] = clamp(f.drain[0], f.x0 + 1, f.drain[1] - 2);
      f.drain[1] = clamp(f.drain[1], f.drain[0] + 2, f.x1 - 1);
    } else {
      f.y1 = Math.max(f.y1, below.y1 + 12.2);
      f.y0 = clamp(f.y0, below.y1 + 0.2, f.y1 - 12);
      f.x1 = Math.max(f.x1, f.x0 + 2 * mapFormat.GATE_MARGIN);
    }
    if (above) {
      f.y1 = Math.min(f.y1, above.y0 - 0.2);
      f.gate = clamp(f.gate, Math.max(f.x0 + GATE_HALF + 0.4, above.x0 + mapFormat.GATE_MARGIN),
                     Math.min(f.x1 - GATE_HALF - 0.4, above.x1 - mapFormat.GATE_MARGIN));
    }
    f.corner = clamp(f.corner, 0, (f.x1 - f.x0) / 2);
  }

  function handles(sel = single()) {
    const o = object(sel);
    if (!o) return [];
    const h = [], i = sel.index;
    if (sel.type === "bumpers") {
      h.push({ p: [o.c[0] + o.r, o.c[1]], shape: "square", set: q => { o.r = clamp(round(distance(q, o.c), 0.1), 0.4, 4); } });
    } else if (sel.type === "flippers") {
      const tip = [o.pivot[0] + o.side * 3.2 * Math.cos(o.rest), o.pivot[1] + 3.2 * Math.sin(o.rest)];
      h.push({ p: o.pivot, set: q => { o.pivot = q; } });
      h.push({ p: tip, shape: "square", raw: true,
               set: q => {
                 o.rest = clamp(round(Math.atan2(q[1] - o.pivot[1], o.side * (q[0] - o.pivot[0])), Math.PI / 180), -1.2, 1.2);
               } });
    } else if (sel.type === "walls") {
      o.points.forEach((p, k) => h.push({ p, index: k, set: q => { o.points[k] = q; } }));
      for (let k = 0; k + 1 < o.points.length; k++) {
        const a = o.points[k], b = o.points[k + 1], c = distance(a, b);
        if (c < 1e-6) continue;
        const n = [-(b[1] - a[1]) / c, (b[0] - a[0]) / c], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], s = o.bows[k] || 0;
        h.push({ p: [m[0] + n[0] * s, m[1] + n[1] * s], shape: "square", raw: true,
                 set: q => { o.bows[k] = round((q[0] - m[0]) * n[0] + (q[1] - m[1]) * n[1], 0.05); } });
      }
    } else if (sel.type === "arrows") {
      h.push({ p: o.a, set: q => { o.a = q; } }, { p: o.b, set: q => { o.b = q; } });
    } else if (sel.type === "launch") {
      h.push({ p: [o.x, o.y + o.height], shape: "diamond", set: q => { o.height = clamp(round(q[1] - o.y), 3, 80); } });
    } else {
      const corner = (x, y, set) => h.push({ p: [o[x], o[y]], shape: "diamond", set: q => { set(q); tidyField(i); } });
      const left = q => { o.x0 = Math.min(q[0], o.x1 - 11); }, right = q => { o.x1 = Math.max(q[0], o.x0 + 11); };
      const top = q => { o.y1 = q[1]; }, bottom = q => { o.y0 = q[1]; };
      corner("x0", "y1", q => { left(q); top(q); });
      corner("x1", "y1", q => { right(q); top(q); });
      corner("x0", "y0", i ? q => { left(q); bottom(q); } : left);
      corner("x1", "y0", i ? q => { right(q); bottom(q); } : right);
      if (i === 0) {
        h.push({ p: [o.drain[0], o.y0 + FLIPPER_Y], set: q => { o.drain[0] = q[0]; tidyField(i); } });
        h.push({ p: [o.drain[1], o.y0 + FLIPPER_Y], set: q => { o.drain[1] = q[0]; tidyField(i); } });
      }
      if (i + 1 < map.fields.length) h.push({ p: [o.gate, o.y1], shape: "gate", set: q => { o.gate = q[0]; tidyField(i); } });
    }
    return h;
  }

  function centerOf(type, o) {
    if (type === "bumpers") return o.c;
    if (type === "flippers") return o.pivot;
    if (type === "arrows") return [(o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2];
    if (type === "launch") return [o.x, o.y + o.height / 2];
    return o.points.reduce((c, p) => [c[0] + p[0] / o.points.length, c[1] + p[1] / o.points.length], [0, 0]);
  }

  function copy() {
    const items = selected.filter(s => s.type !== "fields" && s.type !== "launch").map(s => ({ type: s.type, item: clone(object(s)) }));
    if (!items.length) return false;
    clipboard = items;
    setStatus(`Copied ${items.length === 1 ? "one part" : `${items.length} parts`}. Paste with ⌘V at the mouse position.`);
    return true;
  }

  function paste() {
    if (!clipboard) return;
    const items = clipboard.map(c => ({ type: c.type, item: clone(c.item) }));
    const centers = items.map(c => centerOf(c.type, c.item)), n = centers.length;
    const c = centers.reduce((acc, q) => [acc[0] + q[0] / n, acc[1] + q[1] / n], [0, 0]);
    const target = pointer ? snapPoint(pointer) : [c[0] + 1, c[1] - 1], d = [target[0] - c[0], target[1] - c[1]];
    edit(() => {
      selected = items.map(({ type, item }) => {
        map[type].push(item);
        const sel = { type, index: map[type].length - 1 };
        move(sel, d);
        return sel;
      });
    });
  }

  function move(sel, d) {
    const o = object(sel), shift = p => [p[0] + d[0], p[1] + d[1]];
    if (sel.type === "bumpers") o.c = shift(o.c);
    if (sel.type === "flippers") o.pivot = shift(o.pivot);
    if (sel.type === "walls") o.points = o.points.map(shift);
    if (sel.type === "arrows") { o.a = shift(o.a); o.b = shift(o.b); }
    if (sel.type === "launch") { o.x += d[0]; o.y += d[1]; }
  }

  function hit(p) {
    const t = PICK / view.zoom, L = map.launch;
    if (Math.abs(p[0] - L.x) < LANE_WIDTH / 2 + t && p[1] >= L.y - t && p[1] <= L.y + 3) return { type: "launch", index: 0 };
    for (const [i, b] of [...map.bumpers.entries()].reverse())
      if (distance(p, b.c) < b.r + t) return { type: "bumpers", index: i };
    for (const [i, f] of [...map.flippers.entries()].reverse()) {
      const tip = [f.pivot[0] + f.side * 3.2 * Math.cos(f.rest), f.pivot[1] + 3.2 * Math.sin(f.rest)];
      if (nearSegment(p, f.pivot, tip) < 0.3 + t) return { type: "flippers", index: i };
    }
    for (const [i, r] of [...map.arrows.entries()].reverse())
      if (nearSegment(p, r.a, r.b) < 0.6 + t) return { type: "arrows", index: i };
    for (const [i, w] of [...map.walls.entries()].reverse())
      if (wallSegment(w, p, t) >= 0) return { type: "walls", index: i };
    for (const [i, f] of [...map.fields.entries()].reverse())
      if (p[0] >= f.x0 && p[0] <= f.x1 && p[1] >= f.y0 && p[1] <= f.y1) return { type: "fields", index: i };
    return null;
  }

  function wallSegment(w, p, t) {
    for (let k = 0; k + 1 < w.points.length; k++) {
      const pts = mapFormat.bowPoints(w.points[k], w.points[k + 1], w.bows[k] || 0);
      for (let j = 0; j + 1 < pts.length; j++) if (nearSegment(p, pts[j], pts[j + 1]) < t) return k;
    }
    return -1;
  }

  function handleAt(p) {
    const reach = PICK / view.zoom, s = single(), o = object(s);
    let best = null;
    for (const h of handles()) if (distance(h.p, p) < reach && (!best || distance(h.p, p) < distance(best.p, p))) best = h;
    if (best && s.type === "bumpers" && distance(p, o.c) < distance(p, best.p)) return null;
    return best;
  }

  function push(before) {
    if (JSON.stringify(before) === JSON.stringify(map)) return;
    past.push(before);
    if (past.length > 200) past.shift();
    future.length = 0;
  }

  function refresh() {
    compiled = mapFormat.install(map);
    draw();
  }

  function commit() {
    refresh();
    notes = mapFormat.check(map, compiled);
    try { localStorage.setItem(mapFormat.DRAFT_KEY, JSON.stringify(map)); } catch {}
    el("undo").disabled = !past.length;
    el("redo").disabled = !future.length;
    el("mapName").value = map.name;
    setStatus(notes.length ? `${notes[0].message}${notes.length > 1 ? ` (${notes.length} warnings)` : ""}` : "Looks good.");
    updatePanel();
    draw();
  }

  function edit(action) {
    if (playing) stopPlay();
    const before = clone(map);
    action();
    push(before);
    commit();
  }

  function select(sel) {
    selected = sel ? [sel] : [];
    updatePanel();
    draw();
  }

  function toggleSelect(sel) {
    if (sel.type === "fields" || sel.type === "launch") return select(sel);
    selected = isSelected(sel) ? selected.filter(s => !same(s, sel)) : [...selected.filter(s => s.type !== "fields"), sel];
    updatePanel();
    draw();
  }

  function selectInside(x0, y0, x1, y1) {
    const within = p => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1;
    selected = [];
    for (const type of ["bumpers", "flippers", "walls", "arrows"])
      map[type].forEach((o, index) => { if (within(centerOf(type, o))) selected.push({ type, index }); });
    updatePanel();
    draw();
  }

  function replace(next, message) {
    edit(() => { map = next; selected = []; });
    fitView();
    setStatus(message);
  }

  function addPart(type) {
    const c = snapPoint([view.x, view.y]);
    const part = {
      bumpers: () => ({ c, r: 1, kick: 18, points: 100 }),
      walls: () => ({ points: [[c[0] - 3, c[1]], [c[0] + 3, c[1]]], bows: [0], hidden: false }),
      flippers: () => ({ pivot: c, side: 1, rest: -0.5, up: 0.45 }),
      arrows: () => ({ a: [c[0], c[1] - 3], b: [c[0], c[1] + 3], count: 4, boost: ARROW_BOOST }),
    }[type]();
    edit(() => { map[type].push(part); selected = [{ type, index: map[type].length - 1 }]; });
  }

  function addField() {
    const below = map.fields.at(-1), gate = (below.x0 + below.x1) / 2;
    edit(() => {
      below.gate = gate;
      map.fields.push({ x0: gate - 7, y0: below.y1 + 1.2, x1: gate + 7, y1: below.y1 + 27.2, corner: 4 });
      tidyField(map.fields.length - 2);
      tidyField(map.fields.length - 1);
      selected = [{ type: "fields", index: map.fields.length - 1 }];
    });
    fitView();
  }

  function removeField(i) {
    if (i === 0) return setStatus("The bottom field can't be removed.");
    const f = map.fields[i], next = map.fields[i + 1], dy = next ? next.y0 - f.y0 : 0;
    const within = p => p[1] >= f.y0 && p[1] <= f.y1, shift = p => (p[1] > f.y1 ? [p[0], p[1] - dy] : p);
    edit(() => {
      for (const type of ["bumpers", "flippers", "walls", "arrows"])
        map[type] = map[type].filter(o => !within(centerOf(type, o)));
      for (const b of map.bumpers) b.c = shift(b.c);
      for (const fl of map.flippers) fl.pivot = shift(fl.pivot);
      for (const w of map.walls) w.points = w.points.map(shift);
      for (const r of map.arrows) { r.a = shift(r.a); r.b = shift(r.b); }
      if (map.launch.y > f.y1) map.launch.y -= dy;
      map.fields.splice(i, 1);
      for (const g of map.fields.slice(i)) { g.y0 -= dy; g.y1 -= dy; }
      if (i < map.fields.length) tidyField(i - 1);
      else delete map.fields[i - 1].gate;
      selected = [];
    });
    fitView();
  }

  function remove() {
    const s = single();
    if (s?.type === "fields") return removeField(s.index);
    if (s?.type === "launch") return setStatus("The launcher can't be removed. Move it instead.");
    if (!selected.length) return;
    const gone = selected;
    edit(() => {
      for (const type of ["bumpers", "flippers", "walls", "arrows"])
        for (const i of gone.filter(g => g.type === type).map(g => g.index).sort((a, b) => b - a)) map[type].splice(i, 1);
      selected = [];
    });
  }

  function undo() {
    if (!past.length) return;
    if (playing) stopPlay();
    future.push(clone(map));
    map = past.pop();
    selected = [];
    commit();
  }

  function redo() {
    if (!future.length) return;
    if (playing) stopPlay();
    past.push(clone(map));
    map = future.pop();
    selected = [];
    commit();
  }

  function startPlay() {
    if (playing) return;
    compiled = mapFormat.install(map);
    newGame();
    game.difficulty = 1 - Number(el("assist").value) / 10;
    playing = true;
    lastFrame = performance.now();
    el("play").textContent = "Stop (Esc)";
    el("play").classList.add("active");
    canvas.focus();
    setHint();
    requestAnimationFrame(frame);
  }

  function stopPlay() {
    playing = false;
    el("play").textContent = "Play (P)";
    el("play").classList.remove("active");
    refresh();
    setHint();
  }

  function frame(now) {
    if (!playing) return;
    const dt = Math.min(1 / 30, (now - lastFrame) / 1000);
    lastFrame = now;
    stepPhysics(dt);
    game.sounds.clear();
    draw();
    requestAnimationFrame(frame);
  }

  function dropBall(p) {
    game.ball.p = [...p];
    game.ball.v = [0, 0];
    game.charging = false;
    game.charge = 0;
    game.state = "play";
    if (game.balls <= 0) game.balls = 3;
  }

  function strokePath(points, color, width, dash = [], glow = 0) {
    ctx.beginPath();
    for (const [i, p] of points.entries()) {
      const s = toScreen(p);
      if (i) ctx.lineTo(s[0], s[1]);
      else ctx.moveTo(s[0], s[1]);
    }
    ctx.setLineDash(dash);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.shadowBlur = glow;
    ctx.shadowColor = color;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.setLineDash([]);
  }

  function circle(p, r, color, width = 2, fill = null, glow = 0) {
    const s = toScreen(p);
    ctx.beginPath();
    ctx.arc(s[0], s[1], Math.max(0, r * view.zoom), 0, Math.PI * 2);
    ctx.shadowBlur = glow;
    ctx.shadowColor = color;
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function drawFlipper(f, color, glow) {
    ctx.lineCap = "round";
    strokePath([f.pivot, flipperTip(f)], color, Math.max(3, 2 * f.radius * view.zoom), [], glow);
    ctx.lineCap = "butt";
    circle(f.pivot, 0.12, COLORS.background, 1, COLORS.background);
  }

  function drawArrow(a, color) {
    const d = a.dir, n = [-d[1], d[0]], s = 0.45;
    const tip = [a.p[0] + d[0] * s, a.p[1] + d[1] * s];
    strokePath([[tip[0] - d[0] * 2 * s + n[0] * s, tip[1] - d[1] * 2 * s + n[1] * s], tip,
                [tip[0] - d[0] * 2 * s - n[0] * s, tip[1] - d[1] * 2 * s - n[1] * s]], color, 2.5, [], 6);
  }

  function drawHandle(h, active) {
    const s = toScreen(h.p), r = active ? 7 : 5.5;
    ctx.beginPath();
    if (h.shape === "square") ctx.rect(s[0] - r, s[1] - r, 2 * r, 2 * r);
    else if (h.shape === "diamond") {
      ctx.moveTo(s[0], s[1] - r - 1);
      ctx.lineTo(s[0] + r + 1, s[1]);
      ctx.lineTo(s[0], s[1] + r + 1);
      ctx.lineTo(s[0] - r - 1, s[1]);
      ctx.closePath();
    } else if (h.shape === "gate") {
      ctx.moveTo(s[0] - r - 2, s[1] - r - 4); ctx.lineTo(s[0] + r + 2, s[1] - r - 4); ctx.lineTo(s[0], s[1] + 2);
      ctx.closePath();
    } else ctx.arc(s[0], s[1], r, 0, Math.PI * 2);
    ctx.fillStyle = active ? COLORS.selected : COLORS.background;
    ctx.fill();
    ctx.strokeStyle = COLORS.selected;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function draw() {
    const w = canvas.clientWidth, h = canvas.clientHeight, dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, w, h);

    const step = view.zoom < 8 ? 5 : 1, left = view.x - w / view.zoom / 2, bottom = view.y - h / view.zoom / 2;
    ctx.beginPath();
    for (let x = Math.floor(left / step) * step; x < left + w / view.zoom; x += step) {
      const s = toScreen([x, 0]);
      ctx.moveTo(s[0], 0);
      ctx.lineTo(s[0], h);
    }
    for (let y = Math.floor(bottom / step) * step; y < bottom + h / view.zoom; y += step) {
      const s = toScreen([0, y]);
      ctx.moveTo(0, s[1]);
      ctx.lineTo(w, s[1]);
    }
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.stroke();

    const flagged = type => new Set(notes.filter(n => n.type === type).map(n => n.index));
    for (const [i, f] of map.fields.entries()) {
      const s = toScreen([f.x0, f.y1]), fw = (f.x1 - f.x0) * view.zoom, fh = (f.y1 - f.y0) * view.zoom;
      ctx.fillStyle = COLORS.field;
      ctx.fillRect(s[0], s[1], fw, fh);
      const picked = isSelected({ type: "fields", index: i });
      ctx.strokeStyle = picked ? COLORS.selected : COLORS.fieldEdge;
      ctx.lineWidth = 1;
      ctx.strokeRect(s[0], s[1], fw, fh);
      ctx.fillStyle = COLORS.label;
      ctx.font = "600 11px monospace";
      ctx.textAlign = "right";
      ctx.fillText(`FIELD ${i + 1}`, s[0] - 8, s[1] + 11);
      const tilt = Object.entries({ up: "↑", down: "↓", right: "→", left: "←" })
        .filter(([k]) => f.tilt[k] > 0).map(([k, glyph]) => `${glyph}${f.tilt[k]}`).join(" ");
      if (tilt) ctx.fillText(`TILT ${tilt}`, s[0] - 8, s[1] + 26);
      ctx.textAlign = "left";
    }
    const f0 = map.fields[0], L = map.launch;
    strokePath([[f0.drain[0], f0.y0 - 1], [f0.drain[1], f0.y0 - 1]], COLORS.drain, 1.5, [4, 4]);
    circle([L.x, L.y + 1], BALL_RADIUS, COLORS.lane, 1.5);

    const visible = table.walls.filter(s => !s.hidden), hidden = table.walls.filter(s => s.hidden);
    ctx.beginPath();
    for (const s of visible) { const a = toScreen(s.a), b = toScreen(s.b); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.strokeStyle = COLORS.wall;
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 10;
    ctx.shadowColor = COLORS.wall;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    for (const s of hidden) { const a = toScreen(s.a), b = toScreen(s.b); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = COLORS.hidden;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);

    for (const a of table.arrows) drawArrow(a, a.lit > 0 ? COLORS.lit : COLORS.arrow);
    const badBumpers = flagged("bumpers");
    table.bumpers.forEach((b, i) => {
      circle(b.c, b.r, b.lit > 0 ? COLORS.lit : COLORS.bumper, 2.5, "rgba(255, 79, 216, 0.18)", 14);
      if (badBumpers.has(i)) circle(b.c, b.r + 0.35, COLORS.warning, 2);
    });
    for (const f of table.flippers) drawFlipper(f, COLORS.flipper, 10);

    if (!playing) {
      for (const s of selected) {
        const o = object(s);
        if (s.type === "bumpers") circle(o.c, o.r, COLORS.selected, 2);
        if (s.type === "flippers") drawFlipper(table.flippers[2 + s.index], COLORS.selected, 0);
        if (s.type === "walls") strokePath(mapFormat.sample(o), COLORS.selected, 2, o.hidden ? [5, 5] : []);
        if (s.type === "arrows") strokePath([o.a, o.b], COLORS.selected, 1, [3, 5]);
        if (s.type === "launch")
          strokePath([[o.x - LANE_WIDTH / 2, o.y], [o.x - LANE_WIDTH / 2, o.y + o.height], [o.x + LANE_WIDTH / 2, o.y + o.height],
                      [o.x + LANE_WIDTH / 2, o.y], [o.x - LANE_WIDTH / 2, o.y]], COLORS.selected, 1.5, [4, 4]);
      }
      for (const h of handles()) drawHandle(h, hover !== null && h.p[0] === hover[0] && h.p[1] === hover[1]);
      if (drag?.kind === "box") {
        const a = toScreen(drag.start), b = toScreen(drag.end);
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = COLORS.selected;
        ctx.lineWidth = 1;
        ctx.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
        ctx.setLineDash([]);
      }
    }

    if (playing) {
      circle(game.ball.p, BALL_RADIUS, COLORS.ball, 2, COLORS.ball, 18);
      ctx.fillStyle = "#9fe6ff";
      ctx.font = "600 15px monospace";
      ctx.shadowBlur = 8;
      ctx.shadowColor = COLORS.wall;
      const text = game.state === "over" ? `GAME OVER   SCORE ${game.score}   SPACE FOR A NEW GAME`
        : `SCORE ${game.score}   BALLS ${game.balls}` + (game.state === "ready" ? "   HOLD SPACE TO LAUNCH" : "");
      ctx.fillText(text, 16, 28);
      ctx.shadowBlur = 0;
    }
  }

  function updatePanel() {
    const host = el("properties"), s = single(), o = object(s);
    host.replaceChildren();
    el("delete").disabled = !selected.length;
    const titles = { bumpers: "Bumper", flippers: "Flipper", walls: "Wall", arrows: "Arrow row", fields: "Field" };
    el("selectionTitle").textContent = selected.length > 1 ? `${selected.length} parts selected`
      : !o ? "Nothing selected" : s.type === "launch" ? "Launcher" : `${titles[s.type]} ${s.index + 1}`;
    setHint();
    if (!o) return;
    function slider(label, key, min, max, step, format = v => v, convert = v => v, back = v => v) {
      const row = document.createElement("label");
      row.className = "prop";
      row.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}"><output></output>`;
      const input = row.querySelector("input"), output = row.querySelector("output");
      const current = () => key.reduce((v, k) => v[k], object(s));
      input.value = back(current());
      output.textContent = format(back(current()));
      let before = null;
      input.addEventListener("input", () => {
        if (playing) stopPlay();
        before ??= clone(map);
        const target = key.slice(0, -1).reduce((v, k) => v[k], object(s));
        target[key.at(-1)] = convert(Number(input.value));
        if (s.type === "fields") tidyField(s.index);
        output.textContent = format(Number(input.value));
        refresh();
      });
      input.addEventListener("change", () => {
        if (before) push(before);
        before = null;
        commit();
      });
      host.append(row);
    }
    function button(label, action) {
      const b = document.createElement("button");
      b.textContent = label;
      b.addEventListener("click", () => { edit(action); b.blur(); });
      host.append(b);
    }
    function check(label, key) {
      const row = document.createElement("label");
      row.className = "prop check";
      row.innerHTML = `<input type="checkbox"><span>${label}</span>`;
      const input = row.querySelector("input");
      input.checked = object(s)[key];
      input.addEventListener("change", () => edit(() => { object(s)[key] = input.checked; }));
      host.append(row);
    }
    const degrees = v => `${Math.round(v)}°`, toRadians = v => v * Math.PI / 180, toDegrees = v => Math.round(v * 180 / Math.PI);
    if (s.type === "bumpers") {
      slider("Size", ["r"], 0.4, 4, 0.1);
      slider("Kick", ["kick"], 0, 40, 1);
      slider("Points", ["points"], 50, 1000, 50);
    } else if (s.type === "flippers") {
      slider("Rest angle", ["rest"], -70, 70, 1, degrees, toRadians, toDegrees);
      slider("Up angle", ["up"], -70, 70, 1, degrees, toRadians, toDegrees);
      button(o.side > 0 ? "Point left instead" : "Point right instead", () => { object(s).side *= -1; });
    } else if (s.type === "walls") {
      check("Invisible in the game", "hidden");
      button("Add a corner", () => {
        const w = object(s), a = w.points.at(-2), b = w.points.at(-1);
        w.points.push(snapPoint([2 * b[0] - a[0], 2 * b[1] - a[1]]));
        w.bows.push(0);
      });
      button("Straighten", () => { object(s).bows.fill(0); });
    } else if (s.type === "arrows") {
      slider("Arrows", ["count"], 2, 12, 1);
      slider("Boost", ["boost"], 0.5, 8, 0.5);
    } else if (s.type === "launch") {
      slider("Lane height", ["height"], 3, 80, 1);
    } else {
      slider("Corner radius", ["corner"], 0, Math.max(1, (o.x1 - o.x0) / 2), 0.5);
      if (s.index + 1 < map.fields.length) slider("Opening", ["gate"], o.x0, o.x1, SNAP, v => v.toFixed(1));
      for (const k of mapFormat.TILT_KEYS) slider(`Tilt ${k}`, ["tilt", k], 0, mapFormat.TILT_STEPS, 1);
    }
  }

  canvas.addEventListener("pointerdown", e => {
    if (e.button !== 0) return;
    e.preventDefault();
    canvas.focus();
    const p = toWorld(e);
    if (playing) return dropBall(p);
    const multi = e.shiftKey || e.metaKey || e.ctrlKey;
    const h = multi ? null : handleAt(p);
    if (h) drag = { kind: "handle", h, before: clone(map), moved: false };
    else {
      const target = hit(p), part = target && target.type !== "fields";
      if (multi) {
        if (part) toggleSelect(target);
        else drag = { kind: "box", start: p, end: p, moved: false };
      } else if (part) {
        if (!isSelected(target)) select(target);
        drag = { kind: "move", before: clone(map), last: snapPoint(p), moved: false };
      } else {
        pending = target;
        drag = { kind: "pan", start: [e.clientX, e.clientY], view: { ...view }, moved: false };
      }
    }
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointermove", e => {
    const p = toWorld(e);
    pointer = p;
    el("coordinates").textContent = `${p[0].toFixed(1)}, ${p[1].toFixed(1)}`;
    if (!drag) {
      const h = playing ? null : handleAt(p), at = h ? h.p : null;
      if (JSON.stringify(at) !== JSON.stringify(hover)) { hover = at; draw(); }
      const under = playing ? null : hit(p);
      canvas.style.cursor = playing ? "crosshair" : h ? "grab" : under && under.type !== "fields" ? "move" : "default";
      return;
    }
    drag.moved = true;
    if (drag.kind === "pan") {
      view.x = drag.view.x - (e.clientX - drag.start[0]) / view.zoom;
      view.y = drag.view.y + (e.clientY - drag.start[1]) / view.zoom;
      draw();
    } else if (drag.kind === "handle") {
      drag.h.set(drag.h.raw ? p : snapPoint(p));
      refresh();
    } else if (drag.kind === "box") {
      drag.end = p;
      draw();
    } else {
      const q = snapPoint(p);
      for (const s of selected) move(s, [q[0] - drag.last[0], q[1] - drag.last[1]]);
      drag.last = q;
      refresh();
    }
  });

  canvas.addEventListener("pointerup", e => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.kind === "pan" && !d.moved) select(pending);
    else if (d.kind === "box")
      selectInside(Math.min(d.start[0], d.end[0]), Math.min(d.start[1], d.end[1]),
                   Math.max(d.start[0], d.end[0]), Math.max(d.start[1], d.end[1]));
    else if (d.kind !== "pan") { push(d.before); commit(); }
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointerleave", () => { pointer = null; });

  canvas.addEventListener("dblclick", e => {
    if (playing || single()?.type !== "walls") return;
    const p = toWorld(e), w = object(), h = handleAt(p);
    if (h && h.index !== undefined && distance(h.p, p) < 6 / view.zoom) {
      if (w.points.length > 2) edit(() => { w.points.splice(h.index, 1); w.bows.splice(Math.max(0, h.index - 1), 1); });
      return;
    }
    const k = wallSegment(w, p, PICK / view.zoom);
    if (k >= 0) edit(() => { w.points.splice(k + 1, 0, snapPoint(p)); w.bows.splice(k, 1, 0, 0); });
  });

  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    const before = toWorld(e);
    view.zoom = clamp(view.zoom * Math.exp(-e.deltaY * 0.0015), 3, 60);
    const after = toWorld(e);
    view.x += before[0] - after[0];
    view.y += before[1] - after[1];
    draw();
  }, { passive: false });

  function onKey(e, down) {
    if (e.target instanceof Element && e.target.closest("input, select, textarea, dialog")) return;
    if (playing) {
      if (e.code in FLIPPER_KEYS) { if (!e.repeat) setFlipper(FLIPPER_KEYS[e.code], down); }
      else if (e.code === "Space") { if (!e.repeat) setPlunger(down); }
      else if (down && (e.code === "Escape" || e.code === "KeyP")) stopPlay();
      else return;
      e.preventDefault();
      return;
    }
    if (!down) return;
    const meta = e.metaKey || e.ctrlKey;
    if (meta && e.code === "KeyZ") { if (e.shiftKey) redo(); else undo(); }
    else if (meta && e.code === "KeyC") copy();
    else if (meta && e.code === "KeyX") { if (copy()) remove(); }
    else if (meta && e.code === "KeyV") paste();
    else if (e.code === "Delete" || e.code === "Backspace") remove();
    else if (e.code === "Escape") select(null);
    else if (e.code === "KeyP") startPlay();
    else if (e.code === "KeyF") fitView();
    else if (e.code in NUDGE_KEYS && selected.some(s => s.type !== "fields")) {
      const step = e.shiftKey ? 1 : SNAP;
      edit(() => { for (const s of selected) if (s.type !== "fields") move(s, NUDGE_KEYS[e.code].map(v => v * step)); });
    } else return;
    e.preventDefault();
  }
  window.addEventListener("keydown", e => onKey(e, true));
  window.addEventListener("keyup", e => onKey(e, false));
  window.addEventListener("blur", () => { if (playing) { setFlipper(0, false); setFlipper(1, false); } });

  for (const b of document.querySelectorAll("[data-add]"))
    b.addEventListener("click", () => { addPart(b.dataset.add); b.blur(); });
  el("addField").addEventListener("click", e => { addField(); e.target.blur(); });
  for (const [id, action] of [["delete", remove], ["undo", undo], ["redo", redo], ["fit", fitView]])
    el(id).addEventListener("click", e => { action(); e.target.blur(); });
  el("play").addEventListener("click", e => {
    if (playing) stopPlay();
    else startPlay();
    e.target.blur();
  });
  el("assist").addEventListener("input", () => {
    el("assistValue").textContent = el("assist").value;
    game.difficulty = 1 - Number(el("assist").value) / 10;
  });
  el("mapName").addEventListener("change", () =>
    edit(() => { map.name = el("mapName").value.trim().slice(0, 60) || "Untitled"; }));
  el("new").addEventListener("click", () => el("newDialog").showModal());
  for (const b of document.querySelectorAll("[data-template]"))
    b.addEventListener("click", () => {
      el("newDialog").close();
      b.blur();
      replace(mapFormat.template(b.dataset.template),
              `Started a new ${b.textContent.toLowerCase()}. Undo brings the old one back.`);
    });
  el("import").addEventListener("click", () => el("file").click());
  el("file").addEventListener("change", async e => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      replace(mapFormat.parse(await file.text()), `Opened ${file.name}. Undo brings the old map back.`);
    } catch (error) {
      setStatus(error.message);
    }
  });
  const fileName = () => `${map.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "map"}.json`;

  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(`Downloaded ${name}. Move it into hw_final/maps to play it.`);
  }

  function handleStore(mode) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("map-builder", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("handles");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result.transaction("handles", mode).objectStore("handles"));
    });
  }

  const readHandle = () => handleStore("readonly").then(store => new Promise((resolve, reject) => {
    const request = store.get("maps");
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  }));

  const storeHandle = handle => handleStore("readwrite").then(store => new Promise((resolve, reject) => {
    const request = store.put(handle, "maps");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  }));

  async function pickFolder() {
    setStatus("Pick the hw_final/maps folder.");
    const folder = await window.showDirectoryPicker({ id: "maps", mode: "readwrite" });
    await storeHandle(folder).catch(() => {});
    setStatus(`Maps are saved in ${folder.name}.`);
    return folder;
  }

  async function mapsFolder() {
    let folder = null;
    const timeout = new Promise(resolve => setTimeout(() => resolve(null), 1500));
    try { folder = await Promise.race([readHandle(), timeout]); } catch {}
    if (folder && (await folder.queryPermission({ mode: "readwrite" })) !== "granted"
        && (await folder.requestPermission({ mode: "readwrite" })) !== "granted") folder = null;
    return folder || pickFolder();
  }

  async function writeFile(folder, name, text) {
    const file = await folder.getFileHandle(name, { create: true });
    const stream = await file.createWritable();
    await stream.write(text);
    await stream.close();
  }

  async function addToIndex(folder, name) {
    let names = [];
    try { names = JSON.parse(await (await (await folder.getFileHandle("index.json")).getFile()).text()); } catch {}
    if (!Array.isArray(names)) names = [];
    if (names.includes(name)) return;
    names.push(name);
    names.sort();
    await writeFile(folder, "index.json", JSON.stringify(names, null, 2) + "\n");
  }

  async function save() {
    const name = fileName(), text = mapFormat.serialize(map);
    if (!window.showDirectoryPicker) return download(name, text);
    try {
      const folder = await mapsFolder();
      await writeFile(folder, name, text);
      await addToIndex(folder, name);
      setStatus(`Saved ${name} in ${folder.name}.`);
    } catch (error) {
      if (error.name === "AbortError") setStatus("Save cancelled.");
      else download(name, text);
    }
  }

  el("export").addEventListener("click", e => { save(); e.target.blur(); });
  el("folder").addEventListener("click", e => {
    e.target.blur();
    if (!window.showDirectoryPicker) return setStatus("This browser can't open folders. Saves go to your downloads.");
    pickFolder().catch(error => setStatus(error.name === "AbortError" ? "Kept the current folder." : error.message));
  });
  el("copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(mapFormat.serialize(map));
      setStatus("Copied the map as JSON.");
    } catch {
      setStatus("Copying isn't allowed here. Use Save instead.");
    }
  });

  let opening = "";
  try {
    const saved = localStorage.getItem(mapFormat.DRAFT_KEY);
    if (saved) { map = mapFormat.parse(saved); opening = "Restored your last draft."; }
  } catch {
    map = mapFormat.template("classic");
  }
  el("mapName").value = map.name;
  new ResizeObserver(() => draw()).observe(el("stage"));
  commit();
  fitView();
  if (opening) setStatus(opening);

  return {
    get map() { return map; },
    get selection() { return selected; },
    get playing() { return playing; },
    view, select, undo, redo, copy, paste, startPlay, stopPlay, fitView,
  };
})();
