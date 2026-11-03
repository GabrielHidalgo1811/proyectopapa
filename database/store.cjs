const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

class DataError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const reject = message => { throw new DataError(message); };
function text(value, label, optional = false) {
  if (typeof value !== 'string' || value.length > 20000 || (!optional && !value.trim())) reject(`Revisa ${label}.`);
  return value.trim();
}
function integer(value, label, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) reject(`Revisa ${label}.`);
  return value;
}
function identifier(value, prefix = '') {
  const id = text(value, 'la referencia');
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id) || (prefix && !id.startsWith(prefix))) reject('Referencia inválida.');
  return id;
}
function email(value, optional = false) {
  const result = text(value, 'el correo', optional);
  if (result && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) reject('Correo inválido.');
  return result;
}
function calendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) reject('Fecha inválida.');
  const parsed = new Date(value + 'T12:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) reject('Fecha inválida.');
  return value;
}
function collection(value, label) {
  if (!Array.isArray(value) || value.length > 100000) reject(`Revisa ${label}.`);
  const ids = new Set();
  for (const item of value) {
    if (!item || typeof item !== 'object') reject(`Revisa ${label}.`);
    identifier(item.id);
    if (ids.has(item.id)) reject(`Referencias duplicadas en ${label}.`);
    ids.add(item.id);
  }
  return value;
}

function normalize(input) {
  if (!input || typeof input !== 'object') reject('Datos inválidos.');
  const people = collection(input.people, 'personas').map(p => {
    if (!Array.isArray(p.roles) || p.roles.some(role => !['tenant', 'guarantor'].includes(role))) reject('Rol inválido.');
    return { id: identifier(p.id), name: text(p.name, 'el nombre'), phone: text(p.phone ?? '', 'el teléfono', true), email: email(p.email ?? '', true), roles: [...new Set(p.roles)] };
  });
  const personIds = new Set(people.map(p => p.id));
  const personId = id => { if (!personIds.has(id)) reject('La persona seleccionada no existe.'); return id; };
  const rooms = collection(input.rooms, 'habitaciones').map(r => {
    if (r.property !== 'Casa PAC' || !Array.isArray(r.services)) reject('Revisa la habitación.');
    return { id: identifier(r.id, 'I'), name: text(r.name, 'la habitación'), property: 'Casa PAC', person: r.person ? personId(r.person) : null,
      amount: integer(r.amount, 'la mensualidad', 1), day: r.day == null ? null : integer(r.day, 'el vencimiento', 1, 28), deposit: integer(r.deposit ?? 0, 'el depósito'),
      ...(r.state ? { state: ['ocupada','disponible','en_construccion'].includes(r.state) ? r.state : reject('Estado de habitación inválido.') } : {}),
      ...(r.startDate ? { startDate: calendarDate(r.startDate) } : {}),
      services: r.services.map(s => { if (!Array.isArray(s) || s.length !== 2) reject('Equipamiento inválido.'); return [text(s[0], 'el elemento'), text(s[1], 'la descripción')]; }) };
  });
  const loans = collection(input.loans, 'préstamos').map(l => {
    if (!Number.isFinite(l.rate) || l.rate < 0 || l.rate > 100) reject('Tasa inválida.');
    const loan = { id: identifier(l.id, 'P'), person: personId(l.person), guarantor: personId(l.guarantor), capital: integer(l.capital, 'el capital', 1), rate: l.rate,
      amount: integer(l.amount, 'la cuota', 1), day: integer(l.day, 'el vencimiento', 1, 28), investor: text(l.investor, 'el capitalista'), ...(l.startDate ? { startDate: calendarDate(l.startDate) } : {}) };
    if (loan.person === loan.guarantor) reject('El aval debe ser otra persona.');
    if (loan.amount <= loan.capital * loan.rate / 100) reject('La cuota debe cubrir los intereses y abonar al capital.');
    return loan;
  });
  const accounts = new Map([...rooms.filter(r => r.person), ...loans].map(a => [a.id, a]));
  const payments = collection(input.payments, 'pagos').map(p => {
    if (!accounts.has(p.ref)) reject('El contrato del pago no existe o no tiene inquilino.');
    if (typeof p.period !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(p.period)) reject('Período inválido.');
    const payment = { id: identifier(p.id), ref: p.ref, period: p.period, date: calendarDate(p.date), amount: integer(p.amount, 'el pago', 1), capital: integer(p.capital, 'el abono a capital'), interest: integer(p.interest, 'el interés') };
    if (payment.amount !== payment.capital + payment.interest) reject('El desglose del pago no coincide con el monto.');
    if (payment.ref.startsWith('I') && payment.interest !== 0) reject('Un arriendo no tiene intereses de préstamo.');
    return payment;
  });
  const sums = new Map(), capitalPaid = new Map();
  for (const p of payments) {
    const key = p.ref + '/' + p.period;
    sums.set(key, (sums.get(key) || 0) + p.amount);
    if (sums.get(key) > accounts.get(p.ref).amount) reject('El pago supera el saldo del período.');
    if (p.ref.startsWith('P')) {
      capitalPaid.set(p.ref, (capitalPaid.get(p.ref) || 0) + p.capital);
      if (capitalPaid.get(p.ref) > accounts.get(p.ref).capital) reject('El abono supera el capital pendiente.');
    }
  }
  const outbox = collection(input.outbox, 'borradores').map(o => {
    if (o.ref && !accounts.has(o.ref)) reject('Referencia de recordatorio inválida.');
    return { id: identifier(o.id), subject: text(o.subject, 'el asunto'), to: email(o.to), body: text(o.body, 'el mensaje'), date: calendarDate(o.date), ...(o.ref ? { ref: o.ref } : {}) };
  });
  const s = input.settings;
  if (!s || ![3, 5, 7].includes(s.interval) || typeof s.emailEnabled !== 'boolean' || typeof s.whatsapp !== 'boolean') reject('Configuración inválida.');
  return { people, rooms, loans, payments, outbox, settings: { email: email(s.email, true), phone: text(s.phone, 'el teléfono de administración', true), interval: s.interval, emailEnabled: s.emailEnabled, whatsapp: s.whatsapp } };
}

function openStore(filename) {
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  const sql = new DatabaseSync(filename);
  sql.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  sql.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  for (const table of ['rooms', 'loans']) {
    if (!sql.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === 'start_date')) sql.exec(`ALTER TABLE ${table} ADD COLUMN start_date TEXT`);
  }
  if (!sql.prepare('PRAGMA table_info(rooms)').all().some(c => c.name === 'state')) sql.exec('ALTER TABLE rooms ADD COLUMN state TEXT');
  // Imported rooms can have an unconfirmed due day. Preserve existing records
  // while upgrading the original NOT NULL column to a nullable calendar field.
  if (sql.prepare('PRAGMA table_info(rooms)').all().find(c => c.name === 'due_day').notnull) {
    sql.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;');
    try {
      const definition = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8').match(/CREATE TABLE IF NOT EXISTS rooms \([\s\S]*?\) STRICT;/)[0];
      sql.exec(definition.replace('IF NOT EXISTS rooms', 'rooms_calendar_upgrade'));
      sql.exec('INSERT INTO rooms_calendar_upgrade SELECT id,name,property,person_id,amount,due_day,deposit,start_date,state FROM rooms; DROP TABLE rooms; ALTER TABLE rooms_calendar_upgrade RENAME TO rooms;');
      if (sql.prepare('PRAGMA foreign_key_check').all().length) throw new Error('La migración de habitaciones no conserva sus referencias.');
      sql.exec('COMMIT;');
    } catch (error) { sql.exec('ROLLBACK;'); throw error; }
    finally { sql.exec('PRAGMA foreign_keys=ON;'); }
  }
  const all = query => sql.prepare(query).all().map(row => ({ ...row }));
  function read() {
    const people = all('SELECT id,name,phone,email FROM people ORDER BY rowid').map(p => ({ ...p, roles: sql.prepare('SELECT role FROM person_roles WHERE person_id=? ORDER BY role').all(p.id).map(r => r.role) }));
    const rooms = all('SELECT id,name,property,person_id AS person,amount,due_day AS day,deposit,start_date,state FROM rooms ORDER BY rowid').map(({start_date,state,...r}) => ({ ...r, ...(start_date ? {startDate:start_date} : {}), ...(state ? {state} : {}), services: sql.prepare('SELECT name,description FROM room_services WHERE room_id=? ORDER BY position').all(r.id).map(s => [s.name, s.description]) }));
    const loans = all('SELECT id,person_id AS person,guarantor_id AS guarantor,capital,monthly_rate AS rate,installment AS amount,due_day AS day,investor,start_date FROM loans ORDER BY rowid').map(({start_date,...l})=>({...l,...(start_date?{startDate:start_date}:{})}));
    const payments = all('SELECT id,coalesce(room_id,loan_id) AS ref,period,received_on AS date,amount,capital,interest FROM payments ORDER BY rowid');
    const outbox = all('SELECT id,subject,recipient AS "to",body,created_on AS date,coalesce(room_id,loan_id) AS ref FROM outbox ORDER BY position').map(o => { if (!o.ref) delete o.ref; return o; });
    const s = sql.prepare('SELECT * FROM settings WHERE id=1').get();
    const revision = sql.prepare('SELECT revision FROM metadata WHERE id=1').get().revision;
    return { revision, data: { people, rooms, loans, payments, outbox, settings: { email: s.email, phone: s.phone, interval: s.reminder_interval, emailEnabled: !!s.email_enabled, whatsapp: !!s.whatsapp_enabled } } };
  }
  function write(input, expectedRevision) {
    const data = normalize(input);
    sql.exec('BEGIN IMMEDIATE');
    try {
      const previous = read();
      if (previous.revision !== expectedRevision) throw new DataError('Los datos cambiaron en otra sesión. Recarga antes de guardar.', 409);
      // Snapshot updates cannot silently delete existing records or alter recorded payments.
      for (const key of ['people', 'rooms', 'loans', 'payments', 'outbox']) {
        const next = new Map(data[key].map(row => [row.id, row]));
        for (const old of previous.data[key]) {
          if (!next.has(old.id)) reject('No se permite eliminar registros desde esta operación.');
          if (key === 'payments' && JSON.stringify(old) !== JSON.stringify(next.get(old.id))) reject('Los pagos registrados no se pueden modificar.');
        }
      }
      // Validate the interest split of each new loan payment on the server.
      const known = new Set(previous.data.payments.map(p => p.id));
      const accepted = [...previous.data.payments];
      for (const p of data.payments.filter(p => !known.has(p.id))) {
        if (p.ref.startsWith('P')) {
          const loan = data.loans.find(l => l.id === p.ref);
          const paidCapital = accepted.filter(x => x.ref === p.ref && x.period < p.period).reduce((sum, x) => sum + x.capital, 0);
          const paidInterest = accepted.filter(x => x.ref === p.ref && x.period === p.period).reduce((sum, x) => sum + x.interest, 0);
          const expected = Math.min(p.amount, Math.max(0, Math.round(Math.max(0, loan.capital - paidCapital) * loan.rate / 100) - paidInterest));
          if (p.interest !== expected) reject('El interés del pago no coincide con el saldo del préstamo.');
        }
        accepted.push(p);
      }
      const upsert = (table, columns, values) => {
        const names = columns.split(',');
        sql.prepare(`INSERT INTO ${table}(${columns}) VALUES(${names.map(() => '?').join(',')}) ON CONFLICT(id) DO UPDATE SET ${names.slice(1).map(n => `${n}=excluded.${n}`).join(',')}`).run(...values);
      };
      for (const p of data.people) {
        upsert('people', 'id,name,phone,email', [p.id, p.name, p.phone, p.email]);
        sql.prepare('DELETE FROM person_roles WHERE person_id=?').run(p.id);
        for (const role of p.roles) sql.prepare('INSERT INTO person_roles VALUES(?,?)').run(p.id, role);
      }
      for (const r of data.rooms) {
        upsert('rooms', 'id,name,property,person_id,amount,due_day,deposit,start_date,state', [r.id, r.name, r.property, r.person, r.amount, r.day, r.deposit,r.startDate||null,r.state||null]);
        sql.prepare('DELETE FROM room_services WHERE room_id=?').run(r.id);
        r.services.forEach(([name, description], i) => sql.prepare('INSERT INTO room_services VALUES(?,?,?,?)').run(r.id, i, name, description));
      }
      for (const l of data.loans) upsert('loans', 'id,person_id,guarantor_id,capital,monthly_rate,installment,due_day,investor,start_date', [l.id, l.person, l.guarantor, l.capital, l.rate, l.amount, l.day, l.investor,l.startDate||null]);
      for (const p of data.payments) {
        if (!known.has(p.id)) sql.prepare('INSERT INTO payments VALUES(?,?,?,?,?,?,?,?)').run(p.id, p.ref.startsWith('I') ? p.ref : null, p.ref.startsWith('P') ? p.ref : null, p.period, p.date, p.amount, p.capital, p.interest);
      }
      data.outbox.forEach((o, i) => upsert('outbox', 'id,position,subject,recipient,body,created_on,room_id,loan_id', [o.id, i, o.subject, o.to, o.body, o.date, o.ref?.startsWith('I') ? o.ref : null, o.ref?.startsWith('P') ? o.ref : null]));
      const s = data.settings;
      sql.prepare('UPDATE settings SET email=?,phone=?,reminder_interval=?,email_enabled=?,whatsapp_enabled=? WHERE id=1').run(s.email, s.phone, s.interval, Number(s.emailEnabled), Number(s.whatsapp));
      sql.exec('UPDATE metadata SET revision=revision+1 WHERE id=1');
      sql.exec('COMMIT');
      return read();
    } catch (error) { sql.exec('ROLLBACK'); throw error; }
  }
  return { read, write, close: () => sql.close() };
}
module.exports = { openStore, DataError, normalize };
