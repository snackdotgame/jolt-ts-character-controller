// The floating capsule gliding over ramps and steps. The character walks a
// precise square patrol (waypoint to waypoint), and each edge has an obstacle on
// it — so it climbs a ramp or steps up every lap. The hover spring keeps it
// smoothly gliding over the changing ground height.
import { Shape } from "jolt-ts";
import type { DemoSetup, DemoView, Harness } from "../lib/harness";

export const view: DemoView = { position: [13, 11, 15], target: [0, 0.8, 0] };

const S = 6;
const WAYPOINTS: [number, number][] = [[S, S], [S, -S], [-S, -S], [-S, S]];

const setup: DemoSetup = (h: Harness) => {
  h.ground({ size: 44 });

  const tilt = 0.26;
  // Ramp on the x=+S edge (walked along z), tilted about X.
  h.spawn(
    { type: "static", shape: Shape.box({ halfExtents: [1.5, 0.2, 1.9] }), position: [S, 0.45, 0], rotation: [Math.sin(tilt / 2), 0, 0, Math.cos(tilt / 2)], layer: "static" },
    { color: 0x2b4a86 },
  );
  // Ramp on the z=+S edge (walked along x), tilted about Z.
  h.spawn(
    { type: "static", shape: Shape.box({ halfExtents: [1.9, 0.2, 1.5] }), position: [0, 0.45, S], rotation: [0, 0, Math.sin(tilt / 2), Math.cos(tilt / 2)], layer: "static" },
    { color: 0x2b4a86 },
  );
  // Step blocks on the other two edges.
  h.spawn({ type: "static", shape: Shape.box({ halfExtents: [1.4, 0.24, 1.6] }), position: [0, 0.24, -S], layer: "static" }, { color: 0x2b4a86 });
  h.spawn({ type: "static", shape: Shape.box({ halfExtents: [1.6, 0.2, 1.4] }), position: [-S, 0.2, 0], layer: "static" }, { color: 0x2b4a86 });

  const character = h.spawnCharacter({ position: [S, 1.1, S], maxWalkVel: 3.5 });

  let wp = 0;
  h.onPreStep((dt) => {
    if (!character.primed) return;
    const p = character.controller.currPos;
    const [tx, tz] = WAYPOINTS[wp]!;
    const dx = tx - p.x;
    const dz = tz - p.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1.0) {
      wp = (wp + 1) % WAYPOINTS.length; // reached the corner → head to the next
    } else {
      character.controller.setForwardDirection({ x: dx / dist, y: 0, z: dz / dist });
      character.controller.setMovement({ forward: true });
    }
    character.controller.step(dt);
  });
};

export default setup;
