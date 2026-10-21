const cubeMesh = createMesh(createCube());
const cylinderMesh = createMesh(createCylinder(32));
const sphereMesh = createMesh(createSphere(32));
const coneMesh = createMesh(createCone(32));
const tubeMesh = createMesh(createTube(32));
const gearMesh = createMesh(createGear(12 * 16));

const projection = perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 100);


// The lights are nodes in the scene graph: see ceilingLamp, sideLamp and headlamp.

const lightsTerms = {
  Ka: 0.2, Kd: 0.8, Ks: 0.5, Alpha: 32.0
};

const materials = {
  default: {
    Ka: 0.2, Kd: 0.8, Ks: 0.5, Alpha: 32.0,
    AmbientColor:  [1, 1, 1],
    DiffuseColor:  [1, 1, 1],
    SpecularColor: [1, 1, 1],
  },

  shell: {
    Ka: 0.15, Kd: 0.80, Ks: 0.25, Alpha: 40,
    AmbientColor:  [0.90, 0.90, 0.87],
    DiffuseColor:  [0.90, 0.90, 0.87],
    SpecularColor: [1.00, 1.00, 1.00],
  },

  joints: {
    Ka: 0.10, Kd: 0.70, Ks: 0.30, Alpha: 50,
    AmbientColor:  [0.12, 0.13, 0.14],
    DiffuseColor:  [0.12, 0.13, 0.14],
    SpecularColor: [0.85, 0.85, 0.85],
  },

  caps: {
    Ka: 0.12, Kd: 0.75, Ks: 0.40, Alpha: 70,
    AmbientColor:  [0.04, 0.18, 0.75],
    DiffuseColor:  [0.04, 0.18, 0.75],
    SpecularColor: [1.00, 1.00, 1.00],
  },

  fingers: {
    Ka: 0.12, Kd: 0.70, Ks: 0.45, Alpha: 60,
    AmbientColor:  [0.45, 0.47, 0.50],
    DiffuseColor:  [0.45, 0.47, 0.50],
    SpecularColor: [0.90, 0.90, 0.90],
  },

  bulb: {   // light markers: ambient only, so they look self-lit
    Ka: 1.0, Kd: 0.0, Ks: 0.0, Alpha: 1,
    AmbientColor:  [1.00, 0.95, 0.70],
    DiffuseColor:  [0, 0, 0],
    SpecularColor: [0, 0, 0],
  },

  floor: {
    Ka: 0.20, Kd: 0.85, Ks: 0.05, Alpha: 10,
    AmbientColor:  [0.72, 0.73, 0.75],
    DiffuseColor:  [0.72, 0.73, 0.75],
    SpecularColor: [1.00, 1.00, 1.00],
  },
};
const spotLightTerms = {
  Cutoff: Math.cos(Math.PI / 4), SpotExponent: 0.0,
};


// Shape transforms affect only the mesh, not its children.
function armPart(name, mesh, material, position, size) {
  return {
    name,
    mesh,
    material,
    color: [1, 1, 1],
    shape: multiply(
      translate(...position),
      scale(...size)
    )
  };
}

// Light node. The light sits at the node's origin and shines along spotDir,
// given in the node's own frame, so it moves with whatever it hangs under.
// The small sphere only shows where the light is.
function lamp(name, position, spotDir, color = [1, 1, 1]) {
  return {
    name,
    joint: translate(...position),
    light: { color, spotDir: normalize(spotDir) },
    mesh: sphereMesh,
    material: "bulb",
    color: [1, 1, 1],
    shape: scale(0.1, 0.1, 0.1)
  };
}

function jointHousing(name, radius) {
  return [
    { name: `${name}_band`, mesh: cylinderMesh, material: "joints", color: [1, 1, 1], shape: multiply(rotateX(Math.PI / 2), scale(radius, radius * 0.45, radius)) },

    // "..." flattens the array
    ...[-1, 1].map(side => armPart(`${name}_cover_${side}`, sphereMesh, "shell", [0, 0, side * radius * 0.45], [radius * 0.95, radius * 0.95, radius * 0.40])),

    ...[-1, 1].map(side => ({ name: `${name}_blueCap_${side}`, mesh: cylinderMesh, material: "caps", color: [1, 1, 1], shape: multiply(translate(0, 0, side * radius * 0.85), multiply(rotateX(Math.PI / 2), scale(radius * 0.40, 0.035, radius * 0.40))) }))
  ];
}

const upperLength = 2.4;
const foreLength = 2.0;

// Rest pose in degrees. Each angle is relative to its parent link.
// The joints in the scene below are pure translations (where the pivot sits);
// setJoint applies these angles, and the sliders show them directly.
const restPose = {
  basePivot: 0,
  shoulderPivot: -30,
  elbowPivot: -80,
  wristPivot: -70,
  gripperPivot: 0,
  "fingerPivot_-1": -8,  fingerPivot_1: 8,
  "fingerTipPivot_-1": -12, fingerTipPivot_1: 12,
};

const scene = {
  name: "scene",
  children: [
    {
      name: "floor",
      mesh: cubeMesh,
      material: "floor",
      color: [1, 1, 1],
      shape: multiply(
        translate(0, -2.5, 0),
        scale(20, 0.6, 20)
      )
    },

    // Lights that turn with the world.
    lamp("ceilingLamp", [0, 4, 0], [0, -1, 0]),
    lamp("sideLamp", [2.5, 1.5, 1], [-1.6 - 2.5, -0.8 - 1.5, 0 - 1]),   // aimed at the shoulder

    {
      name: "robot",
      // Floor top is -2.5 + 0.6 = -1.9.
      joint: translate(-1.6, -1.9, 0),
      children: [
        armPart(
          "base",
          cylinderMesh,
          "shell",
          [0, 0.35, 0],
          [0.65, 0.35, 0.65]
        ),

        {
          name: "basePivot",
          joint: translate(0, 0.70, 0),
          children: [
            armPart(
              "baseCollar",
              cylinderMesh,
              "joints",
              [0, 0.15, 0],
              [0.43, 0.15, 0.43]
            ),

            {
              name: "shoulderPivot",
              joint: translate(0, 0.40, 0),
              children: [
                ...jointHousing("shoulder", 0.43),

                armPart(
                  "upperArm",
                  cylinderMesh,
                  "shell",
                  [0, upperLength / 2, 0],
                  [0.30, upperLength / 2, 0.30]
                ),

                {
                  name: "elbowPivot",
                  joint: translate(0, upperLength, 0),
                  children: [
                    ...jointHousing("elbow", 0.39),

                    armPart(
                      "forearm",
                      cylinderMesh,
                      "shell",
                      [0, foreLength / 2, 0],
                      [0.26, foreLength / 2, 0.26]
                    ),

                    {
                      name: "wristPivot",
                      joint: translate(0, foreLength, 0),
                      children: [
                        ...jointHousing("wrist", 0.30),

                        armPart(
                          "wristCollar",
                          cylinderMesh,
                          "joints",
                          [0, 0.34, 0],
                          [0.24, 0.16, 0.24]
                        ),

                        {
                          name: "gripperPivot",
                          joint: translate(0, 0.50, 0),
                          children: [
                            armPart(
                              "gripperPalm",
                              cubeMesh,
                              "shell",
                              [0, 0.13, 0],
                              [0.34, 0.13, 0.22]
                            ),

                            // Headlamp on the front of the palm, shining out past the fingers.
                            lamp("headlamp", [0, 0.13, 0.26], [0, 1, 0], [1,0,0]),

                            // Mirrored fingers.
                            ...[-1, 1].map(side => ({
                              name: `fingerPivot_${side}`,
                              joint: translate(side * 0.25, 0.26, 0),
                              children: [
                                armPart(
                                  `fingerUpper_${side}`,
                                  cubeMesh,
                                  "fingers",
                                  [0, 0.17, 0],
                                  [0.075, 0.17, 0.10]
                                ),

                                {
                                  name: `fingerTipPivot_${side}`,
                                  joint: translate(0, 0.34, 0),
                                  children: [
                                    armPart(
                                      `fingerTip_${side}`,
                                      cubeMesh,
                                      "joints",
                                      [0, 0.13, 0],
                                      [0.075, 0.13, 0.10]
                                    )
                                  ]
                                }
                              ]
                            }))
                          ]
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
};


function indexNodes(node, byName = {}) {
  node.pose = node.joint ?? identity();
  
  if (node.name) {
    if (byName[node.name]) console.warn(`duplicate node name: ${node.name}`);
    byName[node.name] = node;
  }
  for (const child of node.children ?? []) indexNodes(child, byName); 
  return byName;
}
// Reach any node directly, e.g. nodes.gearPivot1.joint = ...
const nodes = indexNodes(scene);
