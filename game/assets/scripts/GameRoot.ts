import {
    _decorator, Component, Node, UITransform, SpriteFrame, Vec3, Canvas, Graphics, Color, Label,
    HorizontalTextAlignment, VerticalTextAlignment,
    resources, JsonAsset, input, Input, EventTouch, EventMouse, EventKeyboard, KeyCode,
    view, ResolutionPolicy, Camera,
} from 'cc';
import {
    TUNE, ZONE, PROP, BEAST, BeastKind, FishDef, FishTable, PrincessDef, PrincessTable, DESIGN, VIEW,
    syncView, PropKind,
} from './GameConfig';
import { Fish } from './Fish';
import { Hook } from './Hook';
import { Princess } from './Princess';
import { Background } from './Background';
import { Scenery } from './Scenery';
import { Bubbles } from './Bubbles';
import { Fx, NEG_TINT } from './Fx';
import { Hud } from './Hud';
import { Props } from './Props';
import { PrincessPicker } from './PrincessPicker';
import { OrientationGate } from './Orientation';
import { GameAudio, SoundButton } from './Audio';
import { lightAt, phaseOf } from './DayNight';

const { ccclass } = _decorator;

type Mode = 'loading' | 'ready' | 'aim' | 'levelend' | 'over';

/**
 * 游戏总入口。挂到 Canvas 上即可运行。
 *
 * 所有节点都在代码里按固定顺序构建，层级顺序与网页版的绘制顺序一一对应：
 *   背景 → 樱花栏杆 → 灯笼 → 鱼群 → 气泡 → 甲板 → 角色 → 鱼线 → HUD → 换装按钮 → 静音键
 * 这样不用在编辑器里手工摆放，也方便版本管理。
 */
@ccclass('GameRoot')
export class GameRoot extends Component {
    // 分层模块
    private bg!: Background;
    private scenery!: Scenery;
    private bubbles!: Bubbles;
    private fx!: Fx;
    private hud!: Hud;
    private props!: Props;
    private picker!: PrincessPicker;
    private audio!: GameAudio;
    private sndBtn!: SoundButton;
    /** 竖屏提示层：竖屏时盖住画面并暂停玩法 */
    private gate!: OrientationGate;

    private fishLayer!: Node;
    private hook!: Hook;
    private princess!: Princess;
    /** Canvas 对齐的相机，交给背景层做清屏色兜底 */
    private cam: Camera | null = null;

    private table: FishTable = {};
    private frames: { [k: string]: SpriteFrame } = {};
    private fishes: Fish[] = [];

    private pTable: PrincessTable = {};
    private pFrames: { [k: string]: SpriteFrame } = {};
    private pKeys: string[] = [];
    private pIndex = 0;

    private mode: Mode = 'loading';
    private score = 0;
    private level = 1;
    private timeLeft = 0;
    private spawnTimer = 0;
    private levelPassed = false;

    /** 减速道具剩余时间（>0 时鱼速乘 PROP.slowK，钩子和收线不受影响） */
    private slowT = 0;
    /** 暂停道具剩余时间（>0 时全场冻结，包括计时） */
    private pauseT = 0;
    /** 大雾道具剩余时间（>0 时水面糊住，只影响看得清不清，不动物理数值） */
    private fogT = 0;
    /** 断线剩余时间。真正的倒计时活在 Hook 里，这里只负责驱动顶部状态条 */
    private breakT = 0;

    /** 昼夜时钟，跨关连续累加 */
    private clock = 0;
    /** 气泡重绘节流 */
    private bubAcc = 0;
    /** 同一次点击可能同时派发 TOUCH_START 与 MOUSE_DOWN，用它去重 */
    private lastAct = 0;
    /** 「鱼线修复中」提示的节流时间戳，防止断线期间连点刷屏 */
    private breakTipAt = 0;

    // ================= 生命周期 =================

    onLoad(): void {
        console.log('[GameRoot] onLoad on', this.node.name, 'layer', this.node.layer);
        // 和 project.json 的 fitHeight 保持一致（FIXED_HEIGHT：高恒为 720，宽随屏幕比例变化）。
        // 之前这里写的是 SHOW_ALL，和工程设置打架，画面会被挤到一边、另一侧露出黑底。
        view.setDesignResolutionSize(DESIGN.w, DESIGN.h, ResolutionPolicy.FIXED_HEIGHT);
        try {
            this.buildScene();
            // 换屏 / 拖窗口后重新对齐，并让背景、HUD 按新的可见宽度重画
            view.setResizeCallback(() => this.onResize());
            console.log('[GameRoot] 场景构建完成，子节点', this.node.children.length);
        } catch (e) {
            const err = e as Error;
            console.error('[GameRoot] 场景构建失败：', err && err.message, err && err.stack);
            this.showFatal(err && err.message ? err.message : String(e));
        }
    }

    /**
     * 出错时把原因直接画在屏幕上。
     * 否则预览窗口只有一片底色，根本看不出是没挂上脚本还是代码抛了异常。
     */
    private showFatal(msg: string): void {
        const n = new Node('Fatal');
        n.layer = this.node.layer;
        n.addComponent(UITransform).setContentSize(DESIGN.w, DESIGN.h);
        n.setParent(this.node);

        const g = n.addComponent(Graphics);
        g.fillColor = new Color(24, 26, 28, 240);
        g.rect(-DESIGN.w / 2, -DESIGN.h / 2, DESIGN.w, DESIGN.h);
        g.fill();

        const t = new Node('Msg');
        t.layer = n.layer;
        t.addComponent(UITransform).setContentSize(DESIGN.w - 160, DESIGN.h - 160);
        t.setParent(n);
        const l = t.addComponent(Label);
        l.string = 'GameRoot 启动失败\n\n' + msg;
        l.fontSize = 24;
        l.lineHeight = 36;
        l.color = new Color(255, 138, 128, 255);
        l.horizontalAlign = HorizontalTextAlignment.CENTER;
        l.verticalAlign = VerticalTextAlignment.CENTER;
    }

    start(): void {
        this.loadAssets();
    }

    update(dt: number): void {
        // 音频淡入和游戏状态无关，暂停时也要继续
        this.audio.update(dt);

        // 暂停道具：全场冻结 —— 鱼、钩、计时、昼夜、气泡一起停，
        // 只留暂停遮罩自己的倒计时在走。所以这里直接 return，跳过下面所有推进。
        if (this.pauseT > 0) {
            this.pauseT -= dt;
            if (this.pauseT <= 0) {
                this.pauseT = 0;
                this.props.hidePause();
            } else {
                this.props.updatePause(this.pauseT);
            }
            return;
        }

        // 昼夜、装饰、气泡
        this.clock += dt;
        this.bg.update(dt, this.clock);
        this.scenery.update(dt, this.clock);

        // 压在背景上的文字跟着昼夜换色。
        // HUD 不在此列：新版 HUD 全部落在不透明的白卡 / 绿胶囊上，
        // 底色本身不随昼夜变，字再跟着换色反而会糊（见 Hud 顶部注释）。
        const light = lightAt(phaseOf(this.clock));
        this.picker.setLight(light);

        this.bubAcc += dt;
        if (this.bubAcc >= 0.05) {
            this.bubbles.update(this.bubAcc);
            this.bubAcc = 0;
        }

        // 涟漪 / 飘字推进
        this.fx.update(dt);

        // 竖屏时整个玩法暂停（计时、鱼群、出钩都停），只留提示层
        if (this.gate && this.gate.isBlocked) {
            return;
        }

        if (this.mode !== 'aim') {
            return;
        }

        // 计时
        this.timeLeft -= dt;
        if (this.timeLeft <= 0) {
            this.timeLeft = 0;
            this.endLevel();
            this.hud.updateHud(this.score, this.target(), this.level, this.timeLeft, TUNE.levelTime);
            return;
        }

        // 减速道具：只压鱼速，钩子和收线保持原速 ——
        // 手感上的「好钩」不能变成「好拉」，否则大鱼就不值钱了
        if (this.slowT > 0) {
            // 减到 0 也要再调一次 setSlow，否则状态条会一直挂在屏幕上
            this.slowT = Math.max(0, this.slowT - dt);
            this.props.setSlow(this.slowT);
        }

        // 大雾：纯粹挡视线。鱼照游、钩照出、计时照走 ——
        // 它的惩罚是「这三秒你瞄不准」，不是「这三秒你什么都干不了」。
        if (this.fogT > 0) {
            this.fogT = Math.max(0, this.fogT - dt);
            this.props.setFog(this.fogT);
        }

        // 断线：真正不能出钩的判定在 Hook 里，这里只为状态条推进同一个时间。
        // 两者都吃 dt、也都被「暂停」一起冻结，所以数值不会跑偏。
        if (this.breakT > 0) {
            this.breakT = Math.max(0, this.breakT - dt);
            this.props.setBroken(this.breakT);
        }
        const fishDt = this.slowT > 0 ? dt * PROP.slowK : dt;
        for (const f of this.fishes) {
            f.update(fishDt);
        }

        // 道具漂移与刷新
        this.props.update(dt);

        // 鱼钩
        const caught = this.hook.update(dt, this.fishes);
        if (caught) {
            this.audio.catchOne();
            this.fx.ripple(caught.x, caught.y);
        }

        // 道具：钩尖撞上就挂住，跟鱼一样收线带回来。
        // 一钩只能带一样东西，所以「先捞道具还是先钩鱼」是实打实的取舍。
        if (this.hook.canLatch()) {
            const tip = this.hook.tip;
            const p = this.props.find(tip.x, tip.y, TUNE.hookR);
            if (p) {
                this.fx.ripple(p.x, p.y);
                this.props.detach(p);
                this.hook.latch(p);
                // 同一帧就贴到钩爪上：等下一帧才 followTo 的话会看见道具往下跳一下
                p.followTo(tip.x, tip.y);
                this.audio.click();
            }
        }

        if (this.hook.state === 'aim' && this.hook.carrying) {
            const f = this.hook.takeCarried();
            if (f) {
                this.score += f.value;
                this.fx.popup(this.hook.originX, this.hook.originY + 40, '+' + f.value);
                this.removeFish(f);
                this.spawnTimer = TUNE.respawnDelay;
            }
        }

        // 道具收上来了：效果在这一刻生效，飘字压在竿尖上
        if (this.hook.state === 'aim' && this.hook.carryingProp) {
            const p = this.hook.takeCarriedProp();
            this.applyProp(p.kind, this.hook.originX, this.hook.originY + 40);
            p.node.destroy();
        }

        // 补鱼
        this.spawnTimer -= dt;
        if (this.fishes.length < TUNE.maxFish && this.spawnTimer <= 0) {
            this.spawnFish(null);
            this.spawnTimer = TUNE.respawnDelay;
        }

        this.hud.updateHud(this.score, this.target(), this.level, this.timeLeft, TUNE.levelTime);
    }

    onDestroy(): void {
        input.off(Input.EventType.TOUCH_START, this.onTouch, this);
        input.off(Input.EventType.MOUSE_DOWN, this.onMouse, this);
        input.off(Input.EventType.KEY_DOWN, this.onKey, this);
    }

    // ================= 场景构建 =================

    private buildScene(): void {
        const canvas = this.node;

        // 必须挂在 Canvas（或 Canvas 的子孙节点）下面，否则 UI 不会被渲染，
        // 表现就是预览窗口一片底色。这里直接给出可执行的提示。
        if (!this.findCanvas()) {
            throw new Error(
                `GameRoot 要挂在 Canvas 节点上。\n\n当前挂载的节点是「${canvas.name}」，`
                + '它不在任何 Canvas 下面。\n\n层级管理器 → 选中 Canvas → 添加组件 → 自定义脚本 → GameRoot',
            );
        }

        // Canvas 自带 UITransform，重复 addComponent 会挂两个，必须先取
        const ut = canvas.getComponent(UITransform) || canvas.addComponent(UITransform);
        ut.setContentSize(DESIGN.w, DESIGN.h);
        this.fitToScreen(canvas, ut);

        this.audio = new GameAudio(canvas);
        this.bg = new Background(canvas);
        this.bg.setCamera(this.cam);
        this.scenery = new Scenery(canvas);
        this.fishLayer = this.makeNode('FishLayer', canvas);
        this.bubbles = new Bubbles(canvas, 28);
        this.fx = new Fx(canvas);

        // 鱼线要画在甲板之后（否则会被甲板截断），又要画在角色之后（压在裙摆上面）。
        // 钩子摆到左侧时钩尖正好落在裙摆上，若压在角色下面，鱼线被身体挡住、
        // 只剩半个钩尖从裙子边缘露出来，看起来就像钩子「穿」到衣服后边去了。
        const hookLayer = this.makeNode('HookLayer', canvas);
        this.hook = new Hook(hookLayer);
        const princessLayer = this.makeNode('PrincessLayer', canvas);
        this.princess = new Princess(princessLayer);

        this.hud = new Hud(canvas);
        this.props = new Props(canvas);
        this.picker = new PrincessPicker(canvas);
        this.sndBtn = new SoundButton(canvas, this.audio.soundOn);
        this.gate = new OrientationGate(canvas);

        // 固定层级顺序：按顺序设 siblingIndex 结果是确定的
        const layers: Node[] = [
            this.bg.node,          // 天空 / 远山 / 日月 / 水体
            this.scenery.back,     // 樱花 + 栏杆
            this.scenery.lanternNode,
            this.fishLayer,
            this.bubbles.node,
            this.scenery.front,    // 甲板 + 岸边带
            princessLayer,
            hookLayer,             // 鱼线 + 鱼钩：压在角色身上，钩子才不会被裙子挡住
            this.fx.node,          // 涟漪 + 飘字（网页版画在角色之后、HUD 之前）
            this.props.items,      // 水里的道具：在 HUD 之下，不挡牌匾
            this.props.fog,        // 大雾：盖住鱼和钩，但压在 HUD 之下（否则连倒计时都看不见）
            this.hud.node,         // 牌匾 HUD + 结算面板
            this.picker.node,      // 换装按钮 + 候选列表
            this.sndBtn.node,
            this.props.ui,         // 暂停遮罩 + 减速状态条：要盖住 HUD
            this.gate.node,        // 竖屏提示：永远在最上面
        ];
        for (let i = 0; i < layers.length; i++) {
            layers[i].setSiblingIndex(i);
        }

        this.gate.check();

        input.on(Input.EventType.TOUCH_START, this.onTouch, this);
        input.on(Input.EventType.MOUSE_DOWN, this.onMouse, this);
        input.on(Input.EventType.KEY_DOWN, this.onKey, this);
    }

    /** 从当前节点往上找 Canvas，找不到说明挂错了地方 */
    private findCanvas(): Canvas | null {
        let n: Node | null = this.node;
        while (n) {
            const c = n.getComponent(Canvas);
            if (c) {
                return c;
            }
            n = n.parent;
        }
        return null;
    }

    /**
     * 把 Canvas 节点和相机重新对齐到当前可视区域，并刷新 VIEW。
     *
     * `view.setDesignResolutionSize()` 只改 view 里的设计分辨率，**不会**回头改
     * Canvas 节点的位置和相机的 orthoHeight。不在改完之后手动对一次，
     * 相机会停在旧的可视尺寸上：画面整体偏一边、另一侧露出相机的黑底，
     * 鱼也会在还看得见水的地方「凭空消失」。
     */
    private fitToScreen(canvas: Node, ut: UITransform): void {
        syncView();
        const vs = view.getVisibleSize();
        canvas.setPosition(vs.width / 2, vs.height / 2, 0);
        ut.setContentSize(vs.width, vs.height);
        const cam = this.findCanvas()?.cameraComponent ?? null;
        if (cam) {
            cam.orthoHeight = vs.height / 2;
        }
        this.cam = cam;
    }

    private onResize(): void {
        const ut = this.node.getComponent(UITransform);
        if (!ut) {
            return;
        }
        this.fitToScreen(this.node, ut);
        if (this.bg) {
            this.bg.setCamera(this.cam);
            this.bg.refresh();
        }
        if (this.hud) {
            this.hud.relayout();
        }
        if (this.sndBtn) {
            this.sndBtn.relayout();
        }
        if (this.picker) {
            this.picker.relayout();
        }
        if (this.props) {
            this.props.relayout();
        }
        if (this.gate) {
            this.gate.check();
        }
    }

    private makeNode(name: string, parent: Node): Node {
        const n = new Node(name);
        n.layer = parent.layer;
        n.addComponent(UITransform);
        n.setParent(parent);
        return n;
    }

    // ================= 资源 =================

    private loadAssets(): void {
        resources.load('config/fish-config', JsonAsset, (err, asset) => {
            if (err || !asset) {
                console.error('[GameRoot] 配置加载失败', err);
                return;
            }
            this.table = asset.json as FishTable;
            this.loadFrames();
        });
    }

    private loadFrames(): void {
        const names = Object.keys(this.table);
        let left = names.length;
        const done = () => {
            left--;
            if (left <= 0) {
                // 鱼群就绪后再取两只负面生物的贴图，然后才轮到公主
                this.loadBeasts(() => this.loadPrincess());
            }
        };
        for (const key of names) {
            const path = `images/fish/${this.table[key].image}/spriteFrame`;
            resources.load(path, SpriteFrame, (e, sf) => {
                if (e || !sf) {
                    console.error('[GameRoot] 鱼类贴图加载失败', key, e);
                } else {
                    this.frames[key] = sf;
                }
                done();
            });
        }
    }

    /**
     * 负面生物的贴图（章鱼 / 剑鱼）。
     *
     * 加载失败不阻塞开局：Props 拿不到贴图时会自动退回圆徽章形态，
     * 效果照旧、只是不好看 —— 总比整个道具系统哑掉强。
     */
    private loadBeasts(done: () => void): void {
        const kinds = Object.keys(BEAST) as BeastKind[];
        const out: { [k: string]: SpriteFrame } = {};
        let left = kinds.length;
        for (const k of kinds) {
            resources.load(`images/fish/${BEAST[k].image}/spriteFrame`, SpriteFrame, (e, sf) => {
                if (e || !sf) {
                    console.error('[GameRoot] 负面生物贴图加载失败', k, e);
                } else {
                    out[BEAST[k].image] = sf;
                }
                if (--left <= 0) {
                    this.props.setBeastFrames(out);
                    done();
                }
            });
        }
    }

    /** 加载顶部角色（公主）配置与贴图，全部就绪后才进入可玩状态 */
    private loadPrincess(): void {
        resources.load('config/princess-config', JsonAsset, (err, asset) => {
            if (err || !asset) {
                console.error('[GameRoot] 公主配置加载失败', err);
                this.readyToPlay();
                return;
            }
            this.pTable = asset.json as PrincessTable;
            this.pKeys = Object.keys(this.pTable);
            if (!this.pKeys.length) {
                this.readyToPlay();
                return;
            }
            let left = this.pKeys.length;
            for (const k of this.pKeys) {
                const path = `images/princess/${this.pTable[k].image || k}/spriteFrame`;
                resources.load(path, SpriteFrame, (e, sf) => {
                    if (e || !sf) {
                        console.error('[GameRoot] 公主贴图加载失败', k, e);
                    } else {
                        this.pFrames[k] = sf;
                    }
                    if (--left <= 0) {
                        this.buildPicker();
                        this.applyPrincess(0);
                        this.readyToPlay();
                    }
                });
            }
        });
    }

    /** 贴图齐了再建换装条，避免出现空槽 */
    private buildPicker(): void {
        const defs: { key: string; def: PrincessDef; frame: SpriteFrame }[] = [];
        for (const k of this.pKeys) {
            if (this.pTable[k] && this.pFrames[k]) {
                defs.push({ key: k, def: this.pTable[k], frame: this.pFrames[k] });
            }
        }
        this.picker.build(defs);
    }

    private readyToPlay(): void {
        this.mode = 'ready';
        this.hud.showOverlay('黄金鱼钩', [
            '点击 / 空格 出钩，钩住游动的鱼',
            '越深越大的鱼价值越高，收线也越慢',
            '钩住水里的道具，收上来立刻生效：减速 / 暂停 / 加时',
            '点左上头像（或数字键 1-8）可以换装',
            '限时 60 秒，达标进入下一关',
        ], '点击任意位置开始');
    }

    /** 换装：同时把鱼线支点挪到新角色的竿尖 */
    applyPrincess(i: number): void {
        if (!this.pKeys.length) {
            return;
        }
        this.pIndex = ((i % this.pKeys.length) + this.pKeys.length) % this.pKeys.length;
        const key = this.pKeys[this.pIndex];
        const def: PrincessDef = this.pTable[key];
        const sf = this.pFrames[key];
        if (!def || !sf) {
            return;
        }
        this.princess.apply(def, sf);
        this.hook.setOrigin(this.princess.tipX, this.princess.tipY);
        if (this.props) {
            // 道具的生成扇形跟着竿尖走，否则换了角色之后道具会落在够不着的地方
            this.props.setOrigin(this.princess.tipX, this.princess.tipY);
        }
        this.picker.setCurrent(key);
        this.picker.setCurrentName(def.name);
    }

    // ================= 鱼 =================

    private pickType(): string {
        const keys = Object.keys(this.table);
        let total = 0;
        for (const k of keys) {
            total += (ZONE[k] ? ZONE[k].weight : 1);
        }
        let r = Math.random() * total;
        for (const k of keys) {
            r -= (ZONE[k] ? ZONE[k].weight : 1);
            if (r <= 0) {
                return k;
            }
        }
        return keys[0];
    }

    private spawnFish(opts: { type?: string; x?: number; y?: number; dir?: number } | null): Fish | null {
        const type = (opts && opts.type) || this.pickType();
        const def: FishDef = this.table[type];
        const sf = this.frames[type];
        if (!def || !sf) {
            return null;
        }

        const zone = ZONE[type] || { y: [220, 400] as [number, number], weight: 1 };
        const dir = (opts && opts.dir) || (Math.random() < 0.5 ? 1 : -1);
        const y = opts && opts.y !== undefined
            ? opts.y
            : zone.y[0] + Math.random() * (zone.y[1] - zone.y[0]);

        let x = opts && opts.x !== undefined
            ? opts.x
            : (dir > 0
                ? VIEW.left - def.baseSize * 0.6 - Math.random() * 80
                : VIEW.right + def.baseSize * 0.6 + Math.random() * 80);

        // 出生避让
        if (opts && opts.x !== undefined) {
            for (let t = 0; t < 14; t++) {
                let ok = true;
                for (const o of this.fishes) {
                    const dx = o.x - x, dy = o.y - y;
                    const minD = (o.size + def.baseSize) * 0.58;
                    if (dx * dx + dy * dy < minD * minD) {
                        ok = false;
                        break;
                    }
                }
                if (ok) {
                    break;
                }
                x = VIEW.left + 60 + Math.random() * (VIEW.w - 120);
            }
        }

        const node = new Node('fish_' + type);
        node.layer = this.fishLayer.layer;
        node.addComponent(UITransform);
        node.setParent(this.fishLayer);

        const fish = new Fish(node, def, x, y, dir, sf);
        this.fishes.push(fish);
        return fish;
    }

    /** 开局铺鱼：保证屏幕内已有鱼，且深海鱼必然在场 */
    private seedFish(): void {
        const plan: Array<[string, number]> = [
            ['shark', 580], ['ray', 560], ['golden_koi', 520],
            ['angelfish', 470], ['pufferfish', 440], ['goldfish', 430],
            ['blue_tang', 405], ['clownfish', 420],
        ];
        for (const p of plan) {
            if (!this.table[p[0]]) {
                continue;
            }
            this.spawnFish({
                type: p[0],
                y: p[1],
                // 摊在整个可见宽度上，宽屏上也不会全挤在中间
                x: VIEW.left + 80 + Math.random() * (VIEW.w - 160),
                dir: Math.random() < 0.5 ? 1 : -1,
            });
        }
    }

    private removeFish(f: Fish): void {
        const i = this.fishes.indexOf(f);
        if (i >= 0) {
            this.fishes.splice(i, 1);
        }
        f.node.destroy();
    }

    private clearFish(): void {
        for (const f of this.fishes) {
            f.node.destroy();
        }
        this.fishes = [];
    }

    // ================= 流程 =================

    private target(): number {
        return TUNE.targetBase + (this.level - 1) * TUNE.targetStep;
    }

    // ================= 道具 =================

    /**
     * 吃到道具。效果在这一刻（收线到顶）才生效，不是钩尖碰到的瞬间 ——
     * 和鱼一致：钩到水里一枚东西，得先把它拉上来。
     *
     *  - 减速：可叠加刷新（再吃一个就把剩余时间重置成满）
     *  - 暂停：冻结全场，倒计时走完自动恢复，期间点击无效
     *  - 加时：直接加 10 秒，上限 PROP.maxLevelTime
     *  - 大雾（负面）：糊住水面 3 秒，看得见轮廓、看不见细节
     *  - 断线（负面）：鱼线绷断，3 秒内不能出钩，最后一点几秒慢慢长回来
     */
    private applyProp(kind: PropKind, x: number, y: number): void {
        this.audio.prop();
        this.fx.ripple(x, y);

        if (kind === 'slow') {
            this.slowT = PROP.slowDur;
            this.props.setSlow(this.slowT);
            this.fx.popup(x, y - 34, '鱼群减速');
        } else if (kind === 'pause') {
            this.pauseT = PROP.pauseDur;
            this.props.showPause(this.pauseT);
        } else if (kind === 'fog') {
            this.fogT = PROP.fogDur;
            this.props.setFog(this.fogT);
            this.fx.popup(x, y - 34, '大雾 ' + PROP.fogDur + ' 秒', NEG_TINT);
        } else if (kind === 'break') {
            this.breakT = PROP.breakDur;
            this.props.setBroken(this.breakT);
            this.hook.breakLine(PROP.breakDur);
            this.fx.popup(x, y - 34, '鱼线断了', NEG_TINT);
        } else {
            this.timeLeft = Math.min(PROP.maxLevelTime, this.timeLeft + PROP.addTime);
            this.fx.popup(x, y - 34, '+' + PROP.addTime + '秒');
        }
    }

    /** 换关 / 重开：清掉水里的道具和所有 buff */
    private resetProps(): void {
        this.slowT = 0;
        this.pauseT = 0;
        this.fogT = 0;
        this.breakT = 0;
        // 钩子上可能正挂着一枚道具：它已经被 Props 摘出列表了，
        // 不在这里销毁的话节点会一直留在场景里
        const held = this.hook.takeCarriedProp();
        if (held) {
            held.node.destroy();
        }
        this.props.reset();
    }

    private startGame(): void {
        this.clearFish();
        this.picker.close();
        this.score = 0;
        this.level = 1;
        this.timeLeft = TUNE.levelTime;
        this.spawnTimer = 0;
        // 先摘道具再 reset 钩子：顺序反了就拿不到手上那枚了
        this.resetProps();
        this.hook.reset();
        this.seedFish();
        this.mode = 'aim';
        this.hud.hideOverlay();
        this.hud.updateHud(this.score, this.target(), this.level, this.timeLeft, TUNE.levelTime);
    }

    private endLevel(): void {
        // 网页版结算时会先把钩着的鱼收进来（landFish）
        const carried = this.hook.takeCarried();
        if (carried) {
            this.score += carried.value;
            this.fx.popup(this.hook.originX, this.hook.originY + 40, '+' + carried.value);
            this.removeFish(carried);
        }
        this.levelPassed = this.score >= this.target();
        this.mode = 'levelend';
        // 结算时清场：水里的道具、减速状态条都不该留到结算面板上
        this.resetProps();
        this.audio.win();
        const body = this.levelPassed
            ? [`本关金币　${this.score}`, `目标金币　${this.target()}`, `准备进入第 ${this.level + 1} 关`]
            : [`本关金币　${this.score}`, `目标金币　${this.target()}`, '未达标，再来一次'];
        this.hud.showOverlay(this.levelPassed ? '过关' : '时间到', body, '点击继续');
    }

    private nextLevel(): void {
        this.level += 1;
        this.score = 0;
        this.timeLeft = TUNE.levelTime;
        this.clearFish();
        this.picker.close();
        // 先摘道具再 reset 钩子：顺序反了就拿不到手上那枚了
        this.resetProps();
        this.hook.reset();
        this.seedFish();
        this.mode = 'aim';
        this.hud.hideOverlay();
        this.hud.updateHud(this.score, this.target(), this.level, this.timeLeft, TUNE.levelTime);
    }

    // ================= 输入 =================

    private onTouch(e: EventTouch): void {
        const p = e.getUILocation();
        this.pointer(p.x, p.y);
    }

    private onMouse(e: EventMouse): void {
        const p = e.getUILocation();
        this.pointer(p.x, p.y);
    }

    /**
     * 统一指针入口。参数是 UI 坐标（左下原点）。
     * 桌面上一次点击会同时派发 TOUCH_START 与 MOUSE_DOWN，用 90ms 去重。
     */
    private pointer(ux: number, uy: number): void {
        const now = Date.now();
        if (now - this.lastAct < 90) {
            return;
        }
        this.lastAct = now;

        // 浏览器要求音频在用户手势里启动
        this.audio.startBgm();

        const ut = this.node.getComponent(UITransform)!;
        const local = ut.convertToNodeSpaceAR(new Vec3(ux, uy, 0));
        const dx = local.x + DESIGN.w / 2;
        const dy = DESIGN.h / 2 - local.y;

        // 竖屏提示层压在最上面：只有「全屏并横屏」按钮会响应，其余点击一律吃掉
        if (this.gate && this.gate.isBlocked) {
            this.gate.tap(dx, dy);
            return;
        }

        // 暂停期间整块画面是冻住的，任何点击都不该穿透（包括静音键和换装）
        if (this.pauseT > 0) {
            return;
        }

        if (this.sndBtn.hitTest(dx, dy)) {
            this.sndBtn.setOn(this.audio.toggle());
            this.audio.click();
            return;
        }
        const hit = this.picker.hitTest(dx, dy);
        if (hit) {
            if (hit.type === 'toggle') {
                this.picker.toggle();
                this.audio.click();
                return;
            }
            if (hit.type === 'pick') {
                this.applyPrincess(hit.index);
                this.picker.close();
                this.audio.click();
                return;
            }
            // 列表展开时点空白：只收起列表，不顺手出钩
            this.picker.close();
            this.audio.click();
            return;
        }
        this.action();
    }

    private onKey(e: EventKeyboard): void {
        this.audio.startBgm();
        if (this.gate && this.gate.isBlocked) {
            return;
        }
        if (e.keyCode === KeyCode.SPACE || e.keyCode === KeyCode.ENTER) {
            this.action();
            return;
        }
        if (e.keyCode === KeyCode.KEY_M) {
            this.sndBtn.setOn(this.audio.toggle());
            return;
        }
        // 数字键 1-8 换装
        if (e.keyCode >= KeyCode.DIGIT_1 && e.keyCode <= KeyCode.DIGIT_8) {
            this.applyPrincess(e.keyCode - KeyCode.DIGIT_1);
            this.picker.close();
            this.audio.click();
        }
    }

    private action(): void {
        // 暂停冻结期间不响应出钩，避免恢复的瞬间被连点吃掉一次机会
        if (this.pauseT > 0) {
            return;
        }
        if (this.mode === 'ready') {
            this.startGame();
            return;
        }
        if (this.mode === 'levelend') {
            if (this.levelPassed) {
                this.nextLevel();
            } else {
                this.startGame();
            }
            return;
        }
        if (this.mode === 'aim') {
            // 断线期间点屏幕要有回应。不然玩家只看到「点了没出钩」，
            // 会当成卡了或者没点准，然后一直连点 —— 那才是真正的负面体验。
            if (this.hook.broken) {
                const now = Date.now();
                if (now - this.breakTipAt > 500) {
                    this.breakTipAt = now;
                    this.fx.popup(this.hook.originX, this.hook.originY + 40, '鱼线修复中', NEG_TINT);
                }
                return;
            }
            if (this.hook.fire()) {
                this.audio.cast();
            }
        }
    }
}
