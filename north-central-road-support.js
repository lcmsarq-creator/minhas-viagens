(() => {
  "use strict";

  const APP_VERSION = window.MINHAS_VIAGENS_APP_VERSION || "0.14.0";

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

    if (hint === "US") {
      match = value.match(/^0*([0-9]{1,3})$/);
      if (match) return canonical("US", "US", match[1]);
    }

    if (hint === "CA") {
      match = value.match(/^(?:TCH\s*-?\s*)?0*([0-9]{1,3})$/);
      if (match && /^TCH/i.test(value)) return canonical("CA", "TCH", match[1]);
    }

    return "";
  }

  const baseInternationalRoadRef = typeof internationalRoadRef === "function" ? internationalRoadRef : null;
  internationalRoadRef = function internationalRoadRefNorthCentral(raw, context) {
    return northCentralRef(raw, context) || (baseInternationalRoadRef ? baseInternationalRoadRef(raw, context) : "");
  };

  window.MinhasViagensNorthCentralRoads = Object.freeze({
    version: APP_VERSION,
    countryMeta: COUNTRY_META,
    internationalRoadRef: northCentralRef
  });

  console.info(`Minhas Viagens ${APP_VERSION}: suporte nacional para México, Estados Unidos e Canadá habilitado.`);
})();