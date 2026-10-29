import { Color } from 'cc';
import { DESIGN } from './GameConfig.js';
/**
 * 昼夜循环与配色。
 * 与 web-preview/game.js 的 PAL / lightAt / warmAt 保持一致，
 * 改配色时两边要同步（网页版只作参考，正式维护以本文件为准）。
 */
/** 一整天多少秒，跨关卡连续 */
export const DAY_LEN = 90;
/**
 * 调色板，统一用 [r,g,b] 数组，方便做插值。
 *
 * 整套颜色按「明亮治愈 · 阳光水族箱」重定过一次：
 * 原来天空是灰米色、水体是一整片浅灰绿（像蒙了层雾的阴天池塘），
 * 现在天空是通透的亮蓝、水下从浅青绿一路压到深蓝，
 * 让「水面以上暖、水面以下清透」这条分界一眼就能看出来。
 *
 * 昼夜循环保留：`*Night` 那几组是「夜晚星空」方案（设计稿顶部场景方案 4），
 * 白天（light=1）落在主方案上，夜里过渡到深蓝夜色。
 */
export const PAL = {
    ink: [38, 62, 70],
    // 天空：正午亮蓝 → 近水线的暖白，日出日落再往橙里偏
    skyDay: [122, 200, 238],
    skyDayBot: [228, 246, 250],
    skyNight: [20, 40, 76],
    skyNightBot: [44, 76, 116],
    // 水体首尾色（drawWater 在这两个之间再插两档中间色）
    waterDay: [158, 236, 238],
    waterDayBot: [22, 96, 150],
    waterNight: [30, 78, 112],
    waterNightBot: [10, 34, 66],
    // 岸边沙滩 / 木栈道
    // 木头分了四档而不是三档：码头顶面（俯视、受光最多）、立面、阴影、麻绳。
    // 原来只有 wood / woodLight / woodDark 三档，顶面和立面共用一档，
    // 画出来是一条颜色几乎一样的色带 —— 看不出「这是一块能站人的厚板」。
    shore: [244, 226, 190],
    wood: [198, 154, 110],
    woodTop: [232, 196, 152],
    woodDark: [138, 96, 62],
    woodLight: [214, 176, 130],
    rope: [212, 182, 138],
    // HUD
    plaque: [255, 255, 255],
    gold: [246, 196, 78],
    card: [255, 255, 255],
    green: [88, 186, 98],
    greenDark: [44, 112, 56],
    greenLight: [206, 238, 208],
    // 水下
    sand: [246, 228, 192],
    sandDark: [216, 190, 148],
    rock: [126, 154, 172],
    rockLight: [168, 194, 206],
    coralPink: [246, 130, 158],
    coralDeep: [212, 92, 128],
    coralOrange: [255, 156, 108],
    coralPurple: [180, 138, 226],
    coralYellow: [248, 202, 110],
    kelp: [58, 166, 120],
    kelpLight: [110, 206, 156],
    blossom: [246, 195, 206],
};
/** [r,g,b] → Color，可带透明度 */
export function col(c, a = 255) {
    return new Color(Math.round(Math.max(0, Math.min(255, c[0]))), Math.round(Math.max(0, Math.min(255, c[1]))), Math.round(Math.max(0, Math.min(255, c[2]))), a);
}
export function mixC(a, b, t) {
    return [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
    ];
}
/** 整体压暗，夜里木构、岸边要跟着暗下去 */
export function scaled(c, k) {
    return col([c[0] * k, c[1] * k, c[2] * k]);
}
/** 光照强度 0~1，0 是深夜，1 是正午 */
const LIGHT_KEYS = [
    [0.00, 0.26], [0.06, 0.60], [0.15, 1.00], [0.38, 1.00],
    [0.46, 0.58], [0.53, 0.10], [0.93, 0.10], [0.98, 0.20], [1.00, 0.26],
];
export function lightAt(p) {
    for (let i = 0; i < LIGHT_KEYS.length - 1; i++) {
        const a = LIGHT_KEYS[i];
        const b = LIGHT_KEYS[i + 1];
        if (p >= a[0] && p <= b[0]) {
            return a[1] + (b[1] - a[1]) * ((p - a[0]) / (b[0] - a[0] || 1));
        }
    }
    return 1;
}
/** 日出日落的暖色权重 */
export function warmAt(p) {
    const d = Math.min(Math.min(p, 1 - p), Math.abs(p - 0.5));
    return Math.max(0, 1 - d / 0.075);
}
export function phaseOf(clock) {
    return (clock / DAY_LEN) % 1;
}
// ===== 绘图小工具（设计坐标：左上原点，y 向下）=====
/** 设计坐标矩形 → Graphics 局部坐标 */
export function rectD(g, x, y, w, h) {
    g.rect(x - DESIGN.w / 2, DESIGN.h / 2 - y - h, w, h);
}
export function roundRectD(g, x, y, w, h, r) {
    g.roundRect(x - DESIGN.w / 2, DESIGN.h / 2 - y - h, w, h, r);
}
export function circleD(g, x, y, r) {
    g.circle(x - DESIGN.w / 2, DESIGN.h / 2 - y, r);
}
export function ellipseD(g, x, y, rx, ry) {
    g.ellipse(x - DESIGN.w / 2, DESIGN.h / 2 - y, rx, ry);
}
export function moveToD(g, x, y) {
    g.moveTo(x - DESIGN.w / 2, DESIGN.h / 2 - y);
}
export function lineToD(g, x, y) {
    g.lineTo(x - DESIGN.w / 2, DESIGN.h / 2 - y);
}
export function quadToD(g, cx, cy, x, y) {
    g.quadraticCurveTo(cx - DESIGN.w / 2, DESIGN.h / 2 - cy, x - DESIGN.w / 2, DESIGN.h / 2 - y);
}
