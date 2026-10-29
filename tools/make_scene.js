/**
 * 生成 game/assets/scenes/main.scene。
 *
 * 以引擎自带的 2D 场景模板（Scene + Canvas + Camera）为底，把 GameRoot 挂到 Canvas 上，
 * 省掉「手工建场景 → 手工加 Canvas → 手工拖脚本」这三步。
 *
 * 场景里引用用户脚本要用「压缩 uuid」当 __type__，这里直接从 GameRoot.ts.meta 读 uuid
 * 再按引擎的算法压成 22 字符，最后用引擎的解码逻辑反向校验一遍。
 *
 * 用法：node tools/make_scene.js
 */
const fs = require('fs');
const path = require('path');

const TEMPLATE = 'C:/ProgramData/cocos/editors/Creator/3.8.8/resources/resources/3d/engine/editor/assets/default_file_content/scene/scene-2d.scene';
const ROOT = path.resolve(__dirname, '..');
const GAME = path.join(ROOT, 'game');
const OUT_DIR = path.join(GAME, 'assets/scenes');
const OUT = path.join(OUT_DIR, 'main.scene');
const SCRIPT_META = path.join(GAME, 'assets/scripts/GameRoot.ts.meta');

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const HEX = '0123456789abcdef';

/**
 * 32 位 hex → 23 字符压缩 uuid（引擎 compressUuid 的逆运算）。
 * 规则与 Cocos 3.x 一致：保留前 5 位 hex，其余 27 位 hex 每 3 位一组
 * （12 bit）编码成 2 个 base64 字符，共 18 个，5 + 18 = 23。
 */
function compressUuid(uuid) {
    const hex = uuid.replace(/-/g, '');
    if (hex.length !== 32) {
        throw new Error('uuid 长度不对: ' + uuid);
    }
    let out = hex.slice(0, 5);
    for (let i = 5; i < 32; i += 3) {
        const h1 = parseInt(hex[i], 16);
        const h2 = parseInt(hex[i + 1], 16);
        const h3 = parseInt(hex[i + 2], 16);
        const lhs = (h1 << 2) | (h2 >> 2);
        const rhs = ((h2 & 3) << 4) | h3;
        out += BASE64[lhs] + BASE64[rhs];
    }
    return out;
}

/** 引擎的 decompressUuid，用来反向校验 */
function decompressUuid(s) {
    if (s.length !== 23) {
        throw new Error('压缩 uuid 应为 23 字符: ' + s);
    }
    const values = {};
    for (let i = 0; i < 64; i++) {
        values[BASE64[i]] = i;
    }
    let hex = s.slice(0, 5);
    for (let i = 5; i < 23; i += 2) {
        const lhs = values[s[i]];
        const rhs = values[s[i + 1]];
        hex += HEX[lhs >> 2];
        hex += HEX[((lhs & 3) << 2) | (rhs >> 4)];
        hex += HEX[rhs & 0xf];
    }
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function shortId(len = 22) {
    let s = '';
    for (let i = 0; i < len; i++) {
        s += BASE64[Math.floor(Math.random() * 64)];
    }
    return s;
}

// ---- 1. 算脚本的压缩 uuid ----
const meta = JSON.parse(fs.readFileSync(SCRIPT_META, 'utf8'));
const scriptUuid = meta.uuid;
const typeId = compressUuid(scriptUuid);
if (decompressUuid(typeId) !== scriptUuid) {
    throw new Error(`压缩 uuid 校验失败：${scriptUuid} -> ${typeId} -> ${decompressUuid(typeId)}`);
}

// ---- 2. 以模板为底改 ----
const scene = JSON.parse(fs.readFileSync(TEMPLATE, 'utf8'));
const iScene = scene.findIndex((o) => o.__type__ === 'cc.Scene');
const iCanvas = scene.findIndex((o) => o.__type__ === 'cc.Node' && o._name === 'Canvas');
if (iCanvas < 0) {
    throw new Error('模板里没有 Canvas 节点');
}

scene[0]._name = 'main';
scene[iScene]._name = 'main';
scene[iScene]._id = 'a1b2c3d4-0000-4000-8000-000000000001';

// Canvas 按 1280×720 摆在屏幕中心（运行时 GameRoot 会再按 view 重算一次）
scene[iCanvas]._lpos.x = 640;
scene[iCanvas]._lpos.y = 360;
const canvasUi = scene[scene[iCanvas]._components[0].__id__];
if (canvasUi && canvasUi.__type__ === 'cc.UITransform') {
    canvasUi._contentSize = { __type__: 'cc.Size', width: 1280, height: 720 };
    canvasUi._anchorPoint = { __type__: 'cc.Vec2', x: 0.5, y: 0.5 };
}

// ---- 3. 挂 GameRoot ----
const compIdx = scene.length;
scene.push({
    __type__: typeId,
    _name: '',
    _objFlags: 0,
    node: { __id__: iCanvas },
    _enabled: true,
    __prefab: null,
    _id: shortId(),
});
scene[iCanvas]._components.push({ __id__: compIdx });

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(scene, null, 2));

console.log('script uuid   :', scriptUuid);
console.log('compressed    :', typeId, '(校验通过)');
console.log('wrote         :', path.relative(ROOT, OUT));
console.log('canvas comps  :', scene[iCanvas]._components.map((c) => scene[c.__id__].__type__).join(', '));
