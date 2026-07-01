import type { CharacterController, CharacterControllerSnapshot } from "./controller.js";

export type AnimationState =
  | "IDLE"
  | "WALK"
  | "RUN"
  | "JUMP_START"
  | "JUMP_IDLE"
  | "JUMP_FALL"
  | "JUMP_LAND";

export interface AnimationSnapshot {
  readonly isOnGround: boolean;
  readonly isFalling: boolean;
  readonly isMoving: boolean;
  readonly runActive: boolean;
  readonly jumpActive: boolean;
}

export interface AnimationStateContext<THandle = unknown> extends AnimationSnapshot {
  readonly handle: THandle | null;
  readonly wasOnGround: boolean;
}

export type AnimationStateResolver<THandle = unknown> = (
  context: AnimationStateContext<THandle>
) => AnimationState;

export interface AnimationStateControllerOptions<THandle = unknown> {
  readonly handle?: THandle | null;
  readonly getSnapshot: () => AnimationSnapshot;
  readonly resolver?: AnimationStateResolver<THandle>;
  readonly initialState?: AnimationState;
  readonly onChange?: (
    animationState: AnimationState,
    context: AnimationStateContext<THandle>
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

export class AnimationStateController<THandle = unknown> {
  readonly handle: THandle | null;
  readonly getSnapshot: () => AnimationSnapshot;
  readonly resolver: AnimationStateResolver<THandle>;
  readonly onChange?: (
    animationState: AnimationState,
    context: AnimationStateContext<THandle>
  ) => void;

  private initialized = false;
  private previousIsOnGround = false;
  private currentState: AnimationState;
  private readonly context: MutableAnimationStateContext<THandle>;

  constructor(options: AnimationStateControllerOptions<THandle>) {
    this.handle = options.handle ?? null;
    this.getSnapshot = options.getSnapshot;
    this.resolver = options.resolver ?? resolveAnimationState;
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

  update(): AnimationState {
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

  reset(state: AnimationState = "IDLE", isOnGround = false): void {
    this.currentState = state;
    this.previousIsOnGround = isOnGround;
    this.initialized = false;
  }

  get state(): AnimationState {
    return this.currentState;
  }
}

export const resolveAnimationState: AnimationStateResolver = ({
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
  snapshot: Pick<CharacterControllerSnapshot, "isOnGround" | "isFalling" | "isMoving" | "runActive" | "jumpActive">
): AnimationSnapshot {
  return {
    isOnGround: snapshot.isOnGround,
    isFalling: snapshot.isFalling,
    isMoving: snapshot.isMoving,
    runActive: snapshot.runActive,
    jumpActive: snapshot.jumpActive
  };
}

export function createCharacterAnimationStateController(
  controller: CharacterController,
  options: Omit<AnimationStateControllerOptions<CharacterController>, "handle" | "getSnapshot"> = {}
): AnimationStateController<CharacterController> {
  const snapshot: MutableAnimationSnapshot = {
    isOnGround: false,
    isFalling: false,
    isMoving: false,
    runActive: false,
    jumpActive: false
  };
  return new AnimationStateController({
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
