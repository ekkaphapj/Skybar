# The Cottage Sky Bar POS — Web Edition

เวอร์ชัน Web Application ของระบบขายหน้าร้าน The Cottage Sky Bar / Mini Mart
(แปลงจากโปรแกรม Windows Forms เดิม) ทำงานบน **Cloudflare Workers + D1 (SQLite)**

เพิ่มระบบเปิดโต๊ะ 1–20 เก็บรายการระหว่างขาย เช็คบิลพร้อมใบเสร็จ 2 ชุด และประวัติการขาย: [คู่มือการขายตามโต๊ะ](docs/TABLE-ORDERS.md)

มุมมองร้านการ์ตูน 3 มิติสำหรับ PC พร้อมเลือกโต๊ะ เมนูสั่งอาหาร และตัวเลขจากระบบจริง: [คู่มือร้านจำลอง](docs/RESTAURANT-VIEW.md)

**URL ที่ใช้งาน:** https://cottage-skybar-pos.ekapap-j.workers.dev

## การทำงานเทียบเท่าระบบเดิม

- วันที่ธุรกิจขึ้นป้ายใหม่เวลา **02:00 น.** (ก่อน 2 โมงเช้าถือเป็นวันก่อนหน้า) ตามเวลา Asia/Bangkok
- เลขบิลใหม่ขึ้นต้นด้วย HHmmssddMMyyyy และต่อ UUID เพื่อไม่ชนกันเมื่อเปิดหลายเครื่องพร้อมกัน (ยังค้นหาบิลเก่าได้)
- การขาย 1 ครั้งบันทึกครบ: `Sell` → `StockTransaction` → ตัด `Stock` → `Account` → `CASH` (ถ้าเงินสด) ใน **transaction เดียว** (D1 batch)
- ประเภทสินค้า **"ส่วนลด"** = รายการพิเศษ ราคาคือสัดส่วนที่ต้องจ่าย (0.9 = หัก 10% ของยอดสะสม)
- **Voucher**: ใช้ได้เฉพาะวันที่กำหนด ราคาไม่เกิน 30 บาท ทีละ 1 รายการ บันทึกราคา 0 และปิดสถานะคูปอง
- รายงาน: ยอดขายตามสินค้า / รายรับรายจ่าย / ธุรกรรมเงินสด / เงินสดสะสม / สรุปรายเดือน / สถิติ Voucher
- สต็อก: ซื้อเพิ่ม / รายจ่ายอื่นๆ / รายรับอื่นๆ / สูญหาย-ทิ้ง + ตัดจ่ายเงินสด
- พิมพ์ใบเสร็จ/บิลผ่านเครื่องพิมพ์ของเบราว์เซอร์ (ปุ่มพิมพ์)
- **รองรับ USB thermal printer**: เปิดโปรแกรม `print-agent/start.bat` ในเครื่องที่ต่อเครื่องพิมพ์
  แล้วเลือกเครื่องพิมพ์ในหน้าเมนูหลัก (ส่วน 🖨️ เครื่องพิมพ์ใบเสร็จ) ระบบจะพิมพ์ใบเสร็จ ESC/POS
  แบบภาพ raster ภาษาไทย 58 มม. พร้อมใบเสร็จ 2 ชุดตอนเช็คบิล โดยไม่มี print dialog
  โหมด Android ส่งผ่าน RawBT (ต้องติดตั้งและจับคู่ Bluetooth ก่อน)
  ดู [คู่มือติดตั้ง USB/Android](print-agent/README.md) และ [ผลทดสอบล่าสุด](docs/UI-PRINT-REVIEW-2026-10-22.md)
- สำรองข้อมูล = ดาวน์โหลด JSON ทั้งฐานข้อมูล / นำเข้า = อัปโหลดไฟล์สำรองกลับ (แทนการ copy ไป Google Drive)

## บัญชีผู้ใช้และสิทธิ์

ใช้บัญชีเริ่มต้น admin / 1234 ตามที่เจ้าของระบบกำหนด แอดมินเพิ่มพนักงานและรีเซ็ตรหัสผ่านได้ในเมนู จัดการพนักงาน ทุกธุรกรรมใช้ชื่อจากบัญชีที่ล็อกอินโดยเซิร์ฟเวอร์ ไม่ใช้ APP_PIN อีกต่อไป

อ่าน [คู่มือบัญชีผู้ใช้](docs/STAFF-LOGIN.md) สำหรับสิทธิ์ การสำรองข้อมูล และผลทดสอบ

## คำสั่งที่ใช้บ่อย

```bash
npm run dev                 # รัน dev server ท้องถิ่น (http://127.0.0.1:8787)
npm run db:migrate:local    # apply migration ลง D1 local
npm run db:migrate:remote   # apply migration ลง D1 บน Cloudflare
npm run test:logic          # unit test กฎวันที่ธุรกิจ/เลขบิล
npm run test:frontend       # ทดสอบตะกร้า/ส่วนลด/การแสดงชื่อสินค้า
npm run test:regression     # ทดสอบคำขอพร้อมกันและสำรอง/นำเข้า (local เท่านั้น)
npm run test                # integration test กับ BASE_URL (default localhost)
# ชุด API tests เพิ่มข้อมูลจริงลงฐานทดสอบ ควรใช้ local ที่แยกจากข้อมูลใช้งาน
# บัญชีทดสอบใช้ TEST_USERNAME / TEST_PASSWORD (ค่าเริ่มต้น admin / 1234):
node test/regression.test.mjs
npm run deploy              # deploy ขึ้น Cloudflare
```

## โครงสร้าง

```
migrations/0001_init.sql   schema + ประเภทสินค้าเริ่มต้น (มี "ส่วนลด")
src/logic.ts               กฎธุรกิจ (วันที่ 02:00, เลขบิล, ผู้ขาย, ช่องทางชำระ)
src/index.ts               API ทั้งหมด (Hono) — ใช้ parameter binding กัน SQL injection
public/                    frontend (HTML/JS/CSS ล้วน ไม่ต้อง build)
print-agent/               โปรแกรมช่วยพิมพ์ใบเสร็จผ่าน USB thermal (ESC/POS, ไม่มี dependency)
test/logic.test.mjs        unit tests
test/api.test.mjs          integration tests (71 ข้อ)
```

## หมายเหตุจุดที่ปรับปรุงจากเดิมโดยเจตนา

- SQL ทั้งหมดเป็น prepared statement (เดิมต่อ string ตรง ๆ — ชื่อมี `'` จะพัง)
- การขายหลายตารางอยู่ใน transaction เดียว (เดิม insert ทีละตาราง เดิมพัดกลางทางข้อมูลไม่ตรงกัน)
- รายงานช่วงวันที่ครอบคลุมถึง "ถึงวันที่" ที่เลือกจริง (เดิม query รวมวันถัดไปเข้ามาด้วยโดยไม่ตั้งใจ)
- เงินสดสะสมคิดจากวันที่ธุรกิจ (ก่อน 02:00 น.) สม่ำเสมอทั้งระบบ
- Voucher สร้าง/ดูได้ในหน้าเว็บ (เดิมต้อง copy ไฟล์ .mdb จาก Google Drive)
- แก้ความคลาดเคลื่อนทศนิยมของส่วนลดเดิม: 10% ของ 60 บาท ลด 6 บาท (ยังตัดส่วนลดเป็นบาทเต็มตามเดิม)

ผลตรวจวันที่ 22 ตุลาคม 2026 และข้อจำกัดการย้ายข้อมูล Access: [docs/REVIEW-2026-10-22.md](docs/REVIEW-2026-10-22.md)

ชุด Print Agent พร้อมใช้ Windows x64 (รวม Node.js): [ดาวน์โหลดรุ่นล่าสุด](https://github.com/ekkaphapj/Skybar/releases/latest)
