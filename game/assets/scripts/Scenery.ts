import { Node, Graphics, UITransform, Color } from 'cc';
import { DESIGN, TUNE } from './GameConfig';
import {
    PAL, col, scaled, lightAt, phaseOf, rectD, circleD, ellipseD, moveToD, lineToD,
} from './DayNight';

/**
 * 场景装饰：灯笼串、樱花枝、栏杆、栈道甲板与岸边带。
 *
 * 分成两层：
 *  - back：樱花 + 栏杆，画在角色身后
 *  - front：甲板 + 岸边米白带，画在鱼之后（压住水面）
 * 灯笼单独一层，靠轻微旋转做风摆。
 */
export class Scenery {
    readonly back: Node;
    readonly front: Node;
    private backG: Graphics;
    private frontG: Graphics;
    /** 灯笼层。GameRoot 需要拿它调整层级顺序 */
    readonly lanternNode: Node;
    private lanternG: Graphics;

    private acc = 0;
    private lastLight = -1;
    private swayT = 0;

    constructor(parent: Node) {
        this.back = new Node('SceneryBack');
        this.back.layer = parent.layer;
        this.back.addComponent(UITransform).setContentSize(DESIGN.w, DESIGN.h);
        this.back.setParent(parent);
        this.backG = this.back.addComponent(Graphics);

        // 灯笼：节点放在顶部中心，绕它旋转做风摆
        this.lanternNode = new Node('Lanterns');
        this.lanternNode.layer = parent.layer;
        this.lanternNode.addComponent(UITransform).setContentSize(DESIGN.w, 200);
        this.lanternNode.setParent(parent);
        this.lanternNode.setPosition(0, DESIGN.h / 2, 0);
        this.lanternG = this.lanternNode.addComponent(Graphics);

        this.front = new Node('Quay');
        this.front.layer = parent.layer;
        this.front.addComponent(UITransform).setContentSize(DESIGN.w, DESIGN.h);
        this.front.setParent(parent);
        this.frontG = this.front.addComponent(Graphics);

        this.redraw(0);
    }

    update(dt: number, clock: number): void {
        // 风摆：整排灯笼 ±0.6°
        this.swayT += dt;
        this.lanternNode.angle = Math.sin(this.swayT * 0.9) * 0.6;

        this.acc += dt;
        if (this.acc < 0.1) {
            return;
        }
        this.acc = 0;
        const light = lightAt(phaseOf(clock));
        if (Math.abs(light - this.lastLight) < 0.004 && this.lastLight >= 0) {
            return;
        }
        this.redraw(light);
    }

    private redraw(light: number): void {
        this.lastLight = light;
        this.drawBack(light);
        this.drawLanterns(light);
        this.drawQuay(light);
    }

    // ================= 樱花 + 栏杆 =================

    private drawBack(light: number): void {
        const g = this.backG;
        const k = 0.34 + 0.66 * light;
        g.clear();

        this.drawBlossoms(g, 0.55 + 0.45 * light);

        // ---- 栏杆 ----
        const topRail = 158;
        const botRail = 176;
        const deckTop = 184;

        // 立柱
        for (let x = 46; x < DESIGN.w; x += 148) {
            g.fillColor = scaled(PAL.woodDark, k);
            rectD(g, x - 6, topRail - 10, 12, deckTop - topRail + 10);
            g.fill();
            g.fillColor = scaled(PAL.woodLight, k);
            rectD(g, x - 8, topRail - 14, 16, 7);
            g.fill();
        }

        // 上下横栏
        g.fillColor = scaled(PAL.wood, k);
        rectD(g, -6, topRail, DESIGN.w + 12, 12);
        g.fill();
        g.fillColor = scaled(PAL.woodDark, k);
        rectD(g, -6, botRail, DESIGN.w + 12, 9);
        g.fill();

        // 栏上高光
        g.fillColor = new Color(255, 232, 196, Math.round(90 * k));
        rectD(g, 0, topRail + 1, DESIGN.w, 2);
        g.fill();
    }

    private drawBlossoms(g: Graphics, dim: number): void {
        const branch = (x0: number, y0: number, x1: number, y1: number, dir: number) => {
            g.strokeColor = new Color(104, 74, 58, Math.round(255 * 0.75 * dim));
            g.lineWidth = 7;
            g.lineCap = Graphics.LineCap.ROUND;
            moveToD(g, x0, y0);
            g.quadraticCurveTo(
                x0 + dir * 90 - DESIGN.w / 2, DESIGN.h / 2 - (y0 + 6),
                x1 - DESIGN.w / 2, DESIGN.h / 2 - y1,
            );
            g.stroke();

            g.lineWidth = 4;
            moveToD(g, x0 + dir * 60, y0 + 4);
            g.quadraticCurveTo(
                x0 + dir * 120 - DESIGN.w / 2, DESIGN.h / 2 - (y0 + 44),
                x0 + dir * 168 - DESIGN.w / 2, DESIGN.h / 2 - (y0 + 58),
            );
            g.stroke();

            const spots: [number, number, number][] = [
                [x0 + dir * 92, y0 + 14, 22], [x1 - dir * 10, y1 - 8, 26],
                [x0 + dir * 150, y0 + 52, 20], [x0 + dir * 40, y0 + 2, 17],
                [x1 - dir * 56, y1 + 10, 19], [x0 + dir * 122, y0 + 30, 15],
            ];
            for (const s of spots) {
                this.blossomCluster(g, s[0], s[1], s[2], dim);
            }
        };

        branch(-10, 6, 210, 128, 1);
        branch(DESIGN.w + 10, 6, DESIGN.w - 210, 128, -1);
    }

    private blossomCluster(g: Graphics, x: number, y: number, r: number, dim: number): void {
        const petals = 6;
        for (let i = 0; i < petals; i++) {
            const a = (i / petals) * Math.PI * 2 + x * 0.01;
            g.fillColor = new Color(246, 195, 206, Math.round(255 * 0.85 * dim));
            circleD(g, x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.5, r * 0.42);
            g.fill();
        }
        g.fillColor = new Color(255, 236, 240, Math.round(255 * 0.9 * dim));
        circleD(g, x, y, r * 0.3);
        g.fill();
        g.fillColor = new Color(226, 150, 166, Math.round(255 * 0.7 * dim));
        circleD(g, x, y, r * 0.14);
        g.fill();
    }

    // ================= 灯笼 =================

    private drawLanterns(light: number): void {
        const g = this.lanternG;
        g.clear();

        // 节点本身在屏幕顶部中心，局部 y=0 就是上边缘，往下是负方向
        const y0 = -20;
        const sag = 30;
        const n = 7;
        const ropeY = (t: number) => y0 - Math.sin(t * Math.PI) * sag;

        // 绳
        g.strokeColor = new Color(90, 68, 48, 140);
        g.lineWidth = 2;
        let first = true;
        for (let x = 0; x <= DESIGN.w; x += 12) {
            const lx = x - DESIGN.w / 2;
            const ly = ropeY(x / DESIGN.w);
            if (first) {
                g.moveTo(lx, ly);
                first = false;
            } else {
                g.lineTo(lx, ly);
            }
        }
        g.stroke();

        const glow = 0.45 + 0.55 * (1 - light);
        for (let i = 0; i < n; i++) {
            const t = (i + 0.5) / n;
            const x = t * DESIGN.w;
            this.drawLantern(g, x - DESIGN.w / 2, ropeY(t), glow);
        }
    }

    private drawLantern(g: Graphics, lx: number, topY: number, glow: number): void {
        const cy = topY - 26;
        const bw = 15;
        const bh = 19;

        // 光晕
        g.fillColor = new Color(255, 214, 150, Math.round(60 * glow));
        g.circle(lx, cy, 46);
        g.fill();
        g.fillColor = new Color(255, 214, 150, Math.round(70 * glow));
        g.circle(lx, cy, 30);
        g.fill();

        // 吊绳
        g.strokeColor = new Color(90, 68, 48, 180);
        g.lineWidth = 1.6;
        g.moveTo(lx, topY);
        g.lineTo(lx, cy + 15);
        g.stroke();

        // 灯身
        g.fillColor = new Color(255, 221, 166, 255);
        g.ellipse(lx, cy, bw, bh);
        g.fill();
        g.fillColor = new Color(232, 167, 101, 140);
        g.ellipse(lx - bw * 0.45, cy, bw * 0.5, bh);
        g.fill();
        g.ellipse(lx + bw * 0.45, cy, bw * 0.5, bh);
        g.fill();

        // 上下箍
        g.fillColor = new Color(138, 95, 58, 255);
        g.roundRect(lx - 8, cy + bh - 3, 16, 5, 2);
        g.fill();
        g.roundRect(lx - 8, cy - bh - 2, 16, 5, 2);
        g.fill();

        // 流苏
        g.strokeColor = new Color(180, 90, 70, 190);
        g.lineWidth = 1.8;
        g.moveTo(lx, cy - bh - 3);
        g.lineTo(lx, cy - bh - 12);
        g.stroke();
    }

    // ================= 甲板 + 岸边带 =================

    private drawQuay(light: number): void {
        const g = this.frontG;
        const k = 0.34 + 0.66 * light;
        const deckTop = 184;
        const deckBot = 199;
        const bandBot = 210;
        g.clear();

        // 甲板
        g.fillColor = scaled(PAL.wood, k);
        rectD(g, -2, deckTop, DESIGN.w + 4, deckBot - deckTop);
        g.fill();
        g.fillColor = scaled(PAL.woodLight, k);
        rectD(g, 0, deckTop, DESIGN.w, 3);
        g.fill();

        // 板缝
        g.strokeColor = new Color(80, 56, 36, Math.round(90 * k));
        g.lineWidth = 1.6;
        for (let x = 0; x < DESIGN.w; x += 92) {
            moveToD(g, x, deckTop + 3);
            lineToD(g, x, deckBot - 2);
            g.stroke();
        }

        // 岸边米白带（底边做成手绘波浪）
        g.fillColor = scaled(PAL.shore, k);
        moveToD(g, -2, deckBot);
        for (let x = -2; x <= DESIGN.w + 2; x += 12) {
            lineToD(g, x, bandBot + Math.sin(x * 0.02) * 3);
        }
        lineToD(g, DESIGN.w + 2, deckBot);
        g.close();
        g.fill();

        // 下缘阴影
        g.strokeColor = new Color(90, 120, 112, Math.round(50 * k));
        g.lineWidth = 4;
        let first = true;
        for (let x = -2; x <= DESIGN.w + 2; x += 12) {
            const y = bandBot + Math.sin(x * 0.02) * 3 + 3;
            if (first) {
                moveToD(g, x, y);
                first = false;
            } else {
                lineToD(g, x, y);
            }
        }
        g.stroke();
    }
}
