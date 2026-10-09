import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SecretError, cleanName, nameKey, parseNameList, listNames, nameProblem, validateNames, cryptoRandomInt,
  buildAllowed, isValidAssignment, cycleOrder, maximumMatching, searchDerangement, searchCycle, drawAssignment,
  parseMoney, formatMoney, isValidDate, formatEventDate, isValidTime, formatTime, compactEvent,
  base64UrlEncode, base64UrlDecode, encodeReveal, decodeReveal, revealCodeFromHash, inviteMessage, whatsappUrl,
} from '../src/secret.js';

// Gerador determinístico para os testes (mulberry32).
function seeded(seed) {
  let a = seed >>> 0;
  return (n) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
}

const people = (n) => Array.from({ length: n }, (_, i) => `Pessoa ${i + 1}`);
const NAMES4 = ['Ana', 'Bruno', 'Carla', 'Diego'];
const key = (...bytes) => Uint8Array.from(bytes);

function respects(targets, n, forbidden) {
  const bad = new Set(forbidden.map(([a, b]) => `${a}>${b}`));
  return targets.every((t, i) => t !== i && !bad.has(`${i}>${t}`)) && new Set(targets).size === n;
}

test('nomes: limpeza, chave sem acento e lista colada', () => {
  assert.equal(cleanName('  Maria   da  Silva '), 'Maria da Silva');
  assert.equal(cleanName('Jose\u0301'), 'José');
  assert.equal(nameKey('JOSÉ Conceição'), 'jose conceicao');
  assert.deepEqual(parseNameList('Ana\r\n\n  Bruno  \nCarla; Diego\n'), ['Ana', 'Bruno', 'Carla', 'Diego']);
  assert.equal(listNames(['Ana']), 'Ana');
  assert.equal(listNames(['Ana', 'Bruno']), 'Ana e Bruno');
  assert.equal(listNames(['Ana', 'Bruno', 'Carla']), 'Ana, Bruno e Carla');
  assert.equal(listNames(people(9)), 'Pessoa 1, Pessoa 2, Pessoa 3, Pessoa 4, Pessoa 5 e mais 4');
});

test('nameProblem: vazio, repetido (maiúsculas/acentos) e longo demais', () => {
  assert.equal(nameProblem([], '   '), 'Digite um nome.');
  assert.match(nameProblem(['José'], 'jose'), /“José” já está na lista/);
  assert.match(nameProblem(['Ana'], 'x'.repeat(61)), /no máximo 60/);
  assert.equal(nameProblem(['Ana'], 'Ana Paula'), null);
});

test('validateNames exige 3 pessoas e nomes únicos', () => {
  assert.throws(() => validateNames(['Ana', 'Bruno']), /pelo menos 3/);
  assert.throws(() => validateNames(['Ana', 'Bruno', 'ANA']), /já está na lista/);
  assert.doesNotThrow(() => validateNames(['Ana', 'Bruno', 'Carla']));
});

test('cryptoRandomInt fica no intervalo', () => {
  for (let i = 0; i < 2000; i += 1) {
    const v = cryptoRandomInt(7);
    assert.ok(Number.isInteger(v) && v >= 0 && v < 7);
  }
  assert.equal(cryptoRandomInt(1), 0);
});

test('buildAllowed: ninguém tira a si mesmo e as restrições valem', () => {
  const allowed = buildAllowed(3, [[0, 1]]);
  assert.deepEqual(allowed, [[false, false, true], [true, false, true], [true, true, false]]);
});

test('sorteio sem restrições: 300 rodadas válidas, ninguém se tira', () => {
  const rnd = seeded(1);
  for (let run = 0; run < 300; run += 1) {
    const n = 3 + rnd(28);
    const targets = drawAssignment({ names: people(n), randomInt: rnd });
    assert.ok(isValidAssignment(targets, buildAllowed(n)));
    assert.ok(respects(targets, n, []));
  }
});

test('sorteio com casais e restrições de um lado só, em muitas rodadas', () => {
  const rnd = seeded(2);
  const names = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elis', 'Fábio', 'Gabi', 'Hugo', 'Íris', 'João'];
  const couples = [[0, 1], [2, 3], [4, 5], [6, 7]];
  const forbidden = couples.flatMap(([a, b]) => [[a, b], [b, a]]).concat([[8, 9], [9, 0]]);
  for (let run = 0; run < 400; run += 1) {
    const targets = drawAssignment({ names, forbidden, randomInt: rnd });
    assert.ok(respects(targets, names.length, forbidden), `rodada ${run}: ${targets}`);
  }
});

test('corrente única: sempre uma roda só com todo mundo', () => {
  const rnd = seeded(3);
  for (let run = 0; run < 300; run += 1) {
    const n = 3 + rnd(25);
    const forbidden = n >= 6 ? [[0, 1], [1, 0], [2, 3], [3, 2]] : [];
    const targets = drawAssignment({ names: people(n), forbidden, singleCycle: true, randomInt: rnd });
    assert.ok(isValidAssignment(targets, buildAllowed(n, forbidden), true));
    const order = cycleOrder(targets);
    assert.equal(order.length, n + 1);
    assert.equal(order[n], 0);
    assert.equal(new Set(order.slice(0, n)).size, n);
  }
});

test('distribuição: as 9 combinações de 4 pessoas saem com a mesma frequência', () => {
  const rnd = seeded(4);
  const counts = new Map();
  for (let i = 0; i < 9000; i += 1) {
    const k = drawAssignment({ names: NAMES4, randomInt: rnd }).join('');
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  assert.equal(counts.size, 9);
  for (const [k, c] of counts) assert.ok(c > 850 && c < 1150, `${k}: ${c}`);
});

test('distribuição: as 6 rodas possíveis com 4 pessoas saem com a mesma frequência', () => {
  const rnd = seeded(5);
  const counts = new Map();
  for (let i = 0; i < 6000; i += 1) {
    const k = drawAssignment({ names: NAMES4, singleCycle: true, randomInt: rnd }).join('');
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  assert.equal(counts.size, 6);
  for (const [k, c] of counts) assert.ok(c > 850 && c < 1150, `${k}: ${c}`);
});

test('impossível: alguém sem nenhuma opção', () => {
  assert.throws(
    () => drawAssignment({ names: ['Ana', 'Bruno', 'Carla'], forbidden: [[0, 1], [0, 2]], randomInt: seeded(6) }),
    (e) => e instanceof SecretError && /^Ana não pode tirar ninguém/.test(e.message),
  );
});

test('impossível: ninguém pode tirar uma pessoa', () => {
  assert.throws(
    () => drawAssignment({ names: ['Ana', 'Bruno', 'Carla'], forbidden: [[0, 2], [1, 2]], randomInt: seeded(7) }),
    /Ninguém pode tirar Carla/,
  );
});

test('impossível: grupo com menos opções do que pessoas (Hall)', () => {
  const forbidden = [[0, 1], [0, 2], [1, 0], [1, 2], [2, 0], [2, 1]];
  assert.throws(
    () => drawAssignment({ names: NAMES4, forbidden, randomInt: seeded(8) }),
    /Ana, Bruno e Carla só podem tirar Diego: são 3 pessoas para 1 nome/,
  );
});

test('impossível: casal que não se tira em grupo de 3', () => {
  const forbidden = [[0, 1], [1, 0]];
  for (const singleCycle of [false, true]) {
    assert.throws(
      () => drawAssignment({ names: ['Ana', 'Bruno', 'Carla'], forbidden, singleCycle, randomInt: seeded(9) }),
      /Ana e Bruno só podem tirar Carla: são 2 pessoas para 1 nome/,
    );
  }
});

test('corrente única impossível quando o grupo fica dividido', () => {
  const forbidden = [[0, 2], [0, 3], [1, 2], [1, 3]];
  const ok = drawAssignment({ names: NAMES4, forbidden, randomInt: seeded(10) });
  assert.ok(respects(ok, 4, forbidden));
  assert.throws(
    () => drawAssignment({ names: NAMES4, forbidden, singleCycle: true, randomInt: seeded(10) }),
    /ninguém do grupo Ana e Bruno pode tirar alguém do grupo Carla e Diego/,
  );
});

test('corrente única sem solução mesmo com o grupo conectado: busca completa avisa', () => {
  // Permitidos só: Ana↔Bruno, Carla↔Diego, Ana↔Carla. Dá para sortear, mas não em roda única.
  const forbidden = [[0, 3], [1, 2], [1, 3], [2, 1], [3, 0], [3, 1]];
  const ok = drawAssignment({ names: NAMES4, forbidden, randomInt: seeded(11) });
  assert.ok(respects(ok, 4, forbidden));
  assert.throws(
    () => drawAssignment({ names: NAMES4, forbidden, singleCycle: true, randomInt: seeded(11) }),
    /Não existe corrente única/,
  );
  assert.throws(
    () => drawAssignment({ names: NAMES4, forbidden, singleCycle: true, randomInt: seeded(11), attempts: 0, maxWork: 1 }),
    /Não encontrei uma corrente única/,
  );
});

test('backtracking acha solução quando as tentativas uniformes não bastam', () => {
  const n = 12;
  const forbidden = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (j !== i && j !== (i + 1) % n && j !== (i + 2) % n) forbidden.push([i, j]);
    }
  }
  const allowed = buildAllowed(n, forbidden);
  const rnd = seeded(12);
  for (let run = 0; run < 50; run += 1) {
    const plain = drawAssignment({ names: people(n), forbidden, randomInt: rnd, attempts: 0 });
    assert.ok(isValidAssignment(plain, allowed));
    const cycle = drawAssignment({ names: people(n), forbidden, singleCycle: true, randomInt: rnd, attempts: 0 });
    assert.ok(isValidAssignment(cycle, allowed, true));
  }
  const direct = searchDerangement(allowed, rnd);
  assert.ok(isValidAssignment(direct.targets, allowed));
  const directCycle = searchCycle(allowed, rnd);
  assert.ok(isValidAssignment(directCycle.targets, allowed, true));
});

test('com limite de trabalho estourado, o emparelhamento garante o sorteio', () => {
  const rnd = seeded(13);
  const forbidden = [[0, 1], [1, 0], [2, 3]];
  for (let run = 0; run < 50; run += 1) {
    const targets = drawAssignment({ names: people(8), forbidden, randomInt: rnd, attempts: 0, maxWork: 1 });
    assert.ok(respects(targets, 8, forbidden));
  }
  assert.equal(searchDerangement(buildAllowed(5), rnd, 1).exhausted, false);
});

test('maximumMatching encontra o tamanho certo', () => {
  assert.equal(maximumMatching(buildAllowed(5)).size, 5);
  const hall = maximumMatching(buildAllowed(4, [[0, 1], [0, 2], [1, 0], [1, 2], [2, 0], [2, 1]]));
  assert.equal(hall.size, 2);
});

test('isValidAssignment e cycleOrder', () => {
  const allowed = buildAllowed(4);
  assert.equal(isValidAssignment([1, 0, 3, 2], allowed), true);
  assert.equal(isValidAssignment([1, 0, 3, 2], allowed, true), false);
  assert.equal(isValidAssignment([1, 2, 3, 0], allowed, true), true);
  assert.equal(isValidAssignment([0, 2, 3, 1], allowed), false);
  assert.equal(isValidAssignment([1, 1, 3, 2], allowed), false);
  assert.deepEqual(cycleOrder([2, 0, 3, 1]), [0, 2, 3, 1, 0]);
});

test('link: ida e volta com acentos, emoji e evento completo', () => {
  const event = {
    title: 'Amigo secreto da família Exemplo', date: '2026-12-20', time: '19:30',
    place: 'Salão de festas, Rua Exemplo, 123', value: 5000, notes: 'Leve um "presente" de até R$ 50.\nNada de meias! 🧦',
  };
  const code = encodeReveal({ from: 'João Conceição', to: 'Zé 🎅🏽 Exemplo', event }, key(1, 2, 3, 4, 5, 6, 7, 8));
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeReveal(code), { from: 'João Conceição', to: 'Zé 🎅🏽 Exemplo', event });
  const minimal = encodeReveal({ from: 'Ana', to: 'Bia' });
  assert.deepEqual(decodeReveal(minimal), { from: 'Ana', to: 'Bia', event: null });
});

test('link: o nome sorteado não aparece em claro e cada chave gera um código diferente', () => {
  const a = encodeReveal({ from: 'Ana', to: 'Bruno Exemplo' }, key(9, 9, 9, 9, 9, 9, 9, 9));
  const b = encodeReveal({ from: 'Ana', to: 'Bruno Exemplo' }, key(1, 3, 5, 7, 11, 13, 17, 19));
  assert.notEqual(a, b);
  assert.deepEqual(decodeReveal(a), decodeReveal(b));
  const raw = new TextDecoder('latin1').decode(base64UrlDecode(a));
  assert.ok(!raw.includes('Bruno'));
  assert.ok(!a.includes(base64UrlEncode(new TextEncoder().encode('Bruno')).slice(0, 6)));
  const random1 = encodeReveal({ from: 'Ana', to: 'Bruno' });
  const random2 = encodeReveal({ from: 'Ana', to: 'Bruno' });
  assert.notEqual(random1, random2);
});

test('link: lixo, cortado, versão errada ou campos faltando dão erro amigável', () => {
  const good = encodeReveal({ from: 'Ana', to: 'Bia' }, key(1, 2, 3, 4, 5, 6, 7, 8));
  for (const bad of ['', '!!!', 'abc', good.slice(0, 12), `${good.slice(0, -3)}A`, 'A'.repeat(40)]) {
    assert.throws(() => decodeReveal(bad), (e) => e instanceof SecretError && /link está incompleto/.test(e.message), bad);
  }
  const bytes = base64UrlDecode(good);
  bytes[0] = 2;
  assert.throws(() => decodeReveal(base64UrlEncode(bytes)), SecretError);
  const noTarget = new TextEncoder().encode(JSON.stringify({ v: 1, from: 'Ana' }));
  const forged = new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0, 0, ...noTarget]);
  assert.throws(() => decodeReveal(base64UrlEncode(forged)), SecretError);
  assert.throws(() => encodeReveal({ from: 'Ana', to: 'Bia' }, key(1, 2, 3)), RangeError);
});

test('revealCodeFromHash', () => {
  assert.equal(revealCodeFromHash('#r=abc_-1'), 'abc_-1');
  assert.equal(revealCodeFromHash('r=xyz'), 'xyz');
  assert.equal(revealCodeFromHash('#outra'), null);
  assert.equal(revealCodeFromHash(''), null);
});

test('valor sugerido em reais', () => {
  assert.equal(parseMoney(''), null);
  assert.equal(parseMoney('50'), 5000);
  assert.equal(parseMoney('50,00'), 5000);
  assert.equal(parseMoney('R$ 1.234,56'), 123456);
  assert.equal(parseMoney('r$80'), 8000);
  assert.equal(parseMoney('1.000'), 100000);
  assert.equal(parseMoney('12,5'), 1250);
  assert.equal(parseMoney('49.90'), 4990);
  for (const bad of ['abc', '-5', '10,999', '1.00.0', '5,', 'R$']) assert.throws(() => parseMoney(bad), SecretError, bad);
  const nbsp = (s) => s.replace(/\u00a0/g, ' ');
  assert.equal(nbsp(formatMoney(5000)), 'R$ 50,00');
  assert.equal(nbsp(formatMoney(123456)), 'R$ 1.234,56');
});

test('datas e horários', () => {
  assert.equal(formatEventDate('2026-12-20'), 'domingo, 20 de dezembro de 2026');
  assert.equal(formatEventDate('2026-12-24'), 'quinta-feira, 24 de dezembro de 2026');
  assert.equal(isValidDate('2026-02-29'), false);
  assert.equal(isValidDate('2028-02-29'), true);
  assert.equal(isValidDate('20/12/2026'), false);
  assert.equal(formatTime('19:00'), '19h');
  assert.equal(formatTime('07:30'), '7h30');
  assert.equal(isValidTime('24:00'), false);
});

test('compactEvent guarda só o que foi preenchido', () => {
  assert.equal(compactEvent({ title: '  ', date: '', place: '' }), null);
  assert.deepEqual(compactEvent({ title: ' Natal ', date: '2026-13-01', time: '25:00', value: -1, notes: 'x' }), { title: 'Natal', notes: 'x' });
  assert.equal(compactEvent({ notes: 'a'.repeat(500) }).notes.length, 300);
});

test('mensagem e link do WhatsApp', () => {
  const msg = inviteMessage('Ana', 'https://micdog22.github.io/amigo-secreto/#r=abc');
  assert.equal(msg, 'Oi, Ana! Seu amigo secreto está neste link: https://micdog22.github.io/amigo-secreto/#r=abc');
  const url = whatsappUrl(msg);
  assert.ok(url.startsWith('https://wa.me/?text=Oi%2C%20Ana!'));
  assert.ok(url.includes('%23r%3Dabc'));
  assert.equal(decodeURIComponent(url.slice('https://wa.me/?text='.length)), msg);
});
