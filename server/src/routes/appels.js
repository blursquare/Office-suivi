'use strict';

// Appels reçus (3CX, voir ../appels3cx.js).
//  - GET /appel (hors /api, sans session) : l'adresse que 3CX ouvre à la sonnerie. Elle note l'appel
//    et ne renvoie aucune donnée : une page qui se ferme (fenêtre CLAIRE du collaborateur ouverte et
//    visible, ou appelant inconnu de CLAIRE — étude 05/10) ou qui ouvre CLAIRE sur l'appel. Bornée à 60 appels par minute.
//  - GET /api/appels/nouveaux?poste=&depuis=&visible= : la fenêtre CLAIRE relève ses appels toutes les
//    3 s (même cachée) et signale si elle est visible.
//  - GET /api/appels?dossierId= : le journal (50 derniers, ou ceux d'un dossier).
//  - GET /api/appels/reglages → { postesCoupes, postesRelais } ; PUT { poste, actif } : intégration coupée pour un
//    collaborateur (étude, 02/10) — /appel de son poste ne note plus rien et la page se ferme, sa
//    fenêtre ne relève plus d'appel ; PUT { poste, relais: false } : relais retiré, l'onglet de 3CX affiche de nouveau CLAIRE.
//  - GET /api/appels/relais/installateur?poste= : l'installateur du relais « claire-appel: » de ce poste (appels ouverts
//    dans la fenêtre CLAIRE, étude 07/10, voir ../relaisAppel3cx.js) ; le poste est retenu dans postesRelais.

const express = require('express');
const { creerEntreeAppel, pageSonnerie, clePoste, valeur3cx } = require('../appels3cx');
const { noterVerification, formeNumero } = require('../verificationsTerrain');
const { adressesLan } = require('../reseau');
const { officesAnnuaire } = require('../annuaireNotaires');
const { scriptInstallationRelaisAppel } = require('../relaisAppel3cx');
const { adresseClairePoste } = require('../installationPoste');

// Le carnet, suivi des offices de l'annuaire qui n'y sont pas déjà (même identifiant).
function carnetEtAnnuaire(carnet) {
  const ids = new Set((carnet || []).map(o => o && o.id));
  return (carnet || []).concat(officesAnnuaire().filter(o => !ids.has(o.id)));
}

var FENETRE_VUE_MS = 15000;

function posteCoupe(parametresRepo, poste) {
  const cle = clePoste(poste);
  return !!cle && parametresRepo.lireReglagesTelephonie().postesCoupes.includes(cle);
}

function creerEtatAppels() {
  return { fenetres: new Map(), sonneries: [] };
}

function creerRouteurSonnerie(parametresRepo, depot, etat) {
  const routeur = express.Router();
  routeur.get('/appel', (req, res) => {
    // Téléphonie coupée pour ce collaborateur dans les Réglages : rien n'est noté, la page se ferme.
    if (posteCoupe(parametresRepo, (req.query || {}).poste)) {
      res.setHeader('Cache-Control', 'no-store');
      res.type('html').send(pageSonnerie({ id: '', fenetreVisible: true }));
      return;
    }
    const maintenant = Date.now();
    etat.sonneries = etat.sonneries.filter(t => maintenant - t < 60000);
    if (etat.sonneries.length >= 60) { res.status(429).type('text/plain').send('Trop d’appels.'); return; }
    etat.sonneries.push(maintenant);
    const q = req.query || {};
    let entree;
    try {
      entree = creerEntreeAppel({ numero: q.numero, nom: q.nom, poste: q.poste }, {
        dossiers: depot.tousActifs(),
        // Le carnet d'abord, puis l'annuaire de France (un confrère d'un office hors carnet).
        carnet: carnetEtAnnuaire(parametresRepo.lireCarnetConfreres()),
        repertoire: parametresRepo.lireRepertoire()
      });
      parametresRepo.ecrireJournalAppels([entree].concat(parametresRepo.lireJournalAppels()));
      // Vérifications sur le terrain : la forme du numéro seulement, jamais le numéro.
      const chiffres = String(valeur3cx(q.numero) || '').replace(/\D/g, '');
      noterVerification(parametresRepo, '3cx-sonnerie', chiffres.length >= 6 ? { detail: formeNumero(valeur3cx(q.numero)) } : { ok: false, message: chiffres ? 'numéro trop court' : 'numéro vide ou non rempli par 3CX' });
      if ((entree.dossiers && entree.dossiers.length) || entree.contact) noterVerification(parametresRepo, '3cx-appelant-reconnu');
    } catch (e) {
      // Jamais le numéro ni le nom dans le message.
      console.error('Appel 3CX non noté :', e && e.code ? e.code : 'erreur');
      res.status(500).type('text/plain').send('Appel non noté.');
      return;
    }
    const vue = etat.fenetres.get(entree.poste);
    const fenetreVisible = !!(entree.poste && vue && vue.visible && maintenant - vue.t < FENETRE_VUE_MS);
    res.setHeader('Cache-Control', 'no-store');
    const inconnu = !((entree.dossiers && entree.dossiers.length) || entree.contact);
    // Ancien relais « claire-appel: » (un .vbs, 07/10) plus lancé depuis le 12/10 : l'antivirus du bureau (Panda) le bloque, l'onglet
    // se fermait sur rien. Sans le relais CLAIRE du poste (ci-dessous), CLAIRE s'ouvre dans l'onglet sur l'appel.
    const relais = false;
    // Relais CLAIRE du poste en marche (relaisWord.js, étude 12/10) : l'onglet se ferme aussitôt, le relais montre la fenêtre CLAIRE
    // (appelant d'un dossier) ou rend le premier plan à la fenêtre d'avant la sonnerie.
    const relaisPoste = !!entree.poste && typeof etat.noterAppelRelais === 'function'
      && etat.noterAppelRelais(clePoste(entree.poste), { id: entree.id, dossier: !!(entree.dossiers && entree.dossiers.length) });
    res.type('html').send(pageSonnerie({ id: entree.id, fenetreVisible: fenetreVisible || relaisPoste, inconnu, relais }));
  });
  return routeur;
}

function creerRouteurAppels(parametresRepo, etat) {
  const routeur = express.Router();
  // Réglages › Téléphonie 3CX : intégration coupée collaborateur par collaborateur.
  routeur.get('/appels/reglages', (req, res) => res.json(parametresRepo.lireReglagesTelephonie()));
  routeur.put('/appels/reglages', (req, res) => {
    const poste = clePoste((req.body || {}).poste);
    if (!poste) { res.status(400).json({ error: 'Collaborateur attendu.' }); return; }
    const actuel = parametresRepo.lireReglagesTelephonie();
    if ((req.body || {}).relais === false) {
      res.json(parametresRepo.ecrireReglagesTelephonie(Object.assign({}, actuel, { postesRelais: actuel.postesRelais.filter(p => p !== poste) })));
      return;
    }
    const coupes = new Set(actuel.postesCoupes);
    if ((req.body || {}).actif === false) coupes.add(poste); else coupes.delete(poste);
    res.json(parametresRepo.ecrireReglagesTelephonie(Object.assign({}, actuel, { postesCoupes: [...coupes] })));
  });
  // Installateur du relais « claire-appel: » pour le poste qui le télécharge : fenêtre CLAIRE ouverte sur l'adresse par
  // laquelle il voit le serveur, profil « ClaireServeur » sur le serveur lui-même (index.js), « Claire » ailleurs
  // (installationPoste.js). Télécharger l'installateur, c'est le vouloir : le poste passe dans postesRelais.
  routeur.get('/appels/relais/installateur', (req, res) => {
    const poste = clePoste(req.query.poste);
    if (!poste) { res.status(400).json({ error: 'Collaborateur attendu.' }); return; }
    const url = adresseClairePoste(req.protocol, req.get('host'));
    if (!url) { res.status(400).json({ error: 'Adresse du serveur illisible.' }); return; }
    const local = /^https?:\/\/(localhost|127(\.\d+){3}|\[::1\])(:\d+)?\/$/i.test(url);
    const actuel = parametresRepo.lireReglagesTelephonie();
    parametresRepo.ecrireReglagesTelephonie(Object.assign({}, actuel, { postesRelais: actuel.postesRelais.filter(p => p !== poste).concat([poste]) }));
    res.setHeader('Content-Type', 'text/vbscript; charset=windows-1252');
    res.setHeader('Content-Disposition', 'attachment; filename="Installer-appels-3CX-dans-CLAIRE.vbs"');
    res.send(Buffer.from(scriptInstallationRelaisAppel({ url, profil: local ? 'ClaireServeur' : 'Claire' }), 'latin1'));
  });
  routeur.get('/appels/nouveaux', (req, res) => {
    if (posteCoupe(parametresRepo, req.query.poste)) { res.json({ appels: [], serverTime: new Date().toISOString(), coupe: true }); return; }
    const poste = clePoste(req.query.poste);
    const depuis = String(req.query.depuis || '');
    if (poste) etat.fenetres.set(poste, { t: Date.now(), visible: req.query.visible === '1' });
    // Heure prise AVANT la lecture : un appel noté entre les deux sera relevé la fois suivante
    // (la fenêtre écarte un appel déjà montré par son identifiant).
    const serverTime = new Date().toISOString();
    const journal = parametresRepo.lireJournalAppels();
    const appels = depuis ? journal.filter(a => a.t >= depuis && (!a.poste || clePoste(a.poste) === poste)).slice(0, 5) : [];
    res.json({ appels, serverTime });
  });
  // Réglages › Téléphonie 3CX : la fenêtre CLAIRE de chaque poste relève-t-elle ses appels ? Et quand
  // l'adresse de 3CX a-t-elle été ouverte pour ce poste pour la dernière fois ? (diagnostic, aucune donnée)
  routeur.get('/appels/postes', (req, res) => {
    const maintenant = Date.now();
    const postes = {};
    for (const [poste, vue] of etat.fenetres) {
      postes[poste] = { fenetre: maintenant - vue.t < FENETRE_VUE_MS, visible: !!vue.visible && maintenant - vue.t < FENETRE_VUE_MS, vueIlYaMs: maintenant - vue.t };
    }
    for (const a of parametresRepo.lireJournalAppels()) {
      const p = clePoste(a.poste);
      if (!p) continue;
      postes[p] = postes[p] || { fenetre: false, visible: false, vueIlYaMs: null };
      if (!postes[p].derniereSonnerie) postes[p].derniereSonnerie = a.t;
    }
    res.json({ postes });
  });
  // Adresses du serveur sur le réseau du bureau : la fenêtre CLAIRE du poste serveur est ouverte sur
  // http://localhost, adresse qui ne mène au serveur que depuis ce poste-là — l'adresse à coller dans
  // 3CX doit être celle du réseau.
  routeur.get('/appels/adresses-serveur', (req, res) => {
    res.json({ adresses: (etat.adressesLan || adressesLan)() });
  });
  routeur.get('/appels', (req, res) => {
    const journal = parametresRepo.lireJournalAppels();
    const dossierId = String(req.query.dossierId || '');
    const id = String(req.query.id || '');
    const liste = id ? journal.filter(a => a.id === id)
      : dossierId ? journal.filter(a => a.dossiers.some(x => x.id === dossierId)).slice(0, 50)
        : journal.slice(0, 50);
    res.json({ appels: liste });
  });
  return routeur;
}

module.exports = { creerRouteurSonnerie, creerRouteurAppels, creerEtatAppels, FENETRE_VUE_MS };
