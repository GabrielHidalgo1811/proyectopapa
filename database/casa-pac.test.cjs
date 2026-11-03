const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openStore } = require('./store.cjs');
const { loadCasaPac } = require('./cargar-casa-pac.cjs');

test('Casa PAC loads confirmed data once without fabricating calendars or overwriting contacts', t => {
  const store = openStore(':memory:'); t.after(() => store.close());
  assert.deepEqual(loadCasaPac(store), { people: 9, rooms: 12 });
  let { data, revision } = store.read();
  assert(data.rooms.every(r => r.day === null && !r.startDate));
  assert.equal(data.rooms.reduce((sum, r) => sum + r.amount, 0), 2460000);
  assert.equal(data.rooms.filter(r => r.person).length, 9);
  assert.equal(data.rooms.filter(r => r.state === 'en_construccion').length, 2);
  assert.equal(data.rooms.find(r => r.id === 'I-PAC-12').person, null);
  assert.equal(data.payments.length, 0);
  data.people[0].email = 'confirmado@example.com';
  data.rooms[0].day = 10;
  store.write(data, revision);
  assert.deepEqual(loadCasaPac(store), { people: 0, rooms: 0 });
  data = store.read().data;
  assert.equal(data.people[0].email, 'confirmado@example.com');
  assert.equal(data.rooms[0].day, 10);
});
