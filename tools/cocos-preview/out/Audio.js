import { Node, Graphics, UITransform, Color, Label, AudioSource, AudioClip, resources, sys, HorizontalTextAlignment, VerticalTextAlignment, } from 'cc';
import { DESIGN, VIEW, px, py } from './GameConfig.js';
import { PAL, col, circleD, moveToD, lineToD } from './DayNight.js';
/**
 * 音频与静音按钮。
 *
 * 5 个 mp3 由 tools/20_render_audio.py 离线渲染，和网页版是同一套乐谱
 * （C 大调 8 小节、88 BPM），所以两边听起来一致。
 *
 * BGM 用 AudioSource 循环（loop = true），音效用 playOneShot 叠加，
 * 这样一次抛竿 + 一次捕获同时响也不会互相打断。
 */
/** BGM 目标音量。离线实测峰值 0.72、RMS 0.089，这个音量下不抢音效 */
const BGM_VOL = 0.45;
/** 音效相对音量 */
const SFX_VOL = 0.95;
/** 淡入参考时长（秒） */
const FADE = 1.8;
const STORE_KEY = 'yh_sound';
export class GameAudio {
    constructor(parent) {
        /** 是否开启声音，跨会话记住 */
        this.soundOn = true;
        this.clips = {};
        this.loaded = 0;
        this.total = 6;
        this.wantBgm = false;
        this.curVol = 0;
        this.targetVol = 0;
        this.node = new Node('Audio');
        this.node.layer = parent.layer;
        this.node.addComponent(UITransform);
        this.node.setParent(parent);
        this.bgm = this.node.addComponent(AudioSource);
        this.bgm.playOnAwake = false;
        this.bgm.loop = true;
        this.bgm.volume = 0;
        const sfxNode = new Node('Sfx');
        sfxNode.layer = parent.layer;
        sfxNode.addComponent(UITransform);
        sfxNode.setParent(this.node);
        this.sfx = sfxNode.addComponent(AudioSource);
        this.sfx.playOnAwake = false;
        this.sfx.volume = SFX_VOL;
        try {
            this.soundOn = sys.localStorage.getItem(STORE_KEY) !== '0';
        }
        catch (e) {
            this.soundOn = true;
        }
        this.load();
    }
    // ================= 加载 =================
    load() {
        const names = ['bgm', 'sfx_cast', 'sfx_catch', 'sfx_click', 'sfx_win', 'sfx_prop'];
        for (const n of names) {
            resources.load(`audio/${n}`, AudioClip, (err, clip) => {
                if (err || !clip) {
                    console.warn('[Audio] 音频加载失败', n, err);
                }
                else {
                    this.clips[n] = clip;
                }
                if (++this.loaded >= this.total) {
                    this.onReady();
                }
            });
        }
    }
    onReady() {
        if (this.wantBgm && this.soundOn) {
            this.beginBgm();
        }
    }
    // ================= BGM =================
    /**
     * 启动 BGM。浏览器要求音频必须在用户手势里启动，
     * 所以这个方法由第一次点击 / 按键触发，可以重复调用。
     */
    startBgm() {
        this.wantBgm = true;
        if (!this.soundOn) {
            return;
        }
        this.beginBgm();
    }
    beginBgm() {
        const clip = this.clips['bgm'];
        if (!clip) {
            return;
        }
        if (this.bgm.clip !== clip) {
            this.bgm.clip = clip;
        }
        if (!this.bgm.playing) {
            this.bgm.play();
        }
        this.targetVol = BGM_VOL;
    }
    /** 每帧调用，做淡入淡出 */
    update(dt) {
        if (this.curVol === this.targetVol) {
            return;
        }
        const k = Math.min(1, (dt / FADE) * 4);
        this.curVol += (this.targetVol - this.curVol) * k;
        if (Math.abs(this.targetVol - this.curVol) < 0.004) {
            this.curVol = this.targetVol;
        }
        this.bgm.volume = this.curVol;
    }
    /** 静音开关，返回切换后的状态 */
    toggle() {
        this.soundOn = !this.soundOn;
        try {
            sys.localStorage.setItem(STORE_KEY, this.soundOn ? '1' : '0');
        }
        catch (e) {
            // 隐私模式写不进去，忽略
        }
        if (this.soundOn) {
            this.beginBgm();
        }
        else {
            this.targetVol = 0;
            this.curVol = 0;
            this.bgm.volume = 0;
            this.bgm.stop();
        }
        return this.soundOn;
    }
    // ================= 音效 =================
    play(name, vol = 1) {
        if (!this.soundOn) {
            return;
        }
        const clip = this.clips[name];
        if (!clip) {
            return;
        }
        this.sfx.playOneShot(clip, vol);
    }
    /** 出钩 */
    cast() {
        this.play('sfx_cast');
    }
    /** 钩中鱼 */
    catchOne() {
        this.play('sfx_catch');
    }
    /** 界面点击 */
    click() {
        this.play('sfx_click');
    }
    /** 过关 / 结算 */
    win() {
        this.play('sfx_win');
    }
    /**
     * 收到道具。比「捕获」高一档的上行三连音，
     * 和抓鱼的叮咚区分开，不然玩家分不清这一钩到底捞到了什么。
     */
    prop() {
        this.play('sfx_prop');
    }
}
// ================= 静音按钮 =================
const SND = { x: DESIGN.w - 70, y: 92, size: 44 };
/** 右上角圆形静音按钮，米色牌匾样式，静音时画一道红斜线 */
export class SoundButton {
    constructor(parent, on) {
        // 贴可见区域的右边缘（FIXED_HEIGHT 下宽屏比 1280 宽）
        SND.x = VIEW.right - 70;
        this.node = new Node('Sound');
        this.node.layer = parent.layer;
        this.node.addComponent(UITransform).setContentSize(DESIGN.w, DESIGN.h);
        this.node.setParent(parent);
        this.g = this.node.addComponent(Graphics);
        const n = new Node('Icon');
        n.layer = parent.layer;
        const ut = n.addComponent(UITransform);
        ut.setAnchorPoint(0.5, 0.5);
        n.setParent(this.node);
        n.setPosition(px(SND.x + SND.size / 2), py(SND.y + SND.size / 2), 0);
        this.icon = n.addComponent(Label);
        this.icon.string = '\u266a';
        this.icon.fontSize = 24;
        this.icon.lineHeight = 28;
        this.icon.horizontalAlign = HorizontalTextAlignment.CENTER;
        this.icon.verticalAlign = VerticalTextAlignment.CENTER;
        this.on = on;
        this.redraw();
    }
    redraw() {
        const g = this.g;
        const cx = SND.x + SND.size / 2;
        const cy = SND.y + SND.size / 2;
        const r = SND.size / 2;
        g.clear();
        g.fillColor = new Color(70, 52, 32, 46);
        circleD(g, cx + 1, cy + 2, r);
        g.fill();
        g.fillColor = col(PAL.plaque);
        circleD(g, cx, cy, r);
        g.fill();
        g.strokeColor = col(PAL.woodDark);
        g.lineWidth = 3;
        circleD(g, cx, cy, r);
        g.stroke();
        g.strokeColor = new Color(201, 161, 90, 217);
        g.lineWidth = 1.2;
        circleD(g, cx, cy, r - 4);
        g.stroke();
        if (!this.on) {
            g.strokeColor = new Color(192, 69, 62, 217);
            g.lineWidth = 2.5;
            g.lineCap = Graphics.LineCap.ROUND;
            moveToD(g, cx - 11, cy + 11);
            lineToD(g, cx + 11, cy - 11);
            g.stroke();
        }
        this.icon.color = this.on ? col(PAL.ink) : new Color(47, 59, 58, 90);
    }
    setOn(on) {
        if (this.on === on) {
            return;
        }
        this.on = on;
        this.redraw();
    }
    /** 可见宽度变了：按钮重新贴右边缘 */
    relayout() {
        SND.x = VIEW.right - 70;
        this.icon.node.setPosition(px(SND.x + SND.size / 2), py(SND.y + SND.size / 2), 0);
        this.redraw();
    }
    /** 设计坐标命中测试 */
    hitTest(x, y) {
        return x >= SND.x && x <= SND.x + SND.size && y >= SND.y && y <= SND.y + SND.size;
    }
}
