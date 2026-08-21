# Weave EPUB Reader

[中文](#中文文档) | [繁體中文](./README.zh-TW.md) | [English](#english-documentation) | [Español](./README.es.md) | [Français](./README.fr.md) | [日本語](./README.ja.md) | [한국어](./README.ko.md) | [Русский](./README.ru.md) | [العربية](./README.ar.md)

<div align="center">
   
![weave-series-banner-og](https://github.com/user-attachments/assets/a52c0875-9296-4dfd-bf94-114a225f2972)

![weave-series-banner-trinity](https://github.com/user-attachments/assets/8f748341-bb83-4cf9-b020-d8cd18a2aa92)
   
![QQ_1784327250240](https://github.com/user-attachments/assets/dc88b393-76ec-413c-b226-31ab01a7e82a)

![QQ20260718-070731-HD](https://github.com/user-attachments/assets/c1850008-aa57-48e1-b63f-d34a01326a53)

![QQ20260718-064929-HD](https://github.com/user-attachments/assets/5fc7ff83-b8e3-498f-8233-90fbcc94198b)

![QQ_1784328028569](https://github.com/user-attachments/assets/1185b662-3f91-4dee-b552-e53e3ebcb25d)


![QQ_1785812351950](https://github.com/user-attachments/assets/5c33039e-7ca4-461b-b258-972561f9789d)

</div>

---

## 中文文档

### 插件介绍

**Weave Epub Reader**为**Obsidian Weave插件系列**下的一款完全服务于obsidian并随obsidian全平台使用的阅读器插件。支持免费提供EPUB、TXT、FB2/FBZ、MOBI、AZW3、CBZ、PDF 等多格式书籍阅读与多标注类型的摘录笔记体验。并支持将这些摘录笔记数据保存在**md**，**cavans**，**weave牌组文件**中，通过双向溯源链接相互瞄点定位跳转，且数据完全本地化。

在保证满足用户基础需求与核心体验的前提下为高级用户提供**沉浸式阅读**，**段落阅读**，**生词标注模式**，**时间线摘录笔记汇总**，**摘录引用列表**及**更多功能**，旨在obdian中利用工具，促进思考，磨砺思维，诠释存在。

> 提示：若有问题，欢迎通过邮箱反馈交流 tutaoyuan8@outlook.com

## 核心功能特性清单

### 阅读与书架

- 桌面 / 移动端全平台阅读
- EPUB、TXT、FB2/FBZ、MOBI、AZW3、CBZ、PDF 阅读
- 我的书架：导入、封面、进度、搜索筛选、阅读状态、多视图展示
- 目录跳转、双页阅读、单页连续滚动等多种模式，以及版式与主题
- 阅读进度持久化、书签、剩余阅读时间估算
- 参考阅读点（手动记录 / 更新 / 跳转）
- 常规阅读透光渐变（高级）
- 段落阅读模式、沉浸式全屏（高级）
- 生词标注模式（高级）
- 书架书单（高级）

### 摘录与标注

- 五色高亮 + 下划线 / 删除线 / 波浪线
- 想法气泡（`---div---`）
- 自动模式：插入笔记 / 复制剪贴板
- Markdown / Canvas / Weave 牌组正文回显与同步
- 截图摘录（可翻页续截）

### 摘录汇总

- 摘录笔记汇总卡片列表（筛选、排序、定位原文）
- 摘录笔记汇总时间线视图（按日期回顾、跳转原文；高级）
- 批量选择：导出 / 删除
- 目录侧栏全书地图密度条（高级）
- 目录章节标记（重要 / 疑问 / 已掌握等彩色圆点；高级）

### 溯源与联动

- 书籍深链接写入摘录
- 双向溯源精确定位：笔记 ↔ 原书（高级）
- Canvas 绑定、自动写入节点、回显
- 制卡 / 增量阅读 / AI（需 Weave，不占阅读器高级许可）

### 公开 API

- 获取当前阅读上下文（书名、当前章标题 / 索引等）
- 获取当前章正文，或按目录获取指定 TOC 小节正文（text / markdown）
- 获取当前章高亮摘录，或列出当前书 / 指定书的全书摘录笔记
- 读取目录结构、列出已打开的阅读器；可选按定位移除摘录
- 不做全书正文检索 / RAG；长章优先按 TOC 小节拉取

### 导出与辅助

- 导出笔记模板与内置预设（基础）
- 导出当前章为 Markdown（含摘录笔记；高级）
- 导出全书 / 本章摘录、带标记章节（高级）
- 脚注浮窗预览（高级）
- 多语言界面（简体中文、繁體中文、English、日本語、한국어、Русский、Deutsch、Español、العربية）+ 应用内使用教程



各能力在 [基础体验与高级支持](#基础体验与高级支持) 中的划分见下表。

最低 Obsidian 版本：**1.8.7**


更完整的操作说明见上文 [摘录笔记工作流](#摘录笔记工作流) 与 [核心功能特性清单](#核心功能特性清单)。

## 基础体验与高级支持

| 能力 | 基础体验 | 高级支持 |
|------|:--------:|:--------:|
| **全平台** | ✅ | ✅ |
| **EPUB / TXT / FB2 / FBZ / MOBI / AZW3 / CBZ / PDF** | ✅ | ✅ |
| **目录跳转**、**双页阅读**、**单页连续滚动**等多种模式 | ✅ | ✅ |
| **五种高亮色**、想法、摘录与**正文回显** | ✅ | ✅ |
| **下划线 / 删除线 / 波浪线**等样式标注 | ✅ | ✅ |
| 摘录笔记**汇总卡片列表** | ✅ | ✅ |
| 书架**多视图**展示 | ✅ | ✅ |
| **参考阅读点**（手动记录 / 更新 / 跳转） | ✅ | ✅ |
| **阅读进度**持久化、书架进度、最后阅读点 | ✅ | ✅ |
| **当前页书签**、书签目录与书签列表跳转 | ✅ | ✅ |
| **Canvas** 绑定与自动写入节点 | ✅ | ✅ |
| **导出笔记模板**与内置预设 | ✅ | ✅ |
| **公开 API**（当前章 / 指定 TOC 小节正文、本章或全书摘录笔记等） | ✅ | ✅ |
| 摘录笔记**时间线**视图 | 🔒 | ✅ |
| 目录侧栏**全书地图密度条** | 🔒 | ✅ |
| 目录**章节标记**（重要 / 疑问 / 已掌握等） | 🔒 | ✅ |
| 书架**书单** | 🔒 | ✅ |
| **双向溯源**（锚点跳转、笔记 ↔ 原书定位显示） | 🔒 | ✅ |
| **常规阅读透光渐变** | 🔒 | ✅ |
| **段落阅读模式**、沉浸式全屏 | 🔒 | ✅ |
| **生词标注模式** | 🔒 | ✅ |
| 导出当前章节为 Markdown（含摘录笔记） | 🔒 | ✅ |
| 脚注浮窗预览 | 🔒 | ✅ |

> 图例：✅ 已包含 · 🔒 需启用高级支持

- **启用高级支持**：在阅读器设置中使用 EPUB 独立激活码；若已安装并激活 **Weave 主插件**，可继承授权而无需重复输入。
- **制卡 / 增量阅读 / AI**：不单独占用阅读器高级支持许可，但需安装 Weave；AI 另需自行配置 API Key。

完整对照见上文 [基础体验与高级支持](#基础体验与高级支持)；激活在阅读器设置中完成，条款见 [PREMIUM_TERMS.md](./PREMIUM_TERMS.md)。

## 安装

### 方式一：社区插件（推荐）

1. 打开 **设置 → 社区插件 → 浏览**
2. 搜索 **Weave EPUB Reader**，安装并启用

### 方式二：手动安装

1. 从 [GitHub Releases](https://github.com/zhuzhige123/obsidian-weave-reader/releases) 下载与 `manifest.json` 版本号一致的发布包，获取：
   - `main.js`
   - `manifest.json`
   - `styles.css`
2. 复制到 `.obsidian/plugins/weave-epub-reader/`
3. 重启 Obsidian，在 **设置 → 社区插件** 中启用 **Weave EPUB Reader**

## 快速开始

1. 启用插件后，通过功能区图标或命令面板打开**书架**，从 Vault 导入或打开图书。
2. 新建或打开一个 Markdown 文件，把光标放在需要插入摘录的位置；启用阅读器的**自动摘录**。选中文本，创建高亮、摘录或书签，内容会自动写入该位置。
3. 点击正文中的高亮，在工具条中跳转到来源笔记；在保存摘录的 Markdown / Canvas 中点击摘录旁的书籍图标，即可回到书中对应位置。
4. 阅读器菜单 → **帮助** → **使用教程** 可查看插件内精简教程。工作流细节见上文 [摘录笔记工作流](#摘录笔记工作流)。

## 数据与同步

**建议同步（位于 Vault）**：图书文件、Markdown 摘录、Canvas、Weave 牌组数据，以及每本书的进度与书签专有笔记（默认 `Weave EPUB Reader/data_*.md`）。

**通常不需跨设备同步（位于插件目录）**：阅读缓存、索引、Canvas 绑定与参考阅读点等本地状态。多设备使用时优先同步 Vault 内容，而非直接同步 `.obsidian/plugins/weave-epub-reader/` 下的缓存文件。

## 隐私与网络

- 阅读、渲染、摘录与回链等**默认在本地完成**，不会主动上传 Vault 内容。
- 书架、回链与来源定位等功能会在本地枚举 Vault 文件路径；复制摘录或激活码时会访问剪贴板。详见 [PRIVACY.md](./PRIVACY.md)。
- **高级支持激活**可能访问许可证服务（激活码、邮箱、设备指纹摘要等），详见 [PRIVACY.md](./PRIVACY.md)。
- **AI 功能**会调用你自行配置的第三方服务。

## 常见问题

### 如何正确的做阅读摘录笔记？

阅读摘录笔记保存在你选择的 Markdown、Canvas，以及 Weave 牌组文件中的具体位置；阅读器通过汇总这些摘录中的溯源链接，在正文中回显高亮。若不满足上述保存条件，选中摘录只会短暂高亮，不会留下可同步的实质数据。阅读器顶部的教程浮窗有更详细的说明。

### 与 Weave 的关系？

**Weave EPUB Reader 可独立使用**：不安装 [Weave](https://github.com/zhuzhige123/anki-obsidian-plugin) 主插件，也能在 Obsidian 里阅读 EPUB、管理书架，并完成基础摘录与正文回显。安装 Weave 后，可额外衔接制卡复习、增量阅读月历、AI 菜单等能力，并可继承 Weave 授权以启用阅读器高级支持。二者是**可选联动**，不是硬性依赖。

### 摘录笔记能否全平台同步？

**支持。** 摘录落在 Vault 内的 Markdown、Canvas、牌组等文件中，会随你使用的 Obsidian 同步方式（官方 Sync、iCloud、网盘同步 Vault 等）在桌面端与移动端之间保持一致。建议同步 Vault 内容；阅读器缓存等插件目录数据通常无需跨设备同步（见上文 [数据与同步](#数据与同步)）。

### 是否支持导出笔记？

**支持。** 摘录与高亮相关数据保存在你的库内，可在 Obsidian 中直接查看、编辑与导出 Markdown；阅读器也提供章节导出等能力。**数据默认完全本地化**，不会主动上传你的 Vault 内容。

### 为何提供高级付费？

高级支持用于**支持持续开发**——让开发者能长期投入、打磨阅读与摘录细节。**基础体验免费**，已覆盖日常阅读、五色高亮、想法、摘录与正文回显等核心能力，上手体验完整；若你需要时间线视图、双向溯源、段落阅读模式等进阶能力，再按需启用高级支持即可。

### 是订阅还是买断？

阅读器高级支持采用**买断制**（一次激活，长期使用，具体以 [高级支持条款](./PREMIUM_TERMS.md) 为准），而非按月订阅。

### 如何调整字体与字号？

阅读器的字体与字号**自动适配 Obsidian**，插件内不单独提供自定义。请在 Obsidian **设置 → 外观** 中调整。

### 如何更换背景色？

阅读器背景色**随当前 Obsidian 主题自动适配**。安装并切换不同主题即可，插件不会单独设置背景色。


## 更多文档

- [插件介绍（简体中文）](#中文文档)
- [插件介绍（繁體中文）](./README.zh-TW.md)
- [Español](./README.es.md) · [Français](./README.fr.md) · [العربية](./README.ar.md)
- [隐私说明](./PRIVACY.md) · [高级支持条款](./PREMIUM_TERMS.md) · [支持](./SUPPORT.md) · [安全](./SECURITY.md)

## 许可证与作者

源码基于 [GPL-3.0-or-later](LICENSE) 发布。

- Author: Rabbit (zhuzhige)
- GitHub: https://github.com/zhuzhige123

---

## English Documentation

### Introduction

**Weave Epub Reader** is a reader plugin in the **Obsidian Weave plugin series**, built fully for Obsidian and available across Obsidian platforms. It freely supports reading EPUB, TXT, FB2/FBZ, MOBI, AZW3, CBZ, PDF, and more, plus multi-style excerpt notes. Excerpts can be stored in **Markdown**, **Canvas**, and **Weave deck** files, with two-way source links for jump-to-passage navigation, and data stays fully local.

On top of essential needs and the core experience, advanced users get **immersive reading**, **paragraph reading**, **vocabulary marking**, **timeline excerpt summaries**, **excerpt reference lists**, and **more**—using tools inside Obsidian to think, sharpen judgment, and make reading count.

> Tip: Questions welcome—email tutaoyuan8@outlook.com

## Core feature checklist

### Reading and bookshelf

- Full-platform reading on desktop and mobile
- EPUB, TXT, FB2/FBZ, MOBI, AZW3, CBZ, and PDF reading
- My bookshelf: import, covers, progress, search/filter, reading status, multiple views
- TOC jump, dual-page reading, single-page continuous scroll, and other modes, plus typography and themes
- Persistent reading progress, bookmarks, remaining-time estimates
- Reading reference points (record / update / jump)
- Reading background glow (Premium)
- Paragraph reading mode, immersive fullscreen (Premium)
- Vocabulary marking mode (Premium)
- Bookshelf playlists (Premium)

### Excerpts and annotations

- Five highlight colors plus underline / strikethrough / wavy underline
- Thought bubbles (`---div---`)
- Auto mode: insert into notes / copy to clipboard
- In-body rendering and sync for Markdown / Canvas / Weave decks
- Screenshot excerpts (can continue across pages)

### Excerpt summaries

- Excerpt card list (filter, sort, jump to source)
- Excerpt timeline view (review by date, jump to source; Premium)
- Batch select: export / delete
- TOC sidebar book-map density bar (Premium)
- TOC chapter marks (important / question / mastered colored dots; Premium)

### Tracing and integrations

- Book deep links written into excerpts
- Precise two-way tracing: notes ↔ book (Premium)
- Canvas binding, auto node creation, and rendering
- Card making / incremental reading / AI (requires Weave; does not consume reader Premium license)

### Public API

- Get current reading context (book title, current chapter title / index, etc.)
- Get current chapter body, or a specified TOC section body (text / markdown)
- Get current-chapter highlight excerpts, or list all excerpt notes for the current / a specified book
- Read TOC structure, list open readers; optionally remove an excerpt by locator
- No whole-book body search / RAG; prefer TOC sections for long chapters

### Export and helpers

- Excerpt export templates and built-in presets (Essential)
- Export current chapter to Markdown with excerpt notes (Premium)
- Export whole-book / chapter excerpts and marked chapters (Premium)
- Footnote hover preview (Premium)
- Multilingual UI (Simplified Chinese, Traditional Chinese, English, Japanese, Korean, Russian, German, Spanish, Arabic) + in-app tutorial

See [Essential experience and Premium support](#essential-experience-and-premium-support) for how capabilities are grouped.

Minimum Obsidian version: **1.8.7**

## Essential experience and Premium support

| Capability | Essential experience | Premium support |
|------------|:--------------------:|:---------------:|
| **All platforms** (desktop and mobile) | ✅ | ✅ |
| Read **EPUB / TXT / FB2 / FBZ / MOBI / AZW3 / CBZ / PDF** | ✅ | ✅ |
| **TOC jump**, **dual-page reading**, **single-page continuous scroll**, and other modes, plus typography and themes | ✅ | ✅ |
| **Five highlight colors**, annotations, excerpts, and **in-body rendering** | ✅ | ✅ |
| **Underline / strikethrough / wavy underline** styling | ✅ | ✅ |
| Excerpt **card list** | ✅ | ✅ |
| Bookshelf **multiple views** | ✅ | ✅ |
| **Reading reference points** (record / update / jump) | ✅ | ✅ |
| **Reading progress**, bookshelf progress, last location, remaining-time estimates | ✅ | ✅ |
| **Current-page bookmarks**, bookmark folder, and bookmark list navigation | ✅ | ✅ |
| **Canvas** binding and automatic node creation | ✅ | ✅ |
| **Excerpt export templates** and built-in presets | ✅ | ✅ |
| **Public API** (current chapter / TOC section body, chapter or whole-book excerpt notes, etc.) | ✅ | ✅ |
| Excerpt **timeline** view | 🔒 | ✅ |
| TOC sidebar **book map density bar** | 🔒 | ✅ |
| TOC **chapter marks** (important / question / mastered) | 🔒 | ✅ |
| Bookshelf **playlists** | 🔒 | ✅ |
| **Two-way tracing** (anchor jumps, notes ↔ book location display) | 🔒 | ✅ |
| **Reading background glow** | 🔒 | ✅ |
| **Paragraph reading mode**, immersive fullscreen | 🔒 | ✅ |
| **Vocabulary marking mode** | 🔒 | ✅ |
| Export current chapter to Markdown with excerpt notes | 🔒 | ✅ |
| Footnote hover preview | 🔒 | ✅ |

> Legend: ✅ included · 🔒 requires Premium support

- **Enable Premium support**: Use an EPUB-only activation code in reader settings; if an activated **Weave** main plugin is installed, authorization can be inherited without re-entering a code.
- **Card making / incremental reading / AI**: Do not consume a separate reader Premium-support license, but require Weave; AI also needs your own API key.

Authoritative breakdown: [Essential experience and Premium support](#essential-experience-and-premium-support) above. Activate in reader settings. Terms: [PREMIUM_TERMS.md](./PREMIUM_TERMS.md).

## Installation

### Option 1: Community plugins (recommended)

1. Open **Settings → Community plugins → Browse**
2. Search for **Weave EPUB Reader**, install, and enable

### Option 2: Manual installation

1. Download a [GitHub release](https://github.com/zhuzhige123/obsidian-weave-reader/releases) matching the version in `manifest.json`:
   - `main.js`
   - `manifest.json`
   - `styles.css`
2. Copy into `.obsidian/plugins/weave-epub-reader/`
3. Restart Obsidian and enable **Weave EPUB Reader** under **Settings → Community plugins**

## Quick start

1. After enabling the plugin, open the **bookshelf** from the ribbon or command palette, then import or open a book from your vault.
2. Create or open a Markdown file and place the cursor where excerpts should go; turn on **Auto excerpt** in the reader. Select text to create highlights, excerpts, or bookmarks—they are inserted at that cursor.
3. Click a highlight in the book to jump to its source note from the toolbar; in the Markdown / Canvas that holds the excerpt, click the book icon next to it to return to the matching passage.
4. Reader menu → **Help** → **Tutorial** for the in-app short guide.

## Data and sync

**Good to sync (in the vault)**: Book files, Markdown excerpts, Canvas files, Weave deck data, and per-book progress/bookmark notes (default `Weave EPUB Reader/data_*.md`).

**Usually local (plugin folder)**: Reader cache, indexes, Canvas bindings, reference reading points, and similar local state. Prefer syncing vault content across devices rather than `.obsidian/plugins/weave-epub-reader/` cache files.

## Privacy and network

- Reading, rendering, excerpting, and backlinks are **local by default**; vault content is not uploaded proactively.
- Bookshelf, backlink, and source-locate features enumerate vault file paths locally; copying excerpts or activation codes uses the clipboard. See [PRIVACY.md](./PRIVACY.md).
- **Premium support activation** may contact the license service (activation code, email, device fingerprint summary, etc.). See [PRIVACY.md](./PRIVACY.md).
- **AI features** call the third-party services you configure.

## FAQ

### How do I capture reading excerpts correctly?

Excerpts are stored at concrete locations in the Markdown, Canvas, or Weave deck files you choose. The reader aggregates source links from those captures and renders highlights in the book. Selections that are not saved this way only flash briefly and leave no durable data. The in-reader tutorial banner explains this in more detail.

### How does this relate to Weave?

**Weave EPUB Reader works on its own**: without the [Weave](https://github.com/zhuzhige123/anki-obsidian-plugin) main plugin, you can still read EPUBs, use the bookshelf, and capture excerpts with in-body rendering. With Weave installed, you can also connect spaced-repetition cards, incremental reading calendar, AI actions, and inherit Weave licensing for Premium support. The two are **optional companions**, not a hard dependency.

### Can excerpts and notes sync across platforms?

**Yes.** Captures live in Markdown, Canvas, deck files, and other vault content, so they follow whatever Obsidian sync you already use (Obsidian Sync, iCloud, cloud-synced vaults, etc.) across desktop and mobile. Sync vault content; reader cache under the plugin folder usually does not need cross-device sync (see [Data and sync](#data-and-sync) above).

### Can I export my notes?

**Yes.** Excerpt and highlight data stays in your vault—you can read, edit, and export Markdown in Obsidian, and the reader offers chapter export and related tools. **Data is local by default**; your vault is not uploaded proactively.

### Why is Premium support paid?

Premium support **funds ongoing development** so the reader and excerpt workflow can keep improving. The **essential experience is free**—daily reading, five highlight colors, annotations, excerpts, and in-body rendering are fully usable without paying. Enable Premium support only when you want the excerpt timeline, two-way tracing, paragraph reading mode, and other advanced capabilities.

### Subscription or one-time purchase?

Premium support is **buy-once** (activate once, use long-term; see [Premium support terms](./PREMIUM_TERMS.md)), not a monthly subscription.

### How do I change font and size?

The reader **follows Obsidian’s font and size**. There is no separate in-plugin control—adjust them in Obsidian **Settings → Appearance**.

### How do I change the background color?

The reader background **follows the active Obsidian theme**. Install and switch themes; the plugin does not set a background of its own.

## More documentation

- [Introduction (Simplified Chinese)](#中文文档)
- [Introduction (Traditional Chinese)](./README.zh-TW.md)
- [Español](./README.es.md) · [Français](./README.fr.md) · [العربية](./README.ar.md)
- [Privacy](./PRIVACY.md) · [Premium support terms](./PREMIUM_TERMS.md) · [Support](./SUPPORT.md) · [Security](./SECURITY.md)

## License and author

Source code is released under [GPL-3.0-or-later](LICENSE).

- Author: Rabbit (zhuzhige)
- GitHub: https://github.com/zhuzhige123
