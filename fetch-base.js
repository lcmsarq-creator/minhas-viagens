(() => {
  "use strict";
  if (!window.__mvNativeFetch) window.__mvNativeFetch = window.fetch.bind(window);

  const bridgeTimer = window.setInterval(() => {
    try {
      if (typeof state === "undefined" || typeof els === "undefined") return;
      if (!window.state) window.state = state;
      if (!window.els) window.els = els;
      window.clearInterval(bridgeTimer);
    } catch (_) {}
  }, 50);

  if (!document.querySelector('script[data-mv-achievement-organization]')) {
    const script = document.createElement("script");
    script.dataset.mvAchievementOrganization = "true";
    script.async = true;
    script.src = `achievement-organization-hotfix.js?v=${encodeURIComponent(window.MINHAS_VIAGENS_APP_VERSION || "0.14.8")}`;
    document.head.appendChild(script);
  }
})();
