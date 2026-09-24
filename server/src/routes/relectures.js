'use strict';

// Relectures d'actes enregistrées (Outil 2) — demande de l'étude : « créer une base de donnée pour
// pouvoir revenir sur les analyses d'acte passées ».
//
// Le client envoie, une fois le bilan affiché, un instantané de ce qu'il a montré (analyse de
// Claude ré-identifiée, contrôles CLAIRE, coût, liste des documents avec leur chemin sur le NAS).
// Le serveur le range tel quel dans `donnees` et en extrait quelques colonnes pour la liste (date,
// dossier, compteurs) : rouvrir une analyse ne coûte ni une requête à Anthropic ni une relecture
// des PDF. Les PDF eux-mêmes ne sont jamais stockés ici.

const express = require('express');
const crypto = require('node:crypto');

const MAX_LISTE = 300;

function texte(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function entier(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

// Colonnes de la liste, tirées de l'instantané. Tout le reste reste dans `donnees`, sans schéma
// imposé : le rendu du bilan évolue, un instantané ancien doit rester relisible par le client.
function metaRelecture(corps) {
  const c = corps && typeof corps === 'object' ? corps : {};
  const sante = c.sante && typeof c.sante === 'object' ? c.sante : {};
  const cout = c.facture && Number.isFinite(Number(c.facture.coutUsd)) ? Number(c.facture.coutUsd) : 0;
  return {
    mode: c.mode === 'acte' ? 'acte' : 'compromis',
    typeBien: ['maison', 'copropriete', 'terrain'].indexOf(c.typeBien) >= 0 ? c.typeBien : '',
    dossierId: texte(c.dossierId, 80),
    dossierNom: texte(c.dossierNom, 300),
    libelle: texte(c.libelle, 300),
    critique: entier(sante.critique),
    surveiller: entier(sante.surveiller),
    valide: entier(sante.valide),
    avecClaude: c.analyse ? 1 : 0,
    coutUsd: cout > 0 ? cout : 0
  };
}

function ligneVersListe(l) {
  return {
    id: l.id, createdAt: l.created_at, updatedAt: l.updated_at, mode: l.mode, typeBien: l.type_bien || '',
    dossierId: l.dossier_id || '', dossierNom: l.dossier_nom || '', libelle: l.libelle || '',
    sante: { critique: l.critique, surveiller: l.surveiller, valide: l.valide },
    avecClaude: !!l.avec_claude, coutUsd: l.cout_usd || 0
  };
}

function creerRouteurRelectures(db) {
  const routeur = express.Router();
  const inserer = db.prepare(`INSERT INTO relectures
    (id, created_at, updated_at, mode, type_bien, dossier_id, dossier_nom, libelle, critique, surveiller, valide, avec_claude, cout_usd, donnees)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const mettreAJour = db.prepare(`UPDATE relectures SET updated_at = ?, mode = ?, type_bien = ?, dossier_id = ?, dossier_nom = ?,
    libelle = ?, critique = ?, surveiller = ?, valide = ?, avec_claude = ?, cout_usd = ?, donnees = ? WHERE id = ?`);

  routeur.get('/relectures', (req, res) => {
    const dossierId = texte(req.query.dossierId, 80);
    const lignes = dossierId
      ? db.prepare(`SELECT * FROM relectures WHERE dossier_id = ? ORDER BY created_at DESC LIMIT ${MAX_LISTE}`).all(dossierId)
      : db.prepare(`SELECT * FROM relectures ORDER BY created_at DESC LIMIT ${MAX_LISTE}`).all();
    res.json({ relectures: lignes.map(ligneVersListe) });
  });

  routeur.get('/relectures/:id', (req, res) => {
    const l = db.prepare('SELECT * FROM relectures WHERE id = ?').get(req.params.id);
    if (!l) return res.status(404).json({ erreur: 'Analyse introuvable.' });
    let donnees = null;
    try { donnees = JSON.parse(l.donnees); } catch (e) { donnees = null; }
    if (!donnees) return res.status(500).json({ erreur: 'Analyse enregistrée illisible.' });
    res.json({ relecture: { ...ligneVersListe(l), donnees } });
  });

  routeur.post('/relectures', (req, res) => {
    const corps = req.body;
    if (!corps || typeof corps !== 'object' || !corps.rapport) {
      return res.status(400).json({ erreur: 'Analyse incomplète : rien à enregistrer.' });
    }
    const m = metaRelecture(corps);
    const id = crypto.randomUUID();
    const maintenant = new Date().toISOString();
    inserer.run(id, maintenant, maintenant, m.mode, m.typeBien, m.dossierId, m.dossierNom, m.libelle,
      m.critique, m.surveiller, m.valide, m.avecClaude, m.coutUsd, JSON.stringify(corps));
    res.status(201).json({ id, createdAt: maintenant });
  });

  // Mise à jour du même enregistrement (type de bien corrigé après coup) : la date de création,
  // celle de l'analyse, ne bouge pas.
  routeur.put('/relectures/:id', (req, res) => {
    const corps = req.body;
    if (!corps || typeof corps !== 'object' || !corps.rapport) {
      return res.status(400).json({ erreur: 'Analyse incomplète : rien à enregistrer.' });
    }
    const m = metaRelecture(corps);
    const r = mettreAJour.run(new Date().toISOString(), m.mode, m.typeBien, m.dossierId, m.dossierNom, m.libelle,
      m.critique, m.surveiller, m.valide, m.avecClaude, m.coutUsd, JSON.stringify(corps), req.params.id);
    if (!r.changes) return res.status(404).json({ erreur: 'Analyse introuvable.' });
    res.json({ ok: true });
  });

  routeur.delete('/relectures/:id', (req, res) => {
    const r = db.prepare('DELETE FROM relectures WHERE id = ?').run(req.params.id);
    if (!r.changes) return res.status(404).json({ erreur: 'Analyse introuvable.' });
    res.json({ ok: true });
  });

  return routeur;
}

module.exports = { creerRouteurRelectures, metaRelecture };
