// A multirotor Vehicle flying an autonomous square patrol in POSITION control
// mode: it flies itself to each waypoint with setTarget — no manual throttle or
// attitude input. Rotor disks spin proportionally to each propeller's throttle.
import { Shape } from "jolt-ts";
import { Vehicle } from "jolt-ts-character-controller";
import type { DemoSetup, DemoView, Harness } from "../lib/harness";

export const view: DemoView = { position: [12, 9, 13], target: [0, 3, 0] };

// The propellers hover against the character's own gravity field, so world
// gravity is zeroed (matching the library's drone setup).
export const worldOptions = { gravity: [0, 0, 0] as [number, number, number] };

const ARM = 1;

const CHASSIS = Shape.compound([
  { shape: Shape.box({ halfExtents: [0.42, 0.14, 0.42] }) },
  { shape: Shape.cylinder({ halfHeight: 0.04, radius: 0.5 }), position: [ARM, -0.05, ARM] },
  { shape: Shape.cylinder({ halfHeight: 0.04, radius: 0.5 }), position: [ARM, -0.05, -ARM] },
  { shape: Shape.cylinder({ halfHeight: 0.04, radius: 0.5 }), position: [-ARM, -0.05, ARM] },
  { shape: Shape.cylinder({ halfHeight: 0.04, radius: 0.5 }), position: [-ARM, -0.05, -ARM] },
]);

const setup: DemoSetup = (h: Harness) => {
  h.ground({ size: 44 });

  const drone = new Vehicle({
    world: h.world,
    shape: CHASSIS,
    position: [4, 3, 4],
    density: 200,
    enableCustomGravity: true,
    gravityField: () => ({ x: 0, y: -9.81, z: 0 }),
    droneConfig: { controlMode: "POSITION", maxHorizSpeed: 12, maxVertSpeed: 8, maxTiltAngle: Math.PI / 5 },
  });

  const propDefs: { pos: [number, number, number]; invert: boolean }[] = [
    { pos: [ARM, -0.05, ARM], invert: true },
    { pos: [-ARM, -0.05, ARM], invert: false },
    { pos: [ARM, -0.05, -ARM], invert: false },
    { pos: [-ARM, -0.05, -ARM], invert: true },
  ];

  const chassis = h.attach(drone.body, CHASSIS, { color: 0x34d399, metalness: 0.3, roughness: 0.45 }).mesh;

  const THREE = h.THREE;
  const rotorMat = new THREE.MeshStandardMaterial({ color: 0xeaf1ff, transparent: true, opacity: 0.5, depthWrite: false });
  const rotorGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.02, 20);

  const rotors = propDefs.map((def) => {
    const propeller = drone.addPropeller({ position: def.pos, maxThrust: 5000, torqueRatio: 0.6, invertTorque: def.invert });
    const spinner = new THREE.Group();
    spinner.position.set(def.pos[0], def.pos[1] + 0.1, def.pos[2]);
    chassis.add(spinner);
    spinner.add(new THREE.Mesh(rotorGeo, rotorMat));
    return { propeller, spinner };
  });

  const waypoints: [number, number, number][] = [
    [4, 3, 4],
    [-4, 4.5, 4],
    [-4, 3, -4],
    [4, 5, -4],
  ];
  const heading = { x: 0, y: 0, z: 1 };
  let index = 0;
  let hold = 0;

  h.onPreStep((dt) => {
    hold += dt;
    if (hold > 3) {
      hold = 0;
      index = (index + 1) % waypoints.length;
    }
    const [x, y, z] = waypoints[index]!;
    drone.setTarget({ x, y, z }, heading);
    drone.step(dt);
  });

  h.onFrame((dt) => {
    for (const r of rotors) {
      r.spinner.rotation.y += (20 + r.propeller.finalThrottle * 90) * dt;
    }
  });
};

export default setup;
