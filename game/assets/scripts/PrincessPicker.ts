import {
    Node, Graphics, UITransform, Color, Label, Sprite, SpriteFrame, Rect, Size,
    HorizontalTextAlignment, VerticalTextAlignment,
} from 'cc';
import { DESIGN, VIEW, PrincessDef, PRINCESS_SPRITE, px, py } from './GameConfig';
import { PAL, col, roundRectD } from './DayNight';

/** 收起态：左上角只有一个头像按钮（贴在金币牌匾右边）。x 在构造时按可见区域左边缘算 */
const BTN = { x: 200, y: 75, size: 48 };
/** 展开态：候选列表，4 列一行，够放 8 个角色 */
const SLOT = 52;
const GAP = 8;
const COLS = 4;
const PAD = 10;

const PANEL_Y = BTN.y + BTN.size + 14;
const PANEL_W = COLS * SLOT + (COLS - 1) * GAP + PAD * 2;

/** 缩略图只取头部：和网页版同一组裁剪参数 */
const CROP_SX = PRINCESS_SPRITE * 0.21;
const CROP_SY = PRINCESS_SPRITE * 0.015;
const CROP_S = PRINCESS_SPRITE * 0.58;

export type PickerHit =
    | { type: 'toggle' }
    | { type: 'pick'; index: number }
    | { type: 'close' };

/**
 * 换装：默认只显示当前角色的一个头像，点开才弹出候选列表。
 *
 * 之前 8 个头像平铺在左下角，占地方又压在鱼群上；现在收成一个按钮，
 * 列表只在点击后短暂出现，选完立刻收起。
 */
export class PrincessPicker {
    readonly node: Node;
    private btnNode: Node;
    private btnG: Graphics;
    private btnThumb: Sprite;
    private caret: Graphics;
    private panelNode: Node;
    private panelG: Graphics;
    private panelH = 0;
    private slots: { node: Node; g: Graphics; key: string }[] = [];
    private frames: { [k: string]: SpriteFrame } = {};
    private nameLabel: Label;
    private nameNode!: Node;

    private current = '';
    private open = false;
    private drawn = false;
    private lastDim = false;

    constructor(parent: Node) {
        // 贴可见区域的左边缘（FIXED_HEIGHT 下窄屏可见宽度比 1280 小，写死 200 会被切掉）
        BTN.x = VIEW.left + 200;

        this.node = new Node('Picker');
        this.node.layer = parent.layer;
        this.node.addComponent(UITransform).setContentSize(DESIGN.w, DESIGN.h);
        this.node.setParent(parent);

        // ---- 收起态按钮 ----
        this.btnNode = new Node('PickerBtn');
        this.btnNode.layer = parent.layer;
        this.btnNode.addComponent(UITransform).setContentSize(BTN.size, BTN.size);
        this.btnNode.setParent(this.node);
        this.btnNode.setPosition(px(BTN.x + BTN.size / 2), py(BTN.y + BTN.size / 2), 0);
        this.btnG = this.btnNode.addComponent(Graphics);

        const thumb = new Node('Thumb');
        thumb.layer = parent.layer;
        thumb.addComponent(UITransform).setContentSize(BTN.size - 12, BTN.size - 12);
        thumb.setParent(this.btnNode);
        this.btnThumb = thumb.addComponent(Sprite);
        this.btnThumb.sizeMode = Sprite.SizeMode.CUSTOM;
        this.btnThumb.trim = false;

        const caretNode = new Node('Caret');
        caretNode.layer = parent.layer;
        caretNode.addComponent(UITransform).setContentSize(BTN.size, BTN.size);
        caretNode.setParent(this.btnNode);
        this.caret = caretNode.addComponent(Graphics);

        // ---- 当前角色名（跟在按钮右边） ----
        const nameNode = new Node('CurName');
        this.nameNode = nameNode;
        nameNode.layer = parent.layer;
        const nameUt = nameNode.addComponent(UITransform);
        nameUt.setAnchorPoint(0, 0.5);
        nameNode.setParent(this.node);
        nameNode.setPosition(px(BTN.x + BTN.size + 10), py(BTN.y + BTN.size / 2), 0);
        this.nameLabel = nameNode.addComponent(Label);
        this.nameLabel.string = '';
        this.nameLabel.fontSize = 17;
        this.nameLabel.lineHeight = 22;
        this.nameLabel.color = new Color(47, 59, 58, 220);
        this.nameLabel.horizontalAlign = HorizontalTextAlignment.LEFT;
        this.nameLabel.verticalAlign = VerticalTextAlignment.CENTER;

        // ---- 展开态列表：节点留在画布中心，这样能用 D 系列工具按设计坐标画 ----
        this.panelNode = new Node('PickerPanel');
        this.panelNode.layer = parent.layer;
        this.panelNode.addComponent(UITransform).setContentSize(DESIGN.w, DESIGN.h);
        this.panelNode.setParent(this.node);
        this.panelG = this.panelNode.addComponent(Graphics);
        this.panelNode.active = false;
    }

    /** 建列表。资源异步加载完再调用 */
    build(defs: { key: string; def: PrincessDef; frame: SpriteFrame }[]): void {
        const rows = Math.max(1, Math.ceil(defs.length / COLS));
        this.panelH = rows * SLOT + (rows - 1) * GAP + PAD * 2;
        this.drawPanel();

        for (const it of defs) {
            const i = this.slots.length;
            const cx = BTN.x + PAD + (i % COLS) * (SLOT + GAP) + SLOT / 2;
            const cy = PANEL_Y + PAD + Math.floor(i / COLS) * (SLOT + GAP) + SLOT / 2;

            const n = new Node('Slot' + i);
            n.layer = this.node.layer;
            n.addComponent(UITransform).setContentSize(SLOT, SLOT);
            n.setParent(this.panelNode);
            n.setPosition(px(cx), py(cy), 0);

            const g = n.addComponent(Graphics);

            // 缩略图（只取头部，否则 512 的立绘缩到 46px 只剩一个点）
            const sp = new Node('Thumb');
            sp.layer = this.node.layer;
            sp.addComponent(UITransform).setContentSize(SLOT - 6, SLOT - 6);
            sp.setParent(n);
            const sprite = sp.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            const crop = this.thumbFrame(it.frame);
            sprite.spriteFrame = crop;
            sp.getComponent(UITransform)!.setContentSize(SLOT - 6, SLOT - 6);

            this.frames[it.key] = crop;
            this.slots.push({ node: n, g, key: it.key });
        }

        this.setCurrent(this.current);
        this.drawButton();
    }

    /**
     * 可见宽度变了（换屏 / 拖窗口）：按钮、角色名、列表整体挪到新的左边缘。
     * 节点位置和命中测试都读同一个 BTN.x，所以只要改它 + 重摆一遍就一致。
     */
    relayout(): void {
        BTN.x = VIEW.left + 200;
        this.btnNode.setPosition(px(BTN.x + BTN.size / 2), py(BTN.y + BTN.size / 2), 0);
        this.nameNode.setPosition(px(BTN.x + BTN.size + 10), py(BTN.y + BTN.size / 2), 0);
        this.drawPanel();
        for (let i = 0; i < this.slots.length; i++) {
            const cx = BTN.x + PAD + (i % COLS) * (SLOT + GAP) + SLOT / 2;
            const cy = PANEL_Y + PAD + Math.floor(i / COLS) * (SLOT + GAP) + SLOT / 2;
            this.slots[i].node.setPosition(px(cx), py(cy), 0);
        }
    }

    /** 列表底板：和 HUD 同一套「米色牌匾 + 木框 + 金线」 */
    private drawPanel(): void {
        const g = this.panelG;
        const h = this.panelH;
        g.clear();
        g.fillColor = new Color(70, 52, 32, 56);
        roundRectD(g, BTN.x + 2, PANEL_Y + 3, PANEL_W, h, 12);
        g.fill();

        g.fillColor = col(PAL.plaque);
        roundRectD(g, BTN.x, PANEL_Y, PANEL_W, h, 12);
        g.fill();

        g.strokeColor = col(PAL.woodDark);
        g.lineWidth = 3;
        roundRectD(g, BTN.x, PANEL_Y, PANEL_W, h, 12);
        g.stroke();

        g.strokeColor = new Color(201, 161, 90, 210);
        g.lineWidth = 1.2;
        roundRectD(g, BTN.x + 5, PANEL_Y + 5, PANEL_W - 10, h - 10, 8);
        g.stroke();
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

    // ================= 展开 / 收起 =================

    get isOpen(): boolean {
        return this.open;
    }

    toggle(): void {
        if (this.open) {
            this.close();
        } else {
            this.openList();
        }
    }

    openList(): void {
        if (!this.slots.length || this.open) {
            return;
        }
        this.open = true;
        this.panelNode.active = true;
        this.nameLabel.node.active = false;
        this.drawButton();
    }

    close(): void {
        if (!this.open) {
            return;
        }
        this.open = false;
        this.panelNode.active = false;
        this.nameLabel.node.active = true;
        this.drawButton();
    }

    /**
     * 触摸命中测试，参数是设计坐标。
     * 收起态只有按钮；展开态多出列表，点面板外返回 close，
     * 让 GameRoot 把这次点击吃掉（否则点空白会顺手出钩）。
     */
    hitTest(x: number, y: number): PickerHit | null {
        const onBtn = x >= BTN.x && x <= BTN.x + BTN.size && y >= BTN.y && y <= BTN.y + BTN.size;
        if (onBtn) {
            return { type: 'toggle' };
        }
        if (!this.open) {
            return null;
        }
        for (let i = 0; i < this.slots.length; i++) {
            const sx = BTN.x + PAD + (i % COLS) * (SLOT + GAP);
            const sy = PANEL_Y + PAD + Math.floor(i / COLS) * (SLOT + GAP);
            if (x >= sx && x <= sx + SLOT && y >= sy && y <= sy + SLOT) {
                return { type: 'pick', index: i };
            }
        }
        const inPanel = x >= BTN.x && x <= BTN.x + PANEL_W
            && y >= PANEL_Y && y <= PANEL_Y + this.panelH;
        return inPanel ? null : { type: 'close' };
    }

    // ================= 外观 =================

    /** 按钮：米色牌匾 + 当前头像 + 右下角小三角（提示可以点开） */
    private drawButton(): void {
        const g = this.btnG;
        const s = BTN.size;
        const r = s / 2;
        g.clear();

        g.fillColor = new Color(70, 52, 32, 46);
        g.roundRect(-r + 1, -r - 2, s, s, 12);
        g.fill();

        g.fillColor = col(PAL.plaque);
        g.roundRect(-r, -r, s, s, 12);
        g.fill();

        g.strokeColor = this.open ? new Color(217, 164, 65, 255) : col(PAL.woodDark);
        g.lineWidth = this.open ? 3.5 : 2.5;
        g.roundRect(-r, -r, s, s, 12);
        g.stroke();

        // 右下角小三角（局部坐标 y 向上，-r 是底边）
        const c = this.caret;
        c.clear();
        c.fillColor = new Color(47, 59, 58, 205);
        c.moveTo(r - 17, -r + 7);
        c.lineTo(r - 7, -r + 7);
        c.lineTo(r - 12, -r + 13);
        c.close();
        c.fill();
    }

    setCurrent(key: string): void {
        // 已经画过同一个角色就不用重绘
        if (this.current === key && this.drawn) {
            return;
        }
        this.current = key;
        this.drawn = this.slots.length > 0;

        const f = this.frames[key];
        if (f) {
            this.btnThumb.spriteFrame = f;
        }

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
     * 角色名压在水面上，夜里用墨色会看不见，所以夜里改成米白。
     */
    setLight(light: number): void {
        const dim = light < 0.45;
        if (dim === this.lastDim) {
            return;
        }
        this.lastDim = dim;
        this.nameLabel.color = dim ? new Color(240, 243, 232, 235) : new Color(47, 59, 58, 220);
    }
}
