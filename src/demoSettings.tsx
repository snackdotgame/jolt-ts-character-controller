import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Leva, button, folder, useControls } from "leva";
import type { GroundDetectionMode, TransmissionMode, VehicleControlMode } from "./index.js";
import type { CurveData } from "./curves.js";
import { CurveEditorPlugin } from "./plugins/leva/CurveEditorPlugin.js";

export interface DemoSettings {
  world: {
    pausedPhysics: boolean;
    physicsDebug: boolean;
    physicsGravity: [number, number, number];
    slowMotion: number;
  };
  camera: {
    followPlayer: boolean;
    smoothTime: number;
  };
  ecctrl: {
    animatedCharacter: boolean;
    debug: boolean;
    enable: boolean;
    canSleep: boolean;
    density: number;
    capsuleHalfHeight: number;
    capsuleRadius: number;
    useCameraForward: boolean;
    useCharacterUpForForward: boolean;
    enableCustomGravity: boolean;
    gravityDirLerpSpeed: number;
    maxWalkVel: number;
    maxRunVel: number;
    accDeltaTime: number;
    decDeltaTime: number;
    rejectVelFactor: number;
    moveImpulsePointOffset: number;
    jumpVel: number;
    jumpDuration: number;
    slopeJumpFactor: number;
    airDragFactor: number;
    slideGripFactor: number;
    platformGripFactor: number;
    liftGripFactor: number;
    fallingGravityScale: number;
    fallingMaxVel: number;
    enableToggleRun: boolean;
    groundDetection: "shapeCast" | "rayCast";
    slopeMaxAngle: number;
    floatHeight: number;
    rayOriginOffest: number;
    rayHitForgiveness: number;
    rayLength: number;
    rayRadius: number;
    springK: number;
    dampingC: number;
    autoBalance: boolean;
    autoBalanceSpringK: number;
    autoBalanceDampingC: number;
    autoBalanceSpringOnY: number;
    autoBalanceDampingOnY: number;
    followPlatform: boolean;
    massRatioFallOffCurveData: CurveData;
    applyCounterMass: boolean;
    applyCounterJumpImp: boolean;
    counterJumpImpFactor: number;
    applyCounterMoveImp: boolean;
    counterMoveImpFactor: number;
  };
  vehicles: {
    vehicle1: VehicleSettings;
    vehicle2: VehicleSettings;
    vehicle3: VehicleSettings;
  };
}

export interface VehicleSettings {
  enable: boolean;
  canSleep: boolean;
  position: [number, number, number];
  rotation: [number, number, number];
  enableCustomGravity: boolean;
  gravityDirLerpSpeed: number;
  debug: boolean;
  wheelDebuggerArrowScale: number;
  propellerDebuggerArrowScale: number;
  car: CarControlSettings;
  wheel: WheelControlSettings;
  drone: DroneControlSettings;
  propeller: PropellerControlSettings;
}

export interface CarControlSettings {
  engineHorsepower: number;
  engineMaxRPM: number;
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

export interface WheelControlSettings {
  offset: { x: number; y: number; z: number };
  groundDetection: GroundDetectionMode;
  rayShapeR: number;
  rayShapeH: number;
  rayLength: number;
  springK: number;
  dampingC: number;
  frontMaxBrakeTorque: number;
  rearMaxBrakeTorque: number;
  rollingResistanceCoef: number;
  lowVelThreshold: number;
  tireGripFactor: number;
  lngFrictionEllipseScale: number;
  latFrictionEllipseScale: number;
  relaxLngRate: number;
  relaxLatRate: number;
  minLngRelaxCoeff: number;
  minLatRelaxCoeff: number;
  lngSlipRatioCurveData: CurveData;
  latSlipRatioCurveData: CurveData;
  followPlatform: boolean;
  massRatioFallOffCurveData: CurveData;
  applyCounterMass: boolean;
  applyCounterFriction: boolean;
  showWheelModel: boolean;
  wheelModelDensity: number;
  wheelModelUpdate: boolean;
  wheelModelRadius: number;
  wheelModelLerpPosRate: number;
  wheelModelReversRotation: boolean;
  debug: boolean;
  debuggerArrowScale: number;
}

export interface DroneControlSettings {
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

export interface PropellerControlSettings {
  offset: { x: number; y: number; z: number };
  maxThrust: number;
  torqueRatio: number;
  showPropellerModel: boolean;
  propellerModelUpdate: boolean;
  propellerModelMaxSpin: number;
  propellerModelLerpSpinRate: number;
  debug: boolean;
  debuggerScale: number;
  debuggerArrowScale: number;
}

export interface DemoSettingsActions {
  resetPlayer(): void;
  cameraLock(): void;
  firstPerson(): void;
  toggleLockForward(): void;
  flipVehicle1(): void;
  flipVehicle2(): void;
  flipVehicle3(): void;
}

export interface DemoSettingsHandle {
  setDroneControlMode(controlMode: VehicleControlMode): void;
}

type LevaSettingsSetter<T> = (values: Partial<T>) => void;
type DroneSettingsRegistrar = (setter: LevaSettingsSetter<DroneControlSettings> | null) => void;

export function createDefaultDemoSettings(): DemoSettings {
  return {
    world: {
      pausedPhysics: true,
      physicsDebug: false,
      physicsGravity: [0, 0, 0],
      slowMotion: 1
    },
    camera: {
      followPlayer: true,
      smoothTime: 0.1
    },
    ecctrl: {
      animatedCharacter: true,
      debug: true,
      enable: true,
      canSleep: true,
      density: 200,
      capsuleHalfHeight: 0.3,
      capsuleRadius: 0.3,
      useCameraForward: true,
      useCharacterUpForForward: false,
      enableCustomGravity: true,
      gravityDirLerpSpeed: 6,
      maxWalkVel: 1.1,
      maxRunVel: 5.5,
      accDeltaTime: 0.2,
      decDeltaTime: 0.2,
      rejectVelFactor: 1,
      moveImpulsePointOffset: 0,
      jumpVel: 6,
      jumpDuration: 0.1,
      slopeJumpFactor: 0,
      airDragFactor: 0.1,
      slideGripFactor: 0.5,
      platformGripFactor: 1,
      liftGripFactor: 0.16,
      fallingGravityScale: 3,
      fallingMaxVel: 20,
      enableToggleRun: true,
      groundDetection: "shapeCast",
      slopeMaxAngle: 1,
      floatHeight: 0.3,
      rayOriginOffest: -0.35,
      rayHitForgiveness: 0.3,
      rayLength: 1.3,
      rayRadius: 0.15,
      springK: 6400,
      dampingC: 860,
      autoBalance: true,
      autoBalanceSpringK: 50,
      autoBalanceDampingC: 3,
      autoBalanceSpringOnY: 8,
      autoBalanceDampingOnY: 0.76,
      followPlatform: true,
      massRatioFallOffCurveData: {
        points: [
          { x: 0, y: 0, r_out: 0 },
          { x: 0.5, y: 0, r_in: 0, r_out: 0 },
          { x: 1, y: 1, r_in: 0 }
        ],
        samples: 50
      },
      applyCounterMass: true,
      applyCounterJumpImp: true,
      counterJumpImpFactor: 1,
      applyCounterMoveImp: true,
      counterMoveImpFactor: 1
    },
    vehicles: {
      vehicle1: createDefaultVehicleSettings(),
      vehicle2: createDefaultVehicleSettings({
        position: [-5, 2, -60],
        wheel: {
          offset: { x: 0.85, y: 0, z: 1.5 },
          springK: 25000,
          dampingC: 3200,
          frontMaxBrakeTorque: 2600,
          rearMaxBrakeTorque: 1800
        }
      }),
      vehicle3: createDefaultVehicleSettings({
        position: [0, 3, -55],
        rotation: [0, Math.PI, 0],
        drone: {
          controlMode: "POSITION",
          maxHorizSpeed: 20,
          maxVertSpeed: 8,
          VERT_POS_P: 900,
          VERT_POS_D: 700,
          HORIZ_POS_P: 500,
          HORIZ_POS_D: 550
        },
        propeller: {
          maxThrust: 5000,
          torqueRatio: 0.6,
          debuggerArrowScale: 5
        }
      })
    }
  };
}

export function mountDemoSettings(root: HTMLElement, settings: DemoSettings, actions: DemoSettingsActions): DemoSettingsHandle {
  const container = document.createElement("div");
  root.append(container);
  let setVehicle3DroneSettings: LevaSettingsSetter<DroneControlSettings> | null = null;
  const registerVehicle3DroneSettings: DroneSettingsRegistrar = (setter) => {
    setVehicle3DroneSettings = setter;
  };
  const handle: DemoSettingsHandle = {
    setDroneControlMode(controlMode) {
      settings.vehicles.vehicle3.drone.controlMode = controlMode;
      setVehicle3DroneSettings?.({ controlMode });
    }
  };
  createRoot(container).render(
    <>
      <Leva collapsed />
      <DemoLevaSettings
        settings={settings}
        actions={actions}
        registerVehicle3DroneSettings={registerVehicle3DroneSettings}
      />
    </>
  );
  return handle;
}

function DemoLevaSettings(props: {
  readonly settings: DemoSettings;
  readonly actions: DemoSettingsActions;
  readonly registerVehicle3DroneSettings: DroneSettingsRegistrar;
}) {
  const { settings, actions, registerVehicle3DroneSettings } = props;
  const [worldValues, setWorldSettings] = useControls(
    "World Settings",
    () => ({
      physicsDebug: settings.world.physicsDebug,
      pausedPhysics: settings.world.pausedPhysics,
      physicsGravity: { value: settings.world.physicsGravity },
      slowMotion: {
        value: settings.world.slowMotion,
        min: 0.01,
        max: 1,
        step: 0.01
      }
    }),
    { collapsed: true }
  );
  Object.assign(settings.world, {
    physicsDebug: worldValues.physicsDebug,
    pausedPhysics: worldValues.pausedPhysics,
    physicsGravity: worldValues.physicsGravity,
    slowMotion: worldValues.slowMotion
  });

  useEffect(() => {
    const timeout = window.setTimeout(() => setWorldSettings({ pausedPhysics: false }), 1000);
    return () => window.clearTimeout(timeout);
  }, [setWorldSettings]);

  const cameraValues = useControls(
    "Camera Settings",
    {
      followPlayer: settings.camera.followPlayer,
      smoothTime: { value: settings.camera.smoothTime, step: 0.01, min: 0, max: 1 },
      CameraLock: button(actions.cameraLock),
      FirstPerson: button(actions.firstPerson)
    },
    { collapsed: true }
  );
  Object.assign(settings.camera, {
    followPlayer: cameraValues.followPlayer,
    smoothTime: cameraValues.smoothTime
  });

  const ecctrlValues = useControls(
    "Ecctrl Settings",
    {
      ResetPlayer: button(actions.resetPlayer),
      animatedCharacter: settings.ecctrl.animatedCharacter,
      debug: settings.ecctrl.debug,
      enable: settings.ecctrl.enable,
      canSleep: settings.ecctrl.canSleep,
      Collider: folder({
        density: { value: settings.ecctrl.density, step: 1, min: 1, max: 1000 },
        capsuleHalfHeight: { value: settings.ecctrl.capsuleHalfHeight, step: 0.01, min: 0.2, max: 1 },
        capsuleRadius: { value: settings.ecctrl.capsuleRadius, step: 0.01, min: 0.3, max: 0.7 }
      }, { collapsed: true }),
      ForwardDir: folder({
        toggleLockForward: button(actions.toggleLockForward),
        useCameraForward: settings.ecctrl.useCameraForward,
        useCharacterUpForForward: settings.ecctrl.useCharacterUpForForward
      }, { collapsed: true }),
      CustomeG: folder({
        enableCustomGravity: settings.ecctrl.enableCustomGravity,
        gravityDirLerpSpeed: { value: settings.ecctrl.gravityDirLerpSpeed, step: 0.01, min: 0, max: 20 }
      }, { collapsed: true }),
      Movement: folder({
        maxWalkVel: { value: settings.ecctrl.maxWalkVel, step: 0.01, min: 0, max: 30 },
        maxRunVel: { value: settings.ecctrl.maxRunVel, step: 0.01, min: 0, max: 30 },
        accDeltaTime: { value: settings.ecctrl.accDeltaTime, step: 0.01, min: 0, max: 1 },
        decDeltaTime: { value: settings.ecctrl.decDeltaTime, step: 0.01, min: 0, max: 1 },
        rejectVelFactor: { value: settings.ecctrl.rejectVelFactor, step: 0.01, min: 0, max: 10 },
        moveImpulsePointOffset: { value: settings.ecctrl.moveImpulsePointOffset, step: 0.01, min: -1, max: 1 },
        jumpVel: { value: settings.ecctrl.jumpVel, step: 0.01, min: 0, max: 20 },
        jumpDuration: { value: settings.ecctrl.jumpDuration, step: 0.01, min: 0, max: 0.5 },
        slopeJumpFactor: { value: settings.ecctrl.slopeJumpFactor, step: 0.01, min: 0, max: 1 },
        airDragFactor: { value: settings.ecctrl.airDragFactor, step: 0.01, min: 0, max: 1 },
        slideGripFactor: { value: settings.ecctrl.slideGripFactor, step: 0.01, min: 0, max: 1 },
        platformGripFactor: { value: settings.ecctrl.platformGripFactor, step: 0.01, min: 0, max: 1 },
        liftGripFactor: { value: settings.ecctrl.liftGripFactor, step: 0.01, min: 0, max: 1 },
        fallingGravityScale: { value: settings.ecctrl.fallingGravityScale, step: 0.01, min: 0, max: 20 },
        fallingMaxVel: { value: settings.ecctrl.fallingMaxVel, step: 0.01, min: 0, max: 100 },
        enableToggleRun: settings.ecctrl.enableToggleRun
      }, { collapsed: true }),
      Floating: folder({
        groundDetection: { value: settings.ecctrl.groundDetection, options: ["shapeCast", "rayCast"] as const },
        slopeMaxAngle: { value: settings.ecctrl.slopeMaxAngle, step: 0.01, min: 0.01, max: Math.PI / 2 },
        floatHeight: { value: settings.ecctrl.floatHeight, step: 0.01, min: 0, max: 5 },
        rayOriginOffest: { value: settings.ecctrl.rayOriginOffest, step: 0.01, min: -1, max: 1 },
        rayHitForgiveness: { value: settings.ecctrl.rayHitForgiveness, step: 0.01, min: 0, max: 1 },
        rayLength: { value: settings.ecctrl.rayLength, step: 0.01, min: 0, max: 5 },
        rayRadius: { value: settings.ecctrl.rayRadius, step: 0.01, min: 0, max: 0.5 },
        springK: { value: settings.ecctrl.springK, step: 0.01, min: 0, max: 10000 },
        dampingC: { value: settings.ecctrl.dampingC, step: 0.01, min: 0, max: 2000 }
      }, { collapsed: true }),
      Balance: folder({
        autoBalance: settings.ecctrl.autoBalance,
        autoBalanceSpringK: { value: settings.ecctrl.autoBalanceSpringK, step: 0.01, min: 0, max: 200 },
        autoBalanceDampingC: { value: settings.ecctrl.autoBalanceDampingC, step: 0.01, min: 0, max: 50 },
        autoBalanceSpringOnY: { value: settings.ecctrl.autoBalanceSpringOnY, step: 0.01, min: 0, max: 200 },
        autoBalanceDampingOnY: { value: settings.ecctrl.autoBalanceDampingOnY, step: 0.01, min: 0, max: 50 }
      }, { collapsed: true }),
      Platform: folder({
        followPlatform: settings.ecctrl.followPlatform,
        massRatioFallOffCurveData: CurveEditorPlugin({
          points: settings.ecctrl.massRatioFallOffCurveData.points,
          samples: { value: settings.ecctrl.massRatioFallOffCurveData.samples ?? 50, min: 2, max: 500, step: 1 }
        }),
        applyCounterMass: settings.ecctrl.applyCounterMass,
        applyCounterJumpImp: settings.ecctrl.applyCounterJumpImp,
        counterJumpImpFactor: { value: settings.ecctrl.counterJumpImpFactor, step: 0.01, min: 0, max: 5 },
        applyCounterMoveImp: settings.ecctrl.applyCounterMoveImp,
        counterMoveImpFactor: { value: settings.ecctrl.counterMoveImpFactor, step: 0.01, min: 0, max: 5 }
      }, { collapsed: true })
    },
    { collapsed: true }
  );
  Object.assign(settings.ecctrl, ecctrlValues);

  useCarVehicleControls("Vehicle 1 Body Settings", "Vehicle 1 Wheel Settings", settings.vehicles.vehicle1, actions.flipVehicle1);
  useCarVehicleControls("Vehicle 2 Body Settings", "Vehicle 2 Wheel Settings", settings.vehicles.vehicle2, actions.flipVehicle2);
  useDroneVehicleControls(
    "Vehicle 3 Body Settings",
    "Vehicle 3 Propeller Settings",
    settings.vehicles.vehicle3,
    actions.flipVehicle3,
    registerVehicle3DroneSettings
  );

  return null;
}

function useVehicleBodyControls(label: string, settings: VehicleSettings, flip: () => void): void {
  const bodyValues = useControls(
    label,
    {
      Flip: button(flip),
      enable: settings.enable,
      canSleep: settings.canSleep,
      position: { value: settings.position, step: 0.1 },
      rotation: { value: settings.rotation, step: 0.1 },
      CustomeG: folder({
        enableCustomGravity: settings.enableCustomGravity,
        gravityDirLerpSpeed: { value: settings.gravityDirLerpSpeed, step: 0.01, min: 0, max: 20 }
      }, { collapsed: true })
    },
    { collapsed: true }
  ) as Pick<VehicleSettings, "enable" | "canSleep" | "position" | "rotation" | "enableCustomGravity" | "gravityDirLerpSpeed">;
  Object.assign(settings, bodyValues);
}

function useCarVehicleControls(bodyLabel: string, wheelLabel: string, settings: VehicleSettings, flip: () => void): void {
  useVehicleBodyControls(bodyLabel, settings, flip);
  const carValues = useControls(
    bodyLabel,
    {
      CarControl: folder({
        engineHorsepower: { value: settings.car.engineHorsepower, step: 1, min: 0, max: 2000 },
        engineMaxRPM: { value: settings.car.engineMaxRPM, step: 100, min: 500, max: 12000 },
        finalDriveRatio: { value: settings.car.finalDriveRatio, step: 0.1, min: 0.1, max: 10 },
        transmissionMode: { value: settings.car.transmissionMode, options: ["auto", "manual"] as const },
        shiftUpRPM: { value: settings.car.shiftUpRPM, step: 100, min: 500, max: 12000 },
        shiftDownRPM: { value: settings.car.shiftDownRPM, step: 100, min: 500, max: 12000 },
        shiftCooldown: { value: settings.car.shiftCooldown, step: 0.01, min: 0, max: 2 },
        steerRate: { value: settings.car.steerRate, step: 0.01, min: 0, max: Math.PI * 8 },
        maxSteerAngle: { value: settings.car.maxSteerAngle, step: 0.01, min: 0, max: Math.PI / 2 },
        reverseTorqueScale: { value: settings.car.reverseTorqueScale, step: 0.01, min: 0, max: 2 },
        reverseRPMScale: { value: settings.car.reverseRPMScale, step: 0.01, min: 0, max: 1 },
        engineTorqueCurveData: CurveEditorPlugin({
          points: settings.car.engineTorqueCurveData.points,
          samples: { value: settings.car.engineTorqueCurveData.samples ?? 50, min: 2, max: 500, step: 1 }
        }),
        steerAngleCurveData: CurveEditorPlugin({
          points: settings.car.steerAngleCurveData.points,
          samples: { value: settings.car.steerAngleCurveData.samples ?? 50, min: 2, max: 500, step: 1 }
        })
      }, { collapsed: true })
    },
    { collapsed: true }
  ) as CarControlSettings;
  Object.assign(settings.car, carValues);
  useWheelControls(wheelLabel, settings);
}

function useWheelControls(label: string, settings: VehicleSettings): void {
  const wheelValues = useControls(
    label,
    {
      Layout: folder({
        offset: { value: settings.wheel.offset, step: 0.01 }
      }, { collapsed: true }),
      ShapeCast: folder({
        groundDetection: { value: settings.wheel.groundDetection, options: ["shapeCast", "rayCast"] as const },
        rayShapeR: { value: settings.wheel.rayShapeR, step: 0.01, min: 0, max: 2 },
        rayShapeH: { value: settings.wheel.rayShapeH, step: 0.01, min: 0, max: 2 },
        rayLength: { value: settings.wheel.rayLength, step: 0.01 },
        springK: { value: settings.wheel.springK, step: 100, min: 0, max: 100000 },
        dampingC: { value: settings.wheel.dampingC, step: 100, min: 0, max: 20000 }
      }, { collapsed: true }),
      Brake: folder({
        frontMaxBrakeTorque: { value: settings.wheel.frontMaxBrakeTorque, step: 10, min: 0, max: 10000 },
        rearMaxBrakeTorque: { value: settings.wheel.rearMaxBrakeTorque, step: 10, min: 0, max: 10000 },
        rollingResistanceCoef: { value: settings.wheel.rollingResistanceCoef, step: 0.001, min: 0, max: 0.1 }
      }, { collapsed: true }),
      Friction: folder({
        lowVelThreshold: { value: settings.wheel.lowVelThreshold, step: 0.01, min: 0, max: 10 },
        tireGripFactor: { value: settings.wheel.tireGripFactor, step: 0.01, min: 0, max: 5 },
        lngFrictionEllipseScale: { value: settings.wheel.lngFrictionEllipseScale, step: 0.01, min: 0, max: 3 },
        latFrictionEllipseScale: { value: settings.wheel.latFrictionEllipseScale, step: 0.01, min: 0, max: 3 },
        relaxLngRate: { value: settings.wheel.relaxLngRate, step: 0.001, min: 0.001, max: 0.1 },
        relaxLatRate: { value: settings.wheel.relaxLatRate, step: 0.001, min: 0.001, max: 0.1 },
        minLngRelaxCoeff: { value: settings.wheel.minLngRelaxCoeff, step: 0.01, min: 0, max: 1 },
        minLatRelaxCoeff: { value: settings.wheel.minLatRelaxCoeff, step: 0.01, min: 0, max: 1 },
        lngSlipRatioCurveData: CurveEditorPlugin({
          points: settings.wheel.lngSlipRatioCurveData.points,
          samples: { value: settings.wheel.lngSlipRatioCurveData.samples ?? 50, min: 2, max: 500, step: 1 }
        }),
        latSlipRatioCurveData: CurveEditorPlugin({
          points: settings.wheel.latSlipRatioCurveData.points,
          samples: { value: settings.wheel.latSlipRatioCurveData.samples ?? 50, min: 2, max: 500, step: 1 }
        })
      }, { collapsed: true }),
      MovingPlatform: folder({
        followPlatform: settings.wheel.followPlatform,
        massRatioFallOffCurveData: CurveEditorPlugin({
          points: settings.wheel.massRatioFallOffCurveData.points,
          samples: { value: settings.wheel.massRatioFallOffCurveData.samples ?? 50, min: 2, max: 500, step: 1 }
        }),
        applyCounterMass: settings.wheel.applyCounterMass,
        applyCounterFriction: settings.wheel.applyCounterFriction
      }, { collapsed: true }),
      Model: folder({
        showWheelModel: settings.wheel.showWheelModel,
        wheelModelDensity: { value: settings.wheel.wheelModelDensity, step: 1, min: 0, max: 500 },
        wheelModelUpdate: settings.wheel.wheelModelUpdate,
        wheelModelRadius: { value: settings.wheel.wheelModelRadius, step: 0.01, min: 0.1, max: 2 },
        wheelModelLerpPosRate: { value: settings.wheel.wheelModelLerpPosRate, step: 0.1, min: 0, max: 50 },
        wheelModelReversRotation: settings.wheel.wheelModelReversRotation
      }, { collapsed: true }),
      Debugger: folder({
        debug: settings.wheel.debug,
        debuggerArrowScale: { value: settings.wheel.debuggerArrowScale, step: 0.001, min: 0, max: 1 }
      }, { collapsed: true })
    },
    { collapsed: true }
  ) as WheelControlSettings;
  Object.assign(settings.wheel, wheelValues);
  settings.debug = settings.wheel.debug;
  settings.wheelDebuggerArrowScale = settings.wheel.debuggerArrowScale;
}

function useDroneVehicleControls(
  bodyLabel: string,
  propellerLabel: string,
  settings: VehicleSettings,
  flip: () => void,
  registerDroneSettings: DroneSettingsRegistrar
): void {
  useVehicleBodyControls(bodyLabel, settings, flip);
  const [droneValues, setDroneSettings] = useControls(
    bodyLabel,
    () => ({
      DroneControl: folder({
        controlMode: { value: settings.drone.controlMode, options: ["VELOCITY", "POSITION"] as const },
        maxYawRate: { value: settings.drone.maxYawRate, step: 0.01, min: 0, max: 10 },
        maxHorizSpeed: { value: settings.drone.maxHorizSpeed, step: 0.01, min: 0, max: 50 },
        maxVertSpeed: { value: settings.drone.maxVertSpeed, step: 0.01, min: 0, max: 50 },
        maxTiltAngle: { value: settings.drone.maxTiltAngle, step: 0.01, min: 0, max: Math.PI / 4 },
        airDragFactor: { value: settings.drone.airDragFactor, step: 0.01, min: 0, max: 1 },
        TILT_P: { value: settings.drone.TILT_P, step: 0.1, min: 0, max: 30 },
        TILT_D: { value: settings.drone.TILT_D, step: 0.1, min: 0, max: 30 },
        YAW_POS_P: { value: settings.drone.YAW_POS_P, step: 0.01, min: 0, max: 10 },
        YAW_VEL_P: { value: settings.drone.YAW_VEL_P, step: 0.01, min: 0, max: 10 },
        VERT_POS_P: { value: settings.drone.VERT_POS_P, step: 0.1, min: 0, max: 1000 },
        VERT_POS_D: { value: settings.drone.VERT_POS_D, step: 0.1, min: 0, max: 1000 },
        HORIZ_POS_P: { value: settings.drone.HORIZ_POS_P, step: 0.1, min: 0, max: 1000 },
        HORIZ_POS_D: { value: settings.drone.HORIZ_POS_D, step: 0.1, min: 0, max: 1000 },
        HORIZ_VEL_P: { value: settings.drone.HORIZ_VEL_P, step: 0.1, min: 0, max: 30 },
        VERT_VEL_P: { value: settings.drone.VERT_VEL_P, step: 0.1, min: 0, max: 30 }
      }, { collapsed: true })
    }),
    { collapsed: true }
  ) as unknown as [DroneControlSettings, LevaSettingsSetter<DroneControlSettings>];
  useEffect(() => {
    registerDroneSettings(setDroneSettings);
    return () => registerDroneSettings(null);
  }, [registerDroneSettings, setDroneSettings]);
  Object.assign(settings.drone, droneValues);
  const propellerValues = useControls(
    propellerLabel,
    {
      Layout: folder({
        offset: { value: settings.propeller.offset, step: 0.01 }
      }, { collapsed: true }),
      Thrust: folder({
        maxThrust: { value: settings.propeller.maxThrust, step: 0.1, min: 0, max: 10000 },
        torqueRatio: { value: settings.propeller.torqueRatio, step: 0.01, min: 0, max: 1 }
      }, { collapsed: true }),
      Model: folder({
        showPropellerModel: settings.propeller.showPropellerModel,
        propellerModelUpdate: settings.propeller.propellerModelUpdate,
        propellerModelMaxSpin: { value: settings.propeller.propellerModelMaxSpin, step: 0.1, min: 0, max: 200 },
        propellerModelLerpSpinRate: { value: settings.propeller.propellerModelLerpSpinRate, step: 0.1, min: 0, max: 50 }
      }, { collapsed: true }),
      Debugger: folder({
        debug: settings.propeller.debug,
        debuggerScale: { value: settings.propeller.debuggerScale, step: 0.01, min: 0, max: 5 },
        debuggerArrowScale: { value: settings.propeller.debuggerArrowScale, step: 0.01, min: 0, max: 50 }
      }, { collapsed: true })
    },
    { collapsed: true }
  ) as PropellerControlSettings;
  Object.assign(settings.propeller, propellerValues);
  settings.debug = settings.propeller.debug;
  settings.propellerDebuggerArrowScale = settings.propeller.debuggerArrowScale;
}

type VehicleSettingsOverrides = {
  position?: [number, number, number];
  rotation?: [number, number, number];
  car?: Partial<CarControlSettings>;
  wheel?: Partial<WheelControlSettings>;
  drone?: Partial<DroneControlSettings>;
  propeller?: Partial<PropellerControlSettings>;
};

function createDefaultVehicleSettings(overrides: VehicleSettingsOverrides = {}): VehicleSettings {
  const wheel = {
    offset: { x: 0.9, y: 0, z: 1.8 },
    groundDetection: "shapeCast" as GroundDetectionMode,
    rayShapeR: 0.5,
    rayShapeH: 0.15,
    rayLength: 0.5,
    springK: 38000,
    dampingC: 4000,
    frontMaxBrakeTorque: 3000,
    rearMaxBrakeTorque: 3000,
    rollingResistanceCoef: 0.007,
    lowVelThreshold: 0.4,
    tireGripFactor: 1.3,
    lngFrictionEllipseScale: 1,
    latFrictionEllipseScale: 1,
    relaxLngRate: 0.05,
    relaxLatRate: 0.1,
    minLngRelaxCoeff: 0.3,
    minLatRelaxCoeff: 0.3,
    lngSlipRatioCurveData: {
      points: [
        { x: 0, y: 0, r_out: 1.45 },
        { x: 0.25, y: 1, r_in: 0, r_out: 0 },
        { x: 1, y: 0.7, r_in: 0 }
      ],
      samples: 50
    },
    latSlipRatioCurveData: {
      points: [
        { x: 0, y: 0, r_out: 1.45 },
        { x: 0.15, y: 1, r_in: 0, r_out: 0 },
        { x: 1, y: 0.9, r_in: 0 }
      ],
      samples: 50
    },
    followPlatform: true,
    massRatioFallOffCurveData: {
      points: [
        { x: 0, y: 0.5, r_out: 0 },
        { x: 0.5, y: 1, r_in: 0, r_out: 0 },
        { x: 1, y: 1, r_in: 0 }
      ],
      samples: 50
    },
    applyCounterMass: true,
    applyCounterFriction: true,
    showWheelModel: true,
    wheelModelDensity: 100,
    wheelModelUpdate: true,
    wheelModelRadius: 0.5,
    wheelModelLerpPosRate: 10,
    wheelModelReversRotation: false,
    debug: true,
    debuggerArrowScale: 0.02,
    ...overrides.wheel
  };
  const propeller = {
    offset: { x: 1, y: -0.15, z: 1 },
    maxThrust: 5000,
    torqueRatio: 0.6,
    showPropellerModel: true,
    propellerModelUpdate: true,
    propellerModelMaxSpin: 50,
    propellerModelLerpSpinRate: 10,
    debug: true,
    debuggerScale: 1,
    debuggerArrowScale: 35,
    ...overrides.propeller
  };
  return {
    enable: true,
    canSleep: true,
    position: overrides.position ?? [5, 2, -60],
    rotation: overrides.rotation ?? [0, 0, 0],
    enableCustomGravity: true,
    gravityDirLerpSpeed: 6,
    debug: true,
    wheelDebuggerArrowScale: wheel.debuggerArrowScale,
    propellerDebuggerArrowScale: propeller.debuggerArrowScale,
    car: {
      engineHorsepower: 600,
      engineMaxRPM: 6000,
      finalDriveRatio: 1,
      transmissionMode: "auto",
      shiftUpRPM: 5200,
      shiftDownRPM: 2200,
      shiftCooldown: 0.35,
      steerRate: Math.PI * 2,
      maxSteerAngle: Math.PI / 6,
      reverseTorqueScale: 1,
      reverseRPMScale: 0.5,
      engineTorqueCurveData: {
        points: [
          { x: 0, y: 1, r_out: 0 },
          { x: 1, y: 0, r_in: 0 }
        ],
        samples: 50
      },
      steerAngleCurveData: {
        points: [
          { x: 0, y: 1, r_out: 0 },
          { x: 0.2, y: 1, r_in: 0, r_out: 0 },
          { x: 1, y: 0.4, r_in: 0 }
        ],
        samples: 50
      },
      ...overrides.car
    },
    wheel,
    drone: {
      controlMode: "POSITION",
      maxYawRate: 2,
      maxHorizSpeed: 20,
      maxVertSpeed: 8,
      maxTiltAngle: Math.PI / 4,
      airDragFactor: 0.2,
      TILT_P: 15,
      TILT_D: 3,
      YAW_POS_P: 6,
      YAW_VEL_P: 4,
      VERT_POS_P: 900,
      VERT_POS_D: 700,
      HORIZ_POS_P: 500,
      HORIZ_POS_D: 550,
      HORIZ_VEL_P: 1,
      VERT_VEL_P: 2,
      ...overrides.drone
    },
    propeller
  };
}
