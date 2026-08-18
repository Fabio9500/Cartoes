// Teste de verificação REAL (extrai de CartoesPF.html/CartoesPJ.html) da mudança
// de 18/08/2026, a pedido do Fabio: a tela de Faturas Detalhadas deixou de
// empilhar todas as faturas filtradas de uma vez e passou a mostrar 1 fatura por
// vez, com navegação ◀ Anterior / Próxima ▶, sempre abrindo por padrão na fatura
// ATUAL (a primeira ainda não vencida; se todas já venceram, a mais recente).
// Os mesmos filtros de sempre (cartão/período/mês) continuam decidindo QUAIS
// faturas entram na lista — só mudou a apresentação.
"use strict";
const fs = require('fs');
const path = require('path');

function extrairFuncao(nome, codigo) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + nome + '\\s*\\(');
  const m = re.exec(codigo);
  if (!m) throw new Error('Função ' + nome + ' não encontrada no arquivo real');
  let p = codigo.indexOf('(', m.index);
  let pdepth = 1, k = p + 1;
  while (pdepth > 0) {
    if (codigo[k] === '(') pdepth++;
    else if (codigo[k] === ')') pdepth--;
    k++;
  }
  let i = codigo.indexOf('{', k);
  let depth = 1, j = i + 1;
  while (depth > 0) {
    if (codigo[j] === '{') depth++;
    else if (codigo[j] === '}') depth--;
    j++;
  }
  return codigo.slice(m.index, j);
}

let ok = 0, falhas = 0;
function assert(cond, msg) {
  if (cond) { ok++; console.log('✅ ' + msg); }
  else { falhas++; console.log('❌ ' + msg); }
}

function testarArquivo(nomeArq) {
  console.log(`\n--- ${nomeArq} ---`);
  const ARQ = path.join(__dirname, '..', nomeArq);
  const html = fs.readFileSync(ARQ, 'utf8');
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  const codigoCompleto = scriptMatch[1];

  const funcoesReais = [
    'renderFaturas', 'navegarFaturaDetalhe', 'diasAte', 'esc', 'nomeCatCompra',
  ].map(n => extrairFuncao(n, codigoCompleto)).join('\n\n');

  // --- Mocks mínimos ---
  const hoje = new Date('2026-08-18T12:00:00');
  const CARTOES = { santander: { nome: 'Santander', tag: 'santander' }, picpay: { nome: 'PicPay', tag: 'picpay' } };
  const fmt = v => 'R$ ' + Number(v).toFixed(2);
  const compras = [
    // Santander: uma fatura passada (jul), uma atual/próxima não vencida (set), outra futura (out)
    { uid: 'u1', cartao: 'santander', venc: '2026-07-10', desc: 'Mercado', valorParcela: 100, parcela: 1, nParcelas: 1 },
    { uid: 'u2', cartao: 'santander', venc: '2026-09-10', desc: 'Posto', valorParcela: 200, parcela: 1, nParcelas: 1 },
    { uid: 'u3', cartao: 'santander', venc: '2026-10-10', desc: 'Farmácia', valorParcela: 50, parcela: 1, nParcelas: 1 },
  ];
  const pagamentos = {};

  // DOM mínimo: um <select>/<input> mockado por id, e o container.
  const elementos = {
    'filtro-fatura-cartao': { value: 'santander' },
    'filtro-fatura-periodo': { value: 'todas' },
    'filtro-fatura-mes': { value: '' },
    'faturas-detalhe-container': { innerHTML: '' },
  };
  global.document = { getElementById: id => elementos[id] };
  global.hoje = hoje;
  global.CARTOES = CARTOES;
  global.fmt = fmt;
  global.compras = compras;
  global.pagamentos = pagamentos;
  global._faturaDetalheIdx = null;
  global._faturaDetalheAlvo = null;

  eval(funcoesReais + `\nglobal.__api = { renderFaturas, navegarFaturaDetalhe };`);
  const { renderFaturas, navegarFaturaDetalhe } = global.__api;

  // Cenário 1: sem alvo/índice definidos, deve abrir na fatura ATUAL (09/2026 — a
  // primeira ainda não vencida em 18/08/2026), não na primeira (07/2026, já passada).
  renderFaturas();
  assert(elementos['faturas-detalhe-container'].innerHTML.includes('setembro'),
    `Abre por padrão na fatura ATUAL (setembro), não na mais antiga (${nomeArq})`);
  assert(elementos['faturas-detalhe-container'].innerHTML.includes('2 de 3'),
    `Mostra 1 fatura por vez com indicador de posição "2 de 3" (setembro é a 2ª de 3) (${nomeArq})`);
  assert(!elementos['faturas-detalhe-container'].innerHTML.includes('outubro'),
    `Não mostra a fatura seguinte (outubro) empilhada junto (${nomeArq})`);

  // Cenário 2: navegar pra "Próxima" deve ir pra outubro (a última, sem mais próxima depois)
  navegarFaturaDetalhe(1);
  assert(elementos['faturas-detalhe-container'].innerHTML.includes('outubro'),
    `Botão "Próxima ▶" avança pra fatura de outubro (${nomeArq})`);
  assert(elementos['faturas-detalhe-container'].innerHTML.includes('3 de 3'),
    `Indicador de posição atualiza pra "3 de 3" (${nomeArq})`);

  // Cenário 3: navegar "Anterior" duas vezes deve voltar até julho (a mais antiga) e travar lá
  navegarFaturaDetalhe(-1); navegarFaturaDetalhe(-1); navegarFaturaDetalhe(-1);
  assert(elementos['faturas-detalhe-container'].innerHTML.includes('julho'),
    `Botão "◀ Anterior" repetido trava na fatura mais antiga (julho), sem estourar o índice (${nomeArq})`);
  assert(elementos['faturas-detalhe-container'].innerHTML.includes('1 de 3'),
    `Indicador não passa de "1 de 3" ao tentar voltar além do início (${nomeArq})`);

  // Cenário 4: _faturaDetalheAlvo tem prioridade sobre a fatura atual calculada
  global._faturaDetalheIdx = null;
  global._faturaDetalheAlvo = { cartao: 'santander', venc: '2026-10-10' };
  renderFaturas();
  assert(elementos['faturas-detalhe-container'].innerHTML.includes('outubro'),
    `_faturaDetalheAlvo abre direto na fatura pedida (outubro), ignorando a fatura ATUAL padrão (${nomeArq})`);
}

testarArquivo('CartoesPF.html');
testarArquivo('CartoesPJ.html');

console.log(`\n${ok} passaram, ${falhas} falharam`);
process.exit(falhas ? 1 : 0);
