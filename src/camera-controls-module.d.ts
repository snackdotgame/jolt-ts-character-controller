declare module "camera-controls/dist/camera-controls.module.js" {
  import type {
    Object3D,
    OrthographicCamera,
    PerspectiveCamera,
    Quaternion,
    Vector3
  } from "three";

  export interface CameraControlsThreeSubset {
    readonly [key: string]: unknown;
  }

  export default class CameraControls {
    protected _yAxisUpSpace: Quaternion;
    protected _yAxisUpSpaceInverse: Quaternion;

    static readonly ACTION: {
      readonly NONE: number;
    };

    static install(libs: { readonly THREE: CameraControlsThreeSubset }): void;

    constructor(camera: PerspectiveCamera | OrthographicCamera, domElement?: HTMLElement);

    minPolarAngle: number;
    maxPolarAngle: number;
    smoothTime: number;
    colliderMeshes: Object3D[];
    readonly currentAction: number;
    readonly distance: number;

    moveTo(x: number, y: number, z: number, enableTransition?: boolean): Promise<void>;
    rotate(azimuthAngle: number, polarAngle: number, enableTransition?: boolean): Promise<void>;
    dolly(distance: number, enableTransition?: boolean): Promise<void>;
    update(delta: number): boolean;
    lockPointer(): void;
  }
}
