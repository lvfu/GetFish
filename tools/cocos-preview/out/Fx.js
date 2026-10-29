import { Node, Graphics, UITransform, Color, Label, HorizontalTextAlignment, VerticalTextAlignment, } from 'cc';
import { DESIGN, px, py } from './GameConfig.js';
/**
 * 特效层：钩中鱼的涟漪 + 得分飘字。
 * 对应网页版 game.js 的 S.ripples / S.popups（drawFX），参数保持一致：
 *  - 涟漪：半径 6 起步，60px/s 扩散，存活 0.4s，颜色 #f2fffa
 *  - 飘字：46px/s 上浮，存活 0.9s，金字 #ffc94a + 墨色描边
 */
export class Fx {
    constructor(parent) {
        this.ripples = [];
        this.popups = [];
        this.node = new Node('Fx');
        this.node.layer = parent.layer;
        this.node.addComponent(UITransform).setContentSize(DESIGN.w, DESIGN.h);
        this.node.setParent(parent);
        this.g = this.node.addComponent(Graphics);
    }
    /** 钩中鱼时的水纹 */
    ripple(x, y) {
        this.ripples.push({ x, y, r: 6, life: 0.4 });
    }
    /** 得分飘字（挂在竿尖下方，和网页版一致） */
    popup(x, y, text) {
        const n = new Node('popup');
        n.layer = this.node.layer;
        n.addComponent(UITransform);
        n.setParent(this.node);
        n.setPosition(px(x), py(y), 0);
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = 26;
        l.lineHeight = 30;
        l.isBold = true;
        l.color = new Color(255, 201, 74, 255);
        // 网页版：金色字 + 墨色描边（3.8.2+ 的属性式 API）
        l.enableOutline = true;
        l.outlineColor = new Color(47, 59, 58, 204);
        l.outlineWidth = 4;
        l.horizontalAlign = HorizontalTextAlignment.CENTER;
        l.verticalAlign = VerticalTextAlignment.CENTER;
        this.popups.push({ node: n, label: l, life: 0.9 });
    }
    update(dt) {
        for (const r of this.ripples) {
            r.life -= dt;
            r.r += 60 * dt;
        }
        this.ripples = this.ripples.filter((r) => r.life > 0);
        for (const p of this.popups) {
            p.life -= dt;
            const pos = p.node.position;
            p.node.setPosition(pos.x, pos.y + 46 * dt, 0);
            const a = Math.max(0, Math.min(1, p.life * 1.6));
            p.label.color = new Color(255, 201, 74, Math.round(255 * a));
        }
        const kept = [];
        for (const p of this.popups) {
            if (p.life <= 0) {
                p.node.destroy();
            }
            else {
                kept.push(p);
            }
        }
        this.popups = kept;
        // 涟漪重绘（没有涟漪时清一次即可）
        const g = this.g;
        g.clear();
        for (const r of this.ripples) {
            g.strokeColor = new Color(242, 255, 250, Math.round(255 * Math.max(0, r.life) * 1.6));
            g.lineWidth = 2;
            g.circle(px(r.x), py(r.y), r.r);
            g.stroke();
        }
    }
}
