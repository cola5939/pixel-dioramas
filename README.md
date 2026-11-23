# pixel-dioramas

小型像素立体场景，用 [Ink Studio](https://github.com/siliconjungle/shapeshift-labs-ink-studio) 雕刻、烘焙和渲染。每个场景一个文件夹，里面有场景本身、影片渲染脚本、配乐脚本，以及一个可以用鼠标拖动旋转的网页。

Small pixel-art dioramas sculpted, baked and rendered with Ink Studio. One folder per scene.

## 场景 / Scenes

| 文件夹 | 场景 | 预览 |
| --- | --- | --- |
| [`night-stall/`](night-stall/) | 雨夜小吃摊 · Rainy Night Food Stall：雨夜街边的三轮面摊，36 秒无缝循环 | [在线预览](https://claude.ai/artifact/HCzUsvWqERjQcgJjRuUUFo) |
| [`vice-corner/`](vice-corner/) | 罪恶都市街角 · Vice Corner：落日下的街角便利店，颠着液压的低趴车和它上方的五颗通缉星、警车、直升机探照灯、过马路的鳄鱼；整个街区四面都做全了，店后面是一条后巷；场景里不放人物，主角只出现在屋顶广告牌上（戴墨镜的头像）；36 秒无缝循环 | [在线预览](https://claude.ai/artifact/QoBRCe2QuCU81MkNpVr4hd) |

## 使用 / Usage

需要 Node 22+；渲染影片还需要 `ffmpeg`。

```bash
npm install
npm run night-stall:page    # 网页：out/night-stall.html（单文件，双击打开）和 out/artifact/
npm run night-stall:film    # 影片：out/night-stall.mp4，30 fps 1920×1080，约 25 分钟
npm run night-stall:music   # 配乐：out/night-stall-music.wav
npm run vice-corner:page    # 网页：vice-corner/out/vice-corner.html（影片和配乐还没做）
```

影片的参数示例：`npm run night-stall:film -- --fps 60 --out out/night-stall-60fps.mp4`，或者用 `--still 0,9,18` 只出几张静帧。每个脚本开头的注释里有完整参数说明。生成的文件都在各场景的 `out/` 下，不进仓库。

网页操作：拖动旋转，滚轮或双指缩放，双击复位。

## 每个场景里的文件

- `scene.js`：场景本身（雕刻、材质、动画、天气、镜头）
- `build-page.mjs` + `page.js`：网页（WebGL 实时渲染，场景在构建时预先烘焙进页面）
- `film.mjs`：用 Ink Studio 的 CPU 渲染器逐帧渲染，再交给 ffmpeg 编码
- `music.mjs`：逐采样合成的原创配乐，长度与影片循环一致

Ink Studio 锁定在提交 `a7e8eac`，因为它直接从 GitHub 安装，没有发布版本号。

写新场景要留意网页渲染器（WebGL）的两个上限：调色板 64 色、色阶（材质里每个不同的 `r` / `g`）64 组，超出的会画成黑色；CPU 渲染（`npx ink-studio render`）不受这个限制，所以要在网页里看一眼才算数。
