---
title: Acknowledgements
description: Credits and license attribution. jolt-ts-character-controller is an imperative TypeScript port of Ecctrl by Erdong Chen and contributors.
---

## Ecctrl

`jolt-ts-character-controller` is an **imperative TypeScript port of
[Ecctrl](https://github.com/pmndrs/ecctrl)**, the floating-capsule character and
vehicle controller for React Three Fiber, created by **Erdong Chen** and the
Ecctrl contributors.

The behavior ported from Ecctrl includes the floating capsule with its
spring–damper hover, ground friction, edge-triggered jumping, slope handling,
auto-balance, moving-platform coupling, and custom gravity, as well as the car
and drone control logic. This project mechanically ports that behavior and:

- removes the React, React Three Fiber, and react-three-rapier runtime
  dependencies,
- targets the [`jolt-ts`](https://github.com/snackdotgame/jolt-ts) wrapper around
  Jolt Physics instead of Rapier, and
- exposes an imperative, rendering-free API.

If you find this library useful, please consider starring and supporting the
upstream project:

- **Repository:** [github.com/pmndrs/ecctrl](https://github.com/pmndrs/ecctrl)
- **Author:** Erdong Chen and the Ecctrl contributors

:::note[License & attribution]
Ecctrl is released under the MIT License, and this project is MIT licensed too.
The full attribution is recorded in the repository's
[`NOTICE`](https://github.com/snackdotgame/jolt-ts-character-controller/blob/main/NOTICE)
file, and source that ports Ecctrl logic (such as the vehicle controller) carries
an SPDX attribution header. Ecctrl's original MIT terms are preserved.
:::

## Built on

This library stands on top of several excellent open-source projects:

- **[Jolt Physics](https://github.com/jrouwe/JoltPhysics)** — the underlying
  physics engine, by Jorrit Rouwe.
- **[jolt-ts](https://github.com/snackdotgame/jolt-ts)** — the TypeScript wrapper
  around Jolt that this library builds on
  ([docs](https://snackdotgame.github.io/jolt-ts/), [npm](https://www.npmjs.com/package/jolt-ts)).
- **[Three.js](https://threejs.org/)** — used for its math types, and for
  rendering in the examples.

## This documentation

Built with [Astro](https://astro.build) and
[Starlight](https://starlight.astro.build).
