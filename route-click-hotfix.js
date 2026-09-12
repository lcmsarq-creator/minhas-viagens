(() => {
  "use strict";

  const APP_VERSION = "0.10.10";
  const baseRenderTrips = typeof renderTrips === "function" ? renderTrips : null;

  function routeInteractionAvailable() {
    return !state.drawing && !state.editingTripId && els.routeChooser.classList.contains("hidden");
  }

  function openTripFromRoute(tripId) {
    if (!tripId || !routeInteractionAvailable()) return;
    try { closeTripRoadHighlight(); } catch {}
    try { closeFullHighway(); } catch {}
    openTripDetails(tripId);
  }

  function patchTripLines() {
    // O recurso de pontos vinculados à rota foi removido da interface.
    // Dados antigos continuam preservados no cadastro, mas seus marcadores deixam
    // de aparecer no mapa e o traçado passa a funcionar como navegação da viagem.
    try { pointLayers.clearLayers(); } catch {}

    for (const [tripId, line] of state.tripLineLayers || []) {
      if (!line) continue;
      try { line.off("click"); } catch {}
      try { line.unbindPopup(); } catch {}
      line.on("click", () => openTripFromRoute(tripId));
    }
  }

  // Qualquer referência antiga ao editor de pontos passa a abrir a própria viagem.
  // Isso também neutraliza listeners antigos já criados antes deste hotfix carregar.
  if (typeof openRoutePointDialog === "function") {
    openRoutePointDialog = function openRoutePointDialogDisabled(trip) {
      if (trip?.id) openTripFromRoute(trip.id);
    };
  }

  if (baseRenderTrips) {
    renderTrips = function renderTripsWithRouteNavigation() {
      baseRenderTrips();
      patchTripLines();
    };
  }

  patchTripLines();

  if (els.routePointDialog) {
    try { if (els.routePointDialog.open) els.routePointDialog.close(); } catch {}
    els.routePointDialog.style.display = "none";
    els.routePointDialog.setAttribute("aria-hidden", "true");
  }

  state.pointEditor = null;

  const brandCopy = document.querySelector(".brand p");
  if (brandCopy) brandCopy.textContent = brandCopy.textContent.replace(/v\d+\.\d+\.\d+/, `v${APP_VERSION}`);

  console.info(`Minhas Viagens ${APP_VERSION}: clique no traçado abre os detalhes da viagem; pontos de rota desativados.`);
})();
