// @ts-check
'use strict';
// CLAIRE dans Authentic (étude 27/10, voir authenticClaire.js) : réglages du compte, essai de connexion, lecture d'un dossier et
// préparation d'une demande CJN / Comedec par le navigateur du serveur. Chaque geste est une tâche du navigateur (navigateur/taches.js),
// suivie en direct comme un plan de cadastre (GET /api/navigation/taches/:id) ; son résultat est dit par CLAIRE dans le canal du dossier.

const express = require('express');
const A = require('../authenticClaire');
const { collaborateurDe } = require('./routines');
const { ajouterMessage, canalDuDossier } = require('../canaux/canaux');
const { noterVerification } = require('../verificationsTerrain');

const ADMINISTRATEURS = ['Bastien ANGLUMENT', 'Sophie GOSSART'];
// Demandes déjà créées par CLAIRE (dossier + type → date) : jamais deux fois la même (un rejet CJN est facturé ; relecture 0.373.0).
const CLE_DEMANDES_AUTHENTIC = 'authentic-demandes';
const DUREE_MAX_TACHE_MS = 8 * 60 * 1000;

/** Pure : le libellé du dossier tel qu'Authentic l'écrit (« VTE NOM / NOM »), d'après la fiche CLAIRE. @param {any} d */
function cibleAuthentic(d) {
  const intitules = Array.isArray(d && d.intitulesAuthentic) ? d.intitulesAuthentic.filter((x) => typeof x === 'string' && x.trim()) : [];
  const nom = String((d && d.nom) || '').trim();
  const libelle = intitules.length ? intitules[intitules.length - 1].replace(/^\d{1,6}\s*-\s*/, '').trim()
    : nom ? (/^(VTE|SUCC)\b/i.test(nom) ? nom : 'VTE ' + nom) : '';
  return { reference: String((d && d.referenceAuthentic) || '').trim(), libelle };
}

/** Pure : les parties envoyées par le poste pour une demande Comedec, propres. @param {any} brut */
function partiesDemande(brut) {
  return (Array.isArray(brut) ? brut : []).slice(0, 12).map((p) => ({
    nom: String((p && p.nom) || '').slice(0, 120), prenom: String((p && p.prenom) || '').slice(0, 80), marie: !!(p && p.marie)
  })).filter((p) => p.nom.trim());
}

/**
 * @param {{ parametresRepo: any, depot: any, gestion: any, recevoirReleve: (c: any, origine: string) => any, config: any }} o
 */
function creerRouteurAuthenticClaire(o) {
  const routeur = express.Router();
  const repo = o.parametresRepo;
  let script = null;
  const releve = async () => { if (!script) script = await A.scriptReleve(o.config); return script; };

  /** @type {Set<string>} */
  const enCours = new Set();

  /** Lance une tâche Authentic ; le résultat est dit dans le canal du dossier. @param {string} type @param {string} titre @param {any} d @param {(t: any, s: any, etape: (x: string) => void) => Promise<string>} faire @param {string} [verrou] */
  function lancer(type, titre, d, faire, verrou) {
    const r = A.lireConnexionAuthentic(repo);
    if (!r.actif) throw Object.assign(new Error('La connexion de CLAIRE à Authentic est éteinte (Réglages › Authentic).'), { statut: 409 });
    if (!r.identifiant || !r.motDePasse) throw Object.assign(new Error('Identifiant ou mot de passe d’Authentic non enregistré (Réglages › Authentic).'), { statut: 409 });
    // Disjoncteur : identifiants refusés une fois = plus aucun essai tant qu'ils ne sont pas changés (le compte se verrouillerait).
    if (r.refuseLe) throw Object.assign(new Error('Authentic a refusé l’identifiant ou le mot de passe : corrigez-les dans Réglages › Authentic avant tout nouvel essai.'), { statut: 409 });
    if (verrou && enCours.has(verrou)) throw Object.assign(new Error('Cette demande est déjà en cours de préparation.'), { statut: 409 });
    if (verrou) enCours.add(verrou);
    let id;
    try {
      id = o.gestion.lancerAuthentic(type, titre, async (/** @type {any} */ t, /** @type {any} */ s) => {
      const etape = (/** @type {string} */ x) => { if (t.annule) throw Object.assign(new Error('Arrêté.'), { annule: true }); t.etape(x); };
      let minuterie;
      try {
        // Jamais une tâche sans fin : au bout de 8 minutes elle s'arrête (étape suivante), comme « Arrêter ».
        minuterie = setTimeout(() => { t.annule = true; }, DUREE_MAX_TACHE_MS);
        await A.seConnecter(s, r, etape);
        noterVerification(repo, 'authentic-connexion', { detail: 'connectée' });
        const dit = await faire(t, s, etape);
        t.resultat = { dossierId: d ? d.id : '', texte: dit };
        if (d) ajouterMessage(repo, canalDuDossier(d.id), { auteur: 'CLAIRE', claire: true, texte: dit });
      } catch (e) {
        if (e && e.refusIdentifiants) { A.ecrireConnexionAuthentic(repo, { refuseLe: true }); noterVerification(repo, 'authentic-connexion', { ok: false, message: 'identifiants refusés' }); }
        // Le message d'erreur ne cite jamais un nom (libellés génériques du parcours).
        if (d && !(e && e.annule)) ajouterMessage(repo, canalDuDossier(d.id), { auteur: 'CLAIRE', claire: true, texte: `${titre} : pas fait — ${String((e && e.message) || 'erreur').slice(0, 200)}.` });
        throw e;
      } finally {
        clearTimeout(minuterie);
        if (verrou) enCours.delete(verrou);
      }
    }, A.DOMAINES_AUTHENTIC);
    } catch (e) { if (verrou) enCours.delete(verrou); throw e; }
    return id;
  }

  const repondre = (res, fn) => {
    try { res.json({ id: fn() }); } catch (e) { res.status((e && e.statut) || 500).json({ erreur: (e && e.message) || 'Erreur interne.' }); }
  };
  const dossierDe = (req, res) => {
    const id = String((req.body && req.body.dossierId) || '');
    const d = id && o.depot ? o.depot.trouverParId(id) : null;
    if (!d) { res.status(404).json({ erreur: 'Dossier inconnu.' }); return null; }
    const c = cibleAuthentic(d);
    if (!c.reference && !c.libelle) { res.status(400).json({ erreur: 'Ce dossier n’a ni référence ni nom d’Authentic.' }); return null; }
    return d;
  };

  routeur.get('/authentic-claire/reglages', (req, res) => { res.json(Object.assign(A.vueConnexionAuthentic(A.lireConnexionAuthentic(repo)), { refus: require('../authentic/garde').refusRecents().slice(0, 10) })); });

  // Le compte de l'étude ne se règle que par un administrateur (Bastien, Sophie).
  routeur.put('/authentic-claire/reglages', (req, res) => {
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const auteur = collaborateurDe(b.auteur);
    if (!ADMINISTRATEURS.includes(auteur)) { res.status(403).json({ erreur: 'Réservé à l’administrateur.' }); return; }
    res.json(A.vueConnexionAuthentic(A.ecrireConnexionAuthentic(repo, b)));
  });

  routeur.post('/authentic-claire/essai', (req, res) => {
    if (!ADMINISTRATEURS.includes(collaborateurDe(req.body && req.body.auteur))) { res.status(403).json({ erreur: 'Réservé à l’administrateur.' }); return; }
    repondre(res, () => lancer('authentic-essai', 'Essai de connexion à Authentic', null, async () => 'Connexion à Authentic réussie.'));
  });

  routeur.post('/authentic-claire/lire', (req, res) => {
    if (!collaborateurDe(req.body && req.body.auteur)) { res.status(400).json({ erreur: 'Collaborateur inconnu.' }); return; }
    const d = dossierDe(req, res); if (!d) return;
    const cible = cibleAuthentic(d);
    repondre(res, () => lancer('authentic-lire', 'Lecture du dossier dans Authentic', d, async (t, s, etape) => {
      const r = await A.lireDossier(s, cible, { script: await releve(), recevoir: (c) => o.recevoirReleve(c, 'claire-serveur'), etape });
      noterVerification(repo, 'authentic-lecture', { detail: `${r.pages} page(s)` });
      if (r.apercus) noterVerification(repo, 'authentic-apercus', { detail: `${r.apercus} aperçu(s)` });
      return `J’ai lu le dossier dans Authentic (${r.pages} page${r.pages > 1 ? 's' : ''}) : la fiche se complète avec ce qu’Authentic montre.`;
    }));
  });

  routeur.post('/authentic-claire/formalite', (req, res) => {
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const type = b.type === 'cjn' || b.type === 'comedec' ? b.type : '';
    if (!type) { res.status(400).json({ erreur: 'Demande inconnue (cjn ou comedec).' }); return; }
    // Écrire dans Authentic : éteint par défaut (plan du 27/10, lecture seule) ; l'administrateur l'allume dans Réglages › Authentic.
    if (!A.lireConnexionAuthentic(repo).preparerDemandes) { res.status(409).json({ erreur: 'Préparer des demandes dans Authentic est éteint (Réglages › Authentic) : CLAIRE ne fait que lire.' }); return; }
    if (!collaborateurDe(b.auteur)) { res.status(400).json({ erreur: 'Collaborateur inconnu.' }); return; }
    const d = dossierDe(req, res); if (!d) return;
    const parties = partiesDemande(b.parties);
    if (!parties.length) { res.status(400).json({ erreur: type === 'cjn' ? 'Aucun acquéreur pour la demande de casier.' : 'Aucune partie pour la demande d’état civil.' }); return; }
    if (!String(d.referenceAuthentic || '').trim()) { res.status(409).json({ erreur: 'Ce dossier n’est pas relié à Authentic par sa référence : ouvrez-le une fois dans Authentic.' }); return; }
    if (type === 'cjn' && d.roleNotaire === 'participant') { res.status(409).json({ erreur: 'Le notaire qui reçoit l’acte fait la demande de casier.' }); return; }
    const cle = `${d.id}:${type}`;
    const faites = repo.lireJsonBrut(CLE_DEMANDES_AUTHENTIC, {}) || {};
    if (faites[cle] && b.refaire !== true) { res.status(409).json({ erreur: `Déjà préparée par CLAIRE le ${String(faites[cle]).slice(0, 10).split('-').reverse().join('/')} : vérifiez dans Authentic avant d’en créer une autre.` }); return; }
    const nom = type === 'cjn' ? 'Demande de casier judiciaire (CJN)' : 'Demande d’état civil (Comedec)';
    repondre(res, () => lancer('authentic-' + type, nom + ' dans Authentic', d, async (t, s, etape) => {
      const r = await A.preparerFormalite(s, cibleAuthentic(d), { type, parties, etape, ecriture: A.lireConnexionAuthentic(repo).preparerDemandes });
      const deja = repo.lireJsonBrut(CLE_DEMANDES_AUTHENTIC, {}) || {};
      deja[cle] = new Date().toISOString();
      repo.ecrireJsonBrut(CLE_DEMANDES_AUTHENTIC, deja);
      noterVerification(repo, 'authentic-' + type, { detail: `${r.demandes} demande(s) créée(s)` });
      return `${nom} créée dans Authentic, sans envoi (Création rapide, Envoi immédiat éteint) : ${r.demandes} ${type === 'cjn' ? 'acquéreur(s)' : 'acte(s) demandé(s)'}. Elle est à envoyer depuis le dossier ou le suivi ${type === 'cjn' ? 'CJN' : 'Comedec'}.`;
    }, cle));
  });

  return routeur;
}

module.exports = { creerRouteurAuthenticClaire, cibleAuthentic, partiesDemande, CLE_DEMANDES_AUTHENTIC };
