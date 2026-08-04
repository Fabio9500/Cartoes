// Teste de verificação REAL — extrai as funções de verdade de CartoesPF.html
// (não reimplementa) e roda contra um GitHub simulado, cobrindo:
// 1) os mesmos cenários de sincronização já provados no ChequeSys/
//    TesourariaSys (01-02/08/2026: race condition, atomicidade, SHA
//    desatualizado, poll de 30s sem trava);
// 2) o bug de corrupção de dados achado no Cartões (cartão zerado ao editar
//    parcela de um cartão custom — select estático sem a opção do cartão).
"use strict";
const fs = require('fs');

const ARQ = process.argv[2] || 'C:/Users/TELASUL/Projetos/Cartoes/CartoesPF.html';
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
  'salvar',
  '_salvarReal',
  'saveToGitHub',
  'salvarComprasPorAno',
  'verificarAtualizacaoRemota',
  'getFila',
  'setFila',
  'limparFila',
  'getLastSha',
  'setLastSha',
  'anoDaCompra',
  'editarParcela',
  'salvarEdicao',
  'loadFromGitHub',
  'resolverFilaPendente',
  '_aplicarCamposPayload',
].map(n => extrairFuncao(n, codigoCompleto)).join('\n\n');

console.log('--- Funções extraídas verbatim de ' + ARQ + ' (conferência visual) ---');
console.log(funcoesReais.slice(0, 400) + '\n... (' + funcoesReais.length + ' caracteres no total) ...\n');

// ══════════════════════════════════════════
// GITHUB SIMULADO
// ══════════════════════════════════════════
let ghState = { dados: { compras: [], limites: {}, pagamentos: {}, anosCompras: [] }, sha: 'sha-0' };
let ghShaSeq = 0;
const anosArquivos = {}; // 'compras_pf_2026' -> {conteudo, sha}
const chamadasPut = [];

function novoSha() { return 'sha-' + (++ghShaSeq); }

let DELAYS = {};
function delayPara(url) {
  for (const chave in DELAYS) if (url.includes(chave)) return DELAYS[chave];
  return 5;
}

const TIPO_DADOS_TESTE = 'pf';
global.fetch = async function (url, opts = {}) {
  const delay = delayPara(url);
  await new Promise(r => setTimeout(r, delay));
  const method = (opts && opts.method) || 'GET';

  if (url.includes('contents/dados.json')) {
    if (method === 'GET') {
      return { ok: true, status: 200, json: async () => ({ sha: ghState.sha, content: Buffer.from(JSON.stringify(ghState.dados)).toString('base64') }) };
    }
    if (method === 'PUT') {
      const body = JSON.parse(opts.body);
      chamadasPut.push({ arquivo: 'dados.json', recebidoSha: body.sha, shaAtualNoMomento: ghState.sha, timestamp: Date.now() });
      if (body.sha && body.sha !== ghState.sha) {
        return { ok: false, status: 409, json: async () => ({ message: 'sha mismatch (409 simulado)' }) };
      }
      const novoConteudo = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'));
      ghState.dados = { ...ghState.dados, ...novoConteudo };
      ghState.sha = novoSha();
      return { ok: true, status: 200, json: async () => ({ content: { sha: ghState.sha } }) };
    }
  }
  const mAno = url.match(/compras_pf_(\d+)\.json/);
  if (mAno) {
    const chave = 'compras_pf_' + mAno[1];
    if (method === 'GET') {
      const atual = anosArquivos[chave];
      if (!atual) return { status: 404, ok: false, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ sha: atual.sha, content: Buffer.from(JSON.stringify(atual.conteudo)).toString('base64') }) };
    }
    if (method === 'PUT') {
      const body = JSON.parse(opts.body);
      const novoConteudo = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'));
      const sha = novoSha();
      anosArquivos[chave] = { conteudo: novoConteudo, sha };
      chamadasPut.push({ arquivo: chave, timestamp: Date.now(), qtdRegistros: novoConteudo.length });
      return { ok: true, status: 200, json: async () => ({ content: { sha } }) };
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
// Mock de DOM mínimo, mas com semântica REAL de <select>.value: se o valor
// atribuído não bater com nenhuma <option>, vira selectedIndex=-1 e .value
// lê "" — exatamente o comportamento do navegador que causou o bug real do
// campo "cartao" zerado (achado 02/08/2026).
class MockSelect {
  constructor(){ this._options = []; this._selectedIndex = -1; }
  set innerHTML(html){
    this._options = [...html.matchAll(/<option value="([^"]*)"/g)].map(m => m[1]);
    this._selectedIndex = this._options.length ? 0 : -1;
  }
  get innerHTML(){ return this._options.map(o=>`<option value="${o}">`).join(''); }
  set value(v){
    const idx = this._options.indexOf(v);
    this._selectedIndex = idx; // -1 se não achar — mesma regra do navegador real
  }
  get value(){ return this._selectedIndex >= 0 ? this._options[this._selectedIndex] : ''; }
}
class MockEl {
  constructor(){ this.style = {}; this.textContent = ''; this.value = ''; this.disabled = false; this.dataset = {}; this.classList = { add(){}, remove(){}, contains(){ return false; } }; }
}
const _domRegistry = {};
function _getEl(id){
  if(!_domRegistry[id]) _domRegistry[id] = id === 'ep-cartao' ? new MockSelect() : new MockEl();
  return _domRegistry[id];
}
global.document = { getElementById: _getEl };
global.console = console;
global.btoa = s => Buffer.from(s, 'binary').toString('base64');
global.atob = s => Buffer.from(s, 'base64').toString('binary');
global.unescape = require('querystring').unescape;
global.encodeURIComponent = encodeURIComponent;
global.escape = require('querystring').escape;
global.decodeURIComponent = decodeURIComponent;

let _sincronizando = false, _shaAtual = null;
let ghToken = 'fake-token', ghSha = null;
let _shaAntesUltimoLoad = ''; // preenchido pelo loadFromGitHub() real extraído abaixo
let _statusLog = [];
function isOnline() { return navigator.onLine; }
function setSyncStatus(s) { _statusLog.push(s); }
function showToast() {}
function renderDashboard() {}
async function buscarBlobGH() { return null; }
let compras = [], limites = {}, pagamentos = {}, fechamentos = {}, fornecedores = [], cartoesCustom = {}, usuarios = [], favoritosCF = [], ordemCartoesDash = [];
let _anosCarregadosCompras = new Set([String(new Date().getFullYear())]);
let _shaAnosCompras = {};
let _anosComprasIndice = [];
function anosPadraoParaCarregar() { const a = new Date().getFullYear(); return [String(a - 1), String(a)]; }
async function carregarComprasDosAnosPadrao(anosIndice) { return []; }
function montarPayload() { return { versao: 5, tipo: TIPO_DADOS_TESTE, compras, limites, pagamentos, fechamentos, fornecedores, cartoesCustom, usuarios, favoritosCF }; }

const GH_OWNER = 'Fabio9500', GH_REPO = 'Cartoes', GH_FILE = 'dados.json', GH_BRANCH = 'main';
const PREFIX = 'cc_pf';
const TIPO_DADOS = 'pf';
const ARQ_ANO = (colecao, ano) => `${colecao}_${TIPO_DADOS}_${ano}.json`;
async function ghFetch(path, opts = {}) {
  return fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/${path}`, opts);
}

// Dependências de UI usadas por editarParcela()/salvarEdicao() — stubs
// mínimos, o que importa é a lógica real de leitura/gravação do campo cartao.
let CARTOES = {
  bradesco1: { nome: 'BRA 01', banco: 'Bradesco', venc: 1, fechDias: 10, tag: 'bradesco' },
  bradesco10: { nome: 'BRA 10', banco: 'Bradesco', venc: 10, fechDias: 10, tag: 'bradesco' },
  bradesco20: { nome: 'BRA 20', banco: 'Bradesco', venc: 20, fechDias: 10, tag: 'bradesco' },
  santander: { nome: 'Santander', banco: 'Santander', venc: 15, fechDias: 5, tag: 'santander' },
  picpay: { nome: 'PicPay', banco: 'PicPay', venc: 25, fechDias: 10, tag: 'picpay' },
};
function esc(s) { return String(s == null ? '' : s); }
function fmt(v) { return 'R$ ' + v; }
function popularCascata() {}
function valorFinalCascata() { return ''; }
function aoMudarTipoCompra() {}
function fecharModal() {}
function renderLancamentos() {}
function renderFaturas() {}
function uid() { return 'novo-' + Math.random().toString(36).slice(2); }
let filtroAtivo = null;

global.window = global.window || {};
let _filaSalvar = Promise.resolve();
eval(funcoesReais + '\nglobal.__api = { salvar, saveToGitHub, salvarComprasPorAno, verificarAtualizacaoRemota, getFila, setFila, limparFila, editarParcela, salvarEdicao, loadFromGitHub, resolverFilaPendente, _aplicarCamposPayload, getLastSha, setLastSha };');
const { salvar, verificarAtualizacaoRemota, getFila, setFila, limparFila, editarParcela, salvarEdicao, loadFromGitHub, resolverFilaPendente, getLastSha, setLastSha } = global.__api;

// ══════════════════════════════════════════
// TESTE 1 — 2 saves rápidos (1º lento, 2º rápido) — nenhuma compra perdida
// ══════════════════════════════════════════
async function teste1() {
  ghState = { dados: { compras: [], limites: {}, pagamentos: {}, anosCompras: [] }, sha: novoSha() };
  Object.keys(anosArquivos).forEach(k => delete anosArquivos[k]);
  chamadasPut.length = 0;
  ghSha = ghState.sha; _shaAtual = ghState.sha;
  const anoAtual = String(new Date().getFullYear());
  _anosCarregadosCompras = new Set([anoAtual]);

  DELAYS = { 'contents/dados.json': 40 };
  compras = [{ uid: 'C1', compraId: 'CP1', cartao: 'bradesco1', dataCompra: anoAtual + '-01-01', venc: anoAtual + '-02-01', valorParcela: 100, desc: 'Compra 1' }];
  const p1 = salvar();

  await new Promise(r => setTimeout(r, 10));
  DELAYS = { 'contents/dados.json': 5 };
  compras = [
    { uid: 'C1', compraId: 'CP1', cartao: 'bradesco1', dataCompra: anoAtual + '-01-01', venc: anoAtual + '-02-01', valorParcela: 100, desc: 'Compra 1' },
    { uid: 'C2', compraId: 'CP2', cartao: 'bradesco1', dataCompra: anoAtual + '-01-02', venc: anoAtual + '-02-02', valorParcela: 200, desc: 'Compra 2' },
  ];
  const p2 = salvar();

  await Promise.all([p1, p2]);
  DELAYS = {};

  const arquivoFinal = anosArquivos['compras_pf_' + anoAtual];
  const uidsFinais = (arquivoFinal ? arquivoFinal.conteudo : []).map(c => c.uid).sort();
  const ok = uidsFinais.join(',') === 'C1,C2';
  console.log('[TESTE 1] 2 saves rápidos (1º lento, 2º rápido) — nenhuma compra perdida:', ok ? '✅ PASSOU' : '❌ FALHOU', '| compras finais:', uidsFinais);
  return ok;
}

// ══════════════════════════════════════════
// TESTE 2 — _sincronizando fica true durante o save e false depois
// ══════════════════════════════════════════
async function teste2() {
  ghState = { dados: { compras: [], limites: {}, pagamentos: {}, anosCompras: [] }, sha: novoSha() };
  Object.keys(anosArquivos).forEach(k => delete anosArquivos[k]);
  ghSha = ghState.sha; _shaAtual = ghState.sha;
  DELAYS = { 'contents/dados.json': 30 };
  const anoAtual = String(new Date().getFullYear());
  _anosCarregadosCompras = new Set([anoAtual]);
  compras = [];
  const p = salvar();
  await new Promise(r => setTimeout(r, 10));
  const durante = _sincronizando;
  await p;
  DELAYS = {};
  const depois = _sincronizando;
  const ok = durante === true && depois === false;
  console.log('[TESTE 2] _sincronizando fica true durante o save e false depois:', ok ? '✅ PASSOU' : '❌ FALHOU', '| durante:', durante, '| depois:', depois);
  return ok;
}

// ══════════════════════════════════════════
// TESTE 3 — falha no arquivo de ano NÃO é reportada como "salvo" (atomicidade)
// ══════════════════════════════════════════
async function teste3() {
  ghState = { dados: { compras: [], limites: {}, pagamentos: {}, anosCompras: [] }, sha: novoSha() };
  Object.keys(anosArquivos).forEach(k => delete anosArquivos[k]);
  chamadasPut.length = 0;
  const shaOriginal = ghState.sha;
  const dadosOriginais = JSON.stringify(ghState.dados);
  ghSha = ghState.sha; _shaAtual = ghState.sha;
  DELAYS = {};
  const fetchOriginal = global.fetch;
  global.fetch = async function (url, opts) {
    if (url.includes('compras_pf_') && opts && opts.method === 'PUT') {
      return { ok: false, status: 500, json: async () => ({ message: 'falha simulada persistente' }) };
    }
    return fetchOriginal(url, opts);
  };
  const anoAtual = String(new Date().getFullYear());
  _anosCarregadosCompras = new Set([anoAtual]);
  compras = [{ uid: 'C1', compraId: 'CP1', cartao: 'bradesco1', dataCompra: anoAtual + '-01-01', venc: anoAtual + '-02-01', valorParcela: 100, desc: 'Compra 1' }];
  limites = { bradesco1: { total: 5000, usado: 100 } };
  _statusLog.length = 0;
  await salvar();
  global.fetch = fetchOriginal;

  const dadosJsonMudou = ghState.sha !== shaOriginal || JSON.stringify(ghState.dados) !== dadosOriginais;
  const chamouPutDadosJson = chamadasPut.some(c => c.arquivo === 'dados.json');
  const filaAindaExiste = !!getFila();
  const disseSalvoComSucesso = _statusLog.includes('ok');
  const ok = !dadosJsonMudou && !chamouPutDadosJson && filaAindaExiste && !disseSalvoComSucesso;
  console.log('[TESTE 3] dados.json NÃO é gravado quando o arquivo de ano falha (atomicidade):', ok ? '✅ PASSOU' : '❌ FALHOU',
    '| dados.json mudou?', dadosJsonMudou, '| tentou gravar dados.json?', chamouPutDadosJson, '| status log:', _statusLog);
  return ok;
}

// ══════════════════════════════════════════
// TESTE 4 — SHA de ano desatualizado (cacheado) não trava mais a gravação
// ══════════════════════════════════════════
async function teste4() {
  ghState = { dados: { compras: [], limites: {}, pagamentos: {}, anosCompras: [] }, sha: novoSha() };
  Object.keys(anosArquivos).forEach(k => delete anosArquivos[k]);
  ghSha = ghState.sha; _shaAtual = ghState.sha;
  DELAYS = {};
  const anoAtual = String(new Date().getFullYear());
  anosArquivos['compras_pf_' + anoAtual] = { conteudo: [{ uid: 'C0', compraId: 'CP0', cartao: 'bradesco1', dataCompra: anoAtual + '-01-01', venc: anoAtual + '-02-01', valorParcela: 50, desc: 'Antiga' }], sha: 'sha-remoto-mais-novo' };
  _shaAnosCompras = { [anoAtual]: 'sha-velho-cacheado' };
  _anosCarregadosCompras = new Set([anoAtual]);
  compras = [
    { uid: 'C0', compraId: 'CP0', cartao: 'bradesco1', dataCompra: anoAtual + '-01-01', venc: anoAtual + '-02-01', valorParcela: 50, desc: 'Antiga' },
    { uid: 'C1', compraId: 'CP1', cartao: 'bradesco1', dataCompra: anoAtual + '-01-02', venc: anoAtual + '-02-02', valorParcela: 100, desc: 'Nova' },
  ];
  _statusLog.length = 0;
  await salvar();
  const arquivoFinal = anosArquivos['compras_pf_' + anoAtual];
  const ok = _statusLog.includes('ok') && arquivoFinal.conteudo.length === 2;
  console.log('[TESTE 4] SHA de ano desatualizado no cache não trava a gravação:', ok ? '✅ PASSOU' : '❌ FALHOU', '| status log:', _statusLog, '| conteúdo final:', arquivoFinal.conteudo.map(c => c.uid));
  return ok;
}

// ══════════════════════════════════════════
// TESTE 5 — retry: falha transitória (1x) num arquivo de ano não derruba o save
// ══════════════════════════════════════════
async function teste5() {
  ghState = { dados: { compras: [], limites: {}, pagamentos: {}, anosCompras: [] }, sha: novoSha() };
  Object.keys(anosArquivos).forEach(k => delete anosArquivos[k]);
  ghSha = ghState.sha; _shaAtual = ghState.sha;
  DELAYS = {};
  let tentativas = 0;
  const fetchOriginal = global.fetch;
  global.fetch = async function (url, opts) {
    if (url.includes('compras_pf_') && opts && opts.method === 'PUT') {
      tentativas++;
      if (tentativas === 1) return { ok: false, status: 500, json: async () => ({ message: 'falha transitória' }) };
    }
    return fetchOriginal(url, opts);
  };
  const anoAtual = String(new Date().getFullYear());
  _anosCarregadosCompras = new Set([anoAtual]);
  compras = [{ uid: 'C1', compraId: 'CP1', cartao: 'bradesco1', dataCompra: anoAtual + '-01-01', venc: anoAtual + '-02-01', valorParcela: 100, desc: 'Compra 1' }];
  _statusLog.length = 0;
  await salvar();
  global.fetch = fetchOriginal;
  const ok = _statusLog.includes('ok') && tentativas >= 2;
  console.log('[TESTE 5] retry recupera de uma falha transitória no arquivo de ano:', ok ? '✅ PASSOU' : '❌ FALHOU', '| tentativas:', tentativas, '| status log:', _statusLog);
  return ok;
}

// ══════════════════════════════════════════
// TESTE 6 — poll (verificarAtualizacaoRemota) não sobrescreve dados durante um save
// ══════════════════════════════════════════
async function teste6() {
  ghState = { dados: { compras: [], limites: {}, pagamentos: {}, anosCompras: [] }, sha: novoSha() };
  Object.keys(anosArquivos).forEach(k => delete anosArquivos[k]);
  ghSha = ghState.sha; _shaAtual = ghState.sha;
  const anoAtual = String(new Date().getFullYear());
  _anosCarregadosCompras = new Set([anoAtual]);
  compras = [{ uid: 'C-local', compraId: 'CP-local', cartao: 'bradesco1', dataCompra: anoAtual + '-01-01', venc: anoAtual + '-02-01', valorParcela: 999, desc: 'Local não salvo ainda' }];
  limites = {}; pagamentos = {};

  DELAYS = { 'contents/dados.json': 40 };
  const pSalvar = salvar(); // dispara e já marca _sincronizando=true
  await new Promise(r => setTimeout(r, 10));

  // Simula outro dispositivo tendo mudado o remoto ENQUANTO este salva
  ghState.dados = { compras: [], limites: {}, pagamentos: {}, anosCompras: [] };
  ghState.sha = novoSha();

  await verificarAtualizacaoRemota(); // deve pular por causa de _sincronizando
  const comprasFoiSobrescritoDuranteOSave = compras.length === 0;

  DELAYS = {};
  await pSalvar;

  const ok = !comprasFoiSobrescritoDuranteOSave;
  console.log('[TESTE 6] poll de 30s não sobrescreve dados locais durante um save em andamento:', ok ? '✅ PASSOU' : '❌ FALHOU', '| compras locais sobrevieram ao poll?', !comprasFoiSobrescritoDuranteOSave);
  return ok;
}

// ══════════════════════════════════════════
// TESTE 7 — BUG REAL DE CORRUPÇÃO DE DADOS (02/08/2026, relatado pelo
// Fabio): editar QUALQUER campo (inclusive só o vencimento) de uma parcela
// de um cartão CUSTOM zerava o campo "cartao" — porque o <select> do modal
// de edição era HTML estático, sem a opção do cartão custom; o navegador
// deixa esse tipo de <select> sem nada selecionado (value=""). 78 parcelas
// reais foram corrompidas assim antes da correção.
// 7a) prova o MECANISMO do bug: um <select> só com as opções originais,
//     sem o cartão custom, realmente vira "" ao tentar selecionar "8139".
// 7b) prova que a correção real (editarParcela extraído do arquivo de
//     verdade) repopula o select a partir de CARTOES (que já inclui o
//     cartão custom mesclado) e preserva o valor corretamente.
// ══════════════════════════════════════════
function teste7a_mecanismoDoBug() {
  const selectAntigoEstatico = new MockSelect();
  selectAntigoEstatico.innerHTML = '<option value="bradesco1"><option value="bradesco10"><option value="bradesco20"><option value="santander"><option value="picpay">';
  selectAntigoEstatico.value = '8139'; // cartão custom, não existe nas options estáticas
  const ok = selectAntigoEstatico.value === '';
  console.log('[TESTE 7a] mecanismo do bug — select estático sem a option do cartão custom vira "":', ok ? '✅ PASSOU (mecanismo confirmado)' : '❌ FALHOU', '| valor lido de volta:', JSON.stringify(selectAntigoEstatico.value));
  return ok;
}
function teste7b_correcaoReal() {
  // Cartão custom "8139" mesclado em CARTOES, como aplicarCadastrosUnicosNaDB
  // /boot fazem de verdade (Object.entries(cartoesCustom).forEach(...)).
  CARTOES['8139'] = { nome: 'BRA(01)', banco: 'Bradesco', venc: 1, fechDias: 10, tag: 'bradesco' };
  const anoAtual = String(new Date().getFullYear());
  compras = [{ uid: 'PC1', compraId: 'CPC1', cartao: '8139', dataCompra: anoAtual + '-01-01', venc: anoAtual + '-02-01', valorParcela: 150, desc: 'Compra no cartão custom', nParcelas: 1, parcela: 1 }];
  for (const id of ['ep-uid', 'ep-compraid', 'ep-desc', 'ep-valor', 'ep-tipo', 'ep-memo', 'ep-venc', 'ep-datacompra', 'ep-cartao', 'ep-cartao-original', 'ep-trocar-escopo', 'ep-nparcelas-original', 'ep-parcelas', 'ep-total-atual', 'ep-parcelas-preview-wrap']) delete _domRegistry[id];

  editarParcela('PC1'); // função REAL extraída do arquivo — deve repopular ep-cartao e preservar o valor
  const valorLogoAoAbrir = document.getElementById('ep-cartao').value;

  // Usuário só troca o vencimento, nada mais — igual ao relato real do bug
  document.getElementById('ep-venc').value = anoAtual + '-03-15';
  salvarEdicao();

  const parcelaSalva = compras.find(c => c.uid === 'PC1');
  const ok = valorLogoAoAbrir === '8139' && parcelaSalva && parcelaSalva.cartao === '8139' && parcelaSalva.venc === anoAtual + '-03-15';
  console.log('[TESTE 7b] editarParcela()+salvarEdicao() REAIS preservam cartao custom ao editar só o vencimento:', ok ? '✅ PASSOU' : '❌ FALHOU',
    '| valor do select ao abrir o modal:', JSON.stringify(valorLogoAoAbrir), '| cartao salvo:', parcelaSalva && JSON.stringify(parcelaSalva.cartao), '| venc salvo:', parcelaSalva && parcelaSalva.venc);
  return ok;
}

// ══════════════════════════════════════════
// TESTE 8 — loadFromGitHub() + resolverFilaPendente() DE VERDADE: SEM
// conflito (SHA remoto igual ao de quando ficou offline), a fila é aplicada
// direto, sem disparar o modal.
// ══════════════════════════════════════════
async function teste8() {
  ghState = { dados: { compras: [], limites: {}, pagamentos: {}, anosCompras: [] }, sha: novoSha() };
  Object.keys(anosArquivos).forEach(k => delete anosArquivos[k]);
  chamadasPut.length = 0;
  DELAYS = {};
  delete global.window._conflitoFila; delete global.window._conflitoRemoto;
  setLastSha(ghState.sha); // "SHA de quando ficou offline" == SHA remoto atual -> sem conflito
  setFila({ compras: [{ uid: 'C-OFFLINE', compraId: 'CP-OFFLINE', cartao: 'bradesco1', dataCompra: '2026-08-01', venc: '2026-09-01', valorParcela: 77, desc: 'Feito offline' }], limites: {}, pagamentos: {}, fechamentos: {}, fornecedores: [], cartoesCustom: {}, usuarios: [], favoritosCF: [] });
  const fila = getFila();
  const data = await loadFromGitHub();
  data.compras = await carregarComprasDosAnosPadrao(data.anosCompras);
  await resolverFilaPendente(fila, data, ghSha, _shaAntesUltimoLoad);
  const entrouEmConflito = !!global.window._conflitoFila;
  const foiPraNuvem = chamadasPut.some(c => c.arquivo === 'dados.json');
  const ok = !entrouEmConflito && foiPraNuvem;
  console.log('[TESTE 8] loadFromGitHub()+resolverFilaPendente() reais SEM conflito aplicam a fila direto:', ok ? '✅ PASSOU' : '❌ FALHOU',
    '| entrou em conflito?', entrouEmConflito, '| foi pra nuvem?', foiPraNuvem);
  limparFila();
  return ok;
}

// ══════════════════════════════════════════
// TESTE 9 — loadFromGitHub() + resolverFilaPendente() DE VERDADE precisam
// detectar conflito quando o SHA remoto mudou enquanto este dispositivo
// estava offline. Bug real mais sério desta auditoria (encontrado antes no
// ChequeSys/TesourariaSys, mesma arquitetura aqui): "ghSha=d.sha;
// setLastSha(d.sha)" rodava ANTES da comparação de conflito, que então
// comparava getLastSha() com o mesmo valor recém-gravado — sempre "igual",
// conflito nunca detectado. Corrigido capturando o SHA de antes em
// "_shaAntesUltimoLoad" dentro do próprio loadFromGitHub().
// ══════════════════════════════════════════
async function teste9() {
  ghState = { dados: { compras: [], limites: {}, pagamentos: {}, anosCompras: [] }, sha: novoSha() }; // SHA remoto NOVO — outro dispositivo já salvou algo
  Object.keys(anosArquivos).forEach(k => delete anosArquivos[k]);
  chamadasPut.length = 0;
  DELAYS = {};
  delete global.window._conflitoFila; delete global.window._conflitoRemoto;
  setLastSha('sha-ANTIGA-de-quando-ficou-offline'); // SHA que tínhamos antes de ficar offline — diferente do remoto atual = conflito real
  setFila({ compras: [{ uid: 'C-OFFLINE2', compraId: 'CP-OFFLINE2', cartao: 'bradesco1', dataCompra: '2026-08-01', venc: '2026-09-01', valorParcela: 88, desc: 'Feito offline 2' }], limites: {}, pagamentos: {}, fechamentos: {}, fornecedores: [], cartoesCustom: {}, usuarios: [], favoritosCF: [] });
  const fila = getFila();
  const data = await loadFromGitHub();
  data.compras = await carregarComprasDosAnosPadrao(data.anosCompras);
  await resolverFilaPendente(fila, data, ghSha, _shaAntesUltimoLoad);
  const entrouEmConflito = !!global.window._conflitoFila;
  const ok = entrouEmConflito;
  console.log('[TESTE 9] loadFromGitHub()+resolverFilaPendente() reais detectam conflito quando o SHA remoto mudou enquanto offline:', ok ? '✅ PASSOU' : '❌ FALHOU',
    '| entrou em conflito?', entrouEmConflito);
  delete global.window._conflitoFila; delete global.window._conflitoRemoto;
  limparFila();
  return ok;
}

(async () => {
  const r1 = await teste1();
  const r2 = await teste2();
  const r3 = await teste3();
  const r4 = await teste4();
  const r5 = await teste5();
  const r6 = await teste6();
  const r7a = teste7a_mecanismoDoBug();
  const r7b = teste7b_correcaoReal();
  const r8 = await teste8();
  const r9 = await teste9();
  console.log('\n=== RESULTADO FINAL (' + ARQ + ') ===');
  console.log('Teste 1 (2 saves rápidos sem perda de dado):', r1 ? 'PASSOU' : 'FALHOU');
  console.log('Teste 2 (_sincronizando true/false ao redor do save):', r2 ? 'PASSOU' : 'FALHOU');
  console.log('Teste 3 (atomicidade — dados.json não grava sem os arquivos de ano):', r3 ? 'PASSOU' : 'FALHOU');
  console.log('Teste 4 (SHA de ano desatualizado não trava a gravação):', r4 ? 'PASSOU' : 'FALHOU');
  console.log('Teste 5 (retry recupera falha transitória):', r5 ? 'PASSOU' : 'FALHOU');
  console.log('Teste 6 (poll não sobrescreve save em andamento):', r6 ? 'PASSOU' : 'FALHOU');
  console.log('Teste 7a (mecanismo do bug do cartão zerado, confirmado):', r7a ? 'PASSOU' : 'FALHOU');
  console.log('Teste 7b (correção real preserva cartão custom):', r7b ? 'PASSOU' : 'FALHOU');
  console.log('Teste 8 (resolverFilaPendente sem conflito aplica fila direto):', r8 ? 'PASSOU' : 'FALHOU');
  console.log('Teste 9 (resolverFilaPendente detecta conflito de sincronização entre dispositivos):', r9 ? 'PASSOU' : 'FALHOU');
  const todosPassaram = r1 && r2 && r3 && r4 && r5 && r6 && r7a && r7b && r8 && r9;
  console.log('\n' + (todosPassaram ? '✅ TODOS OS TESTES PASSARAM' : '❌ AO MENOS UM TESTE FALHOU'));
  process.exit(todosPassaram ? 0 : 1);
})();
