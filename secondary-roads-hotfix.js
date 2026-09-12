(() => {
  "use strict";

  const APP_VERSION = "0.10.11";
  const STANDARD_PREFIXES = [
    "BR","AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"
  ];
  const SECONDARY_PARENT_STATE = {
    LMG: "MG",
    AMG: "MG",
    MGC: "MG",
    CMG: "MG",
    ERS: "RS",
    RSC: "RS",
    VRS: "RS",
    SPV: "SP",
    SPA: "SP",
    SPI: "SP"
  };
  const ALL_PREFIXES = [...Object.keys(SECONDARY_PARENT_STATE), ...STANDARD_PREFIXES]
    .sort((a, b) => b.length - a.length);
  const PREFIX_PATTERN = ALL_PREFIXES.join("|");
  const LOCAL_ROAD_RE = new RegExp(`\\b(${PREFIX_PATTERN})\\s*[- ]?\\s*(\\d{1,4}(?:/\\d{1,4})?)\\b`, "i");
  const LOCAL_ROAD_RE_GLOBAL = new RegExp(`\\b(?:${PREFIX_PATTERN})\\s*[- ]?\\s*\\d{1,4}(?:/\\d{1,4})?\\b`, "gi");

  const baseOverpassRoadDescriptor = typeof overpassRoadDescriptor === "function" ? overpassRoadDescriptor : null;
  const baseRoadShieldMarkup = typeof roadShieldMarkup === "function" ? roadShieldMarkup : null;

  function canonicalLocalRoad(raw) {
    const value = String(raw || "").toUpperCase().replace(/[–—]/g, "-").trim();
    const match = value.match(LOCAL_ROAD_RE);
    if (!match) return null;
    const prefix = match[1].toUpperCase();
    const number = match[2];
    const parentState = SECONDARY_PARENT_STATE[prefix] || (prefix === "BR" ? "" : prefix);
    return {
      prefix,
      number,
      federal: prefix === "BR",
      secondary: Boolean(SECONDARY_PARENT_STATE[prefix]),
      parentState
    };
  }

  cleanRoadRef = function cleanRoadRefWithSecondary(raw) {
    let value = String(raw || "").trim().replace(/\s+/g, " ");
    if (!value) return "";
    return value.replace(LOCAL_ROAD_RE_GLOBAL, match => {
      const parsed = canonicalLocalRoad(match);
      return parsed ? `${parsed.prefix}-${parsed.number}` : match;
    });
  };

  parseRoadCode = function parseRoadCodeWithSecondary(label) {
    const value = String(label || "").toUpperCase().replace(/[–—]/g, "-").trim();
    const international = value.match(/^INT:([A-Z]{2}):([A-Z]{1,3}):(\d{1,4}[A-Z]?)$/);
    if (international && INTERNATIONAL_ROADS[international[1]]) {
      return { countryCode: international[1], network: international[2], number: international[3], international: true };
    }
    return canonicalLocalRoad(value);
  };

  isHighwayRef = function isHighwayRefWithSecondary(value) {
    const cleaned = cleanRoadRef(value);
    if (/^INT:[A-Z]{2}:[A-Z]{1,3}:\d{1,4}[A-Z]?$/i.test(cleaned)) return true;
    const parsed = parseRoadCode(cleaned);
    if (parsed && !parsed.international && cleaned.toUpperCase() === `${parsed.prefix}-${parsed.number}`) return true;
    return /\b(ruta|route|rodovia|estrada)\s*[\w-]*\d+/i.test(cleaned);
  };

  function splitRoadTokens(raw) {
    return String(raw || "")
      .split(/[;,]|\s*\/\s*(?=[A-Z]{2,3}\s*-?\s*\d)/i)
      .map(value => value.trim())
      .filter(Boolean);
  }

  roadRefsFromStep = function roadRefsFromStepWithSecondary(step, countryCode = "") {
    const refs = [];
    const add = raw => {
      for (const token of splitRoadTokens(raw)) {
        const foreign = internationalRoadRef(token, countryCode);
        if (foreign && !refs.includes(foreign)) {
          refs.push(foreign);
          continue;
        }
        const cleaned = cleanRoadRef(token);
        const parsed = parseRoadCode(cleaned);
        if (parsed && !parsed.international) {
          const canonical = `${parsed.prefix}-${parsed.number}`;
          if (!refs.includes(canonical)) refs.push(canonical);
          continue;
        }
        if (cleaned && isHighwayRef(cleaned) && !refs.includes(cleaned)) refs.push(cleaned);
      }
    };

    add(step?.ref);
    add(step?.nat_ref);
    add(step?.official_ref);

    const name = String(step?.name || "");
    for (const match of name.match(LOCAL_ROAD_RE_GLOBAL) || []) add(match);

    const ruta = name.match(/\b(?:Ruta(?:\s+Nacional)?|Route|Rodovia|Estrada|RN)\s*[A-Za-z-]*\s*\d+[A-Za-z-]*/gi) || [];
    ruta.forEach(add);

    const simpleName = normalizeSimple(name);
    for (const [pattern, ref] of OFFICIAL_ROAD_NAME_REFS) if (pattern.test(simpleName)) add(ref);
    return refs;
  };

  if (baseOverpassRoadDescriptor) {
    overpassRoadDescriptor = function overpassRoadDescriptorWithSecondary(item) {
      const parsed = parseRoadCode(item?.label);
      if (!parsed?.secondary) return baseOverpassRoadDescriptor(item);
      const ref = `${parsed.prefix}-${parsed.number}`;
      return {
        countryCode: "BR",
        network: parsed.prefix,
        number: parsed.number,
        stateCode: parsed.parentState,
        ref,
        alternatives: [
          ref.replace("-", " "),
          ref.replace("-", ""),
          `${parsed.prefix} ${parsed.number}`
        ]
      };
    };
  }

  if (baseRoadShieldMarkup) {
    roadShieldMarkup = function roadShieldMarkupWithSecondary(label, size = "achievement") {
      const parsed = parseRoadCode(label);
      if (!parsed?.secondary || !String(parsed.number).includes("/")) {
        return baseRoadShieldMarkup(label, size);
      }
      return `<svg class="road-emblem-svg ${size}" viewBox="0 0 100 110" role="img" aria-label="${escapeHtml(`${parsed.prefix}-${parsed.number}`)}">
        <path d="M50 2L98 24L82 108H18L2 24Z" fill="#fff" stroke="#111" stroke-width="1.5"/>
        <path d="M50 7L92 27L78 102H22L8 27Z" fill="none" stroke="#111" stroke-width="4.5"/>
        <text x="50" y="40" fill="#111" font-size="24">${parsed.prefix}</text>
        <text x="50" y="76" fill="#111" font-size="25">${parsed.number}</text>
      </svg>`;
    };
  }

  // Reprocessa apenas os dados já salvos localmente. Não dispara consultas de rede.
  try {
    state.trips = (state.trips || []).map(ensureTripSchema);
    renderTrips();
  } catch (error) {
    console.warn("Não foi possível reavaliar as referências secundárias já salvas", error);
  }

  const brandCopy = document.querySelector(".brand p");
  if (brandCopy) brandCopy.textContent = brandCopy.textContent.replace(/v\d+\.\d+\.\d+/, `v${APP_VERSION}`);

  console.info(`Minhas Viagens ${APP_VERSION}: rodovias secundárias e vicinais codificadas habilitadas (LMG/AMG/MGC/CMG, ERS/RSC/VRS, SPV/SPA/SPI).`);
})();
