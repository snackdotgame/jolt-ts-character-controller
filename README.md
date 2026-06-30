# jolt-ts-character-controller

Imperative Ecctrl-style character and vehicle controllers for the
`jolt-ts` wrapper. The runtime surface is rendering-free: callers own their
Jolt world, render loop, networking, and asset scene.

```ts
import { World } from "jolt-ts";
import { EcctrlJoltController } from "jolt-ts-character-controller";

const world = await World.create({ gravity: [0, -9.81, 0] });
const controller = new EcctrlJoltController({
  world,
  position: [0, 1, 0],
  motionQuality: "linearCast"
});

controller.setForwardDirection(
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 1, z: 0 }
);
controller.setMovement({ forward: true, run: true });
controller.step(1 / 60);
world.step(1 / 60);
```

The controller has no React, DOM, canvas, or browser dependency. The caller owns
world stepping and networking. `step(dt)` applies Ecctrl-style floating,
friction, jump, movement, turning, and platform impulses to a Jolt dynamic
capsule body without allocating a snapshot. `update(dt)` is kept for callers
that want the same simulation step plus a freshly allocated snapshot return.
When `useCustomForward` is `false`, `setForwardDirection` should receive the
camera world direction and camera up vector, matching Ecctrl's camera-relative
movement projection. When `useCustomForward` is `true`, the same method accepts
the custom forward axis directly.

Jolt CCD is exposed through the controller `motionQuality` option. Use
`"linearCast"` for a dynamic character body that should sweep against thin or
fast-moving scene geometry. Kinematic platforms are still driven with
`Body.moveKinematic(...)`; Jolt does not stop kinematic bodies during CCD, so
the dynamic character or projectile body is the body that opts into
`linearCast`.

The imperative controller exposes Ecctrl-style handle fields such as
`currPos`, `currQuat`, `inputDir`, `movingDirection`, `relativeVel`,
`floatingImpulse`, `standCollider`, `isOnGround`, `runActive`, `lockForward`,
and `turnOnYQuat`. `standBody` is kept as a Jolt-specific alias for the same
body returned by Ecctrl's `standCollider` name.

Animation state is decoupled from physics and rendering. You can use the
Ecctrl-compatible resolver with the Jolt controller snapshot, with a custom
imperative controller, or just as a plain state machine:

```ts
import {
  EcctrlAnimationStateController,
  createEcctrlJoltAnimationStateController
} from "jolt-ts-character-controller";

const animationState = createEcctrlJoltAnimationStateController(controller, {
  onChange: (state) => {
    console.log(state);
  }
});

animationState.update();

const customAnimationState = new EcctrlAnimationStateController({
  getSnapshot: () => ({
    isOnGround: true,
    isFalling: false,
    isMoving: playerSpeed > 0.1,
    runActive: sprintHeld,
    jumpActive: jumpPressed
  })
});
```

For normal Three.js, compose that state controller with your
`AnimationMixer` actions. This is not tied to React Three Fiber:

```ts
import {
  EcctrlThreeAnimationController,
  createEcctrlJoltAnimationStateController
} from "jolt-ts-character-controller";

const threeAnimation = new EcctrlThreeAnimationController({
  stateController: createEcctrlJoltAnimationStateController(controller),
  actions
});

mixer.addEventListener("finished", (event) => {
  threeAnimation.notifyFinished(event.action);
});

threeAnimation.update();
```

Vehicles are imperative too:

```ts
import { Shape, World } from "jolt-ts";
import { EcctrlJoltVehicle } from "jolt-ts-character-controller";

const world = await World.create({ gravity: [0, -9.81, 0] });
const vehicle = new EcctrlJoltVehicle({
  world,
  shape: Shape.box({ halfExtents: [1, 0.4, 2.4] }),
  density: 200,
  carConfig: { engineHorsepower: 600 }
});

vehicle.addWheel({ position: [0.9, 0, 1.8], steerWheel: true, driveWheel: true, brakeWheel: true });
vehicle.addWheel({ position: [-0.9, 0, 1.8], steerWheel: true, driveWheel: true, brakeWheel: true });
vehicle.addWheel({ position: [0.9, 0, -1.8], driveWheel: true, brakeWheel: true });
vehicle.addWheel({ position: [-0.9, 0, -1.8], driveWheel: true, brakeWheel: true });

vehicle.setMovement({ forward: true });
vehicle.update(1 / 60);
world.step(1 / 60);
```

`src/demo.ts` ports the upstream Ecctrl demo scene to plain Three plus Jolt:
`testMap.glb`, `vehicles.glb`, `capsule.glb`, and `AnimationLibrary.glb` are
served from `public/`, with character, two car, and drone controllers driven by
the imperative API.

## Performance

Run the deterministic headless controller benchmark with:

```sh
pnpm run perf:controller
```

The benchmark reports the low-allocation `controller.step(dt)` path, the
snapshot-returning `controller.update(dt)` path, and standalone snapshot
allocation cost. For browser-level comparison with upstream Ecctrl, run this
demo and the upstream Ecctrl demo side by side, then compare the shared
StatsGl FPS/CPU/GPU overlay:

```sh
pnpm exec vite --host 127.0.0.1 --port 5177
npm --prefix ../ecctrl run dev -- --host 127.0.0.1 --port 5178
```
