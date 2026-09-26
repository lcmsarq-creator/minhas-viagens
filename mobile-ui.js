(function () {
  "use strict";

  function ready(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
      return;
    }
    callback();
  }

  ready(() => {
    const app = document.getElementById("application");
    const toggle = document.getElementById("mobileSheetToggle");
    const fab = document.querySelector(".mobile-sheet-fab");
    const profileBtn = document.getElementById("mobileProfileBtn");
    const profileAvatar = document.getElementById("mobileProfileAvatar");
    const mapSizeBtn = document.getElementById("mobileMapSizeBtn");
    const accountEmail = document.getElementById("accountEmail");
    const mapArea = document.querySelector(".map-area");
    const tripsTab = document.getElementById("tripsTabBtn");
    const achievementsTab = document.getElementById("achievementsTabBtn");
    const newTrip = document.getElementById("newTripBtn");
    const mobileTrips = document.getElementById("mobileOpenTripsBtn");
    const mobileAchievements = document.getElementById("mobileOpenAchievementsBtn");
    const mobileNewTrip = document.getElementById("mobileNewTripBtn");
    const mobileBack = document.getElementById("mobileBackToMenuBtn");
    const tripCount = document.getElementById("tripCount");
    const mobileTripCount = document.getElementById("mobileTripCount");
    const cityCount = document.getElementById("cityAchievementCount");
    const roadCount = document.getElementById("roadAchievementCount");
    const iconicCount = document.getElementById("iconicAchievementCount");
    const mobileAchievementCount = document.getElementById("mobileAchievementCount");

    if (!app || !toggle) return;

    function setMode(mode) {
      app.classList.toggle("mobile-panel-home", mode === "home");
      app.classList.toggle("mobile-panel-detail", mode === "detail");
      if (mode === "home") app.classList.remove("mobile-achievements-home", "mobile-achievements-screen");
      syncFabLabel();
      syncMapSizeButton();
    }

    let panelHistoryActive = false;
    let touchStart = null;

    function openSheet(options = {}) {
      const wasClosed = !toggle.checked;
      if (wasClosed && options.history !== false && window.history?.pushState) {
        window.history.pushState({ minhasViagensPanel: true }, "", window.location.href);
        panelHistoryActive = true;
      }
      toggle.checked = true;
      toggle.dispatchEvent(new Event("change", { bubbles: true }));
      syncMapSizeButton();
      window.dispatchEvent(new Event("resize"));
    }

    function closeSheet(options = {}) {
      if (!toggle.checked) return;
      toggle.checked = false;
      toggle.dispatchEvent(new Event("change", { bubbles: true }));
      app.classList.remove("mobile-map-expanded", "mobile-achievements-home", "mobile-achievements-screen");
      syncMapSizeButton();
      window.dispatchEvent(new Event("resize"));
      if (panelHistoryActive && !options.fromHistory) {
        panelHistoryActive = false;
        window.history?.back?.();
      }
    }

    function isHomePanelOpen() {
      return toggle.checked && app.classList.contains("mobile-panel-home");
    }

    function syncMapSizeButton() {
      if (!mapSizeBtn) return;
      const expanded = app.classList.contains("mobile-map-expanded");
      const open = toggle.checked;
      mapSizeBtn.hidden = !open;
      mapSizeBtn.setAttribute("aria-pressed", String(expanded));
      mapSizeBtn.setAttribute("aria-label", expanded ? "Minimizar mapa" : "Maximizar mapa");
    }

    function toggleMapSize() {
      app.classList.toggle("mobile-map-expanded");
      syncMapSizeButton();
      window.dispatchEvent(new Event("resize"));
    }

    function setAchievementsHome(active) {
      app.classList.toggle("mobile-achievements-home", Boolean(active));
      app.classList.toggle("mobile-achievements-screen", !active && app.classList.contains("mobile-panel-detail"));
      enhanceAchievementScreens();
    }

    function syncFabLabel() {
      const expanded = toggle.checked;
      const detailMode = app.classList.contains("mobile-panel-detail");
      const state = !expanded ? "closed" : detailMode ? "detail" : "home";
      toggle.setAttribute("aria-expanded", String(expanded));
      if (fab) {
        fab.dataset.mobileState = state;
        fab.setAttribute("aria-label", !expanded ? "Abrir menu principal" : detailMode ? "Voltar ao menu principal" : "Recolher menu principal");
      }
    }

    function initialsFromEmail(value) {
      const text = String(value || "").trim();
      if (!text) return "MV";
      const local = text.split("@")[0].replace(/[._-]+/g, " ").trim();
      const parts = local.split(/\s+/).filter(Boolean);
      if (!parts.length) return text.slice(0, 2).toUpperCase();
      return parts.slice(0, 2).map(part => part[0]).join("").toUpperCase();
    }

    function syncProfileAvatar() {
      if (!profileAvatar) return;
      const user = window.MinhasViagensAuth?.getUser?.();
      const avatarUrl = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || "";
      if (avatarUrl) {
        profileAvatar.textContent = "";
        profileAvatar.classList.add("has-image");
        profileAvatar.style.backgroundImage = `url("${avatarUrl}")`;
        return;
      }
      profileAvatar.classList.remove("has-image");
      profileAvatar.style.backgroundImage = "";
      profileAvatar.textContent = initialsFromEmail(accountEmail?.textContent || user?.email || "");
    }

    function openTrips() {
      tripsTab?.click();
      setMode("detail");
      openSheet();
    }

    function openAchievements() {
      achievementsTab?.click();
      setMode("detail");
      setAchievementsHome(true);
      openSheet();
    }

    function openNewTripDialog() {
      closeSheet();
      newTrip?.click();
    }

    function updateCounts() {
      if (mobileTripCount && tripCount) mobileTripCount.textContent = tripCount.textContent.trim() || "0";
      enhanceAchievementScreens();
      if (mobileAchievementCount) {
        const total = [cityCount, roadCount, iconicCount]
          .map(node => Number.parseInt(node?.textContent || "0", 10) || 0)
          .reduce((sum, value) => sum + value, 0);
        mobileAchievementCount.textContent = String(total);
      }
    }

    setMode("home");
    syncFabLabel();
    updateCounts();
    syncProfileAvatar();

    toggle.addEventListener("change", () => {
      syncFabLabel();
      syncMapSizeButton();
      if (toggle.checked && !app.classList.contains("mobile-panel-detail")) setMode("home");
      if (!toggle.checked) app.classList.remove("mobile-map-expanded");
    });

    profileBtn?.addEventListener("click", () => {
      setMode("home");
      openSheet();
    });

    mapArea?.addEventListener("click", () => {
      if (isHomePanelOpen()) closeSheet();
    });

    window.addEventListener("popstate", () => {
      if (toggle.checked) {
        panelHistoryActive = false;
        closeSheet({ fromHistory: true });
      }
    });

    window.addEventListener("touchstart", event => {
      const touch = event.touches?.[0];
      touchStart = touch ? { x: touch.clientX, y: touch.clientY } : null;
    }, { passive: true });

    window.addEventListener("touchend", event => {
      if (!touchStart || !toggle.checked) return;
      const touch = event.changedTouches?.[0];
      if (!touch) return;
      const dx = touch.clientX - touchStart.x;
      const dy = touch.clientY - touchStart.y;
      touchStart = null;
      if (dx > 80 && Math.abs(dy) < 60) closeSheet();
    }, { passive: true });

    fab?.addEventListener("click", event => {
      event.preventDefault();
      if (!toggle.checked) {
        setMode("home");
        openSheet();
        return;
      }
      if (app.classList.contains("mobile-panel-detail")) {
        setMode("home");
        openSheet();
        return;
      }
      closeSheet();
    });

    mobileTrips?.addEventListener("click", openTrips);
    mobileAchievements?.addEventListener("click", openAchievements);
    mobileNewTrip?.addEventListener("click", openNewTripDialog);
    mapSizeBtn?.addEventListener("click", toggleMapSize);
    mobileBack?.addEventListener("click", () => {
      if (app.classList.contains("mobile-achievements-screen")) {
        setAchievementsHome(true);
        return;
      }
      setMode("home");
    });
    tripsTab?.addEventListener("click", () => {
      setMode("detail");
      app.classList.remove("mobile-achievements-home", "mobile-achievements-screen");
    });
    achievementsTab?.addEventListener("click", () => {
      setMode("detail");
      setAchievementsHome(true);
    });
    newTrip?.addEventListener("click", closeSheet);

    function activateAchievementScreen(kind) {
      const tab = kind === "roads" ? document.getElementById("roadAchievementsTabBtn")
        : kind === "iconic" ? document.getElementById("iconicAchievementsTabBtn")
        : document.getElementById("cityAchievementsTabBtn");
      tab?.click();
      setAchievementsHome(false);
      enhanceAchievementScreens();
    }

    function enhanceAchievementScreens() {
      const panel = document.getElementById("achievementsPanel");
      const summary = panel?.querySelector(".achievement-summary");
      const cityHeader = document.getElementById("cityAchievementHeader");
      const cityList = document.getElementById("cityAchievementList");
      if (!panel) return;

      summary?.querySelectorAll(":scope > div").forEach((card, index) => {
        if (card.dataset.mobileBound) return;
        card.dataset.mobileBound = "true";
        card.setAttribute("role", "button");
        card.tabIndex = 0;
        const open = () => activateAchievementScreen(index === 1 ? "roads" : index === 2 ? "iconic" : "cities");
        card.addEventListener("click", open);
        card.addEventListener("keydown", event => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            open();
          }
        });
      });

      if (cityHeader && cityList) {
        cityHeader.querySelectorAll(".mobile-city-screen-header, .mobile-city-toggle, .mobile-section-kicker").forEach(node => node.remove());
        const nativeBack = cityHeader.querySelector(".achievement-back-btn");
        const nativeTitle = cityHeader.querySelector(".achievement-browser-title h2")?.textContent?.trim() || "Cidades";
        const nativeCount = cityHeader.querySelector(".achievement-browser-title span")?.textContent?.trim() || (document.getElementById("cityAchievementCount")?.textContent || "0");
        const isStateDetail = Boolean(nativeBack);
        const titleText = isStateDetail ? nativeTitle : "Cidades";
        const countText = isStateDetail ? nativeCount.replace(/\D+/g, "") || nativeCount : (document.getElementById("cityAchievementCount")?.textContent || "0");
        const head = document.createElement("div");
        head.className = "mobile-city-screen-header";
        head.innerHTML = `
          <button type="button" class="mobile-city-back" aria-label="Voltar">←</button>
          <strong>${titleText}</strong>
          <span>${countText}</span>`;
        head.querySelector("button")?.addEventListener("click", () => {
          if (nativeBack) nativeBack.click();
          else setAchievementsHome(true);
        });
        cityHeader.prepend(head);
        if (!isStateDetail) {
          const toggleWrap = document.createElement("div");
          toggleWrap.className = "mobile-city-toggle";
          toggleWrap.innerHTML = '<button type="button" class="active">Destinos</button><button type="button">Cruzadas</button>';
          cityHeader.appendChild(toggleWrap);
        }
        const kicker = document.createElement("div");
        kicker.className = "mobile-section-kicker";
        kicker.textContent = isStateDetail ? `Destinos em ${titleText}` : "Brasil · Estados";
        cityHeader.appendChild(kicker);
      }
    }

    document.addEventListener("click", event => {
      if (event.target.closest("#cityAchievementsTabBtn, #roadAchievementsTabBtn, #iconicAchievementsTabBtn")) {
        setAchievementsHome(false);
      }
    });

    const achievementPanelObserver = new MutationObserver(enhanceAchievementScreens);
    const achievementPanel = document.getElementById("achievementsPanel");
    if (achievementPanel) achievementPanelObserver.observe(achievementPanel, { childList: true, subtree: true, characterData: true });
    enhanceAchievementScreens();

    document.getElementById("tripList")?.addEventListener("click", event => {
      if (event.target.closest(".trip-name-btn")) setMode("detail");
    });

    const observer = new MutationObserver(updateCounts);
    [tripCount, cityCount, roadCount, iconicCount].forEach(node => {
      if (node) observer.observe(node, { childList: true, characterData: true, subtree: true });
    });

    if (accountEmail) {
      new MutationObserver(syncProfileAvatar).observe(accountEmail, { childList: true, characterData: true, subtree: true });
    }
    window.addEventListener("mv-auth-ready", syncProfileAvatar);
    syncMapSizeButton();
  });
})();
