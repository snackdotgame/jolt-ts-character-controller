import { afterEach, describe, expect, it } from "vitest";
import { Shape, type Body, type MotionQuality, type World } from "jolt-ts";
import { CharacterController, createCharacterAnimationStateController } from "../src/index.js";

const DT = 1 / 60;

const worlds: World[] = [];

afterEach(() => {
  for (const world of worlds.splice(0)) world.dispose();
});

describe("CharacterController", () => {
  it("settles a floating capsule at the Ecctrl hover distance", async () => {
    const { world, controller } = await createFlatController();

    for (let i = 0; i < 180; i += 1) step(world, controller);

    const position = controller.body.translation();
    const velocity = controller.body.linearVelocity();
    expect(controller.body.allowSleeping()).toBe(true);
    expect(controller.isOnGround).toBe(true);
    expect(controller.snapshot().groundHitDistance).toBeGreaterThan(0);
    expect(controller.snapshot().groundFloatingDistance).toBeGreaterThan(0);
    expect(position.y).toBeGreaterThan(0.7);
    expect(position.y).toBeLessThan(0.9);
    expect(Math.abs(velocity.y)).toBeLessThan(0.35);
  });

  it("accelerates in the caller-provided forward direction", async () => {
    const { world, controller } = await createFlatController();

    for (let i = 0; i < 120; i += 1) step(world, controller);

    controller.setForwardDirection({ x: 0, y: 0, z: 1 });
    controller.setMovement({ forward: true });

    for (let i = 0; i < 120; i += 1) step(world, controller);

    const position = controller.body.translation();
    const velocity = controller.body.linearVelocity();
    expect(position.z).toBeGreaterThan(1.5);
    expect(velocity.z).toBeGreaterThan(0.5);
    expect(controller.snapshot().moveSpeed).toBeGreaterThan(0.5);
  });

  it("drives the upstream RUN animation state from real controller input", async () => {
    const { world, controller } = await createFlatController();
    const animationState = createCharacterAnimationStateController(controller);

    for (let i = 0; i < 120; i += 1) step(world, controller);
    expect(animationState.update()).toBe("IDLE");

    controller.setForwardDirection({ x: 0, y: 0, z: 1 });
    controller.setMovement({ forward: true, run: true });
    step(world, controller);

    expect(controller.runActive).toBe(true);
    expect(controller.isMoving).toBe(true);
    expect(animationState.update()).toBe("RUN");
  });

  it("uses Ecctrl's camera-forward projection when custom forward is disabled", async () => {
    const world = await createFlatWorld();
    const controller = new CharacterController({
      world,
      position: [0, 2, 0],
      rotation: [Math.SQRT1_2, 0, 0, Math.SQRT1_2],
      useCharacterUpAxis: true,
      useCustomForward: false,
      autoBalance: false
    });
    controller.setForwardDirection({ x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 });
    controller.setMovement({ forward: true });

    controller.update(DT);

    const inputDirection = controller.snapshot().inputDirection;
    expect(inputDirection.y).toBeGreaterThan(0.99);
    expect(Math.abs(inputDirection.z)).toBeLessThan(0.001);
  });

  it("uses normal world gravity when custom gravity is disabled", async () => {
    const { World } = await import("jolt-ts");
    const world = await World.create({
      gravity: [0, -9.81, 0],
      deterministic: "cross-platform"
    });
    worlds.push(world);
    const controller = new CharacterController({
      world,
      position: [0, 3, 0],
      enableCustomGravity: false,
      gravityField: () => {
        throw new Error("custom gravity should not be called");
      },
      autoBalance: false,
      allowSleeping: false
    });

    controller.update(DT);
    const gravitySnapshot = controller.snapshot();
    world.step(DT);

    expect(gravitySnapshot.gravityMag).toBeCloseTo(9.81);
    expect(gravitySnapshot.gravityDir.y).toBeLessThan(-0.99);
    expect(gravitySnapshot.upAxis.y).toBeGreaterThan(0.99);
    expect(controller.body.linearVelocity().y).toBeLessThan(0);
  });

  it("applies Ecctrl-style jump velocity from grounded state", async () => {
    const { world, controller } = await createFlatController();

    for (let i = 0; i < 120; i += 1) step(world, controller);

    controller.setMovement({ jump: true });
    step(world, controller);

    const velocity = controller.body.linearVelocity();
    expect(velocity.y).toBeGreaterThan(4);

    for (let i = 0; i < 12; i += 1) step(world, controller);
    expect(controller.isOnGround).toBe(false);
    expect(controller.body.linearVelocity().y).toBeGreaterThan(0);
  });

  it("can jump while standing on a kinematic platform", async () => {
    const { world, controller, platform } = await createKinematicPlatformController();

    for (let i = 0; i < 120; i += 1) {
      platform.moveKinematic([0, 0, Math.sin(i / 30) * 0.25], [0, 0, 0, 1], DT);
      step(world, controller);
    }

    const grounded = controller.snapshot();
    expect(grounded.isOnGround).toBe(true);
    expect(grounded.isOnPlatform).toBe(true);

    controller.setMovement({ jump: true });
    platform.moveKinematic([0, 0, 0], [0, 0, 0, 1], DT);
    step(world, controller);

    const jumped = controller.snapshot();
    expect(jumped.jumpActive).toBe(true);
    expect(controller.body.linearVelocity().y).toBeGreaterThan(4);

    for (let i = 0; i < 12; i += 1) {
      platform.moveKinematic([0, 0, 0], [0, 0, 0, 1], DT);
      step(world, controller);
    }
    expect(controller.snapshot().isOnGround).toBe(false);
  });

  it("can jump while standing on a kinematic platform with Jolt linear-cast CCD", async () => {
    const { world, controller, platform } = await createKinematicPlatformController({
      motionQuality: "linearCast"
    });

    for (let i = 0; i < 120; i += 1) {
      platform.moveKinematic([0, 0, Math.sin(i / 30) * 0.25], [0, 0, 0, 1], DT);
      step(world, controller);
    }

    expect(controller.snapshot().isOnPlatform).toBe(true);

    controller.setMovement({ jump: true });
    platform.moveKinematic([0, 0, 0], [0, 0, 0, 1], DT);
    step(world, controller);

    expect(controller.snapshot().jumpActive).toBe(true);
    expect(controller.body.linearVelocity().y).toBeGreaterThan(4);
  });

  it("can land on an elevated kinematic platform and jump again", async () => {
    const { world, controller, platform } = await createKinematicPlatformController({
      controllerPosition: [0, 5, 0],
      platformPosition: [0, 2, 0],
      motionQuality: "linearCast"
    });

    let landed = false;
    for (let i = 0; i < 240; i += 1) {
      platform.moveKinematic([0, 2, Math.sin(i / 30) * 0.25], [0, 0, 0, 1], DT);
      step(world, controller);
      const snapshot = controller.snapshot();
      if (snapshot.isOnGround && snapshot.standBody === platform) {
        landed = true;
        break;
      }
    }

    expect(landed).toBe(true);
    expect(controller.snapshot().isOnPlatform).toBe(true);

    controller.setMovement({ jump: false });
    step(world, controller);
    controller.setMovement({ jump: true });
    step(world, controller);

    expect(controller.snapshot().jumpActive).toBe(true);
    expect(controller.body.linearVelocity().y).toBeGreaterThan(4);
  });

  it("scans past steep center-ray hits to find walkable ground", async () => {
    const { world, controller, floor } = await createSteepFirstHitController();

    controller.update(DT);

    const snapshot = controller.snapshot();
    expect(snapshot.isOnGround).toBe(true);
    expect(snapshot.standBody).toBe(floor);
    expect(snapshot.actualSlopeAngle).toBeLessThan(Math.PI / 4);
  });

  it("exposes upstream-style handle aliases", async () => {
    const { world, controller } = await createFlatController();

    for (let i = 0; i < 120; i += 1) step(world, controller);

    expect(controller.standCollider).toBe(controller.standBody);
    expect(controller.snapshot().standCollider).toBe(controller.snapshot().standBody);
    expect(controller.lockForward).toBe(false);

    controller.setLockForward(true);
    expect(controller.lockForward).toBe(true);
    expect(controller.snapshot().lockForward).toBe(true);
  });

  it("does not require React or DOM globals", async () => {
    const module = await import("../src/index.js");
    expect(module.CharacterController).toBeTypeOf("function");
    expect(globalThis.document).toBeUndefined();
  });

  it("forwards the allowSleeping runtime option to the Jolt body", async () => {
    const world = await createFlatWorld();
    const controller = new CharacterController({
      world,
      position: [0, 1, 0],
      allowSleeping: false
    });

    expect(controller.body.allowSleeping()).toBe(false);
    controller.body.setAllowSleeping(true);
    expect(controller.body.allowSleeping()).toBe(true);
  });
});

async function createFlatController(): Promise<{ world: World; controller: CharacterController }> {
  const world = await createFlatWorld();
  const controller = new CharacterController({
    world,
    position: [0, 1, 0],
    enableToggleRun: false,
    autoBalance: false
  });
  return { world, controller };
}

async function createFlatWorld(): Promise<World> {
  const { World } = await import("jolt-ts");
  const world = await World.create({
    gravity: [0, -9.81, 0],
    deterministic: "cross-platform"
  });
  worlds.push(world);
  world.createBody({
    type: "static",
    shape: Shape.box({ halfExtents: [20, 0.5, 20] }),
    position: [0, -0.5, 0],
    layer: "static",
    friction: 0.8
  });
  return world;
}

async function createKinematicPlatformController(options: {
  readonly controllerPosition?: [number, number, number];
  readonly platformPosition?: [number, number, number];
  readonly motionQuality?: MotionQuality;
} = {}): Promise<{ world: World; controller: CharacterController; platform: Body }> {
  const { World } = await import("jolt-ts");
  const world = await World.create({
    gravity: [0, -9.81, 0],
    deterministic: "cross-platform"
  });
  worlds.push(world);
  const platform = world.createBody({
    type: "kinematic",
    shape: Shape.box({ halfExtents: [4, 0.2, 4] }),
    position: options.platformPosition ?? [0, 0, 0],
    layer: "moving",
    friction: 0.8
  });
  const controller = new CharacterController({
    world,
    position: options.controllerPosition ?? [0, 1.2, 0],
    motionQuality: options.motionQuality,
    enableToggleRun: false,
    autoBalance: false
  });
  return { world, controller, platform };
}

async function createSteepFirstHitController(): Promise<{ world: World; controller: CharacterController; floor: Body }> {
  const { World } = await import("jolt-ts");
  const world = await World.create({
    gravity: [0, -9.81, 0],
    deterministic: "cross-platform"
  });
  worlds.push(world);
  const floor = world.createBody({
    type: "static",
    shape: Shape.box({ halfExtents: [20, 0.5, 20] }),
    position: [0, -0.5, 0],
    layer: "static",
    friction: 0.8
  });
  const slopeAngle = Math.PI / 3;
  world.createBody({
    type: "static",
    shape: Shape.box({ halfExtents: [4, 0.03, 4] }),
    position: [0, 0.55, 0],
    rotation: [Math.sin(slopeAngle / 2), 0, 0, Math.cos(slopeAngle / 2)],
    layer: "static",
    friction: 0.8
  });
  const controller = new CharacterController({
    world,
    position: [0, 1, 0],
    enableToggleRun: false,
    autoBalance: false,
    groundDetection: "rayCast",
    slopeMaxAngle: Math.PI / 4,
    rayLength: 2
  });
  return { world, controller, floor };
}

function step(world: World, controller: CharacterController): void {
  controller.update(DT);
  world.step(DT);
}
