#!/usr/bin/env python3
"""Build static geometry for Latin-American iconic road corridors.

The app compares recorded trips against static polyline5 geometries. Long or
transnational corridors are routed through curated milestones on the OSM road graph
(OSRM). The Pan-American Highway deliberately remains split at the Darién Gap.
"""

from __future__ import annotations

import json
import math
import os
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "iconic-routes" / "v1"
USER_AGENT = "minhas-viagens-iconic-route-builder/1.3 (+https://github.com/lcmsarq-creator/minhas-viagens)"
OSRM_ENDPOINTS = ("https://router.project-osrm.org/route/v1/driving",)


def line(label, points):
    return {"label": label, "points": points}


def route(lines, source_url, note, relation_ids=None, min_km=20):
    return {
        "lines": lines,
        "source_type": "routed-waypoints",
        "source_url": source_url,
        "osm_relation_ids": relation_ids or [],
        "note": note,
        "min_km": min_km,
    }


ROUTES = {
    "via-panamericana": route([
        line("Nuevo Laredo–Yaviza", [
            (27.4994,-99.5073),(25.6866,-100.3161),(24.8577,-99.5674),(23.7369,-99.1411),
            (22.7433,-98.9711),(21.9833,-99.0167),(21.2590,-98.7890),(20.1011,-98.7591),
            (19.4326,-99.1332),(19.0414,-98.2063),(17.8079,-97.7796),(17.0732,-96.7266),
            (16.3246,-95.2380),(16.7516,-93.1029),(16.7370,-92.6376),(16.2470,-92.1350),
            (15.6630,-92.1460),(14.6349,-90.5069),(13.6929,-89.2182),(13.3003,-87.1908),
            (12.1150,-86.2362),(9.9281,-84.0907),(8.5330,-82.8380),(8.4333,-82.4333),
            (8.9824,-79.5199),(8.1587,-77.6928),
        ]),
        line("Colombia–Buenos Aires", [
            (8.0928,-76.7282),(6.2442,-75.5812),(3.4516,-76.5320),(2.4448,-76.6147),
            (1.2136,-77.2811),(0.8303,-77.6444),(-0.1807,-78.4678),(-1.2491,-78.6168),
            (-1.6636,-78.6546),(-2.9001,-79.0059),(-3.9931,-79.2042),(-4.3789,-79.9430),
            (-5.1945,-80.6328),(-6.7714,-79.8409),(-8.1091,-79.0215),(-12.0464,-77.0428),
            (-13.7135,-76.1842),(-14.8340,-74.9380),(-16.4090,-71.5375),(-18.0146,-70.2536),
            (-18.4783,-70.3126),(-23.6509,-70.3975),(-29.9027,-71.2519),(-32.8400,-70.9560),
            (-32.8337,-70.5980),(-32.8895,-68.8458),(-33.3017,-66.3378),(-34.6037,-58.3816),
        ]),
    ], "https://wiki.openstreetmap.org/wiki/Pan-American_Highway",
       "Eixo principal latino-americano em dois trechos, separado pelo Tapón del Darién; ramais para Quellón e Ushuaia não integram este recorte inicial.",
       [1661488,240861], 100),

    "carretera-austral": route([
        line("Puerto Montt–Villa O'Higgins", [
            (-41.4717,-72.9369),(-41.6890,-72.6740),(-41.9690,-72.4720),(-42.6070,-72.6100),
            (-42.9167,-72.7167),(-43.9740,-72.4050),(-44.3260,-72.5570),(-45.5712,-72.0685),
            (-46.6260,-72.6700),(-47.2530,-72.5720),(-47.9700,-73.1350),(-48.4666,-72.5592),
        ])
    ], "https://www.openstreetmap.org/relation/6582701",
       "Ruta 7 / Longitudinal Austral; o corredor inclui as conexões marítimas que fazem parte da travessia.", [6582701], 100),

    "ruta-40-argentina": route([
        line("Cabo Vírgenes–La Quiaca", [
            (-52.3310,-68.3570),(-51.6230,-69.2160),(-50.3370,-72.2640),(-48.7500,-70.2500),
            (-46.5900,-70.9300),(-45.8600,-67.4800),(-42.9100,-71.3200),(-41.1330,-71.3100),
            (-38.9000,-70.0600),(-37.3800,-70.2700),(-35.4700,-69.5800),(-32.8895,-68.8458),
            (-31.5375,-68.5364),(-29.1650,-67.4970),(-28.4680,-65.7790),(-26.0730,-65.9760),
            (-25.1200,-66.1660),(-24.7821,-65.4232),(-23.7450,-65.4990),(-22.1050,-65.5960),
        ])
    ], "https://www.argentina.gob.ar/noticias/ruta-40-un-puente-al-conocimiento",
       "Ruta Nacional 40, corredor andino argentino de Cabo Vírgenes a La Quiaca.", min_km=100),

    "mexico-1-transpeninsular": route([
        line("Tijuana–Cabo San Lucas", [
            (32.5149,-117.0382),(31.8667,-116.5964),(30.4833,-115.9500),(28.0000,-114.0000),
            (27.9600,-114.0550),(27.3400,-112.2700),(26.0100,-111.3500),(25.0330,-111.6700),
            (24.1426,-110.3128),(23.4464,-110.2265),(22.8905,-109.9167),
        ])
    ], "https://www.openstreetmap.org/",
       "Carretera Federal 1 / Transpeninsular, eixo rodoviário da Baja California até Cabo San Lucas.", min_km=100),

    "ruta-siete-lagos": route([
        line("San Martín de los Andes–Villa La Angostura", [
            (-40.1570,-71.3520),(-40.3150,-71.4000),(-40.4600,-71.5200),(-40.5660,-71.5600),
            (-40.6740,-71.6170),(-40.7620,-71.6460),
        ])
    ], "https://www.argentina.gob.ar/node/475018",
       "Trecho cênico da RN 40 entre San Martín de los Andes e Villa La Angostura.", min_km=70),

    "ruta-3-fin-del-mundo": route([
        line("Buenos Aires–Río Gallegos", [
            (-34.6037,-58.3816),(-36.7769,-59.8586),(-38.7183,-62.2663),(-40.8135,-62.9967),
            (-42.7692,-65.0385),(-43.2489,-65.3051),(-45.8641,-67.4966),(-46.4426,-67.5172),
            (-47.7516,-65.9014),(-49.3069,-67.7298),(-50.0247,-68.5244),(-51.6230,-69.2160),
        ]),
        line("San Sebastián–Bahía Lapataia", [
            (-53.3220,-68.6550),(-53.7877,-67.7002),(-54.8019,-68.3030),(-54.8470,-68.5000),
        ]),
    ], "https://www.argentina.gob.ar/noticias/la-guia-turistica-de-la-ruta-nacional-3-esta-en-camino",
       "Ruta Nacional 3 rumo ao Fin del Mundo; o trecho argentino da Terra do Fogo termina em Bahía Lapataia.", min_km=50),

    "espinazo-del-diablo": route([
        line("Durango–Mazatlán pela Federal 40", [
            (24.0277,-104.6532),(23.9460,-105.0570),(23.7830,-105.3650),(23.6630,-105.6360),
            (23.6250,-105.8140),(23.5300,-105.9500),(23.3500,-106.0800),(23.2494,-106.4111),
        ])
    ], "https://www.openstreetmap.org/",
       "Trecho histórico da Federal 40 pela Sierra Madre Occidental, conhecido como Espinazo del Diablo.", min_km=80),

    "paso-de-jama": route([
        line("Jujuy–San Pedro de Atacama", [
            (-24.1858,-65.2995),(-23.7450,-65.4990),(-23.3990,-66.3670),(-23.2400,-67.0200),
            (-22.9110,-68.1990),
        ])
    ], "https://www.argentina.gob.ar/seguridad/pasosinternacionales/detalle/ruta/19/Jama",
       "Travessia andina pela RN 52 argentina e CH-27 chilena, via Paso de Jama.", min_km=100),

    "carretera-interoceanica-sur": route([
        line("Rio Branco–Matarani", [
            (-9.9740,-67.8250),(-10.9380,-69.5660),(-10.9500,-69.5800),(-12.5930,-69.1890),
            (-13.5300,-71.9600),(-14.0000,-71.2300),(-15.4930,-70.1350),(-16.4090,-71.5375),
            (-17.0050,-72.1050),
        ])
    ], "https://repositorio.promperu.gob.pe/items/0108979d-49a4-48ff-8a96-1fd3c580a3df",
       "Corredor Interoceânico Sul Peru–Brasil, no eixo Acre–Madre de Dios–Cusco/Puno–Pacífico.", min_km=100),

    "br-230-transamazonica": route([
        line("Cabedelo–Lábrea", [
            (-6.9810,-34.8330),(-7.1195,-34.8450),(-7.2306,-35.8811),(-7.0170,-37.2760),
            (-7.0760,-41.4670),(-6.7710,-43.0220),(-7.5320,-46.0350),(-5.3686,-49.1178),
            (-3.2030,-52.2060),(-4.2760,-55.9830),(-6.2230,-57.7520),(-7.5100,-63.0260),
            (-7.2580,-64.7980),
        ])
    ], "https://www.gov.br/dnit/pt-br/assuntos/noticias/dnit-entrega-17-quilometros-revitalizados-da-br-230-aos-paraenses",
       "BR-230 / Transamazônica, de Cabedelo rumo ao interior amazônico até Lábrea.", min_km=100),

    "paso-los-libertadores": route([
        line("Mendoza–Santiago", [
            (-32.8895,-68.8458),(-32.5930,-69.3480),(-32.8250,-69.9100),(-32.8240,-70.0740),
            (-32.8337,-70.5980),(-32.8400,-70.9560),(-33.4489,-70.6693),
        ])
    ], "https://www.argentina.gob.ar/",
       "Corredor transandino RN 7 / CH-60 pelo Paso Internacional Los Libertadores.", min_km=100),

    "avenida-de-los-volcanes": route([
        line("Quito–Cuenca pela E35", [
            (-0.1807,-78.4678),(-0.9350,-78.6150),(-1.2491,-78.6168),(-1.6636,-78.6546),
            (-2.2000,-78.8470),(-2.9001,-79.0059),
        ])
    ], "https://www.openstreetmap.org/",
       "Corredor andino equatoriano da E35, tradicionalmente associado à Avenida de los Volcanes.", min_km=100),

    "camino-de-los-yungas": route([
        line("La Cumbre–Yolosa", [
            (-16.3270,-68.0410),(-16.3000,-67.9880),(-16.2850,-67.9500),(-16.2500,-67.9000),
            (-16.2150,-67.8500),(-16.1900,-67.7950),
        ])
    ], "https://www.openstreetmap.org/",
       "Antigo Camino de los Yungas / Camino de la Muerte, descendo de La Cumbre em direção a Yolosa.", min_km=25),

    "ch5-atacama": route([
        line("La Serena–Arica pela CH-5", [
            (-29.9027,-71.2519),(-27.3668,-70.3323),(-26.3500,-70.6200),(-23.6509,-70.3975),
            (-22.0900,-70.1950),(-20.2307,-70.1357),(-18.4783,-70.3126),
        ])
    ], "https://concesiones.mop.gob.cl/project/ruta-5-tramo-caldera-antofagasta/",
       "Trecho da Ruta 5 / Panamericana que atravessa o Deserto do Atacama entre La Serena e Arica.", min_km=100),
}


def haversine(a, b):
    lat1, lon1 = map(math.radians, a); lat2, lon2 = map(math.radians, b)
    dlat, dlon = lat2-lat1, lon2-lon1
    h = math.sin(dlat/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2
    return 6371.0088 * 2 * math.asin(min(1.0, math.sqrt(h)))


def route_osrm(points):
    coordinates = ";".join(f"{lon:.6f},{lat:.6f}" for lat, lon in points)
    query = urllib.parse.urlencode({"overview":"full","geometries":"geojson","steps":"false"})
    last_error = None
    for endpoint in OSRM_ENDPOINTS:
        try:
            request = urllib.request.Request(f"{endpoint}/{coordinates}?{query}", headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=300) as response:
                payload = json.load(response)
            if payload.get("code") != "Ok" or not payload.get("routes"):
                raise RuntimeError(f"routing response {payload.get('code','unknown')}")
            return [(float(lat),float(lon)) for lon,lat in payload["routes"][0]["geometry"]["coordinates"]]
        except Exception as exc:
            last_error = exc
    raise RuntimeError(f"OSM routing failed: {last_error}")


def point_segment_distance_m(point, a, b):
    lat0 = math.radians(point[0]); kx, ky = 111320.0*math.cos(lat0), 111320.0
    px,py = point[1]*kx,point[0]*ky; ax,ay = a[1]*kx,a[0]*ky; bx,by = b[1]*kx,b[0]*ky
    dx,dy = bx-ax,by-ay
    if dx == 0 and dy == 0: return math.hypot(px-ax,py-ay)
    t = max(0.0,min(1.0,((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy)))
    return math.hypot(px-(ax+t*dx),py-(ay+t*dy))


def simplify(points, tolerance_m=12.0):
    if len(points) <= 2: return points
    keep={0,len(points)-1}; stack=[(0,len(points)-1)]
    while stack:
        first,last=stack.pop(); a,b=points[first],points[last]; best_distance,best_index=-1.0,None
        for index in range(first+1,last):
            distance=point_segment_distance_m(points[index],a,b)
            if distance>best_distance: best_distance,best_index=distance,index
        if best_index is not None and best_distance>tolerance_m:
            keep.add(best_index); stack.append((first,best_index)); stack.append((best_index,last))
    return [points[index] for index in sorted(keep)]


def encode_polyline(points, precision=5):
    factor=10**precision; output=[]; previous_lat=previous_lon=0
    for lat,lon in points:
        lat_i,lon_i=int(round(lat*factor)),int(round(lon*factor))
        for value in (lat_i-previous_lat,lon_i-previous_lon):
            value=~(value<<1) if value<0 else value<<1
            while value>=0x20:
                output.append(chr((0x20|(value&0x1f))+63)); value >>= 5
            output.append(chr(value+63))
        previous_lat,previous_lon=lat_i,lon_i
    return "".join(output)


def line_km(points):
    return sum(haversine(a,b) for a,b in zip(points,points[1:]))


def bounds(lines):
    pts=[p for line_points in lines for p in line_points]
    return [[round(min(p[0] for p in pts),6),round(min(p[1] for p in pts),6)],
            [round(max(p[0] for p in pts),6),round(max(p[1] for p in pts),6)]]


def build_route(route_id, config):
    lines=[]; segments=[]
    for definition in config["lines"]:
        raw=route_osrm(definition["points"]); simplified=simplify(raw); distance=line_km(raw)
        if distance < config.get("min_km",20):
            raise RuntimeError(f"{route_id}/{definition['label']} returned an implausibly short route: {distance:.1f} km")
        print(f"{route_id}/{definition['label']}: {len(raw)} -> {len(simplified)} points, {distance:.1f} km")
        lines.append(simplified); segments.append({"label":definition["label"],"totalKm":round(distance,3)})
    payload={
        "kind":"iconic_route_geometry","schema":"iconic-route-polyline5-v1","id":route_id,"precision":5,
        "encodedLines":[encode_polyline(line_points) for line_points in lines],
        "totalKm":round(sum(line_km(line_points) for line_points in lines),3),"bounds":bounds(lines),
        "sourceType":config["source_type"],"sourceUrl":config["source_url"],
        "osmRelationIds":config.get("osm_relation_ids",[]),"segments":segments,"note":config["note"],
    }
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/f"{route_id}.json").write_text(json.dumps(payload,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
    return payload


def main():
    selected=os.environ.get("ICONIC_ROUTE","").strip()
    entries=ROUTES.items() if not selected else [(selected,ROUTES[selected])]
    for route_id,config in entries:
        payload=build_route(route_id,config)
        print(f"wrote {route_id}: {payload['totalKm']:.1f} km, {len(payload['encodedLines'])} line(s)")


if __name__ == "__main__":
    main()
