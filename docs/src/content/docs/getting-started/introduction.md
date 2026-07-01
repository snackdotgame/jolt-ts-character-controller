---
title: Introduction
description: What jolt-ts-character-controller is, the problems it solves, and the design principles behind its imperative, rendering-free API.
---

`jolt-ts-character-controller` provides imperative, **Ecctrl-style** character,
vehicle, and drone controllers built on top of the
[`jolt-ts`](https://github.com/snackdotgame/jolt-ts) wrapper around the Jolt
Physics engine.

It is a faithful port of the movement feel from
[Ecctrl](https://github.com/pmndrs/ecctrl) — the floating-capsule character
controller for React Three Fiber — but with one crucial difference: **the
runtime surface is rendering-free.** There is no React, no DOM, no canvas, and
no `three` scene graph baked into the controllers. You own the Jolt world, the
render loop, the camera, networking, and your asset scene. The controllers only
read and write a physics body.

:::note[Based on Ecctrl]
This library is an imperative port of
[Ecctrl](https://github.com/pmndrs/ecctrl) by Erdong Chen and contributors. See
[Acknowledgements](/jolt-ts-character-controller/acknowledgements/).
:::

## The mental model

Every controller wraps a single Jolt rigid body and exposes two methods you call
each simulation tick:

```ts
controller.step(deltaTime); // read the body, apply impulses for this tick
world.step(deltaTime);      // let Jolt integrate everything
```

`step(dt)` applies floating, friction, movement, turning, jump, and
platform-coupling impulses to the body **without allocating**. It never advances
the physics world itself — you do that with `world.step(dt)`, exactly when and
how you want. This separation is what makes the library equally at home in a
browser render loop and a headless authoritative server.

If you want a plain-data view of the controller after a tick, call
`update(dt)` instead — it runs the same `step(dt)` and then returns a freshly
allocated [snapshot](/jolt-ts-character-controller/character-controller/reading-state/).

## What's in the box

- **`CharacterController`** — a floating dynamic capsule with camera-relative or
  custom-forward movement, walk/run speeds, edge-triggered jumping, slope
  handling, auto-balance, moving-platform coupling, and optional custom gravity
  for wall- and planet-walking.
- **`Vehicle`** — one class that drives both **cars** (shape-cast
  wheels with suspension, tire-slip friction, and an automatic gearbox) and
  **drones** (thrust-and-torque propellers with velocity or position control).
- **Animation** — `AnimationStateController`, a small locomotion state
  machine, plus `ThreeAnimationController` to drive a Three.js
  `AnimationMixer`. Both are optional and independent of physics and rendering.
- **Curves** — a lightweight Hermite curve baker (`bakeCurveLUT` /
  `evaluateCurveLUT`) used for tunable response curves (engine torque, tire slip,
  platform mass coupling).
- **Networking helpers** — `getSyncState()` / `applySyncState()` capture and
  restore the exact deterministic state of a controller for rollback and
  reconciliation.

## What it is *not*

:::note[Deliberate non-goals]
- It does **not** create or step your physics world. You call
  `World.create(...)` and `world.step(dt)`.
- It does **not** render anything. It never touches Three.js objects, the DOM,
  or a canvas at runtime. You copy `body.translation()` / `body.rotation()` onto
  whatever meshes you like.
- It does **not** read the keyboard, gamepad, or pointer. You gather input and
  hand it to `setMovement(...)`.
- It does **not** own a camera. You compute a forward direction and pass it to
  `setForwardDirection(...)`.
:::

This is a feature, not a limitation: because the controllers are pure
simulation, you can run them deterministically on a server, drive them from
recorded inputs in a test, or wire them into any renderer.

## How the pieces relate

```
       your input            your camera
           │                     │
           ▼                     ▼
   setMovement(...)     setForwardDirection(...)
           │                     │
           └────────┬────────────┘
                    ▼
            controller.step(dt) ──► applies impulses to a Jolt Body
                    │
                    ▼
             world.step(dt)     ──► Jolt integrates the world
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
  body.translation()     controller.snapshot() / getters
  body.rotation()        (isOnGround, moveSpeed, …)
        │                       │
        ▼                       ▼
   your render mesh      animation state machine
```

## Prerequisites

You should be comfortable with:

- **TypeScript / ESM** — the package ships ESM with type declarations.
- **`jolt-ts`** — you create the `World`, ground bodies, and call `world.step`.
  See the [`jolt-ts` repository](https://github.com/snackdotgame/jolt-ts) and
  its [docs site](https://snackdotgame.github.io/jolt-ts/).
- **A renderer** — the examples use [Three.js](https://threejs.org/), but only
  for drawing. Nothing in the runtime API depends on it.

Ready? Head to [Installation](/jolt-ts-character-controller/getting-started/installation/).
