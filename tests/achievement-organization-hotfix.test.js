const test = require("node:test");
const assert = require("node:assert/strict");
const api = require("../achievement-organization-hotfix.js");

const states = [
  { uf:"SP", name:"São Paulo" },
  { uf:"MG", name:"Minas Gerais" },
  { uf:"RS", name:"Rio Grande do Sul" }
];

test("cidades cruzadas preservam estado e país para agrupamento", () => {
  const trips = [{
    id:"1", name:"Viagem teste", date:"2026-09-01",
    startPlace:{city:"Origem",region:"São Paulo",country:"Brasil",countryCode:"BR",lat:-20,lng:-49},
    endPlace:{city:"Destino",region:"Minas Gerais",country:"Brasil",countryCode:"BR",lat:-19,lng:-46},
    routeCityConquests:[
      {city:"Campinas",region:"São Paulo",country:"Brasil",countryCode:"BR",lat:-22.9,lng:-47.1},
      {city:"Rivera",region:"Rivera",country:"Uruguai",countryCode:"UY",lat:-30.9,lng:-55.5}
    ]
  }];
  const crossed = api.crossedCities(trips);
  assert.equal(crossed.length,2);
  assert.equal(crossed[0].region,"São Paulo");
  assert.equal(crossed[0].countryCode,"BR");
  assert.equal(crossed[1].countryCode,"UY");
});

test("rotas icônicas seguem BRs, estaduais e internacionais", () => {
  const routes = [
    {id:"int",name:"Ruta 40",category:"Cênica",region:"Argentina",roadRefs:["INT:AR:RN:40"]},
    {id:"sp1",name:"Estrada Parque",category:"Estrada-parque",region:"São Paulo",roadRefs:["SP-139"]},
    {id:"br",name:"Transamazônica",category:"Aventura",region:"Brasil",roadRefs:["BR-230"]},
    {id:"sp2",name:"Caminho de teste",category:"Peregrinação",region:"São Paulo",roadRefs:[]},
    {id:"mg",name:"Serra mineira",category:"Serra",region:"Minas Gerais",roadRefs:["MG-050"]}
  ];
  const grouped = api.groupIconicRoutes(routes, states);
  assert.deepEqual(grouped.br.map(route=>route.id),["br"]);
  assert.deepEqual(grouped.international.map(route=>route.id),["int"]);
  assert.equal(grouped.states[0].key,"SP");
  assert.equal(grouped.states[0].routes.length,2);
  assert.equal(grouped.states[0].routes[0].id,"sp1");
  assert.equal(grouped.states[0].routes[1].id,"sp2");
});

test("Estrada Real, Estradas-Parque e Caminhos têm prioridade interna", () => {
  const values = [
    {name:"Rota comum",category:"Cênica"},
    {name:"Caminho Histórico",category:"Histórica"},
    {name:"Estrada Parque X",category:"Estrada-parque"},
    {name:"Estrada Real — Caminho Novo",family:"Estrada Real",category:"Histórica"}
  ];
  assert.deepEqual(values.sort((a,b)=>api.routeFamilyPriority(a)-api.routeFamilyPriority(b)).map(item=>item.name),[
    "Estrada Real — Caminho Novo","Estrada Parque X","Caminho Histórico","Rota comum"
  ]);
});
