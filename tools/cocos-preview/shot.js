/**
 * 用无头浏览器把 Cocos 预览页截图，输出到 delivery/qa/。
 * 用法：node tools/cocos-preview/shot.js
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT = path.resolve(__dirname, '../../delivery/qa');
const BASE = process.env.PREVIEW_BASE || 'http://127.0.0.1:8125';

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    page.on('requestfailed', (r) => errors.push('reqfail: ' + r.url()));

    await page.goto(`${BASE}/tools/cocos-preview/index.html`, { waitUntil: 'load' });
    await page.waitForFunction('window.__ready__ === true', { timeout: 15000 });

    const shots = [
        { name: 'cocos-01-open', args: [0.30, { overlay: true }] },
        { name: 'cocos-02-morning', args: [0.16, { start: true }] },
        { name: 'cocos-03-noon', args: [0.32, {}] },
        { name: 'cocos-04-dusk', args: [0.49, {}] },
        { name: 'cocos-05-night', args: [0.72, { muted: true }] },
        { name: 'cocos-06-dawn', args: [0.03, { princess: 3 }] },
        { name: 'cocos-07-levelend', args: [0.55, { overlay: true }] },
    ];

    const info = [];
    for (const s of shots) {
        const r = await page.evaluate(
            ([a, b]) => window.__shot__(a, b),
            [s.args[0], s.args[1] || {}],
        );
        await page.waitForTimeout(120);
        await page.screenshot({ path: path.join(OUT, s.name + '.png') });
        info.push({ shot: s.name, ...r });
    }

    // 让游戏跑一会儿，看鱼群动起来后的画面
    const t = await page.evaluate(() => window.__tick__(6));
    await page.screenshot({ path: path.join(OUT, 'cocos-08-play.png') });

    console.log(JSON.stringify({ info, tick: t, errors }, null, 2));
    await browser.close();
})().catch((e) => {
    console.error('FAIL', e);
    process.exit(1);
});
