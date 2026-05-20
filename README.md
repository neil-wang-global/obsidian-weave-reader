# Weave EPUB Reader

[English README](./README.en.md)

<div align="center">

![Weave EPUB Reader](https://img.shields.io/badge/Obsidian-EPUB%20Reader-8a5cf6?style=for-the-badge)
![Version](https://img.shields.io/badge/version-0.6.3-green?style=for-the-badge)
![Min Obsidian](https://img.shields.io/badge/Obsidian-1.7.0+-purple?style=for-the-badge)
![License](https://img.shields.io/badge/license-GPL--3.0-orange?style=for-the-badge)

</div>

Weave EPUB Reader 是一款面向 Obsidian 的多格式电子书阅读器插件，专注于把“阅读、摘录、回链、定位、复盘”整合在同一个工作流里。

它支持在 Obsidian 中直接打开 Vault 内的多种图书文件，并围绕阅读过程提供：书架管理、阅读位置持久化、章节导航、正文高亮、摘录回链、Canvas 绑定、截图、导出、AI/增量阅读入口等能力。

最低支持的 Obsidian 版本：`1.7.0`

## 项目定位

这个仓库是一个**独立的图书阅读器项目**，不是完整 Weave 主插件的总仓库文档。

如果你关心的是以下需求，这个插件就是为它们设计的：

- 在 Obsidian 内直接阅读多种支持的图书格式
- 将阅读摘录写回 Markdown / Canvas / Weave 卡片数据
- 用插件生成的 EPUB 深链接回到原书的精确位置
- 在阅读器正文中实时显示来自笔记系统的摘录高亮
- 保留阅读进度、书签、章节定位和主题样式一致性

## 阅读器内核与支持格式

### 阅读器内核

- 当前阅读器内核固定为 `foliate-js`
- 项目内的具体实现服务为 `FoliateReaderService`
- `TXT` 会走专门的纯文本适配路径
- `EPUB` 以外的其他已支持书籍格式，当前通过 Foliate 通用加载路径接入

### 当前支持的格式

- `epub`
- `mobi`
- `azw3`
- `fb2`
- `fbz`（`fb2.zip`）
- `cbz`
- `txt`

这意味着插件名称虽然是 EPUB Reader，但当前项目并**不只限于 EPUB**。

## 核心功能

### 1. 图书阅读体验

- 支持在 Obsidian 中打开 Vault 内的多种书籍格式文件
- 支持书架视图管理已导入书籍
- 支持分页模式与连续滚动模式
- 支持章节目录跳转、阅读进度显示、页码信息同步
- 支持字体、行高、字距、页边距、宽度模式、主题等阅读设置

### 2. 摘录与高亮

- 可选中文本后生成摘录
- 支持将摘录插入 Markdown、复制到剪贴板或写入 Canvas
- 支持在正文中显示高亮与隐藏文本
- 支持高亮点击后的来源定位、复制、删除、改色等操作

### 3. 回链与实时显示

- 阅读器会从以下来源汇总与当前 EPUB 对应的摘录并渲染到正文中：
  - Markdown 文件
  - Canvas 文件
  - Weave 牌组 / 卡片结构化数据文件
- 当这些来源文件发生变化时，阅读器会自动刷新高亮显示
- 正常情况下会尽量在约 2 秒内把新的摘录回显到正文

### 4. 深链接与溯源

- 支持插件生成的 EPUB 深链接
- 可从摘录笔记跳回书中的对应位置
- 可从正文高亮定位回摘录来源
- 支持章节阅读点与导出时保留源链接信息

### 5. 阅读工作流扩展

- 书签与最后阅读点保存
- 当前章节导出为 Markdown
- 截图与截图保存模式
- Canvas 绑定与画布摘录节点生成
- 增量阅读入口
- 已选文本 AI 操作入口

## 免费版与高级版

Weave EPUB Reader 采用“基础功能免费，高级能力付费”的模式。

### 基础免费功能

- 本地阅读与书架管理
- 章节导航、阅读进度、书签、阅读样式设置
- 基础摘录、高亮、回链定位
- Markdown / Canvas / Weave 数据联动中的核心本地能力

### 高级付费能力

- 需要激活后才能使用的高级功能
- 可能包含更完整的高级阅读工作流、增强集成能力或持续扩展能力
- 某些高级能力可能依赖许可证校验或配套在线服务

### 边界说明

- 是否需要激活，以插件当前版本的实际界面与功能开关为准
- 已安装 **Weave 主插件** 且主插件已激活时，阅读器可继承主插件授权，无需重复输入同一激活码；也可使用 **EPUB 独立激活码**（仅解锁本阅读器）
- 多插件授权架构说明见 [docs/LICENSE_MULTI_PLUGIN.md](./docs/LICENSE_MULTI_PLUGIN.md)
- AI 相关功能通常还需要你自行配置第三方 AI 服务的 API Key
- 即使启用了高级能力，用户自己的 EPUB、Markdown、Canvas 与 Vault 数据仍由用户自己控制

## 安装

### 方式一：手动安装

1. 从发布包中获取以下文件：
   - `main.js`
   - `manifest.json`
   - `styles.css`
   - `sql-wasm.wasm`（如果发布包包含）
   - `versions.json`（如果发布包包含，建议一并复制）
2. 将文件复制到：

   `.obsidian/plugins/weave-epub-reader/`

3. 重启 Obsidian
4. 在社区插件页面启用 `Weave EPUB Reader`

## 开发命令

### 桌面热重载

- `npm run dev`

### 手机 ADB 热重载

先在 `.env` 中配置以下任一项：

- `WEAVE_MOBILE_PLUGIN_DIR=/storage/emulated/0/Documents/obsidian luman/.obsidian/plugins/weave-epub-reader`
- 或 `WEAVE_MOBILE_VAULT_ROOT=/storage/emulated/0/Documents/obsidian luman`

如有需要还可补充：

- `WEAVE_MOBILE_ADB_PATH=C:/Android/platform-tools/adb.exe`
- `WEAVE_MOBILE_ADB_SERIAL=<你的设备 serial>`

常用命令：

- `npm run dev:mobile`
  - 构建一次开发版并立即通过 ADB 推送到手机插件目录
- `npm run dev:mobile:watch`
  - 持续监听构建输出，自动推送 `.mobile-hot-reload` 中的运行时文件到手机
- `npm run deploy:mobile`
  - 将当前 mobile 热重载输出重新推送到手机
- `npm run build:mobile`
  - 生产构建后立即推送到手机

## 推荐使用方式

### Markdown 摘录流

适合希望把阅读内容沉淀到 Obsidian 笔记体系中的用户：

1. 在阅读器中选中文本
2. 插入到当前 Markdown 笔记
3. 后续修改、整理、重组这些摘录
4. 再次打开该 EPUB 时，正文会根据笔记内容显示对应高亮

### Canvas 摘录流

适合做视觉化整理、专题研究、关系分析：

1. 绑定一个 Canvas
2. 从阅读器把摘录写入 Canvas
3. 在 Canvas 中继续组织节点
4. 阅读器会识别关联 Canvas 中的摘录并回显到正文

### 回链复盘流

适合“先摘录、后复习、再回原文”的工作方式：

1. 在笔记中查看历史摘录
2. 通过 EPUB 深链接返回原文位置
3. 在正文中查看同段相关高亮与来源
4. 完成复盘与再整理

## 数据与同步说明

### Vault 内数据

以下内容通常位于你的 Vault 中，适合纳入同步：

- EPUB 文件本身
- 你写下的 Markdown 摘录笔记
- Canvas 文件
- Weave 相关卡片 / 牌组数据文件

### 插件目录数据

以下内容通常位于插件目录中，更偏本地状态：

- 阅读缓存
- 索引数据
- 本地状态
- 阅读进度与界面状态
- 调试或迁移相关缓存

插件目录路径通常为：

`.obsidian/plugins/weave-epub-reader/`

如果你做多设备同步，推荐优先同步 Vault 内容，而不是直接同步插件缓存文件。

## 隐私与网络说明

### 本地优先

- 阅读、渲染、摘录、回链、缓存等核心能力默认在本地完成
- 插件不会主动把你的 Vault 内容上传到外部服务

### 可能涉及网络的场景

- 高级版激活、许可证验证、设备额度管理等流程可能访问插件配套的许可证服务
- 使用 AI 相关功能时，会访问你配置的 AI 服务
- 如果你接入其他外部服务，则以该服务的实际配置为准

### 许可证校验可能涉及的数据

当你使用激活或许可证校验相关功能时，插件可能会发送以下信息用于完成授权验证：

- 激活码
- 购买或绑定邮箱
- 设备指纹摘要
- 平台信息

说明：

- 设备指纹用于设备授权管理、异常校验与激活额度控制
- 许可证验证结果可能会在本地缓存一段时间，以减少重复请求
- README 仅描述当前仓库代码可见的总体行为；如果未来服务策略调整，应以更新后的公开说明为准

### 文件访问范围

插件会读取和写入以下范围的数据：

- 当前 Vault 中的 EPUB、Markdown、Canvas 与相关数据文件
- 插件目录下的状态、缓存与构建产物

## 适用场景

- 在 Obsidian 内统一管理阅读与知识沉淀
- 构建“原文 - 摘录 - 笔记 - 回链”的阅读闭环
- 需要把 EPUB 阅读和 Canvas / Markdown 组织方式结合起来
- 希望通过深链接快速返回书中上下文

## 常见问题

### 阅读器正文没有显示摘录高亮怎么办

请先确认：

- 该摘录是通过插件生成的 EPUB 引用格式写入的
- 该摘录位于 Markdown、Canvas 或 Weave 结构化卡片文件中
- 当前打开的是与摘录对应的同一本 EPUB

如果来源文件刚刚更新，阅读器会自动重新汇总并尝试在短时间内刷新正文高亮。

### 插件目录应该叫什么

本项目的插件 ID 是：

`weave-epub-reader`

因此手动安装目录应为：

`.obsidian/plugins/weave-epub-reader/`

## 许可证

本项目源码基于 [GPL-3.0-or-later](LICENSE) 协议发布。

### 开源协议与付费模式的关系

- 代码仓库中的开源部分受 GPL-3.0-or-later 约束
- 基础免费、高级付费是一种功能与服务分层方式，不改变 GPL 对已发布源码所赋予用户的权利
- 付费部分主要对应高级功能、许可证服务、在线能力、持续维护或相关附加服务
- 若某项能力依赖在线服务、激活系统或账号权益，其使用条件可能由单独的服务说明、购买说明或隐私说明补充约定

### 你在使用前应了解

- 如果你只使用本地基础功能，通常不需要接入额外在线服务
- 如果你使用高级授权、激活验证或 AI 能力，建议同时阅读相关购买说明、激活说明与隐私说明

相关公开说明：

- [多插件授权架构（开发者）](./docs/LICENSE_MULTI_PLUGIN.md)
- [隐私说明](./PRIVACY.md)
- [高级版说明](./PREMIUM_TERMS.md)
- [支持说明](./SUPPORT.md)
- [安全说明](./SECURITY.md)

## Obsidian 社区审核与发布

本仓库面向 Obsidian 社区插件市场审核，发布前建议本地执行：

```bash
npm run verify:public-repo
npm run lint:obsidian
npm run build
npm run verify:release
```

GitHub Release 的**标题**必须与标签完全一致（例如 `0.6.3`）。若标题留空，ObsidianReviewBot 可能把标题误报为 `0.6.1manifest.json` 这类拼接名称。请检查并修正历史 Release（如 `0.6.1`、`0.6.2`）的标题字段。

许可证文件使用完整的 [GPL-3.0-or-later](./LICENSE) 正文，以便 GitHub 与审核机器人正确识别。

## 作者与反馈

- Author: Rabbit (zhuzhige)
- GitHub: https://github.com/zhuzhige123
- Privacy: [PRIVACY.md](./PRIVACY.md)
- Premium: [PREMIUM_TERMS.md](./PREMIUM_TERMS.md)
- Support: [SUPPORT.md](./SUPPORT.md)
- Security: [SECURITY.md](./SECURITY.md)
