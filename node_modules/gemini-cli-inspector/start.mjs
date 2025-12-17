#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Config ---
const HOOK_FILENAME = 'hook.mjs'; // Updated filename

// --- 1. Locate Hook Script ---
const hookPathRaw = path.join(__dirname, HOOK_FILENAME);
if (!fs.existsSync(hookPathRaw)) {
    console.error(`\x1b[31m[Inspector Error] Cannot find ${HOOK_FILENAME}. Please ensure it is in the same directory as this script.\x1b[0m`);
    process.exit(1);
}
// Critical fix: Must convert to file:// URL on Windows, otherwise it's treated as a protocol
const hookPath = pathToFileURL(hookPathRaw).href;

// --- 2. Smart Locate Gemini CLI Entry ---
import os from 'node:os';

const CONFIG_PATH = path.join(os.homedir(), '.gemini-inspectorrc');

// Helper: Load user config
function loadConfig() {
    if (fs.existsSync(CONFIG_PATH)) {
        try {
            return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        } catch (e) { /* ignore */ }
    }
    return {};
}

// Helper: Save user config
function saveConfig(config) {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
        console.log(`\x1b[32m[Inspector] Config saved to: ${CONFIG_PATH}\x1b[0m`);
    } catch (e) {
        console.warn(`\x1b[33m[Inspector] Failed to save config: ${e.message}\x1b[0m`);
    }
}

// Priority: 
// 1. CLI argument --cli-path
// 2. Env var GEMINI_CLI_PATH
// 3. User config ~/.gemini-inspectorrc
// 4. Auto-detect (Global npm)

let targetCliPath = null;
const args = process.argv.slice(2);
const cliPathArgIndex = args.indexOf('--cli-path');
let cliPathArg = null;

if (cliPathArgIndex !== -1 && args[cliPathArgIndex + 1]) {
    cliPathArg = args[cliPathArgIndex + 1];
    // Remove from args so they don't get passed to the child process
    process.argv.splice(cliPathArgIndex + 2, 2); 
}

const envCliPath = process.env.GEMINI_CLI_PATH;
const userConfig = loadConfig();

// Attempt to verify path
if (cliPathArg && fs.existsSync(cliPathArg)) {
    targetCliPath = cliPathArg;
    // If user explicitly specified path, save it (for simplicity, we auto-update)
    // Update config if path differs for better UX
    if (userConfig.cliPath !== cliPathArg) {
        saveConfig({ ...userConfig, cliPath: cliPathArg });
    }
} else if (envCliPath && fs.existsSync(envCliPath)) {
    targetCliPath = envCliPath;
} else if (userConfig.cliPath && fs.existsSync(userConfig.cliPath)) {
    targetCliPath = userConfig.cliPath;
} else {
    // Auto-detect
    try {
        const globalNpmRoot = (await import('node:child_process')).execSync('npm root -g').toString().trim();
        // Common path check
        const candidates = [
            path.join(process.cwd(), 'node_modules', '@google', 'gemini-cli', 'dist', 'index.js'), // Local install first
            path.join(globalNpmRoot, '@google', 'gemini-cli', 'dist', 'index.js'),
            path.join(globalNpmRoot, 'gemini-chat-cli', 'dist', 'index.js'), 
        ];
        
        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) {
                targetCliPath = candidate;
                break;
            }
        }
    } catch (e) {
        // Ignore errors
    }
}

if (!targetCliPath) {
    console.error('\x1b[31m[Inspector Error] Cannot locate Gemini CLI entry file.\x1b[0m');
    console.error('\nPlease specify the path using one of the following methods:');
    console.error('1. CLI Arg: gemini-inspector --cli-path <path/to/dist/index.js>');
    console.error('2. Env Var: set GEMINI_CLI_PATH=<path/to/dist/index.js>');
    console.error(`3. Config File: Add { "cliPath": "..." } to ${CONFIG_PATH}`);
    console.error('\nIf Gemini CLI is not installed, please run: npm install -g @google/gemini-cli');
    process.exit(1);
}

// --- 3. Launch and Takeover ---
// Construct args: node --no-warnings --import ./hook.mjs target-cli.js [UserArgs...]
const nodeArgs = [
    '--no-warnings',       // Suppress Node.js experimental warnings
    '--import', hookPath,  // Inject Hook
    targetCliPath,         // Target program
    ...process.argv.slice(2) // Pass through user args (e.g. chat "hello")
];

console.log(`\x1b[36m[Inspector] Launching target: ${targetCliPath}\x1b[0m`);

// Spawn process, stdio: 'inherit' ensures direct pass-through
// This preserves CLI interactivity (input, colors, loading animations)
const child = spawn(process.execPath, nodeArgs, {
    stdio: 'inherit',
    env: {
        ...process.env,
        FORCE_COLOR: '1' // Force enable colors
    }
});

// Listen for exit code
child.on('exit', (code) => {
    process.exit(code ?? 0);
});

// Handle signals (e.g. Ctrl+C)
process.on('SIGINT', () => {
    // Usually stdio: inherit handles Ctrl+C, but explicit handling is safer.
    // However, letting child handle SIGINT is standard here.
    // Just ensure parent doesn't die immediately.
});