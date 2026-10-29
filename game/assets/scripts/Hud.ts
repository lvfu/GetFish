import { Node, Graphics, UITransform, Color, Label, HorizontalTextAlignment, VerticalTextAlignment } from 'cc';
import { DESIGN } from './GameConfig';
import { PAL, col, rectD, roundRectD, circleD, moveToD, lineToD } from './DayNight';

/**
 * HUD 与结算面板。全部走「米色牌匾 + 墨字」的新中式样式：
 * 底板用 Graphics 画一次，数值用 Label 每帧改字符串（不重建底板）。
 */
export class Hud {
    readonly node: Node;
    private g: Graphics;

    private lbTarget!: Label;
    private lbCoin!: Label;
    private lbLevel!: Label;
    private lbTime!: Label;
    private barG!: Graphics;

    private overlay!: Node;
    private ovTitle!: Label;
    private ovBody!: Label;
    private ovHint!: Label;

    private lastScore = -1;
    private lastTarget = -1;
    private lastLevel = -1;
    private lastTime = '';
    private lastLow = false;
    private lastFrac = -1;
    private lastDim = false;

    constructor(parent: Node) {
        this.node = new Node('Hud');
        this.node.layer = parent.layer;
        this.node.addComponent(UITransform).setContentSize(DESIGN.w, DESIGN.h);
        this.node.setParent(parent);
        this.g = this.node.addComponent(Graphics);

        this.drawPlaques();
        this.buildLabels();
        this.buildOverlay();
    }

    // ================= 底板 =================

    /** 米色牌匾：木框 + 金线 + 两端圆钉 */
    private plaque(x: number, y: number, w: number, h: number): void {
        const g = this.g;

        g.fillColor = new Color(70, 52, 32, 46);
        roundRectD(g, x + 2, y + 3, w, h, 9);
        g.fill();

        g.fillColor = col(PAL.plaque);
        roundRectD(g, x, y, w, h, 9);
        g.fill();

        g.strokeColor = col(PAL.woodDark);
        g.lineWidth = 3;
        roundRectD(g, x, y, w, h, 9);
        g.stroke();

        g.strokeColor = new Color(201, 161, 90, 217);
        g.lineWidth = 1.2;
        roundRectD(g, x + 4.5, y + 4.5, w - 9, h - 9, 6);
        g.stroke();

        g.fillColor = new Color(139, 106, 74, 217);
        circleD(g, x + 10, y + h / 2, 2.4);
        g.fill();
        circleD(g, x + w - 10, y + h / 2, 2.4);
        g.fill();
    }

    private drawPlaques(): void {
        this.plaque(24, 20, 268, 48);          // 通关目标
        this.plaque(24, 78, 168, 42);          // 金币
        this.plaque(DESIGN.w - 200, 20, 176, 48);  // 时间

        // 金币图标
        this.g.fillColor = new Color(196, 142, 54, 242);
        circleD(this.g, 50, 99, 11);
        this.g.fill();
        this.g.strokeColor = new Color(140, 96, 30, 230);
        this.g.lineWidth = 2;
        circleD(this.g, 50, 99, 11);
        this.g.stroke();

        // 时间条底
        const barNode = new Node('TimeBar');
        barNode.layer = this.node.layer;
        barNode.addComponent(UITransform).setContentSize(DESIGN.w, DESIGN.h);
        barNode.setParent(this.node);
        this.barG = barNode.addComponent(Graphics);
    }

    private makeLabel(text: string, size: number, color: Color, align: HorizontalTextAlignment): Label {
        const n = new Node('L');
        n.layer = this.node.layer;
        const ut = n.addComponent(UITransform);
        ut.setAnchorPoint(align === HorizontalTextAlignment.CENTER ? 0.5 : 0, 0.5);
        n.setParent(this.node);
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = size;
        l.lineHeight = size + 6;
        l.color = color;
        l.horizontalAlign = align;
        l.verticalAlign = VerticalTextAlignment.CENTER;
        return l;
    }

    private buildLabels(): void {
        const ink = col(PAL.ink);

        const t1 = this.makeLabel('通关目标', 19, new Color(120, 96, 64, 230), HorizontalTextAlignment.LEFT);
        t1.node.setPosition(24 + 22 - DESIGN.w / 2, DESIGN.h / 2 - 44, 0);

        this.lbTarget = this.makeLabel('0 / 600', 26, ink, HorizontalTextAlignment.LEFT);
        this.lbTarget.node.setPosition(24 + 116 - DESIGN.w / 2, DESIGN.h / 2 - 44, 0);

        this.lbCoin = this.makeLabel('金币 0', 22, ink, HorizontalTextAlignment.LEFT);
        this.lbCoin.node.setPosition(24 + 46 - DESIGN.w / 2, DESIGN.h / 2 - 99, 0);

        this.lbLevel = this.makeLabel('第 1 关', 17, new Color(47, 59, 58, 190), HorizontalTextAlignment.LEFT);
        this.lbLevel.node.setPosition(24 + 4 - DESIGN.w / 2, DESIGN.h / 2 - 142, 0);

        this.lbTime = this.makeLabel('1:00', 28, ink, HorizontalTextAlignment.LEFT);
        this.lbTime.node.setPosition(DESIGN.w - 200 + 52 - DESIGN.w / 2, DESIGN.h / 2 - 44, 0);
    }

    // ================= 每帧更新 =================

    updateHud(score: number, target: number, level: number, timeLeft: number, total: number): void {
        if (score !== this.lastScore || target !== this.lastTarget) {
            this.lastScore = score;
            this.lastTarget = target;
            this.lbTarget.string = `${score} / ${target}`;
            this.lbCoin.string = `金币 ${score}`;
        }
        if (level !== this.lastLevel) {
            this.lastLevel = level;
            this.lbLevel.string = `第 ${level} 关`;
        }

        const low = timeLeft <= 10;
        const mm = Math.floor(Math.max(0, timeLeft) / 60);
        const ss = Math.ceil(Math.max(0, timeLeft) % 60);
        const txt = `${mm}:${ss < 10 ? '0' + ss : ss}`;
        if (txt !== this.lastTime || low !== this.lastLow) {
            this.lastTime = txt;
            this.lastLow = low;
            this.lbTime.string = txt;
            this.lbTime.color = low ? new Color(192, 69, 62, 255) : col(PAL.ink);
        }

        // 时间条：只在刻度变化时重绘，省掉每帧重建 Graphics
        const frac = Math.max(0, Math.min(1, timeLeft / total));
        if (Math.abs(frac - this.lastFrac) < 0.004 && low === this.lastLow && this.lastFrac >= 0) {
            return;
        }
        this.lastFrac = frac;
        const g = this.barG;
        g.clear();
        const bw = 156;
        const bx = DESIGN.w - 190;
        const by = 76;
        g.fillColor = new Color(90, 70, 48, 56);
        roundRectD(g, bx, by, bw, 7, 3.5);
        g.fill();
        g.fillColor = low ? new Color(192, 69, 62, 255) : new Color(111, 174, 158, 255);
        roundRectD(g, bx, by, bw * frac, 7, 3.5);
        g.fill();
    }

    /**
     * 关卡名没有牌匾托底，直接压在水面上，夜里必须换成米白才看得见。
     * 三块牌匾上的数值不受影响（米色底 + 墨字，昼夜都清楚）。
     */
    setLight(light: number): void {
        const dim = light < 0.45;
        if (dim === this.lastDim) {
            return;
        }
        this.lastDim = dim;
        this.lbLevel.color = dim ? new Color(238, 241, 232, 205) : new Color(47, 59, 58, 190);
    }

    // ================= 结算面板 =================

    private buildOverlay(): void {
        this.overlay = new Node('Overlay');
        this.overlay.layer = this.node.layer;
        this.overlay.addComponent(UITransform).setContentSize(DESIGN.w, DESIGN.h);
        this.overlay.setParent(this.node);
        const g = this.overlay.addComponent(Graphics);

        // 压暗
        g.fillColor = new Color(30, 40, 40, 107);
        rectD(g, 0, 0, DESIGN.w, DESIGN.h);
        g.fill();

        const pw = 580;
        const ph = 330;
        const px = (DESIGN.w - pw) / 2;
        const py = (DESIGN.h - ph) / 2;

        // 卷轴主体
        g.fillColor = new Color(70, 52, 32, 56);
        roundRectD(g, px + 3, py + 5, pw, ph, 14);
        g.fill();
        g.fillColor = col(PAL.plaque);
        roundRectD(g, px, py, pw, ph, 14);
        g.fill();
        g.strokeColor = col(PAL.woodDark);
        g.lineWidth = 3.5;
        roundRectD(g, px, py, pw, ph, 14);
        g.stroke();
        g.strokeColor = new Color(201, 161, 90, 230);
        g.lineWidth = 1.4;
        roundRectD(g, px + 7, py + 7, pw - 14, ph - 14, 10);
        g.stroke();

        // 上下轴头
        for (const y of [py - 6, py + ph - 12]) {
            g.fillColor = col(PAL.woodLight);
            roundRectD(g, px - 12, y, pw + 24, 18, 9);
            g.fill();
            g.strokeColor = new Color(60, 42, 26, 150);
            g.lineWidth = 1.5;
            roundRectD(g, px - 12, y, pw + 24, 18, 9);
            g.stroke();
        }

        this.ovTitle = this.makeLabel('', 42, new Color(138, 90, 44, 255), HorizontalTextAlignment.CENTER);
        this.ovTitle.node.setPosition(0, DESIGN.h / 2 - (py + 72), 0);

        this.ovBody = this.makeLabel('', 21, new Color(47, 59, 58, 230), HorizontalTextAlignment.CENTER);
        this.ovBody.node.setPosition(0, DESIGN.h / 2 - (py + 158), 0);

        this.ovHint = this.makeLabel('', 17, new Color(47, 59, 58, 128), HorizontalTextAlignment.CENTER);
        this.ovHint.node.setPosition(0, DESIGN.h / 2 - (py + ph - 34), 0);

        // 把 label 挪到 overlay 下，隐藏时一起隐藏
        this.ovTitle.node.setParent(this.overlay);
        this.ovBody.node.setParent(this.overlay);
        this.ovHint.node.setParent(this.overlay);

        this.overlay.active = false;
    }

    showOverlay(title: string, lines: string[], hint: string): void {
        this.ovTitle.string = title;
        this.ovBody.string = lines.join('\n');
        this.ovBody.lineHeight = 34;
        // 网页版第一行固定画在 py+158，多行往下排；Label 整体居中，所以
        // 中心要下移 (n-1)/2 行
        const py = (DESIGN.h - 330) / 2;
        this.ovBody.node.setPosition(0, DESIGN.h / 2 - (py + 158 + (lines.length - 1) * 17), 0);
        this.ovHint.string = hint;
        this.overlay.active = true;
    }

    hideOverlay(): void {
        this.overlay.active = false;
    }
}
