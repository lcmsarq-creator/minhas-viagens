#!/usr/bin/env python3
from pathlib import Path

path = Path('scripts/build_brazil_park_pilgrimage_routes.py')
text = path.read_text(encoding='utf-8')

for route_id, road in [
    ('estrada-parque-brigadeiro-silva-paes', 'sc/410.json'),
    ('estrada-parque-terra-vermelha-garatuba', 'se/430.json'),
]:
    marker = f'''    "{route_id}": {{\n        "roads": ["{road}"],'''
    replacement = marker + '''\n        "wholeRoad": True,'''
    block = text.split(f'"{route_id}": {{', 1)[1].split('},', 1)[0]
    if '"wholeRoad": True' not in block:
        if marker not in text:
            raise SystemExit(f'route block not found: {route_id}')
        text = text.replace(marker, replacement, 1)

path.write_text(text, encoding='utf-8')
print('SC-410 and SE-430 forced to use complete hosted road geometry')
