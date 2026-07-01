---
title: Three.js Integration
description: Drive a Three.js AnimationMixer from the locomotion state machine with ThreeAnimationController — crossfades, one-shot jumps, and clip remapping.
---

`ThreeAnimationController` connects the
[state machine](/jolt-ts-character-controller/animation/state-machine/) to a Three.js `AnimationMixer`. It
crossfades between looping clips (idle/walk/run/fall) and plays one-shot clips
(jump start/land) with clamping, so you get Ecctrl-style locomotion out of the
box.

It depends on `three` only for the `AnimationAction` type — it never creates or
owns your mixer. You load clips, build actions, and call `mixer.update(dt)`
yourself.

## Full example

```ts
import { AnimationMixer, type AnimationAction } from "three";
import {
  ThreeAnimationController,
  createCharacterAnimationStateController,
} from "jolt-ts-character-controller";

// 1. Build actions from your loaded clips (e.g. from a GLTF).
const mixer = new AnimationMixer(characterObject);
const actions = new Map<string, AnimationAction>();
for (const clip of gltf.animations) {
  actions.set(clip.name, mixer.clipAction(clip));
}

// 2. Wire the state machine to the mixer.
const threeAnimation = new ThreeAnimationController({
  stateController: createCharacterAnimationStateController(controller),
  actions,
});

// 3. Let one-shot clips (jump start/land) report completion.
mixer.addEventListener("finished", (event) => {
  threeAnimation.notifyFinished(event.action);
});

// 4. Each frame, after controller.step(dt) + world.step(dt):
function frame(frameDelta: number) {
  threeAnimation.update();     // resolve state + crossfade actions
  mixer.update(frameDelta);    // advance the mixer (you own this)
}
```

:::caution[Wire up `notifyFinished`]
Jump start and land are **one-shot** clips: while one plays, the controller won't
start the next action. It only knows a one-shot finished when you tell it, via
the mixer's `finished` event. Forget step 3 and the character can get stuck in a
jump pose.
:::

## Clip names and remapping

By default the controller looks up these clip names for each state
(`DEFAULT_THREE_ANIMATION_ACTIONS`):

| State | Clip name |
| --- | --- |
| `IDLE` | `Idle_Loop` |
| `WALK` | `Walk_Loop` |
| `RUN` | `Jog_Fwd_Loop` |
| `JUMP_START` | `Jump_Start` |
| `JUMP_IDLE` | `Jump_Loop` |
| `JUMP_FALL` | `Jump_Loop` |
| `JUMP_LAND` | `Jump_Land` |

If your rig uses different names, pass an `actionMap` (merged over the defaults —
you only override what differs):

```ts
const threeAnimation = new ThreeAnimationController({
  stateController,
  actions,
  actionMap: {
    IDLE: "idle",
    WALK: "walk",
    RUN: "run",
    JUMP_START: "jump_up",
    JUMP_IDLE: "jump_air",
    JUMP_FALL: "jump_air",
    JUMP_LAND: "jump_down",
  },
});
```

`actions` may be a `Map<string, AnimationAction>` or a plain
`Record<string, AnimationAction>`.

## Options

| Option | Description |
| --- | --- |
| `stateController` | The locomotion state machine (anything with `state` / `update()` / `reset()`). |
| `actions` | Lookup of clip name → `AnimationAction`. |
| `actionMap` | Per-state clip-name overrides, merged over the defaults. |
| `getTimeScale` | `() => number` used to scale crossfade durations — pass your slow-motion factor here so blends stay proportional. |
| `autoplayInitialAction` | Play the initial state's action immediately on construction. Defaults to `false`. |

## Inspecting playback

| Member | Description |
| --- | --- |
| `update()` | Advances the state machine and plays the resolved action. Returns the current state. |
| `notifyFinished(actionOrClipName)` | Tell the controller a one-shot finished (call from the mixer `finished` event). |
| `reset(state?)` | Reset the state machine and playback bookkeeping. |
| `active` | The currently playing `AnimationAction` (or `null`). |
| `activeActionName` | The active clip's name (or `null`). |
| `previousClipName` | The clip name that was playing before the current one. |
| `canTransition` | `false` while a one-shot is locking transitions. |

## Slow motion

Crossfade durations are multiplied by `getTimeScale()`, so if you globally slow
the game you should feed the same factor in. Advance the mixer with the matching
scaled delta so animation speed tracks physics:

```ts
const threeAnimation = new ThreeAnimationController({
  stateController,
  actions,
  getTimeScale: () => slowMotionFactor,
});

// ...
mixer.timeScale = slowMotionFactor;
mixer.update(frameDelta);
```
