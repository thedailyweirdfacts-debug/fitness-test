export const DEFAULT_PLATE_INCHES = 9.5;
export const DEFAULT_FORK_INCHES = 7.5;

const INCH_TO_CM = 2.54;

export type DishScale = {
  plateInches: number;
  forkInches: number;
};

export function defaultDishScale(): DishScale {
  return { plateInches: DEFAULT_PLATE_INCHES, forkInches: DEFAULT_FORK_INCHES };
}

export function centimeters(inches: number): number {
  return Math.round(inches * INCH_TO_CM * 100) / 100;
}

/** A missing or unusable value keeps the fallback. Inches are rounded to two decimals. */
export function parseScaleInches(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return fallback;
  return Math.round(parsed * 100) / 100;
}

export function resolveDishScale(
  env: { SCALE_PLATE_INCHES?: string; SCALE_FORK_INCHES?: string } = {},
): DishScale {
  return {
    plateInches: parseScaleInches(env.SCALE_PLATE_INCHES, DEFAULT_PLATE_INCHES, 4, 20),
    forkInches: parseScaleInches(env.SCALE_FORK_INCHES, DEFAULT_FORK_INCHES, 3, 12),
  };
}

/** A per-request number replaces the server scale. A blank or unusable override keeps it. */
export function applyScaleOverride(
  base: DishScale,
  override: { plateInches?: unknown; forkInches?: unknown } | null | undefined,
): DishScale {
  if (!override) return base;
  return {
    plateInches:
      override.plateInches == null ? base.plateInches : parseScaleInches(override.plateInches, base.plateInches, 4, 20),
    forkInches: override.forkInches == null ? base.forkInches : parseScaleInches(override.forkInches, base.forkInches, 3, 12),
  };
}
