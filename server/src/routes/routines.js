// @ts-check
'use strict';
// Routines de CLAIRE, phase 0 (cadrage : docs/spec-routines-claire.md) : réglages (interrupteurs, trois niveaux d'autonomie, plafond), boîte de
// propositions de chaque collaborateur, journal « Ce que CLAIRE a fait seule ». Aucune de ces routes n'envoie un email au client ni n'écrit
// ailleurs que dans les clés `routines-*` : une proposition acceptée est exécutée PAR LE POSTE, avec les gestes habituels de CLAIRE.

const express = require('express');
const { NIVEAUX, CATALOGUE, routineParId } = require('../routines/catalogue');
const { lireReglagesRoutines, ecrireReglagesRoutines, assainirReglagesRoutines, niveauEffectif } = require('../routines/reglages');
const { lirePropositions, ecrirePropositions, listerPropositions, compterATraiter, decider, statsRoutine, expirer } = require('../routines/propositions');
const { lireJournalRoutines, noterJournalRoutines } = require('../routines/journal');
const { lireUsageRoutines } = require('../routines/usage');
const { COLLABORATEURS_ABSENCE } = require('../agendaOffice');

const COLLABORATEURS = COLLABORATEURS_ABSENCE.map((c) => c.nom);
const ADMINISTRATEURS = ['Bastien ANGLUMENT'];
const ETATS_PAR_FILTRE = { 'a-traiter': ['proposee', 'vue'], traitees: ['acceptee', 'refusee', 'expiree'] };

/** Un collaborateur de la liste fermée, sinon rien. @param {any} v */
function collaborateurDe(v) {
  const nom = String(v || '').trim();
  return COLLABORATEURS.find((c) => c.toLowerCase() === nom.toLowerCase()) || '';
}

/** @param {any} parametresRepo @param {any} planificateur */
function creerRouteurRoutines(parametresRepo, planificateur) {
  const routeur = express.Router();

  // Tout ce que montre la page Réglages › Routines : réglages, catalogue avec statistiques d'acceptation, niveaux, dépense du mois, état.
  routeur.get('/routines', (req, res) => {
    const reglages = lireReglagesRoutines(parametresRepo);
    const propositions = lirePropositions(parametresRepo);
    res.json({
      reglages,
      niveaux: Object.values(NIVEAUX),
      usage: lireUsageRoutines(parametresRepo),
      collaborateurs: COLLABORATEURS,
      etat: planificateur ? planificateur.lireEtat() : {},
      catalogue: CATALOGUE.map((r) => Object.assign({}, r, { stats: statsRoutine(propositions, r.id) }))
    });
  });

  routeur.put('/routines/reglages', (req, res) => {
    const corps = req.body && typeof req.body === 'object' ? req.body : null;
    if (!corps || Array.isArray(corps)) { res.status(400).json({ erreur: 'Réglages manquants.' }); return; }
    // Seules les clés envoyées changent : un poste qui ne connaît pas une routine ne l'efface jamais.
    const avant = lireReglagesRoutines(parametresRepo);
    const routines = Object.assign({}, avant.routines);
    for (const id of Object.keys(corps.routines && typeof corps.routines === 'object' ? corps.routines : {})) routines[id] = Object.assign({}, avant.routines[id], corps.routines[id]);
    const fusion = Object.assign({}, avant, corps, { routines });
    const propre = assainirReglagesRoutines(fusion);
    const auteur = collaborateurDe(corps.auteur);
    const monte3 = CATALOGUE.some((r) => r.gestes.some((g) => niveauEffectif(propre, r.id, g.cle) === 3 && niveauEffectif(avant, r.id, g.cle) < 3));
    const bascule = propre.actif !== avant.actif;
    if ((monte3 || bascule) && !(auteur && ADMINISTRATEURS.includes(auteur))) { res.status(403).json({ erreur: 'Réservé à l’administrateur.' }); return; }
    ecrireReglagesRoutines(parametresRepo, fusion);
    if (monte3 || bascule) noterJournalRoutines(parametresRepo, { routine: 'reglages', texte: `${bascule ? (propre.actif ? 'Routines allumées' : 'Routines éteintes') : 'Niveau 3 accordé'} par ${String(auteur).split(' ')[0]}.`, niveau: monte3 ? 3 : 1 });
    res.json(propre);
  });

  routeur.post('/routines/:id/lancer', (req, res) => {
    const responsable = collaborateurDe((req.body || {}).responsable);
    if (!responsable) { res.status(400).json({ erreur: 'Collaborateur inconnu.' }); return; }
    const r = planificateur.lancer(req.params.id, { responsable });
    res.status(r.ok ? 200 : 400).json(r.ok ? r : { erreur: r.message });
  });

  routeur.get('/routines/journal', (req, res) => {
    const limite = Math.max(1, Math.min(300, Number(req.query.limite) || 60));
    res.json({ entrees: lireJournalRoutines(parametresRepo).slice(-limite).reverse() });
  });

  // La boîte d'un collaborateur : `utilisateur` (liste fermée), `tous=1` pour l'administrateur, `etat` = a-traiter | traitees, `dossierId`.
  routeur.get('/propositions', (req, res) => {
    const utilisateur = collaborateurDe(req.query.utilisateur);
    const tous = req.query.tous === '1' && ADMINISTRATEURS.includes(utilisateur);
    if (!utilisateur) { res.status(400).json({ erreur: 'Collaborateur inconnu.' }); return; }
    const toutes = expirer(lirePropositions(parametresRepo));
    const filtre = String(req.query.etat || '');
    const etats = Object.prototype.hasOwnProperty.call(ETATS_PAR_FILTRE, filtre) ? ETATS_PAR_FILTRE[/** @type {'a-traiter' | 'traitees'} */ (filtre)] : undefined;
    const dossierId = typeof req.query.dossierId === 'string' ? req.query.dossierId.slice(0, 80) : '';
    res.json({
      aTraiter: compterATraiter(toutes, utilisateur, tous),
      // Le nom de la routine accompagne chaque proposition (pastille de la boîte) ; une routine retirée du catalogue garde un nom neutre.
      propositions: listerPropositions(toutes, { responsable: utilisateur, tous, etats, dossierId }).slice(0, 200)
        .map((p) => Object.assign({}, p, { routineNom: (routineParId(p.routine) || { nom: 'CLAIRE' }).nom }))
    });
  });

  routeur.post('/propositions/:id/decision', (req, res) => {
    const corps = req.body && typeof req.body === 'object' ? req.body : {};
    const par = collaborateurDe(corps.auteur);
    if (!par) { res.status(400).json({ erreur: 'Collaborateur inconnu.' }); return; }
    if (!['vue', 'acceptee', 'refusee'].includes(corps.decision)) { res.status(400).json({ erreur: 'Décision inconnue.' }); return; }
    const liste = lirePropositions(parametresRepo);
    const cible = liste.find((x) => x.id === req.params.id);
    if (cible && cible.responsable && cible.responsable !== par && !ADMINISTRATEURS.includes(par)) { res.status(403).json({ erreur: 'Cette proposition n’est pas dans votre boîte.' }); return; }
    const r = decider(liste, req.params.id, corps.decision, par);
    if (!r.proposition) { res.status(404).json({ erreur: 'Proposition introuvable.' }); return; }
    const dejaTraitee = r.liste === liste;
    if (!dejaTraitee) ecrirePropositions(parametresRepo, r.liste);
    res.json({ ok: true, dejaTraitee: dejaTraitee && corps.decision !== 'vue', proposition: r.proposition });
  });

  return routeur;
}

module.exports = { creerRouteurRoutines, collaborateurDe };
