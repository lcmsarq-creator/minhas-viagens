(() => {
  "use strict";

  const APP_VERSION = "0.10.7";
  const dialog = document.getElementById("editPlacesDialog");
  if (!dialog) return;

  // Abre o editor como painel NÃO modal. Assim ele não cria backdrop nem bloqueia
  // o restante da interface: a área do mapa que fica visível continua aceitando
  // pan, zoom, duplo clique e os controles do Leaflet normalmente.
  openEditPlacesDialog = function openEditPlacesDialogModeless(trip) {
    if (!trip || state.drawing || state.editingTripId || !els.routeChooser.classList.contains("hidden")) return;

    state.editingPlacesTripId = trip.id;
    state.editStartPlace = trip.startPlace ? { ...trip.startPlace } : editPlaceFallback(trip, "start");
    state.editEndPlace = trip.endPlace ? { ...trip.endPlace } : editPlaceFallback(trip, "end");
    state.editStopPlaces = [];
    els.editStopsContainer.innerHTML = "";

    const startLabel = state.editStartPlace?.label || state.editStartPlace?.city || "";
    const endLabel = state.editEndPlace?.label || state.editEndPlace?.city || "";
    els.editStartAddress.value = startLabel;
    els.editEndAddress.value = endLabel;
    els.editStartSelected.textContent = state.editStartPlace ? `✓ ${startLabel}` : "Nenhuma cidade selecionada.";
    els.editEndSelected.textContent = state.editEndPlace ? `✓ ${endLabel}` : "Nenhuma cidade selecionada.";
    els.editStartSelected.classList.toggle("ok", Boolean(state.editStartPlace));
    els.editEndSelected.classList.toggle("ok", Boolean(state.editEndPlace));
    els.editStartSuggestions.innerHTML = "";
    els.editEndSuggestions.innerHTML = "";
    els.editStartSuggestions.classList.add("hidden");
    els.editEndSuggestions.classList.add("hidden");
    els.editStartStatus.textContent = "";
    els.editEndStatus.textContent = "";

    (trip.stopPlaces || []).forEach(place => addEditStopField(place, false));

    if (!["carro", "moto"].includes(trip.mode)) {
      setEditPlacesMessage("Nesta versão, o recálculo automático após editar cidades está disponível para viagens de carro e moto.");
    } else {
      setEditPlacesMessage("");
    }
    updateEditPlacesButton();

    // Não usamos showModal(), show() nem top layer do navegador. O atributo open
    // transforma este <dialog> em um painel comum, fixo e modeless.
    dialog.setAttribute("open", "");
    dialog.classList.add("mv-city-editor-open");
    requestAnimationFrame(() => els.editStartAddress?.focus({ preventScroll: true }));
  };

  const originalClose = closeEditPlacesDialog;
  closeEditPlacesDialog = function closeEditPlacesDialogModeless() {
    dialog.classList.remove("mv-city-editor-open");
    dialog.removeAttribute("open");
    // Replica a limpeza do fluxo original sem depender de dialog.close().
    state.editingPlacesTripId = null;
    state.editStartPlace = null;
    state.editEndPlace = null;
    state.editStopPlaces = [];
    els.editStopsContainer.innerHTML = "";
    setEditPlacesMessage("");
  };

  // Os listeners de fechar/cancelar foram registrados antes deste hotfix e podem
  // manter referência à função antiga. Garantimos o fechamento modeless no capture.
  [els.closeEditPlacesBtn, els.cancelEditPlacesBtn].forEach(button => {
    button?.addEventListener("click", () => {
      if (dialog.hasAttribute("open")) {
        dialog.classList.remove("mv-city-editor-open");
        dialog.removeAttribute("open");
      }
    }, true);
  });

  const style = document.createElement("style");
  style.textContent = `
    #editPlacesDialog.mv-city-editor-open[open] {
      display: block !important;
      position: fixed !important;
      top: 22px !important;
      right: 22px !important;
      bottom: 22px !important;
      left: auto !important;
      width: min(520px, calc(100vw - 404px)) !important;
      min-width: 380px;
      height: auto !important;
      max-width: calc(100vw - 44px) !important;
      max-height: none !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
      z-index: 1300 !important;
      border: 1px solid rgba(31, 40, 35, .18);
      border-radius: 16px;
      background: #fff;
      box-shadow: 0 18px 50px rgba(16, 24, 20, .22);
      resize: none !important;
    }

    #editPlacesDialog::backdrop {
      display: none !important;
      background: transparent !important;
      pointer-events: none !important;
    }

    #editPlacesDialog.mv-city-editor-open > #editPlacesForm {
      height: 100% !important;
      max-height: none !important;
      min-height: 0;
      padding: 18px;
      display: flex !important;
      flex-direction: column;
      overflow: hidden !important;
    }

    #editPlacesDialog.mv-city-editor-open .dialog-head {
      flex: 0 0 auto;
      margin-bottom: 12px;
      cursor: default !important;
      user-select: text !important;
    }

    #editPlacesDialog.mv-city-editor-open .autocomplete-field,
    #editPlacesDialog.mv-city-editor-open .dialog-actions,
    #editPlacesDialog.mv-city-editor-open .form-message {
      flex: 0 0 auto;
    }

    #editPlacesDialog.mv-city-editor-open .stops-section {
      display: flex !important;
      flex-direction: column;
      flex: 1 1 auto !important;
      min-height: 170px !important;
      max-height: none !important;
      overflow: hidden !important;
      margin-bottom: 10px;
    }

    #editPlacesDialog.mv-city-editor-open .stops-container {
      flex: 1 1 auto;
      min-height: 105px !important;
      max-height: none !important;
      height: auto !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
      padding-right: 5px;
    }

    #editPlacesDialog.mv-city-editor-open .dialog-actions {
      margin-top: 8px;
      padding-top: 8px;
      background: #fff;
    }

    /* Remove totalmente os elementos e comportamentos das versões arrastáveis. */
    #editPlacesDialog .mv-dialog-resize-handle { display: none !important; }
    body.mv-dragging-edit-dialog { user-select: auto !important; }

    @media (max-width: 820px) {
      #editPlacesDialog.mv-city-editor-open[open] {
        top: 12px !important;
        right: 12px !important;
        bottom: 12px !important;
        left: 12px !important;
        width: auto !important;
        min-width: 0 !important;
        max-width: none !important;
      }
    }
  `;
  document.head.appendChild(style);

  const brandCopy = document.querySelector(".brand p");
  if (brandCopy) brandCopy.textContent = brandCopy.textContent.replace(/v\d+\.\d+\.\d+/, `v${APP_VERSION}`);
})();
