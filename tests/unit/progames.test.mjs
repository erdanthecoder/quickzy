import test from 'node:test';
import assert from 'node:assert/strict';

const { rollChest, createHost: treasureHost } = await import('../../src/game/modes/treasure.js');
const { createHost: candyHost, costOf } = await import('../../src/game/modes/candy.js');

const setup = (make) => {
  const players = new Map(); const dirty = new Set();
  const live = { now: () => 0, set: async () => {} };
  const host = make({ live, P: (x) => x, players, dirty });
  const add = (uid, score = 0) => { const p = { uid, name: uid, score, correct: 0, extra: {} }; players.set(uid, p); host.join(p); return p; };
  return { host, add };
};

test('treasure: chests only after a right answer, steals move gold', () => {
  const { host, add } = setup(treasureHost);
  const a = add('a', 0); const b = add('b', 200);
  host.act(a, { k: 'c', a: 0 });
  assert.equal(a.score, 0);
  assert.equal(host.grant(a, false), 0);
  assert.equal(host.grant(a, true), 1);
  a.extra.steal = 'steal';
  host.act(a, { k: 't', h: 'b' });
  assert.ok(a.score > 0 && b.score < 200 && a.score + b.score === 200);
});

test('treasure: chest outcomes are sane', () => {
  for (let i = 0; i < 500; i++) {
    const c = rollChest(100, 3);
    assert.ok(['gold', 'x2', 'x3', 'steal', 'swap', 'lose', 'none'].includes(c.k));
    if (c.k === 'lose') assert.ok(c.amt <= 0);
  }
});

test('candy: machines cost cash and make candy', () => {
  const { host, add } = setup(candyHost);
  const p = add('p');
  host.act(p, { k: 'b', a: 0 });
  assert.equal(p.extra.rate, 0);
  host.grant(p, true);
  host.act(p, { k: 'b', a: 0 });
  assert.equal(p.extra.rate, 1);
  assert.ok(costOf(0, 1) > costOf(0, 0));
  host.tick(1000); host.tick(2000);
  assert.ok(p.score >= 1);
});

const { createHost: trainHost, burn } = await import('../../src/game/modes/train.js');

test('train: a right answer is 2 coal, a coal burns 3 s and carries 500 m', () => {
  const { host, add } = setup(trainHost);
  const p = add('p');
  assert.equal(p.extra.coal, 2);
  assert.equal(host.grant(p, false), 0);
  assert.equal(host.grant(p, true), 2);
  assert.equal(p.extra.coal, 4);
  host.tick(1000); host.tick(4000);            // 3 seconds: one coal burned
  assert.equal(p.score, 500);
  const e = { coal: 1, fire: 0, m: 0 };
  burn(e, 100);                                // one coal, then the fire goes out
  assert.equal(e.m, 500); assert.equal(e.coal, 0);
});

test('grand prix: fuel, boost, pits and laps', async () => {
  const gp = await import('../../src/game/modes/grandprix.js');
  const { host, add } = setup(gp.createHost);
  const a = add('a'); const b = add('b');
  // the grid: nobody starts past the line
  assert.ok(a.extra.m <= 0 && b.extra.m <= 0);
  // a boost needs a charge; a right answer gives fuel and a charge
  host.act(a, { k: 'b' });
  assert.equal(a.extra.boost, gp.BOOST_SECONDS);
  host.act(a, { k: 'b' });
  assert.equal(a.extra.ers, 0);
  assert.equal(host.grant(a, false), 0);
  assert.equal(host.grant(a, true), gp.FUEL_PER_ANSWER);
  assert.equal(a.extra.ers, 1);
  assert.equal(a.extra.fuel, gp.START_FUEL + gp.FUEL_PER_ANSWER);
  // race for a while: the cars move, the fuel burns, the score is the distance
  let now = 1000;
  for (let i = 0; i < 20; i++) { now += 1000; host.tick(now); }
  assert.ok(a.extra.m > 500 && a.score === Math.floor(a.extra.m));
  assert.ok(a.extra.fuel < gp.START_FUEL + gp.FUEL_PER_ANSWER);
  assert.ok(a.extra.tyre < 100);
  // out of fuel: the car rolls to a stop
  for (let i = 0; i < 40; i++) { now += 1000; host.tick(now); }
  assert.equal(b.extra.fuel, 0);
  assert.equal(b.extra.v, 0);
  // a pit stop: stopped for a while, then new tyres
  a.extra.fuel = 30;
  host.act(a, { k: 'p' });
  assert.equal(a.extra.pit, gp.PIT_SECONDS);
  for (let i = 0; i < 6; i++) { now += 1000; host.tick(now); }
  assert.equal(a.extra.pit, 0);
  assert.ok(a.extra.tyre > 99);
});

test('grand prix: the circuit is one lap long and corners are slower', async () => {
  const gp = await import('../../src/game/modes/grandprix.js');
  let slow = Infinity; let fast = 0;
  for (let m = 0; m < gp.LAP; m += 10) { const v = gp.profileAt(m); slow = Math.min(slow, v); fast = Math.max(fast, v); }
  assert.ok(gp.kmh(fast) > 300 && gp.kmh(slow) < 200);
  const a = gp.trackAt(0); const b = gp.trackAt(gp.LAP);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 0.01);
});
