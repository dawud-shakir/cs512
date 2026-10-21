// LIGHTING_GLSL is shared by both vertex and fragment shader

const NUM_LIGHTS = 3;   // must match the number of light nodes in the scene graph

const LIGHTING_GLSL = `
const int NUM_LIGHTS = ${NUM_LIGHTS};

uniform vec3 uLightPos[NUM_LIGHTS];   // eye space
uniform vec3 uSpotDir[NUM_LIGHTS];    // eye space, unit length
uniform vec3 uLightColor[NUM_LIGHTS];
uniform vec3 uColor;

uniform float uKa;  // how strongly the material reflects ambient light
uniform float uKd;  // matte appearance
uniform float uKs;  // strength of shiny patch
uniform float uAlpha; // sharpness of shiny patch

uniform highp int uShading;   // 0-flat, 1-gouraud, 2-phong
uniform highp int uLightType; // 0-point, 1-spot

uniform float uCutoff;        // cos of the cone's half-angle
uniform float uSpotExponent;

uniform vec3 uSpecularColor;
uniform vec3 uDiffuseColor;
uniform vec3 uAmbientColor;

vec3 calculateLight(vec3 lightPos, vec3 lightColor, vec3 position, vec3 normal, vec3 viewDir, vec3 color) {
    // Diffuse
    vec3 lightDir = normalize(lightPos - position);    // points towards light
    float cosTheta = max(dot(normal, lightDir), 0.0);  // how aligned is the surface normal and light
    vec3 diffuse = uKd * uDiffuseColor * lightColor * cosTheta * color;

    // Specular
    float spec = 0.0;
    if (cosTheta > 0.0)
    { // only when the surface faces the light
      vec3 reflectDir = reflect(-lightDir, normal);
      spec = pow(max(dot(viewDir, reflectDir), 0.0), uAlpha);
    }
    vec3 specular = uKs * uSpecularColor * lightColor * spec;

    float d = length(lightPos - position);
    float f_att = 1.0/(1.0 + 0.09*d + 0.032*d*d);     // smooth natural fade

    return f_att * (diffuse + specular);
}

// Cone factor: always 1 for a point light; for a spotlight, 1 inside the cone
// (shaped by the exponent) and 0 outside it.
float spotFactor(int i, vec3 position) {
  if (uLightType == 0) return 1.0;
  vec3 lightToSurface = normalize(position - uLightPos[i]);
  float c = dot(lightToSurface, uSpotDir[i]);
  return (c >= uCutoff) ? pow(c, uSpotExponent) : 0.0;
}

vec3 shadeSurface(vec3 position, vec3 normal, vec3 color) {
  vec3 viewDir = normalize(-position);  // camera is at the origin

  // Ambient (only computed once, not per light)
  vec3 result = uKa * uAmbientColor * color;

  for (int i = 0; i < NUM_LIGHTS; ++i) {
    result += spotFactor(i, position) * calculateLight(uLightPos[i], uLightColor[i], position, normal, viewDir, color);
  }

  return result;
}
`;