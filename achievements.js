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
  ].map(([uf, name]) => ({ key: `BR-${uf}`, uf, name }));

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

  function groupForCity(city) {
    if (isForeignCity(city)) return { key: "EXTERIOR", uf: "INT", name: "Exterior", exterior: true };
    return stateFromValue(city?.region) || stateFromValue(city?.label) || {
      key: "BR-OUTROS", uf: "BR", name: "Estado não identificado", unknown: true
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

  root.MinhasViagensAchievements = { states: BRAZIL_STATES, stateFromValue, groupForCity, groupCities };
})(typeof window !== "undefined" ? window : globalThis);
