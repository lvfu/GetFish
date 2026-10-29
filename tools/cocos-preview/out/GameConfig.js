/**
 * 玩法参数与鱼类数据定义。
 * 鱼类数值的唯一来源是 resources/config/fish-config.json，
 * 这里只声明类型与「与美术无关」的玩法调参。
 */
/** 设计分辨率，与 Canvas 的 Design Resolution 保持一致 */
export const DESIGN = { w: 1280, h: 720 };
export const TUNE = {
    /** 摆幅，相对竖直向下。收小到 30°，钩子贴着水面摆、不穿过角色 */
    swingMax: (30 * Math.PI) / 180,
    /** 摆动角速度 rad/s */
    swingOmega: 1.5,
    /** 出钩速度 px/s */
    shootSpeed: 1280,
    /** 最大绳长 */
    maxRope: 960,
    /** 钩子碰撞半径 */
    hookR: 15,
    /** 瞄准态钩子离竿尖的垂距：竿尖约 y=28~49，175 让钩子正好贴在水线（190）附近 */
    idleRope: 175,
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
    /** 水面 y */
    waterTop: 190,
    /** 公主脚踩水线的 y */
    feetY: 196,
    /** 公主显示高度（含鱼竿） */
    princessH: 168,
    /** 公主水平中心 */
    princessCx: 640,
    /** 海床 y */
    floorY: 668,
    /** 开局鱼数 */
    initialFish: 6,
};
/**
 * 出生深度区间与刷新权重。
 * 越深越贵的鱼权重越低，形成「高风险高回报」的分布。
 */
export const ZONE = {
    clownfish: { y: [235, 365], weight: 20 },
    goldfish: { y: [240, 425], weight: 17 },
    blue_tang: { y: [210, 375], weight: 17 },
    pufferfish: { y: [250, 465], weight: 13 },
    angelfish: { y: [270, 505], weight: 12 },
    golden_koi: { y: [340, 590], weight: 9 },
    ray: { y: [465, 630], weight: 6 },
    shark: { y: [505, 650], weight: 5 },
};
/** 公主素材：512 画布，角色（含鱼竿）占 470px 高，上边距 21px */
export const PRINCESS_SPRITE = 512;
export const PRINCESS_CONTENT_H = 470;
export const PRINCESS_PAD_TOP = 21;
/** 设计坐标（左上原点）→ 节点坐标（Canvas 中心原点） */
export function px(x) {
    return x - DESIGN.w / 2;
}
export function py(y) {
    return DESIGN.h / 2 - y;
}
