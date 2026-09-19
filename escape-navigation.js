(() => {
  "use strict";

  const APP_VERSION = "0.11.8";

  function isEditingText(target) {
    return Boolean(target?.closest?.("input, textarea, select, [contenteditable='true']"));
  }

  function handleEscape(event) {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    if (isEditingText(event.target) || document.querySelector("dialog[open]")) return;
    if (state.drawing || state.editingTripId || !els.routeChooser.classList.contains("hidden")) return;

    if (state.iconicPreviewLayer?.getLayers?.().length) {
      event.preventDefault();
      event.stopPropagation();
      window.MinhasViagensIconicRoutes?.clearPreview?.();
      return;
    }

    if (state.tripRoadLayer) {
      event.preventDefault();
      event.stopPropagation();
      closeTripRoadHighlight();
      return;
    }

    if (state.activeTripDetailId) {
      event.preventDefault();
      event.stopPropagation();
      showTripList();
    }
  }

  document.addEventListener("keydown", handleEscape);
  window.MinhasViagensEscapeNavigation = Object.freeze({ handleEscape, isEditingText });

  const brandCopy = document.querySelector(".brand p");
  if (brandCopy) brandCopy.textContent = brandCopy.textContent.replace(/v\d+\.\d+\.\d+/, `v${APP_VERSION}`);

  console.info(`Minhas Viagens ${APP_VERSION}: Esc remove o destaque da rodovia antes de fechar a viagem.`);
})();

(() => {
  "use strict";
  if (document.querySelector('script[data-mv-v0144-bootstrap]')) return;
  const script = document.createElement("script");
  script.dataset.mvV0144Bootstrap = "true";
  script.src = `v0144-bootstrap.js?v=${encodeURIComponent(window.MINHAS_VIAGENS_APP_VERSION || "0.14.4")}`;
  script.async = false;
  document.body.appendChild(script);
})();
