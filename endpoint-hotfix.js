(() => {
  "use strict";

  function removeTripEndpointMarkers() {
    if (typeof tripLayers === "undefined" || !tripLayers?.eachLayer) return;
    const toRemove = [];
    tripLayers.eachLayer(layer => {
      if (layer instanceof L.CircleMarker) toRemove.push(layer);
    });
    toRemove.forEach(layer => tripLayers.removeLayer(layer));
  }

  if (typeof renderTrips === "function") {
    const previousRenderTrips = renderTrips;
    renderTrips = function renderTripsWithoutEndpointMarkers() {
      previousRenderTrips();
      removeTripEndpointMarkers();
    };
  }

  removeTripEndpointMarkers();
})();
