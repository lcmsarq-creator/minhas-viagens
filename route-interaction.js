(() => {
  "use strict";

  const HIT_OPACITY = .01;

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

  globalThis.MinhasViagensRouteInteraction = Object.freeze({
    HIT_OPACITY,
    hitLineOptions
  });
})();
