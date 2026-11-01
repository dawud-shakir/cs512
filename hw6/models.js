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

  // Tangent; bitangent = cross(N, T)
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


function createCylinder(segments = 64, uRepeat = 3) {
  const positions = [], normals = [], tangents = [], texCoords = [], indices = [];

  // Side: theta grows with u, so T points along the circle and B = cross(N, T) points up
  for (let i = 0; i <= segments; i++) {
    const u = i / segments, theta = 2 * Math.PI * u;
    const s = Math.sin(theta), c = Math.cos(theta);
    for (const y of [-1, 1]) {
      positions.push(s, y, c);
      normals.push(s, 0, c);
      tangents.push(c, 0, -s);
      texCoords.push(u * uRepeat, (y + 1) / 2);
    }
  }
  for (let i = 0; i < segments; i++) {
    const k = 2 * i;
    indices.push(k, k + 2, k + 3, k, k + 3, k + 1);
  }

  // Caps: planar mapping of x, z into the texture, T = +x on both
  for (const y of [1, -1]) {
    const center = positions.length / 3;
    positions.push(0, y, 0);
    normals.push(0, y, 0);
    tangents.push(1, 0, 0);
    texCoords.push(0.5, 0.5);
    for (let i = 0; i <= segments; i++) {
      const theta = 2 * Math.PI * i / segments;
      const s = Math.sin(theta), c = Math.cos(theta);
      positions.push(s, y, c);
      normals.push(0, y, 0);
      tangents.push(1, 0, 0);
      texCoords.push(0.5 + 0.5 * s, 0.5 - 0.5 * y * c);  // keeps cross(N, T) along +v
    }
    for (let i = 0; i < segments; i++) {
      const a = center + 1 + i, b = a + 1;
      if (y > 0) indices.push(center, a, b);
      else indices.push(center, b, a);
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    tangents: new Float32Array(tangents),
    texCoords: new Float32Array(texCoords),
    indices: new Uint16Array(indices)
  };
}

function createSphere(segments = 64, uRepeat = 0.25) {
    const pos = [], nrm = [], tang = [], tex = [], idx = [];
    
    for (let i = 0; i <= segments; ++i) {
        const v = (i / segments) * Math.PI;
        const cosv = Math.cos(v), sinv = Math.sin(v);

        for (let j = 0; j <= segments; ++j) {
            const u = (j / segments) * Math.PI * 2;
            const cosu = Math.cos(u), sinu = Math.sin(u);

            const x = sinv * cosu;
            const y = cosv;
            const z = sinv * sinu;
            
            pos.push(x, y, z);
            nrm.push(x, y, z);
            tang.push(-sinu, 0, cosu);
            tex.push(u * uRepeat, v / Math.PI);
        }
    }

    for (let i = 0; i < segments; ++i) {
        for (let j = 0; j < segments; ++j) {
            const a = i * (segments + 1) + j;
            const b = a + 1;                    
            const c = a + segments + 1;
            const d = c + 1;
            
            if (i > 0)
                idx.push(c, a, b);
            
            if (i < segments - 1)
                idx.push(c, b, d);
        }
    }

    return { positions: new Float32Array(pos), normals: new Float32Array(nrm), tangents: new Float32Array(tang), texCoords: new Float32Array(tex), indices: new Uint16Array(idx) };
}

//////////////////////////////////////////////////////////////////////////////////
// Grid
//////////////////////////////////////////////////////////////////////////////////

function createGrid(n = 64 * 4, repeatU = 1, repeatV = repeatU) {
  const pos = [], nrm = [], tang = [], tex = [], idx = [];
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= n; j++) {
      const x = -1 + 2 * j / n;
      const y = 0;
      const z = -1 + 2 * i / n;
      pos.push(x, y, z);
      nrm.push(0, 1, 0);
      tang.push(1, 0, 0);       // u increases towards "+x"
      tex.push(repeatU * (x + 1) / 2, repeatV * (1 - z) / 2);   // v increases towards +z
    }
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const a = i * (n + 1) + j, b = a + 1, c = a + n + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  return { positions: new Float32Array(pos), normals: new Float32Array(nrm), tangents: new Float32Array(tang), texCoords: new Float32Array(tex), indices: new Uint16Array(idx) };
}

function createCone(segments) {
  const pos = [], nrm = [], idx = [];

   const s = Math.hypot(1, 2);
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2, x = Math.cos(a), z = Math.sin(a);
    const nx = 2 * x / s, ny = 1 / s, nz = 2 * z / s;
    pos.push(x, -1, z,  0, 1, 0);
    nrm.push(nx, ny, nz,  nx, ny, nz);
  }
  for (let i = 0; i < segments; i++) {
    const b = i * 2;
    idx.push(b, b + 1, b + 2);
  }

  const center = pos.length / 3;
  pos.push(0, -1, 0);
  nrm.push(0, -1, 0);
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pos.push(Math.cos(a), -1, Math.sin(a));
    nrm.push(0, -1, 0);
  }
  for (let i = 1; i <= segments; i++) {
    idx.push(center, center + i, center + i + 1);
  }

  return { positions: new Float32Array(pos), normals: new Float32Array(nrm), indices: new Uint16Array(idx) };
}

function createTorus(
    segments,
    R = 1.0,
    r = 0.25, uRepeat = 4) {
    const pos = [], nrm = [], tang = [], tex = [], idx = [];
    

    for (let i = 0; i <= segments; ++i) {
        const v = (i / segments) * Math.PI * 2;
        const cosv = Math.cos(v), sinv = Math.sin(v);

        for (let j = 0; j <= segments; ++j) {
            const u = (j / segments) * Math.PI * 2;
            const cosu = Math.cos(u), sinu = Math.sin(u);

            const x = (R + r * cosu) * cosv;
            const y = r * sinu;
            const z = (R + r * cosu) * sinv;
            
            const nx = cosu * cosv;
            const ny = sinu;
            const nz = cosu * sinv;

            pos.push(x, y, z);
            nrm.push(nx, ny, nz);
            tang.push(-sinu * cosv, cosu, -sinu * sinv);
            tex.push(j / segments,  uRepeat * i / segments);
        }
    }

    for (let i = 0; i < segments; ++i) {
        for (let j = 0; j < segments; ++j) {
            const a = i * (segments + 1) + j;
            const b = a + 1;                    
            const c = a + segments + 1;
            const d = c + 1;
            
            idx.push(c, a, b);
            idx.push(c, b, d);
        }
    }
    
    return { positions: new Float32Array(pos), normals: new Float32Array(nrm), tangents: new Float32Array(tang), texCoords: new Float32Array(tex), indices: new Uint16Array(idx) };
}

function createGear(segments, holeRadius = 0.35) {
  const pos = [], nrm = [], idx = [];

  const R = 1.0;
  const a = 0.15;
  const N = 12;
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

    pos.push(x, -h / 2, z, x, h / 2, z);
    nrm.push(nx, 0, nz, nx, 0, nz);

    pos.push(ix, -h / 2, iz, ix, h / 2, iz);
    nrm.push(-c, 0, -s, -c, 0, -s);

    pos.push(ix, h / 2, iz, x, h / 2, z);
    nrm.push(0, 1, 0, 0, 1, 0);

    pos.push(ix, -h / 2, iz, x, -h / 2, z);
    nrm.push(0, -1, 0, 0, -1, 0);
  }

  for (let i = 0; i < segments; i++) {
    const b = i * 8;
    const n = (i + 1) * 8;

    idx.push(b,n+1,n,b,b+1,n+1);
    idx.push(b+2,n+3,b+3,b+2,n+2,n+3);
    idx.push(b+4,n+5,b+5,b+4,n+4,n+5);
    idx.push(b+6,n+7,n+6,b+6,b+7,n+7);
    
  }

  return {
    positions: new Float32Array(pos),
    normals: new Float32Array(nrm),
    indices: new Uint16Array(idx)
  };
}
