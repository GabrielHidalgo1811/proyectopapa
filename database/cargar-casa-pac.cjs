const path = require('node:path');
const { openStore } = require('./store.cjs');
const confirmed = require('./datos-casa-pac.json');

function loadCasaPac(store) {
  const { data, revision } = store.read();
  const peopleIds = new Set(data.people.map(p => p.id));
  const roomIds = new Set(data.rooms.map(r => r.id));
  const people = confirmed.people.filter(p => !peopleIds.has(p.id));
  const rooms = confirmed.rooms.filter(r => !roomIds.has(r.id));
  if (!people.length && !rooms.length) return { people: 0, rooms: 0 };
  data.people.push(...structuredClone(people));
  data.rooms.push(...structuredClone(rooms));
  store.write(data, revision);
  return { people: people.length, rooms: rooms.length };
}
if (require.main === module) {
  const store = openStore(process.env.ANTONINI_DB_PATH || path.join(__dirname, '..', 'data', 'antonini.sqlite'));
  try { console.log(JSON.stringify(loadCasaPac(store))); }
  finally { store.close(); }
}
module.exports = { loadCasaPac };
