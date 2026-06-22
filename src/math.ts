import { Vector3 } from "three";

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function remap(value: number, low1: number, high1: number, low2: number, high2: number): number {
  return low2 + ((value - low1) * (high2 - low2)) / (high1 - low1);
}

export function createSlerpVec3(): (start: Vector3, end: Vector3, percent: number, refAxis?: Vector3) => Vector3 {
  const startClone = new Vector3();
  const relativeVec = new Vector3();
  const resultVec3 = new Vector3();

  return (start: Vector3, end: Vector3, percent: number, refAxis?: Vector3) => {
    const dot = clamp(start.dot(end), -1, 1);

    if (Math.abs(dot + 1) < 0.001) {
      if (refAxis && Math.abs(refAxis.dot(start)) < 0.99) {
        relativeVec.copy(refAxis).normalize();
      } else if (Math.abs(start.y) > 0.99) {
        relativeVec.set(1, 0, 0);
      } else if (Math.abs(start.x) > 0.99) {
        relativeVec.set(0, 1, 0);
      } else {
        relativeVec.set(0, 0, 1);
      }

      relativeVec.cross(start).normalize();
      const theta = Math.PI * percent;
      resultVec3
        .copy(start)
        .multiplyScalar(Math.cos(theta))
        .addScaledVector(relativeVec, Math.sin(theta));
    } else {
      const theta = Math.acos(dot) * percent;
      relativeVec
        .copy(end)
        .sub(startClone.copy(start).multiplyScalar(dot))
        .normalize();
      resultVec3
        .copy(start)
        .multiplyScalar(Math.cos(theta))
        .addScaledVector(relativeVec, Math.sin(theta));
    }

    return resultVec3.normalize();
  };
}

export function vectorFromLike(input: { readonly x: number; readonly y: number; readonly z: number }, out = new Vector3()): Vector3 {
  return out.set(input.x, input.y, input.z);
}

export function vectorToTuple(input: Vector3): [number, number, number] {
  return [input.x, input.y, input.z];
}
