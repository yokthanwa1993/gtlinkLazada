require('dotenv').config();
const http = require('http');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { exec } = require('child_process');

const PORT = process.env.PORT || 3000;

// อ่าน cron schedule จาก .env
const cronSchedule = process.env.CRON_SCHEDULE || '0 0 * * *'; // เที่ยงคืน

// ฟังก์ชันโหลด cookies พร้อมระบบ backup หลายชั้น + persistent storage
function loadCookiesFromFile() {
  const cookiesPath = path.join(__dirname, 'cookies.txt');
  const backupPath = path.join(__dirname, 'cookies.backup.txt');
  const emergencyBackupPath = path.join(__dirname, 'cookies.emergency.txt');
  const persistentPath = path.join(__dirname, 'cookies.persistent.txt');
  
  // รายการไฟล์ที่จะลองโหลดตามลำดับ (เพิ่ม persistent)
  const cookieFiles = [cookiesPath, backupPath, emergencyBackupPath, persistentPath];
  
  try {
    for (let i = 0; i < cookieFiles.length; i++) {
      const filePath = cookieFiles[i];
      
      if (fs.existsSync(filePath)) {
        const cookieString = fs.readFileSync(filePath, 'utf8').trim();
        if (cookieString && cookieString.length > 50) { // ตรวจสอบว่า cookies มีขนาดเหมาะสม
          const fileType = i === 0 ? 'หลัก' : i === 1 ? 'backup' : i === 2 ? 'emergency backup' : 'persistent';
          console.log(`✅ โหลด cookies จากไฟล์${fileType}`);
          
          // ถ้าไม่ใช่ไฟล์หลัก ให้คัดลอกกลับไปยังไฟล์หลัก
          if (i > 0) {
            fs.writeFileSync(cookiesPath, cookieString);
            console.log('🔄 คัดลอก cookies กลับไปยังไฟล์หลัก');
            
            // อัพเดท persistent file ด้วย
            fs.writeFileSync(persistentPath, cookieString);
            console.log('💾 อัพเดท persistent cookies');
          }
          
          return cookieString;
        }
      }
    }
    
    console.log('❌ ไม่พบ cookies ที่ใช้งานได้ในไฟล์ใดๆ');
    return '';
  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดในการโหลด cookies:', error.message);
    return '';
  }
}

// ฟังก์ชันสำรอง cookies หลายชั้น + persistent storage
function backupCookies() {
  try {
    const cookiesPath = path.join(__dirname, 'cookies.txt');
    const backupPath = path.join(__dirname, 'cookies.backup.txt');
    const emergencyBackupPath = path.join(__dirname, 'cookies.emergency.txt');
    const persistentPath = path.join(__dirname, 'cookies.persistent.txt');
    const timestampBackupPath = path.join(__dirname, `cookies.${Date.now()}.txt`);
    
    if (fs.existsSync(cookiesPath)) {
      const cookieString = fs.readFileSync(cookiesPath, 'utf8').trim();
      if (cookieString && cookieString.length > 50) {
        // สำรอง backup ปัจจุบันไปเป็น emergency backup
        if (fs.existsSync(backupPath)) {
          const currentBackup = fs.readFileSync(backupPath, 'utf8').trim();
          if (currentBackup) {
            fs.writeFileSync(emergencyBackupPath, currentBackup);
          }
        }
        
        // สร้าง backup ใหม่
        fs.writeFileSync(backupPath, cookieString);
        
        // สร้าง persistent backup (ไฟล์นี้จะไม่ถูกลบ)
        fs.writeFileSync(persistentPath, cookieString);
        
        // สร้าง timestamped backup (เก็บไว้ 5 ไฟล์ล่าสุด)
        fs.writeFileSync(timestampBackupPath, cookieString);
        cleanupOldBackups();
        
        console.log('💾 สำรอง cookies หลายชั้น + persistent เรียบร้อย');
      }
    }
  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดในการสำรอง cookies:', error.message);
  }
}

// ฟังก์ชันลบ backup เก่า
function cleanupOldBackups() {
  try {
    const files = fs.readdirSync(__dirname)
      .filter(file => file.match(/^cookies\.\d+\.txt$/))
      .map(file => ({
        name: file,
        time: parseInt(file.match(/cookies\.(\d+)\.txt/)[1])
      }))
      .sort((a, b) => b.time - a.time);
    
    // เก็บไว้แค่ 5 ไฟล์ล่าสุด (เพิ่มจาก 3 เป็น 5)
    if (files.length > 5) {
      files.slice(5).forEach(file => {
        fs.unlinkSync(path.join(__dirname, file.name));
      });
      console.log(`🧹 ลบ backup เก่า ${files.length - 5} ไฟล์`);
    }
  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดในการลบ backup เก่า:', error.message);
  }
}

// ฟังก์ชันเรียก Lazada API พร้อมระบบ auto-refresh cookies
async function callLazadaAdsenseApi(jumpUrl, subIdTemplateKey = '') {
  const url = 'https://adsense.lazada.co.th/newOffer/link-convert.json';
  let cookieString = loadCookiesFromFile();
  
  if (!cookieString) {
    throw new Error('ไม่พบ cookies - กรุณารัน getcookiesLazada.js ก่อน');
  }
  
  const headers = {
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'en-US,en;q=0.9,th;q=0.8,zh-CN;q=0.7,zh;q=0.6',
    'bx-v': '2.5.31',
    'content-type': 'application/json',
    'cookie': cookieString,
    'origin': 'https://adsense.lazada.co.th',
    'priority': 'u=1, i',
    'referer': 'https://adsense.lazada.co.th/index.htm',
    'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Opera";v="119"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 OPR/119.0.0.0'
  };

  const requestBody = {
    jumpUrl: jumpUrl,
    subIdTemplateKey: subIdTemplateKey
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(requestBody)
  });

  const responseText = await response.text();
  return JSON.parse(responseText);
}

// ตั้ง Cron สำหรับดึง cookies
console.log('🕐 Cookie Scheduler เริ่มทำงาน...');
console.log(`📅 Cron Schedule: ${cronSchedule}`);
console.log('⏰ ตามเวลาไทย (Asia/Bangkok)');

// ตรวจสอบ environment variables
if (!process.env.EMAIL || !process.env.PASSWORD) {
  console.error('❌ ไม่พบ EMAIL หรือ PASSWORD ใน environment variables');
  console.log('💡 กรุณาตั้งค่า EMAIL และ PASSWORD ใน CapRover App Configs');
}

cron.schedule(cronSchedule, () => {
  const now = new Date();
  console.log(`\n⏰ [${now.toISOString()}] เริ่มดึง cookies อัตโนมัติ...`);
  
  exec('node getcookiesLazada.js', (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ เกิดข้อผิดพลาด: ${error}`);
      return;
    }
    
    if (stderr) {
      console.error(`⚠️ Warning: ${stderr}`);
    }
    
    console.log(`✅ ผลลัพธ์:\n${stdout}`);
    console.log(`🎉 [${new Date().toISOString()}] ดึง cookies เสร็จแล้ว!`);
    
    // สำรอง cookies หลังจากดึงเสร็จ
    setTimeout(() => {
      backupCookies();
    }, 2000);
  });
}, {
  timezone: "Asia/Bangkok"
});

// ฟังก์ชันตรวจสอบความถูกต้องของ cookies
function validateCookies(cookieString) {
  if (!cookieString || cookieString.length < 50) {
    return false;
  }
  
  // ตรวจสอบว่ามี cookies สำคัญหรือไม่
  const requiredCookies = ['_tb_token_', 'lzd_cid', 'lzd_sid'];
  const hasRequiredCookies = requiredCookies.some(cookie => 
    cookieString.includes(cookie)
  );
  
  return hasRequiredCookies;
}

// ฟังก์ชันตรวจสอบและกู้คืน cookies เมื่อเริ่มต้น
function initializeCookies() {
  console.log('🔍 ตรวจสอบ cookies เมื่อเริ่มต้นเซิร์ฟเวอร์...');
  
  const initialCookies = loadCookiesFromFile();
  if (!initialCookies || !validateCookies(initialCookies)) {
    console.log('⚠️ ไม่พบ cookies ที่ใช้งานได้ - จะพยายามดึงใหม่ทันที');
    
    // ถ้าไม่มี cookies เลย ให้รันดึงทันที
    if (process.env.EMAIL && process.env.PASSWORD) {
      console.log('🚀 รันดึง cookies ทันทีเนื่องจากไม่พบ cookies ที่ใช้งานได้...');
      exec('node getcookiesLazada.js', (error, stdout, stderr) => {
        if (error) {
          console.error(`❌ เกิดข้อผิดพลาดในการดึง cookies: ${error}`);
          return;
        }
        console.log(`✅ ดึง cookies เสร็จ:\n${stdout}`);
        setTimeout(() => {
          backupCookies();
        }, 2000);
      });
    } else {
      console.log('❌ ไม่สามารถดึง cookies ได้ - ไม่พบ EMAIL หรือ PASSWORD');
    }
  } else {
    console.log('✅ พบ cookies ที่ใช้งานได้');
    console.log(`📊 ขนาด cookies: ${initialCookies.length} ตัวอักษร`);
    
    // สำรอง cookies ที่มีอยู่
    backupCookies();
    
    // ตรวจสอบอายุของ cookies (ถ้าเก่ากว่า 12 ชั่วโมง ให้ refresh)
    const cookiesPath = path.join(__dirname, 'cookies.txt');
    if (fs.existsSync(cookiesPath)) {
      const stats = fs.statSync(cookiesPath);
      const hoursOld = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
      
      if (hoursOld > 12) {
        console.log(`⏰ Cookies เก่า ${hoursOld.toFixed(1)} ชั่วโมงแล้ว - จะ refresh ในรอบถัดไป`);
      } else {
        console.log(`🕐 Cookies ยังใหม่ (${hoursOld.toFixed(1)} ชั่วโมง)`);
      }
    }
  }
}

// ฟังก์ชันตรวจสอบ cookies แบบ periodic
function startCookieHealthCheck() {
  setInterval(() => {
    const cookies = loadCookiesFromFile();
    if (!cookies || !validateCookies(cookies)) {
      console.log('⚠️ ตรวจพบ cookies ไม่ถูกต้อง - จะพยายาม refresh');
      
      if (process.env.EMAIL && process.env.PASSWORD) {
        exec('node getcookiesLazada.js', (error, stdout, stderr) => {
          if (error) {
            console.error(`❌ Auto-refresh cookies ล้มเหลว: ${error}`);
            return;
          }
          console.log(`✅ Auto-refresh cookies สำเร็จ`);
          setTimeout(() => {
            backupCookies();
          }, 2000);
        });
      }
    }
  }, 30 * 60 * 1000); // ตรวจสอบทุก 30 นาที
}

// เรียกใช้ฟังก์ชันตรวจสอบ cookies เมื่อเริ่มต้น
initializeCookies();

// เริ่ม health check
startCookieHealthCheck();

// รันทดสอบทันทีเมื่อเริ่มต้น (ถ้าต้องการ)
if (process.env.RUN_ON_START === 'true') {
  console.log('🚀 รันทดสอบทันที...');
  exec('node getcookiesLazada.js', (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ เกิดข้อผิดพลาด: ${error}`);
      return;
    }
    console.log(`✅ ทดสอบเสร็จ:\n${stdout}`);
    // สำรอง cookies หลังจากดึงเสร็จ
    setTimeout(() => {
      backupCookies();
    }, 2000);
  });
}

// สร้าง HTTP Server สำหรับ API
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  
  if (req.method === 'GET' && url.pathname === '/api/v1') {
    // API สำหรับแปลง link
    try {
      const jumpUrl = url.searchParams.get('link');
      const subIdTemplateKey = url.searchParams.get('subId') || '';
      
      if (!jumpUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ 
          success: false, 
          error: 'link parameter is required',
          example: '/api/v1?link=https://pages.lazada.co.th/...'
        }));
        return;
      }
      
      console.log(`🔗 [${new Date().toISOString()}] แปลง link: ${jumpUrl}`);
      
      const result = await callLazadaAdsenseApi(jumpUrl, subIdTemplateKey);
      
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: true,
        data: result,
        originalUrl: jumpUrl,
        timestamp: new Date().toISOString()
      }));
      
    } catch (error) {
      console.error(`❌ เกิดข้อผิดพลาด: ${error.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ 
        success: false, 
        error: error.message,
        timestamp: new Date().toISOString()
      }));
    }
    
  } else if (req.method === 'GET' && url.pathname === '/api/v1/cookies/status') {
    // ตรวจสอบสถานะ cookies
    try {
      const cookies = loadCookiesFromFile();
      const isValid = validateCookies(cookies);
      
      let cookieAge = 'unknown';
      const cookiesPath = path.join(__dirname, 'cookies.txt');
      if (fs.existsSync(cookiesPath)) {
        const stats = fs.statSync(cookiesPath);
        const hoursOld = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
        cookieAge = `${hoursOld.toFixed(1)} hours`;
      }
      
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: true,
        cookiesValid: isValid,
        cookiesLength: cookies ? cookies.length : 0,
        cookieAge: cookieAge,
        backupFiles: {
          main: fs.existsSync(path.join(__dirname, 'cookies.txt')),
          backup: fs.existsSync(path.join(__dirname, 'cookies.backup.txt')),
          emergency: fs.existsSync(path.join(__dirname, 'cookies.emergency.txt')),
          persistent: fs.existsSync(path.join(__dirname, 'cookies.persistent.txt'))
        },
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ 
        success: false, 
        error: error.message 
      }));
    }
    
  } else if (req.method === 'POST' && url.pathname === '/api/v1/cookies/refresh') {
    // Force refresh cookies
    try {
      if (!process.env.EMAIL || !process.env.PASSWORD) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ 
          success: false, 
          error: 'EMAIL และ PASSWORD ไม่ได้ตั้งค่าใน environment variables' 
        }));
        return;
      }
      
      console.log('🔄 Force refresh cookies ผ่าน API...');
      
      exec('node getcookiesLazada.js', (error, stdout, stderr) => {
        if (error) {
          console.error(`❌ Force refresh ล้มเหลว: ${error}`);
          return;
        }
        console.log(`✅ Force refresh สำเร็จ:\n${stdout}`);
        setTimeout(() => {
          backupCookies();
        }, 2000);
      });
      
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: true,
        message: 'เริ่มการ refresh cookies แล้ว',
        timestamp: new Date().toISOString()
      }));
      
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ 
        success: false, 
        error: error.message 
      }));
    }
    
  } else if (req.method === 'GET' && (url.pathname === '/api/v1/health' || url.pathname === '/health' || url.pathname === '/')) {
    // Health check (รองรับทั้ง /health และ /api/v1/health)
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    
  } else {
    // 404
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ 
      success: false,
      error: 'Endpoint not found' 
    }));
  }
});

// Handle process signals
process.on('SIGTERM', () => {
  console.log('📴 Received SIGTERM, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('📴 Received SIGINT, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Combined Server รันที่ http://0.0.0.0:${PORT}`);
  console.log(`📡 API: GET /api/v1?link=[URL]`);
  console.log(`❤️ Health: GET /api/v1/health`);
  console.log(`🍪 Cookie Status: GET /api/v1/cookies/status`);
  console.log(`🔄 Force Refresh: POST /api/v1/cookies/refresh`);
  console.log(`🍪 Cookies จะ refresh อัตโนมัติตาม schedule + health check ทุก 30 นาที`);
  console.log('✅ Scheduler + API + Auto-Recovery พร้อมทำงาน');
});