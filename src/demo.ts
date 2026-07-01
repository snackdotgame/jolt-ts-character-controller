import CameraControls from "camera-controls/dist/camera-controls.module.js";
import Stats from "stats-gl";
import { loadJolt, Shape, World, type Body, type CreateBodyOptions, type MassPropertiesInput, type QuaternionInput, type ShapeDescriptor, type ShapeInput, type Vector3Input } from "jolt-ts";
import {
  AnimationAction,
  AnimationMixer,
  ArrowHelper,
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Euler,
  FrontSide,
  Group,
  HemisphereLight,
  InstancedMesh,
  Material,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  OctahedronGeometry,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  RingGeometry,
  Scene,
  Sphere,
  SphereGeometry,
  Spherical,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer
} from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import {
  createCharacterAnimationStateController,
  CharacterController,
  Vehicle,
  ThreeAnimationController,
  type ShapeCastWheel,
  type ThrustPropeller
} from "./index.js";
import { vectorFromLike } from "./math.js";
import { createDefaultDemoSettings, mountDemoSettings, type DemoSettings, type VehicleSettings } from "./demoSettings.js";
import type { MovementInput, ReadonlyVehicleInput, VehicleInput } from "./types.js";

import "./demo.css";

const MAX_TIME_STEP = 1 / 30;
const CHARACTER_START = new Vector3(0, 3, -60);
const CUSTOM_GRAVITY_VALUE = 9.81;
const RAPIER_DEFAULT_COLLIDER_FRICTION = 0.5;
const SPHERE_ZONE_X = 0;
const SPHERE_ZONE_Y = 20;
const SPHERE_ZONE_Z = 0;
const SPHERE_ZONE_RADIUS = 15;
const SPHERE_ZONE_RADIUS_SQ = SPHERE_ZONE_RADIUS * SPHERE_ZONE_RADIUS;
const CYLINDER_ZONE_X = 0;
const CYLINDER_ZONE_Z = 110;
const CYLINDER_ZONE_RADIUS = 20;
const CYLINDER_ZONE_RADIUS_SQ = CYLINDER_ZONE_RADIUS * CYLINDER_ZONE_RADIUS;
const CYLINDER_ZONE_Y_MIN = 0;
const CYLINDER_ZONE_Y_MAX = 100;
const CYLINDER_BOTTOM_RIM_Y = 10;
const CYLINDER_TOP_RIM_Y = 90;
const CYLINDER_RIM_EPSILON = 1e-8;
const GRAVITY = new Vector3(0, -CUSTOM_GRAVITY_VALUE, 0);
const CYLINDER_GRAVITY_TEMP = new Vector3();
const VEHICLE3_IDLE_TARGET = new Vector3(0, 3, -55);
const EC_RED = 0xfa8787;
const EC_GREEN = 0x96fa87;
const EC_BLUE = 0x87cefa;
const EC_AZURE = 0xf0ffff;
const EC_PURPLE = 0x800080;
const EC_MED_PURPLE = 0x9370db;
const EC_CORNFLOWER_BLUE = 0x6495ed;
const DEMO_DEBUG_UPDATE_INTERVAL = 15;
const VEHICLE2_BODY_MASS =
  (0.8 * 2) * (0.17 * 2) * (1 * 2) * 100 +
  (1 * 2) * (0.3 * 2) * (2.4 * 2) * 200;
const VEHICLE2_BODY_CENTER_OF_MASS = { x: 0, y: 0.043147208121827416, z: -0.05177664974619289 };
const VEHICLE2_BODY_MASS_PROPERTIES: MassPropertiesInput = {
  mass: VEHICLE2_BODY_MASS,
  inertia: [
    2344.355585516074, 0, 0,
    0, 2691.105353637902, 29.823350253807106,
    0, 29.823350253807106, 467.671565211506
  ]
};
const FIXED_ORIGIN = new Vector3();
const FIXED_Y = new Vector3(0, 1, 0);
const FIXED_Z = new Vector3(0, 0, 1);
const IDENTITY_QUATERNION = { x: 0, y: 0, z: 0, w: 1 };
const KINEMATIC_POSITION = { x: 0, y: 0, z: 0 };
const KINEMATIC_QUATERNION = new Quaternion();
const LOOK_MATRIX = new Matrix4();
const TEMP_EULER = new Euler();
const TEMP_QUAT_A = new Quaternion();
const TEMP_QUAT_B = new Quaternion();
const TEMP_VEC_A = new Vector3();
const TEMP_VEC_B = new Vector3();
const TEMP_VEC_C = new Vector3();
const TEMP_VEC_D = new Vector3();
const TEMP_VEC_E = new Vector3();
const TEMP_VEC_F = new Vector3();
const TEMP_VEC_G = new Vector3();
const ACCESS_CAPSULE_START = new Vector3();
const ACCESS_CAPSULE_END = new Vector3();
const ACCESS_CHARACTER_CENTER = new Vector3();
const ACCESS_CHARACTER_AXIS = new Vector3();
const ACCESS_VEHICLE_POSITION = new Vector3();
const ACCESS_LOCAL_CAPSULE_START = new Vector3();
const ACCESS_LOCAL_CAPSULE_END = new Vector3();
const ACCESS_SENSOR_CENTER = new Vector3();
const ACCESS_SEGMENT_DELTA = new Vector3();
const ACCESS_CENTER_TO_START = new Vector3();
const ACCESS_CLOSEST_POINT = new Vector3();
const ACCESS_INVERSE_ROTATION = new Quaternion();
const CAMERA_FORWARD = new Vector3();
const GRAVITY_IMPULSE = new Vector3();
const WORLD_GRAVITY_INPUT = { x: 0, y: 0, z: 0 };
const LAST_WORLD_GRAVITY = new Vector3(Number.NaN, Number.NaN, Number.NaN);
const INSTANCE_MATRIX = new Matrix4();
const INSTANCE_POSITION = new Vector3();
const INSTANCE_QUATERNION = new Quaternion();
const INSTANCE_SCALE = new Vector3(1, 1, 1);
const meshShapeCache = new Map<string, ShapeInput>();
const convexHullShapeCache = new Map<string, ShapeInput>();
const cuboidShapeCache = new Map<string, ShapeInput>();

function gravityField(objectPos: Vector3): Vector3 {
  const sDxSigned = SPHERE_ZONE_X - objectPos.x;
  const sDySigned = SPHERE_ZONE_Y - objectPos.y;
  const sDzSigned = SPHERE_ZONE_Z - objectPos.z;
  const sDxAbs = Math.abs(sDxSigned);
  const sDyAbs = Math.abs(sDySigned);
  const sDzAbs = Math.abs(sDzSigned);
  if (sDxAbs < SPHERE_ZONE_RADIUS && sDyAbs < SPHERE_ZONE_RADIUS && sDzAbs < SPHERE_ZONE_RADIUS) {
    const sDistSq = sDxSigned * sDxSigned + sDySigned * sDySigned + sDzSigned * sDzSigned;
    if (sDistSq < SPHERE_ZONE_RADIUS_SQ) {
      return GRAVITY.set(sDxSigned, sDySigned, sDzSigned).normalize().multiplyScalar(CUSTOM_GRAVITY_VALUE);
    }
  }

  const cDxSigned = objectPos.x - CYLINDER_ZONE_X;
  const cDzSigned = objectPos.z - CYLINDER_ZONE_Z;
  const cDxAbs = Math.abs(cDxSigned);
  const cDzAbs = Math.abs(cDzSigned);
  if (
    cDxAbs < CYLINDER_ZONE_RADIUS &&
    cDzAbs < CYLINDER_ZONE_RADIUS &&
    objectPos.y >= CYLINDER_ZONE_Y_MIN &&
    objectPos.y <= CYLINDER_ZONE_Y_MAX
  ) {
    const distSq = cDxSigned * cDxSigned + cDzSigned * cDzSigned;
    if (distSq < CYLINDER_ZONE_RADIUS_SQ) {
      if (objectPos.y < CYLINDER_BOTTOM_RIM_Y) {
        const rimScale = distSq > CYLINDER_RIM_EPSILON ? CYLINDER_ZONE_RADIUS / Math.sqrt(distSq) : 0;
        CYLINDER_GRAVITY_TEMP.set(
          CYLINDER_ZONE_X + cDxSigned * rimScale,
          CYLINDER_BOTTOM_RIM_Y,
          CYLINDER_ZONE_Z + cDzSigned * rimScale
        );
        return GRAVITY.subVectors(objectPos, CYLINDER_GRAVITY_TEMP).normalize().multiplyScalar(CUSTOM_GRAVITY_VALUE);
      }
      if (objectPos.y >= CYLINDER_BOTTOM_RIM_Y && objectPos.y < CYLINDER_TOP_RIM_Y) {
        CYLINDER_GRAVITY_TEMP.set(CYLINDER_ZONE_X, objectPos.y, CYLINDER_ZONE_Z);
        return GRAVITY.subVectors(CYLINDER_GRAVITY_TEMP, objectPos).normalize().multiplyScalar(CUSTOM_GRAVITY_VALUE);
      }
      if (objectPos.y >= CYLINDER_TOP_RIM_Y) {
        const rimScale = distSq > CYLINDER_RIM_EPSILON ? CYLINDER_ZONE_RADIUS / Math.sqrt(distSq) : 0;
        CYLINDER_GRAVITY_TEMP.set(
          CYLINDER_ZONE_X + cDxSigned * rimScale,
          CYLINDER_TOP_RIM_Y,
          CYLINDER_ZONE_Z + cDzSigned * rimScale
        );
        return GRAVITY.subVectors(objectPos, CYLINDER_GRAVITY_TEMP).normalize().multiplyScalar(CUSTOM_GRAVITY_VALUE);
      }
    }
  }

  return GRAVITY.set(0, objectPos.y > 50 ? CUSTOM_GRAVITY_VALUE : -CUSTOM_GRAVITY_VALUE, 0);
}

function applyInitialSettingsParams(settings: DemoSettings): void {
  const params = new URLSearchParams(window.location.search);
  if (parseBooleanParam(params.get("normalGravity")) === true) {
    settings.world.physicsGravity = [0, -CUSTOM_GRAVITY_VALUE, 0];
    setAllCustomGravity(settings, false);
  }

  const worldGravity = parseVector3Param(params.get("worldGravity") ?? params.get("physicsGravity"));
  if (worldGravity) settings.world.physicsGravity = worldGravity;

  const customGravity = parseBooleanParam(params.get("customGravity") ?? params.get("enableCustomGravity"));
  if (customGravity !== null) setAllCustomGravity(settings, customGravity);

  const characterStart = parseVector3Param(params.get("characterStart") ?? params.get("playerStart"));
  if (characterStart) CHARACTER_START.fromArray(characterStart);
}

function setAllCustomGravity(settings: DemoSettings, enabled: boolean): void {
  settings.character.enableCustomGravity = enabled;
  settings.vehicles.vehicle1.enableCustomGravity = enabled;
  settings.vehicles.vehicle2.enableCustomGravity = enabled;
  settings.vehicles.vehicle3.enableCustomGravity = enabled;
}

function parseBooleanParam(value: string | null): boolean | null {
  if (value === null) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "" || normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes") return true;
  if (normalized === "0" || normalized === "false" || normalized === "off" || normalized === "no") return false;
  return null;
}

function parseVector3Param(value: string | null): [number, number, number] | null {
  if (value === null) return null;
  const parsed = value.split(",").map((part) => Number(part.trim()));
  if (parsed.length !== 3) return null;
  if (!parsed.every((component) => Number.isFinite(component))) return null;
  return [parsed[0], parsed[1], parsed[2]];
}

type ActiveController = "character" | "vehicle1" | "vehicle2" | "vehicle3";
type MeshMap = Map<string, Mesh<BufferGeometry, Material | Material[]>>;
const CAMERA_CONTROLS_THREE = {
  Vector2,
  Vector3,
  Vector4,
  Quaternion,
  Matrix4,
  Spherical,
  Box3,
  Sphere,
  Raycaster
};

class CameraControlsImpl extends CameraControls {
  private readonly oldUp = new Vector3(0, 1, 0);
  private readonly newUp = new Vector3(0, 1, 0);
  private readonly pivotXAxis = new Vector3();
  private readonly pivotYAxis = new Vector3();
  private readonly pivotZAxis = new Vector3();
  private readonly rotZ = new Quaternion();
  private readonly rotX = new Quaternion();

  setUp(newUp: Vector3): void {
    this.newUp.copy(newUp).normalize();
    const angleBetween = this.newUp.angleTo(this.oldUp);
    if (angleBetween <= 0) return;

    this.pivotYAxis.copy(this.oldUp);
    this.pivotXAxis.crossVectors(this.newUp, this.oldUp).normalize();
    this.pivotZAxis.crossVectors(this.pivotXAxis, this.pivotYAxis).normalize();
    const upRightPivotAngle = Math.PI / 2 - this.newUp.angleTo(this.pivotXAxis);
    const frontRightPivotAngle = Math.PI / 2 - this.newUp.angleTo(this.pivotZAxis);
    this.rotZ.setFromAxisAngle(this.pivotZAxis, upRightPivotAngle);
    this.rotX.setFromAxisAngle(this.pivotXAxis, frontRightPivotAngle);
    this._yAxisUpSpaceInverse.premultiply(this.rotZ).premultiply(this.rotX);
    this._yAxisUpSpace.copy(this._yAxisUpSpaceInverse).invert();
    this.oldUp.copy(this.newUp);
  }
}

CameraControls.install({ THREE: CAMERA_CONTROLS_THREE });

interface RenderBody {
  readonly body: Body;
  readonly object: Object3D;
}

interface PhysicsDebugBody {
  readonly body: Body;
  readonly object: Object3D;
}

interface KinematicBody {
  readonly body: Body;
  readonly object: Object3D;
  update(time: number, deltaTime: number): void;
}

interface StaticMeshOptions {
  readonly friction?: number;
  readonly shape?: ShapeInput;
}

interface VehicleVisual {
  readonly vehicle: Vehicle;
  readonly group: Group;
  readonly lastBodyControlPosition: Vector3;
  readonly lastBodyControlRotation: Vector3;
  readonly wheelVisuals: {
    readonly wheel: ShapeCastWheel;
    readonly xSign: 1 | -1;
    readonly zSign: 1 | -1;
    readonly pivot: Group;
    readonly suspension: Group;
    readonly spinner: Group;
    readonly debug: WheelDebugVisual;
  }[];
  readonly propellerVisuals: {
    readonly propeller: ThrustPropeller;
    readonly xSign: 1 | -1;
    readonly zSign: 1 | -1;
    readonly pivot: Group;
    readonly spinner: Group;
    readonly debug: PropellerDebugVisual;
    spinVelocity: number;
  }[];
}

type VehicleControllerName = Exclude<ActiveController, "character">;

interface VehicleAccessSensorBase {
  readonly name: VehicleControllerName;
  readonly label: string;
  readonly visual: VehicleVisual;
  readonly center: readonly [number, number, number];
}

interface CylinderVehicleAccessSensor extends VehicleAccessSensorBase {
  readonly kind: "cylinder";
  readonly halfHeight: number;
  readonly radius: number;
}

interface SphereVehicleAccessSensor extends VehicleAccessSensorBase {
  readonly kind: "sphere";
  readonly radius: number;
}

type VehicleAccessSensor = CylinderVehicleAccessSensor | SphereVehicleAccessSensor;

interface DemoVectorSnapshot {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface DemoQuaternionSnapshot extends DemoVectorSnapshot {
  readonly w: number;
}

interface DemoBodySnapshot {
  readonly position: DemoVectorSnapshot;
  readonly rotation: DemoQuaternionSnapshot;
  readonly linearVelocity: DemoVectorSnapshot;
  readonly angularVelocity: DemoVectorSnapshot;
  readonly mass: number;
  readonly gravityFactor: number;
  readonly active: boolean;
}

interface DemoControllerContactSnapshot {
  readonly isOnGround: boolean;
  readonly wasOnGround: boolean;
  readonly isFalling: boolean;
  readonly isOnPlatform: boolean;
  readonly jumpActive: boolean;
  readonly groundHitDistance: number;
  readonly groundFloatingDistance: number;
  readonly actualSlopeAngle: number;
  readonly standPoint: DemoVectorSnapshot;
  readonly standNormal: DemoVectorSnapshot;
  readonly standBodyType: string | null;
  readonly standBodyActive: boolean | null;
}

interface DemoGravitySnapshot {
  readonly enableCustomGravity: boolean;
  readonly gravityMag: number;
  readonly gravityDir: DemoVectorSnapshot;
  readonly upAxis: DemoVectorSnapshot;
}

interface DemoVehicleGravitySnapshots {
  readonly vehicle1: DemoGravitySnapshot;
  readonly vehicle2: DemoGravitySnapshot;
  readonly vehicle3: DemoGravitySnapshot;
}

interface DemoAnimationSnapshot {
  readonly enabled: boolean;
  readonly state: string | null;
  readonly activeAction: string | null;
  readonly previousAction: string | null;
  readonly canTransition: boolean | null;
  readonly mixerTimeScale: number | null;
  readonly activeActionTimeScale: number | null;
}

interface DemoPropellerSnapshot {
  readonly finalThrottle: number;
  readonly throttle: number;
  readonly maxThrust: number;
  readonly torqueRatio: number;
  readonly invertTorque: boolean;
  readonly position: DemoVectorSnapshot;
  readonly worldThrustDirection: DemoVectorSnapshot;
  readonly worldTorqueDirection: DemoVectorSnapshot;
}

interface DemoDebugSnapshot {
  readonly activeController: ActiveController;
  readonly nearestVehicleLabel: string | null;
  readonly worldGravity: DemoVectorSnapshot;
  readonly characterGravity: DemoGravitySnapshot;
  readonly vehicleGravity: DemoVehicleGravitySnapshots;
  readonly animation: DemoAnimationSnapshot;
  readonly droneControlMode: string;
  readonly droneInput: ReadonlyVehicleInput;
  readonly character: DemoBodySnapshot;
  readonly characterContact: DemoControllerContactSnapshot;
  readonly drone: DemoBodySnapshot;
  readonly droneUp: DemoVectorSnapshot;
  readonly droneForward: DemoVectorSnapshot;
  readonly propellers: readonly DemoPropellerSnapshot[];
}

interface DemoDebugApi {
  snapshot(): DemoDebugSnapshot;
}

declare global {
  interface Window {
    __characterControllerDemo?: DemoDebugApi;
  }
}

interface ControlUi {
  readonly prompt: HTMLDivElement;
  readonly promptText: HTMLSpanElement;
  readonly hints: HTMLDivElement;
  readonly keyElements: Map<string, HTMLElement[]>;
}

interface CharacterDebugVisual {
  readonly localGroup: Group;
  readonly worldGroup: Group;
  readonly forwardIndicator: Group;
  readonly moveIndicator: Group;
  readonly rayStart: Mesh;
  readonly rayEnd: Mesh;
  readonly rayTrigger: Mesh;
  readonly rayStable: Mesh;
  readonly standingPoint: Mesh;
  readonly velocityArrow: ArrowHelper;
}

interface WheelDebugVisual {
  readonly localGroup: Group;
  readonly worldGroup: Group;
  readonly shapeCastGroup: Group;
  readonly rayCastGroup: Group;
  readonly hitPoint: Mesh;
  readonly floatArrow: ArrowHelper;
  readonly driftArrow: ArrowHelper;
  readonly engineArrow: ArrowHelper;
}

interface PropellerDebugVisual {
  readonly localGroup: Group;
  readonly thrustArrow: ArrowHelper;
  readonly torqueArrow: ArrowHelper;
}

interface TouchInputState {
  readonly joystickL: { x: number; y: number };
  readonly joystickR: { x: number; y: number };
  readonly buttons: { b1: boolean; b2: boolean; b3: boolean; b4: boolean };
}

interface TouchControls {
  readonly root: HTMLDivElement;
  readonly rightJoystick: HTMLDivElement;
  readonly b1: HTMLDivElement;
  readonly b2: HTMLDivElement;
  readonly b3: HTMLDivElement;
  readonly b4: HTMLDivElement;
}

interface CharacterModel {
  readonly object: Object3D;
  readonly mixer: AnimationMixer | null;
  readonly actions: Map<string, AnimationAction>;
  animation: ThreeAnimationController | null;
}

interface AnimationFinishedEvent {
  readonly action: AnimationAction;
}

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app root");

const demoDebugElement = document.createElement("script");
demoDebugElement.id = "character-controller-demo-debug";
demoDebugElement.type = "application/json";
app.appendChild(demoDebugElement);

const coarsePointerMedia = window.matchMedia("(pointer: coarse)");
const controlUi = createOverlay(app);
const demoSettings = createDefaultDemoSettings();
applyInitialSettingsParams(demoSettings);

const scene = new Scene();
const physicsDebugGroup = new Group();
physicsDebugGroup.name = "PhysicsDebug";
physicsDebugGroup.visible = false;
scene.add(physicsDebugGroup);
const physicsDebugMaterial = new MeshBasicMaterial({
  color: 0x00ff80,
  wireframe: true,
  transparent: true,
  opacity: 0.45,
  depthTest: false
});

const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, -4);

const renderer = new WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFShadowMap;
app.appendChild(renderer.domElement);
const cameraControls = new CameraControlsImpl(camera, renderer.domElement);
cameraControls.minPolarAngle = 0.1;
cameraControls.maxPolarAngle = Math.PI - 0.1;
cameraControls.smoothTime = demoSettings.camera.smoothTime;

const stats = new Stats();
stats.dom.classList.add("performanceStats");
app.appendChild(stats.dom);
void stats.init(renderer);

const sun = new DirectionalLight(0xffffff, 2);
sun.position.set(0, 150, 0);
sun.castShadow = true;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 160;
sun.shadow.camera.left = -100;
sun.shadow.camera.right = 100;
sun.shadow.camera.top = 200;
sun.shadow.camera.bottom = -200;
sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);
scene.add(new HemisphereLight(0xffffff, 0xd9e7ff, 1.2));

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("/draco/");
const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);
const [testMapGltf, vehicleGltf, capsuleGltf, animationGltf] = await Promise.all([
  loader.loadAsync("/testMap.glb"),
  loader.loadAsync("/vehicles.glb"),
  loader.loadAsync("/capsule.glb"),
  loader.loadAsync("/AnimationLibrary.glb")
]);

const joltRuntime = await loadJolt({ build: "wasm" });
const world = await World.create({
  runtime: joltRuntime,
  gravity: demoSettings.world.physicsGravity,
  deterministic: "cross-platform"
});

const dynamicBodies: Body[] = [];
const renderBodies: RenderBody[] = [];
const instancedRenderBodies: { readonly body: Body; readonly mesh: InstancedMesh; readonly index: number }[] = [];
const instancedRenderMeshes: InstancedMesh[] = [];
const kinematicBodies: KinematicBody[] = [];
const physicsDebugBodies: PhysicsDebugBody[] = [];
const cameraCollisionMeshes: Object3D[] = [];
const mapGroup = new Group();
mapGroup.name = "TestMapGroup";
scene.add(mapGroup);

const testMapNodes = collectMeshes(testMapGltf);
const vehicleNodes = collectMeshes(vehicleGltf);
const mapMaterial = findMaterial(testMapGltf.scene, "GridTexture") ?? new MeshStandardMaterial({ color: 0xdde4ff });
mapMaterial.side = FrontSide;
const vehicleMaterial = findMaterial(vehicleGltf.scene, "GridTexture") ?? new MeshStandardMaterial({ color: 0xdde4ff });
vehicleMaterial.side = FrontSide;
const variantMaterials = ["#cce", "#dcf", "#bcc", "#bcf", "#fce", "#bbe"].map((color) => {
  const material = mapMaterial.clone();
  material.color = new Color(color);
  material.side = FrontSide;
  return material;
});

createTestMap();
updateCameraCollisionMeshes();

const characterRoot = new Group();
scene.add(characterRoot);
const characterModel = createCharacterModel(animationGltf, capsuleGltf);
const capsuleFallbackModel = createCapsuleModel(capsuleGltf);
characterRoot.add(characterModel.object);
characterRoot.add(capsuleFallbackModel);

const controller = new CharacterController({
  world,
  position: CHARACTER_START,
  density: 200,
  motionQuality: "linearCast",
  allowSleeping: demoSettings.character.canSleep,
  enableCustomGravity: demoSettings.character.enableCustomGravity,
  gravityField,
  useCustomForward: true,
  maxWalkVel: 1.1,
  maxRunVel: 5.5,
  moveImpulsePointOffset: 0,
  jumpVel: 6,
  slopeMaxAngle: 1,
  floatHeight: 0.3,
  rayOriginOffest: -0.35,
  rayHitForgiveness: 0.3,
  rayLength: 1.3,
  rayRadius: 0.15,
  springK: 6400,
  dampingC: 860,
  autoBalanceSpringK: 50,
  autoBalanceDampingC: 3,
  autoBalanceSpringOnY: 8,
  autoBalanceDampingOnY: 0.76,
  massRatioFallOffCurveData: demoSettings.character.massRatioFallOffCurveData
});
controller.body.userData = { controller: { excludeVehicleRay: true } };
registerPhysicsDebugBody(controller.body, Shape.capsule({
  halfHeight: controller.options.capsuleHalfHeight,
  radius: controller.options.capsuleRadius
}));
if (characterModel.mixer) {
  const animation = new ThreeAnimationController({
    stateController: createCharacterAnimationStateController(controller),
    actions: characterModel.actions,
    getTimeScale: () => demoSettings.world.slowMotion,
    autoplayInitialAction: false
  });
  characterModel.animation = animation;
  const handleAnimationFinished = (event: AnimationFinishedEvent): void => animation.notifyFinished(event.action);
  characterModel.mixer.addEventListener("finished", handleAnimationFinished);
}
const characterDebug = createCharacterDebug(controller);
characterRoot.add(characterDebug.localGroup);
scene.add(characterDebug.worldGroup);

const vehicle1 = createCarVehicle({
  name: "vehicle1",
  bodyMeshName: "VehicleBody1",
  bodyMeshPosition: [0, 0.1, 0],
  shape: Shape.compound([
    { shape: Shape.box({ halfExtents: [1, 0.4, 2.4], convexRadius: 0 }), position: [0, 0.1, 0] }
  ]),
  rearDriveTorqueWeight: 1
});
const vehicle2 = createCarVehicle({
  name: "vehicle2",
  bodyMeshName: "VehicleBody4",
  bodyMeshPosition: [0, -0.3, -0.7],
  shape: Shape.offsetCenterOfMass(
    Shape.compound([
      { shape: Shape.box({ halfExtents: [0.8, 0.17, 1], convexRadius: 0 }), position: [0, 0.5, -0.6] },
      { shape: Shape.box({ halfExtents: [1, 0.3, 2.4], convexRadius: 0 }) }
    ]),
    VEHICLE2_BODY_CENTER_OF_MASS
  ),
  massProperties: VEHICLE2_BODY_MASS_PROPERTIES,
  rearDriveTorqueWeight: 2
});
const vehicle3 = createDroneVehicle();
const vehicleVisuals = [vehicle1, vehicle2, vehicle3];
const vehicleAccessSensors: readonly VehicleAccessSensor[] = [
  {
    name: "vehicle1",
    label: "Vehicle 1",
    visual: vehicle1,
    kind: "cylinder",
    center: [0, 0.1, 0],
    halfHeight: 0.4,
    radius: 1.5
  },
  {
    name: "vehicle2",
    label: "Vehicle 2",
    visual: vehicle2,
    kind: "cylinder",
    center: [0, 0, 0],
    halfHeight: 0.3,
    radius: 1.5
  },
  {
    name: "vehicle3",
    label: "Drone",
    visual: vehicle3,
    kind: "sphere",
    center: [0, 0, 0],
    radius: 1
  }
];
const demoSettingsHandle = mountDemoSettings(app, demoSettings, {
  resetPlayer,
  cameraLock,
  firstPerson,
  toggleLockForward,
  flipVehicle1: () => flipVehicle(vehicle1.vehicle.body),
  flipVehicle2: () => flipVehicle(vehicle2.vehicle.body),
  flipVehicle3: () => flipVehicle(vehicle3.vehicle.body)
});

let activeController: ActiveController = "character";
const pressedKeyCodes = new Set<string>();
const keyState = {
  W: false,
  A: false,
  S: false,
  D: false,
  Space: false,
  Shift: false,
  Up: false,
  Down: false,
  Left: false,
  Right: false
};
const touchInput: TouchInputState = {
  joystickL: { x: 0, y: 0 },
  joystickR: { x: 0, y: 0 },
  buttons: { b1: false, b2: false, b3: false, b4: false }
};
const zeroJoystick = { x: 0, y: 0 };
const characterMovementInput: MovementInput = {
  forward: false,
  backward: false,
  leftward: false,
  rightward: false,
  joystick: touchInput.joystickL,
  run: false,
  jump: false
};
const characterIdleInput: MovementInput = {
  forward: false,
  backward: false,
  leftward: false,
  rightward: false,
  joystick: zeroJoystick,
  run: false,
  jump: false
};
const carMovementInput: VehicleInput = {
  forward: false,
  backward: false,
  steerLeft: false,
  steerRight: false,
  brake: false,
  joystickL: touchInput.joystickL
};
const carIdleInput: VehicleInput = {
  forward: false,
  backward: false,
  steerLeft: false,
  steerRight: false,
  brake: false,
  joystickL: zeroJoystick
};
const droneMovementInput: VehicleInput = {
  throttleUp: false,
  throttleDown: false,
  yawLeft: false,
  yawRight: false,
  pitchForward: false,
  pitchBackward: false,
  rollLeft: false,
  rollRight: false,
  joystickL: touchInput.joystickL,
  joystickR: touchInput.joystickR
};
const droneIdleInput: VehicleInput = {
  throttleUp: false,
  throttleDown: false,
  yawLeft: false,
  yawRight: false,
  pitchForward: false,
  pitchBackward: false,
  rollLeft: false,
  rollRight: false,
  joystickL: zeroJoystick,
  joystickR: zeroJoystick
};
let demoDebugFrameCounter = 0;

function installDemoDebugApi(): void {
  window.__characterControllerDemo = {
    snapshot: createDemoDebugSnapshot
  };
}

function updateDemoDebugElement(force = false): void {
  if (!force) {
    demoDebugFrameCounter = (demoDebugFrameCounter + 1) % DEMO_DEBUG_UPDATE_INTERVAL;
    if (demoDebugFrameCounter !== 0) return;
  }
  demoDebugElement.textContent = JSON.stringify(createDemoDebugSnapshot());
}

function createDemoDebugSnapshot(): DemoDebugSnapshot {
  return {
    activeController,
    nearestVehicleLabel: nearestVehicleLabel(),
    worldGravity: snapshotVector(world.gravity()),
    characterGravity: snapshotControllerGravity(),
    vehicleGravity: {
      vehicle1: snapshotVehicleGravity(vehicle1.vehicle),
      vehicle2: snapshotVehicleGravity(vehicle2.vehicle),
      vehicle3: snapshotVehicleGravity(vehicle3.vehicle)
    },
    animation: snapshotAnimation(),
    droneControlMode: vehicle3.vehicle.options.droneConfig.controlMode,
    droneInput: snapshotVehicleInput(vehicle3.vehicle.input),
    character: snapshotBody(controller.body),
    characterContact: snapshotControllerContact(),
    drone: snapshotBody(vehicle3.vehicle.body),
    droneUp: snapshotVector(vehicle3.vehicle.up),
    droneForward: snapshotVector(vehicle3.vehicle.bodyZ),
    propellers: vehicle3.vehicle.propellers.map((propeller) => ({
      finalThrottle: propeller.finalThrottle,
      throttle: propeller.throttle,
      maxThrust: propeller.options.maxThrust,
      torqueRatio: propeller.options.torqueRatio,
      invertTorque: propeller.options.invertTorque,
      position: snapshotVector(propeller.localPos),
      worldThrustDirection: snapshotVector(propeller.worldThrustDirection),
      worldTorqueDirection: snapshotVector(propeller.worldTorqueDirection)
    }))
  };
}

function snapshotControllerContact(): DemoControllerContactSnapshot {
  const controllerSnapshot = controller.snapshot();
  return {
    isOnGround: controllerSnapshot.isOnGround,
    wasOnGround: controllerSnapshot.wasOnGround,
    isFalling: controllerSnapshot.isFalling,
    isOnPlatform: controllerSnapshot.isOnPlatform,
    jumpActive: controllerSnapshot.jumpActive,
    groundHitDistance: controllerSnapshot.groundHitDistance,
    groundFloatingDistance: controllerSnapshot.groundFloatingDistance,
    actualSlopeAngle: controllerSnapshot.actualSlopeAngle,
    standPoint: snapshotVector(controllerSnapshot.standPoint),
    standNormal: snapshotVector(controllerSnapshot.standNormal),
    standBodyType: controllerSnapshot.standBody?.motionType() ?? null,
    standBodyActive: controllerSnapshot.standBody?.isActive() ?? null
  };
}

function snapshotBody(body: Body): DemoBodySnapshot {
  return {
    position: snapshotVector(body.translation()),
    rotation: snapshotQuaternion(body.rotation()),
    linearVelocity: snapshotVector(body.linearVelocity()),
    angularVelocity: snapshotVector(body.angularVelocity()),
    mass: body.mass(),
    gravityFactor: body.gravityFactor(),
    active: body.isActive()
  };
}

function snapshotControllerGravity(): DemoGravitySnapshot {
  const controllerSnapshot = controller.snapshot();
  return {
    enableCustomGravity: controller.options.enableCustomGravity,
    gravityMag: controllerSnapshot.gravityMag,
    gravityDir: snapshotVector(controllerSnapshot.gravityDir),
    upAxis: snapshotVector(controllerSnapshot.upAxis)
  };
}

function snapshotVehicleGravity(vehicle: Vehicle): DemoGravitySnapshot {
  const vehicleSnapshot = vehicle.snapshot();
  return {
    enableCustomGravity: vehicle.options.enableCustomGravity,
    gravityMag: vehicleSnapshot.gravityMag,
    gravityDir: snapshotVector(vehicleSnapshot.gravityDir),
    upAxis: snapshotVector(vehicleSnapshot.upAxis)
  };
}

function snapshotAnimation(): DemoAnimationSnapshot {
  const animation = characterModel.animation;
  const activeAction = animation?.active ?? null;
  return {
    enabled: demoSettings.character.animatedCharacter && !demoSettings.world.pausedPhysics && demoSettings.character.enable,
    state: animation?.stateController.state ?? null,
    activeAction: animation?.activeActionName ?? null,
    previousAction: animation?.previousClipName ?? null,
    canTransition: animation?.canTransition ?? null,
    mixerTimeScale: characterModel.mixer?.timeScale ?? null,
    activeActionTimeScale: activeAction?.timeScale ?? null
  };
}

function snapshotVector(vector: { readonly x: number; readonly y: number; readonly z: number }): DemoVectorSnapshot {
  return { x: vector.x, y: vector.y, z: vector.z };
}

function snapshotQuaternion(quaternion: { readonly x: number; readonly y: number; readonly z: number; readonly w: number }): DemoQuaternionSnapshot {
  return { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w };
}

function snapshotVehicleInput(input: ReadonlyVehicleInput): ReadonlyVehicleInput {
  return {
    forward: input.forward,
    backward: input.backward,
    steerLeft: input.steerLeft,
    steerRight: input.steerRight,
    brake: input.brake,
    throttleUp: input.throttleUp,
    throttleDown: input.throttleDown,
    yawLeft: input.yawLeft,
    yawRight: input.yawRight,
    pitchForward: input.pitchForward,
    pitchBackward: input.pitchBackward,
    rollLeft: input.rollLeft,
    rollRight: input.rollRight,
    joystickL: input.joystickL ? { x: input.joystickL.x, y: input.joystickL.y } : undefined,
    joystickR: input.joystickR ? { x: input.joystickR.x, y: input.joystickR.y } : undefined
  };
}

installDemoDebugApi();
updateDemoDebugElement(true);
const touchControls = createTouchControls(app, touchInput, () => activeController, toggleVehicleAccess);
let mapTime = 0;
let lastTime = performance.now();
let lastMixerTimeScale = -1;
let pressedKeyRevision = 0;
let renderedPressedKeyRevision = -1;

window.addEventListener("keydown", (event) => {
  const hadKey = pressedKeyCodes.has(event.code);
  pressedKeyCodes.add(event.code);
  if (!hadKey) pressedKeyRevision += 1;
  if (event.code === "KeyF" && !event.repeat) {
    toggleVehicleAccess();
    return;
  }
  setKey(event, true);
});
window.addEventListener("keyup", (event) => {
  if (pressedKeyCodes.delete(event.code)) pressedKeyRevision += 1;
  setKey(event, false);
});
window.addEventListener("blur", () => {
  if (pressedKeyCodes.size > 0) pressedKeyRevision += 1;
  pressedKeyCodes.clear();
  for (const key of Object.keys(keyState) as (keyof typeof keyState)[]) keyState[key] = false;
  resetTouchInput(touchInput);
});
window.addEventListener("resize", resize);
renderer.setAnimationLoop((now) => {
  const frameDelta = Math.min(0.1, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;
  const simulationDelta = demoSettings.world.pausedPhysics
    ? 0
    : clamp(frameDelta, 0, MAX_TIME_STEP) * Math.max(0, demoSettings.world.slowMotion);
  if (simulationDelta > 0) stepSimulation(simulationDelta);

  syncRender(simulationDelta, frameDelta);
  if (!demoSettings.world.pausedPhysics && demoSettings.character.enable && demoSettings.character.animatedCharacter) {
    const mixer = characterModel.mixer;
    if (mixer) {
      const mixerTimeScale = demoSettings.world.slowMotion;
      if (lastMixerTimeScale !== mixerTimeScale) {
        mixer.timeScale = mixerTimeScale;
        lastMixerTimeScale = mixerTimeScale;
      }
      mixer.update(frameDelta);
    }
  } else if (lastMixerTimeScale !== 0) {
    if (characterModel.mixer) characterModel.mixer.timeScale = 0;
    lastMixerTimeScale = 0;
  }
  renderer.render(scene, camera);
  stats.update();
});

function stepSimulation(deltaTime: number): void {
  applyLiveSettings();
  world.step(deltaTime);

  const cameraForward = CAMERA_FORWARD;
  camera.getWorldDirection(cameraForward);
  if (cameraForward.lengthSq() === 0) cameraForward.set(0, 0, 1);

  if (activeController === "character") {
    controller.setForwardDirection(
      demoSettings.character.useCameraForward ? cameraForward : controller.bodyZAxis,
      camera.up
    );
    characterMovementInput.forward = keyState.W || keyState.Up;
    characterMovementInput.backward = keyState.S || keyState.Down;
    characterMovementInput.leftward = keyState.A || keyState.Left;
    characterMovementInput.rightward = keyState.D || keyState.Right;
    characterMovementInput.run = keyState.Shift || touchInput.buttons.b1;
    characterMovementInput.jump = keyState.Space || touchInput.buttons.b2;
    controller.setMovement(characterMovementInput);
    controller.step(deltaTime);
  } else {
    controller.setMovement(characterIdleInput);
  }

  const carInput = updateCarInput();
  vehicle1.vehicle.setMovement(activeController === "vehicle1" ? carInput : carIdleInput);
  vehicle2.vehicle.setMovement(activeController === "vehicle2" ? carInput : carIdleInput);
  if (activeController === "character") {
    vehicle3.vehicle.setTarget(vehicle3.vehicle.currPos.lengthSq() === 0 ? VEHICLE3_IDLE_TARGET : vehicle3.vehicle.currPos, vehicle3.vehicle.bodyZ);
  }
  vehicle3.vehicle.setMovement(activeController === "vehicle3" ? updateDroneInput() : droneIdleInput);

  vehicle1.vehicle.step(deltaTime);
  vehicle2.vehicle.step(deltaTime);
  vehicle3.vehicle.step(deltaTime);

  mapTime += deltaTime;
  updateKinematics(mapTime, deltaTime);
  applyGravityToDynamics(deltaTime);
}

function syncRender(deltaTime: number, frameDelta: number): void {
  syncBodyObject(controller.body, characterRoot);
  characterRoot.visible = activeController === "character";
  characterModel.object.visible = demoSettings.character.animatedCharacter;
  capsuleFallbackModel.visible = !demoSettings.character.animatedCharacter;
  for (const renderBody of renderBodies) syncBodyObject(renderBody.body, renderBody.object);
  syncInstancedBodies();
  updatePhysicsDebug();
  for (const visual of vehicleVisuals) syncVehicleVisual(visual, deltaTime);
  updateCamera(frameDelta);
  updateAnimation();
  updateCharacterDebug(characterDebug);
  updateControlUi(controlUi);
  updateTouchControls(touchControls);
  updateDemoDebugElement();
}

function applyLiveSettings(): void {
  const [gravityX, gravityY, gravityZ] = demoSettings.world.physicsGravity;
  if (LAST_WORLD_GRAVITY.x !== gravityX || LAST_WORLD_GRAVITY.y !== gravityY || LAST_WORLD_GRAVITY.z !== gravityZ) {
    WORLD_GRAVITY_INPUT.x = gravityX;
    WORLD_GRAVITY_INPUT.y = gravityY;
    WORLD_GRAVITY_INPUT.z = gravityZ;
    world.setGravity(WORLD_GRAVITY_INPUT);
    LAST_WORLD_GRAVITY.set(gravityX, gravityY, gravityZ);
  }

  const character = demoSettings.character;
  const characterMassRatioCurveChanged = controller.options.massRatioFallOffCurveData !== character.massRatioFallOffCurveData;
  controller.options.enable = character.enable;
  controller.options.allowSleeping = character.canSleep;
  controller.options.capsuleHalfHeight = character.capsuleHalfHeight;
  controller.options.capsuleRadius = character.capsuleRadius;
  controller.options.useCustomForward = !character.useCameraForward;
  controller.options.useCharacterUpAxis = character.useCharacterUpForForward;
  controller.options.enableCustomGravity = character.enableCustomGravity;
  controller.options.gravityDirLerpSpeed = character.gravityDirLerpSpeed;
  controller.options.maxWalkVel = character.maxWalkVel;
  controller.options.maxRunVel = character.maxRunVel;
  controller.options.accDeltaTime = character.accDeltaTime;
  controller.options.decDeltaTime = character.decDeltaTime;
  controller.options.rejectVelFactor = character.rejectVelFactor;
  controller.options.moveImpulsePointOffset = character.moveImpulsePointOffset;
  controller.options.jumpVel = character.jumpVel;
  controller.options.jumpDuration = character.jumpDuration;
  controller.options.slopeJumpFactor = character.slopeJumpFactor;
  controller.options.airDragFactor = character.airDragFactor;
  controller.options.slideGripFactor = character.slideGripFactor;
  controller.options.platformGripFactor = character.platformGripFactor;
  controller.options.fallingGravityScale = character.fallingGravityScale;
  controller.options.fallingMaxVel = character.fallingMaxVel;
  controller.options.enableToggleRun = character.enableToggleRun;
  controller.options.groundDetection = character.groundDetection;
  controller.options.slopeMaxAngle = character.slopeMaxAngle;
  controller.options.floatHeight = character.floatHeight;
  controller.options.rayOriginOffest = character.rayOriginOffest;
  controller.options.rayHitForgiveness = character.rayHitForgiveness;
  controller.options.rayLength = character.rayLength;
  controller.options.rayRadius = character.rayRadius;
  controller.options.springK = character.springK;
  controller.options.dampingC = character.dampingC;
  controller.options.autoBalance = character.autoBalance;
  controller.options.autoBalanceSpringK = character.autoBalanceSpringK;
  controller.options.autoBalanceDampingC = character.autoBalanceDampingC;
  controller.options.autoBalanceSpringOnY = character.autoBalanceSpringOnY;
  controller.options.autoBalanceDampingOnY = character.autoBalanceDampingOnY;
  controller.options.followPlatform = character.followPlatform;
  controller.options.massRatioFallOffCurveData = character.massRatioFallOffCurveData;
  controller.options.applyCounterMass = character.applyCounterMass;
  controller.options.applyCounterJumpImp = character.applyCounterJumpImp;
  controller.options.counterJumpImpFactor = character.counterJumpImpFactor;
  controller.options.applyCounterMoveImp = character.applyCounterMoveImp;
  controller.options.counterMoveImpFactor = character.counterMoveImpFactor;
  if (characterMassRatioCurveChanged) controller.refreshMassRatioFallOffCurve();
  controller.body.setAllowSleeping(character.canSleep);
  applyCarVehicleSettings(vehicle1, demoSettings.vehicles.vehicle1);
  applyCarVehicleSettings(vehicle2, demoSettings.vehicles.vehicle2);
  applyDroneVehicleSettings(vehicle3, demoSettings.vehicles.vehicle3);
}

function applyVehicleBodySettings(visual: VehicleVisual, settings: VehicleSettings): void {
  visual.vehicle.options.enable = settings.enable;
  visual.vehicle.options.enableCustomGravity = settings.enableCustomGravity;
  visual.vehicle.options.gravityDirLerpSpeed = settings.gravityDirLerpSpeed;
  visual.vehicle.body.setAllowSleeping(settings.canSleep);
  applyVehicleBodyControlTransform(visual, settings);
}

function applyVehicleBodyControlTransform(visual: VehicleVisual, settings: VehicleSettings): void {
  const [px, py, pz] = settings.position;
  if (
    visual.lastBodyControlPosition.x !== px ||
    visual.lastBodyControlPosition.y !== py ||
    visual.lastBodyControlPosition.z !== pz
  ) {
    visual.vehicle.body.setTranslation(TEMP_VEC_A.set(px, py, pz), { activate: true });
    visual.lastBodyControlPosition.set(px, py, pz);
  }

  const [rx, ry, rz] = settings.rotation;
  if (
    visual.lastBodyControlRotation.x !== rx ||
    visual.lastBodyControlRotation.y !== ry ||
    visual.lastBodyControlRotation.z !== rz
  ) {
    TEMP_QUAT_A.setFromEuler(TEMP_EULER.set(rx, ry, rz));
    visual.vehicle.body.setRotation(quaternionTuple(TEMP_QUAT_A), { activate: true });
    visual.lastBodyControlRotation.set(rx, ry, rz);
  }
}

function applyCarVehicleSettings(visual: VehicleVisual, settings: VehicleSettings): void {
  applyVehicleBodySettings(visual, settings);
  const carCurvesChanged =
    visual.vehicle.options.carConfig.engineTorqueCurveData !== settings.car.engineTorqueCurveData ||
    visual.vehicle.options.carConfig.steerAngleCurveData !== settings.car.steerAngleCurveData;
  visual.vehicle.options.carConfig.engineHorsepower = settings.car.engineHorsepower;
  visual.vehicle.options.carConfig.engineMaxRPM = settings.car.engineMaxRPM;
  visual.vehicle.options.carConfig.finalDriveRatio = settings.car.finalDriveRatio;
  visual.vehicle.options.carConfig.transmissionMode = settings.car.transmissionMode;
  visual.vehicle.options.carConfig.shiftUpRPM = settings.car.shiftUpRPM;
  visual.vehicle.options.carConfig.shiftDownRPM = settings.car.shiftDownRPM;
  visual.vehicle.options.carConfig.shiftCooldown = settings.car.shiftCooldown;
  visual.vehicle.options.carConfig.steerRate = settings.car.steerRate;
  visual.vehicle.options.carConfig.maxSteerAngle = settings.car.maxSteerAngle;
  visual.vehicle.options.carConfig.reverseTorqueScale = settings.car.reverseTorqueScale;
  visual.vehicle.options.carConfig.reverseRPMScale = settings.car.reverseRPMScale;
  visual.vehicle.options.carConfig.engineTorqueCurveData = settings.car.engineTorqueCurveData;
  visual.vehicle.options.carConfig.steerAngleCurveData = settings.car.steerAngleCurveData;
  if (carCurvesChanged) visual.vehicle.refreshCarCurves();
  for (const wheelVisual of visual.wheelVisuals) {
    const wheelOffset = settings.wheel.offset;
    const wheelPosition = TEMP_VEC_A.set(
      wheelVisual.xSign * wheelOffset.x,
      wheelOffset.y,
      wheelVisual.zSign * wheelOffset.z
    );
    wheelVisual.wheel.setLocalPosition(wheelPosition);
    wheelVisual.pivot.position.copy(wheelPosition);
    const frontWheel = wheelVisual.zSign > 0;
    applyWheelSettings(wheelVisual.wheel, settings, frontWheel);
  }
}

function applyWheelSettings(wheel: ShapeCastWheel, settings: VehicleSettings, frontWheel: boolean): void {
  const wheelSettings = settings.wheel;
  const configChanged =
    wheel.options.rayShapeR !== wheelSettings.rayShapeR ||
    wheel.options.rayShapeH !== wheelSettings.rayShapeH ||
    wheel.options.wheelModelDensity !== wheelSettings.wheelModelDensity ||
    wheel.options.lngSlipRatioCurveData !== wheelSettings.lngSlipRatioCurveData ||
    wheel.options.latSlipRatioCurveData !== wheelSettings.latSlipRatioCurveData ||
    wheel.options.massRatioFallOffCurveData !== wheelSettings.massRatioFallOffCurveData;
  wheel.options.groundDetection = wheelSettings.groundDetection;
  wheel.options.rayShapeR = wheelSettings.rayShapeR;
  wheel.options.rayShapeH = wheelSettings.rayShapeH;
  wheel.options.rayLength = wheelSettings.rayLength;
  wheel.options.springK = wheelSettings.springK;
  wheel.options.dampingC = wheelSettings.dampingC;
  wheel.options.maxBrakeTorque = frontWheel ? wheelSettings.frontMaxBrakeTorque : wheelSettings.rearMaxBrakeTorque;
  wheel.options.rollingResistanceCoef = wheelSettings.rollingResistanceCoef;
  wheel.options.lowVelThreshold = wheelSettings.lowVelThreshold;
  wheel.options.tireGripFactor = wheelSettings.tireGripFactor;
  wheel.options.lngFrictionEllipseScale = wheelSettings.lngFrictionEllipseScale;
  wheel.options.latFrictionEllipseScale = wheelSettings.latFrictionEllipseScale;
  wheel.options.relaxLngRate = wheelSettings.relaxLngRate;
  wheel.options.relaxLatRate = wheelSettings.relaxLatRate;
  wheel.options.minLngRelaxCoeff = wheelSettings.minLngRelaxCoeff;
  wheel.options.minLatRelaxCoeff = wheelSettings.minLatRelaxCoeff;
  wheel.options.lngSlipRatioCurveData = wheelSettings.lngSlipRatioCurveData;
  wheel.options.latSlipRatioCurveData = wheelSettings.latSlipRatioCurveData;
  wheel.options.followPlatform = wheelSettings.followPlatform;
  wheel.options.massRatioFallOffCurveData = wheelSettings.massRatioFallOffCurveData;
  wheel.options.applyCounterMass = wheelSettings.applyCounterMass;
  wheel.options.applyCounterFriction = wheelSettings.applyCounterFriction;
  wheel.options.showWheelModel = wheelSettings.showWheelModel;
  wheel.options.wheelModelDensity = wheelSettings.wheelModelDensity;
  wheel.options.wheelModelUpdate = wheelSettings.wheelModelUpdate;
  wheel.options.wheelModelRadius = wheelSettings.wheelModelRadius;
  wheel.options.wheelModelLerpPosRate = wheelSettings.wheelModelLerpPosRate;
  wheel.options.wheelModelReversRotation = wheelSettings.wheelModelReversRotation;
  if (configChanged) wheel.refreshConfig();
}

function applyDroneVehicleSettings(visual: VehicleVisual, settings: VehicleSettings): void {
  applyVehicleBodySettings(visual, settings);
  visual.vehicle.options.droneConfig.controlMode = settings.drone.controlMode;
  visual.vehicle.options.droneConfig.maxYawRate = settings.drone.maxYawRate;
  visual.vehicle.options.droneConfig.maxHorizSpeed = settings.drone.maxHorizSpeed;
  visual.vehicle.options.droneConfig.maxVertSpeed = settings.drone.maxVertSpeed;
  visual.vehicle.options.droneConfig.maxTiltAngle = settings.drone.maxTiltAngle;
  visual.vehicle.options.droneConfig.airDragFactor = settings.drone.airDragFactor;
  visual.vehicle.options.droneConfig.TILT_P = settings.drone.TILT_P;
  visual.vehicle.options.droneConfig.TILT_D = settings.drone.TILT_D;
  visual.vehicle.options.droneConfig.YAW_POS_P = settings.drone.YAW_POS_P;
  visual.vehicle.options.droneConfig.YAW_VEL_P = settings.drone.YAW_VEL_P;
  visual.vehicle.options.droneConfig.VERT_POS_P = settings.drone.VERT_POS_P;
  visual.vehicle.options.droneConfig.VERT_POS_D = settings.drone.VERT_POS_D;
  visual.vehicle.options.droneConfig.HORIZ_POS_P = settings.drone.HORIZ_POS_P;
  visual.vehicle.options.droneConfig.HORIZ_POS_D = settings.drone.HORIZ_POS_D;
  visual.vehicle.options.droneConfig.HORIZ_VEL_P = settings.drone.HORIZ_VEL_P;
  visual.vehicle.options.droneConfig.VERT_VEL_P = settings.drone.VERT_VEL_P;
  for (const propellerVisual of visual.propellerVisuals) {
    const propellerOffset = settings.propeller.offset;
    const propellerPosition = TEMP_VEC_A.set(
      propellerVisual.xSign * propellerOffset.x,
      propellerOffset.y,
      propellerVisual.zSign * propellerOffset.z
    );
    propellerVisual.propeller.setLocalPosition(propellerPosition);
    propellerVisual.pivot.position.copy(propellerPosition);
    propellerVisual.propeller.options.maxThrust = settings.propeller.maxThrust;
    propellerVisual.propeller.options.torqueRatio = settings.propeller.torqueRatio;
  }
}

function updateCameraCollisionMeshes(): void {
  cameraCollisionMeshes.length = 0;
  mapGroup.traverse((object) => {
    if (object instanceof Mesh && !(object instanceof InstancedMesh) && object.name !== "logo") {
      cameraCollisionMeshes.push(object);
    }
  });
  cameraControls.colliderMeshes = cameraCollisionMeshes;
}

function createTestMap(): void {
  addStaticBox("BaseFloor", [0, -1, 0], [80, 1, 110], variantMaterials[0]);
  addStaticCylinderVisual("R80Disk", [0, 101, 110], variantMaterials[0], Shape.cylinder({ halfHeight: 1, radius: 80 }));
  createDebugBody({ type: "static", shape: Shape.cylinder({ halfHeight: 1, radius: 80 }), position: [0, -1, 110] });
  createDebugBody({ type: "static", shape: Shape.cylinder({ halfHeight: 1, radius: 80 }), position: [0, -1, -110] });
  createDebugBody({ type: "static", shape: Shape.cylinder({ halfHeight: 1, radius: 80 }), position: [0, 101, 110] });

  addStaticMesh("Box24X24", [-35, 0, -75], undefined, variantMaterials[2], { friction: 0, shape: cuboidShape("Box24X24") });
  addStaticMesh("Box24X24", [-35, 0, -105], undefined, variantMaterials[3], { friction: -0.4, shape: cuboidShape("Box24X24") });
  for (const [name, position] of [
    ["Ramp10", [35, 0, -75]],
    ["Ramp20", [35, 0, -85]],
    ["Ramp30", [35, 0, -95]],
    ["Ramp45", [35, 0, -105]]
  ] as const) {
    addStaticMesh(name, position, undefined, variantMaterials[1], { shape: convexHullShape(name) });
  }
  addStaticMesh("Track", [0, 0, 0], undefined, variantMaterials[1]);
  addStaticMesh("RampJump", [-25, 0, 0], undefined, variantMaterials[1]);
  addStaticMesh("RampJump", [25, 0, 0], [0, Math.PI, 0], variantMaterials[1]);
  addStaticMesh("RampU", [0, 0, -135], undefined, variantMaterials[1]);
  addStaticMesh("Pillar10X100", [0, 50, 110], undefined, variantMaterials[0]);

  createStaticInstances("Trip05X4", createInstanceStack({ pos: [-26, 0, -27], rotation: [0, Math.PI / 2, 0], rows: 2, startCount: 11, countStep: 0, rowStep: [-1, 0, 4], itemStep: [-2, 0, 0] }), variantMaterials[1], { shape: convexHullShape("Trip05X4") });
  createStaticInstances("Box05X8", createInstanceStack({ pos: [-26, 0, -35], rotation: [0, Math.PI / 2, 0], rows: 1, startCount: 11, countStep: 0, rowStep: [0, 0, 0], itemStep: [-2, 0, 0] }), variantMaterials[1], { shape: cuboidShape("Box05X8") });
  createStaticInstances("Box05X8", createInstanceStack({ pos: [-26, 0, -45], rotation: [Math.PI / 2, Math.PI / 4, Math.PI / 2], rows: 1, startCount: 11, countStep: 0, rowStep: [0, 0, 0], itemStep: [-2, 0, 0] }), variantMaterials[1], { shape: cuboidShape("Box05X8") });
  createStaticInstances("HalfCylinder03X8", createInstanceStack({ pos: [-26, 0, -55], rotation: [0, Math.PI / 2, 0], rows: 1, startCount: 11, countStep: 0, rowStep: [0, 0, 0], itemStep: [-2, 0, 0] }), variantMaterials[1], { shape: convexHullShape("HalfCylinder03X8") });

  addKinematicMapBody("Box10X10", cuboidShape("Box10X10"), variantMaterials[1], (body, time, deltaTime) => {
    const t = time / 4;
    const s = 0.5 * Math.sin(t) + 0.5;
    const z = 30 * Math.pow(s, 15) * (16 - 15 * s) - 55;
    const n = 0.5 * Math.sin(t - 3) + 0.5;
    const y = 10 * Math.pow(n, 15) * (16 - 15 * n);
    moveKinematicBody(body, 45, y, z, IDENTITY_QUATERNION, deltaTime);
  });
  addKinematicMapBody("Box10X10", cuboidShape("Box10X10"), variantMaterials[1], (body, time, deltaTime) => {
    KINEMATIC_QUATERNION.setFromAxisAngle(FIXED_Y, time * 0.2);
    moveKinematicBody(body, 25, 0, 15 * (Math.sin(-time / 4) + 1) - 55, KINEMATIC_QUATERNION, deltaTime);
  });
  addKinematicMapBody("Cylinder5X40", Shape.compound([
    { shape: Shape.cylinder({ halfHeight: 20, radius: 5 }), rotation: quaternionTuple(new Quaternion().setFromEuler(new Euler(Math.PI / 2, 0, 0))) }
  ]), variantMaterials[1], (body, time, deltaTime) => {
    KINEMATIC_QUATERNION.setFromAxisAngle(FIXED_Z, time * 0.2);
    moveKinematicBody(body, 35, -4, -40, KINEMATIC_QUATERNION, deltaTime);
  }, [35, -4, -40]);
  addKinematicMapBody("R10Ball", Shape.sphere(10), variantMaterials[1], (body, time, deltaTime) => {
    KINEMATIC_QUATERNION.setFromAxisAngle(FIXED_Y, time * -0.2);
    moveKinematicBody(body, 0, 20, 0, KINEMATIC_QUATERNION, deltaTime);
  }, [0, 20, 0], (object) => {
    const logo = cloneNodeMesh("Logo", variantMaterials[5]);
    logo.name = "logo";
    object.add(logo);
  });
  addKinematicMapBody("CircleStair", Shape.compound([
    { shape: geometryShape("CircleStair") },
    { shape: geometryShape("CircleSlope"), position: [0, 11.5, 0], rotation: quaternionTuple(new Quaternion().setFromEuler(new Euler(Math.PI, 0, 0))) }
  ]), variantMaterials[1], (body, time, deltaTime) => {
    KINEMATIC_QUATERNION.setFromAxisAngle(FIXED_Y, time * -0.2);
    moveKinematicBody(body, 0, 0, 0, KINEMATIC_QUATERNION, deltaTime);
  }, [0, 0, 0], (object) => {
    const slope = cloneNodeMesh("CircleSlope", variantMaterials[1]);
    slope.position.set(0, 11.5, 0);
    slope.rotation.x = Math.PI;
    object.add(slope);
  });
  addKinematicMapBody("PillarJumps", geometryShape("PillarJumps"), variantMaterials[1], (body, time, deltaTime) => {
    KINEMATIC_QUATERNION.setFromAxisAngle(FIXED_Y, time * 0.2);
    moveKinematicBody(body, 0, 50, 110, KINEMATIC_QUATERNION, deltaTime);
  }, [0, 50, 110]);

  const seesaw = new Group();
  seesaw.add(cloneNodeMesh("Seesaw", variantMaterials[4]));
  mapGroup.add(seesaw);
  const seesawQuat = new Quaternion().setFromEuler(new Euler(0, 0, 8 * Math.PI / 180));
  const seesawBody = createDebugBody({
    type: "dynamic",
    shape: Shape.compound([
      { shape: Shape.box({ halfExtents: [20, 0.25, 5], convexRadius: 0 }), position: [0, 3.25, 0] },
      { shape: Shape.cylinder({ halfHeight: 5, radius: 1.5 }), position: [0, 1.5, 0], rotation: quaternionTuple(new Quaternion().setFromEuler(new Euler(Math.PI / 2, 0, 0))) }
    ]),
    position: [0, 0, 145],
    rotation: quaternionTuple(seesawQuat),
    density: 200
  });
  dynamicBodies.push(seesawBody);
  renderBodies.push({ body: seesawBody, object: seesaw });

  createDynamicInstances("Box1X1", createInstanceStack({ pos: [-35.5, 0.5, 110], rows: 7, startCount: 7, countStep: -1, rowStep: [-0.75, 1, 0], itemStep: [-1.5, 0, 0] }), Shape.box({ halfExtents: [0.5, 0.5, 0.5], convexRadius: 0 }));
  createDynamicInstances("R1Ball", createInstanceStack({ pos: [40, 1, 110], rows: 5, startCount: 1, countStep: 1, rowStep: [-1.05, 0, 1.8], itemStep: [2.1, 0, 0] }), Shape.sphere(1));
  createDynamicInstances("Box4X6", createInstanceStack({ pos: [-40, 3, 115], rows: 1, startCount: 6, countStep: 0, rowStep: [0, 0, 0], itemStep: [0, 0, 3] }), Shape.box({ halfExtents: [2, 3, 2], convexRadius: 0 }));
}

function createCarVehicle(config: {
  name: string;
  bodyMeshName: string;
  bodyMeshPosition: readonly [number, number, number];
  shape: ShapeInput;
  massProperties?: MassPropertiesInput;
  rearDriveTorqueWeight: number;
}): VehicleVisual {
  const vehicleSettings = config.name === "vehicle1" ? demoSettings.vehicles.vehicle1 : demoSettings.vehicles.vehicle2;
  const vehicleRotation = new Quaternion().setFromEuler(new Euler(...vehicleSettings.rotation));
  const vehicle = new Vehicle({
    world,
    shape: config.shape,
    position: vehicleSettings.position,
    rotation: quaternionTuple(vehicleRotation),
    ...(config.massProperties === undefined ? { density: 200 } : { massProperties: config.massProperties }),
    allowSleeping: vehicleSettings.canSleep,
    enableCustomGravity: vehicleSettings.enableCustomGravity,
    gravityDirLerpSpeed: vehicleSettings.gravityDirLerpSpeed,
    gravityField,
    carConfig: {
      ...vehicleSettings.car
    },
    userData: { controller: { excludeCharacterRay: true } }
  });
  registerPhysicsDebugBody(vehicle.body, config.shape);
  const group = new Group();
  group.name = config.name;
  const bodyMesh = cloneVehicleMesh(config.bodyMeshName);
  bodyMesh.position.fromArray(config.bodyMeshPosition);
  group.add(bodyMesh);
  scene.add(group);

  const wheelVisuals: VehicleVisual["wheelVisuals"] = [];
  const wheelOffset = vehicleSettings.wheel.offset;
  for (const xSign of [1, -1] as const) {
    const x = xSign * wheelOffset.x;
    const frontWheel = vehicle.addWheel({
      position: [x, wheelOffset.y, wheelOffset.z],
      steerWheel: true,
      brakeWheel: true,
      driveWheel: true,
      groundDetection: vehicleSettings.wheel.groundDetection,
      rayShapeR: vehicleSettings.wheel.rayShapeR,
      rayShapeH: vehicleSettings.wheel.rayShapeH,
      rayLength: vehicleSettings.wheel.rayLength,
      springK: vehicleSettings.wheel.springK,
      dampingC: vehicleSettings.wheel.dampingC,
      maxBrakeTorque: vehicleSettings.wheel.frontMaxBrakeTorque,
      rollingResistanceCoef: vehicleSettings.wheel.rollingResistanceCoef,
      lowVelThreshold: vehicleSettings.wheel.lowVelThreshold,
      tireGripFactor: vehicleSettings.wheel.tireGripFactor,
      lngFrictionEllipseScale: vehicleSettings.wheel.lngFrictionEllipseScale,
      latFrictionEllipseScale: vehicleSettings.wheel.latFrictionEllipseScale,
      relaxLngRate: vehicleSettings.wheel.relaxLngRate,
      relaxLatRate: vehicleSettings.wheel.relaxLatRate,
      minLngRelaxCoeff: vehicleSettings.wheel.minLngRelaxCoeff,
      minLatRelaxCoeff: vehicleSettings.wheel.minLatRelaxCoeff,
      lngSlipRatioCurveData: vehicleSettings.wheel.lngSlipRatioCurveData,
      latSlipRatioCurveData: vehicleSettings.wheel.latSlipRatioCurveData,
      followPlatform: vehicleSettings.wheel.followPlatform,
      massRatioFallOffCurveData: vehicleSettings.wheel.massRatioFallOffCurveData,
      applyCounterMass: vehicleSettings.wheel.applyCounterMass,
      applyCounterFriction: vehicleSettings.wheel.applyCounterFriction,
      showWheelModel: vehicleSettings.wheel.showWheelModel,
      wheelModelDensity: vehicleSettings.wheel.wheelModelDensity,
      wheelModelUpdate: vehicleSettings.wheel.wheelModelUpdate,
      wheelModelRadius: vehicleSettings.wheel.wheelModelRadius,
      wheelModelLerpPosRate: vehicleSettings.wheel.wheelModelLerpPosRate,
      wheelModelReversRotation: vehicleSettings.wheel.wheelModelReversRotation
    });
    wheelVisuals.push(addWheelVisual(group, frontWheel, [x, wheelOffset.y, wheelOffset.z], xSign, 1));
    const rearWheel = vehicle.addWheel({
      position: [x, wheelOffset.y, -wheelOffset.z],
      brakeWheel: true,
      driveWheel: true,
      driveTorqueWeight: config.rearDriveTorqueWeight,
      groundDetection: vehicleSettings.wheel.groundDetection,
      rayShapeR: vehicleSettings.wheel.rayShapeR,
      rayShapeH: vehicleSettings.wheel.rayShapeH,
      rayLength: vehicleSettings.wheel.rayLength,
      springK: vehicleSettings.wheel.springK,
      dampingC: vehicleSettings.wheel.dampingC,
      maxBrakeTorque: vehicleSettings.wheel.rearMaxBrakeTorque,
      rollingResistanceCoef: vehicleSettings.wheel.rollingResistanceCoef,
      lowVelThreshold: vehicleSettings.wheel.lowVelThreshold,
      tireGripFactor: vehicleSettings.wheel.tireGripFactor,
      lngFrictionEllipseScale: vehicleSettings.wheel.lngFrictionEllipseScale,
      latFrictionEllipseScale: vehicleSettings.wheel.latFrictionEllipseScale,
      relaxLngRate: vehicleSettings.wheel.relaxLngRate,
      relaxLatRate: vehicleSettings.wheel.relaxLatRate,
      minLngRelaxCoeff: vehicleSettings.wheel.minLngRelaxCoeff,
      minLatRelaxCoeff: vehicleSettings.wheel.minLatRelaxCoeff,
      lngSlipRatioCurveData: vehicleSettings.wheel.lngSlipRatioCurveData,
      latSlipRatioCurveData: vehicleSettings.wheel.latSlipRatioCurveData,
      followPlatform: vehicleSettings.wheel.followPlatform,
      massRatioFallOffCurveData: vehicleSettings.wheel.massRatioFallOffCurveData,
      applyCounterMass: vehicleSettings.wheel.applyCounterMass,
      applyCounterFriction: vehicleSettings.wheel.applyCounterFriction,
      showWheelModel: vehicleSettings.wheel.showWheelModel,
      wheelModelDensity: vehicleSettings.wheel.wheelModelDensity,
      wheelModelUpdate: vehicleSettings.wheel.wheelModelUpdate,
      wheelModelRadius: vehicleSettings.wheel.wheelModelRadius,
      wheelModelLerpPosRate: vehicleSettings.wheel.wheelModelLerpPosRate,
      wheelModelReversRotation: vehicleSettings.wheel.wheelModelReversRotation
    });
    wheelVisuals.push(addWheelVisual(group, rearWheel, [x, wheelOffset.y, -wheelOffset.z], xSign, -1));
  }

  return {
    vehicle,
    group,
    lastBodyControlPosition: new Vector3(...vehicleSettings.position),
    lastBodyControlRotation: new Vector3(...vehicleSettings.rotation),
    wheelVisuals,
    propellerVisuals: []
  };
}

function createDroneVehicle(): VehicleVisual {
  const rotation = new Quaternion().setFromEuler(new Euler(0, Math.PI, 0));
  const bodyShape = Shape.compound([
    { shape: Shape.box({ halfExtents: [0.4, 0.2, 1.5], convexRadius: 0 }) },
    { shape: Shape.cylinder({ halfHeight: 0.05, radius: 0.65 }), position: [1, -0.15, 1] },
    { shape: Shape.cylinder({ halfHeight: 0.05, radius: 0.65 }), position: [1, -0.15, -1] },
    { shape: Shape.cylinder({ halfHeight: 0.05, radius: 0.65 }), position: [-1, -0.15, 1] },
    { shape: Shape.cylinder({ halfHeight: 0.05, radius: 0.65 }), position: [-1, -0.15, -1] }
  ]);
  const vehicle = new Vehicle({
    world,
    shape: bodyShape,
    position: demoSettings.vehicles.vehicle3.position,
    rotation: quaternionTuple(rotation.setFromEuler(new Euler(...demoSettings.vehicles.vehicle3.rotation))),
    density: 200,
    allowSleeping: demoSettings.vehicles.vehicle3.canSleep,
    enableCustomGravity: demoSettings.vehicles.vehicle3.enableCustomGravity,
    gravityDirLerpSpeed: demoSettings.vehicles.vehicle3.gravityDirLerpSpeed,
    gravityField,
    droneConfig: {
      ...demoSettings.vehicles.vehicle3.drone
    },
    userData: { controller: { excludeCharacterRay: true } }
  });
  registerPhysicsDebugBody(vehicle.body, bodyShape);
  vehicle.setTarget(VEHICLE3_IDLE_TARGET, FIXED_Z);

  const group = new Group();
  group.name = "vehicle3";
  const bodyMesh = cloneVehicleMesh("VehicleBody3");
  group.add(bodyMesh);
  scene.add(group);

  const propellerVisuals: VehicleVisual["propellerVisuals"] = [];
  const propellerOffset = demoSettings.vehicles.vehicle3.propeller.offset;
  for (const [xSign, zSign, invertTorque] of [
    [1, 1, true],
    [-1, 1, false],
    [1, -1, false],
    [-1, -1, true]
  ] as const) {
    const x = xSign * propellerOffset.x;
    const z = zSign * propellerOffset.z;
    const propeller = vehicle.addPropeller({
      position: [x, propellerOffset.y, z],
      maxThrust: demoSettings.vehicles.vehicle3.propeller.maxThrust,
      torqueRatio: demoSettings.vehicles.vehicle3.propeller.torqueRatio,
      invertTorque
    });
    propellerVisuals.push(addPropellerVisual(group, propeller, [x, propellerOffset.y, z], xSign, zSign));
  }

  return {
    vehicle,
    group,
    lastBodyControlPosition: new Vector3(...demoSettings.vehicles.vehicle3.position),
    lastBodyControlRotation: new Vector3(...demoSettings.vehicles.vehicle3.rotation),
    wheelVisuals: [],
    propellerVisuals
  };
}

function addStaticBox(meshName: string, position: readonly [number, number, number], halfExtents: readonly [number, number, number], material: MeshStandardMaterial): void {
  const mesh = cloneNodeMesh(meshName, material);
  mesh.position.fromArray(position);
  freezeStaticObject(mesh);
  mapGroup.add(mesh);
  createDebugBody({
    type: "static",
    shape: Shape.box({ halfExtents, convexRadius: 0 }),
    position
  });
}

function addStaticCylinderVisual(meshName: string, position: readonly [number, number, number], material: MeshStandardMaterial, shape: ShapeInput): void {
  const mesh = cloneNodeMesh(meshName, material);
  mesh.position.fromArray(position);
  freezeStaticObject(mesh);
  mapGroup.add(mesh);
  createDebugBody({
    type: "static",
    shape,
    position
  });
}

function addStaticMesh(
  meshName: string,
  position: readonly [number, number, number],
  rotation: readonly [number, number, number] | undefined,
  material: MeshStandardMaterial,
  options: StaticMeshOptions = {}
): void {
  const mesh = cloneNodeMesh(meshName, material);
  mesh.position.fromArray(position);
  if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  freezeStaticObject(mesh);
  mapGroup.add(mesh);
  const rotationQuaternion = rotation
    ? TEMP_QUAT_A.setFromEuler(TEMP_EULER.set(rotation[0], rotation[1], rotation[2]))
    : undefined;
  createDebugBody({
    type: "static",
    shape: options.shape ?? geometryShape(meshName),
    position,
    rotation: rotationQuaternion ? quaternionTuple(rotationQuaternion) : undefined,
    friction: options.friction
  });
}

function createStaticInstances(
  meshName: string,
  instances: { position: [number, number, number]; rotation: [number, number, number] }[],
  material: MeshStandardMaterial,
  options: StaticMeshOptions = {}
): void {
  const source = getMesh(testMapNodes, meshName);
  const instanced = new InstancedMesh(source.geometry, material, instances.length);
  instanced.name = meshName;
  instanced.castShadow = true;
  instanced.receiveShadow = true;
  instanced.matrixAutoUpdate = false;
  mapGroup.add(instanced);

  const shape = options.shape ?? geometryShape(meshName);
  for (let index = 0; index < instances.length; index += 1) {
    const instance = instances[index];
    INSTANCE_POSITION.fromArray(instance.position);
    INSTANCE_QUATERNION.setFromEuler(TEMP_EULER.set(instance.rotation[0], instance.rotation[1], instance.rotation[2]));
    INSTANCE_MATRIX.compose(INSTANCE_POSITION, INSTANCE_QUATERNION, INSTANCE_SCALE);
    instanced.setMatrixAt(index, INSTANCE_MATRIX);
    createDebugBody({
      type: "static",
      shape,
      position: instance.position,
      rotation: quaternionTuple(INSTANCE_QUATERNION),
      friction: options.friction
    });
  }
  instanced.instanceMatrix.needsUpdate = true;
  instanced.computeBoundingBox();
  instanced.computeBoundingSphere();
}

function addKinematicMapBody(
  meshName: string,
  shape: ShapeInput,
  material: MeshStandardMaterial,
  update: (body: Body, time: number, deltaTime: number) => void,
  initialPosition: readonly [number, number, number] = [0, 0, 0],
  customize?: (object: Object3D) => void
): void {
  const object = new Group();
  object.add(cloneNodeMesh(meshName, material));
  object.position.fromArray(initialPosition);
  customize?.(object);
  mapGroup.add(object);
  const body = createDebugBody({
    type: "kinematic",
    shape,
    position: initialPosition
  });
  kinematicBodies.push({
    body,
    object,
    update(time, deltaTime) {
      update(body, time, deltaTime);
      syncBodyObject(body, object);
    }
  });
}

function createDynamicInstances(meshName: string, instances: { position: [number, number, number]; rotation: [number, number, number] }[], shape: ShapeInput): void {
  const source = getMesh(testMapNodes, meshName);
  const material = variantMaterials[4];
  const instanced = new InstancedMesh(source.geometry, material, instances.length);
  instanced.castShadow = true;
  instanced.receiveShadow = true;
  instanced.frustumCulled = false;
  mapGroup.add(instanced);
  instancedRenderMeshes.push(instanced);
  instances.forEach((instance, index) => {
    INSTANCE_POSITION.fromArray(instance.position);
    INSTANCE_QUATERNION.setFromEuler(TEMP_EULER.set(instance.rotation[0], instance.rotation[1], instance.rotation[2]));
    INSTANCE_MATRIX.compose(INSTANCE_POSITION, INSTANCE_QUATERNION, INSTANCE_SCALE);
    instanced.setMatrixAt(index, INSTANCE_MATRIX);
    const body = createDebugBody({
      type: "dynamic",
      shape,
      position: instance.position,
      rotation: quaternionTuple(INSTANCE_QUATERNION),
      density: 200
    });
    dynamicBodies.push(body);
    instancedRenderBodies.push({ body, mesh: instanced, index });
  });
  instanced.instanceMatrix.needsUpdate = true;
}

function createDebugBody(options: CreateBodyOptions): Body {
  const body = world.createBody(options.friction === undefined
    ? { ...options, friction: RAPIER_DEFAULT_COLLIDER_FRICTION }
    : options);
  registerPhysicsDebugBody(body, options.shape);
  return body;
}

function registerPhysicsDebugBody(body: Body, shape: ShapeInput): void {
  const object = createPhysicsDebugShape(shape);
  physicsDebugGroup.add(object);
  physicsDebugBodies.push({ body, object });
}

function updatePhysicsDebug(): void {
  physicsDebugGroup.visible = demoSettings.world.physicsDebug;
  if (!physicsDebugGroup.visible) return;
  for (const debugBody of physicsDebugBodies) syncBodyObject(debugBody.body, debugBody.object);
}

function createPhysicsDebugShape(shape: ShapeInput): Object3D {
  if (!isShapeDescriptor(shape)) return new Group();

  switch (shape.kind) {
    case "sphere":
      return physicsDebugMesh(new SphereGeometry(shape.radius, 16, 8));

    case "box": {
      const halfExtents = vectorInputToVector(shape.halfExtents, TEMP_VEC_A);
      return physicsDebugMesh(new BoxGeometry(halfExtents.x * 2, halfExtents.y * 2, halfExtents.z * 2));
    }

    case "capsule":
      return physicsDebugMesh(new CapsuleGeometry(shape.radius, shape.halfHeight * 2, 8, 12));

    case "cylinder":
      return physicsDebugMesh(new CylinderGeometry(shape.radius, shape.radius, shape.halfHeight * 2, 20, 1));

    case "mesh":
      return physicsDebugMesh(debugGeometryFromMeshShape(shape.vertices, shape.indices));

    case "compound": {
      const group = new Group();
      for (const child of shape.children) {
        const childObject = createPhysicsDebugShape(child.shape);
        if (child.position) childObject.position.copy(vectorInputToVector(child.position));
        if (child.rotation) childObject.quaternion.copy(quaternionInputToQuaternion(child.rotation));
        group.add(childObject);
      }
      return group;
    }

    case "convexHull":
      return physicsDebugMesh(debugGeometryFromPoints(shape.points));

    case "offsetCenterOfMass":
      return createPhysicsDebugShape(shape.shape);
  }
}

function physicsDebugMesh(geometry: BufferGeometry): Mesh<BufferGeometry, MeshBasicMaterial> {
  const mesh = new Mesh(geometry, physicsDebugMaterial);
  mesh.renderOrder = 10;
  return mesh;
}

function debugGeometryFromMeshShape(
  verticesInput: Float32Array | Float64Array | ReadonlyArray<number>,
  indicesInput: Uint16Array | Uint32Array | ReadonlyArray<number>
): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(verticesInput), 3));
  geometry.setIndex(new BufferAttribute(new Uint32Array(indicesInput), 1));
  return geometry;
}

function debugGeometryFromPoints(points: readonly Vector3Input[] | Float32Array | Float64Array): BufferGeometry {
  const vertices = ArrayBuffer.isView(points)
    ? new Float32Array(points)
    : new Float32Array(points.length * 3);
  if (!ArrayBuffer.isView(points)) {
    points.forEach((point, index) => {
      const vector = vectorInputToVector(point, TEMP_VEC_A);
      vertices[index * 3] = vector.x;
      vertices[index * 3 + 1] = vector.y;
      vertices[index * 3 + 2] = vector.z;
    });
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(vertices, 3));
  return geometry;
}

function isShapeDescriptor(shape: ShapeInput): shape is ShapeDescriptor {
  return typeof shape === "object" && shape !== null && "kind" in shape;
}

function addWheelVisual(
  group: Group,
  wheel: ShapeCastWheel,
  position: readonly [number, number, number],
  xSign: 1 | -1,
  zSign: 1 | -1
): VehicleVisual["wheelVisuals"][number] {
  const pivot = new Group();
  pivot.position.fromArray(position);
  const suspension = new Group();
  const spinner = new Group();
  const mesh = cloneVehicleMesh("R05Wheel");
  mesh.rotation.z = Math.PI / 2;
  spinner.add(mesh);
  suspension.add(spinner);
  pivot.add(suspension);
  const debug = createWheelDebug(wheel);
  pivot.add(debug.localGroup);
  scene.add(debug.worldGroup);
  group.add(pivot);
  return { wheel, xSign, zSign, pivot, suspension, spinner, debug };
}

function addPropellerVisual(
  group: Group,
  propeller: ThrustPropeller,
  position: readonly [number, number, number],
  xSign: 1 | -1,
  zSign: 1 | -1
): VehicleVisual["propellerVisuals"][number] {
  const pivot = new Group();
  pivot.position.fromArray(position);
  const spinner = new Group();
  const mesh = cloneVehicleMesh("R065Propeller");
  spinner.add(mesh);
  pivot.add(spinner);
  const debug = createPropellerDebug(propeller);
  pivot.add(debug.localGroup);
  group.add(pivot);
  return { propeller, xSign, zSign, pivot, spinner, debug, spinVelocity: 0 };
}

function syncVehicleVisual(visual: VehicleVisual, deltaTime: number): void {
  syncBodyObject(visual.vehicle.body, visual.group);
  const settings = settingsForVehicle(visual.group.name);
  visual.group.visible = settings.enable;
  for (const wheelVisual of visual.wheelVisuals) {
    const wheelOptions = wheelVisual.wheel.options;
    const hasContact = Boolean(wheelVisual.wheel.hitBody);
    const offsetY = hasContact
      ? -(wheelOptions.rayLength + wheelOptions.rayShapeR) + wheelOptions.wheelModelRadius + (wheelOptions.rayLength - wheelVisual.wheel.suspensionDistance)
      : -(wheelOptions.rayLength + wheelOptions.rayShapeR) + wheelOptions.wheelModelRadius;
    wheelVisual.pivot.rotation.y = wheelVisual.wheel.steerAngle;
    wheelVisual.suspension.visible = wheelOptions.showWheelModel;
    if (wheelOptions.wheelModelUpdate) {
      const alpha = 1 - Math.exp(-wheelOptions.wheelModelLerpPosRate * deltaTime);
      wheelVisual.suspension.position.y = MathUtils.lerp(wheelVisual.suspension.position.y, offsetY, alpha);
      wheelVisual.spinner.rotation.x += wheelVisual.wheel.wheelAngularVelocity * deltaTime * (wheelOptions.wheelModelReversRotation ? -1 : 1);
    }
    updateWheelDebug(wheelVisual.debug, wheelVisual.wheel, settings);
  }
  for (const propellerVisual of visual.propellerVisuals) {
    const propellerSettings = settings.propeller;
    propellerVisual.spinner.visible = propellerSettings.showPropellerModel;
    if (propellerSettings.propellerModelUpdate) {
      const targetVelocity =
        propellerVisual.propeller.throttle *
        propellerSettings.propellerModelMaxSpin *
        (propellerVisual.propeller.options.invertTorque ? -1 : 1);
      propellerVisual.spinVelocity = MathUtils.lerp(
        propellerVisual.spinVelocity,
        targetVelocity,
        1 - Math.exp(-propellerSettings.propellerModelLerpSpinRate * deltaTime)
      );
      propellerVisual.spinner.rotateY(propellerVisual.spinVelocity * 60 * deltaTime);
    }
    updatePropellerDebug(propellerVisual.debug, propellerVisual.propeller, settings);
  }
}

function createCharacterDebug(ctrl: CharacterController): CharacterDebugVisual {
  const capsuleRadius = ctrl.options.capsuleRadius;
  const rayRadius = ctrl.options.rayRadius;
  const rayOriginOffest = ctrl.options.rayOriginOffest;
  const localGroup = new Group();
  localGroup.name = "CharacterDebug";
  const worldGroup = new Group();
  worldGroup.name = "WorldDebug";

  const forwardRingGeo = new RingGeometry(capsuleRadius * 2, capsuleRadius * 2.1, 32);
  const forwardPointerGeo = new PlaneGeometry(capsuleRadius / 2, capsuleRadius / 2);
  const forwardIndicatorMat = new MeshBasicMaterial({ color: EC_AZURE, side: DoubleSide });
  const rayCastGeo = new CircleGeometry(1, 12);
  const rayCastMat = new MeshBasicMaterial({ color: EC_PURPLE, side: DoubleSide, transparent: true, opacity: 0.5 });
  const standingGeo = new OctahedronGeometry(rayRadius / 2, 3);
  const standingMat = new MeshBasicMaterial({ color: EC_MED_PURPLE, transparent: true, opacity: 0.5 });
  const movePointerGeo = new OctahedronGeometry(capsuleRadius / 3, 0);
  const moveRingGeo = new RingGeometry(capsuleRadius * 1.5, capsuleRadius * 2, 32);
  const moveIndicatorMat = new MeshBasicMaterial({ color: EC_BLUE, side: DoubleSide, transparent: true, opacity: 0.5 });
  const modelPointerGeo = new OctahedronGeometry(capsuleRadius / 3, 0);
  const modelRingGeo = new RingGeometry(capsuleRadius, capsuleRadius * 1.5, 32);
  const modelIndicatorMat = new MeshBasicMaterial({ color: EC_CORNFLOWER_BLUE, side: DoubleSide, transparent: true, opacity: 0.5 });
  const xAxisPointMat = new MeshBasicMaterial({ color: EC_GREEN, transparent: true, opacity: 1 });
  const yAxisPointMat = new MeshBasicMaterial({ color: EC_BLUE, transparent: true, opacity: 1 });
  const zAxisPointMat = new MeshBasicMaterial({ color: EC_RED, transparent: true, opacity: 1 });

  const modelPointer = new Mesh(modelPointerGeo, modelIndicatorMat);
  modelPointer.scale.set(0.5, 0.5, 2);
  modelPointer.position.set(0, rayOriginOffest, capsuleRadius * 2);
  const modelRing = new Mesh(modelRingGeo, modelIndicatorMat);
  modelRing.rotation.x = -Math.PI / 2;
  modelRing.position.set(0, rayOriginOffest, 0);
  localGroup.add(modelPointer, modelRing);
  localGroup.add(
    positioned(new Mesh(standingGeo, xAxisPointMat), 1, 0, 0),
    positioned(new Mesh(standingGeo, yAxisPointMat), 0, 1, 0),
    positioned(new Mesh(standingGeo, zAxisPointMat), 0, 0, 1)
  );
  localGroup.add(positioned(new Mesh(new OctahedronGeometry(capsuleRadius / 5, 0)), 0, ctrl.options.moveImpulsePointOffset, 0));

  const forwardIndicator = new Group();
  const forwardRing = new Mesh(forwardRingGeo, forwardIndicatorMat);
  forwardRing.rotation.x = -Math.PI / 2;
  const forwardPointer = new Mesh(forwardPointerGeo, forwardIndicatorMat);
  forwardPointer.rotation.set(-Math.PI / 2, 0, Math.PI / 4);
  forwardPointer.position.z = -capsuleRadius * 2;
  forwardIndicator.add(forwardRing, forwardPointer);

  const rayStart = new Mesh(rayCastGeo, rayCastMat);
  const rayEnd = new Mesh(rayCastGeo, rayCastMat);
  const rayTrigger = new Mesh(rayCastGeo, standingMat);
  const rayStable = new Mesh(rayCastGeo, standingMat);
  const standingPoint = new Mesh(standingGeo, rayCastMat);
  const moveIndicator = new Group();
  const movePointer = new Mesh(movePointerGeo, moveIndicatorMat);
  movePointer.scale.set(0.5, 0.5, 2);
  movePointer.position.z = -capsuleRadius * 2;
  const moveRing = new Mesh(moveRingGeo, moveIndicatorMat);
  moveRing.rotation.x = -Math.PI / 2;
  moveIndicator.add(movePointer, moveRing);
  const velocityArrow = new ArrowHelper(FIXED_Y, FIXED_ORIGIN, 0, EC_RED);
  worldGroup.add(forwardIndicator, rayStart, rayTrigger, rayStable, rayEnd, standingPoint, moveIndicator, velocityArrow);

  return { localGroup, worldGroup, forwardIndicator, moveIndicator, rayStart, rayEnd, rayTrigger, rayStable, standingPoint, velocityArrow };
}

function updateCharacterDebug(debug: CharacterDebugVisual): void {
  debug.worldGroup.visible = activeController === "character" && demoSettings.character.debug;
  debug.localGroup.visible = activeController === "character" && demoSettings.character.debug;
  if (activeController !== "character" || !demoSettings.character.debug) return;

  const position = TEMP_VEC_A.copy(controller.currPos);
  const up = TEMP_VEC_B.copy(controller.upAxis).normalize();
  const rayOrigin = TEMP_VEC_C.copy(position).addScaledVector(TEMP_VEC_D.copy(controller.bodyYAxis).normalize(), controller.options.rayOriginOffest);
  const rayDebugRadius = controller.options.groundDetection === "rayCast"
    ? controller.options.rayRadius / 2
    : controller.options.rayRadius;
  const stableDistance = controller.options.groundDetection === "rayCast"
    ? controller.options.rayRadius * 2 + controller.options.floatHeight
    : controller.options.rayRadius + controller.groundFloatingDistanceValue;
  orientDisc(debug.rayStart, rayOrigin, up, rayDebugRadius);
  orientDisc(debug.rayEnd, TEMP_VEC_E.copy(rayOrigin).addScaledVector(up, -controller.options.rayLength), up, rayDebugRadius);
  orientDisc(debug.rayTrigger, TEMP_VEC_E.copy(rayOrigin).addScaledVector(up, -stableDistance - controller.options.rayHitForgiveness), up, rayDebugRadius);
  orientDisc(debug.rayStable, TEMP_VEC_E.copy(rayOrigin).addScaledVector(up, -stableDistance), up, rayDebugRadius);
  debug.standingPoint.position.copy(controller.standPoint);

  debug.forwardIndicator.position.copy(rayOrigin);
  orientGroupToDirection(debug.forwardIndicator, TEMP_VEC_E.copy(controller.forwardDir), up);

  const movingDirection = TEMP_VEC_E.copy(controller.movingDirection);
  debug.moveIndicator.position.copy(rayOrigin);
  orientGroupToDirection(debug.moveIndicator, movingDirection, up);

  const relativeVelocity = TEMP_VEC_E.copy(controller.relativeVel);
  debug.velocityArrow.position.copy(position);
  setArrow(debug.velocityArrow, relativeVelocity, relativeVelocity.length() / (controller.runActive ? controller.options.maxRunVel : controller.options.maxWalkVel));
}

function createWheelDebug(wheel: ShapeCastWheel): WheelDebugVisual {
  const rayShapeR = wheel.options.rayShapeR;
  const rayShapeH = wheel.options.rayShapeH;
  const rayLength = wheel.options.rayLength;
  const localGroup = new Group();
  localGroup.name = `${wheel.options.name || "wheel"}Debug`;
  const worldGroup = new Group();
  worldGroup.name = `${wheel.options.name || "wheel"}WorldDebug`;

  const forwardRingGeo = new RingGeometry(rayShapeH * 1.6, rayShapeH * 2, 12);
  const forwardPointerGeo = new PlaneGeometry(rayShapeH, rayShapeH);
  const forwardIndicatorMat = new MeshBasicMaterial({ color: EC_AZURE, side: DoubleSide });
  const rayCastGeo = new CircleGeometry(rayShapeH * 0.5, 12);
  const rayCastHalfGeo = new CylinderGeometry(rayShapeR, rayShapeR, rayShapeH * 2, 12, 1, true, 0, -Math.PI);
  const rayCastMat = new MeshBasicMaterial({ color: EC_MED_PURPLE, side: DoubleSide, transparent: true, opacity: 0.5 });
  const standingGeo = new OctahedronGeometry(rayShapeH * 0.5, 3);
  const standingMat = new MeshBasicMaterial({ color: EC_PURPLE, transparent: true, opacity: 0.5 });
  const xAxisPointMat = new MeshBasicMaterial({ color: EC_GREEN, transparent: true, opacity: 1 });
  const yAxisPointMat = new MeshBasicMaterial({ color: EC_BLUE, transparent: true, opacity: 1 });
  const zAxisPointMat = new MeshBasicMaterial({ color: EC_RED, transparent: true, opacity: 1 });

  const forwardIndicator = new Group();
  const forwardRing = new Mesh(forwardRingGeo, forwardIndicatorMat);
  forwardRing.rotation.x = Math.PI / 2;
  const forwardPointer = new Mesh(forwardPointerGeo, forwardIndicatorMat);
  forwardPointer.rotation.set(Math.PI / 2, 0, Math.PI / 4);
  forwardPointer.position.z = rayShapeH * 1.6;
  forwardIndicator.add(forwardRing, forwardPointer);
  localGroup.add(forwardIndicator);

  const shapeCastGroup = new Group();
  const upperRay = new Mesh(rayCastHalfGeo, rayCastMat);
  upperRay.rotation.set(Math.PI, 0, Math.PI / 2);
  const lowerRay = new Mesh(rayCastHalfGeo, rayCastMat);
  lowerRay.position.y = -rayLength;
  lowerRay.rotation.z = Math.PI / 2;
  shapeCastGroup.add(upperRay, lowerRay);
  localGroup.add(shapeCastGroup);

  const rayCastGroup = new Group();
  const rayStart = new Mesh(rayCastGeo, rayCastMat);
  rayStart.rotation.x = -Math.PI / 2;
  const rayEnd = new Mesh(rayCastGeo, rayCastMat);
  rayEnd.position.y = -(rayLength + rayShapeR);
  rayEnd.rotation.x = -Math.PI / 2;
  rayCastGroup.add(rayStart, rayEnd);
  localGroup.add(rayCastGroup);

  localGroup.add(
    positioned(new Mesh(standingGeo, xAxisPointMat), 1, 0, 0),
    positioned(new Mesh(standingGeo, yAxisPointMat), 0, 1, 0),
    positioned(new Mesh(standingGeo, zAxisPointMat), 0, 0, 1)
  );

  const hitPoint = new Mesh(standingGeo, standingMat);
  const floatArrow = new ArrowHelper(FIXED_Y, FIXED_ORIGIN, 0, EC_BLUE);
  const driftArrow = new ArrowHelper(FIXED_Y, FIXED_ORIGIN, 0, EC_GREEN);
  const engineArrow = new ArrowHelper(FIXED_Y, FIXED_ORIGIN, 0, EC_RED);
  worldGroup.add(hitPoint, floatArrow, driftArrow, engineArrow);
  return { localGroup, worldGroup, shapeCastGroup, rayCastGroup, hitPoint, floatArrow, driftArrow, engineArrow };
}

function updateWheelDebug(debug: WheelDebugVisual, wheel: ShapeCastWheel, settings: VehicleSettings): void {
  const hasHit = Boolean(wheel.hitBody);
  const scale = settings.wheel.debuggerArrowScale;
  debug.localGroup.visible = settings.wheel.debug;
  debug.worldGroup.visible = settings.wheel.debug;
  if (!settings.wheel.debug) return;
  debug.shapeCastGroup.visible = settings.wheel.groundDetection === "shapeCast";
  debug.rayCastGroup.visible = settings.wheel.groundDetection === "rayCast";
  debug.hitPoint.position.copy(wheel.hitPosition);
  const supportPosition = TEMP_VEC_B.copy(wheel.supportPosition);
  debug.floatArrow.position.copy(supportPosition);
  debug.driftArrow.position.copy(supportPosition);
  debug.engineArrow.position.copy(supportPosition);
  setArrow(debug.floatArrow, TEMP_VEC_C.copy(wheel.floatImpulse), hasHit ? wheel.floatImpulse.length() * scale : 0);
  setArrow(debug.driftArrow, TEMP_VEC_C.copy(wheel.lateralFrictionImpulse), hasHit ? wheel.lateralFrictionImpulse.length() * scale : 0);
  setArrow(debug.engineArrow, TEMP_VEC_C.copy(wheel.longitudinalFrictionImpulse), hasHit ? wheel.longitudinalFrictionImpulse.length() * scale : 0);
}

function createPropellerDebug(propeller: ThrustPropeller): PropellerDebugVisual {
  const debuggerScale = 1;
  const localGroup = new Group();
  localGroup.name = `${propeller.options.name || "propeller"}Debug`;
  const thrustRingGeo = new RingGeometry(debuggerScale * 0.5, debuggerScale * 0.55, 12, 1, 0, -Math.PI);
  const thrustRingMat = new MeshBasicMaterial({ color: EC_AZURE, side: DoubleSide });
  const thrustPointerGeo = new ConeGeometry(debuggerScale * 0.06, debuggerScale * 0.5, 8, 1, true);
  const thrustIndicatorMat = new MeshBasicMaterial({ color: EC_MED_PURPLE, side: DoubleSide, transparent: true, opacity: 0.3 });
  const axisPointGeo = new OctahedronGeometry(debuggerScale * 0.05, 3);
  const xAxisPointMat = new MeshBasicMaterial({ color: EC_GREEN, transparent: true, opacity: 1 });
  const yAxisPointMat = new MeshBasicMaterial({ color: EC_BLUE, transparent: true, opacity: 1 });
  const zAxisPointMat = new MeshBasicMaterial({ color: EC_RED, transparent: true, opacity: 1 });

  const invertThrust = propeller.options.invertThrust;
  const invertTorque = propeller.options.invertTorque;
  const thrustPointer = new Mesh(thrustPointerGeo, thrustIndicatorMat);
  thrustPointer.rotation.x = invertThrust ? Math.PI : 0;
  thrustPointer.position.y = debuggerScale * 0.25 * (invertThrust ? -1 : 1);
  const torquePointer = new Mesh(thrustPointerGeo, thrustRingMat);
  torquePointer.rotation.x = Math.PI / 2;
  torquePointer.position.set(debuggerScale * 0.53 * (invertTorque ? 1 : -1), 0, debuggerScale * 0.25);
  const torqueRing = new Mesh(thrustRingGeo, thrustRingMat);
  torqueRing.rotation.x = Math.PI / 2;
  const thrustArrow = new ArrowHelper(new Vector3(0, invertThrust ? -1 : 1, 0), FIXED_ORIGIN, 0, EC_BLUE);
  const torqueArrow = new ArrowHelper(new Vector3(0, invertTorque ? -1 : 1, 0), FIXED_ORIGIN, 0, EC_RED);
  localGroup.add(
    thrustPointer,
    torquePointer,
    torqueRing,
    positioned(new Mesh(axisPointGeo, xAxisPointMat), debuggerScale, 0, 0),
    positioned(new Mesh(axisPointGeo, yAxisPointMat), 0, debuggerScale, 0),
    positioned(new Mesh(axisPointGeo, zAxisPointMat), 0, 0, debuggerScale),
    thrustArrow,
    torqueArrow
  );
  return { localGroup, thrustArrow, torqueArrow };
}

function updatePropellerDebug(debug: PropellerDebugVisual, propeller: ThrustPropeller, settings: VehicleSettings): void {
  debug.localGroup.visible = settings.propeller.debug;
  debug.localGroup.scale.setScalar(settings.propeller.debuggerScale);
  debug.thrustArrow.setLength(propeller.finalThrottle * settings.propeller.debuggerArrowScale);
  debug.torqueArrow.setLength(propeller.finalThrottle * settings.propeller.debuggerArrowScale * propeller.options.torqueRatio);
}

function createCharacterModel(animation: GLTF, capsule: GLTF): CharacterModel {
  const root = new Group();
  const actions = new Map<string, AnimationAction>();
  const animatedScene = animation.scene;
  animatedScene.position.set(0, -0.95, 0);
  animatedScene.traverse((object) => {
    if (object instanceof Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
      styleCharacterMaterial(object.material);
    }
  });
  root.add(animatedScene);
  if (animation.animations.length === 0) {
    const capsuleScene = capsule.scene;
    capsuleScene.position.set(0, -0.6, 0);
    root.add(capsuleScene);
    return {
      object: root,
      mixer: null,
      actions,
      animation: null
    };
  }
  const mixer = new AnimationMixer(animatedScene);
  for (const clip of animation.animations) actions.set(clip.name, mixer.clipAction(clip));
  return {
    object: root,
    mixer,
    actions,
    animation: null
  };
}

function createCapsuleModel(capsule: GLTF): Object3D {
  const root = capsule.scene.clone(true);
  root.position.set(0, -0.6, 0);
  root.traverse((object) => {
    if (object instanceof Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (material instanceof MeshStandardMaterial) material.side = FrontSide;
      }
    }
  });
  root.visible = false;
  return root;
}

function updateAnimation(): void {
  if (!demoSettings.character.animatedCharacter || demoSettings.world.pausedPhysics || !demoSettings.character.enable) return;
  characterModel.animation?.update();
}

function updateCamera(deltaTime: number): void {
  cameraControls.smoothTime = demoSettings.camera.smoothTime;
  if (!demoSettings.camera.followPlayer) {
    cameraControls.update(deltaTime);
    return;
  }
  const body = getActiveBody();
  const bodyPosition = body.translation();
  const position = TEMP_VEC_A.set(bodyPosition.x, bodyPosition.y, bodyPosition.z);
  const rotation = body.rotation();
  const bodyQuat = TEMP_QUAT_A.set(rotation.x, rotation.y, rotation.z, rotation.w);
  const bodyY = TEMP_VEC_B.set(0, 1, 0).applyQuaternion(bodyQuat).normalize();
  const up = activeController === "character"
    ? TEMP_VEC_C.copy(controller.upAxis)
    : activeController === "vehicle1"
      ? TEMP_VEC_C.copy(vehicle1.vehicle.up)
      : activeController === "vehicle2"
        ? TEMP_VEC_C.copy(vehicle2.vehicle.up)
        : TEMP_VEC_C.copy(vehicle3.vehicle.up);
  const forward = activeController === "character"
    ? TEMP_VEC_D.copy(controller.bodyZAxis)
    : activeController === "vehicle1"
      ? TEMP_VEC_D.copy(vehicle1.vehicle.bodyZ)
      : activeController === "vehicle2"
        ? TEMP_VEC_D.copy(vehicle2.vehicle.bodyZ)
        : TEMP_VEC_D.copy(vehicle3.vehicle.bodyZ);
  const target = TEMP_VEC_E.copy(position).addScaledVector(bodyY, 0.5);
  void cameraControls.moveTo(target.x, target.y, target.z, true);
  camera.up.lerp(up, 0.1).normalize();
  cameraControls.setUp(camera.up);

  if (activeController === "character" && controller.isOnPlatform) {
    const cameraCurrDir = TEMP_VEC_E;
    const cameraFinalDir = TEMP_VEC_F;
    const cameraTurnCrossAxis = TEMP_VEC_G;
    camera.getWorldDirection(cameraCurrDir).projectOnPlane(up);
    if (cameraCurrDir.lengthSq() > 1e-10) {
      cameraCurrDir.normalize();
      cameraFinalDir.copy(cameraCurrDir).applyQuaternion(controller.turnOnYQuat);
      if (cameraFinalDir.lengthSq() > 1e-10) {
        cameraFinalDir.normalize();
        cameraTurnCrossAxis.crossVectors(cameraCurrDir, cameraFinalDir);
        let dot = clamp(cameraCurrDir.dot(cameraFinalDir), -1, 1);
        if (Math.abs(dot) < 1e-10) dot = 0;
        void cameraControls.rotate(Math.atan2(cameraTurnCrossAxis.dot(up), dot), 0, true);
      }
    }
  }

  if (activeController !== "character" && cameraControls.currentAction === CameraControls.ACTION.NONE) {
    const cameraCurrDir = TEMP_VEC_E;
    const cameraFinalDir = TEMP_VEC_F;
    const cameraTurnCrossAxis = TEMP_VEC_G;
    camera.getWorldDirection(cameraCurrDir).projectOnPlane(up);
    cameraFinalDir.copy(forward).projectOnPlane(up);
    if (cameraCurrDir.lengthSq() > 1e-10 && cameraFinalDir.lengthSq() > 1e-10) {
      cameraCurrDir.normalize();
      cameraFinalDir.normalize();
      cameraTurnCrossAxis.crossVectors(cameraCurrDir, cameraFinalDir);
      let dot = clamp(cameraCurrDir.dot(cameraFinalDir), -1, 1);
      if (Math.abs(dot) < 1e-10) dot = 0;
      const angle = Math.atan2(cameraTurnCrossAxis.dot(up), dot);
      void cameraControls.rotate(angle * 5 * deltaTime, 0, true);
    }
  }

  cameraControls.update(deltaTime);
}

function resetPlayer(): void {
  activeController = "character";
  controller.body.setTranslation(CHARACTER_START, { activate: true });
  controller.body.setRotation([0, 0, 0, 1], { activate: true });
  controller.body.setLinearVelocity([0, 0, 0]);
  controller.body.setAngularVelocity([0, 0, 0]);
}

function cameraLock(): void {
  cameraControls.lockPointer();
}

function firstPerson(): void {
  void cameraControls.dolly(cameraControls.distance - 0.02, true);
}

function toggleLockForward(): void {
  controller.setLockForward(!controller.lockForward);
}

function flipVehicle(body: Body): void {
  const rotation = body.rotation();
  const quat = TEMP_QUAT_A.set(rotation.x, rotation.y, rotation.z, rotation.w);
  quat.multiply(TEMP_QUAT_B.setFromAxisAngle(FIXED_Z, Math.PI));
  body.setRotation(quaternionTuple(quat), { activate: true });
  body.wakeUp();
}

function toggleVehicleAccess(): void {
  if (activeController !== "character") {
    exitVehicle();
    return;
  }
  const sensor = nearestVehicleAccessSensor();
  if (!sensor) return;

  enterVehicle(sensor);
}

function enterVehicle(sensor: VehicleAccessSensor): void {
  if (activeController !== "character") return;
  const vehicle = sensor.visual.vehicle;
  activeController = sensor.name;
  controller.body.setTranslation([0, -1000, 0], { activate: false });
  controller.body.setLinearVelocity([0, 0, 0]);
  controller.body.sleep();
  if (sensor.name === "vehicle3") {
    demoSettingsHandle.setDroneControlMode("VELOCITY");
    vehicle.options.droneConfig.controlMode = "VELOCITY";
  }
  vehicle.body.wakeUp();
  updateDemoDebugElement(true);
}

function exitVehicle(): void {
  const vehicle = activeController === "vehicle1"
    ? vehicle1.vehicle
    : activeController === "vehicle2"
      ? vehicle2.vehicle
      : vehicle3.vehicle;
  const vehicleTranslation = vehicle.body.translation();
  const pos = TEMP_VEC_A.set(vehicleTranslation.x, vehicleTranslation.y, vehicleTranslation.z);
  const rot = vehicle.body.rotation();
  const quat = TEMP_QUAT_A.set(rot.x, rot.y, rot.z, rot.w);
  const side = activeController === "vehicle3"
    ? TEMP_VEC_B.set(0, 1, 0).applyQuaternion(quat)
    : TEMP_VEC_B.set(1, 0, 0).applyQuaternion(quat);
  pos.addScaledVector(side.normalize(), 1.8);
  controller.body.setTranslation(pos, { activate: true });
  controller.body.setRotation(quaternionTuple(quat), { activate: true });
  controller.body.setLinearVelocity(vehicle.body.linearVelocity());
  activeController = "character";
  demoSettingsHandle.setDroneControlMode("POSITION");
  vehicle3.vehicle.options.droneConfig.controlMode = "POSITION";
  vehicle3.vehicle.setTarget(vehicle3.vehicle.currPos, vehicle3.vehicle.bodyZ);
}

function getActiveBody(): Body {
  if (activeController === "vehicle1") return vehicle1.vehicle.body;
  if (activeController === "vehicle2") return vehicle2.vehicle.body;
  if (activeController === "vehicle3") return vehicle3.vehicle.body;
  return controller.body;
}

function applyInitialControllerParam(): void {
  const params = new URLSearchParams(window.location.search);
  const initialController = (params.get("controller") ?? params.get("start"))?.toLowerCase();
  if (!initialController) return;
  const sensor = vehicleAccessSensors.find((candidate) => {
    if (candidate.name === initialController) return true;
    return initialController === "drone" && candidate.name === "vehicle3";
  });
  if (sensor) enterVehicle(sensor);
}

applyInitialControllerParam();

function nearestVehicleAccessSensor(): VehicleAccessSensor | null {
  if (activeController !== "character") return null;
  let nearestSensor: VehicleAccessSensor | null = null;
  let nearestSignedDistance = Infinity;
  for (const sensor of vehicleAccessSensors) {
    const signedDistance = vehicleAccessSignedDistance(sensor);
    if (signedDistance <= 0 && signedDistance < nearestSignedDistance) {
      nearestSignedDistance = signedDistance;
      nearestSensor = sensor;
    }
  }
  return nearestSensor;
}

function vehicleAccessSignedDistance(sensor: VehicleAccessSensor): number {
  setCharacterCapsuleSegment(ACCESS_CAPSULE_START, ACCESS_CAPSULE_END);
  setVehicleLocalCapsule(sensor.visual.vehicle, ACCESS_CAPSULE_START, ACCESS_CAPSULE_END);
  ACCESS_SENSOR_CENTER.set(sensor.center[0], sensor.center[1], sensor.center[2]);
  return sensor.kind === "cylinder"
    ? capsuleCylinderSignedDistance(sensor)
    : capsuleSphereSignedDistance(sensor.radius);
}

function setCharacterCapsuleSegment(start: Vector3, end: Vector3): void {
  const translation = controller.body.translation();
  ACCESS_CHARACTER_CENTER.set(translation.x, translation.y, translation.z);
  ACCESS_CHARACTER_AXIS.copy(controller.bodyYAxis).normalize();
  start.copy(ACCESS_CHARACTER_CENTER).addScaledVector(ACCESS_CHARACTER_AXIS, controller.options.capsuleHalfHeight);
  end.copy(ACCESS_CHARACTER_CENTER).addScaledVector(ACCESS_CHARACTER_AXIS, -controller.options.capsuleHalfHeight);
}

function setVehicleLocalCapsule(vehicle: Vehicle, start: Vector3, end: Vector3): void {
  const translation = vehicle.body.translation();
  const rotation = vehicle.body.rotation();
  ACCESS_VEHICLE_POSITION.set(translation.x, translation.y, translation.z);
  ACCESS_INVERSE_ROTATION.set(rotation.x, rotation.y, rotation.z, rotation.w).invert();
  ACCESS_LOCAL_CAPSULE_START.copy(start).sub(ACCESS_VEHICLE_POSITION).applyQuaternion(ACCESS_INVERSE_ROTATION);
  ACCESS_LOCAL_CAPSULE_END.copy(end).sub(ACCESS_VEHICLE_POSITION).applyQuaternion(ACCESS_INVERSE_ROTATION);
}

function capsuleCylinderSignedDistance(sensor: CylinderVehicleAccessSensor): number {
  const capsuleRadius = controller.options.capsuleRadius;
  const radius = sensor.radius + capsuleRadius;
  const minY = ACCESS_SENSOR_CENTER.y - sensor.halfHeight - capsuleRadius;
  const maxY = ACCESS_SENSOR_CENTER.y + sensor.halfHeight + capsuleRadius;
  const start = ACCESS_LOCAL_CAPSULE_START;
  const end = ACCESS_LOCAL_CAPSULE_END;
  const segmentY = end.y - start.y;
  let minT = 0;
  let maxT = 1;
  if (Math.abs(segmentY) < 1e-8) {
    if (start.y < minY || start.y > maxY) return Infinity;
  } else {
    const t0 = (minY - start.y) / segmentY;
    const t1 = (maxY - start.y) / segmentY;
    minT = Math.max(0, Math.min(t0, t1));
    maxT = Math.min(1, Math.max(t0, t1));
    if (minT > maxT) return Infinity;
  }

  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSq = dx * dx + dz * dz;
  const closestT = lengthSq > 1e-8
    ? clamp(((ACCESS_SENSOR_CENTER.x - start.x) * dx + (ACCESS_SENSOR_CENTER.z - start.z) * dz) / lengthSq, minT, maxT)
    : minT;
  const closestX = start.x + dx * closestT;
  const closestZ = start.z + dz * closestT;
  const distX = closestX - ACCESS_SENSOR_CENTER.x;
  const distZ = closestZ - ACCESS_SENSOR_CENTER.z;
  return Math.sqrt(distX * distX + distZ * distZ) - radius;
}

function capsuleSphereSignedDistance(radius: number): number {
  ACCESS_SEGMENT_DELTA.subVectors(ACCESS_LOCAL_CAPSULE_END, ACCESS_LOCAL_CAPSULE_START);
  const segmentLengthSq = ACCESS_SEGMENT_DELTA.lengthSq();
  const t = segmentLengthSq > 1e-8
    ? clamp(
      ACCESS_CENTER_TO_START.subVectors(ACCESS_SENSOR_CENTER, ACCESS_LOCAL_CAPSULE_START).dot(ACCESS_SEGMENT_DELTA) / segmentLengthSq,
      0,
      1
    )
    : 0;
  ACCESS_CLOSEST_POINT.copy(ACCESS_LOCAL_CAPSULE_START).addScaledVector(ACCESS_SEGMENT_DELTA, t);
  return ACCESS_CLOSEST_POINT.distanceTo(ACCESS_SENSOR_CENTER) - radius - controller.options.capsuleRadius;
}

function updateCarInput(): VehicleInput {
  carMovementInput.forward = keyState.W || keyState.Up || touchInput.buttons.b3;
  carMovementInput.backward = keyState.S || keyState.Down || touchInput.buttons.b1;
  carMovementInput.steerLeft = keyState.A || keyState.Left;
  carMovementInput.steerRight = keyState.D || keyState.Right;
  carMovementInput.brake = keyState.Space || touchInput.buttons.b2;
  return carMovementInput;
}

function updateDroneInput(): VehicleInput {
  droneMovementInput.throttleUp = keyState.W;
  droneMovementInput.throttleDown = keyState.S;
  droneMovementInput.yawLeft = keyState.A;
  droneMovementInput.yawRight = keyState.D;
  droneMovementInput.pitchForward = keyState.Up;
  droneMovementInput.pitchBackward = keyState.Down;
  droneMovementInput.rollLeft = keyState.Left;
  droneMovementInput.rollRight = keyState.Right;
  return droneMovementInput;
}

function nearestVehicleLabel(): string | null {
  return nearestVehicleAccessSensor()?.label ?? null;
}

function vehicleReadout(): string {
  const vehicle = activeController === "vehicle1"
    ? vehicle1.vehicle
    : activeController === "vehicle2"
      ? vehicle2.vehicle
      : vehicle3.vehicle;
  return `rpm ${vehicle.engineRPM.toFixed(0)} gear ${vehicle.gearIndex + 1} wheels ${vehicle.wheels.length} props ${vehicle.propellers.length}`;
}

function settingsForVehicle(name: string): VehicleSettings {
  if (name === "vehicle1") return demoSettings.vehicles.vehicle1;
  if (name === "vehicle2") return demoSettings.vehicles.vehicle2;
  return demoSettings.vehicles.vehicle3;
}

function createTouchControls(
  root: HTMLElement,
  state: TouchInputState,
  getActiveController: () => ActiveController,
  onAccess: () => void
): TouchControls {
  const container = document.createElement("div");
  container.className = "touchControls";
  root.append(container);

  const leftJoystick = createJoystickElement(state.joystickL, "left");
  const rightJoystick = createJoystickElement(state.joystickR, "right");
  const b1 = createVirtualButton("b1", state, onAccess);
  const b2 = createVirtualButton("b2", state, onAccess);
  const b3 = createVirtualButton("b3", state, onAccess);
  const b4 = createVirtualButton("b4", state, onAccess);
  container.append(leftJoystick, rightJoystick, b1, b2, b3, b4);

  const controls = { root: container, rightJoystick, b1, b2, b3, b4 };
  updateTouchControls(controls, getActiveController());
  coarsePointerMedia.addEventListener("change", () => updateTouchControls(controls, getActiveController()));
  return controls;
}

function updateTouchControls(controls: TouchControls, controllerName = activeController): void {
  const touch = hasTouchInput();
  controls.root.hidden = !touch;
  if (!touch) {
    resetTouchInput(touchInput);
    return;
  }

  controls.rightJoystick.hidden = controllerName !== "vehicle3";
  controls.b1.hidden = controllerName === "vehicle3";
  controls.b2.hidden = controllerName === "vehicle3";
  controls.b3.hidden = controllerName !== "vehicle1" && controllerName !== "vehicle2";

  setVirtualButtonLabel(controls.b1, controllerName === "character" ? "Run" : "Rev");
  setVirtualButtonLabel(controls.b2, controllerName === "character" ? "Jump" : "Brake");
  setVirtualButtonLabel(controls.b3, "Gas");
  setVirtualButtonLabel(controls.b4, controllerName === "character" ? "Enter" : "Exit");

  controls.b1.style.right = "100px";
  controls.b1.style.bottom = "30px";
  controls.b2.style.right = "40px";
  controls.b2.style.bottom = controllerName === "character" ? "90px" : "70px";
  controls.b3.style.right = "100px";
  controls.b3.style.bottom = "110px";
  controls.b4.style.right = "40px";
  controls.b4.style.bottom = "200px";
}

function createJoystickElement(state: { x: number; y: number }, side: "left" | "right"): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.id = "character-joystick";
  wrapper.style.cssText = [
    "user-select:none",
    "-moz-user-select:none",
    "-webkit-user-drag:none",
    "-webkit-user-select:none",
    "-ms-user-select:none",
    "touch-action:none",
    "overscroll-behavior:none",
    "position:fixed",
    "z-index:10",
    "height:200px",
    "width:200px",
    "border-radius:50%",
    "bottom:0",
    `${side}:0`
  ].join(";");

  const base = document.createElement("div");
  base.id = "joystick-base";
  base.style.cssText = [
    "width:100px",
    "height:100px",
    "background:rgba(0, 0, 0, 0.1)",
    "border:2px solid white",
    "border-radius:50%",
    "position:absolute",
    "top:50%",
    "left:50%",
    "transform:translate(-50%, -50%)",
    "touch-action:none"
  ].join(";");

  const knob = document.createElement("div");
  knob.id = "joystick-knob";
  knob.style.cssText = [
    "width:70px",
    "height:70px",
    "background:rgba(255, 255, 255, 0.8)",
    "border-radius:50%",
    "position:absolute",
    "top:50%",
    "left:50%",
    "transform:translate(-50%, -50%)",
    "transition:transform 0.2s cubic-bezier(0.25, 1.5, 0.5, 1)",
    "will-change:transform",
    "pointer-events:none"
  ].join(";");
  base.append(knob);
  wrapper.append(base);

  let active = false;
  const maxRadius = 50;
  const move = (event: PointerEvent) => {
    const rect = base.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    let dx = event.clientX - centerX;
    let dy = event.clientY - centerY;
    const distance = Math.hypot(dx, dy);
    if (distance > maxRadius) {
      dx *= maxRadius / distance;
      dy *= maxRadius / distance;
    }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    state.x = dx / maxRadius;
    state.y = -dy / maxRadius;
  };
  const reset = () => {
    active = false;
    knob.style.transform = "translate(-50%, -50%)";
    state.x = 0;
    state.y = 0;
  };

  wrapper.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    active = true;
    wrapper.setPointerCapture(event.pointerId);
    move(event);
  });
  wrapper.addEventListener("pointermove", (event) => {
    if (!active) return;
    event.preventDefault();
    event.stopPropagation();
    move(event);
  });
  for (const eventName of ["pointerup", "pointerleave", "pointercancel"] as const) {
    wrapper.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      reset();
    });
  }

  return wrapper;
}

function createVirtualButton(id: keyof TouchInputState["buttons"], state: TouchInputState, onAccess: () => void): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.id = "character-virtual-button";
  wrapper.style.cssText = [
    "user-select:none",
    "-moz-user-select:none",
    "-webkit-user-drag:none",
    "-webkit-user-select:none",
    "-ms-user-select:none",
    "touch-action:none",
    "overscroll-behavior:none",
    "position:fixed",
    "z-index:10",
    "height:60px",
    "width:60px",
    "background:rgba(0, 0, 0, 0.1)",
    "border-radius:50%"
  ].join(";");

  const cap = document.createElement("div");
  cap.id = "virtual-button-cap";
  cap.style.cssText = [
    "width:45px",
    "height:45px",
    "background:rgba(255, 255, 255, 0.8)",
    "border-radius:50%",
    "position:absolute",
    "top:50%",
    "left:50%",
    "transform:translate(-50%, -50%)",
    "transition:transform 0.2s cubic-bezier(0.25, 1.5, 0.5, 1)",
    "will-change:transform",
    "display:flex",
    "justify-content:center",
    "align-items:center",
    "font-size:12px",
    "font-weight:bold",
    "font-family:Arial, sans-serif",
    "color:LightGray",
    "user-select:none",
    "pointer-events:none"
  ].join(";");
  wrapper.append(cap);

  const press = (event: PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    state.buttons[id] = true;
    cap.style.transform = "translate(-50%, -50%) scale(1.3)";
    cap.style.opacity = "0.5";
    if (id === "b4") onAccess();
  };
  const reset = (event: PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    state.buttons[id] = false;
    cap.style.transform = "translate(-50%, -50%) scale(1)";
    cap.style.opacity = "1";
  };
  wrapper.addEventListener("pointerdown", press);
  wrapper.addEventListener("pointerup", reset);
  wrapper.addEventListener("pointerleave", reset);
  wrapper.addEventListener("pointercancel", reset);
  wrapper.addEventListener("contextmenu", (event) => event.preventDefault());

  return wrapper;
}

function setVirtualButtonLabel(button: HTMLDivElement, label: string): void {
  const cap = button.firstElementChild;
  if (cap) cap.textContent = label;
}

function hasTouchInput(): boolean {
  return "ontouchstart" in window || navigator.maxTouchPoints > 0 || coarsePointerMedia.matches;
}

function resetTouchInput(state: TouchInputState): void {
  state.joystickL.x = 0;
  state.joystickL.y = 0;
  state.joystickR.x = 0;
  state.joystickR.y = 0;
  state.buttons.b1 = false;
  state.buttons.b2 = false;
  state.buttons.b3 = false;
  state.buttons.b4 = false;
}

function createOverlay(root: HTMLElement): ControlUi {
  const prompt = document.createElement("div");
  prompt.className = "interactionPrompt";
  const promptText = document.createElement("span");
  promptText.className = "interactionPromptText";
  prompt.append(promptText);
  root.append(prompt);

  const hints = document.createElement("div");
  hints.className = "controlHints";
  hints.style.setProperty("--control-hint-accent", "#e5e7eb");
  root.append(hints);

  const copyright = document.createElement("div");
  copyright.className = "copyrightNotice";
  copyright.innerHTML = `
    <div class="copyrightNoticeLine">
      <a href="https://github.com/pmndrs/ecctrl" target="_blank" rel="noreferrer">Ecctrl</a>
      <span>© 2023-2026</span>
      <a href="https://github.com/ErdongChen-Andrew" target="_blank" rel="noreferrer">Erdong Chen</a>
      <span>· MIT License</span>
    </div>
    <div class="copyrightNoticeLine">
      <span>Animations by Quaternius -</span>
      <a href="https://quaternius.itch.io/universal-animation-library" target="_blank" rel="noreferrer">Universal Animation Library</a>
      <span>(CC0)</span>
    </div>
  `;
  root.append(copyright);

  return { prompt, promptText, hints, keyElements: new Map() };
}

function updateControlUi(ui: ControlUi): void {
  const target = nearestVehicleLabel();
  ui.prompt.hidden = activeController !== "character" || !target;
  if (target) ui.promptText.textContent = `Enter ${target}`;

  const preset = controlHintPreset(activeController);
  let presetChanged = false;
  if (ui.hints.dataset.preset !== preset.name) {
    ui.keyElements.clear();
    ui.hints.dataset.preset = preset.name;
    ui.hints.innerHTML = renderControlHintGroups(preset.groups);
    for (const element of ui.hints.querySelectorAll<HTMLElement>("[data-code]")) {
      const codes = element.dataset.code?.split(" ") ?? [];
      for (const code of codes) {
        const elements = ui.keyElements.get(code) ?? [];
        elements.push(element);
        ui.keyElements.set(code, elements);
      }
    }
    presetChanged = true;
  }

  if (!presetChanged && renderedPressedKeyRevision === pressedKeyRevision) return;
  for (const elements of ui.keyElements.values()) {
    for (const element of elements) element.classList.remove("is-active");
  }
  for (const code of pressedKeyCodes) {
    for (const element of ui.keyElements.get(code) ?? []) element.classList.add("is-active");
  }
  renderedPressedKeyRevision = pressedKeyRevision;
}

function controlHintPreset(controllerName: ActiveController): {
  readonly name: string;
  readonly groups: readonly {
    readonly label: string;
    readonly layout?: "directional" | "stack";
    readonly keyRow?: "top" | "bottom";
    readonly labelPosition?: "below" | "inline" | "none";
    readonly bottomLabel?: string;
    readonly keys: readonly { readonly label: string; readonly codes: readonly string[]; readonly wide?: boolean }[];
  }[];
} {
  if (controllerName === "vehicle3") {
    return {
      name: "drone",
      groups: [
        { label: "Throttle / Yaw", layout: "directional", keys: [hintKey("W", "KeyW"), hintKey("A", "KeyA"), hintKey("S", "KeyS"), hintKey("D", "KeyD")] },
        { label: "Pitch / Roll", layout: "directional", keys: [hintKey("↑", "ArrowUp"), hintKey("←", "ArrowLeft"), hintKey("↓", "ArrowDown"), hintKey("→", "ArrowRight")] },
        { label: "Exit", keyRow: "bottom", labelPosition: "inline", keys: [hintKey("F", "KeyF")] }
      ]
    };
  }
  if (controllerName === "vehicle1" || controllerName === "vehicle2") {
    return {
      name: "vehicle",
      groups: [
        { label: "Drive / Steer", layout: "directional", keys: [hintKey("W", "KeyW"), hintKey("A", "KeyA"), hintKey("S", "KeyS"), hintKey("D", "KeyD")] },
        { label: "Brake", keyRow: "bottom", keys: [hintKey("Space", "Space", true)] },
        { label: "Exit", keyRow: "bottom", labelPosition: "inline", keys: [hintKey("F", "KeyF")] }
      ]
    };
  }
  return {
    name: "character",
    groups: [
      { label: "Move", layout: "directional", keys: [hintKey("W", "KeyW"), hintKey("A", "KeyA"), hintKey("S", "KeyS"), hintKey("D", "KeyD")] },
      { label: "Run", layout: "stack", labelPosition: "inline", bottomLabel: "Jump", keys: [hintKey("Shift", "ShiftLeft ShiftRight Shift"), hintKey("Space", "Space", true)] },
      { label: "Enter", keyRow: "bottom", labelPosition: "inline", keys: [hintKey("F", "KeyF")] }
    ]
  };
}

function hintKey(label: string, codes: string, wide = false): { readonly label: string; readonly codes: readonly string[]; readonly wide?: boolean } {
  return { label, codes: codes.split(" "), wide };
}

function renderControlHintGroups(groups: ReturnType<typeof controlHintPreset>["groups"]): string {
  return `<div class="controlHintsGroups">${groups.map((group) => {
    if (group.layout === "stack") {
      return `
        <div class="controlHintGroup is-stack label-inline">
          <div class="controlHintStackRow is-top">
            ${group.keys[0] ? renderControlHintKey(group.keys[0]) : ""}
            <div class="controlHintLabel">${group.label}</div>
          </div>
          <div class="controlHintStackRow is-bottom">
            ${group.keys[1] ? renderControlHintKey(group.keys[1]) : ""}
          </div>
          ${group.bottomLabel ? `<div class="controlHintStackLabel">${group.bottomLabel}</div>` : ""}
        </div>
      `;
    }
    return `
      <div class="controlHintGroup ${group.layout === "directional" ? "is-directional" : `is-${group.keyRow ?? "top"}`} label-${group.labelPosition ?? "below"}">
        <div class="${group.layout === "directional" ? "controlHintKeys is-directional" : "controlHintKeys"}">
          ${group.keys.map(renderControlHintKey).join("")}
        </div>
        <div class="controlHintLabel">${group.label}</div>
      </div>
    `;
  }).join("")}</div>`;
}

function renderControlHintKey(key: { readonly label: string; readonly codes: readonly string[]; readonly wide?: boolean }): string {
  return `<span class="controlHintKey${key.wide ? " is-wide" : ""}" data-code="${key.codes.join(" ")}">${key.label}</span>`;
}

function updateKinematics(time: number, deltaTime: number): void {
  for (const item of kinematicBodies) item.update(time, deltaTime);
}

function moveKinematicBody(body: Body, x: number, y: number, z: number, rotation: QuaternionInput, deltaTime: number): void {
  KINEMATIC_POSITION.x = x;
  KINEMATIC_POSITION.y = y;
  KINEMATIC_POSITION.z = z;
  body.moveKinematic(KINEMATIC_POSITION, rotation, deltaTime);
}

function applyGravityToDynamics(deltaTime: number): void {
  if (!usesCustomGravityField()) return;

  for (const body of dynamicBodies) {
    if (!body.valid || body.motionType() !== "dynamic") continue;
    const translation = body.translation();
    TEMP_VEC_A.set(translation.x, translation.y, translation.z);
    GRAVITY_IMPULSE.copy(gravityField(TEMP_VEC_A)).multiplyScalar(body.mass() * body.gravityFactor() * deltaTime);
    body.applyImpulse(GRAVITY_IMPULSE);
  }
}

function usesCustomGravityField(): boolean {
  return (
    demoSettings.character.enableCustomGravity ||
    demoSettings.vehicles.vehicle1.enableCustomGravity ||
    demoSettings.vehicles.vehicle2.enableCustomGravity ||
    demoSettings.vehicles.vehicle3.enableCustomGravity
  );
}

function setKey(event: KeyboardEvent, pressed: boolean): void {
  if (event.code === "KeyW") keyState.W = pressed;
  else if (event.code === "KeyS") keyState.S = pressed;
  else if (event.code === "KeyA") keyState.A = pressed;
  else if (event.code === "KeyD") keyState.D = pressed;
  else if (event.code === "Space") {
    keyState.Space = pressed;
    if (pressed) event.preventDefault();
  } else if (event.code === "ShiftLeft" || event.code === "ShiftRight") keyState.Shift = pressed;
  else if (event.code === "ArrowUp") keyState.Up = pressed;
  else if (event.code === "ArrowDown") keyState.Down = pressed;
  else if (event.code === "ArrowLeft") keyState.Left = pressed;
  else if (event.code === "ArrowRight") keyState.Right = pressed;
}

function resize(): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function collectMeshes(gltf: GLTF): MeshMap {
  const meshes: MeshMap = new Map();
  gltf.scene.traverse((object) => {
    if (object instanceof Mesh && object.geometry instanceof BufferGeometry) meshes.set(object.name, object);
  });
  return meshes;
}

function getMesh(map: MeshMap, name: string): Mesh<BufferGeometry, Material | Material[]> {
  const mesh = map.get(name);
  if (!mesh) throw new Error(`Missing GLB mesh ${name}`);
  return mesh;
}

function cloneNodeMesh(name: string, material: MeshStandardMaterial): Mesh<BufferGeometry, MeshStandardMaterial> {
  const source = getMesh(testMapNodes, name);
  const mesh = new Mesh(source.geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cloneVehicleMesh(name: string): Mesh<BufferGeometry, Material | Material[]> {
  const source = getMesh(vehicleNodes, name);
  const mesh = new Mesh(source.geometry, source.material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function freezeStaticObject(object: Object3D): void {
  object.updateMatrix();
  object.matrixAutoUpdate = false;
}

function geometryShape(name: string): ShapeInput {
  const cached = meshShapeCache.get(name);
  if (cached) return cached;
  const shape = shapeFromGeometry(getMesh(testMapNodes, name).geometry);
  meshShapeCache.set(name, shape);
  return shape;
}

function convexHullShape(name: string): ShapeInput {
  const cached = convexHullShapeCache.get(name);
  if (cached) return cached;
  const shape = convexHullFromGeometry(getMesh(testMapNodes, name).geometry);
  convexHullShapeCache.set(name, shape);
  return shape;
}

function cuboidShape(name: string): ShapeInput {
  const cached = cuboidShapeCache.get(name);
  if (cached) return cached;
  const shape = cuboidFromGeometry(getMesh(testMapNodes, name).geometry);
  cuboidShapeCache.set(name, shape);
  return shape;
}

function convexHullFromGeometry(geometry: BufferGeometry): ShapeInput {
  const position = geometry.getAttribute("position");
  if (!position) throw new Error("Geometry is missing positions");
  const vertices = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    vertices[index * 3] = position.getX(index);
    vertices[index * 3 + 1] = position.getY(index);
    vertices[index * 3 + 2] = position.getZ(index);
  }
  return Shape.convexHull({ points: vertices });
}

function cuboidFromGeometry(geometry: BufferGeometry): ShapeInput {
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const boundingBox = geometry.boundingBox;
  if (!boundingBox) throw new Error("Geometry is missing bounds");
  const size = new Vector3();
  const center = new Vector3();
  boundingBox.getSize(size);
  boundingBox.getCenter(center);
  const box = Shape.box({ halfExtents: [size.x / 2, size.y / 2, size.z / 2], convexRadius: 0 });
  return center.lengthSq() > 1e-10
    ? Shape.compound([{ shape: box, position: [center.x, center.y, center.z] }])
    : box;
}

function shapeFromGeometry(geometry: BufferGeometry): ShapeInput {
  const position = geometry.getAttribute("position");
  if (!position) throw new Error("Geometry is missing positions");
  const vertices = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    vertices[index * 3] = position.getX(index);
    vertices[index * 3 + 1] = position.getY(index);
    vertices[index * 3 + 2] = position.getZ(index);
  }
  const indexAttribute = geometry.index;
  const indices = indexAttribute
    ? new Uint32Array(indexAttribute.array)
    : Uint32Array.from({ length: position.count }, (_, index) => index);
  return Shape.mesh({ vertices, indices });
}

function findMaterial(root: Object3D, name: string): MeshStandardMaterial | null {
  let found: MeshStandardMaterial | null = null;
  root.traverse((object) => {
    if (found || !(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material instanceof MeshStandardMaterial && material.name === name) {
        found = material;
        return;
      }
    }
  });
  return found;
}

function styleCharacterMaterial(materialOrMaterials: Material | Material[]): void {
  const materials = Array.isArray(materialOrMaterials) ? materialOrMaterials : [materialOrMaterials];
  for (const material of materials) {
    if (!(material instanceof MeshStandardMaterial)) continue;
    material.side = FrontSide;
    if (material.name === "M_Joints") material.color = new Color(0x00ffff);
    if (material.name === "M_Main") material.color = new Color(0xdedede);
  }
}

function syncBodyObject(body: Body, object: Object3D): void {
  const pos = body.translation();
  const rot = body.rotation();
  object.position.set(pos.x, pos.y, pos.z);
  object.quaternion.set(rot.x, rot.y, rot.z, rot.w);
  object.updateMatrix();
}

function syncInstancedBodies(): void {
  for (const item of instancedRenderBodies) {
    const pos = item.body.translation();
    const rot = item.body.rotation();
    INSTANCE_POSITION.set(pos.x, pos.y, pos.z);
    INSTANCE_QUATERNION.set(rot.x, rot.y, rot.z, rot.w);
    INSTANCE_MATRIX.compose(INSTANCE_POSITION, INSTANCE_QUATERNION, INSTANCE_SCALE);
    item.mesh.setMatrixAt(item.index, INSTANCE_MATRIX);
  }
  for (const mesh of instancedRenderMeshes) mesh.instanceMatrix.needsUpdate = true;
}

function createInstanceStack(options: {
  pos: [number, number, number];
  rows: number;
  rowStep: [number, number, number];
  itemStep: [number, number, number];
  startCount: number;
  countStep: number;
  rotation?: [number, number, number];
}): { position: [number, number, number]; rotation: [number, number, number] }[] {
  const instances: { position: [number, number, number]; rotation: [number, number, number] }[] = [];
  const rotation = options.rotation ?? [0, 0, 0];
  for (let row = 0; row < options.rows; row += 1) {
    const countInRow = options.startCount + row * options.countStep;
    const rowStart: [number, number, number] = [
      options.pos[0] + row * options.rowStep[0],
      options.pos[1] + row * options.rowStep[1],
      options.pos[2] + row * options.rowStep[2]
    ];
    for (let column = 0; column < countInRow; column += 1) {
      instances.push({
        position: [
          rowStart[0] + column * options.itemStep[0],
          rowStart[1] + column * options.itemStep[1],
          rowStart[2] + column * options.itemStep[2]
        ],
        rotation
      });
    }
  }
  return instances;
}

function vectorToTuple(input: Vector3): [number, number, number] {
  return [input.x, input.y, input.z];
}

function quaternionTuple(input: Quaternion): [number, number, number, number] {
  return [input.x, input.y, input.z, input.w];
}

function vectorInputToVector(input: Vector3Input, out = new Vector3()): Vector3 {
  return "x" in input
    ? out.set(input.x, input.y, input.z)
    : out.set(input[0] ?? 0, input[1] ?? 0, input[2] ?? 0);
}

function quaternionInputToQuaternion(input: QuaternionInput, out = new Quaternion()): Quaternion {
  return "x" in input
    ? out.set(input.x, input.y, input.z, input.w)
    : out.set(input[0] ?? 0, input[1] ?? 0, input[2] ?? 0, input[3] ?? 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function positioned<T extends Object3D>(object: T, x: number, y: number, z: number): T {
  object.position.set(x, y, z);
  return object;
}

function orientDisc(mesh: Object3D, position: Vector3, up: Vector3, radius: number): void {
  mesh.position.copy(position);
  mesh.quaternion.setFromUnitVectors(FIXED_Z, TEMP_VEC_F.copy(up).normalize());
  mesh.scale.setScalar(radius);
}

function orientGroupToDirection(group: Object3D, direction: Vector3, up: Vector3): void {
  if (direction.lengthSq() <= 1e-8) return;
  LOOK_MATRIX.lookAt(FIXED_ORIGIN, TEMP_VEC_F.copy(direction).normalize(), TEMP_VEC_G.copy(up).normalize());
  group.quaternion.setFromRotationMatrix(LOOK_MATRIX);
}

function setArrow(arrow: ArrowHelper, direction: Vector3, length: number): void {
  if (length <= 1e-6 || direction.lengthSq() <= 1e-8) {
    arrow.setLength(0);
    return;
  }
  arrow.setDirection(TEMP_VEC_F.copy(direction).normalize());
  arrow.setLength(length);
}

function fail(message: string): never {
  throw new Error(message);
}
