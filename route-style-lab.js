(function (root, factory) {
  "use strict";
  const api = factory(root || {});
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.MinhasViagensRouteStyleLab = api;
})(typeof window !== "undefined" ? window : globalThis, root => {
  "use strict";

  const VERSION = 1;
  const DEFAULTS = Object.freeze({
    common: Object.freeze({ h: 152, s: 29, l: 31, width: 5 }),
    gold: Object.freeze({ h: 43, s: 75, l: 48, width: 6 }),
    silver: Object.freeze({ h: 204, s: 8, l: 71, width: 5 })
  });
  const LABELS = Object.freeze({ common: "Rota comum", gold: "Rota dourada", silver: "Rota prateada" });
  const userId = root.MinhasViagensAuth?.getUser?.()?.id || "local";
  const STORAGE_KEY = `minhasViagens.routeStyleLab.${userId}.v${VERSION}`;
  const listeners = new Set();

  const cloneDefaults = () => Object.fromEntries(Object.entries(DEFAULTS).map(([key, value]) => [key, { ...value }]));
  const bounded = (value, fallback, min, max) => {
    const numeric = Number(value);
    return Math.max(min, Math.min(max, Number.isFinite(numeric) ? numeric : fallback));
  };

  function sanitize(candidate) {
    const next = cloneDefaults();
    for (const kind of Object.keys(next)) {
      const source = candidate?.[kind] || {};
      next[kind].h = Math.round(bounded(source.h, next[kind].h, 0, 360));
      next[kind].s = Math.round(bounded(source.s, next[kind].s, 0, 100));
      next[kind].l = Math.round(bounded(source.l, next[kind].l, 0, 100));
      next[kind].width = Math.round(bounded(source.width, next[kind].width, 1, 12) * 2) / 2;
    }
    return next;
  }

  function load() {
    try { return sanitize(JSON.parse(root.localStorage?.getItem(STORAGE_KEY) || "null")); }
    catch { return cloneDefaults(); }
  }

  let settings = load();

  function color(kind) {
    const value = settings[kind] || settings.common;
    return `hsl(${value.h} ${value.s}% ${value.l}%)`;
  }

  function style(kind) {
    const value = settings[kind] || settings.common;
    return { ...value, color: color(kind) };
  }

  function snapshot() {
    return sanitize(settings);
  }

  function persist() {
    try { root.localStorage?.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch {}
  }

  function applyCssVariables() {
    const target = root.document?.documentElement;
    if (!target) return;
    for (const kind of Object.keys(settings)) {
      const value = style(kind);
      target.style.setProperty(`--route-${kind}-color`, value.color);
      target.style.setProperty(`--route-${kind}-width`, `${value.width}px`);
    }
  }

  function notify() {
    persist();
    applyCssVariables();
    const value = snapshot();
    for (const listener of listeners) listener(value);
  }

  function setValue(kind, property, value) {
    if (!settings[kind] || !["h", "s", "l", "width"].includes(property)) return;
    settings = sanitize({ ...settings, [kind]: { ...settings[kind], [property]: value } });
    notify();
  }

  function reset() {
    settings = cloneDefaults();
    notify();
    renderControls();
  }

  function subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function controlMarkup(kind, property, label, min, max, step = 1) {
    const value = settings[kind][property];
    const suffix = property === "width" ? " px" : property === "h" ? "°" : "%";
    return `<label class="route-style-control">
      <span>${label}</span>
      <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-route-kind="${kind}" data-route-property="${property}">
      <output>${value}${suffix}</output>
    </label>`;
  }

  function groupMarkup(kind) {
    return `<section class="route-style-group" data-route-style-group="${kind}">
      <div class="route-style-group-head">
        <strong>${LABELS[kind]}</strong>
        <span class="route-style-sample"><i></i></span>
      </div>
      ${controlMarkup(kind, "h", "H", 0, 360)}
      ${controlMarkup(kind, "s", "S", 0, 100)}
      ${controlMarkup(kind, "l", "L", 0, 100)}
      ${controlMarkup(kind, "width", "Espessura", 1, 12, .5)}
    </section>`;
  }

  function summaryText() {
    return Object.entries(settings).map(([kind, value]) =>
      `${LABELS[kind]}: H ${value.h} · S ${value.s}% · L ${value.l}% · ${value.width}px`
    ).join("\n");
  }

  function updateGroupPreview(kind) {
    const group = root.document?.querySelector(`[data-route-style-group="${kind}"]`);
    if (!group) return;
    const value = style(kind);
    const sample = group.querySelector(".route-style-sample i");
    if (sample) {
      sample.style.background = value.color;
      sample.style.height = `${value.width}px`;
    }
    group.querySelectorAll("[data-route-property]").forEach(input => {
      const property = input.dataset.routeProperty;
      const current = settings[kind][property];
      input.value = String(current);
      const suffix = property === "width" ? " px" : property === "h" ? "°" : "%";
      const output = input.parentElement?.querySelector("output");
      if (output) output.textContent = `${current}${suffix}`;
    });
  }

  function renderControls() {
    for (const kind of Object.keys(settings)) updateGroupPreview(kind);
  }

  function mount() {
    if (!root.document || root.document.getElementById("routeStyleLab")) return;
    const host = root.document.querySelector(".map-area");
    if (!host) return;
    const panel = root.document.createElement("aside");
    panel.id = "routeStyleLab";
    panel.className = "route-style-lab";
    panel.setAttribute("aria-label", "Laboratório temporário das linhas do mapa");
    panel.innerHTML = `<div class="route-style-lab-head">
      <div><strong>Linhas do mapa</strong><small>Ajuste temporário</small></div>
      <button type="button" class="route-style-collapse" aria-label="Recolher painel" aria-expanded="true">−</button>
    </div>
    <div class="route-style-lab-body">
      ${Object.keys(settings).map(groupMarkup).join("")}
      <div class="route-style-actions">
        <button type="button" class="secondary-btn small route-style-copy">Copiar ajustes</button>
        <button type="button" class="ghost-btn small route-style-reset">Restaurar</button>
      </div>
      <small class="route-style-status">Os testes ficam salvos somente neste navegador.</small>
    </div>`;
    host.appendChild(panel);

    panel.querySelectorAll("input[data-route-kind]").forEach(input => input.addEventListener("input", event => {
      const kind = event.target.dataset.routeKind;
      const property = event.target.dataset.routeProperty;
      setValue(kind, property, event.target.value);
      updateGroupPreview(kind);
    }));
    panel.querySelector(".route-style-collapse")?.addEventListener("click", event => {
      const collapsed = panel.classList.toggle("collapsed");
      event.currentTarget.textContent = collapsed ? "+" : "−";
      event.currentTarget.setAttribute("aria-expanded", String(!collapsed));
      event.currentTarget.setAttribute("aria-label", collapsed ? "Abrir painel" : "Recolher painel");
    });
    panel.querySelector(".route-style-reset")?.addEventListener("click", reset);
    panel.querySelector(".route-style-copy")?.addEventListener("click", async () => {
      const status = panel.querySelector(".route-style-status");
      try {
        if (!root.navigator?.clipboard?.writeText) throw new Error("Clipboard indisponível");
        await root.navigator.clipboard.writeText(summaryText());
        if (status) status.textContent = "Copiado. Cole os valores na conversa quando aprovar.";
      } catch {
        if (status) status.textContent = summaryText().replaceAll("\n", " | ");
      }
    });
    renderControls();
  }

  applyCssVariables();
  if (root.document) mount();

  return Object.freeze({
    VERSION,
    DEFAULTS,
    STORAGE_KEY,
    sanitize,
    color,
    style,
    snapshot,
    setValue,
    reset,
    subscribe,
    summaryText,
    mount
  });
});
