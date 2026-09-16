((root, factory) => {
  "use strict";

  const catalog = factory();
  if (typeof module === "object" && module.exports) module.exports = catalog;
  root.MinhasViagensIconicCatalog = catalog;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  "use strict";

  const path = id => `iconic-routes/v1/${id}.json`;
  const route = (id, name, category, region, options = {}) => Object.freeze({
    id,
    name,
    category,
    region,
    geometryPath: path(id),
    roadRefs: Object.freeze(options.roadRefs || []),
    long: options.long === true,
    completionPercent: options.long === true ? 85 : undefined,
    minContinuousKm: Number(options.minContinuousKm) || 2,
    family: options.family || "",
    officialAndAlternative: options.officialAndAlternative === true,
    sourceName: options.sourceName || "OpenStreetMap",
    sourceUrl: options.sourceUrl || "https://www.openstreetmap.org/copyright",
    note: options.note || "",
    previewTraveledOnly: options.previewTraveledOnly === true,
    emblemKey: options.emblemKey || ""
  });

  const routes = [
    route("estrada-real-caminho-dos-diamantes", "Estrada Real — Caminho dos Diamantes", "Histórica", "Minas Gerais", {
      family: "Estrada Real", long: true, officialAndAlternative: true,
      sourceName: "Instituto Estrada Real",
      sourceUrl: "https://institutoestradareal.com.br/roteiros-planilhados/caminho-dos-diamantes/"
    }),
    route("estrada-real-caminho-novo", "Estrada Real — Caminho Novo", "Histórica", "MG e RJ", {
      family: "Estrada Real", long: true, officialAndAlternative: true,
      sourceName: "Instituto Estrada Real",
      sourceUrl: "https://institutoestradareal.com.br/roteiros-planilhados/caminho-novo/"
    }),
    route("estrada-real-caminho-velho", "Estrada Real — Caminho Velho", "Histórica", "MG, SP e RJ", {
      family: "Estrada Real", long: true, officialAndAlternative: true,
      sourceName: "Instituto Estrada Real",
      sourceUrl: "https://institutoestradareal.com.br/roteiros-planilhados/caminho-velho/"
    }),
    route("estrada-real-caminho-de-sabarabucu", "Estrada Real — Caminho de Sabarabuçu", "Histórica", "Minas Gerais", {
      family: "Estrada Real", long: true, officialAndAlternative: true,
      sourceName: "Instituto Estrada Real",
      sourceUrl: "https://institutoestradareal.com.br/roteiros-planilhados/caminho-do-sabarabucu/"
    }),
    route("estrada-da-graciosa", "Estrada da Graciosa", "Cênica", "Paraná", { roadRefs: ["PR-410"] }),
    route("serra-do-corvo-branco", "Serra do Corvo Branco", "Serra", "Santa Catarina", { roadRefs: ["SC-370"] }),
    route("serra-dona-francisca", "Serra Dona Francisca", "Serra", "Santa Catarina", { roadRefs: ["SC-418"] }),
    route("serra-do-rio-do-rastro", "Serra do Rio do Rastro", "Serra", "Santa Catarina", { roadRefs: ["SC-390"] }),
    route("serra-da-rocinha", "Serra da Rocinha", "Serra", "SC e RS", { roadRefs: ["BR-285"] }),
    route("rota-do-sol", "Rota do Sol", "Cênica", "Rio Grande do Sul", { long: true, roadRefs: ["RSC-453", "ERS-486"] }),
    route("serra-da-macaca", "Serra da Macaca — Estrada Parque Carlos Botelho", "Estrada-parque", "São Paulo", { roadRefs: ["SP-139"] }),
    route("estrada-parque-pantanal", "Estrada Parque Pantanal", "Estrada-parque", "Mato Grosso do Sul", { long: true, roadRefs: ["MS-184", "MS-228"] }),
    route("rio-santos", "Rio–Santos", "Litorânea", "SP e RJ", { long: true, roadRefs: ["BR-101", "SP-055"] }),
    route("caminhos-de-pedra", "Caminhos de Pedra", "Cultural", "Rio Grande do Sul"),
    route("rota-romantica", "Rota Romântica", "Turística", "Rio Grande do Sul", { long: true, roadRefs: ["BR-116", "ERS-235"] }),
    route("estrada-do-pacifico", "Estrada do Pacífico", "Internacional", "Acre", { long: true, roadRefs: ["BR-317"] }),
    route("via-panamericana", "Via Panamericana", "Internacional", "México → Buenos Aires", {
      family: "Via Panamericana", long: true, previewTraveledOnly: true, emblemKey: "via-panam",
      sourceName: "OpenStreetMap Wiki",
      sourceUrl: "https://wiki.openstreetmap.org/wiki/Pan-American_Highway",
      note: "Eixo principal latino-americano em dois trechos separados pelo Tapón del Darién. Ramais para Quellón e Ushuaia ficam fora deste recorte inicial."
    }),
    route("carretera-austral", "Carretera Austral", "Cênica", "Chile — Puerto Montt → Villa O’Higgins", {
      family: "Carretera Austral", long: true, roadRefs: ["INT:CL:CH:7"], previewTraveledOnly: true,
      sourceName: "Dirección de Vialidad · MOP Chile",
      sourceUrl: "https://vialidad.mop.gob.cl/2024/12/30/el-director-nacional-de-vialidad-del-mop-horacio-pfeiffer-firmo-la-declaratoria-que-define-a-la-carretera-austral-como-ruta-escenica/",
      note: "Ruta 7 / Longitudinal Austral; inclui as conexões marítimas que fazem parte da travessia."
    }),
    route("br-319-manaus-porto-velho", "BR-319 — Manaus–Porto Velho", "Aventura", "AM e RO", {
      long: true, roadRefs: ["BR-319"],
      note: "A Transamazônica é a BR-230; este recorte segue a BR-319 informada na lista."
    }),
    route("caminho-da-fe", "Caminho da Fé", "Peregrinação", "MG e SP", { long: true }),
    route("rota-das-missoes", "Rota das Missões", "Histórica", "Rio Grande do Sul", { long: true }),
    route("caminho-dos-canions", "Caminho dos Cânions", "Cênica", "SC e RS", { long: true }),
    route("caminho-do-ceu-canastra", "Caminho do Céu — Canastra", "4x4", "Minas Gerais", { long: true }),
    route("serra-branca-canastra", "Serra Branca — Canastra", "4x4", "Minas Gerais"),
    route("corredor-chapada-dos-veadeiros", "Corredor da Chapada dos Veadeiros", "Cênica", "Goiás", { long: true, roadRefs: ["GO-118"] }),
    route("serra-do-tepequem", "Serra do Tepequém", "Serra", "Roraima", { roadRefs: ["RR-203"] }),
    route("rastro-da-serpente", "Rastro da Serpente", "Mototurismo", "SP e PR", { long: true, roadRefs: ["SP-250", "BR-476"] }),
    route("circuito-das-aguas-paulista", "Circuito das Águas Paulista", "Circuito", "São Paulo", { long: true, sourceName: "Circuito das Águas Paulista", sourceUrl: "https://www.circuitodasaguaspaulista.sp.gov.br/" }),
    route("rota-do-vinho-sao-roque", "Rota do Vinho — São Roque", "Enoturismo", "São Paulo"),
    route("vale-europeu", "Vale Europeu", "Circuito", "Santa Catarina", { long: true }),
    route("estrada-parque-da-serra", "Estrada Parque da Serra — Ilhéus–Itacaré", "Estrada-parque", "Bahia", { roadRefs: ["BA-001"] }),
    route("costa-dourada", "Costa Dourada — Mucuri", "Litorânea", "Bahia")
  ];

  return Object.freeze({
    version: "1.1.0",
    familyCount: 29,
    routeCount: routes.length,
    routes: Object.freeze(routes)
  });
});
