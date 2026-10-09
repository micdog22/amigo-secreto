// Lógica pura do Amigo Secreto (sem DOM): sorteio com restrições e links de revelação.

export const MIN_PARTICIPANTS = 3;
export const MAX_PARTICIPANTS = 200;
export const MAX_NAME_LENGTH = 60;
export const EVENT_LIMITS = Object.freeze({ title: 80, place: 120, notes: 300 });

const LINK_VERSION = 1;
export const KEY_LENGTH = 8;
const encoder = new TextEncoder();

export class SecretError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SecretError';
  }
}

/* ---------- nomes ---------- */

export function cleanName(name) {
  return String(name ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
}

export function nameKey(name) {
  return cleanName(name).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function parseNameList(text) {
  return String(text ?? '').split(/\r\n|\r|\n|;/).map(cleanName).filter(Boolean);
}

/** "Ana", "Ana e Bruno", "Ana, Bruno e Carla", "Ana, Bruno, … e mais 3". */
export function listNames(names, max = 6) {
  if (names.length === 0) return '';
  const shown = names.length > max ? [...names.slice(0, max - 1), `mais ${names.length - (max - 1)}`] : [...names];
  if (shown.length === 1) return shown[0];
  return `${shown.slice(0, -1).join(', ')} e ${shown[shown.length - 1]}`;
}

/** Mensagem de erro para um nome novo, ou null se ele pode entrar na lista. */
export function nameProblem(existing, name) {
  const clean = cleanName(name);
  if (!clean) return 'Digite um nome.';
  if (clean.length > MAX_NAME_LENGTH) return `Use no máximo ${MAX_NAME_LENGTH} caracteres no nome.`;
  const key = nameKey(clean);
  const twin = existing.find((other) => nameKey(other) === key);
  if (twin) return `“${twin}” já está na lista. Use um sobrenome ou apelido para diferenciar.`;
  if (existing.length >= MAX_PARTICIPANTS) return `O limite é de ${MAX_PARTICIPANTS} participantes.`;
  return null;
}

export function validateNames(names) {
  if (names.length < MIN_PARTICIPANTS) {
    throw new SecretError(`Adicione pelo menos ${MIN_PARTICIPANTS} participantes para sortear.`);
  }
  const seen = [];
  for (const name of names) {
    const problem = nameProblem(seen, name);
    if (problem) throw new SecretError(problem);
    seen.push(cleanName(name));
  }
}

/* ---------- sorteio ---------- */

/** Aleatório sem viés em [0, n) usando crypto.getRandomValues. */
export function cryptoRandomInt(n) {
  const buf = new Uint32Array(1);
  const limit = 2 ** 32 - (2 ** 32 % n);
  do globalThis.crypto.getRandomValues(buf); while (buf[0] >= limit);
  return buf[0] % n;
}

function range(n) {
  return Array.from({ length: n }, (_, i) => i);
}

export function shuffle(items, randomInt) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** allowed[i][j] = true quando i pode tirar j. forbidden: pares [de, para] por índice. */
export function buildAllowed(n, forbidden = []) {
  const allowed = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i !== j));
  for (const [from, to] of forbidden) {
    if (allowed[from] && to >= 0 && to < n) allowed[from][to] = false;
  }
  return allowed;
}

export function isValidAssignment(targets, allowed, singleCycle = false) {
  const n = allowed.length;
  if (!Array.isArray(targets) || targets.length !== n) return false;
  const used = new Set();
  for (let i = 0; i < n; i += 1) {
    const t = targets[i];
    if (!Number.isInteger(t) || t < 0 || t >= n || !allowed[i][t] || used.has(t)) return false;
    used.add(t);
  }
  return !singleCycle || cycleOrder(targets).length === n + 1;
}

/** Ordem da roda a partir da pessoa 0: [0, alvo(0), alvo(alvo(0)), …, 0]. */
export function cycleOrder(targets) {
  const order = [0];
  let current = 0;
  for (let step = 0; step < targets.length; step += 1) {
    current = targets[current];
    order.push(current);
    if (current === 0) break;
  }
  return order;
}

/** Emparelhamento máximo (algoritmo de Kuhn): mostra se existe sorteio possível. */
export function maximumMatching(allowed, randomInt = null) {
  const n = allowed.length;
  const giverOf = new Array(n).fill(-1);
  const adjacency = allowed.map((row) => {
    const options = range(n).filter((j) => row[j]);
    return randomInt ? shuffle(options, randomInt) : options;
  });
  const augment = (i, seen) => {
    for (const j of adjacency[i]) {
      if (seen[j]) continue;
      seen[j] = true;
      if (giverOf[j] === -1 || augment(giverOf[j], seen)) {
        giverOf[j] = i;
        return true;
      }
    }
    return false;
  };
  const unmatched = [];
  const order = randomInt ? shuffle(range(n), randomInt) : range(n);
  for (const i of order) {
    if (!augment(i, new Array(n).fill(false))) unmatched.push(i);
  }
  return { size: n - unmatched.length, giverOf, unmatched };
}

function explainImpossible(names, allowed, matching) {
  const n = names.length;
  for (let i = 0; i < n; i += 1) {
    if (!allowed[i].some(Boolean)) return `${names[i]} não pode tirar ninguém: todas as outras pessoas estão nas restrições dessa pessoa.`;
  }
  for (let j = 0; j < n; j += 1) {
    if (!allowed.some((row) => row[j])) return `Ninguém pode tirar ${names[j]}: todas as outras pessoas têm restrição com essa pessoa.`;
  }
  // Teorema de Hall: a partir de quem ficou sem par, junta o grupo que disputa os mesmos nomes.
  const group = new Set(matching.unmatched);
  const options = new Set();
  const queue = [...matching.unmatched];
  while (queue.length) {
    const i = queue.shift();
    for (let j = 0; j < n; j += 1) {
      if (!allowed[i][j] || options.has(j)) continue;
      options.add(j);
      const other = matching.giverOf[j];
      if (other !== -1 && !group.has(other)) {
        group.add(other);
        queue.push(other);
      }
    }
  }
  const people = [...group].sort((a, b) => a - b).map((i) => names[i]);
  const allowedNames = [...options].sort((a, b) => a - b).map((j) => names[j]);
  const count = allowedNames.length === 1 ? '1 nome' : `${allowedNames.length} nomes`;
  return `${listNames(people)} só podem tirar ${listNames(allowedNames)}: são ${people.length} pessoas para ${count}. Remova alguma restrição.`;
}

function reachable(allowed, start, forward) {
  const n = allowed.length;
  const seen = new Array(n).fill(false);
  seen[start] = true;
  const stack = [start];
  while (stack.length) {
    const v = stack.pop();
    for (let w = 0; w < n; w += 1) {
      const edge = forward ? allowed[v][w] : allowed[w][v];
      if (edge && !seen[w]) {
        seen[w] = true;
        stack.push(w);
      }
    }
  }
  return seen;
}

/** Na corrente única todos precisam estar numa roda só (grafo fortemente conexo). */
function explainSplitCycle(names, allowed) {
  for (const forward of [true, false]) {
    const seen = reachable(allowed, 0, forward);
    if (seen.every(Boolean)) continue;
    const inside = names.filter((_, i) => seen[i]);
    const outside = names.filter((_, i) => !seen[i]);
    const [from, to] = forward ? [inside, outside] : [outside, inside];
    return `Corrente única impossível: ninguém do grupo ${listNames(from)} pode tirar alguém do grupo ${listNames(to)}, então a roda não fecha. Desmarque “corrente única” ou remova alguma restrição.`;
  }
  return null;
}

/** Tentativas uniformes: cada combinação válida tem a mesma chance. */
function sampleUniform(allowed, singleCycle, randomInt, attempts) {
  const n = allowed.length;
  for (let k = 0; k < attempts; k += 1) {
    let targets;
    if (singleCycle) {
      const order = shuffle(range(n), randomInt);
      targets = new Array(n);
      for (let i = 0; i < n; i += 1) targets[order[i]] = order[(i + 1) % n];
    } else {
      targets = shuffle(range(n), randomInt);
    }
    if (isValidAssignment(targets, allowed, singleCycle)) return targets;
  }
  return null;
}

/**
 * Backtracking aleatório: escolhe primeiro quem tem menos opções e testa os alvos em ordem embaralhada.
 * maxWork limita o trabalho total; exhausted = true significa que a busca terminou sem achar nada.
 */
export function searchDerangement(allowed, randomInt, maxWork = 5000000) {
  const n = allowed.length;
  const targets = new Array(n).fill(-1);
  const used = new Array(n).fill(false);
  const options = allowed.map((row) => shuffle(range(n).filter((j) => row[j]), randomInt));
  const givers = shuffle(range(n), randomInt);
  let work = 0;
  let limited = false;
  const solve = (assigned) => {
    if (assigned === n) return true;
    let best = -1;
    let bestCount = Infinity;
    for (const i of givers) {
      if (targets[i] !== -1) continue;
      let count = 0;
      for (const j of options[i]) if (!used[j]) count += 1;
      work += options[i].length + 1;
      if (count === 0) return false;
      if (count < bestCount) {
        best = i;
        bestCount = count;
      }
    }
    if (work > maxWork) {
      limited = true;
      return false;
    }
    for (const j of options[best]) {
      if (used[j]) continue;
      targets[best] = j;
      used[j] = true;
      if (solve(assigned + 1)) return true;
      targets[best] = -1;
      used[j] = false;
      if (limited) return false;
    }
    return false;
  };
  const found = solve(0);
  return { targets: found ? targets : null, exhausted: !found && !limited };
}

/**
 * Backtracking aleatório para a corrente única (um ciclo que passa por todo mundo).
 * Tenta primeiro quem tem menos saídas livres (regra de Warnsdorff); empates ficam na ordem embaralhada.
 */
export function searchCycle(allowed, randomInt, maxWork = 5000000) {
  const n = allowed.length;
  const targets = new Array(n).fill(-1);
  const visited = new Array(n).fill(false);
  const options = allowed.map((row) => shuffle(range(n).filter((j) => row[j]), randomInt));
  let work = 0;
  let limited = false;
  visited[0] = true;
  const predecessors = range(n).map((v) => range(n).filter((u) => allowed[u][v]));
  const exits = (j) => {
    let count = 0;
    for (const k of options[j]) if (!visited[k] || k === 0) count += 1;
    work += options[j].length;
    return count;
  };
  // Poda: quem ainda está fora da roda precisa de alguém livre para tirá-lo e de alguém livre para tirar.
  const stillPossible = (current) => {
    for (let v = 0; v < n; v += 1) {
      if (visited[v]) continue;
      work += options[v].length + predecessors[v].length;
      if (!options[v].some((k) => !visited[k] || k === 0)) return false;
      if (!predecessors[v].some((k) => !visited[k] || k === current)) return false;
    }
    return true;
  };
  const extend = (current, count) => {
    if (count === n) {
      if (!allowed[current][0]) return false;
      targets[current] = 0;
      return true;
    }
    const candidates = options[current].filter((j) => !visited[j]).map((j) => ({ j, exits: exits(j) }));
    candidates.sort((a, b) => a.exits - b.exits);
    for (const { j } of candidates) {
      work += 1;
      if (work > maxWork) {
        limited = true;
        return false;
      }
      visited[j] = true;
      targets[current] = j;
      if (stillPossible(j) && extend(j, count + 1)) return true;
      visited[j] = false;
      targets[current] = -1;
      if (limited) return false;
    }
    return false;
  };
  const found = extend(0, 1);
  return { targets: found ? targets : null, exhausted: !found && !limited };
}

/**
 * Sorteia quem tira quem. Devolve targets, onde targets[i] é o índice de quem a pessoa i tirou.
 * forbidden: pares [de, para] por índice (restrição mútua = dois pares).
 */
export function drawAssignment({ names, forbidden = [], singleCycle = false, randomInt = cryptoRandomInt, attempts = 2000, maxWork = 5000000 }) {
  validateNames(names);
  const n = names.length;
  const allowed = buildAllowed(n, forbidden);
  const matching = maximumMatching(allowed);
  if (matching.size < n) throw new SecretError(explainImpossible(names, allowed, matching));
  if (singleCycle) {
    const split = explainSplitCycle(names, allowed);
    if (split) throw new SecretError(split);
  }
  const sampled = sampleUniform(allowed, singleCycle, randomInt, attempts);
  if (sampled) return sampled;
  const search = singleCycle ? searchCycle(allowed, randomInt, maxWork) : searchDerangement(allowed, randomInt, maxWork);
  if (search.targets) return search.targets;
  if (!singleCycle) {
    // Garantia: o emparelhamento existe (verificado acima), então usa um emparelhamento aleatório.
    const random = maximumMatching(allowed, randomInt);
    const targets = new Array(n);
    random.giverOf.forEach((giver, target) => { targets[giver] = target; });
    return targets;
  }
  throw new SecretError(search.exhausted
    ? 'Não existe corrente única que respeite todas as restrições. Desmarque “corrente única” ou remova alguma restrição.'
    : 'Não encontrei uma corrente única que respeite todas as restrições. Desmarque “corrente única” ou remova alguma restrição.');
}

/* ---------- evento ---------- */

export function parseMoney(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  const s = raw.replace(/^R\$\s*/i, '').replace(/\s+/g, '');
  let normalized;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s) || /^\d+(,\d{1,2})?$/.test(s)) {
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d+\.\d{1,2}$/.test(s)) {
    normalized = s;
  } else {
    throw new SecretError('Valor sugerido inválido. Use algo como 50 ou 50,00.');
  }
  const cents = Math.round(Number(normalized) * 100);
  if (cents > 100000000) throw new SecretError('Valor sugerido alto demais.');
  return cents;
}

export function formatMoney(cents) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

export function isValidDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

export function formatEventDate(iso) {
  if (!isValidDate(iso)) return String(iso ?? '');
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function isValidTime(text) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(text ?? ''));
  return Boolean(m) && Number(m[1]) < 24 && Number(m[2]) < 60;
}

/** "19:00" → "19h", "19:30" → "19h30". */
export function formatTime(text) {
  if (!isValidTime(text)) return String(text ?? '');
  const [h, m] = text.split(':');
  return `${Number(h)}h${m === '00' ? '' : m}`;
}

/** Monta o objeto do evento só com os campos preenchidos (o valor vai em centavos). */
export function compactEvent(input = {}) {
  const event = {};
  const text = (value, max) => String(value ?? '').normalize('NFC').trim().slice(0, max);
  const title = text(input.title, EVENT_LIMITS.title);
  const place = text(input.place, EVENT_LIMITS.place);
  const notes = text(input.notes, EVENT_LIMITS.notes);
  if (title) event.title = title;
  if (isValidDate(input.date)) event.date = input.date;
  if (isValidTime(input.time)) event.time = input.time;
  if (place) event.place = place;
  if (Number.isInteger(input.value) && input.value >= 0) event.value = input.value;
  if (notes) event.notes = notes;
  return Object.keys(event).length ? event : null;
}

/* ---------- links ---------- */

export function base64UrlEncode(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(text) {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new SecretError('Link inválido.');
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  let binary;
  try {
    binary = atob(padded);
  } catch {
    throw new SecretError('Link inválido.');
  }
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export function randomKey() {
  return globalThis.crypto.getRandomValues(new Uint8Array(KEY_LENGTH));
}

/**
 * Gera o código do link: [versão][chave de 8 bytes][JSON em UTF-8 com XOR da chave], em base64url.
 * Isso evita espiadas acidentais, mas NÃO é criptografia: quem souber decodificar lê o conteúdo.
 */
export function encodeReveal({ from, to, event = null }, key = randomKey()) {
  if (!(key instanceof Uint8Array) || key.length !== KEY_LENGTH) throw new RangeError('A chave precisa ter 8 bytes.');
  const payload = { v: LINK_VERSION, from: cleanName(from), to: cleanName(to) };
  const compact = event ? compactEvent(event) : null;
  if (compact) payload.event = compact;
  const plain = encoder.encode(JSON.stringify(payload));
  const out = new Uint8Array(1 + KEY_LENGTH + plain.length);
  out[0] = LINK_VERSION;
  out.set(key, 1);
  for (let i = 0; i < plain.length; i += 1) out[1 + KEY_LENGTH + i] = plain[i] ^ key[i % KEY_LENGTH];
  return base64UrlEncode(out);
}

const INVALID_LINK = 'Este link está incompleto ou foi alterado. Peça um novo link para quem organizou o amigo secreto.';

export function decodeReveal(code) {
  let bytes;
  try {
    bytes = base64UrlDecode(String(code ?? '').trim());
  } catch {
    throw new SecretError(INVALID_LINK);
  }
  if (bytes.length < 1 + KEY_LENGTH + 2 || bytes[0] !== LINK_VERSION) throw new SecretError(INVALID_LINK);
  const key = bytes.subarray(1, 1 + KEY_LENGTH);
  const plain = bytes.subarray(1 + KEY_LENGTH).map((b, i) => b ^ key[i % KEY_LENGTH]);
  let payload;
  try {
    payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain));
  } catch {
    throw new SecretError(INVALID_LINK);
  }
  const from = typeof payload?.from === 'string' ? cleanName(payload.from) : '';
  const to = typeof payload?.to === 'string' ? cleanName(payload.to) : '';
  if (payload?.v !== LINK_VERSION || !from || !to || from.length > MAX_NAME_LENGTH || to.length > MAX_NAME_LENGTH) {
    throw new SecretError(INVALID_LINK);
  }
  const event = payload.event && typeof payload.event === 'object' ? compactEvent(payload.event) : null;
  return { from, to, event };
}

/** Lê "#r=..." do endereço; devolve null se não for um link de revelação. */
export function revealCodeFromHash(hash) {
  const m = /^#?r=([^&]*)/.exec(String(hash ?? ''));
  return m ? m[1] : null;
}

export function inviteMessage(name, link) {
  return `Oi, ${name}! Seu amigo secreto está neste link: ${link}`;
}

export function whatsappUrl(message) {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
