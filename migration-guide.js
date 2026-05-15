/**
 * migration-guide.js
 *
 * Single source of truth for all "how to rebuild this in ZMK / MoErgo" knowledge.
 *
 * Imported by:
 *   - worker.js  → getZmkSuggestion() for plain-text warning reasons
 *   - ui.js      → getZmkSuggestion() + getRebuildGuide() for the report UI
 */

// ---------------------------------------------------------------------------
// Plain-text suggestion stored as the `reason` field in warning log entries.
// Must stay plain text — the worker serialises this and sends it to the UI.
// ---------------------------------------------------------------------------
export function getZmkSuggestion(tok) {
    if (!tok) return "Requires a custom ZMK Behavior.";
    if (tok.includes('ALL_T'))
        return "Tap for key, Hold for Hyper (Ctrl+Shift+Alt+GUI). Recreate using MoErgo Layout Editor Hold-Tap.";
    if (tok.includes('TD(') || tok.includes('DANCE_'))
        return "Tap Dance: tap once for key1, tap twice for key2. Recreate using MoErgo Layout Editor Tap-Dance.";
    if (tok.includes('QK_LLCK'))
        return "Lock/unlock the currently active layer. Recreate Layer Lock using ZMK Sticky Layer (&sl) or Toggle Layer (&tog).";
    if (tok.includes('MAC_') || tok.includes('PC_'))
        return "Recreate as a MoErgo Layout Editor Macro.";
    if (tok.includes('NAVIGATOR') || tok.includes('MS_JIGGLER') || tok.includes('SCROLL') || tok.includes('MS_DBL_CLICK'))
        return "Rebuild using MoErgo Layout Editor Mouse Keys bindings.";
    if (tok.includes('LAYER_COLOR') || tok.includes('RGB') || tok.includes('HSV_'))
        return "Recreate using MoErgo Layout Editor RGB Underglow Behaviors (&rgb_ug).";
    if (tok.includes('LCTL(KC_MS') || tok.includes('LSFT(KC_MS'))
        return "ZMK cannot mix mouse clicks and keyboard modifiers on a single key. Rebuild as Macro.";
    if (tok.startsWith('LM('))
        return "ZMK does not natively support holding a Layer + Modifier simultaneously.";
    return "Requires a custom ZMK Behavior or Macro setup.";
}

// ---------------------------------------------------------------------------
// Rich HTML rebuild guide — used by the warning drilldown panel in ui.js.
// Returns an HTML string, or null if there is nothing useful to show.
// ---------------------------------------------------------------------------
export function getRebuildGuide(token, config) {
    // DUAL_FUNC is highest priority — may appear in config even when not in token
    if ((config && config.includes('DUAL_FUNC')) || (token && token.includes('DUAL_FUNC'))) {
        return _holdTapGuide();
    }

    if (config) {
        return _decodeQmkSource(config); // may return null — caller handles that
    }

    return null;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function _escHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g, m =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[m] || m));
}

function _cleanKeyLabel(raw) {
    return raw
        .replace(/KC_/g, '').replace(/X_/g, '')
        .replace(/LEFT_CTRL/g,  'Ctrl')     .replace(/LEFT_SHIFT/g,  'Shift')
        .replace(/LEFT_ALT/g,   'Alt')      .replace(/LEFT_GUI/g,    'Cmd/Win')
        .replace(/RIGHT_CTRL/g, 'RCtrl')    .replace(/RIGHT_SHIFT/g, 'RShift')
        .replace(/RIGHT_ALT/g,  'RAlt')     .replace(/RIGHT_GUI/g,   'RCmd/Win')
        .replace(/LCTL\((.*?)\)/, 'Ctrl + $1')  .replace(/LSFT\((.*?)\)/, 'Shift + $1')
        .replace(/LALT\((.*?)\)/, 'Alt + $1')   .replace(/LGUI\((.*?)\)/, 'Cmd + $1')
        .replace(/RCTL\((.*?)\)/, 'RCtrl + $1') .replace(/RSFT\((.*?)\)/, 'RShift + $1')
        .replace(/RALT\((.*?)\)/, 'RAlt + $1')  .replace(/RGUI\((.*?)\)/, 'RCmd + $1');
}

function _holdTapGuide() {
    return `
        <strong class="block text-slate-800 text-xs mb-2">Hold-Tap Behavior</strong>
        <div class="p-3 bg-blue-50 border border-blue-100 rounded-lg">
            <div class="flex items-center gap-2">
                <span class="font-mono text-blue-700">DUAL_FUNC</span>
                <span class="text-slate-400">→</span>
                <span class="font-medium text-slate-700">Hold-Tap / Dual-Function Key</span>
            </div>
            <p class="mt-2 text-[13px] text-slate-600">
                Rebuild as a ZMK <strong>Hold-Tap</strong> Behavior in the MoErgo Layout Editor.
            </p>
        </div>`;
}

function _decodeQmkSource(rawConfig) {
    // Strip the reset function — show only the _finished side
    const code = rawConfig.includes('_reset')
        ? rawConfig.split(/void\s+[a-zA-Z0-9_]+_reset/)[0]
        : rawConfig;

    // 1. Tap-Dance (conditional, case-based)
    if (code.includes('case SINGLE_TAP:') || code.includes('dance_step')) {
        return _decodeTapDance(code);
    }

    // 2. Standard macro (sequential SEND_STRING / tap_code chains)
    return _decodeMacro(code);
}

function _decodeTapDance(code) {
    const TD_CASES = [
        { id: 'SINGLE_TAP',        label: '1 Tap' },
        { id: 'SINGLE_HOLD',       label: 'Hold' },
        { id: 'DOUBLE_TAP',        label: '2 Taps' },
        { id: 'DOUBLE_HOLD',       label: 'Tap + Hold' },
        { id: 'DOUBLE_SINGLE_TAP', label: 'Tap then Hold' },
        { id: 'TRIPLE_TAP',        label: '3 Taps' },
        { id: 'TRIPLE_HOLD',       label: '2 Taps + Hold' },
    ];

    let rowsHtml = '';
    let found = false;

    for (const { id, label } of TD_CASES) {
        const caseRegex = new RegExp(`case\\s+${id}:(.*?)(?:break;|case\\s+[A-Z_]+:|\\})`, 's');
        const match = code.match(caseRegex);
        if (!match) continue;

        const keyCapRegex = /(?:tap_code16|register_code16|tap_code|register_code)\((.*?)\)\s*;/g;
        const caps = [];
        let m;
        while ((m = keyCapRegex.exec(match[1])) !== null) {
            caps.push(`<span class="keycap text-[10px] bg-white !border-slate-300 shadow-sm mx-0.5">${_cleanKeyLabel(m[1])}</span>`);
        }

        const unique = [...new Set(caps)];
        if (unique.length === 0) continue;

        found = true;
        rowsHtml += `
            <div class="flex items-center gap-3 mb-2 mt-1">
                <span class="w-24 shrink-0 text-[10px] font-bold text-slate-500 uppercase text-right">${label}</span>
                <span class="text-slate-300 text-[10px]">➔</span>
                <div class="flex flex-wrap items-center gap-y-1">
                    ${unique.join('<span class="text-slate-300 text-[10px] mx-1">+</span>')}
                </div>
            </div>`;
    }

    if (!found) return null;

    return `
        <strong class="block text-slate-800 text-xs mb-2">Tap Dance Behaviors:</strong>
        <div class="pt-1 pb-1">${rowsHtml}</div>`;
}

function _decodeMacro(code) {
    let htmlOutput = '';
    let hasContent = false;

    const cleanCode = code
        .replace(/if\s*\(.*?\)\s*\{/g, '')
        .replace(/\}/g, '')
        .replace(/break;/g, '')
        .replace(/case ST_MACRO_.*?:/g, '')
        .trim();

    // SEND_STRING blocks
    const sendStringRegex = /SEND_STRING\(([\s\S]*?)\);/g;
    const MODS = {
        SS_LCTL: 'Ctrl',  SS_LSFT: 'Shift', SS_LALT: 'Alt',   SS_LGUI: 'Cmd/Win',
        SS_RCTL: 'RCtrl', SS_RSFT: 'RShift', SS_RALT: 'RAlt', SS_RGUI: 'RCmd/Win',
    };
    let m;
    while ((m = sendStringRegex.exec(cleanCode)) !== null) {
        hasContent = true;
        let parsed = m[1].replace(/"([^"]+)"/g, ' [TYPE_STR:$1] ');

        for (const [qmkMod, uiMod] of Object.entries(MODS)) {
            parsed = parsed.replace(
                new RegExp(`${qmkMod}\\(([^)]+)\\)`, 'g'),
                `<strong class="text-slate-600 ml-1">${uiMod} +</strong> $1`
            );
        }

        parsed = parsed
            .replace(/SS_TAP\(X_([A-Z0-9_]+)\)/g,  '[$1]')
            .replace(/SS_DOWN\(X_([A-Z0-9_]+)\)/g, 'Hold [$1]')
            .replace(/SS_UP\(X_([A-Z0-9_]+)\)/g,   'Release [$1]')
            .replace(/SS_DELAY\(([0-9]+)\)/g,       ' [DELAY:$1] ')
            .replace(/X_([A-Z0-9_]+)/g,             '[$1]')
            .replace(/\[TYPE_STR:([^\]]+)\]/g,
                '<span class="text-blue-600 font-bold text-[11px] whitespace-nowrap inline-block bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 shadow-sm mx-1">Type "$1"</span>')
            .replace(/\[DELAY:([0-9]+)\]/g,
                '<span class="text-amber-600 font-bold text-[10px] bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 mx-1">⏱️ $1ms</span>')
            .replace(/\[([A-Z0-9_]+)\]/g,
                '<span class="keycap text-[10px] bg-white !border-slate-300 shadow-sm mx-0.5">$1</span>');

        htmlOutput += `<div class="flex items-center flex-wrap gap-y-2 leading-relaxed mb-2">${parsed}</div>`;
    }

    // tap_code / register_code sequences
    const codeRegex = /(tap_code16|register_code16|tap_code|register_code)\((.*?)\)\s*;/g;
    const tapSteps = [];
    while ((m = codeRegex.exec(cleanCode)) !== null) {
        hasContent = true;
        const action = m[1];
        const uiKey = _cleanKeyLabel(m[2]);
        const cap = `<span class="keycap text-[10px] bg-white !border-slate-300 shadow-sm mx-0.5">${uiKey}</span>`;
        if (action.includes('tap'))           tapSteps.push(`Tap ${cap}`);
        else if (action.includes('register')) tapSteps.push(`Hold ${cap}`);
    }

    // Deduplicate consecutive identical steps (Tap A + Hold A → just one row)
    const uniqueSteps = tapSteps.filter((s, i, a) => s !== a[i - 1]);
    if (uniqueSteps.length > 0) {
        htmlOutput += `<div class="flex items-center flex-wrap gap-2 mt-2">${uniqueSteps.join('<span class="text-slate-300 text-[10px]">➔</span>')}</div>`;
    }

    if (!hasContent) return null;

    return `
        <strong class="block text-slate-800 text-xs mb-2">Decoded Sequence:</strong>
        ${htmlOutput}`;
}
