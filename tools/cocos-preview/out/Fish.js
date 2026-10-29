import { Node, UITransform, Sprite, Graphics, Color } from 'cc';
import { px, py, DESIGN } from './GameConfig.js';
/**
 * 一条鱼。用普通类驱动 Node，而不是 Component，
 * 好处是生成/回收完全由 GameRoot 控制，不需要 prefab 序列化。
 *
 * 节点结构（对齐网页版的绘制方式）：
 *   root（定位 / 翻转 / 摇摆）
 *    ├─ Shadow  水下影子（网页版画在鱼身下方的半透明椭圆）
 *    └─ Body    Sprite 本体
 */
export class Fish {
    constructor(node, def, x, y, dir, sf) {
        this.caught = false;
        this.node = node;
        this.def = def;
        this.value = def.baseValue;
        this.size = def.baseSize;
        this.height = def.baseSize * (sf.rect.height / sf.rect.width);
        this.dir = dir;
        this.speed = def.baseSpeed;
        this.x = x;
        this.y = y;
        this.baseY = y;
        this.phase = Math.random() * Math.PI * 2;
        const ui = node.getComponent(UITransform) ?? node.addComponent(UITransform);
        ui.setContentSize(this.size, this.height);
        // 影子：先加，画在鱼身下面。参数与网页版 drawFish 一致
        this.shadow = new Node('Shadow');
        this.shadow.layer = node.layer;
        this.shadow.addComponent(UITransform);
        this.shadow.setParent(node);
        const sg = this.shadow.addComponent(Graphics);
        sg.fillColor = new Color(0, 0, 0, 26);
        sg.ellipse(0, -this.height * 0.3, this.size * 0.34, this.height * 0.08);
        sg.fill();
        // 鱼身
        this.body = new Node('Body');
        this.body.layer = node.layer;
        this.body.addComponent(UITransform).setContentSize(this.size, this.height);
        this.body.setParent(node);
        const sp = this.body.addComponent(Sprite);
        // 先定 CUSTOM 再给贴图：顺序反了会被按贴图原始尺寸（512）自动撑大
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.trim = false;
        sp.spriteFrame = sf;
        this.sync();
    }
    /** 让 sprite 朝向正确方向，并带上网页版的轻微摇摆 */
    sync() {
        this.node.setPosition(px(this.x), py(this.y), 0);
        this.node.setScale(this.dir, 1, 1);
        // 网页版：ctx.rotate(Math.sin(f.phase) * 0.04)，y 向下坐标系，Cocos 的 angle 正好同向
        this.node.angle = (Math.sin(this.phase) * 0.04 * 180) / Math.PI;
    }
    update(dt) {
        if (this.caught) {
            return;
        }
        this.x += this.speed * this.dir * dt;
        this.phase += dt * 1.6;
        this.y = this.baseY + Math.sin(this.phase) * 6;
        const half = this.size * 0.55;
        if (this.dir > 0 && this.x - half > DESIGN.w) {
            this.x = -half;
            this.baseY = this.y;
        }
        else if (this.dir < 0 && this.x + half < 0) {
            this.x = DESIGN.w + half;
            this.baseY = this.y;
        }
        this.sync();
    }
    /** 被钩住后跟随钩尖。网页版：不翻转、轻微扑腾（±0.16rad）、不画影子 */
    followTo(x, y) {
        this.x = x;
        this.y = y + this.height * 0.42 + 10;
        this.node.setPosition(px(this.x), py(this.y), 0);
        this.node.setScale(1, 1, 1);
        this.node.angle = (Math.sin(Date.now() * 0.006) * 0.16 * 180) / Math.PI;
        this.shadow.active = false;
    }
    /** 碰撞半径 */
    get radius() {
        return this.size * 0.4;
    }
}
