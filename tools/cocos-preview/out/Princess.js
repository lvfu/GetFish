import { Node, UITransform, Sprite, Graphics, Color } from 'cc';
import { TUNE, PRINCESS_SPRITE, PRINCESS_CONTENT_H, PRINCESS_PAD_TOP, px, py, } from './GameConfig.js';
/**
 * 顶部捕鱼角色。
 *
 * 关键点：鱼线必须正好从「鱼竿尖」甩出，所以角色不是按身体中心摆放，
 * 而是按素材里检测出的竿尖坐标反推节点位置。
 *
 * 落在水面上的投影（网页版 drawPrincess 里的半透明椭圆）是独立的姐妹节点，
 * 排在角色节点之前，保证画在立绘下面而不是盖在身上。
 */
export class Princess {
    constructor(parent) {
        this.def = null;
        /** 竿尖在设计坐标下的位置，即鱼线支点 */
        this.tipX = TUNE.princessCx;
        this.tipY = TUNE.waterTop;
        // 影子：姐妹节点，先加（画在角色下面）
        const shadow = new Node('PrincessShadow');
        shadow.layer = parent.layer;
        shadow.addComponent(UITransform);
        shadow.setParent(parent);
        const sg = shadow.addComponent(Graphics);
        sg.fillColor = new Color(0, 0, 0, 41);
        sg.ellipse(0, 0, 62, 10);
        sg.fill();
        // 影子固定在水线上，不随换装移动（所有立绘同尺寸同位置）
        shadow.setPosition(px(TUNE.princessCx), py(TUNE.feetY - 2), 0);
        this.node = new Node('Princess');
        this.node.layer = parent.layer;
        this.node.addComponent(UITransform);
        this.node.setParent(parent);
        this.sprite = this.node.addComponent(Sprite);
        this.sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this.sprite.trim = false;
    }
    /** 换装：切换角色并重新计算竿尖位置 */
    apply(def, frame) {
        this.def = def;
        this.sprite.spriteFrame = frame;
        const sc = TUNE.princessH / PRINCESS_CONTENT_H;
        const dw = PRINCESS_SPRITE * sc;
        const dh = PRINCESS_SPRITE * sc;
        const x = TUNE.princessCx - dw / 2;
        const y = TUNE.feetY - (PRINCESS_PAD_TOP + PRINCESS_CONTENT_H) * sc;
        const ui = this.node.getComponent(UITransform);
        ui.setContentSize(dw, dh);
        this.node.setPosition(px(x + dw / 2), py(y + dh / 2), 0);
        this.tipX = x + def.rodTip[0] * dw;
        this.tipY = y + def.rodTip[1] * dh;
    }
    get current() {
        return this.def;
    }
}
