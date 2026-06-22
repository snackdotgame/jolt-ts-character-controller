import { Body, Shape, type MotionQuality, type ShapeCastHit, type RayHit, type World } from "jolt-ts";
import { Quaternion, Vector3 } from "three";
import { bakeCurveLUT, evaluateCurveLUT, type CurveData, type CurveLUT } from "./curves.js";
import { clamp, createSlerpVec3, vectorFromLike } from "./math.js";
import type { EcctrlUserDataType, GroundDetectionMode, MovementInput, QuaternionLike, Vector3Like } from "./types.js";

const DEFAULT_CURVE_DATA: CurveData = {
  points: [
    { x: 0, y: 0, r_out: 0 },
    { x: 0.5, y: 0, r_in: 0, r_out: 0 },
    { x: 1, y: 1, r_in: 0 }
  ]
};

export interface EcctrlJoltRuntimeOptions {
  world: World;
  body?: Body;
  position?: readonly [number, number, number] | Vector3Like;
  rotation?: readonly [number, number, number, number] | QuaternionLike;
  layer?: string | number;
  friction?: number;
  density?: number;
  mass?: number;
  linearDamping?: number;
  angularDamping?: number;
  gravityFactor?: number;
  motionQuality?: MotionQuality;
  allowSleeping?: boolean;
}

export interface EcctrlJoltControllerOptions extends EcctrlJoltRuntimeOptions {
  enable?: boolean;
  capsuleHalfHeight?: number;
  capsuleRadius?: number;
  lockForward?: boolean;
  useCustomForward?: boolean;
  useCharacterUpAxis?: boolean;
  enableCustomGravity?: boolean;
  gravityField?: (position: Vector3) => Vector3Like;
  gravityDirLerpSpeed?: number;
  maxWalkVel?: number;
  maxRunVel?: number;
  accDeltaTime?: number;
  decDeltaTime?: number;
  rejectVelFactor?: number;
  moveImpulsePointOffset?: number;
  jumpVel?: number;
  jumpDuration?: number;
  slopeJumpFactor?: number;
  airDragFactor?: number;
  slideGripFactor?: number;
  fallingGravityScale?: number;
  fallingMaxVel?: number;
  enableToggleRun?: boolean;
  groundDetection?: GroundDetectionMode;
  slopeMaxAngle?: number;
  floatHeight?: number;
  rayOriginOffest?: number;
  rayHitForgiveness?: number;
  rayLength?: number;
  rayRadius?: number;
  springK?: number;
  dampingC?: number;
  autoBalance?: boolean;
  autoBalanceSpringK?: number;
  autoBalanceDampingC?: number;
  autoBalanceSpringOnY?: number;
  autoBalanceDampingOnY?: number;
  followPlatform?: boolean;
  massRatioFallOffCurveData?: CurveData;
  applyCounterMass?: boolean;
  applyCounterJumpImp?: boolean;
  counterJumpImpFactor?: number;
  applyCounterMoveImp?: boolean;
  counterMoveImpFactor?: number;
}

export interface EcctrlJoltControllerSnapshot {
  readonly position: Vector3Like;
  readonly rotation: QuaternionLike;
  readonly linearVelocity: Vector3Like;
  readonly angularVelocity: Vector3Like;
  readonly inputDirection: Vector3Like;
  readonly forwardDirection: Vector3Like;
  readonly rightwardDirection: Vector3Like;
  readonly movingDirection: Vector3Like;
  readonly relativeVelocity: Vector3Like;
  readonly moveImpulse: Vector3Like;
  readonly floatingImpulse: Vector3Like;
  readonly dragFrictionImpulse: Vector3Like;
  readonly bodyXAxis: Vector3Like;
  readonly bodyYAxis: Vector3Like;
  readonly bodyZAxis: Vector3Like;
  readonly upAxis: Vector3Like;
  readonly gravityDir: Vector3Like;
  readonly gravityMag: number;
  readonly standPoint: Vector3Like;
  readonly standNormal: Vector3Like;
  readonly groundHitDistance: number;
  readonly groundFloatingDistance: number;
  readonly standBody: Body | null;
  readonly standCollider: Body | null;
  readonly isOnGround: boolean;
  readonly wasOnGround: boolean;
  readonly isFalling: boolean;
  readonly isOnPlatform: boolean;
  readonly slopeAngle: number;
  readonly actualSlopeAngle: number;
  readonly standFriction: number;
  readonly slideFriction: number;
  readonly isMoving: boolean;
  readonly moveSpeed: number;
  readonly verticalSpeed: number;
  readonly runActive: boolean;
  readonly jumpActive: boolean;
  readonly lockForward: boolean;
}

// The minimal mutable state needed to reproduce a controller deterministically:
// the rigid-body pose/velocity plus the few internal fields that carry between
// steps (ground/jump latches and the gravity direction). Everything else in the
// snapshot is re-derived each step. Designed to be trivially (de)serialized for
// network sync — see the host app's binary codec.
export interface EcctrlSyncState {
  position: [number, number, number];
  linearVelocity: [number, number, number];
  rotation: [number, number, number, number];
  angularVelocity: [number, number, number];
  gravityDir: [number, number, number];
  onGround: boolean;
  canJump: boolean;
  jumpActive: boolean; // a jump impulse is mid-application
  jumpElapsed: number; // seconds the active jump has been applied
}

export const DEFAULT_ECCTRL_OPTIONS = {
  enable: true,
  capsuleHalfHeight: 0.3,
  capsuleRadius: 0.3,
  lockForward: false,
  useCustomForward: false,
  useCharacterUpAxis: false,
  enableCustomGravity: false,
  gravityDirLerpSpeed: 6,
  maxWalkVel: 2,
  maxRunVel: 5,
  accDeltaTime: 0.2,
  decDeltaTime: 0.2,
  rejectVelFactor: 1,
  moveImpulsePointOffset: 0.5,
  jumpVel: 5,
  jumpDuration: 0.1,
  slopeJumpFactor: 0,
  airDragFactor: 0.1,
  slideGripFactor: 0.5,
  fallingGravityScale: 3,
  fallingMaxVel: 20,
  enableToggleRun: true,
  groundDetection: "shapeCast" as GroundDetectionMode,
  slopeMaxAngle: Math.PI / 2.5,
  floatHeight: 0.2,
  rayHitForgiveness: 0.28,
  springK: 80,
  dampingC: 6,
  autoBalance: true,
  autoBalanceSpringK: 0.5,
  autoBalanceDampingC: 0.03,
  autoBalanceSpringOnY: 0.08,
  autoBalanceDampingOnY: 0.006,
  followPlatform: true,
  massRatioFallOffCurveData: DEFAULT_CURVE_DATA,
  applyCounterMass: true,
  applyCounterJumpImp: true,
  counterJumpImpFactor: 1,
  applyCounterMoveImp: true,
  counterMoveImpFactor: 1,
  allowSleeping: true
};

type ResolvedOptions = typeof DEFAULT_ECCTRL_OPTIONS & {
  rayOriginOffest: number;
  rayLength: number;
  rayRadius: number;
  gravityField: (position: Vector3) => Vector3Like;
};

export function createEcctrlJoltBody(options: EcctrlJoltRuntimeOptions & {
  capsuleHalfHeight?: number;
  capsuleRadius?: number;
}): Body {
  const capsuleHalfHeight = options.capsuleHalfHeight ?? DEFAULT_ECCTRL_OPTIONS.capsuleHalfHeight;
  const capsuleRadius = options.capsuleRadius ?? DEFAULT_ECCTRL_OPTIONS.capsuleRadius;
  return options.world.createBody({
    type: "dynamic",
    shape: Shape.capsule({ halfHeight: capsuleHalfHeight, radius: capsuleRadius }),
    position: vectorInput(options.position ?? [0, 1, 0]),
    rotation: quaternionInput(options.rotation),
    layer: options.layer ?? "moving",
    friction: options.friction ?? -0.5,
    density: options.mass === undefined ? options.density : undefined,
    mass: options.mass,
    linearDamping: options.linearDamping,
    angularDamping: options.angularDamping,
    gravityFactor: options.gravityFactor ?? 1,
    motionQuality: options.motionQuality,
    allowSleeping: options.allowSleeping ?? true
  });
}

export class EcctrlJoltController {
  readonly world: World;
  readonly body: Body;
  readonly options: ResolvedOptions;

  private readonly movementState: Required<Pick<MovementInput, "forward" | "backward" | "leftward" | "rightward" | "run" | "jump">> & {
    joystick: { x: number; y: number };
  } = {
    forward: false,
    backward: false,
    leftward: false,
    rightward: false,
    joystick: { x: 0, y: 0 },
    run: false,
    jump: false
  };

  private readonly fixedXAxis = new Vector3(1, 0, 0);
  private readonly fixedYAxis = new Vector3(0, 1, 0);
  private readonly fixedZAxis = new Vector3(0, 0, 1);
  private readonly characterXAxis = new Vector3(1, 0, 0);
  private readonly characterYAxis = new Vector3(0, 1, 0);
  private readonly characterZAxis = new Vector3(0, 0, 1);
  private readonly upAxisVec = new Vector3(0, 1, 0);
  private readonly referenceGravity = new Vector3(0, -9.81, 0);
  private readonly referenceGravityDir = new Vector3(0, -1, 0);
  private readonly gravityDirection = new Vector3(0, -1, 0);
  private readonly slerpVec3 = createSlerpVec3();
  private readonly relativeVelocity = new Vector3();
  private readonly relativeVelocityOnPlane = new Vector3();
  private readonly relativeVelocityOnUp = new Vector3();
  private readonly currentPos = new Vector3();
  private readonly currentVel = new Vector3();
  private readonly currentVelOnPlane = new Vector3();
  private readonly currentVelOnUp = new Vector3();
  private readonly currentAngVel = new Vector3();
  private readonly currentAngVelOnPlane = new Vector3();
  private readonly currentAngVelOnUp = new Vector3();
  private readonly currentQuat = new Quaternion();
  private readonly balanceCrossAxis = new Vector3();
  private readonly turnCrossAxis = new Vector3();
  private readonly turnOnYAxis = new Vector3();
  private readonly turnOnYQuaternion = new Quaternion();
  private readonly forwardDirection = new Vector3(0, 0, 1);
  private readonly cameraUpDirection = new Vector3(0, 1, 0);
  private readonly cameraRightDirection = new Vector3();
  private readonly rightwardDirection = new Vector3(1, 0, 0);
  private readonly inputDirectionVec = new Vector3();
  private readonly lastInputDir = new Vector3();
  private readonly baseImpulse = new Vector3();
  private readonly moveImpulseVec = new Vector3();
  private readonly moveImpulsePoint = new Vector3();
  private readonly moveImpulseToGround = new Vector3();
  private readonly movingDirectionVec = new Vector3();
  private readonly movingDirCrossAxis = new Vector3();
  private readonly wantToMoveVel = new Vector3();
  private readonly rejectVel = new Vector3();
  private readonly jumpDirection = new Vector3();
  private readonly jumpVelocityVec = new Vector3();
  private readonly jumpImpulseToGround = new Vector3();
  private readonly dragFrictionImpulseVec = new Vector3();
  private readonly springDistVec = new Vector3();
  private readonly dampingVelVec = new Vector3();
  private readonly floatingForce = new Vector3();
  private readonly floatingImpulseVec = new Vector3();
  private readonly rayOrigin = new Vector3();
  private readonly groundHitOrigin = new Vector3();
  private readonly rayDirection = new Vector3(0, -1, 0);
  private readonly castDirection = new Vector3();
  private readonly customGravityImpulse = new Vector3();
  private readonly actualSlopeNormalVec = new Vector3(0, 1, 0);
  private readonly standingPoint = new Vector3();
  private readonly characterMassImpulse = new Vector3();
  private readonly movingObjectPosition = new Vector3();
  private readonly movingObjectVelocity = new Vector3();
  private readonly movingObjectVelocityOnPlane = new Vector3();
  private readonly movingObjectVelocityOnUp = new Vector3();
  private readonly movingObjectLinearVelocity = new Vector3();
  private readonly movingObjectAngularVelocity = new Vector3();
  private readonly movingObjectAngularVelocityAxis = new Vector3();
  private readonly distanceFromCharacterToObjectPoint = new Vector3();
  private readonly movingObjectAngvelToLinvel = new Vector3();
  private massRatioFallOffCurve: CurveLUT;

  private referenceGravityMag = 9.81;
  private initialGravityFactor: number;
  private isZeroGravity = false;
  private isOnGroundValue = false;
  private wasOnGroundValue = false;
  private jumpElapsedTime = 0;
  private jumpActiveValue = false;
  private canJumpAgain = true;
  private runActiveValue = false;
  private canRunAgain = false;
  private isFallingValue = false;
  private rayHitBodyValue: Body | null = null;
  private groundHitDistance = 0;
  private groundFloatingDistance = 0;
  private slopeAngleInFront = 0;
  private actualSlopeAngleValue = 0;
  private massRatio = 1;
  private isOnMovingObjectValue = false;
  private slideFrictionCoef = 0;
  private standingPointFriction = 0;
  private movingObjectAngularVelocityValue = 0;
  private isLockForwardValue: boolean;

  constructor(options: EcctrlJoltControllerOptions) {
    this.world = options.world;
    this.options = resolveOptions(options);
    this.body = options.body ?? createEcctrlJoltBody({
      world: options.world,
      position: options.position,
      rotation: options.rotation,
      layer: options.layer,
      friction: options.friction,
      density: options.density,
      mass: options.mass,
      linearDamping: options.linearDamping,
      angularDamping: options.angularDamping,
      gravityFactor: options.gravityFactor,
      motionQuality: options.motionQuality,
      allowSleeping: options.allowSleeping,
      capsuleHalfHeight: this.options.capsuleHalfHeight,
      capsuleRadius: this.options.capsuleRadius
    });
    this.initialGravityFactor = options.gravityFactor ?? 1;
    this.isLockForwardValue = this.options.lockForward;
    this.massRatioFallOffCurve = bakeCurveLUT(
      this.options.massRatioFallOffCurveData.points,
      this.options.massRatioFallOffCurveData.samples ?? 50
    );
  }

  setMovement(movement: MovementInput): void {
    if (movement.forward !== undefined) this.movementState.forward = movement.forward;
    if (movement.backward !== undefined) this.movementState.backward = movement.backward;
    if (movement.leftward !== undefined) this.movementState.leftward = movement.leftward;
    if (movement.rightward !== undefined) this.movementState.rightward = movement.rightward;
    if (movement.joystick) {
      this.movementState.joystick.x = movement.joystick.x;
      this.movementState.joystick.y = movement.joystick.y;
    }
    if (movement.run !== undefined) this.movementState.run = movement.run;
    if (movement.jump !== undefined) this.movementState.jump = movement.jump;
  }

  setLockForward(lock: boolean): void {
    this.isLockForwardValue = lock;
  }

  setForwardDir(direction: Vector3Like, cameraUp?: Vector3Like): void {
    this.setForwardDirection(direction, cameraUp);
  }

  setForwardDirection(direction: Vector3Like, cameraUp?: Vector3Like): void {
    vectorFromLike(direction, this.forwardDirection);
    if (cameraUp) vectorFromLike(cameraUp, this.cameraUpDirection);
  }

  refreshMassRatioFallOffCurve(): void {
    this.massRatioFallOffCurve = bakeCurveLUT(
      this.options.massRatioFallOffCurveData.points,
      this.options.massRatioFallOffCurveData.samples ?? 50
    );
  }

  update(deltaTime: number): EcctrlJoltControllerSnapshot {
    this.step(deltaTime);
    return this.snapshot();
  }

  step(deltaTime: number): void {
    if (!this.options.enable || !this.body.valid) return;

    this.updateCharacterInfo();
    const forward = this.movementState.forward;
    const backward = this.movementState.backward;
    const leftward = this.movementState.leftward;
    const rightward = this.movementState.rightward;
    const run = this.getRunState(this.movementState.run);
    const jump = this.getJumpState(this.movementState.jump, deltaTime);
    const joystick = this.movementState.joystick;
    const hasControlInput =
      forward ||
      backward ||
      leftward ||
      rightward ||
      jump ||
      Math.abs(joystick.x) > 1e-4 ||
      Math.abs(joystick.y) > 1e-4;

    if (!this.body.isActive() && (this.isOnMovingObjectValue || hasControlInput)) {
      this.body.wakeUp();
    }
    if (!this.body.isActive() && this.options.allowSleeping && this.shouldWakeSleepingBodyForFloat()) {
      this.body.wakeUp();
    }
    if (!this.body.isActive()) return;

    const frameRateCorrection = 60 * deltaTime;
    this.updateGravityInfo(deltaTime);
    this.updateForwardDirection();
    this.setInputDirection(forward, backward, rightward, leftward, joystick);
    const hasMoveInput = this.inputDirectionVec.lengthSq() > 0;

    if (this.options.autoBalance && !this.isZeroGravity) this.autoBalanceCharacter(frameRateCorrection);
    this.floatCharacter();
    this.syncBodySleepingPermission();
    this.isOnMovingObjectDetect(deltaTime);
    this.computeRelativeVelocity();
    this.applyFloatingForce(deltaTime);
    this.applyMassOnStandCollider(deltaTime);
    this.slopeDetect();
    this.zeroGravityDetect();
    this.fallDetect();
    if (!hasMoveInput) this.applyFriction(frameRateCorrection);
    this.applyDynamicGravity();
    if (jump && this.isOnGroundValue) this.applyJumpImpulse();

    if (this.isLockForwardValue) {
      if (!this.isZeroGravity) this.turnCharacter(this.forwardDirection, frameRateCorrection);
      if (hasMoveInput) this.moveCharacter(run, frameRateCorrection);
      this.lastInputDir.copy(this.forwardDirection);
    } else if (hasMoveInput) {
      if (!this.isZeroGravity) this.turnCharacter(this.inputDirectionVec, frameRateCorrection);
      this.moveCharacter(run, frameRateCorrection);
      this.lastInputDir.copy(this.inputDirectionVec);
    } else {
      if (this.lastInputDir.lengthSq() === 0) this.lastInputDir.copy(this.characterZAxis);
      if (!this.isZeroGravity) {
        const direction = this.isOnMovingObjectValue && this.options.followPlatform
          ? this.lastInputDir.applyQuaternion(this.turnOnYQuaternion)
          : this.lastInputDir;
        this.turnCharacter(direction, frameRateCorrection);
      }
      this.movingDirectionVec.copy(this.lastInputDir);
    }

    return;
  }

  snapshot(): EcctrlJoltControllerSnapshot {
    return {
      position: cloneVector(this.currentPos),
      rotation: cloneQuaternion(this.currentQuat),
      linearVelocity: cloneVector(this.currentVel),
      angularVelocity: cloneVector(this.currentAngVel),
      inputDirection: cloneVector(this.inputDirectionVec),
      forwardDirection: cloneVector(this.forwardDirection),
      rightwardDirection: cloneVector(this.rightwardDirection),
      movingDirection: cloneVector(this.movingDirectionVec),
      relativeVelocity: cloneVector(this.relativeVelocity),
      moveImpulse: cloneVector(this.moveImpulseVec),
      floatingImpulse: cloneVector(this.floatingImpulseVec),
      dragFrictionImpulse: cloneVector(this.dragFrictionImpulseVec),
      bodyXAxis: cloneVector(this.characterXAxis),
      bodyYAxis: cloneVector(this.characterYAxis),
      bodyZAxis: cloneVector(this.characterZAxis),
      upAxis: cloneVector(this.referenceUpAxis),
      gravityDir: cloneVector(this.gravityDirection),
      gravityMag: this.referenceGravityMag,
      standPoint: cloneVector(this.standingPoint),
      standNormal: cloneVector(this.actualSlopeNormalVec),
      groundHitDistance: this.groundHitDistance,
      groundFloatingDistance: this.groundFloatingDistance,
      standBody: this.rayHitBodyValue,
      standCollider: this.rayHitBodyValue,
      isOnGround: this.isOnGroundValue,
      wasOnGround: this.wasOnGroundValue,
      isFalling: this.isFallingValue,
      isOnPlatform: this.isOnMovingObjectValue,
      slopeAngle: this.slopeAngleInFront,
      actualSlopeAngle: this.actualSlopeAngleValue,
      standFriction: this.standingPointFriction,
      slideFriction: this.slideFrictionCoef,
      isMoving: this.inputDirectionVec.lengthSq() > 1e-6,
      moveSpeed: this.relativeVelocityOnPlane.length(),
      verticalSpeed: this.relativeVelocityOnUp.dot(this.referenceUpAxis),
      runActive: this.runActiveValue,
      jumpActive: this.jumpActiveValue,
      lockForward: this.isLockForwardValue
    };
  }

  // Capture the full deterministic state (body pose/velocity + internal
  // latches) so it can be serialized and restored exactly elsewhere.
  getSyncState(): EcctrlSyncState {
    const p = this.body.translation();
    const r = this.body.rotation();
    const v = this.body.linearVelocity();
    const a = this.body.angularVelocity();
    const g = this.gravityDirection;
    return {
      position: [p.x, p.y, p.z],
      linearVelocity: [v.x, v.y, v.z],
      rotation: [r.x, r.y, r.z, r.w],
      angularVelocity: [a.x, a.y, a.z],
      gravityDir: [g.x, g.y, g.z],
      onGround: this.isOnGroundValue,
      canJump: this.canJumpAgain,
      jumpActive: this.jumpActiveValue,
      jumpElapsed: this.jumpElapsedTime
    };
  }

  // Restore a previously captured state: teleport the body, reset the internal
  // latches, and refresh the cached snapshot vectors so a read right after is
  // consistent. Used for client reconciliation / rollback.
  applySyncState(state: EcctrlSyncState): void {
    this.body.setTranslation(state.position);
    this.body.setRotation(state.rotation);
    this.body.setLinearVelocity(state.linearVelocity[0], state.linearVelocity[1], state.linearVelocity[2]);
    this.body.setAngularVelocity(
      state.angularVelocity[0],
      state.angularVelocity[1],
      state.angularVelocity[2]
    );
    this.gravityDirection.set(state.gravityDir[0], state.gravityDir[1], state.gravityDir[2]);
    this.isOnGroundValue = state.onGround;
    this.wasOnGroundValue = state.onGround;
    this.canJumpAgain = state.canJump;
    this.jumpActiveValue = state.jumpActive;
    this.jumpElapsedTime = state.jumpElapsed;
    this.currentPos.set(state.position[0], state.position[1], state.position[2]);
    this.currentVel.set(state.linearVelocity[0], state.linearVelocity[1], state.linearVelocity[2]);
    this.currentQuat.set(state.rotation[0], state.rotation[1], state.rotation[2], state.rotation[3]);
    this.currentAngVel.set(
      state.angularVelocity[0],
      state.angularVelocity[1],
      state.angularVelocity[2]
    );
  }

  get input(): MovementInput {
    return this.movementState;
  }

  get currPos(): Vector3 {
    return this.currentPos;
  }

  get currQuat(): Quaternion {
    return this.currentQuat;
  }

  get currLinVel(): Vector3 {
    return this.currentVel;
  }

  get currAngVel(): Vector3 {
    return this.currentAngVel;
  }

  get inputDirection(): Vector3 {
    return this.inputDirectionVec;
  }

  get inputDir(): Vector3 {
    return this.inputDirectionVec;
  }

  get forwardDir(): Vector3 {
    return this.forwardDirection;
  }

  get movingDirection(): Vector3 {
    return this.movingDirectionVec;
  }

  get relativeVel(): Vector3 {
    return this.relativeVelocity;
  }

  get relativeVelOnPlane(): Vector3 {
    return this.relativeVelocityOnPlane;
  }

  get relativeVelOnUp(): Vector3 {
    return this.relativeVelocityOnUp;
  }

  get moveImpulse(): Vector3 {
    return this.moveImpulseVec;
  }

  get floatingImpulse(): Vector3 {
    return this.floatingImpulseVec;
  }

  get dragFrictionImpulse(): Vector3 {
    return this.dragFrictionImpulseVec;
  }

  get bodyXAxis(): Vector3 {
    return this.characterXAxis;
  }

  get bodyYAxis(): Vector3 {
    return this.characterYAxis;
  }

  get bodyZAxis(): Vector3 {
    return this.characterZAxis;
  }

  get upAxis(): Vector3 {
    return this.referenceUpAxis;
  }

  get gravityDir(): Vector3 {
    return this.gravityDirection;
  }

  get gravityMag(): number {
    return this.referenceGravityMag;
  }

  get standBody(): Body | null {
    return this.rayHitBodyValue;
  }

  get standCollider(): Body | null {
    return this.rayHitBodyValue;
  }

  get standPoint(): Vector3 {
    return this.standingPoint;
  }

  get standNormal(): Vector3 {
    return this.actualSlopeNormalVec;
  }

  get groundHitDistanceValue(): number {
    return this.groundHitDistance;
  }

  get groundFloatingDistanceValue(): number {
    return this.groundFloatingDistance;
  }

  get isOnGround(): boolean {
    return this.isOnGroundValue;
  }

  get isFalling(): boolean {
    return this.isFallingValue;
  }

  get isOnPlatform(): boolean {
    return this.isOnMovingObjectValue;
  }

  get slopeAngle(): number {
    return this.slopeAngleInFront;
  }

  get actualSlopeAngle(): number {
    return this.actualSlopeAngleValue;
  }

  get standFriction(): number {
    return this.standingPointFriction;
  }

  get slideFriction(): number {
    return this.slideFrictionCoef;
  }

  get isMoving(): boolean {
    return this.inputDirectionVec.lengthSq() > 1e-6;
  }

  get moveSpeed(): number {
    return this.relativeVelocityOnPlane.length();
  }

  get verticalSpeed(): number {
    return this.relativeVelocityOnUp.dot(this.referenceUpAxis);
  }

  get runActive(): boolean {
    return this.runActiveValue;
  }

  get jumpActive(): boolean {
    return this.jumpActiveValue;
  }

  get lockForward(): boolean {
    return this.isLockForwardValue;
  }

  get turnOnYQuat(): Quaternion {
    return this.turnOnYQuaternion;
  }

  private get referenceUpAxis(): Vector3 {
    return this.options.useCharacterUpAxis ? this.characterYAxis : this.upAxisVec;
  }

  private updateCharacterInfo(): void {
    vectorFromLike(this.body.translation(), this.currentPos);
    const rotation = this.body.rotation();
    this.currentQuat.set(rotation.x, rotation.y, rotation.z, rotation.w);

    this.characterYAxis.copy(this.fixedYAxis).applyQuaternion(this.currentQuat);
    this.characterXAxis.copy(this.fixedXAxis).applyQuaternion(this.currentQuat);
    this.characterZAxis.copy(this.fixedZAxis).applyQuaternion(this.currentQuat);

    vectorFromLike(this.body.linearVelocity(), this.currentVel);
    this.currentVelOnPlane.copy(this.currentVel).projectOnPlane(this.referenceUpAxis);
    this.currentVelOnUp.copy(this.currentVel).projectOnVector(this.referenceUpAxis);

    vectorFromLike(this.body.angularVelocity(), this.currentAngVel);
    this.currentAngVelOnPlane.copy(this.currentAngVel).projectOnPlane(this.characterYAxis);
    this.currentAngVelOnUp.copy(this.currentAngVel).projectOnVector(this.characterYAxis);
  }

  private updateForwardDirection(): void {
    if (!this.options.useCustomForward) {
      this.cameraRightDirection.crossVectors(this.forwardDirection, this.cameraUpDirection).normalize();
      this.forwardDirection.crossVectors(this.referenceUpAxis, this.cameraRightDirection);
      if (this.forwardDirection.lengthSq() === 0) this.forwardDirection.copy(this.characterZAxis);
    } else {
      this.forwardDirection.projectOnPlane(this.referenceUpAxis);
      if (this.forwardDirection.lengthSq() === 0) this.forwardDirection.copy(this.characterZAxis);
      this.forwardDirection.normalize();
    }
    this.rightwardDirection.crossVectors(this.forwardDirection, this.referenceUpAxis);
    if (this.rightwardDirection.lengthSq() === 0) this.rightwardDirection.copy(this.characterXAxis);
    this.rightwardDirection.normalize();
  }

  private setInputDirection(
    forward: boolean,
    backward: boolean,
    rightward: boolean,
    leftward: boolean,
    joystick: { x: number; y: number }
  ): void {
    this.inputDirectionVec.set(0, 0, 0);
    if (joystick.x !== 0 || joystick.y !== 0) {
      this.inputDirectionVec
        .addScaledVector(this.forwardDirection, joystick.y)
        .addScaledVector(this.rightwardDirection, joystick.x);
    } else {
      if (forward) this.inputDirectionVec.add(this.forwardDirection);
      if (backward) this.inputDirectionVec.sub(this.forwardDirection);
      if (leftward) this.inputDirectionVec.sub(this.rightwardDirection);
      if (rightward) this.inputDirectionVec.add(this.rightwardDirection);
    }
    this.inputDirectionVec.normalize();
  }

  private moveCharacter(run: boolean, fpsCorr: number): void {
    this.movingDirCrossAxis.crossVectors(this.inputDirectionVec, this.referenceUpAxis);
    this.movingDirectionVec.copy(this.inputDirectionVec).applyAxisAngle(this.movingDirCrossAxis, this.slopeAngleInFront);
    this.wantToMoveVel.copy(this.relativeVelocityOnPlane).projectOnVector(this.inputDirectionVec);
    this.rejectVel
      .copy(this.relativeVelocityOnPlane)
      .sub(this.wantToMoveVel)
      .multiplyScalar(this.isOnGroundValue ? this.options.rejectVelFactor : 0);

    const multiplier =
      this.body.mass() *
      clamp(this.options.accDeltaTime, 0, 1) *
      (this.isOnGroundValue ? this.slideFrictionCoef : this.options.airDragFactor) *
      (this.actualSlopeAngleValue > this.options.slopeMaxAngle ? this.options.airDragFactor : 1);

    this.baseImpulse
      .copy(this.movingDirectionVec)
      .multiplyScalar(run ? this.options.maxRunVel : this.options.maxWalkVel)
      .sub(this.relativeVelocityOnPlane);
    this.moveImpulseVec
      .copy(this.baseImpulse)
      .sub(this.rejectVel)
      .multiplyScalar(multiplier * fpsCorr);
    this.moveImpulsePoint.copy(this.currentPos).addScaledVector(this.characterYAxis, this.options.moveImpulsePointOffset);
    this.body.applyImpulse(this.moveImpulseVec, this.moveImpulsePoint);

    if (
      this.options.applyCounterMoveImp &&
      this.rayHitBodyValue &&
      this.isOnGroundValue &&
      this.rayHitBodyValue.motionType() === "dynamic"
    ) {
      this.moveImpulseToGround
        .copy(this.baseImpulse)
        .multiplyScalar(multiplier * this.massRatio * this.options.counterMoveImpFactor * fpsCorr)
        .negate();
      this.rayHitBodyValue.applyImpulse(this.moveImpulseToGround, this.standingPoint);
    } else {
      this.moveImpulseToGround.set(0, 0, 0);
    }
  }

  private updateGravityInfo(deltaTime: number): void {
    if (this.options.enableCustomGravity) {
      vectorFromLike(this.options.gravityField(this.currentPos), this.referenceGravity);
      if (!this.isOnGroundValue) {
        const factor = this.body.gravityFactor();
        this.customGravityImpulse.copy(this.referenceGravity).multiplyScalar(this.body.mass() * factor * deltaTime);
        this.body.applyImpulse(this.customGravityImpulse);
      }
    } else {
      vectorFromLike(this.world.gravity(), this.referenceGravity);
    }

    this.referenceGravityMag = this.referenceGravity.length();
    this.referenceGravityDir.copy(this.referenceGravity).normalize();
    if (this.referenceGravityDir.lengthSq() === 0) this.referenceGravityDir.copy(this.characterYAxis).negate();
    this.gravityDirection.copy(
      this.slerpVec3(
        this.gravityDirection,
        this.referenceGravityDir,
        1 - Math.exp(-this.options.gravityDirLerpSpeed * deltaTime),
        this.characterXAxis
      )
    );
    this.upAxisVec.copy(this.gravityDirection).negate();
  }

  private autoBalanceCharacter(fpsCorr: number): void {
    this.balanceCrossAxis.crossVectors(this.characterYAxis, this.upAxisVec);
    const torque = this.balanceCrossAxis
      .multiplyScalar(this.options.autoBalanceSpringK)
      .sub(this.currentAngVelOnPlane.multiplyScalar(this.options.autoBalanceDampingC));
    this.body.applyAngularImpulse(torque.multiplyScalar(fpsCorr));
  }

  private turnCharacter(direction: Vector3, fpsCorr: number): void {
    this.turnCrossAxis.crossVectors(this.characterZAxis, direction);
    let dot = clamp(this.characterZAxis.dot(direction), -1, 1);
    if (Math.abs(dot) < 1e-10) dot = 0;
    const angle = Math.atan2(this.turnCrossAxis.dot(this.characterYAxis), dot);
    const torque = this.turnOnYAxis
      .copy(this.characterYAxis)
      .multiplyScalar(angle * this.options.autoBalanceSpringOnY)
      .sub(this.currentAngVelOnUp.multiplyScalar(this.options.autoBalanceDampingOnY));
    this.body.applyAngularImpulse(torque.multiplyScalar(fpsCorr));
  }

  private floatCharacter(): void {
    this.rayOrigin.copy(this.currentPos).addScaledVector(this.characterYAxis, this.options.rayOriginOffest);
    this.rayDirection.copy(this.referenceUpAxis).negate();
    this.rayHitBodyValue = null;
    this.wasOnGroundValue = this.isOnGroundValue;
    this.isOnGroundValue = false;

    if (this.options.groundDetection === "rayCast") {
      this.applyRayGroundHit(this.options.rayLength, this.options.rayRadius * 2 + this.options.floatHeight);
    } else {
      this.castDirection.copy(this.rayDirection).multiplyScalar(this.options.rayLength);
      const hit = this.world.castShape(
        Shape.sphere(this.options.rayRadius),
        this.rayOrigin,
        { x: this.currentQuat.x, y: this.currentQuat.y, z: this.currentQuat.z, w: this.currentQuat.w },
        this.castDirection,
        {
          excludeBody: this.body,
          filter: ({ body }) => this.ecctrlRayFilter(body)
        }
      );

      if (hit) {
        this.actualSlopeNormalVec.copy(hit.normal);
        this.actualSlopeAngleValue = this.actualSlopeNormalVec.angleTo(this.referenceUpAxis);
        if (this.actualSlopeAngleValue < this.options.slopeMaxAngle) {
          this.rayHitBodyValue = hit.body ?? null;
          this.groundHitOrigin.copy(this.rayOrigin);
          this.groundHitDistance = hit.fraction * this.options.rayLength;
          this.groundFloatingDistance = this.options.rayRadius + this.options.floatHeight;
          this.standingPoint.copy(hit.contactPointOnBody);
          this.standingPointFriction = hit.body?.friction() ?? 0;
        } else {
          this.applyRayGroundHit(this.options.rayLength + this.options.rayRadius, this.options.rayRadius * 2 + this.options.floatHeight);
        }
      }
    }

    if (this.rayHitBodyValue) {
      this.isOnGroundValue = this.groundHitDistance < this.groundFloatingDistance + this.options.rayHitForgiveness;
      if (!this.isOnGroundValue) this.standingPointFriction = 0;
    } else {
      this.actualSlopeAngleValue = 0;
      this.slopeAngleInFront = 0;
      this.standingPointFriction = 0;
    }
  }

  private shouldWakeSleepingBodyForFloat(): boolean {
    this.floatCharacter();
    if (!this.rayHitBodyValue || !this.isOnGroundValue) return false;
    const shouldWake = Math.abs(this.groundFloatingDistance - this.groundHitDistance) > 0.025;
    if (shouldWake) this.body.setAllowSleeping(false);
    return shouldWake;
  }

  private syncBodySleepingPermission(): void {
    const allowSleeping = this.options.allowSleeping && (
      !this.rayHitBodyValue ||
      !this.isOnGroundValue ||
      Math.abs(this.groundFloatingDistance - this.groundHitDistance) <= 0.025
    );
    if (this.body.allowSleeping() !== allowSleeping) this.body.setAllowSleeping(allowSleeping);
  }

  private applyRayGroundHit(maxDistance: number, floatingDistance: number): void {
    this.castDirection.copy(this.rayDirection).multiplyScalar(maxDistance);
    const hit = this.world.castRay(this.rayOrigin, this.castDirection, {
      excludeBody: this.body,
      filter: ({ body }) => this.ecctrlRayFilter(body)
    });
    if (!hit) return;

    this.actualSlopeNormalVec.copy(hit.normal);
    this.actualSlopeAngleValue = this.actualSlopeNormalVec.angleTo(this.referenceUpAxis);
    if (this.actualSlopeAngleValue >= this.options.slopeMaxAngle) {
      const centerHit = this.findWalkableCenterRayHit(maxDistance);
      if (!centerHit) return;
      this.applySelectedRayHit(centerHit, maxDistance, floatingDistance);
      return;
    }

    this.applySelectedRayHit(hit, maxDistance, floatingDistance);
  }

  private findWalkableCenterRayHit(maxDistance: number): RayHit | null {
    const hits = this.world.castRayAll(this.rayOrigin, this.castDirection.copy(this.rayDirection).multiplyScalar(maxDistance), {
      excludeBody: this.body,
      filter: ({ body }) => this.ecctrlRayFilter(body)
    });
    for (const hit of hits) {
      this.actualSlopeNormalVec.copy(hit.normal);
      if (this.actualSlopeNormalVec.angleTo(this.referenceUpAxis) < this.options.slopeMaxAngle) return hit;
    }
    return null;
  }

  private applySelectedRayHit(hit: RayHit, castLength: number, floatingDistance: number): void {
    this.rayHitBodyValue = hit.body ?? null;
    this.actualSlopeNormalVec.copy(hit.normal);
    this.actualSlopeAngleValue = this.actualSlopeNormalVec.angleTo(this.referenceUpAxis);
    this.groundHitDistance = hit.fraction * castLength;
    this.groundFloatingDistance = floatingDistance;
    this.groundHitOrigin.copy(this.rayOrigin);
    this.standingPoint.copy(hit.point);
    this.standingPointFriction = hit.body?.friction() ?? 0;
  }

  private applyFloatingForce(deltaTime: number): void {
    if (!this.rayHitBodyValue || !this.isOnGroundValue) {
      this.floatingImpulseVec.set(0, 0, 0);
      return;
    }

    this.springDistVec.copy(this.referenceUpAxis).multiplyScalar(this.groundFloatingDistance - this.groundHitDistance);
    this.dampingVelVec.copy(this.relativeVelocity).projectOnVector(this.referenceUpAxis);
    this.floatingForce
      .copy(this.springDistVec.multiplyScalar(this.options.springK))
      .sub(this.dampingVelVec.multiplyScalar(this.options.dampingC));
    this.floatingImpulseVec.copy(this.floatingForce).multiplyScalar(deltaTime);
    if (this.jumpActiveValue && this.floatingImpulseVec.dot(this.referenceUpAxis) < 0) this.floatingImpulseVec.set(0, 0, 0);
    if (this.body.isActive()) this.body.applyImpulse(this.floatingImpulseVec);
  }

  private applyMassOnStandCollider(deltaTime: number): void {
    if (!this.rayHitBodyValue || this.rayHitBodyValue.motionType() !== "dynamic" || !this.isOnGroundValue) return;
    const impulseMag = Math.max(-this.floatingImpulseVec.dot(this.upAxisVec), 0);
    const weightMag = this.body.mass() * this.referenceGravityMag * deltaTime;
    this.characterMassImpulse
      .copy(this.gravityDirection)
      .multiplyScalar(Math.max(impulseMag, weightMag) * this.massRatio);
    if (this.options.applyCounterMass) {
      this.rayHitBodyValue.applyImpulse(this.characterMassImpulse, this.standingPoint);
    }
  }

  private applyFriction(fpsCorr: number): void {
    if (!this.rayHitBodyValue || !this.isOnGroundValue) return;
    this.slideFrictionCoef = clamp((this.standingPointFriction + this.options.slideGripFactor) * 0.5, 0, 1);
    this.dragFrictionImpulseVec
      .copy(this.relativeVelocityOnPlane)
      .negate()
      .multiplyScalar(this.body.mass() * this.slideFrictionCoef * clamp(this.options.decDeltaTime, 0, 1) * fpsCorr);
    this.body.applyImpulse(this.dragFrictionImpulseVec);
  }

  private slopeDetect(): void {
    if (this.rayHitBodyValue) {
      this.actualSlopeAngleValue = this.actualSlopeNormalVec.angleTo(this.referenceUpAxis);
      this.slopeAngleInFront = this.isOnGroundValue ? -Math.asin(this.actualSlopeNormalVec.dot(this.inputDirectionVec)) : 0;
    } else {
      this.actualSlopeAngleValue = 0;
      this.slopeAngleInFront = 0;
    }
  }

  private fallDetect(): void {
    this.isFallingValue = this.currentVelOnUp.dot(this.upAxisVec) < 0 && !this.isOnGroundValue;
  }

  private zeroGravityDetect(): void {
    this.isZeroGravity = this.referenceGravityMag === 0;
  }

  private isOnMovingObjectDetect(deltaTime: number): void {
    const standBody = this.rayHitBodyValue;
    if (
      this.options.followPlatform &&
      standBody &&
      this.isOnGroundValue &&
      (standBody.motionType() === "dynamic" || standBody.motionType() === "kinematic")
    ) {
      this.isOnMovingObjectValue = true;
      if (standBody.motionType() === "dynamic") {
        const ratio = clamp(standBody.mass() / Math.max(this.body.mass(), 1e-6), 0, 1);
        this.massRatio = evaluateCurveLUT(ratio, this.massRatioFallOffCurve);
      } else {
        this.massRatio = 1;
      }

      standBody.centerOfMassPositionInto(this.movingObjectPosition);
      this.distanceFromCharacterToObjectPoint.copy(this.currentPos).sub(this.movingObjectPosition);
      vectorFromLike(standBody.linearVelocity(), this.movingObjectLinearVelocity);
      vectorFromLike(standBody.angularVelocity(), this.movingObjectAngularVelocity);
      if (standBody.motionType() === "kinematic" && typeof standBody.pointVelocityInto === "function") {
        standBody.pointVelocityInto(this.currentPos, this.movingObjectVelocity);
      } else {
        this.movingObjectAngvelToLinvel.crossVectors(this.movingObjectAngularVelocity, this.distanceFromCharacterToObjectPoint);
        this.movingObjectVelocity
          .copy(this.movingObjectLinearVelocity)
          .addScaledVector(this.movingObjectAngvelToLinvel, this.massRatio);
      }
      this.movingObjectVelocityOnPlane.copy(this.movingObjectVelocity).projectOnPlane(this.referenceUpAxis);
      this.movingObjectVelocityOnUp.copy(this.movingObjectVelocity).projectOnVector(this.referenceUpAxis);
      this.movingObjectAngularVelocityValue = this.movingObjectAngularVelocity.length();
      this.movingObjectAngularVelocityAxis.copy(this.movingObjectAngularVelocity).normalize();
      this.turnOnYQuaternion.setFromAxisAngle(this.movingObjectAngularVelocityAxis, this.movingObjectAngularVelocityValue * deltaTime);
    } else {
      this.isOnMovingObjectValue = false;
      this.movingObjectVelocity.set(0, 0, 0);
      this.movingObjectVelocityOnPlane.set(0, 0, 0);
      this.movingObjectVelocityOnUp.set(0, 0, 0);
      this.turnOnYQuaternion.identity();
      this.massRatio = 1;
    }
  }

  private computeRelativeVelocity(): void {
    this.relativeVelocity.copy(this.currentVel);
    this.relativeVelocityOnPlane.copy(this.currentVelOnPlane);
    this.relativeVelocityOnUp.copy(this.currentVelOnUp);
    if (this.isOnMovingObjectValue && this.options.followPlatform) {
      this.relativeVelocity.sub(this.movingObjectVelocity);
      this.relativeVelocityOnPlane.sub(this.movingObjectVelocityOnPlane);
      this.relativeVelocityOnUp.sub(this.movingObjectVelocityOnUp);
    }
  }

  private applyJumpImpulse(): void {
    this.jumpDirection
      .copy(this.referenceUpAxis)
      .addScaledVector(this.actualSlopeNormalVec, this.options.slopeJumpFactor)
      .normalize();
    this.jumpVelocityVec
      .copy(this.relativeVelocityOnPlane)
      .add(this.movingObjectVelocity)
      .addScaledVector(this.jumpDirection, this.options.jumpVel);
    this.body.setLinearVelocity(this.jumpVelocityVec);

    if (
      this.options.applyCounterJumpImp &&
      this.rayHitBodyValue &&
      this.rayHitBodyValue.motionType() === "dynamic"
    ) {
      this.jumpImpulseToGround
        .copy(this.jumpDirection)
        .multiplyScalar(-this.body.mass() * this.options.jumpVel * this.massRatio * this.options.counterJumpImpFactor);
      this.rayHitBodyValue.applyImpulse(this.jumpImpulseToGround, this.standingPoint);
    }
  }

  private applyDynamicGravity(): void {
    if (this.isFallingValue) {
      if (this.currentVelOnUp.lengthSq() > this.options.fallingMaxVel * this.options.fallingMaxVel) {
        if (this.body.gravityFactor() !== 0) this.body.setGravityFactor(0);
      } else if (this.body.gravityFactor() !== this.options.fallingGravityScale) {
        this.body.setGravityFactor(this.options.fallingGravityScale);
      }
    } else if (this.isOnGroundValue) {
      if (this.body.gravityFactor() !== 0) this.body.setGravityFactor(0);
    } else if (this.body.gravityFactor() !== this.initialGravityFactor) {
      this.body.setGravityFactor(this.initialGravityFactor);
    }
  }

  private getJumpState(jumpPressed: boolean, deltaTime: number): boolean {
    if (this.jumpActiveValue) {
      this.jumpElapsedTime += deltaTime;
      if (this.jumpElapsedTime >= this.options.jumpDuration) this.jumpActiveValue = false;
    } else {
      if (jumpPressed && this.canJumpAgain) {
        this.jumpActiveValue = true;
        this.jumpElapsedTime = 0;
        this.canJumpAgain = false;
      }
      if (!jumpPressed) this.canJumpAgain = true;
    }
    return this.jumpActiveValue;
  }

  private getRunState(runPressed: boolean): boolean {
    if (this.options.enableToggleRun) {
      if (runPressed && !this.canRunAgain) this.runActiveValue = !this.runActiveValue;
      this.canRunAgain = runPressed;
    } else {
      this.runActiveValue = runPressed;
    }
    return this.runActiveValue;
  }

  private ecctrlRayFilter(body: Body | undefined): boolean {
    const userData = body?.userData;
    if (!isEcctrlUserData(userData)) return true;
    return !(userData.ecctrl?.excludeRay || userData.ecctrl?.excludeCharacterRay);
  }
}

function resolveOptions(options: EcctrlJoltControllerOptions): ResolvedOptions {
  const capsuleRadius = options.capsuleRadius ?? DEFAULT_ECCTRL_OPTIONS.capsuleRadius;
  const capsuleHalfHeight = options.capsuleHalfHeight ?? DEFAULT_ECCTRL_OPTIONS.capsuleHalfHeight;
  return {
    ...DEFAULT_ECCTRL_OPTIONS,
    ...options,
    capsuleHalfHeight,
    capsuleRadius,
    rayOriginOffest: options.rayOriginOffest ?? -capsuleHalfHeight,
    rayLength: options.rayLength ?? capsuleRadius + 1,
    rayRadius: options.rayRadius ?? capsuleRadius / 2,
    gravityField: options.gravityField ?? (() => ({ x: 0, y: -9.81, z: 0 }))
  };
}

function vectorInput(input: readonly [number, number, number] | Vector3Like): [number, number, number] {
  return "x" in input ? [input.x, input.y, input.z] : [input[0], input[1], input[2]];
}

function quaternionInput(input: readonly [number, number, number, number] | QuaternionLike | undefined): [number, number, number, number] | undefined {
  if (!input) return undefined;
  return "x" in input ? [input.x, input.y, input.z, input.w] : [input[0], input[1], input[2], input[3]];
}

function cloneVector(input: Vector3): Vector3Like {
  return { x: input.x, y: input.y, z: input.z };
}

function cloneQuaternion(input: Quaternion): QuaternionLike {
  return { x: input.x, y: input.y, z: input.z, w: input.w };
}

function isEcctrlUserData(input: unknown): input is EcctrlUserDataType {
  return typeof input === "object" && input !== null && "ecctrl" in input;
}
