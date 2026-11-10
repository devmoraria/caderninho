// ===== PARSER:INICIO =====
// Tudo o que entende o que a pessoa FALOU fica neste bloco.

// Os tipos de gasto. Para criar um novo, copie uma linha.
// "palavras" ajudam a adivinhar o tipo (sem acento e em minúsculas).
const CATEGORIAS = [
  {id:'casa',     nome:'Casa',     icone:'🏠', palavras:['casa','luz','agua','aluguel','gas','condominio','iptu','internet','telefone','energia']},
  {id:'trabalho', nome:'Trabalho', icone:'🧱', palavras:['trabalho','obra','material','cimento','areia','tijolo','ferramenta','tinta','ajudante','servente','pedra','cal','massa','prego','frete','gasolina','onibus']},
  {id:'comida',   nome:'Comida',   icone:'🍞', palavras:['comida','mercado','supermercado','padaria','almoco','janta','jantar','lanche','feira','acougue','cafe']},
  {id:'saude',    nome:'Saúde',    icone:'💊', palavras:['saude','remedio','farmacia','medico','dentista','exame','consulta']},
  {id:'outros',   nome:'Outros',   icone:'📦', palavras:[]}
];

function semAcento(s){ return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }

// Lê um número escrito do jeito brasileiro: "12,50", "1.250,50", "R$ 38"
function lerNumero(texto){
  let s = String(texto ?? '').replace(/R\$/gi,'').replace(/\s/g,'');
  if(!s) return 0;
  if(s.includes(',')) s = s.replace(/\./g,'').replace(',','.');
  else if(/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g,'');
  const n = parseFloat(s);
  return (isNaN(n) || n < 0) ? 0 : n;
}

// Números por extenso -> valor
const UNIDADES = {zero:0,um:1,uma:1,dois:2,duas:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,dez:10,onze:11,doze:12,treze:13,catorze:14,quatorze:14,quinze:15,dezesseis:16,dezessete:17,dezoito:18,dezenove:19};
const DEZENAS  = {vinte:20,trinta:30,quarenta:40,cinquenta:50,sessenta:60,setenta:70,oitenta:80,noventa:90};
const CENTENAS = {cem:100,cento:100,duzentos:200,duzentas:200,trezentos:300,trezentas:300,quatrocentos:400,quatrocentas:400,quinhentos:500,quinhentas:500,seiscentos:600,seiscentas:600,setecentos:700,setecentas:700,oitocentos:800,oitocentas:800,novecentos:900,novecentas:900};
function valorPalavra(w){ return UNIDADES[w] ?? DEZENAS[w] ?? CENTENAS[w]; }
function ehPalavraNumero(w){ return w === 'mil' || valorPalavra(w) !== undefined; }

// Quebra a frase em pedaços: {n: número} ou {w: palavra, o: palavra original}
function tokenizar(texto){
  const orig = String(texto).trim().split(/\s+/)
    .map(w => w.replace(/^[^\p{L}\p{N}]+|[.,!?;:]+$/gu,'').replace(/^R\$/i,''))
    .filter(Boolean);
  const ws = orig.map(semAcento);
  const saida = [];
  let i = 0;
  while(i < ws.length){
    const w = ws[i];
    // número em dígitos: 38, 2.500, 12,50
    if(/^\d[\d.,]*$/.test(w)){ saida.push({n: lerNumero(w)}); i++; continue; }
    // número por extenso: "dois mil e quinhentos"
    if(ehPalavraNumero(w)){
      let total = 0, atual = 0, j = i, ultimo = null; // ultimo: null | 'mil' | 'num'
      while(j < ws.length){
        const x = ws[j];
        if(x === 'e'){
          if(ultimo && j+1 < ws.length && ehPalavraNumero(ws[j+1]) && ws[j+1] !== 'mil'){ ultimo = 'e'; j++; continue; }
          break;
        }
        if(x === 'mil'){ total += (atual || 1) * 1000; atual = 0; ultimo = 'mil'; j++; continue; }
        if(valorPalavra(x) === undefined) break;
        if(ultimo === 'num') break;           // dois números seguidos sem "e": são números diferentes
        atual += valorPalavra(x); ultimo = 'num'; j++;
      }
      saida.push({n: total + atual});
      i = j; continue;
    }
    saida.push({w, o: orig[i]});
    i++;
  }
  return saida;
}

// "dois reais e cinquenta" -> 2,50 | "dois vírgula cinco" -> 2,5
function ajustarCentavos(t){
  const r = [];
  for(let i = 0; i < t.length; i++){
    const a = t[i];
    if(a.n === undefined){ r.push(a); continue; }
    let v = a.n;
    if(t[i+1] && t[i+1].w === 'virgula' && t[i+2] && t[i+2].n !== undefined){
      const b = t[i+2].n; v = v + b / Math.pow(10, String(b).length); i += 2;
    }
    if(t[i+1] && (t[i+1].w === 'reais' || t[i+1].w === 'real')){
      i++;
      if(t[i+1] && t[i+1].w === 'e' && t[i+2] && t[i+2].n !== undefined && t[i+2].n < 100){
        v += t[i+2].n / 100; i += 2;
        if(t[i+1] && /^centavo/.test(t[i+1].w || '')) i++;
      }
    }
    r.push({n: Math.round(v * 100) / 100});
  }
  return r;
}

// Palavras de "enfeite" que saem do começo e do fim da descrição
const IGNORAR = new Set(['gastei','gasto','gastou','comprei','paguei','pago','custou','foi','valor','reais','real','de','da','do','na','no','em','para','pra','por','com','a','o','as','os','e','que','cada']);

function adivinharCategoria(palavras){
  for(const c of CATEGORIAS){
    if(c.palavras.some(p => palavras.includes(p))) return c.id;
  }
  return null;
}

function maiuscula(s){ return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

// Entende uma frase falada. Devolve os números, a descrição e o tipo provável.
function interpretar(texto){
  const t = ajustarCentavos(tokenizar(texto));
  const numeros = t.filter(x => x.n !== undefined).map(x => x.n);
  const palavras = t.filter(x => x.w !== undefined);
  const norm = palavras.map(x => x.w);
  let ini = 0, fim = norm.length;
  while(ini < fim && IGNORAR.has(norm[ini])) ini++;
  while(fim > ini && IGNORAR.has(norm[fim-1])) fim--;
  const descricao = maiuscula(palavras.slice(ini, fim).map(x => x.o).join(' '));
  return {numeros, descricao, categoria: adivinharCategoria(norm)};
}
// ===== PARSER:FIM =====


// ===== DADOS (ficam guardados no próprio celular) =====
const CHAVE = 'minhas-contas-v1';
function novoItem(){ return {desc:'', qtd:'1', preco:''}; }
function padrao(){ return {teto:0, tetos:{}, gastos:[], orc:{cliente:'', itens:[novoItem()], maoDeObra:'', margem:''}}; }
function carregar(){
  try{
    const t = localStorage.getItem(CHAVE);
    if(t){ const d = JSON.parse(t); return Object.assign(padrao(), d); }
  }catch(e){}
  return padrao();
}
let dados = carregar();
function salvar(){
  try{ localStorage.setItem(CHAVE, JSON.stringify(dados)); }
  catch(e){ aviso('Não consegui guardar neste aparelho.', 'erro'); }
}

// ===== AJUDANTES =====
const $ = id => document.getElementById(id);
const brl = n => (n || 0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const campoNum = n => { const r = Math.round(n*100)/100; return Number.isInteger(r) ? String(r) : r.toFixed(2).replace('.', ','); };
const pad2 = n => String(n).padStart(2, '0');
function hojeISO(){ const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function mesAtual(){ return hojeISO().slice(0, 7); }
function nomeMes(m){
  const [y, mm] = m.split('-').map(Number);
  return maiuscula(new Date(y, mm-1, 1).toLocaleDateString('pt-BR', {month:'long', year:'numeric'}));
}
const catPorId = id => CATEGORIAS.find(c => c.id === id) || CATEGORIAS[CATEGORIAS.length-1];

let tAviso;
function aviso(msg, tipo = 'ok'){
  const el = $('aviso');
  el.textContent = msg; el.className = 'aviso ' + tipo; el.hidden = false;
  clearTimeout(tAviso);
  tAviso = setTimeout(() => { el.hidden = true; }, 6000);
}

// ===== REGRA DO TETO: verde até 80%, amarelo de 80% a 100%, vermelho acima =====
function situacao(gasto, teto){
  if(!teto) return {nivel:'sem', pct:0, texto:''};
  const pct = gasto / teto * 100;
  if(pct > 100) return {nivel:'vermelho', pct, texto:`🛑 Passou do teto em ${brl(gasto - teto)}`};
  if(pct >= 80) return {nivel:'amarelo', pct, texto:`⚠️ Atenção! Falta só ${brl(teto - gasto)}`};
  return {nivel:'verde', pct, texto:`✅ Tudo certo. Ainda pode gastar ${brl(teto - gasto)}`};
}
function totaisDoMes(mes){
  const t = {total:0};
  CATEGORIAS.forEach(c => t[c.id] = 0);
  dados.gastos.forEach(g => {
    if(g.data.startsWith(mes)){ t.total += g.valor; t[g.cat] = (t[g.cat] || 0) + g.valor; }
  });
  return t;
}

// ===== TELAS =====
function renderInicio(){
  const mes = mesAtual(), t = totaisDoMes(mes), s = situacao(t.total, dados.teto);
  $('inicio-mes').textContent = nomeMes(mes);
  $('inicio-gasto').textContent = brl(t.total);
  $('inicio-teto-linha').textContent = dados.teto ? `Teto do mês: ${brl(dados.teto)}` : 'Sem teto definido (veja em ⚙️ Ajustes)';
  const barra = $('inicio-barra');
  barra.style.width = Math.min(s.pct, 100) + '%';
  barra.className = 'preenchido ' + s.nivel;
  $('barra-geral').hidden = !dados.teto;
  const m = $('inicio-msg');
  m.hidden = !dados.teto; m.className = 'mensagem ' + s.nivel; m.textContent = s.texto;
  $('inicio-cats').innerHTML = CATEGORIAS.map(c => {
    const v = t[c.id] || 0, tc = dados.tetos[c.id] || 0, sc = situacao(v, tc);
    return `<div class="linha-cat">
      <div class="linha-topo"><span class="cat-nome">${c.icone} ${c.nome}</span><span class="cat-valor">${brl(v)}</span></div>
      ${tc ? `<div class="barra pequena"><div class="preenchido ${sc.nivel}" style="width:${Math.min(sc.pct,100)}%"></div></div>
              <div class="suave">Teto: ${brl(tc)} — ${esc(sc.texto)}</div>` : ''}
    </div>`;
  }).join('');
}

// --- Anotar gasto ---
let catEscolhida = 'outros', catManual = false;
function marcarCats(){
  $('cats-anotar').innerHTML = CATEGORIAS.map(c =>
    `<button type="button" class="cat" data-acao="cat" data-cat="${c.id}" aria-pressed="${c.id === catEscolhida}">
       <span class="ic">${c.icone}</span>${c.nome}${c.id === catEscolhida ? ' ✔' : ''}</button>`).join('');
}
function mostrarEntendi(html){ const e = $('entendi'); e.innerHTML = html; e.hidden = false; }

function aoOuvirGasto(texto){
  const p = interpretar(texto);
  if(!p.numeros.length){
    mostrarEntendi(`🎤 Ouvi: “${esc(texto)}”<br>Mas não achei nenhum valor. Toque em Falar e tente de novo.`);
    return;
  }
  const valor = p.numeros[p.numeros.length - 1];
  $('valor').value = campoNum(valor);
  $('desc').value = p.descricao;
  if(p.categoria){ catEscolhida = p.categoria; catManual = true; }
  marcarCats();
  mostrarEntendi(`🎤 Entendi: <strong>${brl(valor)}</strong>${p.descricao ? ' — ' + esc(p.descricao) : ''} (${catPorId(catEscolhida).nome})<br>Está certo? Então aperte <strong>Salvar</strong>. Se não, corrija nos campos abaixo.`);
}

function salvarGasto(){
  const valor = lerNumero($('valor').value);
  if(valor <= 0){ aviso('Digite quanto foi o gasto.', 'erro'); $('valor').focus(); return; }
  dados.gastos.push({id: String(Date.now()) + Math.random().toString(36).slice(2,6), criado: Date.now(),
    data: hojeISO(), valor, desc: $('desc').value.trim(), cat: catEscolhida});
  salvar();
  const cat = catPorId(catEscolhida);
  const t = totaisDoMes(mesAtual()), s = situacao(t.total, dados.teto);
  let msg = `✅ Anotado: ${brl(valor)} em ${cat.nome}.`, tipo = 'ok';
  if(s.nivel === 'amarelo'){ msg += ' ' + s.texto; tipo = 'atencao'; }
  if(s.nivel === 'vermelho'){ msg += ' ' + s.texto; tipo = 'erro'; }
  const tc = dados.tetos[catEscolhida];
  if(tc && t[catEscolhida] > tc){ msg += ` O teto de ${cat.nome} também passou.`; tipo = 'erro'; }
  // limpa o formulário
  $('valor').value = ''; $('desc').value = ''; catEscolhida = 'outros'; catManual = false;
  $('entendi').hidden = true; marcarCats();
  irPara('inicio');
  aviso(msg, tipo);
}

// --- Orçamento ---
function calcOrcamento(){
  const o = dados.orc;
  const material = o.itens.reduce((s, it) => s + lerNumero(it.qtd) * lerNumero(it.preco), 0);
  const mao = lerNumero(o.maoDeObra), pct = lerNumero(o.margem);
  const sub = material + mao, extra = sub * pct / 100;
  return {material, mao, pct, extra, total: sub + extra};
}
function atualizarTotais(){
  dados.orc.itens.forEach((it, i) => {
    const el = $('tot-' + i);
    if(el) el.textContent = brl(lerNumero(it.qtd) * lerNumero(it.preco));
  });
  const c = calcOrcamento();
  $('r-material').textContent = brl(c.material);
  $('r-mao').textContent = brl(c.mao);
  $('r-margem-nome').textContent = c.pct ? `Margem (${campoNum(c.pct)}%)` : 'Margem';
  $('r-margem').textContent = brl(c.extra);
  $('r-total').textContent = brl(c.total);
}
function renderOrcamento(){
  const o = dados.orc;
  $('cliente').value = o.cliente; $('maoDeObra').value = o.maoDeObra; $('margem').value = o.margem;
  $('itens').innerHTML = o.itens.map((it, i) => `
    <div class="item">
      <div class="item-topo"><strong>Item ${i+1}</strong>
        <div><button class="mini" data-acao="voz-item" data-i="${i}">🎤 Falar</button>
             <button class="mini perigo" data-acao="del-item" data-i="${i}">🗑 Tirar</button></div></div>
      <label>O que é?</label>
      <input type="text" autocomplete="off" data-i="${i}" data-campo="desc" value="${esc(it.desc)}" placeholder="Ex.: saco de cimento">
      <div class="duas">
        <div><label>Quantidade</label>
          <input inputmode="decimal" autocomplete="off" data-i="${i}" data-campo="qtd" value="${esc(it.qtd)}"></div>
        <div><label>Preço de cada (R$)</label>
          <input inputmode="decimal" autocomplete="off" data-i="${i}" data-campo="preco" value="${esc(it.preco)}" placeholder="0,00"></div>
      </div>
      <div class="item-total">Total do item: <strong id="tot-${i}">R$ 0,00</strong></div>
    </div>`).join('');
  atualizarTotais();
}
function aoOuvirItem(i, texto){
  const p = interpretar(texto), item = dados.orc.itens[i];
  if(!item) return;
  if(p.numeros.length >= 2){ item.qtd = campoNum(p.numeros[0]); item.preco = campoNum(p.numeros[p.numeros.length-1]); }
  else if(p.numeros.length === 1){ item.preco = campoNum(p.numeros[0]); }
  item.desc = p.descricao || maiuscula(texto);
  salvar(); renderOrcamento();
  aviso(`🎤 Entendi: ${item.qtd || 1} × ${brl(lerNumero(item.preco))}. Confira os campos.`, 'ok');
}
function textoOrcamento(){
  const o = dados.orc, c = calcOrcamento(), L = [];
  L.push(`*ORÇAMENTO${o.cliente ? ' — ' + o.cliente : ''}*`);
  L.push(new Date().toLocaleDateString('pt-BR'));
  L.push('');
  const itens = o.itens.filter(it => it.desc.trim() || lerNumero(it.preco) > 0);
  if(itens.length){
    L.push('*Materiais*');
    itens.forEach(it => {
      const q = lerNumero(it.qtd), p = lerNumero(it.preco);
      L.push(`• ${it.desc.trim() || 'Item'}: ${String(q).replace('.', ',')} × ${brl(p)} = ${brl(q * p)}`);
    });
    L.push('');
  }
  if(c.mao) L.push(`*Mão de obra:* ${brl(c.mao)}`);
  L.push(`*TOTAL: ${brl(c.total)}*`);
  return L.join('\n');
}
async function copiarTexto(txt){
  try{ await navigator.clipboard.writeText(txt); return true; }
  catch(e){
    const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta);
    ta.select(); let ok = false; try{ ok = document.execCommand('copy'); }catch(_){}
    ta.remove(); return ok;
  }
}

// --- Lista ---
let mesVista = mesAtual();
function mudarMes(delta){
  const [y, m] = mesVista.split('-').map(Number), d = new Date(y, m - 1 + delta, 1);
  mesVista = `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;
  renderLista();
}
function renderLista(){
  $('lista-mes').textContent = nomeMes(mesVista);
  const itens = dados.gastos.filter(g => g.data.startsWith(mesVista))
    .sort((a, b) => b.data.localeCompare(a.data) || b.criado - a.criado);
  $('lista-total').textContent = brl(itens.reduce((s, g) => s + g.valor, 0));
  $('lista-itens').innerHTML = itens.length ? itens.map(g => {
    const c = catPorId(g.cat), [y, m, d] = g.data.split('-');
    return `<div class="gasto">
      <div><strong>${esc(g.desc || c.nome)}</strong><div class="quando">${d}/${m} · ${c.icone} ${c.nome}</div></div>
      <div class="v">${brl(g.valor)}</div>
      <button class="mini perigo" data-acao="apagar-gasto" data-id="${g.id}">🗑 Apagar</button>
    </div>`;
  }).join('') : '<p class="centro suave">Nada anotado neste mês ainda.</p>';
}
function apagarGasto(id){
  const g = dados.gastos.find(x => x.id === id);
  if(!g) return;
  if(confirm(`Apagar este gasto de ${brl(g.valor)}?`)){
    dados.gastos = dados.gastos.filter(x => x.id !== id);
    salvar(); renderLista();
  }
}

// --- Ajustes ---
function renderAjustes(){
  $('teto').value = dados.teto ? campoNum(dados.teto) : '';
  $('ajustes-cats').innerHTML = CATEGORIAS.filter(c => c.id !== 'outros').map(c => `
    <label for="ct-${c.id}">${c.icone} ${c.nome} (R$)</label>
    <input id="ct-${c.id}" inputmode="decimal" autocomplete="off" data-catteto="${c.id}"
      value="${dados.tetos[c.id] ? campoNum(dados.tetos[c.id]) : ''}" placeholder="Sem teto">`).join('');
}
function exportar(){
  const blob = new Blob([JSON.stringify(dados, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `caderninho-${hojeISO()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  aviso('💾 Cópia guardada na pasta de downloads.', 'ok');
}

// ===== VOZ (Chrome no celular; precisa de internet) =====
const Reconhecimento = window.SpeechRecognition || window.webkitSpeechRecognition;
function ouvir(aoOuvir, botao){
  if(!Reconhecimento){ aviso('Este navegador não entende voz. Use o Chrome no celular, ou digite.', 'erro'); return; }
  const original = botao.innerHTML, r = new Reconhecimento();
  r.lang = 'pt-BR'; r.interimResults = false; r.maxAlternatives = 1;
  botao.innerHTML = '🎤 Ouvindo... fale agora'; botao.classList.add('ouvindo');
  const voltar = () => { botao.classList.remove('ouvindo'); botao.innerHTML = original; };
  r.onresult = e => aoOuvir(e.results[0][0].transcript);
  r.onerror = e => aviso(e.error === 'not-allowed' ? 'Permita o microfone nas configurações do navegador.'
    : e.error === 'no-speech' ? 'Não ouvi nada. Tente de novo.'
    : 'Não consegui ouvir. Tente de novo (precisa de internet).', 'erro');
  r.onend = voltar;
  try{ r.start(); }catch(_){ voltar(); }
}

// ===== NAVEGAÇÃO =====
function irPara(nome){
  document.querySelectorAll('.tela').forEach(s => s.classList.toggle('ativa', s.id === 'tela-' + nome));
  document.querySelectorAll('.menu button').forEach(b => b.setAttribute('aria-current', b.dataset.tela === nome ? 'page' : 'false'));
  const desenhar = {inicio: renderInicio, lista: renderLista, orcamento: renderOrcamento, ajustes: renderAjustes}[nome];
  if(desenhar) desenhar();
  window.scrollTo(0, 0);
}

// ===== CLIQUES =====
document.addEventListener('click', e => {
  const b = e.target.closest('[data-acao]');
  if(!b) return;
  const a = b.dataset.acao;
  if(a === 'ir') irPara(b.dataset.tela);
  else if(a === 'cat'){ catEscolhida = b.dataset.cat; catManual = true; marcarCats(); }
  else if(a === 'salvar-gasto') salvarGasto();
  else if(a === 'voz-gasto') ouvir(aoOuvirGasto, b);
  else if(a === 'mes') mudarMes(Number(b.dataset.delta));
  else if(a === 'apagar-gasto') apagarGasto(b.dataset.id);
  else if(a === 'add-item'){ dados.orc.itens.push(novoItem()); salvar(); renderOrcamento();
    const campos = document.querySelectorAll('#itens input[data-campo=desc]'); campos[campos.length-1].focus(); }
  else if(a === 'del-item'){
    const i = Number(b.dataset.i);
    if(dados.orc.itens.length > 1) dados.orc.itens.splice(i, 1); else dados.orc.itens[0] = novoItem();
    salvar(); renderOrcamento();
  }
  else if(a === 'voz-item'){ const i = Number(b.dataset.i); ouvir(t => aoOuvirItem(i, t), b); }
  else if(a === 'zap') window.open('https://wa.me/?text=' + encodeURIComponent(textoOrcamento()), '_blank');
  else if(a === 'copiar') copiarTexto(textoOrcamento()).then(ok => aviso(ok ? '📋 Texto copiado! Agora é só colar.' : 'Não consegui copiar.', ok ? 'ok' : 'erro'));
  else if(a === 'novo-orc'){
    if(confirm('Apagar este orçamento e começar um novo?')){ dados.orc = padrao().orc; salvar(); renderOrcamento(); }
  }
  else if(a === 'exportar') exportar();
  else if(a === 'fechar-aviso') $('aviso').hidden = true;
});

// ===== DIGITAÇÃO NOS CAMPOS =====
document.addEventListener('input', e => {
  const t = e.target;
  if(t.dataset.campo){
    dados.orc.itens[Number(t.dataset.i)][t.dataset.campo] = t.value;
    salvar(); atualizarTotais(); return;
  }
  if(t.dataset.catteto){ dados.tetos[t.dataset.catteto] = lerNumero(t.value); salvar(); return; }
  if(t.id === 'cliente'){ dados.orc.cliente = t.value; salvar(); }
  else if(t.id === 'maoDeObra'){ dados.orc.maoDeObra = t.value; salvar(); atualizarTotais(); }
  else if(t.id === 'margem'){ dados.orc.margem = t.value; salvar(); atualizarTotais(); }
  else if(t.id === 'teto'){ dados.teto = lerNumero(t.value); salvar(); }
  else if(t.id === 'desc' && !catManual){
    const c = adivinharCategoria(semAcento(t.value).split(/\s+/));
    if(c){ catEscolhida = c; marcarCats(); }
  }
});

// recuperar cópia de segurança
$('arquivo').addEventListener('change', e => {
  const f = e.target.files[0];
  if(!f) return;
  const leitor = new FileReader();
  leitor.onload = () => {
    try{
      const d = JSON.parse(leitor.result);
      if(!Array.isArray(d.gastos)) throw new Error('arquivo errado');
      if(confirm('Isso troca tudo o que está neste aparelho pela cópia. Continuar?')){
        dados = Object.assign(padrao(), d); salvar(); renderAjustes();
        aviso('✅ Cópia recuperada.', 'ok');
      }
    }catch(_){ aviso('Esse arquivo não é uma cópia do Caderninho.', 'erro'); }
    e.target.value = '';
  };
  leitor.readAsText(f);
});

// ===== COMEÇAR =====
marcarCats();
renderInicio();

// Deixa o app abrir sem internet (só funciona em https ou localhost)
if('serviceWorker' in navigator){
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
