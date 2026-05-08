# obsidian-weave-reader
# Weave EPUB Reader

[English README](./README.en.md)

<div align="center">

![Weave EPUB Reader](https://img.shields.io/badge/Obsidian-EPUB%20Reader-8a5cf6?style=for-the-badge)
![Version](https://img.shields.io/badge/version-0.5.0-green?style=for-the-badge)
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

- 使用 AI 相关功能时，会访问你配置的 AI 服务
- 如果你接入其他外部服务，则以该服务的实际配置为准

### 文件访问范围

插件会读取和写入以下范围的数据：

- 当前 Vault 中的 EPUB、Markdown、Canvas 与相关数据文件
- 插件目录下的状态、缓存与构建产物

## 适用场景

- 在 Obsidian 内统一管理阅读与知识沉淀
- 构建“原文 - 摘录 - 笔记 - 回链”的阅读闭环
- 需要把 EPUB 阅读和 Canvas / Markdown 组织方式结合起来
- 希望通过深链接快速返回书中上下文

## 开发

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
```

说明：

- 开发模式使用 Vite watch 流程
- 如果配置了对应的 Vault 路径，开发产物会自动同步到测试插件目录
- 桌面端开发构建会先写入 `.desktop-hot-reload/`，再同步到目标目录

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

本项目基于 [GPL-3.0-or-later](LICENSE) 协议发布。

## 作者与反馈

- Author: Rabbit (zhuzhige)
- GitHub: https://github.com/zhuzhige123
