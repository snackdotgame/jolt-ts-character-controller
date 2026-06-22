import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { Shape, type World } from "jolt-ts";
import { EcctrlJoltController } from "../src/index.js";

const DT = 1 / 60;
const WARMUP_STEPS = 240;
const MEASURE_STEPS = 1_000;
const MEASURE_REPEATS = 3;
const SNAPSHOT_READS = 50_000;

interface ControllerPerfResult {
  readonly label: string;
  readonly steps: number;
  readonly totalMs: number;
  readonly msPerStep: number;
  readonly stepsPerSecond: number;
  readonly realtimeHeadroom: number;
  readonly finalX: number;
  readonly finalY: number;
  readonly finalZ: number;
}

interface SnapshotPerfResult {
  readonly label: string;
  readonly reads: number;
  readonly totalMs: number;
  readonly msPerRead: number;
  readonly readsPerSecond: number;
  readonly checksum: number;
}

describe("EcctrlJoltController performance", () => {
  it("measures imperative step cost and snapshot overhead", async () => {
    await runControllerScenario("jit-warmup-step", false, 500);
    await runControllerScenario("jit-warmup-update", true, 500);

    const stepResult = await runBestControllerScenario("jolt-step-no-snapshot", false);
    const updateResult = await runBestControllerScenario("jolt-update-with-snapshot", true);
    const snapshotResult = await runSnapshotScenario();

    const comparison = {
      stepMs: round(stepResult.msPerStep, 4),
      updateMs: round(updateResult.msPerStep, 4),
      updateSnapshotOverheadPct: round(((updateResult.msPerStep / stepResult.msPerStep) - 1) * 100, 2),
      stepHeadroomAt60Hz: round(stepResult.realtimeHeadroom, 1),
      snapshotMs: round(snapshotResult.msPerRead, 6),
      snapshotReadsPerSecond: Math.round(snapshotResult.readsPerSecond)
    };

    console.info(JSON.stringify({ stepResult, updateResult, snapshotResult, comparison }, null, 2));

    expect(stepResult.msPerStep).toBeLessThan(1000 / 60);
    expect(updateResult.msPerStep).toBeLessThan(1000 / 60);
    expect(snapshotResult.checksum).not.toBe(0);
  }, 30_000);
});

async function runBestControllerScenario(label: string, includeSnapshot: boolean): Promise<ControllerPerfResult> {
  let best: ControllerPerfResult | null = null;
  for (let repeat = 0; repeat < MEASURE_REPEATS; repeat += 1) {
    const result = await runControllerScenario(label, includeSnapshot, MEASURE_STEPS);
    if (!best || result.msPerStep < best.msPerStep) best = result;
  }
  return best!;
}

async function runControllerScenario(
  label: string,
  includeSnapshot: boolean,
  measureSteps: number
): Promise<ControllerPerfResult> {
  const { world, controller } = await createPerfController();
  try {
    for (let i = 0; i < WARMUP_STEPS; i += 1) {
      driveController(controller, i);
      controller.step(DT);
      world.step(DT);
    }

    const start = performance.now();
    for (let i = 0; i < measureSteps; i += 1) {
      driveController(controller, i);
      if (includeSnapshot) {
        controller.update(DT);
      } else {
        controller.step(DT);
      }
      world.step(DT);
    }
    const totalMs = performance.now() - start;
    const position = controller.body.translation();
    const msPerStep = totalMs / measureSteps;

    return {
      label,
      steps: measureSteps,
      totalMs: round(totalMs, 3),
      msPerStep,
      stepsPerSecond: 1000 / msPerStep,
      realtimeHeadroom: (1000 / 60) / msPerStep,
      finalX: round(position.x, 4),
      finalY: round(position.y, 4),
      finalZ: round(position.z, 4)
    };
  } finally {
    world.dispose();
  }
}

async function runSnapshotScenario(): Promise<SnapshotPerfResult> {
  const { world, controller } = await createPerfController();
  try {
    for (let i = 0; i < WARMUP_STEPS; i += 1) {
      driveController(controller, i);
      controller.step(DT);
      world.step(DT);
    }

    let checksum = 0;
    const start = performance.now();
    for (let i = 0; i < SNAPSHOT_READS; i += 1) {
      const snapshot = controller.snapshot();
      checksum += snapshot.position.x + snapshot.position.y + snapshot.position.z + snapshot.moveSpeed;
    }
    const totalMs = performance.now() - start;
    const msPerRead = totalMs / SNAPSHOT_READS;

    return {
      label: "snapshot-allocation",
      reads: SNAPSHOT_READS,
      totalMs: round(totalMs, 3),
      msPerRead,
      readsPerSecond: 1000 / msPerRead,
      checksum: round(checksum, 4)
    };
  } finally {
    world.dispose();
  }
}

async function createPerfController(): Promise<{ world: World; controller: EcctrlJoltController }> {
  const { World } = await import("jolt-ts");
  const world = await World.create({
    gravity: [0, -9.81, 0],
    deterministic: "cross-platform"
  });

  world.createBody({
    type: "static",
    shape: Shape.box({ halfExtents: [30, 0.5, 30] }),
    position: [0, -0.5, 0],
    layer: "static",
    friction: 0.8
  });

  for (let index = 0; index < 8; index += 1) {
    world.createBody({
      type: "static",
      shape: Shape.box({ halfExtents: [1.5, 0.25, 1.5] }),
      position: [Math.sin(index) * 9, index % 2 === 0 ? 0.25 : 0.75, -10 + index * 2.8],
      rotation: [0, Math.sin(index * 0.2), 0, Math.cos(index * 0.2)],
      layer: "static",
      friction: 0.65
    });
  }

  const controller = new EcctrlJoltController({
    world,
    position: [0, 1, -12],
    enableToggleRun: false,
    autoBalance: true
  });
  controller.setForwardDirection({ x: 0, y: 0, z: 1 }, { x: 0, y: 1, z: 0 });

  return { world, controller };
}

function driveController(controller: EcctrlJoltController, step: number): void {
  const phase = step % 720;
  controller.setMovement({
    forward: phase < 420,
    backward: phase >= 420 && phase < 540,
    leftward: phase >= 180 && phase < 300,
    rightward: phase >= 540,
    run: phase < 360,
    jump: phase % 240 < 8
  });
}

function round(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
