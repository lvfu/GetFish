import { Node, Graphics, UITransform, Color, Label, HorizontalTextAlignment, VerticalTextAlignment } from 'cc';
import { DESIGN, VIEW } from './GameConfig';
import { PAL, col, rectD, roundRectD, circleD, ellipseD, moveToD, lineToD } from './DayNight';

/**
 * HUD 与结算面板。
 *
 * 样式按视觉方案重做过一版：原来是「米色木牌匾 + 金线 + 圆钉」的新中式，
 * 压在亮蓝的天空上又土又闷；现在是**绿色胶囊 + 白色圆角卡片**，
 * 底板一次画死，数值用 Label 每帧改字符串（不重建底板）。
 *
 * 三处布局约束：
 *  - 左下一排的宽度必须收在 192px 以内 —— 换装按钮钉在 `VIEW.left + 200`，
 *    卡片再宽就会把它盖住；
 *  - 时间卡贴**可见区域**的右边缘（VIEW.right），不是设计宽度的右边缘：
 *    工程按 FIXED_HEIGHT 适配，宽屏上可见范围比 1280 宽，写死 DESIGN.w 会浮在画面中间；
 *  - 牌匾全部画在不透明底上，所以字可以固定用深色，不用跟着昼夜换色。
 */

const PAD = 24;
const LV = { w: 104, h: 34, y: 14 };
const TARGET = { w: 168, h: 68, y: 58 };
const COIN = { w: 120, h: 38, y: 134 };
const TIME = { w: 156, h: 58, y: 14, barY: 78 };

export class Hud {
    readonly node: Node;
    private g: Graphics;

    private lbTarget!: Label;
    private lbCoin!: Label;
    private lbLevel!: Label;
    private lbTime!: Label;
    private t1!: Label;
    private barG!: Graphics;
    private barNode!: Node;

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

    constructor(parent: Node) {
        this.node = new Node('Hud');
        this.node.layer = parent.layer;
        this.node.addComponent(UITransform).setContentSize(DESIGN.w, DESIGN.h);
        this.node.setParent(parent);
        this.g = this.node.addComponent(Graphics);

        // 时间条单独一个节点：位置跟可见宽度走，重排时只清它一个
        this.barNode = new Node('TimeBar');
        this.barNode.layer = this.node.layer;
        this.barNode.addComponent(UITransform).setContentSize(DESIGN.w, DESIGN.h);
        this.barNode.setParent(this.node);
        this.barG = this.barNode.addComponent(Graphics);

        this.drawPlaques();
        this.buildLabels();
        this.buildOverlay();
    }

    /** 可见宽度变了：底板和文字重新摆一遍 */
    relayout(): void {
        this.drawPlaques();
        this.layoutLabels();
        this.lastFrac = -1; // 强制下一帧重画时间条
    }

    // ================= 底板 =================

    /** 白色圆角卡片：底下垫一层软阴影，上面留 1px 内高光 */
    private card(x: number, y: number, w: number, h: number, r: number): void {
        const g = this.g;
        g.fillColor = new Color(26, 64, 70, 38);
        roundRectD(g, x + 1, y + 3, w, h, r);
        g.fill();
        g.fillColor = new Color(255, 255, 255, 238);
        roundRectD(g, x, y, w, h, r);
        g.fill();
        g.strokeColor = new Color(214, 240, 216, 255);
        g.lineWidth = 2;
        roundRectD(g, x, y, w, h, r);
        g.stroke();
    }

    private drawPlaques(): void {
        const g = this.g;
        g.clear();
        const lx = VIEW.left + PAD;
        const rx = VIEW.right - PAD;

        // ---- 1. 关卡：绿色胶囊 ----
        g.fillColor = new Color(26, 64, 70, 34);
        roundRectD(g, lx + 1, LV.y + 3, LV.w, LV.h, LV.h / 2);
        g.fill();
        g.fillColor = col(PAL.green);
        roundRectD(g, lx, LV.y, LV.w, LV.h, LV.h / 2);
        g.fill();
        // 顶部那道浅色高光，让胶囊看起来是鼓的
        g.fillColor = new Color(255, 255, 255, 58);
        roundRectD(g, lx + 4, LV.y + 3, LV.w - 8, 12, 6);
        g.fill();

        // ---- 2. 通关目标：白卡 + 底部进度条底槽 ----
        this.card(lx, TARGET.y, TARGET.w, TARGET.h, 16);
        g.fillColor = new Color(226, 242, 228, 255);
        roundRectD(g, lx + 16, TARGET.y + 54, TARGET.w - 32, 6, 3);
        g.fill();

        // ---- 3. 金币：白胶囊 + 金币 ----
        this.card(lx, COIN.y, COIN.w, COIN.h, COIN.h / 2);
        g.fillColor = col(PAL.gold);
        circleD(g, lx + 23, COIN.y + COIN.h / 2, 12);
        g.fill();
        g.strokeColor = new Color(216, 160, 46, 255);
        g.lineWidth = 2;
        circleD(g, lx + 23, COIN.y + COIN.h / 2, 12);
        g.stroke();
        g.fillColor = new Color(255, 246, 206, 240);
        ellipseD(g, lx + 19, COIN.y + COIN.h / 2 - 4, 4, 3);
        g.fill();

        // ---- 4. 时间：白卡 + 表盘 ----
        const tx = rx - TIME.w;
        this.card(tx, TIME.y, TIME.w, TIME.h, 16);
        const cx = tx + 28;
        const cy = TIME.y + TIME.h / 2;
        g.fillColor = col(PAL.greenLight);
        circleD(g, cx, cy, 14);
        g.fill();
        g.strokeColor = col(PAL.green);
        g.lineWidth = 2.4;
        circleD(g, cx, cy, 14);
        g.stroke();
        g.lineCap = Graphics.LineCap.ROUND;
        g.lineWidth = 2.2;
        moveToD(g, cx, cy);
        lineToD(g, cx, cy - 8);
        g.stroke();
        moveToD(g, cx, cy);
        lineToD(g, cx + 6.5, cy + 3);
        g.stroke();

        // 时间条底槽
        g.fillColor = new Color(226, 242, 228, 255);
        roundRectD(g, tx, TIME.barY, TIME.w, 6, 3);
        g.fill();
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
        const green = col(PAL.greenDark);

        this.t1 = this.makeLabel('通关目标', 13, new Color(green.r, green.g, green.b, 210), HorizontalTextAlignment.LEFT);
        this.lbTarget = this.makeLabel('0 / 600', 26, ink, HorizontalTextAlignment.LEFT);
        this.lbCoin = this.makeLabel('0', 22, ink, HorizontalTextAlignment.LEFT);
        this.lbLevel = this.makeLabel('第 1 关', 17, new Color(255, 255, 255, 255), HorizontalTextAlignment.CENTER);
        this.lbTime = this.makeLabel('1:00', 30, ink, HorizontalTextAlignment.LEFT);

        this.layoutLabels();
    }

    /** 文字按可见区域的左右边缘摆：窄屏时左边一组不会被切掉 */
    private layoutLabels(): void {
        const lx = VIEW.left + PAD;
        const rx = VIEW.right - PAD;
        const cy = DESIGN.h / 2;

        this.lbLevel.node.setPosition(lx + LV.w / 2 - DESIGN.w / 2, cy - (LV.y + LV.h / 2), 0);
        this.t1.node.setPosition(lx + 16 - DESIGN.w / 2, cy - (TARGET.y + 18), 0);
        this.lbTarget.node.setPosition(lx + 16 - DESIGN.w / 2, cy - (TARGET.y + 38), 0);
        this.lbCoin.node.setPosition(lx + 42 - DESIGN.w / 2, cy - (COIN.y + COIN.h / 2), 0);
        this.lbTime.node.setPosition(rx - TIME.w + 54 - DESIGN.w / 2, cy - (TIME.y + TIME.h / 2), 0);
    }

    // ================= 每帧更新 =================

    updateHud(score: number, target: number, level: number, timeLeft: number, total: number): void {
        if (score !== this.lastScore || target !== this.lastTarget) {
            this.lastScore = score;
            this.lastTarget = target;
            this.lbTarget.string = `${score} / ${target}`;
            this.lbCoin.string = `${score}`;
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
            this.lbTime.color = low ? new Color(214, 82, 74, 255) : col(PAL.ink);
        }

        // 两条进度只在刻度变化时重绘，省掉每帧重建 Graphics
        const frac = Math.max(0, Math.min(1, timeLeft / total));
        if (Math.abs(frac - this.lastFrac) < 0.004 && this.lastFrac >= 0) {
            return;
        }
        this.lastFrac = frac;
        const g = this.barG;
        g.clear();

        // 时间条
        const tx = VIEW.right - PAD - TIME.w;
        g.fillColor = low ? new Color(214, 82, 74, 255) : col(PAL.green);
        roundRectD(g, tx, TIME.barY, TIME.w * frac, 6, 3);
        g.fill();

        // 目标进度条（画在目标卡里那条底槽上）
        const lx = VIEW.left + PAD;
        const goal = this.lastTarget > 0 ? Math.min(1, this.lastScore / this.lastTarget) : 0;
        g.fillColor = col(PAL.green);
        roundRectD(g, lx + 16, TARGET.y + 54, (TARGET.w - 32) * goal, 6, 3);
        g.fill();
    }

    // ================= 结算面板 =================

    private buildOverlay(): void {
        this.overlay = new Node('Overlay');
        this.overlay.layer = this.node.layer;
        this.overlay.addComponent(UITransform).setContentSize(DESIGN.w, DESIGN.h);
        this.overlay.setParent(this.node);
        const g = this.overlay.addComponent(Graphics);

        // 压暗
        g.fillColor = new Color(18, 44, 56, 130);
        rectD(g, 0, 0, DESIGN.w, DESIGN.h);
        g.fill();

        const pw = 560;
        const ph = 320;
        const px = (DESIGN.w - pw) / 2;
        const py = (DESIGN.h - ph) / 2;

        // 白色圆角面板
        g.fillColor = new Color(16, 40, 50, 70);
        roundRectD(g, px + 2, py + 6, pw, ph, 24);
        g.fill();
        g.fillColor = new Color(255, 255, 255, 250);
        roundRectD(g, px, py, pw, ph, 24);
        g.fill();
        g.strokeColor = new Color(214, 240, 216, 255);
        g.lineWidth = 3;
        roundRectD(g, px, py, pw, ph, 24);
        g.stroke();

        // 顶部绿色标题带（压在面板上沿，做出「卡片标签」的感觉）
        const bw = 300;
        const bh = 58;
        g.fillColor = new Color(16, 40, 50, 60);
        roundRectD(g, (DESIGN.w - bw) / 2 + 1, py - 24, bw, bh, 29);
        g.fill();
        g.fillColor = col(PAL.green);
        roundRectD(g, (DESIGN.w - bw) / 2, py - 27, bw, bh, 29);
        g.fill();
        g.fillColor = new Color(255, 255, 255, 58);
        roundRectD(g, (DESIGN.w - bw) / 2 + 6, py - 24, bw - 12, 18, 9);
        g.fill();

        this.ovTitle = this.makeLabel('', 34, new Color(255, 255, 255, 255), HorizontalTextAlignment.CENTER);
        this.ovTitle.node.setPosition(0, DESIGN.h / 2 - (py + 2), 0);

        this.ovBody = this.makeLabel('', 21, new Color(38, 62, 70, 235), HorizontalTextAlignment.CENTER);
        this.ovBody.node.setPosition(0, DESIGN.h / 2 - (py + 150), 0);

        this.ovHint = this.makeLabel('', 16, new Color(44, 112, 56, 190), HorizontalTextAlignment.CENTER);
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
        // 5 行以上按 34px 行距会顶到提示语上，收一点行距并把整块往上挪
        const many = lines.length >= 5;
        const lh = many ? 28 : 34;
        const top = many ? 132 : 142;
        this.ovBody.lineHeight = lh;
        // 第一行固定画在 py+top，多行往下排；Label 整体居中，所以
        // 中心要下移 (n-1)/2 行
        const py = (DESIGN.h - 320) / 2;
        this.ovBody.node.setPosition(0, DESIGN.h / 2 - (py + top + ((lines.length - 1) * lh) / 2), 0);
        this.ovHint.string = hint;
        this.overlay.active = true;
    }

    hideOverlay(): void {
        this.overlay.active = false;
    }
}

