# 黄金鱼钩 · Cocos Creator 工程

Cocos Creator **3.8.8** + TypeScript，目标平台微信小游戏。

> **这是唯一的正式工程。** `web-preview/` 网页版已停止维护，只留作玩法与手感的对照参考，
> 以后所有改动只改这里。

## 目录

```
game/
├── assets/
│   ├── scenes/main.scene                # 唯一场景：Scene + Canvas + Camera，GameRoot 已挂好
│   ├── resources/
│   │   ├── config/fish-config.json      # 鱼类数值（唯一数据源）
│   │   ├── config/princess-config.json  # 角色 + 鱼竿尖坐标
│   │   ├── images/fish/*.png            # 8 张 512×512 透明鱼类素材
│   │   ├── images/princess/*.png        # 8 张 512×512 透明角色素材
│   │   └── audio/*.mp3                  # BGM + 4 个音效
│   └── scripts/                         # 12 个模块，见下表
├── settings/                            # 工程设置（设计分辨率 1280×720）
├── package.json                          # 工程标识（creator 3.8.8）
├── tsconfig.json                         # 编辑器用
└── tsconfig.check.json                   # 命令行类型检查用（编辑器不读）
```

### 脚本分工

| 文件 | 职责 |
|---|---|
| `GameRoot.ts` | 总入口。挂到 Canvas 上即可跑，按固定顺序搭场景、跑关卡流程、处理输入 |
| `GameConfig.ts` | 类型、`TUNE` 玩法调参、`ZONE` 深度分区、设计坐标 ↔ 节点坐标 |
| `DayNight.ts` | 昼夜时钟、调色板 `PAL`、光照插值、设计坐标绘图工具 `rectD/roundRectD/circleD/...` |
| `Background.ts` | 天空、远山、塔、屋脊、日月星、水体、光柱、海底 + 滚动波纹 |
| `Scenery.ts` | 樱花枝、栏杆、灯笼串、甲板与岸边带 |
| `Bubbles.ts` | 上浮气泡（纯装饰） |
| `Hud.ts` | 米色牌匾 HUD + 卷轴式结算面板 |
| `PrincessPicker.ts` | 左下角 8 格换装条（缩略图裁头部） |
| `Audio.ts` | BGM 循环 + 音效 + 右上角静音按钮 |
| `Fish.ts` | 单条鱼（移动 / 翻转 / 跟随钩子） |
| `Princess.ts` | 顶部捕鱼角色，按竿尖对齐鱼线 |
| `Hook.ts` | 鱼钩（摆动 / 出钩 / 收线 / 捕获判定） |

## 当前状态

工程已具备 `package.json`、`assets/` 全部源码与资源、`tsconfig.json`，
并且**已经带了一个可运行的场景 `assets/scenes/main.scene`**（Scene + Canvas + Camera，GameRoot 已挂好）。

## 导入步骤

1. 打开 Cocos Dashboard → **项目** → **添加** → 选择 `game/` 目录。
2. 点开项目。首次打开会导入资源并生成 `.meta` / `library/`，**等 1~3 分钟**，进度条跑完再操作。
3. 资源管理器里展开 `assets/scenes`，**双击 `main`** 打开场景。
4. 点顶部 ▶ 预览。

就这样，不需要自己建 Canvas、也不需要手动拖脚本。

> **如果第 3 步打开场景后，Canvas 上的组件显示「Missing Script」**
> （说明脚本的 uuid 对不上，比如工程被重新导入过），把它当成一次性操作修一下：
> 层级管理器选中 `Canvas` → 属性检查器里删掉那个 Missing Script →
> 从资源管理器把 `assets/scripts/GameRoot.ts` **直接拖到 Canvas 节点上** → `Ctrl+S` 保存场景。
>
> 以后改了脚本 uuid 也不会再出这个问题。

### 场景里有什么

```
main (Scene)
└── Canvas          ← 带 cc.UITransform / cc.Canvas / cc.Widget / GameRoot
    └── Camera      ← UI 相机（正交，可见层 UI_2D）
```

场景里**不需要**摆任何鱼、鱼钩、灯笼或文字——全部由 `GameRoot` 在运行时构建。
Canvas 的大小、层级、颜色都在 `GameRoot.buildScene()` 里定，改场景文件没用。

### 设计分辨率

项目设置里已写成 **1280 × 720（适配高度）**，
`GameRoot.onLoad()` 里还会再强制一次 `view.setDesignResolutionSize(1280, 720, SHOW_ALL)`，
所以换机器 / 换分辨率都不会跑偏。

### 重新生成场景

`main.scene` 是用脚本从引擎自带的 2D 模板生成的（不是手写 JSON）：

```bash
node tools/make_scene.js
```

它会读 `GameRoot.ts.meta` 里的 uuid，按引擎算法压成 22 字符写进 `__type__`，
并用引擎的解码逻辑反向校验一遍。**如果 GameRoot.ts 的 uuid 变了（比如重新导入过），
重新跑一次这个脚本即可。**

### 音频

`assets/resources/audio/` 下的 5 个 mp3 由 `tools/20_render_audio.py` 离线渲染
（C 大调 8 小节、88 BPM，和网页版同一套乐谱）。导入后 Cocos 会自动识别为 `AudioClip`，
`resources.load('audio/bgm', AudioClip)` 即可读取。

浏览器 / 小游戏要求音频必须在用户手势里启动，所以 BGM 由第一次点击或按键触发
（`GameRoot.pointer()` 与 `onKey()` 里调用 `audio.startBgm()`）。

## 没有编辑器也能看画面

`tools/cocos-preview/` 是一个预览器：用 Canvas 2D 复刻了 Cocos 的
`Graphics / Label / Sprite`，直接跑**真实的游戏脚本**（编译 `game/assets/scripts` 而来），
所以看到的就是 Cocos 侧真实的绘制结果，不需要开编辑器。

```bash
# 1. 编译脚本到预览器
node tools/cocos-preview/build.js

# 2. 起静态服务（工程根目录）
python -m http.server 8125

# 3. 打开 http://127.0.0.1:8125/tools/cocos-preview/index.html
#    或直接批量截图：
node tools/cocos-preview/shot.js
```

截图输出到 `delivery/qa/cocos-*.png`。

注意：预览器只验证**画面**，不验证触摸、音频播放和微信小游戏运行时。
这些必须在编辑器 / 真机上过一遍。

## 已实现

- 鱼钩左右摆动（±70°），点击 / 空格出钩，触底或超长自动收线
- 8 种鱼按深度分区游动，左右翻转、边缘循环、出生避让
- 捕获判定用圆形近似，命中后鱼挂在钩上跟随收回
- 鱼越大收线越慢（`880 - size × 3.4`，下限 300 px/s）
- 8 套角色可切换（数字键 1-8 或点左下头像），鱼线支点自动对齐到各自竿尖
- 计分、倒计时、目标分、过关 / 失败结算、进入下一关
- **新中式淡彩画面**：薄荷绿水面、淡青灰天空、木质栏杆栈道、灯笼串、樱花枝、米色牌匾配墨字
- **昼夜循环**：90 秒一天，跨关连续；天空 / 水体 / 木构颜色整体随光照插值，日月走左右半屏
- **音频**：循环 BGM + 出钩 / 捕获 / 点击 / 过关四个音效，静音状态记在本地
- **换装条 UI**：左下角 8 格缩略图（裁头部），选中态金框
- 压在背景上的文字（关卡名、换装提示）跟着昼夜换色，夜里自动转米白

## 调参位置

| 想改什么 | 改哪里 |
|---|---|
| 摆动速度 / 幅度、出钩速度、关卡时长、目标分 | `GameConfig.ts` 的 `TUNE` |
| 每种鱼的出生深度与刷新权重 | `GameConfig.ts` 的 `ZONE` |
| 鱼的尺寸 / 速度 / 价值 | `resources/config/fish-config.json` |
| 角色显示高度、脚踩水线的位置 | `GameConfig.ts` 的 `princessH` / `feetY` |
| 角色贴图与竿尖坐标 | `resources/config/princess-config.json` |
| 一天多少秒 | `DayNight.ts` 的 `DAY_LEN` |
| 配色 | `DayNight.ts` 的 `PAL` |
| 光照曲线（几点天亮、几点天黑） | `DayNight.ts` 的 `LIGHT_KEYS` |
| BGM / 音效音量 | `Audio.ts` 的 `BGM_VOL` / `SFX_VOL` |

`fish-config.json` 是数值唯一来源，`GameRoot` 运行时用 `resources.load` 读取，改完不用动代码。

## 性能注意

- `Graphics` 不支持渐变填充，天空和水体都是用「多条横向色带」拼的（相邻色带差 < 2 色阶）。
  好处是整层只有一次 draw call。
- 颜色变化慢的层（背景、装饰）限频 10fps 重绘；水面波纹单独一个节点靠 `setPosition`
  平移滚动，保证 60fps 顺滑。
- `Hud` 的数值用 Label 改字符串，不重建底板；时间条只在刻度变化时重绘。
- 换装条只在选中角色变化时重绘那一格。

## 已知待办

- 鱼钩、甲板、灯笼是程序绘制的占位美术，正式上线建议替换成美术资源
- 未做对象池，鱼的创建 / 销毁是直接 `new` / `destroy`，鱼量增大时需要池化
- 未配置微信小游戏分包与图集，发布前需要打 Sprite Atlas
- 触摸坐标反算（`convertToNodeSpaceAR`）只在编辑器里验证过逻辑，真机需要再过一遍
