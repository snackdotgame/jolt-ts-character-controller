import { AnimationClip, LoopOnce, type AnimationAction } from "three";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_THREE_ANIMATION_ACTIONS,
  AnimationStateController,
  ThreeAnimationController,
  animationSnapshotFromControllerSnapshot,
  resolveAnimationState,
  type AnimationSnapshot,
  type AnimationState
} from "../src/index.js";

describe("AnimationStateController", () => {
  it("matches the upstream Ecctrl animation state resolver", () => {
    expect(resolveAnimationState(context({ isOnGround: true, wasOnGround: true }))).toBe("IDLE");
    expect(resolveAnimationState(context({ isOnGround: true, wasOnGround: true, isMoving: true }))).toBe("WALK");
    expect(resolveAnimationState(context({ isOnGround: true, wasOnGround: true, isMoving: true, runActive: true }))).toBe("RUN");
    expect(resolveAnimationState(context({ isOnGround: true, wasOnGround: true, jumpActive: true }))).toBe("JUMP_START");
    expect(resolveAnimationState(context({ isOnGround: false, wasOnGround: true }))).toBe("JUMP_IDLE");
    expect(resolveAnimationState(context({ isOnGround: false, wasOnGround: true, isFalling: true }))).toBe("JUMP_FALL");
    expect(resolveAnimationState(context({ isOnGround: true, wasOnGround: false }))).toBe("JUMP_LAND");
  });

  it("can be driven by plain snapshots without Jolt, Three, React, or DOM", () => {
    const handle = { id: "external-controller" };
    let snapshot: AnimationSnapshot = {
      isOnGround: true,
      isFalling: false,
      isMoving: false,
      runActive: false,
      jumpActive: false
    };
    const changes: AnimationState[] = [];
    const controller = new AnimationStateController({
      handle,
      getSnapshot: () => snapshot,
      onChange: (state, stateContext) => {
        expect(stateContext.handle).toBe(handle);
        changes.push(state);
      }
    });

    expect(controller.update()).toBe("IDLE");
    snapshot = { ...snapshot, isMoving: true };
    expect(controller.update()).toBe("WALK");
    snapshot = { ...snapshot, runActive: true };
    expect(controller.update()).toBe("RUN");
    snapshot = { ...snapshot, jumpActive: true };
    expect(controller.update()).toBe("JUMP_START");
    snapshot = { ...snapshot, isOnGround: false, isFalling: false, jumpActive: false };
    expect(controller.update()).toBe("JUMP_IDLE");
    snapshot = { ...snapshot, isFalling: true };
    expect(controller.update()).toBe("JUMP_FALL");
    snapshot = { ...snapshot, isOnGround: true, isFalling: false, isMoving: false, runActive: false };
    expect(controller.update()).toBe("JUMP_LAND");
    expect(controller.update()).toBe("IDLE");

    expect(changes).toEqual(["WALK", "RUN", "JUMP_START", "JUMP_IDLE", "JUMP_FALL", "JUMP_LAND", "IDLE"]);
    expect(globalThis.document).toBeUndefined();
  });

  it("supports custom state resolvers for other controllers", () => {
    const controller = new AnimationStateController({
      handle: { forceRun: true },
      getSnapshot: () => ({
        isOnGround: true,
        isFalling: false,
        isMoving: false,
        runActive: false,
        jumpActive: false
      }),
      resolver: (stateContext) => stateContext.handle?.forceRun ? "RUN" : resolveAnimationState(stateContext)
    });

    expect(controller.update()).toBe("RUN");
  });

  it("maps Jolt controller snapshots into animation snapshots", () => {
    expect(animationSnapshotFromControllerSnapshot({
      isOnGround: true,
      isFalling: false,
      isMoving: true,
      runActive: true,
      jumpActive: false
    })).toEqual({
      isOnGround: true,
      isFalling: false,
      isMoving: true,
      runActive: true,
      jumpActive: false
    });
  });
});

describe("ThreeAnimationController", () => {
  it("plays Ecctrl's default clips through normal Three.js AnimationActions", () => {
    let snapshot: AnimationSnapshot = {
      isOnGround: true,
      isFalling: false,
      isMoving: false,
      runActive: false,
      jumpActive: false
    };
    const stateController = new AnimationStateController({ getSnapshot: () => snapshot });
    const events: string[] = [];
    const idle = new FakeAnimationAction("Idle_Loop", events);
    const walk = new FakeAnimationAction("Walk_Loop", events);
    const run = new FakeAnimationAction("Jog_Fwd_Loop", events);
    const jumpStart = new FakeAnimationAction("Jump_Start", events);
    const jumpLoop = new FakeAnimationAction("Jump_Loop", events);
    const actions = new Map<string, AnimationAction>([
      ["Idle_Loop", idle.asAction()],
      ["Walk_Loop", walk.asAction()],
      ["Jog_Fwd_Loop", run.asAction()],
      ["Jump_Start", jumpStart.asAction()],
      ["Jump_Loop", jumpLoop.asAction()]
    ]);

    const animation = new ThreeAnimationController({ stateController, actions });
    expect(events).toEqual([]);
    expect(animation.active).toBeNull();

    snapshot = { ...snapshot, isMoving: true };
    expect(animation.update()).toBe("WALK");
    expect(animation.active).toBe(walk.asAction());
    expect(animation.activeActionName).toBe("Walk_Loop");
    expect(animation.previousClipName).toBe("Walk_Loop");
    expect(animation.canTransition).toBe(true);

    snapshot = { ...snapshot, runActive: true };
    expect(animation.update()).toBe("RUN");
    expect(animation.active).toBe(run.asAction());
    expect(animation.activeActionName).toBe("Jog_Fwd_Loop");
    expect(animation.previousClipName).toBe("Jog_Fwd_Loop");

    snapshot = { ...snapshot, jumpActive: true };
    expect(animation.update()).toBe("JUMP_START");
    expect(animation.active).toBe(jumpStart.asAction());
    expect(animation.activeActionName).toBe("Jump_Start");
    expect(animation.canTransition).toBe(false);
    expect(jumpStart.timeScale).toBe(1.6);
    expect(jumpStart.loopMode).toBe(LoopOnce);
    expect(jumpStart.clampWhenFinished).toBe(true);

    snapshot = { ...snapshot, isOnGround: false, jumpActive: false };
    expect(animation.update()).toBe("JUMP_IDLE");
    expect(animation.active).toBe(jumpStart.asAction());

    animation.notifyFinished("Jump_Start");
    expect(animation.canTransition).toBe(true);
    expect(animation.update()).toBe("JUMP_IDLE");
    expect(animation.active).toBe(jumpLoop.asAction());
    expect(animation.activeActionName).toBe("Jump_Loop");
    expect(DEFAULT_THREE_ANIMATION_ACTIONS.RUN).toBe("Jog_Fwd_Loop");
  });

  it("can opt into autoplaying the initial action for imperative Three.js apps", () => {
    const stateController = new AnimationStateController({
      getSnapshot: () => ({
        isOnGround: true,
        isFalling: false,
        isMoving: false,
        runActive: false,
        jumpActive: false
      })
    });
    const events: string[] = [];
    const idle = new FakeAnimationAction("Idle_Loop", events);
    const animation = new ThreeAnimationController({
      stateController,
      actions: new Map<string, AnimationAction>([["Idle_Loop", idle.asAction()]]),
      autoplayInitialAction: true
    });

    expect(events).toEqual(["Idle_Loop:play"]);
    expect(animation.active).toBe(idle.asAction());
  });
});

function context(overrides: Partial<AnimationSnapshot> & { wasOnGround: boolean }) {
  return {
    handle: null,
    isOnGround: false,
    isFalling: false,
    isMoving: false,
    runActive: false,
    jumpActive: false,
    ...overrides
  };
}

class FakeAnimationAction {
  readonly clip: AnimationClip;
  timeScale = 1;
  clampWhenFinished = false;
  loopMode = 0;

  constructor(name: string, private readonly events: string[]) {
    this.clip = new AnimationClip(name, -1, []);
  }

  asAction(): AnimationAction {
    return this as unknown as AnimationAction;
  }

  getClip(): AnimationClip {
    return this.clip;
  }

  reset(): AnimationAction {
    this.events.push(`${this.clip.name}:reset`);
    return this.asAction();
  }

  play(): AnimationAction {
    this.events.push(`${this.clip.name}:play`);
    return this.asAction();
  }

  crossFadeFrom(action: AnimationAction, duration: number): AnimationAction {
    this.events.push(`${this.clip.name}:crossFadeFrom:${action.getClip().name}:${duration.toFixed(2)}`);
    return this.asAction();
  }

  setLoop(mode: number, repetitions: number): AnimationAction {
    this.loopMode = mode;
    this.events.push(`${this.clip.name}:setLoop:${mode}:${repetitions}`);
    return this.asAction();
  }
}
