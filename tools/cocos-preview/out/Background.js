import { Node, Graphics, UITransform, Color } from 'cc';
import { DESIGN, TUNE } from './GameConfig.js';
import { PAL, col, mixC, lightAt, warmAt, phaseOf, rectD, circleD, ellipseD, moveToD, lineToD, } from './DayNight.js';
/**
 * 背景层：天空、远景、日月星、水体、光柱、海底。
 *
 * Cocos 的 Graphics 不支持渐变填充，所以天空和水体都用「多条横向色带」拼出渐变：
 * 相邻色带差不到 2 个色阶，肉眼看不出来，而且整个 Graphics 只有一次 draw call。
 *
 * 昼夜颜色变化很慢，所以只在光照变化时重绘（约 10fps），
 * 水面波纹单独放在一个节点里靠平移滚动，保证 60fps 顺滑。
 */
export class Background {
    constructor(parent) {
        this.acc = 0;
        this.scroll = 0;
        this.lastPhase = -1;
        /** 水线波浪相位（网页版用 Date.now() * 0.0016，即 1.6 rad/s） */
        this.waveT = 0;
        this.stars = [];
        this.node = new Node('Background');
        this.node.layer = parent.layer;
        this.node.addComponent(UITransform).setContentSize(DESIGN.w, DESIGN.h);
        this.node.setParent(parent);
        this.g = this.node.addComponent(Graphics);
        // 波纹单独一层，靠平移滚动
        this.waveNode = new Node('Waves');
        this.waveNode.layer = parent.layer;
        this.waveNode.addComponent(UITransform).setContentSize(DESIGN.w * 2, DESIGN.h);
        this.waveNode.setParent(this.node);
        this.waveG = this.waveNode.addComponent(Graphics);
        // 星星固定分布，不随机，保证每次运行一致
        for (let i = 0; i < 70; i++) {
            this.stars.push({
                x: (i * 197 + 41) % DESIGN.w,
                y: 10 + ((i * 71) % 150),
                r: 0.7 + (i % 3) * 0.45,
                tw: (i % 9) * 0.8,
            });
        }
        this.redraw(0);
    }
    update(dt, clock) {
        // 波纹滚动（每帧）
        this.scroll = (this.scroll + dt * 16) % DESIGN.w;
        this.waveNode.setPosition(-this.scroll, 0, 0);
        this.waveT += dt * 1.6;
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
        g.clear();
        this.drawSky(g, light, warm, sy);
        this.drawStars(g, light);
        this.drawSunMoon(g, p, sy - 4);
        this.drawScenery(g, light);
        this.drawWater(g, light, warm, sy);
        this.drawShafts(g, light, warm, sy);
        this.drawSeafloor(g, light);
        this.redrawWaves(light);
    }
    drawSky(g, light, warm, sy) {
        const top = mixC(PAL.skyNight, PAL.skyDay, light);
        const bot = mixC(PAL.skyNightBot, PAL.skyDayBot, light);
        const botWarm = mixC(bot, [242, 176, 128], warm * 0.6);
        const n = 32;
        const bh = sy / n;
        for (let i = 0; i < n; i++) {
            const t = i / (n - 1);
            g.fillColor = col(mixC(top, botWarm, t));
            rectD(g, 0, i * bh, DESIGN.w, bh + 0.6);
            g.fill();
        }
    }
    drawStars(g, light) {
        if (light >= 0.6) {
            return;
        }
        const a = Math.min(1, (0.6 - light) / 0.45);
        for (let i = 0; i < this.stars.length; i++) {
            const s = this.stars[i];
            g.fillColor = new Color(234, 244, 255, Math.round(255 * a * 0.85));
            circleD(g, s.x, s.y, s.r);
            g.fill();
        }
    }
    /** 太阳走左半边、月亮走右半边，避免从角色身后穿过或被 HUD 牌匾挡住 */
    drawSunMoon(g, p, horizon) {
        const isSun = p < 0.5;
        const t = isSun ? p / 0.5 : (p - 0.5) / 0.5;
        const x = isSun ? 150 + 380 * t : DESIGN.w - 150 - 380 * t;
        const y = horizon - Math.sin(Math.PI * t) * 96;
        if (isSun) {
            // 光晕：三层同心圆近似
            g.fillColor = new Color(255, 246, 200, 18);
            circleD(g, x, y, 104);
            g.fill();
            g.fillColor = new Color(255, 236, 180, 30);
            circleD(g, x, y, 58);
            g.fill();
            g.fillColor = new Color(255, 224, 150, 90);
            circleD(g, x, y, 29);
            g.fill();
            g.fillColor = new Color(255, 243, 198, 255);
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
    /** 远景：远山、塔、屋脊长墙，只做层次 */
    drawScenery(g, light) {
        const sy = TUNE.waterTop;
        const far = mixC([20, 34, 40], [156, 180, 184], light);
        const near = mixC([16, 28, 34], [128, 158, 164], light);
        // 远山
        g.fillColor = col(far, 140);
        moveToD(g, 0, sy);
        for (let x = 0; x <= DESIGN.w; x += 12) {
            const y = sy - 24 - Math.sin(x * 0.0032) * 18 - Math.sin(x * 0.011 + 1.2) * 7;
            lineToD(g, x, y);
        }
        lineToD(g, DESIGN.w, sy);
        g.close();
        g.fill();
        // 塔
        g.fillColor = col(near, 128);
        for (const px2 of [150, DESIGN.w - 150]) {
            for (let t = 0; t < 3; t++) {
                const w = 62 - t * 14;
                const yy = sy - 8 - t * 30;
                // 檐
                moveToD(g, px2 - w / 2, yy);
                g.quadraticCurveTo(px2 - w / 2 - 8 - DESIGN.w / 2, DESIGN.h / 2 - (yy - 6), px2 - w / 2 - 13 - DESIGN.w / 2, DESIGN.h / 2 - (yy - 13));
                lineToD(g, px2 + w / 2 + 13, yy - 13);
                g.quadraticCurveTo(px2 + w / 2 + 8 - DESIGN.w / 2, DESIGN.h / 2 - (yy - 6), px2 + w / 2 - DESIGN.w / 2, DESIGN.h / 2 - yy);
                g.close();
                g.fill();
                rectD(g, px2 - w / 2 + 6, yy - 13, w - 12, 13);
                g.fill();
            }
            rectD(g, px2 - 3, sy - 112, 6, 16);
            g.fill();
        }
        // 屋脊长墙
        g.fillColor = col(near, 118);
        moveToD(g, 296, sy - 28);
        lineToD(g, 362, sy - 62);
        lineToD(g, 918, sy - 62);
        lineToD(g, 984, sy - 28);
        lineToD(g, 984, sy);
        lineToD(g, 296, sy);
        g.close();
        g.fill();
        // 檐口
        g.fillColor = col(mixC([12, 22, 28], [104, 132, 140], light), 130);
        rectD(g, 356, sy - 64, 568, 5);
        g.fill();
        // 窗格：白天是暗洞，夜里透暖光
        g.fillColor = col(mixC([255, 214, 150], [96, 120, 126], light), 140);
        for (let i = 0; i < 8; i++) {
            rectD(g, 384 + i * 68, sy - 48, 26, 15);
            g.fill();
        }
    }
    drawWater(g, light, warm, sy) {
        const top = mixC(PAL.waterNight, PAL.waterDay, light);
        const bot = mixC(PAL.waterNightBot, PAL.waterDayBot, light);
        const topWarm = mixC(top, [236, 186, 140], warm * 0.3);
        // 顶边做成手绘波浪（网页版 waveAt：sy + sin(x*0.012 + t) * 5），
        // 填一段与水面顶色相同的条带，把平直的色带上沿盖成波浪形
        g.fillColor = col(topWarm);
        const waveY = (x) => sy + Math.sin(x * 0.012 + this.waveT) * 5;
        moveToD(g, 0, waveY(0));
        for (let x = 16; x <= DESIGN.w; x += 16) {
            lineToD(g, x, waveY(x));
        }
        lineToD(g, DESIGN.w, sy + 14);
        lineToD(g, 0, sy + 14);
        g.close();
        g.fill();
        const n = 48;
        const h = DESIGN.h - sy;
        const bh = h / n;
        for (let i = 0; i < n; i++) {
            const t = i / (n - 1);
            // 前 55% 过渡到中间色，再往深走
            const mid = mixC(topWarm, bot, 0.55);
            g.fillColor = col(t < 0.55 ? mixC(topWarm, mid, t / 0.55) : mixC(mid, bot, (t - 0.55) / 0.45));
            rectD(g, 0, sy + i * bh, DESIGN.w, bh + 0.6);
            g.fill();
        }
        // 水下的柔和光斑
        const a = 0.06 + 0.1 * light;
        for (let i = 0; i < 9; i++) {
            const cx2 = (i * 271 + 90) % DESIGN.w;
            const cy2 = sy + 70 + ((i * 137) % 380);
            const r = 40 + (i % 4) * 26;
            g.fillColor = new Color(255, 255, 255, Math.round(255 * a * 0.5));
            ellipseD(g, cx2, cy2, r, r);
            g.fill();
        }
    }
    drawShafts(g, light, warm, sy) {
        const alpha = Math.round(255 * 0.05 * light);
        if (alpha <= 1) {
            return;
        }
        g.fillColor = warm > 0.3 ? new Color(255, 226, 188, alpha) : new Color(255, 255, 255, alpha);
        for (let i = 0; i < 5; i++) {
            const x = 140 + i * 260;
            moveToD(g, x, sy);
            lineToD(g, x + 90, sy);
            lineToD(g, x + 210, DESIGN.h);
            lineToD(g, x + 20, DESIGN.h);
            g.close();
            g.fill();
        }
    }
    drawSeafloor(g, light) {
        g.fillColor = col(mixC([22, 44, 48], [150, 192, 184], light));
        moveToD(g, 0, TUNE.floorY);
        for (let x = 0; x <= DESIGN.w; x += 40) {
            lineToD(g, x, TUNE.floorY + Math.sin(x * 0.02) * 10 + 6);
        }
        lineToD(g, DESIGN.w, DESIGN.h);
        lineToD(g, 0, DESIGN.h);
        g.close();
        g.fill();
        const a = 0.05 + 0.06 * light;
        g.fillColor = new Color(255, 255, 255, Math.round(255 * a));
        for (let i = 0; i < 26; i++) {
            const x = (i * 137) % DESIGN.w;
            const y = TUNE.floorY + 30 + ((i * 53) % 60);
            circleD(g, x, y, 2 + (i % 3));
            g.fill();
        }
    }
    // ================= 滚动波纹 =================
    redrawWaves(light) {
        const g = this.waveG;
        const sy = TUNE.waterTop;
        g.clear();
        // 水线高光：双层，跨两倍宽度以便无缝滚动（透明度对齐网页版）
        const drawLine = (offsetY, amp, freq, width, baseA) => {
            g.strokeColor = new Color(255, 255, 255, Math.round(255 * baseA * (1 + light)));
            g.lineWidth = width;
            const startX = -DESIGN.w;
            const endX = DESIGN.w * 2;
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
            for (let x = -DESIGN.w; x <= DESIGN.w * 2; x += 20) {
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
