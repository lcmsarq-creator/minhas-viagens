(function () {
  "use strict";

  const screen = document.getElementById("mobileProfileScreen");
  if (!screen) return;

  const closeBtn = document.getElementById("closeProfileScreenBtn");
  const avatar = document.getElementById("profileAvatarLarge");
  const nameEl = document.getElementById("profileDisplayName");
  const emailEl = document.getElementById("profileEmail");
  const syncEl = document.getElementById("profileSyncState");
  const distanceEl = document.getElementById("profileDistance");
  const recentEl = document.getElementById("profileRecentTrips");
  const passwordForm = document.getElementById("profilePasswordForm");
  const passwordStatus = document.getElementById("profilePasswordStatus");

  function text(value) {
    return String(value || "").trim();
  }

  function initials(value) {
    const local = text(value).split("@")[0].replace(/[._-]+/g, " ").trim();
    const parts = local.split(/\s+/).filter(Boolean);
    return (parts.slice(0, 2).map(part => part[0]).join("") || "MV").toUpperCase();
  }

  function tripPlaces(trip) {
    return [trip?.startPlace, ...(trip?.stopPlaces || []), trip?.endPlace].filter(Boolean);
  }

  function formatKm(value) {
    const km = Number(value) || 0;
    return km.toLocaleString("pt-BR", { maximumFractionDigits: km >= 1000 ? 0 : 1 }) + " km";
  }

  function collectStats() {
    const trips = window.MinhasViagensApp?.getTrips?.() || [];
    const cities = new Set();
    const roads = new Set();
    const states = new Set();
    const countries = new Set();
    let meters = 0;

    for (const trip of trips) {
      if (Number.isFinite(Number(trip?.distance))) meters += Number(trip.distance);
      for (const city of trip?.conquests?.cities || []) {
        const label = text(city?.label || city?.city);
        if (label) cities.add(label.toLocaleLowerCase("pt-BR"));
        const region = text(city?.region);
        const code = text(city?.countryCode).toUpperCase();
        const country = text(city?.country);
        if (region && (code === "BR" || /brasil|brazil/i.test(country))) states.add(region.toLocaleLowerCase("pt-BR"));
      }
      for (const road of trip?.conquests?.roads || []) {
        const label = text(typeof road === "string" ? road : road?.label);
        if (label) roads.add(label.toUpperCase());
      }
      for (const place of tripPlaces(trip)) {
        const country = text(place?.countryCode || place?.country);
        if (country) countries.add(country.toUpperCase());
        const region = text(place?.region);
        const code = text(place?.countryCode).toUpperCase();
        if (region && (code === "BR" || /brasil|brazil/i.test(text(place?.country)))) states.add(region.toLocaleLowerCase("pt-BR"));
      }
    }

    return {
      trips,
      km: meters / 1000,
      cities: cities.size,
      roads: roads.size,
      states: states.size,
      countries: countries.size,
      iconic: Number.parseInt(document.getElementById("iconicAchievementCount")?.textContent || "0", 10) || 0
    };
  }

  function renderRecent(trips) {
    if (!recentEl) return;
    const sorted = [...trips].sort((a, b) => {
      const da = Date.parse(a?.date || a?.updatedAt || a?.createdAt || "") || 0;
      const db = Date.parse(b?.date || b?.updatedAt || b?.createdAt || "") || 0;
      return db - da;
    }).slice(0, 5);

    if (!sorted.length) {
      recentEl.innerHTML = '<p class="empty">Nenhuma viagem cadastrada ainda.</p>';
      return;
    }

    recentEl.innerHTML = sorted.map(trip => {
      const start = text(trip?.startPlace?.city || trip?.startPlace?.label || trip?.startAddress);
      const end = text(trip?.endPlace?.city || trip?.endPlace?.label || trip?.endAddress);
      const route = [start, end].filter(Boolean).join(" → ") || "Rota cadastrada";
      const km = Number.isFinite(Number(trip?.distance)) ? formatKm(Number(trip.distance) / 1000) : "";
      return '<article class="profile-recent-item">' +
        '<strong>' + escapeHtml(text(trip?.name) || "Viagem") + '</strong>' +
        '<small>' + escapeHtml(route) + '</small>' +
        '<b>' + escapeHtml(km) + '</b>' +
      '</article>';
    }).join("");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function refresh() {
    const user = window.MinhasViagensAuth?.getUser?.();
    const email = text(user?.email || document.getElementById("accountEmail")?.textContent).replace(/\s+·\s+local$/, "");
    const displayName = text(user?.user_metadata?.full_name || user?.user_metadata?.name) || email.split("@")[0].replace(/[._-]+/g, " ");
    const avatarUrl = text(user?.user_metadata?.avatar_url || user?.user_metadata?.picture);
    nameEl.textContent = displayName || "Usuário";
    emailEl.textContent = email || "Conta conectada";
    avatar.textContent = avatarUrl ? "" : initials(displayName || email);
    avatar.style.backgroundImage = avatarUrl ? 'url("' + avatarUrl.replaceAll('"', "%22") + '")' : "";
    syncEl.textContent = document.getElementById("syncStatus")?.textContent || "Conta conectada";

    const stats = collectStats();
    distanceEl.textContent = formatKm(stats.km);
    document.getElementById("profileTripStat").textContent = stats.trips.length.toLocaleString("pt-BR");
    document.getElementById("profileCityStat").textContent = stats.cities.toLocaleString("pt-BR");
    document.getElementById("profileRoadStat").textContent = stats.roads.toLocaleString("pt-BR");
    document.getElementById("profileIconicStat").textContent = stats.iconic.toLocaleString("pt-BR");
    document.getElementById("profileStateStat").textContent = stats.states.toLocaleString("pt-BR");
    document.getElementById("profileCountryStat").textContent = stats.countries.toLocaleString("pt-BR");
    renderRecent(stats.trips);
  }

  function open() {
    refresh();
    screen.classList.remove("hidden");
    screen.setAttribute("aria-hidden", "false");
    document.body.classList.add("profile-screen-open");
    history.pushState({ minhasViagensProfile: true }, "", location.href);
  }

  function close(options = {}) {
    if (screen.classList.contains("hidden")) return;
    screen.classList.add("hidden");
    screen.setAttribute("aria-hidden", "true");
    document.body.classList.remove("profile-screen-open");
    if (!options.fromHistory && history.state?.minhasViagensProfile) history.back();
  }

  closeBtn?.addEventListener("click", () => close());
  document.getElementById("profileSyncBtn")?.addEventListener("click", () => {
    document.getElementById("syncNowBtn")?.click();
    setTimeout(refresh, 250);
  });
  document.getElementById("profileSignOutBtn")?.addEventListener("click", () => {
    screen.classList.add("hidden");
    document.getElementById("signOutBtn")?.click();
  });

  passwordForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const password = document.getElementById("profileNewPassword")?.value || "";
    const confirm = document.getElementById("profileConfirmPassword")?.value || "";
    passwordStatus.className = "profile-password-status";
    if (password.length < 8) {
      passwordStatus.textContent = "Use pelo menos 8 caracteres.";
      passwordStatus.classList.add("error");
      return;
    }
    if (password !== confirm) {
      passwordStatus.textContent = "As senhas não coincidem.";
      passwordStatus.classList.add("error");
      return;
    }
    const client = window.MinhasViagensAuth?.getClient?.();
    if (!client || document.documentElement.dataset.mvLocalMode === "true") {
      passwordStatus.textContent = "Conecte-se ao Supabase para alterar a senha.";
      passwordStatus.classList.add("error");
      return;
    }
    const button = passwordForm.querySelector("button[type=submit]");
    button.disabled = true;
    button.textContent = "Salvando…";
    try {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
      passwordForm.reset();
      passwordStatus.textContent = "Senha atualizada.";
      passwordStatus.classList.add("success");
    } catch (error) {
      console.error("Falha ao alterar senha", error);
      passwordStatus.textContent = "Não foi possível alterar a senha agora.";
      passwordStatus.classList.add("error");
    } finally {
      button.disabled = false;
      button.textContent = "Salvar nova senha";
    }
  });

  window.addEventListener("popstate", () => {
    if (!screen.classList.contains("hidden")) {
      window.__mvBackConsumed = true;
      close({ fromHistory: true });
    }
  });

  window.MinhasViagensProfile = { open, close, refresh };
})();
