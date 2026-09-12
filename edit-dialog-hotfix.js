(() => {
  "use strict";

  const APP_VERSION = "0.10.8";
  const editDialog = document.getElementById("editPlacesDialog");
  const tripDialog = document.getElementById("tripDialog");

  function openPanel(dialog) {
    if (!dialog) return;
    dialog.setAttribute("open", "");
    dialog.classList.add("mv-map-panel-open");
    const form = dialog.querySelector("form");
    if (form) form.scrollTop = 0;
  }

  function clearPanelClass(dialog) {
    if (!dialog) return;
    dialog.classList.remove("mv-map-panel-open");
  }

  function installModelessOpen(dialog) {
    if (!dialog) return;
    const showPanel = () => openPanel(dialog);
    ["showModal", "show"].forEach(method => {
      try {
        Object.defineProperty(dialog, method, {
          configurable: true,
          writable: true,
          value: showPanel
        });
      } catch {
        try { dialog[method] = showPanel; } catch {}
      }
    });
    dialog.addEventListener("close", () => clearPanelClass(dialog));
  }

  // A janela de Nova viagem usa o mesmo painel não modal do editor de cidades.
  // O código principal continua chamando showModal(), mas aqui esse método abre
  // apenas um painel comum, sem backdrop e sem bloquear o mapa ao fundo.
  installModelessOpen(tripDialog);

  if (editDialog) {
    // Mantém o fluxo de edição já existente, abrindo-o no mesmo padrão visual.
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

      openPanel(editDialog);
      requestAnimationFrame(() => els.editStartAddress?.focus({ preventScroll: true }));
    };

    closeEditPlacesDialog = function closeEditPlacesDialogModeless() {
      clearPanelClass(editDialog);
      editDialog.removeAttribute("open");
      state.editingPlacesTripId = null;
      state.editStartPlace = null;
      state.editEndPlace = null;
      state.editStopPlaces = [];
      els.editStopsContainer.innerHTML = "";
      setEditPlacesMessage("");
    };

    // Os listeners originais podem guardar referência à função antiga. Garantimos
    // que os botões sempre fechem o painel visualmente no capture.
    [els.closeEditPlacesBtn, els.cancelEditPlacesBtn].forEach(button => {
      button?.addEventListener("click", () => {
        clearPanelClass(editDialog);
        editDialog.removeAttribute("open");
      }, true);
    });
  }

  // A classe visual da Nova viagem é removida mesmo quando o fechamento acontece
  // pelo fluxo original do aplicativo.
  [document.getElementById("closeDialogBtn"), document.getElementById("cancelDialogBtn")].forEach(button => {
    button?.addEventListener("click", () => clearPanelClass(tripDialog), true);
  });

  const style = document.createElement("style");
  style.textContent = `
    #tripDialog.mv-map-panel-open[open],
    #editPlacesDialog.mv-map-panel-open[open] {
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

    #tripDialog::backdrop,
    #editPlacesDialog::backdrop {
      display: none !important;
      background: transparent !important;
      pointer-events: none !important;
    }

    #tripDialog.mv-map-panel-open > #tripForm,
    #editPlacesDialog.mv-map-panel-open > #editPlacesForm {
      height: 100% !important;
      max-height: none !important;
      min-height: 0;
      padding: 18px;
      display: block !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
    }

    #tripDialog.mv-map-panel-open .dialog-head,
    #editPlacesDialog.mv-map-panel-open .dialog-head {
      margin-bottom: 14px;
      cursor: default !important;
      user-select: text !important;
    }

    #tripDialog.mv-map-panel-open .stops-section,
    #editPlacesDialog.mv-map-panel-open .stops-section {
      min-height: 150px !important;
      max-height: none !important;
      height: auto !important;
      margin-bottom: 12px;
      overflow: visible !important;
    }

    #tripDialog.mv-map-panel-open .stops-container,
    #editPlacesDialog.mv-map-panel-open .stops-container {
      min-height: 95px !important;
      max-height: 230px !important;
      height: auto !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
      padding-right: 5px;
    }

    #tripDialog.mv-map-panel-open .dialog-actions,
    #editPlacesDialog.mv-map-panel-open .dialog-actions {
      margin-top: 10px;
      padding-top: 8px;
      background: #fff;
    }

    #editPlacesDialog .mv-dialog-resize-handle { display: none !important; }
    body.mv-dragging-edit-dialog { user-select: auto !important; }

    @media (max-width: 820px) {
      #tripDialog.mv-map-panel-open[open],
      #editPlacesDialog.mv-map-panel-open[open] {
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
