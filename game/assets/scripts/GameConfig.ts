/**
 * 玩法参数与鱼类数据定义。
 * 鱼类数值的唯一来源是 resources/config/fish-config.json，
 * 这里只声明类型与「与美术无关」的玩法调参。
 */

import { view } from 'cc';

/**
 * 游法。八条鱼的性格全从这个枚举 + speed / wave / reel 三个数里长出来，
 * 不在 Fish.ts 里写死任何一条鱼的脾气。
 *
 *  - cruise 匀速直游：最好瞄，适合「慢但值钱」的鱼
 *  - dart   走走停停：速度在 0.3~1.35 倍之间脉动，像小鱼一惊一乍
 *  - sweep  优雅上下巡游：横速稳定、纵向摆幅大，走的是正弦航线
 *  - glide  贴底滑翔：几乎不躲，靠「沉」来增加成本
 *  - burst  间歇突进：平时慢吞吞，隔几秒窜一段，最难瞄
 */
export type SwimPattern = 'cruise' | 'dart' | 'sweep' | 'glide' | 'burst';

export interface FishDef {
    name: string;
    image: string;
    baseSize: number;
    baseSpeed: number;
    baseValue: number;
    /** 收线速度 px/s。越小越「沉」—— 小鱼一拽就上来，鲨鱼要拉好几秒 */
    reel?: number;
    /** 游法，缺省按 cruise */
    pattern?: SwimPattern;
    /** 纵向摆动幅度 px（原来全场统一 6px，现在按鱼各配） */
    wave?: number;
}

export type FishTable = Record<string, FishDef>;

/** 设计分辨率，与 Canvas 的 Design Resolution 保持一致 */
export const DESIGN = { w: 1280, h: 720 };

/**
 * 实际可见区域（设计坐标，左上原点，y 向下）。
 *
 * 工程按 **FIXED_HEIGHT**（project.json 里 fitHeight=true）适配：高度恒为 720，
 * 宽度随屏幕比例变化，宽屏上比 1280 更宽（19.5:9 的手机约 1560）。
 * 背景要按它横向多画一圈、鱼群要在它的左右边界进出，
 * 否则宽屏两侧会露出相机的黑底，鱼也会在画面里「凭空消失」。
 */
export const VIEW = { w: DESIGN.w, h: DESIGN.h, left: 0, right: DESIGN.w };

/**
 * 按当前分辨率刷新 VIEW。
 * 必须在 `view.setDesignResolutionSize()` 之后调用 —— 那个接口只改 view，
 * 不会重新对齐 Canvas 节点和相机。
 */
export function syncView(): void {
    const vs = view.getVisibleSize();
    if (!vs || !vs.width || !vs.height) {
        return;
    }
    VIEW.w = vs.width;
    VIEW.h = vs.height;
    VIEW.left = DESIGN.w / 2 - vs.width / 2;
    VIEW.right = DESIGN.w / 2 + vs.width / 2;
}

export const TUNE = {
    /**
     * 摆幅，相对竖直向下。40° 的扫掠范围比原来的 30° 宽三分之一。
     * 绳长恒定，钩子走摆弧：40° 时钩子比静止位置抬高约 46px，正好停在水线上，
     * 不会爬到她裙摆上（裙摆最低点在 y≈177~195）。
     */
    swingMax: (40 * Math.PI) / 180,
    /** 摆动角速度 rad/s：摆幅加大后略降一点，钩子扫过中间的速度不至于太快 */
    swingOmega: 1.35,
    /** 出钩速度 px/s。之前 1280 是「一秒到海底」，改成 660 才有抛竿的手感 */
    shootSpeed: 660,
    /** 最大绳长 */
    maxRope: 960,
    /** 钩子碰撞半径 */
    hookR: 15,
    /**
     * 瞄准态绳长（恒定）。竿尖约 y=38~63，280 让钩子静止时落在水线下方约 88px（y≈322），
     * 摆到两端抬到 y≈252 —— 全程都在水面（y=236）以下，不会飘到半空、也不会压住裙摆。
     */
    idleRope: 280,
    /** 空钩收线速度 = 出钩速度 × 该系数（空钩没东西可拉，快一点不碍事） */
    reelEmptyK: 0.92,
    /**
     * 带鱼收线速度由每条鱼自己的 `reel` 决定（见 fish-config.json）。
     * 这里只留一个下限兜底，防止配错数导致绳子纹丝不动。
     * 45 是给最沉那几条留的余量：水位下移后收线行程短了 ~48px，
     * 河豚 / 鲨鱼 / 鳐鱼的 px/s 落到 50~71，还按 80 兜底会被一起拔到 80，
     * 耗时变快、彼此的分量排序也乱了。
     */
    reelMin: 45,
    /** 单关时长 s */
    levelTime: 60,
    /** 第 1 关目标分 */
    targetBase: 600,
    /** 每关目标分增量 */
    targetStep: 280,
    /** 同屏鱼上限 */
    maxFish: 9,
    /** 捕获后补鱼间隔 s */
    respawnDelay: 0.5,
    /**
     * 水面 y。
     *
     * 这个数决定「顶部那块」有多高：公主站在水线上，水线越往下，留给她的画幅越大。
     * 190 的时候她只有 168px（占画面 23%），头顶离上边框只剩 28px ——
     * 看着像个缩在角落的小摆件，上面一排灯笼和栏杆挤成一条。
     * 拉到 236：顶部留白 236px（33%），她能画到 204px，帽子离上边框 47px，
     * 整个人才像「站在岸边的主角」。
     *
     * 代价是水里短了 46px（水位 236 → 海床 668，深 432），鱼群与道具的纵向区间
     * 跟着往下让（见 ZONE / PROP.yMin / BEAST_Y），否则浅水鱼会顶到空钩上。
     */
    waterTop: 236,
    /** 公主脚踩水线（岸边带底边）的 y */
    feetY: 242,
    /** 公主显示高度（含鱼竿）。512 画布里角色本体占 470 */
    princessH: 204,
    /** 公主水平中心 */
    princessCx: 640,
    /** 海床 y */
    floorY: 668,
    /** 开局鱼数 */
    initialFish: 6,
    /**
     * 钩住后鱼身中心相对钩尖的偏移（× 鱼高）。
     * 8 张鱼贴图都是 512×512，画面上边留了 6%~20% 的透明，
     * 所以不能按「鱼高一半」去贴：0.35 让钩爪正好咬进鱼背，看不出间隙。
     */
    fishHang: 0.35,
};

/** 道具种类。前三个是增益，后两个是「负面道具」—— 钩到了要吃亏 */
export type PropKind = 'slow' | 'pause' | 'time' | 'fog' | 'break';

/**
 * 水里漂的道具。和鱼一样能被钩住，收上来才生效（见 Props.ts / Hook.ts）。
 *
 * 五个道具的取舍：
 *  - 减速：把鱼速压到 0.35，持续 7 秒。大鱼慢下来之后，钩子更容易咬准，
 *    但收线速度不变 —— 手感上的「好钩」不能变成「好拉」，否则大鱼就不值钱了。
 *  - 暂停：全场冻结 3 秒（鱼、钩、计时、昼夜一起停）。相当于白送 3 秒。
 *  - 加时：直接 +10 秒。
 *  - 大雾（负面）：糊住水面 3 秒，看得到轮廓、看不清细节，瞄不准。
 *  - 断线（负面）：鱼线绷断 3 秒，这期间不能出钩，线才慢慢长回来。
 *
 * 负面道具存在的意义不是「惩罚玩家」，是让水里多一个要绕开的东西：
 * 道具是静止的，鱼是动的，鱼游过道具背后的时候那一钩就有风险了。
 */
export const PROP = {
    /**
     * 刷新间隔 s，取 [gapMin, gapMax] 随机。
     * 只在「刷出一个」之后重新计时（到期消失 / 被钩走都不重置），
     * 所以这就是实打实的节奏：一关 60 秒大约 8 个。
     */
    gapMin: 6,
    gapMax: 8.5,
    /** 开局多久刷第一个 */
    gapFirst: 3.5,
    /**
     * 同屏上限。取 3：生物要横穿一屏（十几秒），名额给少了会被它整段占住，
     * 那期间玩家眼前一个可捞的东西都没有。
     */
    maxAlive: 3,
    /** 存活时长 s */
    life: 9,
    /** 消失前闪烁时长 s */
    blink: 1.6,
    /**
     * 出现深度区间。
     * 下界跟着空钩走：待机时钩尖在 y≈322（waterTop 236 + idleRope 280），
     * 摆到最低点也就 332 出头，再给 props 留一段余量 —— 500 起。
     * 上界 620 是海床（668）往上留的一条带，再深就陷进沙子里了。
     */
    yMin: 500,
    yMax: 620,
    /**
     * 生成角度占摆幅的比例。
     * 钩子只能沿当前摆角（±swingMax = ±40°）出钩，所以道具必须落在
     * 「竿尖往下的这个扇形」里，否则玩家怎么等都够不着。
     * 0.8 留出余量：贴着 40° 极限的位置要等摆到端点才打得到，手感很差。
     */
    spread: 0.8,
    /** 道具直径 */
    size: 54,
    /** 拾取判定半径（比视觉略大一圈，钩尖擦到边也算吃到） */
    pickR: 38,
    /**
     * 徽章（增益）的收线速度 px/s。
     * 原来走的是「空钩回收」速度（shootSpeed × 0.92 ≈ 607），
     * 道具离竿尖不过两三百像素，0.3 秒就拽上来了，完全没有「捞到东西」的分量。
     */
    reelBadge: 147,
    /** 减速：鱼速系数 */
    slowK: 0.35,
    /** 减速持续时长 s */
    slowDur: 7,
    /** 暂停冻结时长 s */
    pauseDur: 3,
    /** 加时秒数 */
    addTime: 10,
    /** 单关时间上限（连吃加时也不会超过这个数） */
    maxLevelTime: 120,

    /**
     * 大雾：钩到就糊住整个水面。
     * 满浓度也只是「看不清」，不是「看不见」—— 鱼还得能看出个轮廓，
     * 否则这三秒就纯粹是站着等，而不是「因为看不清所以更难瞄」。
     */
    fogDur: 3,
    /** 淡入 / 淡出时长 s */
    fogFadeIn: 0.35,
    fogFadeOut: 0.6,

    /**
     * 断线：鱼线绷断，线要重新长回来。
     * 断的瞬间线和钩子一起消失，最后 regrow 秒里从竿尖往下慢慢长回原长。
     */
    breakDur: 3,
    regrow: 0.8,
};

/**
 * 五个道具的刷新权重。
 *
 * 负面合计 38%（原来是 22%）：一关刷 7 个左右，负面大约 2~3 只 ——
 * 原来一关半才撞上一次，玩家基本记不住负面的存在，等于白做。
 * 再往上（过半）就开始「不敢出钩」了，那是另一个极端。
 *
 * 另外 `Props.spawn()` 还有一道保险：连续刷出两个增益之后，第三个强制是负面，
 * 免得运气差的一关全程只有徽章（纯概率下 60 秒里一只负面都不出的情况并不罕见）。
 */
export const PROP_WEIGHT: Record<PropKind, number> = {
    slow: 26,
    pause: 12,
    time: 24,
    fog: 21,
    break: 17,
};

/**
 * 负面道具的「生物形态」。
 *
 * 增益道具是漂在水里的圆徽章，负面道具则是**活物**：从屏幕外游进来，横穿鱼塘。
 * 这样水里就有两套视觉语言 —— 徽章是死物（可以放心捞），生物是活物（要绕开）。
 *
 * 为什么要做成鱼：静止的徽章一眼就能躲，活物会在鱼群里穿来穿去，
 * 你瞄的那条鱼背后正好游过一只章鱼，这一钩就有风险了 —— 风险才和收益对上。
 *
 * 头顶挂一小块警示标，是为了不把玩家变成赌徒：仔细看能认出来，忙起来会看漏。
 * 完全伪装成普通鱼看起来刺激，实际会让玩家觉得「被耍了」而不是「我手滑了」。
 */
export type BeastKind = 'fog' | 'break';

export const BEAST: Record<BeastKind, {
    /** resources/images/fish/<image> */
    image: string;
    /** 显示宽度 */
    size: number;
    /** 游速 px/s。章鱼慢吞吞、剑鱼窜得快 */
    speed: number;
    /**
     * 收线速度 px/s。两只都比徽章沉 —— 钩到坏东西本来就要多花点时间拖上来，
     * 剑鱼还会挣（贴着钩爪甩尾），所以它是最难拉的那一只。
     */
    reel: number;
    /**
     * 头顶警示标的 y（占显示高度的比例，相对节点中心，向上为正）。
     * 512 方图里上下留白不一样：章鱼顶部空 11%，剑鱼空 18%，
     * 统一取 0.5 会让牌子要么压进头顶、要么悬在半空，所以逐个配。
     */
    warnY: number;
}> = {
    // 尺寸按「贴图整幅」算，512 方图里上下有留白，内容实际只占 8 成左右。
    // 所以这两个数要比看着的大一圈：它得在鱼群里一眼跳出来，不能和河豚混在一起。
    //
    // 速度要保证「能自己游出屏幕」：最宽的 19.5:9 屏可见宽度约 1560，
    // 章鱼 (1560+112)/62 ≈ 27s、剑鱼 (1560+140)/105 ≈ 16s，都在兜底寿命以内。
    // 之前给 30 是想「慢吞吞」，结果横穿一屏要 46s，会在画面中间凭空消失。
    fog: { image: 'octopus', size: 112, speed: 62, reel: 106, warnY: 0.58 },
    break: { image: 'swordfish', size: 140, speed: 105, reel: 87, warnY: 0.38 },
};

/**
 * 负面生物的游动深度区间。
 *
 * 比徽章道具的 [500, 620] 略宽：活物本来就在水里乱窜，锁死在深水区反而不像鱼。
 * 但也不会放到水面（236）以上 —— 那会撞到公主和鱼竿；上界卡在 610，
 * 免得它半个身子游进海床的沙子里。
 */
export const BEAST_Y: [number, number] = [444, 610];

/**
 * 生物形态的存活上限 s。
 *
 * 正常情况下它游出屏幕就没了，这个只是兜底。必须大于「最慢那只横穿最宽屏」的耗时，
 * 否则会看见它游到画面中间突然消失 —— 现在章鱼在 1560 宽的屏上要 27 秒，留一点余量。
 */
export const BEAST_LIFE = 34;

/**
 * 出生深度区间与刷新权重。
 * 越深越贵的鱼权重越低，形成「高风险高回报」的分布。
 */
export const ZONE: Record<string, { y: [number, number]; weight: number }> = {
    // 浅水区四个往下让了 45px：钩子静止在 y≈325，鱼太靠岸会被一出钩就撞上。
    // 深水区（河豚往下）保持原样 —— 海床没动，它们的位置本来就不受水位影响，
    // 一起往下压反而会让鲨鱼半个身子陷进沙子里。
    clownfish: { y: [386, 466], weight: 20 },
    goldfish: { y: [400, 492], weight: 17 },
    blue_tang: { y: [384, 460], weight: 17 },
    pufferfish: { y: [375, 510], weight: 13 },
    angelfish: { y: [395, 540], weight: 12 },
    golden_koi: { y: [445, 595], weight: 9 },
    ray: { y: [500, 620], weight: 6 },
    shark: { y: [520, 625], weight: 5 },
};

/** 顶部捕鱼角色（公主）。rodTip 是鱼竿尖在 512 画布内的归一化坐标 */
export interface PrincessDef {
    name: string;
    image: string;
    rodTip: [number, number];
}

export type PrincessTable = Record<string, PrincessDef>;

/** 公主素材：512 画布，角色（含鱼竿）占 470px 高，上边距 21px */
export const PRINCESS_SPRITE = 512;
export const PRINCESS_CONTENT_H = 470;
export const PRINCESS_PAD_TOP = 21;

/** 设计坐标（左上原点）→ 节点坐标（Canvas 中心原点） */
export function px(x: number): number {
    return x - DESIGN.w / 2;
}

export function py(y: number): number {
    return DESIGN.h / 2 - y;
}
