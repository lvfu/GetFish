import { Node, Graphics, UITransform, Color } from 'cc';
import { DESIGN, TUNE } from './GameConfig.js';
import { circleD } from './DayNight.js';
/** 上浮的气泡，纯装饰 */
export class Bubbles {
    constructor(parent, count = 24) {
        this.items = [];
        this.node = new Node('Bubbles');
        this.node.layer = parent.layer;
        this.node.addComponent(UITransform).setContentSize(DESIGN.w, DESIGN.h);
        this.node.setParent(parent);
        this.g = this.node.addComponent(Graphics);
        for (let i = 0; i < count; i++) {
            this.items.push({
                x: Math.random() * DESIGN.w,
                y: TUNE.waterTop + Math.random() * (DESIGN.h - TUNE.waterTop),
                r: 2 + Math.random() * 4,
                spd: 18 + Math.random() * 34,
                phase: Math.random() * 100,
            });
        }
    }
    update(dt) {
        for (const b of this.items) {
            b.y -= b.spd * dt;
            b.x += Math.sin((b.y + b.phase) * 0.02) * 8 * dt;
            if (b.y < TUNE.waterTop + 4) {
                b.y = TUNE.floorY - 10;
                b.x = Math.random() * DESIGN.w;
            }
        }
        const g = this.g;
        g.clear();
        g.lineWidth = 1.4;
        for (const b of this.items) {
            g.fillColor = new Color(255, 255, 255, 34);
            circleD(g, b.x, b.y, b.r);
            g.fill();
            g.strokeColor = new Color(255, 255, 255, 130);
            circleD(g, b.x, b.y, b.r);
            g.stroke();
        }
    }
}
