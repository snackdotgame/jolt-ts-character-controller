// A CharacterController walking a looping path and jumping, driven by scripted
// input. Following the snack-game templates: the body is rotation-locked with a
// mass-scaled float spring (h.spawnCharacter), and we feed the unit move
// direction in as the controller's custom "forward". The character is primed
// (settled idle) before we drive it — that's when the controller computes its
// ground friction.
import { Shape } from "jolt-ts";
import type { DemoSetup, DemoView, Harness } from "../lib/harness";

export const view: DemoView = { position: [12, 10, 15], target: [0, 1, 0] };

const setup: DemoSetup = (h: Harness) => {
  h.ground({ size: 44 });

  for (const [x, z] of [[-8, -6], [8, 6], [-8, 7], [7, -8]] as const) {
    h.spawn(
      { type: "static", shape: Shape.box({ halfExtents: [0.7, 0.7, 0.7] }), position: [x, 0.7, z], layer: "static" },
      { color: 0x27407a },
    );
  }

  const character = h.spawnCharacter({ position: [5, 1.1, 0], maxWalkVel: 4, maxRunVel: 7 });

  let t = 0;
  let jumpTimer = 0;

  h.onPreStep((dt) => {
    if (!character.primed) return;
    t += dt;
    jumpTimer += dt;

    // The move direction rotates → the character walks a loop.
    const angle = t * 0.5;
    character.controller.setForwardDirection({ x: Math.cos(angle), y: 0, z: Math.sin(angle) });

    let jump = false;
    if (jumpTimer > 3) {
      jump = true;
      jumpTimer = 0;
    }
    character.controller.setMovement({ forward: true, run: Math.sin(t * 0.25) > 0.4, jump });
    character.controller.step(dt);
  });
};

export default setup;
