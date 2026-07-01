---
title: Drones
description: Build a thrust-and-torque multirotor with Vehicle propellers, using velocity control or autonomous position control.
---

Add **propellers** instead of wheels and `Vehicle` becomes a
multirotor drone. Each propeller contributes thrust and reaction torque; the
vehicle's mixer automatically computes a hover throttle to fight gravity and
blends per-propeller throttle to achieve the tilt and yaw you ask for. You never
set raw thrust — you ask for motion.

## Minimal quadcopter

```ts
import { Shape } from "jolt-ts";
import { Vehicle } from "jolt-ts-character-controller";

const drone = new Vehicle({
  world,
  shape: Shape.compound([
    { shape: Shape.box({ halfExtents: [0.4, 0.2, 1.5] }) },
    { shape: Shape.cylinder({ halfHeight: 0.05, radius: 0.65 }), position: [ 1, -0.15,  1] },
    { shape: Shape.cylinder({ halfHeight: 0.05, radius: 0.65 }), position: [ 1, -0.15, -1] },
    { shape: Shape.cylinder({ halfHeight: 0.05, radius: 0.65 }), position: [-1, -0.15,  1] },
    { shape: Shape.cylinder({ halfHeight: 0.05, radius: 0.65 }), position: [-1, -0.15, -1] },
  ]),
  density: 200,
  droneConfig: { controlMode: "VELOCITY", maxHorizSpeed: 20, maxVertSpeed: 8, maxTiltAngle: Math.PI / 4 },
});

// A quad alternates torque direction to cancel net yaw.
drone.addPropeller({ position: [ 1, -0.15,  1], maxThrust: 5000, torqueRatio: 0.6, invertTorque: true });
drone.addPropeller({ position: [-1, -0.15,  1], maxThrust: 5000, torqueRatio: 0.6 });
drone.addPropeller({ position: [ 1, -0.15, -1], maxThrust: 5000, torqueRatio: 0.6 });
drone.addPropeller({ position: [-1, -0.15, -1], maxThrust: 5000, torqueRatio: 0.6, invertTorque: true });
```

Step it like any vehicle:

```ts
drone.setMovement(input);
drone.step(dt);
world.step(dt);
```

:::note[Drones hover against gravity]
Hover throttle is derived from `mass × gravity magnitude`, so the drone needs a
gravity source to push against — either the world's gravity or a
[custom gravity](/jolt-ts-character-controller/character-controller/custom-gravity/) field
(`enableCustomGravity` + `gravityField`). In zero-g it simply won't auto-hover.
:::

## Control modes

The `droneConfig.controlMode` picks how you fly it.

### `"VELOCITY"` — manual flight

Inputs command target velocities and rotation rates. Nothing else is needed; the
drone holds altitude on its own and moves as you steer.

| Field | Effect |
| --- | --- |
| `throttleUp` / `throttleDown` | Climb / descend (`joystickL.y` for analog). |
| `yawLeft` / `yawRight` | Rotate heading (`joystickL.x`). |
| `pitchForward` / `pitchBackward` | Tilt to fly forward / back (`joystickR.y`). |
| `rollLeft` / `rollRight` | Tilt to strafe (`joystickR.x`). |

```ts
drone.setMovement({
  throttleUp: keys.w,
  throttleDown: keys.s,
  yawLeft: keys.a,
  yawRight: keys.d,
  pitchForward: keys.up,
  pitchBackward: keys.down,
  rollLeft: keys.left,
  rollRight: keys.right,
});
```

### `"POSITION"` — autonomous hold

The drone flies itself to a target point and heading you set with `setTarget`.
No throttle/attitude inputs required — great for camera drones, waypoints, and
AI.

```ts
const drone = new Vehicle({ world, /* ... */, droneConfig: { controlMode: "POSITION" } });

drone.setTarget({ x: 0, y: 6, z: 12 }, { x: 0, y: 0, z: 1 }); // go here, face +Z
drone.step(dt);
world.step(dt);
```

`setTarget(position?, direction?)` updates either argument independently, so you
can retarget position and heading separately each tick.

## Drone configuration

Pass a partial `droneConfig`; unset fields fall back to `DEFAULT_DRONE_CONFIG`.

| Field | Default | Description |
| --- | --- | --- |
| `controlMode` | `"VELOCITY"` | `"VELOCITY"` or `"POSITION"`. |
| `maxYawRate` | `2` | Max yaw rate (rad/s). |
| `maxHorizSpeed` | `30` | Max horizontal speed. |
| `maxVertSpeed` | `8` | Max climb/descend speed. |
| `maxTiltAngle` | `π / 4` | Max tilt used to translate. |
| `airDragFactor` | `0.2` | Linear air drag. |
| `TILT_P` / `TILT_D` | `15` / `3` | Attitude (tilt) PD gains. |
| `YAW_POS_P` / `YAW_VEL_P` | `6` / `4` | Yaw position / rate gains. |
| `VERT_POS_P` / `VERT_POS_D` | `9` / `7` | Vertical position PD gains (POSITION mode). |
| `HORIZ_POS_P` / `HORIZ_POS_D` | `5` / `5.5` | Horizontal position PD gains (POSITION mode). |
| `VERT_VEL_P` / `HORIZ_VEL_P` | `2` / `1` | Vertical / horizontal velocity gains (VELOCITY mode). |

```ts
import { DEFAULT_DRONE_CONFIG } from "jolt-ts-character-controller";
```

## Propeller options

`addPropeller(options)` returns a `ThrustPropeller`. Only `position`
is required; the rest fall back to `DEFAULT_PROPELLER_OPTIONS`.

| Option | Default | Description |
| --- | --- | --- |
| `position` | — | **Required.** Propeller position in body-local space. |
| `maxThrust` | `500` | Maximum thrust at full throttle. |
| `torqueRatio` | `0.6` | Reaction torque as a fraction of thrust (drives yaw authority). |
| `invertThrust` | `false` | Flip the thrust direction. |
| `invertTorque` | `false` | Flip the reaction torque — alternate across rotors to balance yaw. |
| `rotation` | *(identity)* | Orientation of the propeller in body-local space. |

:::tip[Balancing yaw]
On a standard quad, diagonal rotors spin the same way. Mirror that here by
setting `invertTorque: true` on one diagonal pair and leaving it `false` on the
other, so the net reaction torque cancels when hovering. Unbalanced
`invertTorque` makes the airframe spin.
:::

## Reading propeller state (for visuals)

Spin your rotor meshes from each propeller's throttle and world thrust
direction:

```ts
for (let i = 0; i < drone.propellers.length; i++) {
  const p = drone.propellers[i];
  // p.finalThrottle          – 0..1 mixed throttle this tick
  // p.worldThrustDirection   – world-space thrust axis (Vector3)
  spinRotorMesh(rotorMeshes[i], p.finalThrottle);
}
```

`drone.propellers[i].snapshot()` returns the full per-propeller state
(`throttle`, `finalThrottle`, world thrust/torque directions and positions, and
the applied impulses).
