# 开机美化 · dsh-boot-theme

给你的 DeepSeek Harness 加一段**开机动画**：双击启动后，窗口先全屏播放你指定的视频（可带音频），HARNESS 在后台同步加载，播完按设定的转场进入主界面；如果那时还没加载完，会保持最后一帧慢慢淡出，再露出默认启动屏继续等待。

> 适用于 **DeepSeek Harness 桌面版（Windows）**，在 `0.2.1-rc.3` 上开发与验证。

## 特性

- 🎬 **视频开机动画**：mp4 / webm，1080p 起，10 秒上限；全屏遮盖，不阻塞加载
- 🔊 **声音可配**：视频自带音轨，或单独指定音频文件；高 / 中 / 低 / 自定义音量，淡入淡出
- 🎞 **三种转场**：淡出、缩放模糊、镜片破碎（HARNESS 破镜而出）
- 📅 **三种播放模式**：每次冷启动 / 每天首次 / 仅首次启动
- ⏭ **可跳过**：左键双击、空格连按两次、Esc；可整体关闭
- 🖥 **右侧栏面板**：媒体选择、参数调整、小窗预览、全屏试播，全部在 DSH 内完成
- 🛟 **安全兜底**：文件缺失、解码失败、超出上限都会回退默认启动屏，不会黑屏

## 安装

```powershell
dsh plugin --profile desktop add github:hkhlpj/dsh-boot-theme
```

或从本地目录安装：

```powershell
dsh plugin --profile desktop add link:<本目录绝对路径>
```

安装后**完全退出并重启** DeepSeek Harness。

## 使用

打开右侧栏 → 引导页 / 「＋」→ **开机美化**：

1. **视频**：选择 mp4 / webm（建议 1080p、≤30MB）
2. **声音**：选择独立音频，或使用视频自带音轨
3. **播放**：总开关、播放模式、时长（1–10 秒）
4. **转场与跳过**：选择转场效果、跳过手势与跳过时的音频行为
5. **预览**：小窗看画面，点「全屏试播」走完整效果（试播不计入额度）

保存后**下次冷启动生效**，试播立即生效。

## 配置说明

设置保存在 `~/.dsh/storage/boot-theme/settings.json`，也可以直接在面板里改。

| 项 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 总开关 |
| `playMode` | `dailyFirst` | `everyColdStart` / `dailyFirst` / `firstLaunch` |
| `maxSeconds` | `3` | 播放上限，1–10 秒 |
| `durationMode` | `cap` | `cap` 按设定截断；`full` 按视频全长（≤10s） |
| `videoPath` | 空 | 视频绝对路径 |
| `audioPath` | 空 | 独立音频路径；空则用视频音轨 |
| `audioEnabled` | `true` | 是否播放声音 |
| `volumePreset` | `medium` | `high`(0.8) / `medium`(0.5) / `low`(0.3) / `custom` |
| `volume` | `0.5` | `custom` 时的音量 |
| `fadeInMs` / `fadeOutMs` | `500` / `800` | 淡入淡出时长 |
| `transition` | `fade` | `fade` / `zoomBlur` / `shatter` |
| `skipEnabled` | `true` | 是否允许跳过 |
| `skipAudio` | `fade` | 跳过时音频：`fade` / `stop` / `custom` |
| `skipAudioFadeMs` | `400` | 跳过时淡出时长 |
| `background` | `#000000` | 视频留黑边时的底色 |
| `fit` | `cover` | `cover` 铺满 / `contain` 完整显示 |

## 它是怎么工作的

- **Host 插件**（`index.js`）：读写配置，注册 `/boot-theme/state|settings|media|pick|played` 路由；媒体以流式 + Range 提供，不经过 base64 或大块 IPC。
- **注入**：宿主启动时通过 `webserver/index-inject` 把运行时脚本注入 boot 页；脚本只在检测到桌面环境（`dshDesktopBoot`）时运行。
- **运行时**（`boot-runtime.js`）：全屏 overlay + `<video>`/`<audio>`，遮盖应用但不延迟加载；结束时判断主界面是否就绪，就绪则转场，未完则保持最后一帧 1.5 秒淡出后交回默认启动屏。
- **面板**（`client.js`）：右侧栏 `sidebar.right.pane.tab` 注册一个 tab，用于配置与试播。

## 已知限制

- 仅 **桌面端** 生效；浏览器打开 `127.0.0.1:端口` 不会播放。
- 仅 Windows：选文件使用系统原生对话框。
- 桌面版单实例：已在运行时再次双击只会聚焦窗口，不会重播。
- 视频上限 30MB；建议 1080p、H.264、faststart。
- 无碎屏音效；声音只来自视频或你选的音频。
- 设置、`~/.dsh` 下的存储与主题无关，卸载插件不会自动删除。

## 开发

```powershell
node --check index.js
node --check boot-runtime.js
node --check client.js
```

结构：

| 文件 | 作用 |
|---|---|
| `index.js` | Host：配置、路由、文件选择、index 注入 |
| `boot-runtime.js` | 页面内启动动画运行时 |
| `client.js` | 右侧栏「开机美化」面板 |
| `cordis.patch.yml` | bundle 挂载声明 |

## English

A cold-start boot animation plugin for DeepSeek Harness Desktop (Windows): plays a configurable video with optional audio over the app while it loads, then transitions into the UI (fade / zoom-blur / glass shatter). Supports per-cold-start, daily-first, and first-launch modes, skip gestures, and an in-app settings panel with preview.

```powershell
dsh plugin --profile desktop add github:hkhlpj/dsh-boot-theme
```

## License

[MIT](LICENSE) © 2026 hkhlpj
