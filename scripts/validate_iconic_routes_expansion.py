#!/usr/bin/env python3
import json
from pathlib import Path
p=json.loads(Path('data/iconic-routes-expansion-source.json').read_text())
assert len(p['parkRoads']) == 33
assert len(p['paths']) == 15
assert len(p['estradaReal']) == 4
names=[x[1] for k in ('parkRoads','paths','estradaReal') for x in p[k]]
assert len(names)==52 and len(set(names))==52
assert 'Caminho do Itupava' not in names
assert 'Caminho do Peabiru' not in names
print('Fonte validada:', len(names), 'candidatas antes da deduplicação contra o catálogo atual')
