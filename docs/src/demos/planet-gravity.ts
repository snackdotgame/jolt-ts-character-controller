// Custom gravity: the character carries a radial gravity field pointing at the
// planet's center and is allowed to rotate (freeRotation) so auto-balance can
// stand it upright relative to the surface as it walks around the little world.
import { Shape } from "jolt-ts";
import type { DemoSetup, DemoView, Harness } from "../lib/harness";

export const view: DemoView = { position: [0, 4, 12], target: [0, 0, 0] };

// No global gravity; the character's field is the only pull.
export const worldOptions = { gravity: [0, 0, 0] as [number, number, number] };

const R = 3.2;
const G = 9.81;

const setup: DemoSetup = (h: Harness) => {
  h.spawn(
    { type: "static", shape: Shape.sphere(R), position: [0, 0, 0], layer: "static", friction: 0.9 },
    { color: 0x2b4a86, roughness: 0.9, metalness: 0.05 },
  );

  const gravity = new h.THREE.Vector3();
  const character = h.spawnCharacter({
    position: [0, R + 1, 0],
    freeRotation: true, // allow the capsule to reorient to the surface
    maxWalkVel: 2.5,
    controller: {
      enableCustomGravity: true,
      useCharacterUpAxis: true,
      gravityField: (p) => gravity.copy(p).normalize().multiplyScalar(-G),
    },
  });

  h.onPreStep((dt) => {
    if (!character.primed) return;
    // Walk along the body's own facing; auto-balance keeps it tangent to the
    // surface as it rounds the planet.
    character.controller.setForwardDirection(character.controller.bodyZAxis);
    character.controller.setMovement({ forward: true });
    character.controller.step(dt);
  });
};

export default setup;
