// A shape-cast wheeled Vehicle driving a steady left-hand circle. Four wheels
// (front pair steers) with suspension and tire friction; the wheel meshes are
// children of the chassis, so they inherit the body pose and only need their
// local steer + spin updated each frame from the wheel snapshots.
import { Shape } from "jolt-ts";
import { Vehicle } from "jolt-ts-character-controller";
import type { DemoSetup, DemoView, Harness } from "../lib/harness";

export const view: DemoView = { position: [11, 8, 11], target: [0, 0.6, 0] };

const CHASSIS = Shape.box({ halfExtents: [1, 0.4, 2.4] });

const setup: DemoSetup = (h: Harness) => {
  h.ground({ size: 44, friction: 0.9 });

  const vehicle = new Vehicle({
    world: h.world,
    shape: CHASSIS,
    position: [0, 1.1, 0],
    density: 200,
    carConfig: { engineHorsepower: 600, engineMaxRPM: 6000, maxSteerAngle: Math.PI / 6, steerRate: Math.PI * 2 },
  });

  const wheelDefs: { pos: [number, number, number]; steer: boolean }[] = [
    { pos: [0.9, -0.35, 1.8], steer: true },
    { pos: [-0.9, -0.35, 1.8], steer: true },
    { pos: [0.9, -0.35, -1.8], steer: false },
    { pos: [-0.9, -0.35, -1.8], steer: false },
  ];

  const chassis = h.attach(vehicle.body, CHASSIS, { color: 0xf472b6, metalness: 0.3, roughness: 0.4 }).mesh;

  const THREE = h.THREE;
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x11131a, roughness: 0.7 });
  const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 22);

  const wheels = wheelDefs.map((def) => {
    const wheel = vehicle.addWheel({
      position: def.pos,
      steerWheel: def.steer,
      driveWheel: true,
      brakeWheel: true,
      springK: 38000,
      dampingC: 4000,
      maxBrakeTorque: 3000,
      tireGripFactor: 1.3,
      wheelModelDensity: 100,
      wheelModelRadius: 0.5,
    });
    const pivot = new THREE.Group();
    pivot.position.set(def.pos[0], def.pos[1], def.pos[2]);
    chassis.add(pivot);
    const spinner = new THREE.Group();
    pivot.add(spinner);
    const cyl = new THREE.Mesh(wheelGeo, wheelMat);
    cyl.rotation.z = Math.PI / 2; // axle along the car's local X
    cyl.castShadow = true;
    spinner.add(cyl);
    return { wheel, pivot, spinner, steer: def.steer };
  });

  h.onPreStep((dt) => {
    vehicle.setMovement({ forward: true, steerLeft: true });
    vehicle.step(dt);
  });

  h.onFrame((dt) => {
    for (const w of wheels) {
      const snap = w.wheel.snapshot();
      if (w.steer) w.pivot.rotation.y = snap.steerAngle;
      w.spinner.rotation.x += snap.wheelAngularVelocity * dt;
    }
  });
};

export default setup;
