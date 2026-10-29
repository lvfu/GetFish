// Headless-load the Cocos preview page and capture console output / exceptions via CDP.
const { spawn } = require('child_process');
const http = require('http');

const PREVIEW_URL = process.argv[2] || 'http://localhost:7456/';
const PORT = 9333;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

function getJson(path) {
    return new Promise((resolve, reject) => {
        http.get({ host: '127.0.0.1', port: PORT, path }, (res) => {
            let d = '';
            res.on('data', (c) => { d += c; });
            res.on('end', () => resolve(JSON.parse(d)));
        }).on('error', reject);
    });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
    const chrome = spawn(CHROME, [
        '--headless=new',
        `--remote-debugging-port=${PORT}`,
        '--no-first-run', '--no-default-browser-check',
        '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--user-data-dir=' + require('os').tmpdir() + '/cdp-zhuayu',
        '--window-size=1280,720',
        PREVIEW_URL,
    ], { stdio: 'ignore' });

    // wait for CDP
    let targets = null;
    for (let i = 0; i < 40; i++) {
        await sleep(500);
        try {
            targets = await getJson('/json');
            const page = targets.find((t) => t.type === 'page' && t.url.includes(new URL(PREVIEW_URL).host));
            if (page) break;
        } catch (e) { /* retry */ }
    }
    if (!targets) { console.error('CDP never came up'); chrome.kill(); process.exit(1); }
    const page = targets.find((t) => t.type === 'page' && t.url.includes(new URL(PREVIEW_URL).host));
    if (!page) { console.error('preview page not found', targets.map(t => t.url)); chrome.kill(); process.exit(1); }

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
        if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
        if (msg.method === 'Runtime.consoleAPICalled') {
            const args = msg.params.args.map((a) => a.value !== undefined ? a.value : (a.description || a.type)).join(' ');
            console.log(`[console.${msg.params.type}] ${args}`);
        } else if (msg.method === 'Runtime.exceptionThrown') {
            const d = msg.params.exceptionDetails;
            const txt = d.exception && d.exception.description ? d.exception.description : d.text;
            console.log(`[EXCEPTION] ${txt}`);
        } else if (msg.method === 'Log.entryAdded') {
            console.log(`[log.${msg.params.entry.level}] ${msg.params.entry.text}`);
        }
    };

    await new Promise((r) => { ws.onopen = r; });
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Page.enable');
    // Reload to catch early errors
    await send('Page.reload');

    // listen for 12 seconds (let assets load)
    await sleep(12000);

    // shim 预览器没有渲染循环，需要手动调 __shot__ 定格一帧
    const hasShot = await send('Runtime.evaluate', { expression: 'typeof window.__shot__ === "function"' });
    if (hasShot.result && hasShot.result.result && hasShot.result.result.value === true) {
        await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__shot__(0.2, {start: true, muted: true}))' });
        await sleep(500);
    } else {
        // click center to start the game, then wait for fish to spawn
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 640, y: 360, button: 'left', clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 640, y: 360, button: 'left', clickCount: 1 });
        await sleep(3000);
    }

    // also query game state + take screenshot
    const res = await send('Runtime.evaluate', { expression: 'JSON.stringify({scenes: cc && cc.director && cc.director.getScene() ? cc.director.getScene().children.map(c=>c.name) : null, running: cc && cc.game && cc.game.isPlaying})' });
    console.log('[state]', res.result && res.result.result && res.result.result.value);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    if (shot.result && shot.result.data) {
        require('fs').writeFileSync(require('path').join(__dirname, 'preview-check.png'), Buffer.from(shot.result.data, 'base64'));
        console.log('[screenshot] tools/preview-check.png');
    }
    ws.close();
    chrome.kill();
    process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
