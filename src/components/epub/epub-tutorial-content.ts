export type TutorialTabId = "basics" | "highlight" | "workflow" | "tools" | "credits";

export interface TutorialTab {
	id: TutorialTabId;
	label: string;
}

export interface TutorialListGroup {
	heading?: string;
	items: string[];
}

export interface TutorialColorItem {
	tone: "yellow" | "green" | "blue" | "red" | "purple";
	label: string;
	description: string;
}

export interface TutorialShortcutItem {
	keys: string[];
	description: string;
}

export interface TutorialButtonItem {
	icon: string;
	label: string;
	description: string;
}

export interface TutorialLinkItem {
	label: string;
	url: string;
}

export interface TutorialSection {
	title: string;
	paragraphs?: string[];
	listGroups?: TutorialListGroup[];
	colors?: TutorialColorItem[];
	code?: string;
	shortcuts?: TutorialShortcutItem[];
	buttons?: TutorialButtonItem[];
	links?: TutorialLinkItem[];
}

export type TutorialLanguage = "zh-CN" | "en-US";

export const EPUB_TUTORIAL_TABS_BY_LANG: Record<TutorialLanguage, TutorialTab[]> = {
	"zh-CN": [
		{ id: "basics", label: "基础阅读" },
		{ id: "highlight", label: "高亮批注" },
		{ id: "workflow", label: "摘录工作流" },
		{ id: "tools", label: "工具联动" },
		{ id: "credits", label: "致谢" },
	],
	"en-US": [
		{ id: "basics", label: "Basics" },
		{ id: "highlight", label: "Highlights" },
		{ id: "workflow", label: "Workflow" },
		{ id: "tools", label: "Tools" },
		{ id: "credits", label: "Credits" },
	],
};

export const EPUB_TUTORIAL_CONTENT_BY_LANG: Record<
	TutorialLanguage,
	Record<TutorialTabId, TutorialSection[]>
> = {
	"zh-CN": {
		basics: [
			{
				title: "打开与恢复",
				paragraphs: [
					"把书籍文件放进 Obsidian 仓库后，点击文件即可打开。阅读器会自动保存并恢复阅读进度、常用排版设置与当前阅读状态。",
					"当前支持 .epub、.mobi、.azw3、.fb2、.fbz、.txt、.cbz。通常 EPUB、FB2/FBZ、TXT 更适合结构化导出，CBZ 更偏图片阅读。",
				],
			},
			{
				title: "侧边栏与书架",
				paragraphs: [
					"阅读器支持局部侧边栏与全局书架视图，适合在同一套笔记环境中快速切换书籍、目录和标注。",
				],
				listGroups: [
					{
						items: [
							"目录：按章节快速跳转。",
							"笔记：查看当前书籍已回显的高亮、批注与相关内容。",
							"书签：管理当前页书签。",
							"我的书架：浏览仓库中的书籍文件，并从我的书架子视图返回当前书籍侧边栏。",
						],
					},
				],
			},
			{
				title: "阅读模式与版式",
				listGroups: [
					{
						heading: "阅读流",
						items: [
							"翻页模式：适合线性阅读与键盘翻页。",
							"连续滚动：适合长段浏览、脚注往返与快速搜索上下文。",
						],
					},
					{
						heading: "页面布局",
						items: [
							"单页：默认布局，适合绝大多数场景。",
							"双栏：更接近摊开书本的阅读感，开启后会自动使用宽版显示。",
						],
					},
					{
						heading: "宽度模式",
						items: [
							"standard：标准阅读宽度，适合长文沉浸阅读。",
							"full：宽版阅读宽度，在大屏上保留舒适留白。",
							"edge：真正全宽模式，尽量使用宿主可用宽度显示内容。",
						],
					},
				],
			},
			{
				title: "显示设置与辅助",
				paragraphs: [
					"阅读器设置不只包含宽度，还覆盖排版、脚注与顶部信息展示，适合按书籍类型微调。",
				],
				listGroups: [
					{
						items: [
							"排版面板支持调节行高、字间距、页边距，并可恢复默认值。",
							"连续滚动模式可单独开关右侧侧边翻页键。",
							"顶部贴纸支持自动、所在行显示、右侧单列三种布局。",
							"点击脚注序号可在“显示脚注浮窗”和“直接跳转脚注位置”之间切换。",
						],
					},
				],
			},
		],
		highlight: [
			{
				title: "标注样式",
				paragraphs: [
					"选中文本后会弹出工具栏，支持颜色高亮与多种线性标注样式。颜色、样式与定位信息会一起保存并回显。",
				],
				colors: [
					{ tone: "yellow", label: "黄色", description: "常规标记" },
					{ tone: "green", label: "绿色", description: "重点内容" },
					{ tone: "blue", label: "蓝色", description: "思考笔记" },
					{ tone: "red", label: "红色", description: "疑问标记" },
					{ tone: "purple", label: "紫色", description: "延伸联想" },
				],
				listGroups: [
					{
						heading: "样式",
						items: [
							"高亮：适合普通摘录。",
							"下划线：适合保留正文背景、强调关键句。",
							"删除线：适合标记应忽略、修订或待屏蔽内容。",
							"波浪线：适合问题点、疑问点或需要再次推敲的位置。",
						],
					},
				],
			},
			{
				title: "批注气泡与脚注浮窗",
				paragraphs: [
					"正文中的批注气泡只是额外提示，不会替代或削弱高亮、下划线、删除线、波浪线本身。",
					"只要摘录内容里存在 ---div--- 分隔区，阅读器就会在正文高亮旁显示批注气泡。点击气泡或高亮工具条中的“批注”都可以编辑内容。",
					"脚注序号点击行为可按你的习惯配置为“显示脚注浮窗”或“直接跳转到脚注位置”。",
				],
			},
			{
				title: "回显与同步",
				listGroups: [
					{
						items: [
							"高亮、样式、批注会在重新打开同一本书时自动回显。",
							"数据来源统一支持 Markdown、Canvas 与卡片数据，不依赖单独的黑盒数据库。",
							"溯源链接是回显与定位的权威信息，只要不破坏定位链接，就可以自由改写摘录正文。",
							"笔记文件更新后，阅读器会重新加载相关高亮，保持正文和笔记侧一致。",
						],
					},
				],
			},
		],
		workflow: [
			{
				title: "自动模式与选中工具栏",
				paragraphs: [
					"自动模式决定选中文本后的默认输出方式：关闭时更偏“复制”，开启时更偏“直接写入当前工作流”。",
				],
				listGroups: [
					{
						items: [
							"自动模式关闭：复制到剪贴板，适合临时引用。",
							"自动模式开启：更适合直接写入当前工作流；在已绑定 Canvas 的场景下，也会参与联动流程。",
							"选中工具栏支持复制或插入、搜索、制卡、阅读点、AI 等操作。",
						],
					},
				],
			},
			{
				title: "摘录格式与定位链接",
				paragraphs: [
					"阅读器会尽量为摘录附带精确定位信息，让你可以从笔记反跳回原文位置。",
					"如果摘录包含批注，推荐把批注写在 ---div--- 分隔区之后，后续会自动在正文显示批注气泡。",
				],
				code: "> [!EPUB|yellow] [[book.epub#^chapter-anchor|Chapter 1]]\n> 摘录正文\n> ---div---\n> 批注正文",
			},
			{
				title: "书签与阅读位置",
				listGroups: [
					{
						items: [
							"当前页书签：为当下页位留下快速回到入口。",
							"最后阅读点：保存你想长期保留的最近阅读位置。",
							"参考阅读位置：适合记录主线阅读锚点，便于在发散阅读后回到参考位置。",
							"增量阅读续读点：适合与增量阅读流程配合，作为下一次继续处理的入口。",
						],
					},
				],
			},
		],
		tools: [
			{
				title: "导出为 Markdown",
				paragraphs: ["导出入口以阅读器视图菜单为准，适合把内容沉淀回仓库中的长期笔记。"],
				listGroups: [
					{
						items: [
							"导出当前章节：把当前章转成 Markdown，并尽量把图片写成 Obsidian 友好的附件引用。",
							"导出本书高亮摘录：整理当前书籍的标注与摘录，便于后续再加工。",
						],
					},
				],
			},
			{
				title: "截图与 Canvas 联动",
				listGroups: [
					{
						heading: "截图",
						items: [
							"截图模式下可在阅读区域拖拽截图。",
							"图片模式：保存为图片文件；自动模式开启时可直接插入。",
							"嵌入模式：尽量提取文字并生成带定位的引用；自动模式关闭时会优先复制结果。",
						],
					},
					{
						heading: "Canvas",
						items: [
							"可以为当前书创建新的 Canvas 脑图，也可以绑定已有 Canvas。",
							"绑定后可打开、继续编辑或断开联动，适合做章节结构图、问题树和阅读路线。",
						],
					},
				],
			},
			{
				title: "常用入口与快捷键",
				shortcuts: [
					{
						keys: ["←", "→"],
						description: "翻页模式且 EPUB 视图获得焦点时切换前后页（连续滚动模式不占用方向键）。",
					},
					{
						keys: ["←", "→", "PageUp", "PageDown"],
						description: "段落阅读模式下面板获得焦点时，在段内或相邻段落间移动。",
					},
					{
						keys: ["Esc"],
						description: "关闭当前教程，或在已聚焦的阅读器弹层上退出当前层。",
					},
				],
				buttons: [
					{ icon: "list", label: "侧边栏", description: "切换目录、笔记、书签与书架相关入口。" },
					{
						icon: "a-large-small",
						label: "排版设置",
						description: "调整行高、字间距、页边距等阅读参数。",
					},
					{ icon: "arrow-up-down", label: "阅读流", description: "在翻页与连续滚动之间切换。" },
					{ icon: "scroll-text", label: "页面布局", description: "在单页与双栏布局之间切换。" },
					{ icon: "bookmark", label: "当前页书签", description: "记录当前页位。" },
					{ icon: "flag", label: "参考阅读位置", description: "保存或更新参考阅读锚点。" },
					{
						icon: "layout-dashboard",
						label: "Canvas 脑图",
						description: "创建、绑定或管理阅读脑图。",
					},
					{ icon: "camera", label: "截图工具", description: "进入截图工作流。" },
					{ icon: "zap", label: "自动模式", description: "切换复制型输出与自动插入型输出。" },
					{ icon: "circle-help", label: "使用教程", description: "再次打开本教程。" },
				],
			},
		],
		credits: [
			{
				title: "EPUB 解析与阅读内核",
				paragraphs: [
					"EPUB 文件阅读现已完全基于 foliate-js 内核，历史阅读定位与已有数据会尽量兼容迁移。",
				],
			},
			{
				title: "链接与知识沉淀",
				paragraphs: [
					"EPUB 精确链接与回跳工作流参考了 Obsidian PDF++ 的优秀思路，同时结合了 Obsidian 的双向链接与图谱能力。",
				],
			},
			{
				title: "阅读与 Canvas 联动",
				paragraphs: [
					"EPUB 阅读器与 Obsidian Canvas 的联动体验参考了 MarginNote 的阅读与脑图工作流，并继续沿着 Obsidian 原生文件体系演进。",
				],
			},
			{
				title: "段落阅读设计参考",
				paragraphs: [
					"段落阅读模式的设计思路参考了 Readest 阅读软件的段落模式体验，并结合 EPUB 阅读器自身的定位、摘录与脚注工作流做了适配。",
				],
			},
			{
				title: "工具条设计参考",
				paragraphs: ["选中文本后的工具条交互设计参考了微信读书的工具条体验。"],
			},
			{
				title: "词典插件兼容致谢",
				paragraphs: [
					"感谢群友为 Obsidian 开发的词典插件 obsdian-fingertip-translation。该插件原本支持 Obsidian Markdown 编辑界面的划词词典体验，经过兼容性处理后，也可以在本 EPUB 阅读器中正常使用。",
					"阅读器自身不内置词典功能，相关词典解释与弹窗能力由该外部插件提供。",
				],
				links: [
					{
						label: "obsdian-fingertip-translation",
						url: "https://github.com/huangchen-byte/obsdian-fingertip-translation",
					},
				],
			},
		],
	},
	"en-US": {
		basics: [
			{
				title: "Open and restore",
				paragraphs: [
					"Put a book file into your Obsidian vault and click it to open. The reader automatically saves and restores reading progress, typography preferences, and the current reading state.",
					"Currently supported formats are .epub, .mobi, .azw3, .fb2, .fbz, .txt, and .cbz. In practice, EPUB, FB2/FBZ, and TXT are better for structured export, while CBZ is more image-oriented.",
				],
			},
			{
				title: "Sidebar and bookshelf",
				paragraphs: [
					"The reader supports both a local sidebar and a global bookshelf view so you can switch between books, the table of contents, and annotations inside the same note-taking workspace.",
				],
				listGroups: [
					{
						items: [
							"TOC: jump quickly by chapter.",
							"Notes: review synced highlights, comments, and related content for the current book.",
							"Bookmarks: manage bookmarks for the current page.",
							"My Bookshelf: browse book files in the vault and return from the bookshelf subview to the current book sidebar.",
						],
					},
				],
			},
			{
				title: "Reading modes and layout",
				listGroups: [
					{
						heading: "Reading flow",
						items: [
							"Paged mode: best for linear reading and keyboard page turns.",
							"Scrolled mode: best for longer passages, footnote round-trips, and quickly searching nearby context.",
						],
					},
					{
						heading: "Page layout",
						items: [
							"Single page: the default layout for most situations.",
							"Double column: closer to the feel of an open book and automatically switches to a wider display.",
						],
					},
					{
						heading: "Width mode",
						items: [
							"standard: standard reading width for long-form immersive reading.",
							"full: a wider layout that still keeps comfortable margins on larger screens.",
							"edge: a true edge-to-edge mode that uses as much host width as possible.",
						],
					},
				],
			},
			{
				title: "Display settings and helpers",
				paragraphs: [
					"Reader settings cover more than width. They also include typography, footnotes, and top information display so you can tune the experience by book type.",
				],
				listGroups: [
					{
						items: [
							"The typography panel adjusts line height, letter spacing, and page margins, and can restore defaults.",
							"Scrolled mode can independently toggle the right-side page buttons.",
							"Top stickers support auto, inline, and right-rail layouts.",
							"Footnote marker clicks can switch between showing a footnote popover and jumping directly to the footnote.",
						],
					},
				],
			},
		],
		highlight: [
			{
				title: "Annotation styles",
				paragraphs: [
					"Selecting text opens the toolbar and supports color highlights plus multiple inline annotation styles. Color, style, and location data are all saved and restored together.",
				],
				colors: [
					{ tone: "yellow", label: "Yellow", description: "general marking" },
					{ tone: "green", label: "Green", description: "key content" },
					{ tone: "blue", label: "Blue", description: "thinking notes" },
					{ tone: "red", label: "Red", description: "questions and doubts" },
					{ tone: "purple", label: "Purple", description: "extended associations" },
				],
				listGroups: [
					{
						heading: "Styles",
						items: [
							"Highlight: best for standard excerpts.",
							"Underline: keeps the page background while emphasizing key sentences.",
							"Strikethrough: useful for content to ignore, revise, or conceal.",
							"Wavy underline: useful for problems, uncertainties, or passages that need another pass.",
						],
					},
				],
			},
			{
				title: "Comment bubbles and footnote popovers",
				paragraphs: [
					"Comment bubbles in the text are additional cues. They do not replace or weaken the highlight, underline, strikethrough, or wavy underline itself.",
					"As long as the excerpt contains a `---div---` separator, the reader shows a comment bubble beside the highlight. You can edit it from the bubble or from the toolbar comment action.",
					"Footnote marker clicks can be configured to show a popover preview or jump directly to the footnote location.",
				],
			},
			{
				title: "Restore and sync",
				listGroups: [
					{
						items: [
							"Highlights, styles, and comments automatically reappear when you reopen the same book.",
							"Data sources consistently support Markdown, Canvas, and card data instead of relying on a separate black-box database.",
							"Source links are the authoritative record for restoring and locating excerpts. As long as the link remains valid, you can freely rewrite the excerpt body.",
							"When a note file changes, the reader reloads the related highlights so the book view and note view stay in sync.",
						],
					},
				],
			},
		],
		workflow: [
			{
				title: "Auto mode and the selection toolbar",
				paragraphs: [
					"Auto mode decides the default output path after selecting text: off leans toward copying, while on leans toward writing directly into your current workflow.",
				],
				listGroups: [
					{
						items: [
							"Auto mode off: copy to the clipboard for temporary quoting.",
							"Auto mode on: better for writing directly into the current workflow and also participates in Canvas-linked flows.",
							"The selection toolbar supports copy or insert, search, card creation, reading points, AI actions, and more.",
						],
					},
				],
			},
			{
				title: "Excerpt format and source links",
				paragraphs: [
					"The reader tries to attach precise location data to excerpts so you can jump back from notes to the source passage.",
					"If an excerpt includes a comment, putting it after the `---div---` separator is recommended so the comment bubble can appear in the text automatically.",
				],
				code: "> [!EPUB|yellow] [[book.epub#^chapter-anchor|Chapter 1]]\n> Excerpt body\n> ---div---\n> Comment body",
			},
			{
				title: "Bookmarks and reading positions",
				listGroups: [
					{
						items: [
							"Current-page bookmark: leave a quick return point for the current page.",
							"Last reading point: save the recent reading location you want to keep long term.",
							"Reading reference point: record a main reading anchor so you can return after branching out.",
							"Incremental reading resume point: work with incremental reading as the next entry point for processing.",
						],
					},
				],
			},
		],
		tools: [
			{
				title: "Export to Markdown",
				paragraphs: [
					"Use the reader view menu as the export entry point when you want to turn reading output into long-term vault notes.",
				],
				listGroups: [
					{
						items: [
							"Export current chapter: convert the current chapter to Markdown and keep images as Obsidian-friendly attachments whenever possible.",
							"Export book highlights: organize annotations and excerpts from the current book for later refinement.",
						],
					},
				],
			},
			{
				title: "Screenshots and Canvas integration",
				listGroups: [
					{
						heading: "Screenshots",
						items: [
							"In screenshot mode you can drag a capture area over the reading viewport.",
							"Image mode: save as an image file and insert directly when auto mode is on.",
							"Embed mode: extract text when possible and generate a location-aware reference; when auto mode is off it prefers copying the result.",
						],
					},
					{
						heading: "Canvas",
						items: [
							"You can create a new Canvas map for the current book or bind an existing Canvas.",
							"After binding, you can open it, keep editing it, or disconnect it, which works well for chapter maps, question trees, and reading routes.",
						],
					},
				],
			},
			{
				title: "Common entry points and shortcuts",
				shortcuts: [
					{
						keys: ["←", "→"],
						description:
							"When paged mode is active and the EPUB view is focused, move to the previous or next page (scrolled mode does not use arrow keys).",
					},
					{
						keys: ["←", "→", "PageUp", "PageDown"],
						description:
							"In paragraph reading mode, move within or across paragraphs when the paragraph panel is focused.",
					},
					{
						keys: ["Esc"],
						description:
							"Close the tutorial, or dismiss the currently focused reader overlay.",
					},
				],
				buttons: [
					{
						icon: "list",
						label: "Sidebar",
						description:
							"Switch between TOC, notes, bookmarks, and bookshelf-related entry points.",
					},
					{
						icon: "a-large-small",
						label: "Typography",
						description:
							"Adjust line height, letter spacing, page margins, and other reading parameters.",
					},
					{
						icon: "arrow-up-down",
						label: "Reading flow",
						description: "Switch between paged and scrolled reading.",
					},
					{
						icon: "scroll-text",
						label: "Page layout",
						description: "Switch between single-page and double-column layouts.",
					},
					{
						icon: "bookmark",
						label: "Current bookmark",
						description: "Record the current page position.",
					},
					{
						icon: "flag",
						label: "Reference point",
						description: "Save or update the reading reference anchor.",
					},
					{
						icon: "layout-dashboard",
						label: "Canvas map",
						description: "Create, bind, or manage the reading map.",
					},
					{
						icon: "camera",
						label: "Screenshot tool",
						description: "Enter the screenshot workflow.",
					},
					{
						icon: "zap",
						label: "Auto mode",
						description: "Switch between copy-first and auto-insert output.",
					},
					{ icon: "circle-help", label: "Tutorial", description: "Open this tutorial again." },
				],
			},
		],
		credits: [
			{
				title: "EPUB parsing and reading engine",
				paragraphs: [
					"EPUB reading is now fully based on the foliate-js engine, while historical reading positions and existing data are migrated as compatibly as possible.",
				],
			},
			{
				title: "Links and knowledge capture",
				paragraphs: [
					"The precise EPUB link and jump-back workflow was inspired by the excellent ideas behind Obsidian PDF++ and combined with Obsidian backlinks and graph capabilities.",
				],
			},
			{
				title: "Reading and Canvas integration",
				paragraphs: [
					"The integration between the EPUB reader and Obsidian Canvas was inspired by MarginNote-style reading and mind-map workflows while continuing to evolve within Obsidian’s native file system.",
				],
			},
			{
				title: "Paragraph mode inspiration",
				paragraphs: [
					"The paragraph reading mode was inspired by the paragraph mode experience in the Readest reading app, then adapted to fit this reader’s location, excerpt, and footnote workflows.",
				],
			},
			{
				title: "Toolbar interaction reference",
				paragraphs: [
					"The text-selection toolbar interaction takes inspiration from the reading toolbar experience in WeRead.",
				],
			},
			{
				title: "Dictionary plugin compatibility",
				paragraphs: [
					"Thanks to the community-built Obsidian plugin `obsdian-fingertip-translation`. It originally brought in-editor word-lookup support to Obsidian Markdown editing and can now also work inside this EPUB reader after compatibility handling.",
					"The reader itself does not bundle a dictionary. Dictionary explanations and related popovers are provided by that external plugin.",
				],
				links: [
					{
						label: "obsdian-fingertip-translation",
						url: "https://github.com/huangchen-byte/obsdian-fingertip-translation",
					},
				],
			},
		],
	},
};
