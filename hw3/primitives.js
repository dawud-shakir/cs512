// cube
const positions = new Float32Array([
  -1, -1, -1,  // 0
   1, -1, -1,  // 1
   1,  1, -1,  // 2
  -1,  1, -1,  // 3
  -1, -1,  1,  // 4
   1, -1,  1,  // 5
   1,  1,  1,  // 6
  -1,  1,  1   // 7
]);

const colors = new Float32Array([
  1,0,0,  0,1,0,  0,0,1, 1,1,0, 1,0,1, 0,1,1, 1,1,0, 1,0,1
]);


const indices = new Uint16Array([
  // Front
  4, 5, 6,   4, 6, 7,
  // Back
  1, 0, 3,   1, 3, 2,
  // Top
  3, 7, 6,   3, 6, 2,
  // Bottom
  0, 1, 5,   0, 5, 4,
  // Right
  1, 2, 6,   1, 6, 5,
  // Left
  0, 4, 7,   0, 7, 3,
]);


/*
const positions2 = new Float32Array();

const r = 1.0;
const vStep = 20;
const uStep = 20;

for (const i = 0; i <= vStep; ++i) {
    const v = i * 2.0 * Math.PI / vStep;    // scale to 0..2*pi
    const cosv = Math.cos(v);
    const sinv = Math.sin(v);

    for (const j = 0; j <= uStep; ++j) {
        const u = j * Math.PI / uStep;      // scale to 0..pi
        const cosu = Math.cos(u);
        const sinu = Math.sin(u);
        const x = r * sinv * cosu;
        const y = r * sinv * sinu;
        const z = r * cosv;

        positions2.push(x, y, z);
    }
}

const indices2 = new Uint16Array();
for (const i = 0; i <= vStep; ++i) {
    for (const j = 0; j < uStep; ++j) {
        const k1 = positions2[i * (vStep)]
        const k2 = positions2[i * (vStep)]

        indices2.push()
    }
}
*/

const positions2 = [];

const r = 1.0;      
const vSteps = 30;
const uSteps = 40;

const colors2 = [];
 var c_count = 0;
for (let i = 0; i <= vSteps; ++i) {
    const v = i * Math.PI / vSteps;    // scale to 0..2*pi
    const cosv = Math.cos(v);
    const sinv = Math.sin(v);

    for (let j = 0; j <= uSteps; ++j) {
        const u = j * 2.0 * Math.PI / uSteps;      // scale to 0..pi
        const cosu = Math.cos(u);
        const sinu = Math.sin(u);
        const x = r * cosu * sinv;
        const y = r * cosv;
        const z = r * sinu * sinv;

        // a = c_count % 4;
        // switch(a) {
        //     case 3:
        //         colors2.push(cosv, 0.0, 0.0);
        //         break;
        //     case 0:
        //         colors2.push(0.0, cosv, 0.0);
        //         break;
        //     case 1:
        //         colors2.push(0.0, 0.0, cosv);
        //         break;
        //     case 2:
        //         colors2.push(0.0, 0.0, 0.0);
        //         break;
        // }
        // c_count++;
        colors2.push(0.0, .25+cosv, 0.0, 0);    // asymetric color (every other color)
        positions2.push(x, y, z);
    }
}


/*     // torus
    // var c_count = 0;
const positions2 = [];

const R = 1.5;  // large radius
const r = 1.0;  // tube radius
const vSteps = 40;
const uSteps = 40;

const colors2 = [];
 var c_count = 0;
  
for (let i = 0; i <= vSteps; ++i) {
    const v = i * 2.0 * Math.PI / vSteps;    // scale to 0..2*pi
    const cosv = Math.cos(v);
    const sinv = Math.sin(v);

    for (let j = 0; j <= uSteps; ++j) {
        const u = j * 2.0 * Math.PI / uSteps;      // scale to 0..pi
        const cosu = Math.cos(u);
        const sinu = Math.sin(u);
        const x = (R + r * cosv) * cosu;
        const y = (R + r * cosv) * sinu;
        const z = r * sinv;

        a = c_count % 4;
        switch(a) {
            case 3:
                colors2.push(cosv, 0.0, 0.0);
                break;
            case 0:
                colors2.push(0.0, cosv, 0.0);
                break;
            case 1:
                colors2.push(0.0, 0.0, cosv);
                break;
            case 2:
                colors2.push(0.0, 0.0, 0.0);
                break;
        }
        c_count++;
        // colors2.push(0.0, cosv, 0.0, 0);

        positions2.push(x, y, z);
    }
}
 */

 /*    // cone
    // var c_count = 0;
const positions2 = [];

const r = 1.0;
const h = 2.0;
const vSteps = 20;
const uSteps = 40;

const colors2 = [];
 var c_count = 0;
  
for (let i = 0; i <= vSteps; ++i) {
    // const v = i * 2.0 * Math.PI / vSteps;    // scale to 0..2*pi
    // const cosv = Math.cos(v);
    // const sinv = Math.sin(v);

    const v = i / vSteps;

    for (let j = 0; j <= uSteps; ++j) {
        const u = j * 2.0 * Math.PI / uSteps;      // scale to 0..pi
        const cosu = Math.cos(u);
        const sinu = Math.sin(u);
        const x = r * (1-v) * cosu;
        const y = r * (1-v) * sinu;
        const z = h * v;

        a = c_count % 4;
        switch(a) {
            case 3:
                colors2.push(.25+v, 0.0, 0.0);
                break;
            case 0:
                colors2.push(0.0, .25+v, 0.0);
                break;
            case 1:
                colors2.push(0.0, 0.0, .25+v);
                break;
            case 2:
                colors2.push(0.0, 0.0, 0.0);
                break;
        }
        c_count++;
        // colors2.push(0.0, cosv, 0.0, 0);

        positions2.push(x, y, z);
    }
} */

  /*  // cylinder
    // var c_count = 0;
const positions2 = [];

const r = 0.5;
const h = 2.0;
const vSteps = 20;
const uSteps = 40;

const colors2 = [];
 var c_count = 0;
  
for (let i = 0; i <= vSteps; ++i) {
    // const v = i * 2.0 * Math.PI / vSteps;    // scale to 0..2*pi
    // const cosv = Math.cos(v);
    // const sinv = Math.sin(v);

    const v = i / vSteps;

    for (let j = 0; j <= uSteps; ++j) {
        const u = j * 2.0 * Math.PI / uSteps;      // scale to 0..pi
        const cosu = Math.cos(u);
        const sinu = Math.sin(u);
        const x = r * cosu;
        const y = r * sinu;
        const z = h * v;

        a = c_count % 4;
        switch(a) {
            case 3:
                colors2.push(.25+v, 0.0, 0.0);
                break;
            case 0:
                colors2.push(0.0, .25+v, 0.0);
                break;
            case 1:
                colors2.push(0.0, 0.0, .25+v);
                break;
            case 2:
                colors2.push(0.0, 0.0, 0.0);
                break;
        }
        c_count++;
        // colors2.push(0.0, cosv, 0.0, 0);

        positions2.push(x, y, z);
    }
}
 */
const indices2 = [];
for (let i = 0; i < vSteps; ++i) {
    for (let j = 0; j < uSteps; ++j) {
        const k1 = (i * (uSteps + 1)) + j;
        const k2 = k1 + uSteps + 1;

        indices2.push(k1, k2, k1 + 1);
        indices2.push(k2, k2 + 1, k1 + 1);
    }
}


for (let i = 0; i < indices2.length; ++i) {
    // colors2[i] = Math.random(4);
    // colors2.push(0.8, 0.8, 1.0);
    // d = positions2[i]*vSteps/(2.0*Math.PI);
    // d = Math.random();
    
    
    // disco
    // const v = i * Math.PI / vSteps;    // scale to 0..2*pi
    // const cosv = Math.cos(v);
    // colors2.push(0.0, .25+cosv, 0.0, 0);    // asymetric color (every other color)


    // colors2[i] = d; //.push(0.0, d, 0.0);
}