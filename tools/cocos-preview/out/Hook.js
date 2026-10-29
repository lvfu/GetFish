import { Node, Graphics, Color, UITransform } from 'cc';
import { TUNE, px, py } from './GameConfig.js';
/**
 * 鱼钩：摆动 → 出钩 → 收线。
 * 全部用代码构建节点，不依赖 prefab，便于版本管理和复用。
 */
export class Hook {
    constructor(parent) {
        this.state = 'aim';
        /** 相对竖直向下的摆角，弧度 */
        this.angle = 0;
        /** 当前绳长 */
        this.rope = TUNE.idleRope;
        /** 正在带回的鱼 */
        this.carrying = null;
        /** 鱼线支点（= 鱼竿尖），由 Princess 每次换装后写入 */
        this.originX = TUNE.princessCx;
        this.originY = TUNE.waterTop;
        this.swingT = 0;
        this.root = new Node('HookRoot');
        this.root.layer = parent.layer;
        this.root.addComponent(UITransform);
        this.root.setParent(parent);
        this.root.setPosition(px(this.originX), py(this.originY), 0);
        // 绳
        const ropeNode = new Node('Rope');
        ropeNode.layer = parent.layer;
        ropeNode.addComponent(UITransform);
        ropeNode.setParent(this.root);
        this.ropeG = ropeNode.addComponent(Graphics);
        // 钩爪
        this.claw = new Node('Claw');
        this.claw.layer = parent.layer;
        this.claw.addComponent(UITransform);
        this.claw.setParent(this.root);
        // 和网页版一致：钩子整体缩到 0.78，否则在 1280 宽的画面里显得过大
        this.claw.setScale(0.78, 0.78, 1);
        this.drawClaw(this.claw.addComponent(Graphics));
        this.redraw();
    }
    /** 钩爪形状：竖直钩柄 + 左右两道弯爪 + 顶部圆环，朝下为 -y */
    drawClaw(g) {
        const stroke = new Color(228, 233, 242, 255);
        const outline = new Color(20, 30, 45, 190);
        const path = () => {
            g.moveTo(0, 11);
            g.lineTo(0, -4);
            g.moveTo(0, -4);
            g.quadraticCurveTo(-2, -17, -12, -17);
            g.quadraticCurveTo(-19, -17, -19, -8);
            g.moveTo(0, -4);
            g.quadraticCurveTo(2, -17, 12, -17);
            g.quadraticCurveTo(19, -17, 19, -8);
        };
        g.lineCap = Graphics.LineCap.ROUND;
        g.lineJoin = Graphics.LineJoin.ROUND;
        g.lineWidth = 9;
        g.strokeColor = outline;
        path();
        g.stroke();
        g.lineWidth = 5;
        g.strokeColor = stroke;
        path();
        g.stroke();
        g.lineWidth = 4;
        g.strokeColor = new Color(185, 194, 208, 255);
        g.circle(0, 16, 5);
        g.stroke();
    }
    /** 设置鱼线支点（换装后竿尖位置会变） */
    setOrigin(x, y) {
        this.originX = x;
        this.originY = y;
        this.root.setPosition(px(x), py(y), 0);
        this.redraw();
    }
    /** 钩尖在设计坐标下的位置 */
    get tip() {
        return {
            x: this.originX + Math.sin(this.angle) * this.rope,
            y: this.originY + Math.cos(this.angle) * this.rope,
        };
    }
    reset() {
        this.state = 'aim';
        this.angle = 0;
        this.rope = TUNE.idleRope;
        this.swingT = 0;
        this.carrying = null;
        this.redraw();
    }
    /** 尝试出钩，仅瞄准态可用 */
    fire() {
        if (this.state !== 'aim') {
            return false;
        }
        this.state = 'shoot';
        this.rope = TUNE.idleRope;
        return true;
    }
    /**
     * 每帧推进。返回本帧被钩中的鱼（未钩中返回 null）。
     */
    update(dt, fishes) {
        let caught = null;
        if (this.state === 'aim') {
            this.swingT += dt;
            this.angle = TUNE.swingMax * Math.sin(this.swingT * TUNE.swingOmega);
            this.rope = TUNE.idleRope;
        }
        else if (this.state === 'shoot') {
            this.rope += TUNE.shootSpeed * dt;
            const t = this.tip;
            for (const f of fishes) {
                if (f.caught) {
                    continue;
                }
                const dx = f.x - t.x;
                const dy = f.y - t.y;
                const rr = f.radius + TUNE.hookR;
                if (dx * dx + dy * dy < rr * rr) {
                    f.caught = true;
                    this.carrying = f;
                    this.state = 'retract';
                    caught = f;
                    break;
                }
            }
            if (this.state === 'shoot' && (t.y > TUNE.floorY - 6 || this.rope > TUNE.maxRope)) {
                this.state = 'retract';
            }
        }
        else {
            const spd = this.carrying
                ? Math.max(300, 880 - this.carrying.size * 3.4)
                : TUNE.shootSpeed * 0.92;
            this.rope -= spd * dt;
            if (this.rope <= TUNE.idleRope) {
                this.rope = TUNE.idleRope;
                this.state = 'aim';
            }
        }
        if (this.carrying) {
            const t = this.tip;
            this.carrying.followTo(t.x, t.y);
        }
        this.redraw();
        return caught;
    }
    /** 收线到顶，取出携带的鱼并清空 */
    takeCarried() {
        const f = this.carrying;
        this.carrying = null;
        return f;
    }
    redraw() {
        const g = this.ropeG;
        g.clear();
        if (this.rope > 0.5) {
            const dx = Math.sin(this.angle) * this.rope;
            const dy = -Math.cos(this.angle) * this.rope;
            g.lineWidth = 3;
            g.strokeColor = new Color(232, 220, 192, 255);
            g.moveTo(0, 0);
            g.lineTo(dx, dy);
            g.stroke();
            g.lineWidth = 1;
            g.strokeColor = new Color(255, 255, 255, 70);
            g.moveTo(1, 0);
            g.lineTo(dx + 1, dy);
            g.stroke();
            this.claw.setPosition(dx, dy, 0);
        }
        else {
            this.claw.setPosition(0, 0, 0);
        }
        // 钩爪跟随绳的方向旋转：本地「朝下」为 (0,-1)，绕 z 逆时针转 angle 后正好指向绳的方向
        this.claw.angle = (this.angle * 180) / Math.PI;
    }
}
