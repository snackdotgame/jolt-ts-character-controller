---
title: Custom Gravity
description: Per-controller gravity fields for planet-walking, wall-walking, and zero-g, plus how the up-axis realigns.
---

Out of the box a controller falls along the world's gravity. Enable
`enableCustomGravity` and it will instead sample a **gravity field** you supply —
a function of position — letting a single character walk around a planet, up a
wall, or drift in zero-g while everything else obeys normal gravity.

## The gravity field

```ts
import { CharacterController } from "jolt-ts-character-controller";
import { Vector3 } from "three";

const controller = new CharacterController({
  world,
  enableCustomGravity: true,
  useCharacterUpAxis: true, // orient controls to the character's own up
  gravityField: (position) => {
    // position is the body's current position (a live Vector3 — read, don't mutate).
    // Return the gravity vector at that point.
    return { x: 0, y: -9.81, z: 0 };
  },
});
```

`gravityField` is `(position: Vector3) => Vector3Like`. It's called every tick
with the body's position while custom gravity is enabled. Return the full
gravity **vector** (direction × magnitude) at that point.

:::caution[Don't mutate the argument]
The `position` passed in is the controller's live internal vector. Read it, but
never mutate it. To avoid per-frame allocations, compute into a reused vector
you own:

```ts
const TMP = new Vector3();
const CENTER = new Vector3(0, 0, 0);
const G = 9.81;

gravityField: (position) => TMP.copy(CENTER).sub(position).normalize().multiplyScalar(G),
```
:::

## Planet gravity

Point gravity at a center to walk around a sphere:

```ts
const PLANET_CENTER = new Vector3(0, 0, 0);
const SURFACE_G = 9.81;
const gravity = new Vector3();

const controller = new CharacterController({
  world,
  enableCustomGravity: true,
  useCharacterUpAxis: true,
  gravityField: (position) =>
    gravity.copy(PLANET_CENTER).sub(position).normalize().multiplyScalar(SURFACE_G),
});
```

## The up-axis follows gravity

When the gravity direction changes, the controller's **up-axis** realigns toward
the opposite of gravity, smoothed by `gravityDirLerpSpeed` (default `6` — higher
snaps faster). Auto-balance then rotates the capsule so it stands "up" relative
to the new gravity.

Two options shape how movement feels during this:

- **`useCharacterUpAxis`** — when `true`, the controller uses the **body's own Y
  axis** as up when interpreting movement and forward. This keeps controls
  consistent as the character rounds a planet or climbs a wall. When `false`, the
  world up is used.
- **`gravityDirLerpSpeed`** — how quickly the up-axis chases the gravity
  direction. Lower values give a gentle, floaty reorientation; higher values feel
  locked to the surface.

:::note[Reorient your camera too]
The controller only reorients the physics body. Your camera "up" is yours to
manage. For planet/wall walking you'll typically also roll the camera's up toward
the controller's `upAxis`. The bundled demo does this with a custom
`camera-controls` subclass that exposes a `setUp(...)` method.
:::

## Zero gravity

If the field returns a zero-length vector, the controller enters a zero-gravity
mode: auto-balance and turn-to-face are skipped and the body simply drifts. This
is detected each tick from the gravity magnitude, so you can transition in and
out of weightless zones by returning `{ x: 0, y: 0, z: 0 }` inside them.

```ts
gravityField: (position) =>
  inZeroGZone(position) ? { x: 0, y: 0, z: 0 } : { x: 0, y: -9.81, z: 0 },
```

## Regional fields

Because the field is just a function of position, you can compose zones — a
spherical planet here, a cylindrical "barrel" there, normal down-gravity
everywhere else — by branching on `position`. The bundled `src/demo.ts` ships
exactly this kind of multi-zone `gravityField` as a worked example.
