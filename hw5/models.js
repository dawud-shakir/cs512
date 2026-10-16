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

  const indices = new Uint16Array([
     0,  1,  2,   0,  2,  3,   // front
     4,  5,  6,   4,  6,  7,   // back
     8,  9, 10,   8, 10, 11,   // top
    12, 13, 14,  12, 14, 15,   // bottom
    16, 17, 18,  16, 18, 19,   // right
    20, 21, 22,  20, 22, 23    // left
  ]);
  return { positions, normals, indices };
}

function createCylinder(segments) {
  const pos = [], nrm = [], idx = [];

  // Side
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2, x = Math.cos(a), z = Math.sin(a);
    pos.push(x, -1, z, x, 1, z);
    nrm.push(x, 0, z, x, 0, z);
  }
  for (let i = 0; i < segments; i++) {
    const b = i * 2;
    idx.push(b, b + 1, b + 3, b, b + 3, b + 2);
  }

  // Caps
  for (const y of [-1, 1]) {
    const center = pos.length / 3;
    pos.push(0, y, 0);
    nrm.push(0, y, 0);
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pos.push(Math.cos(a), y, Math.sin(a));
      nrm.push(0, y, 0);
    }
    for (let i = 1; i <= segments; i++) {
      if (y > 0) idx.push(center, center + i + 1, center + i);
      else idx.push(center, center + i, center + i + 1);
    }
  }

  return { positions: new Float32Array(pos), normals: new Float32Array(nrm), indices: new Uint16Array(idx) };
}

function createGear(segments) {
  const pos = [], nrm = [], idx = [];

  const R = 1.0;       // average outer radius
  const a = 0.15;      // tooth amplitude
  const N = 12;        // teeth
  const holeRadius = 0.35;
  const h = 0.3;

  for (let i = 0; i <= segments; i++) {
    const theta = i === segments
      ? 0
      : (i / segments) * Math.PI * 2;

    const c = Math.cos(theta);
    const s = Math.sin(theta);

    const r = R + a * Math.cos(N * theta);
    const dr = -a * N * Math.sin(N * theta);

    const x = r * c;
    const z = r * s;
    const ix = holeRadius * c;
    const iz = holeRadius * s;

    let nx = r * c + dr * s;
    let nz = r * s - dr * c;
    const length = Math.hypot(nx, nz);
    nx /= length;
    nz /= length;

    pos.push(x, -h / 2, z, x, h / 2, z); // wall
    nrm.push(nx, 0, nz, nx, 0, nz);

    pos.push(ix, -h / 2, iz, ix, h / 2, iz); // hole
    nrm.push(-c, 0, -s, -c, 0, -s); // point towards hole

    pos.push(ix, h / 2, iz, x, h / 2, z); // top cap
    nrm.push(0, 1, 0, 0, 1, 0);

    pos.push(ix, -h / 2, iz, x, -h / 2, z); // bottom cap
    nrm.push(0, -1, 0, 0, -1, 0);
  }

  // Walls and caps
  for (let i = 0; i < segments; i++) {
    const b = i * 8;
    const n = (i + 1) * 8;

    // Order per two triangles: A, C, B, A, D, C
    idx.push(b,n+1,n,b,b+1,n+1);    // outer wall
    idx.push(b+2,n+3,b+3,b+2,n+2,n+3); // hole wall
    idx.push(b+4,n+5,b+5,b+4,n+4,n+5); // top cap
    idx.push(b+6,n+7,n+6,b+6,b+7,n+7); // bottom cap
    
  }

  return {
    positions: new Float32Array(pos),
    normals: new Float32Array(nrm),
    indices: new Uint16Array(idx)
  };
}