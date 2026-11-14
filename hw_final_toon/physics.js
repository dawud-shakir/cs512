const BALL_RADIUS = 0.5;
const GRAVITY = 30;
const SUBSTEPS = 8;
const MAX_SPEED = 60;
const LANE_X = 18.4;
const FLIPPER_Y = 4.6;
const GATE_X = 9.2;
const GATE_HALF = 2.0;
const TILT_MAX = 0.08;
const TILT_SPEED = 0.6;
const TILT_GRAVITY = 150;

function arc(cx, cy, r, from, to, n = 10) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = from + (to - from) * i / n;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function chain(points) {
  const segs = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const [a, b] = [points[i], points[i + 1]];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-6) segs.push({ a, b });
  }
  return segs;
}

function makeFlipper(pivot, side, restAngle = -0.5, upAngle = 0.45) {
  return {
    pivot, side,
    length: 3.2,
    radius: 0.3,
    restAngle,
    upAngle,
    speed: 18,
    angle: restAngle,
    omega: 0,
    pressed: false,
  };
}

const FIELDS = [
  { x0: 0, y0: 0, x1: 20, y1: 36 },
  { x0: 2.2, y0: 37.2, x1: 16.2, y1: 63 },
  { x0: 2.2, y0: 64.2, x1: 16.2, y1: 80 },
];

function gate(x, below, above) {
  const y = above.y0 + FLIPPER_Y;
  const left = [x - GATE_HALF - 3.1, y], right = [x + GATE_HALF + 3.1, y];
  return {
    x, below,
    walls: [
      { a: [above.x0, y + 3.4], b: left },
      { a: [above.x1, y + 3.4], b: right },
      ...chain([left, [x - GATE_HALF, above.y0 + 1], [x - GATE_HALF, below.y1]]),
      ...chain([right, [x + GATE_HALF, above.y0 + 1], [x + GATE_HALF, below.y1]]),
    ],
    flippers: [makeFlipper(left, +1), makeFlipper(right, -1)],
  };
}

const GATES = [
  gate(GATE_X, FIELDS[0], FIELDS[1]),
  gate(GATE_X, FIELDS[1], FIELDS[2]),
];

const table = {
  fields: FIELDS,
  gates: GATES,
  walls: [
    ...chain([
      [0, 8], [0, 32],
      ...arc(4, 32, 4, Math.PI, Math.PI / 2),
      [GATE_X - GATE_HALF, 36],
    ]),
    ...chain([
      [GATE_X + GATE_HALF, 36],
      ...arc(16, 32, 4, Math.PI / 2, 0),
      [20, 0],
    ]),
    { a: [LANE_X, 0], b: [LANE_X, 28] },
    { a: [LANE_X, 0.5], b: [20, 0.5] },
    { a: [0, 8], b: [5.4, 4.6] },
    { a: [LANE_X, 8], b: [13.0, 4.6] },
    { a: [5.4, 4.6], b: [5.4, -1], hidden: true },
    { a: [13.0, 4.6], b: [13.0, -1], hidden: true },
    ...chain([[2.2, 45.2], [2.2, 59], [6.2, 63], [GATE_X - GATE_HALF, 63]]),
    ...chain([[GATE_X + GATE_HALF, 63], [12.2, 63], [16.2, 59], [16.2, 45.2]]),
    ...chain([[2.2, 72.2], [2.2, 73], ...arc(9.2, 73, 7, Math.PI, 0, 24), [16.2, 72.2]]),
    ...GATES.flatMap(g => g.walls),
  ],
  bumpers: [
    { c: [6, 24], r: 1.2, kick: 18, points: 100, lit: 0 },
    { c: [12.4, 24], r: 1.2, kick: 18, points: 100, lit: 0 },
    { c: [9.2, 19], r: 1.2, kick: 18, points: 100, lit: 0 },
    { c: [5.6, 51], r: 1.0, kick: 18, points: 200, lit: 0 },
    { c: [12.8, 51], r: 1.0, kick: 18, points: 200, lit: 0 },
    { c: [6.2, 75.5], r: 1.0, kick: 18, points: 500, lit: 0 },
    { c: [12.2, 75.5], r: 1.0, kick: 18, points: 500, lit: 0 },
    { c: [9.2, 77.5], r: 1.0, kick: 18, points: 500, lit: 0 },
  ],
  flippers: [
    makeFlipper([5.4, 4.6], +1),
    makeFlipper([13.0, 4.6], -1),
    makeFlipper([0.6, 24], +1, -0.3, 0.2),
    ...GATES.flatMap(g => g.flippers),
  ],
};

function flipperTip(f) {
  return [f.pivot[0] + f.side * f.length * Math.cos(f.angle),
          f.pivot[1] + f.length * Math.sin(f.angle)];
}

const game = {
  ball: { p: [0, 0], v: [0, 0], rotation: identity() },
  score: 0,
  balls: 3,
  field: 0,
  tilt: [0, 0],
  tilting: [false, false, false, false],
  state: "ready",
  charge: 0,
  charging: false,
};

const ballOnPlunger = () => game.ball.p[0] > LANE_X && game.ball.p[1] < 2;

function resetBall() {
  game.ball.p = [(LANE_X + FIELDS[0].x1) / 2, 0.5 + BALL_RADIUS];
  game.ball.v = [0, 0];
  game.ball.rotation = identity();
  game.state = "ready";
}

function newGame() {
  game.score = 0;
  game.balls = 3;
  resetBall();
}

function setPlunger(down) {
  if (game.state === "over") { if (down) newGame(); return; }
  if (down) { game.charging = true; return; }
  if (game.charging && ballOnPlunger()) {
    game.ball.v = [0, 36 + 20 * game.charge];
    game.state = "play";
  }
  game.charging = false;
  game.charge = 0;
}

function setTilt(i, down) { game.tilting[i] = down; }

function setFlipper(i, down) {
  for (const f of table.flippers) if (f.side === (i === 0 ? 1 : -1)) f.pressed = down;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

function closestOnSegment(p, a, b) {
  const ab = sub(b, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / dot(ab, ab)));
  return [a[0] + ab[0] * t, a[1] + ab[1] * t];
}

function resolve(ball, q, reach, restitution, vs = [0, 0]) {
  const d = sub(ball.p, q);
  const dist = Math.hypot(d[0], d[1]);
  if (dist >= reach || dist === 0) return false;
  const n = [d[0] / dist, d[1] / dist];
  ball.p[0] += n[0] * (reach - dist);
  ball.p[1] += n[1] * (reach - dist);
  const vn = dot(sub(ball.v, vs), n);
  if (vn < 0) {
    ball.v[0] -= (1 + restitution) * vn * n[0];
    ball.v[1] -= (1 + restitution) * vn * n[1];
  }
  return true;
}

function collideWalls(ball) {
  for (const w of table.walls)
    resolve(ball, closestOnSegment(ball.p, w.a, w.b), BALL_RADIUS, 0.5);
}

function collideBumpers(ball) {
  for (const bp of table.bumpers) {
    if (!resolve(ball, bp.c, BALL_RADIUS + bp.r, 0.9)) continue;
    const n = sub(ball.p, bp.c);
    const len = Math.hypot(n[0], n[1]);
    const vn = dot(ball.v, n) / len;
    if (vn < bp.kick) {
      ball.v[0] += (bp.kick - vn) * n[0] / len;
      ball.v[1] += (bp.kick - vn) * n[1] / len;
    }
    game.score += bp.points;
    bp.lit = 0.15;
  }
}

function collideFlippers(ball) {
  for (const f of table.flippers) {
    const q = closestOnSegment(ball.p, f.pivot, flipperTip(f));
    const r = sub(q, f.pivot);
    const vs = [-f.omega * r[1], f.omega * r[0]];
    resolve(ball, q, BALL_RADIUS + f.radius, 0.3, vs);
  }
}

const approach = (value, target, step) =>
  Math.abs(target - value) <= step ? target : value + Math.sign(target - value) * step;

function moveFlippers(dt) {
  for (const f of table.flippers) {
    const prev = f.angle;
    f.angle = approach(f.angle, f.pressed ? f.upAngle : f.restAngle, f.speed * dt);
    f.omega = f.side * (f.angle - prev) / dt;
  }
}

function stepPhysics(dt) {
  const h = dt / SUBSTEPS;
  const ball = game.ball;

  if (game.charging) game.charge = Math.min(1, game.charge + dt);
  const [left, right, down, up] = game.tilting;
  const tiltTarget = [right - left, up - down].map(d => TILT_MAX * d);
  game.tilt = game.tilt.map((t, i) => approach(t, tiltTarget[i], TILT_SPEED * dt));
  for (const bp of table.bumpers) bp.lit = Math.max(0, bp.lit - dt);

  for (let i = 0; i < SUBSTEPS; i++) {
    moveFlippers(h);
    if (game.state === "over") continue;

    const [x, y] = ball.p;
    ball.v[0] += TILT_GRAVITY * Math.sin(game.tilt[0]) * h;
    ball.v[1] += (TILT_GRAVITY * Math.sin(game.tilt[1]) - GRAVITY) * h;
    const speed = Math.hypot(ball.v[0], ball.v[1]);
    if (speed > MAX_SPEED) { ball.v[0] *= MAX_SPEED / speed; ball.v[1] *= MAX_SPEED / speed; }
    ball.p[0] += ball.v[0] * h;
    ball.p[1] += ball.v[1] * h;

    collideWalls(ball);
    collideBumpers(ball);
    collideFlippers(ball);

    const dx = ball.p[0] - x, dy = ball.p[1] - y, d = Math.hypot(dx, dy);
    if (d > 1e-6) ball.rotation = multiply(rotateAxis([-dy / d, dx / d, 0], d / BALL_RADIUS), ball.rotation);
  }
  ball.rotation = orthonormalize(ball.rotation);
  game.field = Math.max(0, FIELDS.findLastIndex(f => ball.p[1] > f.y0 + FLIPPER_Y));

  if (game.state === "play" && ballOnPlunger() && ball.v[1] <= 0) game.state = "ready";

  if (game.state !== "over" && ball.p[1] < -BALL_RADIUS * 2) {
    game.balls--;
    if (game.balls > 0) resetBall();
    else game.state = "over";
  }
}
