/**
 * Car calculators (D-58). Pure math with the usual enthusiast formulas; every result is an estimate and the
 * screens say so. Inputs in US units unless noted (tire sizes are metric by convention).
 */

const MM_PER_IN = 25.4;
const round = (v: number, places = 1) => Math.round(v * 10 ** places) / 10 ** places;

export type TireSize = { width: number; aspect: number; rim: number };

/** "245/40R18", "245/40ZR18", "245 40 18" -> { width: 245, aspect: 40, rim: 18 }. */
export function parseTire(text: string): TireSize | null {
  const m = /^\s*(\d{3})\s*[/\s-]\s*(\d{2})\s*(?:Z?R|-|\s)?\s*(\d{2}(?:\.\d)?)\s*$/i.exec(text);
  if (!m) return null;
  const t = { width: Number(m[1]), aspect: Number(m[2]), rim: Number(m[3]) };
  if (t.width < 125 || t.width > 395 || t.aspect < 20 || t.aspect > 90 || t.rim < 10 || t.rim > 26) return null;
  return t;
}

export function tireDims(t: TireSize) {
  const sidewallIn = (t.width * (t.aspect / 100)) / MM_PER_IN;
  const diameterIn = t.rim + 2 * sidewallIn;
  return {
    widthIn: round(t.width / MM_PER_IN, 2),
    sidewallIn: round(sidewallIn, 2),
    diameterIn: round(diameterIn, 2),
    circumferenceIn: round(Math.PI * diameterIn, 2),
    revsPerMile: Math.round(63360 / (Math.PI * diameterIn)),
  };
}

/** Compare a new tire to the stock one: diameter change and what the speedometer reads vs. real speed. */
export function compareTires(stock: TireSize, next: TireSize) {
  const a = tireDims(stock);
  const b = tireDims(next);
  const ratio = b.diameterIn / a.diameterIn;
  return {
    stock: a,
    next: b,
    diameterChangePct: round((ratio - 1) * 100, 2),
    /** real speed when the speedometer shows 60 mph */
    realAtIndicated60: round(60 * ratio, 1),
  };
}

/**
 * Wheel fitment change: how far the outer lip pokes out (+) or tucks in (-), and how much closer the inner lip
 * gets to the suspension (+ means less clearance), in mm. Widths in inches, offsets in mm.
 */
export function wheelFitment(stock: { width: number; offset: number }, next: { width: number; offset: number }) {
  const halfDiff = ((next.width - stock.width) * MM_PER_IN) / 2;
  const offsetDiff = next.offset - stock.offset;
  return {
    pokeMm: round(halfDiff - offsetDiff, 1),
    innerMm: round(halfDiff + offsetDiff, 1),
  };
}

/** Engine speed at a road speed for a gear: rpm = mph * gear * final drive * 336.13 / tire diameter (in). */
export function rpmAtSpeed(mph: number, gearRatio: number, finalDrive: number, tireDiameterIn: number) {
  return Math.round((mph * gearRatio * finalDrive * 336.13) / tireDiameterIn);
}
/** Road speed at an engine speed (inverse of rpmAtSpeed). */
export function speedAtRpm(rpm: number, gearRatio: number, finalDrive: number, tireDiameterIn: number) {
  return round((rpm * tireDiameterIn) / (gearRatio * finalDrive * 336.13), 1);
}

/**
 * Quarter-mile and 0-60 estimates from weight and wheel horsepower (Hale's formulas; 0-60 from a common rule of
 * thumb). Real results depend on traction, gearing, driver and conditions: rough guides only, and only on a track.
 */
export function dragEstimate(weightLb: number, whp: number) {
  const lbPerHp = weightLb / whp;
  const et = 5.825 * Math.cbrt(lbPerHp);
  return {
    lbPerHp: round(lbPerHp, 1),
    quarterEt: round(et, 2),
    quarterTrapMph: round(234 * Math.cbrt(whp / weightLb), 1),
    // rough rule of thumb tied to the ET; traction limits real launches below ~3 s
    zeroToSixty: round(Math.max(2.8, et * 0.5 - 1.3), 1),
  };
}

/** Fuel for a trip: gallons and cost. */
export function fuelCost(miles: number, mpg: number, pricePerGallon: number) {
  const gallons = miles / mpg;
  return { gallons: round(gallons, 2), cost: round(gallons * pricePerGallon, 2) };
}

/** Number field text -> number, or null when blank or not a finite positive number. */
export function num(text: string): number | null {
  const t = text.trim().replace(/,/g, "");
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) && v > 0 ? v : null;
}
/** Like num, but allows zero and negatives (wheel offsets). */
export function signedNum(text: string): number | null {
  const t = text.trim();
  if (!t || !/^[-+]?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}
