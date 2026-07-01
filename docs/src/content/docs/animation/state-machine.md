---
title: Animation State Machine
description: Turn controller state into locomotion states with AnimationStateController — with the Jolt controller, a custom source, or standalone.
---

Animation is fully decoupled from physics and rendering. The
`AnimationStateController` is a tiny state machine that reads five booleans
and resolves them into a locomotion state. It knows nothing about Jolt or
Three.js, so you can drive it from the Jolt controller, from your own character,
or from hand-rolled state in a test.

## The states

```ts
type AnimationState =
  | "IDLE"
  | "WALK"
  | "RUN"
  | "JUMP_START"
  | "JUMP_IDLE"
  | "JUMP_FALL"
  | "JUMP_LAND";
```

The default resolver maps a snapshot to a state like this:

- `JUMP_START` — a jump has just begun (`jumpActive` while previously grounded).
- `JUMP_LAND` — just touched down (grounded now, airborne last tick).
- `IDLE` / `WALK` / `RUN` — grounded and, respectively, still / moving /
  moving while `runActive`.
- `JUMP_FALL` — airborne and descending.
- `JUMP_IDLE` — airborne and rising / at apex.

## The snapshot it reads

```ts
interface AnimationSnapshot {
  readonly isOnGround: boolean;
  readonly isFalling: boolean;
  readonly isMoving: boolean;
  readonly runActive: boolean;
  readonly jumpActive: boolean;
}
```

These are exactly the fields the Jolt controller exposes, which is why wiring the
two together is a one-liner.

## With the Jolt controller

`createCharacterAnimationStateController` builds a state controller whose
`getSnapshot` reads the controller's live getters (allocation-free):

```ts
import { createCharacterAnimationStateController } from "jolt-ts-character-controller";

const animation = createCharacterAnimationStateController(controller, {
  onChange: (state) => console.log("now:", state),
});

// Each tick, after controller.step(dt):
const state = animation.update(); // "IDLE" | "WALK" | ...
```

Call `update()` once per tick, **after** `controller.step(dt)`, so it reads
fresh state. `update()` returns the current state and fires `onChange` only when
the state actually changes.

## Standalone (any character)

The state controller only needs a `getSnapshot` function, so you can drive it
from anything — a custom controller, network state, or a manual test:

```ts
import { AnimationStateController } from "jolt-ts-character-controller";

const animation = new AnimationStateController({
  getSnapshot: () => ({
    isOnGround: player.grounded,
    isFalling: player.velocityY < 0 && !player.grounded,
    isMoving: player.speed > 0.1,
    runActive: player.sprinting,
    jumpActive: player.jumping,
  }),
});

animation.update();
```

If you already have a controller `snapshot()`, convert it with the provided
helper:

```ts
import { animationSnapshotFromControllerSnapshot } from "jolt-ts-character-controller";

const animation = new AnimationStateController({
  getSnapshot: () => animationSnapshotFromControllerSnapshot(controller.snapshot()),
});
```

## Options

`AnimationStateController` accepts:

| Option | Description |
| --- | --- |
| `getSnapshot` | **Required.** Returns the current `AnimationSnapshot`. |
| `handle` | An arbitrary value passed through to the resolver/`onChange` context (the Jolt helper sets this to the controller). |
| `resolver` | Custom state resolver (see below). Defaults to `resolveAnimationState`. |
| `initialState` | Starting state. Defaults to `"IDLE"`. |
| `onChange` | Called `(state, context)` whenever the state changes. |

The `context` given to the resolver and `onChange` extends the snapshot with
`handle` and `wasOnGround` (the previous tick's ground flag).

## Custom resolver

Swap in your own logic — for example, to add a dedicated fall state threshold or
extra locomotion states:

```ts
import {
  AnimationStateController,
  resolveAnimationState,
  type AnimationStateResolver,
} from "jolt-ts-character-controller";

const resolver: AnimationStateResolver = (context) => {
  if (context.isOnGround && context.isMoving && !context.runActive && context.handle?.moveSpeed < 0.6) {
    return "WALK"; // treat very slow movement as a walk
  }
  return resolveAnimationState(context); // fall back to the default
};

const animation = new AnimationStateController({ getSnapshot, resolver });
```

## Resetting

`reset(state?, isOnGround?)` forces the machine back to a known state — useful
after teleporting or respawning:

```ts
animation.reset("IDLE");
```

Read the current state at any time with `animation.state`.

Next: drive an actual `AnimationMixer` from these states with the
[Three.js integration](/jolt-ts-character-controller/animation/three-integration/).
