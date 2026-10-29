/**
 * 最小 cc 运行时替身。
 *
 * 目的：在没有 Cocos 编辑器的情况下，把「真实的游戏脚本」跑起来，
 * 用 Canvas 2D 复刻 Graphics / Label / Sprite 的绘制结果，从而肉眼核对 Cocos 侧画面。
 *
 * 这里只实现脚本真正用到的那部分 API，语义对齐引擎：
 *  - Graphics 的 fill() / stroke() 会结束当前路径（引擎里是 impl.updatePathOffset = true）
 *  - 节点坐标 y 向上，原点是 Canvas 中心
 *  - 子节点后绘制（层级 = children 顺序）
 */

// ================= 基础数学 =================

export class Vec3 {
    constructor(x = 0, y = 0, z = 0) {
        this.x = x; this.y = y; this.z = z;
    }
}

export class Rect {
    constructor(x = 0, y = 0, w = 0, h = 0) {
        this.x = x; this.y = y; this.width = w; this.height = h;
    }
}

export class Size {
    constructor(w = 0, h = 0) {
        this.width = w; this.height = h;
    }
}

// ================= Color =================

export class Color {
    constructor(r = 255, g = 255, b = 255, a = 255) {
        this.r = r; this.g = g; this.b = b; this.a = a;
    }
    clone() {
        return new Color(this.r, this.g, this.b, this.a);
    }
    static copy(out, src) {
        out.r = src.r; out.g = src.g; out.b = src.b; out.a = src.a;
        return out;
    }
}

// ================= 组件 =================

export class Component {
    constructor() {
        this.node = null;
    }
}

/** Canvas 组件：预览器只用来做「有没有挂在 Canvas 下」的判断 */
export class Canvas extends Component { }

export class UITransform extends Component {
    constructor() {
        super();
        this.width = 100;
        this.height = 100;
        this.anchor = { x: 0.5, y: 0.5 };
    }
    setContentSize(w, h) {
        if (typeof w === 'object') {
            this.width = w.width;
            this.height = w.height;
        } else {
            this.width = w;
            this.height = h;
        }
    }
    setAnchorPoint(x, y) {
        this.anchor.x = x;
        this.anchor.y = y;
    }
    convertToNodeSpaceAR(v) {
        return new Vec3(v.x - 640, v.y - 360, 0);
    }
}

export class Graphics extends Component {
    constructor() {
        super();
        this.fillColor = new Color();
        this.strokeColor = new Color();
        this.lineWidth = 1;
        this.lineCap = 0;
        this.lineJoin = 0;
        this._ops = [];
        this._path = [];
    }
    clear() {
        this._ops.length = 0;
        this._path.length = 0;
    }
    moveTo(x, y) { this._path.push(['M', x, y]); }
    lineTo(x, y) { this._path.push(['L', x, y]); }
    quadraticCurveTo(cx, cy, x, y) { this._path.push(['Q', cx, cy, x, y]); }
    bezierCurveTo(a, b, c, d, x, y) { this._path.push(['C', a, b, c, d, x, y]); }
    close() { this._path.push(['Z']); }
    rect(x, y, w, h) { this._path.push(['R', x, y, w, h]); }
    roundRect(x, y, w, h, r) { this._path.push(['RR', x, y, w, h, r]); }
    circle(cx, cy, r) { this._path.push(['E', cx, cy, r, r]); }
    ellipse(cx, cy, rx, ry) { this._path.push(['E', cx, cy, rx, ry]); }
    fill() {
        this._ops.push({ t: 'fill', c: this.fillColor, p: this._path.slice() });
        this._path.length = 0;
    }
    stroke() {
        this._ops.push({
            t: 'stroke', c: this.strokeColor, w: this.lineWidth,
            cap: this.lineCap, join: this.lineJoin, p: this._path.slice(),
        });
        this._path.length = 0;
    }
}
Graphics.LineCap = { BUTT: 0, ROUND: 1, SQUARE: 2 };
Graphics.LineJoin = { MITER: 0, ROUND: 1, BEVEL: 2 };

export const HorizontalTextAlignment = { LEFT: 0, CENTER: 1, RIGHT: 2 };
export const VerticalTextAlignment = { TOP: 0, CENTER: 1, BOTTOM: 2 };

export class Label extends Component {
    constructor() {
        super();
        this.string = '';
        this.fontSize = 20;
        this.lineHeight = 26;
        this.color = new Color();
        this.isBold = false;
        this.horizontalAlign = HorizontalTextAlignment.LEFT;
        this.verticalAlign = VerticalTextAlignment.CENTER;
        this.overflow = 0;
    }
}
Label.HorizontalAlign = HorizontalTextAlignment;
Label.VerticalAlign = VerticalTextAlignment;
Label.Overflow = { NONE: 0, CLAMP: 1, SHRINK: 2, RESIZE_HEIGHT: 3 };

// ================= 资源 =================

export class Asset {
    constructor() {
        this.name = '';
    }
}

export class JsonAsset extends Asset {
    constructor() {
        super();
        this.json = null;
    }
}

export class AudioClip extends Asset { }

export class SpriteFrame extends Asset {
    constructor() {
        super();
        this._tex = null;
        this.rect = new Rect();
        this._orig = null;
    }
    get texture() { return this._tex; }
    set texture(v) {
        this._tex = v;
        this.image = v ? v.image : null;
    }
    get originalSize() { return this._orig; }
    set originalSize(s) { this._orig = s; }
}

export class Sprite extends Component {
    constructor() {
        super();
        this.spriteFrame = null;
        this.sizeMode = Sprite.SizeMode.TRIMMED;
        this.trim = true;
    }
}
Sprite.SizeMode = { CUSTOM: 0, TRIMMED: 1, RAW: 2 };
Sprite.Type = { SIMPLE: 0, SLICED: 1, TILED: 2, FILLED: 3 };

// ================= 音频 =================

export class AudioSource extends Component {
    constructor() {
        super();
        this.clip = null;
        this.loop = false;
        this.volume = 1;
        this.playOnAwake = true;
        this.playing = false;
    }
    play() { this.playing = true; }
    stop() { this.playing = false; }
    pause() { this.playing = false; }
    playOneShot() { /* 预览不发声 */ }
}

export const sys = {
    localStorage: {
        getItem(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
        setItem(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
    },
};

// ================= 节点 =================

export class Node {
    constructor(name = '') {
        this.name = name;
        this.children = [];
        this.parent = null;
        this.layer = 1 << 30;
        this.angle = 0;
        this.active = true;
        this._comps = [];
        this._pos = { x: 0, y: 0, z: 0 };
        this._scale = { x: 1, y: 1 };
    }
    addComponent(C) {
        const c = new C();
        c.node = this;
        this._comps.push(c);
        return c;
    }
    getComponent(C) {
        for (const c of this._comps) {
            if (c instanceof C) return c;
        }
        return null;
    }
    setParent(p) {
        if (this.parent) {
            const i = this.parent.children.indexOf(this);
            if (i >= 0) this.parent.children.splice(i, 1);
        }
        this.parent = p;
        if (p) p.children.push(this);
    }
    setPosition(x, y, z = 0) {
        this._pos.x = x;
        this._pos.y = y;
        this._pos.z = z;
    }
    get position() { return this._pos; }
    setScale(x, y = x, z = 1) {
        this._scale.x = x;
        this._scale.y = y;
    }
    get scale() { return this._scale; }
    setSiblingIndex(i) {
        const p = this.parent;
        if (!p) return;
        const idx = p.children.indexOf(this);
        if (idx < 0) return;
        p.children.splice(idx, 1);
        p.children.splice(Math.max(0, Math.min(i, p.children.length)), 0, this);
    }
    destroy() {
        if (this.parent) {
            const i = this.parent.children.indexOf(this);
            if (i >= 0) this.parent.children.splice(i, 1);
        }
        this.parent = null;
    }
}

// ================= 资源加载 =================

const BASE = '/game/assets/resources';
const IMG = new Map();

function loadImage(url) {
    if (IMG.has(url)) return IMG.get(url);
    const p = new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = () => rej(new Error('image fail: ' + url));
        im.src = url;
    });
    IMG.set(url, p);
    return p;
}

export const resources = {
    load(path, type, cb) {
        if (type === JsonAsset) {
            fetch(`${BASE}/${path}.json`)
                .then((r) => r.json())
                .then((j) => {
                    const a = new JsonAsset();
                    a.json = j;
                    cb(null, a);
                })
                .catch((e) => cb(e, null));
            return;
        }
        if (type === SpriteFrame) {
            const rel = path.replace(/\/spriteFrame$/, '');
            loadImage(`${BASE}/${rel}.png`)
                .then((img) => {
                    const sf = new SpriteFrame();
                    sf.texture = { image: img };
                    sf.rect = new Rect(0, 0, img.width, img.height);
                    sf.originalSize = new Size(img.width, img.height);
                    cb(null, sf);
                })
                .catch((e) => cb(e, null));
            return;
        }
        if (type === AudioClip) {
            cb(null, new AudioClip());
            return;
        }
        cb(new Error('unknown type'), null);
    },
};

// ================= 输入 / 视图 =================

export const Input = {
    EventType: {
        TOUCH_START: 'touch-start',
        MOUSE_DOWN: 'mouse-down',
        KEY_DOWN: 'key-down',
    },
};

export const input = {
    handlers: {},
    on(type, cb, target) {
        (this.handlers[type] = this.handlers[type] || []).push({ cb, target });
    },
    off(type, cb) {
        const arr = this.handlers[type] || [];
        const i = arr.findIndex((h) => h.cb === cb);
        if (i >= 0) arr.splice(i, 1);
    },
};

export class EventTouch { }
export class EventMouse { }
export class EventKeyboard { }

export const KeyCode = {
    SPACE: 32, ENTER: 13, KEY_M: 77,
    DIGIT_1: 49, DIGIT_2: 50, DIGIT_3: 51, DIGIT_4: 52,
    DIGIT_5: 53, DIGIT_6: 54, DIGIT_7: 55, DIGIT_8: 56,
};

export const ResolutionPolicy = { SHOW_ALL: 2, EXACT_FIT: 0, NO_BORDER: 1 };

export const view = {
    setDesignResolutionSize() { },
};

export const _decorator = {
    ccclass: () => (t) => t,
    property: () => () => { },
};

// ================= 便于预览器使用 =================

export const __preview = {
    /** 按名字找节点 */
    find(node, name) {
        if (node.name === name) return node;
        for (const c of node.children) {
            const r = this.find(c, name);
            if (r) return r;
        }
        return null;
    },
};
