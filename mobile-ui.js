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
      syncFabLabel();
    }

    function openSheet() {
      toggle.checked = true;
      toggle.dispatchEvent(new Event("change", { bubbles: true }));
      window.dispatchEvent(new Event("resize"));
    }

    function closeSheet() {
      toggle.checked = false;
      toggle.dispatchEvent(new Event("change", { bubbles: true }));
      window.dispatchEvent(new Event("resize"));
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

    function openTrips() {
      tripsTab?.click();
      setMode("detail");
      openSheet();
    }

    function openAchievements() {
      achievementsTab?.click();
      setMode("detail");
      openSheet();
    }

    function openNewTripDialog() {
      closeSheet();
      newTrip?.click();
    }

    function updateCounts() {
      if (mobileTripCount && tripCount) mobileTripCount.textContent = tripCount.textContent.trim() || "0";
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

    toggle.addEventListener("change", () => {
      syncFabLabel();
      if (toggle.checked && !app.classList.contains("mobile-panel-detail")) setMode("home");
    });

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
    mobileBack?.addEventListener("click", () => setMode("home"));
    tripsTab?.addEventListener("click", () => setMode("detail"));
    achievementsTab?.addEventListener("click", () => setMode("detail"));
    newTrip?.addEventListener("click", closeSheet);

    document.getElementById("tripList")?.addEventListener("click", event => {
      if (event.target.closest(".trip-name-btn")) setMode("detail");
    });

    const observer = new MutationObserver(updateCounts);
    [tripCount, cityCount, roadCount, iconicCount].forEach(node => {
      if (node) observer.observe(node, { childList: true, characterData: true, subtree: true });
    });
  });
})();
