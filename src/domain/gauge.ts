/**
 * Full-scale value for the power gauge: a round number comfortably above the car's power, so a stock 140 hp
 * Miata and a 600 hp build both use most of the dial without pinning the needle. Minimum 300.
 */
export function gaugeMax(hp: number) {
  if (!Number.isFinite(hp) || hp <= 0) return 300;
  const target = hp * 1.35;
  const step = target <= 500 ? 50 : target <= 1000 ? 100 : 250;
  return Math.max(300, Math.ceil(target / step) * step);
}
