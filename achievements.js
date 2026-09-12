(function (root) {
  "use strict";

  const BRAZIL_STATES = [
    ["AC", "Acre"], ["AL", "Alagoas"], ["AP", "Amapá"], ["AM", "Amazonas"],
    ["BA", "Bahia"], ["CE", "Ceará"], ["DF", "Distrito Federal"], ["ES", "Espírito Santo"],
    ["GO", "Goiás"], ["MA", "Maranhão"], ["MT", "Mato Grosso"], ["MS", "Mato Grosso do Sul"],
    ["MG", "Minas Gerais"], ["PA", "Pará"], ["PB", "Paraíba"], ["PR", "Paraná"],
    ["PE", "Pernambuco"], ["PI", "Piauí"], ["RJ", "Rio de Janeiro"], ["RN", "Rio Grande do Norte"],
    ["RS", "Rio Grande do Sul"], ["RO", "Rondônia"], ["RR", "Roraima"], ["SC", "Santa Catarina"],
    ["SP", "São Paulo"], ["SE", "Sergipe"], ["TO", "Tocantins"]
  ].map(([uf, name]) => ({
    key: `BR-${uf}`,
    uf,
    code: uf,
    name,
    flagUrl: `assets/flags/states/${uf.toLowerCase()}.svg`
  }));

  const COUNTRY_NAMES = {
    AR: "Argentina", BO: "Bolívia", BR: "Brasil", CL: "Chile", CO: "Colômbia",
    GF: "Guiana Francesa", GY: "Guiana", PE: "Peru", PY: "Paraguai", SR: "Suriname",
    UY: "Uruguai", VE: "Venezuela", US: "Estados Unidos", CA: "Canadá", MX: "México",
    PT: "Portugal", ES: "Espanha", FR: "França", GB: "Reino Unido", IE: "Irlanda",
    DE: "Alemanha", IT: "Itália", NL: "Países Baixos", BE: "Bélgica", CH: "Suíça"
  };
  const ISO3_TO_ISO2 = {
    ARG: "AR", BOL: "BO", BRA: "BR", CHL: "CL", COL: "CO", GUF: "GF", GUY: "GY",
    PER: "PE", PRY: "PY", SUR: "SR", URY: "UY", VEN: "VE", USA: "US", CAN: "CA",
    MEX: "MX", PRT: "PT", ESP: "ES", FRA: "FR", GBR: "GB", IRL: "IE", DEU: "DE",
    ITA: "IT", NLD: "NL", BEL: "BE", CHE: "CH"
  };
  const COUNTRY_NAME_TO_CODE = new Map(Object.entries(COUNTRY_NAMES).flatMap(([code, name]) => {
    const aliases = [[normalizeText(name), code]];
    if (code === "UY") aliases.push(["uruguay", code]);
    if (code === "PY") aliases.push(["paraguay", code]);
    if (code === "GB") aliases.push(["united kingdom", code], ["gra bretanha", code]);
    if (code === "US") aliases.push(["united states", code], ["estados unidos da america", code]);
    if (code === "NL") aliases.push(["netherlands", code], ["holanda", code]);
    return aliases;
  }));

  const BY_UF = new Map(BRAZIL_STATES.map(state => [state.uf, state]));
  const BY_NAME = new Map(BRAZIL_STATES.map(state => [normalizeText(state.name), state]));
  const STATE_NAMES_BY_LENGTH = [...BY_NAME.entries()].sort((a, b) => b[0].length - a[0].length);

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR")
      .replace(/\b(?:estado|state)\s+(?:de|do|da|of)\s+/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function stateFromValue(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const upper = raw.toUpperCase();
    const isoMatch = upper.match(/(?:^|\b)BR[-_ ]([A-Z]{2})(?:\b|$)/);
    if (isoMatch && BY_UF.has(isoMatch[1])) return BY_UF.get(isoMatch[1]);
    if (BY_UF.has(upper)) return BY_UF.get(upper);

    const normalized = normalizeText(raw);
    if (BY_NAME.has(normalized)) return BY_NAME.get(normalized);
    for (const [name, state] of STATE_NAMES_BY_LENGTH) {
      if (new RegExp(`(?:^| )${name}(?: |$)`).test(normalized)) return state;
    }
    for (const token of upper.split(/[^A-Z]+/)) {
      if (BY_UF.has(token)) return BY_UF.get(token);
    }
    return null;
  }

  function isForeignCity(city) {
    const countryCode = String(city?.countryCode || "").trim().toUpperCase();
    if (countryCode && countryCode !== "BR" && countryCode !== "BRA") return true;
    const country = normalizeText(city?.country);
    return Boolean(country && country !== "brasil" && country !== "brazil");
  }

  function countryCodeForCity(city) {
    const rawCode = String(city?.countryCode || "").trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(rawCode)) return rawCode;
    if (ISO3_TO_ISO2[rawCode]) return ISO3_TO_ISO2[rawCode];
    return COUNTRY_NAME_TO_CODE.get(normalizeText(city?.country)) || "";
  }

  function countryForCity(city) {
    const code = countryCodeForCity(city);
    const suppliedName = String(city?.country || "").trim();
    const name = COUNTRY_NAMES[code] || suppliedName || code || "País não identificado";
    const fallbackKey = normalizeText(name).replace(/\s+/g, "-") || "desconhecido";
    return {
      key: `COUNTRY-${code || fallbackKey}`,
      uf: code || "INT",
      code: code || "INT",
      name,
      flagUrl: code ? (COUNTRY_NAMES[code]
        ? `assets/flags/countries/${code.toLowerCase()}.svg`
        : `https://flagcdn.com/${code.toLowerCase()}.svg`) : "",
      exterior: true
    };
  }

  function groupForCity(city) {
    if (isForeignCity(city)) return countryForCity(city);
    return stateFromValue(city?.region) || stateFromValue(city?.label) || {
      key: "BR-OUTROS", uf: "BR", code: "BR", name: "Estado não identificado", unknown: true
    };
  }

  function groupCities(items) {
    const groups = new Map();
    for (const city of items || []) {
      const descriptor = groupForCity(city);
      if (!groups.has(descriptor.key)) groups.set(descriptor.key, { ...descriptor, cities: [] });
      groups.get(descriptor.key).cities.push(city);
    }
    for (const group of groups.values()) {
      group.cities.sort((a, b) => String(a.city || a.label || "").localeCompare(String(b.city || b.label || ""), "pt-BR", { numeric: true }));
    }
    return [...groups.values()].sort((a, b) => {
      if (a.exterior !== b.exterior) return a.exterior ? 1 : -1;
      if (a.unknown !== b.unknown) return a.unknown ? 1 : -1;
      return a.name.localeCompare(b.name, "pt-BR");
    });
  }

  root.MinhasViagensAchievements = { states: BRAZIL_STATES, stateFromValue, countryForCity, groupForCity, groupCities };
})(typeof window !== "undefined" ? window : globalThis);
