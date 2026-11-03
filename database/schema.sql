PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(trim(name)) > 0),
  phone TEXT NOT NULL,
  email TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS person_roles (
  person_id TEXT NOT NULL REFERENCES people(id),
  role TEXT NOT NULL CHECK(role IN ('tenant', 'guarantor')),
  PRIMARY KEY(person_id, role)
) STRICT;

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  property TEXT NOT NULL DEFAULT 'Casa PAC' CHECK(property = 'Casa PAC'),
  person_id TEXT REFERENCES people(id),
  amount INTEGER NOT NULL CHECK(amount > 0),
  due_day INTEGER CHECK(due_day BETWEEN 1 AND 28),
  deposit INTEGER NOT NULL DEFAULT 0 CHECK(deposit >= 0),
  start_date TEXT,
  state TEXT
) STRICT;

CREATE TABLE IF NOT EXISTS room_services (
  room_id TEXT NOT NULL REFERENCES rooms(id),
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  PRIMARY KEY(room_id, position)
) STRICT;

CREATE TABLE IF NOT EXISTS loans (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people(id),
  guarantor_id TEXT NOT NULL REFERENCES people(id),
  capital INTEGER NOT NULL CHECK(capital > 0),
  monthly_rate REAL NOT NULL CHECK(monthly_rate BETWEEN 0 AND 100),
  installment INTEGER NOT NULL CHECK(installment > 0),
  due_day INTEGER NOT NULL CHECK(due_day BETWEEN 1 AND 28),
  investor TEXT NOT NULL,
  CHECK(person_id <> guarantor_id),
  CHECK(installment > capital * monthly_rate / 100)
) STRICT;

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  room_id TEXT REFERENCES rooms(id),
  loan_id TEXT REFERENCES loans(id),
  period TEXT NOT NULL,
  received_on TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount > 0),
  capital INTEGER NOT NULL CHECK(capital >= 0),
  interest INTEGER NOT NULL CHECK(interest >= 0),
  CHECK((room_id IS NOT NULL) <> (loan_id IS NOT NULL)),
  CHECK(amount = capital + interest),
  CHECK(room_id IS NULL OR interest = 0)
) STRICT;
CREATE INDEX IF NOT EXISTS payments_room_period ON payments(room_id, period);
CREATE INDEX IF NOT EXISTS payments_loan_period ON payments(loan_id, period);

CREATE TABLE IF NOT EXISTS outbox (
  id TEXT PRIMARY KEY,
  position INTEGER NOT NULL,
  subject TEXT NOT NULL,
  recipient TEXT NOT NULL,
  body TEXT NOT NULL,
  created_on TEXT NOT NULL,
  room_id TEXT REFERENCES rooms(id),
  loan_id TEXT REFERENCES loans(id),
  CHECK(room_id IS NULL OR loan_id IS NULL)
) STRICT;

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  reminder_interval INTEGER NOT NULL DEFAULT 5 CHECK(reminder_interval IN (3, 5, 7)),
  email_enabled INTEGER NOT NULL DEFAULT 0 CHECK(email_enabled IN (0, 1)),
  whatsapp_enabled INTEGER NOT NULL DEFAULT 0 CHECK(whatsapp_enabled IN (0, 1))
) STRICT;
INSERT OR IGNORE INTO settings(id) VALUES(1);

CREATE TABLE IF NOT EXISTS metadata (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  revision INTEGER NOT NULL DEFAULT 0,
  schema_version INTEGER NOT NULL DEFAULT 1
) STRICT;
INSERT OR IGNORE INTO metadata(id) VALUES(1);
