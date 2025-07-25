# ระบบกู้คืน Cookies อัตโนมัติ

## ปัญหาที่แก้ไข
เมื่อเซิร์ฟเวอร์รีสตาร์ท ข้อมูล cookies หายไป ทำให้ API ไม่สามารถทำงานได้

## วิธีแก้ไข

### 1. ระบบ Backup หลายชั้น
- `cookies.txt` - ไฟล์หลัก
- `cookies.backup.txt` - สำรองชั้นที่ 1
- `cookies.emergency.txt` - สำรองชั้นที่ 2  
- `cookies.persistent.txt` - สำรองถาวร (ไม่ถูกลบ)
- `cookies.{timestamp}.txt` - สำรองตามเวลา (เก็บ 5 ไฟล์ล่าสุด)

### 2. Auto-Recovery เมื่อเริ่มต้น
- ตรวจสอบ cookies ทุกไฟล์ตามลำดับ
- กู้คืนจากไฟล์ที่ใช้งานได้
- ดึง cookies ใหม่ทันทีถ้าไม่พบไฟล์ที่ใช้งานได้

### 3. Health Check อัตโนมัติ
- ตรวจสอบ cookies ทุก 30 นาที
- Refresh อัตโนมัติถ้าพบ cookies เสีย
- ตรวจสอบ cookies สำคัญ: `_tb_token_`, `lzd_cid`, `lzd_sid`

### 4. API Endpoints ใหม่

#### ตรวจสอบสถานะ Cookies
```bash
GET /api/v1/cookies/status
```

Response:
```json
{
  "success": true,
  "cookiesValid": true,
  "cookiesLength": 2847,
  "cookieAge": "2.3 hours",
  "backupFiles": {
    "main": true,
    "backup": true,
    "emergency": true,
    "persistent": true
  },
  "timestamp": "2025-01-25T10:30:00.000Z"
}
```

#### Force Refresh Cookies
```bash
POST /api/v1/cookies/refresh
```

Response:
```json
{
  "success": true,
  "message": "เริ่มการ refresh cookies แล้ว",
  "timestamp": "2025-01-25T10:30:00.000Z"
}
```

## การใช้งาน

### ตรวจสอบสถานะ
```bash
curl http://localhost:3000/api/v1/cookies/status
```

### Force refresh (ถ้าจำเป็น)
```bash
curl -X POST http://localhost:3000/api/v1/cookies/refresh
```

## Environment Variables ที่จำเป็น
```
EMAIL=your-lazada-email@example.com
PASSWORD=your-password
BROWSERLESS_TOKEN=your-browserless-token
```

## การทำงานของระบบ

1. **เมื่อเซิร์ฟเวอร์เริ่มต้น**: ตรวจสอบและโหลด cookies จากไฟล์ backup
2. **ทุก 30 นาที**: ตรวจสอบความถูกต้องของ cookies
3. **ตาม Cron Schedule**: Refresh cookies อัตโนมัติ (default: เที่ยงคืน)
4. **เมื่อ API ล้มเหลว**: ระบบจะพยายาม refresh cookies อัตโนมัติ

## ข้อดี
- ✅ ไม่มี downtime เมื่อเซิร์ฟเวอร์รีสตาร์ท
- ✅ กู้คืนอัตโนมัติจากไฟล์ backup
- ✅ ตรวจสอบและ refresh อัตโนมัติ
- ✅ API สำหรับ monitoring และ manual refresh
- ✅ เก็บ backup หลายชั้นป้องกันข้อมูลหาย