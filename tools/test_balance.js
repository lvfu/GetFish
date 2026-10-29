const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 820 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto((process.env.TEST_BASE || 'http://127.0.0.1:8123') + '/web-preview/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(900);
  await page.mouse.click(700, 410);
  await page.waitForTimeout(300);

  // 策略：钩子摆到接近某条鱼的方向时立刻出钩（模拟会玩的玩家）
  const t0 = Date.now();
  let shots = 0, prevScore = 0, timeline = [];
  while (Date.now() - t0 < 62000) {
    const st = await page.evaluate(() => ({
      mode: window.__GAME__.mode, angle: window.__GAME__.angle,
      score: window.__GAME__.score, time: window.__GAME__.time,
      fish: window.__GAME__.fish.map((f) => ({ x: f.x, y: f.y, s: f.size, v: f.value })),
    }));
    if (st.mode === 'levelend' || st.mode === 'over') break;
    if (st.mode === 'aim') {
      // 找一个角度最接近某条鱼的
      const ox = 640, oy = 112;
      let best = null;
      for (const f of st.fish) {
        const dx = f.x - ox, dy = f.y - oy;
        const a = Math.atan2(dx, dy);
        if (Math.abs(a) > 1.35) continue;
        const d = Math.hypot(dx, dy);
        const score = (f.v / (d + 1)) * 1000;
        if (!best || score > best.score) best = { a: a, score: score };
      }
      if (best && Math.abs(st.angle - best.a) < 0.07) {
        await page.mouse.click(700, 410);
        shots++;
      }
    }
    if (st.score !== prevScore) { timeline.push([Math.round(60 - st.time), st.score]); prevScore = st.score; }
    await page.waitForTimeout(60);
  }

  const fin = await page.evaluate(() => ({
    mode: window.__GAME__.mode, score: window.__GAME__.score, level: window.__GAME__.level,
    passed: window.__GAME__.levelPassed, time: Math.round(window.__GAME__.time),
  }));
  await page.screenshot({ path: 'delivery/qa/web-06-full-run.png' });
  console.log('shots=' + shots);
  console.log('timeline=' + JSON.stringify(timeline));
  console.log('final=' + JSON.stringify(fin));
  console.log('errors=' + JSON.stringify(errors));
  await browser.close();
})();
