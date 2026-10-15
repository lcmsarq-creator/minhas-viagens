(function () {
  "use strict";

  const gate = document.getElementById("authGate");
  const loading = document.getElementById("authLoading");
  const panel = document.getElementById("authPanel");
  const form = document.getElementById("authForm");
  const emailInput = document.getElementById("authEmail");
  const passwordInput = document.getElementById("authPassword");
  const submit = document.getElementById("authSubmit");
  const resetBtn = document.getElementById("authResetBtn");
  const recoveryForm = document.getElementById("passwordRecoveryForm");
  const recoveryPassword = document.getElementById("recoveryPassword");
  const recoveryConfirm = document.getElementById("recoveryPasswordConfirm");
  const recoverySubmit = document.getElementById("recoverySubmit");
  const status = document.getElementById("authStatus");
  const application = document.getElementById("application");
  const accountEmail = document.getElementById("accountEmail");
  const signOut = document.getElementById("signOutBtn");
  const config = window.MINHAS_VIAGENS_CONFIG || {};

  const APP_VERSION = window.MINHAS_VIAGENS_APP_VERSION || "0.15.23";
  const APP_URL = "https://lcmsarq-creator.github.io/minhas-viagens/";

  let client = null;
  let currentSession = null;
  let localMode = false;
  let appLoadPromise = null;
  let recoveryMode = false;

  window.MinhasViagensAuth = {
    getClient: () => client,
    getSession: () => currentSession,
    getUser: () => currentSession?.user || null
  };

  function configured() {
    return /^https:\/\/.+\.supabase\.co\/?$/i.test(config.supabaseUrl || "") &&
      Boolean(config.supabaseAnonKey) &&
      !/\.\.\.|placeholder|service_role/i.test(config.supabaseAnonKey);
  }

  function setStatus(message, type = "") {
    status.textContent = message;
    status.className = `auth-status ${type}`.trim();
  }

  function showLogin(message = "", type = "") {
    recoveryMode = false;
    loading.classList.add("hidden");
    panel.classList.remove("hidden");
    form.classList.remove("hidden");
    recoveryForm?.classList.add("hidden");
    gate.classList.remove("hidden");
    application.classList.add("hidden");
    application.setAttribute("aria-hidden", "true");
    accountEmail.textContent = "";
    setStatus(message, type);
  }

  function showPasswordRecovery(message = "Defina uma nova senha para sua conta.") {
    recoveryMode = true;
    loading.classList.add("hidden");
    panel.classList.remove("hidden");
    form.classList.add("hidden");
    recoveryForm?.classList.remove("hidden");
    gate.classList.remove("hidden");
    application.classList.add("hidden");
    application.setAttribute("aria-hidden", "true");
    setStatus(message);
    recoveryPassword?.focus();
  }

  function showStartup(message = "Carregando seu mapa…") {
    panel.classList.add("hidden");
    loading.classList.remove("hidden");
    const copy = loading.querySelector("p");
    if (copy) copy.textContent = message;
    gate.classList.remove("hidden");
    application.classList.add("hidden");
    application.setAttribute("aria-hidden", "true");
  }

  function revealApplication() {
    gate.classList.add("hidden");
    application.classList.remove("hidden");
    application.setAttribute("aria-hidden", "false");
    window.dispatchEvent(new Event("resize"));
    requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  }

  function displayCurrentVersion() {
    const brandCopy = document.querySelector(".brand p");
    if (brandCopy) brandCopy.textContent = brandCopy.textContent.replace(/v\d+\.\d+\.\d+/, `v${APP_VERSION}`);
  }

  function markStartup(stage, detail = "") {
    document.documentElement.dataset.mvStartupStage = stage;
    document.documentElement.dataset.mvStartupDetail = detail;
  }

  function cachedSession() {
    const now = Math.floor(Date.now() / 1000);
    const grace = 30 * 24 * 60 * 60;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !/^sb-.*-auth-token$/.test(key)) continue;
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || "null");
        const candidates = [parsed, parsed?.currentSession, parsed?.session, Array.isArray(parsed) ? parsed[0] : null].filter(Boolean);
        for (const value of candidates) {
          const user = value?.user;
          if (!user?.id) continue;
          const expires = Number(value?.expires_at || 0);
          if (expires && now - expires > grace) continue;
          return { ...value, user };
        }
      } catch {}
    }
    return null;
  }

  async function authServiceReachable() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    try {
      const response = await fetch(config.supabaseUrl.replace(/\/$/, "") + "/auth/v1/health", {
        method: "GET",
        cache: "no-store",
        signal: controller.signal
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  function loadScript(src, attempt = 0) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      let runtimeError = null;
      const expectedPath = new URL(script.src, location.href).pathname;
      const captureRuntimeError = event => {
        if (!event.filename || new URL(event.filename, location.href).pathname !== expectedPath) return;
        runtimeError = event.error || new Error(event.message || `Erro ao executar ${src}`);
      };
      window.addEventListener("error", captureRuntimeError);
      script.onload = () => {
        window.removeEventListener("error", captureRuntimeError);
        if (runtimeError) {
          reject(runtimeError);
          return;
        }
        markStartup("script-loaded", src);
        displayCurrentVersion();
        resolve();
      };
      script.onerror = () => {
        window.removeEventListener("error", captureRuntimeError);
        script.remove();
        if (attempt < 1) {
          const separator = src.includes("?") ? "&" : "?";
          loadScript(`${src}${separator}retry=${Date.now()}`, attempt + 1).then(resolve, reject);
          return;
        }
        reject(new Error(`Falha ao carregar ${src}`));
      };
      document.body.appendChild(script);
    });
  }

  async function ensureLeaflet() {
    if (window.L?.map) return;
    try {
      await loadScript("vendor/leaflet/leaflet.js?v=1.9.4");
    } catch {
      await loadScript("https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js");
    }
    if (!window.L?.map) throw new Error("Biblioteca do mapa indisponível");
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function loadAppScripts() {
    if (appLoadPromise) return appLoadPromise;

    appLoadPromise = (async () => {
      try {
        markStartup("checking-map");
        await ensureLeaflet();

        markStartup("loading-storage");
        await loadScript(`fetch-base.js?v=${APP_VERSION}`);
        await loadScript(`storage-pre.js?v=${APP_VERSION}`);
        await window.MinhasViagensStorageReady;

        markStartup("loading-application");
        window.MINHAS_VIAGENS_CITY_SCANNER_GENERATION = "v0147";

        const sources = [
          "hotfix-pre.js",
          "achievements.js",
          "city-flags.js",
          "route-interaction.js",
          "road-marker-layout.js",
          "road-export-core.js",
          "script.js",
          "geometry-compact-hotfix.js",
          "profile-screen.js",
          "hotfix.js",
          "road-threshold-hotfix.js",
          "secondary-roads-hotfix.js",
          "international-road-shields.js",
          "north-central-road-support.js",
          "road-marker-hotfix.js",
          "ux-hotfix.js",
          "endpoint-hotfix.js",
          "city-search-fast.js",
          "place-search-hotfix.js",
          "edit-dialog-hotfix.js",
          "route-click-hotfix.js",
          "highway-render-hotfix.js",
          "road-progress-core.js",
          "road-network-hotfix.js",
          "road-catalog-hotfix.js",
          "sync.js",
          "road-sweep-hotfix.js",
          "escape-navigation.js",
          "iconic-routes-core.js",
          "iconic-routes-catalog.js",
          "iconic-route-catalog.js",
          "iconic-routes.js",
          "iconic-catalog-preview-hotfix.js",
          "v0142-adjustments.js",
          "crossing-detection-core.js",
          "v0144-crossing-fix.js",
          "v0145-crossed-cities.js",
          "v0146-crossed-cities-runtime.js",
          "v0147-crossed-cities-local.js"
        ];

        for (const src of sources) {
          await loadScript(`${src}?v=${APP_VERSION}`);
          if (src === "script.js" && (!window.MinhasViagensApp || !document.querySelector(".leaflet-map-pane"))) {
            throw new Error("O núcleo do mapa não concluiu a inicialização");
          }
          if (src === "geometry-compact-hotfix.js") {
            window.MinhasViagensApp?.render?.();
          }
          if (src === "iconic-route-catalog.js" && window.MinhasViagensIconicRouteCatalogReady) {
            markStartup("loading-iconic-catalog");
            const loaded = await window.MinhasViagensIconicRouteCatalogReady;
            if (!loaded) console.warn("Catálogo hospedado de rotas icônicas não ficou disponível no startup.");
          }
        }

        if (!localMode && window.MinhasViagensInitialSyncReady) {
          markStartup("loading-trips");
          await Promise.race([
            Promise.resolve(window.MinhasViagensInitialSyncReady).catch(() => undefined),
            wait(5000)
          ]);
          window.MinhasViagensApp?.render?.();
        }

        markStartup("ready");
        displayCurrentVersion();
        return true;
      } catch (error) {
        markStartup("failed", error?.message || String(error));
        console.error("Falha ao carregar o aplicativo", error);
        appLoadPromise = null;
        showLogin("Não foi possível carregar o aplicativo. Atualize a página e tente novamente.", "error");
        throw error;
      }
    })();

    return appLoadPromise;
  }

  async function showApp(session) {
    if (!session) {
      showLogin();
      return;
    }
    currentSession = session;
    accountEmail.textContent = (session.user?.email || "Conta conectada") + (localMode ? " · local" : "");
    window.dispatchEvent(new CustomEvent("mv-auth-ready"));
    showStartup(localMode ? "Abrindo dados salvos neste aparelho…" : "Carregando suas viagens…");
    try {
      await loadAppScripts();
      revealApplication();
    } catch {}
  }

  function enterLocalMode(session) {
    if (!session?.user?.id) return false;
    localMode = true;
    document.documentElement.dataset.mvLocalMode = "true";
    currentSession = session;
    showApp(session);
    return true;
  }

  function authErrorFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const description = params.get("error_description") || hash.get("error_description");
    if (!description) return "";
    history.replaceState({}, document.title, location.pathname);
    return "O link de acesso é inválido ou expirou. Solicite um novo link.";
  }

  async function initialize() {
    const callbackError = authErrorFromUrl();

    if (!configured()) {
      emailInput.disabled = true;
      passwordInput.disabled = true;
      submit.disabled = true;
      showLogin("Supabase ainda não configurado. Preencha Project URL e anon/public key em config.js.", "error");
      return;
    }

    if (!window.supabase?.createClient) {
      const cached = cachedSession();
      if (cached && enterLocalMode(cached)) return;
      showLogin("Não foi possível conectar ao serviço de autenticação. Verifique sua rede e tente novamente.", "error");
      return;
    }

    client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });

    client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        currentSession = session || currentSession;
        showPasswordRecovery();
        return;
      }
      if (recoveryMode) return;
      if (localMode && !session) return;
      currentSession = session || null;
      if (session) {
        localMode = false;
        delete document.documentElement.dataset.mvLocalMode;
        showApp(session);
      } else if (event === "SIGNED_OUT") {
        showLogin("Você saiu da sua conta.");
      }
    });

    try {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      if (recoveryMode) return;
      if (data.session) {
        showApp(data.session);
        return;
      }
      const cached = cachedSession();
      if (cached && !(await authServiceReachable()) && enterLocalMode(cached)) return;
      showLogin(callbackError, callbackError ? "error" : "");
    } catch {
      const cached = cachedSession();
      if (cached && enterLocalMode(cached)) return;
      showLogin("Não foi possível verificar sua sessão. Verifique sua conexão e tente novamente.", "error");
    }
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !emailInput.checkValidity()) {
      setStatus("Informe um endereço de e-mail válido.", "error");
      emailInput.focus();
      return;
    }
    if (!password || password.length < 8) {
      setStatus("Informe sua senha com pelo menos 8 caracteres.", "error");
      passwordInput.focus();
      return;
    }

    submit.disabled = true;
    submit.textContent = "Entrando…";
    setStatus("Verificando sua conta…");
    try {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data?.session) throw new Error("Sessão não criada");
      setStatus("");
    } catch (error) {
      console.error("Falha no login", error);
      setStatus("E-mail ou senha inválidos. Se ainda não definiu uma senha, use a opção abaixo.", "error");
    } finally {
      submit.disabled = false;
      submit.textContent = "Entrar";
    }
  });

  resetBtn?.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    if (!email || !emailInput.checkValidity()) {
      setStatus("Informe seu e-mail para definir ou redefinir a senha.", "error");
      emailInput.focus();
      return;
    }
    resetBtn.disabled = true;
    resetBtn.textContent = "Enviando…";
    try {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: APP_URL });
      if (error) throw error;
      setStatus("Enviamos um link para você definir uma nova senha.", "success");
    } catch (error) {
      console.error("Falha ao solicitar redefinição de senha", error);
      setStatus("Não foi possível enviar o e-mail de redefinição agora.", "error");
    } finally {
      resetBtn.disabled = false;
      resetBtn.textContent = "Definir ou redefinir senha";
    }
  });

  recoveryForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const password = recoveryPassword.value;
    const confirm = recoveryConfirm.value;
    if (password.length < 8) {
      setStatus("Use uma senha com pelo menos 8 caracteres.", "error");
      recoveryPassword.focus();
      return;
    }
    if (password !== confirm) {
      setStatus("As senhas não coincidem.", "error");
      recoveryConfirm.focus();
      return;
    }

    recoverySubmit.disabled = true;
    recoverySubmit.textContent = "Salvando…";
    try {
      const { data, error } = await client.auth.updateUser({ password });
      if (error) throw error;
      recoveryMode = false;
      recoveryForm.reset();
      setStatus("Senha definida com sucesso.", "success");
      const { data: sessionData } = await client.auth.getSession();
      if (sessionData?.session) await showApp(sessionData.session);
      else showLogin("Senha definida. Entre com seu e-mail e a nova senha.", "success");
    } catch (error) {
      console.error("Falha ao definir nova senha", error);
      setStatus("Não foi possível salvar a nova senha.", "error");
    } finally {
      recoverySubmit.disabled = false;
      recoverySubmit.textContent = "Salvar nova senha";
    }
  });

  signOut.addEventListener("click", async () => {
    signOut.disabled = true;
    try {
      if (localMode) {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && /^sb-.*-auth-token$/.test(key)) keys.push(key);
        }
        keys.forEach(key => localStorage.removeItem(key));
        currentSession = null;
        localMode = false;
        window.location.reload();
        return;
      }
      const { error } = await client.auth.signOut();
      if (error) throw error;
      currentSession = null;
      window.location.reload();
    } catch {
      setStatus("Não foi possível sair. Verifique sua conexão e tente novamente.", "error");
      panel.classList.remove("hidden");
      gate.classList.remove("hidden");
    } finally {
      signOut.disabled = false;
    }
  });

  initialize();
})();
