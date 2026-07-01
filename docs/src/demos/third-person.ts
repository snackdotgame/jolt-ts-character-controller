// An INTERACTIVE third-person character. WASD moves relative to the camera,
// drag to look around, Space jumps, Shift runs. This mirrors the snack-dash
// template: keyboard + camera yaw are turned into a world-space move vector,
// which is fed to the controller as its "forward" axis; a follow camera trails
// the capsule.
import { Shape } from "jolt-ts";
import type { DemoSetup, DemoView, Harness } from "../lib/harness";

export const view: DemoView = { position: [0, 5, -9], target: [0, 1, 0] };

const setup: DemoSetup = (h: Harness) => {
  const THREE = h.THREE;
  h.ground({ size: 64 });

  // A little playground: boxes to weave around and a ramp to climb.
  for (const [x, z, s] of [[6, 5, 0.8], [-6, 8, 1.1], [9, -6, 0.7], [-9, -5, 1.3], [0, 11, 1.0]] as const) {
    h.spawn({ type: "static", shape: Shape.box({ halfExtents: [s, s, s] }), position: [x, s, z], layer: "static" }, { color: 0x27407a });
  }
  h.spawn(
    { type: "static", shape: Shape.box({ halfExtents: [2.4, 0.2, 3] }), position: [5, 0.6, -3], rotation: [Math.sin(0.16 / 2), 0, 0, Math.cos(0.16 / 2)], layer: "static" },
    { color: 0x2b4a86 },
  );

  const character = h.spawnCharacter({ position: [0, 1.1, 0], maxWalkVel: 4.5, maxRunVel: 8 });

  // A small nose so you can see which way the character is heading (the body
  // itself is rotation-locked, so this is a visual-only facing indicator).
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.34), new THREE.MeshStandardMaterial({ color: 0x0a2233 }));
  nose.position.set(0, 0.12, 0.38);
  character.mesh.add(nose);
  let facing = Math.PI;

  // --- Input (camera-relative, snack-dash style) ---
  const keys = new Set<string>();
  let camYaw = Math.PI;
  let camPitch = 0.35;
  let dragging = false;
  let focused = false;
  const canvas = h.renderer.domElement;

  const MOVE_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "ShiftLeft", "ShiftRight"]);
  const onKeyDown = (e: KeyboardEvent) => {
    if (!focused) return;
    keys.add(e.code);
    if (MOVE_KEYS.has(e.code)) e.preventDefault();
  };
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
  const onBlur = () => { keys.clear(); focused = false; dragging = false; };
  const onDocDown = (e: PointerEvent) => { focused = e.target === canvas; };
  const onDown = () => { dragging = true; };
  const onUp = () => { dragging = false; };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragging) return;
    camYaw -= e.movementX * 0.005;
    camPitch = Math.max(-0.1, Math.min(1.1, camPitch + e.movementY * 0.004));
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  document.addEventListener("pointerdown", onDocDown);
  canvas.addEventListener("pointerdown", onDown);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointermove", onPointerMove);

  // --- Drive the controller from camera-relative input ---
  h.onPreStep((dt) => {
    if (!character.primed) return;
    let fwd = 0;
    let side = 0;
    if (keys.has("KeyW") || keys.has("ArrowUp")) fwd += 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) fwd -= 1;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) side -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) side += 1;

    const sin = Math.sin(camYaw);
    const cos = Math.cos(camYaw);
    const mx = fwd * sin - side * cos;
    const mz = fwd * cos + side * sin;
    const mag = Math.hypot(mx, mz);
    const moving = mag > 1e-3;
    if (moving) {
      character.controller.setForwardDirection({ x: mx / mag, y: 0, z: mz / mag });
      facing = Math.atan2(mx, mz);
    }
    character.controller.setMovement({
      forward: moving,
      run: keys.has("ShiftLeft") || keys.has("ShiftRight"),
      jump: keys.has("Space"),
    });
    character.controller.step(dt);
  });

  // Visual facing (overrides the synced identity rotation of the locked body).
  h.onFrame(() => {
    character.mesh.rotation.set(0, facing, 0);
  });

  // --- Third-person follow camera ---
  const camTarget = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const camOff = new THREE.Vector3();
  h.onCamera((dt) => {
    const p = character.controller.currPos;
    camTarget.set(p.x, p.y + 0.6, p.z);
    camOff
      .set(-Math.sin(camYaw) * Math.cos(camPitch), Math.sin(camPitch), -Math.cos(camYaw) * Math.cos(camPitch))
      .multiplyScalar(7);
    camPos.copy(camTarget).add(camOff);
    h.camera.position.lerp(camPos, 1 - Math.exp(-dt * 12));
    h.camera.lookAt(camTarget);
  });

  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    document.removeEventListener("pointerdown", onDocDown);
    canvas.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointermove", onPointerMove);
  };
};

export default setup;
