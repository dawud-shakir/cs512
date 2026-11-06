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

  const faceTangents = [[1, 0, 0], [-1, 0, 0], [1, 0, 0], [1, 0, 0], [0, 0, -1], [0, 0, 1]];
  const tangents = new Float32Array(faceTangents.flatMap(t => [...t, ...t, ...t, ...t]));

  const texCoords = new Float32Array(faceNormals.flatMap(() => [0, 0, 1, 0, 1, 1, 0, 1]));

  const indices = new Uint16Array([
     0,  1,  2,   0,  2,  3,   // front
     4,  5,  6,   4,  6,  7,   // back
     8,  9, 10,   8, 10, 11,   // top
    12, 13, 14,  12, 14, 15,   // bottom
    16, 17, 18,  16, 18, 19,   // right
    20, 21, 22,  20, 22, 23    // left
  ]);
  return { positions, normals, tangents, texCoords, indices };
}

function createGrid(repeatU = 1, repeatV = repeatU) {
  return {
    positions: new Float32Array([-1, 0, 1,   1, 0, 1,   1, 0, -1,  -1, 0, -1]),
    normals:   new Float32Array([ 0, 1, 0,   0, 1, 0,   0, 1,  0,   0, 1,  0]),
    tangents:  new Float32Array([ 1, 0, 0,   1, 0, 0,   1, 0,  0,   1, 0,  0]),
    texCoords: new Float32Array([0, 0,  repeatU, 0,  repeatU, repeatV,  0, repeatV]),
    indices:   new Uint16Array([0, 1, 2,  0, 2, 3])
  };
}

function createCylinder(segments, uRepeat = 3) {
  const pos = [], nrm = [], tang = [], tex = [], idx = [];

  // Side
  for (let i = 0; i <= segments; i++) {
    const u = i / segments, a = u * Math.PI * 2, s = Math.sin(a), c = Math.cos(a);
    for (const y of [-1, 1]) {
      pos.push(s, y, c);
      nrm.push(s, 0, c);
      tang.push(c, 0, -s);
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
    tang.push(1, 0, 0);
    tex.push(0.5, 0.5);
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2, s = Math.sin(a), c = Math.cos(a);
      pos.push(s, y, c);
      nrm.push(0, y, 0);
      tang.push(1, 0, 0);
      tex.push(0.5 + 0.5 * s, 0.5 - 0.5 * y * c);
    }
    for (let i = 0; i < segments; i++) {
      const a = center + 1 + i, b = a + 1;
      if (y > 0) idx.push(center, a, b);
      else idx.push(center, b, a);
    }
  }

  return { positions: new Float32Array(pos), normals: new Float32Array(nrm), tangents: new Float32Array(tang), texCoords: new Float32Array(tex), indices: new Uint16Array(idx) };
}

function createSphere(segments, uRepeat = 0.25) {
  const pos = [], nrm = [], tang = [], tex = [], idx = [];

  for (let i = 0; i <= segments; i++) {
    const v = (i / segments) * Math.PI, cosv = Math.cos(v), sinv = Math.sin(v);
    for (let j = 0; j <= segments; j++) {
      const u = (j / segments) * Math.PI * 2, cosu = Math.cos(u), sinu = Math.sin(u);
      pos.push(sinv * cosu, cosv, sinv * sinu);
      nrm.push(sinv * cosu, cosv, sinv * sinu);
      tang.push(sinu, 0, -cosu);
      tex.push(-u * uRepeat, 1 - v / Math.PI);
    }
  }

  for (let i = 0; i < segments; i++)
    for (let j = 0; j < segments; j++) {
      const a = i * (segments + 1) + j, b = a + 1, c = a + segments + 1, d = c + 1;
      if (i > 0) idx.push(c, a, b);
      if (i < segments - 1) idx.push(c, b, d);
    }

  return { positions: new Float32Array(pos), normals: new Float32Array(nrm), tangents: new Float32Array(tang), texCoords: new Float32Array(tex), indices: new Uint16Array(idx) };
}

function createTorus(segments, R = 1.0, r = 0.25, uRepeat = 4) {
  const pos = [], nrm = [], tang = [], tex = [], idx = [];

  for (let i = 0; i <= segments; i++) {
    const v = (i / segments) * Math.PI * 2, cosv = Math.cos(v), sinv = Math.sin(v);
    for (let j = 0; j <= segments; j++) {
      const u = (j / segments) * Math.PI * 2, cosu = Math.cos(u), sinu = Math.sin(u);
      pos.push((R + r * cosu) * cosv, r * sinu, (R + r * cosu) * sinv);
      nrm.push(cosu * cosv, sinu, cosu * sinv);
      tang.push(-sinu * cosv, cosu, -sinu * sinv);
      tex.push(j / segments, uRepeat * i / segments);
    }
  }

  for (let i = 0; i < segments; i++)
    for (let j = 0; j < segments; j++) {
      const a = i * (segments + 1) + j, b = a + 1, c = a + segments + 1, d = c + 1;
      idx.push(c, a, b, c, b, d);
    }

  return { positions: new Float32Array(pos), normals: new Float32Array(nrm), tangents: new Float32Array(tang), texCoords: new Float32Array(tex), indices: new Uint16Array(idx) };
}


function createCone(segments, uRepeat = 3) {
  const pos = [], nrm = [], tex = [], tang = [], idx = [];

   const hypot = Math.hypot(1, 2);  // radius is 1, height is -1 to +1 = 2
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;


    const a = u * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const nx = 2 * c / hypot, ny = 1 / hypot, nz = 2 * s / hypot;
    
    
    pos.push(s, -1, c,  0, 1, 0);
    nrm.push(nz, ny, nx,  nz, ny, nx);
    
    tex.push(u * uRepeat, 0, u * uRepeat, 1);   

    tang.push(c, 0, -s,  c, 0, -s);  // give the apex the same tangent as the base
  }
  for (let i = 0; i < segments; i++) {
    const b = i * 2;
    idx.push(b, b + 2, b + 1);
  }

  const center = pos.length / 3;
  pos.push(0, -1, 0);
  nrm.push(0, -1, 0);
  tang.push(1, 0, 0);
  tex.push(0.5, 0.5);
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2, s = Math.sin(a), c = Math.cos(a);
    pos.push(s, -1, c);
    nrm.push(0, -1, 0);
    tang.push(1, 0, 0);
    tex.push(0.5 + 0.5 * s, 0.5 + 0.5 * c);
  }
  for (let i = 0; i < segments; i++) {
    const a = center + 1 + i, b = a + 1;
    idx.push(center, b, a);
  }

  return { positions: new Float32Array(pos), normals: new Float32Array(nrm), texCoords: new Float32Array(tex), tangents: new Float32Array(tang), indices: new Uint16Array(idx) };
}

