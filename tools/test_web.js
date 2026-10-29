const { chromium } = require('playwright');

(async () => {
  const errors = [];
  const failed = [];
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 820 } });

  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('requestfailed', (r) => failed.push(r.url() + ' :: ' + (r.failure() || {}).errorText));
  page.on('response', (r) => { if (r.status() >= 400) failed.push(r.status() + ' ' + r.url()); });

  await page.goto((process.env.TEST_BASE || 'http://127.0.0.1:8123') + '/web-preview/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'delivery/qa/web-01-start.png' });

  await page.mouse.click(700, 410);
  await page.waitForTimeout(700);

  const s1 = await page.evaluate(() => ({
    mode: window.__GAME__.mode,
    fish: window.__GAME__.fish.length,
    types: window.__GAME__.fish.map((f) => f.type),
    ys: window.__GAME__.fish.map((f) => Math.round(f.y)),
  }));
  await page.screenshot({ path: 'delivery/qa/web-02-aim.png' });

  // 自动出钩：每次等钩子摆到目标角度附近再点，模拟真人
  let catches = 0;
  for (let i = 0; i < 40; i++) {
    const st = await page.evaluate(() => window.__GAME__.mode);
    if (st === 'aim') {
      await page.mouse.click(700, 410);
    }
    await page.waitForTimeout(320);
    const sc = await page.evaluate(() => window.__GAME__.score);
    if (sc > 0) catches = sc;
  }

  const s2 = await page.evaluate(() => ({
    mode: window.__GAME__.mode,
    score: window.__GAME__.score,
    time: Math.round(window.__GAME__.time),
    fish: window.__GAME__.fish.length,
  }));
  await page.screenshot({ path: 'delivery/qa/web-03-play.png' });

  // 让它跑到时间结束，验证关卡结算
  await page.evaluate(() => { window.__GAME__.time = 1.2; });
  await page.waitForTimeout(2000);
  const s3 = await page.evaluate(() => ({ mode: window.__GAME__.mode, passed: window.__GAME__.levelPassed }));
  await page.screenshot({ path: 'delivery/qa/web-04-levelend.png' });

  // 点击继续进入下一关
  await page.mouse.click(700, 410);
  await page.waitForTimeout(800);
  const s4 = await page.evaluate(() => ({ mode: window.__GAME__.mode, level: window.__GAME__.level, fish: window.__GAME__.fish.length }));
  await page.screenshot({ path: 'delivery/qa/web-05-next-level.png' });

  console.log('START ' + JSON.stringify(s1));
  console.log('PLAY  ' + JSON.stringify(s2));
  console.log('END   ' + JSON.stringify(s3));
  console.log('NEXT  ' + JSON.stringify(s4));
  console.log('ERRORS=' + JSON.stringify(errors));
  console.log('FAILED=' + JSON.stringify(failed));
  await browser.close();
})();
