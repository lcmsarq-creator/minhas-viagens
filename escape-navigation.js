(() => {
  "use strict";

  const APP_VERSION = window.MINHAS_VIAGENS_APP_VERSION || "0.15.19";
  const GUARD_KEY = "minhasViagensEscapeGuard";

  function isEditingText(target) {
    return Boolean(target?.closest?.("input, textarea, select, [contenteditable='true']"));
  }

  function isVisible(element) {
    return Boolean(element && !element.classList.contains("hidden"));
  }

  function closeOpenDialog() {
    if (els.routePointDialog?.open) {
      closeRoutePointDialog();
      return true;
    }
    if (els.editPlacesDialog?.open) {
      closeEditPlacesDialog();
      return true;
    }
    if (els.tripDialog?.open) {
      closeTripDialog();
      return true;
    }

    const openDialog = document.querySelector("dialog[open]");
    if (openDialog) {
      openDialog.close();
      return true;
    }
    return false;
  }

  function performEscapeAction(options = {}) {
    const source = options.source || "keyboard";
    const fromMap = source === "map";

    // No mapa vazio, nunca interromper desenho/edição: o toque faz parte da operação.
    if (fromMap && (state.drawing || state.editingTripId || !els.routeChooser.classList.contains("hidden"))) {
      return false;
    }

    const profile = document.getElementById("mobileProfileScreen");
    if (profile && !profile.classList.contains("hidden")) {
      window.MinhasViagensProfile?.close?.({ fromHistory: source === "history" });
      return true;
    }

    if (!fromMap && closeOpenDialog()) return true;

    if (!els.routeChooser.classList.contains("hidden")) {
      if (source === "history" || source === "keyboard") {
        cleanupRouteChooser();
        return true;
      }
      return false;
    }

    if (state.drawing) {
      if (source === "history" || source === "keyboard") {
        stopDrawing();
        return true;
      }
      return false;
    }

    if (state.editingTripId) {
      if (source === "history" || source === "keyboard") {
        cancelRouteEdit();
        return true;
      }
      return false;
    }

    if (state.iconicPreviewLayer?.getLayers?.().length) {
      window.MinhasViagensIconicRoutes?.clearPreview?.();
      return true;
    }

    if (state.highwayLayer || !els.highwayBanner?.classList.contains("hidden")) {
      closeFullHighway(true);
      return true;
    }

    if (state.tripRoadLayer) {
      closeTripRoadHighlight();
      return true;
    }

    if (state.cityHighlight) {
      if (state.cityHighlightTimer) clearTimeout(state.cityHighlightTimer);
      state.cityHighlightTimer = null;
      try { map.removeLayer(state.cityHighlight); } catch {}
      state.cityHighlight = null;
      return true;
    }

    if (state.activeTripDetailId) {
      showTripList();
      return true;
    }

    return false;
  }

  function handleEscape(event) {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    if (isEditingText(event.target)) return;
    if (!performEscapeAction({ source: "keyboard" })) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function isBlankMapTarget(target) {
    if (!target?.closest) return true;
    return !target.closest(
      ".leaflet-interactive, .leaflet-marker-icon, .leaflet-marker-shadow, " +
      ".leaflet-control, .route-chooser, .draw-banner, .highway-banner, " +
      ".achievement-toast, button, a, input, textarea, select, label"
    );
  }

  function handleMapClick(event) {
    const target = event?.originalEvent?.target;
    if (!isBlankMapTarget(target)) return;
    performEscapeAction({ source: "map" });
  }

  function installHistoryGuard() {
    if (!history?.pushState) return;
    if (history.state?.[GUARD_KEY]) return;
    history.pushState({ ...(history.state || {}), [GUARD_KEY]: true }, "", location.href);
  }

  function handleHistoryBack() {
    if (window.__mvBackConsumed) {
      window.__mvBackConsumed = false;
      return;
    }

    const handled = performEscapeAction({ source: "history" });
    if (handled) {
      history.pushState({ ...(history.state || {}), [GUARD_KEY]: true }, "", location.href);
      return;
    }

    // O primeiro "voltar" consumiu apenas o guard interno; sem algo aberto,
    // continue para a navegação anterior real do navegador.
    if (!history.state?.[GUARD_KEY]) {
      setTimeout(() => history.back(), 0);
    }
  }

  document.addEventListener("keydown", handleEscape);
  map.on("click", handleMapClick);
  window.addEventListener("popstate", handleHistoryBack);
  installHistoryGuard();

  window.MinhasViagensEscapeNavigation = Object.freeze({
    handleEscape,
    performEscapeAction,
    isEditingText
  });

  const brandCopy = document.querySelector(".brand p");
  if (brandCopy) brandCopy.textContent = brandCopy.textContent.replace(/v\d+\.\d+\.\d+/, `v${APP_VERSION}`);

  console.info(`Minhas Viagens ${APP_VERSION}: Esc, toque no mapa vazio e gesto Voltar fecham a seleção atual.`);
})();
