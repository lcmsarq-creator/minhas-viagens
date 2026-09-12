(function () {
  "use strict";

  const gate = document.getElementById("authGate");
  const loading = document.getElementById("authLoading");
  const panel = document.getElementById("authPanel");
  const form = document.getElementById("authForm");
  const emailInput = document.getElementById("authEmail");
  const submit = document.getElementById("authSubmit");
  const status = document.getElementById("authStatus");
  const application = document.getElementById("application");
  const accountEmail = document.getElementById("accountEmail");
  const signOut = document.getElementById("signOutBtn");
  const config = window.MINHAS_VIAGENS_CONFIG || {};
  let client = null;
  let currentSession = null;
  let appLoaded = false;

  window.MinhasViagensAuth = {
    getClient: () => client,
    getSession: () => currentSession,
    getUser: () => currentSession?.user || null
  };

  function configured() {
    return /^https:\/\/.+\.supabase\.co\/?$/i.test(config.supabaseUrl || "") &&
      Boolean(config.supabaseAnonKey) && !/\.\.\.|placeholder|service_role/i.test(config.supabaseAnonKey);
  }

  function setStatus(message, type = "") {
    status.textContent = message;
    status.className = `auth-status ${type}`.trim();
  }

  function showLogin(message = "", type = "") {
    loading.classList.add("hidden");
    panel.classList.remove("hidden");
    gate.classList.remove("hidden");
    application.classList.add("hidden");
    application.setAttribute("aria-hidden", "true");
    accountEmail.textContent = "";
    setStatus(message, type);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.body.appendChild(script);
    });
  }

  async function loadAppScripts() {
    if (appLoaded) return;
    appLoaded = true;
    try {
      await loadScript("storage-pre.js?v=0.10.0");
      await window.MinhasViagensStorageReady;
      const sources = [
        "hotfix-pre.js?v=0.10.0",
        "script.js?v=0.10.0",
        "hotfix.js?v=0.10.0",
        "ux-hotfix.js?v=0.10.0",
        "sync.js?v=0.10.0"
      ];
      for (const src of sources) await loadScript(src);
    } catch (error) {
      console.error("Falha ao carregar o aplicativo", error);
      showLogin("Não foi possível carregar o aplicativo. Atualize a página e tente novamente.", "error");
    }
  }

  function showApp(session) {
    if (!session) return showLogin();
    currentSession = session;
    accountEmail.textContent = session.user?.email || "Conta conectada";
    gate.classList.add("hidden");
    application.classList.remove("hidden");
    application.setAttribute("aria-hidden", "false");
    loadAppScripts();
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
      submit.disabled = true;
      showLogin("Supabase ainda não configurado. Preencha Project URL e anon/public key em config.js.", "error");
      return;
    }
    if (!window.supabase?.createClient) {
      showLogin("Não foi possível conectar ao serviço de autenticação. Verifique sua rede e tente novamente.", "error");
      return;
    }

    client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    client.auth.onAuthStateChange((event, session) => {
      currentSession = session || null;
      if (session) showApp(session);
      else if (event === "SIGNED_OUT" || event === "TOKEN_REFRESHED") {
        showLogin(event === "TOKEN_REFRESHED" ? "Sua sessão expirou. Solicite um novo link de acesso." : "Você saiu da sua conta.");
      }
    });

    try {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      if (data.session) showApp(data.session);
      else showLogin(callbackError, callbackError ? "error" : "");
    } catch {
      showLogin("Não foi possível verificar sua sessão. Verifique sua conexão e tente novamente.", "error");
    }
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const email = emailInput.value.trim();
    if (!email || !emailInput.checkValidity()) {
      setStatus("Informe um endereço de e-mail válido.", "error");
      emailInput.focus();
      return;
    }
    submit.disabled = true;
    submit.textContent = "Enviando…";
    setStatus("Enviando link de acesso…");
    try {
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: "https://lcmsarq-creator.github.io/minhas-viagens/" }
      });
      if (error) throw error;
      setStatus("Enviamos um link de acesso para seu e-mail.", "success");
      form.reset();
    } catch {
      setStatus("Não foi possível enviar o link. Verifique sua conexão e tente novamente.", "error");
    } finally {
      submit.disabled = false;
      submit.textContent = "Enviar link de acesso";
    }
  });

  signOut.addEventListener("click", async () => {
    signOut.disabled = true;
    try {
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
