# Gemini CLI Inspector (Unofficial)

> **Disclaimer:** This project is an unofficial tool created by the community. It is NOT affiliated with, endorsed by, or connected to Google in any way.

A visual inspector and debugger for the [Gemini CLI](https://github.com/google/gemini-cli-tool). This tool hooks into the Gemini CLI process to visualize the communication flow, including:

- 🛰️ **Request/Response Inspection**: See exactly what data is being sent to and from the Gemini API.
- 🚦 **Router Decisions**: Visualize how the model routing logic works.
- 🛠️ **Tool Calls**: Debug function calls and their results.
- 📊 **Token Usage**: Track input and output token consumption in real-time.

## Installation

You can install this tool globally using npm:

```bash
npm install -g gemini-cli-inspector
```

## Usage

Instead of running `gemini` directly, simply use `gemini-inspector` with the same arguments. It will automatically locate your Gemini CLI installation and launch it with the inspector attached.

```bash
# Before:
gemini chat "Hello world"

# After:
gemini-inspector chat "Hello world"
```

The inspector will automatically open a dashboard in your default browser (usually at `http://localhost:3001`).

### Configuration

If the tool cannot find your Gemini CLI installation automatically, you can specify the path using the `--cli-path` argument or set it in the config.

**Option 1: Command Line Argument**
```bash
gemini-inspector --cli-path /path/to/gemini-cli/dist/index.js chat "Hello"
```

**Option 2: Environment Variable**
```bash
set GEMINI_CLI_PATH=E:\my-custom-cli\index.js
gemini-inspector chat "Hello"
```

## Troubleshooting

If you see an error like `无法定位 Gemini CLI 入口文件` (Cannot locate Gemini CLI entry file):
1. Ensure you have the official CLI installed: `npm install -g @google/gemini-cli`
2. Or point to your local development version using `--cli-path`.

## License

Apache-2.0
