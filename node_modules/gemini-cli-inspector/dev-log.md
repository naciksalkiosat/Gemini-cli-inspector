# Gemini Agent Inspector - Development Log
# Gemini Agent Inspector - 开发日志

**Current Version / 当前版本:** 3.1
**Last Updated / 最后更新:** 2025-12-17

## 1. Project Overview / 项目概述

The **Gemini Agent Inspector** is a dedicated debugging and visualization tool for the Gemini CLI agent. It intercepts HTTP traffic between the CLI and Google's Generative AI APIs to provide a real-time, human-readable timeline of the agent's thought process, tool usage, and interactions.
**Gemini Agent Inspector** 是专为 Gemini CLI Agent 设计的调试与可视化工具。它通过拦截 CLI 与 Google Generative AI API 之间的 HTTP 流量，实时展示 Agent 的思维过程、工具使用和交互详情。

It is built as a lightweight "Hook" script (`inspector/hook.mjs`) that monkey-patches `https.request` in the Node.js process, spawning a local web server to display events via Server-Sent Events (SSE).
它作为一个轻量级的 "Hook" 脚本 (`inspector/hook.mjs`) 构建，通过在 Node.js 进程中 Monkey-patch `https.request` 方法，启动一个本地 Web 服务器并通过 Server-Sent Events (SSE) 推送事件。

## 2. Key Features (Implemented) / 核心功能 (已实现)

### Core Visualization / 核心可视化
- **Rich Timeline:** A chronological list of all API events (Requests, Responses, Auth, Init).
  **丰富的时间线:** 按时间顺序展示所有 API 事件（请求、响应、认证、初始化）。
- **Dual View:**
  **双视图模式:**
  - **Rich View:** A beautifully formatted, Markdown-rendered representation of the conversation.
    **富文本视图:** 格式优美、支持 Markdown 渲染的对话展示。
  - **JSON View:** A raw, interactive JSON tree for deep inspection of the exact API payload.
    **JSON 视图:** 原始的、可交互的 JSON 树，用于深入检查 API 载荷。
- **Streaming Support:** Aggregates streaming chunks (SSE) from the API into single, coherent response blocks for easier reading.
  **流式响应支持:** 将 API 的流式分块 (SSE) 聚合成连贯的响应块，便于阅读。

### Specialized Rendering / 专用渲染
- **Chat Interface:** Renders requests and responses as a familiar chat interface with user/model roles.
  **聊天界面:** 将请求和响应渲染为熟悉的用户/模型角色对话界面。
- **Collapsible Turns:** Chat turns are collapsible, with the latest turn auto-expanded.
  **可折叠轮次:** 聊天轮次可折叠，最新轮次自动展开。
- **Turn Summaries:** Collapsed headers show a preview of content, role badges, and special indicators (IDE Context, Tool Call, Tool Result).
  **轮次摘要:** 折叠的标题栏显示内容预览、角色徽章和特殊指示器（IDE 上下文、工具调用、工具结果）。
- **Thinking Process:** Explicitly visualizes the model's "Thinking" blocks (Hidden Thoughts) separately from the final response.
  **思维过程:** 显式地将模型的 "Thinking" 块（隐藏思维）与最终响应分开可视化。
- **Thought Deduplication:** Automatically detects and hides raw thought text if it's repeated in the final text response.
  **思维去重:** 如果原始思维文本在最终响应中重复出现，自动检测并隐藏。
- **Routing Insights:** Visualizes the "Router" model's decision-making process (e.g., "Why did I choose Flash-Lite vs Pro?").
  **路由洞察:** 可视化 "Router" 模型的决策过程（例如，“为什么选择 Flash-Lite 而不是 Pro？”）。
- **Tooling Support:** Special rendering for `functionCall` and `functionResponse`, with formatted cards for complex tools like `replace` and `write_file`.
  **工具支持:** 对 `functionCall` 和 `functionResponse` 进行特殊渲染，为 `replace` 和 `write_file` 等复杂工具提供格式化卡片。
- **IDE Context:** Automatically detects and formats "IDE Context" injections (active file, cursor position, open tabs) into a readable UI block.
  **IDE 上下文:** 自动检测并将注入的 "IDE Context"（当前文件、光标位置、打开的标签页）格式化为可读的 UI 块。

### Metadata & Diagnostics / 元数据与诊断
- **Token Usage:**
  **Token 用量:**
  - **Timeline:** Quick summary (Input + Output = Total) on response items.
    **时间线摘要:** 响应项上的快速摘要（输入 + 输出 = 总计）。
  - **Detail View:** Comprehensive breakdown of Prompt vs Candidate tokens, Modality (Text/Image), Cached Content, Traffic Type, and Thinking tokens.
    **详细视图:** 全面分解提示词与候选词 Token、模态（文本/图像）、缓存内容、流量类型和思维 Token。
- **Model Information:** Displays the specific model used (e.g., `gemini-1.5-pro`) on request items.
  **模型信息:** 在请求项上显示使用的具体模型（例如 `gemini-1.5-pro`）。
- **System Events:**
  **系统事件:**
  - **Auth:** OAuth2 Token exchanges, scopes, and expiration.
    **认证:** OAuth2 Token 交换、作用域和过期时间。
  - **Init:** Client initialization metadata (IDE version, OS, Plugin type).
    **初始化:** 客户端初始化元数据（IDE 版本、操作系统、插件类型）。
  - **Profile:** User tier and subscription status.
    **个人资料:** 用户层级和订阅状态。
  - **Config:** Experiment flags and feature toggles.
    **配置:** 实验标志和功能开关。
  - **Identity:** User email and ID token claims.
    **身份:** 用户邮箱和 ID Token 声明。

### Technical & UX / 技术与体验
- **Zero-Config:** Runs automatically via `node --import` without changing the main application code.
  **零配置:** 通过 `node --import` 自动运行，无需修改主应用程序代码。
- **Cache Busting:** Static assets use versioning query params (`?v=3.1`) to prevent stale UI during development.
  **缓存更新:** 静态资源使用版本查询参数 (`?v=3.1`) 以防止开发期间的 UI 过期。
- **Smart Formatting:** Markdown rendering for text content, syntax highlighting for code blocks.
  **智能格式化:** 文本内容的 Markdown 渲染，代码块的语法高亮。

## 3. Architecture / 架构

- **Backend (`hook.mjs`):**
  **后端 (`hook.mjs`):**
  - Intercepts `https.request`.
    拦截 `https.request`。
  - Classifies traffic (Routing vs Chat vs Tool vs Meta).
    流量分类（路由 vs 聊天 vs 工具 vs 元数据）。
  - Broadcasts events to the frontend via SSE (`/events`).
    通过 SSE (`/events`) 广播事件到前端。
  - Serves static UI files.
    提供静态 UI 文件服务。
- **Frontend (`app.js`):**
  **前端 (`app.js`):**
  - Connects to SSE stream.
    连接 SSE 流。
  - Manages the timeline list.
    管理时间线列表。
  - Dispatches rendering to `Renderer` and `JsonViewer`.
    分发渲染任务给 `Renderer` 和 `JsonViewer`。
- **Renderer (`renderer.js`):**
  **渲染器 (`renderer.js`):**
  - Pure functional component strategy (HTML string generation).
    纯函数组件策略（HTML 字符串生成）。
  - Handles all specific logic for visual components (Badges, Cards, Markdown).
    处理视觉组件（徽章、卡片、Markdown）的所有特定逻辑。
- **Styling (`styles.css`):**
  **样式 (`styles.css`):**
  - Dark mode native.
    原生暗黑模式。
  - VS Code-inspired aesthetics.
    受 VS Code 启发的美学设计。

## 4. Pending / Roadmap / 待办事项与路线图

- [ ] **Session Management:** Export/Import full session logs (JSON/HTML) for sharing bug reports.
  **会话管理:** 导出/导入完整会话日志 (JSON/HTML) 以分享 Bug 报告。
- [ ] **Replay Capability:** Ability to "Mock" a response by replaying a saved session (Advanced).
  **回放能力:** 通过回放保存的会话来 "Mock" 响应（高级功能）。
- [ ] **VS Code Integration:** Embed the Inspector directly inside a VS Code webview panel.
  **VS Code 集成:** 将 Inspector 直接嵌入 VS Code webview 面板中。
- [ ] **Filter/Search:** Text search across the entire timeline history.
  **过滤/搜索:** 全局时间线历史的文本搜索。
- [ ] **Diff View:** For `replace` tool calls, show a side-by-side diff of the file change (Currently shows vertical diff).
  **Diff 视图:** 为 `replace` 工具调用显示并排的文件变更差异（目前显示垂直差异）。

## 5. Recent Changelog / 最近更新日志

- **v3.1 (2025-12-17):**
  - **Bilingual Support:** Updated documentation to include Chinese translations.
    **双语支持:** 更新文档以包含中文翻译。
  - **Added Tools Visualization:** Now displays the full list of available tools and their JSON schemas in the request view.
    **新增工具可视化:** 在请求视图中显示可用工具的完整列表及其 JSON Schema。
  - **Added Generation Config:** Visualizes configuration parameters (Temperature, TopP, Thinking Config, etc.) in the request view.
    **新增生成配置:** 在请求视图中可视化配置参数（Temperature, TopP, Thinking Config 等）。
  - **Token Usage Details:** Added breakdown for Traffic Type (Provisioned vs Custom) and Cache details.
    **Token 用量详情:** 增加了流量类型（预置 vs 自定义）和缓存详情的细分。
  - **Process Lifecycle Fix:** Added `server.unref()` and `socket.unref()` to ensure the Inspector doesn't prevent the CLI process from exiting when tasks are done.
    **进程生命周期修复:** 添加了 `server.unref()` 和 `socket.unref()`，确保 Inspector 不会阻止 CLI 进程在任务完成后退出。
  - Changed Tools Visualization to be collapsible (default collapsed) in request view.
    将工具可视化改为可折叠（默认折叠）。
  - Added Model Name display in timeline.
    在时间线中添加模型名称显示。
  - Improved Chat Turn UI with collapsible headers and quick-glance "Tips" (IDE, TOOL, RES).
    改进聊天轮次 UI，增加可折叠标题和快速概览提示 (IDE, TOOL, RES)。
  - Fixed caching issues with static assets.
    修复静态资源的缓存问题。
  - Fixed text alignment and layout issues in the timeline.
    修复时间线中的文本对齐和布局问题。

- **v3.0:** Initial "Rich View" implementation with specialized renderers for all major event types.
  **v3.0:** 初始 "富文本视图" 实现，包含针对所有主要事件类型的专用渲染器。
