/**
 * Main Application Logic for Gemini Inspector v3
 */

const timeline = document.getElementById('timeline');
const richView = document.getElementById('rich-view');
const jsonPanel = document.getElementById('json-panel');
const statusDot = document.querySelector('.status-dot');
const statusText = document.getElementById('status');

let currentLog = null;
let gInput = 0;
let gOutput = 0;

function connect() {
    const evtSource = new EventSource('/events');
    
    evtSource.onopen = () => {
        statusDot.classList.add('connected');
        statusText.innerHTML = '<span class="status-dot connected"></span>Connected';
    };

    evtSource.onerror = () => {
        statusDot.classList.remove('connected');
        statusText.innerHTML = '<span class="status-dot"></span>Reconnecting...';
    };

    evtSource.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        addLog(msg);
    };
}

function addLog(log) {
    const el = document.createElement('div');
    el.className = 'list-item';
    
    let typeClass = 'type-meta';
    let label = 'LOG';
    let flowLabel = '';
    
    const t = log.type || 'unknown';
    
    // Flow Icons (Text Based)
    if (t.includes('_request') || t.includes('request')) {
        flowLabel = '<span class="flow-label flow-icon-req">↑</span>';
    } else if (t.includes('_response') || t.includes('response')) {
        flowLabel = '<span class="flow-label flow-icon-res">↓</span>';
    }

    // Badge Colors
    if (t.includes('routing')) {
        typeClass = 'type-routing';
        label = 'ROUTER';
    } else if (t.includes('tool_result') || t.includes('tool_call')) {
        typeClass = 'type-tool-res';
        label = 'TOOL';
    } else if (t.includes('chat_request')) {
        typeClass = 'type-chat-req';
        label = 'USER';
    } else if (t.includes('chat_response')) {
        typeClass = 'type-chat-res';
        label = 'MODEL';
    } else if (t.includes('auth')) {
        typeClass = 'type-auth';
        label = 'AUTH';
    } else if (t.includes('init_metadata')) {
        typeClass = 'type-init';
        label = 'INIT';
    } else if (t.includes('user_profile')) {
        typeClass = 'type-profile';
        label = 'PROFILE';
    } else if (t.includes('identity')) {
        typeClass = 'type-identity';
        label = 'IDENTITY';
    } else if (t.includes('config')) {
        typeClass = 'type-config';
        label = 'CONFIG';
    } else if (t.includes('error')) {
        typeClass = 'type-error';
        label = 'ERROR';
        flowLabel = '<span class="flow-label flow-icon-error">❌</span>';
    } else if (t === 'meta_request' || t === 'meta_response') {
        typeClass = 'type-meta';
        label = 'META';
    }

    const status = log.statusCode;
    const statusHtml = status ? `<span style="color:${status >= 200 && status < 300 ? '#4caf50' : '#f44336'}; font-weight:bold; margin-left:5px; font-size:10px;">${status}</span>` : '';

    el.innerHTML = `
        <div class="timestamp">${new Date(log.timestamp).toLocaleTimeString()}</div>
        <div>${flowLabel} <span class="type-badge ${typeClass}">${label}</span> ${log.summary || 'Details'}${statusHtml}</div>
    `;

    // Add URL Preview
    if (log.url) {
        try {
            const urlObj = new URL(log.url);
            const pathParts = urlObj.pathname.split('/');
            const shortUrl = pathParts.pop() || pathParts.pop() || urlObj.pathname;
            el.innerHTML += `<div style="font-size:10px; color:#888; margin-top:2px; margin-left: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${log.url}">${shortUrl}</div>`;
        } catch (e) {
            el.innerHTML += `<div style="font-size:10px; color:#888; margin-top:2px; margin-left: 20px;">${log.url}</div>`;
        }
    }

    // Add Model Name (for requests)
    if (log.data && log.data.model) {
        el.innerHTML += `<div style="font-size:10px; color:#aaa; margin-top:2px; margin-left: 20px;">Model: <span style="color:#ce9178;">${log.data.model.replace('models/', '')}</span></div>`;
    }

    // Add Token Usage (for responses)
    // Check both root usageMetadata (merged) and nested response.usageMetadata
    const usage = log.data.usageMetadata || log.data.response?.usageMetadata;
    if (usage) {
        const input = usage.promptTokenCount || 0;
        const output = usage.candidatesTokenCount || 0;
        const total = usage.totalTokenCount || (input + output);
        
        // Update Global Stats
        gInput += input;
        gOutput += output;
        updateGlobalTokensUI();

        el.innerHTML += `<div style="font-size:10px; color:#666; margin-top:2px; margin-left: 20px;">
            Token: <span style="color:#b5cea8;">${input}</span> <span style="color:#569cd6;">+</span> <span style="color:#dcdcaa;">${output}</span> = <b>${total}</b>
        </div>`;
    }
    
    el.onclick = () => {
        document.querySelectorAll('.list-item').forEach(i => i.classList.remove('active'));
        el.classList.add('active');
        currentLog = log;
        render();
    };
    
    timeline.appendChild(el);
    timeline.scrollTop = timeline.scrollHeight;
}

function updateGlobalTokensUI() {
    const el = document.getElementById('global-tokens');
    if (el) el.style.display = 'block';
    
    const fmt = (n) => n.toLocaleString();
    
    const eInput = document.getElementById('g-input');
    const eOutput = document.getElementById('g-output');
    const eTotal = document.getElementById('g-total');
    
    if (eInput) eInput.textContent = fmt(gInput);
    if (eOutput) eOutput.textContent = fmt(gOutput);
    if (eTotal) eTotal.textContent = fmt(gInput + gOutput);
}

function render() {
    if (!currentLog) return;
    
    // 1. Render Source View (Right Panel)
    // This generates IDs for each JSON node
    JsonViewer.render(currentLog.data, jsonPanel);
    
    // 2. Render Rich View (Left Panel)
    // This generates data-path attributes linking to the IDs above
    Renderer.render(currentLog, richView);
}

// Start connection
connect();