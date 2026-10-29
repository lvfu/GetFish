const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 820 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto((process.env.TEST_BASE || 'http://127.0.0.1:8123') + '/web-preview/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  await page.mouse.click(700, 430);   // 开始
  await page.waitForTimeout(500);

  const keys = await page.evaluate(() => Object.keys(window.PRINCESS_CONFIG));

  // 逐个切换角色并截图，验证 8 套素材都能正确挂到竿尖
  for (let i = 0; i < keys.length; i++) {
    await page.keyboard.press(String(i + 1));
    await page.waitForTimeout(280);
    const st = await page.evaluate(() => ({
      p: window.__GAME__.princess,
      ox: Math.round(window.__GAME__.origin.x),
      oy: Math.round(window.__GAME__.origin.y),
    }));
    console.log(i + 1, st.p, 'pivot', st.ox, st.oy);
    if (i === 2 || i === 6) {
      await page.screenshot({ path: `delivery/qa/web-p-${i + 1}.png` });
    }
  }

  // 再切回 1 号并出钩，验证换装后玩法仍正常
  await page.keyboard.press('1');
  await page.waitForTimeout(200);
  for (let i = 0; i < 5; i++) {
    await page.mouse.click(700, 430);
    await page.waitForTimeout(900);
  }
  const s = await page.evaluate(() => ({ score: window.__GAME__.score, mode: window.__GAME__.mode }));
  await page.screenshot({ path: 'delivery/qa/web-p-final.png' });
  console.log('after switch + play:', JSON.stringify(s));
  console.log('errors:', JSON.stringify(errors));
  await browser.close();
})();
