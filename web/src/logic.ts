// Shared pure business logic (erasable TypeScript only, so Node can import it directly for unit tests)

export const TZ = "Asia/Bangkok";
export const DAY_CUTOFF_HOUR = 2; // business day flips at 02:00 (same as the original POS)

export const SELLERS = ["โอปอ", "ดรีม", "เปรี้ยว", "โบกี้", "แพรว", "เอก", "พนักงานชั่วคราว"];
export const PAYMENT_TYPES = ["เงินสด", "โอน", "อื่นๆ", "Voucher"];
export const DISCOUNT_TYPE_NAME = "ส่วนลด";
export const VOUCHER_MAX_TOTAL = 30; // original: voucher usable only for a bill of at most 30 baht

export interface BkkParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  second: number;
}

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export function bkkParts(now: Date = new Date()): BkkParts {
  const p = partsFormatter.formatToParts(now);
  const get = (t: string): number => Number(p.find((x) => x.type === t)!.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

const pad = (n: number, w = 2): string => String(n).padStart(w, "0");

/** Business date in Asia/Bangkok as YYYY-MM-DD. Before 02:00 it is still the previous day. */
export function businessDate(now: Date = new Date()): string {
  const p = bkkParts(now);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day);
  const shifted = p.hour < DAY_CUTOFF_HOUR ? asUtc - 86400000 : asUtc;
  const d = new Date(shifted);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Clock time in Asia/Bangkok as HH:MM:SS */
export function nowTime(now: Date = new Date()): string {
  const p = bkkParts(now);
  return `${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

/** Bill id = HHmmssddMMyyyy (Bangkok time), zero-padded variant of the original POS format */
export function billId(now: Date = new Date()): string {
  const p = bkkParts(now);
  return `${pad(p.hour)}${pad(p.minute)}${pad(p.second)}${pad(p.day)}${pad(p.month)}${p.year}`;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Round like C# ToString("0.00") used by the original app */
export function money(n: number): number {
  return round2(n);
}

/** Legacy discounts use whole baht; round currency before truncating float noise. */
export function discountAmount(total: number, fractionToPay: number): number {
  return Math.max(0, Math.trunc(money(total * (1 - fractionToPay))));
}

export function isValidDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const date = new Date(s + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === s;
}
