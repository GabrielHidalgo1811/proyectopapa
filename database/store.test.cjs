const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openStore } = require('./store.cjs');
const { createServer } = require('../server.cjs');

function fixture() {
  return {
    people: [
      { id: 'C1', name: 'Inquilino', phone: '912345678', email: 'inquilino@example.com', roles: ['tenant'] },
      { id: 'C2', name: 'Aval', phone: '987654321', email: 'aval@example.com', roles: ['guarantor'] }
    ],
    rooms: [{ id: 'I1', name: 'Habitación 1', property: 'Casa PAC', person: 'C1', amount: 200000, day: 5, deposit: 200000, services: [['Cama', 'Una plaza']] }],
    loans: [{ id: 'P1', person: 'C1', guarantor: 'C2', capital: 100000, rate: 2, amount: 20000, day: 5, investor: 'Administración' }],
    payments: [], outbox: [],
    settings: { email: '', phone: '', interval: 5, emailEnabled: false, whatsapp: false }
  };
}
test('starts empty and survives closing and reopening the database', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'antonini-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'test.sqlite');
  let store = openStore(filename);
  assert.equal(store.read().revision, 0);
  for (const key of ['people', 'rooms', 'loans', 'payments', 'outbox']) assert.deepEqual(store.read().data[key], []);
  store.write(fixture(), 0);
  store.close();
  store = openStore(filename);
  try { assert.deepEqual(store.read(), { revision: 1, data: fixture() }); }
  finally { store.close(); }
});
test('rejects invalid references and rolls back the entire operation', t => {
  const store = openStore(':memory:'); t.after(() => store.close());
  const data = fixture(); data.loans[0].guarantor = 'missing';
  assert.throws(() => store.write(data, 0), /no existe/);
  assert.equal(store.read().data.people.length, 0);
  assert.equal(store.read().revision, 0);
  data.loans[0].guarantor = 'C1';
  assert.throws(() => store.write(data, 0), /otra persona/);
  data.loans[0].guarantor = 'C2'; data.rooms[0].day = 29;
  assert.throws(() => store.write(data, 0), /vencimiento/);
});
test('detects concurrent edits instead of overwriting another session', t => {
  const store = openStore(':memory:'); t.after(() => store.close());
  store.write(fixture(), 0);
  assert.throws(() => store.write(fixture(), 0), error => error.status === 409);
  assert.equal(store.read().revision, 1);
});
test('saves payments, validates their balances and protects existing entries', t => {
  const store = openStore(':memory:'); t.after(() => store.close());
  store.write(fixture(), 0);
  let data = store.read().data;
  data.payments.push({ id: 'payment1', ref: 'P1', period: '2026-10', date: '2026-10-26', amount: 20000, capital: 18000, interest: 2000 });
  store.write(data, 1);
  data = store.read().data;
  data.payments[0].date = '2026-10-25';
  assert.throws(() => store.write(data, 2), /no se pueden modificar/);
  data = store.read().data;
  data.payments.push({ id: 'payment2', ref: 'P1', period: '2026-10', date: '2026-10-26', amount: 1, capital: 1, interest: 0 });
  assert.throws(() => store.write(data, 2), /supera el saldo/);
  data = store.read().data;
  data.payments.push({ id: 'payment2', ref: 'P1', period: '2026-11', date: '2026-11-05', amount: 20000, capital: 18000, interest: 2000 });
  assert.throws(() => store.write(data, 2), /interés/);
  data.payments[1].capital = 18360; data.payments[1].interest = 1640;
  store.write(data, 2);
  assert.equal(store.read().data.payments.length, 2);
  data = store.read().data; data.payments.pop();
  assert.throws(() => store.write(data, 3), /eliminar/);
  assert.equal(store.read().revision, 3);
});
test('persists settings and message drafts together with a payment', t => {
  const store = openStore(':memory:'); t.after(() => store.close());
  const data = fixture();
  data.settings = { email: 'admin@example.com', phone: '912345678', interval: 3, emailEnabled: true, whatsapp: false };
  data.payments = [{ id: 'payment1', ref: 'I1', period: '2026-10', date: '2026-10-26', amount: 100000, capital: 100000, interest: 0 }];
  data.outbox = [{ id: 'draft1', subject: 'Comprobante', to: 'inquilino@example.com', body: 'Pago recibido.', date: '2026-10-26', ref: 'I1' }];
  assert.deepEqual(store.write(data, 0).data, data);
});
test('HTTP API persists records, rejects stale revisions and protects private files', async t => {
  const store = openStore(':memory:'); const server = createServer(store,{auth:{handle:async()=>false,authorize:async()=>({user:{id:'test-admin'}})}});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = (body, headers = {}) => fetch(base + '/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const initial = await (await fetch(base + '/api/state')).json();
  assert.deepEqual(initial.data.people, []);
  assert.equal((await send({ revision: 0, data: fixture() })).status, 200);
  assert.equal((await send({ revision: 0, data: fixture() })).status, 409);
  assert.equal((await send({ revision: 1, data: fixture() }, { Origin: 'https://unrelated.example' })).status, 403);
  for (const file of ['/data/antonini.sqlite', '/database/schema.sql', '/server.cjs', '/.git/config']) assert.equal((await fetch(base + file)).status, 404);
  const badHost = await new Promise((resolve, reject) => {
    require('node:http').get(base + '/api/state', { headers: { Host: 'unrelated.example' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
  });
  assert.equal(badHost, 403);
  assert.equal((await fetch(base + '/')).status, 200);
});
