import { Color, Graphics } from 'cc';
import { DESIGN } from './GameConfig';

/**
 * 昼夜循环与配色。
 * 与 web-preview/game.js 的 PAL / lightAt / warmAt 保持一致，
 * 改配色时两边要同步（网页版只作参考，正式维护以本文件为准）。
 */

/** 一整天多少秒，跨关卡连续 */
export const DAY_LEN = 90;

/** 调色板，统一用 [r,g,b] 数组，方便做插值 */
export const PAL = {
    ink: [47, 59, 58],

    skyDay: [205, 224, 230],
    skyDayBot: [246, 236, 218],
    skyNight: [24, 38, 50],
    skyNightBot: [44, 64, 72],

    waterDay: [178, 218, 210],
    waterDayBot: [124, 178, 172],
    waterNight: [28, 60, 64],
    waterNightBot: [16, 40, 46],

    shore: [238, 232, 210],
    wood: [139, 106, 74],
    woodDark: [95, 70, 47],
    woodLight: [169, 133, 95],

    plaque: [248, 241, 222],
    gold: [201, 161, 90],
    blossom: [246, 195, 206],
};

/** [r,g,b] → Color，可带透明度 */
export function col(c: number[], a = 255): Color {
    return new Color(
        Math.round(Math.max(0, Math.min(255, c[0]))),
        Math.round(Math.max(0, Math.min(255, c[1]))),
        Math.round(Math.max(0, Math.min(255, c[2]))),
        a,
    );
}

export function mixC(a: number[], b: number[], t: number): number[] {
    return [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
    ];
}

/** 整体压暗，夜里木构、岸边要跟着暗下去 */
export function scaled(c: number[], k: number): Color {
    return col([c[0] * k, c[1] * k, c[2] * k]);
}

/** 光照强度 0~1，0 是深夜，1 是正午 */
const LIGHT_KEYS: [number, number][] = [
    [0.00, 0.26], [0.06, 0.60], [0.15, 1.00], [0.38, 1.00],
    [0.46, 0.58], [0.53, 0.10], [0.93, 0.10], [0.98, 0.20], [1.00, 0.26],
];

export function lightAt(p: number): number {
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
export function warmAt(p: number): number {
    const d = Math.min(Math.min(p, 1 - p), Math.abs(p - 0.5));
    return Math.max(0, 1 - d / 0.075);
}

export function phaseOf(clock: number): number {
    return (clock / DAY_LEN) % 1;
}

// ===== 绘图小工具（设计坐标：左上原点，y 向下）=====

/** 设计坐标矩形 → Graphics 局部坐标 */
export function rectD(g: Graphics, x: number, y: number, w: number, h: number): void {
    g.rect(x - DESIGN.w / 2, DESIGN.h / 2 - y - h, w, h);
}

export function roundRectD(g: Graphics, x: number, y: number, w: number, h: number, r: number): void {
    g.roundRect(x - DESIGN.w / 2, DESIGN.h / 2 - y - h, w, h, r);
}

export function circleD(g: Graphics, x: number, y: number, r: number): void {
    g.circle(x - DESIGN.w / 2, DESIGN.h / 2 - y, r);
}

export function ellipseD(g: Graphics, x: number, y: number, rx: number, ry: number): void {
    g.ellipse(x - DESIGN.w / 2, DESIGN.h / 2 - y, rx, ry);
}

export function moveToD(g: Graphics, x: number, y: number): void {
    g.moveTo(x - DESIGN.w / 2, DESIGN.h / 2 - y);
}

export function lineToD(g: Graphics, x: number, y: number): void {
    g.lineTo(x - DESIGN.w / 2, DESIGN.h / 2 - y);
}

export function quadToD(g: Graphics, cx: number, cy: number, x: number, y: number): void {
    g.quadraticCurveTo(cx - DESIGN.w / 2, DESIGN.h / 2 - cy, x - DESIGN.w / 2, DESIGN.h / 2 - y);
}
