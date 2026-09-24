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

  -- Réglages de l'étude (voir parametresRepo.js) : clé/valeur générique plutôt qu'une table par
  -- fonctionnalité — le premier usage est le flux Power Automate + les adresses email des
  -- responsables (voir jobs/rappels.js), mais rien n'empêche d'y ranger d'autres réglages plus tard
  -- sans nouvelle migration.
  -- Journal des relectures d'actes par l'API Claude (Outil 2). Le guide IEJ/CSN « Introduction à
  -- l'intelligence artificielle » (déc. 2025) recommande d'ARCHIVER les requêtes adressées à une
  -- IA : on y conserve donc la requête et la réponse telles qu'elles sont parties et revenues,
  -- c'est-à-dire PSEUDONYMISÉES — la table de correspondance jeton → valeur réelle ne quitte
  -- jamais le navigateur (voir anonymiserTexteRelecture dans script.js), elle n'est donc pas ici.
  CREATE TABLE IF NOT EXISTS analyses_claude (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    mode TEXT,
    modele TEXT,
    libelle TEXT,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    cout_usd REAL NOT NULL DEFAULT 0,
    duree_ms INTEGER,
    requete TEXT,
    reponse TEXT
  );

  CREATE TABLE IF NOT EXISTS parametres (
    cle TEXT PRIMARY KEY,
    valeur TEXT NOT NULL
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
