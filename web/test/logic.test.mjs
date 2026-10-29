// Unit tests for pure business logic (imports src/logic.ts directly - Node 22+ type stripping)
import { businessDate, nowTime, round2, isValidDate, discountAmount } from "../src/logic.ts";

let pass = 0, fail = 0;
function eq(label, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ok    ${label}`); }
  else { fail++; console.error(`  FAIL  ${label}: got ${a}, want ${e}`); }
}

console.log("== businessDate (Asia/Bangkok, cutoff 02:00) ==");
eq("noon", businessDate(new Date("2026-10-22T06:00:00Z")), "2026-10-22");       // 13:00 BKK
eq("01:30 BKK -> previous day", businessDate(new Date("2026-10-22T18:30:00Z")), "2026-10-22"); // 01:30 next day BKK
eq("02:00 BKK -> same day", businessDate(new Date("2026-10-22T19:00:00Z")), "2026-10-23");     // 02:00 next day BKK
eq("01:00 on 1st -> last day of prev month", businessDate(new Date("2026-10-31T18:00:00Z")), "2026-10-31"); // 01:00 Nov 1 BKK -> Oct 31
eq("23:59 BKK", businessDate(new Date("2026-12-31T16:59:59Z")), "2026-12-31");

console.log("== nowTime ==");
eq("time", nowTime(new Date("2026-10-22T19:05:06Z")), "02:05:06");

console.log("== round2 ==");
eq("float noise", round2(0.1 + 0.2), 0.3);
eq("negative discount", round2(60 - 6), 54);

eq("leap day valid", isValidDate("2024-02-29"), true);
eq("impossible leap day", isValidDate("2026-02-29"), false);
eq("impossible month", isValidDate("2026-13-01"), false);
eq("impossible day", isValidDate("2026-04-31"), false);
eq("invalid format", isValidDate("22/10/2026"), false);
eq("10% of 60 is six baht", discountAmount(60, 0.9), 6);
eq("discount retains whole-baht truncation", discountAmount(25, 0.9), 2);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
