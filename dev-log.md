# Gemini Agent Inspector - Development Log
# Gemini Agent Inspector - 开发日志

**Current Version / 当前版本:** 3.2
**Last Updated / 最后更新:** 2025-12-18

## 1. Project Overview / 项目概述
...
### Metadata & Diagnostics / 元数据与诊断
- **Token Usage:**
  **Token 用量:**
  - **Timeline:** Quick summary (Input + Output = Total) on response items.
    **时间线摘要:** 响应项上的快速摘要（输入 + 输出 = 总计）。
  - **Detail View:** Comprehensive breakdown of Prompt vs Candidate tokens, Modality (Text/Image), Cached Content, Traffic Type, and Thinking tokens.
    **详细视图:** 全面分解提示词与候选词 Token、模态（文本/图像）、缓存内容、流量类型和思维 Token。
- **Model Usage Status:** Visualizes project-wide model usage quotas and remaining fractions with progress bars.
  **模型使用状态:** 通过进度条可视化展示项目范围内的模型使用配额及剩余比例。
- **Model Information:** Displays the specific model used (e.g., `gemini-1.5-pro`) on request items.
...
- **v3.3 (2025-12-18):**
  - **Request Metadata Visualization:** Added display for Request URL and HTTP Method in both the timeline and rich view.
    **请求元数据可视化:** 在时间线和富文本视图中增加了对请求 URL 和 HTTP 方法的显示。
  - Improved timeline list items with short URL paths for easier identification.
    改进了时间线列表项，显示简短的 URL 路径以便于识别。

- **v3.2 (2025-12-18):**
  - **Model Usage Visualization:** Added rich rendering for model usage requests and responses, showing remaining quotas with progress bars.
    **模型使用量可视化:** 增加对模型使用量请求和响应的富文本渲染，使用进度条展示剩余配额。
  - Bumped version to 3.2 for cache busting.
    升级版本至 3.2 以更新缓存。

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
