import { Node, Graphics, UITransform, Color } from 'cc';
import { DESIGN, TUNE, VIEW } from './GameConfig.js';
import { PAL, col, mixC, lightAt, warmAt, phaseOf, rectD, roundRectD, circleD, ellipseD, moveToD, lineToD, } from './DayNight.js';
import { Reef } from './Reef.js';
/**
 * 背景层：天空、云、远山、城堡、日月星、水体、光柱、海底沙床。
 *
 * Cocos 的 Graphics 不支持渐变填充，所以天空和水体都用「多条横向色带」拼出渐变：
 * 相邻色带差不到 2 个色阶，肉眼看不出来，而且整个 Graphics 只有一次 draw call。
 *
 * 横向一律按 `VIEW` 再外扩 `OVER` 来画：工程是 FIXED_HEIGHT 适配，
 * 宽屏上可见宽度比 1280 大，只按 1280 画会在两侧露出相机的黑底。
 *
 * 昼夜颜色变化很慢，所以只在光照变化时重绘（约 10fps），
 * 水面波纹单独放在一个节点里靠平移滚动，保证 60fps 顺滑。
 */
/** 横向多画的余量：给 21:9 之类的超宽屏也留足 */
const OVER = 420;
/** 水体渐变的四个锚点：[水面, 浅水, 中层, 深处] */
const WATER_DAY = [
    [160, 238, 240],
    [92, 212, 224],
    [40, 152, 196],
    [22, 96, 150],
];
const WATER_NIGHT = [
    [34, 88, 122],
    [22, 62, 96],
    [14, 44, 76],
    [8, 28, 54],
];
export class Background {
    constructor(parent) {
        /** 用来兜底清屏色：万一还有没盖到的地方，也是水色而不是黑 */
        this.cam = null;
        this.acc = 0;
        this.scroll = 0;
        this.lastPhase = -1;
        this.lastLight = 1;
        /** 水线波浪相位（网页版用 Date.now() * 0.0016，即 1.6 rad/s） */
        this.waveT = 0;
        this.node = new Node('Background');
        this.node.layer = parent.layer;
        this.node.addComponent(UITransform).setContentSize(DESIGN.w, DESIGN.h);
        this.node.setParent(parent);
        this.g = this.node.addComponent(Graphics);
        // 礁石带：子节点 → 画在背景之上、其它所有层之下
        this.reef = new Reef(this.node);
        // 波纹单独一层，靠平移滚动
        this.waveNode = new Node('Waves');
        this.waveNode.layer = parent.layer;
        this.waveNode.addComponent(UITransform).setContentSize(DESIGN.w * 2, DESIGN.h);
        this.waveNode.setParent(this.node);
        this.waveG = this.waveNode.addComponent(Graphics);
        this.redraw(0);
    }
    /** 相机由 GameRoot 注入：清屏色跟着水色走，永远不会露出黑边 */
    setCamera(cam) {
        this.cam = cam;
    }
    /** 分辨率变了（换屏 / 拖窗口）后立刻按新的可见宽度重画一次 */
    refresh() {
        this.redraw(this.lastPhase < 0 ? 0 : this.lastPhase);
    }
    update(dt, clock) {
        // 波纹滚动（每帧）
        this.scroll = (this.scroll + dt * 16) % DESIGN.w;
        this.waveNode.setPosition(-this.scroll, 0, 0);
        this.waveT += dt * 1.6;
        this.reef.update(dt, this.lastLight);
        // 背景重绘（限频）
        this.acc += dt;
        if (this.acc < 0.1) {
            return;
        }
        this.acc = 0;
        const p = phaseOf(clock);
        if (Math.abs(p - this.lastPhase) < 0.0008 && this.lastPhase >= 0) {
            return;
        }
        this.lastPhase = p;
        this.redraw(p);
    }
    // ================= 主绘制 =================
    redraw(p) {
        const g = this.g;
        const light = lightAt(p);
        const warm = warmAt(p);
        const sy = TUNE.waterTop;
        const x0 = VIEW.left - OVER;
        const x1 = VIEW.right + OVER;
        this.lastLight = light;
        // 清屏色跟着水里层的颜色走：万一有一两像素没盖住，也是水色，不是黑屏
        if (this.cam) {
            const mid = mixC(WATER_NIGHT[2], WATER_DAY[2], light);
            this.cam.clearColor = col(mixC(mid, mixC(WATER_NIGHT[3], WATER_DAY[3], light), 0.4));
        }
        g.clear();
        this.drawSky(g, light, warm, sy, x0, x1);
        this.drawStars(g, light, x0, x1);
        this.drawSunMoon(g, p, sy - 4);
        this.drawHills(g, light, sy, x0, x1);
        this.drawCastle(g, light, sy);
        this.drawClouds(g, light, warm, x0, x1);
        this.drawWater(g, light, warm, sy, x0, x1);
        this.drawShafts(g, light, warm, sy, x0, x1);
        this.drawSeafloor(g, light, x0, x1);
        this.redrawWaves(light);
    }
    drawSky(g, light, warm, sy, x0, x1) {
        const top = mixC(PAL.skyNight, PAL.skyDay, light);
        const bot = mixC(PAL.skyNightBot, PAL.skyDayBot, light);
        const mid = mixC(top, bot, 0.55);
        const botWarm = mixC(bot, [255, 206, 168], warm * 0.75);
        const n = 36;
        const bh = sy / n;
        for (let i = 0; i < n; i++) {
            const t = i / (n - 1);
            const c = t < 0.55 ? mixC(top, mid, t / 0.55) : mixC(mid, botWarm, (t - 0.55) / 0.45);
            g.fillColor = col(c);
            rectD(g, x0, i * bh, x1 - x0, bh + 0.6);
            g.fill();
        }
    }
    drawStars(g, light, x0, x1) {
        if (light >= 0.6) {
            return;
        }
        const a = Math.min(1, (0.6 - light) / 0.45);
        // 固定分布（不随机，保证每次运行一致），数量按可见宽度摊开
        const w = x1 - x0;
        const n = Math.round((70 * w) / DESIGN.w);
        // 星星铺满「水面以上」这块天空：水线抬高后还按固定的 150px 排，
        // 会全部挤在最上面一条，天空下半截是空的
        const band = Math.max(120, TUNE.waterTop - 70);
        for (let i = 0; i < n; i++) {
            const x = x0 + ((i * 197 + 41) % w);
            const y = 10 + ((i * 71) % band);
            const r = 0.7 + (i % 3) * 0.45;
            g.fillColor = new Color(234, 244, 255, Math.round(255 * a * 0.85));
            circleD(g, x, y, r);
            g.fill();
        }
    }
    /** 太阳走左半边、月亮走右半边，避免从角色身后穿过或被 HUD 牌匾挡住 */
    drawSunMoon(g, p, horizon) {
        const isSun = p < 0.5;
        const t = isSun ? p / 0.5 : (p - 0.5) / 0.5;
        // 贴着可见区域的左右边缘走，宽屏上也不会缩到中间
        const x = isSun ? VIEW.left + 150 + 380 * t : VIEW.right - 150 - 380 * t;
        const y = horizon - Math.sin(Math.PI * t) * 96;
        if (isSun) {
            // 光晕：三层同心圆近似
            g.fillColor = new Color(255, 246, 200, 22);
            circleD(g, x, y, 104);
            g.fill();
            g.fillColor = new Color(255, 236, 180, 34);
            circleD(g, x, y, 58);
            g.fill();
            g.fillColor = new Color(255, 224, 150, 95);
            circleD(g, x, y, 29);
            g.fill();
            g.fillColor = new Color(255, 246, 206, 255);
            circleD(g, x, y, 22);
            g.fill();
        }
        else {
            g.fillColor = new Color(226, 238, 255, 26);
            circleD(g, x, y, 82);
            g.fill();
            g.fillColor = new Color(233, 241, 255, 255);
            circleD(g, x, y, 21);
            g.fill();
            // 环形山
            g.fillColor = new Color(198, 214, 240, 180);
            circleD(g, x - 6, y - 5, 4.6);
            g.fill();
            circleD(g, x + 6, y + 4, 3.2);
            g.fill();
            circleD(g, x + 2, y - 9, 2.3);
            g.fill();
        }
    }
    /**
     * 远山：两层圆丘，远景淡、近景深。
     *
     * 山峰必须高过栏杆顶（`waterTop - 50`）才看得见 —— 顶部这块画幅里，
     * 水线往上依次是：甲板、栏杆、远山、天空。山要是按「贴着水线」画，
     * 会整条被栏杆吃掉，天空就只剩一片空蓝。
     */
    drawHills(g, light, sy, x0, x1) {
        const far = mixC([14, 30, 52], [150, 198, 218], light);
        const near = mixC([10, 24, 44], [102, 168, 178], light);
        g.fillColor = col(far);
        moveToD(g, x0, sy);
        for (let x = x0; x <= x1; x += 10) {
            const y = sy - 76 - Math.sin(x * 0.0026) * 32 - Math.sin(x * 0.0081 + 1.1) * 13;
            lineToD(g, x, y);
        }
        lineToD(g, x1, sy);
        g.close();
        g.fill();
        g.fillColor = col(near);
        moveToD(g, x0, sy);
        for (let x = x0; x <= x1; x += 8) {
            const y = sy - 40 - Math.abs(Math.sin(x * 0.0034 + 0.4)) * 26 - Math.sin(x * 0.012) * 8;
            lineToD(g, x, y);
        }
        lineToD(g, x1, sy);
        g.close();
        g.fill();
    }
    /**
     * 右侧远景城堡：设计稿顶部主方案里「湖边木栈道」尽头那座。
     * 只用几何块拼（墙 + 尖顶 + 旗 + 窗），不做细节，它离得远、面积也小，
     * 有轮廓和冷暖对比就够了。
     */
    drawCastle(g, light, sy) {
        const cx = VIEW.right - 250;
        const base = sy - 2;
        const wall = mixC([44, 56, 84], [253, 249, 239], light);
        const shade = mixC([32, 44, 70], [206, 220, 234], light);
        const roof = mixC([16, 28, 52], [96, 160, 224], light);
        const roofDark = mixC([12, 22, 44], [66, 124, 192], light);
        // 描边：白墙后面是白云，不描边两团白就糊在一起，城堡会像一顶帐篷
        const line = mixC([10, 20, 38], [92, 126, 158], light);
        const tri = (ax, ay, bx, by, tx, ty) => {
            moveToD(g, ax, ay);
            lineToD(g, bx, by);
            lineToD(g, tx, ty);
            g.close();
        };
        // 城堡立在一座小岛上，否则白墙直接切在栏杆上像浮空的
        g.fillColor = col(mixC([16, 30, 40], [126, 182, 158], light));
        moveToD(g, cx - 168, base + 6);
        for (let x = cx - 168; x <= cx + 168; x += 12) {
            const y = base - 18 - Math.cos((x - cx) / 168 * Math.PI * 0.5) * 16;
            lineToD(g, x, y);
        }
        lineToD(g, cx + 168, base + 6);
        g.close();
        g.fill();
        g.lineWidth = 2;
        g.strokeColor = col(line, 170);
        // 主楼
        g.fillColor = col(wall);
        rectD(g, cx - 48, base - 100, 96, 100);
        g.fill();
        rectD(g, cx - 48, base - 100, 96, 100);
        g.stroke();
        g.fillColor = col(shade);
        rectD(g, cx + 12, base - 100, 36, 100);
        g.fill();
        // 主楼尖顶
        g.fillColor = col(roof);
        tri(cx - 57, base - 100, cx + 57, base - 100, cx, base - 148);
        g.fill();
        tri(cx - 57, base - 100, cx + 57, base - 100, cx, base - 148);
        g.stroke();
        g.fillColor = col(roofDark);
        tri(cx, base - 100, cx + 57, base - 100, cx, base - 148);
        g.fill();
        // 两侧塔楼
        for (const s of [-1, 1]) {
            const tx = cx + s * 78;
            g.fillColor = col(s > 0 ? shade : wall);
            rectD(g, tx - 19, base - 78, 38, 78);
            g.fill();
            rectD(g, tx - 19, base - 78, 38, 78);
            g.stroke();
            g.fillColor = col(s > 0 ? roofDark : roof);
            tri(tx - 26, base - 78, tx + 26, base - 78, tx, base - 120);
            g.fill();
            tri(tx - 26, base - 78, tx + 26, base - 78, tx, base - 120);
            g.stroke();
            // 旗杆 + 三角旗
            g.strokeColor = new Color(90, 104, 128, 230);
            g.lineWidth = 1.6;
            moveToD(g, tx, base - 118);
            lineToD(g, tx, base - 136);
            g.stroke();
            g.fillColor = s > 0 ? new Color(246, 150, 140, 240) : new Color(120, 200, 170, 240);
            tri(tx, base - 136, tx + 13, base - 130, tx, base - 124);
            g.fill();
            g.lineWidth = 2;
            g.strokeColor = col(line, 170);
        }
        // 窗：白天是冷色玻璃，夜里透暖光
        const win = light > 0.5 ? new Color(112, 146, 180, 230) : new Color(255, 214, 140, 235);
        g.fillColor = win;
        for (let i = 0; i < 3; i++) {
            roundRectD(g, cx - 30 + i * 22, base - 82, 12, 18, 6);
            g.fill();
            roundRectD(g, cx - 30 + i * 22, base - 54, 12, 18, 6);
            g.fill();
            roundRectD(g, cx - 30 + i * 22, base - 26, 12, 18, 6);
            g.fill();
        }
    }
    /** 云：一朵 = 一条椭圆底座 + 5 个圆鼓包，先画暗部下缘再压主体 */
    drawClouds(g, light, warm, x0, x1) {
        const span = x1 - x0;
        const body = mixC(mixC([34, 52, 84], [255, 255, 255], light), [255, 226, 196], warm * 0.5);
        const shade = mixC(mixC([24, 40, 68], [206, 228, 242], light), [246, 196, 170], warm * 0.4);
        const bumps = [[-56, 6, 20], [-30, -8, 30], [0, -16, 38], [30, -6, 28], [56, 8, 18]];
        const castleX = VIEW.right - 250;
        for (let i = 0; i < 10; i++) {
            const cx = x0 + ((i * 0.113 + 0.05) % 1) * span;
            // 城堡正后方不留云：白墙压白云，城堡会糊成一团看不出轮廓
            if (Math.abs(cx - castleX) < 190) {
                continue;
            }
            const cy = 44 + ((i * 53) % 118);
            const s = 0.6 + ((i * 29) % 10) / 15;
            g.fillColor = col(shade);
            ellipseD(g, cx, cy + 6 * s, 74 * s, 20 * s);
            g.fill();
            g.fillColor = col(body);
            ellipseD(g, cx, cy, 78 * s, 24 * s);
            g.fill();
            for (const b of bumps) {
                circleD(g, cx + b[0] * s, cy + b[1] * s, b[2] * s);
            }
            g.fill();
        }
    }
    drawWater(g, light, warm, sy, x0, x1) {
        const stops = [];
        for (let i = 0; i < 4; i++) {
            stops.push(mixC(WATER_NIGHT[i], WATER_DAY[i], light));
        }
        // 日出日落时水面那一层偏橙，深处不动（光进不去）
        stops[0] = mixC(stops[0], [246, 206, 168], warm * 0.35);
        const top = stops[0];
        // 顶边做成手绘波浪（网页版 waveAt：sy + sin(x*0.012 + t) * 5），
        // 填一段与水面顶色相同的条带，把平直的色带上沿盖成波浪形
        g.fillColor = col(top);
        const waveY = (x) => sy + Math.sin(x * 0.012 + this.waveT) * 5;
        moveToD(g, x0, waveY(x0));
        for (let x = x0 + 16; x <= x1; x += 16) {
            lineToD(g, x, waveY(x));
        }
        lineToD(g, x1, sy + 14);
        lineToD(g, x0, sy + 14);
        g.close();
        g.fill();
        // 四锚点渐变：每段单独插值，色带差控制在 2 个色阶内
        const n = 56;
        const h = DESIGN.h - sy;
        const bh = h / n;
        for (let i = 0; i < n; i++) {
            const t = (i / (n - 1)) * 3;
            const k = Math.min(2, Math.floor(t));
            g.fillColor = col(mixC(stops[k], stops[k + 1], t - k));
            rectD(g, x0, sy + i * bh, x1 - x0, bh + 0.6);
            g.fill();
        }
        // 水面的碎光（caustics）：贴着水线的一排亮短弧，浅水才有
        if (light > 0.25) {
            g.fillColor = new Color(255, 255, 255, Math.round(52 * light));
            const w = x1 - x0;
            for (let i = 0; i < Math.round(w / 120); i++) {
                const cx2 = x0 + ((i * 313 + 70) % w);
                const cy2 = sy + 24 + ((i * 47) % 64);
                ellipseD(g, cx2, cy2, 40, 4.5);
            }
            g.fill();
        }
        // 中层柔和光斑
        const a = 0.06 + 0.1 * light;
        const w = x1 - x0;
        const nb = Math.max(9, Math.round(w / 230));
        for (let i = 0; i < nb; i++) {
            const cx2 = x0 + ((i * 271 + 90) % w);
            const cy2 = sy + 90 + ((i * 137) % 330);
            const r = 40 + (i % 4) * 26;
            g.fillColor = new Color(255, 255, 255, Math.round(255 * a * 0.5));
            ellipseD(g, cx2, cy2, r, r);
            g.fill();
        }
    }
    /** 斜射光柱：从水线一路铺到画面底部，越深越淡（靠低透明度，不做渐变） */
    drawShafts(g, light, warm, sy, x0, x1) {
        const alpha = Math.round(255 * 0.085 * light);
        if (alpha <= 1) {
            return;
        }
        g.fillColor = warm > 0.3 ? new Color(255, 226, 188, alpha) : new Color(255, 255, 255, alpha);
        const n = Math.ceil((x1 - x0) / 230) + 1;
        for (let i = 0; i < n; i++) {
            const x = x0 + 20 + i * 230;
            moveToD(g, x, sy);
            lineToD(g, x + 96, sy);
            lineToD(g, x + 218, DESIGN.h);
            lineToD(g, x + 34, DESIGN.h);
            g.close();
            g.fill();
        }
    }
    /** 海床：一道远景沙坡 + 起伏的沙丘 + 上缘高光 + 沙纹 + 碎石 */
    drawSeafloor(g, light, x0, x1) {
        const floorY = TUNE.floorY;
        const sand = mixC([26, 46, 62], PAL.sand, light);
        const sandDeep = mixC([18, 34, 50], PAL.sandDark, light);
        const crest = (x) => floorY + 4 - Math.sin(x * 0.0055) * 18 - Math.sin(x * 0.017 + 2) * 8;
        // 远景沙坡：比前景沙低了 60px，颜色掺进 35% 水色做空气透视。
        // 没有这一层，前景沙就是一条 50px 的贴边色带，看不出「水有多深」。
        const backCrest = (x) => floorY - 58 - Math.sin(x * 0.0042) * 24 - Math.sin(x * 0.011 + 0.8) * 10;
        g.fillColor = col(mixC(mixC(sand, mixC(WATER_NIGHT[2], WATER_DAY[2], light), 0.35), sandDeep, 0.25));
        moveToD(g, x0, backCrest(x0));
        for (let x = x0; x <= x1; x += 14) {
            lineToD(g, x, backCrest(x));
        }
        lineToD(g, x1, DESIGN.h + 40);
        lineToD(g, x0, DESIGN.h + 40);
        g.close();
        g.fill();
        // 沙丘主体
        g.fillColor = col(sand);
        moveToD(g, x0, crest(x0));
        for (let x = x0; x <= x1; x += 12) {
            lineToD(g, x, crest(x));
        }
        lineToD(g, x1, DESIGN.h + 40);
        lineToD(g, x0, DESIGN.h + 40);
        g.close();
        g.fill();
        // 底部压深一档，沙子才有厚度（否则是一片纯色纸）
        g.fillColor = col(sandDeep);
        moveToD(g, x0, floorY + 30);
        for (let x = x0; x <= x1; x += 16) {
            lineToD(g, x, floorY + 30 + Math.sin(x * 0.006 + 1.4) * 10);
        }
        lineToD(g, x1, DESIGN.h + 40);
        lineToD(g, x0, DESIGN.h + 40);
        g.close();
        g.fill();
        // 上缘高光：一条贴着沙丘顶的亮线
        g.strokeColor = new Color(255, 250, 232, Math.round(150 * light + 40));
        g.lineWidth = 3;
        let first = true;
        for (let x = x0; x <= x1; x += 12) {
            const y = crest(x) + 1;
            if (first) {
                moveToD(g, x, y);
                first = false;
            }
            else {
                lineToD(g, x, y);
            }
        }
        g.stroke();
        // 沙纹
        g.strokeColor = new Color(200, 172, 130, Math.round(70 * light + 20));
        g.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
            const baseY = floorY + 22 + i * 14;
            let f2 = true;
            for (let x = x0; x <= x1; x += 14) {
                const y = baseY + Math.sin(x * 0.014 + i * 2.1) * 4;
                if (f2) {
                    moveToD(g, x, y);
                    f2 = false;
                }
                else {
                    lineToD(g, x, y);
                }
            }
            g.stroke();
        }
        // 碎石与砂粒
        const w = x1 - x0;
        const n = Math.max(30, Math.round((40 * w) / DESIGN.w));
        g.fillColor = new Color(255, 250, 230, Math.round(60 * light + 20));
        for (let i = 0; i < n; i++) {
            const x = x0 + ((i * 137) % w);
            const y = floorY + 16 + ((i * 53) % 34);
            circleD(g, x, y, 1.4 + (i % 3) * 0.7);
        }
        g.fill();
        g.fillColor = col(mixC([20, 38, 52], [152, 134, 110], light));
        for (let i = 0; i < Math.max(8, Math.round((12 * w) / DESIGN.w)); i++) {
            const x = x0 + ((i * 271 + 120) % w);
            const y = floorY + 20 + ((i * 79) % 26);
            ellipseD(g, x, y, 4 + (i % 3) * 2, 2.6 + (i % 2));
        }
        g.fill();
    }
    // ================= 滚动波纹 =================
    redrawWaves(light) {
        const g = this.waveG;
        const sy = TUNE.waterTop;
        g.clear();
        // 波纹层要盖住整个可见宽度，还要留出滚动位移（节点最多左移一屏）
        const startX = -DESIGN.w;
        const endX = VIEW.right + DESIGN.w;
        // 水线高光：双层，跨两倍宽度以便无缝滚动（透明度对齐网页版）
        const drawLine = (offsetY, amp, freq, width, baseA) => {
            g.strokeColor = new Color(255, 255, 255, Math.round(255 * baseA * (1 + light)));
            g.lineWidth = width;
            let first = true;
            for (let x = startX; x <= endX; x += 16) {
                const yy = sy + offsetY + Math.sin(x * freq) * amp;
                if (first) {
                    moveToD(g, x, yy);
                    first = false;
                }
                else {
                    lineToD(g, x, yy);
                }
            }
            g.stroke();
        };
        // 第一层 0.35 + 0.35*light，第二层 0.15 + 0.15*light（baseA 为 light=1 时的一半）
        drawLine(0, 5, 0.012, 3, 0.35);
        drawLine(16, 4, 0.009, 2, 0.15);
        // 水下横向波纹
        for (let i = 0; i < 4; i++) {
            const y0 = sy + 58 + i * 118;
            g.strokeColor = new Color(255, 255, 255, Math.round(255 * (0.10 + 0.10 * light)));
            g.lineWidth = 2;
            let first = true;
            for (let x = startX; x <= endX; x += 20) {
                const yy = y0 + Math.sin(x * 0.008 + i * 1.7) * 7;
                if (first) {
                    moveToD(g, x, yy);
                    first = false;
                }
                else {
                    lineToD(g, x, yy);
                }
            }
            g.stroke();
        }
    }
}
