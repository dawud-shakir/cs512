// ====================
// Cube
// ====================

const cube = {
    positions: new Float32Array([
        -1, -1, -1,  // 0
        1, -1, -1,  // 1
        1, 1, -1,  // 2
        -1, 1, -1,  // 3
        -1, -1, 1,  // 4
        1, -1, 1,  // 5
        1, 1, 1,  // 6
        -1, 1, 1   // 7
    ]),

    colors: new Float32Array([
        1, 0, 0,
        0, 1, 0,
        0, 0, 1,
        1, 1, 0,
        1, 0, 1,
        0, 1, 1,
        1, 1, 0,
        1, 0, 1
    ]),

    indices: new Uint16Array([
        // Front
        4, 5, 6, 4, 6, 7,
        // Back
        1, 0, 3, 1, 3, 2,
        // Top
        3, 7, 6, 3, 6, 2,
        // Bottom
        0, 1, 5, 0, 5, 4,
        // Right
        1, 2, 6, 1, 6, 5,
        // Left
        0, 4, 7, 0, 7, 3,
    ])
};


// ====================
// Sphere
// ====================

function createSphere(r = 1.0, vSteps = 20, uSteps = 20) {
    const positions = [];
    const colors = [];
    const indices = [];

    var rgb_offset = 0;
    for (let i = 0; i <= vSteps; ++i) {
        const v = i * Math.PI / vSteps;
        const cosv = Math.cos(v);
        const sinv = Math.sin(v);

        for (let j = 0; j <= uSteps; ++j) {
            const u = j * 2.0 * Math.PI / uSteps;

            const cosu = Math.cos(u);
            const sinu = Math.sin(u);
            const x = r * cosu * sinv;
            const y = r * cosv;
            const z = r * sinu * sinv;

            // Alternate colors: R,G,B,K
            const rgb = [0.0, 0.0, 0.0];
            const a = rgb_offset % 4;
            if (a < 3) {
                rgb[a] = 0.25 + Math.max(0.0, cosv);
            }

            colors.push(rgb[0], rgb[1], rgb[2]);
            rgb_offset++;

            positions.push(x, y, z);
        }
    }

    for (let i = 0; i < vSteps; ++i) {
        for (let j = 0; j < uSteps; ++j) {
            const k1 = (i * (uSteps + 1)) + j;
            const k2 = k1 + uSteps + 1;

            indices.push(k1, k2, k1 + 1);
            indices.push(k2, k2 + 1, k1 + 1);
        }
    }

    return {
        positions: new Float32Array(positions),
        colors: new Float32Array(colors),
        indices: new Uint16Array(indices)
    };
}

const sphere = createSphere();

// ====================
// Torus
// ====================

function createTorus(R = 1.0, r = 0.5, vSteps = 20, uSteps = 20) {
    const positions = [];
    const colors = [];
    const indices = [];

    for (let i = 0; i <= vSteps; ++i) {
        const v = i * 2 * Math.PI / vSteps;
        const cosv = Math.cos(v);
        const sinv = Math.sin(v);

        for (let j = 0; j <= uSteps; ++j) {
            const u = j * 2 * Math.PI / uSteps;
            const cosu = Math.cos(u);
            const sinu = Math.sin(u);
            const x = (R + r * cosv) * cosu;
            const y = (R + r * cosv) * sinu;
            const z = r * sinv;

            positions.push(x, y, z);
        }
    }

    for (let i = 0; i <= vSteps; ++i) {
        const c = (1 - Math.cos(i * 2 * Math.PI / vSteps)) / 2;
        for (let j = 0; j <= uSteps; ++j) {
            colors.push(c, c, c);
        }
    }

    for (let i = 0; i < vSteps; ++i) {
        for (let j = 0; j < uSteps; ++j) {
            const k1 = (i * (uSteps + 1)) + j;
            const k2 = k1 + uSteps + 1;

            indices.push(k1, k2, k1 + 1);
            indices.push(k2, k2 + 1, k1 + 1);
        }
    }

    return {
        positions: new Float32Array(positions),
        colors: new Float32Array(colors),
        indices: new Uint16Array(indices)
    };
}

const torus = createTorus();

// ====================
// Cone
// ====================

function createCone(h = 1.0, r = 0.5, vSteps = 20, uSteps = 20) {
    const positions = [];
    const colors = [];
    const indices = [];

    for (let i = 0; i <= vSteps; ++i) {
        const v = i / vSteps;

        for (let j = 0; j <= uSteps; ++j) {
            const u = j * 2.0 * Math.PI / uSteps;
            const cosu = Math.cos(u);
            const sinu = Math.sin(u);
            const x = r * (1-v) * cosu;
            const y = r * (1-v) * sinu;
            const z = h * v;


            positions.push(x, y, z);
        }
    }
    const bottom = positions.length / 3;
    positions.push(0, 0, 0);
    var rgb = Array.from({length: 3}, () => Math.random());
    for (let i = 0; i < positions.length / 3; ++i) {
        const c = (1 - Math.cos(i * 2 * Math.PI / vSteps)) / 2;
        colors.push(rgb[0] + c, rgb[1] + c, rgb[2] + c);
    }

    for (let i = 0; i < vSteps; ++i) {
        for (let j = 0; j < uSteps; ++j) {
            const k1 = (i * (uSteps + 1)) + j;
            const k2 = k1 + uSteps + 1;

            indices.push(k1, k2, k1 + 1);
            indices.push(k2, k2 + 1, k1 + 1);
        }
    }
    for (let j = 0; j < uSteps; ++j) {
        indices.push(bottom, j + 1, j);
    }

    return {
        positions: new Float32Array(positions),
        colors: new Float32Array(colors),
        indices: new Uint16Array(indices)
    };
}

const cone = createCone();

// ====================
// Cylinder
// ====================

function createCylinder(h = 1.0, r = 0.5, vSteps = 20, uSteps = 20) {
    const positions = [];
    const colors = [];
    const indices = [];

    for (let i = 0; i <= vSteps; ++i) {
        const v = i / vSteps;

        for (let j = 0; j <= uSteps; ++j) {
            const u = j * 2.0 * Math.PI / uSteps;
            const cosu = Math.cos(u);
            const sinu = Math.sin(u);
            const x = r * cosu;
            const y = r * sinu;
            const z = h * v;

            positions.push(x, y, z);
        }
    }
    const bottom = positions.length / 3;
    const top = bottom + 1;
    positions.push(0, 0, 0, 0, 0, h);
    var rgb = Array.from({length: 3}, () => Math.random());
    for (let i = 0; i < positions.length / 3; ++i) {
        const c = (1 - Math.cos(i * 2 * Math.PI / vSteps)) / 2;
        colors.push(rgb[0] + c, rgb[1] + c, rgb[2] + c);
    }

    for (let i = 0; i < vSteps; ++i) {
        for (let j = 0; j < uSteps; ++j) {
            const k1 = (i * (uSteps + 1)) + j;
            const k2 = k1 + uSteps + 1;

            indices.push(k1, k2, k1 + 1);
            indices.push(k2, k2 + 1, k1 + 1);
        }
    }
    for (let j = 0; j < uSteps; ++j) {
        const k1 = vSteps * (uSteps + 1) + j;
        indices.push(bottom, j + 1, j);
        indices.push(top, k1, k1 + 1);
    }

    return {
        positions: new Float32Array(positions),
        colors: new Float32Array(colors),
        indices: new Uint16Array(indices)
    };
}

const cylinder = createCylinder();
