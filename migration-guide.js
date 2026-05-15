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
        return "Tap for key, hold for Hyper (LC(LS(LA(LGUI)))). Recreate using MoErgo Layout Editor Hold-Tap (&mt).";
    if (tok.includes('TD(') || tok.includes('DANCE_'))
        return "Tap Dance: tap once for key1, tap twice for key2. Recreate using MoErgo Layout Editor Tap-Dance.";
    if (tok.includes('QK_LLCK'))
        return "Lock/unlock the currently active layer. Recreate using ZMK Sticky Layer (&sl) or Toggle Layer (&tog).";
    if (tok.includes('MAC_') || tok.includes('PC_'))
        return "Recreate as a MoErgo Layout Editor Macro.";
    if (tok.includes('NAVIGATOR') || tok.includes('MS_JIGGLER') || tok.includes('SCROLL') || tok.includes('MS_DBL_CLICK'))
        return "Rebuild using MoErgo Layout Editor Mouse Keys bindings.";
    if (tok.includes('LAYER_COLOR') || tok.includes('RGB') || tok.includes('HSV_'))
        return "Recreate using MoErgo Layout Editor RGB Underglow Behaviors (&rgb_ug).";
    if (tok.includes('LCTL(KC_MS') || tok.includes('LSFT(KC_MS'))
        return "ZMK cannot combine mouse buttons with keyboard modifiers on a single key. Rebuild as a Macro.";
    if (tok.startsWith('LM('))
        return "ZMK does not natively support holding a Layer and Modifier simultaneously. Rebuild as a Macro.";
    return "Requires a custom ZMK Behavior or Macro.";
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

// Map display labels to canonical ZMK modifier names
const ZMK_MOD_LABELS = {
    LEFT_CTRL:   'LCTRL',  LEFT_SHIFT:  'LSHIFT', LEFT_ALT:    'LALT',  LEFT_GUI:    'LGUI',
    RIGHT_CTRL:  'RCTRL',  RIGHT_SHIFT: 'RSHIFT',  RIGHT_ALT:   'RALT',  RIGHT_GUI:   'RGUI',
    LCTL:        'LCTRL',  LSFT:        'LSHIFT',  LALT:        'LALT',  LGUI:        'LGUI',
    RCTL:        'RCTRL',  RSFT:        'RSHIFT',  RALT:        'RALT',  RGUI:        'RGUI',
    LCMD:        'LGUI',   RCMD:        'RGUI',    LWIN:        'LGUI',  RWIN:        'RGUI',
    LOPT:        'LALT',   ROPT:        'RALT',
};

function _cleanKeyLabel(raw) {
    let s = raw
        .replace(/KC_/g, '')
        .replace(/X_/g, '');

    // Resolve wrapped modifiers to ZMK form: LCTL(A) → LC(A)
    s = s
        .replace(/LCTL\((.*?)\)/,  'LC($1)')
        .replace(/LSFT\((.*?)\)/,  'LS($1)')
        .replace(/LALT\((.*?)\)/,  'LA($1)')
        .replace(/LGUI\((.*?)\)/,  'LG($1)')
        .replace(/LCMD\((.*?)\)/,  'LG($1)')
        .replace(/LWIN\((.*?)\)/,  'LG($1)')
        .replace(/RCTL\((.*?)\)/,  'RC($1)')
        .replace(/RSFT\((.*?)\)/,  'RS($1)')
        .replace(/RALT\((.*?)\)/,  'RA($1)')
        .replace(/RGUI\((.*?)\)/,  'RG($1)')
        .replace(/RCMD\((.*?)\)/,  'RG($1)');

    // Replace any remaining verbose modifier names with ZMK equivalents
    for (const [from, to] of Object.entries(ZMK_MOD_LABELS)) {
        s = s.replace(new RegExp(`\\b${from}\\b`, 'g'), to);
    }

    return s;
}

// Shared section header — keeps all guides visually identical
function _sectionHeader(label) {
    return `<strong class="block text-slate-700 text-xs font-bold uppercase tracking-wider mb-2">${_escHtml(label)}</strong>`;
}

// Shared behavior badge used across all guide types
function _behaviorBadge(zmkToken) {
    return `<span class="font-mono text-[11px] font-bold text-slate-700 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">${_escHtml(zmkToken)}</span>`;
}

// Shared keycap chip
function _keycap(label) {
    return `<span class="keycap text-[10px] bg-white !border-slate-300 shadow-sm mx-0.5">${_escHtml(label)}</span>`;
}

// ---------------------------------------------------------------------------
// Hold-Tap guide  (&mt / &lt)
// ---------------------------------------------------------------------------
function _holdTapGuide() {
    return `
        ${_sectionHeader('Hold-Tap Behavior')}
        <div class="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <div class="flex items-center gap-2 mb-2">
                ${_behaviorBadge('&mt')} <span class="text-slate-400 text-xs">or</span> ${_behaviorBadge('&lt')}
                <span class="text-slate-400 text-[10px] mx-1">→</span>
                <span class="text-slate-600 text-[13px]">Dual-Function / Hold-Tap Key</span>
            </div>
            <p class="text-[12px] text-slate-500 leading-relaxed">
                Rebuild in the MoErgo Layout Editor using <strong class="text-slate-700">Hold-Tap</strong>.
                Use <code class="text-[11px]">&amp;mt MODIFIER KEY</code> for modifier-tap,
                or <code class="text-[11px]">&amp;lt LAYER KEY</code> for layer-tap.
            </p>
        </div>`;
}

// ---------------------------------------------------------------------------
// Route to Tap-Dance or Macro decoder
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Tap-Dance guide
// ---------------------------------------------------------------------------
function _decodeTapDance(code) {
    const TD_CASES = [
        { id: 'SINGLE_TAP',        label: '1× Tap' },
        { id: 'SINGLE_HOLD',       label: 'Hold' },
        { id: 'DOUBLE_TAP',        label: '2× Tap' },
        { id: 'DOUBLE_HOLD',       label: 'Tap + Hold' },
        { id: 'DOUBLE_SINGLE_TAP', label: 'Tap then Hold' },
        { id: 'TRIPLE_TAP',        label: '3× Tap' },
        { id: 'TRIPLE_HOLD',       label: '2× Tap + Hold' },
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
            caps.push(_keycap(_cleanKeyLabel(m[1])));
        }

        const unique = [...new Set(caps)];
        if (unique.length === 0) continue;

        found = true;
        rowsHtml += `
            <div class="flex items-center gap-3 mb-1.5">
                <span class="w-28 shrink-0 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">${_escHtml(label)}</span>
                <span class="text-slate-300 text-[10px]">→</span>
                <div class="flex flex-wrap items-center gap-y-1">
                    ${unique.join('<span class="text-slate-300 text-[10px] mx-0.5">+</span>')}
                </div>
            </div>`;
    }

    if (!found) return null;

    return `
        ${_sectionHeader('Tap-Dance Behavior')}
        <div class="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <div class="flex items-center gap-2 mb-3">
                ${_behaviorBadge('Tap-Dance')}
                <span class="text-slate-500 text-[12px]">Recreate in the MoErgo Layout Editor</span>
            </div>
            <div class="pt-1">${rowsHtml}</div>
        </div>`;
}

// ---------------------------------------------------------------------------
// Macro guide
// ---------------------------------------------------------------------------
function _decodeMacro(code) {
    let htmlOutput = '';
    let hasContent = false;

    const cleanCode = code
        .replace(/if\s*\(.*?\)\s*\{/g, '')
        .replace(/\}/g, '')
        .replace(/break;/g, '')
        .replace(/case ST_MACRO_.*?:/g, '')
        .trim();

    // QMK modifier → ZMK modifier name
    const MODS = {
        SS_LCTL: 'LC', SS_LSFT: 'LS', SS_LALT: 'LA', SS_LGUI: 'LG',
        SS_RCTL: 'RC', SS_RSFT: 'RS', SS_RALT: 'RA', SS_RGUI: 'RG',
    };

    // SEND_STRING blocks
    const sendStringRegex = /SEND_STRING\(([\s\S]*?)\);/g;
    let m;
    while ((m = sendStringRegex.exec(cleanCode)) !== null) {
        hasContent = true;
        let parsed = m[1].replace(/"([^"]+)"/g, ' [TYPE_STR:$1] ');

        for (const [qmkMod, zmkMod] of Object.entries(MODS)) {
            parsed = parsed.replace(
                new RegExp(`${qmkMod}\\(([^)]+)\\)`, 'g'),
                `<strong class="text-slate-600 font-mono text-[11px] ml-1">${zmkMod}(</strong>$1<strong class="text-slate-600 font-mono text-[11px]">)</strong>`
            );
        }

        parsed = parsed
            .replace(/SS_TAP\(X_([A-Z0-9_]+)\)/g,  '[$1]')
            .replace(/SS_DOWN\(X_([A-Z0-9_]+)\)/g, 'Hold [$1]')
            .replace(/SS_UP\(X_([A-Z0-9_]+)\)/g,   'Release [$1]')
            .replace(/SS_DELAY\(([0-9]+)\)/g,       ' [DELAY:$1] ')
            .replace(/X_([A-Z0-9_]+)/g,             '[$1]')
            .replace(/\[TYPE_STR:([^\]]+)\]/g,
                `<span class="text-blue-700 font-bold text-[11px] whitespace-nowrap inline-block bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 shadow-sm mx-1">Type "$1"</span>`)
            .replace(/\[DELAY:([0-9]+)\]/g,
                `<span class="text-amber-700 font-bold text-[10px] bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 mx-1">⏱ $1 ms</span>`)
            .replace(/\[([A-Z0-9_]+)\]/g,
                `<span class="keycap text-[10px] bg-white !border-slate-300 shadow-sm mx-0.5">$1</span>`);

        htmlOutput += `<div class="flex items-center flex-wrap gap-y-2 leading-relaxed mb-2">${parsed}</div>`;
    }

    // tap_code / register_code sequences
    const codeRegex = /(tap_code16|register_code16|tap_code|register_code)\((.*?)\)\s*;/g;
    const tapSteps = [];
    while ((m = codeRegex.exec(cleanCode)) !== null) {
        hasContent = true;
        const action = m[1];
        const uiKey = _cleanKeyLabel(m[2]);
        const cap = _keycap(uiKey);
        if (action.includes('tap'))           tapSteps.push(`Tap ${cap}`);
        else if (action.includes('register')) tapSteps.push(`Hold ${cap}`);
    }

    // Deduplicate consecutive identical steps
    const uniqueSteps = tapSteps.filter((s, i, a) => s !== a[i - 1]);
    if (uniqueSteps.length > 0) {
        htmlOutput += `<div class="flex items-center flex-wrap gap-2 mt-2">
            ${uniqueSteps.join('<span class="text-slate-300 text-[10px]">→</span>')}
        </div>`;
    }

    if (!hasContent) return null;

    return `
        ${_sectionHeader('Macro Sequence')}
        <div class="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <div class="flex items-center gap-2 mb-3">
                ${_behaviorBadge('Macro')}
                <span class="text-slate-500 text-[12px]">Recreate in the MoErgo Layout Editor</span>
            </div>
            ${htmlOutput}
        </div>`;
}
