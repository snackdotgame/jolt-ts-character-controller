export type CurvePoint = {
  x: number;
  y: number;
  r_in?: number;
  r_out?: number;
  w_in?: number;
  w_out?: number;
};

export type CurveLUT = {
  lut: Float32Array;
  xMin: number;
  xMax: number;
  samples: number;
};

export type CurveData = {
  points: CurvePoint[];
  samples?: number;
};

function evalHermiteSegment(p0: CurvePoint, p1: CurvePoint, x: number): number {
  const x0 = p0.x;
  const x1 = p1.x;
  const dx = x1 - x0;
  if (dx <= 0) return p0.y;

  const t = (x - x0) / dx;
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  const m0 = p0.r_out !== undefined ? Math.tan(p0.r_out) : 0;
  const m1 = p1.r_in !== undefined ? Math.tan(p1.r_in) : 0;
  const wOut = p0.w_out ?? 1;
  const wIn = p1.w_in ?? 1;
  const linearSlope = (p1.y - p0.y) / dx;
  const weightedM0 = linearSlope + (m0 - linearSlope) * wOut;
  const weightedM1 = linearSlope + (m1 - linearSlope) * wIn;

  return h00 * p0.y + h10 * weightedM0 * dx + h01 * p1.y + h11 * weightedM1 * dx;
}

function findSegmentByX(x: number, points: CurvePoint[]): number {
  let low = 0;
  let high = points.length - 2;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (x < points[mid].x) high = mid - 1;
    else if (x > points[mid + 1].x) low = mid + 1;
    else return mid;
  }
  return x < points[0].x ? 0 : points.length - 2;
}

function evalMultiPointCurveAtX(x: number, points: CurvePoint[]): number {
  const i = findSegmentByX(x, points);
  return evalHermiteSegment(points[i], points[i + 1], x);
}

export function bakeCurveLUT(points: CurvePoint[], samples = 50): CurveLUT {
  if (points.length < 2) throw new Error("Curve needs at least 2 points");
  const sortedPoints = [...points].sort((a, b) => a.x - b.x);
  const xMin = sortedPoints[0].x;
  const xMax = sortedPoints[sortedPoints.length - 1].x;
  const lut = new Float32Array(samples);
  for (let i = 0; i < samples; i += 1) {
    const u = i / (samples - 1);
    const x = xMin + u * (xMax - xMin);
    lut[i] = evalMultiPointCurveAtX(x, sortedPoints);
  }
  return { lut, xMin, xMax, samples };
}

export function evaluateCurveLUT(x: number, curve: CurveLUT): number {
  const { lut, xMin, xMax, samples } = curve;
  const u = (x - xMin) / (xMax - xMin);
  if (u <= 0) return lut[0];
  if (u >= 1) return lut[samples - 1];
  const f = u * (samples - 1);
  const i = f | 0;
  const t = f - i;
  return lut[i] * (1 - t) + lut[i + 1] * t;
}
