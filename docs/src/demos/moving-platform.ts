// followPlatform: a kinematic platform slides back and forth and the character
// standing on it is carried along without sliding off (no walk input). The
// platform is driven with moveKinematic in onPreStep, then the controller steps.
import { Shape } from "jolt-ts";
import type { DemoSetup, DemoView, Harness } from "../lib/harness";

export const view: DemoView = { position: [0, 6, 14], target: [0, 1.2, 0] };

const SPAN = 4;

const setup: DemoSetup = (h: Harness) => {
  h.ground({ size: 30, y: -2.5 });

  const platformY = 0.5;
  const { body: platform } = h.spawn(
    {
      type: "kinematic",
      shape: Shape.box({ halfExtents: [2.2, 0.15, 2.2] }),
      position: [-SPAN, platformY, 0],
      layer: "moving",
    },
    { color: 0x3a9bdc, metalness: 0.2, roughness: 0.4 },
  );

  // A loose box rides along as cargo.
  h.spawn({
    type: "dynamic",
    shape: Shape.box({ halfExtents: [0.35, 0.35, 0.35] }),
    position: [-SPAN + 1, platformY + 0.7, 0.7],
    layer: "moving",
  });

  const character = h.spawnCharacter({ position: [-SPAN, 1.9, -0.5], color: 0xf472b6 });

  let time = 0;
  h.onPreStep((dt) => {
    if (!character.primed) return; // let the character settle onto the platform first
    time += dt;
    const x = Math.sin(time * 0.55) * SPAN;
    // Drive the platform toward its next pose; Jolt derives the velocity and the
    // controller inherits it via followPlatform.
    platform.moveKinematic([x, platformY, 0], [0, 0, 0, 1], dt);

    character.controller.setMovement({}); // just ride — no walk input
    character.controller.step(dt);
  });
};

export default setup;
