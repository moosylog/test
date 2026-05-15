import { UI } from './ui.js';

export const App = {
    worker: null,
    currentTitle: "oma_layout",

    init: () => {
        window.addEventListener('error', e => UI.displayFatalError(`[Context Error] ${e.message}`, e.error?.stack));
        window.addEventListener('unhandledrejection', e => UI.displayFatalError(`[Async Error] ${e.reason?.message || e.reason}`, e.reason?.stack));
        
        if (typeof JSZip === 'undefined') {
            UI.displayFatalError("Required libraries failed to load. Please disable strict adblockers and refresh the page.");
            return;
        }

        App.worker = new Worker('worker.js?v=' + Date.now(), { type: 'module' });
        App.worker.onmessage = App.handleWorkerResponse;

        const dz = document.getElementById('dropZone');
        const prevent = e => { e.preventDefault(); e.stopPropagation(); };
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => dz.addEventListener(evt, prevent, false));
        ['dragenter', 'dragover'].forEach(evt => dz.addEventListener(evt, () => dz.classList.add('dragover'), false));
        ['dragleave', 'drop'].forEach(evt => dz.addEventListener(evt, () => dz.classList.remove('dragover'), false));
        
        dz.addEventListener('drop', e => { if (e.dataTransfer.files.length) App.processFile(e.dataTransfer.files[0]); }, false);
        document.getElementById('fileInput').addEventListener('change', function(e) {
            if (e.target.files.length) { App.processFile(e.target.files[0]); this.value = ''; }
        });
    },

    processFile: async (file) => {
        try {
            if (!file) throw new Error("No file selected.");
            
            UI.updateDropZone(file.name || "file", true);
            
            let rawText = "";
            if (file.name.endsWith('.zip')) {
                const zip = await JSZip.loadAsync(await file.arrayBuffer());
                const findFile = name => Object.values(zip.files).find(f => f.name.endsWith(name) && !f.dir && !f.name.includes("__MACOSX"));
                
                const [keymap, config, i18n] = [findFile("keymap.c"), findFile("config.h"), findFile("i18n.h")];
                if (!keymap) throw new Error("We couldn't find your source code inside that zip.\n\nDid you download your Firmware by mistake? Head back to ZSA Oryx, click the < > icon, and hit Download Source!");
                
                rawText = await keymap.async("string") + "\n\n";
                if (config) rawText += await config.async("string") + "\n\n";
                if (i18n) rawText += await i18n.async("string") + "\n\n";
            } else {
                rawText = await file.text();
            }
            
            App.currentTitle = file.name.split('.')[0] || "oma_migration";
            App.currentTitle = App.currentTitle.replace(/_source$/, '').replace(/[^a-zA-Z0-9_]/g, '_');
            
            App.worker.postMessage({ rawText, title: App.currentTitle });
        } catch (err) {
            UI.displayFatalError(err.message || err, err.stack);
        }
    },

    handleWorkerResponse: (e) => {
        const { success, finalOutput, state, layerCount, detectedBoard, targetBoard, error, stack } = e.data;
        
        if (!success) {
            UI.displayFatalError(error, stack);
            return;
        }

        document.getElementById('uploadScreen').classList.add('hidden');
        document.getElementById('successScreen').classList.remove('hidden');
        document.getElementById('successScreen').classList.add('flex');
        
        const detectionDiv = document.getElementById('boardDetection');
        if (detectionDiv) {
            detectionDiv.innerText = `Detected: ${detectedBoard}  |  Converted to: ${targetBoard}`;
        }
        
        const outBox = document.getElementById('outputJson');
        if (outBox) outBox.value = JSON.stringify(finalOutput, null, 2);
        
        UI.buildReport(layerCount, state);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    download: () => {
        const text = document.getElementById('outputJson')?.value;
        if (!text) return;
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type: 'application/json'}));
        a.download = `${App.currentTitle}.json`;
        a.click();
    }
};

window.App = App;
window.UI = UI;

document.addEventListener("DOMContentLoaded", App.init);
