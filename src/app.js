import {
  SecretError, cleanName, nameProblem, parseNameList, drawAssignment, cycleOrder, parseMoney, formatMoney,
  formatEventDate, formatTime, compactEvent, encodeReveal, decodeReveal, revealCodeFromHash, randomKey,
  inviteMessage, whatsappUrl,
} from './secret.js';

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'amigo-secreto:v1';
const EVENT_FIELDS = { title: 'ev-titulo', date: 'ev-data', time: 'ev-hora', value: 'ev-valor', place: 'ev-local', notes: 'ev-obs' };

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.includes('-')) node.setAttribute(key, value);
    else node[key] = value;
  }
  node.append(...children.filter((c) => c != null));
  return node;
}

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const uid = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');

function showMessage(node, message) {
  node.textContent = message ?? '';
  node.hidden = !message;
}

function legacyCopy(text) {
  const area = el('textarea', { value: text, readOnly: true });
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      // Alguns navegadores deixam a promessa pendente quando não há permissão.
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('tempo esgotado')), 1500));
      await Promise.race([navigator.clipboard.writeText(text), timeout]);
      return true;
    } catch {
      // tenta o método antigo abaixo
    }
  }
  return legacyCopy(text);
}

/* ---------- estado ---------- */
function emptyState() {
  return {
    event: { title: '', date: '', time: '', value: '', place: '', notes: '' },
    participants: [],
    restrictions: [],
    singleCycle: false,
    draw: null,
  };
}

function loadState() {
  const base = emptyState();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || typeof saved !== 'object') return base;
    const participants = Array.isArray(saved.participants)
      ? saved.participants.filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string' && cleanName(p.name))
      : [];
    const ids = new Set(participants.map((p) => p.id));
    const restrictions = Array.isArray(saved.restrictions)
      ? saved.restrictions.filter((r) => r && ids.has(r.from) && ids.has(r.to) && r.from !== r.to)
      : [];
    const draw = saved.draw && Array.isArray(saved.draw.pairs)
      && saved.draw.pairs.every((p) => typeof p.from === 'string' && typeof p.to === 'string' && Array.isArray(p.key) && p.key.length === 8)
      ? { ...saved.draw, sent: saved.draw.sent && typeof saved.draw.sent === 'object' ? saved.draw.sent : {} }
      : null;
    const event = { ...base.event };
    for (const key of Object.keys(event)) if (typeof saved.event?.[key] === 'string') event[key] = saved.event[key];
    return { event, participants, restrictions, singleCycle: Boolean(saved.singleCycle), draw };
  } catch {
    return base;
  }
}

let state = loadState();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // sem armazenamento disponível: segue sem salvar
  }
}

function signature() {
  return JSON.stringify({
    p: state.participants.map((p) => `${p.id}:${p.name}`),
    r: state.restrictions.map((r) => `${r.from}>${r.to}:${r.mutual ? 1 : 0}`),
    c: state.singleCycle,
  });
}

const nameOf = (id) => state.participants.find((p) => p.id === id)?.name ?? '';

/* ---------- evento ---------- */
function currentEvent() {
  let value = null;
  try {
    value = parseMoney(state.event.value);
  } catch {
    value = null;
  }
  return compactEvent({ ...state.event, value });
}

function setupEvent() {
  for (const [key, id] of Object.entries(EVENT_FIELDS)) {
    const input = $(id);
    input.value = state.event[key];
    input.addEventListener('input', () => {
      state.event[key] = input.value;
      if (key === 'value') validateValue();
      save();
      scheduleLinksRender();
    });
  }
  validateValue();
}

function validateValue() {
  let message = '';
  try {
    parseMoney(state.event.value);
  } catch (error) {
    message = error.message;
  }
  showMessage($('ev-valor-erro'), message);
  $('ev-valor').setAttribute('aria-invalid', String(Boolean(message)));
  return !message;
}

/* ---------- participantes ---------- */
function addParticipant(raw) {
  const problem = nameProblem(state.participants.map((p) => p.name), raw);
  if (problem) return problem;
  state.participants.push({ id: uid(), name: cleanName(raw) });
  return null;
}

function removeParticipant(id) {
  state.participants = state.participants.filter((p) => p.id !== id);
  state.restrictions = state.restrictions.filter((r) => r.from !== id && r.to !== id);
}

function renderParticipants() {
  const list = $('pessoas-lista');
  list.replaceChildren(...state.participants.map((p) => {
    const remove = el('button', { type: 'button', class: 'icon-btn', 'aria-label': `Remover ${p.name}`, text: '×' });
    remove.addEventListener('click', () => {
      removeParticipant(p.id);
      changed();
      $('pessoa-nome').focus();
    });
    return el('li', {}, el('span', { text: p.name }), remove);
  }));
  const n = state.participants.length;
  $('pessoas-contagem').textContent = n === 0
    ? 'Nenhum participante ainda.'
    : `${n} ${n === 1 ? 'participante' : 'participantes'}${n < 3 ? ' (mínimo de 3 para sortear)' : ''}`;
}

function setupParticipants() {
  $('form-pessoa').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = $('pessoa-nome');
    const problem = addParticipant(input.value);
    showMessage($('pessoa-erro'), problem);
    input.setAttribute('aria-invalid', String(Boolean(problem)));
    if (problem) return;
    input.value = '';
    changed();
    input.focus();
  });
  $('pessoas-lote-add').addEventListener('click', () => {
    const names = parseNameList($('pessoas-lote').value);
    const skipped = [];
    let added = 0;
    for (const name of names) {
      if (addParticipant(name)) skipped.push(name);
      else added += 1;
    }
    const parts = [`${added} ${added === 1 ? 'nome adicionado' : 'nomes adicionados'}.`];
    if (skipped.length) parts.push(`Ficaram de fora (repetidos ou inválidos): ${skipped.join(', ')}.`);
    $('pessoas-lote-status').textContent = names.length ? parts.join(' ') : 'Cole pelo menos um nome.';
    if (added) {
      $('pessoas-lote').value = '';
      changed();
    }
  });
}

/* ---------- restrições ---------- */
function describeRestriction(r) {
  return r.mutual ? `${nameOf(r.from)} e ${nameOf(r.to)} não se tiram` : `${nameOf(r.from)} não tira ${nameOf(r.to)}`;
}

function covers(r, from, to) {
  return (r.from === from && r.to === to) || (r.mutual && r.from === to && r.to === from);
}

function addRestriction(from, to, mutual) {
  if (!from || !to) return 'Adicione participantes primeiro.';
  if (from === to) return 'Escolha duas pessoas diferentes: ninguém tira a si mesmo, isso já é automático.';
  const forward = state.restrictions.some((r) => covers(r, from, to));
  const backward = state.restrictions.some((r) => covers(r, to, from));
  if (forward && (!mutual || backward)) return 'Essa restrição já existe.';
  if (mutual) state.restrictions = state.restrictions.filter((r) => !covers(r, from, to) && !covers(r, to, from));
  state.restrictions.push({ id: uid(), from, to, mutual });
  return null;
}

function renderRestrictionForm() {
  const people = state.participants;
  for (const id of ['restr-de', 'restr-para']) {
    const select = $(id);
    const previous = select.value;
    select.replaceChildren(...people.map((p) => el('option', { value: p.id, text: p.name })));
    if (people.some((p) => p.id === previous)) select.value = previous;
    select.disabled = people.length < 2;
  }
  if (people.length >= 2 && $('restr-de').value === $('restr-para').value) {
    $('restr-para').value = people.find((p) => p.id !== $('restr-de').value).id;
  }
  $('restr-add').disabled = people.length < 2;
}

function renderRestrictions() {
  $('restr-lista').replaceChildren(...state.restrictions.map((r) => {
    const text = describeRestriction(r);
    const remove = el('button', { type: 'button', class: 'icon-btn', 'aria-label': `Remover restrição: ${text}`, text: '×' });
    remove.addEventListener('click', () => {
      state.restrictions = state.restrictions.filter((x) => x.id !== r.id);
      changed();
    });
    return el('li', {}, el('span', { text }), remove);
  }));
}

function setupRestrictions() {
  $('form-restricao').addEventListener('submit', (event) => {
    event.preventDefault();
    const problem = addRestriction($('restr-de').value, $('restr-para').value, $('restr-mutua').checked);
    showMessage($('restr-erro'), problem);
    if (!problem) changed();
  });
}

/* ---------- sorteio ---------- */
function forbiddenPairs() {
  const index = new Map(state.participants.map((p, i) => [p.id, i]));
  return state.restrictions.flatMap((r) => {
    const pair = [index.get(r.from), index.get(r.to)];
    return r.mutual ? [pair, [pair[1], pair[0]]] : [pair];
  });
}

function runDraw() {
  const errorBox = $('sorteio-erro');
  showMessage(errorBox, '');
  if (!validateValue()) {
    showMessage(errorBox, 'Corrija o valor sugerido antes de sortear.');
    return;
  }
  let targets;
  try {
    targets = drawAssignment({
      names: state.participants.map((p) => p.name),
      forbidden: forbiddenPairs(),
      singleCycle: state.singleCycle,
    });
  } catch (error) {
    showMessage(errorBox, error instanceof SecretError ? error.message : `Algo deu errado: ${error.message}`);
    return;
  }
  state.draw = {
    at: new Date().toISOString(),
    singleCycle: state.singleCycle,
    signature: signature(),
    pairs: state.participants.map((p, i) => ({
      id: p.id, from: p.name, to: state.participants[targets[i]].name, key: Array.from(randomKey()),
    })),
    order: state.singleCycle ? cycleOrder(targets).map((i) => state.participants[i].name) : null,
    sent: {},
  };
  save();
  hideFullResult();
  renderLinks();
  $('links-status').textContent = 'Sorteio feito! Agora envie para cada pessoa o link dela.';
  $('links').scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  $('links-titulo').focus({ preventScroll: true });
}

function setupDraw() {
  const checkbox = $('corrente-unica');
  checkbox.checked = state.singleCycle;
  checkbox.addEventListener('change', () => {
    state.singleCycle = checkbox.checked;
    changed();
  });
  $('sortear').addEventListener('click', () => {
    const sentCount = state.draw ? Object.keys(state.draw.sent).length : 0;
    if (sentCount > 0) {
      $('resortear-texto').textContent = `Você já enviou ${sentCount} ${sentCount === 1 ? 'link' : 'links'}. Um novo sorteio muda os resultados, e os links antigos continuam mostrando o sorteio anterior. Sortear de novo mesmo assim?`;
      $('resortear-aviso').hidden = false;
      $('resortear-sim').focus();
      return;
    }
    runDraw();
  });
  $('resortear-sim').addEventListener('click', () => {
    $('resortear-aviso').hidden = true;
    runDraw();
  });
  $('resortear-nao').addEventListener('click', () => {
    $('resortear-aviso').hidden = true;
    $('sortear').focus();
  });
}

/* ---------- links ---------- */
function baseUrl() {
  return location.href.split('#')[0];
}

function linkFor(pair) {
  const code = encodeReveal({ from: pair.from, to: pair.to, event: currentEvent() }, Uint8Array.from(pair.key));
  return `${baseUrl()}#r=${code}`;
}

function markSent(pair, row) {
  state.draw.sent[pair.id] = true;
  save();
  row.querySelector('.sent').hidden = false;
}

function renderLinks() {
  const section = $('links');
  const draw = state.draw;
  section.hidden = !draw;
  if (!draw) return;
  $('links-desatualizado').hidden = draw.signature === signature();
  $('links-manual').hidden = true;
  $('links-lista').replaceChildren(...draw.pairs.map((pair) => {
    const link = linkFor(pair);
    const message = inviteMessage(pair.from, link);
    const sent = el('span', { class: 'sent', text: '✓ enviado' });
    sent.hidden = !draw.sent[pair.id];
    const copy = el('button', { type: 'button', class: 'btn secondary small', text: 'Copiar mensagem' });
    const whats = el('a', {
      class: 'btn small', href: whatsappUrl(message), target: '_blank', rel: 'noopener noreferrer', text: 'Enviar pelo WhatsApp',
    });
    const row = el('li', {}, el('div', { class: 'who' }, el('span', { text: pair.from }), sent), el('div', { class: 'row-actions' }, copy, whats));
    copy.addEventListener('click', async () => {
      const ok = await copyText(message);
      const status = $('links-status');
      status.classList.toggle('bad', !ok);
      status.textContent = ok
        ? `Mensagem para ${pair.from} copiada.`
        : `Não deu para copiar automaticamente. A mensagem para ${pair.from} está no campo abaixo.`;
      $('links-manual').hidden = ok;
      if (ok) {
        markSent(pair, row);
        return;
      }
      const area = $('links-manual-texto');
      area.value = message;
      area.focus();
      area.select();
    });
    whats.addEventListener('click', () => markSent(pair, row));
    return row;
  }));
}

let linksTimer;
function scheduleLinksRender() {
  clearTimeout(linksTimer);
  linksTimer = setTimeout(renderLinks, 300);
}

function hideFullResult() {
  $('completo').hidden = true;
  $('completo-aviso').hidden = true;
  $('completo-abrir').hidden = false;
}

function setupFullResult() {
  $('completo-abrir').addEventListener('click', () => {
    $('completo-aviso').hidden = false;
    $('completo-sim').focus();
  });
  $('completo-nao').addEventListener('click', () => {
    $('completo-aviso').hidden = true;
    $('completo-abrir').focus();
  });
  $('completo-sim').addEventListener('click', () => {
    const draw = state.draw;
    $('completo-lista').replaceChildren(...draw.pairs.map((p) => el('li', { text: `${p.from} tirou ${p.to}` })));
    const roda = $('completo-roda');
    roda.hidden = !draw.order;
    roda.textContent = draw.order ? `Ordem da roda: ${draw.order.join(' → ')}` : '';
    $('completo-aviso').hidden = true;
    $('completo-abrir').hidden = true;
    $('completo').hidden = false;
    $('completo-esconder').focus();
  });
  $('completo-esconder').addEventListener('click', () => {
    hideFullResult();
    $('completo-abrir').focus();
  });
}

function setupReset() {
  const button = $('recomecar');
  let armed = null;
  button.addEventListener('click', () => {
    if (!armed) {
      button.textContent = 'Clique de novo para apagar tudo';
      armed = setTimeout(() => {
        button.textContent = 'Começar outro amigo secreto';
        armed = null;
      }, 3000);
      return;
    }
    clearTimeout(armed);
    armed = null;
    button.textContent = 'Começar outro amigo secreto';
    state = emptyState();
    for (const [key, id] of Object.entries(EVENT_FIELDS)) $(id).value = state.event[key];
    $('corrente-unica').checked = false;
    validateValue();
    hideFullResult();
    for (const id of ['pessoa-erro', 'restr-erro', 'sorteio-erro']) showMessage($(id), '');
    $('links-status').textContent = '';
    changed();
    window.scrollTo({ top: 0 });
    $('ev-titulo').focus({ preventScroll: true });
  });
}

function changed() {
  save();
  renderParticipants();
  renderRestrictionForm();
  renderRestrictions();
  renderLinks();
}

/* ---------- revelação ---------- */
function renderEventInfo(dl, event) {
  const rows = [];
  const add = (term, value) => rows.push(el('dt', { text: term }), el('dd', { text: value }));
  if (event?.date) add('Data', formatEventDate(event.date));
  if (event?.time) add('Horário', formatTime(event.time));
  if (event?.place) add('Local', event.place);
  if (event?.value != null) add('Valor sugerido', formatMoney(event.value));
  if (event?.notes) add('Observações', event.notes);
  dl.replaceChildren(...rows);
  dl.hidden = rows.length === 0;
}

function confetti(container) {
  const colors = ['#f5c542', '#be123c', '#22c55e', '#3b82f6', '#fb7185', '#a855f7'];
  const layer = el('div', { class: 'confetti', 'aria-hidden': 'true' });
  for (let i = 0; i < 28; i += 1) {
    const piece = el('i');
    piece.style.left = `${(i * 37 + 11) % 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${(i % 7) * 0.08}s`;
    layer.append(piece);
  }
  container.append(layer);
  setTimeout(() => layer.remove(), 3200);
}

function showReveal(code) {
  $('organizar').hidden = true;
  $('revelar').hidden = false;
  document.title = 'Seu amigo secreto — Amigo Secreto';
  const question = $('revelar-pergunta');
  const result = $('revelar-resultado');
  const error = $('revelar-erro');
  let data;
  try {
    data = decodeReveal(code);
  } catch (e) {
    question.hidden = true;
    result.hidden = true;
    $('revelar-evento').hidden = true;
    showMessage(error, e instanceof SecretError ? e.message : 'Não consegui ler este link.');
    return;
  }
  showMessage(error, '');
  $('revelar-titulo').textContent = data.event?.title ?? 'Seu amigo secreto';
  $('revelar-nome').textContent = data.from;
  question.hidden = false;
  result.hidden = true;
  $('revelar-outro').hidden = true;
  renderEventInfo($('revelar-evento'), data.event);

  const gift = $('revelar-presente');
  const target = $('revelar-alvo');
  const phrase = $('revelar-frase');
  const hideButton = $('revelar-esconder');
  let timers = [];
  const clearTimers = () => {
    timers.forEach(clearTimeout);
    timers = [];
  };
  const finish = () => {
    gift.hidden = true;
    phrase.hidden = false;
    target.textContent = data.to;
    target.classList.add('pop');
    hideButton.hidden = false;
  };

  $('revelar-sim').onclick = () => {
    clearTimers();
    question.hidden = true;
    $('revelar-outro').hidden = true;
    result.hidden = false;
    target.textContent = '';
    target.classList.remove('pop');
    phrase.hidden = true;
    hideButton.hidden = true;
    if (prefersReducedMotion()) {
      finish();
      hideButton.focus();
      return;
    }
    gift.hidden = false;
    gift.className = 'gift shake';
    timers.push(setTimeout(() => { gift.className = 'gift open'; }, 750));
    timers.push(setTimeout(() => {
      finish();
      confetti($('revelar-cartao'));
      hideButton.focus({ preventScroll: true });
    }, 1150));
  };
  $('revelar-nao').onclick = () => {
    const box = $('revelar-outro');
    box.textContent = `Este link é só para ${data.from}. Feche esta página sem revelar e avise quem organizou o amigo secreto.`;
    box.hidden = false;
  };
  hideButton.onclick = () => {
    clearTimers();
    result.hidden = true;
    target.textContent = '';
    question.hidden = false;
    $('revelar-sim').focus();
  };
}

function route() {
  const code = revealCodeFromHash(location.hash);
  if (code !== null) {
    showReveal(code);
    return;
  }
  $('revelar').hidden = true;
  $('organizar').hidden = false;
  document.title = 'Amigo Secreto — sorteio com restrições e um link secreto para cada pessoa';
}

setupEvent();
setupParticipants();
setupRestrictions();
setupDraw();
setupFullResult();
setupReset();
changed();
route();
window.addEventListener('hashchange', route);
