/**
 * JSON Viewer with Path Support
 * Renders JSON as HTML with data-path attributes for bi-directional linking.
 */

const JsonViewer = {
    render: function(data, container) {
        container.innerHTML = this.renderValue(data, 'root');
    },

    renderValue: function(value, path, suffix = '') {
        if (value === null) return `<span class="json-null" id="json-${path}">null</span>${suffix}`;
        if (typeof value === 'boolean') return `<span class="json-boolean" id="json-${path}">${value}</span>${suffix}`;
        if (typeof value === 'number') return `<span class="json-number" id="json-${path}">${value}</span>${suffix}`;
        if (typeof value === 'string') return `<span class="json-string" id="json-${path}">"${this.escape(value)}"</span>${suffix}`;
        
        if (Array.isArray(value)) {
            if (value.length === 0) return `<span id="json-${path}">[]</span>${suffix}`;
            let html = `<div id="json-${path}" style="display:inline-block; vertical-align:top;"><span>[</span><div style="padding-left: 20px; border-left: 1px solid #333;">`;
            value.forEach((item, index) => {
                const itemPath = `${path}.${index}`;
                const itemSuffix = index < value.length - 1 ? ',' : '';
                html += `<div>${this.renderValue(item, itemPath, itemSuffix)}</div>`;
            });
            html += `</div><span>]</span>${suffix}</div>`;
            return html;
        }
        
        if (typeof value === 'object') {
            if (Object.keys(value).length === 0) return `<span id="json-${path}">{}</span>${suffix}`;
            let html = `<div id="json-${path}" style="display:inline-block; vertical-align:top;"><span>{</span><div style="padding-left: 20px; border-left: 1px solid #333;">`;
            const keys = Object.keys(value);
            keys.forEach((key, index) => {
                const itemPath = `${path}.${key}`;
                const itemSuffix = index < keys.length - 1 ? ',' : '';
                html += `<div><span class="json-key">"${key}"</span>: ${this.renderValue(value[key], itemPath, itemSuffix)}</div>`;
            });
            html += `</div><span>}</span>${suffix}</div>`;
            return html;
        }
        
        return String(value) + suffix;
    },

    escape: function(str) {
        return str.replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;');
    },

    highlight: function(path) {
        // Remove old highlights
        document.querySelectorAll('.json-highlight').forEach(el => el.classList.remove('json-highlight'));
        
        // Find target element
        // Path format matches the one generated in renderValue: root.prop.index
        const targetId = `json-${path}`;
        const target = document.getElementById(targetId);
        
        if (target) {
            target.classList.add('json-highlight');
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return true;
        } else {
            console.warn('JSON path not found:', path);
            return false;
        }
    }
};

// Expose to global scope
window.JsonViewer = JsonViewer;