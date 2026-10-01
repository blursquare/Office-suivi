'use strict';
// Journal technique (étude, 30/09 : « comment avoir des rapports de ce qui s'est passé pour ajuster
// les fonctions et le code, de manière automatique ») — ce que le rapport technique
// (rapportTechnique.js) résume deux fois par jour sur GitHub :
//   - les erreurs et avertissements du SERVEUR (console.error / console.warn capturés) ;
//   - les événements envoyés par les POSTES (erreurs du navigateur, corrections faites à la main
//     après une extraction, lecture d'un scan), voir POST /api/journal-technique.
// Les messages sont gardés tels quels dans la base (qui ne quitte pas le bureau) : l'anonymisation
// se fait à la construction du rapport. Un même message répété dans les 10 minutes n'ajoute pas de
// ligne, il incrémente `fois` (un NAS injoignable ne remplit pas la base toutes les 2 minutes).

const CATEGORIES = ['erreur-serveur', 'avertissement-serveur', 'erreur-poste', 'correction-extraction', 'scan-lu'];
const SOURCES = ['serveur', 'poste'];
const MAX_MESSAGE = 1500;
const MAX_DETAILS = 2000;
const FENETRE_REGROUPEMENT_MS = 10 * 60 * 1000;
const CONSERVATION_JOURS = 14;

function texteBorne(v, max) {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

function creerJournalTechnique(db, horloge = () => new Date()) {
  const inserer = db.prepare('INSERT INTO journal_technique (at, derniere, fois, source, categorie, message, details) VALUES (?, ?, 1, ?, ?, ?, ?)');
  const incrementer = db.prepare('UPDATE journal_technique SET fois = fois + 1, derniere = ? WHERE id = ?');
  const lireEntre = db.prepare('SELECT * FROM journal_technique WHERE derniere > ? AND at <= ? ORDER BY at');
  const purgerStmt = db.prepare('DELETE FROM journal_technique WHERE derniere < ?');
  const recents = new Map(); // clé → { id, t }

  function noter({ source, categorie, message, details } = {}) {
    if (!SOURCES.includes(source) || !CATEGORIES.includes(categorie)) return null;
    const msg = texteBorne(message, MAX_MESSAGE).trim();
    if (!msg) return null;
    let det = null;
    if (details && typeof details === 'object') {
      try { det = JSON.stringify(details).slice(0, MAX_DETAILS); } catch (_) { det = null; }
    }
    const maintenant = horloge();
    const at = maintenant.toISOString();
    const cle = `${source}|${categorie}|${msg}|${det || ''}`;
    const deja = recents.get(cle);
    if (deja && maintenant.getTime() - deja.t < FENETRE_REGROUPEMENT_MS) {
      incrementer.run(at, deja.id);
      deja.t = maintenant.getTime();
      return deja.id;
    }
    const r = inserer.run(at, at, source, categorie, msg, det);
    const id = Number(r.lastInsertRowid);
    recents.set(cle, { id, t: maintenant.getTime() });
    if (recents.size > 500) recents.delete(recents.keys().next().value);
    return id;
  }

  // Entrées actives dans la période ]depuis, jusqua] (une entrée regroupée compte si sa dernière
  // occurrence y tombe).
  function lire(depuisIso, jusquaIso) {
    return lireEntre.all(depuisIso || '1970-01-01T00:00:00.000Z', jusquaIso || horloge().toISOString()).map((l) => {
      let details = null;
      try { details = l.details ? JSON.parse(l.details) : null; } catch (_) { details = null; }
      return { id: l.id, at: l.at, derniere: l.derniere, fois: l.fois, source: l.source, categorie: l.categorie, message: l.message, details };
    });
  }

  function purger() {
    const limite = new Date(horloge().getTime() - CONSERVATION_JOURS * 86400000).toISOString();
    purgerStmt.run(limite);
  }

  return { noter, lire, purger };
}

// Capture de console.error / console.warn du serveur (lancé sans fenêtre : sans cela, personne ne
// voit ces messages). Garde contre la récursion : une erreur pendant l'écriture ne se rejournalise pas.
function messageDepuisArguments(args) {
  return args.map((a) => {
    if (a instanceof Error) return a.stack || a.message;
    if (typeof a === 'string') return a;
    try { return JSON.stringify(a); } catch (_) { return String(a); }
  }).join(' ');
}

// Avertissements connus et sans conséquence, affichés mais jamais journalisés (ils remonteraient dans le
// rapport comme « erreur du serveur » à chaque démarrage) : `node:sqlite` est marqué expérimental par
// Node 22, ce que Node signale par console.error au premier chargement.
const MESSAGES_NON_JOURNALISES = [
  /ExperimentalWarning: SQLite is an experimental feature/,
];

function messageNonJournalise(message) {
  return MESSAGES_NON_JOURNALISES.some((motif) => motif.test(message));
}

function installerCaptureConsole(journal, cons = console) {
  let enCours = false;
  const envelopper = (nom, categorie) => {
    const original = cons[nom].bind(cons);
    cons[nom] = (...args) => {
      original(...args);
      if (enCours) return;
      enCours = true;
      try {
        const message = messageDepuisArguments(args);
        if (!messageNonJournalise(message)) journal.noter({ source: 'serveur', categorie, message });
      } catch (_) { /* jamais bloquant */ }
      finally { enCours = false; }
    };
    return original;
  };
  const originaux = { error: envelopper('error', 'erreur-serveur'), warn: envelopper('warn', 'avertissement-serveur') };
  return () => { cons.error = originaux.error; cons.warn = originaux.warn; };
}

module.exports = { creerJournalTechnique, installerCaptureConsole, messageDepuisArguments, messageNonJournalise, CATEGORIES, CONSERVATION_JOURS };
