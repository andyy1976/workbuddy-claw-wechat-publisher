/**
 * 小红书图文发布脚本（参考郭震xiaohongshu-skills案例）
 * 功能：自动登录、预填图文内容、修复页面元素点击问题
 * 用法：node scripts/publish-xiaohongshu.js [contentId]
 * 依赖：playwright（已内置在package.json）
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// 配置路径
const configDir = path.join(__dirname, '../config');
const cookiesPath = path.join(configDir, 'xiaohongshu-cookies.json');
const extensionPath = path.join(__dirname, '../extension/xiaohongshu'); // 需从xiaohongshu-skills提取扩展目录
const contentDir = path.join(__dirname, '../output/content');
const screenshotDir = path.join(__dirname, '../output/publish-screenshots');

// 确保目录存在
[configDir, screenshotDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// 过滤有效元素（参考郭震修复逻辑）
function isElementVisible(element) {
  return element.boundingBox().then(box => {
    if (!box) return false;
    // 检查是否在视口内
    if (box.x < 0 || box.y < 0) return false;
    // 检查透明度（通过computed style）
    return element.evaluate(el => {
      const style = window.getComputedStyle(el);
      const opacity = parseFloat(style.opacity);
      const zIndex = parseInt(style.zIndex) || 0;
      return opacity >= 0.1 && zIndex >= 0;
    });
  });
}

// 检查登录状态
async function checkLogin(page) {
  if (fs.existsSync(cookiesPath)) {
    const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
    await page.context().addCookies(cookies);
    await page.goto('https://creator.xiaohongshu.com', { waitUntil: 'networkidle' });
    const isLoggedIn = await page.$('.user-avatar');
    if (isLoggedIn) {
      console.log('✅ 小红书登录态有效');
      return true;
    }
  }
  return false;
}

// 扫码登录
async function loginWithQR(page) {
  await page.goto('https://creator.xiaohongshu.com', { waitUntil: 'networkidle' });
  const qrCode = await page.$('.qrcode-img');
  if (!qrCode) throw new Error('❌ 未找到二维码');
  
  // 保存二维码截图
  const qrPath = path.join(screenshotDir, 'qrcode.png');
  await qrCode.screenshot({ path: qrPath });
  console.log(`📱 请扫码登录，二维码已保存：${qrPath}`);
  
  // 等待登录完成
  await page.waitForSelector('.user-avatar', { timeout: 60000 });
  const cookies = await page.context().cookies();
  fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
  console.log('✅ 登录成功，cookies已保存');
}

// 点击上传图文Tab（修复版）
async function clickUploadTab(page) {
  const tabs = await page.$$('text="上传图文"');
  for (const tab of tabs) {
    const isVisible = await isElementVisible(tab);
    if (isVisible) {
      await tab.click();
      console.log('✅ 成功点击「上传图文」Tab');
      return true;
    }
  }
  throw new Error('❌ 未找到有效的「上传图文」Tab');
}

// 预填内容
async function fillContent(page, contentId) {
  const contentPath = path.join(contentDir, `${contentId}.json`);
  if (!fs.existsSync(contentPath)) {
    throw new Error(`❌ 内容不存在：${contentPath}，请先执行content-create命令`);
  }
  const content = JSON.parse(fs.readFileSync(contentPath, 'utf8'));
  
  // 上传封面图
  const coverInput = await page.$('input[type="file"]');
  await coverInput.setInputFiles(path.join(contentDir, content.coverImage));
  
  // 填写标题
  await page.fill('input[placeholder="填写标题会有更多赞哦~"]', content.title);
  
  // 填写正文
  await page.fill('.ql-editor', content.body);
  
  // 添加话题标签
  for (const tag of content.tags) {
    await page.click('text="添加话题"');
    await page.fill('input[placeholder="搜索话题"]', tag);
    await page.keyboard.press('Enter');
  }
  
  // 设置为仅自己可见
  await page.click('text="公开"');
  await page.click('text="仅自己可见"');
  
  console.log('✅ 内容预填完成');
}

// 主函数
async function main() {
  const contentId = process.argv[2];
  if (!contentId) {
    console.error('❌ 请指定内容ID：node scripts/publish-xiaohongshu.js [contentId]');
    process.exit(1);
  }
  
  // 启动浏览器（加载扩展）
  const browser = await chromium.launch({
    headless: false,
    args: [`--load-extension=${extensionPath}`] // 需提前将xiaohongshu-skills的extension目录复制到此处
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // 检查登录
    const isLoggedIn = await checkLogin(page);
    if (!isLoggedIn) await loginWithQR(page);
    
    // 导航到发布页
    await page.goto('https://creator.xiaohongshu.com/publish/publish', { waitUntil: 'networkidle' });
    
    // 点击上传图文Tab
    await clickUploadTab(page);
    
    // 预填内容
    await fillContent(page, contentId);
    
    // 截图保存
    const screenshotPath = path.join(screenshotDir, `prefill_${contentId}_${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 预填截图已保存：${screenshotPath}`);
    console.log('⏳ 请检查内容，点击页面「发布」按钮完成发布');
    
    // 保持浏览器打开，等待用户操作
    await new Promise(resolve => {});
  } catch (err) {
    console.error('❌ 发布失败：', err.message);
    await page.screenshot({ path: path.join(screenshotDir, 'error.png') });
  } finally {
    // 注意：不会自动关闭浏览器，需用户手动关闭
  }
}

main();
