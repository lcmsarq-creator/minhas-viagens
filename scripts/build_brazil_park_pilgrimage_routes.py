#!/usr/bin/env python3
"""Gera geometrias veiculares para estradas-parque e caminhos brasileiros.

Prioriza o catálogo rodoviário hospedado quando a rota possui rodovia identificada.
Para caminhos rurais/turísticos sem uma única rodovia oficial, cria um recorte
veicular pelos marcos oficiais/municípios do itinerário. O resultado é estático e
é commitado no app; o navegador nunca consulta Nominatim ou OSRM para exibi-lo.
"""
from __future__ import annotations

import importlib.util
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HELPER_PATH = ROOT / "scripts" / "build-iconic-routes.py"
spec = importlib.util.spec_from_file_location("iconic_builder", HELPER_PATH)
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)

USER_AGENT = "MinhasViagens-brazil-iconic-builder/1.0"
NOMINATIM = "https://nominatim.openstreetmap.org/search"
GEOCODE_CACHE = {}
LAST_GEOCODE = 0.0


def geocode(query: str):
    global LAST_GEOCODE
    if query in GEOCODE_CACHE:
        return GEOCODE_CACHE[query]
    wait = 1.05 - (time.monotonic() - LAST_GEOCODE)
    if wait > 0:
        time.sleep(wait)
    params = urllib.parse.urlencode({
        "q": query,
        "format": "jsonv2",
        "limit": 1,
        "countrycodes": "br",
    })
    request = urllib.request.Request(f"{NOMINATIM}?{params}", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=45) as response:
        payload = json.load(response)
    LAST_GEOCODE = time.monotonic()
    if not payload:
        raise RuntimeError(f"Nominatim sem resultado para: {query}")
    point = [float(payload[0]["lat"]), float(payload[0]["lon"])]
    GEOCODE_CACHE[query] = point
    print(f"geocode: {query} -> {point[0]:.5f},{point[1]:.5f}")
    return point


def points(queries):
    return [item if isinstance(item, list) else geocode(item) for item in queries]


def existing_road_paths(paths):
    return [path for path in paths if (helper.ROAD_DIR / path).exists()]


def build_route(route_id, spec):
    waypoints = points(spec["waypoints"])
    road_paths = existing_road_paths(spec.get("roads", []))
    source_type = "vehicle-recut-official-checkpoints"
    lines = None
    if road_paths:
        try:
            lines = helper.route_on_road_catalog(road_paths, waypoints)
            source_type = "road-catalog"
        except Exception as error:
            print(f"warning: {route_id}: catálogo rodoviário falhou ({error}); usando OSRM")
    if lines is None:
        lines = helper.route_with_osrm(waypoints)
    extra = {
        "vehicleRoute": True,
        "sourceUrl": spec.get("sourceUrl", ""),
        "roadCatalogPaths": road_paths,
        "routeNote": spec.get("note", ""),
    }
    return helper.write_payload(route_id, lines, source_type, extra)


# Consultas são deliberadamente específicas para que a construção seja reprodutível.
# Para caminhos de peregrinação, os pontos representam o recorte VEICULAR e não
# eventuais trilhas exclusivamente pedestres do itinerário original.
ROUTES = {
    # Mato Grosso
    "transpantaneira": {
        "roads": ["mt/060.json"],
        "waypoints": ["Poconé, Mato Grosso", "Porto Jofre, Poconé, Mato Grosso"],
        "sourceUrl": "https://www.sinfra.mt.gov.br/",
    },
    "estrada-parque-pocone-porto-cercado": {
        "roads": ["mt/370.json"],
        "waypoints": ["Poconé, Mato Grosso", "Porto Cercado, Poconé, Mato Grosso"],
        "sourceUrl": "https://www.sinfra.mt.gov.br/",
    },
    "estrada-parque-cachoeira-da-fumaca": {
        "roads": ["mt/457.json"],
        "waypoints": ["Jaciara, Mato Grosso", "Cachoeira da Fumaça, Jaciara, Mato Grosso"],
        "sourceUrl": "https://www.sinfra.mt.gov.br/",
    },
    "estrada-parque-cuiaba-chapada": {
        "roads": ["mt/020.json", "mt/251.json"],
        "waypoints": ["Cuiabá, Mato Grosso", "Chapada dos Guimarães, Mato Grosso", "Mirante do Centro Geodésico, Chapada dos Guimarães, Mato Grosso"],
        "sourceUrl": "https://www.sinfra.mt.gov.br/",
    },
    "estrada-parque-santo-antonio-porto-de-fora": {
        "roads": ["mt/040.json", "mt/361.json", "mt/270.json"],
        "waypoints": ["Santo Antônio de Leverger, Mato Grosso", "Porto de Fora, Santo Antônio de Leverger, Mato Grosso"],
        "sourceUrl": "https://www.sinfra.mt.gov.br/",
    },
    # Mato Grosso do Sul
    "estrada-parque-piraputanga": {
        "roads": ["ms/450.json"],
        "waypoints": ["Aquidauana, Mato Grosso do Sul", "Piraputanga, Aquidauana, Mato Grosso do Sul", "Palmeiras, Dois Irmãos do Buriti, Mato Grosso do Sul"],
        "sourceUrl": "https://www.imasul.ms.gov.br/",
    },
    "estrada-parque-itaquirai": {
        "roads": ["ms/488.json"],
        "waypoints": ["Itaquiraí, Mato Grosso do Sul", "Porto Santo Antônio, Itaquiraí, Mato Grosso do Sul"],
        "sourceUrl": "https://www.spdo.ms.gov.br/diariodoe/Index/Download/DO9528_30_10_2017",
    },
    # Goiás
    "estrada-parque-veadeiros-go239": {
        "roads": ["go/239.json"],
        "waypoints": ["Alto Paraíso de Goiás, Goiás", "São Jorge, Alto Paraíso de Goiás, Goiás", "Colinas do Sul, Goiás"],
        "sourceUrl": "https://goias.gov.br/",
    },
    "estrada-parque-go327": {
        "roads": ["go/327.json"],
        "waypoints": ["Alto Paraíso de Goiás, Goiás", "São João d'Aliança, Goiás"],
        "sourceUrl": "https://goias.gov.br/meioambiente/leis-e-decretos-estaduais/",
        "note": "Recorte inicial pela GO-327, denominada Estrada-Parque pela Lei 13.237/1998.",
    },
    "estrada-parque-pireneus": {
        "waypoints": ["Pirenópolis, Goiás", "Parque Estadual dos Pireneus, Goiás", "Cocalzinho de Goiás, Goiás"],
        "sourceUrl": "https://goias.gov.br/meioambiente/parque-estadual-dos-pireneus-pep/",
    },
    "estrada-parque-terra-ronca": {
        "roads": ["go/453.json"],
        "waypoints": ["Guarani de Goiás, Goiás", "Parque Estadual de Terra Ronca, Goiás", "São Domingos, Goiás"],
        "sourceUrl": "https://goias.gov.br/meioambiente/parque-estadual-de-terra-ronca-peter/",
    },
    # Nordeste/Norte
    "estrada-parque-rota-ecologica": {
        "roads": ["al/101.json"],
        "waypoints": ["Passo de Camaragibe, Alagoas", "São Miguel dos Milagres, Alagoas", "Porto de Pedras, Alagoas"],
        "sourceUrl": "https://www.gov.br/turismo/",
    },
    "estrada-parque-guajara-nova-mamore": {
        "roads": ["br/425.json"],
        "waypoints": ["Guajará-Mirim, Rondônia", "Nova Mamoré, Rondônia"],
        "sourceUrl": "https://www.gov.br/dnit/",
    },
    # São Paulo
    "estrada-parque-romeiros": {
        "roads": ["sp/312.json"],
        "waypoints": ["Itu, São Paulo", "Cabreúva, São Paulo", "Pirapora do Bom Jesus, São Paulo"],
        "sourceUrl": "https://guiadeareasprotegidas.sp.gov.br/",
    },
    "estrada-parque-castelhanos": {
        "waypoints": ["Ilhabela, São Paulo", "Praia de Castelhanos, Ilhabela, São Paulo"],
        "sourceUrl": "https://guiadeareasprotegidas.sp.gov.br/trilha/estrada-parque-castelhanos/",
        "note": "Acesso veicular controlado; condições podem exigir veículo 4x4.",
    },
    "estrada-parque-serra-guararu": {
        "roads": ["sp/061.json"],
        "waypoints": ["Bertioga, São Paulo", "Serra do Guararu, Guarujá, São Paulo", "Guarujá, São Paulo"],
        "sourceUrl": "https://www.infraestruturameioambiente.sp.gov.br/",
    },
    "estrada-parque-morro-do-diabo": {
        "roads": ["sp/613.json"],
        "waypoints": ["Teodoro Sampaio, São Paulo", "Parque Estadual Morro do Diabo, Teodoro Sampaio, São Paulo"],
        "sourceUrl": "https://guiadeareasprotegidas.sp.gov.br/",
    },
    # Rio de Janeiro
    "estrada-parque-visconde-maua": {
        "roads": ["rj/163.json"],
        "waypoints": ["Capelinha, Resende, Rio de Janeiro", "Visconde de Mauá, Resende, Rio de Janeiro"],
        "sourceUrl": "https://www.inea.rj.gov.br/",
    },
    "estrada-parque-maringa-maromba": {
        "roads": ["rj/151.json"],
        "waypoints": ["Maringá, Itatiaia, Rio de Janeiro", "Maromba, Itatiaia, Rio de Janeiro"],
        "sourceUrl": "https://www.inea.rj.gov.br/",
    },
    "estrada-parque-paraty-cunha": {
        "roads": ["rj/165.json"],
        "waypoints": ["Paraty, Rio de Janeiro", "Cunha, São Paulo"],
        "sourceUrl": "https://www.icmbio.gov.br/parnaserradabocaina/",
    },
    # Espírito Santo
    "estrada-parque-caparao-es190": {
        "roads": ["es/190.json"],
        "waypoints": ["Dores do Rio Preto, Espírito Santo", "Pedra Roxa, Ibitirama, Espírito Santo"],
        "sourceUrl": "https://setur.es.gov.br/",
    },
    "estrada-parque-alcides-daniel-da-costa": {
        "waypoints": ["Ibitirama, Espírito Santo", "Pedra Roxa, Ibitirama, Espírito Santo"],
        "sourceUrl": "https://www3.al.es.gov.br/",
        "note": "Trecho estadual entre o acesso da BR-262 e a comunidade de Pedra Roxa, denominado em 2026.",
    },
    # Minas Gerais
    "estrada-parque-passos-dos-fundadores": {
        "waypoints": ["Tiradentes, Minas Gerais", "Bichinho, Prados, Minas Gerais", "Prados, Minas Gerais"],
        "sourceUrl": "https://www.minasgerais.com.br/",
    },
    "estrada-parque-bispo-dom-helvecio": {
        "roads": ["amg/900.json"],
        "waypoints": ["Marliéria, Minas Gerais", "Parque Estadual do Rio Doce, Minas Gerais"],
        "sourceUrl": "https://www.der.mg.gov.br/",
        "note": "Recorte pela AMG-900, Marliéria–entroncamento LMG-760/Parque Estadual do Rio Doce.",
    },
    # Santa Catarina / Bahia / Sergipe
    "estrada-parque-brigadeiro-silva-paes": {
        "roads": ["sc/410.json"],
        "waypoints": ["Tijucas, Santa Catarina", "Governador Celso Ramos, Santa Catarina"],
        "sourceUrl": "https://www.sie.sc.gov.br/",
    },
    "estrada-parque-da-cidadania": {
        "waypoints": ["Ibirapitanga, Bahia", "Piraí do Norte, Bahia", "Ituberá, Bahia"],
        "sourceUrl": "https://www.inema.ba.gov.br/",
        "note": "Recorte veicular inicial do corredor da APA do Pratigi entre a BR-101 e a BA-001.",
    },
    "estrada-parque-se100-litoral-norte": {
        "roads": ["se/100.json"],
        "waypoints": ["Saramém, Brejo Grande, Sergipe", "Brejão, Brejo Grande, Sergipe", "Garatuba, Japoatã, Sergipe"],
        "sourceUrl": "https://adema.se.gov.br/",
        "note": "Lote Estrada-Parque do Litoral Norte, aproximadamente 27,09 km.",
    },
    "estrada-parque-brejo-grande": {
        "roads": ["se/204.json"],
        "waypoints": ["Brejão, Brejo Grande, Sergipe", "Brejo Grande, Sergipe"],
        "sourceUrl": "https://adema.se.gov.br/",
        "note": "Lote SE-204 da Estrada-Parque, aproximadamente 6,43 km.",
    },
    "estrada-parque-terra-vermelha-garatuba": {
        "roads": ["se/430.json"],
        "waypoints": ["Terra Vermelha, Japoatã, Sergipe", "Garatuba, Japoatã, Sergipe"],
        "sourceUrl": "https://adema.se.gov.br/",
        "note": "Lote SE-430 da Estrada-Parque, aproximadamente 6,99 km.",
    },
    # Caminhos brasileiros com recorte veicular
    "caminhos-de-sao-tiago": {
        "waypoints": ["Santa Rita de Ouro Preto, Ouro Preto, Minas Gerais", "Ouro Branco, Minas Gerais", "Conselheiro Lafaiete, Minas Gerais", "Queluzito, Minas Gerais", "Casa Grande, Minas Gerais", "Entre Rios de Minas, Minas Gerais", "Lagoa Dourada, Minas Gerais", "Resende Costa, Minas Gerais", "Coronel Xavier Chaves, Minas Gerais", "Ritápolis, Minas Gerais", "São Tiago, Minas Gerais"],
        "sourceUrl": "https://caminhosdesaotiago.com.br/",
        "note": "Recorte veicular do Caminhos de São Tiago; veículo permitido e 4x4 recomendado pela divulgação oficial.",
    },
    "caminho-sao-miguel-arcanjo": {
        "waypoints": ["Prudentópolis, Paraná", "Barra Vermelha, Prudentópolis, Paraná", "Barra Seca, Prudentópolis, Paraná", "Barra da Areia, Prudentópolis, Paraná", "Linha Paraná, Prudentópolis, Paraná", "Linha Piquiri, Prudentópolis, Paraná", "Linha Esperança, Prudentópolis, Paraná", "São João do Rio Claro, Prudentópolis, Paraná", "Prudentópolis, Paraná"],
        "sourceUrl": "https://caminhodesaomiguel.prudentopolis.pr.gov.br/",
    },
    "crer-caminho-religioso-estrada-real": {
        "waypoints": ["Caeté, Minas Gerais", "Sabará, Minas Gerais", "Ouro Preto, Minas Gerais", "Congonhas, Minas Gerais", "Conselheiro Lafaiete, Minas Gerais", "Entre Rios de Minas, Minas Gerais", "Lagoa Dourada, Minas Gerais", "Tiradentes, Minas Gerais", "São João del-Rei, Minas Gerais", "Carrancas, Minas Gerais", "Baependi, Minas Gerais", "São Lourenço, Minas Gerais", "Passa Quatro, Minas Gerais", "Cruzeiro, São Paulo", "Cachoeira Paulista, São Paulo", "Guaratinguetá, São Paulo", "Aparecida, São Paulo"],
        "sourceUrl": "https://www.secult.mg.gov.br/",
        "note": "Recorte veicular do CRER; o roteiro oficial possui alças e modalidade 4x4.",
    },
    "rota-da-luz-sp": {
        "waypoints": ["Mogi das Cruzes, São Paulo", "Guararema, São Paulo", "Santa Branca, São Paulo", "Paraibuna, São Paulo", "Redenção da Serra, São Paulo", "Taubaté, São Paulo", "Pindamonhangaba, São Paulo", "Roseira, São Paulo", "Aparecida, São Paulo"],
        "sourceUrl": "https://www.turismo.sp.gov.br/rota-da-luz",
    },
    "caminho-da-luz": {
        "waypoints": ["Tombos, Minas Gerais", "Catuné, Tombos, Minas Gerais", "Pedra Dourada, Minas Gerais", "Faria Lemos, Minas Gerais", "Carangola, Minas Gerais", "Caiana, Minas Gerais", "Espera Feliz, Minas Gerais", "Caparaó, Minas Gerais", "Alto Caparaó, Minas Gerais"],
        "sourceUrl": "https://caminhodaluz.org.br/",
        "note": "Recorte veicular até Alto Caparaó; a subida final pedestre ao Pico da Bandeira não faz parte desta geometria.",
    },
    "caminho-da-prece": {
        "waypoints": ["Jacutinga, Minas Gerais", "Ouro Fino, Minas Gerais", "Inconfidentes, Minas Gerais", "Tocos do Moji, Minas Gerais", "Borda da Mata, Minas Gerais"],
        "sourceUrl": "https://www.caminhodaprece.com.br/caminho/",
    },
    "caminho-de-nha-chica": {
        "waypoints": ["Inconfidentes, Minas Gerais", "Borda da Mata, Minas Gerais", "Congonhal, Minas Gerais", "Espírito Santo do Dourado, Minas Gerais", "Silvianópolis, Minas Gerais", "Careaçu, Minas Gerais", "Heliodora, Minas Gerais", "Natércia, Minas Gerais", "Conceição das Pedras, Minas Gerais", "Cristina, Minas Gerais", "Carmo de Minas, Minas Gerais", "Soledade de Minas, Minas Gerais", "Caxambu, Minas Gerais", "Baependi, Minas Gerais"],
        "sourceUrl": "https://caminhodenhachica.com/",
    },
    "caminhos-de-caravaggio": {
        "waypoints": ["Canela, Rio Grande do Sul", "Gramado, Rio Grande do Sul", "Nova Petrópolis, Rio Grande do Sul", "Caxias do Sul, Rio Grande do Sul", "Farroupilha, Rio Grande do Sul"],
        "sourceUrl": "https://caravaggio.org.br/caminhos-de-caravaggio/",
    },
    "caminhos-de-nossa-senhora": {
        "waypoints": ["Piabetá, Magé, Rio de Janeiro", "Petrópolis, Rio de Janeiro", "Paty do Alferes, Rio de Janeiro", "Vassouras, Rio de Janeiro", "Conservatória, Valença, Rio de Janeiro", "Rio Claro, Rio de Janeiro", "Bananal, São Paulo", "São José do Barreiro, São Paulo", "Arapeí, São Paulo", "Silveiras, São Paulo", "Cachoeira Paulista, São Paulo", "Lorena, São Paulo", "Guaratinguetá, São Paulo", "Aparecida, São Paulo"],
        "sourceUrl": "https://www.caminhosdenossasenhora.com/",
        "note": "Recorte automobilístico pelos núcleos do caminho; variantes exclusivamente pedestres ficam fora da geometria.",
    },
    "caminhos-franciscanos": {
        "waypoints": ["Teófilo Otoni, Minas Gerais", "Capitólio, Itambacuri, Minas Gerais", "Itambacuri, Minas Gerais"],
        "sourceUrl": "https://www.caminhosfranciscanos.com.br/",
        "note": "Ramal veicular principal Teófilo Otoni–Itambacuri.",
    },
    "caminhos-de-padre-liberio": {
        "waypoints": ["Pará de Minas, Minas Gerais", "São José da Varginha, Minas Gerais", "Pequi, Minas Gerais", "Onça de Pitangui, Minas Gerais", "Pitangui, Minas Gerais", "Conceição do Pará, Minas Gerais", "Leandro Ferreira, Minas Gerais"],
        "sourceUrl": "https://www.minasgerais.com.br/",
    },
    "caminho-das-capelas": {
        "waypoints": ["Inconfidentes, Minas Gerais", "Bom Repouso, Minas Gerais", "Tocos do Moji, Minas Gerais", "Inconfidentes, Minas Gerais"],
        "sourceUrl": "https://www.minasgerais.com.br/",
        "note": "Circuito veicular pelas comunidades rurais e capelas de Inconfidentes, Bom Repouso e Tocos do Moji.",
    },
    "caminho-de-sao-jose-patriarca": {
        "waypoints": ["Itatiba, São Paulo", "Jundiaí, São Paulo", "Serra do Japi, Jundiaí, São Paulo", "Cabreúva, São Paulo", "Pirapora do Bom Jesus, São Paulo", "Itu, São Paulo"],
        "sourceUrl": "https://caminhodesaojose.com.br/",
        "note": "Recorte veicular do caminho histórico entre Itatiba e Itu.",
    },
}


def main():
    output = []
    for route_id, route_spec in ROUTES.items():
        try:
            result = build_route(route_id, route_spec)
        except Exception as error:
            raise RuntimeError(f"Falha ao gerar {route_id}: {error}") from error
        output.append(result)
        print(f"built {result[0]}: {result[1]:.1f} km, {result[2]} line(s)")
    print(f"generated {len(output)} new Brazilian vehicle routes")


if __name__ == "__main__":
    main()
