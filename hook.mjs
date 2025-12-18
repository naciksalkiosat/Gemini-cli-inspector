// inspector/hook.mjs
/**
 * Gemini Agent Inspector Hook (ESM Version)
 *
 * Usage:
 *   node --import ./inspector/hook.mjs packages/cli/dist/index.js [args]
 */

import https from "node:https";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { URL } from "node:url"; 
import { exec } from "node:child_process";
import { Buffer } from "node:buffer";
import zlib from "node:zlib";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Inspector Server & UI ---

const PORT = 3001;
const clients = new Set();
const INSPECTOR_DIR = __dirname; // Modified: Current directory serves static files
let upstreamOrigin = null; // If set, we are a secondary instance forwarding to this origin

// Helper to serve static files
const serveFile = (res, filePath, contentType) => {
    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404);
            res.end('File not found');
        } else {
            res.writeHead(200, { 
                'Content-Type': contentType,
                'Cache-Control': 'no-cache, no-store, must-revalidate', // Force no-cache
                'Pragma': 'no-cache',
                'Expires': '0'
            });
            res.end(content, 'utf-8');
        }
    });
};

// Start the Web Server
const startServer = (retryPort) => {
  const server = http.createServer((req, res) => {
    // API Endpoint
    if (req.url === '/events') {
      // Critical fix: Unref socket to allow process exit when CLI is done
      // Even if Inspector UI is connected
      req.socket.unref();

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      res.write('\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    // Ping Endpoint (for discovery)
    if (req.url === '/ping') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ gemini_inspector: true, version: '1.0' }));
        return;
    }

    // Broadcast Endpoint (for ingestion from secondary instances)
    if (req.url === '/broadcast' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { type, summary, data, ...meta } = JSON.parse(body);
                // Broadcast locally
                broadcast(type, summary, data, meta);
                res.writeHead(200);
                res.end('OK');
            } catch (e) {
                res.writeHead(400);
                res.end('Invalid JSON');
            }
        });
        return;
    }

    // Static File Serving
    let filePath = '';
    let contentType = 'text/html';

    // Parse URL to ignore query strings (e.g., ?v=3.2)
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = requestUrl.pathname;

    if (pathname === '/') {
        filePath = path.join(INSPECTOR_DIR, 'index.html');
    } else {
        // Simple sanitization to prevent directory traversal
        const safeUrl = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
        filePath = path.join(INSPECTOR_DIR, safeUrl);
        
        const ext = path.extname(filePath);
        if (ext === '.js') contentType = 'text/javascript';
        else if (ext === '.css') contentType = 'text/css';
        else if (ext === '.html') contentType = 'text/html';
    }

    serveFile(res, filePath, contentType);
  });

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      // Check if the port is used by another Inspector instance
      const checkUrl = `http://localhost:${retryPort}/ping`;
      const req = http.get(checkUrl, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
              try {
                  const info = JSON.parse(data);
                  if (info.gemini_inspector) {
                      // It is an inspector! We become a secondary instance.
                      upstreamOrigin = `http://localhost:${retryPort}`;
                      console.log(`\x1b[36m[Inspector Hook] Attached to existing inspector at ${upstreamOrigin}\x1b[0m`);
                      return; // Stop trying to listen, just run as hook
                  }
              } catch (e) { /* Not JSON or not inspector */ }
              
              // Not an inspector, or parse failed -> continue retrying new port
              console.log(`[Inspector Hook] Port ${retryPort} in use, trying ${retryPort + 1}...`);
              startServer(retryPort + 1);
          });
      });

      req.on('error', () => {
          // Connection failed (maybe not http), continue retrying
          console.log(`[Inspector Hook] Port ${retryPort} in use, trying ${retryPort + 1}...`);
          startServer(retryPort + 1);
      });
      
    } else {
      console.error('[Inspector Hook] Server error:', e);
    }
  });

  server.listen(retryPort, () => {
    // Critical fix: Unref server
    server.unref();

    console.log(`\x1b[36m[Inspector Hook] Server running at http://localhost:${retryPort}\x1b[0m`);
    
    // Always open browser when server starts, regardless of port
    // Each inspector instance should have its own UI
    if (true) {
        const start = (process.platform == 'darwin'? 'open': process.platform == 'win32'? 'start': 'xdg-open');
        exec(start + ' ' + `http://localhost:${retryPort}`);
    }
  });
};

startServer(PORT);

function broadcast(type, summary, data, meta = {}) {
  // If we are secondary, forward to upstream
  if (upstreamOrigin) {
      const payload = JSON.stringify({ type, summary, data, ...meta });
      const req = http.request(`${upstreamOrigin}/broadcast`, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload)
          }
      });
      req.on('error', () => { /* Ignore upstream errors */ });
      req.write(payload);
      req.end();
      return;
  }

  // Otherwise, broadcast locally
  const payload = JSON.stringify({
    timestamp: Date.now(),
    type, // Added type field
    summary,
    data,
    ...meta
  });
  
  for (const client of clients) {
    client.write(`data: ${payload}\n\n`);
  }
}

// --- Network Interception Logic ---

// Helper: Classify Request
function classifyRequest(parsedUrl, jsonBody) {
    // Preprocess: Handle nested structure (SDK sometimes wraps in 'request')
    const payload = jsonBody.request || jsonBody;
    
    // Try getting Model from Body or URL
    let model = jsonBody.model || payload.model || '';
    if (!model && parsedUrl.pathname.includes('/models/')) {
        // format: .../models/gemini-1.5-flash:generateContent
        const match = parsedUrl.pathname.match(/\/models\/([^:]+)/);
        if (match) model = match[1];
    }

    // Default type and summary
    let type = 'unknown_request';
    let summary = 'Unknown Request';

    if (!payload && !jsonBody) return { type, summary, model };

    // Non-business request check (URL based)
    if (parsedUrl.pathname.includes('/models') || parsedUrl.pathname.includes('/operations')) {
        type = 'meta_request';
        summary = 'Metadata Operation';
        return { type, summary, model };
    }

    // 1. Model Routing Request
    // Strong signal: model is flash-lite (routing)
    if (model.includes('flash-lite')) {
        type = 'model_routing_request';
        summary = 'Model Routing Check';
        return { type, summary, model };
    }
    // Weak signal: System Instruction includes 'router'
    const systemInstruction = payload.systemInstruction?.parts?.map(p => p.text).join(' ');
    if (systemInstruction?.includes('router') || systemInstruction?.includes('classify')) {
        type = 'model_routing_request';
        summary = 'Model Routing Check';
        return { type, summary, model };
    }

    // 2. Tool Result Request
    if (payload.contents && payload.contents.length > 0) {
        const lastContent = payload.contents[payload.contents.length - 1];
        const isToolResult = lastContent.role === 'user' && lastContent.parts?.some((part) => 'functionResponse' in part);
        
        if (isToolResult) {
            type = 'tool_result_request';
            summary = 'Tool Result Submission';
            return { type, summary, model };
        }
    }

    // 4. Initialization Metadata Request
    if (payload.metadata && (payload.metadata.ideType || payload.metadata.pluginType)) {
        type = 'init_metadata_request';
        summary = `Client Init (${payload.metadata.pluginType || 'Unknown'})`;
        return { type, summary, model };
    }

    // 5. Model Usage Request
    if (jsonBody.project && Object.keys(jsonBody).length === 1) {
        type = 'model_usage_request';
        summary = `Model Usage Check (${jsonBody.project})`;
        return { type, summary, model };
    }

    // 6. IDE Context Injection
    const hasIdeContext = payload.contents?.some(
        (content) => content.role === 'user' && content.parts?.some(
            (part) => 'text' in part && (part.text.includes("user's editor context") || part.text.includes("summary of changes"))
        )
    );
    if (hasIdeContext) {
        type = 'chat_request'; 
        summary = 'Chat Request (with IDE Context)';
        return { type, summary, model };
    }

    // 6. Normal Chat Request
    if (payload.contents) {
        type = 'chat_request';
        summary = 'User Chat Request';
        return { type, summary, model };
    }

    return { type, summary, model };
}

// Helper: Classify Response
function classifyResponse(jsonResponse) {
    // Preprocess: Nested structure
    const payload = jsonResponse.response || jsonResponse;
    const modelVersion = payload.modelVersion || '';

    let type = 'unknown_response';
    let summary = 'Unknown Response';

    if (!payload) return { type, summary };

    // 1. Auth Token Response (OAuth2)
    if (payload.access_token && payload.token_type) {
        type = 'auth_token_response';
        summary = 'Auth Token (OAuth2)';
        return { type, summary };
    }

    // 2. Model Routing Response
    // Old method: Check model and metadata.source (RoutingDecision) - might be internal struct
    // New method: Check if response text is routing decision JSON
    // Feature: Candidate text contains model_choice
    if (payload.candidates?.length > 0) {
        const text = payload.candidates[0].content?.parts?.[0]?.text;
        if (text && text.trim().startsWith('{')) {
            try {
                // Try parsing text as JSON
                // Note: Streamed response might be incomplete, but if it's a full object it's fine
                // Simple heuristic to avoid unnecessary parse
                if (text.includes('"model_choice"')) {
                    const decision = JSON.parse(text);
                    if (decision.model_choice) {
                        type = 'model_routing_response';
                        summary = `Routing Decision: ${decision.model_choice}`;
                        // Inject decision into payload for frontend rendering
                        // Note: Don't modify original payload, handle in broadcast
                        // Or let frontend parse it
                        return { type, summary };
                    }
                }
            } catch (e) { /* Not JSON */ }
        }
    }
    
    // Helper: if model version is flash-lite, likely routing response
    if (modelVersion.includes('flash-lite')) {
         type = 'model_routing_response';
         summary = 'Routing Response (Flash Lite)';
         return { type, summary };
    }

    // 4. User Profile Response
    if (payload.currentTier && payload.allowedTiers) {
        type = 'user_profile_response';
        summary = `User Profile (${payload.currentTier.name || 'Unknown'})`;
        return { type, summary };
    }

    // 5. Identity Info Response
    if (payload.azp && payload.aud && payload.email && payload.sub) {
        type = 'identity_response';
        summary = `Identity Info (${payload.email})`;
        return { type, summary };
    }

    // 6. Config & Experiments Response
    if (payload.experimentIds && payload.flags) {
        type = 'config_response';
        summary = `Experiment Config (Flags: ${payload.flags.length})`;
        return { type, summary };
    }

    // 7. Model Usage Response
    if (payload.buckets && Array.isArray(payload.buckets)) {
        type = 'model_usage_response';
        summary = 'Model Usage Statistics';
        return { type, summary };
    }

    // 2. Chat Response
    if (payload.candidates?.length > 0) {
        const firstCandidate = payload.candidates[0];
        const hasText = firstCandidate.content?.parts?.some(p => 'text' in p);
        const hasFunctionCall = firstCandidate.content?.parts?.some(p => 'functionCall' in p);

        if (hasFunctionCall) {
            type = 'chat_response_tool_call';
            summary = `Response (Tool Call): ${firstCandidate.content.parts.filter(p => 'functionCall' in p).map(p => p.functionCall.name).join(', ')}`;
        } else if (hasText) {
            type = 'chat_response_text';
            summary = 'Response (Text)';
        } else {
            type = 'chat_response_empty';
            summary = 'Response (Empty)';
        }
        return { type, summary };
    }

    // 3. Non-business response
    if (payload.error) {
        type = 'error_response';
        summary = 'API Error';
    } else if (payload.usageMetadata) {
        type = 'meta_response';
        summary = 'Metadata Response';
    }

    return { type, summary };
}

const originalRequest = https.request;

// Monkey patch https.request
https.request = function(...args) {
  const req = originalRequest.apply(this, args);
  
  // Determine URL
  let url = '';
  let options = {};
  
  if (typeof args[0] === 'string') {
    url = args[0];
    options = args[1] || {};
  } else {
    options = args[0] || {};
    const protocol = options.protocol || 'https:';
    const host = options.hostname || options.host || 'localhost';
    const path = options.path || '/';
    url = `${protocol}//${host}${path}`;
  }

  // Filter: Only intercept Google GenAI / Vertex AI calls
  if (!url.includes('googleapis.com')) {
    return req;
  }

  // --- 1. Intercept Request Body (The Prompt) ---
  const originalWrite = req.write;
  const originalEnd = req.end;
  let requestBodyChunks = [];

  req.write = function(chunk, ...writeArgs) {
    if (chunk) requestBodyChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return originalWrite.apply(this, [chunk, ...writeArgs]);
  };

  req.end = function(chunk, ...endArgs) {
    if (chunk) requestBodyChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    
    if (requestBodyChunks.length > 0) {
        const bodyBuffer = Buffer.concat(requestBodyChunks);
        try {
            const bodyString = bodyBuffer.toString('utf8');
            const json = JSON.parse(bodyString);
            
            const parsedUrl = new URL(url); // 解析 URL
            const { type, summary, model } = classifyRequest(parsedUrl, json);
            
            if (model && !json.model) json.model = model; // Inject model if missing

            broadcast(type, summary, json, { url, method: (options.method || 'POST').toUpperCase() }); // Use classified type and summary
        } catch (e) {
            // If JSON parse fails, likely not LLM request, ignore
            // console.warn('Request body is not JSON or parsing failed:', e);
        }
    }
    
    return originalEnd.apply(this, [chunk, ...endArgs]);
  };

  // --- 2. Intercept Response Body (The LLM Reply) ---
  // Strategy: Hook into the 'emit' method of the request object to capture the response object.
  // Then hook into the 'emit' method of the response object to capture data chunks without consuming the stream.
  
  const originalReqEmit = req.emit;
  req.emit = function(event, ...args) {
    if (event === 'response') {
      const res = args[0];
      const statusCode = res.statusCode;
      
      const chunks = [];
      const originalResEmit = res.emit;
      
      res.emit = function(resEvent, ...resArgs) {
        if (resEvent === 'data') {
          chunks.push(resArgs[0]);
        }
        if (resEvent === 'end') {
          // Process collected chunks
          try {
            const fullBuffer = Buffer.concat(chunks);
            const encoding = res.headers['content-encoding'];
            
            const meta = { url, method: (options.method || 'POST').toUpperCase(), statusCode };

            const processJson = (buffer) => {
               const str = buffer.toString('utf8');
               
               // Attempt 1: Standard JSON parse
               try {
                 const json = JSON.parse(str);
                 const { type, summary } = classifyResponse(json);
                 broadcast(type, summary, json, meta);
                 return;
               } catch(e) { /* continue */ }

               // Attempt 2: Streaming JSON (sequence of objects like [{},{},...])
               // Sometimes gaxios returns an array but sometimes it's a sequence of objects
               if (str.trim().startsWith('[') && str.trim().endsWith(']')) {
                   // It might be a valid array already, but if JSON.parse failed, maybe it has trailing commas or issues
               }

               // Attempt 3: Try to recover a valid JSON array from a sequence of objects
               // e.g., "{...}\n{...}" -> "[{...},{...}]"
               try {
                   // Heuristic: If it looks like multiple JSON objects, wrap them in brackets and add commas
                   // This is hacky but effective for debugging streams that are just concatenated JSONs
                   const fixedStr = '[' + str.replace(/}\s*{/g, '},{') + ']';
                   const json = JSON.parse(fixedStr);
                   const merged = mergeChunks(json);
                   const { type, summary } = classifyResponse(merged.data);
                   broadcast(type, summary, merged.data, meta);
                   return;
               } catch(e) { /* continue */ }

               // Attempt 4: Parse line by line (typical for SSE or NDJSON)
               const lines = str.split(/\r?\n/);
               const validChunks = [];
               for (const line of lines) {
                   if (!line.trim()) continue;
                   try {
                       // Remove "data: " prefix if present (SSE)
                       const cleanLine = line.replace(/^data: /, '').trim();
                       const chunk = JSON.parse(cleanLine);
                       validChunks.push(chunk);
                   } catch (e) { } // Ignore lines that are not valid JSON
               }

               if (validChunks.length > 0) {
                   const merged = mergeChunks(validChunks);
                   const { type, summary } = classifyResponse(merged.data);
                   broadcast(type, summary, merged.data, meta);
               } else {
                   // If all else fails, log the raw string if it's short enough, or a snippet
                   if (str.length < 5000) {
                       broadcast('response', 'Raw Text Response', { raw: str }, meta);
                   }
               }
            };

            function mergeChunks(chunks) {
                if (!Array.isArray(chunks) || chunks.length === 0) return { summary: 'Empty Response', data: {} };
                
                // Base structure for the merged response
                const merged = {
                    candidates: [{ 
                        content: { parts: [], role: 'model' }, 
                        finishReason: null 
                    }],
                    usageMetadata: {},
                    chunkCount: chunks.length
                };

                let fullText = '';
                let toolCalls = [];
                let thoughts = [];

                for (const chunk of chunks) {
                    const candidate = chunk.response?.candidates?.[0] || chunk.candidates?.[0];
                    if (!candidate) continue;

                    // Update finish reason if present
                    if (candidate.finishReason) {
                        merged.candidates[0].finishReason = candidate.finishReason;
                    }

                    // Process parts
                    if (candidate.content?.parts) {
                        for (const part of candidate.content.parts) {
                            if (part.text) fullText += part.text;
                            if (part.thought) thoughts.push(part.text); // Thoughts are text
                            if (part.functionCall) toolCalls.push(part.functionCall);
                        }
                    }
                    
                    // Update metadata (usually in the last chunk)
                    const usage = chunk.response?.usageMetadata || chunk.usageMetadata;
                    if (usage) merged.usageMetadata = usage;
                }

                // Reconstruct parts
                const finalParts = [];
                if (thoughts.length > 0) {
                    finalParts.push({ text: thoughts.join('\n'), thought: true });
                }
                if (fullText) {
                    // Remove thoughts from full text to avoid duplication if the model sends them as text too
                    // (Simple logic: just add text part. UI can handle display)
                    finalParts.push({ text: fullText }); 
                }
                toolCalls.forEach(tc => finalParts.push({ functionCall: tc }));
                
                merged.candidates[0].content.parts = finalParts;

                // Generate Summary
                let summary = 'Streamed Response';
                if (toolCalls.length > 0) summary = `Tool Call: ${toolCalls.map(t => t.name).join(', ')}`;
                else if (fullText.length > 0) summary = 'Text Response';
                
                return { summary, data: merged };
            }

            if (encoding === 'gzip') {
              zlib.gunzip(fullBuffer, (err, decoded) => !err && processJson(decoded));
            } else if (encoding === 'br') {
              zlib.brotliDecompress(fullBuffer, (err, decoded) => !err && processJson(decoded));
            } else {
              processJson(fullBuffer);
            }
          } catch (e) { /* ignore */ }
        }
        return originalResEmit.apply(this, [resEvent, ...resArgs]);
      };
    }
    return originalReqEmit.apply(this, [event, ...args]);
  };

  return req;
};

console.log(`\x1b[36m[Inspector Hook] HTTPS interception enabled. Waiting for traffic...\x1b[0m`);
