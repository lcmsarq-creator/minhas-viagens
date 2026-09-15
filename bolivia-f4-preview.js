(() => {
  "use strict";

  const APP_VERSION = "0.13.6";
  const mapElement = document.getElementById("preview-map");
  const statusElement = document.getElementById("preview-status");
  const statsElement = document.getElementById("preview-stats");
  const shieldElement = document.getElementById("preview-shield");

  function decodePolyline(encoded, precision = 5) {
    const coordinates = [];
    const factor = 10 ** precision;
    let index = 0;
    let latitude = 0;
    let longitude = 0;

    while (index < encoded.length) {
      let byte;
      let shift = 0;
      let result = 0;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20 && index <= encoded.length);
      latitude += result & 1 ? ~(result >> 1) : result >> 1;

      shift = 0;
      result = 0;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20 && index <= encoded.length);
      longitude += result & 1 ? ~(result >> 1) : result >> 1;
      coordinates.push([latitude / factor, longitude / factor]);
    }
    return coordinates;
  }

  function durationLabel(seconds) {
    const totalMinutes = Math.round(Number(seconds || 0) / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours} h ${String(minutes).padStart(2, "0")} min`;
  }

  function redPinIcon() {
    return L.divIcon({
      className: "",
      html: '<div class="preview-red-pin" aria-hidden="true"></div>',
      iconSize: [25, 30],
      iconAnchor: [12, 28],
      tooltipAnchor: [0, -27]
    });
  }

  function roadShieldIcon(number, shieldApi) {
    return L.divIcon({
      className: "",
      html: `<div class="preview-road-marker">${shieldApi.boliviaShieldMarkup(number, "map")}</div>`,
      iconSize: [55, 52],
      iconAnchor: [28, 26],
      tooltipAnchor: [0, -24]
    });
  }

  async function renderPreview() {
    if (!window.L) throw new Error("O mapa não pôde ser carregado.");
    const layoutApi = window.MinhasViagensRoadMarkerLayout;
    const shieldApi = window.MinhasViagensInternationalRoadShields;
    if (!layoutApi || !shieldApi) throw new Error("Os módulos de rodovia não puderam ser carregados.");

    const response = await fetch(`demo/bolivia-f4-route.json?v=${APP_VERSION}`, { cache: "no-store" });
    if (!response.ok) throw new Error("O recorte da F4 não pôde ser carregado.");
    const demo = await response.json();

    const routeLine = decodePolyline(demo.encodedPolyline, demo.precision);
    if (routeLine.length < 2) throw new Error("A geometria da rota está vazia.");

    const map = L.map(mapElement, {
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    L.polyline(routeLine, {
      color: "#ffffff",
      weight: 10,
      opacity: .94,
      lineJoin: "round",
      lineCap: "round",
      interactive: false
    }).addTo(map);
    L.polyline(routeLine, {
      color: "#2f7252",
      weight: 6,
      opacity: 1,
      lineJoin: "round",
      lineCap: "round",
      interactive: false
    }).addTo(map);

    const start = L.marker([demo.start.lat, demo.start.lng], { icon: redPinIcon(), zIndexOffset: 500 })
      .addTo(map)
      .bindTooltip(`Início · ${demo.start.name}`, { className: "preview-tooltip", direction: "top" });
    const end = L.marker([demo.end.lat, demo.end.lng], { icon: redPinIcon(), zIndexOffset: 500 })
      .addTo(map)
      .bindTooltip(`Fim · ${demo.end.name}`, { className: "preview-tooltip", direction: "top" });

    const timeline = demo.segments.map(segment => ({
      label: shieldApi.boliviaRoadRef(segment.ref, demo.countryCode),
      line: decodePolyline(segment.encodedPolyline, demo.precision)
    }));
    const roadMarkers = layoutApi.markersFromTimeline(timeline, {
      normalizeLabel: label => String(label || "").toUpperCase()
    });

    for (const marker of roadMarkers) {
      const number = String(marker.label).split(":").at(-1);
      L.marker([marker.lat, marker.lng], {
        icon: roadShieldIcon(number, shieldApi),
        zIndexOffset: 800
      }).addTo(map).bindTooltip(`F${number} · ${marker.distanceKm.toFixed(0)} km neste trecho`, {
        className: "preview-tooltip",
        direction: "top"
      });
    }

    map.fitBounds(L.latLngBounds(routeLine), {
      paddingTopLeft: [35, 35],
      paddingBottomRight: [35, 35],
      maxZoom: 10
    });
    start.openTooltip();

    shieldElement.innerHTML = shieldApi.boliviaShieldMarkup("4", "achievement");
    statsElement.textContent = `${demo.distanceKm.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km · ${durationLabel(demo.durationSeconds)}`;
    statusElement.textContent = roadMarkers.length === 1
      ? "O emblema aparece uma vez, no centro do trecho identificado como F4."
      : `A validação encontrou ${roadMarkers.length} emblemas; o esperado para este recorte é 1.`;
    statusElement.classList.toggle("is-error", roadMarkers.length !== 1);
  }

  renderPreview().catch(error => {
    console.error(error);
    statusElement.textContent = error?.message || "Não foi possível montar a demonstração.";
    statusElement.classList.add("is-error");
    statsElement.textContent = "Falha ao carregar";
  });
})();
