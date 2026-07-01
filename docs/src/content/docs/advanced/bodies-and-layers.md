---
title: Bodies, Shapes & Layers
description: Auto-created vs custom bodies, collision layers and friction conventions, and excluding bodies from ground detection with userData.
---

Every controller and vehicle drives a single Jolt body. You can let the library
create a sensible default, or supply your own for full control over shape, mass,
and collision.

## Auto-created bodies

If you don't pass a `body`, the library builds one for you:

- **`createCharacterBody(options)`** — a **dynamic capsule** for characters.
  Defaults: layer `"moving"`, friction `-0.5`, `gravityFactor` `1`, sleeping
  allowed. Capsule size comes from `capsuleHalfHeight` / `capsuleRadius`.
- **`createVehicleBody(options)`** — a **dynamic box** for vehicles
  (default half-extents `[1, 0.4, 2.4]`). Defaults: layer `"moving"`, friction
  `0.8`, `motionQuality: "linearCast"`, density `200`.

Both are exported, so you can call them yourself, tweak the result, and hand it
back:

```ts
import { createCharacterBody, CharacterController } from "jolt-ts-character-controller";

const body = createCharacterBody({ world, position: [0, 1, 0], capsuleRadius: 0.4 });
body.userData = { team: "red" };

const controller = new CharacterController({ world, body });
```

## Bring your own body

Pass `body` to use any Jolt body — a compound shape, an offset center of mass, a
pooled body, or one with custom collision settings. The controller drives it
as-is and skips capsule creation:

```ts
import { Shape } from "jolt-ts";

const body = world.createBody({
  type: "dynamic",
  shape: Shape.offsetCenterOfMass(
    Shape.capsule({ halfHeight: 0.3, radius: 0.3 }),
    { x: 0, y: -0.1, z: 0 },
  ),
  position: [0, 1, 0],
  layer: "moving",
});

const controller = new CharacterController({ world, body });
```

:::note[Capsule options only size auto-created bodies]
`capsuleHalfHeight` / `capsuleRadius` are used when the controller **creates** the
body. If you pass your own `body`, size it yourself — those options won't reshape
it. (They still feed the default ground-cast dimensions, so set `rayLength` /
`rayRadius` explicitly if your shape differs a lot from the default capsule.)
:::

## Layers & friction

Layers are `jolt-ts` collision layers (a string like `"moving"` / `"static"`, or
a number). The conventions the defaults follow:

- Dynamic characters and vehicles → `"moving"`.
- Static ground and level geometry → `"static"`.

Friction conventions differ by controller because each manages grip differently:

- **Character body friction is `-0.5`** by default. The character controller
  computes its own ground friction (`slideGripFactor`, `platformGripFactor`), so
  the body's material friction is intentionally low/negative.
- **Vehicle body friction is `0.8`** so the chassis behaves sensibly if it scrapes
  a wall; wheel grip is handled separately per wheel (`tireGripFactor`, slip
  curves).

Set `friction`, `density`/`mass`, damping, and `gravityFactor` through the
constructor options, or on your own body before passing it in.

## Excluding bodies from ground detection

Characters and wheels cast rays/shapes downward to find the ground. You can tell
those casts to **ignore** specific bodies by tagging them via `userData` with the
`ControllerUserData` shape:

```ts
interface ControllerUserData {
  controller?: {
    excludeRay?: boolean;          // ignored by BOTH character and vehicle casts
    excludeCharacterRay?: boolean; // ignored by the character ground cast
    excludeVehicleRay?: boolean;   // ignored by the vehicle wheel cast
  };
}
```

- The **character** ground cast skips any body whose userData has `excludeRay`
  **or** `excludeCharacterRay`.
- The **vehicle** wheel cast skips any body whose userData has `excludeRay`
  **or** `excludeVehicleRay`.

A common setup: keep cars from treating the character as drivable ground, and
keep triggers/sensors from being stood on.

```ts
// Cars won't detect the character body as ground under their wheels:
controller.body.userData = { controller: { excludeVehicleRay: true } };

// A trigger volume neither the character nor vehicles should stand on:
triggerBody.userData = { controller: { excludeRay: true } };
```

Bodies without a `controller` userData entry are always detectable — tagging is
opt-out, so existing geometry needs no changes.
