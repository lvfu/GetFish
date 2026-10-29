import {
    Node, Graphics, UITransform, Color, Label, Sprite, SpriteFrame, Rect, Size,
    HorizontalTextAlignment, VerticalTextAlignment,
} from 'cc';
import { DESIGN, PrincessDef, PRINCESS_SPRITE, px, py } from './GameConfig';
import { PAL, col } from './DayNight';

const SLOT = 58;
const GAP = 10;
const START_X = 26;
const START_Y = DESIGN.h - 84;

/** 缩略图只取头部：和网页版同一组裁剪参数 */
const CROP_SX = PRINCESS_SPRITE * 0.21;
const CROP_SY = PRINCESS_SPRITE * 0.015;
const CROP_S = PRINCESS_SPRITE * 0.58;

/** 左下角换装条：8 个缩略图，点击即换角色 */
export class PrincessPicker {
    readonly node: Node;
    private slots: { node: Node; g: Graphics; key: string }[] = [];
    private nameLabel: Label;
    private tipLabel: Label;
    private current = '';
    private drawn = false;
    private lastDim = false;

    constructor(parent: Node) {
        this.node = new Node('Picker');
        this.node.layer = parent.layer;
        this.node.addComponent(UITransform).setContentSize(DESIGN.w, DESIGN.h);
        this.node.setParent(parent);

        // 槽位上方的提示文字
        const tip = new Node('Tip');
        tip.layer = parent.layer;
        const tipUt = tip.addComponent(UITransform);
        tipUt.setAnchorPoint(0, 0.5);
        tip.setParent(this.node);
        tip.setPosition(px(START_X + 2), py(START_Y - 12), 0);
        const tl = tip.addComponent(Label);
        tl.string = '换装  ·  数字键 1-8 或点击头像';
        tl.fontSize = 15;
        tl.lineHeight = 20;
        tl.color = new Color(47, 59, 58, 180);
        tl.horizontalAlign = HorizontalTextAlignment.LEFT;
        tl.verticalAlign = VerticalTextAlignment.CENTER;
        this.tipLabel = tl;

        // 当前角色名：放在槽位行右侧，和网页版一致，不压住槽位
        const nameNode = new Node('CurName');
        nameNode.layer = parent.layer;
        const nameUt = nameNode.addComponent(UITransform);
        nameUt.setAnchorPoint(0, 0.5);
        nameNode.setParent(this.node);
        nameNode.setPosition(px(START_X + 8 * (SLOT + GAP) + 10), py(START_Y + SLOT - 14), 0);
        this.nameLabel = nameNode.addComponent(Label);
        this.nameLabel.string = '';
        this.nameLabel.fontSize = 17;
        this.nameLabel.lineHeight = 22;
        this.nameLabel.color = new Color(47, 59, 58, 220);
        this.nameLabel.horizontalAlign = HorizontalTextAlignment.LEFT;
        this.nameLabel.verticalAlign = VerticalTextAlignment.CENTER;
    }

    /** 建槽位。资源异步加载完再调用 */
    build(defs: { key: string; def: PrincessDef; frame: SpriteFrame }[]): void {
        for (const it of defs) {
            const i = this.slots.length;
            const cx = START_X + i * (SLOT + GAP) + SLOT / 2;
            const cy = START_Y + SLOT / 2;

            const n = new Node('Slot' + i);
            n.layer = this.node.layer;
            n.addComponent(UITransform).setContentSize(SLOT, SLOT);
            n.setParent(this.node);
            n.setPosition(px(cx), py(cy), 0);

            const g = n.addComponent(Graphics);

            // 缩略图（只取头部，否则 512 的立绘缩到 52px 只剩一个点）
            const sp = new Node('Thumb');
            sp.layer = this.node.layer;
            sp.addComponent(UITransform).setContentSize(SLOT - 6, SLOT - 6);
            sp.setParent(n);
            const sprite = sp.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            sprite.spriteFrame = this.thumbFrame(it.frame);
            sp.getComponent(UITransform)!.setContentSize(SLOT - 6, SLOT - 6);

            this.slots.push({ node: n, g, key: it.key });
        }
        this.setCurrent(this.current);
    }

    /**
     * 从整张立绘里裁出头部区域。
     * 新建一个 SpriteFrame 共享同一张贴图，只是换 rect，不会多占显存。
     */
    private thumbFrame(frame: SpriteFrame): SpriteFrame {
        try {
            const tex = frame.texture;
            if (!tex) {
                return frame;
            }
            const crop = new SpriteFrame();
            crop.texture = tex;
            crop.rect = new Rect(CROP_SX, CROP_SY, CROP_S, CROP_S);
            crop.originalSize = new Size(CROP_S, CROP_S);
            return crop;
        } catch (e) {
            return frame;
        }
    }

    /** 触摸命中测试，参数是设计坐标 */
    hitTest(x: number, y: number): number {
        for (let i = 0; i < this.slots.length; i++) {
            const sx = START_X + i * (SLOT + GAP);
            if (x >= sx && x <= sx + SLOT && y >= START_Y && y <= START_Y + SLOT) {
                return i;
            }
        }
        return -1;
    }

    setCurrent(key: string): void {
        // 已经画过同一个角色就不用重绘
        if (this.current === key && this.drawn) {
            return;
        }
        this.current = key;
        this.drawn = this.slots.length > 0;
        for (const s of this.slots) {
            const on = s.key === key;
            const g = s.g;
            g.clear();

            // 槽位节点以自身中心为原点，直接用局部坐标（y 向上），
            // 不能用设计坐标那套 D 系列工具函数
            g.fillColor = new Color(70, 52, 32, 40);
            g.roundRect(-SLOT / 2 + 1, -SLOT / 2 - 2, SLOT, SLOT, 8);
            g.fill();

            g.fillColor = col(PAL.plaque);
            g.roundRect(-SLOT / 2, -SLOT / 2, SLOT, SLOT, 8);
            g.fill();

            g.strokeColor = on ? new Color(217, 164, 65, 255) : new Color(95, 70, 47, 190);
            g.lineWidth = on ? 3.5 : 2;
            g.roundRect(-SLOT / 2, -SLOT / 2, SLOT, SLOT, 8);
            g.stroke();

            if (on) {
                g.fillColor = new Color(217, 164, 65, 255);
                g.circle(0, SLOT / 2 - 5, 3.5);
                g.fill();
            }
        }
    }

    setCurrentName(name: string): void {
        this.nameLabel.string = name;
    }

    /**
     * 跟着昼夜切换文字颜色。
     * 换装条压在深色水面上，夜里用墨色会看不见，所以夜里改成米白。
     */
    setLight(light: number): void {
        const dim = light < 0.45;
        if (dim === this.lastDim) {
            return;
        }
        this.lastDim = dim;
        this.tipLabel.color = dim ? new Color(232, 236, 226, 190) : new Color(47, 59, 58, 180);
        this.nameLabel.color = dim ? new Color(240, 243, 232, 235) : new Color(47, 59, 58, 220);
    }
}
