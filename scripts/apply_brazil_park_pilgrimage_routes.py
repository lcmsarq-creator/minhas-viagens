#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "iconic-routes-catalog.js"
TEST = ROOT / "tests" / "iconic-routes.test.js"

ENTRIES = r'''    route("transpantaneira", "Transpantaneira", "Estrada-parque", "Mato Grosso — Poconé → Porto Jofre", { long: true, roadRefs: ["MT-060"], sourceName: "SINFRA-MT", sourceUrl: "https://www.sinfra.mt.gov.br/", note: "Estrada-parque da MT-060 entre Poconé e Porto Jofre." }),
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
    route("estrada-parque-morro-do-diabo", "Estrada-Parque Morro do Diabo", "Estrada-parque", "São Paulo — Teodoro Sampaio", { roadRefs: ["SP-613"], sourceName: "Fundação Florestal SP", sourceUrl: "https://guiadeareasprotegidas.sp.gov.br/" }),
    route("estrada-parque-visconde-maua", "Estrada-Parque Visconde de Mauá", "Estrada-parque", "Rio de Janeiro — Capelinha → Visconde de Mauá", { roadRefs: ["RJ-163"], sourceName: "INEA-RJ", sourceUrl: "https://www.inea.rj.gov.br/" }),
    route("estrada-parque-maringa-maromba", "Estrada-Parque Maringá–Maromba", "Estrada-parque", "Rio de Janeiro", { roadRefs: ["RJ-151"], sourceName: "INEA-RJ", sourceUrl: "https://www.inea.rj.gov.br/" }),
    route("estrada-parque-paraty-cunha", "Estrada-Parque Paraty–Cunha", "Estrada-parque", "RJ e SP", { roadRefs: ["RJ-165"], sourceName: "ICMBio", sourceUrl: "https://www.gov.br/icmbio/" }),
    route("estrada-parque-caparao-es190", "Estrada-Parque do Caparaó", "Estrada-parque", "Espírito Santo — Dores do Rio Preto → Pedra Roxa", { roadRefs: ["ES-190"], sourceName: "SETUR-ES", sourceUrl: "https://setur.es.gov.br/" }),
    route("estrada-parque-alcides-daniel-da-costa", "Estrada-Parque Alcides Daniel da Costa", "Estrada-parque", "Espírito Santo — Ibitirama / Pedra Roxa", { sourceName: "Assembleia Legislativa do Espírito Santo", sourceUrl: "https://www3.al.es.gov.br/", note: "Trecho estadual entre o acesso da BR-262 e a comunidade de Pedra Roxa, denominado em 2026." }),
    route("estrada-parque-passos-dos-fundadores", "Estrada-Parque Passos dos Fundadores", "Estrada-parque", "Minas Gerais — Tiradentes → Bichinho → Prados", { sourceName: "Turismo Minas Gerais", sourceUrl: "https://www.minasgerais.com.br/" }),
    route("estrada-parque-bispo-dom-helvecio", "Estrada-Parque Bispo Dom Helvécio", "Estrada-parque", "Minas Gerais — Marliéria / Parque Estadual do Rio Doce", { roadRefs: ["AMG-900"], sourceName: "DER-MG", sourceUrl: "https://www.der.mg.gov.br/", note: "Recorte pela AMG-900, Marliéria–entroncamento LMG-760/Parque Estadual do Rio Doce." }),
    route("estrada-parque-brigadeiro-silva-paes", "Estrada-Parque Brigadeiro Silva Paes", "Estrada-parque", "Santa Catarina", { roadRefs: ["SC-410"], sourceName: "SIE-SC", sourceUrl: "https://www.sie.sc.gov.br/" }),
    route("estrada-parque-da-cidadania", "Estrada-Parque da Cidadania", "Estrada-parque", "Bahia — APA do Pratigi", { sourceName: "INEMA-BA", sourceUrl: "https://www.inema.ba.gov.br/", note: "Recorte veicular inicial do corredor entre a BR-101 e a BA-001, na região de Ibirapitanga/Pratigi." }),
    route("estrada-parque-se100-litoral-norte", "Estrada-Parque Litoral Norte", "Estrada-parque", "Sergipe", { roadRefs: ["SE-100"], sourceName: "ADEMA-SE", sourceUrl: "https://adema.se.gov.br/", note: "Lote da SE-100 com aproximadamente 27,09 km." }),
    route("estrada-parque-brejo-grande", "Estrada-Parque Brejo Grande", "Estrada-parque", "Sergipe", { roadRefs: ["SE-204"], sourceName: "ADEMA-SE", sourceUrl: "https://adema.se.gov.br/", note: "Lote da SE-204 com aproximadamente 6,43 km." }),
    route("estrada-parque-terra-vermelha-garatuba", "Estrada-Parque Terra Vermelha–Garatuba", "Estrada-parque", "Sergipe", { roadRefs: ["SE-430"], sourceName: "ADEMA-SE", sourceUrl: "https://adema.se.gov.br/", note: "Lote da SE-430 com aproximadamente 6,99 km." }),
    route("caminhos-de-sao-tiago", "Caminhos de São Tiago", "Histórica / Peregrinação", "Minas Gerais — Santa Rita de Ouro Preto → São Tiago", { long: true, sourceName: "Caminhos de São Tiago", sourceUrl: "https://caminhosdesaotiago.com.br/", note: "Recorte veicular do caminho de aproximadamente 270 km; 4x4 recomendado." }),
    route("caminho-sao-miguel-arcanjo", "Caminho de São Miguel Arcanjo", "Peregrinação", "Paraná — Prudentópolis", { long: true, sourceName: "Prefeitura de Prudentópolis", sourceUrl: "https://caminhodesaomiguel.prudentopolis.pr.gov.br/", note: "Circuito rural oficialmente percorrível também de automóvel." }),
    route("crer-caminho-religioso-estrada-real", "CRER — Caminho Religioso da Estrada Real", "Peregrinação", "MG e SP — Caeté → Aparecida", { long: true, sourceName: "SECULT-MG", sourceUrl: "https://www.secult.mg.gov.br/", note: "Recorte veicular do CRER; o roteiro possui alças e modalidade 4x4." }),
    route("rota-da-luz-sp", "Rota da Luz SP", "Peregrinação", "São Paulo — Mogi das Cruzes → Aparecida", { long: true, sourceName: "Secretaria de Turismo de São Paulo", sourceUrl: "https://www.turismo.sp.gov.br/" }),
    route("caminho-da-luz", "Caminho da Luz", "Peregrinação", "Minas Gerais — Tombos → Alto Caparaó", { long: true, sourceName: "Caminho da Luz", sourceUrl: "https://caminhodaluz.org.br/", note: "Geometria veicular termina em Alto Caparaó; a subida pedestre ao Pico da Bandeira não é contabilizada." }),
    route("caminho-da-prece", "Caminho da Prece", "Peregrinação", "Minas Gerais — Jacutinga → Borda da Mata", { sourceName: "Caminho da Prece", sourceUrl: "https://www.caminhodaprece.com.br/caminho/" }),
    route("caminho-de-nha-chica", "Caminho de Nhá Chica", "Peregrinação", "Minas Gerais — Inconfidentes → Baependi", { long: true, sourceName: "Caminho de Nhá Chica", sourceUrl: "https://caminhodenhachica.com/" }),
    route("caminhos-de-caravaggio", "Caminhos de Caravaggio", "Peregrinação", "Rio Grande do Sul — Canela → Farroupilha", { long: true, sourceName: "Caminhos de Caravaggio", sourceUrl: "https://caravaggio.org.br/caminhos-de-caravaggio/", note: "Recorte veicular pelos municípios estruturantes do caminho." }),
    route("caminhos-de-nossa-senhora", "Caminhos de Nossa Senhora", "Peregrinação", "RJ e SP — Piabetá → Aparecida", { long: true, sourceName: "Caminhos de Nossa Senhora", sourceUrl: "https://www.caminhosdenossasenhora.com/", note: "Recorte automobilístico; variantes exclusivamente pedestres ficam fora da geometria." }),
    route("caminhos-franciscanos", "Caminhos Franciscanos", "Peregrinação", "Minas Gerais — Teófilo Otoni → Itambacuri", { sourceName: "Caminhos Franciscanos", sourceUrl: "https://www.caminhosfranciscanos.com.br/", note: "Ramal veicular principal entre Teófilo Otoni e Itambacuri." }),
    route("caminhos-de-padre-liberio", "Caminhos de Padre Libério", "Peregrinação", "Minas Gerais — Pará de Minas → Leandro Ferreira", { long: true, sourceName: "Turismo Minas Gerais", sourceUrl: "https://www.minasgerais.com.br/" }),
    route("caminho-das-capelas", "Caminho das Capelas", "Peregrinação", "Minas Gerais — Inconfidentes / Bom Repouso / Tocos do Moji", { sourceName: "Turismo Minas Gerais", sourceUrl: "https://www.minasgerais.com.br/", note: "Circuito veicular pelas comunidades rurais e capelas." }),
    route("caminho-de-sao-jose-patriarca", "Caminho de São José Patriarca", "Peregrinação", "São Paulo — Itatiba → Itu", { long: true, sourceName: "Caminho de São José", sourceUrl: "https://caminhodesaojose.com.br/", note: "Recorte veicular do caminho histórico entre Itatiba e Itu." }),
'''

NEW_IDS = [
    "transpantaneira", "estrada-parque-pocone-porto-cercado", "estrada-parque-cachoeira-da-fumaca",
    "estrada-parque-cuiaba-chapada", "estrada-parque-santo-antonio-porto-de-fora", "estrada-parque-piraputanga",
    "estrada-parque-itaquirai", "estrada-parque-veadeiros-go239", "estrada-parque-go327", "estrada-parque-pireneus",
    "estrada-parque-terra-ronca", "estrada-parque-rota-ecologica", "estrada-parque-guajara-nova-mamore",
    "estrada-parque-romeiros", "estrada-parque-castelhanos", "estrada-parque-serra-guararu", "estrada-parque-morro-do-diabo",
    "estrada-parque-visconde-maua", "estrada-parque-maringa-maromba", "estrada-parque-paraty-cunha",
    "estrada-parque-caparao-es190", "estrada-parque-alcides-daniel-da-costa", "estrada-parque-passos-dos-fundadores",
    "estrada-parque-bispo-dom-helvecio", "estrada-parque-brigadeiro-silva-paes", "estrada-parque-da-cidadania",
    "estrada-parque-se100-litoral-norte", "estrada-parque-brejo-grande", "estrada-parque-terra-vermelha-garatuba",
    "caminhos-de-sao-tiago", "caminho-sao-miguel-arcanjo", "crer-caminho-religioso-estrada-real", "rota-da-luz-sp",
    "caminho-da-luz", "caminho-da-prece", "caminho-de-nha-chica", "caminhos-de-caravaggio", "caminhos-de-nossa-senhora",
    "caminhos-franciscanos", "caminhos-de-padre-liberio", "caminho-das-capelas", "caminho-de-sao-jose-patriarca"
]


def apply_catalog():
    text = CATALOG.read_text(encoding="utf-8")
    if 'route("transpantaneira"' not in text:
        marker = '    route("costa-dourada", "Costa Dourada — Mucuri"'
        if marker not in text:
            raise SystemExit("catalog insertion marker not found")
        text = text.replace(marker, ENTRIES + marker, 1)
    text = text.replace('route("rota-das-missoes", "Rota das Missões", "Histórica", "Rio Grande do Sul", { long: true })',
                        'route("rota-das-missoes", "Caminho das Missões", "Histórica / Peregrinação", "Rio Grande do Sul", { long: true })')
    text = text.replace('route("estrada-da-graciosa", "Estrada da Graciosa", "Cênica", "Paraná", { roadRefs: ["PR-410"] })',
                        'route("estrada-da-graciosa", "Estrada da Graciosa — Estrada-Parque", "Estrada-parque", "Paraná", { roadRefs: ["PR-410"] })')
    text = text.replace('version: "1.2.0"', 'version: "1.3.0"')
    text = text.replace('familyCount: 41', 'familyCount: 83')
    CATALOG.write_text(text, encoding="utf-8")


def apply_tests():
    text = TEST.read_text(encoding="utf-8")
    text = text.replace('test("o catálogo expõe 41 famílias em 44 recortes", () => {\n  assert.equal(catalog.familyCount, 41);\n  assert.equal(catalog.routeCount, 44);\n  assert.equal(new Set(catalog.routes.map(route => route.id)).size, 44);',
                        'test("o catálogo expõe 83 famílias em 86 recortes", () => {\n  assert.equal(catalog.familyCount, 83);\n  assert.equal(catalog.routeCount, 86);\n  assert.equal(new Set(catalog.routes.map(route => route.id)).size, 86);')
    marker = 'test("cada recorte tem uma geometria estática válida", () => {'
    if 'as novas estradas-parque e caminhos veiculares fazem parte do catálogo' not in text:
        block = '''test("as novas estradas-parque e caminhos veiculares fazem parte do catálogo sem duplicar as existentes", () => {\n  const ids = %s;\n  assert.equal(ids.length, 42);\n  for (const id of ids) assert.ok(catalog.routes.some(route => route.id === id), `${id} deve existir`);\n  assert.equal(catalog.routes.filter(route => route.id === "caminho-da-fe").length, 1);\n  assert.equal(catalog.routes.filter(route => route.id === "rota-das-missoes").length, 1);\n  assert.equal(catalog.routes.filter(route => route.id === "estrada-parque-pantanal").length, 1);\n  assert.equal(catalog.routes.filter(route => route.id === "serra-da-macaca").length, 1);\n  assert.equal(catalog.routes.filter(route => route.id === "estrada-da-graciosa").length, 1);\n  assert.equal(catalog.routes.filter(route => route.id === "estrada-parque-da-serra").length, 1);\n  assert.equal(catalog.routes.filter(route => route.family === "Estrada Real").length, 4);\n  assert.equal(catalog.routes.some(route => /peabiru|itupava/i.test(`${route.id} ${route.name}`)), false);\n  assert.equal(catalog.routes.find(route => route.id === "rota-das-missoes").name, "Caminho das Missões");\n  assert.equal(catalog.routes.find(route => route.id === "estrada-parque-bispo-dom-helvecio").roadRefs[0], "AMG-900");\n});\n\n''' % repr(NEW_IDS).replace("'", '"')
        text = text.replace(marker, block + marker, 1)
    TEST.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    apply_catalog()
    apply_tests()
    print(f"catalog patched with {len(NEW_IDS)} new route ids")
