import type { EcctrlJoltController, EcctrlJoltControllerSnapshot } from "./controller.js";

export type EcctrlAnimationState =
  | "IDLE"
  | "WALK"
  | "RUN"
  | "JUMP_START"
  | "JUMP_IDLE"
  | "JUMP_FALL"
  | "JUMP_LAND";

export interface EcctrlAnimationSnapshot {
  readonly isOnGround: boolean;
  readonly isFalling: boolean;
  readonly isMoving: boolean;
  readonly runActive: boolean;
  readonly jumpActive: boolean;
}

export interface EcctrlAnimationStateContext<THandle = unknown> extends EcctrlAnimationSnapshot {
  readonly handle: THandle | null;
  readonly wasOnGround: boolean;
}

export type EcctrlAnimationStateResolver<THandle = unknown> = (
  context: EcctrlAnimationStateContext<THandle>
) => EcctrlAnimationState;

export interface EcctrlAnimationStateControllerOptions<THandle = unknown> {
  readonly handle?: THandle | null;
  readonly getSnapshot: () => EcctrlAnimationSnapshot;
  readonly resolver?: EcctrlAnimationStateResolver<THandle>;
  readonly initialState?: EcctrlAnimationState;
  readonly onChange?: (
    animationState: EcctrlAnimationState,
    context: EcctrlAnimationStateContext<THandle>
  ) => void;
}

type MutableAnimationSnapshot = {
  isOnGround: boolean;
  isFalling: boolean;
  isMoving: boolean;
  runActive: boolean;
  jumpActive: boolean;
};

type MutableAnimationStateContext<THandle> = MutableAnimationSnapshot & {
  handle: THandle | null;
  wasOnGround: boolean;
};

export class EcctrlAnimationStateController<THandle = unknown> {
  readonly handle: THandle | null;
  readonly getSnapshot: () => EcctrlAnimationSnapshot;
  readonly resolver: EcctrlAnimationStateResolver<THandle>;
  readonly onChange?: (
    animationState: EcctrlAnimationState,
    context: EcctrlAnimationStateContext<THandle>
  ) => void;

  private initialized = false;
  private previousIsOnGround = false;
  private currentState: EcctrlAnimationState;
  private readonly context: MutableAnimationStateContext<THandle>;

  constructor(options: EcctrlAnimationStateControllerOptions<THandle>) {
    this.handle = options.handle ?? null;
    this.getSnapshot = options.getSnapshot;
    this.resolver = options.resolver ?? resolveEcctrlAnimationState;
    this.onChange = options.onChange;
    this.currentState = options.initialState ?? "IDLE";
    this.context = {
      handle: this.handle,
      isOnGround: false,
      wasOnGround: false,
      isFalling: false,
      isMoving: false,
      runActive: false,
      jumpActive: false
    };
  }

  update(): EcctrlAnimationState {
    const snapshot = this.getSnapshot();
    this.context.isOnGround = snapshot.isOnGround;
    this.context.wasOnGround = this.initialized ? this.previousIsOnGround : snapshot.isOnGround;
    this.context.isFalling = snapshot.isFalling;
    this.context.isMoving = snapshot.isMoving;
    this.context.runActive = snapshot.runActive;
    this.context.jumpActive = snapshot.jumpActive;
    const nextState = this.resolver(this.context);
    if (nextState !== this.currentState) {
      this.currentState = nextState;
      this.onChange?.(nextState, this.context);
    }
    this.previousIsOnGround = snapshot.isOnGround;
    this.initialized = true;
    return this.currentState;
  }

  reset(state: EcctrlAnimationState = "IDLE", isOnGround = false): void {
    this.currentState = state;
    this.previousIsOnGround = isOnGround;
    this.initialized = false;
  }

  get state(): EcctrlAnimationState {
    return this.currentState;
  }
}

export const resolveEcctrlAnimationState: EcctrlAnimationStateResolver = ({
  isOnGround,
  wasOnGround,
  isFalling,
  isMoving,
  runActive,
  jumpActive
}) => {
  if (jumpActive && wasOnGround) return "JUMP_START";

  if (isOnGround) {
    if (!wasOnGround) return "JUMP_LAND";
    if (!isMoving) return "IDLE";
    return runActive ? "RUN" : "WALK";
  }

  return isFalling ? "JUMP_FALL" : "JUMP_IDLE";
};

export function animationSnapshotFromControllerSnapshot(
  snapshot: Pick<EcctrlJoltControllerSnapshot, "isOnGround" | "isFalling" | "isMoving" | "runActive" | "jumpActive">
): EcctrlAnimationSnapshot {
  return {
    isOnGround: snapshot.isOnGround,
    isFalling: snapshot.isFalling,
    isMoving: snapshot.isMoving,
    runActive: snapshot.runActive,
    jumpActive: snapshot.jumpActive
  };
}

export function createEcctrlJoltAnimationStateController(
  controller: EcctrlJoltController,
  options: Omit<EcctrlAnimationStateControllerOptions<EcctrlJoltController>, "handle" | "getSnapshot"> = {}
): EcctrlAnimationStateController<EcctrlJoltController> {
  const snapshot: MutableAnimationSnapshot = {
    isOnGround: false,
    isFalling: false,
    isMoving: false,
    runActive: false,
    jumpActive: false
  };
  return new EcctrlAnimationStateController({
    ...options,
    handle: controller,
    getSnapshot: () => {
      snapshot.isOnGround = controller.isOnGround;
      snapshot.isFalling = controller.isFalling;
      snapshot.isMoving = controller.isMoving;
      snapshot.runActive = controller.runActive;
      snapshot.jumpActive = controller.jumpActive;
      return snapshot;
    }
  });
}
