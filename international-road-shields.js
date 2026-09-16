(() => {
  "use strict";

  const APP_VERSION = "0.13.12";

  const COUNTRY_META = Object.freeze({
    UY: { name: "URUGUAY", network: "RU" },
    AR: { name: "ARGENTINA", network: "RN" },
    PY: { name: "PARAGUAY", network: "PY" },
    CL: { name: "CHILE", network: "CH" },
    BO: { name: "BOLIVIA", network: "F" },
    PE: { name: "PERU", network: "PE" },
    CO: { name: "COLOMBIA", network: "RN" },
    VE: { name: "VENEZUELA", network: "T" },
    EC: { name: "ECUADOR", network: "E" },
    GY: { name: "GUYANA", network: "N" },
    SR: { name: "SURINAME", network: "N" },
    GF: { name: "GUIANA FRANCESA", network: "N" },
    PA: { name: "PANAMA", network: "N" },
    CR: { name: "COSTA RICA", network: "N" },
    NI: { name: "NICARAGUA", network: "NIC" },
    HN: { name: "HONDURAS", network: "RN" },
    SV: { name: "EL SALVADOR", network: "RN" },
    GT: { name: "GUATEMALA", network: "RN" },
    BZ: { name: "BELIZE", network: "N" }
  });

  if (typeof INTERNATIONAL_ROADS === "object" && INTERNATIONAL_ROADS) {
    Object.assign(INTERNATIONAL_ROADS, COUNTRY_META);
  }
  if (typeof COUNTRY_CODE_BY_NAME === "object" && COUNTRY_CODE_BY_NAME) {
    Object.assign(COUNTRY_CODE_BY_NAME, {
      guiana: "GY", guyana: "GY", suriname: "SR", "guiana francesa": "GF", "french guiana": "GF",
      panama: "PA", "panamá": "PA", "costa rica": "CR", nicaragua: "NI", "nicarágua": "NI",
      honduras: "HN", "el salvador": "SV", guatemala: "GT", belize: "BZ"
    });
  }

  const assets = Object.freeze({
    BO: Object.freeze({
      asset: `assets/road-shields/bol-national-default.svg?v=${APP_VERSION}`,
      viewBox: "0 0 959.0027 868.7791",
      safe: Object.freeze({ x: 205.5909, y: 411.0845, width: 535.0588, height: 311.0864 }),
      color: "#f0f0f0"
    }),
    UY: Object.freeze({
      asset: `assets/road-shields/ury-national-default.svg?v=${APP_VERSION}`,
      viewBox: "0 0 694.3001 868.7791",
      safe: Object.freeze({ x: 143.8878, y: 209.0568, width: 402.3529, height: 364.239 }),
      color: "#fefeff"
    }),
    EC: Object.freeze({
      asset: `assets/road-shields/ecu-national-default.svg?v=${APP_VERSION}`,
      viewBox: "0 0 870.4126 870.1371",
      safe: Object.freeze({ x: 99.7353, y: 299.1382, width: 662.8235, height: 293.8446 }),
      color: "#fefefe", prefix: "E"
    }),
    AR: Object.freeze({
      asset: `assets/road-shields/arg-national-default.svg?v=${APP_VERSION}`,
      viewBox: "3458.8884 0 671.4470 871",
      safe: Object.freeze({ x: 3546.7462, y: 429.0563, width: 494.9649, height: 254.2546 }),
      color: "#241f1d"
    }),
    CO: Object.freeze({
      asset: `assets/road-shields/col-national-default.svg?v=${APP_VERSION}`,
      viewBox: "0 0 856.1027 848.699",
      safe: Object.freeze({ x: 183.4032, y: 189.6977, width: 484.9412, height: 351.5294 }),
      color: "#111"
    }),
    PE: Object.freeze({
      asset: `assets/road-shields/per-national-default.svg?v=${APP_VERSION}`,
      viewBox: "0 0 748.1937 870.7807",
      safe: Object.freeze({ x: 116.5398, y: 483.6301, width: 508.8476, height: 239.3856 }),
      color: "#262429"
    }),
    VE: Object.freeze({
      asset: `assets/road-shields/ven-national-default.svg?v=${APP_VERSION}`,
      viewBox: "0 0 837.9978 849.0861",
      safe: Object.freeze({ x: 177.602, y: 303.1223, width: 478.5589, height: 346.6903 }),
      color: "#111"
    }),
    PY: Object.freeze({
      asset: `assets/road-shields/pry-national-default.svg?v=${APP_VERSION}`,
      viewBox: "0 0 733.9542 797.6207",
      safe: Object.freeze({ x: 108.5467, y: 295.9771, width: 516.7059, height: 334.1023 }),
      color: "#040404", pad2: true
    }),
    CL: Object.freeze({
      asset: `assets/road-shields/chl-national-default.svg?v=${APP_VERSION}`,
      viewBox: "0 0 949.3313 867.4136",
      safe: Object.freeze({ x: 151.6173, y: 245.6746, width: 612.9412, height: 383.698 }),
      color: "#fefefe"
    })
  });

  let clipSequence = 0;

  function escapeMarkup(value) {
    if (typeof escapeHtml === "function") return escapeHtml(value);
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function normalizeRaw(raw) {
    return String(raw || "").toUpperCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
  }

  function contextCountries(context) {
    if (context && typeof context === "object" && Array.isArray(context.countries)) {
      return [...new Set(context.countries.map(code => String(code || "").toUpperCase()).filter(Boolean))];
    }
    const value = String(context || "").toUpperCase().trim();
    if (!value) return [];
    if (COUNTRY_META[value] || value === "BR") return [value];
    if (!value.startsWith("AUTO")) return [];
    return value.slice(4).replace(/^[:|]/, "").split(/[,|:]/).map(code => code.trim()).filter(Boolean);
  }

  function contextHint(context) {
    if (context && typeof context === "object") return String(context.hint || "").toUpperCase();
    const countries = contextCountries(context);
    return countries.length === 1 ? countries[0] : "";
  }

  function canonical(country, network, number) {
    const code = String(country || "").toUpperCase();
    const net = String(network || "").toUpperCase();
    const num = String(number || "").toUpperCase().replace(/^0+(?=\d)/, "");
    if (!/^[A-Z]{2}$/.test(code) || !/^[A-Z]{1,3}$/.test(net) || !/^[0-9A-Z]{1,6}$/.test(num)) return "";
    return `INT:${code}:${net}:${num}`;
  }

  function nationalNetwork(country) {
    return COUNTRY_META[country]?.network || "N";
  }

  function nationalRefForHint(raw, hint) {
    if (!hint || hint === "BR") return "";
    const value = normalizeRaw(raw);
    const network = nationalNetwork(hint);

    let match = value.match(/^PE\s*-?\s*0*([0-9]{1,3}[A-Z]?)$/);
    if (match) return canonical("PE", "PE", match[1]);
    match = value.match(/^PY\s*-?\s*0*([0-9]{1,3}[A-Z]?)$/);
    if (match) return canonical("PY", "PY", match[1]);
    match = value.match(/^CH\s*-?\s*0*([0-9]{1,3}[A-Z]?)$/);
    if (match) return canonical("CL", "CH", match[1]);
    match = value.match(/^E\s*-?\s*0*([0-9]{1,3}[A-Z]?)$/);
    if (match) return canonical("EC", "E", match[1]);
    match = value.match(/^(?:T|TRONCAL)\s*-?\s*0*([0-9]{1,3}[A-Z]?)$/);
    if (match) return canonical("VE", "T", match[1]);
    match = value.match(/^F\s*-?\s*0*([0-9]{1,3}[A-Z]?)$/);
    if (match) return canonical("BO", "F", match[1]);
    match = value.match(/^NIC\s*-?\s*0*([0-9]{1,3}[A-Z]?)$/);
    if (match) return canonical("NI", "NIC", match[1]);

    match = value.match(/^CA\s*-?\s*0*([0-9]{1,3}[A-Z]?)$/);
    if (match && ["GT", "SV", "HN", "NI", "CR", "PA"].includes(hint)) return canonical(hint, "CA", match[1]);

    match = value.match(/^(?:RN|RUTA(?:\s+NACIONAL)?|ROUTE|CARRETERA)\s*-?\s*0*([0-9]{1,4}[A-Z]?)$/);
    if (match) return canonical(hint, network, match[1]);

    match = value.match(/^RN\s*-?\s*0*([0-9]{1,3}[A-Z]?)$/);
    if (match && ["GT", "SV", "HN"].includes(hint)) return canonical(hint, "RN", match[1]);

    match = value.match(/^0*([0-9]{1,4}[A-Z]?)$/);
    if (match && ["CO", "CR", "PA"].includes(hint)) return canonical(hint, network, match[1]);
    if (match && ["PE", "PY"].includes(hint)) return canonical(hint, network, match[1]);

    return "";
  }

  function internationalRoadRefV5(raw, context) {
    const value = normalizeRaw(raw);
    const existing = value.match(/^INT:([A-Z]{2}):([A-Z]{1,3}):([0-9A-Z]{1,6})$/);
    if (existing) return canonical(existing[1], existing[2], existing[3]);
    if (/^BR\s*-?\s*\d/i.test(value)) return "";

    const countries = contextCountries(context);
    const hint = contextHint(context);
    const hinted = nationalRefForHint(value, hint);
    if (hinted) return hinted;

    const candidates = [];
    const add = ref => { if (ref && !candidates.includes(ref)) candidates.push(ref); };
    if (/^PE\s*-/.test(value) || /^PE\s+\d/.test(value)) add(nationalRefForHint(value, "PE"));
    if (/^PY\s*-?\s*\d/.test(value)) add(nationalRefForHint(value, "PY"));
    if (/^CH\s*-?\s*\d/.test(value)) add(nationalRefForHint(value, "CL"));
    if (/^E\s*-?\s*\d/.test(value)) add(nationalRefForHint(value, "EC"));
    if (/^(?:T|TRONCAL)\s*-?\s*\d/.test(value)) add(nationalRefForHint(value, "VE"));
    if (/^F\s*-?\s*\d/.test(value)) add(nationalRefForHint(value, "BO"));
    if (/^NIC\s*-?\s*\d/.test(value)) add(nationalRefForHint(value, "NI"));
    if (candidates.length === 1) return candidates[0];

    if (countries.length === 1) return nationalRefForHint(value, countries[0]);
    return "";
  }

  function parseInternational(label) {
    const value = normalizeRaw(label);
    const match = value.match(/^INT:([A-Z]{2}):([A-Z]{1,3}):([0-9A-Z]{1,6})$/);
    return match ? { countryCode: match[1], network: match[2], number: match[3], international: true } : null;
  }

  const baseParseRoadCode = typeof parseRoadCode === "function" ? parseRoadCode : null;
  if (baseParseRoadCode) {
    parseRoadCode = function parseRoadCodeAllAmericas(label) {
      return parseInternational(label) || baseParseRoadCode(label);
    };
  }

  const baseInternationalRoadRef = typeof internationalRoadRef === "function" ? internationalRoadRef : null;
  internationalRoadRef = function internationalRoadRefAllAmericas(raw, context) {
    return internationalRoadRefV5(raw, context) || (baseInternationalRoadRef ? baseInternationalRoadRef(raw, context) : "");
  };

  function fontSizeFor(_value, safe) {
    // O text-safe-area de cada SVG já foi desenhado com a altura visual
    // desejada para a numeração. A altura da área segura é, portanto,
    // a referência direta do tamanho do número em todos os emblemas.
    return Number(safe?.height) || 0;
  }

  function svgCountryShield(countryCode, number, size) {
    const config = assets[countryCode];
    if (!config) return "";
    let value = String(number || "").toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 6);
    if (!value) return "";
    if (config.pad2 && /^\d$/.test(value)) value = value.padStart(2, "0");
    if (config.prefix) value = `${config.prefix}${value}`;
    const safe = config.safe;
    const x = safe.x + safe.width / 2;
    const y = safe.y + safe.height / 2;
    const fontSize = fontSizeFor(value, safe);
    const clipId = `mv-int-${countryCode.toLowerCase()}-${++clipSequence}`;
    return `<svg class="road-emblem-svg international ${countryCode.toLowerCase()} ${escapeMarkup(size)}" viewBox="${config.viewBox}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeMarkup(`${COUNTRY_META[countryCode]?.name || countryCode}, ${value}`)}">
      <defs><clipPath id="${clipId}"><rect x="${safe.x}" y="${safe.y}" width="${safe.width}" height="${safe.height}"/></clipPath></defs>
      <use href="${config.asset}#shield-base"/>
      <text x="${x.toFixed(4)}" y="${y.toFixed(4)}" clip-path="url(#${clipId})" fill="${config.color}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize.toFixed(1)}" font-weight="700" text-anchor="middle" dominant-baseline="middle">${escapeMarkup(value)}</text>
    </svg>`;
  }

  function genericInternationalShield(parsed, size) {
    const meta = COUNTRY_META[parsed.countryCode] || { name: parsed.countryCode, network: parsed.network };
    const name = meta.name || parsed.countryCode;
    const nameSize = name.length > 12 ? 8.5 : name.length > 9 ? 10 : 12;
    return `<svg class="road-emblem-svg international generic ${escapeMarkup(size)}" viewBox="0 0 100 120" role="img" aria-label="${escapeMarkup(`${name}, ${parsed.network} ${parsed.number}`)}">
      <path d="M4 4H96V91L50 117L4 91Z" fill="#fff" stroke="#171717" stroke-width="4"/>
      <path d="M9 9H91V87L50 110L9 87Z" fill="none" stroke="#171717" stroke-width="2"/>
      <rect x="10" y="11" width="80" height="27" fill="#fff" stroke="#171717" stroke-width="2"/>
      <text x="50" y="27" fill="#171717" font-family="Arial, Helvetica, sans-serif" font-size="${nameSize}" font-weight="700" text-anchor="middle">${escapeMarkup(name)}</text>
      <rect x="10" y="39" width="26" height="27" fill="#fff" stroke="#171717" stroke-width="2"/>
      <text x="23" y="57" fill="#171717" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="700" text-anchor="middle">${escapeMarkup(parsed.network)}</text>
      <rect x="37" y="39" width="53" height="27" fill="#f5f5f5" stroke="#171717" stroke-width="2"/>
      <text x="63.5" y="57" fill="#171717" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="700" text-anchor="middle">${escapeMarkup(parsed.countryCode)}</text>
      <text x="50" y="96" fill="#171717" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700" text-anchor="middle">${escapeMarkup(parsed.number)}</text>
    </svg>`;
  }

  const baseRoadShieldMarkup = typeof roadShieldMarkup === "function" ? roadShieldMarkup : null;
  roadShieldMarkup = function roadShieldMarkupAllAmericas(label, size = "achievement") {
    const parsed = parseInternational(label);
    if (parsed) {
      if (assets[parsed.countryCode]) return svgCountryShield(parsed.countryCode, parsed.number, size);
      return genericInternationalShield(parsed, size);
    }
    return baseRoadShieldMarkup ? baseRoadShieldMarkup(label, size) : `<span class="road-shield-fallback">${escapeMarkup(label)}</span>`;
  };

  window.MinhasViagensInternationalRoadShields = Object.freeze({
    version: APP_VERSION,
    assets,
    countryMeta: COUNTRY_META,
    internationalRoadRef: internationalRoadRefV5,
    parseInternational,
    svgCountryShield,
    genericInternationalShield
  });

  console.info(`Minhas Viagens ${APP_VERSION}: escudos nacionais da América do Sul e fallback internacional das Américas habilitados.`);
})();
