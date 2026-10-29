// 横竖屏判定 + 锁竖屏兜底 的自动化验证
const { chromium } = require('playwright');

const BASE = process.env.TEST_BASE || 'http://127.0.0.1:8123';

(async () => {
  const errors = [];
  const failed = [];
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });

  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('requestfailed', (r) => failed.push(r.url() + ' :: ' + (r.failure() || {}).errorText));
  page.on('response', (r) => { if (r.status() >= 400) failed.push(r.status() + ' ' + r.url()); });

  const snap = () => page.evaluate(() => {
    const hint = document.getElementById('rotate-hint');
    const stage = document.getElementById('stage');
    const cv = document.getElementById('cv');
    const r = cv.getBoundingClientRect();
    return {
      vp: window.innerWidth + 'x' + window.innerHeight,
      hint: getComputedStyle(hint).display,
      stage: getComputedStyle(stage).display,
      cls: document.body.className,
      rot: !!(window.__VIEW__ && window.__VIEW__.rot),
      cvBox: [Math.round(r.width), Math.round(r.height)],
      cvCenter: [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)],
      mode: window.__GAME__.mode,
      princess: window.__GAME__.princess,
    };
  });

  const clickGame = async (gx, gy) => {
    const p = await page.evaluate(([x, y]) => window.__toScreen__(x, y), [gx, gy]);
    await page.mouse.click(p.x, p.y);
    return p;
  };

  await page.goto(BASE + '/web-preview/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(1200);

  // ---------- 1. 横屏：不该出现提示 ----------
  const land = await snap();
  await page.screenshot({ path: 'delivery/qa/orient-01-landscape.png' });
  await clickGame(640, 360);
  await page.waitForTimeout(500);
  const landAfter = await snap();

  // ---------- 2. 竖屏：提示出现 ----------
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(700);
  const port = await snap();
  const vpText = await page.textContent('#rotate-hint .vp');
  await page.screenshot({ path: 'delivery/qa/orient-02-portrait-hint.png' });

  // ---------- 3. 点"直接玩"：舞台转 90° ----------
  await page.click('#force-play');
  await page.waitForTimeout(600);
  const forced = await snap();
  const tf = await page.evaluate(() => document.getElementById('stage').style.transform);
  await page.screenshot({ path: 'delivery/qa/orient-03-portrait-forced.png' });

  // 旋转模式下点游戏中心，应该能正常出钩（说明坐标反算正确）
  const beforeMode = (await snap()).mode;
  const centerScreen = await page.evaluate(() => window.__toScreen__(640, 360));
  await clickGame(640, 360);
  await page.waitForTimeout(500);
  const forcedAfter = await snap();

  // 旋转模式下点头像换装（游戏坐标 → 屏幕坐标应落在头像上）
  const pickGX = 26 + 3 * (58 + 10) + 29;   // 第 4 个头像的中心
  const pick0 = await page.evaluate((gx) => window.__toScreen__(gx, 665), pickGX);
  const beforePick = (await snap()).princess;
  await clickGame(pickGX, 665);
  await page.waitForTimeout(400);
  const afterPick = await snap();
  await page.screenshot({ path: 'delivery/qa/orient-04-portrait-pick.png' });

  // ---------- 4. 转回横屏：兜底应自动解除 ----------
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(700);
  const back = await snap();
  await page.screenshot({ path: 'delivery/qa/orient-05-back-landscape.png' });

  console.log('LAND      ' + JSON.stringify(land));
  console.log('LAND-AFTER' + JSON.stringify(landAfter));
  console.log('PORT      ' + JSON.stringify(port) + '  vpText=' + JSON.stringify(vpText));
  console.log('FORCED    ' + JSON.stringify(forced) + '  transform=' + tf);
  console.log('FORCED-AFTER ' + JSON.stringify(forcedAfter) + '  centerScreen=' + JSON.stringify(centerScreen));
  console.log('AFTER-PICK ' + JSON.stringify(afterPick) + '  before=' + beforePick + '  pickScreen=' + JSON.stringify(pick0));
  console.log('BACK      ' + JSON.stringify(back));
  console.log('ERRORS=' + JSON.stringify(errors));
  console.log('FAILED=' + JSON.stringify(failed));
  await browser.close();
})();
