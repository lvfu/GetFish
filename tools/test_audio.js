// 背景音乐 / 声音开关 的自动化验证
const { chromium } = require('playwright');

const BASE = process.env.TEST_BASE || 'http://127.0.0.1:8123';

(async () => {
  const errors = [];
  const failed = [];
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('requestfailed', (r) => failed.push(r.url() + ' :: ' + (r.failure() || {}).errorText));

  await page.goto(BASE + '/web-preview/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(600);

  const before = await page.evaluate(() => window.__AUDIO__());

  // 第一次点击：既开局，也应该把音乐拉起来
  await page.mouse.click(640, 400);
  await page.waitForTimeout(1500);
  const afterClick = await page.evaluate(() => window.__AUDIO__());

  // 等 2 秒，看音符调度是否在推进
  await page.waitForTimeout(2000);
  const later = await page.evaluate(() => window.__AUDIO__());
  const advanced = later.step - afterClick.step;

  // 点右上角喇叭：应静音
  const sndPos = await page.evaluate(() => window.__toScreen__(1280 - 50, 110));
  await page.mouse.click(sndPos.x, sndPos.y);
  await page.waitForTimeout(400);
  const muted = await page.evaluate(() => window.__AUDIO__());
  await page.screenshot({ path: 'delivery/qa/audio-01-muted.png' });

  // 再点一次：恢复
  await page.mouse.click(sndPos.x, sndPos.y);
  await page.waitForTimeout(400);
  const unmuted = await page.evaluate(() => window.__AUDIO__());
  await page.screenshot({ path: 'delivery/qa/audio-02-on.png' });

  // 静音状态要能记住
  await page.mouse.click(sndPos.x, sndPos.y);
  await page.waitForTimeout(200);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(500);
  const afterReload = await page.evaluate(() => ({
    audio: window.__AUDIO__(),
    ls: localStorage.getItem('yh_sound'),
  }));

  console.log('BEFORE   ' + JSON.stringify(before));
  console.log('CLICK    ' + JSON.stringify(afterClick));
  console.log('LATER    ' + JSON.stringify(later) + '  advancedSteps=' + advanced);
  console.log('MUTED    ' + JSON.stringify(muted));
  console.log('UNMUTED  ' + JSON.stringify(unmuted));
  console.log('RELOAD   ' + JSON.stringify(afterReload));
  console.log('ERRORS=' + JSON.stringify(errors));
  console.log('FAILED=' + JSON.stringify(failed));
  await browser.close();
})();
