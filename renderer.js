/**
 * Renderer for Gemini Inspector (Rich View)
 * Handles HTML generation for Requests and Responses.
 */

const Renderer = {
    // Utility to create interactive attributes
    // Accepts an optional existingClass to merge with the interactive class
    link: function(path, existingClass = '') {
        const classes = existingClass ? `${existingClass} interactive-element` : 'interactive-element';
        if (!path) return existingClass ? `class="${existingClass}"` : '';
        return `class="${classes}" onclick="event.stopPropagation(); JsonViewer.highlight('${path}')"`;
    },

    simpleMarkdown: function(text) {
        if (!text) return '';
        return text
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/```(\w*)([\s\S]*?)```/g, '<div class="md-block-code">$2</div>')
            .replace(/`([^`]+)`/g, '<span class="md-code">$1</span>')
            .replace(/\*\*([^*]+)\*\*/g, '<span class="md-bold">$1</span>')
            .replace(/^\* (.*$)/gm, '<div class="md-list-item">$1</div>')
            .replace(/\n/g, '<br>');
    },

    // Helper to render tool arguments with special formatting for replace/write_file
    renderToolArgs: function(name, args) {
        args = args || {};
        let argsHtml = '';

        if (name === 'replace') {
            argsHtml = `
                <div style="margin-bottom:5px;"><span style="color:#9cdcfe;">file_path:</span> <span style="color:#ce9178;">"${args.file_path}"</span></div>
                <div style="margin-bottom:5px;"><span style="color:#9cdcfe;">instruction:</span> <span style="color:#ce9178;">"${args.instruction}"</span></div>
                
                <div style="margin-top:8px; color:#9cdcfe; font-size:10px; margin-bottom:2px;">OLD_STRING:</div>
                <pre style="background:#3c1e1e; color:#ce9178; padding:5px; border-radius:3px; border:1px solid #5a2e2e; overflow-x:auto;">${this.simpleMarkdown(args.old_string || '')}</pre>
                
                <div style="margin-top:8px; color:#9cdcfe; font-size:10px; margin-bottom:2px;">NEW_STRING:</div>
                <pre style="background:#1e3c1e; color:#9cdcfe; padding:5px; border-radius:3px; border:1px solid #2e5a2e; overflow-x:auto;">${this.simpleMarkdown(args.new_string || '')}</pre>
            `;
        } else if (name === 'write_file') {
            argsHtml = `
                <div style="margin-bottom:5px;"><span style="color:#9cdcfe;">file_path:</span> <span style="color:#ce9178;">"${args.file_path}"</span></div>
                <div style="margin-top:8px; color:#9cdcfe; font-size:10px; margin-bottom:2px;">CONTENT:</div>
                <pre style="background:#1e1e1e; color:#d4d4d4; padding:5px; border-radius:3px; border:1px solid #333; overflow-x:auto;">${this.simpleMarkdown(args.content || '')}</pre>
            `;
        } else {
            // Generic rendering: iterate all keys
            argsHtml = Object.entries(args).map(([k, v]) => {
                const valStr = typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v);
                if (valStr.length > 50 || valStr.includes('\n')) {
                    return `
                        <div style="margin-bottom:8px;">
                            <span style="color:#9cdcfe;">${k}:</span>
                            <pre style="margin-top:2px; background:#1e1e1e; color:#ce9178; padding:5px; border-radius:3px; border:1px solid #333; overflow-x:auto;">${this.simpleMarkdown(valStr)}</pre>
                        </div>`;
                } else {
                    return `<div style="margin-bottom:2px;"><span style="color:#9cdcfe;">${k}:</span> <span style="color:#ce9178;">"${valStr.replace(/"/g, '&quot;')}"</span></div>`;
                }
            }).join('');
        }
        return argsHtml;
    },

    render: function(currentLog, container) {
        const data = currentLog.data;
        const t = currentLog.type || '';
        
        container.innerHTML = '';

        // Routing Decision (Special)
        if (t === 'model_routing_response') {
            this.renderRoutingResponse(data, container, 'root');
            return;
        }

        // Auth Token (Special)
        if (t === 'auth_token_response') {
            this.renderAuthTokenResponse(data, container, 'root');
            return;
        }

        // Init Metadata (Special)
        if (t === 'init_metadata_request') {
            this.renderInitMetadataRequest(data, container, 'root');
            return;
        }

        // User Profile (Special)
        if (t === 'user_profile_response') {
            this.renderUserProfileResponse(data, container, 'root');
            return;
        }

        // Identity Information (Special)
        if (t === 'identity_response') {
            this.renderIdentityResponse(data, container, 'root');
            return;
        }

        // Configuration (Special)
        if (t === 'config_response') {
            this.renderConfigResponse(data, container, 'root');
            return;
        }

        // Tool Result Request (Special handling to render as chat request)
        if (t === 'tool_result_request') {
             const basePath = data.request ? 'root.request' : 'root';
             this.renderGeminiRequest(data, container, basePath);
             return;
        }

        // Generic Request/Response
        if (t.includes('response')) {
            const basePath = data.response ? 'root.response' : 'root';
            this.renderGeminiResponse(data, container, basePath);
        } else if (t.includes('request')) {
            const basePath = data.request ? 'root.request' : 'root';
            this.renderGeminiRequest(data, container, basePath);
        } else {
            container.innerHTML = '<div style="color:#888; font-style:italic;">No rich preview available for this event type (' + t + ').</div>';
        }
    },

    renderRoutingResponse: function(data, container, basePath) {
        let decision = { model_choice: 'Unknown', reasoning: 'No reasoning provided' };
        const payload = data.response || data;
        const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (text) {
            try {
                const parsed = JSON.parse(text);
                if (parsed.model_choice) decision = parsed;
            } catch (e) {
                decision.reasoning = text;
            }
        }

        container.innerHTML = `
            <div style="padding:15px; background:#2d2d30; border-radius:6px; border-left:4px solid #8e44ad;" ${this.link(basePath)}>
                <h3 style="margin-top:0; color:#8e44ad;">Routing Decision</h3>
                <div style="font-size:16px; margin-bottom:10px;">Selected Model: <b style="color:white;">${decision.model_choice}</b></div>
                <div style="background:#1e1e1e; padding:10px; border-radius:4px; font-family:'Consolas',monospace; font-size:13px;">
                    <div style="color:#6a9955;">// ${decision.reasoning}</div>
                </div>
            </div>
        `;
    },

    renderAuthTokenResponse: function(data, container, basePath) {
        const payload = data.response || data;
        const token = payload.access_token || 'N/A';
        const expiry = payload.expires_in || 0;
        const scope = payload.scope || '';
        const tokenType = payload.token_type || 'Bearer';
        
        // Format Expiry
        const expiryText = expiry > 60 ? `${Math.floor(expiry/60)}m ${expiry%60}s` : `${expiry}s`;

        container.innerHTML = `
            <div style="padding:15px; background:#2d2d30; border-radius:6px; border-left:4px solid #f1c40f;" ${this.link(basePath)}>
                <h3 style="margin-top:0; color:#f1c40f;">Authentication Success</h3>
                
                <div style="margin-bottom:15px;">
                    <div style="font-size:11px; color:#888; margin-bottom:4px; font-weight:bold;">ACCESS TOKEN (${tokenType})</div>
                    <div style="background:#1e1e1e; padding:8px; border-radius:4px; font-family:'Consolas',monospace; color:#f1c40f; word-break:break-all;">
                        ${token.substring(0, 15)}...${token.substring(token.length - 10)}
                    </div>
                </div>

                <div style="display:flex; gap:20px; margin-bottom:15px;">
                     <div>
                        <div style="font-size:11px; color:#888; margin-bottom:4px; font-weight:bold;">EXPIRES IN</div>
                        <div style="font-size:14px; font-weight:bold;">${expiryText}</div>
                     </div>
                </div>

                <div>
                    <div style="font-size:11px; color:#888; margin-bottom:4px; font-weight:bold;">SCOPES</div>
                    <div style="background:#1e1e1e; padding:8px; border-radius:4px; font-family:'Consolas',monospace; font-size:12px; color:#9cdcfe;">
                        ${scope.split(' ').map(s => `<div style="margin-bottom:2px;">• ${s}</div>`).join('')}
                    </div>
                </div>
            </div>
        `;
    },

    renderInitMetadataRequest: function(data, container, basePath) {
        const request = data.request || data;
        const meta = request.metadata || {};
        
        container.innerHTML = `
            <div style="padding:15px; background:#2d2d30; border-radius:6px; border-left:4px solid #16a085;" ${this.link(basePath)}>
                <h3 style="margin-top:0; color:#16a085;">Client Initialization</h3>
                
                <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:15px;">
                    <div>
                        <div style="font-size:11px; color:#888; margin-bottom:4px; font-weight:bold;">PLUGIN TYPE</div>
                        <div style="background:#1e1e1e; padding:8px; border-radius:4px; font-family:'Consolas',monospace; color:#1abc9c;">
                            ${meta.pluginType || 'N/A'}
                        </div>
                    </div>
                    <div>
                        <div style="font-size:11px; color:#888; margin-bottom:4px; font-weight:bold;">IDE TYPE</div>
                        <div style="background:#1e1e1e; padding:8px; border-radius:4px; font-family:'Consolas',monospace; color:#d4d4d4;">
                            ${meta.ideType || 'N/A'}
                        </div>
                    </div>
                    <div>
                        <div style="font-size:11px; color:#888; margin-bottom:4px; font-weight:bold;">PLATFORM</div>
                        <div style="background:#1e1e1e; padding:8px; border-radius:4px; font-family:'Consolas',monospace; color:#d4d4d4;">
                            ${meta.platform || 'N/A'}
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    renderUserProfileResponse: function(data, container, basePath) {
        const payload = data.response || data;
        const tier = payload.currentTier || {};
        const project = payload.cloudaicompanionProject || 'N/A';
        const manageUrl = payload.manageSubscriptionUri || '#';

        container.innerHTML = `
            <div style="padding:15px; background:#2d2d30; border-radius:6px; border-left:4px solid #9b59b6;" ${this.link(basePath)}>
                <h3 style="margin-top:0; color:#9b59b6;">User Profile</h3>
                
                <div style="margin-bottom:20px;">
                    <div style="font-size:11px; color:#888; margin-bottom:4px; font-weight:bold;">CURRENT TIER</div>
                    <div style="background:#1e1e1e; padding:12px; border-radius:4px; border:1px solid #444;">
                        <div style="font-size:16px; font-weight:bold; color:white; margin-bottom:5px;">${tier.name || 'Unknown Tier'}</div>
                        <div style="font-size:12px; color:#aaa; margin-bottom:8px;">${tier.description || ''}</div>
                        <div style="font-size:10px; color:#666; font-family:'Consolas',monospace;">ID: ${tier.id}</div>
                    </div>
                </div>

                <div style="margin-bottom:15px;">
                    <div style="font-size:11px; color:#888; margin-bottom:4px; font-weight:bold;">CLOUD PROJECT</div>
                    <div style="background:#1e1e1e; padding:8px; border-radius:4px; font-family:'Consolas',monospace; color:#9b59b6;">
                        ${project}
                    </div>
                </div>

                ${manageUrl !== '#' ? `
                <div style="margin-top:15px;">
                    <a href="${manageUrl}" target="_blank" style="display:inline-block; font-size:12px; color:#3498db; text-decoration:none; border:1px solid #3498db; padding:5px 10px; border-radius:4px;">
                        Manage Subscription ↗
                    </a>
                </div>
                ` : ''}
            </div>
        `;
    },

    renderIdentityResponse: function(data, container, basePath) {
        const payload = data.response || data;
        const email = payload.email || 'N/A';
        const emailVerified = payload.email_verified === 'true' ? 'Yes' : 'No';
        const sub = payload.sub || 'N/A';
        const scope = payload.scope || '';
        const expTimestamp = payload.exp ? new Date(parseInt(payload.exp) * 1000).toLocaleString() : 'N/A';
        const expiresIn = payload.expires_in || 'N/A';
        const azp = payload.azp || 'N/A';
        const aud = payload.aud || 'N/A';

        container.innerHTML = `
            <div style="padding:15px; background:#2d2d30; border-radius:6px; border-left:4px solid #e67e22;" ${this.link(basePath)}>
                <h3 style="margin-top:0; color:#e67e22;">Identity Information</h3>
                
                <div style="margin-bottom:15px;">
                    <div style="font-size:11px; color:#888; margin-bottom:4px; font-weight:bold;">EMAIL</div>
                    <div style="background:#1e1e1e; padding:8px; border-radius:4px; font-family:'Consolas',monospace; color:#e67e22;">
                        ${email} (${emailVerified})
                    </div>
                </div>

                <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:15px; margin-bottom:15px;">
                    <div>
                        <div style="font-size:11px; color:#888; margin-bottom:4px; font-weight:bold;">USER ID (SUB)</div>
                        <div style="background:#1e1e1e; padding:8px; border-radius:4px; font-family:'Consolas',monospace; color:#d4d4d4; word-break:break-all;">
                            ${sub}
                        </div>
                    </div>
                    <div>
                        <div style="font-size:11px; color:#888; margin-bottom:4px; font-weight:bold;">EXPIRATION</div>
                        <div style="background:#1e1e1e; padding:8px; border-radius:4px; font-family:'Consolas',monospace; color:#d4d4d4;">
                            ${expTimestamp} (in ${expiresIn}s)
                        </div>
                    </div>
                </div>

                <div style="margin-bottom:15px;">
                    <div style="font-size:11px; color:#888; margin-bottom:4px; font-weight:bold;">CLIENT ID (AZP)</div>
                    <div style="background:#1e1e1e; padding:8px; border-radius:4px; font-family:'Consolas',monospace; color:#d4d4d4; word-break:break-all;">
                        ${azp}
                    </div>
                </div>

                <div style="margin-bottom:15px;">
                    <div style="font-size:11px; color:#888; margin-bottom:4px; font-weight:bold;">AUDIENCE (AUD)</div>
                    <div style="background:#1e1e1e; padding:8px; border-radius:4px; font-family:'Consolas',monospace; color:#d4d4d4; word-break:break-all;">
                        ${aud}
                    </div>
                </div>

                <div>
                    <div style="font-size:11px; color:#888; margin-bottom:4px; font-weight:bold;">SCOPES</div>
                    <div style="background:#1e1e1e; padding:8px; border-radius:4px; font-family:'Consolas',monospace; font-size:12px; color:#9cdcfe;">
                        ${scope.split(' ').map(s => `<div style="margin-bottom:2px;">• ${s}</div>`).join('')}
                    </div>
                </div>
            </div>
        `;
    },

    renderConfigResponse: function(data, container, basePath) {
        const payload = data.response || data;
        const experiments = payload.experimentIds || [];
        const flags = payload.flags || [];

        // Categorize Flags
        const boolFlags = flags.filter(f => 'boolValue' in f);
        const stringFlags = flags.filter(f => 'stringValue' in f && f.stringValue);
        const numFlags = flags.filter(f => 'intValue' in f || 'floatValue' in f);
        const otherFlags = flags.filter(f => !('boolValue' in f) && !('stringValue' in f && f.stringValue) && !('intValue' in f) && !('floatValue' in f));

        const boolTrue = boolFlags.filter(f => f.boolValue).length;
        const boolFalse = boolFlags.length - boolTrue;

        container.innerHTML = `
            <div style="padding:15px; background:#2d2d30; border-radius:6px; border-left:4px solid #34495e;" ${this.link(basePath)}>
                <h3 style="margin-top:0; color:#34495e;">Configuration & Experiments</h3>
                
                <!-- Experiments -->
                <div style="margin-bottom:20px;">
                    <div style="font-size:11px; color:#888; margin-bottom:4px; font-weight:bold;">EXPERIMENT IDS (${experiments.length})</div>
                    <div style="background:#1e1e1e; padding:10px; border-radius:4px; font-family:'Consolas',monospace; font-size:11px; color:#7f8c8d; max-height:100px; overflow-y:auto; display:flex; flex-wrap:wrap; gap:5px;">
                        ${experiments.map(id => `<span style="background:#333; padding:2px 6px; border-radius:3px;">${id}</span>`).join('')}
                    </div>
                </div>

                <!-- Feature Flags: Strings (Important) -->
                ${stringFlags.length > 0 ? `
                <div style="margin-bottom:20px;">
                    <div style="font-size:11px; color:#888; margin-bottom:4px; font-weight:bold;">STRING CONFIGURATIONS</div>
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        ${stringFlags.map(f => `
                            <div style="background:#1e1e1e; padding:8px; border-radius:4px; font-family:'Consolas',monospace; font-size:12px;">
                                ${f.flagId ? `<span style="color:#d35400; font-weight:bold; margin-right:5px;">ID ${f.flagId}</span>` : ''}
                                <span style="color:#ce9178;">"${this.simpleMarkdown(f.stringValue)}"</span>
                            </div>
                        `).join('')}
                    </div>
                </div>` : ''}

                <!-- Feature Flags: Numbers -->
                ${numFlags.length > 0 ? `
                <div style="margin-bottom:20px;">
                    <div style="font-size:11px; color:#888; margin-bottom:4px; font-weight:bold;">NUMERIC THRESHOLDS</div>
                    <div style="background:#1e1e1e; padding:10px; border-radius:4px; font-family:'Consolas',monospace; font-size:11px; display:grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap:8px;">
                        ${numFlags.map(f => {
                            const val = f.intValue !== undefined ? f.intValue : f.floatValue;
                            return `
                                <div style="color:#b5cea8;">
                                    ${f.flagId ? `<span style="color:#666;">ID ${f.flagId}:</span>` : ''} 
                                    ${val}
                                </div>`;
                        }).join('')}
                    </div>
                </div>` : ''}

                <!-- Feature Flags: Booleans -->
                <div style="margin-bottom:15px;">
                    <div style="font-size:11px; color:#888; margin-bottom:4px; font-weight:bold;">BOOLEAN FLAGS</div>
                    <div style="display:flex; gap:15px;">
                        <div style="background:#1e1e1e; padding:6px 12px; border-radius:4px; font-size:12px;">
                            <span style="color:#2ecc71;">●</span> True: <b>${boolTrue}</b>
                        </div>
                        <div style="background:#1e1e1e; padding:6px 12px; border-radius:4px; font-size:12px;">
                            <span style="color:#e74c3c;">●</span> False: <b>${boolFalse}</b>
                        </div>
                        <div style="font-size:11px; color:#666; align-self:center;">(Details hidden)</div>
                    </div>
                </div>
            </div>
        `;
    },

    renderGeminiResponse: function(data, container, basePath) {
        const actualResponse = data.response || data;
        const candidates = actualResponse.candidates;
        const usage = actualResponse.usageMetadata; // Capture usage metadata
        
        if (!candidates || candidates.length === 0) {
            container.innerHTML = '<div style="padding:10px; color:#f0ad4e;">⚠️ Response has no candidates</div>';
            // Even if no candidates, usage might exist
            if (usage) this.renderUsageMetadata(usage, container);
            return;
        }

        const parts = candidates[0].content?.parts || [];
        
        container.innerHTML += `<div class="role-badge role-model">MODEL</div>`;
        
        let accumulatedThought = '';

        parts.forEach((part, index) => {
            const partPath = `${basePath}.candidates.0.content.parts.${index}`;

            if (part.thought) {
                accumulatedThought += part.text;
                // [Fix] Pass existing class 'thought-box'
                container.innerHTML += `
                    <div ${this.link(partPath, 'thought-box')}>
                        <div class="thought-label">Thinking Process</div>
                        ${this.simpleMarkdown(part.text)}
                    </div>`;
            } else if (part.functionCall) {
                const fc = part.functionCall;
                // [Fix] Use renderToolArgs
                const argsHtml = this.renderToolArgs(fc.name, fc.args);
                
                // [Fix] Pass existing class 'tool-card'
                container.innerHTML += `
                    <div ${this.link(partPath + '.functionCall', 'tool-card')}>
                        <div class="tool-header"><span class="tool-icon">🔧</span>${fc.name}</div>
                        <div class="tool-args" style="display:block;">${argsHtml}</div>
                    </div>`;
            } else if (part.text) {
                 let textToShow = part.text;
                 if (accumulatedThought) {
                     const normalize = (s) => s.replace(/\s+/g, '');
                     const normThought = normalize(accumulatedThought);
                     const normText = normalize(textToShow);
                     if (normText.startsWith(normThought) && normThought.length > 10) {
                        let currentNormLen = 0;
                        let cutIndex = 0;
                        for (let i = 0; i < textToShow.length; i++) {
                            if (!/\s/.test(textToShow[i])) currentNormLen++;
                            if (currentNormLen === normThought.length) { cutIndex = i + 1; break; }
                        }
                        if (cutIndex > 0) textToShow = textToShow.substring(cutIndex);
                     }
                 }
                 if (textToShow.trim()) {
                     container.innerHTML += `<div ${this.link(partPath + '.text')}>${this.simpleMarkdown(textToShow)}</div>`;
                 }
            } else if (part.functionResponse) {
                 const funcRes = part.functionResponse;
                 let contentDisplay = '';
                 let rawContent = funcRes.response;
                 if (rawContent && typeof rawContent === 'object') {
                     if (rawContent.content) rawContent = rawContent.content;
                     else if (rawContent.result) rawContent = rawContent.result;
                     else if (rawContent.output) rawContent = rawContent.output;
                 }
                 if (typeof rawContent === 'string') {
                     contentDisplay = `<div style="font-size:12px; white-space:pre-wrap; font-family:'Consolas',monospace;">${this.simpleMarkdown(rawContent)}</div>`;
                 } else {
                     contentDisplay = `<pre>${JSON.stringify(rawContent, null, 2)}</pre>`;
                 }

                 container.innerHTML += `
                    <div style="margin-bottom:20px; padding:10px; border-radius:4px; background:#2d2d30; border:1px solid #444;" ${this.link(partPath + '.functionResponse')}> 
                        <div style="font-size:11px; color:#888; font-weight:bold; margin-bottom:5px;">TOOL RESPONSE (${funcRes.name})</div>
                        ${contentDisplay}
                    </div>`;
            }
        });

        // Render Usage Metadata at the bottom
        if (usage) {
            this.renderUsageMetadata(usage, container);
        }
    },

    renderUsageMetadata: function(usage, container) {
        if (!usage) return;
        
        const rows = [
            { label: 'Prompt Tokens', value: usage.promptTokenCount, details: usage.promptTokensDetails },
            { label: 'Response Tokens', value: usage.candidatesTokenCount, details: usage.candidatesTokensDetails },
            { label: 'Total Tokens', value: usage.totalTokenCount },
            { label: 'Cached Content', value: usage.cachedContentTokenCount, details: usage.cacheTokensDetails },
            { label: 'Thinking Tokens', value: usage.thoughtsTokenCount }
        ];

        let html = `
            <div style="margin-top:20px; padding:15px; background:#252526; border-radius:6px; border:1px solid #333;">
                <h4 style="margin:0 0 10px 0; color:#ccc; font-size:12px; text-transform:uppercase; border-bottom:1px solid #444; padding-bottom:5px;">Token Usage Statistics</h4>
                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap:10px;">
        `;

        rows.forEach(row => {
            if (row.value !== undefined && row.value !== null) {
                 html += `
                    <div style="background:#1e1e1e; padding:8px; border-radius:4px;">
                        <div style="font-size:11px; color:#888; margin-bottom:2px;">${row.label}</div>
                        <div style="font-size:14px; font-weight:bold; color:#d4d4d4;">${row.value.toLocaleString()}</div>
                 `;
                 
                 if (row.details && row.details.length > 0) {
                     html += `<div style="margin-top:5px; border-top:1px solid #333; padding-top:5px;">`;
                     row.details.forEach(d => {
                         html += `<div style="font-size:10px; color:#666; display:flex; justify-content:space-between;">
                                    <span>${d.modality}</span>
                                    <span>${d.tokenCount.toLocaleString()}</span>
                                  </div>`;
                     });
                     html += `</div>`;
                 }
                 html += `</div>`;
            }
        });

        html += `</div>`; // End grid

        if (usage.trafficType) {
             html += `
                <div style="margin-top:10px; padding-top:5px; border-top:1px dashed #444; font-size:11px; color:#666; text-align:right;">
                    Traffic Type: <span style="color:#ce9178;">${usage.trafficType}</span>
                </div>`;
        }

        html += `</div>`; // End container
        container.innerHTML += html;
    },

    renderUsageStats: function(usage) {
        if (!usage || Object.keys(usage).length === 0) return '';
        
        const total = usage.totalTokenCount || 0;
        const prompt = usage.promptTokenCount || 0;
        const cached = usage.cachedContentTokenCount || 0;
        const candidates = usage.candidatesTokenCount || 0;
        const thoughts = usage.thoughtsTokenCount || 0;
        const traffic = usage.trafficType; // Optional

        // Format numbers (e.g. 120309 -> 120,309)
        const fmt = (n) => n.toLocaleString();

        let html = `<div class="usage-stats">`;
        
        // Total
        html += `<div class="usage-item"><span class="usage-label">TOTAL</span><span class="usage-value">${fmt(total)}</span></div>`;
        
        // Prompt (with cache info)
        html += `<div class="usage-item"><span class="usage-label">INPUT</span><span class="usage-value">${fmt(prompt)}`;
        if (cached > 0) {
            html += `<span class="usage-sub" title="Cached Content">(${fmt(cached)} ⚡)</span>`;
        }
        html += `</span></div>`;

        // Output
        html += `<div class="usage-item"><span class="usage-label">OUTPUT</span><span class="usage-value">${fmt(candidates)}</span></div>`;

        // Thoughts (if any)
        if (thoughts > 0) {
             html += `<div class="usage-item"><span class="usage-label">THOUGHTS</span><span class="usage-value">${fmt(thoughts)}</span></div>`;
        }

        // Traffic
        if (traffic) {
            let trafficLabel = traffic === 'PROVISIONED_THROUGHPUT' ? 'PROVISIONED' : traffic;
            if (trafficLabel.length > 15) trafficLabel = 'CUSTOM'; 
            html += `<div class="usage-item"><span class="usage-label">MODE</span><span class="usage-value" style="font-size:10px;">${trafficLabel}</span></div>`;
        }

        html += `</div>`;
        return html;
    },

    renderGeminiRequest: function(data, container, basePath) {
        const request = data.request || data;
        const contents = request.contents || [];
        
        // 1. System Instruction
        if (request.systemInstruction) {
            const sysPath = basePath + '.systemInstruction';
            const sysText = request.systemInstruction.parts?.[0]?.text || '';
            
            container.innerHTML += `
                <div style="margin-bottom:15px; border:1px solid #444; border-radius:4px; overflow:hidden;">
                    <div style="background:#333; padding:8px 12px; font-size:11px; font-weight:bold; color:#ccc; display:flex; align-items:center;" ${this.link(sysPath)}>
                        <span style="margin-right:5px;">⚙️</span> SYSTEM INSTRUCTION
                    </div>
                    <div style="padding:10px; background:#252526; font-size:12px; color:#aaa; max-height:200px; overflow-y:auto; border-top:1px solid #444;" ${this.link(sysPath + '.parts.0.text')}>
                        ${this.simpleMarkdown(sysText)}
                    </div>
                </div>`;
        }

        // 2. Tools
        container.innerHTML += this.renderTools(request.tools, basePath);

        // 3. Generation Config
        container.innerHTML += this.renderGenerationConfig(request.generationConfig, basePath);

        // 4. Contents
        contents.forEach((content, contentIndex) => {
            const contentPath = `${basePath}.contents.${contentIndex}`;
            const isLatest = contentIndex === contents.length - 1;
            container.innerHTML += this.renderContentItem(content, isLatest, contentPath);
        });
    },

    renderContentItem: function(content, isLatest, basePath) {
        const role = content.role || 'user';
        const parts = content.parts || [];
        
        // Analysis Flags
        let hasIdeContext = false;
        let hasToolCall = false;
        let hasToolResult = false;

        // Generate Preview Text & Analyze
        let previewText = '';
        for (const p of parts) {
            if (p.text) {
                // Check for IDE Context
                if ((p.text.includes("user's editor context") || p.text.includes("summary of changes")) && p.text.includes("```json")) {
                    hasIdeContext = true;
                }
                previewText += p.text.replace(/\s+/g, ' ');
            } else if (p.functionCall) {
                hasToolCall = true;
                previewText += `[ToolCall: ${p.functionCall.name}] `;
            } else if (p.functionResponse) {
                hasToolResult = true;
                previewText += `[ToolResult: ${p.functionResponse.name}] `;
            }
        }
        
        // Clean up preview text
        if (hasIdeContext && previewText.length > 30) {
             // If it's mostly context, show a cleaner preview
             previewText = previewText.replace(/user's editor context.*/, '').trim() || 'IDE Context Update';
        }
        if (previewText.length > 80) previewText = previewText.substring(0, 80) + '...';
        if (!previewText) previewText = '(Empty Content)';

        // Determine Open State
        // Always open if it's the latest turn OR if it has tool results (usually important for context)
        const isOpen = isLatest ? 'open' : '';
        const highlightStyle = isLatest ? 'border-color: #007acc;' : '';

        // Generate Tips HTML
        let tipsHtml = '<div class="turn-tips">';
        if (hasIdeContext) tipsHtml += '<span class="turn-tip tip-ide" title="Contains IDE Context">IDE</span>';
        if (hasToolCall) tipsHtml += '<span class="turn-tip tip-call" title="Contains Tool Call">TOOL</span>';
        if (hasToolResult) tipsHtml += '<span class="turn-tip tip-res" title="Contains Tool Result">RES</span>';
        tipsHtml += '</div>';

        let html = `
        <details class="chat-turn" ${isOpen} style="${highlightStyle}">
            <summary class="chat-turn-header">
                <span class="role-badge role-${role}">${role.toUpperCase()}</span>
                ${tipsHtml}
                <span class="chat-preview">${this.escapeHtml(previewText)}</span>
            </summary>
            <div class="chat-turn-body">`;
        
        parts.forEach((part, partIndex) => {
            const partPath = `${basePath}.parts.${partIndex}`;
            
            if (part.text) {
                // IDE Context Logic
                if ((part.text.includes("user's editor context") || part.text.includes("summary of changes")) && part.text.includes("```json")) {
                    try {
                        const match = part.text.match(/```json\s*([\s\S]*?)\s*```/);
                        if (match) {
                            const context = JSON.parse(match[1]);
                            let innerHtml = '';
                            const contextPath = partPath + '.text';

                            // 1. Snapshot: Active File
                            if (context.activeFile) {
                                const f = context.activeFile;
                                const cursorStr = f.cursor ? `Ln ${f.cursor.line}, Col ${f.cursor.character}` : '';
                                innerHtml += `
                                    <div style="font-size:13px; font-weight:bold; color:#d4d4d4; margin-bottom:5px;">Active File</div>
                                    <div style="background:#1e1e1e; padding:8px; border-radius:4px; margin-bottom:10px;">
                                        <div style="font-family:'Consolas',monospace; font-size:12px; color:#9cdcfe; word-break:break-all; margin-bottom:4px;">
                                            ${f.path || 'None'} 
                                            ${cursorStr ? `<span style="color:#569cd6; margin-left:8px; font-size:11px;">${cursorStr}</span>` : ''}
                                        </div>
                                        ${f.selectedText ? `
                                            <div style="margin-top:6px; border-top:1px solid #333; padding-top:6px;">
                                                <div style="font-size:10px; color:#666; margin-bottom:2px; font-weight:bold;">SELECTED TEXT</div>
                                                <div style="font-family:'Consolas',monospace; font-size:12px; color:#ce9178; white-space:pre-wrap; max-height:150px; overflow-y:auto; border-left:2px solid #ce9178; padding-left:6px;">${this.simpleMarkdown(f.selectedText)}</div>
                                            </div>
                                        ` : ''}
                                    </div>`;
                            }

                            // 2. Delta: Changes
                            if (context.changes) {
                                const c = context.changes;
                                if (c.cursorMoved) {
                                    const cm = c.cursorMoved;
                                    innerHtml += `
                                        <div style="font-size:13px; font-weight:bold; color:#d4d4d4; margin:10px 0 5px;">📍 Cursor Moved</div>
                                        <div style="font-family:'Consolas',monospace; font-size:12px; color:#9cdcfe; background:#1e1e1e; padding:8px; border-radius:4px; margin-bottom:5px; word-break:break-all;">
                                            ${cm.path} <span style="color:#569cd6;">:${cm.cursor?.line}:${cm.cursor?.character}</span>
                                        </div>`;
                                }
                                if (c.selectionChanged) {
                                    const sc = c.selectionChanged;
                                    innerHtml += `
                                        <div style="font-size:13px; font-weight:bold; color:#d4d4d4; margin:10px 0 5px;">🟦 Selection Changed</div>
                                        <div style="font-family:'Consolas',monospace; font-size:11px; color:#888; margin-bottom:4px; word-break:break-all;">${sc.path}</div>
                                        <div style="font-family:'Consolas',monospace; font-size:12px; color:#ce9178; background:#1e1e1e; padding:8px; border-radius:4px; border-left:3px solid #007acc; white-space:pre-wrap; max-height:200px; overflow-y:auto;">${this.simpleMarkdown(sc.selectedText)}</div>`;
                                }
                            }

                            // 3. Snapshot: Other Open Files
                            if (context.otherOpenFiles?.length) {
                                innerHtml += `
                                    <div style="font-size:13px; font-weight:bold; color:#d4d4d4; margin-bottom:5px; margin-top:10px;">Other Open Files</div>
                                    <div style="font-family:'Consolas',monospace; font-size:12px; color:#888;">
                                        ${context.otherOpenFiles.map(f => `<div style="margin-bottom:2px;">📄 ${f.split(/[\\/]/).pop()} <span style="font-size:10px; opacity:0.6;">(${f})</span></div>`).join('')}
                                    </div>`;
                            }

                            if (innerHtml) {
                                html += `
                                <div ${this.link(contextPath)} style="margin-bottom:20px; border:1px solid #007acc; border-radius:6px; overflow:hidden; background:#252526;">
                                    <div style="background:#007acc; color:white; padding:5px 10px; font-size:11px; font-weight:bold; display:flex; align-items:center;">
                                        <span style="margin-right:5px;">📝</span> IDE CONTEXT
                                    </div>
                                    <div style="padding:10px;">
                                        ${innerHtml}
                                    </div>
                                </div>`;
                            } else {
                                html += `
                                    <div ${this.link(partPath + '.text')} style="margin-bottom:20px; padding:10px; border-radius:4px; background:#1e1e1e; border:1px solid #333;">
                                        ${this.simpleMarkdown(part.text)}
                                    </div>`;
                            }
                        }
                    } catch (e) { 
                        html += `
                            <div ${this.link(partPath + '.text')} style="margin-bottom:20px; padding:10px; border-radius:4px; background:#1e1e1e; border:1px solid #333;">
                                ${this.simpleMarkdown(part.text)}
                            </div>`;
                    }
                } else {
                    html += `
                        <div ${this.link(partPath + '.text')} style="margin-bottom:20px; padding:10px; border-radius:4px; background:#1e1e1e; border:1px solid #333;">
                            ${this.simpleMarkdown(part.text)}
                        </div>`;
                }
            } else if (part.functionCall) {
                const fc = part.functionCall;
                // [Fix] Use renderToolArgs
                const argsHtml = this.renderToolArgs(fc.name, fc.args);
                
                html += `<div ${this.link(partPath + '.functionCall')} style="margin-bottom:20px; padding:10px; border-radius:4px; background:#2d2d30; border:1px solid #444;">
                    <div style="font-size:11px; color:#d7ba7d; font-weight:bold; margin-bottom:5px;">TOOL CALL (${fc.name})</div>
                    <div class="tool-args" style="display:block;">${argsHtml}</div>
                </div>`;
            } else if (part.functionResponse) {
                const funcRes = part.functionResponse;
                 let contentDisplay = '';
                 let rawContent = funcRes.response;
                 if (rawContent && typeof rawContent === 'object') {
                     if (rawContent.content) rawContent = rawContent.content;
                     else if (rawContent.result) rawContent = rawContent.result;
                     else if (rawContent.output) rawContent = rawContent.output;
                 }
                 if (typeof rawContent === 'string') {
                     contentDisplay = `<div style="font-size:12px; white-space:pre-wrap; font-family:'Consolas',monospace;">${this.simpleMarkdown(rawContent)}</div>`;
                 } else {
                     contentDisplay = `<pre>${JSON.stringify(rawContent, null, 2)}</pre>`;
                 }
                
                html += `<div ${this.link(partPath + '.functionResponse')} style="margin-bottom:20px; padding:10px; border-radius:4px; max-height:300px; overflow-y:auto; border:1px solid #444; background:#2d2d30;">
                    <div style="font-size:11px; color:#888; font-weight:bold; margin-bottom:5px;">TOOL RESPONSE (${part.functionResponse.name})</div>
                    ${contentDisplay}
                </div>`;
            }
        });
        
        html += `</div></details>`;
        return html;
    },

    renderTools: function(tools, basePath) {
        if (!tools || tools.length === 0) return '';

        const totalFuncs = tools.reduce((acc, t) => acc + (t.functionDeclarations?.length || 0), 0);

        let html = `
            <details style="margin-bottom:15px; border:1px solid #5a2e2e; border-radius:4px; overflow:hidden;">
                <summary style="background:#422a2a; padding:8px 12px; font-size:11px; font-weight:bold; color:#ce9178; display:flex; align-items:center; cursor:pointer; outline:none;">
                    <span style="margin-right:5px;">🛠️</span> TOOLS <span style="font-weight:normal; opacity:0.7; margin-left:5px;">(${totalFuncs})</span>
                </summary>
                <div style="padding:10px; background:#252526; border-top:1px solid #5a2e2e;">
        `;

        tools.forEach((tool, toolIndex) => {
            const toolPath = `${basePath}.tools.${toolIndex}`;
            if (tool.functionDeclarations && tool.functionDeclarations.length > 0) {
                tool.functionDeclarations.forEach((funcDec, funcIndex) => {
                    const funcPath = `${toolPath}.functionDeclarations.${funcIndex}`;
                    html += `
                        <div style="margin-bottom:10px; padding:10px; border-radius:4px; background:#1e1e1e; border:1px solid #333;" ${this.link(funcPath)}>
                            <div style="font-size:13px; font-weight:bold; color:#9cdcfe; margin-bottom:5px;">${funcDec.name}</div>
                            <div style="font-size:11px; color:#888; margin-bottom:5px;">${this.simpleMarkdown(funcDec.description || 'No description provided.')}</div>
                            ${funcDec.parametersJsonSchema ? `
                                <div style="margin-top:8px; color:#9cdcfe; font-size:10px; margin-bottom:2px;">PARAMETERS SCHEMA:</div>
                                <pre style="background:#0e0e0e; color:#d4d4d4; padding:5px; border-radius:3px; border:1px solid #1e1e1e; overflow-x:auto;">${JSON.stringify(funcDec.parametersJsonSchema, null, 2)}</pre>
                            ` : ''}
                        </div>
                    `;
                });
            }
        });

        html += `
                </div>
            </details>
        `;
        return html;
    },

    renderGenerationConfig: function(config, basePath) {
        if (!config || Object.keys(config).length === 0) return '';

        let html = `
            <div style="margin-bottom:15px; border:1px solid #2e5a2e; border-radius:4px; overflow:hidden;">
                <div ${this.link(basePath + '.generationConfig')} style="background:#2a422a; padding:8px 12px; font-size:11px; font-weight:bold; color:#b5cea8; display:flex; align-items:center; cursor:pointer;">
                    <span style="margin-right:5px;">⚙️</span> GENERATION CONFIG
                </div>
                <div style="padding:10px; background:#252526;">
                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap:10px;">
        `;

        // Iterate over the config properties
        for (const key in config) {
            if (Object.prototype.hasOwnProperty.call(config, key)) {
                const value = config[key];
                const configPath = `${basePath}.generationConfig.${key}`;
                
                let displayValue = '';
                if (typeof value === 'object' && value !== null) {
                    displayValue = `<pre style="font-size:11px; margin:0; white-space:pre-wrap; word-break:break-all;">${JSON.stringify(value, null, 2)}</pre>`;
                } else {
                    displayValue = `<span style="color:#ce9178;">${String(value)}</span>`;
                }

                html += `
                    <div style="background:#1e1e1e; padding:8px; border-radius:4px;" ${this.link(configPath)}>
                        <div style="font-size:11px; color:#9cdcfe; margin-bottom:2px;">${key.replace(/([A-Z])/g, ' $1').toUpperCase()}</div>
                        <div style="font-size:13px; font-weight:bold;">${displayValue}</div>
                    </div>
                `;
            }
        }

        html += `
                    </div>
                </div>
            </div>
        `;
        return html;
    },

    escapeHtml: function(unsafe) {
        if (!unsafe) return '';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
};

window.Renderer = Renderer;
