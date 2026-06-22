import { afterEach, describe, expect, it } from "vitest";
import { Shape, type World } from "jolt-ts";
import { EcctrlJoltVehicle } from "../src/index.js";

const DT = 1 / 60;

const worlds: World[] = [];

afterEach(() => {
  for (const world of worlds.splice(0)) world.dispose();
});

describe("EcctrlJoltVehicle", () => {
  it("ports Ecctrl car wheel impulses into a Jolt body", async () => {
    const { world, vehicle } = await createFlatCar();

    for (let i = 0; i < 90; i += 1) step(world, vehicle);
    vehicle.setMovement({ forward: true });
    for (let i = 0; i < 180; i += 1) step(world, vehicle);

    const position = vehicle.body.translation();
    const velocity = vehicle.body.linearVelocity();
    expect(position.z).toBeGreaterThan(1);
    expect(velocity.z).toBeGreaterThan(0.25);
    expect(vehicle.engineRPM).toBeGreaterThan(0);
    expect(vehicle.wheels.some((wheel) => wheel.snapshot().hitBody !== null)).toBe(true);
    expect(vehicle.wheels.some((wheel) => wheel.snapshot().suspensionToi > 0)).toBe(true);
  });

  it("ports Ecctrl propeller mixing and hovers without DOM or rendering", async () => {
    const { world, vehicle } = await createHoverDrone();
    const start = vehicle.body.translation();

    for (let i = 0; i < 180; i += 1) step(world, vehicle);

    const position = vehicle.body.translation();
    const velocity = vehicle.body.linearVelocity();
    expect(position.y).toBeGreaterThan(start.y - 0.65);
    expect(Math.abs(velocity.y)).toBeLessThan(2.5);
    expect(vehicle.propellers.every((propeller) => propeller.finalThrottle > 0)).toBe(true);
  });

  it("uses normal world gravity when custom gravity is disabled", async () => {
    const { World } = await import("jolt-ts");
    const world = await World.create({
      gravity: [0, -9.81, 0],
      deterministic: "cross-platform"
    });
    worlds.push(world);
    const vehicle = new EcctrlJoltVehicle({
      world,
      shape: Shape.box({ halfExtents: [1, 0.4, 2.4] }),
      position: [0, 3, 0],
      density: 200,
      allowSleeping: false,
      enableCustomGravity: false,
      gravityField: () => {
        throw new Error("custom gravity should not be called");
      }
    });

    vehicle.update(DT);
    const snapshot = vehicle.snapshot();
    world.step(DT);

    expect(snapshot.gravityMag).toBeCloseTo(9.81);
    expect(snapshot.gravityDir.y).toBeLessThan(-0.99);
    expect(snapshot.upAxis.y).toBeGreaterThan(0.99);
    expect(vehicle.body.linearVelocity().y).toBeLessThan(0);
  });

  it("drives the drone in velocity mode from movement input", async () => {
    const { world, vehicle } = await createHoverDrone();
    const start = vehicle.body.translation();

    vehicle.setMovement({ throttleUp: true });
    for (let i = 0; i < 120; i += 1) step(world, vehicle);

    const position = vehicle.body.translation();
    const velocity = vehicle.body.linearVelocity();
    expect(position.y).toBeGreaterThan(start.y + 0.75);
    expect(velocity.y).toBeGreaterThan(0.1);
    expect(vehicle.propellers.every((propeller) => propeller.finalThrottle > 0)).toBe(true);
  });

  it("wakes a sleeping position-mode drone before applying hover thrust", async () => {
    const { world, vehicle } = await createHoverDrone({ allowSleeping: true, controlMode: "POSITION" });
    vehicle.setTarget({ x: 0, y: 5, z: 0 }, { x: 0, y: 0, z: 1 });
    vehicle.body.sleep();
    expect(vehicle.body.isActive()).toBe(false);

    for (let i = 0; i < 120; i += 1) step(world, vehicle);

    const position = vehicle.body.translation();
    expect(vehicle.body.isActive()).toBe(true);
    expect(position.y).toBeGreaterThan(3.25);
    expect(vehicle.propellers.every((propeller) => propeller.finalThrottle > 0)).toBe(true);
  });
});

async function createFlatCar(): Promise<{ world: World; vehicle: EcctrlJoltVehicle }> {
  const { World } = await import("jolt-ts");
  const world = await World.create({
    gravity: [0, -9.81, 0],
    deterministic: "cross-platform"
  });
  worlds.push(world);
  world.createBody({
    type: "static",
    shape: Shape.box({ halfExtents: [40, 0.5, 40] }),
    position: [0, -0.5, 0],
    friction: 0.9
  });

  const vehicle = new EcctrlJoltVehicle({
    world,
    shape: Shape.box({ halfExtents: [1, 0.4, 2.4] }),
    position: [0, 1.05, 0],
    density: 200,
    allowSleeping: false,
    carConfig: {
      engineHorsepower: 600,
      engineMaxRPM: 6000,
      reverseRPMScale: 0.5,
      steerRate: Math.PI * 2,
      maxSteerAngle: Math.PI / 6
    }
  });
  for (const x of [0.9, -0.9]) {
    vehicle.addWheel({
      position: [x, 0, 1.8],
      steerWheel: true,
      brakeWheel: true,
      driveWheel: true,
      springK: 38000,
      dampingC: 4000,
      maxBrakeTorque: 3000,
      tireGripFactor: 1.3,
      wheelModelDensity: 100
    });
    vehicle.addWheel({
      position: [x, 0, -1.8],
      brakeWheel: true,
      driveWheel: true,
      springK: 38000,
      dampingC: 4000,
      maxBrakeTorque: 3000,
      tireGripFactor: 1.3,
      wheelModelDensity: 100
    });
  }

  return { world, vehicle };
}

async function createHoverDrone(options: { allowSleeping?: boolean; controlMode?: "VELOCITY" | "POSITION" } = {}): Promise<{ world: World; vehicle: EcctrlJoltVehicle }> {
  const { World } = await import("jolt-ts");
  const world = await World.create({
    gravity: [0, 0, 0],
    deterministic: "cross-platform"
  });
  worlds.push(world);
  const vehicle = new EcctrlJoltVehicle({
    world,
    shape: Shape.compound([
      { shape: Shape.box({ halfExtents: [0.4, 0.2, 1.5] }) },
      { shape: Shape.cylinder({ halfHeight: 0.05, radius: 0.65 }), position: [1, -0.15, 1] },
      { shape: Shape.cylinder({ halfHeight: 0.05, radius: 0.65 }), position: [1, -0.15, -1] },
      { shape: Shape.cylinder({ halfHeight: 0.05, radius: 0.65 }), position: [-1, -0.15, 1] },
      { shape: Shape.cylinder({ halfHeight: 0.05, radius: 0.65 }), position: [-1, -0.15, -1] }
    ]),
    position: [0, 3, 0],
    density: 200,
    allowSleeping: options.allowSleeping ?? false,
    enableCustomGravity: true,
    gravityField: () => ({ x: 0, y: -9.81, z: 0 }),
    droneConfig: {
      controlMode: options.controlMode ?? "VELOCITY",
      maxHorizSpeed: 20,
      maxVertSpeed: 8,
      maxTiltAngle: Math.PI / 4
    }
  });
  vehicle.addPropeller({ position: [1, -0.15, 1], maxThrust: 5000, torqueRatio: 0.6, invertTorque: true });
  vehicle.addPropeller({ position: [-1, -0.15, 1], maxThrust: 5000, torqueRatio: 0.6 });
  vehicle.addPropeller({ position: [1, -0.15, -1], maxThrust: 5000, torqueRatio: 0.6 });
  vehicle.addPropeller({ position: [-1, -0.15, -1], maxThrust: 5000, torqueRatio: 0.6, invertTorque: true });
  return { world, vehicle };
}

function step(world: World, vehicle: EcctrlJoltVehicle): void {
  vehicle.update(DT);
  world.step(DT);
}
