---
title: Overview
description: How a CharacterController tick works, the difference between step and update, and how to structure a fixed-timestep loop.
---

`CharacterController` wraps a single dynamic Jolt capsule body and turns
per-tick input into physics impulses. It does not move the body directly — it
applies floating, friction, movement, turning, and jump impulses, and lets Jolt
integrate them when you step the world.

## Creating a controller

```ts
import { CharacterController } from "jolt-ts-character-controller";

const controller = new CharacterController({
  world,                 // required: your jolt-ts World
  position: [0, 1, 0],
  motionQuality: "linearCast",
});
```

With only `world` supplied, the controller creates its own dynamic capsule via
[`createCharacterBody`](/jolt-ts-character-controller/advanced/bodies-and-layers/). To reuse an existing
body — a custom shape, a pooled body, or one you created yourself — pass it as
`body` and the controller will drive that instead:

```ts
const controller = new CharacterController({ world, body: myCapsuleBody });
```

The controller exposes three public fields:

- `controller.world` — the world you passed in.
- `controller.body` — the Jolt body it drives (created or supplied).
- `controller.options` — the **resolved** options (defaults merged with yours).
  These are live and mutable; changing them between ticks retunes the controller.

## Anatomy of a tick

Each simulation tick you do four things, in order:

```ts
controller.setForwardDirection(cameraForward, cameraUp); // 1. aim
controller.setMovement(input);                           // 2. intent
controller.step(dt);                                     // 3. simulate the controller
world.step(dt);                                          // 4. integrate the world
```

1. **Aim** — tell the controller which way "forward" is (see
   [Movement & Input](/jolt-ts-character-controller/character-controller/movement-and-input/)).
2. **Intent** — feed it the pressed buttons / joystick.
3. **`step(dt)`** — the controller reads the body's current pose and velocity,
   casts for the ground, and applies this tick's impulses. It allocates nothing.
4. **`world.step(dt)`** — Jolt integrates those impulses (and everything else)
   forward by `dt`.

Internally, a single `step(dt)` resolves run/jump edge triggers, refreshes
gravity and the up-axis, projects your input into a movement direction, casts
for the ground, applies the floating spring, detects slopes / falling / moving
platforms, applies friction (when there's no move input), applies dynamic
gravity scaling, fires the jump impulse, and finally turns and moves the body.

:::caution[Order matters]
Apply controller impulses **before** integrating the world. `step(dt)` writes
impulses; `world.step(dt)` consumes them. If you step the world first, this
tick's input is integrated on the *next* frame instead.
:::

## `step` vs `update`

Two methods run the exact same simulation. They differ only in the return value:

| Method | Returns | Allocates | Use when |
| --- | --- | --- | --- |
| `step(dt)` | `void` | Nothing | Hot paths, servers, when you read state via [getters](/jolt-ts-character-controller/character-controller/reading-state/). |
| `update(dt)` | An [`CharacterControllerSnapshot`](/jolt-ts-character-controller/character-controller/reading-state/) | A fresh snapshot object | You want an immutable, plain-data view of the tick. |

```ts
// Equivalent to step(dt), plus a snapshot:
const snapshot = controller.update(dt);
// snapshot.isOnGround, snapshot.moveSpeed, snapshot.position, ...
```

Prefer `step(dt)` in the render/simulation loop and read live values through the
zero-allocation getters (`controller.isOnGround`, `controller.moveSpeed`, …).
Reach for `update(dt)` when you specifically want a detached copy.

## Rendering the result

After `world.step(dt)`, read the body's pose and copy it onto your mesh:

```ts
const p = controller.body.translation();
const r = controller.body.rotation();
mesh.position.set(p.x, p.y, p.z);
mesh.quaternion.set(r.x, r.y, r.z, r.w);
```

The controller never touches your scene graph — this copy is the only link
between physics and rendering.

## Fixed timestep

Physics is most stable and most reproducible at a **fixed** `dt`. A simple and
robust pattern is an accumulator that steps the controller and world in fixed
slices, draining whatever real time has elapsed:

```ts
const FIXED_DT = 1 / 60;
const MAX_FRAME = 1 / 6; // never simulate more than this per frame
let accumulator = 0;
let last = performance.now();

function frame(now: number) {
  accumulator += Math.min((now - last) / 1000, MAX_FRAME);
  last = now;

  while (accumulator >= FIXED_DT) {
    controller.setForwardDirection(cameraForward, camera.up);
    controller.setMovement(input);
    controller.step(FIXED_DT);
    world.step(FIXED_DT);
    accumulator -= FIXED_DT;
  }

  syncMeshFromBody(controller.body, mesh);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

:::tip[Clamp your delta]
Always clamp the per-frame delta (here `MAX_FRAME`). A backgrounded tab or a
long GC pause can produce a huge `now - last`; without a clamp you'd try to
simulate seconds of physics in one frame — the "spiral of death". The bundled
demo clamps each step to `1 / 30`.
:::

## Enabling and disabling

`step(dt)` is a no-op when `options.enable` is `false` or when the body has been
invalidated (`body.valid === false`). Toggle a controller off without destroying
it:

```ts
controller.options.enable = false; // step() now does nothing
```
