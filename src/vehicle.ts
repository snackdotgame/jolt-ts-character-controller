/*!
 * Portions mechanically port Ecctrl vehicle controller logic.
 * https://github.com/pmndrs/ecctrl
 *
 * SPDX-FileCopyrightText: 2023-2026 Erdong Chen
 * SPDX-License-Identifier: MIT
 */

import { Body, Shape, type MassPropertiesInput, type ShapeCastHit, type ShapeInput, type World } from "jolt-ts";
import { Quaternion, Vector3 } from "three";
import { bakeCurveLUT, evaluateCurveLUT, type CurveData, type CurveLUT } from "./curves.js";
import { clamp, createSlerpVec3, remap, vectorFromLike } from "./math.js";
import type {
  ControllerUserData,
  GroundDetectionMode,
  QuaternionLike,
  ReadonlyVehicleInput,
  Vector3Like,
  VehicleInput
} from "./types.js";

const DEFAULT_ENGINE_TORQUE_CURVE: CurveData = {
  points: [
    { x: 0, y: 1, r_out: 0 },
    { x: 1, y: 0, r_in: 0 }
  ],
  samples: 50
};

const DEFAULT_STEER_ANGLE_CURVE: CurveData = {
  points: [
    { x: 0, y: 1, r_out: 0 },
    { x: 0.2, y: 1, r_in: 0, r_out: 0 },
    { x: 1, y: 0.4, r_in: 0 }
  ],
  samples: 50
};

const DEFAULT_SLIP_LONGITUDINAL_CURVE: CurveData = {
  points: [
    { x: 0, y: 0, r_out: 1.45 },
    { x: 0.25, y: 1, r_in: 0, r_out: 0 },
    { x: 1, y: 0.7, r_in: 0 }
  ],
  samples: 50
};

const DEFAULT_SLIP_LATERAL_CURVE: CurveData = {
  points: [
    { x: 0, y: 0, r_out: 1.45 },
    { x: 0.15, y: 1, r_in: 0, r_out: 0 },
    { x: 1, y: 0.9, r_in: 0 }
  ],
  samples: 50
};

const DEFAULT_MASS_RATIO_FALL_OFF_CURVE: CurveData = {
  points: [
    { x: 0, y: 0.5, r_out: 0 },
    { x: 0.5, y: 1, r_in: 0, r_out: 0 },
    { x: 1, y: 1, r_in: 0 }
  ],
  samples: 50
};

export type TransmissionMode = "auto" | "manual";
export type VehicleControlMode = "VELOCITY" | "POSITION";

export interface VehicleRuntimeOptions {
  world: World;
  body?: Body;
  shape?: ShapeInput;
  position?: readonly [number, number, number] | Vector3Like;
  rotation?: readonly [number, number, number, number] | QuaternionLike;
  layer?: string | number;
  friction?: number;
  density?: number;
  mass?: number;
  massProperties?: MassPropertiesInput;
  linearDamping?: number;
  angularDamping?: number;
  gravityFactor?: number;
  allowSleeping?: boolean;
  userData?: unknown;
}

export interface CarConfig {
  controlMode: VehicleControlMode;
  engineHorsepower: number;
  engineMaxRPM: number;
  gearRatios: number[];
  finalDriveRatio: number;
  transmissionMode: TransmissionMode;
  shiftUpRPM: number;
  shiftDownRPM: number;
  shiftCooldown: number;
  steerRate: number;
  maxSteerAngle: number;
  reverseTorqueScale: number;
  reverseRPMScale: number;
  engineTorqueCurveData: CurveData;
  steerAngleCurveData: CurveData;
}

export interface DroneConfig {
  controlMode: VehicleControlMode;
  maxYawRate: number;
  maxHorizSpeed: number;
  maxVertSpeed: number;
  maxTiltAngle: number;
  airDragFactor: number;
  TILT_P: number;
  TILT_D: number;
  YAW_POS_P: number;
  YAW_VEL_P: number;
  VERT_POS_P: number;
  VERT_POS_D: number;
  HORIZ_POS_P: number;
  HORIZ_POS_D: number;
  HORIZ_VEL_P: number;
  VERT_VEL_P: number;
}

export interface VehicleOptions extends VehicleRuntimeOptions {
  enable?: boolean;
  carConfig?: Partial<CarConfig>;
  droneConfig?: Partial<DroneConfig>;
  enableCustomGravity?: boolean;
  gravityField?: (position: Vector3) => Vector3Like;
  gravityDirLerpSpeed?: number;
}

export interface VehicleSnapshot {
  readonly position: Vector3Like;
  readonly rotation: QuaternionLike;
  readonly linearVelocity: Vector3Like;
  readonly angularVelocity: Vector3Like;
  readonly bodyXAxis: Vector3Like;
  readonly bodyYAxis: Vector3Like;
  readonly bodyZAxis: Vector3Like;
  readonly upAxis: Vector3Like;
  readonly gravityDir: Vector3Like;
  readonly gravityMag: number;
  readonly gearIndex: number;
  readonly driveRatio: number;
  readonly engineRPM: number;
  readonly wheelCount: number;
  readonly propellerCount: number;
}

export interface WheelOptions {
  id?: string;
  name?: string;
  enable?: boolean;
  position: readonly [number, number, number] | Vector3Like;
  rotation?: readonly [number, number, number, number] | QuaternionLike;
  groundDetection?: GroundDetectionMode;
  rayShapeR?: number;
  rayShapeH?: number;
  rayLength?: number;
  springK?: number;
  dampingC?: number;
  driveInvert?: boolean;
  driveWheel?: boolean;
  driveTorqueWeight?: number;
  steerInvert?: boolean;
  steerWheel?: boolean;
  brakeWheel?: boolean;
  maxBrakeTorque?: number;
  rollingResistanceCoef?: number;
  lowVelThreshold?: number;
  tireGripFactor?: number;
  lngFrictionEllipseScale?: number;
  latFrictionEllipseScale?: number;
  relaxLngRate?: number;
  relaxLatRate?: number;
  minLngRelaxCoeff?: number;
  minLatRelaxCoeff?: number;
  lngSlipRatioCurveData?: CurveData;
  latSlipRatioCurveData?: CurveData;
  followPlatform?: boolean;
  massRatioFallOffCurveData?: CurveData;
  applyCounterMass?: boolean;
  applyCounterFriction?: boolean;
  showWheelModel?: boolean;
  wheelModelDensity?: number;
  wheelModelUpdate?: boolean;
  wheelModelRadius?: number;
  wheelModelLerpPosRate?: number;
  wheelModelReversRotation?: boolean;
}

export interface WheelSnapshot {
  readonly id: string;
  readonly name: string;
  readonly rayPos: Vector3Like;
  readonly rayDir: Vector3Like;
  readonly rayUpDir: Vector3Like;
  readonly rayFwdDir: Vector3Like;
  readonly rayLeftDir: Vector3Like;
  readonly floatImpulse: Vector3Like;
  readonly hitBody: Body | null;
  readonly hitPosition: Vector3Like;
  readonly hitNormal: Vector3Like;
  readonly isOnPlatform: boolean;
  readonly longitudinalSlipRatio: number;
  readonly lateralSlipRatio: number;
  readonly slipStrength: number;
  readonly longitudinalFrictionImpulse: Vector3Like;
  readonly lateralFrictionImpulse: Vector3Like;
  readonly supportPosition: Vector3Like;
  readonly suspensionToi: number;
  readonly steerAngle: number;
  readonly driveTorque: number;
  readonly brakeTorque: number;
  readonly wheelLinearVelocity: number;
  readonly wheelAngularVelocity: number;
}

export interface PropellerOptions {
  id?: string;
  name?: string;
  enable?: boolean;
  position: readonly [number, number, number] | Vector3Like;
  rotation?: readonly [number, number, number, number] | QuaternionLike;
  maxThrust?: number;
  torqueRatio?: number;
  invertThrust?: boolean;
  invertTorque?: boolean;
}

export interface PropellerSnapshot {
  readonly id: string;
  readonly name: string;
  readonly thrustPosition: Vector3Like;
  readonly thrustDirection: Vector3Like;
  readonly torqueDirection: Vector3Like;
  readonly worldThrustPosition: Vector3Like;
  readonly worldThrustDirection: Vector3Like;
  readonly worldTorqueDirection: Vector3Like;
  readonly thrustImpulse: Vector3Like;
  readonly torqueImpulse: Vector3Like;
  readonly throttle: number;
  readonly finalThrottle: number;
}

type ResolvedVehicleOptions = Required<Pick<VehicleOptions, "enable" | "enableCustomGravity" | "gravityDirLerpSpeed">> & {
  gravityField: (position: Vector3) => Vector3Like;
  carConfig: CarConfig;
  droneConfig: DroneConfig;
};

type DriveWheelConfig = {
  maxDriveTorque: number;
  maxWheelAngVel: number;
  engineTorqueCurve: CurveLUT;
  reverseTorqueScale: number;
  reverseRPMScale: number;
  driveRatio: number;
};

type SteerWheelConfig = {
  steerAngleCurve: CurveLUT;
  steerRate: number;
  maxSteerAngle: number;
  maxWheelAngVel: number;
};

type ResolvedWheelOptions = Required<Omit<WheelOptions, "id" | "name" | "position" | "rotation">> & {
  id: string;
  name: string;
};

type ResolvedPropellerOptions = Required<Omit<PropellerOptions, "id" | "name" | "position" | "rotation">> & {
  id: string;
  name: string;
};

export const DEFAULT_CAR_CONFIG: CarConfig = {
  controlMode: "VELOCITY",
  engineHorsepower: 6,
  engineMaxRPM: 6000,
  gearRatios: [10],
  finalDriveRatio: 1,
  transmissionMode: "auto",
  shiftUpRPM: 5200,
  shiftDownRPM: 2200,
  shiftCooldown: 0.35,
  steerRate: Math.PI * 2,
  maxSteerAngle: Math.PI / 6,
  reverseTorqueScale: 1,
  reverseRPMScale: 0.3,
  engineTorqueCurveData: DEFAULT_ENGINE_TORQUE_CURVE,
  steerAngleCurveData: DEFAULT_STEER_ANGLE_CURVE
};

export const DEFAULT_DRONE_CONFIG: DroneConfig = {
  controlMode: "VELOCITY",
  maxYawRate: 2,
  maxHorizSpeed: 30,
  maxVertSpeed: 8,
  maxTiltAngle: Math.PI / 4,
  airDragFactor: 0.2,
  TILT_P: 15,
  TILT_D: 3,
  YAW_POS_P: 6,
  YAW_VEL_P: 4,
  VERT_POS_P: 9,
  VERT_POS_D: 7,
  HORIZ_POS_P: 5,
  HORIZ_POS_D: 5.5,
  HORIZ_VEL_P: 1,
  VERT_VEL_P: 2
};

export const DEFAULT_WHEEL_OPTIONS = {
  enable: true,
  groundDetection: "shapeCast" as GroundDetectionMode,
  rayShapeR: 0.5,
  rayShapeH: 0.15,
  rayLength: 0.5,
  springK: 180,
  dampingC: 16,
  driveInvert: false,
  driveWheel: false,
  driveTorqueWeight: 1,
  steerInvert: false,
  steerWheel: false,
  brakeWheel: false,
  maxBrakeTorque: 40,
  rollingResistanceCoef: 0.007,
  lowVelThreshold: 0.4,
  tireGripFactor: 1.5,
  lngFrictionEllipseScale: 1,
  latFrictionEllipseScale: 1,
  relaxLngRate: 0.05,
  relaxLatRate: 0.1,
  minLngRelaxCoeff: 0.3,
  minLatRelaxCoeff: 0.3,
  lngSlipRatioCurveData: DEFAULT_SLIP_LONGITUDINAL_CURVE,
  latSlipRatioCurveData: DEFAULT_SLIP_LATERAL_CURVE,
  followPlatform: true,
  massRatioFallOffCurveData: DEFAULT_MASS_RATIO_FALL_OFF_CURVE,
  applyCounterMass: true,
  applyCounterFriction: true,
  showWheelModel: true,
  wheelModelDensity: 1.5,
  wheelModelUpdate: true,
  wheelModelRadius: 0.5,
  wheelModelLerpPosRate: 10,
  wheelModelReversRotation: false
};

export const DEFAULT_PROPELLER_OPTIONS = {
  enable: true,
  maxThrust: 500,
  torqueRatio: 0.6,
  invertThrust: false,
  invertTorque: false
};

const FIXED_X = new Vector3(1, 0, 0);
const FIXED_Y = new Vector3(0, 1, 0);
const FIXED_Z = new Vector3(0, 0, 1);
const ROT_Z_90 = new Quaternion().setFromAxisAngle(FIXED_Z, Math.PI / 2);
const EPSILON = 1e-6;

export function createVehicleBody(options: VehicleRuntimeOptions): Body {
  return options.world.createBody({
    type: "dynamic",
    shape: options.shape ?? Shape.box({ halfExtents: [1, 0.4, 2.4] }),
    position: vectorInput(options.position ?? [0, 2, 0]),
    rotation: quaternionInput(options.rotation),
    layer: options.layer ?? "moving",
    friction: options.friction ?? 0.8,
    ...(options.massProperties !== undefined
      ? { massProperties: options.massProperties }
      : options.mass !== undefined
        ? { mass: options.mass }
        : { density: options.density ?? 200 }),
    linearDamping: options.linearDamping,
    angularDamping: options.angularDamping,
    gravityFactor: options.gravityFactor ?? 1,
    allowSleeping: options.allowSleeping ?? true,
    motionQuality: "linearCast",
    userData: options.userData
  });
}

export class Vehicle {
  readonly world: World;
  readonly body: Body;
  readonly options: ResolvedVehicleOptions;
  readonly wheels: ShapeCastWheel[] = [];
  readonly propellers: ThrustPropeller[] = [];

  private readonly movementState: Required<Omit<VehicleInput, "joystickL" | "joystickR">> & {
    joystickL: { x: number; y: number };
    joystickR: { x: number; y: number };
  } = {
    forward: false,
    backward: false,
    steerLeft: false,
    steerRight: false,
    brake: false,
    throttleUp: false,
    throttleDown: false,
    yawLeft: false,
    yawRight: false,
    pitchForward: false,
    pitchBackward: false,
    rollLeft: false,
    rollRight: false,
    joystickL: { x: 0, y: 0 },
    joystickR: { x: 0, y: 0 }
  };

  private readonly currentPos = new Vector3();
  private readonly currentQuat = new Quaternion();
  private readonly inverseQuat = new Quaternion();
  private readonly currentLinVel = new Vector3();
  private readonly currentAngVel = new Vector3();
  private readonly bodyXAxis = new Vector3(1, 0, 0);
  private readonly bodyYAxis = new Vector3(0, 1, 0);
  private readonly bodyZAxis = new Vector3(0, 0, 1);
  private readonly referenceGravity = new Vector3(0, -9.81, 0);
  private readonly referenceGravityDir = new Vector3(0, -1, 0);
  private readonly customGravityImpulse = new Vector3();
  private readonly gravityDir = new Vector3(0, -1, 0);
  private readonly upAxis = new Vector3(0, 1, 0);
  private readonly slerpVec3 = createSlerpVec3();
  private readonly targetPosition = new Vector3();
  private readonly targetHeading = new Vector3(0, 0, 1);
  private engineTorqueCurve: CurveLUT;
  private steerAngleCurve: CurveLUT;
  private readonly driveWheelConfig: DriveWheelConfig;
  private readonly steerWheelConfig: SteerWheelConfig;
  private readonly propellerPotential = { sumLX: 0, sumLY: 0, sumLZ: 0, sumAX: 0, sumAY: 0, sumAZ: 0 };
  private readonly targetUp = new Vector3();
  private readonly tiltError = new Vector3();
  private readonly tiltAngVel = new Vector3();
  private readonly torqueWorld = new Vector3();
  private readonly torqueBody = new Vector3();
  private readonly airDragImpulse = new Vector3();
  private readonly targetLinVel = new Vector3();
  private readonly linVelError = new Vector3();
  private readonly worldXAxis = new Vector3();
  private readonly worldZAxis = new Vector3();
  private readonly posError = new Vector3();
  private readonly horizPosError = new Vector3();
  private readonly horizLinVel = new Vector3();
  private readonly horizForce = new Vector3();
  private readonly horizAccCmd = new Vector3();
  private readonly targetFwd = new Vector3();
  private readonly currentFwd = new Vector3();
  private readonly yawCross = new Vector3();
  private readonly worldThrustDir = new Vector3();
  private readonly worldThrustPos = new Vector3();
  private readonly worldTorqueDir = new Vector3();

  private gravityMag = 9.81;
  private gearIndexValue = 0;
  private driveRatioValue: number;
  private engineRPMValue = 0;
  private shiftCooldownTimer = 0;
  private hoverThrottle = 0;

  constructor(options: VehicleOptions) {
    this.world = options.world;
    this.options = resolveVehicleOptions(options);
    this.body = options.body ?? createVehicleBody(options);
    this.engineTorqueCurve = bakeCurveLUT(
      this.options.carConfig.engineTorqueCurveData.points,
      this.options.carConfig.engineTorqueCurveData.samples ?? 50
    );
    this.steerAngleCurve = bakeCurveLUT(
      this.options.carConfig.steerAngleCurveData.points,
      this.options.carConfig.steerAngleCurveData.samples ?? 50
    );
    this.driveRatioValue = getDriveRatio(this.gearRatios, this.gearIndexValue, this.options.carConfig.finalDriveRatio);
    this.driveWheelConfig = {
      maxDriveTorque: 0,
      maxWheelAngVel: getMaxWheelAngVel(this.options.carConfig.engineMaxRPM, this.driveRatioValue),
      engineTorqueCurve: this.engineTorqueCurve,
      reverseTorqueScale: this.options.carConfig.reverseTorqueScale,
      reverseRPMScale: this.options.carConfig.reverseRPMScale,
      driveRatio: this.driveRatioValue
    };
    this.steerWheelConfig = {
      steerAngleCurve: this.steerAngleCurve,
      steerRate: this.options.carConfig.steerRate,
      maxSteerAngle: this.options.carConfig.maxSteerAngle,
      maxWheelAngVel: this.driveWheelConfig.maxWheelAngVel
    };
    vectorFromLike(this.body.translation(), this.targetPosition);
  }

  addWheel(options: WheelOptions): ShapeCastWheel {
    const wheel = new ShapeCastWheel(options);
    this.wheels.push(wheel);
    this.syncWheelConfig();
    return wheel;
  }

  removeWheel(wheel: ShapeCastWheel): void {
    const index = this.wheels.indexOf(wheel);
    if (index >= 0) this.wheels.splice(index, 1);
    this.syncWheelConfig();
  }

  addPropeller(options: PropellerOptions): ThrustPropeller {
    const propeller = new ThrustPropeller(options);
    this.propellers.push(propeller);
    return propeller;
  }

  removePropeller(propeller: ThrustPropeller): void {
    const index = this.propellers.indexOf(propeller);
    if (index >= 0) this.propellers.splice(index, 1);
  }

  setMovement(movement: VehicleInput): void {
    if (movement.forward !== undefined) this.movementState.forward = movement.forward;
    if (movement.backward !== undefined) this.movementState.backward = movement.backward;
    if (movement.steerLeft !== undefined) this.movementState.steerLeft = movement.steerLeft;
    if (movement.steerRight !== undefined) this.movementState.steerRight = movement.steerRight;
    if (movement.brake !== undefined) this.movementState.brake = movement.brake;
    if (movement.throttleUp !== undefined) this.movementState.throttleUp = movement.throttleUp;
    if (movement.throttleDown !== undefined) this.movementState.throttleDown = movement.throttleDown;
    if (movement.yawLeft !== undefined) this.movementState.yawLeft = movement.yawLeft;
    if (movement.yawRight !== undefined) this.movementState.yawRight = movement.yawRight;
    if (movement.pitchForward !== undefined) this.movementState.pitchForward = movement.pitchForward;
    if (movement.pitchBackward !== undefined) this.movementState.pitchBackward = movement.pitchBackward;
    if (movement.rollLeft !== undefined) this.movementState.rollLeft = movement.rollLeft;
    if (movement.rollRight !== undefined) this.movementState.rollRight = movement.rollRight;
    if (movement.joystickL) {
      this.movementState.joystickL.x = movement.joystickL.x;
      this.movementState.joystickL.y = movement.joystickL.y;
    }
    if (movement.joystickR) {
      this.movementState.joystickR.x = movement.joystickR.x;
      this.movementState.joystickR.y = movement.joystickR.y;
    }
  }

  setTarget(position?: Vector3Like, direction?: Vector3Like): void {
    if (position) vectorFromLike(position, this.targetPosition);
    if (direction) vectorFromLike(direction, this.targetHeading);
  }

  refreshCarCurves(): void {
    this.engineTorqueCurve = bakeCurveLUT(
      this.options.carConfig.engineTorqueCurveData.points,
      this.options.carConfig.engineTorqueCurveData.samples ?? 50
    );
    this.steerAngleCurve = bakeCurveLUT(
      this.options.carConfig.steerAngleCurveData.points,
      this.options.carConfig.steerAngleCurveData.samples ?? 50
    );
    this.driveWheelConfig.engineTorqueCurve = this.engineTorqueCurve;
    this.steerWheelConfig.steerAngleCurve = this.steerAngleCurve;
  }

  setGear(index: number): void {
    const nextGearIndex = clamp(Math.floor(index), 0, this.gearRatios.length - 1);
    if (this.gearIndexValue === nextGearIndex) return;
    this.gearIndexValue = nextGearIndex;
    this.shiftCooldownTimer = this.options.carConfig.shiftCooldown;
    this.syncTransmissionConfig();
    this.syncWheelConfig();
  }

  update(deltaTime: number): VehicleSnapshot {
    this.step(deltaTime);
    return this.snapshot();
  }

  step(deltaTime: number): void {
    if (!this.options.enable || !this.body.valid) return;

    if (this.body.isActive()) {
      this.updateVehicleInfo();
      this.updateGravityInfo(deltaTime);
    }

    if (this.wheels.length > 0) this.applyCarControl(deltaTime);
    if (this.propellers.length > 0) this.applyDroneControl(deltaTime);
  }

  snapshot(): VehicleSnapshot {
    return {
      position: cloneVector(this.currentPos),
      rotation: cloneQuaternion(this.currentQuat),
      linearVelocity: cloneVector(this.currentLinVel),
      angularVelocity: cloneVector(this.currentAngVel),
      bodyXAxis: cloneVector(this.bodyXAxis),
      bodyYAxis: cloneVector(this.bodyYAxis),
      bodyZAxis: cloneVector(this.bodyZAxis),
      upAxis: cloneVector(this.upAxis),
      gravityDir: cloneVector(this.gravityDir),
      gravityMag: this.gravityMag,
      gearIndex: this.gearIndexValue,
      driveRatio: this.driveRatioValue,
      engineRPM: this.engineRPMValue,
      wheelCount: this.wheels.length,
      propellerCount: this.propellers.length
    };
  }

  get currPos(): Vector3 {
    return this.currentPos;
  }

  get currQuat(): Quaternion {
    return this.currentQuat;
  }

  get currLinVel(): Vector3 {
    return this.currentLinVel;
  }

  get currAngVel(): Vector3 {
    return this.currentAngVel;
  }

  get bodyX(): Vector3 {
    return this.bodyXAxis;
  }

  get bodyY(): Vector3 {
    return this.bodyYAxis;
  }

  get bodyZ(): Vector3 {
    return this.bodyZAxis;
  }

  get up(): Vector3 {
    return this.upAxis;
  }

  get gravity(): Vector3 {
    return this.gravityDir;
  }

  get gravityMagnitude(): number {
    return this.gravityMag;
  }

  get input(): ReadonlyVehicleInput {
    return this.movementState;
  }

  get gearIndex(): number {
    return this.gearIndexValue;
  }

  get driveRatio(): number {
    return this.driveRatioValue;
  }

  get engineRPM(): number {
    return this.engineRPMValue;
  }

  private get gearRatios(): number[] {
    return this.options.carConfig.gearRatios.length > 0 ? this.options.carConfig.gearRatios : DEFAULT_CAR_CONFIG.gearRatios;
  }

  private updateVehicleInfo(): void {
    vectorFromLike(this.body.translation(), this.currentPos);
    const rotation = this.body.rotation();
    this.currentQuat.set(rotation.x, rotation.y, rotation.z, rotation.w);
    this.inverseQuat.copy(this.currentQuat).invert();
    vectorFromLike(this.body.linearVelocity(), this.currentLinVel);
    vectorFromLike(this.body.angularVelocity(), this.currentAngVel);
    this.bodyXAxis.copy(FIXED_X).applyQuaternion(this.currentQuat);
    this.bodyYAxis.copy(FIXED_Y).applyQuaternion(this.currentQuat);
    this.bodyZAxis.copy(FIXED_Z).applyQuaternion(this.currentQuat);
  }

  private updateGravityInfo(deltaTime: number): void {
    if (this.options.enableCustomGravity) {
      vectorFromLike(this.options.gravityField(this.currentPos), this.referenceGravity);
      const factor = this.body.gravityFactor();
      this.customGravityImpulse.copy(this.referenceGravity).multiplyScalar(this.body.mass() * factor * deltaTime);
      this.body.applyImpulse(this.customGravityImpulse);
    } else {
      vectorFromLike(this.world.gravity(), this.referenceGravity);
    }

    this.gravityMag = this.referenceGravity.length();
    this.referenceGravityDir.copy(this.referenceGravity).normalize();
    if (this.referenceGravityDir.lengthSq() === 0) this.referenceGravityDir.copy(this.bodyYAxis).negate();
    this.gravityDir.copy(
      this.slerpVec3(
        this.gravityDir,
        this.referenceGravityDir,
        1 - Math.exp(-this.options.gravityDirLerpSpeed * deltaTime),
        this.bodyZAxis
      )
    );
    this.upAxis.copy(this.gravityDir).negate();
  }

  private applyCarControl(deltaTime: number): void {
    this.syncTransmissionConfig();
    this.updateTransmission(deltaTime);
    this.velocityBasedCarControl();
    this.syncWheelConfig();
    for (const wheel of this.wheels) wheel.step(this, deltaTime, this.gravityMag);
    this.applyWheelImpulse();
  }

  private updateTransmission(deltaTime: number): void {
    let totalWheelRPM = 0;
    let totalDriveTorqueWeight = 0;
    for (const wheel of this.wheels) {
      if (!wheel.options.driveWheel) continue;
      const weight = Math.max(0, wheel.options.driveTorqueWeight);
      totalWheelRPM += Math.abs(wheel.wheelAngularVelocity) * 60 / (Math.PI * 2) * weight;
      totalDriveTorqueWeight += weight;
    }

    const averageWheelRPM = totalDriveTorqueWeight > 0 ? totalWheelRPM / totalDriveTorqueWeight : 0;
    this.engineRPMValue = averageWheelRPM * Math.abs(this.driveRatioValue);
    if (this.options.carConfig.transmissionMode !== "auto" || this.gearRatios.length <= 1) return;

    if (this.shiftCooldownTimer > 0) {
      this.shiftCooldownTimer = Math.max(0, this.shiftCooldownTimer - deltaTime);
      return;
    }

    if (this.engineRPMValue > this.options.carConfig.shiftUpRPM && this.gearIndexValue < this.gearRatios.length - 1) {
      this.setGear(this.gearIndexValue + 1);
    } else if (this.engineRPMValue < this.options.carConfig.shiftDownRPM && this.gearIndexValue > 0) {
      this.setGear(this.gearIndexValue - 1);
    }
  }

  private velocityBasedCarControl(): void {
    const driveIn = clamp((this.movementState.forward ? 1 : 0) - (this.movementState.backward ? 1 : 0), -1, 1);
    const steerIn = clamp(
      (this.movementState.steerLeft ? 1 : 0) -
        (this.movementState.steerRight ? 1 : 0) -
        this.movementState.joystickL.x,
      -1,
      1
    );
    const brakeIn = this.movementState.brake ? 1 : 0;

    for (const wheel of this.wheels) {
      if (wheel.options.driveWheel) wheel.setDriveDemand(driveIn);
      if (wheel.options.brakeWheel) wheel.setBrakeDemand(brakeIn);
      if (wheel.options.steerWheel) wheel.setSteerDemand(steerIn);
    }
  }

  private applyWheelImpulse(): void {
    if (!this.body.isActive()) {
      let shouldWake = false;
      for (const wheel of this.wheels) {
        if (!wheel.hitBody) continue;
        if (wheel.isOnPlatform || Math.abs(wheel.wheelLinearVelocity) > 1e-4) {
          shouldWake = true;
          break;
        }
      }

      if (!shouldWake) return;
      this.body.wakeUp();
    }

    for (const wheel of this.wheels) {
      if (!wheel.hitBody) continue;
      this.body.applyImpulse(wheel.floatImpulse, wheel.supportPosition);
      this.body.applyImpulse(wheel.longitudinalFrictionImpulse, wheel.hitPosition);
      this.body.applyImpulse(wheel.lateralFrictionImpulse, wheel.hitPosition);
    }
  }

  private syncWheelConfig(): void {
    let totalDriveTorqueWeight = 0;
    for (const wheel of this.wheels) {
      if (wheel.options.driveWheel) totalDriveTorqueWeight += Math.max(0, wheel.options.driveTorqueWeight);
    }

    const engineMaxTorque = this.options.carConfig.engineMaxRPM !== 0
      ? this.options.carConfig.engineHorsepower * 7022 / this.options.carConfig.engineMaxRPM
      : 0;
    for (const wheel of this.wheels) {
      if (wheel.options.driveWheel) {
        const weight = Math.max(0, wheel.options.driveTorqueWeight);
        wheel.setDriveWheelConfig({
          ...this.driveWheelConfig,
          maxDriveTorque: totalDriveTorqueWeight > 0 ? engineMaxTorque * weight / totalDriveTorqueWeight : 0
        });
      }
      if (wheel.options.steerWheel) {
        wheel.setSteerWheelConfig(this.steerWheelConfig);
      }
    }
  }

  private syncTransmissionConfig(): void {
    this.driveRatioValue = getDriveRatio(this.gearRatios, this.gearIndexValue, this.options.carConfig.finalDriveRatio);
    const maxWheelAngVel = getMaxWheelAngVel(this.options.carConfig.engineMaxRPM, this.driveRatioValue);
    this.driveWheelConfig.driveRatio = this.driveRatioValue;
    this.driveWheelConfig.maxWheelAngVel = maxWheelAngVel;
    this.driveWheelConfig.reverseTorqueScale = this.options.carConfig.reverseTorqueScale;
    this.driveWheelConfig.reverseRPMScale = this.options.carConfig.reverseRPMScale;
    this.steerWheelConfig.maxWheelAngVel = maxWheelAngVel;
    this.steerWheelConfig.steerRate = this.options.carConfig.steerRate;
    this.steerWheelConfig.maxSteerAngle = this.options.carConfig.maxSteerAngle;
  }

  private applyDroneControl(deltaTime: number): void {
    this.computePropellerPotential();
    const sumWorldLY =
      this.propellerPotential.sumLX * this.bodyXAxis.dot(this.upAxis) +
      this.propellerPotential.sumLY * this.bodyYAxis.dot(this.upAxis) +
      this.propellerPotential.sumLZ * this.bodyZAxis.dot(this.upAxis);
    const weight = this.body.mass() * this.gravityMag;

    if (this.options.droneConfig.controlMode === "POSITION") {
      this.positionBasedDroneControl(weight, sumWorldLY);
    } else {
      this.velocityBasedDroneControl(weight, sumWorldLY);
    }

    this.applyMixerImpulse(deltaTime);
    this.applyAirDrag(deltaTime);
  }

  private computePropellerPotential(): void {
    this.propellerPotential.sumLX = 0;
    this.propellerPotential.sumLY = 0;
    this.propellerPotential.sumLZ = 0;
    this.propellerPotential.sumAX = 0;
    this.propellerPotential.sumAY = 0;
    this.propellerPotential.sumAZ = 0;
    for (const propeller of this.propellers) {
      propeller.step(this);
      this.propellerPotential.sumLX += propeller.lx;
      this.propellerPotential.sumLY += propeller.ly;
      this.propellerPotential.sumLZ += propeller.lz;
      this.propellerPotential.sumAX += Math.abs(propeller.ax);
      this.propellerPotential.sumAY += Math.abs(propeller.ay);
      this.propellerPotential.sumAZ += Math.abs(propeller.az);
    }
  }

  private positionBasedDroneControl(weight: number, sumWorldLY: number): void {
    const config = this.options.droneConfig;
    const maxTiltTan = Math.tan(config.maxTiltAngle);

    this.posError.subVectors(this.targetPosition, this.currentPos);
    const vertPosErrorMag = this.posError.dot(this.upAxis);
    this.horizPosError.copy(this.posError).projectOnPlane(this.upAxis);
    const vertLinVelMag = this.currentLinVel.dot(this.upAxis);
    this.horizLinVel.copy(this.currentLinVel).projectOnPlane(this.upAxis);

    const vertControl = clamp(vertPosErrorMag * config.VERT_POS_P, -config.VERT_POS_D * config.maxVertSpeed, config.VERT_POS_D * config.maxVertSpeed);
    const vertForceMag = weight + vertControl - vertLinVelMag * config.VERT_POS_D;
    this.hoverThrottle = Math.max(0, vertForceMag / (sumWorldLY || 1));

    this.horizForce
      .set(0, 0, 0)
      .addScaledVector(this.horizPosError, config.HORIZ_POS_P)
      .addScaledVector(this.horizLinVel, -config.HORIZ_POS_D)
      .clampLength(0, config.HORIZ_POS_D * config.maxHorizSpeed);
    this.targetUp.copy(this.upAxis).multiplyScalar(weight).add(this.horizForce.clampLength(0, weight * maxTiltTan)).normalize();
    this.tiltError.crossVectors(this.bodyYAxis, this.targetUp);
    this.tiltAngVel.copy(this.currentAngVel).projectOnPlane(this.upAxis);

    this.targetFwd.copy(this.targetHeading).projectOnPlane(this.upAxis).normalize();
    this.currentFwd.copy(this.bodyZAxis).projectOnPlane(this.upAxis).normalize();
    const yawError = this.targetFwd.lengthSq() > 0 && this.currentFwd.lengthSq() > 0
      ? this.targetFwd.angleTo(this.currentFwd) * Math.sign(this.yawCross.crossVectors(this.currentFwd, this.targetFwd).dot(this.upAxis))
      : 0;
    const currentYawRate = this.currentAngVel.dot(this.upAxis);
    const targetYawRate = clamp(yawError * config.YAW_POS_P, -config.maxYawRate, config.maxYawRate);
    const yawRateError = targetYawRate - currentYawRate;

    this.torqueWorld
      .set(0, 0, 0)
      .addScaledVector(this.tiltError, config.TILT_P)
      .addScaledVector(this.tiltAngVel, -config.TILT_D)
      .addScaledVector(this.upAxis, yawRateError * config.YAW_VEL_P);
    this.torqueBody.copy(this.torqueWorld).applyQuaternion(this.inverseQuat);
  }

  private velocityBasedDroneControl(weight: number, sumWorldLY: number): void {
    const config = this.options.droneConfig;
    const maxTiltTan = Math.tan(config.maxTiltAngle);
    const throttleIn = clamp(
      (this.movementState.throttleUp ? 1 : 0) -
        (this.movementState.throttleDown ? 1 : 0) +
        this.movementState.joystickL.y,
      -1,
      1
    );
    const yawIn = clamp(
      (this.movementState.yawLeft ? 1 : 0) -
        (this.movementState.yawRight ? 1 : 0) -
        this.movementState.joystickL.x,
      -1,
      1
    );
    const pitchIn = clamp(
      (this.movementState.pitchForward ? 1 : 0) -
        (this.movementState.pitchBackward ? 1 : 0) +
        this.movementState.joystickR.y,
      -1,
      1
    );
    const rollIn = clamp(
      (this.movementState.rollRight ? 1 : 0) -
        (this.movementState.rollLeft ? 1 : 0) +
        this.movementState.joystickR.x,
      -1,
      1
    );

    this.worldXAxis.copy(this.bodyXAxis).projectOnPlane(this.upAxis).normalize();
    this.worldZAxis.copy(this.bodyZAxis).projectOnPlane(this.upAxis).normalize();
    this.targetLinVel
      .set(0, 0, 0)
      .addScaledVector(this.worldXAxis, -rollIn * config.maxHorizSpeed)
      .addScaledVector(this.worldZAxis, pitchIn * config.maxHorizSpeed)
      .addScaledVector(this.upAxis, throttleIn * config.maxVertSpeed);
    this.linVelError.subVectors(this.targetLinVel, this.currentLinVel);

    const vertAccCmd = clamp(this.linVelError.dot(this.upAxis) * config.VERT_VEL_P, -this.gravityMag, this.gravityMag);
    this.horizAccCmd
      .copy(this.linVelError)
      .projectOnPlane(this.upAxis)
      .multiplyScalar(config.HORIZ_VEL_P)
      .clampLength(0, this.gravityMag * maxTiltTan);
    const verticalForceMag = weight + vertAccCmd * this.body.mass();
    this.hoverThrottle = Math.max(0, verticalForceMag / (sumWorldLY || 1));

    this.targetUp.copy(this.upAxis).multiplyScalar(this.gravityMag).add(this.horizAccCmd).normalize();
    this.tiltError.crossVectors(this.bodyYAxis, this.targetUp);
    this.tiltAngVel.copy(this.currentAngVel).projectOnPlane(this.upAxis);
    const currentYawRate = this.currentAngVel.dot(this.upAxis);
    const targetYawRate = yawIn * config.maxYawRate;
    const yawRateError = targetYawRate - currentYawRate;

    this.torqueWorld
      .set(0, 0, 0)
      .addScaledVector(this.tiltError, config.TILT_P)
      .addScaledVector(this.tiltAngVel, -config.TILT_D)
      .addScaledVector(this.upAxis, yawRateError * config.YAW_VEL_P);
    this.torqueBody.copy(this.torqueWorld).applyQuaternion(this.inverseQuat);
  }

  private computePropellerFinalThrottle(propeller: ThrustPropeller, maxSafeMix: number): number {
    const mix =
      (this.torqueBody.x * propeller.ax) / (this.propellerPotential.sumAX || 1) +
      (this.torqueBody.z * propeller.az) / (this.propellerPotential.sumAZ || 1) +
      (this.torqueBody.y * propeller.ay) / (this.propellerPotential.sumAY || 1);
    return clamp(this.hoverThrottle + clamp(mix, -maxSafeMix, maxSafeMix), 0, 1);
  }

  private applyMixerImpulse(deltaTime: number): void {
    const maxSafeMix = Math.min(1 - this.hoverThrottle, this.hoverThrottle);
    if (!this.body.isActive()) {
      let shouldWake = false;
      for (const propeller of this.propellers) {
        const finalThrottle = this.computePropellerFinalThrottle(propeller, maxSafeMix);
        if (Math.abs(finalThrottle - propeller.throttle) > 1e-4) {
          shouldWake = true;
          break;
        }
      }
      if (!shouldWake) return;
      this.body.wakeUp();
    }

    for (const propeller of this.propellers) {
      const finalThrottle = this.computePropellerFinalThrottle(propeller, maxSafeMix);
      propeller.setFinalThrottle(finalThrottle);
      this.worldThrustDir.copy(propeller.thrustDirection).applyQuaternion(this.currentQuat).normalize();
      this.worldThrustPos.copy(propeller.thrustPosition).applyQuaternion(this.currentQuat).add(this.currentPos);
      this.worldTorqueDir.copy(propeller.torqueDirection).applyQuaternion(this.currentQuat).normalize();
      propeller.worldThrustDirection.copy(this.worldThrustDir);
      propeller.worldThrustPosition.copy(this.worldThrustPos);
      propeller.worldTorqueDirection.copy(this.worldTorqueDir);
      propeller.thrustImpulse.copy(this.worldThrustDir).multiplyScalar(propeller.options.maxThrust * finalThrottle * deltaTime);
      propeller.torqueImpulse
        .copy(this.worldTorqueDir)
        .multiplyScalar(propeller.options.maxThrust * finalThrottle * deltaTime * propeller.options.torqueRatio);
      this.body.applyImpulse(propeller.thrustImpulse, propeller.worldThrustPosition);
      this.body.applyAngularImpulse(propeller.torqueImpulse);
    }
  }

  private applyAirDrag(deltaTime: number): void {
    this.airDragImpulse.copy(this.currentLinVel).multiplyScalar(-this.options.droneConfig.airDragFactor * deltaTime);
    this.body.applyImpulse(this.airDragImpulse);
  }

}

export class ShapeCastWheel {
  readonly options: ResolvedWheelOptions;

  private readonly localPosition = new Vector3();
  private readonly localBaseQuat = new Quaternion();
  private readonly localSteerQuat = new Quaternion();
  private readonly worldPosition = new Vector3();
  private readonly worldQuat = new Quaternion();
  private readonly rayOrigin = new Vector3();
  private readonly rayDirection = new Vector3();
  private readonly castDirection = new Vector3();
  private readonly rayUpAxis = new Vector3();
  private readonly rayFwdAxis = new Vector3();
  private readonly rayBackAxis = new Vector3();
  private readonly rayLeftAxis = new Vector3();
  private readonly rayRotation = new Quaternion();
  private readonly rayOriginVelocity = new Vector3();
  private readonly distFromRayOriginToVehicle = new Vector3();
  private readonly angularVelocityToLinearVelocity = new Vector3();
  private readonly rayShapeCenter = new Vector3();
  private readonly targetRayHitPoint = new Vector3();
  private readonly stableRayHitPoint = new Vector3();
  private readonly rayHitPointOffset = new Vector3();
  private readonly rayHitPointPosition = new Vector3();
  private readonly rayHitPointVelocity = new Vector3();
  private readonly rayHitPointVelocityOnPlane = new Vector3();
  private readonly rayHitPointNormal = new Vector3(0, 1, 0);
  private readonly floatingImpulse = new Vector3();
  private readonly supportPoint = new Vector3();
  private readonly lngAxis = new Vector3(0, 0, 1);
  private readonly latAxis = new Vector3(1, 0, 0);
  private readonly lngFrictionImp = new Vector3();
  private readonly latFrictionImp = new Vector3();
  private readonly movingObjectPosition = new Vector3();
  private readonly movingObjectVelocity = new Vector3();
  private readonly movingObjectVelocityOnPlane = new Vector3();
  private readonly movingObjectLinearVelocity = new Vector3();
  private readonly movingObjectAngularVelocity = new Vector3();
  private readonly distanceFromOriginToObjectPoint = new Vector3();
  private readonly movingObjectAngularToLinearVelocity = new Vector3();
  private readonly wheelSupportImpulse = new Vector3();
  private readonly wheelFrictionImpulse = new Vector3();
  private lngSlipRatioCurve: CurveLUT;
  private latSlipRatioCurve: CurveLUT;
  private massRatioFallOffCurve: CurveLUT;

  private driveWheelConfig: DriveWheelConfig | null = null;
  private steerWheelConfig: SteerWheelConfig | null = null;
  private driveDemand = 0;
  private steerDemand = 0;
  private brakeDemand = 0;
  private driveTorqueValue = 0;
  private brakeTorqueValue = 0;
  private steerTarget = 0;
  private steerIncrement = 0;
  private steerAngleValue = 0;
  private frictionCoef = 0;
  private suspensionToi = 0;
  private hitBodyValue: Body | null = null;
  private rayHitFriction = 0;
  private massRatio = 1;
  private isOnMovingObject = false;
  private wheelSupportForceMag = 0;
  private wheelMass: number;
  private wheelInertia: number;
  private effectiveInertia = 0;
  private wheelAngVelValue = 0;
  private lngSlipRatioValue = 0;
  private latSlipRatioValue = 0;
  private slipStrengthValue = 0;
  private smoothedLngImpulse = 0;
  private smoothedLatImpulse = 0;
  private desiredLngImpulse = 0;
  private desiredLatImpulse = 0;

  constructor(options: WheelOptions) {
    this.options = resolveWheelOptions(options);
    vectorFromLike(vectorObjectInput(options.position), this.localPosition);
    const rotation = quaternionInput(options.rotation);
    if (rotation) this.localBaseQuat.set(rotation[0], rotation[1], rotation[2], rotation[3]);
    const volume = Math.PI * this.options.rayShapeR * this.options.rayShapeR * (this.options.rayShapeH * 2);
    this.wheelMass = this.options.wheelModelDensity * volume;
    this.wheelInertia = 0.5 * this.wheelMass * this.options.rayShapeR * this.options.rayShapeR;
    this.lngSlipRatioCurve = bakeCurveLUT(
      this.options.lngSlipRatioCurveData.points,
      this.options.lngSlipRatioCurveData.samples ?? 50
    );
    this.latSlipRatioCurve = bakeCurveLUT(
      this.options.latSlipRatioCurveData.points,
      this.options.latSlipRatioCurveData.samples ?? 50
    );
    this.massRatioFallOffCurve = bakeCurveLUT(
      this.options.massRatioFallOffCurveData.points,
      this.options.massRatioFallOffCurveData.samples ?? 50
    );
  }

  update(vehicle: Vehicle, deltaTime: number): WheelSnapshot {
    this.step(vehicle, deltaTime, vehicle.gravityMagnitude);
    return this.snapshot();
  }

  step(vehicle: Vehicle, deltaTime: number, gravityMag: number = vehicle.gravityMagnitude): void {
    if (!this.options.enable) return;

    this.updateShapeCastInfo(vehicle);
    this.handleUserInput(vehicle);
    this.steeringWheel(deltaTime);
    this.floatVehicle(vehicle, deltaTime);
    this.isOnMovingObjectDetect(vehicle);
    this.applyMassOnStandCollider(deltaTime);
    this.applyFrictionOnStandCollider();
    this.computeRelativeVelocity();
    this.computeContactFriction();
    this.computeWheelFrictionImpulse(gravityMag, deltaTime);
    this.solveWheelRotation(deltaTime);
  }

  snapshot(): WheelSnapshot {
    return {
      id: this.options.id,
      name: this.options.name,
      rayPos: cloneVector(this.rayOrigin),
      rayDir: cloneVector(this.rayDirection),
      rayUpDir: cloneVector(this.rayUpAxis),
      rayFwdDir: cloneVector(this.rayFwdAxis),
      rayLeftDir: cloneVector(this.rayLeftAxis),
      floatImpulse: cloneVector(this.floatingImpulse),
      hitBody: this.hitBodyValue,
      hitPosition: cloneVector(this.rayHitPointPosition),
      hitNormal: cloneVector(this.rayHitPointNormal),
      isOnPlatform: this.isOnMovingObject,
      longitudinalSlipRatio: this.lngSlipRatioValue,
      lateralSlipRatio: this.latSlipRatioValue,
      slipStrength: this.slipStrengthValue,
      longitudinalFrictionImpulse: cloneVector(this.lngFrictionImp),
      lateralFrictionImpulse: cloneVector(this.latFrictionImp),
      supportPosition: cloneVector(this.supportPoint),
      suspensionToi: this.suspensionToi,
      steerAngle: this.steerAngleValue,
      driveTorque: this.driveTorqueValue,
      brakeTorque: this.brakeTorqueValue,
      wheelLinearVelocity: this.wheelLinearVelocity,
      wheelAngularVelocity: this.wheelAngVelValue
    };
  }

  setDriveDemand(value: number): void {
    this.driveDemand = clamp(value, -1, 1);
  }

  setBrakeDemand(value: number): void {
    this.brakeDemand = clamp(value, 0, 1);
  }

  setSteerDemand(value: number): void {
    this.steerDemand = clamp(value, -1, 1);
  }

  setDriveWheelConfig(config: DriveWheelConfig): void {
    this.driveWheelConfig = config;
  }

  setSteerWheelConfig(config: SteerWheelConfig): void {
    this.steerWheelConfig = config;
  }

  refreshConfig(): void {
    const volume = Math.PI * this.options.rayShapeR * this.options.rayShapeR * (this.options.rayShapeH * 2);
    this.wheelMass = this.options.wheelModelDensity * volume;
    this.wheelInertia = 0.5 * this.wheelMass * this.options.rayShapeR * this.options.rayShapeR;
    this.lngSlipRatioCurve = bakeCurveLUT(
      this.options.lngSlipRatioCurveData.points,
      this.options.lngSlipRatioCurveData.samples ?? 50
    );
    this.latSlipRatioCurve = bakeCurveLUT(
      this.options.latSlipRatioCurveData.points,
      this.options.latSlipRatioCurveData.samples ?? 50
    );
    this.massRatioFallOffCurve = bakeCurveLUT(
      this.options.massRatioFallOffCurveData.points,
      this.options.massRatioFallOffCurveData.samples ?? 50
    );
  }

  setLocalPosition(position: readonly [number, number, number] | Vector3Like): void {
    vectorFromLike(vectorObjectInput(position), this.localPosition);
  }

  get localPos(): Vector3 {
    return this.localPosition;
  }

  get hitBody(): Body | null {
    return this.hitBodyValue;
  }

  get hitPosition(): Vector3 {
    return this.rayHitPointPosition;
  }

  get hitNormal(): Vector3 {
    return this.rayHitPointNormal;
  }

  get supportPosition(): Vector3 {
    return this.supportPoint;
  }

  get suspensionDistance(): number {
    return this.suspensionToi;
  }

  get floatImpulse(): Vector3 {
    return this.floatingImpulse;
  }

  get longitudinalFrictionImpulse(): Vector3 {
    return this.lngFrictionImp;
  }

  get lateralFrictionImpulse(): Vector3 {
    return this.latFrictionImp;
  }

  get wheelAngularVelocity(): number {
    return this.wheelAngVelValue;
  }

  get wheelLinearVelocity(): number {
    return this.wheelAngVelValue * this.options.rayShapeR;
  }

  get isOnPlatform(): boolean {
    return this.isOnMovingObject;
  }

  get steerAngle(): number {
    return this.steerAngleValue;
  }

  private updateShapeCastInfo(vehicle: Vehicle): void {
    this.localSteerQuat.setFromAxisAngle(FIXED_Y, this.steerAngleValue);
    this.worldPosition.copy(this.localPosition).applyQuaternion(vehicle.currQuat).add(vehicle.currPos);
    this.worldQuat.copy(vehicle.currQuat).multiply(this.localBaseQuat).multiply(this.localSteerQuat);
    this.rayOrigin.copy(this.worldPosition);
    this.rayDirection.set(0, -1, 0).applyQuaternion(this.worldQuat);
    this.rayUpAxis.copy(this.rayDirection).negate();
    this.rayFwdAxis.set(0, 0, 1).applyQuaternion(this.worldQuat);
    this.rayBackAxis.copy(this.rayFwdAxis).negate();
    this.rayLeftAxis.crossVectors(this.rayUpAxis, this.rayFwdAxis).normalize();
    this.distFromRayOriginToVehicle.copy(this.rayOrigin).sub(vehicle.currPos);
    this.angularVelocityToLinearVelocity.crossVectors(vehicle.currAngVel, this.distFromRayOriginToVehicle);
    this.rayOriginVelocity.copy(vehicle.currLinVel).add(this.angularVelocityToLinearVelocity);
  }

  private handleUserInput(vehicle: Vehicle): void {
    const driveConfig = this.driveWheelConfig;
    const steerConfig = this.steerWheelConfig;
    this.driveTorqueValue = 0;
    this.brakeTorqueValue = 0;

    if (this.options.driveWheel && driveConfig && driveConfig.maxDriveTorque !== 0) {
      const maxAngVel = driveConfig.maxWheelAngVel * (this.driveDemand < 0 ? driveConfig.reverseRPMScale : 1);
      const angvelRatio = maxAngVel > 0 ? Math.abs(this.wheelAngVelValue) / maxAngVel : 1;
      this.driveTorqueValue =
        this.driveDemand *
        driveConfig.maxDriveTorque *
        driveConfig.driveRatio *
        (this.driveDemand < 0 ? driveConfig.reverseTorqueScale : 1) *
        evaluateCurveLUT(angvelRatio, driveConfig.engineTorqueCurve) *
        (this.options.driveInvert ? -1 : 1);
    }

    if (this.options.steerWheel && steerConfig) {
      const maxAngVel = steerConfig.maxWheelAngVel;
      const speedRatio = maxAngVel > 0
        ? clamp(vehicle.currLinVel.dot(vehicle.bodyZ) / (maxAngVel * this.options.rayShapeR), 0, 1)
        : 0;
      this.steerTarget =
        this.steerDemand *
        steerConfig.maxSteerAngle *
        evaluateCurveLUT(speedRatio, steerConfig.steerAngleCurve) *
        (this.options.steerInvert ? -1 : 1);
    }

    if (this.options.brakeWheel) {
      this.brakeTorqueValue = this.brakeDemand * this.options.maxBrakeTorque;
    }
  }

  private steeringWheel(deltaTime: number): void {
    const angleDiff = this.steerTarget - this.steerAngleValue;
    const maxIncrement = (this.steerWheelConfig?.steerRate ?? 0) * deltaTime;
    this.steerIncrement = Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), maxIncrement);
    this.steerAngleValue += this.steerIncrement;
  }

  private floatVehicle(vehicle: Vehicle, deltaTime: number): void {
    let hit: ShapeCastHit | null = null;
    let hitDistance = 0;
    this.hitBodyValue = null;

    if (this.options.groundDetection === "rayCast") {
      const rayLength = this.options.rayLength + this.options.rayShapeR;
      const rayHit = vehicle.world.castRay(this.rayOrigin, this.castDirection.copy(this.rayDirection).multiplyScalar(rayLength), {
        excludeBody: vehicle.body,
        filter: ({ body }) => this.vehicleRayFilter(body)
      });
      if (rayHit) {
        hitDistance = rayHit.fraction * rayLength;
        this.targetRayHitPoint.copy(rayHit.point);
        this.rayHitPointNormal.copy(rayHit.normal).normalize();
        this.hitBodyValue = rayHit.body ?? null;
      }
    } else {
      this.rayRotation.copy(this.worldQuat).multiply(ROT_Z_90);
      hit = vehicle.world.castShape(
        Shape.cylinder({ halfHeight: this.options.rayShapeH, radius: this.options.rayShapeR }),
        this.rayOrigin,
        { x: this.rayRotation.x, y: this.rayRotation.y, z: this.rayRotation.z, w: this.rayRotation.w },
        this.castDirection.copy(this.rayDirection).multiplyScalar(this.options.rayLength),
        {
          excludeBody: vehicle.body,
          filter: ({ body }) => this.vehicleRayFilter(body)
        }
      );
      if (hit) {
        hitDistance = hit.fraction * this.options.rayLength;
        this.targetRayHitPoint.copy(hit.contactPointOnBody);
        this.rayHitPointNormal.copy(hit.normal).normalize();
        this.hitBodyValue = hit.body ?? null;
      }
    }

    if (this.hitBodyValue) {
      this.suspensionToi = this.options.groundDetection === "rayCast"
        ? Math.max(0, hitDistance - this.options.rayShapeR)
        : hitDistance;
      this.rayShapeCenter.copy(this.rayOrigin).addScaledVector(this.rayDirection, this.suspensionToi);
      let supportOffset = 0;
      if (this.options.groundDetection === "rayCast") {
        this.stableRayHitPoint.copy(this.targetRayHitPoint);
      } else {
        const rawOffset = clamp(
          this.rayHitPointOffset.copy(this.targetRayHitPoint).sub(this.rayShapeCenter).dot(this.rayLeftAxis),
          -this.options.rayShapeH,
          this.options.rayShapeH
        );
        this.stableRayHitPoint.copy(this.targetRayHitPoint).addScaledVector(this.rayLeftAxis, -rawOffset);
        const normalSide = this.rayHitPointNormal.dot(this.rayLeftAxis);
        const normalFwd = this.rayHitPointNormal.dot(this.rayFwdAxis);
        const sideWeight = clamp(Math.abs(normalSide) / Math.sqrt(Math.max(1 - normalFwd * normalFwd, EPSILON)), 0, 1);
        supportOffset = -Math.abs(rawOffset) * Math.sign(normalSide) * sideWeight;
      }
      this.rayHitPointPosition.copy(this.stableRayHitPoint).addScaledVector(this.rayLeftAxis, supportOffset);
      this.supportPoint.copy(this.rayShapeCenter).addScaledVector(this.rayLeftAxis, supportOffset);
      this.rayHitFriction = this.hitBodyValue.friction();
      this.rayHitPointVelocity.copy(this.rayOriginVelocity);
      const springForce = this.options.springK * Math.max(0, this.options.rayLength - this.suspensionToi);
      const dampingForce = this.options.dampingC * this.rayHitPointVelocity.dot(this.rayUpAxis);
      this.floatingImpulse.copy(this.rayHitPointNormal).multiplyScalar(springForce - dampingForce).multiplyScalar(deltaTime);
    } else {
      this.suspensionToi = 0;
      this.rayHitFriction = 0;
      this.floatingImpulse.set(0, 0, 0);
      this.rayHitPointVelocity.copy(this.rayOriginVelocity);
    }
  }

  private isOnMovingObjectDetect(vehicle: Vehicle): void {
    if (
      this.options.followPlatform &&
      this.hitBodyValue &&
      (this.hitBodyValue.motionType() === "dynamic" || this.hitBodyValue.motionType() === "kinematic")
    ) {
      this.isOnMovingObject = true;
      if (this.hitBodyValue.motionType() === "dynamic") {
        const ratio = clamp(this.hitBodyValue.mass() / Math.max(vehicle.body.mass(), EPSILON), 0, 1);
        this.massRatio = evaluateCurveLUT(ratio, this.massRatioFallOffCurve);
      } else {
        this.massRatio = 1;
      }
      vectorFromLike(this.hitBodyValue.translation(), this.movingObjectPosition);
      this.distanceFromOriginToObjectPoint.copy(this.rayOrigin).sub(this.movingObjectPosition);
      vectorFromLike(this.hitBodyValue.linearVelocity(), this.movingObjectLinearVelocity);
      vectorFromLike(this.hitBodyValue.angularVelocity(), this.movingObjectAngularVelocity);
      this.movingObjectAngularToLinearVelocity.crossVectors(this.movingObjectAngularVelocity, this.distanceFromOriginToObjectPoint);
      this.movingObjectVelocity
        .copy(this.movingObjectLinearVelocity)
        .add(this.movingObjectAngularToLinearVelocity)
        .multiplyScalar(this.massRatio);
      this.movingObjectVelocityOnPlane.copy(this.movingObjectVelocity).projectOnPlane(this.rayHitPointNormal);
    } else {
      this.isOnMovingObject = false;
      this.massRatio = 1;
      this.movingObjectVelocity.set(0, 0, 0);
      this.movingObjectVelocityOnPlane.set(0, 0, 0);
    }
  }

  private applyMassOnStandCollider(deltaTime: number): void {
    if (!this.hitBodyValue || this.hitBodyValue.motionType() !== "dynamic" || !this.options.applyCounterMass) return;
    this.wheelSupportImpulse
      .copy(this.rayHitPointNormal)
      .multiplyScalar(-this.wheelSupportForceMag * deltaTime * this.massRatio);
    if (this.wheelSupportForceMag > 0) {
      this.hitBodyValue.applyImpulse(this.wheelSupportImpulse, this.rayHitPointPosition);
    }
  }

  private applyFrictionOnStandCollider(): void {
    if (!this.hitBodyValue || this.hitBodyValue.motionType() !== "dynamic" || !this.options.applyCounterFriction) return;
    this.wheelFrictionImpulse.addVectors(this.lngFrictionImp, this.latFrictionImp).multiplyScalar(-this.massRatio);
    if (this.wheelFrictionImpulse.lengthSq() > 1e-4) {
      this.hitBodyValue.applyImpulse(this.wheelFrictionImpulse, this.rayHitPointPosition);
    }
  }

  private computeRelativeVelocity(): void {
    this.rayHitPointVelocity.copy(this.rayOriginVelocity);
    this.rayHitPointVelocityOnPlane.copy(this.rayHitPointVelocity).projectOnPlane(this.rayHitPointNormal);
    if (this.isOnMovingObject && this.options.followPlatform) {
      this.rayHitPointVelocity.sub(this.movingObjectVelocity);
      this.rayHitPointVelocityOnPlane.sub(this.movingObjectVelocityOnPlane);
    }
  }

  private computeContactFriction(): void {
    this.frictionCoef = this.hitBodyValue ? Math.max((this.rayHitFriction + this.options.tireGripFactor) * 0.5, 0) : 0;
  }

  private computeWheelFrictionImpulse(gravityMagInput: number, deltaTime: number): void {
    const gravityMag = Math.max(gravityMagInput, EPSILON);
    if (!this.hitBodyValue) {
      this.wheelSupportForceMag = this.wheelMass * gravityMag;
      this.effectiveInertia = this.wheelInertia + (this.wheelSupportForceMag / gravityMag) * this.options.rayShapeR * this.options.rayShapeR;
      this.lngSlipRatioValue = 0;
      this.latSlipRatioValue = 0;
      this.slipStrengthValue = 0;
      this.lngFrictionImp.set(0, 0, 0);
      this.latFrictionImp.set(0, 0, 0);
      return;
    }

    const floatingImpMag = Math.max(this.floatingImpulse.dot(this.rayHitPointNormal), 0);
    this.wheelSupportForceMag = floatingImpMag / Math.max(deltaTime, EPSILON);
    this.effectiveInertia = Math.max(
      this.wheelInertia + (this.wheelSupportForceMag / gravityMag) * this.options.rayShapeR * this.options.rayShapeR,
      EPSILON
    );
    this.lngAxis.copy(this.rayFwdAxis).projectOnPlane(this.rayHitPointNormal);
    if (this.lngAxis.lengthSq() < EPSILON) this.lngAxis.copy(this.rayFwdAxis);
    this.lngAxis.normalize();
    this.latAxis.copy(this.rayLeftAxis).projectOnPlane(this.rayHitPointNormal);
    if (this.latAxis.lengthSq() < EPSILON) this.latAxis.copy(this.rayLeftAxis);
    this.latAxis.normalize();

    const lngContactVel = this.rayHitPointVelocity.dot(this.lngAxis);
    const latContactVel = this.rayHitPointVelocity.dot(this.latAxis);
    const lngContactVelAbs = Math.abs(lngContactVel);
    const latContactVelAbs = Math.abs(latContactVel);
    const wheelLinVel = this.wheelAngVelValue * this.options.rayShapeR;
    const slipDiff = wheelLinVel - lngContactVel;
    const slipDiffAbs = Math.abs(slipDiff);

    this.lngSlipRatioValue = slipDiffAbs / Math.max(lngContactVelAbs, 1e-4);
    this.latSlipRatioValue = latContactVelAbs === 0 && lngContactVelAbs === 0
      ? 0
      : clamp(Math.atan2(latContactVelAbs, lngContactVelAbs) / (Math.PI / 2), 0, 1);
    this.slipStrengthValue = Math.max(this.lngSlipRatioValue, this.latSlipRatioValue);

    const lngSlipValue = evaluateCurveLUT(this.lngSlipRatioValue, this.lngSlipRatioCurve);
    const latSlipValue = evaluateCurveLUT(this.latSlipRatioValue, this.latSlipRatioCurve);
    const lngStaticWeight = clamp(1 - Math.max(slipDiffAbs, lngContactVelAbs) / this.options.lowVelThreshold, 0, 1);
    const finalLngSlipValue = remap(lngStaticWeight, 0, 1, lngSlipValue, 1);
    const latStaticWeight = clamp(1 - Math.max(latContactVelAbs, lngContactVelAbs) / this.options.lowVelThreshold, 0, 1);
    const finalLatSlipValue = remap(latStaticWeight, 0, 1, latSlipValue, 1);

    const maxLngImp = this.wheelSupportForceMag * finalLngSlipValue * this.frictionCoef * deltaTime * this.options.lngFrictionEllipseScale;
    const maxLatImp = this.wheelSupportForceMag * finalLatSlipValue * this.frictionCoef * deltaTime * this.options.latFrictionEllipseScale;
    if (maxLngImp <= EPSILON || maxLatImp <= EPSILON) {
      this.lngFrictionImp.set(0, 0, 0);
      this.latFrictionImp.set(0, 0, 0);
      return;
    }

    this.desiredLngImpulse = slipDiff * this.effectiveInertia / (this.options.rayShapeR * this.options.rayShapeR);
    this.desiredLatImpulse = latContactVel * (this.wheelSupportForceMag / gravityMag);
    const ellipseUsage = Math.sqrt(
      (this.desiredLngImpulse / maxLngImp) * (this.desiredLngImpulse / maxLngImp) +
        (this.desiredLatImpulse / maxLatImp) * (this.desiredLatImpulse / maxLatImp)
    );
    if (ellipseUsage > 1) {
      this.desiredLngImpulse /= ellipseUsage;
      this.desiredLatImpulse /= ellipseUsage;
    }

    const lngCoeff = clamp(Math.max(this.options.minLngRelaxCoeff, (lngContactVelAbs / Math.max(this.options.relaxLngRate, EPSILON)) * deltaTime), 0, 1);
    const latCoeff = clamp(Math.max(this.options.minLatRelaxCoeff, (latContactVelAbs / Math.max(this.options.relaxLatRate, EPSILON)) * deltaTime), 0, 1);
    this.smoothedLngImpulse += (this.desiredLngImpulse - this.smoothedLngImpulse) * lngCoeff;
    this.smoothedLatImpulse += (this.desiredLatImpulse - this.smoothedLatImpulse) * latCoeff;
    this.lngFrictionImp.copy(this.lngAxis).multiplyScalar(this.smoothedLngImpulse);
    this.latFrictionImp.copy(this.latAxis).multiplyScalar(-this.smoothedLatImpulse);
  }

  private solveWheelRotation(deltaTime: number): void {
    const isDriving = this.options.driveWheel && Math.abs(this.driveTorqueValue) > 0 && this.hitBodyValue;
    const isBraking = this.options.brakeWheel && Math.abs(this.brakeTorqueValue) > 0 && this.hitBodyValue;
    const isFreeRolling = !isDriving && !isBraking;

    if (this.hitBodyValue) {
      this.wheelAngVelValue -= (this.lngFrictionImp.dot(this.lngAxis) * this.options.rayShapeR) / Math.max(this.effectiveInertia, EPSILON);
    }

    if ((this.hitBodyValue && isFreeRolling) || (!this.hitBodyValue && this.wheelAngVelValue !== 0)) {
      const rollingResistTorque = -this.options.rollingResistanceCoef * this.wheelSupportForceMag * this.wheelAngVelValue;
      this.wheelAngVelValue += rollingResistTorque / Math.max(this.effectiveInertia, EPSILON) * deltaTime;
    }

    if (isDriving && !isBraking) {
      this.wheelAngVelValue += this.driveTorqueValue / Math.max(this.effectiveInertia, EPSILON) * deltaTime;
    }

    if (isBraking) {
      const sign = Math.sign(this.wheelAngVelValue);
      const appliedBrakeTorque = this.brakeTorqueValue * -sign;
      this.wheelAngVelValue += Math.min(
        Math.abs(this.wheelAngVelValue),
        Math.abs(appliedBrakeTorque / Math.max(this.effectiveInertia, EPSILON)) * deltaTime
      ) * -sign;
    }
  }

  private vehicleRayFilter(body: Body | undefined): boolean {
    const userData = body?.userData;
    if (!isControllerUserData(userData)) return true;
    return !(userData.controller?.excludeRay || userData.controller?.excludeVehicleRay);
  }
}

export class ThrustPropeller {
  readonly options: ResolvedPropellerOptions;
  readonly thrustPosition = new Vector3();
  readonly thrustDirection = new Vector3(0, 1, 0);
  readonly thrustPotential = new Vector3();
  readonly torqueDirection = new Vector3(0, 1, 0);
  readonly torquePotential = new Vector3();
  readonly worldThrustPosition = new Vector3();
  readonly worldThrustDirection = new Vector3();
  readonly worldTorqueDirection = new Vector3();
  readonly thrustImpulse = new Vector3();
  readonly torqueImpulse = new Vector3();

  private readonly localPosition = new Vector3();
  private readonly localQuat = new Quaternion();
  private readonly thrustForce = new Vector3();
  private readonly leverageTorque = new Vector3();
  private readonly reactionTorque = new Vector3();
  private throttleValue = 0;
  private finalThrottleValue = 0;

  lx = 0;
  ly = 0;
  lz = 0;
  ax = 0;
  ay = 0;
  az = 0;

  constructor(options: PropellerOptions) {
    this.options = resolvePropellerOptions(options);
    vectorFromLike(vectorObjectInput(options.position), this.localPosition);
    const rotation = quaternionInput(options.rotation);
    if (rotation) this.localQuat.set(rotation[0], rotation[1], rotation[2], rotation[3]);
  }

  update(vehicle: Vehicle): PropellerSnapshot {
    this.step(vehicle);
    return this.snapshot();
  }

  step(_vehicle: Vehicle): void {
    this.thrustDirection.set(0, this.options.invertThrust ? -1 : 1, 0).applyQuaternion(this.localQuat);
    this.thrustForce.copy(this.thrustDirection).multiplyScalar(this.options.maxThrust);
    this.leverageTorque.crossVectors(this.localPosition, this.thrustForce);
    this.torqueDirection.set(0, this.options.invertTorque ? -1 : 1, 0).applyQuaternion(this.localQuat);
    this.reactionTorque.copy(this.torqueDirection).multiplyScalar(this.options.maxThrust * this.options.torqueRatio);
    this.torquePotential.copy(this.leverageTorque).add(this.reactionTorque);
    this.thrustPosition.copy(this.localPosition);
    this.thrustPotential.copy(this.thrustForce);
    this.throttleValue = this.finalThrottleValue;

    this.lx = this.thrustForce.x;
    this.ly = this.thrustForce.y;
    this.lz = this.thrustForce.z;
    this.ax = this.torquePotential.x;
    this.ay = this.torquePotential.y;
    this.az = this.torquePotential.z;
  }

  snapshot(): PropellerSnapshot {
    return {
      id: this.options.id,
      name: this.options.name,
      thrustPosition: cloneVector(this.thrustPosition),
      thrustDirection: cloneVector(this.thrustDirection),
      torqueDirection: cloneVector(this.torqueDirection),
      worldThrustPosition: cloneVector(this.worldThrustPosition),
      worldThrustDirection: cloneVector(this.worldThrustDirection),
      worldTorqueDirection: cloneVector(this.worldTorqueDirection),
      thrustImpulse: cloneVector(this.thrustImpulse),
      torqueImpulse: cloneVector(this.torqueImpulse),
      throttle: this.throttleValue,
      finalThrottle: this.finalThrottleValue
    };
  }

  setFinalThrottle(value: number): void {
    this.finalThrottleValue = clamp(value, 0, 1);
  }

  setLocalPosition(position: readonly [number, number, number] | Vector3Like): void {
    vectorFromLike(vectorObjectInput(position), this.localPosition);
  }

  get localPos(): Vector3 {
    return this.localPosition;
  }

  get finalThrottle(): number {
    return this.finalThrottleValue;
  }

  get throttle(): number {
    return this.throttleValue;
  }
}

function resolveVehicleOptions(options: VehicleOptions): ResolvedVehicleOptions {
  return {
    enable: options.enable ?? true,
    carConfig: {
      ...DEFAULT_CAR_CONFIG,
      ...options.carConfig,
      gearRatios: options.carConfig?.gearRatios && options.carConfig.gearRatios.length > 0
        ? options.carConfig.gearRatios
        : DEFAULT_CAR_CONFIG.gearRatios,
      engineTorqueCurveData: options.carConfig?.engineTorqueCurveData ?? DEFAULT_CAR_CONFIG.engineTorqueCurveData,
      steerAngleCurveData: options.carConfig?.steerAngleCurveData ?? DEFAULT_CAR_CONFIG.steerAngleCurveData
    },
    droneConfig: {
      ...DEFAULT_DRONE_CONFIG,
      ...options.droneConfig
    },
    enableCustomGravity: options.enableCustomGravity ?? false,
    gravityDirLerpSpeed: options.gravityDirLerpSpeed ?? 6,
    gravityField: options.gravityField ?? (() => ({ x: 0, y: -9.81, z: 0 }))
  };
}

function resolveWheelOptions(options: WheelOptions): ResolvedWheelOptions {
  return {
    ...DEFAULT_WHEEL_OPTIONS,
    ...options,
    id: options.id ?? cryptoRandomId(),
    name: options.name ?? ""
  };
}

function resolvePropellerOptions(options: PropellerOptions): ResolvedPropellerOptions {
  return {
    ...DEFAULT_PROPELLER_OPTIONS,
    ...options,
    id: options.id ?? cryptoRandomId(),
    name: options.name ?? ""
  };
}

function getDriveRatio(gearRatios: readonly number[], gearIndex: number, finalDriveRatio: number): number {
  return (gearRatios[gearIndex] ?? gearRatios[0] ?? 0) * finalDriveRatio;
}

function getMaxWheelAngVel(engineMaxRPM: number, driveRatio: number): number {
  return driveRatio !== 0 ? (engineMaxRPM / driveRatio) * (2 * Math.PI / 60) : 0;
}

function vectorInput(input: readonly [number, number, number] | Vector3Like): [number, number, number] {
  return "x" in input ? [input.x, input.y, input.z] : [input[0], input[1], input[2]];
}

function vectorObjectInput(input: readonly [number, number, number] | Vector3Like): Vector3Like {
  return "x" in input ? input : { x: input[0], y: input[1], z: input[2] };
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

function isControllerUserData(input: unknown): input is ControllerUserData {
  return typeof input === "object" && input !== null && "controller" in input;
}

let nextId = 0;
function cryptoRandomId(): string {
  nextId += 1;
  return `part-${nextId}`;
}
