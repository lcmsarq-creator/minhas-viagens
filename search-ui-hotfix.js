(() => {
  "use strict";

  const GEOCODING_ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";
  const IBGE_ENDPOINT = "https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome";
  const NEIGHBORS = new Set(["AR", "UY", "PY", "BO", "PE", "CL", "CO", "VE", "GY", "SR", "GF"]);
  const previousFetch = window.fetch.bind(window);
  const resolvedMunicipalities = new Map();
  let municipalitiesPromise = null;

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function compact(value) {
    return normalize(value).replace(/\s+/g, "");
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const row = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i++) {
      let diagonal = row[0];
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const above = row[j];
        row[j] = Math.min(
          row[j] + 1,
          row[j - 1] + 1,
          diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
        diagonal = above;
      }
    }
    return row[b.length];
  }

  function fuzzyRatio(a, b) {
    const ac = compact(a), bc = compact(b);
    if (!ac || !bc) return 1;
    return levenshtein(ac, bc) / Math.max(ac.length, bc.length, 1);
  }

  // O texto digitado pode estar no meio ou no fim do nome oficial.
  // Ex.: "rio preto" -> São José do Rio Preto.
  // Também tolera pequenos erros e espaços incorretos.
  function matchScore(name, query) {
    const n = normalize(name);
    const q = normalize(query);
    if (!n || !q) return 999;
    if (n === q) return 0;

    const paddedName = ` ${n} `;
    const paddedQuery = ` ${q} `;
    if (n.endsWith(` ${q}`)) return 1;
    if (n.startsWith(`${q} `)) return 2;
    if (paddedName.includes(paddedQuery)) return 3;
    if (compact(n).includes(compact(q))) return 5;

    const nameTokens = n.split(" ").filter(Boolean);
    const queryTokens = q.split(" ").filter(Boolean);
    let best = fuzzyRatio(n, q);

    // Compara contra qualquer sequência de palavras do nome. Isso evita
    // penalizar palavras legítimas que venham antes do que foi digitado.
    for (let start = 0; start < nameTokens.length; start++) {
      for (let length = Math.max(1, queryTokens.length - 1); length <= queryTokens.length + 1; length++) {
        const part = nameTokens.slice(start, start + length).join(" ");
        if (part) best = Math.min(best, fuzzyRatio(part, q));
      }
    }

    return best <= .38 ? 20 + best * 50 : 999;
  }

  function stateFromIbge(item) {
    return item?.microrregiao?.mesorregiao?.UF ||
      item?.["regiao-imediata"]?.["regiao-intermediaria"]?.UF || null;
  }

  async function loadMunicipalities() {
    if (municipalitiesPromise) return municipalitiesPromise;
    municipalitiesPromise = previousFetch(IBGE_ENDPOINT, { cache: "force-cache" })
      .then(response => {
        if (!response.ok) throw new Error(`IBGE ${response.status}`);
        return response.json();
      })
      .then(items => (Array.isArray(items) ? items : []).map(item => {
        const uf = stateFromIbge(item);
        return {
          ibgeId: item.id,
          name: item.nome,
          stateCode: uf?.sigla || "",
          stateName: uf?.nome || ""
        };
      }).filter(item => item.name));
    return municipalitiesPromise;
  }

  async function queryGeocoder(term, count, signal) {
    const url = `${GEOCODING_ENDPOINT}?name=${encodeURIComponent(term)}&count=${count}&language=pt&format=json`;
    const response = await previousFetch(url, { signal });
    if (!response.ok) throw new Error(`Geocoding ${response.status}`);
    const data = await response.json();
    return Array.isArray(data.results) ? data.results : [];
  }

  function canonicalKey(item) {
    return [
      normalize(item?.name),
      normalize(item?.admin1),
      String(item?.country_code || "").toUpperCase()
    ].join("|");
  }

  async function resolveMunicipality(candidate, signal) {
    if (resolvedMunicipalities.has(candidate.ibgeId)) return resolvedMunicipalities.get(candidate.ibgeId);
    const results = await queryGeocoder(candidate.name, 20, signal);
    const brazil = results.filter(item =>
      String(item.country_code || "").toUpperCase() === "BR" &&
      normalize(item.name) === normalize(candidate.name)
    );
    const stateMatch = brazil.find(item =>
      normalize(item.admin1) === normalize(candidate.stateName) ||
      String(item.admin1 || "").toUpperCase() === candidate.stateCode
    );
    const selected = stateMatch || brazil[0] || null;
    if (!selected) return null;

    const output = {
      ...selected,
      name: candidate.name,
      admin1: candidate.stateName || selected.admin1,
      country: selected.country || "Brasil",
      country_code: "BR"
    };
    resolvedMunicipalities.set(candidate.ibgeId, output);
    return output;
  }

  function rank(items, query) {
    return items
      .filter(item => Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)))
      .map(item => ({ item, score: matchScore(item.name, query) }))
      .filter(entry => entry.score < 999)
      .sort((a, b) => a.score - b.score || String(a.item.name).localeCompare(String(b.item.name), "pt-BR"))
      .map(entry => entry.item);
  }

  async function enhancedResults(query, signal) {
    const [municipalities, remote] = await Promise.all([
      loadMunicipalities().catch(() => []),
      queryGeocoder(query, 30, signal).catch(error => {
        if (error?.name === "AbortError") throw error;
        return [];
      })
    ]);

    // Mantemos uma lista maior antes de geocodificar para que cidades como
    // São José do Rio Preto não sejam descartadas por existirem vários nomes
    // iniciados por "Rio Preto".
    const brazilCandidates = municipalities
      .map(city => ({ city, score: matchScore(city.name, query) }))
      .filter(entry => entry.score < 999)
      .sort((a, b) => a.score - b.score || a.city.name.localeCompare(b.city.name, "pt-BR"))
      .slice(0, 14)
      .map(entry => entry.city);

    const resolved = (await Promise.all(brazilCandidates.map(candidate =>
      resolveMunicipality(candidate, signal).catch(error => {
        if (error?.name === "AbortError") throw error;
        return null;
      })
    ))).filter(Boolean);

    const directBrazil = rank(remote.filter(item => String(item.country_code || "").toUpperCase() === "BR"), query);
    const brazilMap = new Map();
    [...resolved, ...directBrazil].forEach(item => {
      const key = canonicalKey(item);
      if (!brazilMap.has(key)) brazilMap.set(key, item);
    });
    const brazil = rank([...brazilMap.values()], query);

    const remoteMap = new Map();
    remote.forEach(item => {
      const key = canonicalKey(item);
      if (!remoteMap.has(key)) remoteMap.set(key, item);
    });
    const neighbors = rank([...remoteMap.values()].filter(item => NEIGHBORS.has(String(item.country_code || "").toUpperCase())), query);
    const others = rank([...remoteMap.values()].filter(item => {
      const code = String(item.country_code || "").toUpperCase();
      return code && code !== "BR" && !NEIGHBORS.has(code);
    }), query);

    const output = [];
    const seen = new Set();
    const append = items => {
      for (const item of items) {
        if (output.length >= 10) break;
        const key = canonicalKey(item);
        if (seen.has(key)) continue;
        seen.add(key);
        output.push(item);
      }
    };

    // Hierarquia explícita: Brasil, países vizinhos, demais países.
    append(brazil);
    append(neighbors);
    append(others);
    return output;
  }

  window.fetch = async function citySearchFetch(input, init = {}) {
    const url = typeof input === "string" ? input : input?.url;
    if (!url || !url.startsWith(GEOCODING_ENDPOINT)) return previousFetch(input, init);
    const parsed = new URL(url, location.href);
    const query = parsed.searchParams.get("name")?.trim() || "";
    if (query.length < 2) return previousFetch(input, init);

    try {
      const results = await enhancedResults(query, init?.signal || null);
      return new Response(JSON.stringify({ results }), {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      console.warn("Busca tolerante indisponível; usando resultado anterior", error);
      return previousFetch(input, init);
    }
  };

  const style = document.createElement("style");
  style.textContent = `
    #editPlacesDialog {
      width: min(860px, calc(100vw - 28px)) !important;
      max-height: calc(100vh - 24px) !important;
    }
    #editPlacesDialog > form {
      height: min(900px, calc(100vh - 48px)) !important;
      min-height: min(640px, calc(100vh - 48px));
      display: flex !important;
      flex-direction: column !important;
      overflow: hidden !important;
    }
    #editPlacesDialog .stops-section {
      flex: 1 1 340px !important;
      min-height: 240px !important;
      overflow: hidden;
    }
    #editPlacesDialog .stops-container {
      flex: 1 1 auto !important;
      min-height: 210px !important;
      max-height: none !important;
      overflow-y: auto !important;
      padding-right: 8px;
      scrollbar-gutter: stable;
    }
    #editPlacesDialog .stop-row {
      flex: 0 0 auto;
    }
    @media (max-height: 700px) {
      #editPlacesDialog > form {
        min-height: calc(100vh - 36px);
      }
      #editPlacesDialog .stops-section {
        min-height: 180px !important;
      }
      #editPlacesDialog .stops-container {
        min-height: 150px !important;
      }
    }
    @media (max-width: 720px) {
      #editPlacesDialog {
        width: calc(100vw - 16px) !important;
      }
    }
  `;
  document.head.appendChild(style);

  const versionCopy = document.querySelector(".brand p");
  if (versionCopy) versionCopy.textContent = versionCopy.textContent.replace(/v\d+\.\d+\.\d+/, "v0.10.2");
})();
