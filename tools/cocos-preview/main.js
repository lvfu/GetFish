/**
 * Cocos 画面预览器。
 *
 * 直接实例化真实的 GameRoot（由 game/assets/scripts 编译而来），
 * 用 Canvas 2D 把节点树里的 Graphics / Label / Sprite 画出来，
 * 用来在没有编辑器的情况下核对 Cocos 侧的画面。
 */
import {
    Node, UITransform, Graphics, Label, Sprite, Canvas, HorizontalTextAlignment,
} from 'cc';
import { GameRoot } from './out/GameRoot.js';
import { DAY_LEN } from './out/DayNight.js';

const W = 1280;
const H = 720;

const cv = document.getElementById('stage');
cv.width = W;
cv.height = H;
const ctx = cv.getContext('2d');

// ================= 坐标变换 =================
// 节点坐标：原点在 Canvas 中心，y 向上；屏幕坐标：y 向下。
// 点 (lx, ly) 在绕 z 轴逆时针转 a 度后的屏幕位置：

function makeXf(wx, wy, deg, sx = 1, sy = 1) {
    const r = (deg * Math.PI) / 180;
    const c = Math.cos(r);
    const s = Math.sin(r);
    const tx = W / 2 + wx;
    const ty = H / 2 - wy;
    return (lx0, ly0) => {
        const lx = lx0 * sx;
        const ly = ly0 * sy;
        return [tx + lx * c - ly * s, ty - (lx * s + ly * c)];
    };
}

function cssColor(c) {
    if (!c) return '#000';
    return `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${(c.a === undefined ? 255 : c.a) / 255})`;
}

// ================= 路径 =================

function addEllipse(pts, cx, cy, rx, ry, n = 56) {
    for (let i = 0; i <= n; i++) {
        const t = (i / n) * Math.PI * 2;
        pts.push([cx + Math.cos(t) * rx, cy + Math.sin(t) * ry]);
    }
}

function addRoundRect(pts, x, y, w, h, r) {
    const rr = Math.min(r, Math.min(w, h) / 2);
    const arc = (cx, cy, a0, a1) => {
        for (let i = 0; i <= 5; i++) {
            const t = a0 + ((a1 - a0) * i) / 5;
            pts.push([cx + Math.cos(t) * rr, cy + Math.sin(t) * rr]);
        }
    };
    // 局部坐标 y 向上，(x,y) 是左下角
    arc(x + rr, y + rr, Math.PI, Math.PI * 1.5);
    arc(x + w - rr, y + rr, Math.PI * 1.5, Math.PI * 2);
    arc(x + w - rr, y + h - rr, 0, Math.PI * 0.5);
    arc(x + rr, y + h - rr, Math.PI * 0.5, Math.PI);
}

function buildPath(p, T) {
    ctx.beginPath();
    let started = false;
    const line = (lx, ly) => {
        const [sx, sy] = T(lx, ly);
        if (!started) {
            ctx.moveTo(sx, sy);
            started = true;
        } else {
            ctx.lineTo(sx, sy);
        }
    };
    const poly = (pts) => {
        for (let i = 0; i < pts.length; i++) line(pts[i][0], pts[i][1]);
    };
    for (const c of p) {
        switch (c[0]) {
            case 'M':
                started = false;
                line(c[1], c[2]);
                break;
            case 'L':
                line(c[1], c[2]);
                break;
            case 'Q': {
                const [x0, y0] = T(c[1], c[2]);
                const [x1, y1] = T(c[3], c[4]);
                ctx.quadraticCurveTo(x0, y0, x1, y1);
                break;
            }
            case 'C': {
                const [x0, y0] = T(c[1], c[2]);
                const [x1, y1] = T(c[3], c[4]);
                const [x2, y2] = T(c[5], c[6]);
                ctx.bezierCurveTo(x0, y0, x1, y1, x2, y2);
                break;
            }
            case 'Z':
                ctx.closePath();
                break;
            case 'R':
                poly([
                    [c[1], c[2]], [c[1] + c[3], c[2]],
                    [c[1] + c[3], c[2] + c[4]], [c[1], c[2] + c[4]],
                ]);
                ctx.closePath();
                break;
            case 'RR': {
                const pts = [];
                addRoundRect(pts, c[1], c[2], c[3], c[4], c[5]);
                poly(pts);
                ctx.closePath();
                break;
            }
            case 'E': {
                const pts = [];
                addEllipse(pts, c[1], c[2], c[3], c[4]);
                poly(pts);
                ctx.closePath();
                break;
            }
            default:
                break;
        }
    }
}

// ================= 绘制 =================

function paintGraphics(g, wx, wy, deg, sx, sy) {
    const T = makeXf(wx, wy, deg, sx, sy);
    for (const op of g._ops) {
        buildPath(op.p, T);
        if (op.t === 'fill') {
            ctx.fillStyle = cssColor(op.c);
            ctx.fill();
        } else {
            ctx.strokeStyle = cssColor(op.c);
            ctx.lineWidth = op.w || 1;
            ctx.lineCap = op.cap === 1 ? 'round' : (op.cap === 2 ? 'square' : 'butt');
            ctx.lineJoin = op.join === 1 ? 'round' : (op.join === 2 ? 'bevel' : 'miter');
            ctx.stroke();
        }
    }
}

function paintLabel(l, node, wx, wy, deg) {
    const ut = node.getComponent(UITransform);
    const ax = ut ? ut.anchor.x : 0.5;
    ctx.save();
    ctx.translate(W / 2 + wx, H / 2 - wy);
    ctx.rotate((-deg * Math.PI) / 180);
    ctx.fillStyle = cssColor(l.color);
    ctx.font = `${l.isBold ? 'bold ' : ''}${l.fontSize}px "Microsoft YaHei", "PingFang SC", system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = ax === 0 ? 'left' : (ax === 1 ? 'right' : 'center');
    const lines = String(l.string).split('\n');
    const lh = l.lineHeight || l.fontSize + 4;
    const total = lh * lines.length;
    for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], 0, -total / 2 + lh / 2 + i * lh);
    }
    ctx.restore();
}

function paintSprite(s, node, wx, wy, deg, sx, sy) {
    const sf = s.spriteFrame;
    if (!sf || !sf.image) return;
    const ut = node.getComponent(UITransform);
    const w = ut ? ut.width : sf.rect.width;
    const h = ut ? ut.height : sf.rect.height;
    const ax = ut ? ut.anchor.x : 0.5;
    const ay = ut ? ut.anchor.y : 0.5;
    ctx.save();
    ctx.translate(W / 2 + wx, H / 2 - wy);
    ctx.rotate((-deg * Math.PI) / 180);
    ctx.scale(sx, sy);
    ctx.drawImage(
        sf.image,
        sf.rect.x, sf.rect.y, sf.rect.width, sf.rect.height,
        -w * ax, -h * (1 - ay), w, h,
    );
    ctx.restore();
}

function drawNode(node, px, py, pdeg, psx, psy) {
    if (node.active === false) return;
    const wx = px + node._pos.x;
    const wy = py + node._pos.y;
    const deg = pdeg + (node.angle || 0);
    const sx = psx * node._scale.x;
    const sy = psy * node._scale.y;

    for (const c of node._comps) {
        if (c instanceof Graphics) paintGraphics(c, wx, wy, deg, sx, sy);
        else if (c instanceof Label) paintLabel(c, node, wx, wy, deg);
        else if (c instanceof Sprite) paintSprite(c, node, wx, wy, deg, sx, sy);
    }
    for (const ch of node.children) drawNode(ch, wx, wy, deg, sx, sy);
}

// ================= 起场景 =================

const root = new Node('Canvas');
root.addComponent(Canvas);
root.addComponent(UITransform).setContentSize(W, H);

const game = new GameRoot();
game.node = root;
game.onLoad();
game.start();

function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawNode(root, 0, 0, 0, 1, 1);
}

function waitReady() {
    return new Promise((res) => {
        const t = setInterval(() => {
            if (game.mode !== 'loading') {
                clearInterval(t);
                res();
            }
        }, 40);
    });
}

/** 定格到指定时刻（phase 0~1）并渲染 */
window.__shot__ = (phase, opts = {}) => {
    if (opts.start && game.mode === 'ready') {
        game.action();       // 关掉开场卷轴，铺鱼
    }
    if (opts.princess !== undefined) {
        game.applyPrincess(opts.princess);
    }
    game.clock = phase * DAY_LEN;
    for (let i = 0; i < 6; i++) {
        game.update(0.1);
    }
    if (opts.muted) {
        game.sndBtn.setOn(game.audio.toggle());
    }
    if (opts.overlay) {
        game.hud.showOverlay('过关', ['本关金币　1240', '目标金币　600', '准备进入第 2 关'], '点击继续');
    } else {
        game.hud.hideOverlay();
    }
    render();
    return {
        mode: game.mode,
        clock: Math.round(game.clock),
        fishes: game.fishes.length,
        score: game.score,
        light: undefined,
    };
};

/** 推进若干秒（让鱼游动、时间流逝） */
window.__tick__ = (sec) => {
    game.hud.hideOverlay();
    const n = Math.round(sec / 0.05);
    for (let i = 0; i < n; i++) game.update(0.05);
    render();
    return { timeLeft: Math.round(game.timeLeft), fishes: game.fishes.length };
};

waitReady().then(() => {
    window.__ready__ = true;
});
