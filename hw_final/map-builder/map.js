const mapFormat = (() => {
  const VERSION = 2;
  const BOTTOM_X1 = 20;
  const WALL_SPACING = 0.5;
  const GATE_MARGIN = GATE_HALF + 3.1 + 0.3;
  const TILT_STEPS = 20;
  const TILT_KEYS = ["up", "down", "right", "left"];
  const noTilt = () => ({ up: 0, down: 0, right: 0, left: 0 });
  const tiltVector = t => [t.right - t.left, t.up - t.down].map(v => v * TILT_MAX / TILT_STEPS);
  const DRAFT_KEY = "pinball-map-builder:draft";

  const finite = v => typeof v === "number" && Number.isFinite(v);
  const point = v => Array.isArray(v) && v.length === 2 && v.every(finite);
  const inside = (p, f) => p[0] >= f.x0 && p[0] <= f.x1 && p[1] >= f.y0 && p[1] <= f.y1;

  const TEMPLATES = {
    classic: () => ({
      version: VERSION,
      name: "Classic",
      fields: [
        { x0: 0, y0: 0, x1: BOTTOM_X1, y1: 36, corner: 4, gate: 9.2, drain: [5.4, 13], tilt: noTilt() },
        { x0: 2.2, y0: 37.2, x1: 16.2, y1: 63, corner: 4, gate: 9.2, tilt: noTilt() },
        { x0: 2.2, y0: 64.2, x1: 16.2, y1: 80, corner: 7, tilt: noTilt() },
      ],
      launch: { x: BOTTOM_X1 - LANE_WIDTH / 2, y: 0, height: 28 },
      walls: [],
      bumpers: [
        { c: [6, 24], r: 1.2, kick: 18, points: 100 },
        { c: [12.4, 24], r: 1.2, kick: 18, points: 100 },
        { c: [9.2, 19], r: 1.2, kick: 18, points: 100 },
        { c: [5.6, 51], r: 1.0, kick: 18, points: 200 },
        { c: [12.8, 51], r: 1.0, kick: 18, points: 200 },
        { c: [6.2, 75.5], r: 1.0, kick: 18, points: 500 },
        { c: [12.2, 75.5], r: 1.0, kick: 18, points: 500 },
        { c: [9.2, 77.5], r: 1.0, kick: 18, points: 500 },
      ],
      flippers: [{ pivot: [0.6, 24], side: 1, rest: -0.3, up: 0.2 }],
      arrows: [
        { a: [19.2, 3.01], b: [19.2, 26.41], count: 10, boost: LANE_BOOST },
        { a: [13.59, 33.2], b: [7.59, 33.2], count: 4, boost: ARROW_BOOST },
        { a: [9.2, 47.52], b: [9.2, 59.52], count: 7, boost: ARROW_BOOST },
      ],
    }),
    empty: () => ({
      version: VERSION,
      name: "New table",
      fields: [{ x0: 0, y0: 0, x1: BOTTOM_X1, y1: 36, corner: 4, drain: [5.4, 13], tilt: noTilt() }],
      launch: { x: BOTTOM_X1 - LANE_WIDTH / 2, y: 0, height: 28 },
      walls: [],
      bumpers: [],
      flippers: [],
      arrows: [],
    }),
  };

  function bowPoints(a, b, s) {
    const dx = b[0] - a[0], dy = b[1] - a[1], c = Math.hypot(dx, dy);
    if (Math.abs(s) < 1e-3 || c < 1e-6) return [a, b];
    const n = [-dy / c, dx / c], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const r = (c * c / 4 + s * s) / (2 * Math.abs(s)), k = Math.sign(s) * (r - Math.abs(s));
    const center = [m[0] - n[0] * k, m[1] - n[1] * k];
    const from = Math.atan2(a[1] - center[1], a[0] - center[0]);
    let sweep = Math.atan2(b[1] - center[1], b[0] - center[0]) - from;
    sweep -= 2 * Math.PI * Math.floor(sweep / (2 * Math.PI));
    if (s > 0) sweep -= 2 * Math.PI;
    const count = Math.min(64, Math.max(2, Math.ceil(r * Math.abs(sweep) / WALL_SPACING)));
    return Array.from({ length: count + 1 }, (_, i) => {
      const t = from + sweep * i / count;
      return [center[0] + r * Math.cos(t), center[1] + r * Math.sin(t)];
    });
  }

  function sample(wall) {
    const pts = [wall.points[0]];
    for (let i = 0; i + 1 < wall.points.length; i++)
      pts.push(...bowPoints(wall.points[i], wall.points[i + 1], wall.bows[i] || 0).slice(1));
    return pts;
  }

  function crossing(a, b, x) {
    return [x, a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0])];
  }

  function opening(outline, x0, x1, top) {
    const left = [], right = [];
    for (let k = 0; k < outline.length && outline[k][0] <= x0; k++) left.push(outline[k]);
    for (let k = outline.length - 1; k >= 0 && outline[k][0] >= x1; k--) right.unshift(outline[k]);
    left.push(crossing(outline[left.length - 1], outline[left.length], x0), [x0, top]);
    right.unshift([x1, top], crossing(outline[outline.length - right.length - 1], outline[outline.length - right.length], x1));
    return [...chain(left), ...chain(right)];
  }

  function boundary(f, i, gateX, launch) {
    const y = f.y0 + FLIPPER_Y + 3.4;
    const c = Math.max(0, Math.min(f.corner, (f.x1 - f.x0) / 2, f.y1 - y)), n = Math.max(4, Math.round(c * 2.5));
    const lane = launch && { x0: launch.x - LANE_WIDTH / 2, x1: launch.x + LANE_WIDTH / 2, y0: launch.y, y1: launch.y + launch.height };
    const onLeft = lane && Math.abs(lane.x0 - f.x0) < 1e-6 && lane.y0 < y && lane.y1 > y;
    const onRight = lane && Math.abs(lane.x1 - f.x1) < 1e-6 && lane.y0 < y && lane.y1 > y;
    const outline = [
      [f.x0, onLeft ? lane.y0 : y], [f.x0, f.y1 - c],
      ...arc(f.x0 + c, f.y1 - c, c, Math.PI, Math.PI / 2, n),
      ...arc(f.x1 - c, f.y1 - c, c, Math.PI / 2, 0, n),
      [f.x1, f.y1 - c], [f.x1, onRight ? lane.y0 : y],
    ];
    const walls = gateX === undefined ? chain(outline) : opening(outline, gateX - GATE_HALF, gateX + GATE_HALF, f.y1);
    if (i === 0) {
      const fy = f.y0 + FLIPPER_Y;
      walls.push(
        { a: [onLeft ? lane.x1 : f.x0, y], b: [f.drain[0], fy] },
        { a: [onRight ? lane.x0 : f.x1, y], b: [f.drain[1], fy] },
        { a: [f.drain[0], fy], b: [f.drain[0], f.y0 - 1], hidden: true },
        { a: [f.drain[1], fy], b: [f.drain[1], f.y0 - 1], hidden: true });
      if (!onLeft) walls.push({ a: [lane.x0, lane.y0], b: [lane.x0, lane.y1] });
      if (!onRight) walls.push({ a: [lane.x1, lane.y0], b: [lane.x1, lane.y1] });
      walls.push({ a: [lane.x0, lane.y0 + 0.5], b: [lane.x1, lane.y0 + 0.5] });
    }
    return walls;
  }

  function compile(map) {
    const fields = map.fields.map(f => ({ x0: f.x0, y0: f.y0, x1: f.x1, y1: f.y1, tilt: tiltVector(f.tilt) }));
    const gates = fields.slice(1).map((above, i) => gate(map.fields[i].gate, fields[i], above));
    const f0 = map.fields[0];
    return {
      fields,
      gates,
      launch: { x: map.launch.x, y: map.launch.y },
      walls: [
        ...map.fields.flatMap((f, i) => boundary(f, i, i + 1 < fields.length ? f.gate : undefined, i === 0 ? map.launch : null)),
        ...map.walls.flatMap(w => chain(sample(w)).map(s => (w.hidden ? { ...s, hidden: true } : s))),
        ...gates.flatMap(g => g.walls),
      ],
      bumpers: map.bumpers.map(b => ({ c: [...b.c], r: b.r, kick: b.kick, points: b.points, lit: 0 })),
      flippers: [
        makeFlipper([f0.drain[0], f0.y0 + FLIPPER_Y], +1),
        makeFlipper([f0.drain[1], f0.y0 + FLIPPER_Y], -1),
        ...map.flippers.map(f => makeFlipper([...f.pivot], f.side, f.rest, f.up)),
        ...gates.flatMap(g => g.flippers),
      ],
      arrows: map.arrows.flatMap(row => {
        const d = [row.b[0] - row.a[0], row.b[1] - row.a[1]], len = Math.hypot(d[0], d[1]);
        if (!(len > 1e-6)) return [];
        return arrowRow(row.a, d.map(v => v / (row.count - 1)), row.count, d.map(v => v / len), row.boost);
      }),
    };
  }

  function install(map) {
    const t = compile(map);
    FIELDS.splice(0, FIELDS.length, ...t.fields);
    for (const key of ["gates", "walls", "bumpers", "flippers", "arrows", "launch"]) table[key] = t[key];
    return t;
  }

  function check(map, t) {
    const notes = [];
    const note = (type, index, message) => notes.push({ type, index, message });
    const nearWall = (p, reach) =>
      t.walls.some(w => { const q = closestOnSegment(p, w.a, w.b); return Math.hypot(p[0] - q[0], p[1] - q[1]) < reach; });
    map.bumpers.forEach((b, i) => {
      if (!map.fields.some(f => inside(b.c, f))) note("bumpers", i, "A bumper is outside the table.");
      else if (nearWall(b.c, b.r + 1)) note("bumpers", i, "A bumper is too close to a wall for the ball to pass.");
      for (let j = 0; j < i; j++) {
        const o = map.bumpers[j];
        if (Math.hypot(b.c[0] - o.c[0], b.c[1] - o.c[1]) < b.r + o.r + 1)
          note("bumpers", i, "Two bumpers are too close for the ball to pass between them.");
      }
    });
    if (!map.fields.some(f => inside([map.launch.x, map.launch.y + 1], f))) note("launch", 0, "The launcher is outside the table.");
    map.flippers.forEach((f, i) => {
      if (!map.fields.some(fd => inside(f.pivot, fd))) note("flippers", i, "A flipper is outside the table.");
    });
    map.walls.forEach((w, i) => {
      if (!w.points.every(p => map.fields.some(f => inside(p, f)))) note("walls", i, "A wall leaves the table.");
    });
    map.arrows.forEach((r, i) => {
      if (![r.a, r.b].every(p => map.fields.some(f => inside(p, f)))) note("arrows", i, "An arrow row leaves the table.");
    });
    if (t.arrows.length > 32) note("arrows", map.arrows.length - 1, "Only the first 32 arrows light up in the game.");
    if (map.fields.length > 8) note("fields", 8, "The ball only reflects the first 8 fields in the game.");
    return notes;
  }

  function parse(text) {
    const d = JSON.parse(text);
    if (d && d.version === 1 && d.launch) throw new Error("This file is from the old builder and can't be opened here.");
    if (!d || d.version !== VERSION || !Array.isArray(d.fields) || !d.fields.length)
      throw new Error("That isn't a map file from this builder.");
    const bad = what => { throw new Error(`The map file is damaged (${what}).`); };
    const map = { version: VERSION, name: typeof d.name === "string" && d.name.trim() ? d.name.slice(0, 60) : "Imported table" };
    map.fields = d.fields.map((f, i) => {
      if (![f.x0, f.y0, f.x1, f.y1, f.corner].every(finite) || f.x1 <= f.x0 || f.y1 <= f.y0) bad(`field ${i + 1}`);
      const out = { x0: f.x0, y0: f.y0, x1: f.x1, y1: f.y1, corner: f.corner, tilt: noTilt() };
      if (typeof f.tiltDir === "string" && finite(f.tilt) && f.tiltDir in out.tilt) out.tilt[f.tiltDir] = f.tilt;
      else if (f.tilt !== undefined) {
        for (const k of TILT_KEYS) {
          const v = f.tilt?.[k] ?? 0;
          if (!finite(v) || v < 0 || v > TILT_STEPS) bad(`tilt ${i + 1}`);
          out.tilt[k] = v;
        }
      }
      if (i + 1 < d.fields.length) { if (!finite(f.gate)) bad(`gate ${i + 1}`); out.gate = f.gate; }
      if (i === 0) {
        if (!point(f.drain)) bad("drain");
        out.drain = [...f.drain];
      }
      return out;
    });
    const f0 = d.fields[0], l = d.launch;
    if (l && [l.x, l.y, l.height].every(finite) && l.height > 0) map.launch = { x: l.x, y: l.y, height: l.height };
    else if (finite(f0.laneTop)) map.launch = { x: f0.x1 - LANE_WIDTH / 2, y: f0.y0, height: f0.laneTop - f0.y0 };
    else bad("launcher");
    const list = (key, shape) => (Array.isArray(d[key]) ? d[key] : []).map((v, i) => shape(v) || bad(`${key} ${i + 1}`));
    map.walls = list("walls", w => Array.isArray(w.points) && w.points.length >= 2 && w.points.every(point)
      && { points: w.points.map(p => [...p]), bows: w.points.slice(1).map((_, i) => (finite(w.bows?.[i]) ? w.bows[i] : 0)),
           hidden: w.hidden === true });
    map.bumpers = list("bumpers", b => point(b.c) && finite(b.r) && b.r > 0 && finite(b.kick) && finite(b.points)
      && { c: [...b.c], r: b.r, kick: b.kick, points: b.points });
    map.flippers = list("flippers", f => point(f.pivot) && [1, -1].includes(f.side) && finite(f.rest) && finite(f.up)
      && { pivot: [...f.pivot], side: f.side, rest: f.rest, up: f.up });
    map.arrows = list("arrows", r => point(r.a) && point(r.b) && Number.isInteger(r.count) && r.count >= 2 && finite(r.boost)
      && { a: [...r.a], b: [...r.b], count: r.count, boost: r.boost });
    return map;
  }

  const serialize = map => JSON.stringify(map, null, 2) + "\n";

  return {
    VERSION, BOTTOM_X1, GATE_MARGIN, DRAFT_KEY, TILT_STEPS, TILT_KEYS,
    template: name => TEMPLATES[name](),
    bowPoints, sample, compile, install, check, parse, serialize,
  };
})();
