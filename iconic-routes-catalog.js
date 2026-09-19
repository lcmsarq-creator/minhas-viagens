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
    emblemKey: options.emblemKey || "",
    emblemCountries: Object.freeze(options.emblemCountries || [])
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
    route("estrada-da-graciosa", "Estrada da Graciosa — Estrada-Parque", "Estrada-parque", "Paraná", { roadRefs: ["PR-410"] }),
    route("serra-do-corvo-branco", "Serra do Corvo Branco", "Serra", "Santa Catarina", { roadRefs: ["SC-370"] }),
    route("serra-dona-francisca", "Serra Dona Francisca", "Serra", "Santa Catarina", { roadRefs: ["SC-418"] }),
    route("serra-do-rio-do-rastro", "Serra do Rio do Rastro", "Serra", "Santa Catarina", { roadRefs: ["SC-390"] }),
    route("serra-da-rocinha", "Serra da Rocinha", "Serra", "SC e RS", { roadRefs: ["BR-285"] }),
    route("rota-do-sol", "Rota do Sol", "Cênica", "Rio Grande do Sul", { long: true, roadRefs: ["RSC-453", "ERS-486"] }),
    route("serra-da-macaca", "Serra da Macaca — Estrada Parque Carlos Botelho", "Estrada-parque", "São Paulo", { roadRefs: ["SP-139"] }),
    route("estrada-parque-pantanal", "Estrada Parque Pantanal", "Estrada-parque", "Mato Grosso do Sul", { long: true, roadRefs: ["MS-184", "MS-228"] }),
    route("rio-santos", "Rio–Santos", "Litorânea", "SP e RJ", { long: true, roadRefs: ["BR-101", "SP-055"] }),
    route("caminhos-de-pedra", "Caminhos de Pedra", "Cultural", "Rio Grande do Sul", { sourceName: "Associação Caminhos de Pedra", sourceUrl: "https://www.caminhosdepedra.org.br/", note: "Recorte orientado a partir do acesso pelo entroncamento com a ERS-448." }),
    route("rota-romantica", "Rota Romântica", "Turística", "Rio Grande do Sul", { long: true, roadRefs: ["BR-116", "ERS-235"] }),
    route("estrada-do-pacifico", "Estrada do Pacífico", "Internacional", "Acre", { long: true, roadRefs: ["BR-317"] }),
    route("via-panamericana", "Via Panamericana", "Internacional", "México → Buenos Aires", {
      family: "Via Panamericana", long: true, previewTraveledOnly: true, emblemKey: "via-panam", emblemCountries: ["CO", "EC", "PE", "CL", "AR"],
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
    route("ruta-40-argentina", "Ruta Nacional 40", "Cênica", "Argentina — Cabo Vírgenes → La Quiaca", {
      family: "Ruta Nacional 40", long: true, roadRefs: ["INT:AR:RN:40"], previewTraveledOnly: true,
      sourceName: "Argentina.gob.ar", sourceUrl: "https://www.argentina.gob.ar/noticias/ruta-40-un-puente-al-conocimiento",
      note: "Corredor andino argentino com mais de 5.000 km, do extremo sul ao limite com a Bolívia."
    }),
    route("mexico-1-transpeninsular", "Carretera Transpeninsular — México 1", "Cênica", "México — Tijuana → Cabo San Lucas", {
      family: "Carretera Transpeninsular", long: true, previewTraveledOnly: true,
      sourceName: "OpenStreetMap", sourceUrl: "https://www.openstreetmap.org/",
      note: "Eixo longitudinal da península da Baja California pela Carretera Federal 1."
    }),
    route("ruta-siete-lagos", "Ruta de los Siete Lagos", "Cênica", "Argentina — San Martín de los Andes → Villa La Angostura", {
      family: "Ruta de los Siete Lagos", long: true, roadRefs: ["INT:AR:RN:40"], previewTraveledOnly: true,
      sourceName: "Argentina.gob.ar", sourceUrl: "https://www.argentina.gob.ar/node/475018",
      note: "Trecho cênico da RN 40 entre os parques Lanín e Nahuel Huapi."
    }),
    route("ruta-3-fin-del-mundo", "Ruta Nacional 3 — Fin del Mundo", "Aventura", "Argentina — Buenos Aires → Bahía Lapataia", {
      family: "Ruta Nacional 3", long: true, roadRefs: ["INT:AR:RN:3"], previewTraveledOnly: true,
      sourceName: "Argentina.gob.ar", sourceUrl: "https://www.argentina.gob.ar/noticias/la-guia-turistica-de-la-ruta-nacional-3-esta-en-camino",
      note: "Corredor atlântico argentino até Ushuaia e o término da RN 3 em Bahía Lapataia; o recorte preserva a descontinuidade do Estreito de Magalhães."
    }),
    route("espinazo-del-diablo", "Espinazo del Diablo", "Serra", "México — Durango → Mazatlán", {
      family: "Espinazo del Diablo", long: true, previewTraveledOnly: true,
      sourceName: "OpenStreetMap", sourceUrl: "https://www.openstreetmap.org/",
      note: "Trecho histórico da Federal 40 pela Sierra Madre Occidental."
    }),
    route("paso-de-jama", "Paso de Jama", "Internacional", "Argentina ↔ Chile", {
      family: "Paso de Jama", long: true, roadRefs: ["INT:AR:RN:52", "INT:CL:CH:27"], previewTraveledOnly: true,
      sourceName: "Argentina.gob.ar", sourceUrl: "https://www.argentina.gob.ar/seguridad/pasosinternacionales/detalle/ruta/19/Jama",
      note: "Travessia de alta montanha pela RN 52 e CH-27 entre Jujuy e San Pedro de Atacama."
    }),
    route("carretera-interoceanica-sur", "Carretera Interoceánica Sur", "Internacional", "Brasil ↔ Peru — Acre → Pacífico", {
      family: "Carretera Interoceánica Sur", long: true, roadRefs: ["BR-317"], previewTraveledOnly: true,
      sourceName: "PROMPERÚ", sourceUrl: "https://repositorio.promperu.gob.pe/items/0108979d-49a4-48ff-8a96-1fd3c580a3df",
      note: "Corredor Interoceânico Sul ligando o Acre a Madre de Dios e aos eixos peruanos rumo ao Pacífico."
    }),
    route("br-230-transamazonica", "BR-230 — Transamazônica", "Aventura", "Brasil — Cabedelo → Lábrea", {
      family: "Transamazônica", long: true, roadRefs: ["BR-230"],
      sourceName: "DNIT", sourceUrl: "https://www.gov.br/dnit/pt-br/assuntos/noticias/dnit-entrega-17-quilometros-revitalizados-da-br-230-aos-paraenses",
      note: "A BR-230 é a Rodovia Transamazônica; o recorte acompanha o eixo nacional de Cabedelo ao interior amazônico."
    }),
    route("paso-los-libertadores", "Paso Internacional Los Libertadores", "Internacional", "Argentina ↔ Chile — Mendoza → Santiago", {
      family: "Paso Los Libertadores", long: true, roadRefs: ["INT:AR:RN:7", "INT:CL:CH:60"], previewTraveledOnly: true,
      sourceName: "OpenStreetMap", sourceUrl: "https://www.openstreetmap.org/",
      note: "Clássico corredor transandino RN 7 / CH-60 entre Mendoza, Los Andes e Santiago."
    }),
    route("avenida-de-los-volcanes", "Avenida de los Volcanes — E35", "Cênica", "Equador — Quito → Cuenca", {
      family: "Avenida de los Volcanes", long: true, roadRefs: ["INT:EC:E:35"], previewTraveledOnly: true,
      sourceName: "OpenStreetMap", sourceUrl: "https://www.openstreetmap.org/",
      note: "Recorte cênico do corredor andino E35 entre Quito, Cotopaxi, Chimborazo e Cuenca."
    }),
    route("camino-de-los-yungas", "Camino de los Yungas — Camino de la Muerte", "Aventura", "Bolívia — La Cumbre → Yolosa", {
      family: "Camino de los Yungas", long: true, previewTraveledOnly: true,
      sourceName: "OpenStreetMap", sourceUrl: "https://www.openstreetmap.org/",
      note: "Antiga estrada dos Yungas, descendo de La Cumbre em direção a Yolosa."
    }),
    route("ch5-atacama", "Ruta 5 — Deserto do Atacama", "Cênica", "Chile — La Serena → Arica", {
      family: "Ruta 5 Atacama", long: true, roadRefs: ["INT:CL:CH:5"], previewTraveledOnly: true,
      sourceName: "MOP Chile", sourceUrl: "https://concesiones.mop.gob.cl/project/ruta-5-tramo-caldera-antofagasta/",
      note: "Trecho da Ruta 5 / Panamericana através do Atacama, de La Serena a Arica."
    }),
    route("br-319-manaus-porto-velho", "BR-319 — Manaus–Porto Velho", "Aventura", "AM e RO", {
      long: true, roadRefs: ["BR-319"],
      note: "A Transamazônica é a BR-230; este recorte segue a BR-319 informada na lista."
    }),
    route("caminho-da-fe", "Caminho da Fé", "Peregrinação", "MG e SP — Águas da Prata → Aparecida", { long: true, sourceName: "Wikiloc · referência enviada pelo usuário", sourceUrl: "https://pt.wikiloc.com/trilhas-mountain-bike/caminho-da-fe-percurso-completo-5-dias-aguas-da-prata-a-aparecida-via-pedrinhas-144001393", note: "Percurso completo via Pedrinhas." }),
    route("rota-das-missoes", "Caminho das Missões", "Histórica / Peregrinação", "Rio Grande do Sul", { long: true, sourceName: "Portal das Missões", sourceUrl: "https://www.portaldasmissoes.com.br/uploads/noticias/3946/0109862_regular_0109857_regular_revista-missoes-rs-6.png", note: "Traçado existente revisado contra o mapa regional fornecido; eixo São Borja → São Nicolau → São Luiz Gonzaga → São Miguel das Missões → Santo Ângelo." }),
    route("caminho-dos-canions", "Caminho dos Cânions", "Cênica", "SC e RS", { long: true }),
    route("caminho-do-ceu-canastra", "Caminho do Céu — Canastra", "4x4", "Minas Gerais", { sourceName: "OpenStreetMap", sourceUrl: "https://www.openstreetmap.org/copyright", note: "Recorte entre os marcos revisados na Serra da Canastra; eixo viário local do OpenStreetMap." }),
    route("serra-branca-canastra", "Serra Branca — Canastra", "4x4", "Minas Gerais", { sourceName: "OpenStreetMap", sourceUrl: "https://www.openstreetmap.org/copyright", note: "Recorte entre os marcos revisados na Serra da Canastra; eixo viário local do OpenStreetMap." }),
    route("corredor-chapada-dos-veadeiros", "Corredor da Chapada dos Veadeiros", "Cênica", "Goiás", { long: true, roadRefs: ["GO-118"] }),
    route("serra-do-tepequem", "Serra do Tepequém", "Serra", "Roraima", { roadRefs: ["RR-203"] }),
    route("rastro-da-serpente", "Rastro da Serpente", "Mototurismo", "SP e PR", { long: true, roadRefs: ["SP-250", "BR-476"] }),
    route("circuito-das-aguas-paulista", "Circuito das Águas Paulista", "Circuito", "São Paulo", { long: true, sourceName: "Circuito das Águas Paulista", sourceUrl: "https://www.circuitodasaguaspaulista.sp.gov.br/" }),
    route("vale-europeu", "Vale Europeu", "Circuito", "Santa Catarina", { long: true, sourceName: "Circuito Caminhante Vale Europeu", sourceUrl: "https://valeeuropeucatarinense.com.br/circuito-caminhante/", note: "Geometria composta pelas 9 etapas GPX oficiais do Circuito Caminhante." }),
    route("estrada-parque-da-serra", "Estrada Parque da Serra — Ilhéus–Itacaré", "Estrada-parque", "Bahia", { roadRefs: ["BA-001"] }),
    route("transpantaneira", "Transpantaneira", "Estrada-parque", "Mato Grosso — Poconé → Porto Jofre", { long: true, roadRefs: ["MT-060"], sourceName: "SINFRA-MT", sourceUrl: "https://www.sinfra.mt.gov.br/", note: "Estrada-parque da MT-060 entre Poconé e Porto Jofre." }),
    route("estrada-parque-pocone-porto-cercado", "Estrada-Parque Poconé–Porto Cercado", "Estrada-parque", "Mato Grosso", { roadRefs: ["MT-370"], sourceName: "SINFRA-MT", sourceUrl: "https://www.sinfra.mt.gov.br/" }),
    route("estrada-parque-cachoeira-da-fumaca", "Estrada-Parque Cachoeira da Fumaça", "Estrada-parque", "Mato Grosso", { roadRefs: ["MT-457"], sourceName: "SINFRA-MT", sourceUrl: "https://www.sinfra.mt.gov.br/" }),
    route("estrada-parque-cuiaba-chapada", "Estrada-Parque Cuiabá–Chapada dos Guimarães", "Estrada-parque", "Mato Grosso", { roadRefs: ["MT-020", "MT-251"], sourceName: "SINFRA-MT", sourceUrl: "https://www.sinfra.mt.gov.br/" }),
    route("estrada-parque-santo-antonio-porto-de-fora", "Estrada-Parque Santo Antônio–Porto de Fora", "Estrada-parque", "Mato Grosso", { roadRefs: ["MT-040", "MT-361", "MT-270"], sourceName: "SINFRA-MT", sourceUrl: "https://www.sinfra.mt.gov.br/" }),
    route("estrada-parque-piraputanga", "Estrada-Parque Piraputanga", "Estrada-parque", "Mato Grosso do Sul", { roadRefs: ["MS-450"], sourceName: "IMASUL", sourceUrl: "https://www.imasul.ms.gov.br/" }),
    route("estrada-parque-itaquirai", "Estrada-Parque de Itaquiraí", "Estrada-parque", "Mato Grosso do Sul", { roadRefs: ["MS-488"], sourceName: "Governo de Mato Grosso do Sul", sourceUrl: "https://www.spdo.ms.gov.br/", note: "Denominação legal da MS-488; recorte veicular entre Itaquiraí e Porto Santo Antônio." }),
    route("estrada-parque-veadeiros-go239", "Estrada-Parque Veadeiros", "Estrada-parque", "Goiás — Alto Paraíso → São Jorge → Colinas do Sul", { long: true, roadRefs: ["GO-239"], sourceName: "Governo de Goiás", sourceUrl: "https://goias.gov.br/" }),
    route("estrada-parque-go327", "Estrada-Parque GO-327", "Estrada-parque", "Goiás", { roadRefs: ["GO-327"], sourceName: "SEMAD-GO", sourceUrl: "https://goias.gov.br/meioambiente/leis-e-decretos-estaduais/", note: "Rodovia transformada em Estrada-Parque pela Lei estadual 13.237/1998." }),
    route("estrada-parque-pireneus", "Estrada-Parque dos Pireneus", "Estrada-parque", "Goiás — Pirenópolis ↔ Cocalzinho", { sourceName: "SEMAD-GO", sourceUrl: "https://goias.gov.br/meioambiente/parque-estadual-dos-pireneus-pep/", note: "Estrada de terra que cruza a Serra e o Parque Estadual dos Pireneus." }),
    route("estrada-parque-terra-ronca", "Estrada-Parque Terra Ronca", "Estrada-parque", "Goiás", { roadRefs: ["GO-453"], sourceName: "SEMAD-GO", sourceUrl: "https://goias.gov.br/meioambiente/parque-estadual-de-terra-ronca-peter/" }),
    route("estrada-parque-rota-ecologica", "Estrada-Parque Rota Ecológica", "Estrada-parque", "Alagoas — Passo de Camaragibe → Porto de Pedras", { roadRefs: ["AL-101"], sourceName: "Ministério do Turismo", sourceUrl: "https://www.gov.br/turismo/" }),
    route("estrada-parque-guajara-nova-mamore", "Estrada-Parque Guajará-Mirim–Nova Mamoré", "Estrada-parque", "Rondônia", { roadRefs: ["BR-425"], sourceName: "OpenStreetMap / DNIT", sourceUrl: "https://www.gov.br/dnit/" }),
    route("estrada-parque-romeiros", "Estrada-Parque dos Romeiros", "Estrada-parque", "São Paulo — Itu → Cabreúva → Pirapora do Bom Jesus", { roadRefs: ["SP-312"], sourceName: "Fundação Florestal SP", sourceUrl: "https://guiadeareasprotegidas.sp.gov.br/" }),
    route("estrada-parque-castelhanos", "Estrada-Parque Castelhanos", "Estrada-parque", "São Paulo — Ilhabela", { sourceName: "Fundação Florestal SP", sourceUrl: "https://guiadeareasprotegidas.sp.gov.br/trilha/estrada-parque-castelhanos/", note: "Acesso veicular controlado; condições podem exigir 4x4." }),
    route("estrada-parque-serra-guararu", "Estrada-Parque Serra do Guararu", "Estrada-parque", "São Paulo — Guarujá", { roadRefs: ["SP-061"], sourceName: "Governo de São Paulo", sourceUrl: "https://www.infraestruturameioambiente.sp.gov.br/" }),
    route("estrada-parque-morro-do-diabo", "Estrada-Parque Morro do Diabo", "Estrada-parque", "São Paulo — Teodoro Sampaio", { roadRefs: ["SP-613"], sourceName: "Fundação Florestal SP / OpenStreetMap", sourceUrl: "https://guiadeareasprotegidas.sp.gov.br/", note: "Trecho da SP-613 limitado às interseções com o perímetro do Parque Estadual Morro do Diabo, cerca de 14 km." }),
    route("estrada-parque-visconde-maua", "Estrada-Parque Visconde de Mauá", "Estrada-parque", "Rio de Janeiro — Capelinha → Visconde de Mauá", { roadRefs: ["RJ-163"], sourceName: "INEA-RJ", sourceUrl: "https://www.inea.rj.gov.br/" }),
    route("estrada-parque-maringa-maromba", "Estrada-Parque Maringá–Maromba", "Estrada-parque", "Rio de Janeiro", { roadRefs: ["RJ-151"], sourceName: "INEA-RJ / OpenStreetMap", sourceUrl: "https://www.inea.rj.gov.br/", note: "Recorte viário entre os núcleos de Maringá e Maromba." }),
    route("estrada-parque-paraty-cunha", "Estrada-Parque Paraty–Cunha", "Estrada-parque", "RJ e SP", { roadRefs: ["RJ-165"], sourceName: "ICMBio", sourceUrl: "https://www.gov.br/icmbio/" }),
    route("estrada-parque-caparao-es190", "Estrada-Parque do Caparaó", "Estrada-parque", "Espírito Santo — Dores do Rio Preto → Pedra Roxa", { roadRefs: ["ES-190"], sourceName: "SETUR-ES", sourceUrl: "https://setur.es.gov.br/" }),
    route("estrada-parque-alcides-daniel-da-costa", "Estrada-Parque Alcides Daniel da Costa", "Estrada-parque", "Espírito Santo — Ibitirama / Pedra Roxa", { sourceName: "Assembleia Legislativa do Espírito Santo", sourceUrl: "https://www3.al.es.gov.br/", note: "Trecho estadual entre o acesso da BR-262 e a comunidade de Pedra Roxa, denominado em 2026." }),
    route("estrada-parque-passos-dos-fundadores", "Estrada-Parque Passos dos Fundadores", "Estrada-parque", "Minas Gerais — Tiradentes → Bichinho → Prados", { sourceName: "Turismo Minas Gerais", sourceUrl: "https://www.minasgerais.com.br/" }),
    route("estrada-parque-bispo-dom-helvecio", "Estrada-Parque Bispo Dom Helvécio", "Estrada-parque", "Minas Gerais — Marliéria / Parque Estadual do Rio Doce", { roadRefs: ["AMG-900"], sourceName: "DER-MG", sourceUrl: "https://www.der.mg.gov.br/", note: "Recorte pela AMG-900, Marliéria–entroncamento LMG-760/Parque Estadual do Rio Doce." }),
    route("estrada-parque-brigadeiro-silva-paes", "Estrada-Parque Brigadeiro Silva Paes", "Estrada-parque", "Santa Catarina", { roadRefs: ["SC-410"], sourceName: "SIE-SC", sourceUrl: "https://www.sie.sc.gov.br/" }),
    route("estrada-parque-da-cidadania", "Estrada-Parque da Cidadania", "Estrada-parque", "Bahia — APA do Pratigi", { sourceName: "INEMA-BA", sourceUrl: "https://www.inema.ba.gov.br/", note: "Recorte veicular inicial do corredor entre a BR-101 e a BA-001, na região de Ibirapitanga/Pratigi." }),
    route("estrada-parque-se100-litoral-norte", "Estrada-Parque Litoral Norte", "Estrada-parque", "Sergipe", { roadRefs: ["SE-100"], sourceName: "ADEMA-SE", sourceUrl: "https://adema.se.gov.br/", note: "Lote 3: divisa SE/AL (Povoado Saramém) → entroncamento SE-439; extensão oficial aproximada de 27,09 km." }),
    route("estrada-parque-brejo-grande", "Estrada-Parque Brejo Grande", "Estrada-parque", "Sergipe", { roadRefs: ["SE-204"], sourceName: "ADEMA-SE", sourceUrl: "https://adema.se.gov.br/", note: "Lote 4 da SE-204 entre SE-100 e SE-200; extensão oficial aproximada de 6,43 km." }),
    route("estrada-parque-terra-vermelha-garatuba", "Estrada-Parque Terra Vermelha–Garatuba", "Estrada-parque", "Sergipe", { roadRefs: ["SE-430"], sourceName: "ADEMA-SE", sourceUrl: "https://adema.se.gov.br/", note: "Lote 5 da SE-430, Terra Vermelha–Garatuba; extensão oficial aproximada de 6,99 km." }),
    route("caminhos-de-sao-tiago", "Caminhos de São Tiago", "Histórica / Peregrinação", "Minas Gerais — Santa Rita de Ouro Preto → São Tiago", { long: true, sourceName: "Caminhos de São Tiago / Google My Maps", sourceUrl: "https://goo.gl/maps/ATwdHEVMy8ZMJH4T6", note: "Traçado revisado pela camada compartilhada da rota; percurso divulgado com aproximadamente 270 km e 4x4 recomendado." }),
    route("caminho-sao-miguel-arcanjo", "Caminho de São Miguel Arcanjo", "Peregrinação", "Paraná — Prudentópolis", { long: true, sourceName: "Prefeitura de Prudentópolis", sourceUrl: "https://caminhodesaomiguel.prudentopolis.pr.gov.br/", note: "Circuito rural oficialmente percorrível também de automóvel." }),
    route("crer-caminho-religioso-estrada-real", "CRER — Caminho Religioso da Estrada Real", "Peregrinação", "MG e SP — Caeté → Aparecida", { long: true, sourceName: "SECULT-MG", sourceUrl: "https://www.secult.mg.gov.br/", note: "Recorte veicular do CRER; o roteiro possui alças e modalidade 4x4." }),
    route("rota-da-luz-sp", "Rota da Luz SP", "Peregrinação", "São Paulo — Mogi das Cruzes → Aparecida", { long: true, sourceName: "Google My Maps · referência enviada pelo usuário", sourceUrl: "https://goo.gl/maps/C6KCU1sVZP92" }),
    route("caminho-da-luz", "Caminho da Luz", "Peregrinação", "Minas Gerais — Tombos → Alto Caparaó", { long: true, sourceName: "Caminho da Luz", sourceUrl: "https://caminhodaluz.org.br/", note: "Geometria veicular termina em Alto Caparaó; a subida pedestre ao Pico da Bandeira não é contabilizada." }),
    route("caminho-da-prece", "Caminho da Prece", "Peregrinação", "Minas Gerais — Jacutinga → Inconfidentes → Borda da Mata", { sourceName: "Wikiloc · referências enviadas pelo usuário", sourceUrl: "https://pt.wikiloc.com/trilhas-trekking/caminho-da-prece-1o-dia-jacutinga-a-inconfidentes-mg-255631820", note: "Composto pelos dois trechos Wikiloc indicados pelo usuário." }),
    route("caminho-de-nha-chica", "Caminho de Nhá Chica", "Peregrinação", "Minas Gerais — Inconfidentes → Baependi", { long: true, sourceName: "Google My Maps · Caminho de Nhá Chica", sourceUrl: "https://www.google.com/maps/d/u/0/viewer?mid=15KU_ORnvmCQIg9lygaH6bcTWD2xxyDNq&femb=1", note: "16 segmentos principais; deslocamentos de apoio e variante alternativa excluídos." }),
    route("caminhos-de-caravaggio", "Caminhos de Caravaggio", "Peregrinação", "Rio Grande do Sul — Canela → Farroupilha", { long: true, sourceName: "Wikiloc · referência enviada pelo usuário", sourceUrl: "https://pt.wikiloc.com/trilhas-trekking/caminhos-de-caravaggio-57586267" }),
    route("caminhos-de-nossa-senhora", "Caminhos de Nossa Senhora", "Peregrinação", "RJ e SP — Piabetá → Aparecida", { long: true, sourceName: "Caminhos de Nossa Senhora", sourceUrl: "https://www.caminhosdenossasenhora.com/", note: "Recorte automobilístico; variantes exclusivamente pedestres ficam fora da geometria." }),
    route("caminhos-franciscanos", "Caminhos Franciscanos", "Peregrinação", "Minas Gerais — Teófilo Otoni → Itambacuri", { sourceName: "Caminhos Franciscanos", sourceUrl: "https://www.caminhosfranciscanos.com.br/", note: "Ramal veicular principal entre Teófilo Otoni e Itambacuri." }),
    route("caminhos-de-padre-liberio", "Caminhos de Padre Libério", "Peregrinação", "Minas Gerais — Pará de Minas → Leandro Ferreira", { long: true, sourceName: "Turismo Minas Gerais", sourceUrl: "https://www.minasgerais.com.br/" }),
    route("caminho-das-capelas", "Caminho das Capelas", "Peregrinação", "Minas Gerais — Inconfidentes / Bom Repouso / Tocos do Moji", { sourceName: "Wikiloc · referência enviada pelo usuário", sourceUrl: "https://pt.wikiloc.com/trilhas-trekking/caminho-das-capelas-de-inconfidentes-mg-75559382" }),
    route("caminho-da-agonia", "Caminho da Agonia", "Peregrinação", "Minas Gerais — Cristina → Maria da Fé → Pedralva → Itajubá", { sourceName: "Wikiloc · referência enviada pelo usuário", sourceUrl: "https://pt.wikiloc.com/trilhas-trekking/caminho-da-agonia-123850827" }),
    route("caminho-de-sao-jose-patriarca", "Caminho de São José Patriarca", "Peregrinação", "São Paulo — Itatiba → Itu", { long: true, sourceName: "Caminho de São José", sourceUrl: "https://caminhodesaojose.com.br/", note: "Recorte veicular do caminho histórico entre Itatiba e Itu." }),
    route("costa-dourada", "Costa Dourada — Mucuri", "Litorânea", "Bahia")
  ];

  return Object.freeze({
    version: "1.4.0",
    familyCount: 83,
    routeCount: routes.length,
    routes: Object.freeze(routes)
  });
});
