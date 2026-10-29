var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { _decorator, Component, Node, UITransform, SpriteFrame, Vec3, Canvas, Graphics, Color, Label, HorizontalTextAlignment, VerticalTextAlignment, resources, JsonAsset, input, Input, KeyCode, view, ResolutionPolicy, } from 'cc';
import { TUNE, ZONE, DESIGN } from './GameConfig.js';
import { Fish } from './Fish.js';
import { Hook } from './Hook.js';
import { Princess } from './Princess.js';
import { Background } from './Background.js';
import { Scenery } from './Scenery.js';
import { Bubbles } from './Bubbles.js';
import { Fx } from './Fx.js';
import { Hud } from './Hud.js';
import { PrincessPicker } from './PrincessPicker.js';
import { GameAudio, SoundButton } from './Audio.js';
import { lightAt, phaseOf } from './DayNight.js';
const { ccclass } = _decorator;
/**
 * 游戏总入口。挂到 Canvas 上即可运行。
 *
 * 所有节点都在代码里按固定顺序构建，层级顺序与网页版的绘制顺序一一对应：
 *   背景 → 樱花栏杆 → 灯笼 → 鱼群 → 气泡 → 甲板 → 鱼线 → 角色 → HUD → 换装条 → 静音键
 * 这样不用在编辑器里手工摆放，也方便版本管理。
 */
let GameRoot = class GameRoot extends Component {
    constructor() {
        super(...arguments);
        this.table = {};
        this.frames = {};
        this.fishes = [];
        this.pTable = {};
        this.pFrames = {};
        this.pKeys = [];
        this.pIndex = 0;
        this.mode = 'loading';
        this.score = 0;
        this.level = 1;
        this.timeLeft = 0;
        this.spawnTimer = 0;
        this.levelPassed = false;
        /** 昼夜时钟，跨关连续累加 */
        this.clock = 0;
        /** 气泡重绘节流 */
        this.bubAcc = 0;
        /** 同一次点击可能同时派发 TOUCH_START 与 MOUSE_DOWN，用它去重 */
        this.lastAct = 0;
    }
    // ================= 生命周期 =================
    onLoad() {
        console.log('[GameRoot] onLoad on', this.node.name, 'layer', this.node.layer);
        view.setDesignResolutionSize(DESIGN.w, DESIGN.h, ResolutionPolicy.SHOW_ALL);
        try {
            this.buildScene();
            console.log('[GameRoot] 场景构建完成，子节点', this.node.children.length);
        }
        catch (e) {
            const err = e;
            console.error('[GameRoot] 场景构建失败：', err && err.message, err && err.stack);
            this.showFatal(err && err.message ? err.message : String(e));
        }
    }
    /**
     * 出错时把原因直接画在屏幕上。
     * 否则预览窗口只有一片底色，根本看不出是没挂上脚本还是代码抛了异常。
     */
    showFatal(msg) {
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
    start() {
        this.loadAssets();
    }
    update(dt) {
        // 昼夜、装饰、气泡、音频淡入与游戏状态无关，一直推进
        this.clock += dt;
        this.bg.update(dt, this.clock);
        this.scenery.update(dt, this.clock);
        this.audio.update(dt);
        // 压在背景上的文字跟着昼夜换色
        const light = lightAt(phaseOf(this.clock));
        this.hud.setLight(light);
        this.picker.setLight(light);
        this.bubAcc += dt;
        if (this.bubAcc >= 0.05) {
            this.bubbles.update(this.bubAcc);
            this.bubAcc = 0;
        }
        // 涟漪 / 飘字推进
        this.fx.update(dt);
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
        // 鱼群
        for (const f of this.fishes) {
            f.update(dt);
        }
        // 鱼钩
        const caught = this.hook.update(dt, this.fishes);
        if (caught) {
            this.audio.catchOne();
            this.fx.ripple(caught.x, caught.y);
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
        // 补鱼
        this.spawnTimer -= dt;
        if (this.fishes.length < TUNE.maxFish && this.spawnTimer <= 0) {
            this.spawnFish(null);
            this.spawnTimer = TUNE.respawnDelay;
        }
        this.hud.updateHud(this.score, this.target(), this.level, this.timeLeft, TUNE.levelTime);
    }
    onDestroy() {
        input.off(Input.EventType.TOUCH_START, this.onTouch, this);
        input.off(Input.EventType.MOUSE_DOWN, this.onMouse, this);
        input.off(Input.EventType.KEY_DOWN, this.onKey, this);
    }
    // ================= 场景构建 =================
    buildScene() {
        const canvas = this.node;
        // 必须挂在 Canvas（或 Canvas 的子孙节点）下面，否则 UI 不会被渲染，
        // 表现就是预览窗口一片底色。这里直接给出可执行的提示。
        if (!this.findCanvas()) {
            throw new Error(`GameRoot 要挂在 Canvas 节点上。\n\n当前挂载的节点是「${canvas.name}」，`
                + '它不在任何 Canvas 下面。\n\n层级管理器 → 选中 Canvas → 添加组件 → 自定义脚本 → GameRoot');
        }
        // Canvas 自带 UITransform，重复 addComponent 会挂两个，必须先取
        const ut = canvas.getComponent(UITransform) || canvas.addComponent(UITransform);
        ut.setContentSize(DESIGN.w, DESIGN.h);
        this.audio = new GameAudio(canvas);
        this.bg = new Background(canvas);
        this.scenery = new Scenery(canvas);
        this.fishLayer = this.makeNode('FishLayer', canvas);
        this.bubbles = new Bubbles(canvas, 28);
        this.fx = new Fx(canvas);
        // 鱼线在甲板之后、角色之前：角色是压在栈道上的
        const hookLayer = this.makeNode('HookLayer', canvas);
        this.hook = new Hook(hookLayer);
        const princessLayer = this.makeNode('PrincessLayer', canvas);
        this.princess = new Princess(princessLayer);
        this.hud = new Hud(canvas);
        this.picker = new PrincessPicker(canvas);
        this.sndBtn = new SoundButton(canvas, this.audio.soundOn);
        // 固定层级顺序：按顺序设 siblingIndex 结果是确定的
        const layers = [
            this.bg.node, // 天空 / 远山 / 日月 / 水体
            this.scenery.back, // 樱花 + 栏杆
            this.scenery.lanternNode,
            this.fishLayer,
            this.bubbles.node,
            this.scenery.front, // 甲板 + 岸边带
            hookLayer,
            princessLayer,
            this.fx.node, // 涟漪 + 飘字（网页版画在角色之后、HUD 之前）
            this.hud.node, // 牌匾 HUD + 结算面板
            this.picker.node, // 换装条
            this.sndBtn.node,
        ];
        for (let i = 0; i < layers.length; i++) {
            layers[i].setSiblingIndex(i);
        }
        input.on(Input.EventType.TOUCH_START, this.onTouch, this);
        input.on(Input.EventType.MOUSE_DOWN, this.onMouse, this);
        input.on(Input.EventType.KEY_DOWN, this.onKey, this);
    }
    /** 从当前节点往上找 Canvas，找不到说明挂错了地方 */
    findCanvas() {
        let n = this.node;
        while (n) {
            const c = n.getComponent(Canvas);
            if (c) {
                return c;
            }
            n = n.parent;
        }
        return null;
    }
    makeNode(name, parent) {
        const n = new Node(name);
        n.layer = parent.layer;
        n.addComponent(UITransform);
        n.setParent(parent);
        return n;
    }
    // ================= 资源 =================
    loadAssets() {
        resources.load('config/fish-config', JsonAsset, (err, asset) => {
            if (err || !asset) {
                console.error('[GameRoot] 配置加载失败', err);
                return;
            }
            this.table = asset.json;
            this.loadFrames();
        });
    }
    loadFrames() {
        const names = Object.keys(this.table);
        let left = names.length;
        const done = () => {
            left--;
            if (left <= 0) {
                this.loadPrincess();
            }
        };
        for (const key of names) {
            const path = `images/fish/${this.table[key].image}/spriteFrame`;
            resources.load(path, SpriteFrame, (e, sf) => {
                if (e || !sf) {
                    console.error('[GameRoot] 鱼类贴图加载失败', key, e);
                }
                else {
                    this.frames[key] = sf;
                }
                done();
            });
        }
    }
    /** 加载顶部角色（公主）配置与贴图，全部就绪后才进入可玩状态 */
    loadPrincess() {
        resources.load('config/princess-config', JsonAsset, (err, asset) => {
            if (err || !asset) {
                console.error('[GameRoot] 公主配置加载失败', err);
                this.readyToPlay();
                return;
            }
            this.pTable = asset.json;
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
                    }
                    else {
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
    buildPicker() {
        const defs = [];
        for (const k of this.pKeys) {
            if (this.pTable[k] && this.pFrames[k]) {
                defs.push({ key: k, def: this.pTable[k], frame: this.pFrames[k] });
            }
        }
        this.picker.build(defs);
    }
    readyToPlay() {
        this.mode = 'ready';
        this.hud.showOverlay('黄金鱼钩', [
            '点击 / 空格 出钩，钩住游动的鱼',
            '越深越大的鱼价值越高，收线也越慢',
            '数字键 1-8 或点左下头像可以换装',
            '限时 60 秒，达标进入下一关',
        ], '点击任意位置开始');
    }
    /** 换装：同时把鱼线支点挪到新角色的竿尖 */
    applyPrincess(i) {
        if (!this.pKeys.length) {
            return;
        }
        this.pIndex = ((i % this.pKeys.length) + this.pKeys.length) % this.pKeys.length;
        const key = this.pKeys[this.pIndex];
        const def = this.pTable[key];
        const sf = this.pFrames[key];
        if (!def || !sf) {
            return;
        }
        this.princess.apply(def, sf);
        this.hook.setOrigin(this.princess.tipX, this.princess.tipY);
        this.picker.setCurrent(key);
        this.picker.setCurrentName(def.name);
    }
    // ================= 鱼 =================
    pickType() {
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
    spawnFish(opts) {
        const type = (opts && opts.type) || this.pickType();
        const def = this.table[type];
        const sf = this.frames[type];
        if (!def || !sf) {
            return null;
        }
        const zone = ZONE[type] || { y: [220, 400], weight: 1 };
        const dir = (opts && opts.dir) || (Math.random() < 0.5 ? 1 : -1);
        const y = opts && opts.y !== undefined
            ? opts.y
            : zone.y[0] + Math.random() * (zone.y[1] - zone.y[0]);
        let x = opts && opts.x !== undefined
            ? opts.x
            : (dir > 0 ? -def.baseSize * 0.6 - Math.random() * 80 : DESIGN.w + def.baseSize * 0.6 + Math.random() * 80);
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
                x = 100 + Math.random() * (DESIGN.w - 200);
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
    seedFish() {
        const plan = [
            ['shark', 540], ['ray', 500], ['golden_koi', 420],
            ['angelfish', 300], ['pufferfish', 330], ['goldfish', 250],
            ['blue_tang', 230], ['clownfish', 280],
        ];
        for (const p of plan) {
            if (!this.table[p[0]]) {
                continue;
            }
            this.spawnFish({
                type: p[0],
                y: p[1],
                x: 120 + Math.random() * (DESIGN.w - 240),
                dir: Math.random() < 0.5 ? 1 : -1,
            });
        }
    }
    removeFish(f) {
        const i = this.fishes.indexOf(f);
        if (i >= 0) {
            this.fishes.splice(i, 1);
        }
        f.node.destroy();
    }
    clearFish() {
        for (const f of this.fishes) {
            f.node.destroy();
        }
        this.fishes = [];
    }
    // ================= 流程 =================
    target() {
        return TUNE.targetBase + (this.level - 1) * TUNE.targetStep;
    }
    startGame() {
        this.clearFish();
        this.score = 0;
        this.level = 1;
        this.timeLeft = TUNE.levelTime;
        this.spawnTimer = 0;
        this.hook.reset();
        this.seedFish();
        this.mode = 'aim';
        this.hud.hideOverlay();
        this.hud.updateHud(this.score, this.target(), this.level, this.timeLeft, TUNE.levelTime);
    }
    endLevel() {
        // 网页版结算时会先把钩着的鱼收进来（landFish）
        const carried = this.hook.takeCarried();
        if (carried) {
            this.score += carried.value;
            this.fx.popup(this.hook.originX, this.hook.originY + 40, '+' + carried.value);
            this.removeFish(carried);
        }
        this.levelPassed = this.score >= this.target();
        this.mode = 'levelend';
        this.audio.win();
        const body = this.levelPassed
            ? [`本关金币　${this.score}`, `目标金币　${this.target()}`, `准备进入第 ${this.level + 1} 关`]
            : [`本关金币　${this.score}`, `目标金币　${this.target()}`, '未达标，再来一次'];
        this.hud.showOverlay(this.levelPassed ? '过关' : '时间到', body, '点击继续');
    }
    nextLevel() {
        this.level += 1;
        this.score = 0;
        this.timeLeft = TUNE.levelTime;
        this.clearFish();
        this.hook.reset();
        this.seedFish();
        this.mode = 'aim';
        this.hud.hideOverlay();
        this.hud.updateHud(this.score, this.target(), this.level, this.timeLeft, TUNE.levelTime);
    }
    // ================= 输入 =================
    onTouch(e) {
        const p = e.getUILocation();
        this.pointer(p.x, p.y);
    }
    onMouse(e) {
        const p = e.getUILocation();
        this.pointer(p.x, p.y);
    }
    /**
     * 统一指针入口。参数是 UI 坐标（左下原点）。
     * 桌面上一次点击会同时派发 TOUCH_START 与 MOUSE_DOWN，用 90ms 去重。
     */
    pointer(ux, uy) {
        const now = Date.now();
        if (now - this.lastAct < 90) {
            return;
        }
        this.lastAct = now;
        // 浏览器要求音频在用户手势里启动
        this.audio.startBgm();
        const ut = this.node.getComponent(UITransform);
        const local = ut.convertToNodeSpaceAR(new Vec3(ux, uy, 0));
        const dx = local.x + DESIGN.w / 2;
        const dy = DESIGN.h / 2 - local.y;
        if (this.sndBtn.hitTest(dx, dy)) {
            this.sndBtn.setOn(this.audio.toggle());
            this.audio.click();
            return;
        }
        const i = this.picker.hitTest(dx, dy);
        if (i >= 0) {
            this.applyPrincess(i);
            this.audio.click();
            return;
        }
        this.action();
    }
    onKey(e) {
        this.audio.startBgm();
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
            this.audio.click();
        }
    }
    action() {
        if (this.mode === 'ready') {
            this.startGame();
            return;
        }
        if (this.mode === 'levelend') {
            if (this.levelPassed) {
                this.nextLevel();
            }
            else {
                this.startGame();
            }
            return;
        }
        if (this.mode === 'aim') {
            if (this.hook.fire()) {
                this.audio.cast();
            }
        }
    }
};
GameRoot = __decorate([
    ccclass('GameRoot')
], GameRoot);
export { GameRoot };
