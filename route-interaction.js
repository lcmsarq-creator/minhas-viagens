(() => {
  "use strict";

  const HIT_OPACITY = .01;
  const EDIT_HIT_TOLERANCE_PX = 18;

  function hitLineOptions(className, weight = 24, interactive = true) {
    return {
      color: "#000",
      weight,
      opacity: HIT_OPACITY,
      interactive,
      bubblingMouseEvents: false,
      className,
      lineCap: "round",
      lineJoin: "round"
    };
  }

  function configurePassivePane(map, name, zIndex) {
    if (!map?.getPane || !map?.createPane || !name) return null;
    const pane = map.getPane(name) || map.createPane(name);
    pane.style.zIndex = String(zIndex);
    // Essas camadas são apenas visuais. Sem isto, um renderer Canvas permanece
    // sobre o mapa mesmo depois de a rodovia ser fechada e bloqueia as rotas SVG.
    pane.style.pointerEvents = "none";
    return pane;
  }

  function pointSegmentDistance(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
    const nearestX = start.x + t * dx;
    const nearestY = start.y + t * dy;
    return Math.hypot(point.x - nearestX, point.y - nearestY);
  }

  function nearestPolylineDistance(point, line) {
    if (!point || !Array.isArray(line) || line.length < 2) return Infinity;
    let nearest = Infinity;
    for (let index = 1; index < line.length; index += 1) {
      nearest = Math.min(nearest, pointSegmentDistance(point, line[index - 1], line[index]));
    }
    return nearest;
  }

  globalThis.MinhasViagensRouteInteraction = Object.freeze({
    HIT_OPACITY,
    EDIT_HIT_TOLERANCE_PX,
    hitLineOptions,
    configurePassivePane,
    pointSegmentDistance,
    nearestPolylineDistance
  });
})();
