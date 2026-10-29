// Capture N frames at interval from a page (for comparing hook swing).
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PREVIEW_URL = process.argv[2] || 'http://localhost:7456/';
const PREFIX = process.argv[3] || 'frame';
const SHOTS = 4;
const INTERVAL = 400;
const PORT = 9333;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

function getJson(p) {
    return new Promise((resolve, reject) => {
        http.get({ host: '127.0.0.1', port: PORT, path: p }, (res) => {
            let d = '';
            res.on('data', (c) => { d += c; });
            res.on('end', () => resolve(JSON.parse(d)));
        }).on('error', reject);
    });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
    const chrome = spawn(CHROME, [
        '--headless=new', `--remote-debugging-port=${PORT}`,
        '--no-first-run', '--no-default-browser-check',
        '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--user-data-dir=' + require('os').tmpdir() + '/cdp-zhuayu2',
        '--window-size=1280,720', PREVIEW_URL,
    ], { stdio: 'ignore' });

    let page = null;
    for (let i = 0; i < 40 && !page; i++) {
        await sleep(500);
        try {
            const targets = await getJson('/json');
            page = targets.find((t) => t.type === 'page' && t.url.includes(new URL(PREVIEW_URL).host));
        } catch (e) { }
    }
    if (!page) { console.error('page not found'); chrome.kill(); process.exit(1); }

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let id = 0;
    const pending = new Map();
    const send = (method, params = {}) => new Promise((resolve) => {
        const mid = ++id;
        pending.set(mid, resolve);
        ws.send(JSON.stringify({ id: mid, method, params }));
    });
    ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    };
    await new Promise((r) => { ws.onopen = r; });
    await send('Runtime.enable');
    await send('Page.enable');

    const isShim = await send('Runtime.evaluate', { expression: 'typeof window.__shot__ === "function"' });
    if (isShim.result.result.value === true) {
        // shim：从摆动最左扫到最右采样（swingOmega 1.5，半周期约 2.1s）
        await send('Runtime.evaluate', { expression: 'window.__shot__(0.2, {start: true, muted: true})' });
        for (let i = 0; i < SHOTS; i++) {
            await send('Runtime.evaluate', { expression: `window.__tick__(${(i * 0.35).toFixed(2)})` });
            const shot = await send('Page.captureScreenshot', { format: 'png' });
            fs.writeFileSync(path.join(__dirname, `${PREFIX}-${i}.png`), Buffer.from(shot.result.data, 'base64'));
        }
    } else {
        await sleep(12000);
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 640, y: 360, button: 'left', clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 640, y: 360, button: 'left', clickCount: 1 });
        for (let i = 0; i < SHOTS; i++) {
            await sleep(INTERVAL);
            const shot = await send('Page.captureScreenshot', { format: 'png' });
            fs.writeFileSync(path.join(__dirname, `${PREFIX}-${i}.png`), Buffer.from(shot.result.data, 'base64'));
        }
    }
    console.log('captured', SHOTS, 'frames as', PREFIX);
    ws.close();
    chrome.kill();
    process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
