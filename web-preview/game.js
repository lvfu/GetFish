(function () {
  'use strict';

  const W = 1280, H = 720;
  const cv = document.getElementById('cv');
  const ctx = cv.getContext('2d');

  const FISH = window.FISH_CONFIG;
  const NAMES = Object.keys(FISH);

  // ===== 可调玩法参数 =====
  const TUNE = {
    swingMax: 70 * Math.PI / 180,   // 摆幅（相对竖直向下）
    swingOmega: 1.5,                // 摆动角速度
    shootSpeed: 1280,               // 出钩速度 px/s
    maxRope: 960,                   // 最大绳长
    hookR: 15,                      // 钩子碰撞半径
    idleRope: 112,                   // 瞄准态钩子离竿尖的垂距
    levelTime: 60,                  // 每关时长
    targetBase: 600,                // 第 1 关目标分
    targetStep: 280,                // 每关目标分增量
    maxFish: 9,                     // 同屏鱼上限
    respawnDelay: 0.5,              // 捕获后补鱼间隔
    waterTop: 190,
    floorY: 668,
    // 顶部公主：脚踩水线的位置与角色高度（不含鱼竿）
    feetY: 196,
    princessH: 168,
    princessCx: 640,                // 角色水平中心
  };

  // 每种鱼的出生深度与刷新权重（越深越贵）
  const META = {
    clownfish:  { zone: [235, 365], weight: 20 },
    goldfish:   { zone: [240, 425], weight: 17 },
    blue_tang:  { zone: [210, 375], weight: 17 },
    pufferfish: { zone: [250, 465], weight: 13 },
    angelfish:  { zone: [270, 505], weight: 12 },
    golden_koi: { zone: [340, 590], weight: 9 },
    ray:        { zone: [465, 630], weight: 6 },
    shark:      { zone: [505, 650], weight: 5 },
  };

  // ===== 资源加载 =====
  const IMG = {};
  let loaded = 0;
  NAMES.forEach(function (n) {
    const im = new Image();
    im.onload = function () { loaded++; };
    im.onerror = function () { console.warn('load fail', n); loaded++; };
    im.src = '../assets/images/fish/' + n + '.png';
    IMG[n] = im;
  });

  // 公主角色（顶部捕鱼的人）
  const PCFG = window.PRINCESS_CONFIG || {};
  const PNAMES = Object.keys(PCFG);
  const PIMG = {};
  PNAMES.forEach(function (n) {
    const im = new Image();
    im.onerror = function () { console.warn('princess load fail', n); };
    im.src = '../assets/images/princess/' + (PCFG[n].image || n) + '.png';
    PIMG[n] = im;
  });

  // 角色在屏幕上的摆放：以「鱼竿尖」为锚点，保证鱼线正好从竿尖甩出
  const PSPRITE = 512;
  const PCONTENT_H = 470;   // 素材内角色（含鱼竿）的高度
  function princessLayout(key) {
    const c = PCFG[key];
    if (!c) return null;
    const sc = TUNE.princessH / PCONTENT_H;
    const dw = PSPRITE * sc;
    const dh = PSPRITE * sc;
    const x = TUNE.princessCx - dw / 2;
    const y = TUNE.feetY - (21 + PCONTENT_H) * sc;   // 21 = 素材内上边距
    return {
      sc: sc, x: x, y: y, w: dw, h: dh,
      tipX: x + c.rodTip[0] * dw,
      tipY: y + c.rodTip[1] * dh,
    };
  }

  // ===== 状态 =====
  const S = {
    mode: 'ready',
    angle: 0, swingT: 0, rope: 0,
    carrying: null,
    score: 0, level: 1, time: TUNE.levelTime,
    fish: [], bubbles: [], popups: [], ripples: [],
    spawnTimer: 0,
    best: 0,
    princess: PNAMES[0],
    layout: null,
    clock: 0,                                          // 昼夜循环用的总时钟（秒）
    origin: { x: TUNE.princessCx, y: TUNE.waterTop },   // 鱼线支点 = 鱼竿尖
  };

  function setPrincess(key) {
    if (!PCFG[key]) return;
    S.princess = key;
    S.layout = princessLayout(key);
    if (S.layout) {
      S.origin.x = S.layout.tipX;
      S.origin.y = S.layout.tipY;
    }
  }
  if (PNAMES.length) setPrincess(PNAMES[0]);

  function target() { return TUNE.targetBase + (S.level - 1) * TUNE.targetStep; }
  function hookTip() {
    return {
      x: S.origin.x + Math.sin(S.angle) * S.rope,
      y: S.origin.y + Math.cos(S.angle) * S.rope,
    };
  }

  // ===== 音频：音效 + 背景音乐（全部程序合成，不依赖素材）=====
  let actx = null, master = null, sfxBus = null, bgmBus = null;
  let soundOn = true;
  const BGM_LEVEL = 1.6;   // 离线渲染实测：峰值约 0.29、RMS 约 0.08，留足余量
  const SFX_LEVEL = 1.5;
  try { soundOn = localStorage.getItem('yh_sound') !== '0'; } catch (e) { /* 隐私模式 */ }

  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function ensureAudio() {
    if (actx) return actx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      actx = new AC();
      const g = makeGraph(actx);
      master = g.master;
      sfxBus = g.sfx;
      bgmBus = g.bgm;
    } catch (e) { actx = null; }
    return actx;
  }

  // 在任意 AudioContext 上搭同一套母线，离线渲染复用
  function makeGraph(c) {
    const g = {};
    g.master = c.createGain();
    g.master.gain.value = soundOn ? 0.9 : 0.0001;
    g.master.connect(c.destination);

    g.sfx = c.createGain(); g.sfx.gain.value = SFX_LEVEL; g.sfx.connect(g.master);
    g.bgm = c.createGain(); g.bgm.gain.value = 0.0001; g.bgm.connect(g.master);

    // 简易混响：延迟 + 低通 + 反馈。反馈调低、低通抬高，避免金属味和糊音
    const dly = c.createDelay(0.6);
    dly.delayTime.value = 0.34;
    const fb = c.createGain(); fb.gain.value = 0.2;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 2600;
    g.bgm.connect(dly);
    dly.connect(lp);
    lp.connect(fb);
    fb.connect(dly);
    lp.connect(g.master);
    return g;
  }

  function blip(freq, dur, type, gain) {
    try {
      if (!ensureAudio()) return;
      if (actx.state === 'suspended') actx.resume();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      g.gain.value = gain || 0.05;
      o.connect(g); g.connect(sfxBus);
      const t = actx.currentTime;
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.start(t); o.stop(t + dur);
    } catch (e) { /* 静音降级 */ }
  }

  // ---- 背景音乐：C 大调 8 小节摇篮曲，88 BPM ----
  // 之前的版本用大七和弦 + 随机碎音 + 2.01 倍失谐谐波，听感发飘、发诡异，
  // 这里改成写死的旋律 + 正三和弦铺底，去掉所有随机和失谐。
  const MUSIC = {
    bpm: 88,
    bars: 8,
    chords: [
      [48, 55, 64],   // C
      [43, 50, 59],   // G
      [45, 52, 60],   // Am
      [41, 48, 57],   // F
      [48, 55, 64],   // C
      [41, 48, 57],   // F
      [43, 50, 59],   // G
      [48, 55, 64],   // C
    ],
    // [起始八分音符步号, MIDI 音高, 持续步数]
    melody: [
      [0, 72, 2], [2, 76, 2], [4, 79, 3], [7, 76, 1],
      [8, 74, 2], [10, 71, 2], [12, 67, 4],
      [16, 69, 2], [18, 72, 2], [20, 76, 3], [23, 72, 1],
      [24, 77, 2], [26, 72, 2], [28, 69, 4],
      [32, 67, 2], [34, 72, 2], [36, 76, 3], [39, 74, 1],
      [40, 72, 2], [42, 69, 2], [44, 65, 4],
      [48, 67, 2], [50, 71, 2], [52, 74, 3], [55, 71, 1],
      [56, 72, 6], [62, 76, 2],
    ],
  };

  const MEL_AT = {};
  MUSIC.melody.forEach(function (m) { MEL_AT[m[0]] = m; });

  let bgmStarted = false, bgmStep = 0, bgmNext = 0, bgmTimer = null;

  function stepDur() { return 60 / MUSIC.bpm / 2; }

  // 八音盒音色：基频 + 干净的二次谐波（不失谐），快起慢落
  function bell(t, freq, dur, vol) {
    const o = actx.createOscillator(), o2 = actx.createOscillator();
    const g = actx.createGain(), g2 = actx.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    o2.type = 'sine'; o2.frequency.value = freq * 2;
    g2.gain.value = 0.12;
    o.connect(g); o2.connect(g2); g2.connect(g);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.014);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    g.connect(bgmBus);
    o.start(t); o2.start(t);
    o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }

  // 铺底和声：慢起慢落，压掉锯齿感
  function pad(t, freq, dur, vol) {
    const o = actx.createOscillator(), f = actx.createBiquadFilter(), g = actx.createGain();
    o.type = 'triangle';
    o.frequency.value = freq;
    f.type = 'lowpass'; f.frequency.value = 760; f.Q.value = 0.4;
    o.connect(f); f.connect(g); g.connect(bgmBus);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.7);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.1);
  }

  function bass(t, freq, dur, vol) {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    o.connect(g); g.connect(bgmBus);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function scheduleStep(step, t) {
    const s = step % 64;
    const bar = Math.floor(s / 8);
    const ch = MUSIC.chords[bar];
    const pos = s % 8;

    // 旋律
    const m = MEL_AT[s];
    if (m) bell(t, mtof(m[1]), m[2] * stepDur() * 1.2 + 0.3, 0.085);

    // 每小节：低音 + 铺底
    if (pos === 0) {
      bass(t, mtof(ch[0]), 1.5, 0.13);
      pad(t, mtof(ch[1]), 2.7, 0.026);
      pad(t, mtof(ch[2]), 2.7, 0.019);
      pad(t, mtof(ch[2] + 12), 2.7, 0.011);
    }
    if (pos === 4) bass(t, mtof(ch[0]), 1.1, 0.08);

    // 轻拨和弦音，给旋律一点呼应
    if (pos === 3 || pos === 6) bell(t, mtof(ch[pos === 3 ? 1 : 2]), 0.75, 0.032);
  }

  function bgmTick() {
    if (!actx) return;
    const d = stepDur();
    while (bgmNext < actx.currentTime + 0.35) {
      scheduleStep(bgmStep, bgmNext);
      bgmStep++;
      bgmNext += d;
    }
  }

  // 必须在用户手势里调用，否则浏览器会拦掉自动播放
  function startBGM() {
    if (bgmStarted) return;
    if (!ensureAudio()) return;
    if (actx.state === 'suspended') actx.resume();
    bgmStarted = true;
    bgmStep = 0;
    bgmNext = actx.currentTime + 0.15;
    bgmBus.gain.cancelScheduledValues(actx.currentTime);
    bgmBus.gain.setValueAtTime(0.0001, actx.currentTime);
    bgmBus.gain.linearRampToValueAtTime(BGM_LEVEL, actx.currentTime + 1.8);
    bgmTimer = setInterval(bgmTick, 90);
    bgmTick();
  }

  function toggleSound() {
    soundOn = !soundOn;
    try { localStorage.setItem('yh_sound', soundOn ? '1' : '0'); } catch (e) { /* ignore */ }
    if (!actx) {
      if (soundOn) startBGM();
      return;
    }
    const now = actx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(soundOn ? 0.9 : 0.0001, now, 0.05);
  }

  // ===== 鱼 =====
  function pickType() {
    let total = 0;
    for (const k in META) total += META[k].weight;
    let r = Math.random() * total;
    for (const k in META) { r -= META[k].weight; if (r <= 0) return k; }
    return 'clownfish';
  }

  function spawnFish(opts) {
    opts = opts || {};
    const type = opts.type || pickType();
    const cfg = FISH[type], meta = META[type];
    const im = IMG[type];
    const size = cfg.baseSize;
    const ar = im && im.naturalWidth ? im.naturalHeight / im.naturalWidth : 0.6;
    const h = size * ar;
    const dir = opts.dir || (Math.random() < 0.5 ? 1 : -1);
    const y = opts.y !== undefined ? opts.y : meta.zone[0] + Math.random() * (meta.zone[1] - meta.zone[0]);

    // 出生避让：和已有鱼保持距离，避免叠在一起看不清
    let x = opts.x !== undefined ? opts.x
      : (dir > 0 ? -size * 0.6 - Math.random() * 80 : W + size * 0.6 + Math.random() * 80);
    if (opts.x !== undefined) {
      for (let t = 0; t < 14; t++) {
        let ok = true;
        for (const o of S.fish) {
          const dx = o.x - x, dy = o.y - y;
          const minD = (o.size + size) * 0.58;
          if (dx * dx + dy * dy < minD * minD) { ok = false; break; }
        }
        if (ok) break;
        x = 100 + Math.random() * (W - 200);
      }
    }

    const f = {
      type: type, cfg: cfg, size: size, h: h,
      x: x, y: y, baseY: y, dir: dir,
      vx: cfg.baseSpeed * dir,
      phase: Math.random() * Math.PI * 2,
      caught: false,
      value: cfg.baseValue,
    };
    S.fish.push(f);
    return f;
  }

  /** 开局铺鱼：保证屏幕内已有鱼，且深海鱼必然在场，避免空场和全是小鱼 */
  function seedFish() {
    const plan = [
      ['shark', 540], ['ray', 500], ['golden_koi', 420],
      ['angelfish', 300], ['pufferfish', 330], ['goldfish', 250],
      ['blue_tang', 230], ['clownfish', 280],
    ];
    plan.forEach(function (p) {
      spawnFish({
        type: p[0],
        y: p[1],
        x: 120 + Math.random() * (W - 240),
        dir: Math.random() < 0.5 ? 1 : -1,
      });
    });
  }

  function retractSpeedFor(f) {
    // 越大的鱼收线越慢
    return Math.max(300, 880 - f.size * 3.4);
  }

  // ===== 更新 =====
  function update(dt) {
    S.clock += dt;   // 昼夜循环独立于关卡，跨关连续
    // 气泡
    for (const b of S.bubbles) {
      b.y -= b.spd * dt;
      b.x += Math.sin((b.y + b.phase) * 0.02) * 8 * dt;
      if (b.y < TUNE.waterTop + 4) { b.y = TUNE.floorY - 10; b.x = Math.random() * W; }
    }
    for (const p of S.popups) { p.life -= dt; p.y -= 46 * dt; }
    S.popups = S.popups.filter(function (p) { return p.life > 0; });
    for (const r of S.ripples) { r.life -= dt; r.r += 60 * dt; }
    S.ripples = S.ripples.filter(function (r) { return r.life > 0; });

    if (S.mode === 'ready' || S.mode === 'over') return;

    // 计时
    if (S.mode !== 'levelend') {
      S.time -= dt;
      if (S.time <= 0) {
        S.time = 0;
        endLevel();
        return;
      }
    }

    // 鱼群
    for (const f of S.fish) {
      f.x += f.vx * dt;
      f.phase += dt * 1.6;
      f.y = f.baseY + Math.sin(f.phase) * 6;
      const half = f.size * 0.55;
      if (f.vx > 0 && f.x - half > W) { f.x = -half; f.baseY = f.y = randZone(f.type); }
      if (f.vx < 0 && f.x + half < 0) { f.x = W + half; f.baseY = f.y = randZone(f.type); }
    }

    if (S.mode === 'aim') {
      S.swingT += dt;
      S.angle = TUNE.swingMax * Math.sin(S.swingT * TUNE.swingOmega);
      S.rope = TUNE.idleRope;      // 瞄准时钩子垂在竿尖下方，不贴着竿尖
    } else if (S.mode === 'shoot') {
      S.rope += TUNE.shootSpeed * dt;
      const t = hookTip();
      // 碰撞检测
      for (const f of S.fish) {
        if (f.caught) continue;
        const dx = f.x - t.x, dy = f.y - t.y;
        const rr = f.size * 0.40 + TUNE.hookR;
        if (dx * dx + dy * dy < rr * rr) {
          f.caught = true;
          S.carrying = f;
          S.mode = 'retract';
          S.ripples.push({ x: f.x, y: f.y, r: 6, life: 0.4 });
          blip(520, 0.08, 'square', 0.06);
          break;
        }
      }
      if (t.y > TUNE.floorY - 6 || S.rope > TUNE.maxRope) S.mode = 'retract';
    } else if (S.mode === 'retract') {
      const spd = S.carrying ? retractSpeedFor(S.carrying) : TUNE.shootSpeed * 0.92;
      S.rope -= spd * dt;
      if (S.rope <= TUNE.idleRope) {
        S.rope = TUNE.idleRope;
        if (S.carrying) landFish(S.carrying);
        S.mode = 'aim';
      }
    }

    // 携带中的鱼跟随钩子
    if (S.carrying) {
      const t = hookTip();
      S.carrying.x = t.x;
      S.carrying.y = t.y + S.carrying.h * 0.42 + 10;
      S.carrying.dir = S.carrying.dir;
    }

    // 补鱼
    S.spawnTimer -= dt;
    if (S.fish.length < TUNE.maxFish && S.spawnTimer <= 0) {
      spawnFish();
      S.spawnTimer = TUNE.respawnDelay;
    }
  }

  function randZone(type) {
    const z = META[type].zone;
    return z[0] + Math.random() * (z[1] - z[0]);
  }

  function landFish(f) {
    S.score += f.value;
    S.fish = S.fish.filter(function (x) { return x !== f; });
    S.popups.push({ x: S.origin.x, y: S.origin.y + 40, text: '+' + f.value, life: 0.9 });
    S.carrying = null;
    blip(760, 0.12, 'triangle', 0.07);
    setTimeout(function () { blip(980, 0.1, 'triangle', 0.05); }, 70);
  }

  function endLevel() {
    if (S.carrying) { landFish(S.carrying); }
    S.mode = 'levelend';
    S.levelPassed = S.score >= target();
    if (S.score > S.best) S.best = S.score;
  }

  // ===== 绘制 =====
  // ===== 昼夜循环 =====
  const DAY_LEN = 90;   // 一整天 90 秒，跨关卡连续，不随关卡重置

  const STARS = [];
  for (let i = 0; i < 70; i++) {
    STARS.push({
      x: (i * 197 + 41) % W,
      y: 10 + ((i * 71) % 150),
      r: 0.7 + (i % 3) * 0.45,
      tw: (i % 9) * 0.8,
    });
  }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function mixC(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
  function rgb(c) { return 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')'; }
  function rgba(c, a) {
    return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + a + ')';
  }

  // 光照强度：0 = 深夜，1 = 正午
  const LIGHT_KEYS = [
    [0.00, 0.26], [0.06, 0.60], [0.15, 1.00], [0.38, 1.00],
    [0.46, 0.58], [0.53, 0.10], [0.93, 0.10], [0.98, 0.20], [1.00, 0.26],
  ];

  function lightAt(p) {
    for (let i = 0; i < LIGHT_KEYS.length - 1; i++) {
      const a = LIGHT_KEYS[i], b = LIGHT_KEYS[i + 1];
      if (p >= a[0] && p <= b[0]) return lerp(a[1], b[1], (p - a[0]) / (b[0] - a[0] || 1));
    }
    return 1;
  }

  // 日出 / 日落时的暖色权重
  function warmAt(p) {
    const d = Math.min(Math.min(p, 1 - p), Math.abs(p - 0.5));
    return Math.max(0, 1 - d / 0.075);
  }

  /** 太阳 / 月亮：太阳走左半边、月亮走右半边，
      这样弧线永远不会从角色身后穿过（否则正午/黄昏时像她手里举着个球） */
  function drawSunMoon(p, horizon) {
    const isSun = p < 0.5;
    const t = isSun ? p / 0.5 : (p - 0.5) / 0.5;
    // 横向范围避开左上角的目标/金币牌匾，弧顶压在牌匾下方
    const x = isSun ? 150 + 380 * t : W - 150 - 380 * t;
    // 弧顶压在 HUD 牌匾下方，避免日月被顶部牌子挡住
    const y = horizon - Math.sin(Math.PI * t) * 96;
    ctx.save();
    if (isSun) {
      const gr = ctx.createRadialGradient(x, y, 6, x, y, 104);
      gr.addColorStop(0, 'rgba(255,246,200,0.45)');
      gr.addColorStop(0.35, 'rgba(255,208,132,0.14)');
      gr.addColorStop(1, 'rgba(255,180,100,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(x, y, 104, 0, 7); ctx.fill();

      ctx.fillStyle = 'rgba(255,224,150,0.5)';
      ctx.beginPath(); ctx.arc(x, y, 29, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff3c6';
      ctx.beginPath(); ctx.arc(x, y, 22, 0, 7); ctx.fill();
    } else {
      const gr = ctx.createRadialGradient(x, y, 4, x, y, 82);
      gr.addColorStop(0, 'rgba(226,238,255,0.28)');
      gr.addColorStop(1, 'rgba(200,220,255,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(x, y, 82, 0, 7); ctx.fill();

      ctx.fillStyle = '#e9f1ff';
      ctx.beginPath(); ctx.arc(x, y, 21, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(198,214,240,0.7)';
      ctx.beginPath(); ctx.arc(x - 6, y - 5, 4.6, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 6, y + 4, 3.2, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 2, y - 9, 2.3, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  // ===== 新中式淡彩配色 =====
  const PAL = {
    ink: '#2f3b3a',
    inkSoft: 'rgba(47,59,58,0.32)',
    skyDay: [205, 224, 230],
    skyDayBot: [246, 236, 218],
    skyNight: [24, 38, 50],
    skyNightBot: [44, 64, 72],
    waterDay: [178, 218, 210],
    waterDayBot: [124, 178, 172],
    waterNight: [28, 60, 64],
    waterNightBot: [16, 40, 46],
    plaque: '#f8f1de',
    woodDark: '#5f462f',
    woodLight: '#a9855f',
    gold: '#c9a15a',
    blossom: '#f6c3ce',
  };

  // 木构与岸边（数组形式，便于按光照整体压暗）
  const WOOD = [139, 106, 74];
  const WOOD_D = [95, 70, 47];
  const WOOD_L = [169, 133, 95];
  const SHORE = [238, 232, 210];

  function scaled(c, k) {
    return 'rgb(' + Math.round(c[0] * k) + ',' + Math.round(c[1] * k) + ',' + Math.round(c[2] * k) + ')';
  }

  function drawBackground() {
    const p = (S.clock / DAY_LEN) % 1;
    const light = lightAt(p);
    const warm = warmAt(p);
    const sy = TUNE.waterTop;
    const waveAt = function (x) { return sy + Math.sin(x * 0.012 + Date.now() * 0.0016) * 5; };

    // ---- 天空 ----
    const skyTop = mixC(PAL.skyNight, PAL.skyDay, light);
    const skyBot = mixC(PAL.skyNightBot, PAL.skyDayBot, light);
    const sg = ctx.createLinearGradient(0, 0, 0, sy);
    sg.addColorStop(0, rgb(skyTop));
    sg.addColorStop(1, rgb(mixC(skyBot, [242, 176, 128], warm * 0.6)));
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, W, sy);

    // 星星：只在暗的时候露出来
    if (light < 0.6) {
      const a = Math.min(1, (0.6 - light) / 0.45);
      ctx.save();
      for (const s of STARS) {
        const tw = 0.6 + 0.4 * Math.sin(Date.now() * 0.0016 + s.tw);
        ctx.globalAlpha = a * tw * 0.9;
        ctx.fillStyle = '#eaf4ff';
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill();
      }
      ctx.restore();
    }

    drawSunMoon(p, sy - 4);
    drawScenery(light);

    // ---- 水体：薄荷绿，跟着光照变深 ----
    const wTop = mixC(PAL.waterNight, PAL.waterDay, light);
    const wBot = mixC(PAL.waterNightBot, PAL.waterDayBot, light);
    const wg = ctx.createLinearGradient(0, sy, 0, H);
    wg.addColorStop(0, rgb(mixC(wTop, [236, 186, 140], warm * 0.3)));
    wg.addColorStop(0.55, rgb(mixC(wTop, wBot, 0.55)));
    wg.addColorStop(1, rgb(wBot));
    ctx.beginPath();
    ctx.moveTo(0, waveAt(0));
    for (let x = 0; x <= W; x += 16) ctx.lineTo(x, waveAt(x));
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
    ctx.fillStyle = wg;
    ctx.fill();

    // 水下的柔和光斑
    ctx.save();
    ctx.globalAlpha = 0.06 + 0.10 * light;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 9; i++) {
      const cx2 = ((i * 271 + 90) % W);
      const cy2 = sy + 70 + ((i * 137) % 380);
      const r = 40 + (i % 4) * 26;
      const gg = ctx.createRadialGradient(cx2, cy2, 2, cx2, cy2, r);
      gg.addColorStop(0, 'rgba(255,255,255,0.5)');
      gg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(cx2, cy2, r, 0, 7); ctx.fill();
    }
    ctx.restore();

    // 水下光柱：强度完全跟光照走，夜里几乎不可见
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, sy, W, H - sy);
    ctx.clip();
    ctx.globalAlpha = 0.05 * light;
    ctx.fillStyle = warm > 0.3 ? '#ffe2bc' : '#ffffff';
    for (let i = 0; i < 5; i++) {
      const x = 140 + i * 260 + Math.sin(Date.now() * 0.0004 + i) * 30;
      ctx.beginPath();
      ctx.moveTo(x, sy); ctx.lineTo(x + 90, sy);
      ctx.lineTo(x + 210, H); ctx.lineTo(x + 20, H);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    // 水下横向波纹（手绘感）
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.10 + 0.10 * light) + ')';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const y0 = sy + 58 + i * 118;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 20) {
        const yy = y0 + Math.sin(x * 0.008 + i * 1.7 + Date.now() * 0.0008) * 7;
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.restore();

    // 水线高光（手绘感的双层波纹）
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.35 + 0.35 * light) + ')';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, waveAt(0));
    for (let x = 0; x <= W; x += 16) ctx.lineTo(x, waveAt(x));
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.15 + 0.15 * light) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 16) {
      const yy = waveAt(x) + 16 + Math.sin(x * 0.009 - Date.now() * 0.0012) * 4;
      if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
    ctx.restore();

    // 海底
    ctx.fillStyle = rgb(mixC([22, 44, 48], [150, 192, 184], light));
    ctx.beginPath();
    ctx.moveTo(0, TUNE.floorY);
    for (let x = 0; x <= W; x += 40) {
      ctx.lineTo(x, TUNE.floorY + Math.sin(x * 0.02) * 10 + 6);
    }
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,' + (0.05 + 0.06 * light) + ')';
    for (let i = 0; i < 26; i++) {
      const x = (i * 137) % W, y = TUNE.floorY + 30 + (i * 53) % 60;
      ctx.beginPath(); ctx.arc(x, y, 2 + (i % 3), 0, 7); ctx.fill();
    }
  }

  /** 远景：远山、塔、屋脊剪影，只做层次不抢戏 */
  function drawScenery(light) {
    const sy = TUNE.waterTop;
    const far = mixC([20, 34, 40], [156, 180, 184], light);
    const near = mixC([16, 28, 34], [128, 158, 164], light);
    ctx.save();

    // 远山
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = rgb(far);
    ctx.beginPath();
    ctx.moveTo(0, sy);
    for (let x = 0; x <= W; x += 12) {
      const y = sy - 24 - Math.sin(x * 0.0032) * 18 - Math.sin(x * 0.011 + 1.2) * 7;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, sy); ctx.closePath(); ctx.fill();

    // 塔（左右各一座）
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = rgb(near);
    [150, W - 150].forEach(function (px2) {
      ctx.save();
      ctx.translate(px2, sy - 8);
      for (let t = 0; t < 3; t++) {
        const w = 62 - t * 14, y = -t * 30;
        ctx.beginPath();
        ctx.moveTo(-w / 2, y);
        ctx.quadraticCurveTo(-w / 2 - 8, y - 6, -w / 2 - 13, y - 13);
        ctx.lineTo(w / 2 + 13, y - 13);
        ctx.quadraticCurveTo(w / 2 + 8, y - 6, w / 2, y);
        ctx.closePath(); ctx.fill();
        ctx.fillRect(-w / 2 + 6, y - 13, w - 12, 13);
      }
      ctx.fillRect(-3, -104, 6, 16);
      ctx.restore();
    });

    // 屋脊长墙
    ctx.globalAlpha = 0.46;
    ctx.fillStyle = rgb(near);
    ctx.beginPath();
    ctx.moveTo(296, sy - 28);
    ctx.lineTo(362, sy - 62);
    ctx.lineTo(918, sy - 62);
    ctx.lineTo(984, sy - 28);
    ctx.lineTo(984, sy);
    ctx.lineTo(296, sy);
    ctx.closePath(); ctx.fill();

    // 檐口
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = rgb(mixC([12, 22, 28], [104, 132, 140], light));
    ctx.fillRect(356, sy - 64, 568, 5);

    // 窗格：白天是暗洞，夜里透出暖光
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = rgb(mixC([255, 214, 150], [96, 120, 126], light));
    for (let i = 0; i < 8; i++) {
      ctx.fillRect(384 + i * 68, sy - 48, 26, 15);
    }
    ctx.restore();
  }

  /** 顶部灯笼串 */
  function drawLanterns(light) {
    const y0 = 20;
    const sag = 30;
    const n = 7;
    const ropeY = function (t) { return y0 + Math.sin(t * Math.PI) * sag; };

    ctx.save();
    // 绳
    ctx.strokeStyle = 'rgba(90,68,48,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 12) {
      const y = ropeY(x / W);
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 灯笼
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = t * W;
      const topY = ropeY(t);
      const glow = 0.45 + 0.55 * (1 - light);
      drawLantern(x, topY, glow);
    }
    ctx.restore();
  }

  function drawLantern(x, topY, glow) {
    const cy = topY + 26;
    ctx.save();
    // 光晕
    const gg = ctx.createRadialGradient(x, cy, 3, x, cy, 46);
    gg.addColorStop(0, 'rgba(255,214,150,' + (0.34 * glow) + ')');
    gg.addColorStop(1, 'rgba(255,190,120,0)');
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(x, cy, 46, 0, 7); ctx.fill();

    // 吊绳
    ctx.strokeStyle = 'rgba(90,68,48,0.7)';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(x, topY); ctx.lineTo(x, cy - 15); ctx.stroke();

    // 灯身
    const bw = 15, bh = 19;
    const bg = ctx.createLinearGradient(x - bw, cy, x + bw, cy);
    bg.addColorStop(0, '#e8a765');
    bg.addColorStop(0.4, '#ffdda6');
    bg.addColorStop(1, '#e39f5e');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.ellipse(x, cy, bw, bh, 0, 0, 7);
    ctx.fill();
    // 竖棱
    ctx.strokeStyle = 'rgba(180,120,70,0.35)';
    ctx.lineWidth = 1;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.ellipse(x, cy, bw * (0.42 + 0.29 * Math.abs(i)), bh, 0, 0, 7);
      ctx.stroke();
    }
    // 上下箍
    ctx.fillStyle = '#8a5f3a';
    roundRect(x - 8, cy - bh - 3, 16, 5, 2); ctx.fill();
    roundRect(x - 8, cy + bh - 2, 16, 5, 2); ctx.fill();
    // 流苏
    ctx.strokeStyle = 'rgba(180,90,70,0.75)';
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(x, cy + bh + 3); ctx.lineTo(x, cy + bh + 12); ctx.stroke();
    ctx.restore();
  }

  /** 左右上角的樱花枝 */
  function drawBlossoms(light) {
    ctx.save();
    const dim = 0.55 + 0.45 * light;
    drawBranch(-10, 6, 210, 128, 1);
    drawBranch(W + 10, 6, W - 210, 128, -1);
    ctx.restore();

    function drawBranch(x0, y0, x1, y1, dir) {
      ctx.strokeStyle = 'rgba(104,74,58,' + (0.75 * dim) + ')';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(x0 + dir * 90, y0 + 6, x1, y1);
      ctx.stroke();

      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x0 + dir * 60, y0 + 4);
      ctx.quadraticCurveTo(x0 + dir * 120, y0 + 44, x0 + dir * 168, y0 + 58);
      ctx.stroke();

      // 花团
      const spots = [
        [x0 + dir * 92, y0 + 14, 22], [x1 - dir * 10, y1 - 8, 26],
        [x0 + dir * 150, y0 + 52, 20], [x0 + dir * 40, y0 + 2, 17],
        [x1 - dir * 56, y1 + 10, 19], [x0 + dir * 122, y0 + 30, 15],
      ];
      for (const s of spots) blossomCluster(s[0], s[1], s[2], dim);
    }

    function blossomCluster(x, y, r, dim) {
      const petals = 6;
      for (let i = 0; i < petals; i++) {
        const a = (i / petals) * Math.PI * 2 + x * 0.01;
        const px2 = x + Math.cos(a) * r * 0.55;
        const py2 = y + Math.sin(a) * r * 0.5;
        ctx.fillStyle = 'rgba(246,195,206,' + (0.85 * dim) + ')';
        ctx.beginPath(); ctx.arc(px2, py2, r * 0.42, 0, 7); ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,236,240,' + (0.9 * dim) + ')';
      ctx.beginPath(); ctx.arc(x, y, r * 0.3, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(226,150,166,' + (0.7 * dim) + ')';
      ctx.beginPath(); ctx.arc(x, y, r * 0.14, 0, 7); ctx.fill();
    }
  }

  /** 栈道栏杆（在角色身后） */
  function drawRailing() {
    const light = lightAt((S.clock / DAY_LEN) % 1);
    const k = 0.34 + 0.66 * light;
    const topRail = 158, botRail = 176, deckTop = 184;
    ctx.save();

    // 立柱
    for (let x = 46; x < W; x += 148) {
      ctx.fillStyle = scaled(WOOD_D, k);
      roundRect(x - 6, topRail - 10, 12, deckTop - topRail + 10, 3);
      ctx.fill();
      ctx.fillStyle = scaled(WOOD_L, k);
      roundRect(x - 8, topRail - 14, 16, 7, 3);
      ctx.fill();
    }

    // 上下横栏
    const rg = ctx.createLinearGradient(0, topRail, 0, botRail + 10);
    rg.addColorStop(0, scaled(WOOD_L, k));
    rg.addColorStop(0.28, scaled(WOOD, k));
    rg.addColorStop(1, scaled(WOOD_D, k));
    ctx.fillStyle = rg;
    roundRect(-6, topRail, W + 12, 12, 4); ctx.fill();
    roundRect(-6, botRail, W + 12, 9, 4); ctx.fill();

    // 栏上高光
    ctx.fillStyle = 'rgba(255,232,196,' + (0.35 * k) + ')';
    ctx.fillRect(0, topRail + 1, W, 2);
    ctx.restore();
  }

  /** 栈道甲板 + 岸边米白带（画在鱼之后，压住水面） */
  function drawQuay() {
    const light = lightAt((S.clock / DAY_LEN) % 1);
    const k = 0.34 + 0.66 * light;
    const deckTop = 184, deckBot = 199, bandBot = 210;
    ctx.save();

    // 甲板
    const dg = ctx.createLinearGradient(0, deckTop, 0, deckBot);
    dg.addColorStop(0, scaled(WOOD_L, k));
    dg.addColorStop(0.3, scaled(WOOD, k));
    dg.addColorStop(1, scaled(WOOD_D, k));
    ctx.fillStyle = dg;
    ctx.fillRect(-2, deckTop, W + 4, deckBot - deckTop);
    ctx.fillStyle = 'rgba(255,232,196,' + (0.4 * k) + ')';
    ctx.fillRect(0, deckTop + 1, W, 2);

    // 板缝
    ctx.strokeStyle = 'rgba(80,56,36,' + (0.35 * k) + ')';
    ctx.lineWidth = 1.6;
    for (let x = 0; x < W; x += 92) {
      ctx.beginPath(); ctx.moveTo(x, deckTop + 3); ctx.lineTo(x, deckBot - 2); ctx.stroke();
    }

    // 岸边米白带（底边做成手绘波浪）
    ctx.beginPath();
    ctx.moveTo(-2, deckBot);
    for (let x = -2; x <= W + 2; x += 12) {
      ctx.lineTo(x, bandBot + Math.sin(x * 0.02 + Date.now() * 0.0006) * 3);
    }
    ctx.lineTo(W + 2, deckBot);
    ctx.closePath();
    const bg = ctx.createLinearGradient(0, deckBot, 0, bandBot);
    bg.addColorStop(0, scaled(SHORE, k));
    bg.addColorStop(1, scaled([226, 218, 192], k));
    ctx.fillStyle = bg;
    ctx.fill();

    // 米白带下缘的柔和阴影
    ctx.strokeStyle = 'rgba(90,120,112,' + (0.2 * k) + ')';
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let x = -2; x <= W + 2; x += 12) {
      const y = bandBot + Math.sin(x * 0.02 + Date.now() * 0.0006) * 3 + 3;
      if (x <= 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawBubbles() {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    for (const b of S.bubbles) {
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7);
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  /** 顶部公主：站在木筏上举着鱼竿，鱼线从竿尖甩出 */
  function drawPrincess() {
    const L = S.layout;
    if (!L) return;
    const im = PIMG[S.princess];
    if (!im || !im.complete || !im.naturalWidth) return;
    ctx.save();
    // 落在水面的投影
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(TUNE.princessCx, TUNE.feetY - 2, 62, 10, 0, 0, 7);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.drawImage(im, L.x, L.y, L.w, L.h);
    ctx.restore();
  }

  function drawHook() {
    const o = S.origin;
    const t = hookTip();
    // 绳
    ctx.save();
    ctx.strokeStyle = '#e8dcc0';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(t.x, t.y); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(o.x + 1, o.y); ctx.lineTo(t.x + 1, t.y); ctx.stroke();

    // 钩子
    ctx.translate(t.x, t.y);
    ctx.rotate(-S.angle);
    ctx.scale(0.78, 0.78);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // 深色描边打底，保证在浅色鱼身上也看得见
    ctx.strokeStyle = 'rgba(20,30,45,0.75)';
    ctx.lineWidth = 9;
    hookPath(ctx);
    ctx.stroke();

    ctx.strokeStyle = '#e4e9f2';
    ctx.lineWidth = 5;
    hookPath(ctx);
    ctx.stroke();

    // 钩顶圆环
    ctx.strokeStyle = '#b9c2d0';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, -16, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function hookPath(c) {
    c.beginPath();
    c.moveTo(0, -11);
    c.lineTo(0, 4);
    // 左爪
    c.moveTo(0, 4);
    c.quadraticCurveTo(-2, 17, -12, 17);
    c.quadraticCurveTo(-19, 17, -19, 8);
    // 右爪
    c.moveTo(0, 4);
    c.quadraticCurveTo(2, 17, 12, 17);
    c.quadraticCurveTo(19, 17, 19, 8);
  }

  function drawFish() {
    for (const f of S.fish) {
      const im = IMG[f.type];
      if (!im || !im.complete) continue;
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.scale(f.dir, 1);
      ctx.rotate(Math.sin(f.phase) * 0.04);
      // 影子
      ctx.globalAlpha = 0.10;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(0, f.h * 0.30, f.size * 0.34, f.h * 0.08, 0, 0, 7);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.drawImage(im, -f.size / 2, -f.h / 2, f.size, f.h);
      ctx.restore();
    }
    // 携带中的鱼
    if (S.carrying) {
      const f = S.carrying, im = IMG[f.type];
      if (im && im.complete) {
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.rotate(Math.sin(Date.now() * 0.006) * 0.16);
        ctx.drawImage(im, -f.size / 2, -f.h / 2, f.size, f.h);
        ctx.restore();
      }
    }
  }

  function drawFX() {
    ctx.save();
    for (const r of S.ripples) {
      ctx.globalAlpha = Math.max(0, r.life) * 1.6;
      ctx.strokeStyle = '#f2fffa'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, 7); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.font = 'bold 26px system-ui,sans-serif';
    ctx.textAlign = 'center';
    for (const p of S.popups) {
      ctx.globalAlpha = Math.min(1, p.life * 1.6);
      ctx.fillStyle = '#ffc94a';
      ctx.strokeStyle = 'rgba(47,59,58,0.8)';
      ctx.lineWidth = 4;
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.restore();
  }

  // ===== 角色选择条 =====
  const PICK = { x: 26, y: H - 84, size: 58, gap: 10 };

  function pickerRect(i) {
    return { x: PICK.x + i * (PICK.size + PICK.gap), y: PICK.y, w: PICK.size, h: PICK.size };
  }

  function hitPicker(x, y) {
    for (let i = 0; i < PNAMES.length; i++) {
      const r = pickerRect(i);
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
    }
    return -1;
  }

  function drawPicker() {
    if (!PNAMES.length) return;
    ctx.save();
    ctx.font = 'bold 15px system-ui,sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(47,59,58,0.7)';
    ctx.fillText('换装  ·  数字键 1-8 或点击头像', PICK.x + 2, PICK.y - 12);

    for (let i = 0; i < PNAMES.length; i++) {
      const r = pickerRect(i);
      const key = PNAMES[i];
      const im = PIMG[key];
      const on = S.princess === key;

      ctx.save();
      ctx.fillStyle = 'rgba(70,52,32,0.16)';
      roundRect(r.x + 1, r.y + 2, r.w, r.h, 8); ctx.fill();

      ctx.fillStyle = PAL.plaque;
      roundRect(r.x, r.y, r.w, r.h, 8); ctx.fill();

      if (im && im.complete && im.naturalWidth) {
        ctx.save();
        roundRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6, 6);
        ctx.clip();
        // 只取头部区域，缩略图才看得清
        const sw = 512 * 0.58, sh = 512 * 0.58;
        const sx = 512 * 0.21, sy = 512 * 0.015;
        ctx.drawImage(im, sx, sy, sw, sh, r.x + 3, r.y + 3, r.w - 6, r.h - 6);
        ctx.restore();
      }
      ctx.lineWidth = on ? 3.5 : 2;
      ctx.strokeStyle = on ? '#d9a441' : 'rgba(95,70,47,0.75)';
      roundRect(r.x, r.y, r.w, r.h, 8);
      ctx.stroke();
      ctx.restore();
    }

    const cur = PCFG[S.princess];
    if (cur) {
      ctx.font = 'bold 16px system-ui,sans-serif';
      ctx.fillStyle = 'rgba(47,59,58,0.85)';
      ctx.fillText(cur.name, PICK.x + PNAMES.length * (PICK.size + PICK.gap) + 8, PICK.y + PICK.size - 14);
    }
    ctx.restore();
  }

  /** 米色牌匾：木框 + 金线 + 两端圆钉 */
  function plaque(x, y, w, h) {
    ctx.save();
    ctx.fillStyle = 'rgba(70,52,32,0.18)';
    roundRect(x + 2, y + 3, w, h, 9); ctx.fill();

    ctx.fillStyle = PAL.plaque;
    roundRect(x, y, w, h, 9); ctx.fill();

    ctx.strokeStyle = PAL.woodDark;
    ctx.lineWidth = 3;
    roundRect(x, y, w, h, 9); ctx.stroke();

    ctx.strokeStyle = 'rgba(201,161,90,0.85)';
    ctx.lineWidth = 1.2;
    roundRect(x + 4.5, y + 4.5, w - 9, h - 9, 6); ctx.stroke();

    ctx.fillStyle = 'rgba(139,106,74,0.85)';
    ctx.beginPath(); ctx.arc(x + 10, y + h / 2, 2.4, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w - 10, y + h / 2, 2.4, 0, 7); ctx.fill();
    ctx.restore();
  }

  function drawHUD() {
    const low = S.time <= 10;
    ctx.save();

    // 通关目标
    const gw = 268, gh = 48, gx = 24, gy = 20;
    plaque(gx, gy, gw, gh);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(120,96,64,0.9)';
    ctx.font = 'bold 19px system-ui,sans-serif';
    ctx.fillText('通关目标', gx + 22, gy + gh / 2 + 1);
    ctx.fillStyle = PAL.ink;
    ctx.font = 'bold 26px system-ui,sans-serif';
    ctx.fillText(S.score + ' / ' + target(), gx + 116, gy + gh / 2 + 1);

    // 金币
    const cw = 168, ch = 42, cx2 = 24, cy2 = gy + gh + 10;
    plaque(cx2, cy2, cw, ch);
    ctx.fillStyle = 'rgba(196,142,54,0.95)';
    ctx.beginPath(); ctx.arc(cx2 + 26, cy2 + ch / 2, 11, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(140,96,30,0.9)';
    ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = PAL.ink;
    ctx.font = 'bold 22px system-ui,sans-serif';
    ctx.fillText('金币 ' + S.score, cx2 + 46, cy2 + ch / 2 + 1);

    // 关卡
    ctx.fillStyle = 'rgba(47,59,58,0.72)';
    ctx.font = 'bold 17px system-ui,sans-serif';
    ctx.fillText('第 ' + S.level + ' 关', cx2 + 4, cy2 + ch + 22);

    // 时间
    const tw = 176, th = 48, tx = W - 24 - tw, ty = 20;
    plaque(tx, ty, tw, th);
    ctx.fillStyle = low ? '#c0453e' : 'rgba(120,96,64,0.9)';
    ctx.beginPath(); ctx.arc(tx + 30, ty + th / 2, 11, 0, 7);
    ctx.strokeStyle = low ? '#c0453e' : 'rgba(120,96,64,0.9)';
    ctx.lineWidth = 2.4; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tx + 30, ty + th / 2); ctx.lineTo(tx + 30, ty + th / 2 - 6); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tx + 30, ty + th / 2); ctx.lineTo(tx + 34, ty + th / 2 + 2); ctx.stroke();

    const mm = Math.floor(Math.max(0, S.time) / 60);
    const ss = Math.ceil(Math.max(0, S.time) % 60);
    ctx.fillStyle = low ? '#c0453e' : PAL.ink;
    ctx.font = 'bold 28px system-ui,sans-serif';
    ctx.fillText(mm + ':' + (ss < 10 ? '0' + ss : ss), tx + 52, ty + th / 2 + 1);

    // 时间条
    const bw = tw - 20, bx = tx + 10, by = ty + th + 8;
    ctx.fillStyle = 'rgba(90,70,48,0.22)';
    roundRect(bx, by, bw, 7, 3.5); ctx.fill();
    ctx.fillStyle = low ? '#c0453e' : '#6fae9e';
    roundRect(bx, by, bw * Math.max(0, S.time / TUNE.levelTime), 7, 3.5); ctx.fill();
    ctx.restore();
  }

  function panel(title, lines, hint) {
    ctx.save();
    ctx.fillStyle = 'rgba(30,40,40,0.42)';
    ctx.fillRect(0, 0, W, H);

    const pw = 580, ph = 330, px = (W - pw) / 2, py = (H - ph) / 2;

    // 卷轴主体
    ctx.fillStyle = 'rgba(70,52,32,0.22)';
    roundRect(px + 3, py + 5, pw, ph, 14); ctx.fill();
    ctx.fillStyle = PAL.plaque;
    roundRect(px, py, pw, ph, 14); ctx.fill();
    ctx.strokeStyle = PAL.woodDark;
    ctx.lineWidth = 3.5;
    roundRect(px, py, pw, ph, 14); ctx.stroke();
    ctx.strokeStyle = 'rgba(201,161,90,0.9)';
    ctx.lineWidth = 1.4;
    roundRect(px + 7, py + 7, pw - 14, ph - 14, 10); ctx.stroke();

    // 上下轴头
    [py - 6, py + ph - 12].forEach(function (y) {
      const g = ctx.createLinearGradient(px, y, px + pw, y);
      g.addColorStop(0, PAL.woodDark);
      g.addColorStop(0.5, PAL.woodLight);
      g.addColorStop(1, PAL.woodDark);
      ctx.fillStyle = g;
      roundRect(px - 12, y, pw + 24, 18, 9); ctx.fill();
      ctx.strokeStyle = 'rgba(60,42,26,0.6)';
      ctx.lineWidth = 1.5;
      roundRect(px - 12, y, pw + 24, 18, 9); ctx.stroke();
    });

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#8a5a2c';
    ctx.font = 'bold 42px system-ui,sans-serif';
    ctx.fillText(title, W / 2, py + 92);

    ctx.strokeStyle = 'rgba(201,161,90,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 90, py + 112); ctx.lineTo(W / 2 + 90, py + 112);
    ctx.stroke();

    ctx.fillStyle = 'rgba(47,59,58,0.9)';
    ctx.font = '21px system-ui,sans-serif';
    lines.forEach(function (l, i) {
      ctx.fillText(l, W / 2, py + 158 + i * 36);
    });

    ctx.fillStyle = 'rgba(47,59,58,0.5)';
    ctx.font = '17px system-ui,sans-serif';
    ctx.fillText(hint, W / 2, py + ph - 34);
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ===== 声音开关（右上，时间条下方）=====
  const SND = { x: W - 70, y: 92, size: 44 };

  function hitSound(x, y) {
    return x >= SND.x && x <= SND.x + SND.size && y >= SND.y && y <= SND.y + SND.size;
  }

  function drawSound() {
    const cx = SND.x + SND.size / 2, cy = SND.y + SND.size / 2, r = SND.size / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(70,52,32,0.18)';
    ctx.beginPath(); ctx.arc(cx + 1, cy + 2, r, 0, 7); ctx.fill();

    const g = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
    g.addColorStop(0, PAL.plaque);
    g.addColorStop(1, '#e8dcc0');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();

    ctx.strokeStyle = PAL.woodDark;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();

    ctx.strokeStyle = 'rgba(201,161,90,0.85)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(cx, cy, r - 4, 0, 7); ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 22px system-ui,sans-serif';
    ctx.fillStyle = soundOn ? PAL.ink : 'rgba(47,59,58,0.35)';
    ctx.fillText('♪', cx, cy + 1);

    if (!soundOn) {
      ctx.strokeStyle = 'rgba(192,69,62,0.85)';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 11, cy + 11);
      ctx.lineTo(cx + 11, cy - 11);
      ctx.stroke();
    }
    ctx.restore();
  }

  function draw() {
    drawBackground();
    drawLanterns(lightAt((S.clock / DAY_LEN) % 1));
    drawBlossoms(lightAt((S.clock / DAY_LEN) % 1));
    drawRailing();
    drawBubbles();
    drawFish();
    drawQuay();
    // 鱼线要画在栈道之后（否则会被甲板截断），又要画在角色之后：
    // 钩子摆到左侧时正好落在裙摆上，压在角色下面就只剩半个钩尖露出来
    drawPrincess();
    drawHook();
    drawFX();
    drawHUD();
    drawPicker();
    drawSound();

    if (S.mode === 'ready') {
      panel('黄金鱼钩', [
        '点击 / 空格 出钩，钩住游动的鱼',
        '越深越大的鱼价值越高，收线也越慢',
        '限时 60 秒，达标即可进入下一关',
      ], '点击任意位置开始');
    } else if (S.mode === 'levelend') {
      const passed = S.levelPassed;
      panel(passed ? '过关！' : '时间到', [
        '本关金币：' + S.score,
        '目标金币：' + target(),
        passed ? '准备进入第 ' + (S.level + 1) + ' 关' : '未达标，再来一次',
      ], '点击继续');
    } else if (S.mode === 'over') {
      panel('游戏结束', ['最终金币：' + S.score, '最高记录：' + S.best], '点击重新开始');
    }
  }

  // ===== 主循环 =====
  let last = 0;
  function loop(ts) {
    if (!last) last = ts;
    let dt = (ts - last) / 1000;
    last = ts;
    if (dt > 0.05) dt = 0.05;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // ===== 输入 =====
  function action() {
    if (S.mode === 'ready') { startGame(); return; }
    if (S.mode === 'levelend') {
      if (S.levelPassed) {
        S.level++; S.score = 0; S.time = TUNE.levelTime;
        S.mode = 'aim';
        S.fish = []; S.carrying = null; S.rope = TUNE.idleRope;
        seedFish();
      } else {
        startGame();
      }
      return;
    }
    if (S.mode === 'over') { startGame(); return; }
    if (S.mode === 'aim') {
      S.mode = 'shoot';
      S.rope = TUNE.idleRope;
      blip(300, 0.07, 'sawtooth', 0.05);
    }
  }

  function startGame() {
    S.mode = 'aim'; S.score = 0; S.level = 1; S.time = TUNE.levelTime;
    S.rope = TUNE.idleRope; S.angle = 0; S.swingT = 0; S.carrying = null;
    S.fish = []; S.popups = []; S.spawnTimer = 0;
    seedFish();
  }

  cv.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    startBGM();   // 浏览器要求音频在用户手势里启动
    const p = toGame(e.clientX, e.clientY);
    if (hitSound(p.x, p.y)) {
      toggleSound();
      blip(520, 0.06, 'sine', 0.04);
      return;
    }
    const i = hitPicker(p.x, p.y);
    if (i >= 0) {
      setPrincess(PNAMES[i]);
      blip(660, 0.06, 'sine', 0.05);
      return;
    }
    action();
  });
  window.addEventListener('keydown', function (e) {
    startBGM();
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); action(); return; }
    if (e.key === 'm' || e.key === 'M') { toggleSound(); return; }
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= PNAMES.length) {
      setPrincess(PNAMES[n - 1]);
      blip(660, 0.06, 'sine', 0.05);
    }
  });

  // ===== 屏幕方向 =====
  // 不用 @media (orientation)：微信/QQ 内置浏览器、开了旋转锁的手机，
  // 视口方向根本不随手机变，媒体查询会永远判成竖屏。
  // 这里直接量视口宽高，并且给一个"锁竖屏也能玩"的兜底：整块舞台转 90°。
  const stageEl = document.getElementById('stage');
  const hintEl = document.getElementById('rotate-hint');
  const VIEW = { cw: W, ch: H, sw: W, sh: H, rot: false };
  let forcedLandscape = false;

  function isPortrait() { return window.innerHeight > window.innerWidth; }

  function updateOrientation() {
    const portrait = isPortrait();
    const rot = portrait && forcedLandscape;

    document.body.classList.toggle('need-landscape', portrait && !forcedLandscape);
    document.body.classList.toggle('rot90', rot);
    VIEW.rot = rot;

    if (rot) {
      const vw = window.innerWidth, vh = window.innerHeight;
      stageEl.style.position = 'fixed';
      stageEl.style.left = '0';
      stageEl.style.top = '0';
      stageEl.style.width = vh + 'px';
      stageEl.style.height = vw + 'px';
      stageEl.style.transformOrigin = '0 0';
      // rotate(90deg) 后整块跑到左边，再沿 x 平移 vw 把它拉回视口
      stageEl.style.transform = 'translateX(' + vw + 'px) rotate(90deg)';
    } else {
      stageEl.style.position = '';
      stageEl.style.left = '';
      stageEl.style.top = '';
      stageEl.style.width = '';
      stageEl.style.height = '';
      stageEl.style.transformOrigin = '';
      stageEl.style.transform = '';
    }

    if (hintEl) {
      const vp = hintEl.querySelector('.vp');
      if (vp) vp.textContent = '当前视口 ' + window.innerWidth + ' × ' + window.innerHeight;
    }
    fit();
  }

  // 自适应缩放：可用空间取舞台自身的盒子（旋转模式下宽高是互换的）
  function fit() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const sw = VIEW.rot ? vh : vw;
    const sh = VIEW.rot ? vw : vh;
    VIEW.sw = sw; VIEW.sh = sh;
    const pad = Math.min(sw, sh) < 500 ? 4 : 24;
    const sc = Math.max(0.05, Math.min((sw - pad) / W, (sh - pad) / H));
    VIEW.cw = W * sc;
    VIEW.ch = H * sc;
    cv.style.width = VIEW.cw + 'px';
    cv.style.height = VIEW.ch + 'px';
  }

  // 屏幕坐标 → 游戏坐标（1280×720）。旋转模式下按 90° 逆变换反算。
  function toGame(cx, cy) {
    const cw = VIEW.cw, ch = VIEW.ch, sw = VIEW.sw, sh = VIEW.sh;
    let px, py;
    if (VIEW.rot) {
      // 局部坐标 (u,v) → 屏幕 (sh - v, u)
      const u = cy;
      const v = sh - cx;
      px = u - (sw - cw) / 2;
      py = v - (sh - ch) / 2;
    } else {
      const r = cv.getBoundingClientRect();
      px = cx - r.left;
      py = cy - r.top;
    }
    return { x: px * (W / cw), y: py * (H / ch) };
  }

  // 游戏坐标 → 屏幕坐标（两种方向都支持），供自动化测试点击用
  function toScreen(gx, gy) {
    const cw = VIEW.cw, ch = VIEW.ch, sw = VIEW.sw, sh = VIEW.sh;
    const px = gx * (cw / W), py = gy * (ch / H);
    const u = px + (sw - cw) / 2;
    const v = py + (sh - ch) / 2;
    if (VIEW.rot) return { x: sh - v, y: u };
    const r = cv.getBoundingClientRect();
    return { x: r.left + px, y: r.top + py };
  }
  window.__toScreen__ = toScreen;
  window.__VIEW__ = VIEW;

  const forceBtn = document.getElementById('force-play');  if (forceBtn) {
    forceBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      forcedLandscape = true;
      updateOrientation();
    });
  }

  window.addEventListener('resize', updateOrientation);
  window.addEventListener('orientationchange', function () {
    setTimeout(updateOrientation, 120);
  });
  if (window.screen && window.screen.orientation && window.screen.orientation.addEventListener) {
    window.screen.orientation.addEventListener('change', function () {
      setTimeout(updateOrientation, 120);
    });
  }
  // 兜底轮询：部分安卓 WebView 转屏后不派发 resize
  let lastDims = window.innerWidth + 'x' + window.innerHeight;
  setInterval(function () {
    const d = window.innerWidth + 'x' + window.innerHeight;
    if (d !== lastDims) { lastDims = d; updateOrientation(); }
  }, 400);

  updateOrientation();

  // 初始气泡
  for (let i = 0; i < 28; i++) {
    S.bubbles.push({
      x: Math.random() * W,
      y: TUNE.waterTop + Math.random() * (H - TUNE.waterTop),
      r: 2 + Math.random() * 4,
      spd: 18 + Math.random() * 34,
      phase: Math.random() * 100,
    });
  }

  requestAnimationFrame(loop);

  // 供自动化测试读取状态，不影响玩法
  window.__GAME__ = S;
  window.__TUNE__ = TUNE;
  window.__AUDIO__ = function () {
    return {
      ctx: actx ? actx.state : null,
      started: bgmStarted,
      step: bgmStep,
      soundOn: soundOn,
      master: master ? Math.round(master.gain.value * 1000) / 1000 : null,
      bgm: bgmBus ? Math.round(bgmBus.gain.value * 1000) / 1000 : null,
    };
  };

  // 离线渲染背景音乐，用来实测峰值/有效值（不需要真的出声）
  window.__RENDER_BGM__ = function (sec) {
    const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Off) return Promise.reject(new Error('no OfflineAudioContext'));
    const prev = { actx: actx, bgmBus: bgmBus, master: master };
    const off = new Off(1, Math.ceil(44100 * sec), 44100);
    const g = makeGraph(off);
    g.bgm.gain.value = BGM_LEVEL;
    actx = off; bgmBus = g.bgm; master = g.master;

    const d = stepDur();
    let step = 0, t = 0.05;
    while (t < sec - 0.4) { scheduleStep(step++, t); t += d; }

    return off.startRendering().then(function (buf) {
      actx = prev.actx; bgmBus = prev.bgmBus; master = prev.master;
      const d = buf.getChannelData(0);
      let peak = 0, sum = 0, clip = 0;
      for (let i = 0; i < d.length; i++) {
        const v = Math.abs(d[i]);
        if (v > peak) peak = v;
        if (v >= 0.999) clip++;
        sum += d[i] * d[i];
      }
      return { sec: sec, peak: Math.round(peak * 1000) / 1000, rms: Math.round(Math.sqrt(sum / d.length) * 10000) / 10000, clip: clip };
    }, function (e) {
      actx = prev.actx; bgmBus = prev.bgmBus; master = prev.master;
      throw e;
    });
  };
})();
