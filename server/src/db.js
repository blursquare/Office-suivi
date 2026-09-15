// Ouverture/migration de la base SQLite — node:sqlite (intégré à Node 22, pas de compilation
// native) plutôt que better-sqlite3 : évite d'installer Visual Studio Build Tools sur le PC de
// l'étude, seul Node.js est nécessaire. Voir le plan (server/README.md) pour ce compromis.
'use strict';

const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS dossiers (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    responsable TEXT,
    archive INTEGER NOT NULL DEFAULT 0,
    pret TEXT, acte TEXT, ventebien TEXT,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_dossiers_updated_at ON dossiers(updated_at);

  CREATE TABLE IF NOT EXISTS reminder_log (
    dossier_id TEXT NOT NULL,
    reminder_key TEXT NOT NULL,
    sent_at TEXT NOT NULL,
    PRIMARY KEY (dossier_id, reminder_key)
  );
`;

function ouvrirDb(cheminDb) {
  if (cheminDb !== ':memory:') {
    fs.mkdirSync(path.dirname(cheminDb), { recursive: true });
  }
  const db = new DatabaseSync(cheminDb);
  db.exec(SCHEMA);
  return db;
}

module.exports = { ouvrirDb };
