---
title: Movement & Input
description: Feeding movement intent to the controller, choosing camera-relative or custom forward, joystick input, run toggling, and locked facing.
---

The controller is driven by two calls each tick: `setMovement(...)` supplies
intent (which buttons are held), and `setForwardDirection(...)` supplies the
reference frame that intent is projected into.

## Movement input

`setMovement` takes a partial [`MovementInput`](/jolt-ts-character-controller/reference/api/):

```ts
type MovementInput = {
  forward?: boolean;
  backward?: boolean;
  leftward?: boolean;
  rightward?: boolean;
  joystick?: { x: number; y: number };
  run?: boolean;
  jump?: boolean;
};
```

```ts
controller.setMovement({ forward: true, run: true });
```

:::note[Fields persist]
`setMovement` only overwrites the fields you pass. Anything left `undefined`
keeps its previous value. That means you can call it with just the deltas, or —
more commonly — keep one input object and mutate it in place:

```ts
const input = { forward: false, backward: false, leftward: false, rightward: false, run: false, jump: false };
// each frame:
input.forward = keys.has("KeyW");
controller.setMovement(input);
```
:::

You can also read the current intent back through `controller.input`.

## Forward direction

Discrete keys (`forward`/`backward`/`leftward`/`rightward`) and the joystick are
**relative to a forward direction** you provide with `setForwardDirection`
(aliased as `setForwardDir`). How that vector is interpreted depends on the
`useCustomForward` option.

### Camera-relative (default)

When `useCustomForward` is `false` (the default), `setForwardDirection` expects
the **camera's world direction** and the **camera's up vector**. The controller
projects them onto the movement plane so "forward" always means "away from the
camera", exactly like Ecctrl:

```ts
import { Vector3 } from "three";

const cameraForward = new Vector3();

function frame() {
  camera.getWorldDirection(cameraForward);
  controller.setForwardDirection(cameraForward, camera.up);
  controller.setMovement(input);
  controller.step(dt);
  world.step(dt);
}
```

### Custom forward

When `useCustomForward` is `true`, the vector you pass **is** the forward axis.
It is projected onto the movement plane (perpendicular to the current up axis)
and normalized. Use this for top-down games, fixed-facing setups, or when you
compute facing yourself:

```ts
const controller = new CharacterController({ world, useCustomForward: true });

// Move along world +Z regardless of any camera.
controller.setForwardDirection({ x: 0, y: 0, z: 1 });
```

The second argument (camera up) is ignored in custom-forward mode.

## Joysticks

Pass a `joystick` with `x` (right/left, `+x` = right) and `y` (forward/back,
`+y` = forward) in the range `[-1, 1]`. When the joystick is non-zero it takes
over from the discrete keys and preserves analog magnitude:

```ts
controller.setMovement({ joystick: { x: gamepad.axes[0], y: -gamepad.axes[1] } });
```

Zero the joystick (`{ x: 0, y: 0 }`) to fall back to the boolean keys.

## Running

By default (`enableToggleRun: true`) the `run` input is a **toggle**: each rising
edge of `run` flips the run state on or off, so a single tap of <kbd>Shift</kbd>
switches to running until tapped again.

```ts
// Toggle mode (default): tap run to start/stop running.
controller.setMovement({ run: shiftJustPressed });
```

Set `enableToggleRun: false` for **hold-to-run**, where the character runs only
while `run` is held:

```ts
const controller = new CharacterController({ world, enableToggleRun: false });
controller.setMovement({ run: shiftHeld });
```

Read the resolved state with `controller.runActive`. Walk and run target speeds
are the `maxWalkVel` and `maxRunVel` options.

## Jumping

`jump` is **edge-triggered**: a jump fires on the rising edge while grounded, and
the input must be released before another jump can start. Hold time is bounded by
`jumpDuration`, and take-off speed is `jumpVel`.

```ts
controller.setMovement({ jump: spaceHeld }); // one jump per press, no auto-bhop
```

On slopes, `slopeJumpFactor` blends the surface normal into the jump direction
(0 = always jump straight along the up-axis). Read `controller.jumpActive` to
know whether a jump impulse is currently being applied — handy for triggering a
[jump animation](/jolt-ts-character-controller/animation/state-machine/).

## Locked facing (strafing)

By default the character turns to face its movement direction. Set
`lockForward` to keep it facing the forward vector while still moving in any
direction — the classic strafe / twin-stick / shooter feel:

```ts
const controller = new CharacterController({ world, lockForward: true });
```

Toggle it at runtime with `setLockForward(...)`, and read it back via
`controller.lockForward`:

```ts
controller.setLockForward(aiming); // face forward while aiming, free-turn otherwise
```
