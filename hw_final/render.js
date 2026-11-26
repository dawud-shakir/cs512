const VERTEX_SHADER = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;
in vec2 aTexCoord;

uniform mat4 uModelView;
uniform mat4 uProjection;
uniform mat4 uShadowMatrix;
uniform vec2 uTexRepeat;

out vec3 vPosition;
out vec3 vNormal;
out vec2 vTexCoord;
out vec3 vShadowCoord;

void main() {
  vec4 p = uModelView * vec4(aPosition, 1.0);
  vPosition = p.xyz;
  vNormal = transpose(inverse(mat3(uModelView))) * aNormal;
  vTexCoord = aTexCoord * uTexRepeat;
  vShadowCoord = (uShadowMatrix * vec4(aPosition, 1.0)).xyz;
  gl_Position = uProjection * p;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

const int NO_MAPPING = 0, EMISSION_MAPPING = 1, FLOOR_MAPPING = 2;
const int CIRCUIT_FLOOR = 0, CONFORMAL_FLOOR = 1, PLAIN_FLOOR = 2;
const int MAX_ARROWS = 32;
const int MAX_FIELDS = 8;
const float ARROW_FLASH = 8.0, ARROW_HALO = 0.6;
const float CONFORMAL_GAIN = 0.8, PLAIN_GRAY = 128.0 / 255.0;
const float Ka = 1.6;
const float Kd = 0.6;
const float FOG_START = 22.0, FOG_DENSITY = 0.02;

in vec3 vPosition;
in vec3 vNormal;
in vec2 vTexCoord;
in vec3 vShadowCoord;

uniform vec3 uLightDir[2];
uniform vec3 uLightColor[2];
uniform vec3 uUp;
uniform vec3 uFogColor;
uniform vec3 uBoardOrigin;
uniform vec3 uBoardX;
uniform vec3 uBoardY;
uniform vec3 uFloorNormal;
uniform vec4 uFloorRects[MAX_FIELDS];
uniform vec4 uClipPlane;
uniform vec2 uScreenSize;
uniform vec3 uFloorEmissive;
uniform vec4 uFloorRect;
uniform vec3 uArrows[MAX_ARROWS];
uniform mat3 uView;

uniform vec3 uColor;
uniform vec3 uEmissive;
uniform vec3 uTopEmissive;
uniform float uKs;
uniform float uShininess;
uniform float uReflectivity;
uniform float uMirror;
uniform float uShade;

uniform sampler2D uTexture;
uniform sampler2D uFloorTex0;
uniform sampler2D uFloorTex1;
uniform sampler2D uFloorTex2;
uniform sampler2D uReflection;
uniform samplerCube uEnvironment;
uniform highp sampler2DShadow uShadowMap;
uniform int uMapping;
uniform int uFloorStyle;

out vec4 fragColor;

vec3 calculateLight(int i, vec3 N, vec3 V, vec3 color) {
  vec3 L = normalize(uLightDir[i]);
  vec3 H = normalize(L + V);
  float diff = max(dot(N, L), 0.0);
  float spec = diff > 0.0 ? pow(max(dot(N, H), 0.0), uShininess) : 0.0;
  return uLightColor[i] * (Kd * diff * color + uKs * spec);
}

float schlick(float F0, vec3 N, vec3 V) {
  return F0 + (1.0 - F0) * pow(1.0 - max(dot(N, V), 0.0), 5.0);
}

float arrowGlowAt(vec2 p) {
  float glow = 0.0;
  for (int i = 0; i < MAX_ARROWS; i++)
    glow += uArrows[i].z * (1.0 - smoothstep(0.8, 1.0, distance(p, uArrows[i].xy)));
  return glow;
}

vec2 floorUv(vec2 uv, vec4 rect) {
  if (uFloorStyle == CIRCUIT_FLOOR) return uv;
  vec2 size = rect.zw - rect.xy;
  return 0.5 + (uv - 0.5) * vec2(size.x / size.y * uScreenSize.y / uScreenSize.x, 1.0);
}

vec3 floorEmission(vec3 texel) {
  if (uFloorStyle == CONFORMAL_FLOOR) return CONFORMAL_GAIN * texel;
  if (uFloorStyle == PLAIN_FLOOR) return uFloorEmissive * PLAIN_GRAY;
  return uFloorEmissive * texel;
}

vec3 sampleField(int idx, vec2 uv, vec2 p, float lod) {
  vec3 texel = idx == 0 ? textureLod(uFloorTex0, uv, lod).rgb
             : idx == 1 ? textureLod(uFloorTex1, uv, lod).rgb
                        : textureLod(uFloorTex2, uv, lod).rgb;
  vec3 emission = floorEmission(texel);
  float glow = arrowGlowAt(p);
  return emission * (1.0 + ARROW_FLASH * glow) + ARROW_HALO * glow * uFloorEmissive;
}

vec3 playfield(vec3 R) {
  vec3 n = uFloorNormal;
  float denom = dot(R, n);
  if (denom >= -1e-4) return vec3(0.01);
  float t = dot(uBoardOrigin - vPosition, n) / denom;
  if (t <= 0.0) return vec3(0.01);
  vec3 h = vPosition + t * R - uBoardOrigin;
  vec2 p = vec2(dot(h, uBoardX), dot(h, uBoardY));
  float lod = log2(1.0 + t * 0.2);
  float rd = FOG_DENSITY * max(t - FOG_START * 0.5, 0.0);
  float atten = exp(-rd * rd);
  for (int i = 0; i < MAX_FIELDS; i++) {
    vec4 r = uFloorRects[i];
    if (all(greaterThanEqual(p, r.xy)) && all(lessThanEqual(p, r.zw))) {
      vec2 uv = (p - r.xy) / (r.zw - r.xy);
      return mix(uFogColor, sampleField(i % 3, floorUv(uv, r), p, lod), atten);
    }
  }
  return vec3(0.01);
}

vec3 environment(vec3 R) {
  float h = dot(R, uFloorNormal);
  vec3 scene = texture(uEnvironment, transpose(uView) * R).rgb;
  if (h > 0.0) return scene;
  return mix(scene, playfield(R), smoothstep(0.0, 0.25, -h));
}

vec3 reflection(vec2 uv) {
  vec2 h = 1.0 / vec2(textureSize(uReflection, 0));
  return 0.25 * (texture(uReflection, uv + h).rgb + texture(uReflection, uv - h).rgb
               + texture(uReflection, uv + vec2(h.x, -h.y)).rgb + texture(uReflection, uv - vec2(h.x, -h.y)).rgb);
}

void main() {
  if (dot(uClipPlane, vec4(vPosition, 1.0)) < 0.0) discard;
  vec3 N = normalize(vNormal);
  vec3 V = normalize(-vPosition);
  float depthTest = texture(uShadowMap, vShadowCoord);
  bool inShadowMap = all(greaterThan(vShadowCoord, vec3(0.0))) && all(lessThan(vShadowCoord, vec3(1.0)));
  float shadow = inShadowMap ? smoothstep(0.3, 0.7, depthTest) : 1.0;

  vec3 result = Ka * uFogColor * uColor;
  result += shadow * calculateLight(0, N, V, uColor);
  result += calculateLight(1, N, V, uColor);

  if (uReflectivity > 0.0)
    result += schlick(uReflectivity, N, V) * environment(reflect(-V, N));

  vec2 uv = uMapping == FLOOR_MAPPING ? floorUv(vTexCoord, uFloorRect) : vTexCoord;
  vec3 texel = texture(uTexture, uv).rgb;
  vec3 emission = uMapping == NO_MAPPING ? uEmissive : uEmissive * texel;
  if (uMapping == FLOOR_MAPPING) {
    emission = floorEmission(texel);
    float glow = arrowGlowAt(mix(uFloorRect.xy, uFloorRect.zw, vTexCoord));
    emission = emission * (1.0 + ARROW_FLASH * glow) + ARROW_HALO * glow * uEmissive;
  }
  result += emission + uTopEmissive * smoothstep(0.7, 0.9, dot(N, uUp));

  result *= mix(1.0 - uShade, 1.0, shadow);
  float d = FOG_DENSITY * max(length(vPosition) - FOG_START, 0.0);
  vec3 mirror = uMirror > 0.0 ? schlick(uMirror, N, V) * reflection(gl_FragCoord.xy / uScreenSize) : vec3(0.0);
  fragColor = vec4(mix(uFogColor, result, exp(-d * d)) + mirror, 1.0);
}
`;


//now runs on gpu becasue the js version was too slow - 
//######################################################################
// ============================================================
// 1. SHADERS
// ============================================================

//Fullscreen triangle, generated without a vertex buffer.
//Extends triangle past screenspace to cover whole viewport
const ESCHER_VERTEX_SHADER = `#version 300 es

void main() {
    vec2 p = vec2(
        (gl_VertexID << 1) & 2,
        gl_VertexID & 2
    );

    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

const ESCHER_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D uScene;
uniform vec2 uResolution;
uniform vec2 uPivot;

uniform float uAngle;
uniform float uArms;
uniform float uStrength;
uniform float uRepeat;
uniform float uFrameScale;

out vec4 fragColor;

// -----------------------------
// Complex number operations
// -----------------------------

vec2 logZ(vec2 z) {
    return vec2(
        log(max(length(z), 1e-8)),
        atan(z.y, z.x)
    );
}

vec2 expZ(vec2 z) {
    return exp(z.x) * vec2(cos(z.y), sin(z.y));
}

vec2 rotateZ(vec2 z, float angle) {
    float c = cos(angle);
    float s = sin(angle);

    return vec2(
        c*z.x - s*z.y,
        s*z.x + c*z.y
    );
}

//Log(z) transform from 3bluonebrown video
vec2 mapZ(vec2 z) {
    float R = 0.7;

    //Map into logarithmic coordinates.
    vec2 w = logZ(z / R);

    //Rotate and scale in log space.
    vec2 mapped = rotateZ(w, -uAngle) * uArms;

    //Interpolate between original and mapped.
    w = mix(w, mapped, clamp(uStrength, 0.0, 1.0));

    //Radial repetition for recursive copies.
    if (uRepeat > 1.0) {
        float period = log(uRepeat);
        w.x = -mod(-w.x, period);
    }

    //Return to the complex plane.
    return R * expZ(w);
}

void main() {
    //Screen coordinates -> complex plane.
    //Dividing by height preserves aspect ratio.
    vec2 z = (gl_FragCoord.xy - uPivot * uResolution)
             / uResolution.y;

    //Apply the mathematical transformation.
    vec2 t = mapZ(z);

    //Complex plane -> texture coordinates.
    vec2 uv = uPivot + uFrameScale * vec2(
        t.x * uResolution.y / uResolution.x,
        t.y
    );

    fragColor = texture(uScene, uv);
}
`;


// ============================================================
// 2. WEBGL RESOURCE SETUP
// ============================================================

let escher = null;

//Compile an individual shader.
function compileEscherShader(type, source) {
    const shader = gl.createShader(type);

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const error = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(error);
    }

    return shader;
}

//Create a regular reusable 2D WebGL texture.
function createEscherTexture() {
    const tex = gl.createTexture();

    gl.bindTexture(gl.TEXTURE_2D, tex);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    //CLAMP_TO_EDGE keeps sampling within the image boundaries.
    //The texture() call therefore needs no explicit UV clamp.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    return tex;
}

//Called only once.
function initEscherGPU() {
    //Create shader program.
    const vs = compileEscherShader(
        gl.VERTEX_SHADER, ESCHER_VERTEX_SHADER
    );

    const fs = compileEscherShader(
        gl.FRAGMENT_SHADER, ESCHER_FRAGMENT_SHADER
    );

    const program = gl.createProgram();

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program));
    }

    gl.deleteShader(vs);
    gl.deleteShader(fs);

    //Cache uniform locations so they are not queried every frame.
    const uniforms = {};
    const names = [
        "uScene", "uResolution", "uPivot",
        "uAngle", "uArms", "uStrength",
        "uRepeat", "uFrameScale"
    ];

    for (const name of names) {
        uniforms[name] = gl.getUniformLocation(program, name);
    }

    //Source is the unmodified scene.
    //Output holds the transformed scene.
    const source = createEscherTexture();
    const output = createEscherTexture();

    /*
     * WebGL documentation: framebufferTexture2D()
     *
     * Attaches a texture to a framebuffer. Drawing to that
     * framebuffer writes pixels into the attached texture.
     *
     * https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/framebufferTexture2D
     */
    const fbo = gl.createFramebuffer();

    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fbo);

    gl.framebufferTexture2D(
        gl.DRAW_FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        output,
        0
    );

    /*
     * WebGL documentation: bindVertexArray()
     *
     * VAOs store vertex-array configuration. This shader uses
     * gl_VertexID instead of vertex attributes, so an empty
     * VAO is sufficient.
     *
     * https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/bindVertexArray
     */
    const vao = gl.createVertexArray();

    return {
        program,
        uniforms,
        source,
        output,
        fbo,
        vao,
        width: 0,
        height: 0
    };
}


// ============================================================
// 3. APPLY TRANSFORMATION
// ============================================================

function applyEscherGPU({
    angle = 0.10,
    arms = 4.0,
    strength = 0.75,
    repeat = 5.0,
    frameScale = 0.52,
    pivot = [0.5, 0.5],
    show = true
} = {}) {

    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;

    //Save the state needed to avoid interfering with
    //the rest of the game's WebGL rendering.
    const previous = {
        read: gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),
        draw: gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),
        viewport: gl.getParameter(gl.VIEWPORT),
        program: gl.getParameter(gl.CURRENT_PROGRAM),
        vao: gl.getParameter(gl.VERTEX_ARRAY_BINDING),
        activeTexture: gl.getParameter(gl.ACTIVE_TEXTURE),
        colorMask: gl.getParameter(gl.COLOR_WRITEMASK)
    };

    const flags = [
        gl.DEPTH_TEST,
        gl.BLEND,
        gl.SCISSOR_TEST,
        gl.CULL_FACE,
        gl.STENCIL_TEST,
        gl.RASTERIZER_DISCARD
    ];

    const enabled = flags.map(flag => gl.isEnabled(flag));

    gl.activeTexture(gl.TEXTURE0);
    const oldTexture = gl.getParameter(gl.TEXTURE_BINDING_2D);

    try {
        if (!escher) {
            escher = initEscherGPU();
        }

        const e = escher;

        // ----------------------------------------
        // Resize textures if canvas size changed.
        // ----------------------------------------

        if (w !== e.width || h !== e.height) {
            e.width = w;
            e.height = h;

            /*
             * texImage2D() allocates texture image storage.
             *
             * Passing null for pixel data allocates the image
             * without uploading any pixels from the CPU.
             *
             * RGBA8 is a sized internal format in WebGL2.
             *
             * https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/texImage2D
             */
            for (const tex of [e.source, e.output]) {
                gl.bindTexture(gl.TEXTURE_2D, tex);

                gl.texImage2D(
                    gl.TEXTURE_2D,
                    0,
                    gl.RGBA8,
                    w, h,
                    0,
                    gl.RGBA,
                    gl.UNSIGNED_BYTE,
                    null
                );
            }

            /*
             * checkFramebufferStatus() reports whether a
             * framebuffer has complete, usable attachments.
             *
             * Check after allocating/resizing the output
             * texture because the FBO refers to that texture.
             *
             * https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/checkFramebufferStatus
             */
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, e.fbo);

            if (gl.checkFramebufferStatus(gl.DRAW_FRAMEBUFFER)
                    !== gl.FRAMEBUFFER_COMPLETE) {
                throw new Error("Escher framebuffer is incomplete");
            }
        }

        // ----------------------------------------
        // Copy screen -> source texture.
        // ----------------------------------------


        //Use a supplied texture, or capture the canvas.
        let source = null;

        if (!source) {
            /*
            * copyTexSubImage2D() copies pixels from the
            * current READ_FRAMEBUFFER into an existing texture.
            *
            * https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/copyTexSubImage2D
            */
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
            gl.bindTexture(gl.TEXTURE_2D, e.source);

            gl.copyTexSubImage2D(
                gl.TEXTURE_2D,
                0,
                0, 0,
                0, 0,
                w, h
            );

            source = e.source;
        }

        // Prevent reading and writing the same texture.
        if (source === e.output) {
            throw new Error("Cannot use Escher output as its own input");
        }

        // ----------------------------------------
        // Render source -> output texture.
        // ----------------------------------------

        /*
         * In WebGL2, READ_FRAMEBUFFER and DRAW_FRAMEBUFFER
         * can be bound independently.
         *
         * Binding the FBO as DRAW_FRAMEBUFFER sends fragment
         * shader output into its attached output texture.
         *
         * https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/bindFramebuffer
         */
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, e.fbo);

        gl.viewport(0, 0, w, h);

        //Fullscreen post-processing shouldn't be affected
        //by depth, blending, clipping, or stencil state.
        flags.forEach(flag => gl.disable(flag));
        gl.colorMask(true, true, true, true);

        gl.useProgram(e.program);
        gl.bindVertexArray(e.vao);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, source);

        //Set shader parameters.
        const u = e.uniforms;

        gl.uniform1i(u.uScene, 0);
        gl.uniform2f(u.uResolution, w, h);
        gl.uniform2f(u.uPivot, pivot[0], pivot[1]);

        gl.uniform1f(u.uAngle, angle);
        gl.uniform1f(u.uArms, arms);
        gl.uniform1f(u.uStrength, strength);
        gl.uniform1f(u.uRepeat, repeat);
        gl.uniform1f(u.uFrameScale, frameScale);

        // Draw a fullscreen triangle.
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        // ----------------------------------------
        // Optionally display the result.
        // ----------------------------------------

        if (show) {
            /*
             * blitFramebuffer() transfers a rectangular block
             * of pixels from the read framebuffer to the draw
             * framebuffer.
             *
             * Here:
             *   READ = transformed texture's framebuffer
             *   DRAW = default canvas framebuffer
             *
             * This displays the texture without another shader.
             *
             * https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/blitFramebuffer
             */
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, e.fbo);
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);

            gl.blitFramebuffer(
                0, 0, w, h,
                0, 0, w, h,
                gl.COLOR_BUFFER_BIT,
                gl.NEAREST
            );
        }

        return e.output;

    } finally {
        //Restore previous bindings and rendering state.
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, previous.read);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, previous.draw);

        gl.viewport(...previous.viewport);
        gl.useProgram(previous.program);
        gl.bindVertexArray(previous.vao);
        gl.colorMask(...previous.colorMask);

        flags.forEach((flag, i) => {
            if (enabled[i]) gl.enable(flag);
            else gl.disable(flag);
        });

        gl.bindTexture(gl.TEXTURE_2D, oldTexture);
        gl.activeTexture(previous.activeTexture);
    }
}

const SHADOW_VERTEX_SHADER = `#version 300 es
in vec3 aPosition;
uniform mat4 uLightMVP;

void main() {
  gl_Position = uLightMVP * vec4(aPosition, 1.0);
}
`;

const SHADOW_FRAGMENT_SHADER = `#version 300 es
precision mediump float;
void main() {}
`;

const TRAIL_VERTEX_SHADER = `#version 300 es
in vec3 aPosition;
in vec2 aTexCoord;

uniform mat4 uModelView;
uniform mat4 uProjection;

out vec2 vTexCoord;

void main() {
  vTexCoord = aTexCoord;
  gl_Position = uProjection * uModelView * vec4(aPosition, 1.0);
}
`;

const TRAIL_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vTexCoord;

uniform vec3 uColor;

out vec4 fragColor;

void main() {
  float fade = 1.0 - vTexCoord.x;
  float core = 1.0 - vTexCoord.y * vTexCoord.y;
  fragColor = vec4(uColor * core * fade * fade, 1.0);
}
`;

const SKY_VERTEX_SHADER = `#version 300 es
const vec2 corners[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));

uniform mat4 uView;
uniform mat4 uProjection;

out vec3 vDirection;
out vec3 vOrigin;

void main() {
  vec2 p = corners[gl_VertexID];
  vec4 eye = inverse(uProjection) * vec4(p, 1.0, 1.0);
  vDirection = transpose(mat3(uView)) * (eye.xyz / eye.w);
  vOrigin = -transpose(mat3(uView)) * uView[3].xyz;
  gl_Position = vec4(p, 1.0, 1.0);
}
`;

const SKY_FRAGMENT_SHADER2 = `#version 300 es
precision highp float;

const float STAR_BRIGHTNESS = 4.0;
const float CEILING_HEIGHT = 12.0, CEILING_CELL = 4.0, CEILING_GLOW = 0.6, HORIZON_GLOW = 1.5;

in vec3 vDirection;
in vec3 vOrigin;

uniform vec3 uFogColor;
uniform vec3 uSkyColor;
uniform vec3 uGridColor;
uniform float uTime;
uniform float uStarScale;

out vec4 fragColor;

float ceiling(vec3 d) {
  float t = (CEILING_HEIGHT - vOrigin.z) / max(d.z, 0.001);
  vec2 p = (vOrigin.xy + d.xy * t) / CEILING_CELL;
  vec2 a = abs(fract(p + 0.5) - 0.5) / fwidth(p);
  return (1.0 - min(min(a.x, a.y), 1.0)) * smoothstep(0.0, 0.25, d.z) * smoothstep(0.0, 4.0, CEILING_HEIGHT - vOrigin.z);
}

float stars(vec3 d) {
  vec3 p = d * uStarScale;
  vec3 cell = floor(p);
  float h = fract(sin(dot(cell, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  float r = length(p - cell - 0.5);
  float twinkle = 0.7 + 0.3 * sin(uTime * 3.0 + h * 100.0);
  return step(0.985, h) * smoothstep(0.0, 0.3, d.z) * smoothstep(0.3, 0.0, r) * twinkle;
}

void main() {
  vec3 d = normalize(vDirection);
  vec3 color = mix(uFogColor, uSkyColor, smoothstep(0.0, 0.5, d.z));
  color += HORIZON_GLOW * uFogColor * exp(-8.0 * abs(d.z));
  color += CEILING_GLOW * uGridColor * ceiling(d);
  fragColor = vec4(color + STAR_BRIGHTNESS * vec3(stars(d)), 1.0);
}
`;

const POST_VERTEX_SHADER = `#version 300 es
const vec2 corners[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
out vec2 vUv;

void main() {
  vec2 p = corners[gl_VertexID];
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

const SKY_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;
uniform sampler2D uSky;

out vec4 fragColor;

void main() {
    fragColor = texture(uSky, vUv);
}
`;

const BLUR_FRAGMENT_SHADER = `#version 300 es
precision highp float;

// Precomputed weights for a 9-sample Gaussian blur

const float WEIGHTS[5] = float[5](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216); 
in vec2 vUv;

uniform sampler2D uImage;
uniform vec2 uStep;
uniform float uThreshold;

out vec4 fragColor;

vec3 bright(vec2 uv) {
  return max(texture(uImage, uv).rgb - uThreshold, 0.0);
}

void main() {
  vec3 sum = WEIGHTS[0] * bright(vUv);
  for (int i = 1; i < 5; i++)
    sum += WEIGHTS[i] * (bright(vUv + float(i) * uStep) + bright(vUv - float(i) * uStep));
  fragColor = vec4(sum, 1.0);
}
`;

const COMPOSITE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

const float EXPOSURE = 1.4;

in vec2 vUv;

uniform sampler2D uScene;
uniform sampler2D uBloom0;
uniform sampler2D uBloom1;
uniform sampler2D uBloom2;
uniform sampler2D uBloom3;
uniform float uBloomStrength;

out vec4 fragColor;

void main() {
  vec3 bloom = texture(uBloom0, vUv).rgb + texture(uBloom1, vUv).rgb
             + texture(uBloom2, vUv).rgb + texture(uBloom3, vUv).rgb;
  vec3 hdr = EXPOSURE * (texture(uScene, vUv).rgb + uBloomStrength * bloom);
  vec2 c = vUv - 0.5;
  fragColor = vec4(hdr / (1.0 + hdr) * (1.0 - 0.6 * dot(c, c)), 1.0);
}
`;

const NO_MAPPING = 0, EMISSION_MAPPING = 1, FLOOR_MAPPING = 2;
const CIRCUIT_FLOOR = 0, CONFORMAL_FLOOR = 1, PLAIN_FLOOR = 2;
const MAX_ARROWS = 32, MAX_FIELDS = 8;

const LIGHTS = [
  { pos: [-22, 8, 22], color: [0.55, 0.65, 0.85] },
  { pos: [10, -8, 14], color: [0.12, 0.16, 0.28] },
];

const PALETTES = [
  { fog: [0.03, 0.12, 0.32], sky: [0.0, 0.02, 0.08], rail: [0.8, 2.6, 5.0], flipper: [2.2, 4.4, 5.0], bumper: [0.6, 1.8, 5.0],
    insert: [0.5, 1.6, 3.6], grid: [0.1, 0.4, 0.9], trail: [2.0, 4.5, 7.0], block: [0.05, 0.2, 0.48] },
  { fog: [0.13, 0.02, 0.12], sky: [0.03, 0.0, 0.03], rail: [1.0, 3.6, 4.2], flipper: [1.6, 4.4, 4.8], bumper: [5.0, 0.8, 3.2],
    insert: [3.0, 0.4, 1.8], grid: [0.9, 0.12, 0.6], trail: [7.0, 2.6, 5.4], block: [0.48, 0.07, 0.38] },
  { fog: [0.16, 0.06, 0.01], sky: [0.04, 0.01, 0.0], rail: [5.0, 2.0, 0.4], flipper: [5.0, 4.0, 1.0], bumper: [5.0, 1.4, 0.3],
    insert: [3.0, 1.2, 0.2], grid: [0.9, 0.35, 0.06], trail: [7.0, 4.6, 1.6], block: [0.48, 0.19, 0.04] },
];

const SHADOW_MAP_SIZE = 2048;
const ENVIRONMENT_SIZE = 128;
const STAR_SCALE = 150, ENVIRONMENT_STAR_SCALE = 16;
const CUBE_FACES = [
  { dir: [1, 0, 0], up: [0, -1, 0] },
  { dir: [-1, 0, 0], up: [0, -1, 0] },
  { dir: [0, 1, 0], up: [0, 0, 1] },
  { dir: [0, -1, 0], up: [0, 0, -1] },
  { dir: [0, 0, 1], up: [0, -1, 0] },
];
const BLOOM_LEVELS = 4, BLOOM_THRESHOLD = 1.0;
const TRAIL_LENGTH = 40, TRAIL_WIDTH = 0.4, TRAIL_HEIGHT = 0.25;

const CABINET = {
  rim: 1.2,
  front: -2.5,
  wallTop: 1.2,
  floor: -0.6,
  base: -1.4,
};
const WALL_HEIGHT = 1.0, WALL_THICK = 0.32;
const FLIPPER_HEIGHT = 0.65;
const COIL_RINGS = 6, COIL_START = 1.9, COIL_SPACING = 0.9, COIL_RADIUS = 0.62;
const FIELD_FLOORS = ["textures/neon/playfield.png", "textures/neon/field2.png", "textures/neon/field3.png"];
const NO_CLIP = [0, 0, 0, 1];

const GROUND = { x0: -100, y0: -90, x1: 120, y1: 150, z: -12, cell: 4 };
const BLOCKS = [
  [-15, -4, -7, 6, 2.5], [-11, 9, -4, 17, 5], [-18, 14, -12, 26, 8], [-9, 22, -4, 30, 3.5], [-16, 31, -6, 40, 6],
  [24, -2, 31, 7, 4], [25, 10, 33, 20, 7], [30, 22, 38, 30, 3], [25, 28, 31, 38, 5],
  [-8, 50, -2, 58, 4], [21, 57, 28, 64, 7], [21, 43, 30, 54, 3], [-20, 46, -10, 58, 9], [34, 40, 44, 50, 10],
  [-14, 64, -6, 74, 6], [24, 68, 33, 78, 4], [-20, 78, -10, 90, 9], [22, 84, 32, 92, 6],
  [2, 88, 10, 96, 5], [12, 86, 20, 94, 8], [-10, 96, 0, 104, 4], [24, 98, 34, 108, 7],
];

const CAMERA = {
  wide: { eye: [0, -37, 29], target: [0, -4, 0] },
  tall: { eye: [0, -24, 42], target: [0, -2.5, 0] },
};

const canvas = document.getElementById("glcanvas");
const gl = canvas.getContext("webgl2", { powerPreference: "high-performance" });
if (!gl) throw new Error("WebGL 2 is not supported");
if (!gl.getExtension("EXT_color_buffer_float")) throw new Error("EXT_color_buffer_float is not supported");

function compile(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

const ATTRIBUTES = { aPosition: 0, aNormal: 1, aTexCoord: 2 };

function createProgram(vsSource, fsSource) {
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSource));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSource));
  for (const name in ATTRIBUTES) gl.bindAttribLocation(prog, ATTRIBUTES[name], name);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  return prog;
}

function getUniforms(prog, names) {
  const uniforms = {};
  for (const name of names) uniforms[name] = gl.getUniformLocation(prog, name);
  return uniforms;
}

const program = createProgram(VERTEX_SHADER, FRAGMENT_SHADER);
const uniforms = getUniforms(program, ["uModelView", "uProjection", "uShadowMatrix", "uTexRepeat", "uLightDir",
  "uLightColor", "uUp", "uFogColor", "uColor", "uEmissive", "uTopEmissive", "uKs", "uShininess",
  "uReflectivity", "uMirror", "uShade", "uMapping", "uTexture", "uShadowMap", "uBoardOrigin", "uBoardX", "uBoardY",
  "uFloorNormal", "uFloorRects", "uFloorEmissive", "uFloorTex0", "uFloorTex1", "uFloorTex2", "uClipPlane",
  "uScreenSize", "uReflection", "uFloorRect", "uArrows", "uView", "uEnvironment", "uFloorStyle"]);
gl.useProgram(program);
gl.uniform1i(uniforms.uTexture, 0);
gl.uniform1i(uniforms.uShadowMap, 1);
gl.uniform1i(uniforms.uFloorTex0, 2);
gl.uniform1i(uniforms.uReflection, 3);
gl.uniform1i(uniforms.uFloorTex1, 4);
gl.uniform1i(uniforms.uFloorTex2, 5);
gl.uniform1i(uniforms.uEnvironment, 6);

const shadowProgram = createProgram(SHADOW_VERTEX_SHADER, SHADOW_FRAGMENT_SHADER);
const uLightMVP = gl.getUniformLocation(shadowProgram, "uLightMVP");

const trailProgram = createProgram(TRAIL_VERTEX_SHADER, TRAIL_FRAGMENT_SHADER);
const trailUniforms = getUniforms(trailProgram, ["uModelView", "uProjection", "uColor"]);


//Original procedural sky
const skyProgram = createProgram(
    SKY_VERTEX_SHADER,
    SKY_FRAGMENT_SHADER2
);

const skyUniforms = getUniforms(skyProgram, [
    "uView", "uProjection", "uFogColor",
    "uSkyColor", "uGridColor", "uTime", "uStarScale"
]);

//Conformally transformed sky texture
const textureSkyProgram = createProgram(
    POST_VERTEX_SHADER,
    SKY_FRAGMENT_SHADER
);

const textureSkyUniforms = getUniforms(
    textureSkyProgram,
    ["uSky"]
);

const blurProgram = createProgram(POST_VERTEX_SHADER, BLUR_FRAGMENT_SHADER);
const blurUniforms = getUniforms(blurProgram, ["uImage", "uStep", "uThreshold"]);
gl.useProgram(blurProgram);
gl.uniform1i(blurUniforms.uImage, 0);

const compositeProgram = createProgram(POST_VERTEX_SHADER, COMPOSITE_FRAGMENT_SHADER);
const compositeUniforms = getUniforms(compositeProgram, ["uScene", "uBloom0", "uBloom1", "uBloom2", "uBloom3", "uBloomStrength"]);

gl.useProgram(compositeProgram);
["uScene", "uBloom0", "uBloom1", "uBloom2", "uBloom3"].forEach((name, i) => gl.uniform1i(compositeUniforms[name], i));
gl.uniform1f(compositeUniforms.uBloomStrength, 0.35);

const shadowMap = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, shadowMap);
gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
const shadowFramebuffer = gl.createFramebuffer();
gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFramebuffer);
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shadowMap, 0);

function createTarget() {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  return { texture, framebuffer, width: 1, height: 1 };
}

function createRenderbuffer() {
  const renderbuffer = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);
  return renderbuffer;
}

const sceneTarget = createTarget();
const bloomLevels = [];
for (let i = 0; i < BLOOM_LEVELS; i++) bloomLevels.push({ temp: createTarget(), blur: createTarget() });

const colorRenderbuffer = createRenderbuffer();
const depthRenderbuffer = createRenderbuffer();
const supportedSamples = gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA16F, gl.SAMPLES);
const samples = Math.min(4, supportedSamples && supportedSamples.length ? supportedSamples[0] : 0);
const msaaFramebuffer = gl.createFramebuffer();
gl.bindFramebuffer(gl.FRAMEBUFFER, msaaFramebuffer);
gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, colorRenderbuffer);
gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRenderbuffer);

const reflectionTarget = createTarget();
const reflectionDepth = createRenderbuffer();
gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, reflectionDepth);

const environmentMap = gl.createTexture();
gl.bindTexture(gl.TEXTURE_CUBE_MAP, environmentMap);
gl.texStorage2D(gl.TEXTURE_CUBE_MAP, 1, gl.RGBA16F, ENVIRONMENT_SIZE, ENVIRONMENT_SIZE);
gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
const environmentFramebuffer = gl.createFramebuffer();
gl.bindFramebuffer(gl.FRAMEBUFFER, environmentFramebuffer);
const environmentDepth = createRenderbuffer();
gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, ENVIRONMENT_SIZE, ENVIRONMENT_SIZE);
gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, environmentDepth);
gl.bindFramebuffer(gl.FRAMEBUFFER, null);

function sizeTarget(target, w, h) {
  target.width = w;
  target.height = h;
  gl.bindTexture(gl.TEXTURE_2D, target.texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
}

function resizeTargets(w, h) {
  gl.bindRenderbuffer(gl.RENDERBUFFER, colorRenderbuffer);
  gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA16F, w, h);
  gl.bindRenderbuffer(gl.RENDERBUFFER, depthRenderbuffer);
  gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h);
  sizeTarget(reflectionTarget, Math.max(1, w >> 1), Math.max(1, h >> 1));
  gl.bindRenderbuffer(gl.RENDERBUFFER, reflectionDepth);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, reflectionTarget.width, reflectionTarget.height);
  sizeTarget(sceneTarget, w, h);
  bloomLevels.forEach((level, i) => {
    const lw = Math.max(1, w >> (i + 1)), lh = Math.max(1, h >> (i + 1));
    sizeTarget(level.temp, lw, lh);
    sizeTarget(level.blur, lw, lh);
  });
}

function resolveScene() {
  const w = canvas.width, h = canvas.height;
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msaaFramebuffer);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, sceneTarget.framebuffer);
  gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
}

function bindAttribute(name, data, size) {
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.vertexAttribPointer(ATTRIBUTES[name], size, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(ATTRIBUTES[name]);
}

function createMesh({ positions, normals, texCoords, indices }) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  bindAttribute("aPosition", positions, 3);
  bindAttribute("aNormal", normals, 3);
  bindAttribute("aTexCoord", texCoords, 2);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  return { vao, count: indices.length };
}

const cubeMesh = createMesh(createCube());
const cylinderMesh = createMesh(createCylinder(32));
const sphereMesh = createMesh(createSphere(32));
const torusMesh = createMesh(createTorus(32, 12, 0.12));
const flipperMeshes = new Map();
function getFlipperMesh(f) {
  const key = `${f.length}:${f.radius}`;
  let mesh = flipperMeshes.get(key);
  if (!mesh) {
    mesh = createMesh(createFlipper(f.length, f.radius, 16));
    flipperMeshes.set(key, mesh);
  }
  return mesh;
}

function collectWallPosts() {
  const seen = new Map();
  for (const w of table.walls) {
    if (w.hidden) continue;
    for (const p of [w.a, w.b]) {
      const key = `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)}`;
      if (!seen.has(key)) seen.set(key, p);
    }
  }
  return [...seen.values()];
}
let wallPosts = collectWallPosts();

function createTrailBuffer(name, size) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, TRAIL_LENGTH * 2 * size * 4, gl.DYNAMIC_DRAW);
  gl.vertexAttribPointer(ATTRIBUTES[name], size, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(ATTRIBUTES[name]);
  return buffer;
}

const trailVao = gl.createVertexArray();
gl.bindVertexArray(trailVao);
const trailPositionBuffer = createTrailBuffer("aPosition", 3);
const trailTexCoordBuffer = createTrailBuffer("aTexCoord", 2);
gl.bindVertexArray(null);
const trailPositions = new Float32Array(TRAIL_LENGTH * 6);
const trailTexCoords = new Float32Array(TRAIL_LENGTH * 4);
const trail = [];

function loadTexture(url) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255]));

  const image = new Image();
  image.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);  // images start at the top row, texture coordinates at the bottom
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  };
  image.src = url;
  return texture;
}

const fieldTextures = FIELD_FLOORS.map(loadTexture);
const gridTexture = loadTexture("textures/neon/grid.png");

//skytexture
const skyTexture = loadTexture("textures/neon/sky.png");

const palette = structuredClone(PALETTES[0]);

const MATERIALS = {
  playfield: { color: [0.04, 0.05, 0.08], ks: 0.5, shininess: 40, emissive: palette.insert },
  ground: { color: [0.02, 0.025, 0.04], ks: 0.2, shininess: 16, emissive: palette.grid, shade: 0.75, texture: gridTexture,
            repeat: [(GROUND.x1 - GROUND.x0) / GROUND.cell, (GROUND.y1 - GROUND.y0) / GROUND.cell] },
  block: { color: [0.06, 0.075, 0.1], ks: 0.2, shininess: 16, top: palette.block, shade: 0.75 },
  cabinet: { color: [0.03, 0.035, 0.05], ks: 0.4, shininess: 40 },
  rail: { color: [0.05, 0.05, 0.06], ks: 0.4, shininess: 40, emissive: palette.rail },
  wall: { color: [0.05, 0.06, 0.09], ks: 0.6, shininess: 60, top: palette.rail },
  bumper: { color: [0.05, 0.06, 0.09], ks: 0.6, shininess: 60 },
  bumperRing: { color: [0, 0, 0], ks: 0, shininess: 1, emissive: palette.bumper },
  bumperCap: { color: [0.05, 0.06, 0.09], ks: 0.6, shininess: 60, top: palette.bumper },
  flipper: { color: [0.1, 0.1, 0.1], ks: 0.4, shininess: 40, emissive: palette.flipper },
  coil: { color: [0.05, 0.05, 0.06], ks: 0.6, shininess: 60, emissive: palette.flipper },
  rubber: { color: [0.03, 0.03, 0.04], ks: 0.2, shininess: 24 },
  ball: { color: [0.2, 0.22, 0.26], ks: 1.2, shininess: 160, reflect: 0.8 },
  steel: { color: [0.15, 0.16, 0.18], ks: 0.8, shininess: 80, reflect: 0.4 },
};

function fieldMaterial(i) {
  return { ...MATERIALS.playfield, texture: fieldTextures[i % fieldTextures.length], mirror: true, rect: floorRect(i) };
}
let fieldMaterials = table.fields.map((_, i) => fieldMaterial(i));

const smoothFactor = (rate60, dt) => 1 - Math.pow(1 - rate60, dt * 60);

function updatePalette(dt, paletteOverride = -1) {
  const idx = paletteOverride >= 0 ? paletteOverride : clamp(3 - game.balls, 0, PALETTES.length - 1);
  const target = PALETTES[idx];
  const t = smoothFactor(0.04, dt);
  for (const key in palette)
    palette[key].forEach((v, i) => { palette[key][i] = v + (target[key][i] - v) * t; });
}

gl.enable(gl.DEPTH_TEST);

const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const add = (a, b) => a.map((v, i) => v + b[i]);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rect = f => [f.x0, f.y0, f.x1, f.y1];
const center = ([x0, y0, x1, y1]) => [(x0 + x1) / 2, (y0 + y1) / 2, 0];

function fitCorners([x0, y0, x1, y1]) {
  const corners = [];
  for (const x of [x0 - CABINET.rim, x1 + CABINET.rim])
    for (const y of [y0 + CABINET.front, y1 + CABINET.rim])
      for (const z of [CABINET.base, CABINET.wallTop]) corners.push([x, y, z]);
  return corners;
}

function fitProjection(view, W, H, insets, corners, zoom) {
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (const c of corners) {
    const [x, y, z] = transformPoint(view, c);
    xmin = Math.min(xmin, x / -z); xmax = Math.max(xmax, x / -z);
    ymin = Math.min(ymin, y / -z); ymax = Math.max(ymax, y / -z);
  }
  const margin = 1.04, usable = H - insets.top - insets.bottom;
  const fit = Math.max((xmax - xmin) * margin / W, (ymax - ymin) * margin / usable);
  const s = fit / zoom, slack = Math.max(0, fit - s);
  const cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2;
  const [bx, by, bz] = transformPoint(multiply(view, board), [game.ball.p[0], game.ball.p[1], BALL_RADIUS]);
  const fx = clamp(bx / -bz, cx - slack * W / 2, cx + slack * W / 2);
  const fy = clamp(by / -bz, cy - slack * usable / 2, cy + slack * usable / 2);
  const bottom = fy - s * (insets.bottom + usable / 2);
  return frustum(fx - s * W / 2, fx + s * W / 2, bottom, bottom + s * H, 1, 200);
}

let chaseEye = null, chaseTarget = null, cameraRect = null;
let orbitYaw = 0, orbitPitch = 0, orbitElevation = 0;

function orbitCamera(dx, dy) {
  orbitYaw -= Math.sin(Math.cos(orbitElevation) || 1) * dx * 0.01;
  orbitPitch += dy * 0.01;
}

function orbit(eye, target, pivot) {
  const [x, y, z] = eye.map((v, i) => v - pivot[i]);
  const base = Math.atan2(z, Math.hypot(x, y));
  orbitElevation = clamp(base + orbitPitch, 0, Math.PI);
  orbitPitch = orbitElevation - base;
  const m = multiply(translate(...pivot), rotateZ(orbitYaw), rotateX(-orbitPitch), translate(-pivot[0], -pivot[1], -pivot[2]));
  return lookAt(transformPoint(m, eye), transformPoint(m, target), transformDirection(m, [0, 0, 1]));
}

function chaseView(dt) {
  const [x, y] = game.ball.p, vx = game.ball.v[0];
  const eye = [x + vx * 0.02, y - 3.2, 1.85], target = [x + vx * 0.08, y + 5, 0.4];
  const t = smoothFactor(0.22, dt);
  chaseEye = chaseEye ? lerp(chaseEye, eye, t) : eye;
  chaseTarget = chaseTarget ? lerp(chaseTarget, target, t) : target;
  return orbit(transformPoint(board, chaseEye), transformPoint(board, chaseTarget), transformPoint(board, [x, y, BALL_RADIUS]));
}

const TABLE_CENTER = center(rect(table.fields[0]));
const lightView = lookAt(LIGHTS[0].pos, TABLE_CENTER, [0, 0, 1]);
const lightDir = TABLE_CENTER.map((v, i) => v - LIGHTS[0].pos[i]);

function lightProjection() {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const [x, y, z] of table.fields.flatMap(f => fitCorners(rect(f))))
    for (const dy of [0, -1.5]) {
      const p = transformPoint(board, [x, y + dy, z]);
      const t = (GROUND.z - p[2]) / lightDir[2];
      for (const q of [p, p.map((v, i) => v + t * lightDir[i])]) {
        const l = transformPoint(lightView, q);
        for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], l[i]); hi[i] = Math.max(hi[i], l[i]); }
      }
    }
  return ortho(lo[0], hi[0], lo[1], hi[1], -hi[2] - 1, -lo[2] + 1);
}

let view, board, parent, lightViewProjection, shadowMatrix;
let mirrorStrength = 0;
let shadowPass = false;
const BLACK = [0, 0, 0];

function draw(mesh, model, mat, boost = 1) {
  if (shadowPass) {
    gl.uniformMatrix4fv(uLightMVP, false, multiply(lightViewProjection, parent, model));
  } else {
    gl.uniformMatrix4fv(uniforms.uModelView, false, multiply(view, parent, model));
    gl.uniformMatrix4fv(uniforms.uShadowMatrix, false, multiply(shadowMatrix, parent, model));
    gl.uniform3fv(uniforms.uColor, mat.color);
    gl.uniform3fv(uniforms.uEmissive, (mat.emissive ?? BLACK).map(v => v * boost));
    gl.uniform3fv(uniforms.uTopEmissive, (mat.top ?? BLACK).map(v => v * boost));
    gl.uniform1f(uniforms.uKs, mat.ks);
    gl.uniform1f(uniforms.uShininess, mat.shininess);
    gl.uniform1f(uniforms.uReflectivity, mat.reflect ?? 0);
    gl.uniform1f(uniforms.uMirror, mat.mirror ? mirrorStrength : 0);
    gl.uniform1f(uniforms.uShade, mat.shade ?? 0);
    gl.uniform2fv(uniforms.uTexRepeat, mat.repeat ?? [1, 1]);
    gl.uniform1i(uniforms.uMapping, mat.rect ? FLOOR_MAPPING : mat.texture ? EMISSION_MAPPING : NO_MAPPING);
    if (mat.rect) gl.uniform4fv(uniforms.uFloorRect, mat.rect);
    gl.bindTexture(gl.TEXTURE_2D, mat.texture ?? null);
  }
  gl.bindVertexArray(mesh.vao);
  gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
}

const box = (x0, y0, z0, x1, y1, z1) =>
  multiply(translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), scale((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2));

const upright = rotateX(Math.PI / 2);
const post = (x, y, r, z0, h) => multiply(translate(x, y, z0 + h / 2), upright, scale(r, h / 2, r));

function split(a, b, holes) {
  const pieces = [];
  for (const [h0, h1] of holes) { pieces.push([a, h0]); a = h1; }
  return [...pieces, [a, b]];
}

function drawCabinet(field, i) {
  const { x0, y0, x1, y1 } = field;
  const { rim, front, wallTop, floor, base } = CABINET;
  const y = i === 0 ? y0 + front : y0;
  const holes = table.gates.filter(g => g.below === field)
    .map(g => [g.x - GATE_HALF - WALL_THICK / 2, g.x + GATE_HALF + WALL_THICK / 2]);
  draw(cubeMesh, box(x0, y, floor, x1, y1, 0), fieldMaterials[i]);
  draw(cubeMesh, box(x0 - rim, y, base, x1 + rim, y1 + rim, floor), MATERIALS.cabinet);
  for (const [h0, h1] of holes) draw(cubeMesh, box(h0, y1, floor, h1, y1 + rim, 0), MATERIALS.cabinet);

  const walls = [
    [x0 - rim, y, x0, y1 + rim],
    [x1, y, x1 + rim, y1 + rim],
    ...split(x0, x1, holes).map(([a, b]) => [a, y1, b, y1 + rim]),
  ];
  if (i === 0) walls.push([x0 - rim, y - 0.4, x1 + rim, y]);
  for (const [a0, b0, a1, b1] of walls) draw(cubeMesh, box(a0, b0, floor, a1, b1, wallTop), MATERIALS.cabinet);

  const e = 0.16, X0 = x0 - rim, X1 = x1 + rim, Y0 = i === 0 ? y - 0.4 : y, Y1 = y1 + rim;
  const rails = [
    [X0, Y0, X0 + e, Y1],
    [X1 - e, Y0, X1, Y1],
    ...split(X0, X1, holes).map(([a, b]) => [a, Y1 - e, b, Y1]),
  ];
  if (i === 0) rails.push([X0, Y0, X1, Y0 + e]);
  for (const [a0, b0, a1, b1] of rails) draw(cubeMesh, box(a0, b0, wallTop, a1, b1, wallTop + 0.05), MATERIALS.rail);
}

function drawWall({ a, b, hidden }) {
  if (hidden) return;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  draw(cubeMesh, multiply(translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, WALL_HEIGHT / 2),
    rotateZ(angle), scale(len / 2, WALL_THICK / 2, WALL_HEIGHT / 2)), MATERIALS.wall);
}

function drawWallPost([x, y]) {
  draw(cylinderMesh, post(x, y, WALL_THICK / 2, 0, WALL_HEIGHT), MATERIALS.wall);
}

function drawBumper(bp) {
  const flash = 1 + bp.lit * 25;
  const [x, y] = bp.c;
  draw(cylinderMesh, post(x, y, bp.r * 0.90, 0, 0.95), MATERIALS.bumper);
  draw(cylinderMesh, post(x, y, bp.r * 1.02, 0.12, 0.28), MATERIALS.bumperRing, flash);
  draw(cylinderMesh, post(x, y, bp.r * 0.75, 0.95, 0.14), MATERIALS.bumperCap, flash);
}

function drawFlipper(f) {
  const mesh = getFlipperMesh(f);
  const worldAngle = f.side > 0 ? f.angle : Math.PI - f.angle;
  const frame = multiply(translate(f.pivot[0], f.pivot[1], 0), rotateZ(worldAngle));
  const h = FLIPPER_HEIGHT;
  draw(mesh, multiply(frame, scale(1, 1, 0.25)), MATERIALS.rubber);
  draw(mesh, multiply(frame, translate(0, 0, 0.25), scale(1, 1, h - 0.25)), MATERIALS.flipper, f.pressed ? 1.6 : 1);
  draw(cylinderMesh, multiply(frame, post(0, 0, 0.22, h, 0.08)), MATERIALS.steel);
}

function drawPlunger() {
  const { x, y } = table.launch;
  const flash = 3 * game.launch / LAUNCH_FLASH;
  for (let i = 0; i < COIL_RINGS; i++) {
    const lit = clamp(game.charge * COIL_RINGS - i, 0, 1);
    draw(torusMesh, multiply(translate(x, y + COIL_START + i * COIL_SPACING, BALL_RADIUS), scale(COIL_RADIUS, COIL_RADIUS, COIL_RADIUS)),
      MATERIALS.coil, 0.04 + 0.5 * lit + flash);
  }
}

function drawBall() {
  const [x, y] = game.ball.p;
  draw(sphereMesh, multiply(translate(x, y, BALL_RADIUS), game.ball.rotation, scale(BALL_RADIUS, BALL_RADIUS, BALL_RADIUS)), MATERIALS.ball);
}

function drawScene(withBall = true) {
  parent = board;
  table.fields.forEach(drawCabinet);
  table.walls.forEach(drawWall);
  wallPosts.forEach(drawWallPost);
  table.bumpers.forEach(drawBumper);
  table.flippers.forEach(drawFlipper);
  drawPlunger();
  if (withBall) drawBall();
}

function drawWorld() {
  const { x0, y0, x1, y1, z } = GROUND;
  parent = identity();
  draw(cubeMesh, box(x0, y0, z - 0.2, x1, y1, z), MATERIALS.ground);
  for (const [bx0, by0, bx1, by1, h] of BLOCKS) draw(cubeMesh, box(bx0, by0, z, bx1, by1, z + h), MATERIALS.block);
}

let skyTime = 0;

function drawSky2(projection, starScale = STAR_SCALE) {
  gl.useProgram(skyProgram);
  gl.uniformMatrix4fv(skyUniforms.uView, false, view);
  gl.uniformMatrix4fv(skyUniforms.uProjection, false, projection);
  gl.uniform3fv(skyUniforms.uFogColor, palette.fog);
  gl.uniform3fv(skyUniforms.uSkyColor, palette.sky);
  gl.uniform3fv(skyUniforms.uGridColor, palette.grid);
  gl.uniform1f(skyUniforms.uTime, skyTime);
  gl.uniform1f(skyUniforms.uStarScale, starScale);
  gl.disable(gl.DEPTH_TEST);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.enable(gl.DEPTH_TEST);
  gl.useProgram(program);
}

function floorRect(i) {
  const { x0, y0, x1, y1 } = table.fields[i];
  return [x0, i === 0 ? y0 + CABINET.front : y0, x1, y1];
}

function packFloorRects() {
  const data = new Float32Array(MAX_FIELDS * 4);
  data.set(table.fields.slice(0, MAX_FIELDS).flatMap((_, i) => floorRect(i)));
  return data;
}
let floorRects = packFloorRects();
const arrowData = new Float32Array(MAX_ARROWS * 3);

function resetTable() {
  wallPosts = collectWallPosts();
  fieldMaterials = table.fields.map((_, i) => fieldMaterial(i));
  floorRects = packFloorRects();
  cameraRect = null;
  chaseEye = chaseTarget = null;
  trail.length = 0;
}

function setView(matrix, clipPlane) {
  view = matrix;
  const floorView = multiply(view, board);
  gl.uniform3fv(uniforms.uLightDir, LIGHTS.flatMap(l => transformDirection(view, l.pos.map((v, i) => v - TABLE_CENTER[i]))));
  gl.uniform3fv(uniforms.uUp, transformDirection(view, [0, 0, 1]));
  gl.uniform3fv(uniforms.uBoardOrigin, transformPoint(floorView, [0, 0, 0]));
  gl.uniform3fv(uniforms.uBoardX, transformDirection(floorView, [1, 0, 0]));
  gl.uniform3fv(uniforms.uBoardY, transformDirection(floorView, [0, 1, 0]));
  gl.uniform3fv(uniforms.uFloorNormal, transformDirection(floorView, [0, 0, 1]));
  gl.uniform4fv(uniforms.uFloorRects, floorRects);
  gl.uniform4fv(uniforms.uClipPlane, clipPlane);
  gl.uniformMatrix3fv(uniforms.uView, false, [0, 1, 2, 4, 5, 6, 8, 9, 10].map(i => view[i]));
}

function drawEnvironment() {
  const eye = transformPoint(board, [game.ball.p[0], game.ball.p[1], BALL_RADIUS]);
  const projection = perspective(Math.PI / 2, 1, 0.1, 200);
  gl.bindFramebuffer(gl.FRAMEBUFFER, environmentFramebuffer);
  gl.viewport(0, 0, ENVIRONMENT_SIZE, ENVIRONMENT_SIZE);
  gl.activeTexture(gl.TEXTURE6);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
  gl.activeTexture(gl.TEXTURE0);
  gl.uniformMatrix4fv(uniforms.uProjection, false, projection);
  CUBE_FACES.forEach(({ dir, up }, i) => {
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, environmentMap, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    setView(lookAt(eye, add(eye, dir), up), NO_CLIP);
    drawSky2(projection, ENVIRONMENT_STAR_SCALE);
    drawScene(false);
  });
  gl.activeTexture(gl.TEXTURE6);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, environmentMap);
  gl.activeTexture(gl.TEXTURE0);
}

function drawMirror(camera, mirror, projection) {
  const n = transformDirection(multiply(camera, board), [0, 0, 1]);
  const p = transformPoint(multiply(camera, board), [0, 0, 0]);
  gl.bindFramebuffer(gl.FRAMEBUFFER, reflectionTarget.framebuffer);
  gl.viewport(0, 0, reflectionTarget.width, reflectionTarget.height);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.activeTexture(gl.TEXTURE0);
  setView(multiply(camera, mirror), [-n[0], -n[1], -n[2], n[0] * p[0] + n[1] * p[1] + n[2] * p[2] - 0.01]);
  drawSky2(projection);
  drawScene();
  drawWorld();
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, reflectionTarget.texture);
  gl.activeTexture(gl.TEXTURE0);
}

let trailAccum = 0;
const TRAIL_STEP = 1 / 60;

function updateTrail(dt) {
  if (game.state !== "play") {
    trail.length = 0;
    trailAccum = 0;
    return;
  }
  trailAccum += dt;
  if (trail.length === 0) {
    trail.unshift([...game.ball.p]);
    trailAccum = 0;
    return;
  }
  while (trailAccum >= TRAIL_STEP) {
    trailAccum -= TRAIL_STEP;
    trail.unshift([...game.ball.p]);
    if (trail.length > TRAIL_LENGTH) trail.pop();
  }
  trail[0][0] = game.ball.p[0];
  trail[0][1] = game.ball.p[1];
}

function drawTrail(projection) {
  if (trail.length < 2) return;
  trail.forEach(([x, y], i) => {
    const [ax, ay] = trail[Math.max(i - 1, 0)], [bx, by] = trail[Math.min(i + 1, trail.length - 1)];
    const len = Math.hypot(ax - bx, ay - by) || 1;
    const age = i / (TRAIL_LENGTH - 1), w = TRAIL_WIDTH * (1 - age);
    const nx = -(ay - by) / len * w, ny = (ax - bx) / len * w;
    trailPositions.set([x + nx, y + ny, TRAIL_HEIGHT, x - nx, y - ny, TRAIL_HEIGHT], i * 6);
    trailTexCoords.set([age, 1, age, -1], i * 4);
  });
  gl.useProgram(trailProgram);
  gl.uniformMatrix4fv(trailUniforms.uModelView, false, multiply(view, board));
  gl.uniformMatrix4fv(trailUniforms.uProjection, false, projection);
  gl.uniform3fv(trailUniforms.uColor, palette.trail);
  gl.bindBuffer(gl.ARRAY_BUFFER, trailPositionBuffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, trailPositions, 0, trail.length * 6);
  gl.bindBuffer(gl.ARRAY_BUFFER, trailTexCoordBuffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, trailTexCoords, 0, trail.length * 4);
  gl.bindVertexArray(trailVao);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.depthMask(false);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, trail.length * 2);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
}

function blurPass(source, target, step, threshold) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
  gl.viewport(0, 0, target.width, target.height);
  gl.bindTexture(gl.TEXTURE_2D, source.texture);
  gl.uniform2fv(blurUniforms.uStep, step);
  gl.uniform1f(blurUniforms.uThreshold, threshold);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function drawBloom() {
  gl.useProgram(blurProgram);
  gl.activeTexture(gl.TEXTURE0);
  let source = sceneTarget, threshold = BLOOM_THRESHOLD;
  for (const level of bloomLevels) {
    blurPass(source, level.temp, [1 / level.temp.width, 0], threshold);
    blurPass(level.temp, level.blur, [0, 1 / level.blur.height], 0);
    source = level.blur;
    threshold = 0;
  }
}

function drawComposite(bloomEnabled = true) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.useProgram(compositeProgram);
  gl.uniform1f(compositeUniforms.uBloomStrength, bloomEnabled ? 0.35 : 0.0);
  [sceneTarget, ...bloomLevels.map(level => level.blur)].forEach((target, i) => {
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, target.texture);
  });
  gl.activeTexture(gl.TEXTURE0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width === w && canvas.height === h) return;
  canvas.width = w;
  canvas.height = h;
  resizeTargets(w, h);
}


function drawSky(texture) {
    if (!texture) return;

    //Draw sky behind everything.
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);

    gl.useProgram(textureSkyProgram);

    //Use the conformally transformed screen as the sky texture.
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(textureSkyUniforms.uSky, 0);

    //Draw fullscreen triangle.
    gl.bindVertexArray(null);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    //Restore state for normal 3D rendering.
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(program);
}

let conformalSky = null;

function render(dt, insets, ballCam, zoom, dev = {}) {
  const bloomOn = dev.bloom ?? true;
  const trailOn = dev.trail ?? true;
  const shadowsOn = dev.shadows ?? true;
  const paletteOverride = dev.palette ?? -1;
  const strength = dev.mirror ?? 0.3;
  const floorStyle = dev.floor ?? PLAIN_FLOOR;
  const simDt = dev.simDt ?? dt;

  resize();
  updatePalette(dt, paletteOverride);
  updateTrail(simDt);
  const field = rect(table.fields[game.field]);
  cameraRect = cameraRect ? lerp(cameraRect, field, smoothFactor(0.08, dt)) : field;
  const c = center(cameraRect);
  board = multiply(translate(c[0], c[1], 0), rotateY(game.tilt[0]), rotateX(-game.tilt[1]), translate(-c[0], -c[1], 0));
  const mirror = multiply(board, scale(1, 1, -1),
    translate(c[0], c[1], 0), rotateX(game.tilt[1]), rotateY(-game.tilt[0]), translate(-c[0], -c[1], 0));
  lightViewProjection = multiply(lightProjection(), lightView);
  shadowMatrix = multiply(translate(0.5, 0.5, 0.5), scale(0.5, 0.5, 0.5), lightViewProjection);

  gl.useProgram(shadowProgram);
  gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFramebuffer);
  gl.viewport(0, 0, SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  if (shadowsOn) {
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(2, 4);
    shadowPass = true;
    drawScene();
    shadowPass = false;
    gl.disable(gl.POLYGON_OFFSET_FILL);
  }

  let camera, projection;
  if (ballCam) {
    camera = chaseView(dt);
    projection = perspective(2 * Math.atan(Math.tan(65 * Math.PI / 360) / zoom), canvas.width / canvas.height, 0.2, 120);
  } else {
    chaseEye = chaseTarget = null;
    const tall = Math.min(1, Math.max(0, (1.1 - canvas.width / canvas.height) / 0.6));
    const target = add(c, lerp(CAMERA.wide.target, CAMERA.tall.target, tall));
    camera = orbit(add(c, lerp(CAMERA.wide.eye, CAMERA.tall.eye, tall)), target, target);
    projection = fitProjection(camera, canvas.clientWidth, canvas.clientHeight, insets, fitCorners(cameraRect), zoom);
  }

  gl.useProgram(program);
  gl.uniformMatrix4fv(uniforms.uProjection, false, projection);
  gl.uniform2fv(uniforms.uScreenSize, [canvas.width, canvas.height]);
  gl.uniform3fv(uniforms.uLightColor, LIGHTS.flatMap(l => l.color));
  gl.uniform3fv(uniforms.uFogColor, palette.fog);
  gl.uniform3fv(uniforms.uFloorEmissive, palette.insert);
  arrowData.fill(0);
  arrowData.set(table.arrows.slice(0, MAX_ARROWS).flatMap(a => [a.p[0], a.p[1], a.lit / ARROW_LIT]));
  gl.uniform3fv(uniforms.uArrows, arrowData);
  const style = floorStyle === CONFORMAL_FLOOR && conformalSky === null ? CIRCUIT_FLOOR : floorStyle;
  const floorTextures = style === CONFORMAL_FLOOR ? fieldTextures.map(() => conformalSky) : fieldTextures;
  fieldMaterials.forEach((mat, i) => { mat.texture = floorTextures[i % floorTextures.length]; });
  gl.uniform1i(uniforms.uFloorStyle, style);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, floorTextures[0]);
  gl.activeTexture(gl.TEXTURE4);
  gl.bindTexture(gl.TEXTURE_2D, floorTextures[1]);
  gl.activeTexture(gl.TEXTURE5);
  gl.bindTexture(gl.TEXTURE_2D, floorTextures[2]);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, shadowMap);
  gl.activeTexture(gl.TEXTURE0);
  skyTime += dt;
  mirrorStrength = 0;
  drawEnvironment();
  gl.uniformMatrix4fv(uniforms.uProjection, false, projection);
  mirrorStrength = strength;
  if (mirrorStrength > 0) drawMirror(camera, mirror, projection);
  gl.bindFramebuffer(gl.FRAMEBUFFER, msaaFramebuffer);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  setView(camera, NO_CLIP);

  //Render the previous frame's transformed screen as the sky.
  if (window.escherParams.enabled && conformalSky) {
    drawSky(conformalSky);
  }
  else{
    drawSky2(projection);

  }

  drawScene();
  drawWorld();
  if (trailOn) drawTrail(projection);
  resolveScene();

  gl.disable(gl.DEPTH_TEST);
  gl.bindVertexArray(null);
  if (bloomOn) drawBloom();
  drawComposite(bloomOn);

  const p = window.escherParams;

  if (p.enabled || floorStyle === CONFORMAL_FLOOR) {
      conformalSky = applyEscherGPU({
          angle: p.angle,
          arms: p.arms,
          strength: p.strength,
          repeat: p.repeat,
          frameScale: p.frameScale,
          pivot: [p.pivotX, p.pivotY],
          show: false
      });
  } else {
      conformalSky = null;
  }

  gl.enable(gl.DEPTH_TEST);
}

