const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const exporter = require("../road-export-core.js");

test("a planilha inclui as seis colunas solicitadas e mantém km e porcentagem numéricos", () => {
  const xml = exporter.worksheetXml([{
    road: "BR-101",
    traveledKm: 123.45,
    totalKm: 456.78,
    percent: 27,
    startCity: "Joinville",
    endCity: "Florianópolis"
  }]);

  for (const header of exporter.HEADERS) assert.ok(xml.includes(header));
  assert.match(xml, /<c r="B2" s="3"><v>123\.45<\/v><\/c>/);
  assert.match(xml, /<c r="C2" s="3"><v>456\.78<\/v><\/c>/);
  assert.match(xml, /<c r="D2" s="2"><v>0\.27<\/v><\/c>/);
  assert.ok(xml.includes("Florianópolis"));
});

test("falha de geometria deixa métricas vazias em vez de converter valores vazios em zero", () => {
  const xml = exporter.worksheetXml([{ road: "BR-000", traveledKm: "", totalKm: "", percent: "" }]);

  assert.match(xml, /<c r="B2" t="inlineStr" s="3"><is><t xml:space="preserve"><\/t><\/is><\/c>/);
  assert.match(xml, /<c r="C2" t="inlineStr" s="3"><is><t xml:space="preserve"><\/t><\/is><\/c>/);
  assert.match(xml, /<c r="D2" t="inlineStr" s="2"><is><t xml:space="preserve"><\/t><\/is><\/c>/);
});

test("o arquivo gerado usa a assinatura ZIP do formato xlsx", () => {
  const workbook = exporter.createWorkbook([]);

  assert.deepEqual([...workbook.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  assert.deepEqual([...workbook.slice(-22, -18)], [0x50, 0x4b, 0x05, 0x06]);
});

test("o botão fica na aba Rodovias e carrega o gerador antes do app", () => {
  const html = fs.readFileSync("index.html", "utf8");
  const auth = fs.readFileSync("auth.js", "utf8");
  const app = fs.readFileSync("script.js", "utf8");

  assert.match(html, /id="roadAchievementsView"[\s\S]*?id="exportRoadProgressBtn"/);
  assert.ok(auth.indexOf('"road-export-core.js"') < auth.indexOf('"script.js"'));
  assert.match(app, /getElementById\("exportRoadProgressBtn"\).*addEventListener\("click", exportRoadProgressExcel\)/);
});
