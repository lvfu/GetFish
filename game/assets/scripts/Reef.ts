import { Node, Graphics, UITransform, Color } from 'cc';
import { DESIGN, TUNE, VIEW } from './GameConfig';
import { PAL, col, mixC, circleD, ellipseD, roundRectD, moveToD, lineToD, quadToD } from './DayNight';

/**
 * 水下礁石带：珊瑚、海草、礁石、沙地上的小物件。
 *
 * 拆成两个图层是有原因的：
 *  - `static`（珊瑚 / 礁石 / 贝壳）只在光照变化时重画一次 —— 这是画面里的主体，
 *    形状多（一次约 90 个 fill），但完全静止，没必要每帧推倒重来；
 *  - `kelpNode`（海草）按 20fps 重画，因为它要随水流摆 —— 只有 6 条草，
 *    每条 9 段描边，成本不到静态层的十分之一。
 *
 * 所有颜色都过一遍 `dim()`：白天是方案板上的饱和色，夜里整体沉到深蓝里，
 * 否则切到夜景会出现「水面黑了、珊瑚还亮着」的断层。
 *
 * 礁石带只贴在可见区域的左右两端 + 底部，不铺中间：鱼要横穿画面，
 * 中间塞满珊瑚会把鱼挡住，而且会让「水很深」这件事看不出来。
 */

/** 静态层重画的光照阈值 */
const LIGHT_EPS = 0.012;
/** 海草摆动刷新间隔 s */
const KELP_DT = 0.05;

export class Reef {
    readonly node: Node;
    private staticG: Graphics;
    private kelpNode: Node;
    private kelpG: Graphics;

    private t = 0;
    private acc = 0;
    private light = -1;

    constructor(parent: Node) {
        this.node = new Node('Reef');
        this.node.layer = parent.layer;
        this.node.addComponent(UITransform).setContentSize(DESIGN.w, DESIGN.h);
        this.node.setParent(parent);
        this.staticG = this.node.addComponent(Graphics);

        this.kelpNode = new Node('Kelp');
        this.kelpNode.layer = parent.layer;
        this.kelpNode.addComponent(UITransform).setContentSize(DESIGN.w, DESIGN.h);
        this.kelpNode.setParent(this.node);
        this.kelpG = this.kelpNode.addComponent(Graphics);

        this.drawStatic(1);
        this.drawKelp(1);
    }

    update(dt: number, light: number): void {
        this.t += dt;

        // 海草：20fps 足够（摆得很慢），但光照变了要立刻跟上
        this.acc += dt;
        const litChanged = Math.abs(light - this.light) > LIGHT_EPS;
        if (litChanged) {
            this.light = light;
            this.drawStatic(light);
        }
        if (this.acc >= KELP_DT || litChanged) {
            this.acc = 0;
            this.drawKelp(light);
        }
    }

    // ================= 颜色 =================

    /** 白天饱和、夜里沉进深蓝。0.28 是深处的余晖，再低就全黑了 */
    private dim(base: number[], light: number): Color {
        const night = [base[0] * 0.20 + 6, base[1] * 0.28 + 14, base[2] * 0.40 + 30];
        return col(mixC(night, base, 0.26 + 0.74 * light));
    }

    private dimA(base: number[], light: number, a: number): Color {
        const c = this.dim(base, light);
        c.a = a;
        return c;
    }

    // ================= 静态层 =================

    private drawStatic(light: number): void {
        const g = this.staticG;
        g.clear();
        const L = VIEW.left;
        const R = VIEW.right;
        // 礁石都「长」在海床线下方一点，看起来才像扎进沙里、而不是浮着
        const base = TUNE.floorY + 10;

        // ---- 左端礁石群 ----
        this.rock(g, L + 62, base, 190, 108, light);
        this.rock(g, L + 196, base + 10, 118, 70, light);
        this.staghorn(g, L + 40, base - 46, 96, light);
        this.fan(g, L + 158, base - 26, 80, light);
        this.tubes(g, L + 258, base - 2, light);
        this.brain(g, L + 322, base + 6, light);

        // ---- 右端礁石群 ----
        this.rock(g, R - 58, base + 2, 178, 100, light);
        this.rock(g, R - 190, base + 12, 112, 66, light);
        this.staghorn(g, R - 34, base - 40, 88, light);
        this.tubes(g, R - 132, base - 4, light);
        this.fan(g, R - 236, base - 20, 74, light);
        this.brain(g, R - 306, base + 6, light);

        // ---- 底部零星小件 ----
        const w = R - L;
        this.shell(g, L + w * 0.42, base + 2, light);
        this.star(g, L + w * 0.61, base + 10, 13, light);
        this.tubes(g, L + w * 0.52, base + 8, light * 0.9);
        this.star(g, R - 30, base + 16, 10, light);
    }

    /** 平滑闭合曲线：把折线点集用「中点 + 二次贝塞尔」连成一圈，比多边形圆润 */
    private blob(g: Graphics, pts: number[][], cx: number, cy: number, sx: number, sy: number): void {
        const n = pts.length;
        const P: number[][] = [];
        for (const p of pts) {
            P.push([cx + p[0] * sx, cy + p[1] * sy]);
        }
        const mid = (a: number[], b: number[]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const st = mid(P[n - 1], P[0]);
        moveToD(g, st[0], st[1]);
        for (let i = 0; i < n; i++) {
            const cur = P[i];
            const m = mid(cur, P[(i + 1) % n]);
            quadToD(g, cur[0], cur[1], m[0], m[1]);
        }
        g.close();
    }

    /** 礁石：一块深色主体 + 左上高光 + 右下暗面 */
    private rock(g: Graphics, x: number, y: number, w: number, h: number, light: number): void {
        const ROCK = [[-0.5, 0.06], [-0.44, -0.52], [-0.16, -0.94], [0.22, -0.88], [0.47, -0.42], [0.5, 0.06]];
        g.fillColor = this.dim(PAL.rock, light);
        this.blob(g, ROCK, x, y, w, h);
        g.fill();

        g.fillColor = this.dimA(PAL.rockLight, light, 150);
        this.blob(g, [[-0.34, -0.12], [-0.28, -0.5], [-0.06, -0.76], [0.12, -0.6], [0.06, -0.18]], x, y, w, h);
        g.fill();

        g.fillColor = this.dimA([70, 96, 116], light, 110);
        this.blob(g, [[0.1, -0.1], [0.26, -0.42], [0.44, -0.2], [0.4, 0.04]], x, y, w, h);
        g.fill();
    }

    /** 鹿角珊瑚：从根部扇出几根主枝，每根再分两个小叉 */
    private staghorn(g: Graphics, x: number, y: number, h: number, light: number): void {
        const c1 = this.dim(PAL.coralPink, light);
        const c2 = this.dim(PAL.coralDeep, light);
        const arms = [-1.0, -0.55, -0.16, 0.24, 0.66, 1.02];
        g.lineCap = Graphics.LineCap.ROUND;
        for (let i = 0; i < arms.length; i++) {
            const a = arms[i];
            const len = h * (0.58 + ((i * 37) % 10) / 24);
            const x1 = x + Math.sin(a) * len * 0.6;
            const y1 = y - Math.cos(a) * len;

            g.strokeColor = i % 2 ? c2 : c1;
            g.lineWidth = 9 - (i % 3);
            moveToD(g, x, y);
            quadToD(g, x + Math.sin(a) * 12, y - len * 0.55, x1, y1);
            g.stroke();

            for (const t of [0.52, 0.78]) {
                const bx = x + (x1 - x) * t;
                const by = y + (y1 - y) * t;
                const na = a + (t > 0.6 ? 0.42 : -0.42);
                g.lineWidth = 4.5;
                moveToD(g, bx, by);
                lineToD(g, bx + Math.sin(na) * 20, by - Math.cos(na) * 20);
                g.stroke();
            }
        }
    }

    /** 海扇：从根部放射出去，末端带一层交叉细丝 */
    private fan(g: Graphics, x: number, y: number, r: number, light: number): void {
        const c1 = this.dim(PAL.coralPurple, light);
        const c2 = this.dimA([142, 104, 190], light, 200);
        g.lineCap = Graphics.LineCap.ROUND;
        const ribs = 9;
        for (let i = 0; i <= ribs; i++) {
            const a = -1.15 + (i / ribs) * 2.3;
            g.strokeColor = i % 2 ? c2 : c1;
            g.lineWidth = 3.2;
            moveToD(g, x, y);
            quadToD(g, x + Math.sin(a) * r * 0.45, y - Math.cos(a) * r * 1.02,
                x + Math.sin(a) * r * 0.92, y - Math.cos(a) * r * 0.88);
            g.stroke();
        }
        // 横向连接：像扇面的骨架
        g.strokeColor = this.dimA(PAL.coralPurple, light, 120);
        g.lineWidth = 1.6;
        for (const k of [0.55, 0.85]) {
            for (let i = 0; i < ribs; i++) {
                const a0 = -1.15 + (i / ribs) * 2.3;
                const a1 = -1.15 + ((i + 1) / ribs) * 2.3;
                moveToD(g, x + Math.sin(a0) * r * 0.92 * k, y - Math.cos(a0) * r * 0.88 * k);
                lineToD(g, x + Math.sin(a1) * r * 0.92 * k, y - Math.cos(a1) * r * 0.88 * k);
            }
            g.stroke();
        }
        g.fillColor = this.dimA([120, 86, 160], light, 220);
        ellipseD(g, x, y - 2, 9, 4);
        g.fill();
    }

    /** 管状珊瑚：几根高低不一的圆头管子，管口颜色更深 */
    private tubes(g: Graphics, x: number, y: number, light: number): void {
        const hs = [38, 58, 32, 50];
        for (let i = 0; i < hs.length; i++) {
            const h = hs[i];
            const bx = x + i * 13;
            g.fillColor = this.dim(i % 2 ? PAL.coralOrange : PAL.coralPink, light);
            roundRectD(g, bx, y - h, 15, h, 7.5);
            g.fill();
            g.fillColor = this.dimA([150, 74, 62], light, 190);
            ellipseD(g, bx + 7.5, y - h + 2, 5, 2.4);
            g.fill();
        }
    }

    /** 脑珊瑚：扁圆顶 + 几圈同心纹 */
    private brain(g: Graphics, x: number, y: number, light: number): void {
        g.fillColor = this.dim(PAL.coralYellow, light);
        ellipseD(g, x, y - 9, 34, 22);
        g.fill();
        g.strokeColor = this.dimA([214, 152, 66], light, 200);
        g.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
            ellipseD(g, x, y - 9, 26 - i * 7, 16 - i * 4.5);
            g.stroke();
        }
    }

    /** 贝壳：两片扇形 + 放射纹 */
    private shell(g: Graphics, x: number, y: number, light: number): void {
        g.fillColor = this.dimA([255, 226, 224], light, 235);
        ellipseD(g, x, y - 5, 15, 10);
        g.fill();
        g.strokeColor = this.dimA([214, 156, 160], light, 190);
        g.lineWidth = 1.4;
        for (let i = -2; i <= 2; i++) {
            moveToD(g, x, y - 1);
            lineToD(g, x + i * 6, y - 13);
        }
        g.stroke();
    }

    /** 海星：五个角 */
    private star(g: Graphics, x: number, y: number, r: number, light: number): void {
        g.fillColor = this.dim([255, 138, 112], light);
        moveToD(g, x, y - r);
        for (let i = 0; i < 10; i++) {
            const a = -Math.PI / 2 + ((i + 1) / 10) * Math.PI * 2;
            const rr = i % 2 === 0 ? r * 0.44 : r;
            lineToD(g, x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        g.close();
        g.fill();
        g.fillColor = this.dimA([255, 190, 170], light, 200);
        circleD(g, x, y, r * 0.24);
        g.fill();
    }

    // ================= 海草（会摆） =================

    private drawKelp(light: number): void {
        const g = this.kelpG;
        g.clear();
        const base = TUNE.floorY + 12;
        const L = VIEW.left;
        const R = VIEW.right;

        // 越靠外的越高，靠近中间逐渐变矮，形成两道「框」。
        // 高度收到 200 以内：再高就顶到鱼群的活动区，水面以下那条「空带」会被草切碎
        const strands = [
            { x: L + 104, h: 196, w: 16, ph: 0.0 },
            { x: L + 154, h: 144, w: 13, ph: 1.7 },
            { x: L + 62, h: 108, w: 11, ph: 3.2 },
            { x: R - 100, h: 186, w: 16, ph: 0.8 },
            { x: R - 150, h: 138, w: 13, ph: 2.5 },
            { x: R - 58, h: 112, w: 11, ph: 4.1 },
        ];

        const dark = this.dim(PAL.kelp, light);
        const lite = this.dimA(PAL.kelpLight, light, 215);

        for (const s of strands) {
            const N = 14;
            const pts: number[][] = [];
            for (let i = 0; i <= N; i++) {
                const t = i / N;
                // 摆幅随高度按 t² 增长：根部钉死、越靠梢头甩得越开
                const sway = Math.sin(this.t * 1.05 + s.ph + t * 2.6) * 24 * t * t;
                pts.push([s.x + sway, base - s.h * t]);
            }

            // 一条带状叶片：左缘上去、右缘下来，一个 fill 画完。
            // 用「逐段描边」拼出来的茎会有接缝，粗细一变就像竹竿一节一节的；
            // 填充带没有接缝，边缘光滑，才像海带那种软叶片。
            const ribbon = (widthK: number, dx: number, color: Color) => {
                // 宽度沿高度做一个持续的疏密起伏：叶缘有波浪边，
                // 不然填充出来的是一条笔直的绿带子，像塑料
                const half = (t: number) => (s.w * widthK * (1 - t * 0.86) * (1 + 0.3 * Math.sin(t * 8.5 + s.ph))) / 2;
                g.fillColor = color;
                moveToD(g, pts[0][0] - half(0) + dx, pts[0][1]);
                for (let i = 0; i <= N; i++) {
                    const t = i / N;
                    lineToD(g, pts[i][0] - half(t) + dx, pts[i][1]);
                }
                for (let i = N; i >= 0; i--) {
                    const t = i / N;
                    lineToD(g, pts[i][0] + half(t) + dx, pts[i][1]);
                }
                g.close();
                g.fill();
            };

            ribbon(1, 0, dark);
            // 偏左的一道浅色窄带 = 受光面，整条叶子立刻有厚度
            ribbon(0.42, -1.6, lite);

            // 三片叶子，顺着茎往斜上方甩
            g.fillColor = this.dimA(PAL.kelpLight, light, 235);
            for (const i of [4, 7, 10]) {
                const bx = pts[i][0];
                const by = pts[i][1];
                const side = i % 3 === 1 ? 1 : -1;
                const len = 36 - i * 1.4;
                moveToD(g, bx, by);
                quadToD(g, bx + side * len * 0.65, by - len * 0.3, bx + side * len, by - len * 0.95);
                quadToD(g, bx + side * 2, by - 3, bx, by);
                g.close();
                g.fill();
            }
        }
    }
}
