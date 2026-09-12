const NICE_STEP_FRACTIONS = [1, 2, 2.5, 5, 10] as const;
const MIN_PREFERRED_TICKS = 4;
const MAX_PREFERRED_TICKS = 6;

export type TrendYScale = {
  max: number;
  step: number;
  ticks: number[];
};

export function cleanScaleNumber(value: number): number {
  return Number(value.toPrecision(12));
}

export function decimalsForStep(step: number): number {
  const cleaned = cleanScaleNumber(step);
  if (!Number.isFinite(cleaned) || cleaned <= 0) return 0;
  if (Number.isInteger(cleaned)) return 0;
  for (let decimals = 1; decimals <= 8; decimals++) {
    if (Number.isInteger(cleanScaleNumber(cleaned * 10 ** decimals))) {
      return decimals;
    }
  }
  return 8;
}

function isPlainNiceStep(step: number): boolean {
  const cleaned = cleanScaleNumber(step);
  if (!Number.isFinite(cleaned) || cleaned <= 0) return false;
  const exponent = Math.floor(Math.log10(cleaned));
  const fraction = cleanScaleNumber(cleaned / 10 ** exponent);
  return fraction === 1 || fraction === 2 || fraction === 5;
}

function preferredTickDistance(tickCount: number): number {
  if (tickCount < MIN_PREFERRED_TICKS) return MIN_PREFERRED_TICKS - tickCount;
  if (tickCount > MAX_PREFERRED_TICKS) return tickCount - MAX_PREFERRED_TICKS;
  return 0;
}

function generateNiceSteps(rawMax: number): number[] {
  const exponent = Math.floor(Math.log10(rawMax));
  const steps = new Set<number>();
  for (let exp = exponent - 2; exp <= exponent + 2; exp++) {
    const magnitude = 10 ** exp;
    for (const fraction of NICE_STEP_FRACTIONS) {
      const step = cleanScaleNumber(fraction * magnitude);
      if (Number.isFinite(step) && step > 0) steps.add(step);
    }
  }
  return [...steps].sort((a, b) => a - b);
}

function ceilToStep(value: number, step: number): number {
  const ratio = cleanScaleNumber(value / step);
  const multiples = Math.max(1, Math.ceil(ratio - 1e-10));
  return cleanScaleNumber(multiples * step);
}

function ticksFor(step: number, max: number): number[] {
  const count = Math.round(cleanScaleNumber(max / step)) + 1;
  return Array.from({ length: count }, (_, index) => cleanScaleNumber(step * index));
}

function compareCandidates(rawMax: number, left: TrendYScale, right: TrendYScale): number {
  const distanceLeft = preferredTickDistance(left.ticks.length);
  const distanceRight = preferredTickDistance(right.ticks.length);
  if (distanceLeft !== distanceRight) return distanceLeft - distanceRight;

  const overshootLeft = cleanScaleNumber(left.max - rawMax);
  const overshootRight = cleanScaleNumber(right.max - rawMax);
  if (overshootLeft !== overshootRight) return overshootLeft - overshootRight;

  const plainLeft = isPlainNiceStep(left.step);
  const plainRight = isPlainNiceStep(right.step);
  if (plainLeft !== plainRight) return plainLeft ? -1 : 1;

  const midLeft = Math.abs(left.ticks.length - 5);
  const midRight = Math.abs(right.ticks.length - 5);
  if (midLeft !== midRight) return midLeft - midRight;

  return left.step - right.step;
}

export function buildTrendYScale(values: readonly number[]): TrendYScale {
  const rawMax = values.reduce((highest, value) => (value > highest ? value : highest), 0);
  if (!Number.isFinite(rawMax) || rawMax <= 0) {
    return { max: 1, step: 1, ticks: [0, 1] };
  }

  const candidates = generateNiceSteps(rawMax).map((step) => {
    const max = ceilToStep(rawMax, step);
    return { max, step, ticks: ticksFor(step, max) };
  });

  return candidates.reduce((best, current) =>
    compareCandidates(rawMax, current, best) < 0 ? current : best
  );
}
