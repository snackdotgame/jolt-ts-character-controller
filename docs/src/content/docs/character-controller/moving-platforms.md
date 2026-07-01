---
title: Moving Platforms
description: Riding kinematic and dynamic platforms, matching surface velocity without sliding, and the counter-impulses that push back on dynamic ground.
---

When `followPlatform` is enabled (the default), a character standing on a
**moving or kinematic** body inherits that body's motion — you ride elevators,
rafts, and rotating discs without sliding off, and you jump *with* the platform's
velocity.

## How platform-follow works

Each tick, if the ground body under the character is kinematic or dynamic, the
controller:

1. Computes the platform's velocity at the contact point (linear + angular).
2. Expresses the character's velocity **relative** to that surface — this is what
   `relativeVelocity` / `moveSpeed` report.
3. Drives the relative planar velocity toward zero using `platformGripFactor`.
4. On a rotating platform, folds the platform's spin into the character's facing
   (exposed as `turnOnYQuat`) so you turn with the disc.

`controller.isOnPlatform` (and `snapshot().isOnPlatform`) is `true` whenever this
coupling is active.

## Grip: sliding vs sticking

Two separate knobs control friction because static and moving ground want
different feels:

| Option | Applies to | Default | Effect |
| --- | --- | --- | --- |
| `slideGripFactor` | Static ground | `0.5` | Soft slide-to-stop when you release the stick. |
| `platformGripFactor` | Moving / kinematic ground | `1` | How strongly planar velocity matches the surface each tick. `1` = fully match (no slide); lower = slippery. |

Because `platformGripFactor` couples you to the surface velocity, it's also what
carries you off the edge of a **rolling** platform — stronger grip means both
"no sliding on the mover" and "a stronger roll-off from a spinning cylinder".

## Kinematic platforms

Kinematic bodies are the simplest movers: you drive them, physics doesn't. Create
one on a layer the character can stand on, and move it toward a target each tick
with `Body.moveKinematic(...)` (see the `jolt-ts` docs for the exact signature):

```ts
const platform = world.createBody({
  type: "kinematic",
  shape: Shape.box({ halfExtents: [4, 0.2, 4] }),
  position: [0, 0.2, 0],
  layer: "moving",
});

function frame(t: number, dt: number) {
  const target = [Math.sin(t) * 6, 0.2, 0];
  platform.moveKinematic(target, [0, 0, 0, 1], dt); // velocity-based motion

  controller.setMovement(input);
  controller.step(dt);
  world.step(dt);
}
```

:::caution[CCD and kinematic movers]
Jolt does not stop kinematic bodies during continuous collision detection, so a
character on a fast kinematic platform can be missed by discrete detection. Give
the **character** body `motionQuality: "linearCast"` so it sweeps against the
platform, rather than expecting the kinematic body to sweep against the
character.
:::

## Dynamic platforms and counter-impulses

On **dynamic** ground — a physics raft, a see-saw, a stack of crates — the
character should push back, or it would appear weightless. The controller applies
Newton's-third-law reactions to the ground body, each individually toggleable:

| Option | Default | Reaction applied to dynamic ground |
| --- | --- | --- |
| `applyCounterMass` | `true` | The character's weight presses down (a raft sinks under you). |
| `applyCounterJumpImp` | `true` | Jumping off pushes the ground down. |
| `counterJumpImpFactor` | `1` | Scales the counter-jump impulse. |
| `applyCounterMoveImp` | `true` | Walking pushes the ground backward. |
| `counterMoveImpFactor` | `1` | Scales the counter-move impulse. |

### Mass ratio fall-off

How hard the character pushes back is scaled by the **mass ratio** between the
ground body and the character, remapped through
`massRatioFallOffCurveData` — a [curve](/jolt-ts-character-controller/advanced/curves/). This keeps behavior
believable across scales: a light plank reacts strongly to your weight, while a
massive barge barely notices you.

```ts
const controller = new CharacterController({
  world,
  massRatioFallOffCurveData: {
    points: [
      { x: 0, y: 0, r_out: 0 },
      { x: 0.5, y: 0, r_in: 0, r_out: 0 },
      { x: 1, y: 1, r_in: 0 },
    ],
  },
});
```

If you replace the curve at runtime, call
`controller.refreshMassRatioFallOffCurve()` to rebake it.

:::tip[Turn it all off]
For arcade-style platforms where you don't want the character to disturb the
ground at all, set `applyCounterMass`, `applyCounterJumpImp`, and
`applyCounterMoveImp` to `false`. The character still rides the platform;
it just won't push back.
:::
