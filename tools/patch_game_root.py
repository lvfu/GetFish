import io

p = r"game/assets/scripts/GameRoot.ts"
s = io.open(p, encoding="utf-8").read()
orig = s

s = s.replace(
    "import { TUNE, ZONE, FishDef, FishTable, px, py, DESIGN } from './GameConfig';\nimport { Fish } from './Fish';\nimport { Hook } from './Hook';",
    "import { TUNE, ZONE, FishDef, FishTable, PrincessDef, PrincessTable, px, py, DESIGN } from './GameConfig';\nimport { Fish } from './Fish';\nimport { Hook } from './Hook';\nimport { Princess } from './Princess';")

s = s.replace(
    "    private fishLayer!: Node;\n    private hook!: Hook;",
    "    private fishLayer!: Node;\n    private hook!: Hook;\n    private princess!: Princess;")

s = s.replace(
    "    private table: FishTable = {};\n    private frames: { [k: string]: SpriteFrame } = {};\n    private fishes: Fish[] = [];",
    "    private table: FishTable = {};\n    private frames: { [k: string]: SpriteFrame } = {};\n    private fishes: Fish[] = [];\n\n"
    "    private pTable: PrincessTable = {};\n    private pFrames: { [k: string]: SpriteFrame } = {};\n"
    "    private pKeys: string[] = [];\n    private pIndex = 0;")

s = s.replace(
    "        this.fishLayer = this.makeNode('FishLayer', canvas);\n\n        const hookLayer = this.makeNode('HookLayer', canvas);\n        this.hook = new Hook(hookLayer);",
    "        this.fishLayer = this.makeNode('FishLayer', canvas);\n\n"
    "        // 公主站在鱼群之后、鱼线之前\n"
    "        const princessLayer = this.makeNode('PrincessLayer', canvas);\n"
    "        this.princess = new Princess(princessLayer);\n\n"
    "        const hookLayer = this.makeNode('HookLayer', canvas);\n        this.hook = new Hook(hookLayer);")

old_load = """    private loadFrames(): void {
        const names = Object.keys(this.table);
        let left = names.length;
        const done = () => {
            left--;
            if (left <= 0) {
                this.mode = 'ready';
                this.showOverlay('黄金鱼钩', [
                    '点击 / 空格 出钩，钩住游动的鱼',
                    '越深越大的鱼价值越高，收线也越慢',
                    '限时 60 秒，达标进入下一关',
                ].join('\\n'), '点击任意位置开始');
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
    }"""

new_load = """    private loadFrames(): void {
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
                } else {
                    this.frames[key] = sf;
                }
                done();
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
                        this.applyPrincess(0);
                        this.readyToPlay();
                    }
                });
            }
        });
    }

    private readyToPlay(): void {
        this.mode = 'ready';
        this.showOverlay('黄金鱼钩', [
            '点击 / 空格 出钩，钩住游动的鱼',
            '越深越大的鱼价值越高，收线也越慢',
            '数字键 1-8 可以给公主换装',
            '限时 60 秒，达标进入下一关',
        ].join('\\n'), '点击任意位置开始');
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
    }"""

assert old_load in s, "loadFrames block not found"
s = s.replace(old_load, new_load)

old_key = """    private onKey(e: EventKeyboard): void {
        if (e.keyCode === KeyCode.SPACE || e.keyCode === KeyCode.ENTER) {
            this.action();
        }
    }"""
new_key = """    private onKey(e: EventKeyboard): void {
        if (e.keyCode === KeyCode.SPACE || e.keyCode === KeyCode.ENTER) {
            this.action();
            return;
        }
        // 数字键 1-8 换装
        if (e.keyCode >= KeyCode.DIGIT_1 && e.keyCode <= KeyCode.DIGIT_8) {
            this.applyPrincess(e.keyCode - KeyCode.DIGIT_1);
        }
    }"""
assert old_key in s, "onKey block not found"
s = s.replace(old_key, new_key)

io.open(p, "w", encoding="utf-8").write(s)
print("GameRoot patched, changed:", s != orig)
