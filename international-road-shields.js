(() => {
  "use strict";

  const APP_VERSION = "0.13.6";
  const BOLIVIA_ASSET = `assets/road-shields/bol-national-default.svg?v=${APP_VERSION}`;
  const BOLIVIA_SAFE_AREA = Object.freeze({
    x: 205.5909,
    y: 411.0845,
    width: 535.0588,
    height: 311.0864
  });
  const BOLIVIA_GLYPHS = Object.freeze({
    "2": Object.freeze({ id: "road-glyph-2", x: 239.6669, width: 207.7102 }),
    "4": Object.freeze({ id: "road-glyph-4", x: 484.3255, width: 227.6823 })
  });
  const BOLIVIA_GLYPH_Y = 417.5206;
  const BOLIVIA_GLYPH_HEIGHT = 304.6502;
  const BOLIVIA_GLYPH_GAP = 36.9484;

  const URUGUAY_ASSET = `assets/road-shields/ury-national-default.svg?v=${APP_VERSION}`;
  const URUGUAY_SAFE_AREA = Object.freeze({
    x: 143.8878,
    y: 209.0568,
    width: 402.3529,
    height: 364.239
  });

  let clipSequence = 0;

  function escapeMarkup(value) {
    if (typeof escapeHtml === "function") return escapeHtml(value);
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function boliviaRoadRef(raw, countryCode = "BO") {
    if (String(countryCode || "").toUpperCase() !== "BO") return "";
    const value = String(raw || "").toUpperCase().replace(/[–—]/g, "-").trim();
    const canonical = value.match(/^INT:BO:F:(\d{1,3}[A-Z]?)$/);
    if (canonical) return `INT:BO:F:${canonical[1]}`;
    if (/\bD\s*-?\s*\d{3,4}\b/.test(value)) return "";
    const match = value.match(/(?:^|\b)(?:F|RN|RUTA(?:\s+NACIONAL)?)\s*-?\s*0*(\d{1,3}[A-Z]?)(?:\b|$)/);
    return match ? `INT:BO:F:${match[1]}` : "";
  }

  function uruguayRoadRef(raw, countryCode = "UY") {
    if (String(countryCode || "").toUpperCase() !== "UY") return "";
    const value = String(raw || "").toUpperCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
    const canonical = value.match(/^INT:UY:RU:(\d{1,3}[A-Z]?)$/);
    if (canonical) return `INT:UY:RU:${canonical[1]}`;
    const match = value.match(/(?:^|\b)(?:RUTA(?:\s+NACIONAL)?|RN)\s*-?\s*0*(\d{1,3}[A-Z]?)(?:\b|$)/);
    return match ? `INT:UY:RU:${match[1]}` : "";
  }

  function autoCountryCodes(context) {
    if (context && typeof context === "object" && Array.isArray(context.countries)) {
      return context.countries.map(code => String(code).toUpperCase()).filter(Boolean);
    }
    const value = String(context || "").toUpperCase();
    if (!value.startsWith("AUTO")) return [];
    return value.slice(4).replace(/^[:|]/, "").split(/[,|:]/).map(code => code.trim()).filter(Boolean);
  }

  function autoCountryHint(context) {
    return context && typeof context === "object" ? String(context.hint || "").toUpperCase() : "";
  }

  // Em uma rota multinacional os endpoints não determinam o país de cada etapa.
  // Redes com prefixo próprio continuam inequívocas. RN/Ruta Nacional, porém,
  // só são atribuídas a Argentina ou Uruguai quando esse país existe no contexto.
  function autoInternationalRoadRef(raw, context) {
    const countries = autoCountryCodes(context);
    const hint = autoCountryHint(context);
    if (!countries.length) return "";
    const value = String(raw || "").toUpperCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
    let match = value.match(/^PE\s*-?\s*(\d{1,3}[A-Z]?)$/);
    if (match) return `INT:PE:PE:${match[1]}`;
    match = value.match(/^PY\s*-?\s*0*(\d{1,3}[A-Z]?)$/);
    if (match) return `INT:PY:PY:${match[1]}`;
    match = value.match(/^CH\s*-?\s*0*(\d{1,3}[A-Z]?)$/);
    if (match) return `INT:CL:CH:${match[1]}`;
    match = value.match(/^E\s*-?\s*0*(\d{1,3}[A-Z]?)$/);
    if (match) return `INT:EC:E:${match[1]}`;
    match = value.match(/^T\s*-?\s*0*(\d{1,3}[A-Z]?)$/);
    if (match) return `INT:VE:T:${match[1]}`;
    match = value.match(/^F\s*-?\s*0*(\d{1,3}[A-Z]?)$/);
    if (match) return `INT:BO:F:${match[1]}`;
    if (countries.includes("BR")) return "";

    match = value.match(/^(?:RN|RUTA\s+NACIONAL)\s*-?\s*0*(\d{1,3}[A-Z]?)$/);
    if (match) {
      if (hint === "UY") return `INT:UY:RU:${match[1]}`;
      if (hint === "AR") return `INT:AR:RN:${match[1]}`;
      if (countries.includes("UY") && !countries.includes("AR")) return `INT:UY:RU:${match[1]}`;
      if (countries.includes("AR")) return `INT:AR:RN:${match[1]}`;
    }

    match = value.match(/^RUTA\s*-?\s*0*(\d{1,3}[A-Z]?)$/);
    if (match && hint === "AR") return `INT:AR:RN:${match[1]}`;
    if (match && hint === "UY") return `INT:UY:RU:${match[1]}`;
    if (match && countries.includes("UY")) return `INT:UY:RU:${match[1]}`;
    if (match && countries.includes("AR")) return `INT:AR:RN:${match[1]}`;
    return "";
  }

  function exactVectorNumber(number) {
    const digits = [...String(number || "")];
    if (!digits.length || digits.some(digit => !BOLIVIA_GLYPHS[digit])) return "";

    const rawWidth = digits.reduce((sum, digit) => sum + BOLIVIA_GLYPHS[digit].width, 0) +
      Math.max(0, digits.length - 1) * BOLIVIA_GLYPH_GAP;
    const scale = Math.min(1, BOLIVIA_SAFE_AREA.width / rawWidth, BOLIVIA_SAFE_AREA.height / BOLIVIA_GLYPH_HEIGHT);
    let cursor = BOLIVIA_SAFE_AREA.x + (BOLIVIA_SAFE_AREA.width - rawWidth * scale) / 2;
    const targetY = BOLIVIA_SAFE_AREA.y + (BOLIVIA_SAFE_AREA.height - BOLIVIA_GLYPH_HEIGHT * scale) / 2;
    const uses = [];

    for (const digit of digits) {
      const glyph = BOLIVIA_GLYPHS[digit];
      const translateX = cursor - glyph.x * scale;
      const translateY = targetY - BOLIVIA_GLYPH_Y * scale;
      uses.push(`<use href="${BOLIVIA_ASSET}#${glyph.id}" transform="translate(${translateX.toFixed(4)} ${translateY.toFixed(4)}) scale(${scale.toFixed(6)})"/>`);
      cursor += (glyph.width + BOLIVIA_GLYPH_GAP) * scale;
    }
    return uses.join("");
  }

  function fallbackTextNumber(number) {
    const value = String(number || "");
    const size = value.length <= 1 ? 390 : value.length === 2 ? 330 : value.length === 3 ? 265 : 215;
    const x = BOLIVIA_SAFE_AREA.x + BOLIVIA_SAFE_AREA.width / 2;
    const y = BOLIVIA_SAFE_AREA.y + BOLIVIA_SAFE_AREA.height / 2;
    return `<text x="${x.toFixed(4)}" y="${y.toFixed(4)}" fill="#f0f0f0" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="700" text-anchor="middle" dominant-baseline="middle">${escapeMarkup(value)}</text>`;
  }

  function uruguayNumberMarkup(number) {
    const value = String(number || "");
    if (value === "5") return `<use href="${URUGUAY_ASSET}#road-glyph-5"/>`;
    const size = value.length <= 1 ? 350 : value.length === 2 ? 280 : value.length === 3 ? 220 : 180;
    const x = URUGUAY_SAFE_AREA.x + URUGUAY_SAFE_AREA.width / 2;
    const y = URUGUAY_SAFE_AREA.y + URUGUAY_SAFE_AREA.height / 2;
    return `<text x="${x.toFixed(4)}" y="${y.toFixed(4)}" fill="#fefeff" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="700" text-anchor="middle" dominant-baseline="middle">${escapeMarkup(value)}</text>`;
  }

  function boliviaShieldMarkup(number, size = "achievement") {
    const value = String(number || "").toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 4);
    if (!value) return "";
    const clipId = `mv-bolivia-number-${++clipSequence}`;
    const numberMarkup = exactVectorNumber(value) || fallbackTextNumber(value);
    return `<svg class="road-emblem-svg international bolivia ${escapeMarkup(size)}" viewBox="0 0 959.0027 868.7791" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Bolívia, F ${escapeMarkup(value)}">
      <defs><clipPath id="${clipId}"><rect x="${BOLIVIA_SAFE_AREA.x}" y="${BOLIVIA_SAFE_AREA.y}" width="${BOLIVIA_SAFE_AREA.width}" height="${BOLIVIA_SAFE_AREA.height}"/></clipPath></defs>
      <use href="${BOLIVIA_ASSET}#shield-base"/>
      <g clip-path="url(#${clipId})">${numberMarkup}</g>
    </svg>`;
  }

  function uruguayShieldMarkup(number, size = "achievement") {
    const value = String(number || "").toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 4);
    if (!value) return "";
    const clipId = `mv-uruguay-number-${++clipSequence}`;
    return `<svg class="road-emblem-svg international uruguay ${escapeMarkup(size)}" viewBox="0 0 694.3001 868.7791" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Uruguai, Ruta ${escapeMarkup(value)}">
      <defs><clipPath id="${clipId}"><rect x="${URUGUAY_SAFE_AREA.x}" y="${URUGUAY_SAFE_AREA.y}" width="${URUGUAY_SAFE_AREA.width}" height="${URUGUAY_SAFE_AREA.height}"/></clipPath></defs>
      <use href="${URUGUAY_ASSET}#shield-base"/>
      <g clip-path="url(#${clipId})">${uruguayNumberMarkup(value)}</g>
    </svg>`;
  }

  const api = Object.freeze({
    version: APP_VERSION,
    templates: Object.freeze({
      BO: Object.freeze({ asset: BOLIVIA_ASSET, safeArea: BOLIVIA_SAFE_AREA }),
      UY: Object.freeze({ asset: URUGUAY_ASSET, safeArea: URUGUAY_SAFE_AREA })
    }),
    boliviaRoadRef,
    uruguayRoadRef,
    autoInternationalRoadRef,
    boliviaShieldMarkup,
    uruguayShieldMarkup,
    exactVectorNumber
  });
  window.MinhasViagensInternationalRoadShields = api;

  const baseInternationalRoadRef = typeof internationalRoadRef === "function" ? internationalRoadRef : null;
  if (baseInternationalRoadRef) {
    internationalRoadRef = function internationalRoadRefWithCountryTemplates(raw, countryCode) {
      return boliviaRoadRef(raw, countryCode) || uruguayRoadRef(raw, countryCode) || autoInternationalRoadRef(raw, countryCode) || baseInternationalRoadRef(raw, countryCode);
    };
  }

  const baseRoadShieldMarkup = typeof roadShieldMarkup === "function" ? roadShieldMarkup : null;
  if (baseRoadShieldMarkup) {
    roadShieldMarkup = function roadShieldMarkupWithCountryTemplates(label, size = "achievement") {
      const parsed = typeof parseRoadCode === "function" ? parseRoadCode(label) : null;
      if (parsed?.international && parsed.countryCode === "BO" && parsed.network === "F") {
        return boliviaShieldMarkup(parsed.number, size);
      }
      if (parsed?.international && parsed.countryCode === "UY" && parsed.network === "RU") {
        return uruguayShieldMarkup(parsed.number, size);
      }
      return baseRoadShieldMarkup(label, size);
    };
  }

  console.info(`Minhas Viagens ${APP_VERSION}: templates vetoriais das rodovias nacionais da Bolívia e do Uruguai habilitados.`);
})();
