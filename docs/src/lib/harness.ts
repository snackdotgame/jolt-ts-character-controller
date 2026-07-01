// A small three.js stage that renders a live jolt-ts-character-controller demo.
//
// Adapted from the jolt-ts docs harness. The core idea: `spawn()` creates a
// physics `Body` and a matching three.js mesh in one call, and `attach()` gives
// an *existing* body (one a CharacterController or Vehicle created for itself) a
// mesh. Every frame the render loop copies each tracked body's transform onto
// its mesh.
//
// The key addition over the plain jolt-ts harness is `onPreStep`: controllers
// and vehicles must apply their impulses *before* `world.step`, so demos drive
// them there. `onStep` runs after the world integrates; `onFrame` runs once per
// rendered frame for visual-only updates (wheels, rotors).
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  Body,
  Shape,
  World,
  type CreateBodyOptions,
  type JoltRuntime,
  type ShapeInput,
  type Vector3Input,
  type WorldCreateOptions,
} from "jolt-ts";
import { CharacterController, type CharacterControllerOptions } from "jolt-ts-character-controller";

export interface DemoView {
  readonly position?: [number, number, number];
  readonly target?: [number, number, number];
}

export interface DemoModule {
  default: DemoSetup;
  worldOptions?: Partial<WorldCreateOptions>;
  view?: DemoView;
}

export type DemoSetup = (harness: Harness) => void | (() => void);

export interface MeshOptions {
  readonly color?: number | string;
  readonly opacity?: number;
  readonly metalness?: number;
  readonly roughness?: number;
  readonly emissive?: number | string;
  readonly wireframe?: boolean;
  readonly flatShading?: boolean;
  readonly visible?: boolean;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
}

export interface SpawnResult {
  readonly body: Body;
  readonly mesh: THREE.Object3D;
}

export interface GroundOptions {
  readonly size?: number;
  readonly y?: number;
  readonly color?: number;
  readonly grid?: boolean;
  readonly layer?: string | number;
  readonly friction?: number;
  readonly restitution?: number;
}

export interface SpawnCharacterOptions {
  position: [number, number, number];
  radius?: number;
  halfHeight?: number;
  color?: number | string;
  maxWalkVel?: number;
  maxRunVel?: number;
  jumpVel?: number;
  /** Allow the body to rotate (e.g. to reorient on a planet). Default: rotation-locked. */
  freeRotation?: boolean;
  /** Extra CharacterController options (custom gravity, etc.). */
  controller?: Partial<CharacterControllerOptions>;
  /** Idle frames to settle + prime ground friction before driving. Default 30. */
  primeFrames?: number;
}

export interface CharacterHandle {
  controller: CharacterController;
  mesh: THREE.Object3D;
  /** True once the character has settled + primed; drive it only after this. */
  primed: boolean;
}

/** Public surface handed to each demo's `setup(harness)`. */
export interface Harness {
  readonly THREE: typeof THREE;
  readonly runtime: JoltRuntime;
  readonly world: World;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  /** Create a body and a matching mesh in one call. */
  spawn(desc: CreateBodyOptions, opts?: MeshOptions): SpawnResult;
  /** Give an existing body (from a controller/vehicle) a mesh built from `shape`. */
  attach(body: Body, shape: ShapeInput, opts?: MeshOptions): SpawnResult;
  /** Create a correctly-tuned CharacterController (mass-scaled float spring, rotation-locked) plus a capsule mesh. */
  spawnCharacter(opts: SpawnCharacterOptions): CharacterHandle;
  /** Add a bare three.js object (owned + disposed with the demo). */
  add(object: THREE.Object3D): void;
  /** Track an existing body/object pair each frame. */
  track(body: Body, object: THREE.Object3D): void;
  remove(target: Body | SpawnResult): void;
  ground(opts?: GroundOptions): Body;
  view(position: [number, number, number], target?: [number, number, number]): void;
  /** Run `fn` before each fixed `world.step` — where controllers/vehicles step. */
  onPreStep(fn: (dt: number, frame: number) => void): void;
  /** Run `fn` after each fixed `world.step`. */
  onStep(fn: (dt: number, frame: number) => void): void;
  /** Run `fn` once per rendered frame (visual-only updates). */
  onFrame(fn: (dt: number) => void): void;
  /** Take over the camera each frame (disables orbit controls); for follow cams. */
  onCamera(fn: (dt: number) => void): void;
}

const DYNAMIC_PALETTE = [0x4f7cff, 0x6ee7f0, 0x8b5cf6, 0xf472b6, 0xfbbf24, 0x34d399];
const FIXED_DT = 1 / 60;
const MAX_SUBSTEPS = 5;

// The controller's float spring (springK/dampingC) is the one force that is NOT
// mass-normalized; the defaults are tuned for ecctrl's ~0.283 kg reference
// capsule. A default-density Jolt capsule is ~1000x heavier, so the spring must
// be scaled by the real body mass — exactly what the snack-game templates do.
const ECCTRL_REF_MASS = 0.283;

export interface DemoHandle {
  reset(): Promise<void>;
  setPaused(paused: boolean): void;
  readonly paused: boolean;
  dispose(): void;
}

export async function createDemo(
  canvas: HTMLCanvasElement,
  runtime: JoltRuntime,
  module: DemoModule,
): Promise<DemoHandle> {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0a1120, 30, 70);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
  camera.position.set(...(module.view?.position ?? [8, 6, 11]));

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 2;
  controls.maxDistance = 90;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.target.set(...(module.view?.target ?? [0, 1, 0]));

  addLights(scene);

  const scratchP: [number, number, number] = [0, 0, 0];
  const scratchQ: [number, number, number, number] = [0, 0, 0, 1];

  let world: World;
  let paletteIndex = 0;
  let tracked: Array<{ body: Body; object: THREE.Object3D }> = [];
  let owned: THREE.Object3D[] = [];
  let preStepCallbacks: Array<(dt: number, frame: number) => void> = [];
  let stepCallbacks: Array<(dt: number, frame: number) => void> = [];
  let frameCallbacks: Array<(dt: number) => void> = [];
  let cameraCallback: ((dt: number) => void) | null = null;
  let cleanup: (() => void) | void;
  let frame = 0;

  const facade: Harness = {
    THREE,
    runtime,
    get world() {
      return world;
    },
    scene,
    camera,
    renderer,
    controls,
    spawn(desc, opts = {}) {
      const body = world.createBody(desc);
      const dynamicish = (desc.type ?? "dynamic") !== "static";
      const fallback = () => DYNAMIC_PALETTE[paletteIndex++ % DYNAMIC_PALETTE.length]!;
      const material = makeMaterial(opts, desc.type === "kinematic" ? 0x3a9bdc : desc.type === "static" ? 0x8a92a6 : fallback());
      const object = buildObject(desc.shape, material);
      applyShadow(object, opts, dynamicish);
      if (opts.visible === false) object.visible = false;
      object.userData.body = body;
      scene.add(object);
      owned.push(object);
      const pair = { body, object };
      tracked.push(pair);
      syncPair(pair);
      return { body, mesh: object };
    },
    attach(body, shape, opts = {}) {
      const material = makeMaterial(opts, 0x6ee7f0);
      const object = buildObject(shape, material);
      applyShadow(object, opts, true);
      if (opts.visible === false) object.visible = false;
      object.userData.body = body;
      scene.add(object);
      owned.push(object);
      const pair = { body, object };
      tracked.push(pair);
      syncPair(pair);
      return { body, mesh: object };
    },
    spawnCharacter(opts) {
      const radius = opts.radius ?? 0.35;
      const halfHeight = opts.halfHeight ?? 0.45;
      // The player body: a capsule the controller floats. friction 0 (the
      // controller drives its own ground friction) and — unless the demo needs
      // to reorient (planet walking) — rotation is DOF-locked so it can't tip,
      // which is why autoBalance can be off.
      const body = world.createBody({
        type: "dynamic",
        shape: Shape.capsule({ halfHeight, radius }),
        position: opts.position,
        layer: "moving",
        friction: 0,
        restitution: 0,
        linearDamping: 0,
        angularDamping: 0,
        allowSleeping: false,
        allowedDofs: opts.freeRotation
          ? undefined
          : ["translation-x", "translation-y", "translation-z"],
        motionQuality: "linearCast",
      });
      // Scale the (non-mass-normalized) float spring to the real body mass.
      const massScale = body.mass() / ECCTRL_REF_MASS;
      const controller = new CharacterController({
        world,
        body,
        useCustomForward: true, // demos feed a world-space move direction as "forward"
        enableToggleRun: false,
        autoBalance: opts.freeRotation ?? false,
        capsuleHalfHeight: halfHeight,
        capsuleRadius: radius,
        maxWalkVel: opts.maxWalkVel ?? 4,
        maxRunVel: opts.maxRunVel ?? 7,
        jumpVel: opts.jumpVel ?? 6,
        floatHeight: 0.2,
        springK: 80 * massScale,
        dampingC: 6 * massScale,
        fallingGravityScale: 1,
        ...opts.controller,
      });
      const { mesh } = facade.attach(
        body,
        Shape.capsule({ halfHeight, radius }),
        { color: opts.color ?? 0x6ee7f0, roughness: 0.4, metalness: 0.15 },
      );
      // The controller's ground-friction coefficient is only computed while the
      // character is idle on the ground; a character driven from the very first
      // frame would never build any move force. Prime it with a short idle (as a
      // freshly-spawned player naturally is) before the demo starts driving.
      const handle: CharacterHandle = { controller, mesh, primed: false };
      let primeFrames = opts.primeFrames ?? 30;
      facade.onPreStep((dt) => {
        if (handle.primed) return;
        controller.setMovement({});
        controller.step(dt);
        if ((controller.isOnGround && controller.slideFriction > 0) || --primeFrames <= 0) {
          handle.primed = true;
        }
      });
      return handle;
    },
    add(object) {
      scene.add(object);
      owned.push(object);
    },
    track(body, object) {
      object.userData.body = body;
      tracked.push({ body, object });
    },
    remove(target) {
      const body = target instanceof Body ? target : target.body;
      const index = tracked.findIndex((pair) => pair.body === body);
      if (index >= 0) {
        const { object } = tracked[index]!;
        scene.remove(object);
        disposeObject(object);
        const ownedIndex = owned.indexOf(object);
        if (ownedIndex >= 0) owned.splice(ownedIndex, 1);
        tracked.splice(index, 1);
      }
      if (body.valid) world.removeBody(body);
    },
    ground(opts = {}) {
      return buildGround(facade, opts);
    },
    view(position, target = [0, 1, 0]) {
      camera.position.set(...position);
      controls.target.set(...target);
    },
    onPreStep(fn) {
      preStepCallbacks.push(fn);
    },
    onStep(fn) {
      stepCallbacks.push(fn);
    },
    onFrame(fn) {
      frameCallbacks.push(fn);
    },
    onCamera(fn) {
      cameraCallback = fn;
      controls.enabled = false;
    },
  };

  function syncPair(pair: { body: Body; object: THREE.Object3D }): void {
    if (!pair.body.valid) return;
    pair.body.translationInto(scratchP);
    pair.body.rotationInto(scratchQ);
    pair.object.position.set(scratchP[0], scratchP[1], scratchP[2]);
    pair.object.quaternion.set(scratchQ[0], scratchQ[1], scratchQ[2], scratchQ[3]);
  }

  async function build(): Promise<void> {
    world = await World.create({
      runtime,
      gravity: [0, -9.81, 0],
      deterministic: "cross-platform",
      ...module.worldOptions,
    });
    frame = 0;
    cleanup = module.default(facade);
  }

  function teardown(): void {
    if (typeof cleanup === "function") {
      try {
        cleanup();
      } catch {
        /* best-effort */
      }
    }
    cleanup = undefined;
    for (const object of owned) {
      scene.remove(object);
      disposeObject(object);
    }
    owned = [];
    tracked = [];
    preStepCallbacks = [];
    stepCallbacks = [];
    frameCallbacks = [];
    cameraCallback = null;
    controls.enabled = true;
    paletteIndex = 0;
    world?.dispose();
  }

  const resize = () => {
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  let paused = false;
  let disposed = false;
  let raf = 0;
  let last = 0;
  let acc = 0;

  const loop = (now: number) => {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;

    if (!paused && world && !world.disposed) {
      acc += dt;
      let steps = 0;
      while (acc >= FIXED_DT && steps < MAX_SUBSTEPS) {
        for (const fn of preStepCallbacks) fn(FIXED_DT, frame);
        world.step(FIXED_DT);
        for (const fn of stepCallbacks) fn(FIXED_DT, frame);
        frame += 1;
        acc -= FIXED_DT;
        steps += 1;
      }
      if (steps === MAX_SUBSTEPS) acc = 0;
    }

    for (const pair of tracked) syncPair(pair);
    for (const fn of frameCallbacks) fn(dt);
    if (cameraCallback) cameraCallback(dt);
    else controls.update();
    renderer.render(scene, camera);
  };

  await build();
  resize();
  raf = requestAnimationFrame(loop);

  return {
    get paused() {
      return paused;
    },
    setPaused(next) {
      paused = next;
      if (!next) last = 0;
    },
    async reset() {
      const wasPaused = paused;
      paused = true;
      teardown();
      await build();
      acc = 0;
      last = 0;
      paused = wasPaused;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      teardown();
      controls.dispose();
      renderer.dispose();
    },
  };
}

function addLights(scene: THREE.Scene): void {
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x41506f, 2.8));
  scene.add(new THREE.AmbientLight(0x9fb2d8, 1.1));

  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(8, 14, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 70;
  const extent = 26;
  key.shadow.camera.left = -extent;
  key.shadow.camera.right = extent;
  key.shadow.camera.top = extent;
  key.shadow.camera.bottom = -extent;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x7fb0ff, 0.7);
  fill.position.set(-9, 6, -8);
  scene.add(fill);
}

function buildGround(harness: Harness, opts: GroundOptions): Body {
  const size = opts.size ?? 60;
  const y = opts.y ?? 0;
  const THREE_ = harness.THREE;

  const body = harness.world.createBody({
    type: "static",
    shape: Shape.box({ halfExtents: [size / 2, 0.5, size / 2] }),
    position: [0, y - 0.5, 0],
    layer: opts.layer ?? "static",
    friction: opts.friction ?? 0.8,
    restitution: opts.restitution ?? 0,
  });

  const plane = new THREE_.Mesh(
    new THREE_.PlaneGeometry(size, size),
    new THREE_.MeshStandardMaterial({ color: opts.color ?? 0x0e1730, roughness: 0.96, metalness: 0 }),
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = y;
  plane.receiveShadow = true;
  harness.add(plane);

  if (opts.grid ?? true) {
    const grid = new THREE_.GridHelper(size, size, 0x36507f, 0x1b2b4d);
    grid.position.y = y + 0.002;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.5;
    harness.add(grid);
  }

  return body;
}

function makeMaterial(opts: MeshOptions, fallbackColor: number | string): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: opts.color ?? fallbackColor,
    metalness: opts.metalness ?? 0.1,
    roughness: opts.roughness ?? 0.55,
    flatShading: opts.flatShading ?? false,
    wireframe: opts.wireframe ?? false,
  });
  if (opts.emissive !== undefined) material.emissive = new THREE.Color(opts.emissive);
  if (opts.opacity !== undefined && opts.opacity < 1) {
    material.transparent = true;
    material.opacity = opts.opacity;
    material.depthWrite = false;
  }
  return material;
}

function applyShadow(object: THREE.Object3D, opts: MeshOptions, dynamicish: boolean): void {
  object.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      node.castShadow = opts.castShadow ?? dynamicish;
      node.receiveShadow = opts.receiveShadow ?? !dynamicish;
    }
  });
}

/** Map a jolt-ts shape descriptor to a three.js object (Mesh, or Group for compounds). */
export function buildObject(shape: ShapeInput, material: THREE.Material): THREE.Object3D {
  if (!isDescriptor(shape)) {
    return new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), material);
  }

  switch (shape.kind) {
    case "sphere":
      return new THREE.Mesh(new THREE.SphereGeometry(shape.radius, 32, 20), material);
    case "box": {
      const h = readVec3(shape.halfExtents);
      return new THREE.Mesh(new THREE.BoxGeometry(h[0] * 2, h[1] * 2, h[2] * 2), material);
    }
    case "capsule":
      return new THREE.Mesh(new THREE.CapsuleGeometry(shape.radius, shape.halfHeight * 2, 12, 24), material);
    case "cylinder":
      return new THREE.Mesh(new THREE.CylinderGeometry(shape.radius, shape.radius, shape.halfHeight * 2, 32), material);
    case "compound": {
      const group = new THREE.Group();
      for (const child of shape.children) {
        const childObject = buildObject(child.shape, material);
        const p = readVec3(child.position ?? [0, 0, 0]);
        childObject.position.set(p[0], p[1], p[2]);
        if (child.rotation) {
          const q = readQuat(child.rotation);
          childObject.quaternion.set(q[0], q[1], q[2], q[3]);
        }
        group.add(childObject);
      }
      return group;
    }
    case "offsetCenterOfMass":
      return buildObject(shape.shape, material);
    default:
      return new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), material);
  }
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      node.geometry.dispose();
      const material = node.material as THREE.Material | THREE.Material[];
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material.dispose();
    }
  });
}

function isDescriptor(shape: ShapeInput): shape is Extract<ShapeInput, { kind: string }> {
  return typeof shape === "object" && shape !== null && "kind" in shape;
}

function readVec3(input: Vector3Input): [number, number, number] {
  if (Array.isArray(input) || ArrayBuffer.isView(input)) {
    const array = input as ArrayLike<number>;
    return [Number(array[0]), Number(array[1]), Number(array[2])];
  }
  const v = input as { x: number; y: number; z: number };
  return [v.x, v.y, v.z];
}

function readQuat(input: unknown): [number, number, number, number] {
  if (Array.isArray(input) || ArrayBuffer.isView(input)) {
    const array = input as ArrayLike<number>;
    return [Number(array[0]), Number(array[1]), Number(array[2]), Number(array[3])];
  }
  const q = input as { x: number; y: number; z: number; w: number };
  return [q.x, q.y, q.z, q.w];
}
