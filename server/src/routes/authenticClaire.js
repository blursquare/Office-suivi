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
const AT = require('../../../commun/authentic-modele');

const ADMINISTRATEURS = ['Bastien ANGLUMENT', 'Sophie GOSSART'];
// Demandes déjà créées par CLAIRE (dossier + type → date) : jamais deux fois la même (un rejet CJN est facturé ; relecture 0.373.0).
const CLE_DEMANDES_AUTHENTIC = 'authentic-demandes';
const DUREE_MAX_TACHE_MS = 8 * 60 * 1000;
// Le PDF d'une pièce jointe reste en mémoire 5 minutes, le temps que le poste le lise.
const DUREE_PIECE_MS = 5 * 60 * 1000;
// Les écrans de suivi d'Authentic lus par CLAIRE (étape 7) : gardés sur le serveur du bureau, relus à la demande seulement (« Relire
// maintenant » du widget) — jamais de connexion automatique au compte de l'étude (audit 0.382.0 : une session ouverte par CLAIRE pourrait
// déconnecter un collaborateur connecté sous le même compte).
const CLE_SUIVIS_AUTHENTIC = 'authentic-suivis';

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

  /** Lance une tâche Authentic ; le résultat est dit dans le canal du dossier. @param {string} type @param {string} titre @param {any} d @param {(t: any, s: any, etape: (x: string) => void) => Promise<string>} faire @param {string} [verrou] @param {{ silencieux?: boolean }} [opt] */
  function lancer(type, titre, d, faire, verrou, opt) {
    const dire = !!d && !(opt && opt.silencieux);
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
        if (dire) ajouterMessage(repo, canalDuDossier(d.id), { auteur: 'CLAIRE', claire: true, texte: dit });
      } catch (e) {
        if (e && e.refusIdentifiants) { A.ecrireConnexionAuthentic(repo, { refuseLe: true }); noterVerification(repo, 'authentic-connexion', { ok: false, message: 'identifiants refusés' }); }
        // Le message d'erreur ne cite jamais un nom (libellés génériques du parcours).
        if (dire && !(e && e.annule)) ajouterMessage(repo, canalDuDossier(d.id), { auteur: 'CLAIRE', claire: true, texte: `${titre} : pas fait — ${String((e && e.message) || 'erreur').slice(0, 200)}.` });
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

  // Le PDF d'une pièce jointe d'Authentic, à la demande (étape 5) : une tâche du navigateur, le PDF rendu comme document de la tâche
  // (GET /api/navigation/taches/:id/documents/piece), gardé quelques minutes en mémoire, jamais sur le disque ni sur le NAS.
  routeur.post('/authentic-claire/piece', (req, res) => {
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    if (!collaborateurDe(b.auteur)) { res.status(400).json({ erreur: 'Collaborateur inconnu.' }); return; }
    const pjId = String(b.pjId || '');
    if (!/^[\w-]{1,40}$/.test(pjId)) { res.status(400).json({ erreur: 'Pièce inconnue.' }); return; }
    const d = dossierDe(req, res); if (!d) return;
    if (!String(d.referenceAuthentic || '').trim()) { res.status(409).json({ erreur: 'Ce dossier n’est pas relié à Authentic par sa référence.' }); return; }
    // Rattachée au dossier (rangement sur le NAS de CE dossier seul), sans message dans son canal ; une seule ouverture à la fois par pièce.
    repondre(res, () => lancer('authentic-piece', 'Pièce jointe d’Authentic', d, async (t, s, etape) => {
      const r = await A.lirePiecePdf(s, cibleAuthentic(d), pjId, { etape });
      t.documents.push({ id: 'piece', titre: r.nom, nom: /\.pdf$/i.test(r.nom) ? r.nom : r.nom + '.pdf', type: 'application/pdf', octets: r.pdf });
      // Le PDF ne reste que le temps que le poste le lise (audit 0.381.0 : jusqu'à 20 Mo par tâche gardée 2 h).
      const oubli = setTimeout(() => { t.documents = (t.documents || []).filter((/** @type {any} */ x) => x.id !== 'piece'); }, DUREE_PIECE_MS);
      if (oubli && typeof oubli.unref === 'function') oubli.unref();
      noterVerification(repo, 'authentic-piece-pdf', { detail: 'pièce lue' });
      return 'Pièce ouverte.';
    }, `piece:${d.id}:${pjId}`, { silencieux: true }));
  });

  // Les suivis d'Authentic (étape 7) : la tâche du navigateur lit les quatre écrans ; le tableau de bord en tire ses compteurs.
  const lancerSuivis = () => lancer('authentic-suivis', 'Lecture des suivis dans Authentic', null, async (t, s, etape) => {
    const captures = await A.lireSuivis(s, { script: await releve(), etape });
    const luLe = new Date().toISOString();
    const avant = repo.lireJsonBrut(CLE_SUIVIS_AUTHENTIC, null) || {};
    /** @type {Record<string, any>} */
    const ecrans = Object.assign({}, avant.ecrans || {});
    for (const [cle, capture] of Object.entries(captures)) ecrans[cle] = AT.suiviDepuisCaptureAT(/** @type {any} */ (cle), capture, luLe);
    const n = Object.keys(captures).length;
    // « Lu » seulement quand un écran l'a été (audit 0.382.0 : sinon le widget disait « Lu à … » sur des données anciennes).
    repo.ecrireJsonBrut(CLE_SUIVIS_AUTHENTIC, { luLe: n ? luLe : (avant.luLe || ''), essaiLe: luLe, ecrans });
    noterVerification(repo, 'authentic-suivis', n ? { detail: `${n} écran(s)` } : { ok: false, message: 'aucun écran de suivi trouvé' });
    return n ? `J’ai lu ${n} écran${n > 1 ? 's' : ''} de suivi dans Authentic.` : 'Aucun écran de suivi trouvé dans Authentic.';
  }, 'suivis');

  routeur.post('/authentic-claire/suivis', (req, res) => {
    if (!collaborateurDe(req.body && req.body.auteur)) { res.status(400).json({ erreur: 'Collaborateur inconnu.' }); return; }
    repondre(res, lancerSuivis);
  });

  // Ce qui a été lu : compteurs et lignes ; chaque ligne qui porte la référence d'une fiche dit son dossier. Lecture seule : rien n'est
  // lancé dans Authentic par cette route.
  routeur.get('/authentic-claire/suivis', (req, res) => {
    if (!collaborateurDe(req.query && req.query.utilisateur)) { res.status(400).json({ erreur: 'Collaborateur inconnu.' }); return; }
    const etat = repo.lireJsonBrut(CLE_SUIVIS_AUTHENTIC, null) || { ecrans: {} };
    const r = A.lireConnexionAuthentic(repo);
    const enCoursDeLecture = enCours.has('suivis');
    const dossiers = (o.depot && typeof o.depot.tousActifs === 'function' ? o.depot.tousActifs() : []);
    /** @type {Record<string, string>} */
    const parReference = {};
    for (const d of dossiers) { const ref = AT.referenceDansTexteAT(d && d.referenceAuthentic); if (ref && !parReference[ref]) parReference[ref] = d.id; }
    /** @type {Record<string, any>} */
    const ecrans = {};
    for (const e of AT.ECRANS_SUIVIS_AT) {
      const sv = etat.ecrans && etat.ecrans[e.cle];
      ecrans[e.cle] = sv ? Object.assign({}, sv, { lignes: sv.lignes.map((/** @type {any} */ l) => Object.assign({}, l, { dossierId: parReference[l.reference] || '' })) }) : null;
    }
    res.json({ luLe: etat.luLe || '', essaiLe: etat.essaiLe || '', enCoursDeLecture, actif: !!r.actif, compteurs: AT.compteursSuivisAT(etat.ecrans || {}, Object.keys(parReference)), ecrans });
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

module.exports = { creerRouteurAuthenticClaire, cibleAuthentic, partiesDemande, CLE_DEMANDES_AUTHENTIC, CLE_SUIVIS_AUTHENTIC };
