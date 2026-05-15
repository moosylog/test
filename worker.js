import { Constants } from './constants.js';
import { getZmkSuggestion } from './migration-guide.js';

const Utils = {
    safeUUID: () => {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    },
    logConversion: (state, original, translated, category, reason = "", context = null) => {
        if (!state.log[category]) state.log[category] = {};
        if (!state.log[category][original]) state.log[category][original] = { translated, count: 0, reason, contexts: [] };
        state.log[category][original].count++;
        if (context && category === 'warning') state.log[category][original].contexts.push(context);
    },
    hsvToHex: (h, s, v) => {
        let s_pct = s / 255, v_pct = v / 255, h_deg = h * 360 / 255;
        let c = v_pct * s_pct, x = c * (1 - Math.abs(((h_deg / 60) % 2) - 1)), m = v_pct - c;
        let r = 0, g = 0, b = 0;
        if (h_deg >= 0 && h_deg < 60) { r = c; g = x; b = 0; }
        else if (h_deg >= 60 && h_deg < 120) { r = x; g = c; b = 0; }
        else if (h_deg >= 120 && h_deg < 180) { r = 0; g = c; b = x; }
        else if (h_deg >= 180 && h_deg < 240) { r = 0; g = x; b = c; }
        else if (h_deg >= 240 && h_deg < 300) { r = x; g = 0; b = c; }
        else { r = c; g = 0; b = x; }
        r = Math.round((r + m) * 255); g = Math.round((g + m) * 255); b = Math.round((b + m) * 255);
        return "#" + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1) + "ff"; 
    },
    getSourcePosition: (idx) => {
        if (idx === null || idx === undefined) return "Unknown Matrix Position";
        return `Matrix Index: ${idx}`;
    }
};

const Parser = {
    prepareCCode: (rawText) => rawText.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '').replace(/[ \t]+/g, ' ').trim(),
    
    splitQmkKeys: (str) => {
        let keys = [], current = "", depth = 0;
        for (let i = 0; i < str.length; i++) {
            if (str[i] === '(') depth++; else if (str[i] === ')') depth--;
            else if (str[i] === ',' && depth === 0) { keys.push(current.trim()); current = ""; continue; }
            current += str[i];
        }
        if (current.trim()) keys.push(current.trim());
        return keys;
    },

    extractLedmap: (text) => {
        let ledmapStr = text.match(/const\s+uint8_t\s+PROGMEM\s+ledmap\[\]\[RGB_MATRIX_LED_COUNT\]\[3\]\s*=\s*\{([\s\S]*?)\};/);
        if (!ledmapStr) return {};
        let layerColors = {}, layerBlocks = ledmapStr[1].split(/\[(\d+)\]\s*=\s*\{/);
        for (let i = 1; i < layerBlocks.length; i += 2) {
            let layerIdx = parseInt(layerBlocks[i]), colorData = layerBlocks[i+1], colors = [];
            let colorRegex = /\{\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\}/g, cMatch;
            while ((cMatch = colorRegex.exec(colorData)) !== null) colors.push({ h: parseInt(cMatch[1]), s: parseInt(cMatch[2]), v: parseInt(cMatch[3]) });
            layerColors[layerIdx] = colors;
        }
        return layerColors;
    },

    getConfigForToken: (rawToken, state) => {
        let configs = [];
        let extractKeys = (str) => {
            let res = [str], match = str.match(/^[A-Z0-9_]+\((.*)\)$/i);
            if (match) res.push(...Parser.splitQmkKeys(match[1]));
            return res.map(s => s.trim());
        };
        
        extractKeys(rawToken).forEach(k => {
            let cleanK = k.replace(/^KC_/, '').trim(), tdKey = cleanK.replace(/^TD\(/, '').replace(/\)$/, '');
            if (state.tapDances[tdKey]) configs.push(state.tapDances[tdKey]);
            if (state.tapDances[cleanK]) configs.push(state.tapDances[cleanK]);
            if (state.macros[cleanK]) configs.push(state.macros[cleanK]);
            if (state.rawDefines[cleanK]) configs.push(state.rawDefines[cleanK]);
            if (state.customCases[cleanK]) configs.push(`case ${cleanK}:\n    ${state.customCases[cleanK]}\n    break;`);
        });

        let uniqueConfigs = [...new Set(configs)];
        return uniqueConfigs.length > 0 ? uniqueConfigs.join('\n\n// ------------------------------------\n\n') : null;
    },

    parseOryxCombos: (cCode, layer0Nodes, state, activeBoard) => {
        const comboDefs = {}; const combos = [];
        const comboArrayRegex = /const\s+uint16_t\s+(?:PROGMEM\s+)?([a-zA-Z0-9_]+)\[\]\s*=\s*\{([\s\S]*?)\};/g;
        let cMatch;
        while ((cMatch = comboArrayRegex.exec(cCode)) !== null) {
            comboDefs[cMatch[1]] = Parser.splitQmkKeys(cMatch[2]).filter(s => s !== 'COMBO_END' && s.length > 0);
        }

        const deepEqualAst = (a, b) => {
            if (a.value !== b.value) return false;
            if (!a.params && !b.params) return true;
            if (!a.params || !b.params || a.params.length !== b.params.length) return false;
            return a.params.every((p, i) => deepEqualAst(p, b.params[i]));
        };

        const combosBlock = cCode.match(/combo_t\s+[a-zA-Z0-9_]+[^=]*=\s*\{([\s\S]*?)\};/);
        if (combosBlock) {
            let blockStr = combosBlock[1], searchIdx = 0;
            while ((searchIdx = blockStr.indexOf('COMBO', searchIdx)) !== -1) {
                let start = blockStr.indexOf('(', searchIdx);
                if (start === -1) break;
                
                let end = -1, depth = 0;
                for (let i = start; i < blockStr.length; i++) {
                    if (blockStr[i] === '(') depth++;
                    if (blockStr[i] === ')') depth--;
                    if (depth === 0) { end = i; break; }
                }
                
                if (end !== -1) {
                    let innerArgs = blockStr.substring(start + 1, end), commaIdx = innerArgs.indexOf(',');
                    if (commaIdx !== -1) {
                        let comboName = innerArgs.substring(0, commaIdx).trim(), resultKey = innerArgs.substring(commaIdx + 1).trim();
                        
                        if (comboDefs[comboName]) {
                            let positions = comboDefs[comboName].map(k => {
                                let zmkTarget = Parser.translateAst(k, state, "Combo", null, null);
                                if (zmkTarget?.value === "&none" || zmkTarget?.value === "none") return -1;
                                let targetKeyVal = (zmkTarget?.params && zmkTarget.params[0]) ? zmkTarget.params[0].value : null;
                                return layer0Nodes.findIndex(node => {
                                    if (deepEqualAst(node, zmkTarget)) return true;
                                    if (['&mt', '&lt', '&sk'].includes(node?.value) && node?.params) {
                                        if (node.params.length > 1 && targetKeyVal && node.params[1]?.value === targetKeyVal) return true;
                                        if (node.params.length === 1 && targetKeyVal && node.params[0]?.value === targetKeyVal) return true;
                                    }
                                    return false;
                                });
                            }).filter(p => p !== -1);

                            let finalBinding = Parser.translateAst(resultKey, state, "Combo", null, null);
                            if (positions.length === comboDefs[comboName].length) {
                                if (finalBinding?.value === "&none" || finalBinding?.value === "none") {
                                    Utils.logConversion(state, `COMBO(${comboName})`, "Dropped", "warning", getZmkSuggestion(resultKey));
                                } else {
                                    combos.push({
                                        name: comboName, description: `Migrated combo: ${comboName}`,
                                        binding: finalBinding, keyPositions: positions, timeoutMs: state.config.comboTerm, layers: [0] 
                                    });
                                    Utils.logConversion(state, `COMBO(${comboName})`, `[Pos: ${positions.join(', ')}] -> ${finalBinding.value}`, "combo");
                                }
                            } else {
                                Utils.logConversion(state, `COMBO(${comboName})`, "Dropped", "warning", "Could not map all source keys to the target matrix.");
                            }
                        }
                    }
                }
                searchIdx = end !== -1 ? end : searchIdx + 5;
            }
        }
        return combos;
    },

    resolveZmkKeycode: (str, rawToken, state, context) => {
        if (!str) return "none";
        let clean = str.replace(/^KC_/, '').replace(/^X_/, '').trim();
        if (/^[0-9]$/.test(clean)) return `N${clean}`;
        
        if (clean === "MS_BTN1" || clean === "LCLK") return "LCLK";
        if (clean === "MS_BTN2" || clean === "RCLK") return "RCLK";
        if (clean === "MS_BTN3" || clean === "MCLK") return "MCLK";

        let mapped = Constants.QMK_TO_ZMK_MAP[clean];
        if (mapped === "MB1") return "LCLK";
        if (mapped === "MB2") return "RCLK";
        if (mapped === "MB3") return "MCLK";
        
        if (mapped) return mapped;
        if (/^F[1-9][0-9]?$/.test(clean) || /^[A-Z]$/.test(clean)) return clean;
        if (clean === "none" || clean === "trans" || clean === 'QK_BOOT' || clean === 'CW_TOGG') return clean;
        if (clean.startsWith('RGB_')) return clean;
        if (clean.startsWith('STN_') || clean.startsWith('QK_STENO') || clean.startsWith('DM_') || clean.startsWith('HSV_') || clean === 'LED_LEVEL') {
            Utils.logConversion(state, rawToken || str, "&none", "warning", getZmkSuggestion(rawToken || str), context);
            return "none";
        }
        Utils.logConversion(state, rawToken || str, "&none", "warning", getZmkSuggestion(rawToken || str), context);
        return "none";
    },

    parseMacroParam: (str, state, context) => {
        if (!str) return { value: "none" };
        str = str.trim();
        if (state.defines[str] !== undefined) str = state.defines[str];

        if (str === 'MOD_HYPR' || str === 'KC_HYPR' || str === 'HYPR') str = 'LS(LC(LA(LGUI)))';
        if (str === 'MOD_MEH' || str === 'KC_MEH' || str === 'MEH') str = 'LS(LC(LALT))';
        
        if (Constants.DEALBREAKER_KEYS.some(bad => str.includes(bad))) {
            Utils.logConversion(state, str, "&none", "warning", getZmkSuggestion(str), context);
            return { value: "none" }; 
        }

        let wrapMatch = str.match(/^([A-Z0-9_]+)\((.*)\)$/i);
        if (wrapMatch) {
            let func = wrapMatch[1].toUpperCase();
            let modMap = {"LSFT":"LS", "LCTL":"LC", "LALT":"LA", "LGUI":"LG", "LCMD":"LG", "LWIN":"LG", "LOPT":"LA", "RSFT":"RS", "RCTL":"RC", "RALT":"RA", "RGUI":"RG", "RCMD":"RG", "RWIN":"RG", "ROPT":"RA", "S":"LS", "C":"LC", "A":"LA", "G":"LG", "ALGR":"RA"}; 
            if (modMap[func]) func = modMap[func];
            let inner = Parser.parseMacroParam(wrapMatch[2], state, context);
            return inner?.value === "none" ? { value: "none" } : { value: func, params: [inner] };
        }
        
        let resolved = Parser.resolveZmkKeycode(str, str, state, context);
        if (['LCLK', 'RCLK', 'MCLK', 'MB4', 'MB5', 'MOVE_UP', 'MOVE_DOWN', 'MOVE_LEFT', 'MOVE_RIGHT', 'SCRL_UP', 'SCRL_DOWN', 'SCRL_LEFT', 'SCRL_RIGHT'].includes(resolved)) {
            Utils.logConversion(state, str, "&none", "warning", getZmkSuggestion(str), context);
            return { value: "none" };
        }
        return { value: resolved };
    },

    translateAst: (rawToken, state, layerIdx = null, keyIdx = null, keyColor = null) => {
        if (!rawToken) return { value: "&none" };
        let tok = rawToken.trim();

        if (tok === 'MOD_HYPR' || tok === 'KC_HYPR' || tok === 'HYPR') tok = 'LS(LC(LA(LGUI)))';
        if (tok === 'MOD_MEH' || tok === 'KC_MEH' || tok === 'MEH') tok = 'LS(LC(LALT))';

        let configInfo = Parser.getConfigForToken(rawToken, state);
        let positionName = layerIdx === "Combo" ? "Inside Combo" : Utils.getSourcePosition(keyIdx);
        const context = { layer: layerIdx, pos: positionName, config: configInfo, color: keyColor };
        
        if (Constants.DEALBREAKER_KEYS.some(bad => tok.includes(bad))) {
            Utils.logConversion(state, rawToken, "&none", "warning", getZmkSuggestion(rawToken), context);
            return { value: "&none" };
        }

        let resolveCount = 0;
        while (state.defines[tok] && resolveCount < 10) { tok = state.defines[tok]; resolveCount++; }

        let match = tok.match(/^([A-Z0-9_]+)\((.*)\)$/i);
        if (match) {
            let func = match[1].toUpperCase(), innerTokens = Parser.splitQmkKeys(match[2]);
            let modMap = {"LSFT":"LS", "LCTL":"LC", "LALT":"LA", "LGUI":"LG", "LCMD":"LG", "LWIN":"LG", "LOPT":"LA", "RSFT":"RS", "RCTL":"RC", "RALT":"RA", "RGUI":"RG", "RCMD":"RG", "RWIN":"RG", "ROPT":"RA", "S":"LS", "C":"LC", "A":"LA", "G":"LG", "ALGR":"RA"}; 
            if (modMap[func]) func = modMap[func];

            const modTapMap = {
                "LCTL_T": "LCTRL", "CTL_T": "LCTRL", "C_T": "LCTRL", "LSFT_T": "LSHIFT", "SFT_T": "LSHIFT", "S_T": "LSHIFT",
                "LALT_T": "LALT", "ALT_T": "LALT", "A_T": "LALT", "LOPT_T": "LALT", "OPT_T": "LALT", "LGUI_T": "LGUI", "GUI_T": "LGUI", 
                "CMD_T": "LGUI", "LCMD_T": "LGUI", "WIN_T": "LGUI", "LWIN_T": "LGUI", "RCTL_T": "RCTRL",  "RSFT_T": "RSHIFT",  
                "RALT_T": "RALT", "ROPT_T": "RALT", "ALGR_T": "RALT", "RGUI_T": "RGUI", "RCMD_T": "RGUI", "RWIN_T": "RGUI"
            };

            if (modTapMap[func]) {
                let p0 = Parser.parseMacroParam(innerTokens[0], state, context);
                if (!p0 || p0.value === "none") return { value: "&none" };
                Utils.logConversion(state, rawToken, `&mt ${modTapMap[func]} ${p0.value}`, "hold_tap");
                return { value: "&mt", params: [{ value: modTapMap[func] }, p0] };
            }

            if (func === 'OSM') {
                let p0 = Parser.parseMacroParam(innerTokens[0], state, context);
                if (!p0 || p0.value === "none") return { value: "&none" }; 
                Utils.logConversion(state, rawToken, "&sk", "hold_tap");
                return { value: "&sk", params: [p0] };
            }
            
            if (['MEH_T', 'HYPR_T'].includes(func)) {
                let modAST = (func === 'MEH_T') ? { value: "LC", params: [{ value: "LS", params: [{ value: "LALT" }] }] } : { value: "LC", params: [{ value: "LS", params: [{ value: "LA", params: [{ value: "LGUI" }] }] }] };
                let p0 = Parser.parseMacroParam(innerTokens[0], state, context);
                if (!p0 || p0.value === "none") return { value: "&none" };
                Utils.logConversion(state, rawToken, `&mt HYPR/MEH`, "hold_tap");
                return { value: "&mt", params: [modAST, p0] };
            }
            
            if (func === 'LM') {
                Utils.logConversion(state, rawToken, "&none", "warning", "ZMK does not natively support holding a Layer + Modifier simultaneously.", context);
                return { value: "&none" };
            }
            
            if (['MT', 'LT', 'OSL', 'TT', 'TG', 'TO', 'MO'].includes(func)) {
                let params = [];
                if (['LT', 'OSL', 'TT', 'TG', 'TO', 'MO'].includes(func)) {
                    let p0 = innerTokens[0] ? innerTokens[0].trim() : "0";
                    let layerNum = state.defines[p0] !== undefined ? state.defines[p0] : parseInt(p0);
                    params.push({ value: isNaN(layerNum) ? p0 : layerNum });
                } else if (func === 'MT') {
                    let p0 = Parser.parseMacroParam(innerTokens[0], state, context);
                    if (!p0 || p0.value === "none") return { value: "&none" };
                    params.push(p0);
                }
                if (innerTokens.length > 1) {
                    let p1 = Parser.parseMacroParam(innerTokens[1], state, context);
                    if (!p1 || p1.value === "none") return { value: "&none" }; 
                    params.push(p1);
                }
                let zmkFunc = (func === 'TT' || func === 'TG') ? '&tog' : func === 'OSL' ? '&sl' : (func === 'MO' ? '&mo' : `&${func.toLowerCase()}`);
                Utils.logConversion(state, rawToken, zmkFunc, "hold_tap");
                return { value: zmkFunc, params };
            }
            
            let parsedParams = innerTokens.map(p => Parser.parseMacroParam(p, state, context)).filter(p => p && p.value !== "none");
            if (parsedParams.length === 0) return { value: "&none" };

            if (['LS', 'LC', 'LA', 'LG', 'RS', 'RC', 'RA', 'RG', 'S', 'C', 'A', 'G', 'ALGR'].includes(func)) {
                Utils.logConversion(state, rawToken, "Nested Modifiers", "layer_binding");
                return { value: "&kp", params: [{ value: func, params: parsedParams }] };
            }
            return { value: `&${func.toLowerCase()}`, params: parsedParams };
        }

        let bareResolved = Parser.resolveZmkKeycode(tok, rawToken, state, context);
        if (bareResolved === "trans" || bareResolved === "none") return { value: `&${bareResolved}` };
        if (bareResolved === "CW_TOGG") { Utils.logConversion(state, rawToken, "&caps_word", "layer_binding"); return { value: "&caps_word" }; }
        if (bareResolved === "QK_BOOT" || bareResolved === "RESET") { Utils.logConversion(state, rawToken, "&bootloader", "layer_binding"); return { value: "&bootloader" }; }
        
        if (tok.startsWith('RGB_')) {
            let mappedRgb = Constants.RGB_MAP[tok] || tok;
            if (Constants.VALID_ZMK_RGB.includes(mappedRgb)) {
                Utils.logConversion(state, rawToken, mappedRgb, "layer_binding");
                return { value: "&rgb_ug", params: [{value: mappedRgb}] };
            }
            Utils.logConversion(state, rawToken, "&none", "warning", "RGB animation is a proprietary feature.", context);
            return { value: "&none" };
        }
        
        if (bareResolved.startsWith('MOVE_')) { 
            Utils.logConversion(state, rawToken, `&mmv ${bareResolved}`, "layer_binding", "", context); 
            return { value: "&mmv", params: [{ value: bareResolved }] }; 
        }
        if (bareResolved.startsWith('SCRL_')) { 
            Utils.logConversion(state, rawToken, `&msc ${bareResolved}`, "layer_binding", "", context); 
            return { value: "&msc", params: [{ value: bareResolved }] }; 
        }
        
        if (['LCLK', 'RCLK', 'MCLK', 'MB4', 'MB5'].includes(bareResolved)) { 
            Utils.logConversion(state, rawToken, `&mkp ${bareResolved}`, "layer_binding", "", context); 
            return { value: "&mkp", params: [{ value: bareResolved }] }; 
        }

        Utils.logConversion(state, rawToken, bareResolved, "layer_binding", "", context);
        return { value: "&kp", params: [{ value: bareResolved }] };
    }
};

const BOARD_CONFIGS = {
    "LAYOUT_voyager": {
        name: "Voyager", targetBoard: "Go60", targetKeyCount: 60, isVoyager: true,
        templateUrl: "https://gist.githubusercontent.com/moosylog/a71d65a4b2de4215d7e226449f3cadb2/raw/ee1661e9adbe197285b50ef0bd8997f6a80e795c/Go60_default.json"
    },
    "LAYOUT_moonlander": {
        name: "Moonlander", targetBoard: "Glove80", targetKeyCount: 80, isVoyager: false,
        templateUrl: "https://gist.githubusercontent.com/moosylog/a71d65a4b2de4215d7e226449f3cadb2/raw/ee1661e9adbe197285b50ef0bd8997f6a80e795c/Glove80_default.json",
        // EXPLICIT MAP: Maps Moonlander index [i] to Glove80 index [matrixMap[i]]
        // Note: -1 means the Moonlander key is dropped (since Glove80 has 1 fewer column)
// EXPLICIT MAP: Maps Moonlander index [i] to Glove80 index [matrixMap[i]]
        // Note: -1 means the Moonlander key is dropped.
      // EXPLICIT MAP: Maps Moonlander interleaved C-array index [i] to Glove80 index
        // Note: -1 means the Moonlander's inner 7th column key is dropped.
    // EXPLICIT MAP: Maps Moonlander interleaved C-array index [i] to Glove80 index
        // Note: -1 means the Moonlander's inner 7th column key is dropped.
      // EXPLICIT MAP: Maps Moonlander interleaved C-array index [i] to Glove80 index
        // Note: The inner 7th column keys are now "parked" on the top Function row!
    // EXPLICIT MAP: Maps Moonlander interleaved C-array index [i] to Glove80 index
// EXPLICIT MAP: Maps Moonlander interleaved C-array index [i] to Glove80 index
// EXPLICIT MAP: Maps Moonlander interleaved C-array index [i] to Glove80 index
        matrixMap: [
            /* ================================================= */
            /* ROW 1: Numbers (7 keys per side)                  */
            /* ================================================= */
            
            // Left Row 1 -> Glove80 Left Nums 
            10, 11, 12, 13, 14, 15, -1, // (Inner 1 safely dropped)
            
            // Right Row 1 -> Glove80 Right Nums 
            -1, 16, 17, 18, 19, 20, 21, // (Inner 1 safely dropped)

            /* ================================================= */
            /* ROW 2: Top / QWERTY (7 keys per side)             */
            /* ================================================= */
            
            // Left Row 2 -> Glove80 Left Top 
            22, 23, 24, 25, 26, 27, 53, // (Inner 2 mapped to Left Thumb Top Middle)
            
            // Right Row 2 -> Glove80 Right Top 
            55, 28, 29, 30, 31, 32, 33, // (Inner 2 mapped to Right Thumb Top Inner)

            /* ================================================= */
            /* ROW 3: Home / ASDF (7 keys per side)              */
            /* ================================================= */
            
            // Left Row 3 -> Glove80 Left Home 
            34, 35, 36, 37, 38, 39, 54, // (Inner 3 mapped to Left Thumb Top Outer)
            
            // Right Row 3 -> Glove80 Right Home 
            56, 40, 41, 42, 43, 44, 45, // (Inner 3 mapped to Right Thumb Top Middle)

            /* ================================================= */
            /* ROW 4: Bottom / ZXCV (6 KEYS PER SIDE)            */
            /* ================================================= */
            
            // Left Row 4 -> Glove80 Left Bottom 
            46, 47, 48, 49, 50, 51,     
            
            // Right Row 4 -> Glove80 Right Bottom 
            58, 59, 60, 61, 62, 63,     

            /* ================================================= */
            /* THE CHAOS ROW: Modifiers & Top Thumbs             */
            /* ================================================= */
            
            // 5 Left Modifiers -> Glove80 Left Bottom Edge
            64, 65, 66, 67, 68,         
            
            // 1 Left Top Thumb -> Left Thumb Top Inner
            52,                        
            
            // 1 Right Top Thumb -> Right Thumb Top Outer
            57,                        
            
            // 5 Right Modifiers -> Glove80 Right Bottom Edge
            75, 76, 77, 78, 79,        

            /* ================================================= */
            /* THE MAIN THUMBS                                   */
            /* ================================================= */
            
            // 3 Left Thumbs -> Glove80 Left Thumb Bottom Row
            69, 70, 71,                 
            
            // 3 Right Thumbs -> Glove80 Right Thumb Bottom Row
            72, 73, 74                  
        ]
    
    
    },
    "LAYOUT_ergodox": {
        name: "ErgoDox", targetBoard: "Glove80", targetKeyCount: 80, isVoyager: false,
        templateUrl: "https://gist.githubusercontent.com/moosylog/a71d65a4b2de4215d7e226449f3cadb2/raw/ee1661e9adbe197285b50ef0bd8997f6a80e795c/Glove80_default.json",
        // Basic map for Ergodox. Your engineer can tune these arrays exactly as needed!
        matrixMap: [
            0,1,2,3,4,5,6, 11,12,13,14,15,16,10, 17,18,19,20,21,22,-1, 23,24,25,26,27,28,-1, 29,30,31,32,33,
            34,35, 36,37,38, 39,
            40,41,42,43,44,45,46, 47,51,52,53,54,55,56, -1,57,58,59,60,61,62, -1,63,64,65,66,67,68, 69,70,71,72,73,
            74,75, 76,77,78, 79
        ]
    }
};

self.onmessage = async function(e) {
    const { rawText, title } = e.data;
    try {
        if (!rawText) throw new Error("No source code text provided to the parser.");

        const state = { log: { layer_binding: {}, hold_tap: {}, combo: {}, warning: {} }, macros: {}, tapDances: {}, rawDefines: {}, customCases: {}, config: { tappingTerm: 200, comboTerm: 50 }, defines: {} };
        const cleanText = Parser.prepareCCode(rawText);

        let activeBoard = null, layoutMacroName = null;

        for (const [macro, config] of Object.entries(BOARD_CONFIGS)) {
            if (cleanText.includes(macro)) {
                activeBoard = config;
                layoutMacroName = macro;
                break;
            }
        }
        
        if (!activeBoard) {
            throw new Error("No supported ZSA layout (Voyager, Moonlander, or ErgoDox) found in the C code. Please ensure you uploaded valid Oryx source code.");
        }

        const tapMatch = cleanText.match(/#define\s+TAPPING_TERM\s+(\d+)/);
        if (tapMatch) state.config.tappingTerm = parseInt(tapMatch[1]);
        const comboMatch = cleanText.match(/#define\s+COMBO_TERM\s+(\d+)/);
        if (comboMatch) state.config.comboTerm = parseInt(comboMatch[1]);
        
        const defRegex = /#define\s+([A-Za-z0-9_]+)\s+([^\n\r]+)/g; let m;
        while ((m = defRegex.exec(cleanText)) !== null) state.defines[m[1]] = m[2].trim();
        
        const rawDefRegex = /#define\s+([A-Za-z0-9_]+)\s+([^\n\r]+)/g;
        while ((m = rawDefRegex.exec(rawText)) !== null) {
            if (m[1] !== "TAPPING_TERM" && m[1] !== "COMBO_TERM") state.rawDefines[m[1]] = m[0].trim();
        }

        const extractBraceBlockRaw = (text, startIdx) => {
            let start = text.indexOf('{', startIdx);
            if (start === -1) return null;
            let depth = 0, end = -1;
            for (let i = start; i < text.length; i++) {
                if (text[i] === '{') depth++;
                if (text[i] === '}') depth--;
                if (depth === 0) { end = i + 1; break; }
            }
            if (end !== -1) return text.substring(start, end).trim();
            return null;
        };

        let tdRegex = /void\s+(dance_[a-zA-Z0-9_]+)_finished\s*\(/gi, match;
        while ((match = tdRegex.exec(rawText)) !== null) {
            let block = extractBraceBlockRaw(rawText, match.index), name = match[1].toUpperCase();
            if (block) state.tapDances[name] = `void ${match[1]}_finished(...) ${block}`;
        }
        
        let tdResetRegex = /void\s+(dance_[a-zA-Z0-9_]+)_reset\s*\(/gi;
        while ((match = tdResetRegex.exec(rawText)) !== null) {
            let block = extractBraceBlockRaw(rawText, match.index), name = match[1].toUpperCase();
            if (block && state.tapDances[name]) state.tapDances[name] += `\n\nvoid ${match[1]}_reset(...) ${block}`;
        }

        let macroRegex = /case\s+(ST_MACRO_[a-zA-Z0-9_]+):/g;
        while ((match = macroRegex.exec(rawText)) !== null) {
            let start = match.index, end = rawText.indexOf('break;', start);
            if (end !== -1) state.macros[match[1]] = `case ${match[1]}:\n${rawText.substring(start + match[0].length, end).trim()}\n    break;`;
        }

        let caseRegexFast = /case\s+([A-Za-z0-9_]+)\s*:/g;
        while ((match = caseRegexFast.exec(rawText)) !== null) {
            let name = match[1];
            if (name.startsWith('ST_MACRO_') || name.startsWith('TD_') || name.startsWith('KC_')) continue;
            
            let start = match.index + match[0].length, end = rawText.indexOf('break;', start);
            if (end !== -1 && (end - start) < 1000) {
                let block = rawText.substring(start, end).trim();
                if (block && !state.macros[name]) state.customCases[name] = block;
            }
        }

        const ledmapColors = Parser.extractLedmap(cleanText);

        let rawLayers = []; let idx = cleanText.indexOf(layoutMacroName);
        while (idx !== -1) {
            let start = cleanText.indexOf('(', idx); let end = -1, depth = 0;
            for (let i = start; i < cleanText.length; i++) {
                if (cleanText[i] === '(') depth++; if (cleanText[i] === ')') depth--;
                if (depth === 0) { end = i; break; }
            }
            if (end !== -1) { rawLayers.push(cleanText.substring(start + 1, end)); idx = cleanText.indexOf(layoutMacroName, end); }
            else break;
        }

        const maxLayerIdx = rawLayers.length - 1;

        let astLayers = rawLayers.map((layerStr, layerIdx) => {
            const tokens = Parser.splitQmkKeys(layerStr);
            const astKeys = tokens.map((tok, keyIdx) => {
                let colorObj = ledmapColors[layerIdx] && ledmapColors[layerIdx][keyIdx];
                let keyColor = (colorObj && colorObj.v > 0) ? Utils.hsvToHex(colorObj.h, colorObj.s, colorObj.v) : null;
                
                let astKey = Parser.translateAst(tok, state, layerIdx, keyIdx, keyColor);
                
                if (keyColor) {
                    if (!astKey.decoration) astKey.decoration = {};
                    astKey.decoration.background = keyColor;
                }
                return astKey;
            });
            
            // >>> THE EXPLICIT MAPPING FIX <<<
            let mapped = new Array(activeBoard.targetKeyCount).fill(null).map(() => ({ value: "&trans" }));
            
            astKeys.forEach((key, i) => {
                if (!key) return;
                
                let targetIdx = i;

if (activeBoard.name === "Voyager") {
                    // Map Voyager 52-key matrix to Go60 60-key matrix
                    if (i < 48) {
                        targetIdx = i;
                    } else if (i === 48) {
                        targetIdx = 54; // Left Inner Thumb
                    } else if (i === 49) {
                        targetIdx = 55; // Left Outer Thumb
                    } else if (i === 50) {
                        targetIdx = 58; // Right Inner Thumb
                    } else if (i === 51) {
                        targetIdx = 59; // Right Outer Thumb
                    }
                } else if (activeBoard.matrixMap) {
                    // Pull the exact, explicit mapping index
                    targetIdx = activeBoard.matrixMap[i];
                }

                if (targetIdx !== undefined && targetIdx >= 0 && targetIdx < activeBoard.targetKeyCount) {
                    mapped[targetIdx] = key;
                }
            });
            
            return mapped;
        });

        const generatedCombos = Parser.parseOryxCombos(cleanText, astLayers[0] || [], state, activeBoard);

        let templateJson;
        try {
            let res = await fetch(`${activeBoard.templateUrl}?v=${Date.now()}`); 
            
            if (!res.ok) {
                res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(activeBoard.templateUrl)}&v=${Date.now()}`);
                if (!res.ok) throw new Error(`Fallback proxy failed with status: ${res.status}`);
            }
            templateJson = await res.json();
            
        } catch (fetchError) {
            throw new Error(`CRITICAL ERROR: Failed to download the ${activeBoard.targetBoard} Template. Details: ${fetchError.message}`);
        }

        const tOffset = (templateJson.layers && templateJson.layers.length > 0) ? templateJson.layers.length : 0;

        astLayers.forEach(layer => layer.forEach(k => {
            if (["&mo", "&to", "&tog", "&lt", "&sl", "&layer"].includes(k?.value) && k?.params?.[0]) {
                let val = parseInt(k.params[0].value);
                if (!isNaN(val)) {
                    if (val > maxLayerIdx) val = maxLayerIdx;
                    k.params[0].value = val + tOffset;
                }
            }
        }));

        generatedCombos.forEach(combo => {
            if (combo.layers) {
                combo.layers = combo.layers.map(l => {
                    let val = l > maxLayerIdx ? maxLayerIdx : l;
                    return val + tOffset;
                });
            }
            if (combo.binding && ["&mo", "&to", "&tog", "&lt", "&sl", "&layer"].includes(combo.binding.value) && combo.binding.params?.[0]) {
                let val = parseInt(combo.binding.params[0].value);
                if (!isNaN(val)) {
                    if (val > maxLayerIdx) val = maxLayerIdx;
                    combo.binding.params[0].value = val + tOffset;
                }
            }
        });

        templateJson.uuid = Utils.safeUUID();
        templateJson.title = title ? `${title}_Appended` : "OMA_Export_Appended";
        
        templateJson.layers = (templateJson.layers || []).concat(astLayers);
        templateJson.layer_names = (templateJson.layer_names || []).concat(astLayers.map((_, i) => `OMA_${activeBoard.name}_${i}`));
        templateJson.combos = (templateJson.combos || []).concat(generatedCombos);

        self.postMessage({ 
            success: true, 
            finalOutput: templateJson, 
            state, 
            layerCount: astLayers.length,
            detectedBoard: activeBoard.name,
            targetBoard: activeBoard.targetBoard
        });

    } catch (err) {
        self.postMessage({ success: false, error: err.message, stack: err.stack });
    }
};
