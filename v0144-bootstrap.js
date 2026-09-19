(() => {
  "use strict";
  if (window.MinhasViagensV0144Bootstrap) return;
  window.MinhasViagensV0144Bootstrap = { installed: false, loading: false };
  const version = window.MINHAS_VIAGENS_APP_VERSION || "0.14.4";

  function load(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${src}?v=${encodeURIComponent(version)}`;
      script.async = false;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
      document.body.appendChild(script);
    });
  }

  async function install() {
    if (window.MinhasViagensV0144Bootstrap.installed || window.MinhasViagensV0144Bootstrap.loading) return;
    if (!window.MinhasViagensV0142 || !window.MinhasViagensIconicRoutes || typeof renderAchievements !== "function" || typeof renderTrips !== "function") {
      setTimeout(install, 40);
      return;
    }
    window.MinhasViagensV0144Bootstrap.loading = true;
    try {
      if (!window.MinhasViagensCrossingDetection) await load("crossing-detection-core.js");
      if (!window.MinhasViagensV0144) await load("v0144-crossing-fix.js");
      window.MinhasViagensV0144Bootstrap.installed = Boolean(window.MinhasViagensV0144);
    } catch (error) {
      console.error("Falha ao instalar correções de cruzamentos v0.14.4", error);
      setTimeout(install, 1200);
    } finally {
      window.MinhasViagensV0144Bootstrap.loading = false;
    }
  }

  install();
})();
