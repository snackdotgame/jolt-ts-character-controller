---
title: API Reference
description: Every export of jolt-ts-character-controller, grouped by module, with signatures and links to the guides.
---

Everything is exported from the package root:

```ts
import {
  CharacterController,
  Vehicle,
  AnimationStateController,
  ThreeAnimationController,
  bakeCurveLUT,
  // ...types and helpers
} from "jolt-ts-character-controller";
```

Vectors accept `[x, y, z]` or `{ x, y, z }` (`Vector3Like`); quaternions accept
`[x, y, z, w]` or `{ x, y, z, w }` (`QuaternionLike`). Getters that return live
values return `three` `Vector3` / `Quaternion` instances.

## Character controller

### `CharacterController`

The floating-capsule character controller. See
[Overview](/jolt-ts-character-controller/character-controller/overview/).

```ts
new CharacterController(options: CharacterControllerOptions)
```

| Member | Signature | Notes |
| --- | --- | --- |
| `world` | `World` | The world (read-only field). |
| `body` | `Body` | The driven Jolt body (read-only field). |
| `options` | `ResolvedOptions` | Live, mutable resolved options. |
| `step` | `(dt: number) => void` | Simulate one tick; no allocation. |
| `update` | `(dt: number) => CharacterControllerSnapshot` | `step` + a fresh snapshot. |
| `snapshot` | `() => CharacterControllerSnapshot` | Immutable state copy. |
| `setMovement` | `(input: MovementInput) => void` | Set movement intent (partial). |
| `setForwardDirection` / `setForwardDir` | `(dir: Vector3Like, cameraUp?: Vector3Like) => void` | Set the reference forward. |
| `setLockForward` | `(lock: boolean) => void` | Toggle locked facing. |
| `getSyncState` | `() => SyncState` | Capture deterministic state. |
| `applySyncState` | `(state: SyncState) => void` | Restore deterministic state. |
| `refreshMassRatioFallOffCurve` | `() => void` | Rebake the mass-ratio curve. |
| *getters* | | `isOnGround`, `isFalling`, `isOnPlatform`, `isMoving`, `runActive`, `jumpActive`, `lockForward`, `moveSpeed`, `verticalSpeed`, `currPos`, `currQuat`, `currLinVel`, `currAngVel`, `inputDir` / `inputDirection`, `forwardDir`, `movingDirection`, `relativeVel` / `relativeVelOnPlane` / `relativeVelOnUp`, `bodyXAxis` / `bodyYAxis` / `bodyZAxis`, `upAxis`, `gravityDir`, `gravityMag`, `standBody` / `standCollider`, `standPoint`, `standNormal`, `groundHitDistanceValue`, `groundFloatingDistanceValue`, `slopeAngle`, `actualSlopeAngle`, `standFriction`, `slideFriction`, `moveImpulse`, `floatingImpulse`, `dragFrictionImpulse`, `turnOnYQuat`, `input`. See [Reading State](/jolt-ts-character-controller/character-controller/reading-state/). |

### `createCharacterBody`

```ts
createCharacterBody(
  options: CharacterRuntimeOptions & { capsuleHalfHeight?: number; capsuleRadius?: number },
): Body
```

Creates the default dynamic capsule. See
[Bodies, Shapes & Layers](/jolt-ts-character-controller/advanced/bodies-and-layers/).

### `DEFAULT_CONTROLLER_OPTIONS`

The default options object. See [Configuration](/jolt-ts-character-controller/character-controller/configuration/).

### Types

- `CharacterControllerOptions` — full options (extends `CharacterRuntimeOptions`).
- `CharacterRuntimeOptions` — the body/runtime subset (`world`, `body`,
  `position`, `friction`, `motionQuality`, …).
- `CharacterControllerSnapshot` — immutable per-tick state.
- `SyncState` — minimal deterministic state for [network sync](/jolt-ts-character-controller/advanced/network-sync/).

## Vehicles

### `Vehicle`

Drives cars ([wheels](/jolt-ts-character-controller/vehicles/cars/)) and drones
([propellers](/jolt-ts-character-controller/vehicles/drones/)).

```ts
new Vehicle(options: VehicleOptions)
```

| Member | Signature | Notes |
| --- | --- | --- |
| `world` / `body` / `options` | | World, driven body, resolved options. |
| `wheels` | `ShapeCastWheel[]` | Added wheels. |
| `propellers` | `ThrustPropeller[]` | Added propellers. |
| `addWheel` | `(o: WheelOptions) => ShapeCastWheel` | Add a wheel. |
| `removeWheel` | `(w: ShapeCastWheel) => void` | Remove a wheel. |
| `addPropeller` | `(o: PropellerOptions) => ThrustPropeller` | Add a propeller. |
| `removePropeller` | `(p: ThrustPropeller) => void` | Remove a propeller. |
| `setMovement` | `(input: VehicleInput) => void` | Set vehicle intent (partial). |
| `setTarget` | `(position?: Vector3Like, direction?: Vector3Like) => void` | Target for `"POSITION"` drone mode. |
| `setGear` | `(index: number) => void` | Select a gear (manual transmission). |
| `refreshCarCurves` | `() => void` | Rebake engine/steer curves. |
| `step` / `update` / `snapshot` | | As on the controller. |
| *getters* | | `currPos`, `currQuat`, `currLinVel`, `currAngVel`, `bodyX` / `bodyY` / `bodyZ`, `up`, `gravity`, `gravityMagnitude`, `input`, `gearIndex`, `driveRatio`, `engineRPM`. |

### `ShapeCastWheel`

A single shape-cast wheel. Constructed via `vehicle.addWheel(...)`. Exposes
`step`, `update`, `snapshot` (returning `WheelSnapshot`),
`setDriveDemand` / `setBrakeDemand` / `setSteerDemand`, and `refreshConfig`.

### `ThrustPropeller`

A single thrust/torque propeller. Constructed via `vehicle.addPropeller(...)`.
Exposes `step`, `update`, `snapshot` (returning `PropellerSnapshot`),
and getters `finalThrottle`, `throttle`, `localPos`, plus world-space thrust
vectors.

### `createVehicleBody`

```ts
createVehicleBody(options: VehicleRuntimeOptions): Body
```

Creates the default dynamic box vehicle body.

### Constants

- `DEFAULT_CAR_CONFIG` — default `CarConfig`.
- `DEFAULT_DRONE_CONFIG` — default `DroneConfig`.
- `DEFAULT_WHEEL_OPTIONS` — default wheel options.
- `DEFAULT_PROPELLER_OPTIONS` — default propeller options.

### Types

- `VehicleOptions` / `VehicleRuntimeOptions`
- `VehicleSnapshot`
- `CarConfig`, `DroneConfig`
- `WheelOptions`, `WheelSnapshot`
- `PropellerOptions`, `PropellerSnapshot`
- `TransmissionMode` (`"auto" | "manual"`)
- `VehicleControlMode` (`"VELOCITY" | "POSITION"`)

## Animation

See [Animation State Machine](/jolt-ts-character-controller/animation/state-machine/) and
[Three.js Integration](/jolt-ts-character-controller/animation/three-integration/).

### Values

| Export | Signature | Notes |
| --- | --- | --- |
| `AnimationStateController` | `class<THandle>` | Locomotion state machine. `update()`, `reset()`, `state`. |
| `createCharacterAnimationStateController` | `(controller, options?) => AnimationStateController<CharacterController>` | Wire the state machine to a Jolt controller. |
| `resolveAnimationState` | `AnimationStateResolver` | The default state resolver. |
| `animationSnapshotFromControllerSnapshot` | `(snapshot) => AnimationSnapshot` | Build a snapshot from a controller snapshot. |
| `ThreeAnimationController` | `class` | Drives a Three.js `AnimationMixer`. |
| `DEFAULT_THREE_ANIMATION_ACTIONS` | `Record<AnimationState, string>` | Default clip-name map. |

### Types

- `AnimationState` — `"IDLE" | "WALK" | "RUN" | "JUMP_START" | "JUMP_IDLE" | "JUMP_FALL" | "JUMP_LAND"`.
- `AnimationSnapshot` — the five booleans the resolver reads.
- `AnimationStateContext<THandle>` — snapshot + `handle` + `wasOnGround`.
- `AnimationStateResolver<THandle>` — `(context) => AnimationState`.
- `AnimationStateControllerOptions<THandle>` — constructor options.
- `AnimationStateControllerLike` — the interface `ThreeAnimationController` needs.
- `ThreeAnimationControllerOptions` — constructor options.

## Curves

See [Curves](/jolt-ts-character-controller/advanced/curves/).

| Export | Signature |
| --- | --- |
| `bakeCurveLUT` | `(points: CurvePoint[], samples?: number) => CurveLUT` |
| `evaluateCurveLUT` | `(x: number, curve: CurveLUT) => number` |

Types: `CurvePoint`, `CurveData`, `CurveLUT`.

## Shared types

From the types module:

- `MovementInput` / `ReadonlyMovementInput` — character input.
- `VehicleInput` / `ReadonlyVehicleInput` — vehicle input.
- `Vector3Like` — `{ x, y, z }`.
- `QuaternionLike` — `{ x, y, z, w }`.
- `GroundDetectionMode` — `"shapeCast" | "rayCast"`.
- `ControllerUserData` — body `userData` shape for [ray exclusion](/jolt-ts-character-controller/advanced/bodies-and-layers/#excluding-bodies-from-ground-detection).
