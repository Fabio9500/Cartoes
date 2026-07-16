// ══════════════════════════════════════════
// NOTIFICAÇÕES — Cartões (PF e PJ)
// Roda periodicamente via GitHub Actions. Lê dados.json (PF) e
// dados-pj.json (PJ), verifica faturas vencendo nos próximos DIAS_AVISO
// dias que ainda não foram pagas, e dispara push via ntfy.sh pra cada
// uma que ainda não tinha sido notificada. Nunca altera os dados.json.
// ══════════════════════════════════════════
const fs = require('fs');

const NTFY_TOPIC = process.env.NTFY_TOPIC;
if (!NTFY_TOPIC) {
  console.error('NTFY_TOPIC não configurado (repository secret ausente).');
  process.exit(1);
}

const DIAS_AVISO = 3; // avisa quando faltar até 3 dias pro vencimento
const STATE_FILE = '.notif-state.json';

function carregarJSON(caminho, padrao) {
  try { return JSON.parse(fs.readFileSync(caminho, 'utf-8')); }
  catch (e) { return padrao; }
}

const state = carregarJSON(STATE_FILE, { notificados: [] });
const jaNotificados = new Set(state.notificados);
const eventos = [];
const hoje = new Date(); hoje.setHours(0,0,0,0);

function verificarArquivo(caminho, rotulo) {
  const dados = carregarJSON(caminho, null);
  if (!dados) return;
  const compras = dados.compras || [];
  const pagamentos = dados.pagamentos || {};
  const cartoesCustom = dados.cartoesCustom || {};

  const grupos = {};
  compras.forEach(c => {
    const key = c.cartao + '|' + c.venc;
    if (!grupos[key]) grupos[key] = { cartao: c.cartao, venc: c.venc, total: 0 };
    grupos[key].total += c.valorParcela;
  });

  Object.values(grupos).forEach(g => {
    if (pagamentos[g.cartao + '|' + g.venc]) return; // já paga
    const dv = new Date(g.venc + 'T12:00:00');
    const dias = Math.round((dv - hoje) / 86400000);
    if (dias < 0 || dias > DIAS_AVISO) return; // fora da janela de aviso
    const chave = `fatura-${rotulo}-${g.cartao}-${g.venc}`;
    if (jaNotificados.has(chave)) return;
    const nomeCartao = (cartoesCustom[g.cartao] && cartoesCustom[g.cartao].nome) || g.cartao;
    const valor = Number(g.total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const diasStr = dias === 0 ? 'vence hoje' : dias === 1 ? 'vence amanhã' : `vence em ${dias} dias`;
    eventos.push({
      chave,
      titulo: `💳 Fatura ${rotulo} — ${diasStr}`,
      msg: `${nomeCartao}: ${valor} (venc. ${dv.toLocaleDateString('pt-BR')})`
    });
  });
}

verificarArquivo('dados.json', 'PF');
verificarArquivo('dados-pj.json', 'PJ');

async function enviarNtfy(titulo, msg) {
  const resp = await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
    method: 'POST',
    headers: { 'Title': titulo, 'Priority': 'default', 'Tags': 'credit_card' },
    body: msg
  });
  if (!resp.ok) throw new Error(`ntfy.sh respondeu ${resp.status}`);
}

(async () => {
  if (!eventos.length) {
    console.log('Nenhum evento novo.');
    return;
  }
  for (const ev of eventos) {
    try {
      await enviarNtfy(ev.titulo, ev.msg);
      console.log('Notificado:', ev.msg);
      jaNotificados.add(ev.chave);
    } catch (e) {
      console.error('Falha ao notificar', ev.chave, e.message);
    }
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify({ notificados: [...jaNotificados] }, null, 2));
})();
