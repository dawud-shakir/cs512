# Pinball

A 3D neon pinball table in WebGL 2, built for CS 412.

**Play:** https://andrew-crowe-ok.github.io/graphics-final-project/

## Code layout

| File | Contents |
| --- | --- |
| `physics.js` | Table geometry, collision, flippers, plunger, scoring. Owns all game state. |
| `render.js` | Shaders, render passes, materials, camera. Read-only view of the physics state. |
| `models.js` | Procedural meshes: cube, cylinder, sphere, flipper |
| `transforms.js` | Column-major 4×4 matrix library |
| `main.js` | Input, HUD, frame loop |

Physics is 2D circle/segment collision with substepping; flippers transfer their surface velocity on contact. The table is three stacked playfields joined by gated flipper pairs.

## Graphics

Each frame renders in four passes:

1. **Shadow map**: depth from the key light through an orthographic projection, sampled with hardware depth compare.
2. **Scene**: Blinn-Phong with two point lights into a multisampled RGBA16F target. Neon playfield textures act as emission maps, flippers are hierarchical transforms around their pivots, and the ball leaves a ribbon trail built from its recent positions.
3. **Bloom**: bright-pass threshold, then separable Gaussian blur at four mip levels.
4. **Composite**: scene plus bloom, Reinhard tone mapping, vignette.

The camera is either an off-center frustum fitted to the viewport or a chase cam behind the ball. The material palette blends toward a new scheme each time a ball drains.

## Contribution Suggestions

- **Image-space effects**: new post-processing passes such as motion blur, depth of field, or screen-space ambient occlusion.
- **Materials and surface detail**: richer surface appearance, for example normal mapping, environment-mapped reflections, or physically based shading.
- **Lighting and shadows**: improvements to light and shadow, such as soft shadows, dynamic lights tied to bumpers, or emissive surfaces that light the scene.
- **Particles and procedural effects**: effects driven by game events, like sparks, glow bursts, animated textures, etc.
- **Ray tracing**: a ray-traced view of the table, drawn from the same physics state.
- **Gameplay additions**: new table elements, sound, scoring features, etc.
- **Anything else**: these are only suggestions; any contribution that fits the course is welcome.
