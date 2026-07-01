import { LoopOnce, type AnimationAction } from "three";
import {
  type AnimationState
} from "./animation.js";

export const DEFAULT_THREE_ANIMATION_ACTIONS: Readonly<Record<AnimationState, string>> = {
  IDLE: "Idle_Loop",
  WALK: "Walk_Loop",
  RUN: "Jog_Fwd_Loop",
  JUMP_START: "Jump_Start",
  JUMP_IDLE: "Jump_Loop",
  JUMP_FALL: "Jump_Loop",
  JUMP_LAND: "Jump_Land"
};

export interface AnimationStateControllerLike {
  readonly state: AnimationState;
  update(): AnimationState;
  reset(state?: AnimationState, isOnGround?: boolean): void;
}

type AnimationActionLookup =
  | ReadonlyMap<string, AnimationAction>
  | Readonly<Record<string, AnimationAction | undefined>>;

export interface ThreeAnimationControllerOptions {
  readonly stateController: AnimationStateControllerLike;
  readonly actions: AnimationActionLookup;
  readonly actionMap?: Partial<Record<AnimationState, string>>;
  readonly getTimeScale?: () => number;
  readonly autoplayInitialAction?: boolean;
}

export class ThreeAnimationController {
  readonly stateController: AnimationStateControllerLike;
  readonly actionMap: Readonly<Record<AnimationState, string>>;
  readonly getTimeScale: () => number;

  private readonly actions: AnimationActionLookup;
  private readonly autoplayInitialAction: boolean;
  private previousActionName: string;
  private activeAction: AnimationAction | null;
  private canPlayNext = true;

  constructor(options: ThreeAnimationControllerOptions) {
    this.stateController = options.stateController;
    this.actions = options.actions;
    this.actionMap = { ...DEFAULT_THREE_ANIMATION_ACTIONS, ...options.actionMap };
    this.getTimeScale = options.getTimeScale ?? (() => 1);
    this.autoplayInitialAction = options.autoplayInitialAction ?? false;
    this.previousActionName = this.actionMap[this.stateController.state];
    this.activeAction = null;
    if (this.autoplayInitialAction) {
      this.activeAction = this.getAction(this.previousActionName) ?? null;
      this.activeAction?.play();
    }
  }

  update(): AnimationState {
    const state = this.stateController.update();
    this.playState(state);
    return state;
  }

  notifyFinished(actionOrClipName: AnimationAction | string): void {
    const clipName = typeof actionOrClipName === "string"
      ? actionOrClipName
      : actionOrClipName.getClip().name;
    if (clipName === "Jump_Start" || clipName === "Jump_Land") this.canPlayNext = true;
  }

  reset(state: AnimationState = "IDLE"): void {
    this.stateController.reset(state);
    this.previousActionName = this.actionMap[state];
    this.canPlayNext = true;
    this.activeAction = null;
    if (this.autoplayInitialAction) {
      this.activeAction = this.getAction(this.previousActionName) ?? null;
      this.activeAction?.reset().play();
    }
  }

  get active(): AnimationAction | null {
    return this.activeAction;
  }

  get activeActionName(): string | null {
    return this.activeAction?.getClip().name ?? null;
  }

  get previousClipName(): string {
    return this.previousActionName;
  }

  get canTransition(): boolean {
    return this.canPlayNext;
  }

  private playState(state: AnimationState): void {
    const nextActionName = this.actionMap[state];
    const nextAction = this.getAction(nextActionName);
    if (!nextAction) return;

    const previousActionName = this.previousActionName;
    if (nextActionName !== previousActionName && this.canPlayNext) {
      const previousAction = this.getAction(previousActionName) ?? this.activeAction;
      const oneShot = nextActionName === "Jump_Start" || nextActionName === "Jump_Land";
      const fadeDuration = (oneShot ? 0.1 : 0.2) * Math.max(this.getTimeScale(), 0.05);

      if (oneShot) {
        this.canPlayNext = false;
        nextAction.timeScale = 1.6;
        nextAction.reset();
        if (previousAction) nextAction.crossFadeFrom(previousAction, fadeDuration, false);
        nextAction.setLoop(LoopOnce, 1).play();
        nextAction.clampWhenFinished = true;
      } else {
        this.canPlayNext = true;
        nextAction.timeScale = 1;
        nextAction.reset();
        if (previousAction) nextAction.crossFadeFrom(previousAction, fadeDuration, false);
        nextAction.play();
      }

      this.previousActionName = nextActionName;
      this.activeAction = nextAction;
    }

    if (
      !this.canPlayNext &&
      previousActionName === "Jump_Start" &&
      state !== "JUMP_IDLE" &&
      state !== "JUMP_START"
    ) {
      this.canPlayNext = true;
    }

    if (
      !this.canPlayNext &&
      previousActionName === "Jump_Land" &&
      state !== "IDLE" &&
      state !== "JUMP_LAND"
    ) {
      this.canPlayNext = true;
    }
  }

  private getAction(name: string): AnimationAction | undefined {
    if (isAnimationActionMap(this.actions)) return this.actions.get(name);
    return this.actions[name];
  }
}

function isAnimationActionMap(actions: AnimationActionLookup): actions is ReadonlyMap<string, AnimationAction> {
  return actions instanceof Map;
}
