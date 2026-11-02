const rad = degrees => degrees * Math.PI / 180;

function identity() {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function multiply(...matrices) {
  let result = identity();
  for (const m of matrices) {
    const r = new Float32Array(16);
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) sum += result[k * 4 + i] * m[j * 4 + k];
        r[j * 4 + i] = sum;
      }
    result = r;
  }
  return result;
}

function translate(x, y, z) {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
}

function scale(x, y, z) {
  return new Float32Array([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]);
}

function rotateX(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
}

function rotateY(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
}

function rotateZ(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

const ROTATE = { x: rotateX, y: rotateY, z: rotateZ };

function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}

function transformPoint(m, [x, y, z]) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14]
  ];
}

function transformDirection(m, [x, y, z]) {
  return [
    m[0] * x + m[4] * y + m[8] * z,
    m[1] * x + m[5] * y + m[9] * z,
    m[2] * x + m[6] * y + m[10] * z
  ];
}

function normalize(v) {
  const len = Math.hypot(v[0], v[1], v[2]);
  return len > 0 ? v.map(x => x / len) : [0, 0, 0];
}

// I am planning to use this if I have time:

// function lookAt(eye, target, up = [0, 1, 0]) {
//   // Camera's local +Z points backward
//   const z = normalize(sub(eye, target));

//   // Camera's local +X points right
//   const x = normalize(cross(up, z));

//   // Camera's local +Y points up
//   const y = cross(z, x);

//   return new Float32Array([
//     x[0], y[0], z[0], 0,
//     x[1], y[1], z[1], 0,
//     x[2], y[2], z[2], 0,
//     -dot(x, eye),
//     -dot(y, eye),
//     -dot(z, eye),
//     1
//   ]);
// }