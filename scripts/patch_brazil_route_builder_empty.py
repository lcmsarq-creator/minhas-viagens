#!/usr/bin/env python3
from pathlib import Path
p=Path('scripts/build_brazil_park_pilgrimage_routes.py')
text=p.read_text(encoding='utf-8')
old='''        if lines is None:\n            lines = helper.route_with_osrm(waypoints)\n'''
new='''        if lines is not None and not any(len(line) > 1 for line in lines):\n            print(f"warning: {route_id}: catálogo rodoviário retornou geometria vazia; usando OSRM")\n            lines = None\n        if lines is None:\n            lines = helper.route_with_osrm(waypoints)\n'''
if new not in text:
    if old not in text:
        raise SystemExit('fallback marker not found')
    text=text.replace(old,new,1)
p.write_text(text,encoding='utf-8')
print('empty road-catalog fallback enabled')
