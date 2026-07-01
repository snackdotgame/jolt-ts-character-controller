---
title: Configuration
description: Every CharacterController option, grouped by concern, with defaults and what each one does.
---

`CharacterController` takes a single options object. Everything except `world`
is optional; unset fields fall back to `DEFAULT_CONTROLLER_OPTIONS`. The merged,
resolved values live on `controller.options` and can be mutated between ticks to
retune the controller live.

```ts
const controller = new CharacterController({
  world,
  position: [0, 1, 0],
  maxWalkVel: 1.5,
  jumpVel: 6,
});

// Retune at runtime:
controller.options.maxRunVel = 8;
```

:::tip[Import the defaults]
`DEFAULT_CONTROLLER_OPTIONS` is exported, so you can read a baseline value or build
your own presets from it.

```ts
import { DEFAULT_CONTROLLER_OPTIONS } from "jolt-ts-character-controller";
```
:::

## Body & runtime

These configure the Jolt body. They are only used when the controller **creates**
the body for you; if you pass an existing `body`, set these on that body instead.

| Option | Default | Description |
| --- | --- | --- |
| `world` | — | **Required.** The `jolt-ts` `World` the body lives in. |
| `body` | *(created)* | Supply an existing Jolt `Body` to drive instead of auto-creating a capsule. |
| `position` | `[0, 1, 0]` | Initial position. Accepts `[x, y, z]` or `{ x, y, z }`. |
| `rotation` | *(identity)* | Initial rotation quaternion, `[x, y, z, w]` or `{ x, y, z, w }`. |
| `layer` | `"moving"` | Jolt collision layer for the body. |
| `friction` | `-0.5` | Body material friction. Negative by design — the controller drives its own ground friction; see `slideGripFactor`. |
| `density` | *(engine default)* | Used to derive mass when `mass` is unset. |
| `mass` | *(from density)* | Explicit mass; overrides `density`. |
| `linearDamping` | *(engine default)* | Jolt linear damping. |
| `angularDamping` | *(engine default)* | Jolt angular damping. |
| `gravityFactor` | `1` | Body gravity multiplier. The controller overrides this dynamically while grounded and falling. |
| `motionQuality` | *(engine default)* | `"discrete"` or `"linearCast"`. Use `"linearCast"` (CCD) to sweep against thin or fast-moving geometry. |
| `allowSleeping` | `true` | Whether the body may sleep. The controller wakes it when there is input or platform motion. |

## Capsule & master switch

| Option | Default | Description |
| --- | --- | --- |
| `enable` | `true` | When `false`, `step()` / `update()` do nothing. |
| `capsuleHalfHeight` | `0.3` | Half-height of the cylindrical section of the auto-created capsule. |
| `capsuleRadius` | `0.3` | Radius of the auto-created capsule. Also feeds the default ray dimensions below. |

## Forward & up axis

| Option | Default | Description |
| --- | --- | --- |
| `useCustomForward` | `false` | `false`: `setForwardDirection` takes the camera direction + up (camera-relative). `true`: it takes the forward axis directly. See [Movement & Input](/jolt-ts-character-controller/character-controller/movement-and-input/). |
| `useCharacterUpAxis` | `false` | Use the body's own local Y axis as "up" instead of world up. Enables consistent control while [wall/planet-walking](/jolt-ts-character-controller/character-controller/custom-gravity/). |
| `lockForward` | `false` | Keep the character facing the forward vector while still moving in any direction (strafe). |

## Movement & acceleration

| Option | Default | Description |
| --- | --- | --- |
| `maxWalkVel` | `2` | Target planar speed when not running. |
| `maxRunVel` | `5` | Target planar speed when running. |
| `accDeltaTime` | `0.2` | Acceleration smoothing (0–1). Larger reaches target speed faster. |
| `decDeltaTime` | `0.2` | Deceleration smoothing (0–1) used by ground friction. |
| `rejectVelFactor` | `1` | How aggressively sideways velocity (not aligned with input) is cancelled when grounded — grip when changing direction. |
| `moveImpulsePointOffset` | `0.5` | Vertical offset (× body up) of the point where the move impulse is applied. Non-zero adds lean/torque into acceleration. |
| `airDragFactor` | `0.1` | In-air movement authority / drag. Also used when standing on a too-steep slope. |
| `enableToggleRun` | `true` | `true`: `run` input toggles running. `false`: hold to run. |

## Jump

| Option | Default | Description |
| --- | --- | --- |
| `jumpVel` | `5` | Take-off speed along the jump direction. |
| `jumpDuration` | `0.1` | Seconds the jump impulse window stays active. |
| `slopeJumpFactor` | `0` | Blends the surface normal into the jump direction (0 = jump straight up the up-axis). |
| `fallingGravityScale` | `3` | Extra gravity factor applied while falling, for a snappier arc. |
| `fallingMaxVel` | `20` | Vertical speed cap while falling; above it, gravity scaling is released. |

## Ground detection & floating

The controller hovers the capsule a small distance above the ground using a
spring–damper, casting downward each tick to find the surface.

| Option | Default | Description |
| --- | --- | --- |
| `groundDetection` | `"shapeCast"` | `"shapeCast"` (a sphere sweep) or `"rayCast"` (a single ray, with a walkable-center fallback). |
| `slopeMaxAngle` | `Math.PI / 2.5` (~72°) | Maximum angle still treated as standable ground. |
| `floatHeight` | `0.2` | Target gap between the capsule and the ground. |
| `rayOriginOffest` | `-capsuleHalfHeight` | Offset of the cast origin along the body up-axis. *(Spelling matches the API.)* |
| `rayLength` | `capsuleRadius + 1` | Length of the ground cast. |
| `rayRadius` | `capsuleRadius / 2` | Sphere radius for `"shapeCast"` detection. |
| `rayHitForgiveness` | `0.28` | Extra tolerance added to the float distance when deciding `isOnGround` — smooths ground contact over small gaps. |
| `springK` | `80` | Floating spring stiffness. Higher = stiffer hover. |
| `dampingC` | `6` | Floating spring damping. Higher = less bounce. |

:::caution[Scale the float spring to the body mass]
`springK` / `dampingC` are the one controller force that is **not**
mass-normalized. The defaults (`80` / `6`) are tuned for a ~0.283 kg reference
capsule, but a default-density Jolt capsule is ~280 kg — so the defaults are
~1000× too soft and the character sags into the ground and can't move. Scale
them by the real body mass:

```ts
const massScale = body.mass() / 0.283;
new CharacterController({ world, body, springK: 80 * massScale, dampingC: 6 * massScale });
```

This is the single most common setup mistake. See the
[interactive examples](/jolt-ts-character-controller/examples/third-person/), which all do this.
:::

## Auto-balance & turning

| Option | Default | Description |
| --- | --- | --- |
| `autoBalance` | `true` | Keep the capsule upright with a corrective torque. |
| `autoBalanceSpringK` | `0.5` | Uprighting spring stiffness. |
| `autoBalanceDampingC` | `0.03` | Uprighting spring damping. |
| `autoBalanceSpringOnY` | `0.08` | Turn-to-face spring stiffness (yaw). |
| `autoBalanceDampingOnY` | `0.006` | Turn-to-face spring damping (yaw). |

## Moving platforms & counter-impulses

See [Moving Platforms](/jolt-ts-character-controller/character-controller/moving-platforms/) for the full
story.

| Option | Default | Description |
| --- | --- | --- |
| `followPlatform` | `true` | Inherit velocity from a moving or kinematic body you're standing on. |
| `slideGripFactor` | `0.5` | Friction blend for **static** ground (slide-to-stop feel). |
| `platformGripFactor` | `1` | How strongly planar velocity matches a **moving** platform (1 = no slide). |
| `massRatioFallOffCurveData` | *(built-in curve)* | [Curve](/jolt-ts-character-controller/advanced/curves/) mapping platform/character mass ratio to how much the character pushes back on dynamic ground. |
| `applyCounterMass` | `true` | Press down on dynamic ground with the character's weight (Newton's third law). |
| `applyCounterJumpImp` | `true` | Apply the reaction of a jump to dynamic ground you jump from. |
| `counterJumpImpFactor` | `1` | Scales the counter-jump impulse. |
| `applyCounterMoveImp` | `true` | Apply the reaction of movement to dynamic ground you walk on. |
| `counterMoveImpFactor` | `1` | Scales the counter-move impulse. |

## Custom gravity

See [Custom Gravity](/jolt-ts-character-controller/character-controller/custom-gravity/) for examples.

| Option | Default | Description |
| --- | --- | --- |
| `enableCustomGravity` | `false` | Use `gravityField` instead of world gravity for this controller. |
| `gravityField` | `() => ({ x: 0, y: -9.81, z: 0 })` | `(position: Vector3) => Vector3Like` returning the gravity vector at a point. |
| `gravityDirLerpSpeed` | `6` | How fast the up-axis realigns when the gravity direction changes. |

:::caution[Curve options need a refresh]
`massRatioFallOffCurveData` is baked into a lookup table at construction. If you
replace it at runtime, call `controller.refreshMassRatioFallOffCurve()` so the
new curve takes effect.
:::
