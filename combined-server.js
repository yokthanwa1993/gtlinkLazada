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

// ฟังก์ชันโหลด cookies
function loadCookiesFromFile() {
  try {
    const cookiesPath = path.join(__dirname, 'cookies.txt');
    const cookieString = fs.readFileSync(cookiesPath, 'utf8').trim();
    return cookieString;
  } catch (error) {
    return '';
  }
}

// ฟังก์ชันเรียก Lazada API
async function callLazadaAdsenseApi(jumpUrl, subIdTemplateKey = '') {
  const url = 'https://adsense.lazada.co.th/newOffer/link-convert.json';
  const cookieString = loadCookiesFromFile();
  
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
  });
}, {
  timezone: "Asia/Bangkok"
});

// รันทดสอบทันทีเมื่อเริ่มต้น (ถ้าต้องการ)
if (process.env.RUN_ON_START === 'true') {
  console.log('🚀 รันทดสอบทันที...');
  exec('node getcookiesLazada.js', (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ เกิดข้อผิดพลาด: ${error}`);
      return;
    }
    console.log(`✅ ทดสอบเสร็จ:\n${stdout}`);
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
  console.log(`🍪 Cookies จะ refresh อัตโนมัติตาม schedule`);
  console.log('✅ Scheduler + API พร้อมทำงาน');
});