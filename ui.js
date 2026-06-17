const MainUtils = {
    escapeHTML: (str) => {
        if (!str) return '';
        return String(str).replace(/[&<>'"]/g, match => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[match] || match));
    },
    
    // Generic QMK Macro Parser
    translateQMKMacro: (code) => {
        if (!code) return "Rebuild as a Custom ZMK Macro.";
        
        // 1. Prevent "Double Content" by completely ignoring the boilerplate _reset functions!
        let codeToParse = code;
        if (codeToParse.includes('_reset')) {
            codeToParse = codeToParse.split(/void\s+[a-zA-Z0-9_]+_reset/)[0];
        }
        
        let htmlOutput = "";
        let cleanCode = codeToParse.replace(/if\s*\(.*?\)\s*\{/g, '').replace(/\}/g, '').replace(/break;/g, '').replace(/case ST_MACRO_.*?:/g, '').trim();

        const sendStringRegex = /SEND_STRING\(([\s\S]*?)\);/g;
        let match;
        let hasContent = false;

        while ((match = sendStringRegex.exec(cleanCode)) !== null) {
            hasContent = true;
            let parsedStr = match[1];
            
            parsedStr = parsedStr.replace(/"([^"]+)"/g, ' [TYPE_STR:$1] ');

            const mods = { 'SS_LCTL': 'Ctrl', 'SS_LSFT': 'Shift', 'SS_LALT': 'Alt', 'SS_LGUI': 'Cmd/Win', 'SS_RCTL': 'RCtrl', 'SS_RSFT': 'RShift', 'SS_RALT': 'RAlt', 'SS_RGUI': 'RCmd/Win' };
            for (const [qmkMod, uiMod] of Object.entries(mods)) {
                let modRegex = new RegExp(`${qmkMod}\\(([^)]+)\\)`, 'g');
                parsedStr = parsedStr.replace(modRegex, `<strong class="text-slate-600 ml-1">${uiMod} +</strong> $1`);
            }

            parsedStr = parsedStr.replace(/SS_TAP\(X_([A-Z0-9_]+)\)/g, '[$1]');
            parsedStr = parsedStr.replace(/SS_DOWN\(X_([A-Z0-9_]+)\)/g, 'Hold [$1]');
            parsedStr = parsedStr.replace(/SS_UP\(X_([A-Z0-9_]+)\)/g, 'Release [$1]');
            parsedStr = parsedStr.replace(/SS_DELAY\(([0-9]+)\)/g, ' [DELAY:$1] ');
            parsedStr = parsedStr.replace(/X_([A-Z0-9_]+)/g, '[$1]'); 

            parsedStr = parsedStr.replace(/\[TYPE_STR:([^\]]+)\]/g, '<span class="text-blue-600 font-bold text-[11px] whitespace-nowrap inline-block bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 shadow-sm mx-1">Type "$1"</span>');
            parsedStr = parsedStr.replace(/\[DELAY:([0-9]+)\]/g, '<span class="text-amber-600 font-bold text-[10px] bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 mx-1">⏱️ $1ms</span>');
            parsedStr = parsedStr.replace(/\[([A-Z0-9_]+)\]/g, '<span class="keycap text-[10px] bg-white !border-slate-300 shadow-sm mx-0.5">$1</span>');

            htmlOutput += `<div class="flex items-center flex-wrap gap-y-2 leading-relaxed mb-2">${parsedStr}</div>`;
        }

        // 2. We skip "unregister_code" so we don't spam the user with redundant release steps
        const codeRegex = /(tap_code16|register_code16|tap_code|register_code)\((.*?)\);/g;
        let tapSteps = [];
        while ((match = codeRegex.exec(cleanCode)) !== null) {
            hasContent = true;
            let action = match[1];
            let key = match[2].replace('KC_', '').replace('X_', '');
            let htmlKey = `<span class="keycap text-[10px] bg-white !border-slate-300 shadow-sm mx-0.5">${key}</span>`;
            
            if (action.includes('tap')) tapSteps.push(`Tap ${htmlKey}`);
            else if (action.includes('register')) tapSteps.push(`Hold ${htmlKey}`);
        }
        
        // De-duplicate identical sequential steps to keep it perfectly clean
        let uniqueSteps = [];
        tapSteps.forEach(step => {
            if (uniqueSteps[uniqueSteps.length - 1] !== step) {
                uniqueSteps.push(step);
            }
        });

        if (uniqueSteps.length > 0) {
            htmlOutput += `<div class="flex items-center flex-wrap gap-2 mt-2">${uniqueSteps.join('<span class="text-slate-300 text-[10px]">➔</span>')}</div>`;
        }

        if (hasContent) {
            return `
                <strong class="block text-slate-800 text-xs mb-2">Decoded Sequence:</strong>
                ${htmlOutput}
                <p class="text-[11px] text-slate-500 mt-2 border-t border-slate-100 pt-2">Recreate this using the "Macro" tab in the MoErgo Editor.</p>
            `;
        }

        return "Rebuild as a Custom ZMK Macro.";
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

    buildReport: (layerCount, tapDanceCount, modMorphCount, macroCount, state) => {
        const reportContainer = document.getElementById('outputReport');
        if (!reportContainer) return;

        const warnInstances = Object.values(state.log.warning || {}).reduce((a, c) => a + c.count, 0);
        const rawMacroCount = Object.keys(state.macros || {}).length;
        const tdLogCount = Object.keys(state.log.tap_dance || {}).length;
        const mmLogCount = Object.keys(state.log.mod_morph || {}).length;
        // Remaining rebuild burden = warnings + any macros that couldn't be decoded
        const remainingMacros = Math.max(0, rawMacroCount - macroCount);
        const totalNeedsRebuild = warnInstances + remainingMacros;

        const stdInstances = Object.values(state.log.layer_binding || {}).reduce((a, c) => a + c.count, 0);
        const htInstances = Object.values(state.log.hold_tap || {}).reduce((a, c) => a + c.count, 0);
        const comboInstances = Object.values(state.log.combo || {}).reduce((a, c) => a + c.count, 0);
        const totalMapped = stdInstances + htInstances + comboInstances;

        const buildTdRows = (logCat) => {
            if (Object.keys(logCat).length === 0) return `<tr><td colspan="3" class="empty-state">No tap-dances found.</td></tr>`;
            return Object.entries(logCat).map(([original, data]) => `
                <tr>
                    <td class="code"><span class="keycap !border-slate-200 !shadow-none">${MainUtils.escapeHTML(original)}</span></td>
                    <td class="code"><span class="keycap keycap-composite">${MainUtils.escapeHTML(data.translated)}</span></td>
                    <td class="reason">${MainUtils.escapeHTML(data.reason || 'Migrated as ZMK Tap-Dance.')}</td>
                </tr>`).join('');
        };

        const buildMmRows = (logCat) => {
            if (Object.keys(logCat).length === 0) return `<tr><td colspan="3" class="empty-state">No mod-morphs found.</td></tr>`;
            return Object.entries(logCat).map(([original, data]) => `
                <tr>
                    <td class="code"><span class="keycap !border-slate-200 !shadow-none">${MainUtils.escapeHTML(original)}</span></td>
                    <td class="code"><span class="keycap keycap-composite">${MainUtils.escapeHTML(data.translated)}</span></td>
                    <td class="reason">${MainUtils.escapeHTML(data.reason || 'Migrated as ZMK Mod-Morph.')}</td>
                </tr>`).join('');
        };

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

                // Generate the Decoded Instructions
                let abstractionHTML = '';
                if (foundConfig) {
                    let decoded = MainUtils.translateQMKMacro(foundConfig);
                    if (decoded !== "Rebuild as a Custom ZMK Macro.") {
                        abstractionHTML = `
                            <div class="mb-4">
                                <div class="p-3 bg-indigo-50/40 border border-indigo-100 rounded-lg shadow-sm">
                                    ${decoded}
                                </div>
                            </div>
                        `;
                    }
                }

                // Cleanup the raw Config code so we don't show the duplicate _reset function
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
            : Object.entries(state.macros).map(([macName, payload]) => `
                <tr>
                    <td class="code align-top pt-4"><span class="keycap">${MainUtils.escapeHTML(macName)}</span></td>
                    <td class="payload w-2/5 align-top pt-4">
                        <div class="bg-slate-900 rounded-lg p-3 max-h-32 overflow-y-auto shadow-inner">
                            <pre class="bg-transparent p-0 m-0 text-slate-400 text-[10px] font-mono whitespace-pre-wrap">${MainUtils.escapeHTML(payload)}</pre>
                        </div>
                    </td>
                    <td class="reason align-top pt-4 pl-4">${MainUtils.translateQMKMacro(payload)}</td>
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
                    ${(tapDanceCount > 0 || modMorphCount > 0 || macroCount > 0) ? `
                    <div class="checklist-item bg-violet-50/20">
                        <div class="step-circle" style="background:#ede9fe;color:#7c3aed;border-color:#c4b5fd;">4</div>
                        <div class="mt-0.5">
                            <strong class="text-slate-900 block text-[15px] mb-1">Verify your Auto-Migrated Behaviors</strong>
                            <p class="text-[13px] text-slate-500 leading-relaxed max-w-xl">We auto-migrated ${[tapDanceCount > 0 ? `<strong>${tapDanceCount} tap-dance${tapDanceCount !== 1 ? 's' : ''}</strong>` : '', modMorphCount > 0 ? `<strong>${modMorphCount} mod-morph${modMorphCount !== 1 ? 's' : ''}</strong>` : '', macroCount > 0 ? `<strong>${macroCount} macro${macroCount !== 1 ? 's' : ''}</strong>` : ''].filter(Boolean).join(', ')} into your JSON. Open the relevant tabs in the MoErgo Layout Editor and confirm each binding looks correct before flashing.</p>
                        </div>
                    </div>` : ''}
                    ${totalNeedsRebuild > 0 ? `
                    <div class="checklist-item bg-orange-50/30">
                        <div class="step-circle step-circle-warn">${(tapDanceCount > 0 || modMorphCount > 0 || macroCount > 0) ? '5' : '4'}</div>
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

                <div class="stat-grid" style="grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));">
                    <div class="stat-box"><div class="stat-num text-blue-600">${layerCount}</div><div class="stat-label">Layers</div></div>
                    <div class="stat-box"><div class="stat-num">${totalMapped}</div><div class="stat-label">Keys Auto-Mapped</div></div>
                    <div class="stat-box ${tapDanceCount > 0 ? '' : ''}"><div class="stat-num text-violet-600">${tapDanceCount}</div><div class="stat-label">Tap-Dances</div></div>
                    <div class="stat-box ${modMorphCount > 0 ? '' : ''}"><div class="stat-num text-teal-600">${modMorphCount}</div><div class="stat-label">Mod-Morphs</div></div>
                    <div class="stat-box ${macroCount > 0 ? '' : ''}"><div class="stat-num text-emerald-600">${macroCount}</div><div class="stat-label">Macros</div></div>
                    <div class="stat-box ${totalNeedsRebuild > 0 ? 'warning' : ''}"><div class="stat-num">${totalNeedsRebuild}</div><div class="stat-label">Actions Required</div></div>
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
                    <div class="cat-content"><table><tr><th>Original Key</th><th>MoErgo Target</th><th>Status</th><th class="text-center">Instances</th></tr>${buildRows(state.log.hold_tap)}</table></div>
                </details>
                
                <details class="report-category">
                    <summary>
                        <svg class="w-5 h-5 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11"></path></svg>
                        Tap-Dances <span class="ml-2 bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-md text-[10px] font-bold">${tapDanceCount}</span>
                        ${tapDanceCount > 0 ? '<span class="ml-2 text-[10px] font-semibold text-violet-600 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-md">✓ Added to JSON</span>' : ''}
                    </summary>
                    <div class="cat-content">
                        ${tapDanceCount > 0 ? `
                        <div class="p-4 bg-violet-50/40 border-b border-violet-100 text-[13px] text-violet-800 flex items-start gap-2">
                            <svg class="w-4 h-4 shrink-0 mt-0.5 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            <span>QMK tap-dances have been auto-migrated to the correct ZMK behavior type based on their branch structure: dances with a <strong>hold branch</strong> become custom <strong>.holdTaps[]</strong> entries, dances with a <strong>double-tap</strong> become <strong>.tapDances[]</strong> entries, and dances with a <strong>shifted double-tap</strong> become <strong>.modMorphs[]</strong>. Matrix keys are rewritten to reference the correct behavior automatically. Verify each binding in the MoErgo Layout Editor before flashing.</span>
                        </div>` : ''}
                        <table><tr><th>QMK Source</th><th>ZMK Tap-Dance</th><th>Decoded Bindings</th></tr>${buildTdRows(state.log.tap_dance)}</table>
                    </div>
                </details>

                <details class="report-category">
                    <summary>
                        <svg class="w-5 h-5 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg>
                        Mod-Morphs <span class="ml-2 bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-md text-[10px] font-bold">${modMorphCount}</span>
                        ${modMorphCount > 0 ? '<span class="ml-2 text-[10px] font-semibold text-teal-600 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md">✓ Added to JSON</span>' : ''}
                    </summary>
                    <div class="cat-content">
                        ${modMorphCount > 0 ? `
                        <div class="p-4 bg-teal-50/40 border-b border-teal-100 text-[13px] text-teal-800 flex items-start gap-2">
                            <svg class="w-4 h-4 shrink-0 mt-0.5 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            <span>These mod-morphs have been auto-migrated into the <strong>.modMorphs[]</strong> array in your downloaded JSON. They will appear in the <strong>Mod-Morph</strong> tab of the MoErgo Layout Editor. Each entry provides a base key and a shifted-modifier variant.</span>
                        </div>` : ''}
                        <table><tr><th>QMK Source</th><th>ZMK Mod-Morph</th><th>Base → Shifted Morph</th></tr>${buildMmRows(state.log.mod_morph)}</table>
                    </div>
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
