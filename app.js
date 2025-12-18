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

// Request-Response grouping: Map from requestId -> { request, response, groupEl, requestTime }
const requestGroups = new Map();

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

// Helper: Get type classification for styling
function getTypeInfo(log) {
    const t = log.type || 'unknown';
    let typeClass = 'type-meta';
    let label = 'LOG';
    let flowLabel = '';
    
    // Flow Icons
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
    
    return { typeClass, label, flowLabel };
}

// Helper: Update token stats from log
function updateTokenStats(log) {
    const usage = log.data?.usageMetadata || log.data?.response?.usageMetadata;
    if (usage) {
        const input = usage.promptTokenCount || 0;
        const output = usage.candidatesTokenCount || 0;
        gInput += input;
        gOutput += output;
        updateGlobalTokensUI();
        return { input, output, total: usage.totalTokenCount || (input + output) };
    }
    return null;
}

// Helper: Format duration in ms to human readable
function formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
}

// Main function to add log entries
function addLog(log) {
    const requestId = log.requestId;
    const t = log.type || 'unknown';
    const isRequest = t.includes('_request') || (t.includes('request') && !t.includes('response'));
    const isResponse = t.includes('_response') || (t.includes('response') && !t.includes('request'));
    
    // If has requestId and is request/response, use grouped rendering
    if (requestId && (isRequest || isResponse)) {
        renderGroupedLog(log, requestId, isRequest);
        return;
    }
    
    // Fallback: render as standalone item (for logs without requestId)
    renderStandaloneLog(log);
}

// Render grouped request-response pair
function renderGroupedLog(log, requestId, isRequest) {
    if (isRequest) {
        // Create new group
        const groupEl = document.createElement('div');
        groupEl.className = 'request-group';
        
        const { typeClass, label } = getTypeInfo(log);
        
        // Group header (use hollow arrows: ▷ for collapsed, ▽ for expanded)
        const headerEl = document.createElement('div');
        headerEl.className = 'request-group-header';
        headerEl.innerHTML = `
            <span class="group-arrow"><i class="fa-solid fa-angle-down"></i></span>
            <span class="timestamp">${new Date(log.timestamp).toLocaleTimeString()}</span>
            <span class="type-badge ${typeClass}">${label}</span>
            <span class="group-summary">${log.summary || 'Request'}</span>
            <span class="response-status" style="margin-left:auto;"></span>
        `;
        
        // Items container
        const itemsEl = document.createElement('div');
        itemsEl.className = 'request-group-items';
        
        // Request item
        const reqItem = createGroupItem(log, true);
        itemsEl.appendChild(reqItem);
        
        groupEl.appendChild(headerEl);
        groupEl.appendChild(itemsEl);
        
        // Toggle expand/collapse on header click
        headerEl.onclick = (e) => {
            if (e.target.closest('.request-group-item')) return; // Don't toggle if clicking an item
            groupEl.classList.toggle('collapsed');
            // Update arrow icon: ▷ for collapsed, ▽ for expanded
            const arrow = headerEl.querySelector('.group-arrow');
            arrow.innerHTML = groupEl.classList.contains('collapsed') ? '<i class="fa-solid fa-angle-right"></i>' : '<i class="fa-solid fa-angle-down"></i>';
        };
        
        // Store in map
        requestGroups.set(requestId, {
            request: log,
            response: null,
            groupEl,
            itemsEl,
            headerEl,
            requestTime: log.timestamp
        });
        
        timeline.appendChild(groupEl);
        timeline.scrollTop = timeline.scrollHeight;
        
    } else {
        // Response: append to existing group
        const group = requestGroups.get(requestId);
        
        if (group) {
            group.response = log;
            
            // Calculate duration
            const duration = log.timestamp - group.requestTime;
            
            // Update header with response status
            const statusEl = group.headerEl.querySelector('.response-status');
            const statusCode = log.statusCode;
            const statusColor = statusCode >= 200 && statusCode < 300 ? '#4caf50' : '#f44336';
            statusEl.innerHTML = `
                <span style="color:${statusColor}; font-weight:bold; font-size:10px;">${statusCode || ''}</span>
                <span class="response-time">${formatDuration(duration)}</span>
            `;
            
            // Add response item
            const resItem = createGroupItem(log, false);
            group.itemsEl.appendChild(resItem);
            
            // Update token stats
            updateTokenStats(log);
            
            // Auto-collapse after response received
            group.groupEl.classList.add('collapsed');
            const arrow = group.headerEl.querySelector('.group-arrow');
            arrow.innerHTML = '<i class="fa-solid fa-angle-right"></i>';
            
            timeline.scrollTop = timeline.scrollHeight;
        } else {
            // No matching request found, render standalone
            renderStandaloneLog(log);
        }
    }
}

// Create a single item within a group
function createGroupItem(log, isRequest) {
    const itemEl = document.createElement('div');
    itemEl.className = 'request-group-item';
    
    const { flowLabel } = getTypeInfo(log);
    
    let extraInfo = '';
    
    if (isRequest) {
        // Show model info for requests
        if (log.data?.model) {
            extraInfo = `<span style="color:#ce9178; font-size:10px;">${log.data.model.replace('models/', '')}</span>`;
        }
    } else {
        // Show token usage for responses
        const tokenStats = updateTokenStats(log);
        if (tokenStats) {
            extraInfo = `<span style="font-size:10px; color:#666;">Token: <span style="color:#b5cea8;">${tokenStats.input}</span> + <span style="color:#dcdcaa;">${tokenStats.output}</span> = <b>${tokenStats.total}</b></span>`;
        }
    }
    
    // URL preview
    let urlPreview = '';
    if (log.url) {
        try {
            const urlObj = new URL(log.url);
            const pathParts = urlObj.pathname.split('/');
            const shortUrl = pathParts.pop() || pathParts.pop() || urlObj.pathname;
            urlPreview = `<span style="color:#888; font-size:10px;" title="${log.url}">${shortUrl}</span>`;
        } catch (e) {
            urlPreview = `<span style="color:#888; font-size:10px;">${log.url}</span>`;
        }
    }
    
    itemEl.innerHTML = `
        ${flowLabel}
        <span>${isRequest ? 'Request' : 'Response'}</span>
        ${urlPreview ? `<span style="margin-left:8px;">${urlPreview}</span>` : ''}
        ${extraInfo ? `<span style="margin-left:auto;">${extraInfo}</span>` : ''}
    `;
    
    itemEl.onclick = (e) => {
        e.stopPropagation();
        document.querySelectorAll('.list-item, .request-group-item').forEach(i => i.classList.remove('active'));
        itemEl.classList.add('active');
        currentLog = log;
        render();
    };
    
    return itemEl;
}

// Render standalone log (for items without requestId)
function renderStandaloneLog(log) {
    const el = document.createElement('div');
    el.className = 'list-item';
    
    const { typeClass, label, flowLabel } = getTypeInfo(log);

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
    const usage = log.data?.usageMetadata || log.data?.response?.usageMetadata;
    if (usage) {
        const input = usage.promptTokenCount || 0;
        const output = usage.candidatesTokenCount || 0;
        const total = usage.totalTokenCount || (input + output);
        
        gInput += input;
        gOutput += output;
        updateGlobalTokensUI();

        el.innerHTML += `<div style="font-size:10px; color:#666; margin-top:2px; margin-left: 20px;">
            Token: <span style="color:#b5cea8;">${input}</span> <span style="color:#569cd6;">+</span> <span style="color:#dcdcaa;">${output}</span> = <b>${total}</b>
        </div>`;
    }
    
    el.onclick = () => {
        document.querySelectorAll('.list-item, .request-group-item').forEach(i => i.classList.remove('active'));
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