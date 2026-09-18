#!/usr/bin/env python3
from pathlib import Path
import re
import shutil
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SRC = Path('/tmp/minhas-viagens-shields')
DST = ROOT / 'assets' / 'road-shields'

FILES = {
    'cri_national-default.svg': 'cri_national-default.svg',
    'mex_national-default.svg': 'mex_national-default.svg',
    'nic_national-default.svg': 'nic_national-default.svg',
    'pan_national-default.svg': 'pan_national-default.svg',
    'gua_national-default.svg': 'gua_national-default.svg',
    'usa_interstate-default.svg': 'usa_interstate-default.svg',
    'usa_national-default.svg': 'usa_national-default.svg',
    'genérico.svg': 'generic-national-default.svg',
}

EXPECTED = {
    'cri_national-default.svg': ('0 0 865.1337 865.1239', 136.4438, 384.2836, 594.8482, 294.9111),
    'mex_national-default.svg': ('0 0 651.5297 867.8801', 134.7931, 357.5967, 379.4219, 296.3033),
    'nic_national-default.svg': ('0 0 893.2065 866.042', 149.1791, 384.6707, 594.8482, 294.9111),
    'pan_national-default.svg': ('0 0 865.1337 865.124', 139.353, 384.2837, 594.8482, 294.9111),
    'gua_national-default.svg': ('0 0 894.6382 850.5259', 117.3166, 425.2629, 653.6734, 226.2536),
    'usa_interstate-default.svg': ('0 0 833.9034 833.6281', 141.9585, 251.7065, 550.0663, 365.6962),
    'usa_national-default.svg': ('0 0 671.5665 671.5665', 68.5777, 148.4956, 532.8764, 341.1956),
    'generic-national-default.svg': ('0 0 847.7616 832.7551', 155.0069, 213.0875, 542.1176, 409.8954),
}


def group_by_id(root, wanted):
    for element in root.iter():
        if element.attrib.get('id') == wanted:
            return element
    return None


def validate_svg(path, expected):
    root = ET.parse(path).getroot()
    if root.attrib.get('viewBox') != expected[0]:
        raise RuntimeError(f'{path.name}: viewBox inesperado {root.attrib.get("viewBox")}')
    for required in ('text-safe-area', 'shield-base', 'road-number-sample'):
        if group_by_id(root, required) is None:
            raise RuntimeError(f'{path.name}: grupo {required} ausente')
    safe = group_by_id(root, 'text-safe-area')
    rect = next((item for item in safe.iter() if item.tag.rsplit('}', 1)[-1] == 'rect'), None)
    if rect is None:
        raise RuntimeError(f'{path.name}: text-safe-area sem rect')
    values = tuple(float(rect.attrib[k]) for k in ('x', 'y', 'width', 'height'))
    if any(abs(a - b) > 0.001 for a, b in zip(values, expected[1:])):
        raise RuntimeError(f'{path.name}: safe area inesperada {values}')


def install_assets():
    DST.mkdir(parents=True, exist_ok=True)
    for source_name, target_name in FILES.items():
        source = SRC / source_name
        if not source.exists():
            raise RuntimeError(f'arquivo ausente no pacote: {source_name}')
        target = DST / target_name
        shutil.copyfile(source, target)
        validate_svg(target, EXPECTED[target_name])
        print(f'asset ok: {target_name}')


def patch_js():
    path = ROOT / 'international-road-shields.js'
    text = path.read_text(encoding='utf-8')
    text = re.sub(r'const APP_VERSION = "[^"]+";', 'const APP_VERSION = "0.13.19";', text, count=1)

    if 'MX: { name: "MEXICO"' not in text:
        old = '    BZ: { name: "BELIZE", network: "N" }\n  });'
        new = '    BZ: { name: "BELIZE", network: "N" },\n    MX: { name: "MEXICO", network: "MEX" },\n    US: { name: "ESTADOS UNIDOS", network: "US" }\n  });'
        if old not in text:
            raise RuntimeError('ponto de inserção COUNTRY_META não encontrado')
        text = text.replace(old, new, 1)

    if 'mexico: "MX"' not in text:
        old = '      honduras: "HN", "el salvador": "SV", guatemala: "GT", belize: "BZ"\n'
        new = '      honduras: "HN", "el salvador": "SV", guatemala: "GT", belize: "BZ",\n      mexico: "MX", "méxico": "MX", usa: "US", "united states": "US", "estados unidos": "US"\n'
        if old not in text:
            raise RuntimeError('ponto de inserção COUNTRY_CODE_BY_NAME não encontrado')
        text = text.replace(old, new, 1)

    if 'GENERIC: Object.freeze({' not in text:
        start = text.index('  const assets = Object.freeze({')
        end_marker = '\n  });\n\n  let clipSequence'
        end = text.index(end_marker, start)
        body = text[start:end].rstrip()
        entries = r''',
    CR: Object.freeze({
      asset: `assets/road-shields/cri_national-default.svg?v=${APP_VERSION}`,
      viewBox: "0 0 865.1337 865.1239",
      safe: Object.freeze({ x: 136.4438, y: 384.2836, width: 594.8482, height: 294.9111 }),
      color: "#010101"
    }),
    MX: Object.freeze({
      asset: `assets/road-shields/mex_national-default.svg?v=${APP_VERSION}`,
      viewBox: "0 0 651.5297 867.8801",
      safe: Object.freeze({ x: 134.7931, y: 357.5967, width: 379.4219, height: 296.3033 }),
      color: "#010101"
    }),
    NI: Object.freeze({
      asset: `assets/road-shields/nic_national-default.svg?v=${APP_VERSION}`,
      viewBox: "0 0 893.2065 866.042",
      safe: Object.freeze({ x: 149.1791, y: 384.6707, width: 594.8482, height: 294.9111 }),
      color: "#010101", networkPrefix: true
    }),
    PA: Object.freeze({
      asset: `assets/road-shields/pan_national-default.svg?v=${APP_VERSION}`,
      viewBox: "0 0 865.1337 865.124",
      safe: Object.freeze({ x: 139.353, y: 384.2837, width: 594.8482, height: 294.9111 }),
      color: "#010101"
    }),
    GT: Object.freeze({
      asset: `assets/road-shields/gua_national-default.svg?v=${APP_VERSION}`,
      viewBox: "0 0 894.6382 850.5259",
      safe: Object.freeze({ x: 117.3166, y: 425.2629, width: 653.6734, height: 226.2536 }),
      color: "#010101", networkPrefix: true
    }),
    US: Object.freeze({
      asset: `assets/road-shields/usa_national-default.svg?v=${APP_VERSION}`,
      viewBox: "0 0 671.5665 671.5665",
      safe: Object.freeze({ x: 68.5777, y: 148.4956, width: 532.8764, height: 341.1956 }),
      color: "#010101"
    }),
    US_INTERSTATE: Object.freeze({
      asset: `assets/road-shields/usa_interstate-default.svg?v=${APP_VERSION}`,
      viewBox: "0 0 833.9034 833.6281",
      safe: Object.freeze({ x: 141.9585, y: 251.7065, width: 550.0663, height: 365.6962 }),
      color: "#fefefe"
    }),
    GENERIC: Object.freeze({
      asset: `assets/road-shields/generic-national-default.svg?v=${APP_VERSION}`,
      viewBox: "0 0 847.7616 832.7551",
      safe: Object.freeze({ x: 155.0069, y: 213.0875, width: 542.1176, height: 409.8954 }),
      color: "#010101"
    })'''
        text = text[:start] + body + entries + text[end:]

    nic_anchor = '    match = value.match(/^NIC\\s*-?\\s*0*([0-9]{1,3}[A-Z]?)$/);\n    if (match) return canonical("NI", "NIC", match[1]);\n'
    if 'canonical("MX", "MEX"' not in text:
        addition = nic_anchor + '''    match = value.match(/^(?:MEX|MX|MEXICO|MÉXICO)\\s*-?\\s*0*([0-9]{1,4}[A-Z]?)$/);\n    if (match) return canonical("MX", "MEX", match[1]);\n    match = value.match(/^(?:I|INTERSTATE)\\s*-?\\s*0*([0-9]{1,3})$/);\n    if (match && hint === "US") return canonical("US", "I", match[1]);\n    match = value.match(/^(?:US|U\\.?S\\.?)\\s*-?\\s*0*([0-9]{1,3})$/);\n    if (match && hint === "US") return canonical("US", "US", match[1]);\n'''
        if nic_anchor not in text:
            raise RuntimeError('ponto de inserção dos parsers MX/US não encontrado')
        text = text.replace(nic_anchor, addition, 1)

    text = text.replace('["CO", "CR", "PA"].includes(hint)', '["CO", "CR", "PA", "MX", "US"].includes(hint)', 1)
    if 'nationalRefForHint(value, "MX")' not in text:
        marker = '    if (/^NIC\\s*-?\\s*\\d/.test(value)) add(nationalRefForHint(value, "NI"));\n'
        repl = marker + '    if (/^(?:MEX|MX|MEXICO|MÉXICO)\\s*-?\\s*\\d/.test(value)) add(nationalRefForHint(value, "MX"));\n'
        if marker not in text:
            raise RuntimeError('ponto de inserção candidate MX não encontrado')
        text = text.replace(marker, repl, 1)

    start = text.index('  function svgCountryShield(')
    end = text.index('  const baseRoadShieldMarkup', start)
    functions = r'''  function shieldConfig(countryCode, network = "") {
    if (countryCode === "US" && String(network).toUpperCase() === "I") return assets.US_INTERSTATE;
    return assets[countryCode] || null;
  }

  function shieldValue(countryCode, network, number, config) {
    let value = String(number || "").toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 6);
    if (!value) return "";
    if (config?.pad2 && /^\d$/.test(value)) value = value.padStart(2, "0");
    if (config?.networkPrefix && network) value = `${String(network).toUpperCase()}-${value}`;
    else if (config?.prefix) value = `${config.prefix}${value}`;
    return value;
  }

  function svgShieldFromConfig(config, countryCode, value, size, ariaLabel) {
    if (!config || !value) return "";
    const safe = config.safe;
    const x = safe.x + safe.width / 2;
    const y = safe.y + safe.height / 2;
    const fontSize = fontSizeFor(value, safe);
    const clipId = `mv-int-${String(countryCode || "generic").toLowerCase().replace(/[^a-z0-9]/g, "-")}-${++clipSequence}`;
    return `<svg class="road-emblem-svg international ${String(countryCode || "generic").toLowerCase()} ${escapeMarkup(size)}" viewBox="${config.viewBox}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeMarkup(ariaLabel)}">
      <defs><clipPath id="${clipId}"><rect x="${safe.x}" y="${safe.y}" width="${safe.width}" height="${safe.height}"/></clipPath></defs>
      <use href="${config.asset}#shield-base"/>
      <text x="${x.toFixed(4)}" y="${y.toFixed(4)}" clip-path="url(#${clipId})" fill="${config.color}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize.toFixed(1)}" font-weight="700" text-anchor="middle" dominant-baseline="middle">${escapeMarkup(value)}</text>
    </svg>`;
  }

  function svgCountryShield(countryCode, number, size, network = "") {
    const config = shieldConfig(countryCode, network);
    if (!config) return "";
    const value = shieldValue(countryCode, network, number, config);
    const name = COUNTRY_META[countryCode]?.name || countryCode;
    return svgShieldFromConfig(config, countryCode, value, size, `${name}, ${value}`);
  }

  function genericInternationalShield(parsed, size) {
    const meta = COUNTRY_META[parsed.countryCode] || { name: parsed.countryCode, network: parsed.network };
    const value = shieldValue(parsed.countryCode, parsed.network, parsed.number, assets.GENERIC);
    return svgShieldFromConfig(
      assets.GENERIC,
      "generic",
      value,
      size,
      `${meta.name || parsed.countryCode}, ${parsed.network} ${parsed.number}`
    );
  }

'''
    text = text[:start] + functions + text[end:]

    old = '      if (assets[parsed.countryCode]) return svgCountryShield(parsed.countryCode, parsed.number, size);\n      return genericInternationalShield(parsed, size);'
    new = '      if (shieldConfig(parsed.countryCode, parsed.network)) return svgCountryShield(parsed.countryCode, parsed.number, size, parsed.network);\n      return genericInternationalShield(parsed, size);'
    if old not in text:
        raise RuntimeError('ponto de troca do roadShieldMarkup não encontrado')
    text = text.replace(old, new, 1)

    text = text.replace('escudos nacionais da América do Sul e fallback internacional das Américas habilitados.', 'escudos nacionais das Américas e fallback SVG internacional habilitados.')
    path.write_text(text, encoding='utf-8')


def bump_app_version():
    for filename in ('index.html', 'auth.js'):
        path = ROOT / filename
        text = path.read_text(encoding='utf-8').replace('0.13.18', '0.13.19')
        path.write_text(text, encoding='utf-8')


def write_tests():
    target = ROOT / 'tests' / 'international-road-shields-pack.test.js'
    target.write_text(r'''const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "international-road-shields.js"), "utf8");
const assets = [
  "cri_national-default.svg", "mex_national-default.svg", "nic_national-default.svg",
  "pan_national-default.svg", "gua_national-default.svg", "usa_interstate-default.svg",
  "usa_national-default.svg", "generic-national-default.svg"
];

test("pacote de escudos mantém o contrato vetorial do app", () => {
  for (const name of assets) {
    const svg = fs.readFileSync(path.join(root, "assets", "road-shields", name), "utf8");
    assert.match(svg, /viewBox="[^"]+"/);
    assert.match(svg, /id="text-safe-area"/);
    assert.match(svg, /id="shield-base"/);
    assert.match(svg, /id="road-number-sample"/);
    assert.doesNotMatch(svg, /<image\b/i);
  }
});

test("Costa Rica, México, Nicarágua, Panamá e Guatemala usam os SVG enviados", () => {
  assert.match(source, /CR: Object\.freeze\(\{/);
  assert.match(source, /cri_national-default\.svg/);
  assert.match(source, /MX: Object\.freeze\(\{/);
  assert.match(source, /mex_national-default\.svg/);
  assert.match(source, /NI: Object\.freeze\(\{/);
  assert.match(source, /nic_national-default\.svg/);
  assert.match(source, /PA: Object\.freeze\(\{/);
  assert.match(source, /pan_national-default\.svg/);
  assert.match(source, /GT: Object\.freeze\(\{/);
  assert.match(source, /gua_national-default\.svg/);
});

test("Estados Unidos escolhem shield nacional ou Interstate pela rede", () => {
  assert.match(source, /US_INTERSTATE: Object\.freeze\(\{/);
  assert.match(source, /usa_interstate-default\.svg/);
  assert.match(source, /usa_national-default\.svg/);
  assert.match(source, /countryCode === "US".*network.*=== "I"/s);
  assert.match(source, /canonical\("US", "I"/);
  assert.match(source, /canonical\("US", "US"/);
});

test("país sem emblema definido usa o SVG genérico enviado", () => {
  assert.match(source, /generic-national-default\.svg/);
  assert.match(source, /svgShieldFromConfig\(\s*assets\.GENERIC/s);
  assert.doesNotMatch(source, /M4 4H96V91L50 117L4 91Z/);
});

test("Guatemala e Nicarágua preservam o prefixo da rede no número", () => {
  assert.match(source, /GT: Object\.freeze\([\s\S]*?networkPrefix: true/);
  assert.match(source, /NI: Object\.freeze\([\s\S]*?networkPrefix: true/);
  assert.match(source, /`\$\{String\(network\).*?\}-\$\{value\}`/s);
});
''', encoding='utf-8')


if __name__ == '__main__':
    install_assets()
    patch_js()
    bump_app_version()
    write_tests()
    print('country shield pack integrated')
