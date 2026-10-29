const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 820 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto((process.env.TEST_BASE || 'http://127.0.0.1:8123') + '/web-preview/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await page.mouse.click(700, 410);   // 开始
  await page.waitForTimeout(300);

  // 人为满足过关条件
  await page.evaluate(() => { window.__GAME__.score = 720; window.__GAME__.time = 0.8; });
  await page.waitForTimeout(1500);
  const end = await page.evaluate(() => ({
    mode: window.__GAME__.mode, passed: window.__GAME__.levelPassed, score: window.__GAME__.score,
  }));
  await page.screenshot({ path: 'delivery/qa/web-07-pass.png' });

  // 点击进入下一关
  await page.mouse.click(700, 410);
  await page.waitForTimeout(700);
  const next = await page.evaluate(() => ({
    mode: window.__GAME__.mode, level: window.__GAME__.level, score: window.__GAME__.score,
    time: Math.round(window.__GAME__.time), fish: window.__GAME__.fish.length,
    target: 600 + (window.__GAME__.level - 1) * 280,
  }));
  await page.screenshot({ path: 'delivery/qa/web-08-level2.png' });

  // 失败路径
  await page.evaluate(() => { window.__GAME__.score = 0; window.__GAME__.time = 0.6; });
  await page.waitForTimeout(1200);
  const fail = await page.evaluate(() => ({ mode: window.__GAME__.mode, passed: window.__GAME__.levelPassed }));
  await page.mouse.click(700, 410);
  await page.waitForTimeout(600);
  const restart = await page.evaluate(() => ({ mode: window.__GAME__.mode, level: window.__GAME__.level, score: window.__GAME__.score }));

  console.log('END     ' + JSON.stringify(end));
  console.log('NEXT    ' + JSON.stringify(next));
  console.log('FAIL    ' + JSON.stringify(fail));
  console.log('RESTART ' + JSON.stringify(restart));
  console.log('ERRORS  ' + JSON.stringify(errors));
  await browser.close();
})();
