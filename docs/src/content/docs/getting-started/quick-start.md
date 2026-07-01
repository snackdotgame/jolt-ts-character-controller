---
title: Quick Start
description: A complete, keyboard-driven Three.js character in about forty lines, from world creation to a running render loop.
---

This page builds a complete, keyboard-controlled character: a Jolt world, a
floor, a controller, a capsule mesh, and a render loop that steps physics and
draws the result. It assumes you already have a Three.js `scene`, `camera`, and
`renderer` set up.

## 1. World and floor

```ts
import { World, Shape } from "jolt-ts";

const world = await World.create({ gravity: [0, -9.81, 0] });

world.createBody({
  type: "static",
  shape: Shape.box({ halfExtents: [25, 0.5, 25] }),
  position: [0, -0.5, 0],
  layer: "static",
  friction: 0.8,
});
```

## 2. Create the controller

Create the capsule body yourself so you can **rotation-lock** it (a walking
character shouldn't topple) and give it `friction: 0` (the controller drives its
own ground friction). Then **scale the float spring to the body's mass** — the
one step you must not skip.

```ts
import { Shape } from "jolt-ts";
import { CharacterController } from "jolt-ts-character-controller";

const body = world.createBody({
  type: "dynamic",
  shape: Shape.capsule({ halfHeight: 0.45, radius: 0.35 }),
  position: [0, 1.1, 0],
  layer: "moving",
  friction: 0,          // the controller manages its own ground friction
  allowSleeping: false,
  allowedDofs: ["translation-x", "translation-y", "translation-z"], // no tipping
  motionQuality: "linearCast", // sweep against thin/fast geometry (CCD)
});

// springK/dampingC are NOT mass-normalized — scale them to the real body mass.
const massScale = body.mass() / 0.283; // 0.283 kg = the reference capsule mass
const controller = new CharacterController({
  world,
  body,
  capsuleHalfHeight: 0.45,
  capsuleRadius: 0.35,
  useCustomForward: true, // treat the forward vector as a world axis
  autoBalance: false,     // rotation is DOF-locked; nothing to balance
  springK: 80 * massScale,
  dampingC: 6 * massScale,
  fallingGravityScale: 1,
});
```

:::caution[Scale the float spring, or the character sinks]
The float spring (`springK` / `dampingC`) is the one controller force that is
**not** mass-normalized. Its defaults are tuned for a ~0.283 kg capsule, but a
default-density Jolt capsule is ~280 kg — so `springK: 80` is roughly **1000×
too soft** and the character sags into the ground and can't move. Always scale it
by `body.mass() / 0.283`. This is the single most common setup mistake.
:::

## 3. A mesh to draw it

The controller exposes the resolved capsule dimensions, so the render mesh
matches the physics shape exactly.

```ts
import { CapsuleGeometry, Mesh, MeshStandardMaterial } from "three";

const { capsuleRadius, capsuleHalfHeight } = controller.options;
const mesh = new Mesh(
  new CapsuleGeometry(capsuleRadius, capsuleHalfHeight * 2),
  new MeshStandardMaterial({ color: 0x87cefa }),
);
scene.add(mesh);
```

## 4. Gather keyboard input

The controller never reads the keyboard — you keep a plain input object and hand
it to `setMovement`. Fields you omit keep their previous value, so it's fine to
update the object in place.

```ts
import type { MovementInput } from "jolt-ts-character-controller";

const input: MovementInput = {
  forward: false, backward: false,
  leftward: false, rightward: false,
  run: false, jump: false,
};

const keymap: Record<string, keyof MovementInput> = {
  KeyW: "forward", KeyS: "backward",
  KeyA: "leftward", KeyD: "rightward",
  ShiftLeft: "run", Space: "jump",
};

addEventListener("keydown", (e) => {
  const key = keymap[e.code];
  if (key) input[key] = true;
});
addEventListener("keyup", (e) => {
  const key = keymap[e.code];
  if (key) input[key] = false;
});
```

## 5. The render loop

Each frame: point the controller forward, feed it the input, step the
controller, step the world, then copy the body's pose onto the mesh.

```ts
const FIXED_DT = 1 / 60;

function frame() {
  // Face +Z. With useCustomForward, this is the world-space forward axis.
  controller.setForwardDirection({ x: 0, y: 0, z: 1 });
  controller.setMovement(input);

  controller.step(FIXED_DT); // apply movement/jump/float impulses
  world.step(FIXED_DT);      // integrate the world

  // Sync the render mesh from the body after the world has advanced.
  const p = controller.body.translation();
  const r = controller.body.rotation();
  mesh.position.set(p.x, p.y, p.z);
  mesh.quaternion.set(r.x, r.y, r.z, r.w);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
```

That's a fully playable character: WASD to move, <kbd>Shift</kbd> to run,
<kbd>Space</kbd> to jump.

:::tip[Loop ordering]
Call `controller.step(dt)` **before** `world.step(dt)`. The controller applies
impulses to the body; `world.step` then integrates them. Reading
`body.translation()` *after* `world.step` gives you the pose to render this
frame. See [Overview](/jolt-ts-character-controller/character-controller/overview/) for the full tick anatomy.
:::

:::note[Let it settle first]
The controller computes its ground-friction coefficient only while the character
is **idle on the ground**, so a character driven from the very first frame never
builds any move force. Keyboard input handles this naturally (the player is idle
until they press a key); if you drive movement programmatically, step the
controller idle (`setMovement({})`) for a few frames first.
:::

## Where to go next

- [Overview](/jolt-ts-character-controller/character-controller/overview/) — how a tick actually works and how
  to structure a fixed-timestep loop.
- [Movement & Input](/jolt-ts-character-controller/character-controller/movement-and-input/) — camera-relative
  movement, joysticks, run toggling, and locked facing.
- [Configuration](/jolt-ts-character-controller/character-controller/configuration/) — every tuning option and
  its default.
- [Animation State Machine](/jolt-ts-character-controller/animation/state-machine/) — turn controller state
  into locomotion animation.
