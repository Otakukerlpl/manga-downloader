manga-sniffer — โปรแกรมดาวน์โหลดมังงะแบบย่อ (ได้รับแรงบันดาลใจจาก HakuNeko)
โปรแกรมตัวอย่างนี้ดาวน์โหลดภาพจากหน้าแสดงบทตอน (chapter page) โดยให้ผู้ใช้ใส่ URL ของหน้าบทตอนที่มีแท็ก <img> หรือภาพที่โหลดแบบ lazy (data-src) แล้วดาวน์โหลดไฟล์ภาพทั้งหมดลงในโฟลเดอร์ท้องถิ่น
วิธีใช้งาน (ตัวอย่าง):

1) ติดตั้ง dependencies (ภายในโฟลเดอร์ `manga-downloader`):
```powershell
cd D:\manga-reader\manga-downloader
npm install
```
2) รันแบบคอมมานด์ไลน์ (ตัวอย่าง):
```powershell
node src/cli.js --url "https://example.com/chapter1.html" --selector ".page img" --output .\downloads --concurrency 6 --cbz
```
หรือรัน GUI (Electron):
```powershell
npm run start:gui
```
ออปชันสำคัญ:
- --url: (จำเป็น) URL ของหน้า chapter ที่มีรูปภาพ
- --selector: (ไม่จำเป็น) CSS selector เพื่อค้นหารูปภาพบนหน้า (ค่าเริ่มต้น `img`)
- --output: โฟลเดอร์เก็บผลลัพธ์
- --concurrency: จำนวนการดาวน์โหลดพร้อมกัน
- --cbz: สร้างไฟล์ .cbz หลังดาวน์โหลด
ข้อควรระวังทางกฎหมายและจริยธรรม:
- เครื่องมือนี้เป็นตัวอย่างทางเทคนิค — ผู้ใช้งานต้องรับผิดชอบต่อกฎหมายลิขสิทธิ์และข้อกำหนดของเว็บไซต์ต้นทาง
- อย่าใช้เพื่อเก็บหรือแจกจ่ายเนื้อหาที่คุณไม่มีสิทธิ์
ถ้าต้องการให้ปรับปรุงเพิ่มเติม ผมสามารถ:
- เพิ่ม adapter เฉพาะเว็บไซต์ (ระบุ URL ตัวอย่าง 1 หน้า และผมจะทดสอบและจูน selector ให้)
- รองรับการรัน JavaScript ด้วย Puppeteer สำหรับหน้า dynamic
- สร้างตัวติดตั้ง (installer) สำหรับ Windows ด้วย `electron-builder`
บอกผมว่าต้องการอย่างไหนต่อ — ผมจะอัปเดต todo list แล้วทำให้ทันที
manga-sniffer — minimal manga downloader (inspired by HakuNeko)

สาธิตโปรแกรมดาวน์โหลดภาพจากหน้าแสดงบทตอน (chapter page) โดยให้ผู้ใช้ส่ง URL ของหน้าบทตอนที่มีแท็ก <img> หรือรูปภาพที่โหลดแบบ lazy (data-src) แล้วดาวน์โหลดไฟล์ภาพทั้งหมดลงโฟลเดอร์ท้องถิ่น