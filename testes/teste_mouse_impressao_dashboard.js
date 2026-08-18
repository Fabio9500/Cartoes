// Teste de verificação REAL (lê CartoesPF.html e CartoesPJ.html direto) das
// correções de 18/08/2026, a pedido do Fabio:
// 1) Badge "↩ Estorno" que aparecia na tela da fatura mas sumia na impressão
//    (imprimirFaturaUnica) agora aparece também na impressão.
// 2) Padrão de mouse único/duplo/direito (v5.38) estendido pras telas que
//    ficaram de fora do escopo original: cards de cartão do Dashboard,
//    lista "Próximas Faturas" e cards de Limites.
// Como essas funções manipulam o DOM ao vivo (document.getElementById,
// grid.innerHTML+=...) dentro de um arquivo HTML monolítico sem módulos,
// este teste faz verificação ESTRUTURAL sobre o código-fonte real (regex
// sobre as funções extraídas), não uma simulação funcional completa de
// render — é a mesma limitação de todos os testes desta pasta que tocam
// telas com DOM direto (ex: teste_sync_cartoes.js).
"use strict";
const fs = require('fs');
const path = require('path');

let ok = 0, falhas = 0;
function assert(cond, msg) {
  if (cond) { ok++; console.log('✅ ' + msg); }
  else { falhas++; console.log('❌ ' + msg); }
}

function extrairFuncao(nome, codigo) {
  const re = new RegExp('(?:async\\s+)?function\\s+' + nome + '\\s*\\(');
  const m = re.exec(codigo);
  if (!m) return null;
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

function testarArquivo(nomeArq) {
  const ARQ = path.join(__dirname, '..', nomeArq);
  const html = fs.readFileSync(ARQ, 'utf8');
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  const codigo = scriptMatch[1];

  console.log(`\n--- ${nomeArq} ---`);

  // 1) Badge de estorno na impressão
  const fnImprimir = extrairFuncao('imprimirFaturaUnica', codigo);
  assert(!!fnImprimir, `imprimirFaturaUnica() encontrada em ${nomeArq}`);
  assert(fnImprimir && /tipo===.estorno.[\s\S]{0,300}Estorno/.test(fnImprimir),
    `imprimirFaturaUnica() em ${nomeArq} agora inclui o badge de Estorno (igual à tela)`);

  // 2) Dashboard: card-chip com os 3 eventos de mouse
  const fnDash = extrairFuncao('renderDashboard', codigo) || codigo; // fallback: procura no arquivo todo
  const trechoCardChip = codigo.match(/verFaturaAtualCard\('\$\{k\}','\$\{proxVenc\}'\)[\s\S]{0,200}/);
  assert(!!trechoCardChip && /ondblclick="abrirCad\('cart'/.test(trechoCardChip[0]),
    `Card de cartão do Dashboard (${nomeArq}) tem ondblclick (editar cartão)`);
  assert(!!trechoCardChip && /oncontextmenu="return abrirMenuCad\(event,'cart'/.test(trechoCardChip[0]),
    `Card de cartão do Dashboard (${nomeArq}) tem oncontextmenu (menu de contexto)`);

  // 3) "Próximas Faturas": fatura-row com os 3 eventos + função de menu nova
  const trechoFaturaRow = codigo.match(/class="fatura-row \$\{cls\}"[\s\S]{0,300}/);
  assert(!!trechoFaturaRow && /ondblclick="imprimirFaturaUnica/.test(trechoFaturaRow[0]),
    `Linha de "Próximas Faturas" (${nomeArq}) tem ondblclick (imprimir)`);
  assert(!!trechoFaturaRow && /oncontextmenu="return abrirMenuFaturaProxima/.test(trechoFaturaRow[0]),
    `Linha de "Próximas Faturas" (${nomeArq}) tem oncontextmenu (menu de contexto)`);
  const fnMenuFatura = extrairFuncao('abrirMenuFaturaProxima', codigo);
  assert(!!fnMenuFatura, `abrirMenuFaturaProxima() foi criada em ${nomeArq}`);

  // 4) Limites: cards com ondblclick + função editarLimiteCartao
  const trechoLimites = extrairFuncao('renderLimites', codigo);
  assert(!!trechoLimites && /ondblclick="editarLimiteCartao/.test(trechoLimites),
    `Cards de Limites (${nomeArq}) têm ondblclick (editar limite)`);
  const fnEditarLimite = extrairFuncao('editarLimiteCartao', codigo);
  assert(!!fnEditarLimite, `editarLimiteCartao() foi criada em ${nomeArq}`);
  assert(fnEditarLimite && /getElementById\('lim-cartao'\)/.test(fnEditarLimite) && /getElementById\('lim-valor'\)/.test(fnEditarLimite),
    `editarLimiteCartao() em ${nomeArq} usa os campos reais do formulário (lim-cartao/lim-valor)`);
}

testarArquivo('CartoesPF.html');
testarArquivo('CartoesPJ.html');

console.log(`\n${ok} passaram, ${falhas} falharam`);
process.exit(falhas ? 1 : 0);
