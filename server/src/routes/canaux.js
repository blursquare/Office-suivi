// @ts-check
'use strict';
// Canaux de CLAIRE (0.328.0) : messages partagés par dossier, « général » et canaux libres ; non-lus, préférences de notification,
// favoris, silences. Tout collaborateur de la liste fermée peut lire et écrire (étude 24/10 : « ouvert à tous »). Comme le reste de CLAIRE
// (sans mot de passe), le collaborateur est déclaré par le poste : seul son propre message se modifie ou se supprime. Aucun envoi d'email.

const express = require('express');
const C = require('../canaux/canaux');
const X = require('../canaux/extensions');
const { noterReaction } = require('../reactionsAgent');
const { lirePropositions } = require('../routines/propositions');
const { CATALOGUE } = require('../routines/catalogue');
const { noterJournalRoutines } = require('../routines/journal');
const { COLLABORATEURS_ABSENCE } = require('../agendaOffice');

const COLLABORATEURS = COLLABORATEURS_ABSENCE.map((c) => c.nom);
const ADMINISTRATEURS = ['Bastien ANGLUMENT'];

/** @param {any} v */
function collaborateurDe(v) {
  const nom = String(v || '').trim();
  return COLLABORATEURS.find((c) => c.toLowerCase() === nom.toLowerCase()) || '';
}

/**
 * @param {any} parametresRepo @param {{ notifierMentions?: (canal: string, message: any) => Promise<any> }} [notifieur] @param {any} [depot] @param {any} [stockPiecesJointes]
 */
function creerRouteurCanaux(parametresRepo, notifieur, depot, stockPiecesJointes) {
  const routeur = express.Router();

  // Qui parle : le collaborateur déclaré par le poste (query ou corps). Sert à garder un canal privé à ses membres.
  /** @param {any} req */
  const demandeur = (req) => {
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    return collaborateurDe(req.query.utilisateur || req.query.auteur || b.utilisateur || b.auteur);
  };
  // Présence (étude 25/10) : « en ligne » = une requête de ce collaborateur il y a moins de 3 minutes ; gardée en mémoire seulement.
  /** @type {Record<string, number>} */
  const vusLe = {};
  /** @param {string} collab */
  const noterPresence = (collab) => { if (collab) vusLe[collab] = Date.now(); };

  /** Le canal de l'URL, s'il est valide et (pour un canal libre) connu. @param {any} req */
  const canalDe = (req) => {
    const id = String(req.params.id || '');
    if (!C.canalValide(id)) return '';
    if (id.startsWith('p:') && !X.accessible(id, demandeur(req), COLLABORATEURS)) return '';
    if (id.startsWith('l:') && !C.lireLibres(parametresRepo).some((c) => c.id === id)) return '';
    // Un canal de dossier n'existe que pour un dossier qui existe (sinon un identifiant inventé créerait un canal à chaque message).
    if (id.startsWith('d:') && !dossierExiste(id.slice(2))) return '';
    return id;
  };
  /** @param {string} dossierId */
  const dossierExiste = (dossierId) => {
    try { return !depot || !depot.trouverParId || !!depot.trouverParId(dossierId); } catch (e) { return false; }
  };
  // Ce qu'un lecteur voit d'une proposition citée par une carte : son état, son titre et son résumé (déjà dans le message) ; le détail
  // (le brouillon d'un email, par exemple) seulement pour son responsable et l'administrateur.
  /** @param {any} p @param {string} utilisateur */
  const carteVisible = (p, utilisateur) => (p.responsable === utilisateur || ADMINISTRATEURS.includes(utilisateur) ? p : Object.assign({}, p, { details: {} }));

  routeur.get('/canaux', (req, res) => {
    const utilisateur = collaborateurDe(req.query.utilisateur);
    if (!utilisateur) { res.status(400).json({ erreur: 'Collaborateur inconnu.' }); return; }
    noterPresence(utilisateur);
    const maintenant = Date.now();
    // Absent du jour : les journées d'absence de l'agenda de l'office (« JV absente »…), jamais deviné.
    const jour = new Date(maintenant).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
    /** @type {any[]} */
    let absences = [];
    try { absences = parametresRepo.lireAbsencesAgenda ? parametresRepo.lireAbsencesAgenda() : []; } catch (e) { absences = []; }
    const equipe = COLLABORATEURS.map((nom) => ({ nom, enLigne: nom === utilisateur || X.enLigne(vusLe[nom], maintenant), absent: !!X.absentLe(absences, nom, jour), statut: X.statutDe(parametresRepo, nom, maintenant) }));
    res.json(Object.assign({ collaborateurs: COLLABORATEURS, equipe, enregistres: X.lireEnregistres(parametresRepo, utilisateur).map((e) => `${e.canal}|${e.mid}`) },
      C.listerCanaux(parametresRepo, utilisateur, COLLABORATEURS)));
  });

  // Recherche dans tous les canaux lisibles (étude 25/10) : `q` = les mots, `auteur` = un prénom.
  routeur.get('/canaux/recherche', (req, res) => {
    const utilisateur = collaborateurDe(req.query.utilisateur);
    if (!utilisateur) { res.status(400).json({ erreur: 'Collaborateur inconnu.' }); return; }
    res.json({ resultats: X.rechercherMessages(parametresRepo, utilisateur, COLLABORATEURS, { q: String(req.query.q || '').slice(0, 200), auteur: String(req.query.auteur || '').slice(0, 40) }) });
  });

  // Messages enregistrés (« Enregistrés ») : liste, enregistrer, retirer.
  routeur.get('/canaux/enregistres', (req, res) => {
    const utilisateur = collaborateurDe(req.query.utilisateur);
    if (!utilisateur) { res.status(400).json({ erreur: 'Collaborateur inconnu.' }); return; }
    res.json({ messages: X.messagesEnregistres(parametresRepo, utilisateur, COLLABORATEURS) });
  });
  routeur.post('/canaux/enregistres', (req, res) => {
    const corps = req.body && typeof req.body === 'object' ? req.body : {};
    const utilisateur = collaborateurDe(corps.auteur);
    const canal = String(corps.canal || '');
    if (!utilisateur || !C.canalValide(canal) || !X.accessible(canal, utilisateur, COLLABORATEURS) || !String(corps.mid || '')) { res.status(400).json({ erreur: 'Demande incomplète.' }); return; }
    if (!C.lireMessages(parametresRepo, canal).some((m) => m.id === corps.mid)) { res.status(404).json({ erreur: 'Message introuvable.' }); return; }
    X.enregistrerMessage(parametresRepo, utilisateur, canal, String(corps.mid), corps.actif !== false);
    res.json({ ok: true, enregistres: X.lireEnregistres(parametresRepo, utilisateur).map((e) => `${e.canal}|${e.mid}`) });
  });

  // Mon statut (« Au tribunal jusqu'à 15 h »).
  routeur.put('/canaux/statut', (req, res) => {
    const corps = req.body && typeof req.body === 'object' ? req.body : {};
    const utilisateur = collaborateurDe(corps.auteur);
    if (!utilisateur) { res.status(400).json({ erreur: 'Collaborateur inconnu.' }); return; }
    res.json({ ok: true, statut: X.poserStatut(parametresRepo, utilisateur, { emoji: corps.emoji, texte: corps.texte, heures: corps.heures }) });
  });

  routeur.post('/canaux', (req, res) => {
    const corps = req.body && typeof req.body === 'object' ? req.body : {};
    const par = collaborateurDe(corps.auteur);
    if (!par) { res.status(400).json({ erreur: 'Collaborateur inconnu.' }); return; }
    const r = C.creerCanalLibre(parametresRepo, corps.nom, par);
    res.status(r.ok ? 200 : 400).json(r);
  });

  routeur.post('/canaux/tout-lu', (req, res) => {
    const utilisateur = collaborateurDe((req.body || {}).utilisateur);
    if (!utilisateur) { res.status(400).json({ erreur: 'Collaborateur inconnu.' }); return; }
    C.toutMarquerLu(parametresRepo, utilisateur);
    res.json({ ok: true });
  });

  // Les messages d'un canal. Avec `signature` (celle reçue au dernier appel), un canal inchangé répond `{ inchange: true }` sans rien
  // renvoyer : la relève d'un canal ouvert reste légère. Les propositions citées par des cartes sont jointes avec leur état du moment.
  routeur.get('/canaux/:id/messages', (req, res) => {
    const id = canalDe(req);
    if (!id) { res.status(404).json({ erreur: 'Canal inconnu.' }); return; }
    const messages = C.lireMessages(parametresRepo, id);
    const props = lirePropositions(parametresRepo);
    const lecteur = collaborateurDe(req.query.utilisateur);
    noterPresence(lecteur);
    const cartes = {};
    for (const m of messages) {
      if (!m.carte) continue;
      const p = props.find((x) => x.id === m.carte);
      if (p) cartes[m.carte] = carteVisible(p, lecteur);
    }
    const dernier = messages.length ? messages[messages.length - 1] : null;
    const signature = [messages.length, dernier ? dernier.id : '', messages.reduce((s, m) => s + (m.modifieLe || 0), 0), messages.filter((m) => m.epingle).map((m) => m.id).join(','), messages.map((m) => (m.reactions || []).map((r) => `${r.emoji}${r.par.join('+')}`).join('')).join(','),
      Object.values(cartes).map((p) => `${p.id}:${p.etat}`).join(',')].join('|');
    if (req.query.signature === signature) { res.json({ inchange: true, signature }); return; }
    res.json({ signature, messages, cartes, preferences: C.preferences(parametresRepo, collaborateurDe(req.query.utilisateur), id) });
  });

  routeur.post('/canaux/:id/messages', (req, res) => {
    const id = canalDe(req);
    if (!id) { res.status(404).json({ erreur: 'Canal inconnu.' }); return; }
    const corps = req.body && typeof req.body === 'object' ? req.body : {};
    const par = collaborateurDe(corps.auteur);
    if (!par) { res.status(400).json({ erreur: 'Collaborateur inconnu.' }); return; }
    const texte = typeof corps.texte === 'string' ? corps.texte.trim() : '';
    if (corps.claire !== true && texte.length > C.MAX_TEXTE_PERSONNE) { res.status(400).json({ erreur: `Message trop long (${C.MAX_TEXTE_PERSONNE} caractères au plus).` }); return; }
    const html = typeof corps.html === 'string' ? corps.html : '';
    if (!texte && !html) { res.status(400).json({ erreur: 'Message vide.' }); return; }
    // Une réponse de CLAIRE est écrite par le poste de celui qui l'a demandée (`via`) ; une personne écrit sous son nom.
    const claire = corps.claire === true;
    let mentions = claire ? [] : C.mentionsDansTexte(texte, COLLABORATEURS).collaborateurs;
    // Dans un canal privé, chaque message prévient les autres membres (comme un message direct de Slack).
    if (!claire && id.startsWith('p:')) mentions = [...new Set(mentions.concat((C.membresPrive(id, COLLABORATEURS) || []).filter((c) => c !== par)))];
    // Une réponse dans un fil : le message de départ doit exister dans ce canal, et ne pas être lui-même une réponse (un seul niveau, comme Slack).
    let parent = '';
    if (corps.parent) {
      const racine = C.lireMessages(parametresRepo, id).find((x) => x.id === corps.parent);
      if (!racine || racine.parent) { res.status(400).json({ erreur: 'Message de départ du fil introuvable.' }); return; }
      parent = racine.id;
    }
    const m = C.ajouterMessage(parametresRepo, id, {
      auteur: claire ? 'CLAIRE' : par, claire, via: claire ? par : '', texte, html: claire ? html : '', pj: claire ? [] : corps.pj, mentions, parent
    });
    if (!m) { res.status(400).json({ erreur: 'Message refusé.' }); return; }
    C.marquerLu(parametresRepo, par, id, m.quand);
    if (notifieur && notifieur.notifierMentions && mentions.length) notifieur.notifierMentions(id, m).catch(() => {});
    res.json({ ok: true, message: m });
  });

  routeur.patch('/canaux/:id/messages/:mid', (req, res) => {
    const id = canalDe(req);
    const corps = req.body && typeof req.body === 'object' ? req.body : {};
    const par = collaborateurDe(corps.auteur);
    if (!id || !par) { res.status(400).json({ erreur: 'Demande incomplète.' }); return; }
    const texteModifie = String(corps.texte || '');
    const action = corps.epingle !== undefined ? { epingle: corps.epingle === true } : { texte: texteModifie, mentions: C.mentionsDansTexte(texteModifie, COLLABORATEURS).collaborateurs };
    const m = C.changerMessage(parametresRepo, id, req.params.mid, par, action);
    if (!m) { res.status(403).json({ erreur: 'Message introuvable, vide, ou ce n’est pas le vôtre.' }); return; }
    res.json({ ok: true, message: m });
  });

  // Réaction (emoji) d'un collaborateur sur un message — n'importe quel message, comme dans Slack. Sur un message de CLAIRE, elle est aussi
  // gardée en mémoire (réactionsAgent) pour que CLAIRE la lise et s'en souvienne.
  routeur.post('/canaux/:id/messages/:mid/reaction', (req, res) => {
    const id = canalDe(req);
    const corps = req.body && typeof req.body === 'object' ? req.body : {};
    const par = collaborateurDe(corps.auteur);
    if (!id || !par) { res.status(400).json({ erreur: 'Demande incomplète.' }); return; }
    // `claire: true` : le poste de `auteur` réagit AU NOM DE CLAIRE (👀 « je regarde », ✅ « fait », ❓ « il me manque une information »).
    const parQui = corps.claire === true ? 'CLAIRE' : par;
    const r = C.reagirMessage(parametresRepo, id, req.params.mid, parQui, String(corps.emoji || ''), corps.actif === undefined ? undefined : corps.actif === true);
    if (!r) { res.status(400).json({ erreur: 'Message ou réaction inconnus.' }); return; }
    if (r.message.claire && parQui !== 'CLAIRE') {
      noterReaction(parametresRepo, { par, emoji: String(corps.emoji), canal: id, messageId: r.message.id, pose: r.pose,
        extrait: r.message.texte || String(r.message.html || '').replace(/<[^>]*>/g, ' '), dossierId: id.startsWith('d:') ? id.slice(2) : '' });
    }
    res.json({ ok: true, message: r.message, sens: r.sens });
  });

  routeur.delete('/canaux/:id/messages/:mid', (req, res) => {
    const id = canalDe(req);
    const par = collaborateurDe(req.query.auteur);
    if (!id || !par) { res.status(400).json({ erreur: 'Demande incomplète.' }); return; }
    const m = C.changerMessage(parametresRepo, id, req.params.mid, par, { supprimer: true });
    if (!m) { res.status(403).json({ erreur: 'Message introuvable, ou ce n’est pas le vôtre.' }); return; }
    // Un message supprimé emporte ses fichiers gardés sur le serveur.
    if (stockPiecesJointes) for (const p of (m.pj || [])) if (p.fichierId) stockPiecesJointes.supprimer(p.fichierId).catch(() => {});
    res.json({ ok: true });
  });

  routeur.post('/canaux/:id/lu', (req, res) => {
    const id = canalDe(req);
    const utilisateur = collaborateurDe((req.body || {}).utilisateur);
    if (!id || !utilisateur) { res.status(400).json({ erreur: 'Demande incomplète.' }); return; }
    C.marquerLu(parametresRepo, utilisateur, id);
    res.json({ ok: true });
  });

  routeur.put('/canaux/:id/preferences', (req, res) => {
    const id = canalDe(req);
    const corps = req.body && typeof req.body === 'object' ? req.body : {};
    const utilisateur = collaborateurDe(corps.utilisateur);
    if (!id || !utilisateur) { res.status(400).json({ erreur: 'Demande incomplète.' }); return; }
    res.json({ ok: true, preferences: C.reglerPreferences(parametresRepo, utilisateur, id, { notif: corps.notif, favori: corps.favori }) });
  });

  // « Jamais pour ce dossier » : CLAIRE ne dépose plus de proposition (de cette routine, ou de toutes) sur ce dossier.
  routeur.get('/canaux/silences/:dossierId', (req, res) => {
    res.json({ silences: C.lireSilences(parametresRepo).filter((s) => s.dossierId === req.params.dossierId) });
  });
  routeur.post('/canaux/silences/:dossierId', (req, res) => {
    const corps = req.body && typeof req.body === 'object' ? req.body : {};
    const par = collaborateurDe(corps.auteur);
    if (!par) { res.status(400).json({ erreur: 'Collaborateur inconnu.' }); return; }
    const routine = String(corps.routine || '');
    if (!dossierExiste(req.params.dossierId)) { res.status(404).json({ erreur: 'Dossier inconnu.' }); return; }
    if (routine && !CATALOGUE.some((r) => r.id === routine)) { res.status(400).json({ erreur: 'Routine inconnue.' }); return; }
    if (corps.lever === true) C.leverSilence(parametresRepo, req.params.dossierId, routine);
    else C.silencer(parametresRepo, req.params.dossierId, routine, par);
    // Écrit au journal « Ce que CLAIRE a fait seule » : qui a coupé quoi (jamais un nom de dossier).
    const nom = routine ? ((CATALOGUE.find((r) => r.id === routine) || {}).nom || routine) : 'toutes les routines';
    noterJournalRoutines(parametresRepo, { routine: 'silence', texte: `${corps.lever === true ? 'Rétabli' : 'Coupé'} sur un dossier (${nom}) par ${C.prenomDe(par)}.`, niveau: 1 });
    res.json({ ok: true, silences: C.lireSilences(parametresRepo).filter((s) => s.dossierId === req.params.dossierId) });
  });

  return routeur;
}

module.exports = { creerRouteurCanaux, collaborateurDe };
