/**
 * 小红书登录状态检查脚本
 * 功能：检查登录态、生成二维码、保存cookies
 * 用法：node scripts/check-xiaohongshu-login.js
 * 依赖：playwright（已内置）
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const configDir = path.join(__dirname, '../config');
const cookiesPath = path.join(configDir, 'xiaohongshu-cookies.json');
const extensionPath = path.join(__dirname, '../extension/xiaohongshu');
const screenshotDir = path.join(__dirname, '../output/publish-screenshots');

// 确保目录存在
[configDir, screenshotDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

async function main() {
  console.log('📱 小红书登录状态检查...');
  
  const browser = await chromium.launch({
    headless: false,
    args: [`--load-extension=${extensionPath}`]
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // 检查已有cookies
    if (fs.existsSync(cookiesPath)) {
      const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
      await context.addCookies(cookies);
      await page.goto('https://creator.xiaohongshu.com', { waitUntil: 'networkidle' });
      
      const avatar = await page.$('.user-avatar');
      if (avatar) {
        console.log('✅ 登录态有效，无需重新扫码');
        await browser.close();
        return;
      }
    }
    
    // 需要扫码登录
    console.log('⚠️ 登录态无效，开始生成二维码...');
    await page.goto('https://creator.xiaohongshu.com', { waitUntil: 'networkidle' });
    
    const qrImg = await page.$('.qrcode-img');
    if (!qrImg) throw new Error('❌ 未找到二维码元素');
    
    const qrPath = path.join(screenshotDir, `qrcode_${Date.now()}.png`);
    await qrImg.screenshot({ path: qrPath });
    console.log(`📱 请扫码登录，二维码已保存：${qrPath}`);
    
    // 等待登录完成
    await page.waitForSelector('.user-avatar', { timeout: 60000 });
    const cookies = await context.cookies();
    fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
    console.log('✅ 登录成功，cookies已保存至config/xiaohongshu-cookies.json');
    
  } catch (err) {
    console.error('❌ 登录检查失败：', err.message);
    await page.screenshot({ path: path.join(screenshotDir, 'login-error.png') });
  } finally {
    await browser.close();
  }
}

main();
