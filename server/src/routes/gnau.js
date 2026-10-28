'use strict';
// Guichets uniques d'urbanisme (GNAU) : la fiche d'un dossier pour le CU et la DIA, lue par l'extension Chrome « CLAIRE — Assistant
// de saisie » (extension-chrome/, étude 16/10). Lecture seule : rien n'est écrit sur le dossier ; la fiche ne quitte le réseau du
// bureau que dans le guichet de la commune, saisie par l'extension dans la session du notaire, qui relit et valide lui-même.

const express = require('express');
const fsp = require('fs/promises');
const path = require('path');
const { ficheGnau, dossiersGnau, choisirPlanCadastral } = require('../gnau');
const { listerPdfRecursif, resoudreCheminNas, fichiersLesPlusRecents } = require('../nas');
const { noterVerification } = require('../verificationsTerrain');
const { origineRequete } = require('./authentic');
const { adressesLan } = require('../reseau');

const RE_ID = /^[A-Za-z0-9_-]{1,80}$/;

/** Pure : le code INSEE de la commune d'un numéro national (« DIA 041 018 26 00012 » → « 41018 »). @param {string} numero */
function inseeDuNumeroGnau(numero) {
  const m = /^\S+ (\d{3}) (\d{3}) /.exec(String(numero || ''));
  return m ? `${m[1].replace(/^0/, '')}${m[2]}` : '';
}

/** Pure : le numéro national d'un dépôt (« DIA 041 018 26 00012 », « CU 041 018 26 A0012 »), propre, ou '' s'il n'en a pas la forme.
 * @param {any} v @param {string} proc 'dia' | 'cua' */
function numeroDepotGnau(v, proc) {
  const m = /^(DIA|IA|CU[AB]?)\s*(\d{3})\s*(\d{3})\s*(\d{2})\s*([A-Z]?\d{4,5})$/i.exec(String(v || '').replace(/\s+/g, ' ').trim());
  if (!m) return '';
  const type = m[1].toUpperCase();
  if (proc === 'dia' ? !/^(DIA|IA)$/.test(type) : !/^CU/.test(type)) return '';
  return `${type} ${m[2]} ${m[3]} ${m[4]} ${m[5].toUpperCase()}`;
}
const aujourdhuiParis = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });

const TAILLE_MAX_PLAN = 15 * 1024 * 1024;
const DUREE_OUVERTURE_MS = 10 * 60 * 1000;

/** @param {any} depot @param {any} parametresRepo @param {any} [config] */
function creerRouteurGnau(depot, parametresRepo, config) {
  const routeur = express.Router();
  /** @type {Map<string, { id: string, le: number }>} */
  const ouvertures = new Map();
  const posteDe = (req) => origineRequete(req, adressesLan);

  routeur.get('/gnau/dossiers', (req, res) => {
    const q = String(req.query.q || '').slice(0, 80);
    res.json({ dossiers: dossiersGnau(depot.tousActifs(), q) });
  });

  // Lien du guichet cliqué dans CLAIRE (Constitution de dossier, étude 17/10 : « ouvrir Chrome avec l'add-on ouvert ») : le dossier est
  // retenu 10 minutes en mémoire du serveur, l'extension le propose (bouton sur la page du guichet, dossier choisi d'avance dans le
  // panneau). Un par poste (adresse réseau : la fenêtre CLAIRE et l'extension d'un même poste, « local » pour le poste serveur).
  routeur.post('/gnau/ouverture', (req, res) => {
    const id = String((req.body && req.body.dossierId) || '');
    if (!RE_ID.test(id)) { res.status(400).json({ erreur: 'Identifiant de dossier invalide.' }); return; }
    const d = depot.trouverParId(id);
    if (!d || d.deleted || d.typeAffaire === 'succession') { res.status(404).json({ erreur: 'Dossier introuvable.' }); return; }
    ouvertures.set(posteDe(req), { id, le: Date.now() });
    if (ouvertures.size > 50) ouvertures.delete(ouvertures.keys().next().value);
    res.json({ ok: true });
  });
  routeur.get('/gnau/ouverture', (req, res) => {
    const ouverture = ouvertures.get(posteDe(req));
    if (!ouverture || Date.now() - ouverture.le > DUREE_OUVERTURE_MS) { res.json({ dossier: null }); return; }
    const d = depot.trouverParId(ouverture.id);
    const dossier = d && !d.deleted ? dossiersGnau([d], '')[0] || null : null;
    res.json({ dossier, le: ouverture.le });
  });

  // Numéro du dossier déposé sur le guichet, relevé par l'extension après la validation par le notaire (étude 27/10) : la fiche le garde
  // (`d.gnau.dia` / `d.gnau.cua` : numéro, déposé le), la DIA compte alors comme envoyée (réponse attendue sous 2 mois). Rien d'autre.
  routeur.post('/gnau/depot', (req, res) => {
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    // Les dossiers dont une saisie attend sa validation (audit 0.380.0 : plusieurs possibles) ; `dossierId` seul reste accepté.
    const ids = (Array.isArray(b.candidats) ? b.candidats : [b.dossierId]).map((x) => String(x || '')).filter((x) => RE_ID.test(x)).slice(0, 5);
    if (!ids.length) { res.status(400).json({ erreur: 'Identifiant de dossier invalide.' }); return; }
    const proc = b.procedure === 'dia' ? 'dia' : b.procedure === 'cua' || b.procedure === 'cub' ? 'cua' : '';
    const numero = numeroDepotGnau(b.numero, proc);
    if (!proc || !numero) { res.status(400).json({ erreur: 'Numéro de dépôt non reconnu.' }); return; }
    // La commune du numéro (« 041 018 » = INSEE 41018) : un dossier d'une autre commune connue n'est jamais pris ; plusieurs possibles = rien.
    const inseeNumero = inseeDuNumeroGnau(numero);
    const dossiersCandidats = ids.map((x) => depot.trouverParId(x)).filter((x) => x && !x.deleted && x.typeAffaire !== 'succession');
    const memeCommune = dossiersCandidats.filter((x) => { const i = x.preemption && typeof x.preemption.insee === 'string' ? x.preemption.insee : ''; return !i || i === inseeNumero; });
    const surs = memeCommune.filter((x) => x.preemption && x.preemption.insee === inseeNumero);
    const choisi = surs.length === 1 ? surs[0] : memeCommune.length === 1 ? memeCommune[0] : null;
    if (!choisi) { res.status(dossiersCandidats.length ? 409 : 404).json({ erreur: dossiersCandidats.length ? 'Numéro non rattaché : plusieurs dossiers possibles, ou une autre commune.' : 'Dossier introuvable.' }); return; }
    const d = choisi;
    const id = d.id;
    const g = d.gnau && typeof d.gnau === 'object' ? d.gnau : {};
    if (g[proc] && g[proc].numero === numero) { res.json({ ok: true, deja: true, dossierId: id }); return; }
    // Un numéro déjà relevé n'est jamais remplacé par un autre (audit 0.380.0) : à vérifier à la main.
    if (g[proc] && g[proc].numero) { res.status(409).json({ erreur: 'Un autre numéro est déjà relevé pour ce dossier.' }); return; }
    const jour = aujourdhuiParis();
    d.gnau = Object.assign({}, g, { [proc]: { numero, deposeLe: (g[proc] && g[proc].deposeLe) || jour, releveLe: new Date().toISOString() } });
    d.historique = (Array.isArray(d.historique) ? d.historique : []).concat({ date: new Date().toISOString(), texte: `${proc === 'dia' ? 'DIA' : 'Demande de certificat d’urbanisme'} déposée sur le guichet unique (n° ${numero})`, auteur: 'CLAIRE' });
    depot.remplacer(id, d);
    noterVerification(parametresRepo, 'gnau-depot-numero', { detail: proc });
    res.json({ ok: true, dossierId: id });
  });

  routeur.get('/gnau/fiche/:id', (req, res) => {
    const id = String(req.params.id || '');
    if (!RE_ID.test(id)) { res.status(400).json({ erreur: 'Identifiant de dossier invalide.' }); return; }
    const d = depot.trouverParId(id);
    if (!d || d.deleted) { res.status(404).json({ erreur: 'Dossier introuvable.' }); return; }
    if (d.typeAffaire === 'succession') { res.status(400).json({ erreur: 'Une succession n’a ni CU ni DIA.' }); return; }
    const procedure = req.query.procedure === 'dia' ? 'dia' : 'cua';
    const fiche = ficheGnau(d, procedure, aujourdhuiParis());
    noterVerification(parametresRepo, 'gnau-fiche-extension', { detail: `fiche ${procedure} servie à l’extension` });
    res.json({ fiche });
  });

  // Le plan cadastral du dossier client du NAS (étude 16/10 : « aller chercher le plan du cadastre dans le dossier sur le NAS pour
  // l'annexer »), joint par l'extension au champ de pièce du guichet. Lecture seule ; le dossier est celui que la fiche a relié, jamais
  // un chemin venu de l'extension ; PDF seulement, 15 Mo au plus. Nom envoyé : « Plan cadastral.pdf » (jamais le nom du fichier).
  routeur.get('/gnau/plan/:id', async (req, res) => {
    try {
      const id = String(req.params.id || '');
      if (!RE_ID.test(id)) { res.status(400).json({ erreur: 'Identifiant de dossier invalide.' }); return; }
      const d = depot.trouverParId(id);
      if (!d || d.deleted) { res.status(404).json({ erreur: 'Dossier introuvable.' }); return; }
      const racine = config && config.nasRacine;
      if (!racine || !d.nasDossier) { res.status(404).json({ erreur: 'Dossier non relié au NAS : joignez le plan vous-même.' }); return; }
      const absolu = await resoudreCheminNas(racine, String(d.nasDossier));
      if (!absolu) { res.status(404).json({ erreur: 'Dossier du NAS introuvable.' }); return; }
      const fichiers = await listerPdfRecursif(absolu);
      const recents = await fichiersLesPlusRecents(absolu, fichiers.filter((f) => choisirPlanCadastral([f]).length), 20);
      const choix = choisirPlanCadastral(recents)[0];
      if (!choix) { res.status(404).json({ erreur: 'Aucun plan cadastral dans le dossier du NAS (nom « plan cadastral », « plan de situation », « extrait cadastral »…).' }); return; }
      const cible = await resoudreCheminNas(absolu, choix.chemin);
      if (!cible || !/\.pdf$/i.test(cible)) { res.status(404).json({ erreur: 'Plan illisible.' }); return; }
      const st = await fsp.stat(cible);
      if (st.size > TAILLE_MAX_PLAN) { res.status(413).json({ erreur: 'Plan cadastral trop lourd (plus de 15 Mo) : joignez-le vous-même.' }); return; }
      const contenu = await fsp.readFile(cible);
      noterVerification(parametresRepo, 'gnau-plan-cadastral', { detail: 'plan du NAS servi à l’extension' });
      res.set('Content-Type', 'application/pdf');
      res.set('X-Claire-Nom', encodeURIComponent('Plan cadastral.pdf'));
      // Où il a été trouvé, sans nom de sous-dossier (il peut porter le nom d'un client).
      res.set('X-Claire-Source', encodeURIComponent(path.dirname(cible) === absolu ? 'racine du dossier' : 'sous-dossier du dossier'));
      res.send(contenu);
    } catch (e) {
      console.error('[gnau] plan cadastral :', e && e.code ? e.code : 'erreur');
      res.status(500).json({ erreur: 'Lecture du plan impossible.' });
    }
  });

  return routeur;
}

module.exports = { numeroDepotGnau, inseeDuNumeroGnau, creerRouteurGnau };
