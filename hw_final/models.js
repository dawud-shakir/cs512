function createCube() {
  const positions = new Float32Array([
    -1, -1,  1,   1, -1,  1,   1,  1,  1,  -1,  1,  1,   // front
     1, -1, -1,  -1, -1, -1,  -1,  1, -1,   1,  1, -1,   // back
    -1,  1,  1,   1,  1,  1,   1,  1, -1,  -1,  1, -1,   // top
    -1, -1, -1,   1, -1, -1,   1, -1,  1,  -1, -1,  1,   // bottom
     1, -1,  1,   1, -1, -1,   1,  1, -1,   1,  1,  1,   // right
    -1, -1, -1,  -1, -1,  1,  -1,  1,  1,  -1,  1, -1    // left
  ]);
  const faceNormals = [[0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0]];
  const normals = new Float32Array(faceNormals.flatMap(n => [...n, ...n, ...n, ...n]));

  const texCoords = new Float32Array(faceNormals.flatMap(() => [0, 0, 1, 0, 1, 1, 0, 1]));

  const indices = new Uint16Array([
     0,  1,  2,   0,  2,  3,   // front
     4,  5,  6,   4,  6,  7,   // back
     8,  9, 10,   8, 10, 11,   // top
    12, 13, 14,  12, 14, 15,   // bottom
    16, 17, 18,  16, 18, 19,   // right
    20, 21, 22,  20, 22, 23    // left
  ]);
  return { positions, normals, texCoords, indices };
}

function createCylinder(segments, uRepeat = 3) {
  const pos = [], nrm = [], tex = [], idx = [];

  // Side
  for (let i = 0; i <= segments; i++) {
    const u = i / segments, a = u * Math.PI * 2, s = Math.sin(a), c = Math.cos(a);
    for (const y of [-1, 1]) {
      pos.push(s, y, c);
      nrm.push(s, 0, c);
      tex.push(u * uRepeat, (y + 1) / 2);
    }
  }
  for (let i = 0; i < segments; i++) {
    const b = i * 2;
    idx.push(b, b + 2, b + 3, b, b + 3, b + 1);
  }

  // Caps
  for (const y of [1, -1]) {
    const center = pos.length / 3;
    pos.push(0, y, 0);
    nrm.push(0, y, 0);
    tex.push(0.5, 0.5);
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2, s = Math.sin(a), c = Math.cos(a);
      pos.push(s, y, c);
      nrm.push(0, y, 0);
      tex.push(0.5 + 0.5 * s, 0.5 - 0.5 * y * c);
    }
    for (let i = 0; i < segments; i++) {
      const a = center + 1 + i, b = a + 1;
      if (y > 0) idx.push(center, a, b);
      else idx.push(center, b, a);
    }
  }

  return { positions: new Float32Array(pos), normals: new Float32Array(nrm), texCoords: new Float32Array(tex), indices: new Uint16Array(idx) };
}

function createSphere(segments) {
  const pos = [], nrm = [], tex = [], idx = [];

  for (let i = 0; i <= segments; i++) {
    const v = (i / segments) * Math.PI, cosv = Math.cos(v), sinv = Math.sin(v);
    for (let j = 0; j <= segments; j++) {
      const u = (j / segments) * Math.PI * 2, cosu = Math.cos(u), sinu = Math.sin(u);
      pos.push(sinv * cosu, cosv, sinv * sinu);
      nrm.push(sinv * cosu, cosv, sinv * sinu);
      tex.push(1 - j / segments, 1 - i / segments);
    }
  }

  for (let i = 0; i < segments; i++)
    for (let j = 0; j < segments; j++) {
      const a = i * (segments + 1) + j, b = a + 1, c = a + segments + 1, d = c + 1;
      if (i > 0) idx.push(c, a, b);
      if (i < segments - 1) idx.push(c, b, d);
    }

  return { positions: new Float32Array(pos), normals: new Float32Array(nrm), texCoords: new Float32Array(tex), indices: new Uint16Array(idx) };
}

function createFlipper(length, radius, segments) {
  const pos = [], nrm = [], tex = [], idx = [];
  const rim = [];
  for (let i = 0; i <= segments; i++) rim.push([length, Math.PI / 2 - Math.PI * i / segments]);
  for (let i = 0; i <= segments; i++) rim.push([0, -Math.PI / 2 - Math.PI * i / segments]);
  rim.push(rim[0]);

  rim.forEach(([cx, a], i) => {
    const s = Math.sin(a), c = Math.cos(a);
    for (const z of [0, 1]) {
      pos.push(cx + radius * c, radius * s, z);
      nrm.push(c, s, 0);
      tex.push(i / (rim.length - 1), z);
    }
  });
  for (let i = 0; i + 1 < rim.length; i++) {
    const b = i * 2;
    idx.push(b, b + 2, b + 3, b, b + 3, b + 1);
  }

  for (const z of [1, 0]) {
    const center = pos.length / 3;
    pos.push(length / 2, 0, z);
    nrm.push(0, 0, 2 * z - 1);
    tex.push(0.5, 0.5);
    for (const [cx, a] of rim) {
      const x = cx + radius * Math.cos(a), y = radius * Math.sin(a);
      pos.push(x, y, z);
      nrm.push(0, 0, 2 * z - 1);
      tex.push((x + radius) / (length + 2 * radius), (y + radius) / (2 * radius));
    }
    for (let i = 0; i + 1 < rim.length; i++) idx.push(center, center + 1 + i, center + 2 + i);
  }

  return { positions: new Float32Array(pos), normals: new Float32Array(nrm), texCoords: new Float32Array(tex), indices: new Uint16Array(idx) };
}
