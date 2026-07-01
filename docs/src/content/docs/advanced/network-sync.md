---
title: Network Sync
description: Deterministic stepping plus getSyncState / applySyncState for server authority, client prediction, and rollback reconciliation.
---

Because the controller separates "simulate the controller" (`step`) from
"integrate the world" (`world.step`) and allocates nothing on that path, it's
well suited to authoritative servers and rollback netcode. Two methods capture
and restore the exact deterministic state of a controller.

## Determinism first

Reproducible results require three things:

1. A **deterministic world** — create it with
   `deterministic: "cross-platform"` so Jolt produces identical results across
   machines.
2. A **fixed timestep** — always step with the same `dt` (see
   [Overview](/jolt-ts-character-controller/character-controller/overview/#fixed-timestep)).
3. **Identical inputs** — the same `setForwardDirection` / `setMovement` values
   in the same order.

```ts
const world = await World.create({
  gravity: [0, -9.81, 0],
  deterministic: "cross-platform",
});
```

Given those, the same inputs from the same start state yield bit-identical
motion on every peer.

## The sync state

`getSyncState()` returns the minimal state needed to reproduce a controller
exactly: the body's pose and velocity plus the few internal latches that carry
between ticks (ground/jump state and the smoothed gravity direction). Everything
else in a [snapshot](/jolt-ts-character-controller/character-controller/reading-state/) is re-derived each
step, so it doesn't need to travel.

```ts
interface SyncState {
  position: [number, number, number];
  linearVelocity: [number, number, number];
  rotation: [number, number, number, number];
  angularVelocity: [number, number, number];
  gravityDir: [number, number, number];
  onGround: boolean;
  canJump: boolean;
  jumpActive: boolean;  // a jump impulse is mid-application
  jumpElapsed: number;  // seconds the active jump has been applied
}
```

It's plain numbers and booleans — trivially serialized to JSON or packed into a
compact binary codec for the wire.

```ts
const state = controller.getSyncState();
socket.send(JSON.stringify(state));
```

## Restoring state

`applySyncState(state)` teleports the body, restores the internal latches, and
refreshes the controller's cached vectors so an immediate read is consistent.
This is the primitive behind reconciliation and rollback.

```ts
controller.applySyncState(receivedState);
```

## Authoritative server

A server needs no renderer — run the controller headless with `step` (which
allocates nothing) and broadcast sync state:

```ts
function serverTick(commands: PlayerCommand[]) {
  for (const cmd of commands) {
    controller.setForwardDirection(cmd.forward);
    controller.setMovement(cmd.input);
    controller.step(FIXED_DT);
    world.step(FIXED_DT);
  }
  broadcast({ tick: currentTick, state: controller.getSyncState() });
}
```

## Client prediction & reconciliation

The classic pattern: the client predicts locally, then when an authoritative
state arrives for an earlier tick, it snaps back and **re-simulates** the inputs
it has issued since.

```ts
const inputBuffer: { tick: number; input: MovementInput; forward: Vector3Like }[] = [];

function onServerState(serverTick: number, state: SyncState) {
  // 1. Rewind to the authoritative state.
  controller.applySyncState(state);

  // 2. Replay every input newer than the server's tick.
  for (const cmd of inputBuffer.filter((c) => c.tick > serverTick)) {
    controller.setForwardDirection(cmd.forward);
    controller.setMovement(cmd.input);
    controller.step(FIXED_DT);
    world.step(FIXED_DT);
  }

  // 3. Drop acknowledged inputs.
  prune(inputBuffer, serverTick);
}
```

:::caution[The world has other bodies]
`getSyncState` / `applySyncState` capture the **controller's own body and
latches** — not the rest of the world. For full determinism during rollback you
must also restore any other dynamic bodies the character interacts with (moving
platforms, pushable crates) to their state at the rewind tick, using the
`jolt-ts` world's own save/restore facilities. The controller helpers solve the
character half of the problem.
:::

:::tip[Vehicles]
Vehicles don't ship a `getSyncState` helper, but the same principles apply: with
a deterministic world, a fixed timestep, and identical inputs, an
`Vehicle` reproduces exactly. Capture and restore its body's pose and
velocity through the `jolt-ts` body API to rewind it.
:::
