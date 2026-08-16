export type Pucks = bigint;

export const GAJU_DECIMALS = 18n;
export const PUCKS_PER_GAJU = 10n ** GAJU_DECIMALS;

export const MIN_GAS_PRICE = 1_000_000_000n;
export const DEFAULT_SPEND_GAS = 20_000n;
export const DEFAULT_CALL_GAS = 200_000n;
export const DEFAULT_CREATE_GAS = 500_000n;
export const DEFAULT_TTL_DELTA = 262_980n;

export function formatGaju(pucks: bigint): string {
  const negative = pucks < 0n;
  const abs = negative ? -pucks : pucks;
  const whole = abs / PUCKS_PER_GAJU;
  const frac = abs % PUCKS_PER_GAJU;
  if (frac === 0n) return `${negative ? "-" : ""}${whole.toString()}`;
  const fracStr = frac.toString().padStart(Number(GAJU_DECIMALS), "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toString()}.${fracStr}`;
}

export function parseGaju(gaju: string): bigint {
  const trimmed = gaju.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error("invalid GAJU amount");
  }
  const negative = trimmed.startsWith("-");
  const [wholeRaw, fracRaw = ""] = (negative ? trimmed.slice(1) : trimmed).split(".");
  if (fracRaw.length > Number(GAJU_DECIMALS)) {
    throw new Error("too many decimal places");
  }
  const whole = BigInt(wholeRaw ?? "0") * PUCKS_PER_GAJU;
  const frac = BigInt(fracRaw.padEnd(Number(GAJU_DECIMALS), "0"));
  const value = whole + frac;
  return negative ? -value : value;
}
