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

  const loadOnce = (datasetKey, src) => {
    if (document.querySelector(`script[data-${datasetKey}]`)) return;
    const script = document.createElement("script");
    script.setAttribute(`data-${datasetKey}`, "true");
    script.async = true;
    script.src = `${src}?v=${encodeURIComponent(window.MINHAS_VIAGENS_APP_VERSION || "0.14.8")}`;
    document.head.appendChild(script);
  };

  loadOnce("mv-achievement-organization", "achievement-organization-hotfix.js");
  loadOnce("mv-crossed-city-navigation", "crossed-city-group-navigation-hotfix.js");
})();
