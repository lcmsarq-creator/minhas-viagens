((root, factory) => {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MinhasViagensIconicCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  "use strict";

  const LONG_ROUTE_GOLD_PERCENT = 85;
  const FEDERAL_GOLD_PERCENT = 85;
  const OTHER_ROAD_SILVER_PERCENT = 90;
  const DEFAULT_MIN_CONTINUOUS_KM = 2;

  function normalizeRoadLabel(value) {
    return String(value || "").toUpperCase().replace(/[–—]/g, "-").replace(/\s+/g, "").trim();
  }

  function roadPrefix(label) {
    return normalizeRoadLabel(label).match(/^([A-Z]{2,4})-?\d/)?.[1] || "";
  }

  function routeAchievement(route, progress) {
    const percent = Math.max(0, Math.min(100, Number(progress?.percent) || 0));
    const longestContinuousKm = Math.max(0, Number(progress?.longestContinuousKm) || 0);
    const minContinuousKm = Math.max(0, Number(route?.minContinuousKm) || DEFAULT_MIN_CONTINUOUS_KM);
    const discovered = longestContinuousKm >= minContinuousKm;
    const completed = route?.long === true
      ? percent >= (Number(route?.completionPercent) || LONG_ROUTE_GOLD_PERCENT)
      : discovered;
    return { discovered, completed, percent, longestContinuousKm };
  }

  function roadMedal(label, percent, hasIconicAchievement = false) {
    const coverage = Math.max(0, Math.min(100, Number(percent) || 0));
    if (hasIconicAchievement) return "gold";
    if (roadPrefix(label) === "BR") return coverage >= FEDERAL_GOLD_PERCENT ? "gold" : "";
    return coverage >= OTHER_ROAD_SILVER_PERCENT ? "silver" : "";
  }

  function longestLineKm(lines, lengthKm) {
    if (typeof lengthKm !== "function") return 0;
    return (lines || []).reduce((longest, line) => {
      if (!Array.isArray(line) || line.length < 2) return longest;
      return Math.max(longest, Number(lengthKm(line)) || 0);
    }, 0);
  }

  return Object.freeze({
    LONG_ROUTE_GOLD_PERCENT,
    FEDERAL_GOLD_PERCENT,
    OTHER_ROAD_SILVER_PERCENT,
    DEFAULT_MIN_CONTINUOUS_KM,
    normalizeRoadLabel,
    roadPrefix,
    routeAchievement,
    roadMedal,
    longestLineKm
  });
});
