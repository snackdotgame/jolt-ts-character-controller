// A CharacterController walking a bounded looping path and jumping, driven by
// scripted input. Following the snack-game templates: the body is rotation-locked
// with a mass-scaled float spring (h.spawnCharacter), and we feed the unit
// direction toward the next waypoint in as the controller's custom "forward".
// The character is primed (settled idle) before we drive it — that's when the
// controller computes its ground friction.
import { Shape } from "jolt-ts";
import type { DemoSetup, DemoView, Harness } from "../lib/harness";

export const view: DemoView = { position: [14, 13, 17], target: [0, 0.8, 0] };

const R = 7;
// A square patrol centered on the scene, so the character loops forever without
// ever wandering off the ground.
const WAYPOINTS: [number, number][] = [
  [R, R],
  [R, -R],
  [-R, -R],
  [-R, R],
];

const setup: DemoSetup = (h: Harness) => {
  h.ground({ size: 40 });

  // A center pillar + corner blocks — decoration, kept off the patrol path.
  h.spawn(
    { type: "static", shape: Shape.box({ halfExtents: [0.9, 1.5, 0.9] }), position: [0, 1.5, 0], layer: "static" },
    { color: 0x2b4a86 },
  );
  for (const [x, z] of [[11, 9], [-10, 11], [11, -10], [-11, -9]] as const) {
    h.spawn(
      { type: "static", shape: Shape.box({ halfExtents: [0.7, 0.7, 0.7] }), position: [x, 0.7, z], layer: "static" },
      { color: 0x27407a },
    );
  }

  const character = h.spawnCharacter({ position: [R, 1.1, R], maxWalkVel: 4, maxRunVel: 7 });

  let wp = 0;
  let jumpTimer = 0;

  h.onPreStep((dt) => {
    if (!character.primed) return;
    jumpTimer += dt;

    // Steer toward the current waypoint; advance to the next once we reach it.
    const p = character.controller.currPos;
    const [tx, tz] = WAYPOINTS[wp]!;
    const dx = tx - p.x;
    const dz = tz - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1.0) {
      wp = (wp + 1) % WAYPOINTS.length;
    } else {
      character.controller.setForwardDirection({ x: dx / dist, y: 0, z: dz / dist });
    }

    let jump = false;
    if (jumpTimer > 3.5) {
      jump = true;
      jumpTimer = 0;
    }
    // Run along two of the four legs for some variety.
    character.controller.setMovement({ forward: dist >= 1.0, run: wp % 2 === 1, jump });
    character.controller.step(dt);
  });
};

export default setup;
