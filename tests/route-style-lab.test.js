const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const lab = require("../route-style-lab.js");

test("o laboratório fornece os três estilos HSL padrão", () => {
  assert.deepEqual(lab.style("common"), { h: 152, s: 29, l: 31, width: 5, color: "hsl(152 29% 31%)" });
  assert.deepEqual(lab.style("gold"), { h: 43, s: 75, l: 48, width: 6, color: "hsl(43 75% 48%)" });
  assert.deepEqual(lab.style("silver"), { h: 204, s: 8, l: 71, width: 5, color: "hsl(204 8% 71%)" });
});

test("valores importados são limitados e dados inválidos voltam ao padrão", () => {
  const value = lab.sanitize({
    common: { h: 500, s: -20, l: "inválido", width: 20 },
    gold: { h: 12.6, s: 44.4, l: 55.6, width: 4.74 }
  });
  assert.deepEqual(value.common, { h: 360, s: 0, l: 31, width: 12 });
  assert.deepEqual(value.gold, { h: 13, s: 44, l: 56, width: 4.5 });
  assert.deepEqual(value.silver, lab.DEFAULTS.silver);
});

test("a inicialização carrega o laboratório antes do mapa principal", () => {
  const auth = fs.readFileSync("auth.js", "utf8");
  assert.ok(auth.indexOf('"route-style-lab.js"') < auth.indexOf('"script.js"'));
});

test("a antiga cor individual por viagem não participa mais do mapa nem do formulário", () => {
  const script = fs.readFileSync("script.js", "utf8");
  const html = fs.readFileSync("index.html", "utf8");
  assert.doesNotMatch(script, /trip\.color|tripColor|newTripColorWheel/);
  assert.doesNotMatch(html, /tripColor|newTripColorWheel|Cor da rota/);
  assert.match(script, /currentRouteStyle\("common"\)/);
});
