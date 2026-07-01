---
title: Cars
description: Build a shape-cast wheeled vehicle with suspension, tire-slip friction, steering, braking, and an automatic gearbox using Vehicle.
---

`Vehicle` drives a single rigid body through **shape-cast wheels**.
Each wheel casts against the world for suspension, applies a spring–damper float,
and computes longitudinal/lateral tire friction with slip curves — the same model
Ecctrl's vehicle uses, ported to Jolt. The same class also powers
[drones](/jolt-ts-character-controller/vehicles/drones/); a vehicle becomes a car as soon as you add wheels.

## Minimal car

```ts
import { Shape } from "jolt-ts";
import { Vehicle } from "jolt-ts-character-controller";

const vehicle = new Vehicle({
  world,
  shape: Shape.box({ halfExtents: [1, 0.4, 2.4] }),
  density: 200,
  carConfig: { engineHorsepower: 600, maxSteerAngle: Math.PI / 6 },
});

// Front axle: steer + drive + brake.
vehicle.addWheel({ position: [ 0.9, 0,  1.8], steerWheel: true, driveWheel: true, brakeWheel: true });
vehicle.addWheel({ position: [-0.9, 0,  1.8], steerWheel: true, driveWheel: true, brakeWheel: true });
// Rear axle: drive + brake.
vehicle.addWheel({ position: [ 0.9, 0, -1.8], driveWheel: true, brakeWheel: true });
vehicle.addWheel({ position: [-0.9, 0, -1.8], driveWheel: true, brakeWheel: true });
```

Then drive it each tick, exactly like the character — set input, step the
vehicle, step the world:

```ts
vehicle.setMovement({
  forward: keys.up,
  backward: keys.down,
  steerLeft: keys.left,
  steerRight: keys.right,
  brake: keys.space,
});

vehicle.step(dt);
world.step(dt);
```

The constructor auto-creates a dynamic box body (via
`createVehicleBody`) with `motionQuality: "linearCast"` and friction
`0.8`. Pass your own `shape`, `mass` / `density` / `massProperties`, or a
prebuilt `body` to customize it. Wheel `position`s are in the body's local space.

## Vehicle input

`setMovement` takes a partial [`VehicleInput`](/jolt-ts-character-controller/reference/api/). For cars the
relevant fields are:

| Field | Effect |
| --- | --- |
| `forward` / `backward` | Throttle forward / reverse. |
| `steerLeft` / `steerRight` | Steer the steering wheels. |
| `brake` | Apply braking torque to brake wheels. |
| `joystickL` | `joystickL.x` gives analog steering. |

As with the character, omitted fields keep their previous value.

## Car configuration

Pass a partial `carConfig`; unset fields fall back to `DEFAULT_CAR_CONFIG`.

| Field | Default | Description |
| --- | --- | --- |
| `controlMode` | `"VELOCITY"` | Control model for the drivetrain. |
| `engineHorsepower` | `6` | Engine power; scales max drive torque. |
| `engineMaxRPM` | `6000` | Redline; caps wheel angular velocity. |
| `gearRatios` | `[10]` | Per-gear ratios. |
| `finalDriveRatio` | `1` | Multiplies every gear ratio. |
| `transmissionMode` | `"auto"` | `"auto"` shifts by RPM; `"manual"` uses `setGear`. |
| `shiftUpRPM` / `shiftDownRPM` | `5200` / `2200` | Auto-shift thresholds. |
| `shiftCooldown` | `0.35` | Seconds between automatic shifts. |
| `steerRate` | `2π` | How fast the steer angle moves toward its target. |
| `maxSteerAngle` | `π / 6` | Maximum steering angle. |
| `reverseTorqueScale` | `1` | Scales torque in reverse. |
| `reverseRPMScale` | `0.3` | Scales the RPM ceiling in reverse. |
| `engineTorqueCurveData` | *(built-in)* | [Curve](/jolt-ts-character-controller/advanced/curves/) of torque vs normalized RPM. |
| `steerAngleCurveData` | *(built-in)* | [Curve](/jolt-ts-character-controller/advanced/curves/) of steer angle vs speed (less steering at speed). |

```ts
import { DEFAULT_CAR_CONFIG } from "jolt-ts-character-controller";
```

## Wheel options

`addWheel(options)` returns a `ShapeCastWheel`. Only `position` is
required; everything else falls back to `DEFAULT_WHEEL_OPTIONS`. The most useful
knobs:

| Option | Default | Description |
| --- | --- | --- |
| `position` | — | **Required.** Wheel position in body-local space. |
| `driveWheel` | `false` | Receives engine torque. |
| `steerWheel` | `false` | Steers with input. Set `true` on the steered axle. |
| `brakeWheel` | `false` | Receives braking torque. |
| `driveTorqueWeight` | `1` | Share of engine torque among drive wheels. |
| `driveInvert` / `steerInvert` | `false` | Flip drive / steer direction for this wheel. |
| `springK` / `dampingC` | `180` / `16` | Suspension spring / damper. Raise a lot for heavy bodies. |
| `rayShapeR` / `rayShapeH` | `0.5` / `0.15` | Shape-cast wheel radius / half-height. |
| `rayLength` | `0.5` | Suspension cast length (travel). |
| `maxBrakeTorque` | `40` | Braking torque cap. |
| `tireGripFactor` | `1.5` | Overall tire grip. |
| `rollingResistanceCoef` | `0.007` | Rolling resistance. |
| `lngSlipRatioCurveData` / `latSlipRatioCurveData` | *(built-in)* | Longitudinal / lateral [slip curves](/jolt-ts-character-controller/advanced/curves/). |
| `followPlatform` | `true` | Ride moving/kinematic ground under this wheel. |
| `wheelModelRadius` | `0.5` | Radius used when reporting wheel spin (for visuals). |

:::tip[Heavy bodies need stiff suspension]
The default `springK`/`dampingC` suit a light body. A ~200-density car wants much
stiffer suspension — the bundled demo uses `springK: 38000`, `dampingC: 4000`,
`maxBrakeTorque: 3000`. If the chassis sags into the ground, raise these first.
:::

## Transmission & gearbox

In `"auto"` mode the vehicle shifts by engine RPM. Read the drivetrain state from
getters or the snapshot:

```ts
vehicle.engineRPM; // current engine RPM
vehicle.gearIndex; // active gear index
vehicle.driveRatio; // effective ratio (gear × final drive)
```

For `"manual"` transmission, shift yourself:

```ts
const vehicle = new Vehicle({
  world,
  carConfig: { transmissionMode: "manual", gearRatios: [3.5, 2.1, 1.4, 1.0, 0.8], finalDriveRatio: 3.9 },
});

vehicle.setGear(vehicle.gearIndex + 1); // upshift
```

## Reading wheel state (for visuals)

The vehicle doesn't render wheels — you place your wheel meshes from each wheel's
snapshot. Iterate `vehicle.wheels` and read what you need:

```ts
for (let i = 0; i < vehicle.wheels.length; i++) {
  const w = vehicle.wheels[i].snapshot();
  // w.rayPos          – suspension cast origin (world)
  // w.supportPosition – where the wheel meets the ground
  // w.suspensionToi   – suspension compression (0 = fully extended)
  // w.steerAngle      – current steer angle (radians)
  // w.wheelAngularVelocity – spin speed for rolling the mesh
  // w.hitBody         – the ground body, or null when airborne
  placeWheelMesh(wheelMeshes[i], w);
}
```

Each wheel snapshot also reports tire state (`longitudinalSlipRatio`,
`lateralSlipRatio`, `slipStrength`) and the impulses it applied — handy for skid
marks, tire smoke, or debugging grip.

## Vehicle snapshot & getters

`vehicle.snapshot()` (and `vehicle.update(dt)`) returns body pose, body axes,
gravity, `gearIndex`, `driveRatio`, `engineRPM`, `wheelCount`, and
`propellerCount`. Live getters mirror the character's: `currPos`, `currQuat`,
`currLinVel`, `currAngVel`, `bodyX` / `bodyY` / `bodyZ`, `up`, `gravity`,
`gravityMagnitude`, plus `gearIndex` / `driveRatio` / `engineRPM` and the
`wheels` / `propellers` arrays.

:::caution[Retuning curves]
If you replace `engineTorqueCurveData` or `steerAngleCurveData` at runtime, call
`vehicle.refreshCarCurves()` to rebake them.
:::
