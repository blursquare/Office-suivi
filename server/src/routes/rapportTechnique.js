'use strict';
// Rapport technique (voir rapportTechnique.js et journalTechnique.js) :
//   POST /api/journal-technique           événements envoyés par les postes (erreurs du navigateur,
//                                         corrections après extraction, lecture d'un scan)
//   GET  /api/rapport-technique           état (actif, dernier envoi, dernière erreur, jeton présent)
//   PUT  /api/rapport-technique           { actif }
//   GET  /api/rapport-technique/apercu    le rapport tel qu'il partirait maintenant (déjà anonymisé)
//   POST /api/rapport-technique/envoyer   envoi immédiat (réessai après un échec, essai du jeton)

const express = require('express');
const { executerRapportTechnique, CRENEAUX_RAPPORT } = require('../rapportTechnique');

const MAX_EVENEMENTS_PAR_ENVOI = 50;

function txt(v, max) {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

// Liste blanche stricte : seuls ces champs entrent dans le journal, jamais une valeur de dossier.
function evenementPoste(brut) {
  const b = brut && typeof brut === 'object' ? brut : null;
  if (!b) return null;
  const version = txt(b.version, 40);
  if (b.categorie === 'erreur-poste') {
    const message = txt(b.message, 800).trim();
    if (!message) return null;
    return { categorie: 'erreur-poste', message, details: { source: txt(b.source, 120), version, onglet: txt(b.onglet, 60) } };
  }
  if (b.categorie === 'correction-extraction') {
    const champ = txt(b.champ, 60).replace(/[^A-Za-z0-9_.-]/g, '');
    if (!champ) return null;
    return { categorie: 'correction-extraction', message: champ, details: { champ, origine: txt(b.origine, 40).replace(/[^A-Za-z0-9_ ’'-]/g, ''), version } };
  }
  if (b.categorie === 'scan-lu') {
    const duree = Number.isFinite(b.dureeMs) && b.dureeMs >= 0 ? Math.min(Math.round(b.dureeMs), 3600000) : null;
    return {
      categorie: 'scan-lu', message: b.reconnu ? 'Scan lu, type reconnu' : 'Scan lu, type non reconnu',
      details: { dureeMs: duree, ocr: b.ocr === true, reconnu: b.reconnu === true, sur: b.sur === true, type: txt(b.type, 60).replace(/[^A-Za-z0-9_-]/g, ''), version }
    };
  }
  return null;
}

function creerRouteurRapportTechnique({ journal, parametresRepo, depot, db, buildInstalle, collaborateurs, fetchFn }) {
  const routeur = express.Router();
  let envoiEnCours = false;
  const options = () => ({ journal, parametresRepo, depot, db, buildInstalle: typeof buildInstalle === 'function' ? buildInstalle() : buildInstalle, collaborateurs, fetchFn });

  function etatPublic() {
    return {
      ...parametresRepo.lireRapportTechnique(),
      creneaux: CRENEAUX_RAPPORT,
      jetonEnregistre: !!parametresRepo.lireReglagesMiseAJour().jetonGithub
    };
  }

  routeur.post('/journal-technique', (req, res) => {
    const liste = Array.isArray(req.body && req.body.evenements) ? req.body.evenements.slice(0, MAX_EVENEMENTS_PAR_ENVOI) : [];
    let notes = 0;
    for (const brut of liste) {
      const e = evenementPoste(brut);
      if (e && journal.noter({ source: 'poste', ...e })) notes++;
    }
    res.json({ ok: true, notes });
  });

  routeur.get('/rapport-technique', (req, res) => res.json(etatPublic()));

  routeur.put('/rapport-technique', (req, res) => {
    if (typeof (req.body && req.body.actif) !== 'boolean') return res.status(400).json({ erreur: 'Champ « actif » attendu (vrai ou faux).' });
    parametresRepo.ecrireRapportTechnique({ ...parametresRepo.lireRapportTechnique(), actif: req.body.actif });
    res.json(etatPublic());
  });

  routeur.get('/rapport-technique/apercu', async (req, res) => {
    try {
      const { rapport } = await executerRapportTechnique({ ...options(), apercu: true });
      res.json({ titre: rapport.titre, corps: rapport.corps, calme: rapport.calme });
    } catch (e) {
      res.status(500).json({ erreur: `Aperçu impossible : ${e.message}` });
    }
  });

  routeur.post('/rapport-technique/envoyer', async (req, res) => {
    if (envoiEnCours) return res.status(409).json({ erreur: 'Un envoi est déjà en cours.' });
    envoiEnCours = true;
    try {
      const { etat } = await executerRapportTechnique(options());
      res.status(etat.derniereErreur ? 502 : 200).json({ ...etatPublic(), erreur: etat.derniereErreur || undefined });
    } catch (e) {
      res.status(500).json({ erreur: `Envoi impossible : ${e.message}` });
    } finally {
      envoiEnCours = false;
    }
  });

  return routeur;
}

module.exports = { creerRouteurRapportTechnique, evenementPoste };
