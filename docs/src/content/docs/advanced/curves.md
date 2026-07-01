---
title: Curves
description: The Hermite curve baker behind tunable response curves — engine torque, tire slip, and platform mass coupling — and how to author your own.
---

Several options take a **curve** rather than a scalar: engine torque vs RPM, tire
slip response, steering angle vs speed, and platform mass coupling. The library
bakes these into fast lookup tables with a small Hermite-spline helper you can
also use directly.

## Curve data

A curve is a set of control points:

```ts
type CurvePoint = {
  x: number;      // input (domain)
  y: number;      // output (value at x)
  r_in?: number;  // incoming tangent angle, in radians
  r_out?: number; // outgoing tangent angle, in radians
  w_in?: number;  // incoming tangent weight (default 1)
  w_out?: number; // outgoing tangent weight (default 1)
};

type CurveData = {
  points: CurvePoint[]; // at least two
  samples?: number;     // LUT resolution, default 50
};
```

Each segment between two points is a weighted cubic Hermite spline. `r_in` /
`r_out` are **tangent angles in radians** (internally `Math.tan` of the angle
gives the slope); `0` means a flat tangent. `w_in` / `w_out` bias the tangent
toward or away from the straight-line slope between points.

For example, the controller's default platform mass-coupling curve stays flat at
zero until the mass ratio reaches `0.5`, then ramps to `1`:

```ts
const massRatioFallOff: CurveData = {
  points: [
    { x: 0,   y: 0, r_out: 0 },
    { x: 0.5, y: 0, r_in: 0, r_out: 0 },
    { x: 1,   y: 1, r_in: 0 },
  ],
};
```

## Baking and evaluating

Curves are compiled into a `CurveLUT` — a sampled `Float32Array` plus its domain
— and evaluated with linear interpolation between samples (clamped at the ends).

```ts
import { bakeCurveLUT, evaluateCurveLUT } from "jolt-ts-character-controller";

const lut = bakeCurveLUT(massRatioFallOff.points, massRatioFallOff.samples ?? 50);

const y = evaluateCurveLUT(0.75, lut); // interpolated output at x = 0.75
```

- `bakeCurveLUT(points, samples = 50)` — sorts the points by `x`, samples the
  spline `samples` times across the domain, and returns a `CurveLUT`. Throws if
  given fewer than two points.
- `evaluateCurveLUT(x, curve)` — returns the value at `x`, clamped to the curve's
  domain. Cheap enough to call every tick.

Higher `samples` means a more faithful curve at the cost of a larger table; the
default of `50` is plenty for smooth response curves.

## Where curves are used

| Option | On | Shapes |
| --- | --- | --- |
| `massRatioFallOffCurveData` | controller & wheels | How strongly you push back on dynamic ground vs mass ratio. |
| `engineTorqueCurveData` | car | Engine torque vs normalized RPM. |
| `steerAngleCurveData` | car | Max steer angle vs speed (less steering at speed). |
| `lngSlipRatioCurveData` | wheel | Longitudinal grip vs slip. |
| `latSlipRatioCurveData` | wheel | Lateral grip vs slip. |

Each is baked once when the object is constructed. If you replace one at runtime,
call the matching rebake method so the new curve takes effect:

- `controller.refreshMassRatioFallOffCurve()`
- `vehicle.refreshCarCurves()` (engine torque + steer angle)
- `wheel.refreshConfig()` (wheel slip / mass-ratio curves)

## Authoring your own tunables

Because `bakeCurveLUT` / `evaluateCurveLUT` are exported, you can use them for any
gameplay response — camera shake falloff, damage vs distance, difficulty ramps:

```ts
import { bakeCurveLUT, evaluateCurveLUT, type CurveData } from "jolt-ts-character-controller";

const damageFalloff: CurveData = {
  points: [
    { x: 0,  y: 1 },   // point blank: full damage
    { x: 20, y: 1 },   // full up to 20m
    { x: 60, y: 0.2 }, // fades to 20% by 60m
  ],
};

const lut = bakeCurveLUT(damageFalloff.points);
const multiplier = evaluateCurveLUT(distanceToTarget, lut);
```
