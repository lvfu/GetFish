import { Node, Graphics, UITransform, Color, Label, HorizontalTextAlignment, VerticalTextAlignment, view, sys, screen, } from 'cc';
import { DESIGN, VIEW } from './GameConfig.js';
import { PAL, col, rectD, roundRectD, circleD } from './DayNight.js';
/**
 * 竖屏提示层。
 *
 * 手机浏览器打开时大概率是竖屏，而游戏是按横屏设计的（FIXED_HEIGHT：高恒 720）。
 * 竖屏下可见宽度只剩 `720 × 屏宽/屏高`（390×844 的手机约 333），
 * HUD 会挤成一团、鱼也没地方游，所以竖屏时用一层提示盖住，
 * 等玩家把手机横过来（触发 resize）再自动开始。
 *
 * 「全屏并横屏」按钮只在浏览器里出现：
 * 先 `screen.requestFullScreen()`，再试 `screen.orientation.lock('landscape')`。
 * Android Chrome 有效；iOS Safari 不支持锁方向，只能提示玩家手动转。
 *
 * 微信小游戏不需要这层：打包时把 `deviceOrientation` 设成 landscape，平台会自己转。
 */
const BTN_W = 220;
const BTN_H = 52;
export class OrientationGate {
    constructor(parent) {
        this.blocked = false;
        this.btnRect = { x: 0, y: 0, w: BTN_W, h: BTN_H };
        this.node = new Node('Orientation');
        this.node.layer = parent.layer;
        this.node.addComponent(UITransform).setContentSize(DESIGN.w, DESIGN.h);
        this.node.setParent(parent);
        this.g = this.node.addComponent(Graphics);
        this.lbTitle = this.makeLabel('请把手机横过来', 26, new Color(47, 59, 58, 255), true);
        this.lbBody = this.makeLabel('横屏才能铺满整个鱼塘', 18, new Color(47, 59, 58, 205), false);
        this.lbHint = this.makeLabel('转成横屏后会自动开始', 15, new Color(47, 59, 58, 140), false);
        // 按钮：只在浏览器里能全屏时才显示
        this.btn = new Node('GateBtn');
        this.btn.layer = parent.layer;
        this.btn.addComponent(UITransform).setContentSize(BTN_W, BTN_H);
        this.btn.setParent(this.node);
        this.btnG = this.btn.addComponent(Graphics);
        this.lbBtn = this.makeLabel('全屏并横屏', 20, new Color(248, 241, 222, 255), true);
        this.lbBtn.node.setParent(this.btn);
        this.lbBtn.node.setPosition(0, 0, 0);
        this.node.active = false;
    }
    /** 竖屏时游戏暂停、输入被吃掉 */
    get isBlocked() {
        return this.blocked;
    }
    /** 每次 resize 都要调一次：竖屏显示、横屏自动收起 */
    check() {
        const vs = view.getVisibleSize();
        const portrait = !!vs && vs.height > vs.width + 1;
        this.blocked = portrait;
        this.node.active = portrait;
        if (portrait) {
            this.layout();
        }
        return portrait;
    }
    /** 点按钮：请求全屏 + 尝试锁横屏 */
    tap(x, y) {
        if (!this.blocked || !this.btn.active) {
            return;
        }
        const r = this.btnRect;
        if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) {
            return;
        }
        void this.goFullscreen();
    }
    async goFullscreen() {
        try {
            if (!screen.fullScreen()) {
                await screen.requestFullScreen();
            }
        }
        catch (e) {
            // 用户拒绝 / 浏览器不支持，保持提示层
        }
        try {
            // 只在浏览器里有 screen.orientation；小游戏 / iOS Safari 会抛异常
            const g = globalThis;
            const lock = g.screen && g.screen.orientation && g.screen.orientation.lock;
            if (lock) {
                await lock.call(g.screen.orientation, 'landscape');
            }
        }
        catch (e) {
            // iOS 不支持锁方向，玩家手动转
        }
        // 全屏 / 转向后尺寸会变，立刻重判一次
        this.check();
    }
    // ================= 绘制 =================
    layout() {
        const cx = (VIEW.left + VIEW.right) / 2;
        const w = Math.min(560, VIEW.w - 40);
        const h = Math.min(320, DESIGN.h - 80);
        const x = cx - w / 2;
        const y = (DESIGN.h - h) / 2;
        const g = this.g;
        g.clear();
        // 压暗整块可见区域
        g.fillColor = new Color(18, 28, 30, 218);
        rectD(g, VIEW.left - 60, -60, VIEW.w + 120, DESIGN.h + 120);
        g.fill();
        // 米色牌匾：和 HUD 同一套样式
        g.fillColor = new Color(0, 0, 0, 40);
        roundRectD(g, x + 3, y + 4, w, h, 14);
        g.fill();
        g.fillColor = col(PAL.plaque);
        roundRectD(g, x, y, w, h, 14);
        g.fill();
        g.strokeColor = col(PAL.woodDark);
        g.lineWidth = 3;
        roundRectD(g, x, y, w, h, 14);
        g.stroke();
        g.strokeColor = new Color(201, 161, 90, 210);
        g.lineWidth = 1.2;
        roundRectD(g, x + 6, y + 6, w - 12, h - 12, 10);
        g.stroke();
        // 示意图：一台「躺下来」的手机（横放的圆角矩形 + 听筒），一眼看懂要横屏
        const iconW = 46;
        const iconH = 26;
        const ix = cx - iconW / 2;
        const iy = y + 46;
        g.fillColor = new Color(248, 241, 222, 255);
        roundRectD(g, ix, iy, iconW, iconH, 6);
        g.fill();
        g.strokeColor = col(PAL.woodDark);
        g.lineWidth = 2.4;
        roundRectD(g, ix, iy, iconW, iconH, 6);
        g.stroke();
        g.fillColor = new Color(201, 161, 90, 235);
        circleD(g, ix + 7, iy + iconH / 2, 2.6);
        g.fill();
        g.strokeColor = new Color(201, 161, 90, 200);
        g.lineWidth = 1.6;
        g.roundRect(ix - DESIGN.w / 2 + 14, DESIGN.h / 2 - (iy + iconH) + 5, iconW - 28, iconH - 10, 3);
        g.stroke();
        // 文字
        this.lbTitle.node.setPosition(cx - DESIGN.w / 2, DESIGN.h / 2 - (y + 124), 0);
        this.lbBody.node.setPosition(cx - DESIGN.w / 2, DESIGN.h / 2 - (y + 176), 0);
        this.lbHint.node.setPosition(cx - DESIGN.w / 2, DESIGN.h / 2 - (y + h - 34), 0);
        // 按钮
        const canFs = !!sys.isBrowser && !!screen.supportsFullScreen;
        this.btn.active = canFs;
        const bx = cx - BTN_W / 2;
        const by = y + h - 104;
        this.btnRect = { x: bx, y: by, w: BTN_W, h: BTN_H };
        this.btn.setPosition(bx + BTN_W / 2 - DESIGN.w / 2, DESIGN.h / 2 - (by + BTN_H / 2), 0);
        if (canFs) {
            // 注意：btnG 挂在按钮节点上，坐标是「按钮自身」的局部坐标，不能用 D 系列工具
            const bg = this.btnG;
            bg.clear();
            bg.fillColor = col(PAL.wood);
            bg.roundRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, 12);
            bg.fill();
            bg.strokeColor = new Color(95, 70, 47, 220);
            bg.lineWidth = 2;
            bg.roundRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, 12);
            bg.stroke();
        }
    }
    makeLabel(text, size, color, bold) {
        const n = new Node('L');
        n.layer = this.node.layer;
        const ut = n.addComponent(UITransform);
        ut.setAnchorPoint(0.5, 0.5);
        n.setParent(this.node);
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = size;
        l.lineHeight = size + 8;
        l.isBold = bold;
        l.color = color;
        l.horizontalAlign = HorizontalTextAlignment.CENTER;
        l.verticalAlign = VerticalTextAlignment.CENTER;
        return l;
    }
}
