import { Node, Graphics, UITransform, Color } from 'cc';
import { DESIGN, TUNE, VIEW } from './GameConfig';
import { PAL, scaled, mixC, lightAt, phaseOf, rectD, roundRectD, circleD, ellipseD, moveToD, lineToD, quadToD } from './DayNight';

/**
 * 场景装饰：木栈道栏杆、灯笼柱、栈道甲板。
 *
 * 分成两层：
 *  - back：栏杆，画在角色身后
 *  - front：甲板 + 板缝 + 前缘厚度，画在鱼之后（压住水面）
 *  - lantern：灯笼柱，单独一层（位置在栏杆之上、鱼之前；鱼永远在水线以下，不会撞上）
 *
 * 横向一律按 `VIEW`（可见区域）铺：工程是 FIXED_HEIGHT 适配，
 * 宽屏上比 1280 宽，只画 0~1280 的话栏杆和甲板会在两侧断掉。
 *
 * 原来这里还有挂满天空的灯笼串和左右上角的樱花枝。按新的视觉方案（湖边木栈道）
 * 全部去掉了：灯笼串横在公主头顶、樱花枝正压在 HUD 卡片后面，
 * 既挡视线又抢注意力。暖光改成从栈道两侧的灯笼柱上打，位置更低、更像岸边。
 */
export class Scenery {
    readonly back: Node;
    readonly front: Node;
    private backG: Graphics;
    private frontG: Graphics;
    /** 灯笼层。GameRoot 需要拿它调整层级顺序 */
    readonly lanternNode: Node;
    private lanternG: Graphics;

    private acc = 0;
    private lastLight = -1;

    constructor(parent: Node) {
        this.back = new Node('SceneryBack');
        this.back.layer = parent.layer;
        this.back.addComponent(UITransform).setContentSize(DESIGN.w, DESIGN.h);
        this.back.setParent(parent);
        this.backG = this.back.addComponent(Graphics);

        // 灯笼柱：节点放在画布中心，直接用设计坐标画
        this.lanternNode = new Node('Lanterns');
        this.lanternNode.layer = parent.layer;
        this.lanternNode.addComponent(UITransform).setContentSize(DESIGN.w, DESIGN.h);
        this.lanternNode.setParent(parent);
        this.lanternG = this.lanternNode.addComponent(Graphics);

        this.front = new Node('Quay');
        this.front.layer = parent.layer;
        this.front.addComponent(UITransform).setContentSize(DESIGN.w, DESIGN.h);
        this.front.setParent(parent);
        this.frontG = this.front.addComponent(Graphics);

        this.redraw(0);
    }

    update(dt: number, clock: number): void {
        this.acc += dt;
        if (this.acc < 0.1) {
            return;
        }
        this.acc = 0;
        const light = lightAt(phaseOf(clock));
        if (Math.abs(light - this.lastLight) < 0.004 && this.lastLight >= 0) {
            return;
        }
        this.redraw(light);
    }

    private redraw(light: number): void {
        this.lastLight = light;
        this.drawBack(light);
        this.drawLanterns(light);
        this.drawQuay(light);
    }

    // ================= 栏杆 =================

    private drawBack(light: number): void {
        const g = this.backG;
        const k = 0.34 + 0.66 * light;
        const x0 = VIEW.left;
        const x1 = VIEW.right;
        g.clear();

        // 一律由水线反推：甲板顶面后沿比水面高 32px，栏杆就站在那条线上 ——
        // 这样调 TUNE.waterTop 时水线、甲板、公主的站脚位置会一起走，
        // 不会出现「水位降了、栏杆还留在原地悬在半空」。
        const deckTop = TUNE.waterTop - 32;
        const railTop = deckTop - 34;
        const railBot = deckTop - 8;
        const postCap = railTop - 4;

        // 这条栏杆是**远处**的岸边栏杆，不是近处的平台 —— 它要和码头拉开一段距离感。
        // 做法是把木色往湖水的青灰里混 30%（空气透视）：颜色一退，
        // 视觉上就落到后面去了。原先它和码头用同一套木色，
        // 两条横向木带叠在一起，整块上方糊成一片「木墙」，码头就显不出来。
        const far = (c: number[]) => scaled(mixC(c, [104, 168, 178], 0.3), k);

        // 立柱（细密的小栏板，比原来 148px 一根的大柱子更像木栈道）
        for (let x = x0 + 24; x < x1 - 10; x += 44) {
            g.fillColor = far(PAL.woodLight);
            rectD(g, x - 2, railBot, 4, deckTop - railBot);
            g.fill();
        }

        // 下横栏（一路压到甲板顶面：栏底和码头之间留一条缝的话，
        // 缝里会漏出湖水，成了一条横贯画面的青色细线）
        g.fillColor = far(PAL.wood);
        rectD(g, x0 - 6, railBot - 3, x1 - x0 + 12, deckTop - railBot + 3);
        g.fill();

        // 上横栏（厚一点，压顶上高光）
        g.fillColor = far(PAL.wood);
        rectD(g, x0 - 6, railTop, x1 - x0 + 12, 10);
        g.fill();
        g.fillColor = far(PAL.woodLight);
        rectD(g, x0 - 6, postCap, x1 - x0 + 12, 3.5);
        g.fill();
        g.fillColor = new Color(255, 238, 208, Math.round(90 * k));
        rectD(g, x0, postCap + 0.5, x1 - x0, 1.4);
        g.fill();

        // 每 264px 一根方形大柱，带柱头，给整条栏杆一个节奏。
        // 间距从 176 放到 264、宽度从 14 收到 11：码头前面已经有系缆桩了，
        // 这里的柱子再密就跟它抢节奏
        for (let x = x0 + 110; x < x1; x += 264) {
            g.fillColor = far(PAL.woodDark);
            rectD(g, x - 5.5, railTop - 10, 11, deckTop - railTop + 10);
            g.fill();
            g.fillColor = far(PAL.woodLight);
            rectD(g, x - 8, railTop - 14, 16, 5);
            g.fill();
        }
    }

    // ================= 灯笼柱 =================

    private drawLanterns(light: number): void {
        const g = this.lanternG;
        g.clear();
        const k = 0.34 + 0.66 * light;
        const deckTop = TUNE.waterTop - 32;

        // 贴可见区域两侧 —— 中间要留给公主，不能有东西挡她的裙子。
        // 窄屏（4:3 平板可见宽只有 960）右侧那根会怼到她的鱼竿旁边，直接不画，
        // 右边空出来的位置本来就是城堡，不缺东西压场。
        const xs: number[] = [VIEW.left + 262];
        if (VIEW.right - 400 > TUNE.princessCx + 160) {
            xs.push(VIEW.right - 400);
        }
        for (const x of xs) {
            const top = deckTop - 96;

            // 柱子
            g.fillColor = scaled(PAL.woodDark, k);
            rectD(g, x - 7, top, 14, deckTop - top);
            g.fill();
            g.fillColor = scaled(PAL.woodLight, k);
            rectD(g, x - 7, top, 4, deckTop - top);
            g.fill();
            // 底座
            g.fillColor = scaled(PAL.wood, k);
            rectD(g, x - 14, deckTop - 10, 28, 10);
            g.fill();
            // 顶盖
            g.fillColor = scaled(PAL.woodDark, k);
            rectD(g, x - 16, top - 6, 32, 6);
            g.fill();
            // 挑臂
            g.fillColor = scaled(PAL.woodDark, k);
            rectD(g, x - 30, top + 2, 30, 5);
            g.fill();

            // 灯笼挂在挑臂末端
            const lx = x - 26;
            const cy = top + 34;
            const glow = 0.35 + 0.65 * (1 - light);
            g.fillColor = new Color(255, 214, 150, Math.round(24 * glow));
            circleD(g, lx, cy, 42);
            g.fill();
            g.fillColor = new Color(255, 214, 150, Math.round(34 * glow));
            circleD(g, lx, cy, 26);
            g.fill();

            // 吊绳
            g.strokeColor = new Color(90, 68, 48, 190);
            g.lineWidth = 1.6;
            moveToD(g, lx, top + 4);
            lineToD(g, lx, cy + 15);
            g.stroke();

            // 灯身
            g.fillColor = new Color(255, 226, 176, 255);
            ellipseD(g, lx, cy, 15, 19);
            g.fill();
            g.fillColor = new Color(232, 167, 101, 120);
            ellipseD(g, lx - 7, cy, 7, 19);
            g.fill();
            ellipseD(g, lx + 7, cy, 7, 19);
            g.fill();

            // 上下箍
            g.fillColor = new Color(138, 95, 58, 255);
            roundRectD(g, lx - 8, cy - 21, 16, 5, 2.5);
            g.fill();
            roundRectD(g, lx - 8, cy + 16, 16, 5, 2.5);
            g.fill();

            // 流苏
            g.strokeColor = new Color(180, 90, 70, 190);
            g.lineWidth = 1.8;
            moveToD(g, lx, cy + 21);
            lineToD(g, lx, cy + 30);
            g.stroke();
        }
    }

    // ================= 甲板（公主站的平台） =================

    /**
     * 码头。参考图里那块平台之所以「像平台」、不像「一条木边」，靠的是三件事：
     *
     *  ① **面积**：顶面 38px 深（原来整块平台才 22px），是「能站人的一片地」，
     *     而不是「一条挡水的木边」。俯视的平面比侧面的厚度更能读出「平台」。
     *  ② **木板结构**：四块横板、每块单独上色、板缝和板端错开，板面再加细木纹；
     *     前沿收一条深色薄立面 + 水里的一圈投影。整片纯色永远读不出木头。
     *  ③ **配景**：木桶、绳圈、系缆桩 —— 有东西放在上面、有绳子拴着，
     *     它才是「被人用的平台」，否则就是一块挡板。
     *
     * 纵向三条线全部由 `TUNE.waterTop` 反推（理由同栏杆）：
     *   backY = 204  顶面后沿（栏杆就站在这条线上）
     *   edgeY = 242  顶面前沿 = 立面上沿 —— **就是公主的脚线 `TUNE.feetY`**
     *   botY  = 252  立面下沿（压在水面上）
     *
     * `edgeY` 必须压在脚线上：立绘的内容底边就落在 `feetY`，平台前沿一高过她，
     * 脚就变成「悬在立面上」；一低过她，脚又落到水里。两条线对齐，
     * 她才真的站在平台上，而不是站在平台前面。
     *
     * `botY` 不能再往下：钩子摆到两端时钩尖抬到 y≈259，再深就露出水面了。
     */
    private drawQuay(light: number): void {
        const g = this.frontG;
        const k = 0.34 + 0.66 * light;
        const x0 = VIEW.left;
        const x1 = VIEW.right;
        const w = x1 - x0;
        const backY = TUNE.waterTop - 32;
        const edgeY = TUNE.waterTop + 6;
        const botY = TUNE.waterTop + 16;
        g.clear();

        // ---------- 1. 顶面：四块横板 ----------
        // 色阶写死，不用插值：插出来的四档几乎一样亮，板缝就白画了
        // （第一版就是这样，整片看着还是一块板）。
        const rows = 4;
        const rh = (edgeY - backY) / rows;
        const tones: number[][] = [[196, 148, 102], [203, 155, 109], [210, 162, 116], [217, 169, 123]];
        for (let i = 0; i < rows; i++) {
            g.fillColor = scaled(tones[i], k);
            rectD(g, x0 - 2, backY + rh * i, w + 4, rh + 0.7);
            g.fill();
        }
        // 横缝：深缝 + 缝下一条浅色反光。只画一条 1px 深线是不够的 ——
        // 在一片浅色木板上，远看就是一根划痕，缝根本读不出来；
        // 加了反光才有「两块板拼起来、中间凹下去」的凹凸感。
        for (let i = 1; i < rows; i++) {
            const y = backY + rh * i;
            g.strokeColor = new Color(74, 46, 24, Math.round(186 * k));
            g.lineWidth = 2;
            moveToD(g, x0 - 2, y);
            lineToD(g, x1 + 2, y);
            g.stroke();
            g.strokeColor = new Color(255, 246, 222, Math.round(88 * k));
            g.lineWidth = 1.3;
            moveToD(g, x0 - 2, y + 1.8);
            lineToD(g, x1 + 2, y + 1.8);
            g.stroke();
        }
        // 板端竖缝：每行错开一个偏移量，三行对齐会变成格子布
        for (let i = 0; i < rows; i++) {
            const y = backY + rh * i;
            g.strokeColor = new Color(96, 62, 36, Math.round(104 * k));
            g.lineWidth = 1.2;
            for (let x = x0 + 60 + i * 97; x < x1 + 2; x += 232) {
                moveToD(g, x, y + 1);
                lineToD(g, x, y + rh - 1);
                g.stroke();
            }
        }
        // 木纹：每块板三条浅色顺纹。压到 alpha 14、长度 30~60 ——
        // 第一版给到 26 又铺了 7 条，整条板看起来像被刮花了
        for (let i = 0; i < rows; i++) {
            const y = backY + rh * (i + 0.5);
            for (let j = 0; j < 3; j++) {
                const gx = x0 + 40 + ((i * 431 + j * 397) % Math.max(60, w - 80));
                const len = 30 + (j % 3) * 15;
                const dy = (j - 1) * 1.5;
                g.strokeColor = new Color(255, 246, 220, Math.round(14 * k));
                g.lineWidth = 1;
                moveToD(g, gx, y + dy);
                lineToD(g, gx + len, y + dy);
                g.stroke();
            }
        }

        // 节疤：四个小而扁的深色椭圆。只在大面积平面上加，撒太多就成了霉点
        for (let i = 0; i < 4; i++) {
            const kx = x0 + 150 + ((i * 389 + 71) % Math.max(120, w - 260));
            const ky = backY + 6 + (i % 3) * 9.5;
            g.fillColor = new Color(120, 84, 52, Math.round(96 * k));
            ellipseD(g, kx, ky, 5.5, 2.2);
            g.fill();
            g.fillColor = new Color(120, 84, 52, Math.round(52 * k));
            ellipseD(g, kx, ky, 8.5, 3.4);
            g.fill();
        }

        // 栏杆投在平台上的影子：一条从后沿往前衰减的暗带。
        // 这块平面之所以能读成「朝上的地」，靠的就是投影 ——
        // 没有投影，它只是一条横向色带，永远不像一个平面。
        // 只铺 7px：再长就会把后面两块板的色阶一起吃掉，
        // 四块板会糊成「一条暗带 + 一条亮带」，板缝白画
        for (let i = 0; i < 3; i++) {
            g.fillColor = new Color(118, 82, 50, Math.round((34 - i * 11) * k));
            rectD(g, x0 - 2, backY + i * 2.4, w + 4, 2.6);
            g.fill();
        }

        // ---------- 2. 前沿那道棱 ----------
        // 顶面转到立面的棱受光最足。少了这条亮边，顶面和立面会糊成一坨，
        // 「厚度」就没了 —— 这是整块平台最重要的一条线。
        g.fillColor = scaled([238, 204, 162], k);
        rectD(g, x0 - 2, edgeY - 2.8, w + 4, 2.8);
        g.fill();
        g.fillColor = new Color(255, 250, 232, Math.round(120 * k));
        rectD(g, x0 - 2, edgeY - 1.1, w + 4, 1.1);
        g.fill();

        // ---------- 3. 立面：一条 10px 的厚边 ----------
        // 立面只留 10px：它的作用是「板子有厚度」，不是主角。
        // 早先给到 22px 的时候，公主的脚会落在立面中间，看着像悬在半空 ——
        // 顶面够深才读得出「平台」，立面只是把边缘收厚一点。
        const faceH = botY - edgeY;
        g.fillColor = scaled([183, 139, 98], k);
        rectD(g, x0 - 2, edgeY, w + 4, faceH * 0.55);
        g.fill();
        g.fillColor = scaled([140, 100, 66], k);
        rectD(g, x0 - 2, edgeY + faceH * 0.55, w + 4, faceH * 0.45);
        g.fill();
        // 板端竖缝：立面只有 10px 高，一条条细竖线横向排开，
        // 读作「一排木板的上端面」；没有这几条线，它就是一条纯色厚边
        for (let x = x0 + 18; x < x1 + 2; x += 46) {
            g.strokeColor = new Color(86, 56, 32, Math.round(70 * k));
            g.lineWidth = 1.1;
            moveToD(g, x, edgeY + 1);
            lineToD(g, x, botY - 2);
            g.stroke();
        }
        // 最底 2px 再压一档：板和水的接触面永远是最暗的一线
        g.fillColor = new Color(58, 38, 24, Math.round(170 * k));
        rectD(g, x0 - 2, botY - 2, w + 4, 2);
        g.fill();

        // ---------- 4. 水里的投影 ----------
        // 平台悬在水上，正下方那一段水会暗一圈。没有这层，木板就是直接「切」在水里，
        // 原来只能靠一条白色泡沫硬过渡。
        g.fillColor = new Color(10, 52, 74, Math.round(54 * k));
        rectD(g, x0 - 2, botY, w + 4, 8);
        g.fill();
        g.fillColor = new Color(10, 52, 74, Math.round(24 * k));
        rectD(g, x0 - 2, botY + 8, w + 4, 9);
        g.fill();

        // 接触水面的白边 + 几朵小浪花
        const foam = 0.4 + 0.6 * light;
        g.fillColor = new Color(255, 255, 255, Math.round(130 * foam));
        ellipseD(g, (x0 + x1) / 2, botY + 1, w / 2 + 12, 3.4);
        g.fill();
        for (let i = 0; i < 7; i++) {
            const fx = x0 + 90 + ((i * 263) % Math.max(80, w - 140));
            g.fillColor = new Color(255, 255, 255, Math.round(96 * foam));
            ellipseD(g, fx, botY + 4, 16 + (i % 3) * 7, 2.4);
            g.fill();
        }

        // ---------- 5. 系缆桩 + 麻绳 ----------
        this.drawBollards(g, k, x0, x1, edgeY);

        // ---------- 6. 平台上的物件 ----------
        const cx = TUNE.princessCx;
        // 物件先在平面上留个投影，否则它们像贴纸浮在木板上
        g.fillColor = new Color(116, 80, 48, Math.round(52 * k));
        ellipseD(g, cx - 250, edgeY - 5, 19, 4.6);
        g.fill();
        ellipseD(g, cx + 252, edgeY - 7, 29, 6.6);
        g.fill();
        this.drawBucket(g, cx - 250, edgeY - 6, k);
        this.drawCoil(g, cx + 252, edgeY - 8, k);
    }

    /**
     * 系缆桩：前沿一排矮桩，桩与桩之间垂一段麻绳。
     *
     * 参考图里最有辨识度的就是这排桩和绳子 —— 一条光溜溜的木板带，
     * 加上它们才立刻读成「码头」。桩只有 21px 高，进不到公主腰以上；
     * 绳子画在 `front` 层、也就是公主**身后**，从她裙摆后面穿过去。
     */
    private drawBollards(g: Graphics, k: number, x0: number, x1: number, edgeY: number): void {
        const top = edgeY - 24;
        const xs: number[] = [];
        for (let x = x0 + 96; x < x1 - 30; x += 218) {
            // 公主站立的位置留空：桩子从裙子里穿出来会很怪
            if (Math.abs(x - TUNE.princessCx) < 122) {
                continue;
            }
            xs.push(x);
        }
        // 绳先画：桩要压在绳上面。
        // 绳子下面垫一道深色影子，否则 4px 的浅色绳贴在 22px 的浅色板面上
        // 根本看不出来 —— 第一版就是这样，整排桩看着像「一根细铁丝」。
        for (let i = 0; i + 1 < xs.length; i++) {
            const a = xs[i];
            const b = xs[i + 1];
            const mx = (a + b) / 2;
            g.strokeColor = new Color(78, 52, 30, Math.round(70 * k));
            g.lineWidth = 5;
            moveToD(g, a, top + 6.5);
            quadToD(g, mx, top + 17.5, b, top + 6.5);
            g.stroke();
            g.strokeColor = scaled(PAL.rope, k);
            g.lineWidth = 4;
            moveToD(g, a, top + 5);
            quadToD(g, mx, top + 16, b, top + 5);
            g.stroke();
        }
        for (const x of xs) {
            // 桩身：深木色 + 左侧一条受光亮边
            g.fillColor = scaled([168, 122, 82], k);
            rectD(g, x - 6, top, 12, edgeY - top);
            g.fill();
            g.fillColor = scaled([204, 158, 112], k);
            rectD(g, x - 6, top, 4, edgeY - top);
            g.fill();
            // 桩头盖
            g.fillColor = scaled([126, 88, 58], k);
            rectD(g, x - 8, top - 3.4, 16, 4);
            g.fill();
            // 绕在桩上的绳：两圈，斜着缠
            g.strokeColor = scaled(PAL.rope, k);
            g.lineWidth = 2.6;
            moveToD(g, x - 6.6, top + 5);
            lineToD(g, x + 6.6, top + 9);
            g.stroke();
            moveToD(g, x - 6.6, top + 9.5);
            lineToD(g, x + 6.6, top + 13.5);
            g.stroke();
        }
    }

    /** 木桶：梯形桶身 + 两道铁箍 + 暗色桶口 + 提手 */
    private drawBucket(g: Graphics, x: number, baseY: number, k: number): void {
        const h = 30;
        const tw = 16;
        const bw = 12;
        const top = baseY - h;
        // 桶身
        g.fillColor = scaled(PAL.wood, k);
        moveToD(g, x - tw, top);
        lineToD(g, x + tw, top);
        lineToD(g, x + bw, baseY);
        lineToD(g, x - bw, baseY);
        g.close();
        g.fill();
        // 右半边压暗（光从左上来）
        g.fillColor = scaled(PAL.woodDark, k);
        moveToD(g, x + 3, top);
        lineToD(g, x + tw, top);
        lineToD(g, x + bw, baseY);
        lineToD(g, x + 3, baseY);
        g.close();
        g.fill();
        // 桶口：外沿亮、内壁暗，一眼看出是个空桶
        g.fillColor = scaled(PAL.woodLight, k);
        ellipseD(g, x, top, tw, 4.6);
        g.fill();
        g.fillColor = new Color(Math.round(92 * k), Math.round(58 * k), Math.round(36 * k), 245);
        ellipseD(g, x, top + 0.6, tw - 3.5, 3.1);
        g.fill();
        // 两道箍：用暖褐色而不是冷铁灰 —— 冷灰压在浅木色上像贴了两条胶带
        for (const t of [0.36, 0.74]) {
            const yy = top + h * t;
            const halfW = tw + (bw - tw) * t;
            g.fillColor = new Color(Math.round(112 * k), Math.round(80 * k), Math.round(54 * k), 245);
            rectD(g, x - halfW, yy, halfW * 2, 3);
            g.fill();
        }
        // 提手：细一点、比桶身深一档，别抢桶口的注意力
        g.strokeColor = new Color(Math.round(104 * k), Math.round(76 * k), Math.round(52 * k), 225);
        g.lineWidth = 2;
        moveToD(g, x - tw + 2, top - 1);
        quadToD(g, x, top - 15, x + tw - 2, top - 1);
        g.stroke();
    }

    /** 绳圈：三圈扁椭圆盘起来，加一小截甩出去的绳头 */
    private drawCoil(g: Graphics, x: number, baseY: number, k: number): void {
        const cy = baseY - 6;
        // 底下垫一层深色，绳圈才从板面上「浮」起来
        g.fillColor = new Color(92, 62, 36, Math.round(60 * k));
        ellipseD(g, x + 2, cy + 3, 30, 11);
        g.fill();
        // 三圈明暗交替：同一档颜色叠三圈，远看就是一个平面的米色圆盘，
        // 交替之后才看得出「一圈压着一圈」
        for (let i = 3; i >= 1; i--) {
            g.strokeColor = i === 2
                ? new Color(Math.round(178 * k), Math.round(146 * k), Math.round(104 * k), 252)
                : scaled(PAL.rope, k);
            g.lineWidth = 6;
            ellipseD(g, x + (i - 2) * 2.5, cy - (i - 1) * 2.2, 6 + i * 7.4, 2.6 + i * 2.6);
            g.stroke();
        }
        // 绳头
        g.strokeColor = scaled(PAL.rope, k);
        g.lineWidth = 4.6;
        moveToD(g, x + 16, cy + 9);
        quadToD(g, x + 34, cy + 14, x + 26, cy + 19);
        g.stroke();
    }
}
