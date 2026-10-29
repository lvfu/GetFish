import { Node, Graphics, UITransform, Color, Label, Sprite, UIOpacity, HorizontalTextAlignment, VerticalTextAlignment, } from 'cc';
import { DESIGN, VIEW, PROP, PROP_WEIGHT, TUNE, BEAST, BEAST_Y, BEAST_LIFE, px, py, } from './GameConfig.js';
import { PAL, col, rectD, roundRectD, circleD, ellipseD, moveToD, lineToD } from './DayNight.js';
/**
 * 道具层。
 *
 * 水里有两套视觉语言，故意的：
 *
 * 1. **增益道具 = 圆徽章。** 和鱼一样会横向飘，只是慢得多、来回晃。
 *    真要一动不动地钉在水里，整片水面只有鱼在动，徽章看着像背景贴图；
 *    让它慢慢左右摇，才像「水里飘着的一个宝贝」。
 *    漂移幅度按可钩扇形里剩的宽度收缩，贴着边缘刷出来的就少漂一点 ——
 *    不能让它摇出摆幅够不着的地方，否则玩家只能看着它在那儿晃。
 *
 * 2. **负面道具 = 会游的活物（章鱼 / 剑鱼）。** 从屏幕外游进来横穿鱼塘。
 *    活物会在鱼群里穿来穿去，你瞄的那条鱼背后正好游过一只章鱼，这一钩就有风险了 ——
 *    风险和收益这才在同一根线上，而不是「水里有个红圈圈，别点它」。
 *
 * 但负面生物头顶挂一小块警示标：仔细看能认出来，忙起来会看漏。
 * 完全伪装成普通鱼看着刺激，实际是让玩家赌 —— 赌输了只会觉得被耍，不会觉得自己手滑。
 *
 * 深度上：徽章卡在待机钩尖以下（y ≥ 470），免得空钩顺手捡走；
 * 生物放宽到 418 起 —— 活物本来就在水里乱窜，锁死在深水区反而不像鱼。
 *
 * 视觉上增益道具全部用 Graphics 画（项目里没有道具贴图）；
 * 负面生物用 ImageGen 出的贴图，风格和鱼群同一套。
 */
/** 三种道具的主色 / 底色 / 名字（徽章形态用；生物形态走 BEAST 配置） */
const RIM = {
    slow: [96, 160, 194],
    pause: [150, 116, 66],
    time: [178, 132, 62],
    fog: [96, 110, 120],
    break: [170, 82, 70],
};
const FACE = {
    slow: [230, 245, 250],
    pause: [248, 241, 222],
    time: [253, 240, 210],
    fog: [234, 238, 240],
    break: [250, 234, 228],
};
/** 负面道具：徽章外圈多一道锯齿，远处也能一眼看出「别钩这个」 */
const BAD = {
    slow: false, pause: false, time: false, fog: true, break: true,
};
/** 一枚漂在水里的道具：增益是圆徽章，负面是会游的生物 */
export class PropItem {
    /**
     * 被钩住后的收线速度 px/s。
     * 徽章轻（PROP.reelBadge），负面生物更沉（BEAST.reel）——
     * 钩到坏东西本来就该多花点时间拖上来，剑鱼还会挣，是最难拉的一只。
     */
    get reelSpeed() {
        if (!this.beast) {
            return PROP.reelBadge;
        }
        const cfg = BEAST[this.kind];
        return cfg && cfg.reel ? cfg.reel : PROP.reelBadge;
    }
    constructor(parent, kind, x, y, sf, dir = 1) {
        /** 外圈柔光，只有徽章有 */
        this.halo = null;
        this.life = PROP.life;
        this.phase = Math.random() * Math.PI * 2;
        /** 被钩住之后由 Hook 接管位置，Props 不再推进它 */
        this.caught = false;
        /**
         * 漂移振幅 px。生成时按可钩扇形剩下的宽度再收一次，别让它摇到够不着的地方。
         * 40~72 是拿徽章自身直径（62）量的：不到一个身位看不出在动，超过一个半身位就像在横冲。
         */
        this.driftAmp = 40 + Math.random() * 32;
        /** 漂移角速度 rad/s。周期 9~12 秒：9 秒寿命里能看出一个来回，又不至于像鱼那样窜 */
        this.driftSpeed = 0.5 + Math.random() * 0.22;
        /** 从中心起步。相位随机的话，刷出来的那一瞬间 x 会从中心跳到振幅边缘 */
        this.driftPhase = 0;
        /** 生物渲染尺寸（翻转前）。离场判定和挂到钩爪上的偏移都按它算 */
        this.bw = 0;
        this.bh = 0;
        this.dir = 1;
        this.speed = 0;
        /** 头顶警示标，钩中之后要收起来 */
        this.warn = null;
        /** 交给 Props 收尸 */
        this.gone = false;
        this.kind = kind;
        this.x = x;
        this.y = y;
        this.baseY = y;
        this.baseX = x;
        // 有贴图且是负面道具才走生物形态：贴图没加载出来就退回徽章，别让道具直接消失
        this.beast = !!sf && (kind === 'fog' || kind === 'break');
        this.node = new Node('prop_' + kind);
        this.node.layer = parent.layer;
        this.node.addComponent(UITransform).setContentSize(PROP.size, PROP.size);
        this.node.setParent(parent);
        this.node.setPosition(px(x), py(y), 0);
        this.body = this.beast ? this.buildBeast(sf, dir) : this.buildBadge();
    }
    /** 徽章形态：柔光 → 米底圆徽章，返回正文节点 */
    buildBadge() {
        const r = PROP.size / 2;
        // 柔光：两层半透明圆，外圈更大更淡。必须先加，否则会盖在徽章上面
        const halo = new Node('Halo');
        halo.layer = this.node.layer;
        halo.addComponent(UITransform);
        halo.setParent(this.node);
        const hg = halo.addComponent(Graphics);
        hg.fillColor = col(RIM[this.kind], 26);
        hg.circle(0, 0, r * 1.5);
        hg.fill();
        hg.fillColor = col(RIM[this.kind], 34);
        hg.circle(0, 0, r * 1.18);
        hg.fill();
        this.halo = halo;
        // 徽章 + 图标
        const body = new Node('Body');
        body.layer = this.node.layer;
        body.addComponent(UITransform).setContentSize(PROP.size, PROP.size);
        body.setParent(this.node);
        const g = body.addComponent(Graphics);
        this.drawBadge(g, r);
        this.drawIcon(g, this.kind);
        // 不带名字标签：水里的道具只靠图标说话。
        // 名字一挂上去，水里就多了一排小牌匾，跟鱼群抢注意力，反而看不出是个道具。
        return body;
    }
    /** 生物形态：影子 → 贴图 → 头顶警示标，返回贴图节点 */
    buildBeast(sf, dir) {
        const cfg = BEAST[this.kind];
        this.bw = cfg.size;
        // 按贴图本身的比例算高，512 方图里上下有留白，不能当成正方形摆
        this.bh = cfg.size * (sf.rect.height / sf.rect.width);
        this.dir = dir;
        this.speed = cfg.speed;
        // 生物正常是「游出屏幕」离场，life 只是兜底，别让它卡在边上不消失
        this.life = BEAST_LIFE;
        this.node.getComponent(UITransform).setContentSize(this.bw, this.bh);
        // 影子：和鱼群一样画在身下，贴图浮起来才不像剪贴画
        const sh = new Node('Shadow');
        sh.layer = this.node.layer;
        sh.addComponent(UITransform);
        sh.setParent(this.node);
        const sg = sh.addComponent(Graphics);
        sg.fillColor = new Color(0, 0, 0, 30);
        sg.ellipse(0, -this.bh * 0.34, this.bw * 0.32, this.bh * 0.09);
        sg.fill();
        // 贴图本体
        const body = new Node('Body');
        body.layer = this.node.layer;
        body.addComponent(UITransform).setContentSize(this.bw, this.bh);
        body.setParent(this.node);
        const sp = body.addComponent(Sprite);
        // 先定 CUSTOM 再给贴图：顺序反了会被按贴图原始尺寸（512）自动撑大
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.trim = false;
        sp.spriteFrame = sf;
        body.setScale(dir, 1, 1);
        // 头顶警示标：挂在 node 下而不是 body 下，否则向左游时感叹号会镜像成反的。
        // y 按 BEAST.warnY 走，不能取 bh/2 —— 512 方图上下有留白（章鱼 11%、剑鱼 18%），
        // 贴到画布顶边会悬出一截空隙，看着像牌子飘在半空。
        const warn = new Node('Warn');
        warn.layer = this.node.layer;
        warn.addComponent(UITransform).setContentSize(40, 36);
        warn.setParent(this.node);
        warn.setPosition(0, this.bh * cfg.warnY, 0);
        this.drawWarn(warn.addComponent(Graphics));
        this.warn = warn;
        return body;
    }
    /** 头顶的三角警示牌：黄底深棕边 + 一个感叹号，小到不抢戏、大到扫一眼能看见 */
    drawWarn(g) {
        const W = 13;
        const H = 12;
        const B = -9;
        const ink = new Color(58, 40, 24, 245);
        g.lineJoin = Graphics.LineJoin.ROUND;
        g.lineCap = Graphics.LineCap.ROUND;
        // 铺底和描边必须各建一次路径：fill() / stroke() 都会把当前路径清空，
        // 描完边再 fill 等于对着空路径涂色，黄底会整块丢掉（只剩一个空心深棕框）。
        const tri = () => {
            g.moveTo(0, H);
            g.lineTo(W, B);
            g.lineTo(-W, B);
            g.close();
        };
        // 三角配深底黄：水是青绿的，纯黄会糊；压一点橙才跳得出来
        g.fillColor = new Color(242, 180, 58, 255);
        tri();
        g.fill();
        g.strokeColor = ink;
        g.lineWidth = 3.6;
        tri();
        g.stroke();
        // 感叹号
        g.fillColor = ink;
        g.roundRect(-1.1, -2.4, 2.2, 7.6, 1.1);
        g.fill();
        g.circle(0, -5.6, 1.3);
        g.fill();
    }
    /** 圆形米底徽章：投影 → 底色 → 木框 → 内金线 */
    drawBadge(g, r) {
        const bad = BAD[this.kind];
        g.fillColor = new Color(18, 34, 38, 52);
        g.circle(1, -2, r);
        g.fill();
        g.fillColor = col(FACE[this.kind]);
        g.circle(0, 0, r);
        g.fill();
        g.strokeColor = col(RIM[this.kind]);
        g.lineWidth = 3;
        g.circle(0, 0, r);
        g.stroke();
        g.strokeColor = new Color(255, 255, 255, 170);
        g.lineWidth = 1.2;
        g.circle(0, 0, r - 4.5);
        g.stroke();
        // 负面道具：外圈一圈短齿，和「好东西」拉开距离
        if (bad) {
            g.strokeColor = col(RIM[this.kind], 210);
            g.lineWidth = 2;
            g.lineCap = Graphics.LineCap.ROUND;
            for (let i = 0; i < 12; i++) {
                const a = (Math.PI / 6) * i + Math.PI / 12;
                const c = Math.cos(a);
                const s = Math.sin(a);
                g.moveTo(c * (r - 1.5), s * (r - 1.5));
                g.lineTo(c * (r + 4), s * (r + 4));
            }
            g.stroke();
        }
    }
    /** 图标：雪花 / 双竖条 / 时钟 / 云 / 断线。全部在局部坐标原点画，不经过 D 系列工具 */
    drawIcon(g, kind) {
        const c = col(RIM[kind]);
        g.lineCap = Graphics.LineCap.ROUND;
        g.lineJoin = Graphics.LineJoin.ROUND;
        if (kind === 'fog') {
            // 云：三个圆 + 一条底边，一次 fill 融成一团
            g.fillColor = c;
            g.circle(-6.5, 1.5, 5.6);
            g.circle(0.5, 3.6, 7.2);
            g.circle(7.2, 1.2, 5);
            g.roundRect(-12.2, -6.5, 24.4, 7.4, 3.7);
            g.fill();
            // 云下面两道飘带，强调「雾」而不是「云」
            g.strokeColor = c;
            g.lineWidth = 2.2;
            g.moveTo(-9, -10.5);
            g.lineTo(-2, -10.5);
            g.moveTo(2, -10.5);
            g.lineTo(9, -10.5);
            g.stroke();
        }
        else if (kind === 'break') {
            // 断开的鱼线：斜向两段 + 断口两侧的毛刺
            g.strokeColor = c;
            g.lineWidth = 2.4;
            g.moveTo(-11.5, -8.5);
            g.quadraticCurveTo(-7, -4, -3.2, -1.6);
            g.moveTo(3.2, 1.6);
            g.quadraticCurveTo(7, 4, 11.5, 8.5);
            g.stroke();
            g.lineWidth = 1.8;
            g.moveTo(-3.2, -1.6);
            g.lineTo(-6.2, -2.6);
            g.moveTo(-3.2, -1.6);
            g.lineTo(-3.8, 1.4);
            g.moveTo(3.2, 1.6);
            g.lineTo(6.2, 2.6);
            g.moveTo(3.2, 1.6);
            g.lineTo(3.8, -1.4);
            g.stroke();
        }
        else if (kind === 'slow') {
            g.strokeColor = c;
            g.lineWidth = 2.4;
            // 6 条主臂，每条中段再长两根小分叉
            for (let i = 0; i < 6; i++) {
                const a = (Math.PI / 3) * i + Math.PI / 6;
                const dx = Math.cos(a);
                const dy = Math.sin(a);
                g.moveTo(dx * 2.5, dy * 2.5);
                g.lineTo(dx * 13, dy * 13);
                for (const t of [0.5, 0.76]) {
                    const bx = dx * 13 * t;
                    const by = dy * 13 * t;
                    const len = 5.4 * (1.1 - t);
                    for (const s of [0.8, -0.8]) {
                        g.moveTo(bx, by);
                        g.lineTo(bx + Math.cos(a + s) * len, by + Math.sin(a + s) * len);
                    }
                }
            }
            g.stroke();
            g.fillColor = c;
            g.circle(0, 0, 2.3);
            g.fill();
        }
        else if (kind === 'pause') {
            g.fillColor = c;
            g.roundRect(-7.6, -9, 5.6, 18, 2.6);
            g.fill();
            g.roundRect(2.0, -9, 5.6, 18, 2.6);
            g.fill();
        }
        else {
            // 时钟：外圈 + 分针时针 + 顶上小提手
            g.strokeColor = c;
            g.lineWidth = 2.4;
            g.circle(0, -1, 9.4);
            g.stroke();
            g.moveTo(0, -1);
            g.lineTo(0, 5.4);
            g.moveTo(0, -1);
            g.lineTo(5, -1);
            g.stroke();
            g.lineWidth = 2.2;
            g.moveTo(-3.2, 10.4);
            g.lineTo(3.2, 10.4);
            g.stroke();
        }
    }
    /** 每帧：徽章浮动呼吸 + 消失前打闪；生物横向游动 + 身体摆动 */
    tick(dt) {
        this.life -= dt;
        if (this.beast) {
            this.phase += dt * 1.5;
            this.x += this.speed * this.dir * dt;
            this.y = this.baseY + Math.sin(this.phase) * 5;
            this.node.setPosition(px(this.x), py(this.y), 0);
            // 只转身体，警示标要立着 —— node 一起转的话牌子会跟着歪
            this.body.angle = Math.sin(this.phase * 1.4) * 2.6;
            // 整个身子游出可见区域就离场。按 VIEW 算而不是 1280：
            // 宽屏上可见范围更大，按 1280 收尸会看见它在屏幕里凭空消失
            const half = this.bw * 0.5;
            if ((this.dir > 0 && this.x - half > VIEW.right)
                || (this.dir < 0 && this.x + half < VIEW.left)
                || this.life <= 0) {
                this.gone = true;
            }
            return;
        }
        // 徽章：横向正弦漂移 + 上下小浮动 + 柔光呼吸。
        // 漂移用正弦而不是匀速：匀速撞到端点会「啪」地掉头，像弹球；
        // 正弦两端速度归零，看着才像水里飘着的东西。
        this.phase += dt * 1.9;
        this.driftPhase += dt * this.driftSpeed;
        this.x = this.baseX + Math.sin(this.driftPhase) * this.driftAmp;
        this.y = this.baseY + Math.sin(this.phase) * 7;
        this.node.setPosition(px(this.x), py(this.y), 0);
        const s = 1 + Math.sin(this.phase * 1.4) * 0.05;
        if (this.halo) {
            this.halo.setScale(s, s, 1);
        }
        // 最后 1.6 秒 8Hz 打闪，提示「快没了」
        this.body.active = this.life > PROP.blink || Math.floor(this.life * 8) % 2 === 0;
    }
    /**
     * 被钩住后跟着钩尖走。
     *
     * 徽章：中心压在钩尖下方 0.55 个直径处。钩爪本身是从钩尖往下画的，
     * 中心对齐钩尖的话爪子和徽章会叠在一起，往下挪半个身位才像「叼着」。
     * 生物：和鱼用同一套 `fishHang` 比例，钩爪正好咬进背鳍。
     */
    followTo(x, y) {
        this.caught = true;
        this.x = x;
        this.y = y + (this.beast ? this.bh * TUNE.fishHang : PROP.size * 0.55);
        this.node.setPosition(px(this.x), py(this.y), 0);
        // 收线时轻微摇晃，和钩住鱼的手感一致
        this.node.angle = Math.sin(Date.now() * 0.006) * 7;
        this.body.active = true;
        if (this.halo) {
            this.halo.setScale(1, 1, 1);
        }
        // 生物的警示标只在「还在水里游」的时候有用。钩中了还挂着，
        // 正好卡在钩爪和鱼背之间，把咬合挡住 —— 该收起来了
        if (this.warn) {
            this.warn.active = false;
        }
    }
}
/** 顶部状态条：一条小米色牌匾，左边一个小图标，右边一行字 */
class StatusPill {
    constructor(parent, layer) {
        this.row = -1;
        this.lastText = '';
        this.lastTint = '';
        this.tint = RIM.slow;
        this.iconKind = 'snow';
        this.w = 172;
        this.h = 38;
        this.node = new Node('Pill');
        this.node.layer = layer;
        this.node.addComponent(UITransform).setContentSize(DESIGN.w, DESIGN.h);
        this.node.setParent(parent);
        this.g = this.node.addComponent(Graphics);
        const n = new Node('Txt');
        n.layer = layer;
        n.addComponent(UITransform).setAnchorPoint(0.5, 0.5);
        n.setParent(this.node);
        this.label = n.addComponent(Label);
        this.label.string = '';
        this.label.fontSize = 17;
        this.label.lineHeight = 21;
        this.label.color = new Color(47, 59, 58, 255);
        this.label.horizontalAlign = HorizontalTextAlignment.CENTER;
        this.label.verticalAlign = VerticalTextAlignment.CENTER;
        this.node.active = false;
    }
    /** 摆到第 row 行并写文字；内容没变就不重画（每帧都在推倒计时） */
    show(row, text, tint, icon) {
        this.node.active = true;
        const key = tint.join(',');
        if (row === this.row && text === this.lastText && key === this.lastTint) {
            return;
        }
        this.row = row;
        this.lastText = text;
        this.lastTint = key;
        this.tint = tint;
        this.iconKind = icon;
        this.label.string = text;
        this.draw(row, tint, icon);
    }
    /** 可见宽度变了：按当前内容重画一遍（行号不变） */
    relayout() {
        if (!this.node.active) {
            return;
        }
        this.draw(this.row, this.tint, this.iconKind);
    }
    hide() {
        this.node.active = false;
        this.row = -1;
        this.lastText = '';
    }
    draw(row, tint, icon) {
        const w = this.w;
        const h = this.h;
        // 牌匾贴在公主右侧：她放大之后头顶就在画面正中，原来居中摆，
        // 一挂状态条就盖住她的帽子和脸。右边界留 210 给倒计时牌匾，
        // 窄屏（4:3 平板，可见宽度只有 960）上也不会撞上去。
        const x = Math.min(TUNE.princessCx + 124, VIEW.right - 210 - w);
        const y = 22 + row * (h + 6);
        const g = this.g;
        g.clear();
        g.fillColor = new Color(70, 52, 32, 46);
        roundRectD(g, x + 2, y + 3, w, h, 10);
        g.fill();
        g.fillColor = col(PAL.plaque);
        roundRectD(g, x, y, w, h, 10);
        g.fill();
        g.strokeColor = col(tint);
        g.lineWidth = 2.4;
        roundRectD(g, x, y, w, h, 10);
        g.stroke();
        const cx = x + 22;
        const cy = y + h / 2;
        g.strokeColor = col(tint);
        g.lineWidth = 1.8;
        g.lineCap = Graphics.LineCap.ROUND;
        if (icon === 'snow') {
            for (let i = 0; i < 3; i++) {
                const a = (Math.PI / 3) * i;
                const dx = Math.cos(a) * 7;
                const dy = Math.sin(a) * 7;
                moveToD(g, cx - dx, cy - dy);
                lineToD(g, cx + dx, cy + dy);
            }
            g.stroke();
        }
        else if (icon === 'fog') {
            g.lineWidth = 2;
            for (let i = 0; i < 3; i++) {
                const yy = cy - 5 + i * 5;
                const half = 6 - Math.abs(i - 1) * 1.6;
                moveToD(g, cx - half, yy);
                lineToD(g, cx + half, yy);
            }
            g.stroke();
        }
        else {
            // 断线：一截线中间断开
            g.lineWidth = 2;
            moveToD(g, cx - 7, cy + 5);
            lineToD(g, cx - 2.5, cy + 1.5);
            moveToD(g, cx + 2.5, cy - 1.5);
            lineToD(g, cx + 7, cy - 5);
            g.stroke();
        }
        // 文字在图标右侧剩余空间里居中
        this.label.node.setPosition(x + w / 2 + 13 - DESIGN.w / 2, DESIGN.h / 2 - cy, 0);
    }
}
/** 道具总控：刷新、拾取、暂停遮罩、状态条、大雾 */
export class Props {
    constructor(parent) {
        this.list = [];
        this.gap = PROP.gapFirst;
        /** 连着刷出几个增益了。到 2 就强制下一只是负面（见 rollKind） */
        this.dryBeasts = 0;
        /** 负面生物的贴图，由 GameRoot 在资源加载完后塞进来 */
        this.beastFrames = {};
        /** 鱼线支点（竿尖），由 GameRoot 换装后写入，道具按它算出钩扇形 */
        this.ox = TUNE.princessCx;
        this.oy = TUNE.waterTop;
        /** 三种「正在生效」的倒计时，一起驱动顶部状态条 */
        this.slowLeft = 0;
        this.fogLeft = 0;
        this.brokenLeft = 0;
        this.pills = [];
        /** 雾团分层，每层 Graphics 只画一次，之后每帧只挪 x */
        this.fogBands = [];
        /** 雾层是否已经按当前可见宽度画好 */
        this.fogDrawn = false;
        this.items = new Node('Props');
        this.items.layer = parent.layer;
        this.items.addComponent(UITransform).setContentSize(DESIGN.w, DESIGN.h);
        this.items.setParent(parent);
        this.fog = new Node('Fog');
        this.fog.layer = parent.layer;
        this.fog.addComponent(UITransform).setContentSize(DESIGN.w, DESIGN.h);
        this.fog.setParent(parent);
        // 淡入淡出交给 UIOpacity 整体压透明（见 layoutFog 里为什么不再逐帧重画）
        this.fogOpacity = this.fog.addComponent(UIOpacity);
        this.fogOpacity.opacity = 0;
        this.fog.active = false;
        this.ui = new Node('PropUi');
        this.ui.layer = parent.layer;
        this.ui.addComponent(UITransform).setContentSize(DESIGN.w, DESIGN.h);
        this.ui.setParent(parent);
        // ---- 暂停遮罩 ----
        this.pauseNode = new Node('Pause');
        this.pauseNode.layer = this.ui.layer;
        this.pauseNode.addComponent(UITransform).setContentSize(DESIGN.w, DESIGN.h);
        this.pauseNode.setParent(this.ui);
        this.pauseG = this.pauseNode.addComponent(Graphics);
        this.pauseNum = this.makeLabel(this.pauseNode, 46, new Color(138, 90, 44, 255), true);
        this.pauseHint = this.makeLabel(this.pauseNode, 15, new Color(47, 59, 58, 150), false);
        this.pauseNode.active = false;
        // ---- 状态条：最多三条同时挂着（减速 / 大雾 / 断线） ----
        for (let i = 0; i < 3; i++) {
            this.pills.push(new StatusPill(this.ui, this.ui.layer));
        }
    }
    makeLabel(parent, size, color, bold) {
        const n = new Node('L');
        n.layer = parent.layer;
        n.addComponent(UITransform).setAnchorPoint(0.5, 0.5);
        n.setParent(parent);
        const l = n.addComponent(Label);
        l.string = '';
        l.fontSize = size;
        l.lineHeight = size + 8;
        l.isBold = bold;
        l.color = color;
        l.horizontalAlign = HorizontalTextAlignment.CENTER;
        l.verticalAlign = VerticalTextAlignment.CENTER;
        return l;
    }
    // ================= 刷新与拾取 =================
    /** 换装后竿尖位置会变，道具的生成扇形要跟着挪 */
    setOrigin(x, y) {
        this.ox = x;
        this.oy = y;
    }
    /** 负面生物的贴图（octopus / swordfish），加载完再调用 */
    setBeastFrames(frames) {
        this.beastFrames = frames;
    }
    /** 换关 / 重开时清场 */
    reset() {
        this.clear();
        this.gap = PROP.gapFirst;
        this.dryBeasts = 0;
        this.hidePause();
        this.setSlow(0);
        this.setFog(0);
        this.setBroken(0);
    }
    clear() {
        for (const p of this.list) {
            p.node.destroy();
        }
        this.list = [];
    }
    scheduleNext() {
        this.gap = PROP.gapMin + Math.random() * (PROP.gapMax - PROP.gapMin);
    }
    pickKind() {
        const keys = Object.keys(PROP_WEIGHT);
        let total = 0;
        for (const k of keys) {
            total += PROP_WEIGHT[k];
        }
        let r = Math.random() * total;
        for (const k of keys) {
            r -= PROP_WEIGHT[k];
            if (r <= 0) {
                return k;
            }
        }
        return 'time';
    }
    /**
     * 在「竿尖往下的出钩扇形」里随机落一枚**徽章**道具。
     *
     * 不能按可见宽度均匀撒：钩子只能沿当前摆角出钩，摆幅是 ±40°，
     * 撒到两侧的道具玩家等一整天也够不着。这里先定深度、再定角度，
     * 反推 x，保证每一个刷出来的徽章都在能打到的范围里。
     */
    spawnBadge(k) {
        const y = PROP.yMin + Math.random() * (PROP.yMax - PROP.yMin);
        const th = (Math.random() * 2 - 1) * TUNE.swingMax * PROP.spread;
        const drop = Math.max(80, y - this.oy);
        const x = this.ox + Math.tan(th) * drop;
        const item = new PropItem(this.items, k, x, y);
        // 徽章会左右漂，但只能漂在「出钩扇形」里。
        // 该深度下扇形的半宽减去它偏离中线的距离，就是它还能晃的余量：
        // 贴着边缘刷出来的晃得少，居中的晃得开。再留 10% 别顶着极限。
        const halfW = Math.tan(TUNE.swingMax * PROP.spread) * drop;
        const room = Math.max(18, halfW - Math.abs(x - this.ox));
        item.driftAmp = Math.min(item.driftAmp, room * 0.9);
        this.list.push(item);
        return item;
    }
    /**
     * 负面**生物**：从屏幕外游进来，方向和深度都随机。
     *
     * 故意不套上面那个扇形约束 —— 它是活物，游到哪儿算哪儿。
     * 玩家要自己判断「这一钩会不会正好撞上它」，而不是靠「道具只会出现在能打到的地方」
     * 这条规律无脑点。代价是有些个体可能整段都游在摆幅够不着的地方，
     * 那也没关系：它本来就不是给你钩的。
     */
    spawnBeast(k) {
        const cfg = BEAST[k];
        const sf = this.beastFrames[cfg.image];
        // 贴图没加载出来 → 退回徽章形态，别让这一轮道具直接人间蒸发
        if (!sf) {
            return this.spawnBadge(k);
        }
        const dir = Math.random() < 0.5 ? 1 : -1;
        const y = BEAST_Y[0] + Math.random() * (BEAST_Y[1] - BEAST_Y[0]);
        // 起点在屏幕外一个整身位：它得「游进来」，不能在画面边上凭空冒出来
        const x = dir > 0 ? VIEW.left - cfg.size : VIEW.right + cfg.size;
        const item = new PropItem(this.items, k, x, y, sf, dir);
        this.list.push(item);
        return item;
    }
    spawn(kind) {
        const k = kind ?? this.rollKind();
        return k === 'fog' || k === 'break' ? this.spawnBeast(k) : this.spawnBadge(k);
    }
    /**
     * 抽一个道具种类，带一道「防连空」保险。
     *
     * 纯按权重抽的话，一关 7 个道具里一只负面都不出的概率是 0.62^7 ≈ 3.5%，
     * 看着不高，但玩家只会记住「这局一条怪鱼都没有」，而不会去算概率。
     * 连着三个增益之后强制来一只，成本是几行代码，换的是「负面一直都在」的印象。
     *
     * 阈值为什么是 3 而不是 2：设成 2 时实测负面占到 51%（强制插入把权重稀释了），
     * 一半道具都是坏东西，捞道具这件事就不值了。3 大概落在 44%。
     */
    rollKind() {
        if (this.dryBeasts >= 3) {
            this.dryBeasts = 0;
            return Math.random() < 0.55 ? 'fog' : 'break';
        }
        const k = this.pickKind();
        this.dryBeasts = k === 'fog' || k === 'break' ? 0 : this.dryBeasts + 1;
        return k;
    }
    /**
     * 钩尖碰撞检测：只找，不摘。
     * 摘不摘由 GameRoot 决定 —— 钩住道具之后要把它交给 Hook 拖着走，
     * 这里直接从列表里删掉会让 Props.update 再也管不到它。
     */
    find(x, y, r) {
        const rr = PROP.pickR + r;
        for (const p of this.list) {
            if (p.caught) {
                continue;
            }
            const dx = p.x - x;
            const dy = p.y - y;
            if (dx * dx + dy * dy <= rr * rr) {
                return p;
            }
        }
        return null;
    }
    /**
     * 从刷新列表里摘掉（节点还活着，交给 Hook 带着走）。
     *
     * 这里**不**重置刷新间隔：摘掉就是腾出一个名额，下一个该来的时候自然会来。
     * 重置的话，玩家每钩一次道具都要再等一整个 gap，节奏被拖成「寿命 + 间隔」。
     */
    detach(item) {
        const i = this.list.indexOf(item);
        if (i >= 0) {
            this.list.splice(i, 1);
        }
    }
    /** 每帧推进（暂停时不要调用） */
    update(dt) {
        for (let i = this.list.length - 1; i >= 0; i--) {
            const p = this.list[i];
            p.tick(dt);
            // gone：生物游出屏幕；life <= 0：徽章到期 / 生物兜底超时。
            // 消失不重置 gap —— 到期是自然流转，不该把下一次刷新也往后推一遍，
            // 否则实际周期会变成「寿命 9 秒 + 间隔 8 秒」= 17 秒一个，水上一整关才几个。
            if (p.life <= 0 || p.gone) {
                this.list.splice(i, 1);
                p.node.destroy();
            }
        }
        // 满员时先不递减 gap：否则它会一路减成负数，等名额一空就立刻弹出一个，
        // 变成「刚钩走一个马上又来一个」的连发节奏
        if (this.list.length < PROP.maxAlive) {
            this.gap -= dt;
            if (this.gap <= 0) {
                this.spawn();
                this.scheduleNext();
            }
        }
    }
    // ================= 状态条（减速 / 大雾 / 断线） =================
    /** left <= 0 时收起这一条 */
    setSlow(left) {
        this.slowLeft = Math.max(0, left);
        this.refreshPills();
    }
    /** 大雾：既改状态条，也驱动雾层（第一次起雾时才真正画图） */
    setFog(left) {
        this.fogLeft = Math.max(0, left);
        if (this.fogLeft > 0) {
            this.fog.active = true;
            if (!this.fogDrawn) {
                this.layoutFog();
            }
            this.updateFog(this.fogLeft);
        }
        else if (this.fog.active) {
            // 隐藏但不清空：下一条章鱼来的时候直接复用，不用重画
            this.fog.active = false;
        }
        this.refreshPills();
    }
    setBroken(left) {
        this.brokenLeft = Math.max(0, left);
        this.refreshPills();
    }
    /** 按固定顺序把还在生效的倒计时排成若干行，行号连续、不留空档 */
    refreshPills() {
        const rows = [];
        if (this.slowLeft > 0) {
            rows.push({ text: '减速 ' + this.slowLeft.toFixed(1) + 's', tint: RIM.slow, icon: 'snow' });
        }
        if (this.fogLeft > 0) {
            rows.push({ text: '大雾 ' + this.fogLeft.toFixed(1) + 's', tint: RIM.fog, icon: 'fog' });
        }
        if (this.brokenLeft > 0) {
            rows.push({ text: '鱼线修复 ' + this.brokenLeft.toFixed(1) + 's', tint: RIM.break, icon: 'break' });
        }
        for (let i = 0; i < this.pills.length; i++) {
            if (i < rows.length) {
                this.pills[i].show(i, rows[i].text, rows[i].tint, rows[i].icon);
            }
            else {
                this.pills[i].hide();
            }
        }
    }
    // ================= 大雾 =================
    /**
     * 大雾：把水面糊死，让玩家认不出鱼。
     *
     * 之前是「每帧 clear + 重画 48 个椭圆」，两个毛病叠在一起：
     *  1. 太贵 —— 60fps 下每帧上百次 fill，手机上肉眼可见地掉帧；
     *  2. 浓度上不去 —— 为了控成本只能把单块透明度压到 0.1 左右，
     *     整屏薄纱也只有 0.76，鱼的花纹还看得一清二楚，等于「加了层滤镜」，挡不住任何东西。
     *
     * 现在改成一次画死：
     *  - 底板（薄纱）和三层雾团各建一个 Graphics，只在首次起雾 / 换分辨率时画；
     *  - 淡入淡出拨 `UIOpacity`，漂移靠 setPosition 挪三个雾团节点。
     * 每帧成本从「上百次填充」降到「一次赋透明度 + 三次挪位置」，
     * 省下来的预算全部换成浓度 —— 这样才能真的挡住鱼。
     *
     * 浓度配比（k=1 时）：整屏薄纱 0.82 → 鱼只剩一团模糊的暗色；
     * 雾团中心再叠 0.5 上下 → 合成 0.95+，那片水域里什么也看不见。
     * 雾团还在慢慢滚，所以「等这团雾飘过去再出钩」是有意义的，而不是干等三秒。
     */
    updateFog(left) {
        const total = PROP.fogDur;
        // 已经下了多久。相位直接从倒计时反推，不另开累加器：
        // 起雾那一刻 elapsed=0，雾团从原始位置开始滚，暂停 / 断线都不会让它跳一下
        const elapsed = Math.max(0, total - left);
        const fadeIn = Math.min(1, elapsed / PROP.fogFadeIn);
        const fadeOut = Math.min(1, left / PROP.fogFadeOut);
        const k = Math.max(0, Math.min(fadeIn, fadeOut));
        this.fogOpacity.opacity = Math.round(255 * k);
        for (const b of this.fogBands) {
            b.node.setPosition(b.dir * b.speed * elapsed, 0, 0);
        }
    }
    /** 把雾层画出来。只在首次起雾和换分辨率时调用 */
    layoutFog() {
        this.fogDrawn = true;
        for (const ch of this.fog.children.slice()) {
            ch.destroy();
        }
        this.fogBands = [];
        // 雾是水里的东西：从码头立面下沿开始糊，甲板、栏杆、公主都不动。
        // 起点取 waterTop + 22 而不是水线本身 —— 码头立面压到 waterTop + 16，
        // 从水线起画的话，雾会先盖住码头前沿那一条木板
        const top = TUNE.waterTop + 22;
        const bottom = DESIGN.h + 60;
        const cx = (VIEW.left + VIEW.right) / 2;
        const half = VIEW.w / 2 + 300;
        // ---- 1. 底板薄纱 ----
        // 0.78：只靠这一层，鱼的颜色和花纹就基本被吃干净了，
        // 剩下的只有一团模糊的暗影 —— 认不出是哪条鱼，但知道那儿有东西。
        // 再往上叠雾团是为了「有的地方连影子都没有」，而不是继续加深整屏。
        const veil = this.fogLayer('Veil');
        const vg = veil.addComponent(Graphics);
        // 上沿 70px 渐变：直接一条硬边会像在水面上拉了一块白板
        const steps = 10;
        const rise = 70;
        for (let i = 0; i < steps; i++) {
            const t = i / (steps - 1);
            vg.fillColor = new Color(226, 234, 236, Math.round(30 + 169 * t));
            rectD(vg, cx - half, top + i * (rise / steps), half * 2, rise / steps + 0.6);
            vg.fill();
        }
        vg.fillColor = new Color(226, 234, 236, 199);
        rectD(vg, cx - half, top + rise, half * 2, bottom - top - rise);
        vg.fill();
        // ---- 2. 三层雾团 ----
        // 层与层之间方向、速度都不同：同向同速的话三层会像一块整板在平移。
        // 单团也做浓（a 40~70），因为三团叠在一起才是「白茫茫」，
        // 只叠一两团的地方要留出「隐约看得见鱼影」的余地 —— 否则整屏一个色，没有雾的层次。
        const specs = [
            { n: 5, rx: 380, ry: 140, a: 52, speed: 7, dir: 1 },
            { n: 7, rx: 290, ry: 110, a: 60, speed: 15, dir: -1 },
            { n: 9, rx: 210, ry: 80, a: 38, speed: 27, dir: 1 },
        ];
        // 固定种子的伪随机：每次运行、每次重画都长一样，方便截图对比
        let seed = 7;
        const rnd = () => {
            seed = (seed * 16807) % 2147483647;
            return seed / 2147483647;
        };
        for (let s = 0; s < specs.length; s++) {
            const spec = specs[s];
            const node = this.fogLayer('Band' + s);
            const g = node.addComponent(Graphics);
            for (let i = 0; i < spec.n; i++) {
                const x = cx - half + 140 + rnd() * (half * 2 - 280);
                const y = top + 70 + rnd() * (bottom - top - 60);
                const rx = spec.rx * (0.72 + rnd() * 0.5);
                // 上沿不许糊到甲板：椭圆顶边最多贴到水面
                const ry = Math.min(spec.ry * (0.72 + rnd() * 0.5), y - top + 8);
                // 一团雾 = 三层偏心椭圆。同心的话哪怕透明度很低也会看出年轮
                for (let j = 0; j < 3; j++) {
                    const sc = 1 - j * 0.22;
                    g.fillColor = new Color(247, 251, 251, Math.round(spec.a * (0.55 + j * 0.28)));
                    ellipseD(g, x + (j - 1) * 26, y + (j % 2 ? 11 : -9), rx * sc, ry * sc);
                    g.fill();
                }
            }
            this.fogBands.push({ node, speed: spec.speed, dir: spec.dir });
        }
    }
    fogLayer(name) {
        const n = new Node(name);
        n.layer = this.fog.layer;
        n.addComponent(UITransform).setContentSize(DESIGN.w, DESIGN.h);
        n.setParent(this.fog);
        return n;
    }
    // ================= 暂停遮罩 =================
    showPause(left) {
        this.pauseNode.active = true;
        this.drawPause();
        this.updatePause(left);
    }
    /** 只更新数字，底板不重画 */
    updatePause(left) {
        if (!this.pauseNode.active) {
            return;
        }
        const s = Math.max(0, Math.ceil(left)).toString();
        if (this.pauseNum.string !== s) {
            this.pauseNum.string = s;
        }
    }
    hidePause() {
        this.pauseNode.active = false;
    }
    drawPause() {
        const g = this.pauseG;
        const cx = (VIEW.left + VIEW.right) / 2;
        const cy = 340;
        const r = 70;
        g.clear();
        // 淡霜色薄纱，压住但不压黑：暂停不是结算，画面还得看得见
        g.fillColor = new Color(226, 240, 242, 150);
        rectD(g, VIEW.left - 40, -40, VIEW.w + 80, DESIGN.h + 80);
        g.fill();
        // 圆牌
        g.fillColor = new Color(70, 52, 32, 46);
        circleD(g, cx + 2, cy + 4, r);
        g.fill();
        g.fillColor = col(PAL.plaque);
        circleD(g, cx, cy, r);
        g.fill();
        g.strokeColor = col(PAL.woodDark);
        g.lineWidth = 3.2;
        circleD(g, cx, cy, r);
        g.stroke();
        g.strokeColor = new Color(201, 161, 90, 220);
        g.lineWidth = 1.4;
        circleD(g, cx, cy, r - 6);
        g.stroke();
        // 小暂停图标（圆牌顶部，离金线内圈留 12px，不然贴着边框发挤）
        const iy = cy - r + 18;
        g.fillColor = col(PAL.woodDark);
        g.roundRect(cx - DESIGN.w / 2 - 6, DESIGN.h / 2 - iy - 14, 4.6, 14, 2.2);
        g.fill();
        g.roundRect(cx - DESIGN.w / 2 + 1.4, DESIGN.h / 2 - iy - 14, 4.6, 14, 2.2);
        g.fill();
        this.pauseNum.node.setPosition(cx - DESIGN.w / 2, DESIGN.h / 2 - (cy + 4), 0);
        this.pauseHint.node.setPosition(cx - DESIGN.w / 2, DESIGN.h / 2 - (cy + r + 30), 0);
        this.pauseHint.string = '时间已冻结，稍后自动继续';
    }
    /** 可见宽度变了：状态条、雾层、暂停圆牌都要按新的可见区域重画 */
    relayout() {
        for (const p of this.pills) {
            p.relayout();
        }
        if (this.fogLeft > 0) {
            this.layoutFog();
            this.updateFog(this.fogLeft);
        }
        if (this.pauseNode.active) {
            this.drawPause();
        }
    }
}
