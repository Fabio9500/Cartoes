// Teste de verificação REAL da integração Cartões (PF/PJ) → TesourariaSys —
// extrai as funções de verdade de CartoesPF.html/CartoesPJ.html (não
// reimplementa) e simula o pagamento de fatura de cartão gravando o débito
// direto no TesourariaSys (registrarDebitoTesouraria).
//
// Achado real nesta auditoria (04/08/2026): CartoesPF.html buscava o
// cadastro de categorias do PJ ('pj') em vez do PF ('pf') pra achar
// "Fatura Cartão de Crédito" — corrigido. Este teste roda pros DOIS
// arquivos (PF e PJ) e prova que cada um busca o cadastro CERTO — dando
// categorias DIFERENTES pra cada lado, um erro de cópia PF/PJ ficaria
// óbvio (categoria errada aplicada).
"use strict";
const fs = require('fs');

const ARQ = process.argv[2] || 'C:/Users/TELASUL/Projetos/Cartoes/CartoesPF.html';
const PFPJ_ESPERADO = ARQ.toLowerCase().includes('pj') ? 'pj' : 'pf';
const html = fs.readFileSync(ARQ, 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) { console.error('Não achei o <script> principal'); process.exit(1); }
const codigoCompleto = scriptMatch[1];

function extrairFuncao(nome, codigo) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + nome + '\\s*\\(');
  const m = re.exec(codigo);
  if (!m) throw new Error('Função ' + nome + ' não encontrada no arquivo real');
  let i = codigo.indexOf('{', m.index);
  let depth = 1, j = i + 1;
  while (depth > 0) {
    if (codigo[j] === '{') depth++;
    else if (codigo[j] === '}') depth--;
    j++;
  }
  return codigo.slice(m.index, j);
}

let funcoesReais = [
  'getTokenTesouraria', 'setTokenTesouraria', 'ghCadastroApi', 'ghCadastroCarregar',
  'registrarDebitoTesouraria', 'garantirAnoNoIndiceTesouraria',
].map(n => extrairFuncao(n, codigoCompleto)).join('\n\n');

console.log('--- Funções de integração extraídas verbatim de ' + ARQ + ' (arquivo esperado: ' + PFPJ_ESPERADO + ') ---');
console.log(funcoesReais.slice(0, 300) + '\n... (' + funcoesReais.length + ' caracteres no total) ...\n');

// ══════════════════════════════════════════
// GITHUB SIMULADO — repo Fabio9500/tesourariasys: cadastros-pf.json,
// cadastros-pj.json, lancamentos_<ano>.json e dados.json
// ══════════════════════════════════════════
let ghState = {
  cadastroPf: { categorias: [{ id: 'cat-fatura-PF', nome: 'Fatura Cartão de Crédito', tipo: 'despesa' }], centrosCusto: [], direcionamentos: [] },
  cadastroPj: { categorias: [{ id: 'cat-fatura-PJ', nome: 'Fatura Cartão de Crédito', tipo: 'despesa' }], centrosCusto: [], direcionamentos: [] },
  lancamentosPorAno: {}, // '2026' -> {conteudo:[...], sha:'...'}
  dadosJson: { anosLancamentos: ['2025'] },
  shaDados: 'sha-dados-0',
};
let ghShaSeq = 0;
function novoSha() { return 'sha-tsr-' + (++ghShaSeq); }
const chamadasPut = [];

global.fetch = async function (url, opts = {}) {
  const method = (opts && opts.method) || 'GET';
  if (url.includes('contents/cadastros-pf.json')) {
    if (method === 'GET') return { ok: true, status: 200, json: async () => ({ sha: 'sha-cad-pf', content: Buffer.from(JSON.stringify(ghState.cadastroPf)).toString('base64') }) };
  }
  if (url.includes('contents/cadastros-pj.json')) {
    if (method === 'GET') return { ok: true, status: 200, json: async () => ({ sha: 'sha-cad-pj', content: Buffer.from(JSON.stringify(ghState.cadastroPj)).toString('base64') }) };
  }
  const mAno = url.match(/contents\/lancamentos_(\d+)\.json/);
  if (mAno) {
    const ano = mAno[1];
    if (method === 'GET') {
      const atual = ghState.lancamentosPorAno[ano];
      if (!atual) return { status: 404, ok: false, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ sha: atual.sha, content: Buffer.from(JSON.stringify(atual.conteudo)).toString('base64') }) };
    }
    if (method === 'PUT') {
      const body = JSON.parse(opts.body);
      chamadasPut.push({ arquivo: 'lancamentos_' + ano, recebidoSha: body.sha });
      const atual = ghState.lancamentosPorAno[ano];
      if (atual && body.sha !== atual.sha) {
        return { ok: false, status: 409, json: async () => ({ message: 'sha mismatch (409 simulado)' }) };
      }
      const novoConteudo = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'));
      const sha = novoSha();
      ghState.lancamentosPorAno[ano] = { conteudo: novoConteudo, sha };
      return { ok: true, status: 200, json: async () => ({ content: { sha } }) };
    }
  }
  if (url.includes('contents/dados.json')) {
    if (method === 'GET') return { ok: true, status: 200, json: async () => ({ sha: ghState.shaDados, content: Buffer.from(JSON.stringify(ghState.dadosJson)).toString('base64') }) };
    if (method === 'PUT') {
      const body = JSON.parse(opts.body);
      chamadasPut.push({ arquivo: 'dados.json', recebidoSha: body.sha });
      ghState.dadosJson = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'));
      ghState.shaDados = novoSha();
      return { ok: true, status: 200, json: async () => ({ content: { sha: ghState.shaDados } }) };
    }
  }
  throw new Error('fetch simulado não sabe lidar com: ' + method + ' ' + url);
};

// ══════════════════════════════════════════
// Stubs mínimos exigidos pelas funções reais
// ══════════════════════════════════════════
let localStorageStore = {};
global.localStorage = {
  getItem: k => (k in localStorageStore ? localStorageStore[k] : null),
  setItem: (k, v) => { localStorageStore[k] = String(v); },
  removeItem: k => { delete localStorageStore[k]; },
};
Object.defineProperty(global, 'navigator', { value: { onLine: true }, writable: true, configurable: true });
global.document = { getElementById: () => ({ style: {}, textContent: '' }) };
global.console = console;
global.btoa = s => Buffer.from(s, 'binary').toString('base64');
global.atob = s => Buffer.from(s, 'base64').toString('binary');
global.encodeURIComponent = encodeURIComponent;
global.decodeURIComponent = decodeURIComponent;
// (mesma lição já registrada nos outros testes: NUNCA sobrescrever
// global.unescape/escape com require('querystring') — quebra o
// btoa(unescape(encodeURIComponent(...))) que este código usa pra gravar.)

async function buscarBlobGH() { return null; }
function uid() { return 'novo' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
let _cadastroSha = { pf: null, pj: null };

eval(funcoesReais + '\nglobal.__api = { getTokenTesouraria, setTokenTesouraria, ghCadastroCarregar, registrarDebitoTesouraria, garantirAnoNoIndiceTesouraria };');
const { setTokenTesouraria, ghCadastroCarregar, registrarDebitoTesouraria, garantirAnoNoIndiceTesouraria } = global.__api;

// ══════════════════════════════════════════
// TESTE 1 — ghCadastroCarregar('pf') busca cadastros-pf.json de verdade,
// ghCadastroCarregar('pj') busca cadastros-pj.json — nunca trocado.
// ══════════════════════════════════════════
async function teste1() {
  const cadPf = await ghCadastroCarregar('pf');
  const cadPj = await ghCadastroCarregar('pj');
  const ok = cadPf.categorias[0].id === 'cat-fatura-PF' && cadPj.categorias[0].id === 'cat-fatura-PJ';
  console.log('[TESTE 1] ghCadastroCarregar busca o arquivo certo (pf≠pj):', ok ? '✅ PASSOU' : '❌ FALHOU', '| pf:', cadPf.categorias[0]?.id, '| pj:', cadPj.categorias[0]?.id);
  return ok;
}

// ══════════════════════════════════════════
// TESTE 2 — O ACHADO REAL: registrarDebitoTesouraria() precisa usar a
// categoria do cadastro CERTO pro arquivo em que está rodando (PF usa
// cat-fatura-PF, PJ usa cat-fatura-PJ). Antes da correção, CartoesPF.html
// sempre buscava 'pj' — com categorias DIFERENTES configuradas pra cada
// lado (como neste teste), esse bug ficaria evidente: o débito do PF
// sairia com a categoria do PJ.
// ══════════════════════════════════════════
async function teste2() {
  setTokenTesouraria('fake-token');
  delete ghState.lancamentosPorAno['2026'];
  const res = await registrarDebitoTesouraria('conta-tsr-1', 500, '2026-08-04', 'Pagamento fatura teste');
  const lancamentos = ghState.lancamentosPorAno['2026']?.conteudo || [];
  const lanc = lancamentos.find(l => l.contaId === 'conta-tsr-1');
  const categoriaEsperada = 'cat-fatura-' + PFPJ_ESPERADO.toUpperCase();
  const ok = res.ok && !!lanc && lanc.categoriaId === categoriaEsperada && lanc.valor === 500 && lanc.tipo === 'saida' && lanc.contraparte === 'Cartoes' + PFPJ_ESPERADO.toUpperCase();
  console.log(`[TESTE 2] registrarDebitoTesouraria() usa a categoria do cadastro CERTO (${PFPJ_ESPERADO}), não o cadastro trocado:`, ok ? '✅ PASSOU' : '❌ FALHOU',
    '| categoria aplicada:', lanc && lanc.categoriaId, '| esperada:', categoriaEsperada, '| lançamento completo:', JSON.stringify(lanc));
  return ok;
}

// ══════════════════════════════════════════
// TESTE 3 — grava no arquivo de ano CERTO conforme a data do pagamento
// (não em dados.json, que não guarda mais lançamentos).
// ══════════════════════════════════════════
async function teste3() {
  setTokenTesouraria('fake-token');
  delete ghState.lancamentosPorAno['2025'];
  const antesDe2026 = (ghState.lancamentosPorAno['2026']?.conteudo || []).length;
  const res = await registrarDebitoTesouraria('conta-tsr-1', 200, '2025-12-15', 'Fatura dezembro');
  const depoisDe2026 = (ghState.lancamentosPorAno['2026']?.conteudo || []).length;
  const ok = res.ok && (ghState.lancamentosPorAno['2025']?.conteudo || []).some(l => l.valor === 200) && depoisDe2026 === antesDe2026;
  console.log('[TESTE 3] grava no arquivo lancamentos_<ano correto>.json conforme a data do pagamento (não mexe em outros anos):', ok ? '✅ PASSOU' : '❌ FALHOU',
    '| 2025 tem o lançamento?', (ghState.lancamentosPorAno['2025']?.conteudo || []).some(l => l.valor === 200), '| 2026 antes/depois:', antesDe2026, depoisDe2026);
  return ok;
}

// ══════════════════════════════════════════
// TESTE 4 — arquivo de ano ainda não existe (404, ex: virada de ano) —
// cria do zero em vez de falhar.
// ══════════════════════════════════════════
async function teste4() {
  setTokenTesouraria('fake-token');
  delete ghState.lancamentosPorAno['2030'];
  const res = await registrarDebitoTesouraria('conta-tsr-1', 999, '2030-01-01', 'Ano novo sem arquivo ainda');
  const ok = res.ok && (ghState.lancamentosPorAno['2030']?.conteudo || []).length === 1;
  console.log('[TESTE 4] cria o arquivo do ano do zero quando ainda não existe (404):', ok ? '✅ PASSOU' : '❌ FALHOU', '| resultado:', JSON.stringify(res));
  return ok;
}

// ══════════════════════════════════════════
// TESTE 5 — sem token ou sem conta selecionada: não tenta gravar nada
// (retorna ok:false direto, sem exceção) — é assim que a fila offline
// (enfileirarDebitoTesouraria) sabe que precisa guardar e tentar depois.
// ══════════════════════════════════════════
async function teste5() {
  setTokenTesouraria('');
  const semToken = await registrarDebitoTesouraria('conta-tsr-1', 10, '2026-08-04', 'Sem token');
  setTokenTesouraria('fake-token');
  const semConta = await registrarDebitoTesouraria('', 10, '2026-08-04', 'Sem conta');
  const ok = semToken.ok === false && semConta.ok === false;
  console.log('[TESTE 5] sem token ou sem conta não tenta gravar (retorna ok:false, sem travar):', ok ? '✅ PASSOU' : '❌ FALHOU', '| semToken:', semToken, '| semConta:', semConta);
  return ok;
}

// ══════════════════════════════════════════
// TESTE 6 — conflito de escrita (409, outro dispositivo gravou no mesmo
// arquivo de ano no meio do caminho): tenta de novo automaticamente e
// consegue na 2ª tentativa, sem perder o débito.
// ══════════════════════════════════════════
async function teste6() {
  setTokenTesouraria('fake-token');
  ghState.lancamentosPorAno['2026'] = { conteudo: [{ id: 'ja-existe' }], sha: 'sha-antiga' };
  const fetchOriginal = global.fetch;
  let tentativas = 0;
  global.fetch = async (url, opts) => {
    if (url.includes('lancamentos_2026') && opts && opts.method === 'PUT') {
      tentativas++;
      if (tentativas === 1) return { ok: false, status: 409, json: async () => ({ message: '409 simulado' }) };
    }
    return fetchOriginal(url, opts);
  };
  const res = await registrarDebitoTesouraria('conta-tsr-1', 321, '2026-08-04', 'Depois do conflito');
  global.fetch = fetchOriginal;
  const ok = res.ok && tentativas === 2 && (ghState.lancamentosPorAno['2026'].conteudo || []).some(l => l.valor === 321);
  console.log('[TESTE 6] conflito de escrita (409) tenta de novo e consegue gravar:', ok ? '✅ PASSOU' : '❌ FALHOU', '| tentativas:', tentativas, '| resultado:', JSON.stringify(res));
  return ok;
}

// ══════════════════════════════════════════
// TESTE 7 — garantirAnoNoIndiceTesouraria: adiciona o ano ao índice
// (dados.anosLancamentos) só se ainda não estiver lá — evita PUT
// desnecessário em dados.json toda vez que alguém paga uma fatura.
// ══════════════════════════════════════════
async function teste7() {
  ghState.dadosJson = { anosLancamentos: ['2025'] };
  chamadasPut.length = 0;
  await garantirAnoNoIndiceTesouraria('2026', 'fake-token');
  const foiAdicionado = ghState.dadosJson.anosLancamentos.includes('2026');
  const putsPrimeiraChamada = chamadasPut.filter(c => c.arquivo === 'dados.json').length;
  await garantirAnoNoIndiceTesouraria('2026', 'fake-token'); // já está lá — não deveria gravar de novo
  const putsSegundaChamada = chamadasPut.filter(c => c.arquivo === 'dados.json').length;
  const ok = foiAdicionado && putsPrimeiraChamada === 1 && putsSegundaChamada === 1;
  console.log('[TESTE 7] índice de anos é atualizado só quando precisa (não faz PUT à toa se o ano já estava lá):', ok ? '✅ PASSOU' : '❌ FALHOU',
    '| ano adicionado?', foiAdicionado, '| PUTs após 1ª chamada:', putsPrimeiraChamada, '| PUTs após 2ª chamada (deveria continuar 1):', putsSegundaChamada);
  return ok;
}

(async () => {
  const r1 = await teste1();
  const r2 = await teste2();
  const r3 = await teste3();
  const r4 = await teste4();
  const r5 = await teste5();
  const r6 = await teste6();
  const r7 = await teste7();
  console.log('\n=== RESULTADO FINAL — INTEGRAÇÃO CARTÕES (' + PFPJ_ESPERADO.toUpperCase() + ') → TESOURARIASYS ===');
  console.log('Teste 1 (ghCadastroCarregar busca o arquivo certo):', r1 ? 'PASSOU' : 'FALHOU');
  console.log('Teste 2 (categoria do cadastro certo, não trocado PF/PJ):', r2 ? 'PASSOU' : 'FALHOU');
  console.log('Teste 3 (grava no arquivo de ano certo):', r3 ? 'PASSOU' : 'FALHOU');
  console.log('Teste 4 (cria arquivo de ano do zero se não existir):', r4 ? 'PASSOU' : 'FALHOU');
  console.log('Teste 5 (sem token/conta não trava):', r5 ? 'PASSOU' : 'FALHOU');
  console.log('Teste 6 (conflito 409 tenta de novo e consegue):', r6 ? 'PASSOU' : 'FALHOU');
  console.log('Teste 7 (índice de anos só atualiza quando precisa):', r7 ? 'PASSOU' : 'FALHOU');
  const todosPassaram = r1 && r2 && r3 && r4 && r5 && r6 && r7;
  console.log('\n' + (todosPassaram ? '✅ TODOS OS TESTES PASSARAM' : '❌ AO MENOS UM TESTE FALHOU'));
  process.exit(todosPassaram ? 0 : 1);
})();
