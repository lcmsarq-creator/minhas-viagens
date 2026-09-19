(() => {
  "use strict";
  if (!window.__mvNativeFetch) window.__mvNativeFetch = window.fetch.bind(window);
  if (!document.querySelector('script[data-mv-achievement-organization]')) {
    const script = document.createElement("script");
    script.dataset.mvAchievementOrganization = "true";
    script.async = true;
    script.src = `achievement-organization-hotfix.js?v=${encodeURIComponent(window.MINHAS_VIAGENS_APP_VERSION || "0.14.8")}`;
    document.head.appendChild(script);
  }
})();
