import { Node, UITransform, Sprite, Graphics, Color } from 'cc';
import { px, py, TUNE, VIEW } from './GameConfig.js';
/** 各游法的纵向摆速 rad/s：突进的鱼摆得急，滑翔的鱼摆得慢 */
const WAVE_OMEGA = {
    cruise: 1.5,
    dart: 2.3,
    sweep: 0.85,
    glide: 1.1,
    burst: 1.7,
};
/**
 * 一条鱼。用普通类驱动 Node，而不是 Component，
 * 好处是生成/回收完全由 GameRoot 控制，不需要 prefab 序列化。
 *
 * 节点结构（对齐网页版的绘制方式）：
 *   root（定位 / 翻转 / 摇摆）
 *    ├─ Shadow  水下影子（网页版画在鱼身下方的半透明椭圆）
 *    └─ Body    Sprite 本体
 *
 * 性格来自 fish-config.json 的三个字段：`baseSpeed`（游得多快）、
 * `pattern`（怎么游）、`reel`（拉起来多沉）。这里不写死任何一条鱼的脾气。
 */
export class Fish {
    constructor(node, def, x, y, dir, sf) {
        this.caught = false;
        /** 当前速度倍率，向目标值平滑靠拢 */
        this.vMul = 1;
        this.node = node;
        this.def = def;
        this.value = def.baseValue;
        this.size = def.baseSize;
        this.height = def.baseSize * (sf.rect.height / sf.rect.width);
        this.dir = dir;
        this.speed = def.baseSpeed;
        this.reel = def.reel && def.reel > 0 ? def.reel : 160;
        this.pattern = def.pattern || 'cruise';
        this.wave = def.wave === undefined ? 6 : def.wave;
        this.x = x;
        this.y = y;
        this.baseY = y;
        this.phase = Math.random() * Math.PI * 2;
        this.t = Math.random() * 4;
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
        this.t += dt;
        // 速度倍率向目标平滑靠拢（0.22 秒左右到位）：
        // 直接给目标值的话，突进那一下是瞬间跳到 2 倍速，看着像被瞬移了一下
        const target = this.targetMul();
        this.vMul += (target - this.vMul) * Math.min(1, dt * 4.5);
        this.x += this.speed * this.vMul * this.dir * dt;
        this.phase += dt * WAVE_OMEGA[this.pattern];
        this.y = this.baseY + Math.sin(this.phase) * this.wave;
        const half = this.size * 0.55;
        // 进出场按「可见区域」算，不能按 1280：宽屏上可见范围比设计宽度大，
        // 按 1280 换边的话鱼会在画面中间凭空消失/出现
        if (this.dir > 0 && this.x - half > VIEW.right) {
            this.x = VIEW.left - half;
            this.baseY = this.y;
        }
        else if (this.dir < 0 && this.x + half < VIEW.left) {
            this.x = VIEW.right + half;
            this.baseY = this.y;
        }
        this.sync();
    }
    /**
     * 当前游法想让速度变成基准的多少倍。
     *
     * 只有 dart / burst 会变：这两类鱼「动」的节奏本身就是玩法的一部分 ——
     * 追着小丑鱼出钩经常扑空，等一下它慢下来才打得到；
     * 锦鲤和鲨鱼那一段冲刺就是「这一钩多半要废」的信号。
     */
    targetMul() {
        if (this.pattern === 'dart') {
            return 0.30 + 1.05 * (0.5 + 0.5 * Math.sin(this.t * 3.2));
        }
        if (this.pattern === 'burst') {
            // 3.6 秒一个循环：0.7 秒冲刺（2 倍速），其余时间懒洋洋地游
            const c = this.t % 3.6;
            return c < 0.7 ? 2.0 : 0.45;
        }
        return 1;
    }
    /**
     * 被钩住后跟随钩尖。网页版：不翻转、轻微扑腾（±0.16rad）、不画影子。
     *
     * 贴图上边有 6%~20% 的透明留白，所以不能把鱼心放在钩尖下方半个鱼高的位置，
     * 那样钩爪和鱼背之间会空出一条缝。0.35 让钩爪正好咬进鱼背。
     *
     * 越沉的鱼扑腾得越凶：河豚、鳐鱼、鲨鱼会明显左右甩，小鱼几乎只是被拖走。
     * 这是「拉了三秒」这段时间里唯一还在动的东西 —— 没有它，慢收线就变成干等。
     */
    followTo(x, y) {
        const heavy = Math.max(0, Math.min(1, (210 - this.reel) / 110));
        const t = Date.now() * 0.001;
        this.x = x;
        this.y = y + this.height * TUNE.fishHang + Math.sin(t * 13) * heavy * 5;
        this.node.setPosition(px(this.x), py(this.y), 0);
        this.node.setScale(1, 1, 1);
        this.node.angle = (Math.sin(t * 6 + Math.sin(t * 2.4) * heavy) * (0.16 + heavy * 0.22) * 180) / Math.PI;
        this.shadow.active = false;
    }
    /** 碰撞半径 */
    get radius() {
        return this.size * 0.4;
    }
}
