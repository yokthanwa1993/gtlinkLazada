require('dotenv').config(); // 👈 โหลด .env

const puppeteer = require('puppeteer-core');
const fs = require('fs');

const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN;
const BROWSERLESS_HOST = process.env.BROWSERLESS_HOST || 'browserless.lslly.com';

if (!BROWSERLESS_TOKEN) {
  console.error('❌ ไม่พบ BROWSERLESS_TOKEN ใน environment variables');
  process.exit(1);
}

const BROWSERLESS_URL = `wss://${BROWSERLESS_TOKEN}@${BROWSERLESS_HOST}`;

(async () => {
  const browser = await puppeteer.connect({
    browserWSEndpoint: BROWSERLESS_URL
  });

  const page = await browser.newPage();

  const loginUrl = 'https://pages.lazada.co.th/wow/gcp/th/member/login-signup?redirect=https://adsense.lazada.co.th/index.htm';

  // ✅ ดึงจาก .env
  const userEmail = process.env.EMAIL;
  const userPassword = process.env.PASSWORD;

  console.log('🌐 เปิดหน้า Login Lazada...');
  await page.goto(loginUrl, {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  console.log('⌛ รอช่องกรอก...');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  try {
    // รอช่องกรอก login ถ้าไม่มีแสดงว่า login อยู่แล้ว
    await page.waitForSelector('input[placeholder="Please enter your Phone or Email"]', {
      visible: true,
      timeout: 10000
    });

    console.log('✍️ พบช่องกรอก - กรอกอีเมลและรหัสผ่าน...');
    await page.waitForSelector('input[placeholder="Please enter your password"]', { visible: true });

    await page.type('input[placeholder="Please enter your Phone or Email"]', userEmail, { delay: 50 });
    await page.type('input[placeholder="Please enter your password"]', userPassword, { delay: 50 });

    console.log('� กดปปุ่ม Login...');
    await page.click('div.iweb-button-mask');

    console.log('⏳ รอการ redirect หลัง login...');
    await page.waitForNavigation({
      waitUntil: 'networkidle2',
      timeout: 30000
    });

  } catch (error) {
    console.log('🔐 ไม่พบช่องกรอก login - น่าจะ login อยู่แล้ว');
  }



  console.log('🍪 บันทึก cookies...');
  const cookies = await page.cookies();

  // บันทึก cookies ในรูปแบบ JSON
  fs.writeFileSync('cookies.json', JSON.stringify(cookies, null, 2));
  console.log('✅ บันทึก cookies ลงในไฟล์ cookies.json เรียบร้อย');

  // สร้าง cookie string สำหรับใช้ใน HTTP header
  const cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
  
  // สำรอง backup ปัจจุบันไปเป็น emergency backup ก่อน
  if (fs.existsSync('cookies.backup.txt')) {
    const currentBackup = fs.readFileSync('cookies.backup.txt', 'utf8').trim();
    if (currentBackup) {
      fs.writeFileSync('cookies.emergency.txt', currentBackup);
      console.log('💾 สำรอง emergency backup เรียบร้อย');
    }
  }
  
  // บันทึกไฟล์หลัก
  fs.writeFileSync('cookies.txt', cookieString);
  console.log('✅ บันทึก cookie string ลงในไฟล์ cookies.txt เรียบร้อย');
  
  // สร้าง backup files หลายชั้น
  fs.writeFileSync('cookies.backup.txt', cookieString);
  fs.writeFileSync('cookies.persistent.txt', cookieString); // เพิ่ม persistent backup
  fs.writeFileSync(`cookies.${Date.now()}.txt`, cookieString);
  console.log('💾 สร้าง backup cookies หลายชั้น + persistent เรียบร้อย');

  console.log('🍪 Cookie String Preview:');
  console.log(cookieString.substring(0, 200) + '...');

  console.log('✅ Login เสร็จแล้ว - หยุดการทำงาน');

  // รอสักครู่เพื่อดูผลลัพธ์
  await new Promise(resolve => setTimeout(resolve, 3000));

  await browser.close();
})();
