(() => {
  "use strict";

  const APP_VERSION = window.MINHAS_VIAGENS_APP_VERSION || "0.14.1";
  const baseShieldApi = window.MinhasViagensInternationalRoadShields || {};

  const COUNTRY_META = Object.freeze({
    MX: { name: "MEXICO", network: "MEX" },
    US: { name: "ESTADOS UNIDOS", network: "US" },
    CA: { name: "CANADA", network: "TCH" }
  });

  if (typeof INTERNATIONAL_ROADS === "object" && INTERNATIONAL_ROADS) {
    Object.assign(INTERNATIONAL_ROADS, COUNTRY_META);
  }

  if (typeof COUNTRY_CODE_BY_NAME === "object" && COUNTRY_CODE_BY_NAME) {
    Object.assign(COUNTRY_CODE_BY_NAME, {
      mexico: "MX", "méxico": "MX",
      "estados unidos": "US", "united states": "US", usa: "US", "u.s.a.": "US",
      canada: "CA", "canadá": "CA"
    });
  }

  const GENERIC_ASSET = Object.freeze({
    asset: `assets/road-shields/generic-national-default.svg?v=${APP_VERSION}`,
    viewBox: "0 0 847.7616 832.7551",
    safe: Object.freeze({ x: 155.0069, y: 213.0875, width: 542.1176, height: 409.8954 }),
    color: "#010101"
  });

  const ASSETS = Object.freeze({
    MX: Object.freeze({
      asset: `assets/road-shields/mex-national-default.svg?v=${APP_VERSION}`,
      viewBox: "0 0 651.5297 867.8801",
      safe: Object.freeze({ x: 134.7931, y: 357.5967, width: 379.4219, height: 296.3033 }),
      color: "#010101"
    }),
    GT: Object.freeze({
      asset: `assets/road-shields/gtm-national-default.svg?v=${APP_VERSION}`,
      viewBox: "0 0 894.6382 850.5259",
      safe: Object.freeze({ x: 117.3166, y: 425.2629, width: 653.6734, height: 226.2536 }),
      color: "#010101",
      prefixNetwork: true
    }),
    NI: Object.freeze({
      asset: `assets/road-shields/nic-national-default.svg?v=${APP_VERSION}`,
      viewBox: "0 0 893.2065 866.042",
      safe: Object.freeze({ x: 149.1791, y: 384.6707, width: 594.8482, height: 294.9111 }),
      color: "#010101",
      prefixNetwork: true
    }),
    CR: Object.freeze({
      asset: `assets/road-shields/cri-national-default.svg?v=${APP_VERSION}`,
      viewBox: "0 0 865.1337 865.1239",
      safe: Object.freeze({ x: 136.4438, y: 384.2836, width: 594.8482, height: 294.9111 }),
      color: "#010101"
    }),
    PA: Object.freeze({
      asset: `assets/road-shields/pan-national-default.svg?v=${APP_VERSION}`,
      viewBox: "0 0 865.1337 865.124",
      safe: Object.freeze({ x: 139.353, y: 384.2837, width: 594.8482, height: 294.9111 }),
      color: "#010101"
    }),
    "US:US": Object.freeze({
      asset: `assets/road-shields/usa-national-default.svg?v=${APP_VERSION}`,
      viewBox: "0 0 671.5665 671.5665",
      safe: Object.freeze({ x: 68.5777, y: 148.4956, width: 532.8764, height: 341.1956 }),
      color: "#010101"
    }),
    "US:I": Object.freeze({
      asset: `assets/road-shields/usa-interstate-default.svg?v=${APP_VERSION}`,
      viewBox: "0 0 833.9034 833.6281",
      safe: Object.freeze({ x: 141.9585, y: 251.7065, width: 550.0663, height: 365.6962 }),
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

  function canonical(country, network, number) {
    const code = String(country || "").toUpperCase();
    const net = String(network || "").toUpperCase();
    const num = String(number || "").toUpperCase().replace(/^0+(?=\d)/, "");
    if (!/^[A-Z]{2}$/.test(code) || !/^[A-Z]{1,3}$/.test(net) || !/^[0-9A-Z]{1,6}$/.test(num)) return "";
    return `INT:${code}:${net}:${num}`;
  }

  function contextHint(context) {
    if (context && typeof context === "object") return String(context.hint || "").toUpperCase();
    return String(context || "").toUpperCase().trim();
  }

  function northCentralRef(raw, context) {
    const value = normalizeRaw(raw);
    const hint = contextHint(context);
    let match = null;

    match = value.match(/^(?:INTERSTATE|I)\s*-?\s*0*([0-9]{1,3})$/);
    if (match) return canonical("US", "I", match[1]);

    match = value.match(/^(?:US(?:\s+ROUTE|\s+HIGHWAY)?|U\.S\.)\s*-?\s*0*([0-9]{1,3})$/);
    if (match) return canonical("US", "US", match[1]);

    match = value.match(/^(?:MEX|MEXICO|MÉXICO)\s*-?\s*0*([0-9]{1,3}[A-Z]?)$/);
    if (match) return canonical("MX", "MEX", match[1]);

    match = value.match(/^(?:TCH|TRANS[- ]CANADA(?:\s+HIGHWAY)?)\s*-?\s*0*([0-9]{1,3})$/);
    if (match) return canonical("CA", "TCH", match[1]);

    if (hint === "MX") {
      match = value.match(/^(?:FED(?:ERAL)?|CARRETERA(?:\s+FEDERAL)?|MEX)?\s*-?\s*0*([0-9]{1,3}[A-Z]?)$/);
      if (match) return canonical("MX", "MEX", match[1]);
    }

    return "";
  }

  function parseInternational(label) {
    if (typeof baseShieldApi.parseInternational === "function") {
      const parsed = baseShieldApi.parseInternational(label);
      if (parsed) return parsed;
    }
    const match = normalizeRaw(label).match(/^INT:([A-Z]{2}):([A-Z]{1,3}):([0-9A-Z]{1,6})$/);
    return match ? { countryCode: match[1], network: match[2], number: match[3], international: true } : null;
  }

  function configFor(parsed) {
    if (parsed.countryCode === "US") return ASSETS[`US:${parsed.network}`] || null;
    return ASSETS[parsed.countryCode] || null;
  }

  function displayValue(parsed, config) {
    const number = String(parsed.number || "").toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 6);
    if (!number) return "";
    return config.prefixNetwork ? `${String(parsed.network || "").toUpperCase()}-${number}` : number;
  }

  function fontSizeFor(value, safe) {
    const height = Number(safe?.height) || 0;
    const width = Number(safe?.width) || 0;
    if (!height || !width) return 0;
    const estimatedByWidth = width / Math.max(1, String(value).length * 0.52);
    return Math.min(height, estimatedByWidth);
  }

  function usesFor(config) {
    return config.asset ? [`${config.asset}#shield-base`] : [];
  }

  function countryName(code) {
    return COUNTRY_META[code]?.name || baseShieldApi.countryMeta?.[code]?.name || code;
  }

  function svgShield(parsed, config, size, className = "") {
    const value = displayValue(parsed, config);
    if (!value) return "";
    const safe = config.safe;
    const x = safe.x + safe.width / 2;
    const y = safe.y + safe.height / 2;
    const fontSize = fontSizeFor(value, safe);
    const clipId = `mv-nca-${parsed.countryCode.toLowerCase()}-${++clipSequence}`;
    const uses = usesFor(config).map(href => `<use href="${href}"/>`).join("");
    return `<svg class="road-emblem-svg international nca ${parsed.countryCode.toLowerCase()} ${escapeMarkup(className)} ${escapeMarkup(size)}" viewBox="${config.viewBox}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeMarkup(`${countryName(parsed.countryCode)}, ${parsed.network} ${parsed.number}`)}">
      <defs><clipPath id="${clipId}"><rect x="${safe.x}" y="${safe.y}" width="${safe.width}" height="${safe.height}"/></clipPath></defs>
      ${uses}
      <text x="${x.toFixed(4)}" y="${y.toFixed(4)}" clip-path="url(#${clipId})" fill="${config.color}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize.toFixed(1)}" font-weight="700" text-anchor="middle" dominant-baseline="middle">${escapeMarkup(value)}</text>
    </svg>`;
  }

  function genericShield(parsed, size) {
    return svgShield(parsed, GENERIC_ASSET, size, "generic");
  }

  const baseInternationalRoadRef = typeof internationalRoadRef === "function" ? internationalRoadRef : null;
  internationalRoadRef = function internationalRoadRefNorthCentral(raw, context) {
    return northCentralRef(raw, context) || (baseInternationalRoadRef ? baseInternationalRoadRef(raw, context) : "");
  };

  const baseRoadShieldMarkup = typeof roadShieldMarkup === "function" ? roadShieldMarkup : null;
  roadShieldMarkup = function roadShieldMarkupNorthCentral(label, size = "achievement") {
    const parsed = parseInternational(label);
    if (!parsed) return baseRoadShieldMarkup ? baseRoadShieldMarkup(label, size) : `<span class="road-shield-fallback">${escapeMarkup(label)}</span>`;

    const config = configFor(parsed);
    if (config) return svgShield(parsed, config, size);

    // Brasil e países sul-americanos que já tinham SVG continuam usando exatamente o renderer anterior.
    if (parsed.countryCode === "BR" || baseShieldApi.assets?.[parsed.countryCode]) {
      return baseRoadShieldMarkup ? baseRoadShieldMarkup(label, size) : "";
    }

    // Qualquer país sem escudo próprio usa o SVG genérico fornecido pelo usuário.
    return genericShield(parsed, size);
  };

  window.MinhasViagensNorthCentralRoads = Object.freeze({
    version: APP_VERSION,
    countryMeta: COUNTRY_META,
    assets: ASSETS,
    genericAsset: GENERIC_ASSET,
    internationalRoadRef: northCentralRef,
    parseInternational,
    svgShield,
    genericShield
  });

  console.info(`Minhas Viagens ${APP_VERSION}: escudos nacionais da América Central e do Norte habilitados; EUA incluem US Routes e Interstates.`);
})();