from pathlib import Path

path = Path('v0147-crossed-cities-local.js')
text = path.read_text(encoding='utf-8')
text = text.replace('const SCHEMA = "route-city-crossings-v7-local-ar-uy";', 'const SCHEMA = "route-city-crossings-v8-local-south-america";')
old = '''  const LOCAL_CATALOGS = Object.freeze({
    AR: { path:"city-catalog/v1/ar.json", country:"Argentina" },
    UY: { path:"city-catalog/v1/uy.json", country:"Uruguai" }
  });'''
new = '''  const LOCAL_CATALOGS = Object.freeze({
    AR: { path:"city-catalog/v1/ar.json", country:"Argentina" },
    UY: { path:"city-catalog/v1/uy.json", country:"Uruguai" },
    PY: { path:"city-catalog/v1/py.json", country:"Paraguai" },
    PE: { path:"city-catalog/v1/pe.json", country:"Peru" },
    BO: { path:"city-catalog/v1/bo.json", country:"Bolívia" },
    CL: { path:"city-catalog/v1/cl.json", country:"Chile" },
    CO: { path:"city-catalog/v1/co.json", country:"Colômbia" },
    VE: { path:"city-catalog/v1/ve.json", country:"Venezuela" },
    EC: { path:"city-catalog/v1/ec.json", country:"Equador" }
  });'''
if old not in text:
    raise SystemExit('LOCAL_CATALOGS original não encontrado')
text = text.replace(old, new)
text = text.replace('payload?.schema !== "mv-city-catalog-v1"', 'payload?.schema !== "mv-city-catalog-v2"')
text = text.replace('cidades cruzadas por catálogo local brasileiro habilitadas.', 'cidades cruzadas por catálogos locais sul-americanos habilitadas.')
path.write_text(text, encoding='utf-8')

# Atualiza referências textuais do teste antigo sem mudar o nome do arquivo nesta release.
for p in [Path('tests/v0147-crossed-cities-local.test.js'), Path('tests/v0146-crossed-cities-runtime.test.js')]:
    if not p.exists():
        continue
    s = p.read_text(encoding='utf-8')
    s = s.replace('route-city-crossings-v7-local-ar-uy', 'route-city-crossings-v8-local-south-america')
    p.write_text(s, encoding='utf-8')
