const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");

const campingFeature = {
  type: "Feature",
  properties: {
    osm_type: "N",
    osm_id: 9711271422,
    osm_key: "tourism",
    osm_value: "camp_site",
    name: "Camping Cocão",
    city: "São João Batista do Glória",
    state: "Minas Gerais",
    country: "Brasil",
    countrycode: "BR"
  },
  geometry: { type: "Point", coordinates: [-46.5113182, -20.5213911] }
};

function segmentDistance(point, a, b) {
  const latScale = 111.32;
  const lngScale = Math.cos(point[0] * Math.PI / 180) * 111.32;
  const px = point[1] * lngScale, py = point[0] * latScale;
  const ax = a[1] * lngScale, ay = a[0] * latScale;
  const bx = b[1] * lngScale, by = b[0] * latScale;
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function fixture() {
  const municipalityResult = {
    id: "br-3162203",
    name: "São João Batista do Glória",
    latitude: -20.64139,
    longitude: -46.50556,
    admin1: "Minas Gerais",
    country: "Brasil",
    country_code: "BR",
    feature_code: "PPLA"
  };
  const ordinaryCity = {
    id: "br-3549805", name: "São José do Rio Preto", latitude: -20.8113, longitude: -49.3758,
    admin1: "São Paulo", country: "Brasil", country_code: "BR", feature_code: "PPLA"
  };
  const context = {
    console,
    URL,
    Response,
    DOMException,
    location: { href: "https://example.test/app/" },
    document: { querySelector: () => null },
    pointSegmentDistanceKm: segmentDistance,
    tripLatLngs: trip => trip.route || [],
    placeFromCityResult: result => ({
      label: `${result.name}, ${result.admin1}, ${result.country}`,
      city: result.name,
      region: result.admin1,
      country: result.country,
      countryCode: result.country_code,
      lat: Number(result.latitude),
      lng: Number(result.longitude),
      geonamesId: result.id
    }),
    cityConquestsForTrip: trip => [trip.startPlace, ...(trip.stopPlaces || []), trip.endPlace]
      .filter(Boolean)
      .map(place => ({ label: place.label, city: place.city, region: place.region, country: place.country, countryCode: place.countryCode }))
  };
  context.window = context;
  context.fetch = async input => {
    const url = String(input);
    const result = url.includes("S%C3%A3o%20Jo%C3%A3o") ? municipalityResult : ordinaryCity;
    return new Response(JSON.stringify({ results: [result] }), { status: 200 });
  };
  context.__mvNativeFetch = async input => {
    assert.match(String(input), /photon\.komoot\.io/);
    return new Response(JSON.stringify({ type: "FeatureCollection", features: [campingFeature] }), { status: 200 });
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("place-search-hotfix.js", "utf8"), context);
  return { context, ordinaryCity };
}

test("Camping Cocão aparece junto das sugestões de destino", async () => {
  const { context } = fixture();
  const response = await context.fetch("https://geocoding-api.open-meteo.com/v1/search?name=Camping%20Cocao&count=10");
  const data = await response.json();
  assert.equal(data.results[0].name, "Camping Cocão");
  assert.equal(data.results[0]._mvPlaceType, "destination");
  assert.equal(data.results[0]._mvMunicipality.city, "São João Batista do Glória");
});

test("destino guarda o local e o município separadamente", async () => {
  const { context } = fixture();
  const results = await context.MinhasViagensPlaceSearch.searchDestinations("Camping Cocao");
  const place = context.placeFromCityResult(results[0]);
  assert.equal(place.city, "Camping Cocão");
  assert.equal(place.placeType, "destination");
  assert.equal(place.municipality.city, "São João Batista do Glória");
  assert.match(place.label, /Camping Cocão, São João Batista do Glória/);
});

test("município só é conquistado quando a rota passa pelo núcleo urbano", async () => {
  const { context, ordinaryCity } = fixture();
  const results = await context.MinhasViagensPlaceSearch.searchDestinations("Camping Cocao");
  const destination = context.placeFromCityResult(results[0]);
  const start = context.placeFromCityResult(ordinaryCity);

  const passesCity = context.cityConquestsForTrip({
    startPlace: start,
    stopPlaces: [],
    endPlace: destination,
    route: [[-20.8, -49.3], [-20.641, -46.506], [-20.521, -46.511]]
  });
  assert.deepEqual(Array.from(passesCity, item => item.city), ["São José do Rio Preto", "São João Batista do Glória"]);

  const avoidsCity = context.cityConquestsForTrip({
    startPlace: start,
    stopPlaces: [],
    endPlace: destination,
    route: [[-20.3, -47.0], [-20.45, -46.7], [-20.521, -46.511]]
  });
  assert.deepEqual(Array.from(avoidsCity, item => item.city), ["São José do Rio Preto"]);
});
