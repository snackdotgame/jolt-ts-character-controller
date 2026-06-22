export interface Vector3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface QuaternionLike {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

export type MovementInput = {
  forward?: boolean;
  backward?: boolean;
  leftward?: boolean;
  rightward?: boolean;
  joystick?: { x: number; y: number };
  run?: boolean;
  jump?: boolean;
};

type ReadonlyJoystickInput = Readonly<{ x: number; y: number }>;

export type ReadonlyMovementInput = Readonly<Omit<MovementInput, "joystick">> & {
  readonly joystick?: ReadonlyJoystickInput;
};

export type GroundDetectionMode = "shapeCast" | "rayCast";

export interface EcctrlUserDataType {
  ecctrl?: {
    excludeRay?: boolean;
    excludeCharacterRay?: boolean;
    excludeVehicleRay?: boolean;
  };
}

export type VehicleInput = {
  forward?: boolean;
  backward?: boolean;
  steerLeft?: boolean;
  steerRight?: boolean;
  brake?: boolean;
  throttleUp?: boolean;
  throttleDown?: boolean;
  yawLeft?: boolean;
  yawRight?: boolean;
  pitchForward?: boolean;
  pitchBackward?: boolean;
  rollLeft?: boolean;
  rollRight?: boolean;
  joystickL?: { x: number; y: number };
  joystickR?: { x: number; y: number };
};

export type ReadonlyVehicleInput = Readonly<Omit<VehicleInput, "joystickL" | "joystickR">> & {
  readonly joystickL?: ReadonlyJoystickInput;
  readonly joystickR?: ReadonlyJoystickInput;
};
