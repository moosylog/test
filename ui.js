import { getZmkSuggestion, getRebuildGuide } from './migration-guide.js';

const MainUtils = {
    escapeHTML: (str) => {
        if (!str) return '';
        return String(str).replace(/[&<>'"]/g, match => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[match] || match));
    }
};

export const UI = {
    displayFatalError: (msg, stack = null) => {
        const reportContainer = document.getElementById('outputReport');
        
        document.getElementById('uploadScreen').classList.add('hidden');
        document.getElementById('successScreen').classList.remove('hidden');
        document.getElementById('successScreen').classList.add('flex');

        if (reportContainer) {
            reportContainer.innerHTML = `
                <div class="bg-red-50 border border-red-200 rounded-3xl p-8 mt-4 shadow-sm text-center">
                    <div class="mx-auto w-16 h-16 rounded-full bg-red-100 flex items-center justify-center text-red-500 mb-4 shadow-sm">
                        <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                    </div>
                    <h4 class="text-red-900 font-extrabold text-2xl mb-2">Oops! We couldn't read that file.</h4>
                    <p class="text-red-700 text-sm mb-6 max-w-md mx-auto leading-relaxed">Something went wrong while trying to read your layout. Please make sure you uploaded the correct <strong>Source .zip</strong> file from ZSA Oryx.</p>
                    <button onclick="location.reload()" class="btn-primary mx-auto w-auto px-8 mb-6 bg-red-600 hover:bg-red-700 shadow-red-600/20">Try Again</button>
                    <details class="group mt-4 border-t border-red-200/50 pt-4 text-left">
                        <summary class="text-xs font-bold text-red-800 cursor-pointer flex items-center justify-center gap-1 select-none hover:text-red-600 transition-colors">
                            <svg class="w-3 h-3 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M9 5l7 7-7-7"></path></svg>
                            Technical Details
                        </summary>
                        <div class="mt-4 p-4 bg-white/60 rounded-xl border border-red-100 font-mono text-[11px] text-red-900 overflow-x-auto whitespace-pre-wrap shadow-inner leading-relaxed">${MainUtils.escapeHTML(stack || msg)}</div>
                    </details>
                </div>`;
            
            document.getElementById('successHeader').style.display = 'none';
            document.getElementById('actionHeader').style.display = 'none';
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    },

    updateDropZone: (filename, isProcessing = false) => {
        const dz = document.getElementById('dropZone');
        const dText = document.getElementById('dropText');
        const dSub = document.getElementById('dropSubtext');
        const dIcon = document.getElementById('dropIcon');
        if (!dz) return;
        if (isProcessing) {
            dText.innerText = `⏳ Processing your layout...`; dSub.innerText = "Extracting magic from " + filename;
            dIcon.outerHTML = `<svg class="w-8 h-8 text-blue-500 animate-spin" id="dropIcon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>`;
        } 
    },

    formatKeycapString: (str) => {
        if(str === "&none") return `<span class="keycap keycap-blank">&none</span>`;
        if(str.includes("mt ") || str.includes("lt ") || str.includes("sk ")) return `<span class="keycap keycap-composite">${MainUtils.escapeHTML(str)}</span>`;
        if(str.includes("tog ") || str.includes("sl ")) return `<span class="keycap keycap-layer">${MainUtils.escapeHTML(str)}</span>`;
        return `<span class="keycap">${MainUtils.escapeHTML(str)}</span>`;
    },

    printPDF: () => {
        const details = document.querySelectorAll('details, .print-expand-item');
        const state = [];
        details.forEach(d => {
            state.push({ el: d, wasOpen: d.hasAttribute('open') });
            d.setAttribute('open', '');
        });
        window.print();
        setTimeout(() => {
            state.forEach(item => {
                if (!item.wasOpen) item.el.removeAttribute('open');
            });
        }, 1000);
    },

    buildReport: (layerCount, state) => {
        const reportContainer = document.getElementById('outputReport');
        if (!reportContainer) return;

const warnInstances = Object.values(state.log.warning || {}).reduce((a, c) => a + c.count, 0);

// === SPLIT DUAL_FUNC FROM MACROS ===
const realMacros = {};
const dualFuncHoldTaps = {};

Object.entries(state.macros || {}).forEach(([keyName, payload]) => {
    if (payload && payload.includes('DUAL_FUNC')) {
        dualFuncHoldTaps[keyName] = {
            translated: "Hold-Tap",
            reason: "Rebuild as a ZMK <strong>Hold-Tap</strong> Behavior in the MoErgo Layout Editor.",
            count: 1,
            config: payload
        };
    } else {
        realMacros[keyName] = payload;
    }
});

const macroCount = Object.keys(realMacros).length;
const totalNeedsRebuild = warnInstances + macroCount + Object.keys(dualFuncHoldTaps).length;


        const stdInstances = Object.values(state.log.layer_binding || {}).reduce((a, c) => a + c.count, 0);
        const htInstances = Object.values(state.log.hold_tap || {}).reduce((a, c) => a + c.count, 0) + Object.keys(dualFuncHoldTaps).length;
        const comboInstances = Object.values(state.log.combo || {}).reduce((a, c) => a + c.count, 0);
        const totalMapped = stdInstances + htInstances + comboInstances;

        const buildRows = (logCat) => {
            if (Object.keys(logCat).length === 0) return `<tr><td colspan="4" class="empty-state">🎉 Clean conversion!</td></tr>`;
            return Object.entries(logCat).map(([original, data]) => `
                <tr>
                    <td class="code"><span class="keycap !border-slate-200 !shadow-none hover:translate-y-0">${MainUtils.escapeHTML(original)}</span></td>
                    <td class="code">${UI.formatKeycapString(data.translated)}</td>
                    <td class="reason">${MainUtils.escapeHTML(data.reason || "Auto-mapped successfully.")}</td>
                    <td class="font-semibold text-slate-500 text-center">${data.count}</td>
                </tr>`).join('');
        };

        const buildWarningDrilldown = (logCat) => {
            if (Object.keys(logCat).length === 0) return `<div class="empty-state">🎉 Clean conversion!</div>`;
            return `<div class="flex flex-col gap-3 p-4">` + Object.entries(logCat).map(([original, data]) => {
                
                let contextHtml = '';
                let foundConfig = '';

                if (data.contexts && data.contexts.length > 0) {
                    let occurrencesMap = new Map();
                    data.contexts.forEach(c => {
                        if (!c) return;
                        let key = c.layer === 'Combo' ? 'Used inside an Auto-Generated Combo' : (c.layer !== null && c.pos ? `Layer ${c.layer} ➔ <strong class="text-slate-800">${c.pos}</strong>` : null);
                        
                        if (key && !occurrencesMap.has(key)) {
                            let colorDot = c.color ? `<span class="inline-block w-2.5 h-2.5 rounded-full border border-slate-300 shadow-sm mr-2 align-middle -mt-0.5" style="background-color: ${c.color}"></span>` : '';
                            occurrencesMap.set(key, `${colorDot}${key}`);
                        }
                    });

                    let occurrencesStr = Array.from(occurrencesMap.values()).join('<br>');
                    foundConfig = data.contexts.find(c => c && c.config)?.config;

                    if (occurrencesStr) {
                        contextHtml = `
                            <div class="mt-5 pt-4 border-t border-slate-200/60">
                                <strong class="block text-[11px] uppercase tracking-wider text-slate-500 mb-2">Hardware Locations & Colors</strong>
                                <p class="text-[13px] text-slate-600 font-medium leading-[1.8]">${occurrencesStr}</p>
                            </div>
                        `;
                    }
                }

let abstractionHTML = '';
const rebuildGuideHtml = getRebuildGuide(original, foundConfig);
if (rebuildGuideHtml) {
    abstractionHTML = `
        <div class="mb-4">
            <div class="p-3 bg-indigo-50/40 border border-indigo-100 rounded-lg shadow-sm">
                ${rebuildGuideHtml}
            </div>
        </div>
    `;
}

                let configDisplay = '';
                if (foundConfig) {
                    let displayConfig = foundConfig;
                    if (displayConfig.includes('_reset')) {
                        displayConfig = displayConfig.split(/void\s+[a-zA-Z0-9_]+_reset/)[0].trim() + "\n\n// (The cleanup/reset function is hidden for clarity)";
                    }
                    configDisplay = `
                        <div class="border-t border-slate-700 bg-slate-900/50 p-3">
                            <strong class="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">Extracted Parameters / Definition</strong>
                            <code class="block w-full text-blue-300 text-[11px] font-mono whitespace-pre-wrap overflow-x-auto">${MainUtils.escapeHTML(displayConfig)}</code>
                        </div>
                    `;
                }

                return `
                <details class="bg-white border border-slate-200 rounded-xl shadow-sm group print-expand-item">
                    <summary class="p-4 flex items-center justify-between cursor-pointer list-none hover:bg-slate-50 transition-colors rounded-xl outline-none">
                        <div class="flex items-center gap-3">
                            <svg class="w-4 h-4 text-slate-400 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7-7"></path></svg>
                            <span class="font-bold text-slate-700 text-sm font-mono truncate max-w-[200px] sm:max-w-[400px]">${MainUtils.escapeHTML(original)}</span>
                        </div>
                        <span class="bg-slate-100 text-slate-500 text-[11px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">${data.count} Instances</span>
                    </summary>
                    <div class="p-5 border-t border-slate-100 bg-slate-50/50 rounded-b-xl">
<div class="mb-4">
    <strong class="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">ZMK Replacement Suggestion</strong>
    <p class="text-[13px] text-slate-800 font-medium leading-relaxed">${MainUtils.escapeHTML(data.reason)}</p>
</div>
                        
                        ${abstractionHTML}

                        <div>
                            <strong class="block text-[11px] uppercase tracking-wider text-slate-500 mb-1.5">Exact Source Code & Parameters</strong>
                            <div class="rounded-lg overflow-hidden shadow-inner bg-slate-800 border border-slate-700">
                                <code class="block w-full p-3 text-emerald-400 text-xs font-mono break-all">${MainUtils.escapeHTML(original)}</code>
                                ${configDisplay}
                            </div>
                        </div>
                        ${contextHtml}
                    </div>
                </details>
            `}).join('') + `</div>`;
        };

const macroRows = macroCount === 0 
    ? `<tr><td colspan="3" class="empty-state">No custom macros found.</td></tr>`
    : Object.entries(realMacros).map(([macName, payload]) => `
        <tr>
            <td class="code align-top pt-4"><span class="keycap">${MainUtils.escapeHTML(macName)}</span></td>
            <td class="payload w-2/5 align-top pt-4">
                <div class="bg-slate-900 rounded-lg p-3 max-h-32 overflow-y-auto shadow-inner">
                    <pre class="bg-transparent p-0 m-0 text-slate-400 text-[10px] font-mono whitespace-pre-wrap">${MainUtils.escapeHTML(payload)}</pre>
                </div>
            </td>
            <td class="reason align-top pt-4 pl-4">${payload && payload.includes('DUAL_FUNC') ? 'Moved to Hold-Taps section.' : (getRebuildGuide(macName, payload) || 'Rebuild as a ZMK <strong>Macro</strong> Behavior in the MoErgo Layout Editor.')}</td>
        </tr>`).join('');

        reportContainer.innerHTML = `
            <div class="checklist-container">
                <div class="p-6 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between no-print">
                    <h3 class="text-base font-bold text-slate-800">Your Setup Checklist</h3>
                    <span class="text-xs font-semibold text-slate-400 uppercase tracking-widest">${totalNeedsRebuild > 0 ? '4' : '3'} Steps</span>
                </div>
                
                <div class="flex flex-col">
                    <div class="checklist-item">
                        <div class="step-circle">1</div>
                        <div class="mt-0.5">
                            <strong class="text-slate-900 block text-[15px] mb-1">Download your Layout</strong>
                            <p class="text-[13px] text-slate-500 leading-relaxed max-w-xl">Click the blue "Download Layout" button above to save your new MoErgo-ready file to your computer.</p>
                        </div>
                    </div>
                    <div class="checklist-item">
                        <div class="step-circle">2</div>
                        <div class="mt-0.5">
                            <strong class="text-slate-900 block text-[15px] mb-1">Import into MoErgo Layout Editor</strong>
                            <p class="text-[13px] text-slate-500 leading-relaxed max-w-xl">Open the Layout Editor and simply drag and drop the file you just downloaded right onto the page.</p>
                        </div>
                    </div>
                    <div class="checklist-item">
                        <div class="step-circle">3</div>
                        <div class="mt-0.5">
                            <strong class="text-slate-900 block text-[15px] mb-1">Rename your Layers</strong>
                            <p class="text-[13px] text-slate-500 leading-relaxed max-w-xl">ZSA keeps layer names (like "Symbols" or "Nav") hidden in the cloud. Take a quick moment to re-label <em>Layer_0</em>, <em>Layer_1</em>, etc. inside the Layout Editor.</p>
                        </div>
                    </div>
                    ${totalNeedsRebuild > 0 ? `
                    <div class="checklist-item bg-orange-50/30">
                        <div class="step-circle step-circle-warn">4</div>
                        <div class="mt-0.5">
                            <strong class="text-slate-900 block text-[15px] mb-1">Rebuild your Advanced Features</strong>
                            <p class="text-[13px] text-slate-500 leading-relaxed max-w-xl">We noticed you had some custom macros or advanced ZSA features! We safely left those keys blank. Check the detailed summary below for exact code references and instructions on how to rebuild them in ZMK.</p>
                        </div>
                    </div>` : ''}
                </div>
            </div>

            <div class="mt-12">
                <div class="flex items-center gap-4 mb-6 no-print">
                    <div class="h-px bg-slate-200 flex-grow"></div>
                    <h4 class="eyebrow text-slate-400">Advanced Migration Details</h4>
                    <div class="h-px bg-slate-200 flex-grow"></div>
                </div>

                <div class="stat-grid">
                    <div class="stat-box"><div class="stat-num text-blue-600">${layerCount}</div><div class="stat-label">Layers</div></div>
                    <div class="stat-box"><div class="stat-num">${totalMapped}</div><div class="stat-label">Keys Auto-Mapped</div></div>
                    <div class="stat-box ${warnInstances > 0 ? 'warning' : ''}"><div class="stat-num">${warnInstances}</div><div class="stat-label">Actions Required</div></div>
                </div>
                
                <details class="report-category" open>
                    <summary>
                        <svg class="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                        Action Required: Rebuild these features <span class="ml-2 bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-md text-[10px] font-bold">${warnInstances}</span>
                    </summary>
                    <div class="cat-content bg-slate-50/50 pb-2">
                        ${buildWarningDrilldown(state.log.warning)}
                    </div>
                </details>
                
                <details class="report-category">
                    <summary>
                        <svg class="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg>
                        Your Custom Macros <span class="ml-2 bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-md text-[10px] font-bold">${macroCount}</span>
                    </summary>
                    <div class="cat-content"><table><tr><th>Key ID</th><th>Raw C Code</th><th>Decoded Instructions</th></tr>${macroRows}</table></div>
                </details>
                
                <details class="report-category">
                    <summary>
                        <svg class="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16m-7 6h7"></path></svg>
                        Standard Keys (Automatically Mapped) <span class="ml-2 bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-md text-[10px] font-bold">${stdInstances}</span>
                    </summary>
                    <div class="cat-content"><table><tr><th>Original Key</th><th>MoErgo Target</th><th>Status</th><th class="text-center">Instances</th></tr>${buildRows(state.log.layer_binding)}</table></div>
                </details>
                
                <details class="report-category">
                    <summary>
                        <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"></path></svg>
                        Hold-Taps / Dual-Function <span class="ml-2 bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-md text-[10px] font-bold">${htInstances}</span>
                    </summary>
                    <div class="cat-content"><table><tr><th>Original Key</th><th>MoErgo Target</th><th>Status</th><th class="text-center">Instances</th></tr>${buildRows({ ...state.log.hold_tap, ...dualFuncHoldTaps })}</table></div>
                </details>
                
                <details class="report-category">
                    <summary>
                        <svg class="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
                        Auto-Generated Combos <span class="ml-2 bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-md text-[10px] font-bold">${comboInstances}</span>
                    </summary>
                    <div class="cat-content"><table><tr><th>Original Key</th><th>MoErgo Target</th><th>Status</th><th class="text-center">Instances</th></tr>${buildRows(state.log.combo)}</table></div>
                </details>
            </div>
        `;
    }
};
