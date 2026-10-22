# เช็กเบี้ยประกัน TOYOTA CARE

หน้าเว็บค้นหาเบี้ยประกันชั้นหนึ่งตามรุ่นรถ (frontend: ไฟล์ `index.html` ไฟล์เดียว, backend: Supabase)

## โครงสร้าง
- `template.html`, `pdfparse.js`, `updater.js` → ต้นทาง; `python build.py` สร้าง `index.html` (ฝังข้อมูลตั้งต้นจาก `data.json`)
- `config.js` → URL และ anon key ของ Supabase
- `supabase/migrations/` → ตาราง `rate_sets`, `admins`, ฟังก์ชัน `publish_rates` / `reset_rates` และ RLS
- ผู้ดูแลเข้าสู่ระบบในหน้าเว็บ (ลิงก์ "อัปเดตข้อมูลจากไฟล์ PDF") แล้วอัปโหลด PDF ฉบับใหม่ ทุกคนเห็นชุดใหม่ทันที

## ตั้งค่า Supabase
1. สร้างโปรเจกต์ที่ supabase.com
2. SQL Editor → รันไฟล์ `supabase/migrations/20261022000000_init.sql`
3. Authentication → Users → Add user (อีเมล + รหัสผ่านของผู้ดูแล)
4. รัน `insert into public.admins (user_id) select id from auth.users where email = 'อีเมลผู้ดูแล';`
5. ใส่ Project URL และ anon key ใน `config.js` แล้ว commit

## Deploy
GitHub Pages: Settings → Pages → Deploy from branch → `main` / root
