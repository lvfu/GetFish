import { Node, Graphics, Color, UITransform } from 'cc';
import { TUNE, PROP, px, py } from './GameConfig';
import { Fish } from './Fish';
import { PropItem } from './Props';

export type HookState = 'aim' | 'shoot' | 'retract';

/**
 * 鱼钩：摆动 → 出钩 → 收线。
 * 全部用代码构建节点，不依赖 prefab，便于版本管理和复用。
 */
export class Hook {
    /** 悬挂点容器，位置固定在船下方 */
    readonly root: Node;
    private ropeG: Graphics;
    private claw: Node;

    state: HookState = 'aim';
    /** 相对竖直向下的摆角，弧度 */
    angle = 0;
    /** 当前绳长 */
    rope = TUNE.idleRope;
    /** 正在带回的鱼 */
    carrying: Fish | null = null;
    /** 正在带回的道具（和鱼互斥：一钩只带一样） */
    carryingProp: PropItem | null = null;
    /** 断线剩余时间（>0 表示线和钩子都没了，不能出钩） */
    brokenT = 0;

    /** 鱼线支点（= 鱼竿尖），由 Princess 每次换装后写入 */
    originX = TUNE.princessCx;
    originY = TUNE.waterTop;

    private swingT = 0;

    constructor(parent: Node) {
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
    private drawClaw(g: Graphics): void {
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
    setOrigin(x: number, y: number): void {
        this.originX = x;
        this.originY = y;
        this.root.setPosition(px(x), py(y), 0);
        this.redraw();
    }

    /** 钩尖在设计坐标下的位置 */
    get tip(): { x: number; y: number } {
        return {
            x: this.originX + Math.sin(this.angle) * this.rope,
            y: this.originY + Math.cos(this.angle) * this.rope,
        };
    }

    reset(): void {
        this.state = 'aim';
        this.angle = 0;
        this.rope = TUNE.idleRope;
        this.swingT = 0;
        this.carrying = null;
        this.carryingProp = null;
        this.brokenT = 0;
        this.redraw();
    }

    /** 是否处于断线状态 */
    get broken(): boolean {
        return this.brokenT > 0;
    }

    /**
     * 鱼线绷断。
     *
     * 线和钩子一起消失（`rope = 0` 时 `redraw()` 会把钩爪藏起来），
     * 手上带着的东西也一起丢掉 —— 线都断了，鱼没道理还挂着。
     */
    breakLine(t: number): void {
        this.brokenT = t;
        this.state = 'aim';
        this.carrying = null;
        this.carryingProp = null;
        this.rope = 0;
        this.redraw();
    }

    /** 只有「钩子在水里且两手空空」时才能挂上道具 */
    canLatch(): boolean {
        return this.state !== 'aim' && !this.carrying && !this.carryingProp;
    }

    /** 钩住一枚道具：直接转入收线，和钩住鱼的表现一致 */
    latch(p: PropItem): void {
        if (!this.canLatch()) {
            return;
        }
        this.carryingProp = p;
        p.caught = true;
        this.state = 'retract';
    }

    /** 收线到顶，取出带回的道具并清空 */
    takeCarriedProp(): PropItem | null {
        const p = this.carryingProp;
        this.carryingProp = null;
        return p;
    }

    /** 尝试出钩，仅瞄准态可用 */
    fire(): boolean {
        if (this.state !== 'aim' || this.brokenT > 0) {
            return false;
        }
        this.state = 'shoot';
        // 绳长沿用当前值，出钩瞬间钩子不会往上跳一下
        return true;
    }

    /**
     * 每帧推进。返回本帧被钩中的鱼（未钩中返回 null）。
     */
    update(dt: number, fishes: Fish[]): Fish | null {
        let caught: Fish | null = null;

        // 断线：什么都不做，只倒计时 + 让线从竿尖慢慢长回来
        if (this.brokenT > 0) {
            this.brokenT -= dt;
            if (this.brokenT <= 0) {
                this.brokenT = 0;
                this.reset();
            } else {
                // 最后 PROP.regrow 秒才开始长，前面 2 秒多是完全没线的
                const left = Math.min(1, this.brokenT / PROP.regrow);
                this.rope = TUNE.idleRope * (1 - left);
                this.redraw();
            }
            return null;
        }

        if (this.state === 'aim') {
            this.swingT += dt;
            this.angle = TUNE.swingMax * Math.sin(this.swingT * TUNE.swingOmega);
            // 绳长恒定：钩子走的是真正的摆弧，不能一会儿长一会儿短
            this.rope = TUNE.idleRope;
        } else if (this.state === 'shoot') {
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
        } else {
            // 带鱼收线按这条鱼自己的「重量」（fish-config 里的 reel）：
            // 小丑鱼 190 一拽就上来，鲨鱼只有 115，深水那条要拉三秒。
            // 道具也分轻重：徽章 200、章鱼 165、剑鱼 135（它还会挣）。
            const spd = this.carrying
                ? Math.max(TUNE.reelMin, this.carrying.reel)
                : this.carryingProp
                    ? Math.max(TUNE.reelMin, this.carryingProp.reelSpeed)
                    : TUNE.shootSpeed * TUNE.reelEmptyK;
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
        if (this.carryingProp) {
            const t = this.tip;
            this.carryingProp.followTo(t.x, t.y);
        }
        this.redraw();
        return caught;
    }

    /** 收线到顶，取出携带的鱼并清空 */
    takeCarried(): Fish | null {
        const f = this.carrying;
        this.carrying = null;
        return f;
    }

    private redraw(): void {
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
        } else {
            this.claw.setPosition(0, 0, 0);
        }
        // 没有线就没有钩：断线（含最后那段「线在长回来」）时把钩爪一起藏掉。
        // 只把绳子清空、留着钩爪的话，它会缩在竿尖上，看起来像「钩子还在，只是线变短了」。
        this.claw.active = this.brokenT <= 0 && this.rope > 0.5;
        // 钩爪跟随绳的方向旋转：本地「朝下」为 (0,-1)，绕 z 逆时针转 angle 后正好指向绳的方向
        this.claw.angle = (this.angle * 180) / Math.PI;
    }
}
