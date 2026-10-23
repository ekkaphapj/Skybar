# The Cottage Sky Bar

ระบบขายหน้าร้าน The Cottage Sky Bar / Mini Mart

- **Web application:** [web/](web/) — Cloudflare Workers + D1, บัญชีพนักงาน, เปิดโต๊ะ 1–20, รับออร์เดอร์, เช็คบิล, ใบเสร็จภาษาไทย 58 มม. และหน้าร้านจำลองสำหรับ PC
- **Original C# application:** [TheCottageSkyBar/](TheCottageSkyBar/) และ solution ของ Windows Forms สำหรับอ้างอิงการย้ายระบบ

เว็บใช้งาน: [The Cottage Sky Bar POS](https://cottage-skybar-pos.ekapap-j.workers.dev/)

อ่านวิธีติดตั้ง พัฒนา ทดสอบ และ deploy ใน [คู่มือ Web Edition](web/README.md)
โปรแกรมช่วยพิมพ์ USB และคู่มือตั้งค่าอยู่ใน [web/print-agent/](web/print-agent/)

ไม่รวมรหัสลับในเครื่อง ฐานข้อมูล Access/D1 ที่ใช้งานจริง ไฟล์สำรอง ใบรับรองลงนาม และภาพทดสอบที่มีข้อมูลลูกค้า
โปรเจกต์ C# เดิมอาจต้องกำหนดเส้นทางฐานข้อมูลและใบรับรองลงนามของเครื่องที่จะนำไปใช้งานใหม่
