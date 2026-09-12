(() => {
  "use strict";

  const dialog = document.getElementById("editPlacesDialog");
  if (!dialog) return;

  const header = dialog.querySelector(".dialog-head");
  const closeButton = document.getElementById("closeEditPlacesBtn");
  const APP_VERSION = "0.10.6";

  function defaultRect() {
    const width = Math.min(590, Math.max(440, window.innerWidth - 56));
    const height = Math.min(590, Math.max(420, window.innerHeight - 80));
    return {
      width,
      height,
      left: Math.max(16, Math.round((window.innerWidth - width) / 2)),
      top: Math.max(16, Math.round((window.innerHeight - height) / 2))
    };
  }

  function ensurePosition() {
    if (dialog.dataset.mvPositioned === "1") {
      clampToViewport();
      return;
    }
    const rect = defaultRect();
    Object.assign(dialog.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`
    });
    dialog.dataset.mvPositioned = "1";
  }

  function clampToViewport() {
    const rect = dialog.getBoundingClientRect();
    const fallback = defaultRect();
    const maxWidth = Math.max(360, window.innerWidth - 24);
    const maxHeight = Math.max(320, window.innerHeight - 24);
    const width = Math.min(rect.width || fallback.width, maxWidth);
    const height = Math.min(rect.height || fallback.height, maxHeight);
    const left = Math.min(Math.max(12, Number.isFinite(rect.left) ? rect.left : fallback.left), Math.max(12, window.innerWidth - width - 12));
    const top = Math.min(Math.max(12, Number.isFinite(rect.top) ? rect.top : fallback.top), Math.max(12, window.innerHeight - height - 12));
    Object.assign(dialog.style, {
      width: `${width}px`,
      height: `${height}px`,
      left: `${left}px`,
      top: `${top}px`
    });
  }

  function showModeless() {
    // Não usamos HTMLDialogElement.show()/showModal(). O atributo open é suficiente
    // para um dialog modeless e evita diferenças de implementação/top-layer entre
    // navegadores. Assim o mapa continua recebendo pan e zoom fora do painel.
    dialog.setAttribute("open", "");
    dialog.classList.add("mv-edit-panel-open");
    ensurePosition();
    requestAnimationFrame(() => {
      ensurePosition();
      try { dialog.querySelector("input, button")?.focus({ preventScroll: true }); } catch {}
    });
  }

  function hideModeless() {
    dialog.removeAttribute("open");
    dialog.classList.remove("mv-edit-panel-open");
    document.body.classList.remove("mv-dragging-edit-dialog");
  }

  // Compatibilidade com o código principal, que chama showModal() e close().
  // Mantemos tudo como painel modeless para que o mapa permaneça interativo.
  try {
    Object.defineProperty(dialog, "showModal", {
      configurable: true,
      writable: true,
      value: showModeless
    });
  } catch {
    try { dialog.showModal = showModeless; } catch {}
  }

  const nativeClose = window.HTMLDialogElement?.prototype?.close;
  try {
    Object.defineProperty(dialog, "close", {
      configurable: true,
      writable: true,
      value: function closeModeless() {
        hideModeless();
        // Não chamamos o close nativo porque o painel não foi colocado no top layer.
        // O atributo open é a fonte de verdade para o estado deste editor.
      }
    });
  } catch {
    // Mesmo se não for possível substituir close(), o atributo open ainda é removido
    // pelos botões abaixo e o close nativo continua como fallback.
  }

  // Abre de forma independente do fluxo principal. O listener é capturado antes do
  // handler criado em script.js e a abertura não depende de state nem do método nativo.
  document.addEventListener("click", event => {
    const button = event.target.closest?.(".edit-places-btn");
    if (!button || button.disabled) return;
    showModeless();
    // O fluxo principal, executado em seguida, preenche os campos da viagem.
    // Reforçamos a visibilidade depois dele caso algum código tente reabrir o dialog.
    requestAnimationFrame(showModeless);
  }, true);

  // Escape fecha somente o painel e não bloqueia o mapa.
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && dialog.hasAttribute("open")) {
      event.preventDefault();
      try {
        if (typeof closeEditPlacesDialog === "function") closeEditPlacesDialog();
        else hideModeless();
      } catch {
        hideModeless();
      }
    }
  });

  let drag = null;
  header?.addEventListener("pointerdown", event => {
    if (event.button !== 0 || event.target.closest("button, input, select, textarea, a")) return;
    const rect = dialog.getBoundingClientRect();
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top
    };
    header.setPointerCapture?.(event.pointerId);
    document.body.classList.add("mv-dragging-edit-dialog");
    event.preventDefault();
  });

  header?.addEventListener("pointermove", event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const rect = dialog.getBoundingClientRect();
    const nextLeft = Math.min(
      Math.max(8, drag.left + event.clientX - drag.startX),
      Math.max(8, window.innerWidth - rect.width - 8)
    );
    const nextTop = Math.min(
      Math.max(8, drag.top + event.clientY - drag.startY),
      Math.max(8, window.innerHeight - rect.height - 8)
    );
    dialog.style.left = `${nextLeft}px`;
    dialog.style.top = `${nextTop}px`;
  });

  function endDrag(event) {
    if (!drag || (event && event.pointerId !== drag.pointerId)) return;
    try { header?.releasePointerCapture?.(drag.pointerId); } catch {}
    drag = null;
    document.body.classList.remove("mv-dragging-edit-dialog");
  }
  header?.addEventListener("pointerup", endDrag);
  header?.addEventListener("pointercancel", endDrag);

  dialog.querySelector(".mv-dialog-resize-handle")?.remove();
  const resizeHandle = document.createElement("div");
  resizeHandle.className = "mv-dialog-resize-handle";
  resizeHandle.setAttribute("role", "separator");
  resizeHandle.setAttribute("aria-label", "Redimensionar janela de edição");
  dialog.appendChild(resizeHandle);

  let resize = null;
  resizeHandle.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    const rect = dialog.getBoundingClientRect();
    resize = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      width: rect.width,
      height: rect.height
    };
    resizeHandle.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  });

  resizeHandle.addEventListener("pointermove", event => {
    if (!resize || event.pointerId !== resize.pointerId) return;
    const rect = dialog.getBoundingClientRect();
    const maxWidth = Math.max(400, window.innerWidth - rect.left - 10);
    const maxHeight = Math.max(360, window.innerHeight - rect.top - 10);
    const width = Math.min(maxWidth, Math.max(440, resize.width + event.clientX - resize.startX));
    const height = Math.min(maxHeight, Math.max(420, resize.height + event.clientY - resize.startY));
    dialog.style.width = `${width}px`;
    dialog.style.height = `${height}px`;
  });

  function endResize(event) {
    if (!resize || (event && event.pointerId !== resize.pointerId)) return;
    try { resizeHandle.releasePointerCapture?.(resize.pointerId); } catch {}
    resize = null;
  }
  resizeHandle.addEventListener("pointerup", endResize);
  resizeHandle.addEventListener("pointercancel", endResize);

  // Dentro do painel os eventos não devem vazar para o mapa. Fora dele, o Leaflet
  // segue totalmente navegável porque não existe backdrop/top-layer modal.
  ["mousedown", "pointerdown", "wheel", "dblclick", "touchstart"].forEach(type => {
    dialog.addEventListener(type, event => event.stopPropagation());
  });

  window.addEventListener("resize", () => {
    if (dialog.hasAttribute("open")) clampToViewport();
  });

  const style = document.createElement("style");
  style.textContent = `
    #editPlacesDialog:not([open]) { display: none !important; }
    #editPlacesDialog[open] {
      display: block !important;
      position: fixed !important;
      inset: auto !important;
      margin: 0 !important;
      width: 590px;
      height: 590px;
      min-width: 440px;
      min-height: 420px;
      max-width: calc(100vw - 24px);
      max-height: calc(100vh - 24px);
      overflow: hidden !important;
      z-index: 2147483000 !important;
      border: 1px solid rgba(31, 40, 35, .18);
      border-radius: 16px;
      background: #fff;
      color: #1f2823;
      box-shadow: 0 18px 50px rgba(16, 24, 20, .24);
    }
    #editPlacesDialog::backdrop { display: none !important; background: transparent !important; pointer-events: none !important; }
    #editPlacesDialog > #editPlacesForm {
      height: 100% !important;
      max-height: none !important;
      min-height: 0;
      display: grid !important;
      grid-template-rows: auto auto minmax(145px, 1fr) auto auto auto;
      overflow: hidden !important;
      padding: 18px;
    }
    #editPlacesDialog .dialog-head {
      cursor: move;
      user-select: none;
      touch-action: none;
      margin-bottom: 12px;
    }
    #editPlacesDialog .dialog-head button { cursor: pointer; }
    #editPlacesDialog .autocomplete-field { min-height: 0; }
    #editPlacesDialog .stops-section {
      min-height: 145px !important;
      max-height: none !important;
      height: auto !important;
      margin-bottom: 10px;
      overflow: hidden;
    }
    #editPlacesDialog .stops-container {
      min-height: 90px;
      max-height: none !important;
      height: 100%;
      overflow-y: auto !important;
      overflow-x: hidden;
      scrollbar-gutter: stable;
    }
    #editPlacesDialog .dialog-actions {
      margin-top: 8px;
      padding-top: 8px;
      background: white;
    }
    .mv-dialog-resize-handle {
      position: absolute;
      right: 2px;
      bottom: 2px;
      width: 22px;
      height: 22px;
      cursor: nwse-resize;
      z-index: 5;
      touch-action: none;
      opacity: .55;
    }
    .mv-dialog-resize-handle::after {
      content: "";
      position: absolute;
      right: 4px;
      bottom: 4px;
      width: 9px;
      height: 9px;
      border-right: 2px solid #66706a;
      border-bottom: 2px solid #66706a;
    }
    body.mv-dragging-edit-dialog { user-select: none; }

    @media (max-width: 680px) {
      #editPlacesDialog[open] {
        min-width: 0;
        width: calc(100vw - 20px) !important;
        left: 10px !important;
        right: auto !important;
      }
      .mv-dialog-resize-handle { display: none; }
    }
  `;
  document.head.appendChild(style);

  closeButton?.addEventListener("click", hideModeless);
  document.getElementById("cancelEditPlacesBtn")?.addEventListener("click", hideModeless);

  const brandCopy = document.querySelector(".brand p");
  if (brandCopy) brandCopy.textContent = brandCopy.textContent.replace(/v\d+\.\d+\.\d+/, `v${APP_VERSION}`);
})();
