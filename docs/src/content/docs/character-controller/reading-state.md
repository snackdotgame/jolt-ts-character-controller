---
title: Reading State
description: The two ways to read controller state — allocation-free live getters and the immutable snapshot object — and every field they expose.
---

There are two ways to observe a controller after a tick:

1. **Live getters** (`controller.isOnGround`, `controller.currPos`, …) — return
   the controller's internal values with **no allocation**. Vectors and
   quaternions are the actual `three` instances the controller reuses each tick.
2. **`snapshot()`** — returns a fresh, immutable
   `CharacterControllerSnapshot` of plain data. `update(dt)` returns one
   automatically.

```ts
// Zero-allocation reads (best for per-frame loops):
if (controller.isOnGround && controller.moveSpeed > 0.1) { /* footstep */ }

// Detached copy (safe to store, serialize, diff):
const snap = controller.snapshot();
```

:::caution[Getters are live, not copies]
The vectors returned by getters like `currPos` or `forwardDir` are the
controller's own objects. **Do not mutate them**, and don't hold onto them
expecting a stable value — they change on the next `step()`. If you need to keep
a value, copy it (`.clone()`, or read `snapshot()`).
:::

## Snapshot fields

`snapshot()` (and the return of `update(dt)`) is a `CharacterControllerSnapshot`
with these read-only fields. Vectors are `{ x, y, z }`, quaternions are
`{ x, y, z, w }`.

### Transform & velocity

| Field | Type | Meaning |
| --- | --- | --- |
| `position` | vector | Body position. |
| `rotation` | quaternion | Body rotation. |
| `linearVelocity` | vector | Body linear velocity. |
| `angularVelocity` | vector | Body angular velocity. |
| `relativeVelocity` | vector | Velocity relative to the platform you're on (equals `linearVelocity` on static ground). |
| `moveSpeed` | number | Planar speed magnitude (relative to platform). |
| `verticalSpeed` | number | Speed along the up-axis (signed). |

### Direction & body frame

| Field | Type | Meaning |
| --- | --- | --- |
| `inputDirection` | vector | Normalized world-space movement intent for this tick. |
| `forwardDirection` | vector | Resolved forward axis. |
| `rightwardDirection` | vector | Resolved right axis. |
| `movingDirection` | vector | Direction the body is actually being driven (slope-adjusted). |
| `bodyXAxis` / `bodyYAxis` / `bodyZAxis` | vector | The body's local axes in world space. |
| `upAxis` | vector | The reference up-axis (world up, or body up if `useCharacterUpAxis`). |

### Gravity

| Field | Type | Meaning |
| --- | --- | --- |
| `gravityDir` | vector | Current (smoothed) gravity direction. |
| `gravityMag` | number | Gravity magnitude. |

### Ground & contact

| Field | Type | Meaning |
| --- | --- | --- |
| `isOnGround` | boolean | Standing on walkable ground this tick. |
| `wasOnGround` | boolean | `isOnGround` from the previous tick (drives landing detection). |
| `isFalling` | boolean | Moving down along the up-axis and not grounded. |
| `isOnPlatform` | boolean | Standing on a moving or kinematic body. |
| `standBody` / `standCollider` | `Body \| null` | The Jolt body under the character. Two names for the same value (`standCollider` is the Ecctrl name). |
| `standPoint` | vector | World contact point on the ground. |
| `standNormal` | vector | Ground surface normal. |
| `groundHitDistance` | number | Distance from the cast origin to the ground. |
| `groundFloatingDistance` | number | Target hover distance. |
| `slopeAngle` | number | Slope angle in the direction of travel (radians). |
| `actualSlopeAngle` | number | Angle between the ground normal and up (radians). |
| `standFriction` | number | Friction of the ground body. |
| `slideFriction` | number | Blended friction coefficient the controller is applying. |

### Movement flags & debug impulses

| Field | Type | Meaning |
| --- | --- | --- |
| `isMoving` | boolean | Has non-zero movement intent this tick. |
| `runActive` | boolean | Running (resolved from the run toggle/hold). |
| `jumpActive` | boolean | A jump impulse is currently being applied. |
| `lockForward` | boolean | Facing is locked to the forward vector. |
| `moveImpulse` | vector | Movement impulse applied this tick (debug/visualization). |
| `floatingImpulse` | vector | Floating spring impulse this tick. |
| `dragFrictionImpulse` | vector | Friction impulse this tick. |

## Live getters

The most common getters mirror the snapshot but return live values with no
allocation. Highlights:

| Getter | Returns | Notes |
| --- | --- | --- |
| `isOnGround` / `isFalling` / `isOnPlatform` | `boolean` | Ground state. |
| `isMoving` / `runActive` / `jumpActive` / `lockForward` | `boolean` | Movement flags. |
| `moveSpeed` / `verticalSpeed` | `number` | Speed metrics. |
| `currPos` / `currQuat` | `Vector3` / `Quaternion` | Live body pose (Ecctrl handle names). |
| `currLinVel` / `currAngVel` | `Vector3` | Live velocities. |
| `inputDir` (`inputDirection`) / `forwardDir` / `movingDirection` | `Vector3` | Live directions. |
| `relativeVel` / `relativeVelOnPlane` / `relativeVelOnUp` | `Vector3` | Platform-relative velocity components. |
| `bodyXAxis` / `bodyYAxis` / `bodyZAxis` / `upAxis` | `Vector3` | Live body frame. |
| `gravityDir` / `gravityMag` | `Vector3` / `number` | Live gravity. |
| `standBody` / `standCollider` | `Body \| null` | Ground body. |
| `standPoint` / `standNormal` | `Vector3` | Live contact info. |
| `groundHitDistanceValue` / `groundFloatingDistanceValue` | `number` | Distances (note the `Value` suffix on the getters). |
| `slopeAngle` / `actualSlopeAngle` / `standFriction` / `slideFriction` | `number` | Slope & friction. |
| `moveImpulse` / `floatingImpulse` / `dragFrictionImpulse` | `Vector3` | Live debug impulses. |
| `turnOnYQuat` | `Quaternion` | The platform's per-tick yaw rotation (used for platform-follow turning). |
| `input` | `MovementInput` | The current movement intent. |

These field names are intentionally **Ecctrl-compatible** (`currPos`,
`currQuat`, `inputDir`, `movingDirection`, `relativeVel`, `floatingImpulse`,
`standCollider`, `isOnGround`, `runActive`, `lockForward`, `turnOnYQuat`), so
code and debug overlays written against Ecctrl's handle port with minimal
changes. `standBody` is a Jolt-flavored alias for `standCollider`.

## Feeding animation

The five booleans an animation state machine needs — `isOnGround`, `isFalling`,
`isMoving`, `runActive`, `jumpActive` — are all present as getters and snapshot
fields, which is exactly what
[`createCharacterAnimationStateController`](/jolt-ts-character-controller/animation/state-machine/) reads.
