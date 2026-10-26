'use strict';
// Clients et biens (étude 16/10) : la base calculée depuis les dossiers (server/src/clientsBiens.js), la recherche, une fiche, les fiches
// d'un dossier ; les seuls écrits sont les choix de l'étude — « même personne / personnes distinctes » et les corrections à la main (clé
// `clients-biens`). Rien n'est journalisé (noms des clients).

const express = require('express');
const { CLE_IMPORT, assainirImport, resumeImport } = require('../importClientsBiens');
const { construireBase, chercherClientsBiens, fichesDuDossier, assainirReglagesClientsBiens, valeurCorrection, pairesEntreFiches, CHAMPS_PERSONNE } = require('../clientsBiens');

const CLE = 'clients-biens';
const RE_ID = /^[pb][0-9a-f]{12}$/;
const RE_OCC = /^[A-Za-z0-9_-]{1,80}:[a-z0-9 |~]{1,220}$/;
// La base est recalculée au plus toutes les 10 s (frappe dans la recherche, fiches ouvertes) et aussitôt après un choix de l'étude.
const DUREE_CACHE_MS = 10000;

/** @param {any} depot @param {any} parametresRepo */
function creerRouteurClientsBiens(depot, parametresRepo, fichier) {
  const routeur = express.Router();
  const reglages = () => assainirReglagesClientsBiens(parametresRepo.lireJsonBrut(CLE, {}));
  // Fichier clients et immeubles d'Authentic importé dans les Réglages (étude 19/10), lu une fois puis gardé en mémoire jusqu'au suivant.
  let importLu = null;
  const lireImport = () => { if (!importLu) importLu = assainirImport(parametresRepo.lireJsonBrut(CLE_IMPORT, {})); return importLu; };
  // Tous les dossiers, archivés compris (un client d'un ancien dossier se retrouve), jamais les supprimés.
  let cache = { t: 0, base: null };
  const base = () => {
    if (!cache.base || Date.now() - cache.t > DUREE_CACHE_MS) {
      const tous = depot.tousActifs();
      // Le fichier global garde d'abord tout ce que les dossiers contiennent aujourd'hui, puis la base y ajoute ce qui n'y est plus.
      if (fichier) fichier.capturer(tous);
      cache = { t: Date.now(), base: construireBase(tous, reglages(), lireImport(), fichier ? fichier.lire() : undefined) };
    }
    return cache.base;
  };
  const oublier = () => { cache = { t: 0, base: null }; };

  routeur.get('/clients-biens', (req, res) => {
    res.json(chercherClientsBiens(base(), String(req.query.q || '').slice(0, 80), { personnes: Number(req.query.np), biens: Number(req.query.nb) }));
  });

  routeur.get('/clients-biens/personne/:id', (req, res) => {
    const id = String(req.params.id || '');
    if (!RE_ID.test(id)) { res.status(400).json({ erreur: 'Identifiant invalide.' }); return; }
    const b = base();
    const p = b.personnes.find((x) => x.id === id);
    if (!p) { res.status(404).json({ erreur: 'Fiche introuvable (elle a pu être réunie à une autre : relancez la recherche).' }); return; }
    res.json({ personne: p });
  });

  routeur.get('/clients-biens/bien/:id', (req, res) => {
    const id = String(req.params.id || '');
    if (!RE_ID.test(id)) { res.status(400).json({ erreur: 'Identifiant invalide.' }); return; }
    const bien = base().biens.find((x) => x.id === id);
    if (!bien) { res.status(404).json({ erreur: 'Fiche introuvable.' }); return; }
    res.json({ bien });
  });

  routeur.get('/clients-biens/dossier/:id', (req, res) => {
    const id = String(req.params.id || '');
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) { res.status(400).json({ erreur: 'Identifiant invalide.' }); return; }
    res.json(fichesDuDossier(base(), id));
  });

  // Supprimer du fichier global une personne ou un bien qui n'est plus dans aucun dossier (étude 26/10). Jamais ce qu'un dossier contient : la fiche
  // doit porter des lignes du fichier (`fichierIds`) ; ce que les dossiers montrent encore reste, et réapparaîtrait de toute façon.
  routeur.delete('/clients-biens/fichier/:genre/:id', (req, res) => {
    const genre = String(req.params.genre || ''); const id = String(req.params.id || '');
    if ((genre !== 'personne' && genre !== 'bien') || !RE_ID.test(id)) { res.status(400).json({ erreur: 'Demande invalide.' }); return; }
    if (!fichier) { res.status(404).json({ erreur: 'Fichier indisponible.' }); return; }
    const b = base();
    const fiche = (genre === 'personne' ? b.personnes : b.biens).find((x) => x.id === id);
    if (!fiche) { res.status(404).json({ erreur: 'Fiche introuvable : rechargez la liste.' }); return; }
    const ids = Array.isArray(fiche.fichierIds) ? fiche.fichierIds : [];
    if (!ids.length) { res.status(400).json({ erreur: 'Rien à supprimer du fichier : cette fiche n’est que dans des dossiers (retirez-la du dossier).' }); return; }
    const supprimees = fichier.supprimer(genre === 'personne' ? { personnes: ids } : { biens: ids });
    oublier();
    console.warn(`[clients-biens] ${supprimees} ligne(s) du fichier global supprimée(s) (${genre}).`);
    res.json({ ok: true, supprimees, resteDansDossiers: (fiche.dossiers || []).length > 0 });
  });

  // « Même personne » / « Personnes distinctes » pour deux occurrences proposées (homonymes sans date de naissance).
  routeur.post('/clients-biens/liaison', (req, res) => {
    const b = req.body || {};
    const occA = String(b.occA || ''); const occB = String(b.occB || '');
    if (!RE_OCC.test(occA) || !RE_OCC.test(occB) || occA === occB || !['meme', 'distinct', ''].includes(b.decision)) {
      res.status(400).json({ erreur: 'Liaison invalide.' }); return;
    }
    const r = reglages();
    // La décision vaut pour les deux FICHES entières : chaque paire de leurs occurrences est notée.
    for (const [a, c] of pairesEntreFiches(base().personnes, occA, occB)) {
      delete r.liaisons[`${c}#${a}`];
      if (b.decision) r.liaisons[`${a}#${c}`] = b.decision; else delete r.liaisons[`${a}#${c}`];
    }
    parametresRepo.ecrireJsonBrut(CLE, assainirReglagesClientsBiens(r));
    oublier();
    const p = base().personnes.find((x) => x.occurrences.includes(occA));
    res.json({ ok: true, id: p ? p.id : null });
  });

  // Correction à la main d'un champ (Authentic fait foi : si Authentic change ensuite, le changement est proposé sur la fiche).
  routeur.put('/clients-biens/correction', (req, res) => {
    const b = req.body || {};
    const occ = String(b.occ || '');
    if (!RE_OCC.test(occ) || !CHAMPS_PERSONNE.includes(b.champ)) { res.status(400).json({ erreur: 'Correction invalide.' }); return; }
    oublier();
    const p = base().personnes.find((x) => x.occurrences.includes(occ));
    if (!p) { res.status(404).json({ erreur: 'Fiche introuvable.' }); return; }
    const r = reglages();
    r.corrections = r.corrections.filter((c) => !(p.occurrences.includes(c.occ) && c.champ === b.champ));
    // « Revenir à Authentic » : la correction est retirée.
    if (!b.retirer) r.corrections.push({ occ, champ: b.champ, valeur: valeurCorrection(b.champ, b.valeur), authentic: p.authentic[b.champ], le: new Date().toISOString() });
    parametresRepo.ecrireJsonBrut(CLE, assainirReglagesClientsBiens(r));
    oublier();
    res.json({ ok: true });
  });

  // Import d'un export d'Authentic (étude 19/10) : le poste envoie les lignes déjà rangées ; chaque fichier remplace le précédent du même
  // genre (personnes ou immeubles). Rien n'est journalisé ; la réponse ne rend que des nombres.
  routeur.get('/clients-biens/import', (req, res) => { res.json(resumeImport(lireImport())); });
  routeur.post('/clients-biens/import', (req, res) => {
    const b = req.body || {};
    if (b.genre !== 'personnes' && b.genre !== 'biens') { res.status(400).json({ erreur: 'Genre d’import inconnu.' }); return; }
    if (!Array.isArray(b.lignes)) { res.status(400).json({ erreur: 'Aucune ligne reçue.' }); return; }
    const actuel = assainirImport(parametresRepo.lireJsonBrut(CLE_IMPORT, {}));
    const etat = { le: new Date().toISOString(), par: String(b.par || '').slice(0, 80), fichier: String(b.fichier || '').slice(0, 120), lignes: b.lignes.length };
    const suivant = assainirImport(Object.assign({}, actuel, b.genre === 'personnes' ? { personnes: b.lignes, personnesImport: etat } : { biens: b.lignes, biensImport: etat }));
    parametresRepo.ecrireJsonBrut(CLE_IMPORT, suivant);
    importLu = null;
    oublier();
    res.json(Object.assign({ ok: true }, resumeImport(suivant)));
  });
  routeur.delete('/clients-biens/import', (req, res) => {
    const genre = String(req.query.genre || '');
    if (genre !== 'personnes' && genre !== 'biens') { res.status(400).json({ erreur: 'Genre d’import inconnu.' }); return; }
    const actuel = assainirImport(parametresRepo.lireJsonBrut(CLE_IMPORT, {}));
    const suivant = assainirImport(Object.assign({}, actuel, genre === 'personnes' ? { personnes: [], personnesImport: null } : { biens: [], biensImport: null }));
    parametresRepo.ecrireJsonBrut(CLE_IMPORT, suivant);
    importLu = null;
    oublier();
    res.json(Object.assign({ ok: true }, resumeImport(suivant)));
  });

  return routeur;
}

module.exports = { creerRouteurClientsBiens };
