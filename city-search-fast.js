(() => {
  "use strict";

  const VERSION = "0.10.4";
  const GEOCODING_ENDPOINT = "https://geocoding-api.open-meteo.com/v1/search";
  const BRAZIL_CSV = "https://raw.githubusercontent.com/kelvins/municipios-brasileiros/main/csv/municipios.csv";
  const nativeFetch = window.__mvNativeFetch || window.fetch.bind(window);
  const neighborCodes = new Set(["AR", "UY", "PY", "BO", "PE", "CL", "CO", "VE", "GY", "SR", "GF"]);
  const remoteCache = new Map();

  const states = {
    11:["RO","Rondônia"],12:["AC","Acre"],13:["AM","Amazonas"],14:["RR","Roraima"],15:["PA","Pará"],16:["AP","Amapá"],17:["TO","Tocantins"],
    21:["MA","Maranhão"],22:["PI","Piauí"],23:["CE","Ceará"],24:["RN","Rio Grande do Norte"],25:["PB","Paraíba"],26:["PE","Pernambuco"],27:["AL","Alagoas"],28:["SE","Sergipe"],29:["BA","Bahia"],
    31:["MG","Minas Gerais"],32:["ES","Espírito Santo"],33:["RJ","Rio de Janeiro"],35:["SP","São Paulo"],
    41:["PR","Paraná"],42:["SC","Santa Catarina"],43:["RS","Rio Grande do Sul"],
    50:["MS","Mato Grosso do Sul"],51:["MT","Mato Grosso"],52:["GO","Goiás"],53:["DF","Distrito Federal"]
  };

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function compact(value) { return normalize(value).replace(/\s+/g, ""); }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    if (Math.abs(a.length - b.length) > 4) return Math.max(a.length, b.length);
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let diagonal = row[0];
      row[0] = i;
      let rowMin = row[0];
      for (let j = 1; j <= b.length; j++) {
        const above = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
        diagonal = above;
        rowMin = Math.min(rowMin, row[j]);
      }
      if (rowMin > 4) return Math.max(a.length, b.length);
    }
    return row[b.length];
  }

  function fuzzyScore(index, query) {
    const q = normalize(query), qc = compact(query);
    if (!q || !index.n) return 999;
    if (index.n === q) return 0;
    if (index.n.startsWith(q)) return 2;
    if (index.n.endsWith(` ${q}`)) return 3;
    if (` ${index.n} `.includes(` ${q} `)) return 4;
    if (index.n.includes(q)) return 5;
    if (index.c.includes(qc)) return 7;

    const qTokens = q.split(" ").filter(Boolean);
    const anchor = qTokens[0]?.slice(0, 2) || "";
    if (anchor && !index.tokens.some(token => token.startsWith(anchor) || token.includes(anchor))) return 999;

    let best = 1;
    const candidateParts = [];
    for (let start = 0; start < index.tokens.length; start++) {
      const minLen = Math.max(1, qTokens.length - 1);
      const maxLen = Math.min(index.tokens.length - start, qTokens.length + 1);
      for (let len = minLen; len <= maxLen; len++) candidateParts.push(index.tokens.slice(start, start + len).join(""));
    }
    candidateParts.push(index.c);
    for (const part of candidateParts) {
      const dist = levenshtein(part, qc);
      const ratio = dist / Math.max(part.length, qc.length, 1);
      if (ratio < best) best = ratio;
    }
    return best <= .34 ? 20 + best * 50 : 999;
  }

  function parseBrazilCsv(text) {
    const lines = String(text || "").split(/\r?\n/);
    const output = [];
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].trim();
      if (!row) continue;
      const cols = row.split(",");
      if (cols.length < 6) continue;
      const [ibge, name, latitude, longitude, , ufCode] = cols;
      const state = states[Number(ufCode)] || ["", ""];
      const n = normalize(name);
      output.push({
        ibge,
        name,
        latitude:Number(latitude),
        longitude:Number(longitude),
        admin1:state[1],
        stateCode:state[0],
        country:"Brasil",
        country_code:"BR",
        id:`br-${ibge}`,
        n,
        c:compact(name),
        tokens:n.split(" ").filter(Boolean)
      });
    }
    return output;
  }

  let brazilIndex = [];
  let brazilReady = false;
  const brazilPromise = nativeFetch(BRAZIL_CSV, { cache:"force-cache", mode:"cors" })
    .then(response => {
      if (!response.ok) throw new Error(`Base brasileira ${response.status}`);
      return response.text();
    })
    .then(text => {
      brazilIndex = parseBrazilCsv(text);
      brazilReady = true;
      return brazilIndex;
    })
    .catch(error => {
      console.warn("Base local de municípios brasileiros indisponível", error);
      brazilReady = true;
      return [];
    });

  function brazilResults(query, limit = 8) {
    const ranked = [];
    for (const city of brazilIndex) {
      const score = fuzzyScore(city, query);
      if (score >= 999) continue;
      ranked.push({ city, score });
    }
    ranked.sort((a,b) => a.score - b.score || a.city.name.localeCompare(b.city.name, "pt-BR"));
    return ranked.slice(0, limit).map(({city}) => ({
      id: city.id,
      name: city.name,
      latitude: city.latitude,
      longitude: city.longitude,
      admin1: city.admin1,
      country: city.country,
      country_code: city.country_code,
      feature_code: "PPLA",
      _mvStateCode: city.stateCode
    }));
  }

  function remoteScore(item, query) {
    const n = normalize(item?.name), q = normalize(query);
    if (!n || !q) return 999;
    if (n === q) return 0;
    if (n.startsWith(q)) return 2;
    if (n.endsWith(` ${q}`)) return 3;
    if (n.includes(q)) return 5;
    const nc = compact(n), qc = compact(q);
    if (nc.includes(qc)) return 7;
    const d = levenshtein(nc, qc) / Math.max(nc.length, qc.length, 1);
    return d <= .28 ? 20 + d * 50 : 999;
  }

  async function remoteResults(query, signal) {
    const key = normalize(query);
    if (remoteCache.has(key)) return remoteCache.get(key);
    const url = `${GEOCODING_ENDPOINT}?name=${encodeURIComponent(query)}&count=30&language=pt&format=json`;
    const response = await nativeFetch(url, { signal, cache:"default" });
    if (!response.ok) throw new Error(`Geocoding ${response.status}`);
    const data = await response.json();
    const results = Array.isArray(data.results) ? data.results : [];
    remoteCache.set(key, results);
    if (remoteCache.size > 80) remoteCache.delete(remoteCache.keys().next().value);
    return results;
  }

  function dedupe(items) {
    const seen = new Set();
    return items.filter(item => {
      const key = `${normalize(item.name)}|${normalize(item.admin1)}|${String(item.country_code || "").toUpperCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function search(query, signal) {
    if (!brazilReady) await brazilPromise;
    const local = brazilResults(query, 8);

    // Se já temos uma lista brasileira forte e cheia, devolvemos sem rede.
    // Isso deixa buscas como "rio preto", "guaratingueta" e "venceslau" praticamente instantâneas.
    const strongest = local.filter(item => remoteScore(item, query) <= 7);
    if (strongest.length >= 8) return local;

    let remote = [];
    try { remote = await remoteResults(query, signal); }
    catch (error) {
      if (error?.name === "AbortError") throw error;
      console.warn("Busca internacional indisponível", error);
    }

    const scoredRemote = remote
      .map(item => ({ item, score:remoteScore(item, query) }))
      .filter(entry => entry.score < 999)
      .sort((a,b) => a.score - b.score || String(a.item.name).localeCompare(String(b.item.name), "pt-BR"))
      .map(entry => entry.item);

    const remoteBrazil = scoredRemote.filter(item => String(item.country_code || "").toUpperCase() === "BR");
    const neighbors = scoredRemote.filter(item => neighborCodes.has(String(item.country_code || "").toUpperCase()));
    const others = scoredRemote.filter(item => {
      const code = String(item.country_code || "").toUpperCase();
      return code && code !== "BR" && !neighborCodes.has(code);
    });

    return dedupe([...local, ...remoteBrazil, ...neighbors, ...others]).slice(0, 10);
  }

  window.fetch = async function mvFastCityFetch(input, init = {}) {
    const url = typeof input === "string" ? input : input?.url;
    if (!url || !url.startsWith(GEOCODING_ENDPOINT)) return nativeFetch(input, init);
    const parsed = new URL(url, location.href);
    const query = parsed.searchParams.get("name")?.trim() || "";
    if (query.length < 2) return nativeFetch(input, init);
    try {
      const results = await search(query, init.signal || null);
      return new Response(JSON.stringify({ results }), { status:200, headers:{"Content-Type":"application/json; charset=utf-8"} });
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      console.warn("Busca rápida de cidades falhou; usando geocodificador direto", error);
      return nativeFetch(input, init);
    }
  };

  // Pré-carrega a base brasileira enquanto o usuário navega pelo app.
  brazilPromise.then(() => {
    const brand = document.querySelector(".brand p");
    if (brand) brand.textContent = brand.textContent.replace(/v\d+\.\d+\.\d+/, `v${VERSION}`);
  });
})();
