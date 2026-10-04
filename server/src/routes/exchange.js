// Connexion à l'agenda Outlook de l'office par EWS/NTLM (voir server/src/exchange/ews.js).
// Microsoft Graph n'atteint pas ces boîtes (hébergées chez Fichorga / Authentic Connect, hors de
// Microsoft 365), d'où ce chemin — la même porte qu'Outlook.
//
// Trois usages :
//   - GET/PUT /exchange/reglages : l'étude enregistre l'URL EWS, son adresse et son mot de passe de
//     messagerie, plus un interrupteur d'activation. Le mot de passe ne ressort JAMAIS de la base
//     (reglagesExchangePublics le remplace par un booléen) — même discipline que le mot de passe
//     SMTP et les clés API.
//   - POST /exchange/test : vérifie que les identifiants passent (lecture seule de l'agenda).
//   - POST /exchange/rendez-vous : crée un rendez-vous de signature dans l'agenda.
//
// RÈGLE reprise de ews.js et à ne pas assouplir : un seul essai par appel, aucun réessai automatique
// (plusieurs échecs verrouillent le compte de messagerie). Le mot de passe n'est jamais renvoyé au
// navigateur ni recopié dans un message d'erreur.
'use strict';

const express = require('express');
const {
  testerConnexionExchange, creerRendezVousExchange,
  fenetreJourneeParis, trouverRendezVousExchange, mettreAJourLieuExchange,
  creerEcheanceExchange, mettreAJourEcheanceExchange, supprimerEcheanceExchange,
  horaireDeplace, deplacerRendezVousExchange, horaireModifie, modifierRendezVousExchange, lireNotesExchange, mettreAJourNotesExchange, TAILLE_MAX_NOTES
} = require('../exchange/ews');
const { extraireReferenceVte, dossierPourReferenceAgenda, composerLieuAgenda } = require('../agendaOffice');
const { URL_EWS_DEFAUT } = require('../parametresRepo');
const { noterVerification } = require('../verificationsTerrain');

// Le rendez-vous d'un dossier parmi ceux d'une journée. Pure, testable. L'identifiant mémorisé
// quand CLAIRE a créé l'événement l'emporte ; sinon le titre « VTE - … » doit correspondre au nom du
// dossier (mêmes tolérances que la lecture de l’agenda), et un seul événement doit correspondre —
// jamais deviner entre deux.
function choisirRendezVousDossier(evenements, reference, itemId) {
  const liste = Array.isArray(evenements) ? evenements : [];
  if (itemId) {
    const exact = liste.find((e) => e.itemId === itemId);
    if (exact) return { evt: exact };
  }
  const candidats = liste.filter((evt) => {
    const ref = extraireReferenceVte(evt.subject);
    return ref && dossierPourReferenceAgenda(ref, [{ id: 'x', nom: reference }]);
  });
  if (candidats.length === 1) return { evt: candidats[0] };
  return candidats.length ? { plusieurs: true } : { aucun: true };
}

// Nom de catégorie Outlook : texte court, sans caractère de contrôle.
function categorieValide(c) {
  const t = String(c || '').replace(/[\u0000-\u001f]/g, '').trim();
  return t.slice(0, 100);
}

// « HH:MM » + durée en minutes → « HH:MM » de fin (bornée à 23:59 : un rendez-vous ne déborde pas
// sur le lendemain dans la page Agenda). Pure.
function heureFinDepuisDuree(heure, dureeMinutes) {
  const [h, m] = String(heure).split(':').map(Number);
  const total = Math.min(23 * 60 + 59, h * 60 + m + (Number(dureeMinutes) || 60));
  return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
}

function reglagesExchangePublics(reglages) {
  const { motDePasse, ...reste } = reglages;
  return { ...reste, motDePasseEnregistre: !!motDePasse };
}

// `injections.poster` : faux transport EWS pour les tests (notes et modification d'un rendez-vous).
// Suppression avec suivi du repli « SoftDelete » (vérifications sur le terrain, verificationsTerrain.js).
async function supprimerAvecSuiviRepli(parametresRepo, args) {
  const r = await supprimerEcheanceExchange(args);
  if (r && r.repli === 'SoftDelete') noterVerification(parametresRepo, 'agenda-soft-delete', r.ok ? {} : { ok: false, message: r.message });
  return r;
}

function creerRouteurExchange(parametresRepo, injections = {}) {
  const routeur = express.Router();

  routeur.get('/exchange/reglages', (req, res) => {
    res.json(reglagesExchangePublics(parametresRepo.lireReglagesExchange()));
  });

  routeur.put('/exchange/reglages', (req, res) => {
    res.json(reglagesExchangePublics(parametresRepo.ecrireReglagesExchange(req.body || {})));
  });

  // Test de connexion (lecture seule). Utilise les identifiants du formulaire s'ils sont fournis,
  // sinon ceux déjà enregistrés — ce qui permet de retester une configuration stockée sans avoir à
  // retaper le mot de passe.
  routeur.post('/exchange/test', async (req, res) => {
    const corps = req.body || {};
    const stockes = parametresRepo.lireReglagesExchange();
    const email = String(corps.email || '').trim() || stockes.email;
    const motDePasse = corps.motDePasse ? String(corps.motDePasse) : stockes.motDePasse;
    const url = String(corps.url || '').trim() || stockes.url || URL_EWS_DEFAUT;
    if (!/^https:\/\//i.test(url)) {
      return res.status(400).json({ ok: false, message: "L'adresse du serveur doit commencer par https://." });
    }
    if (!email || !motDePasse) {
      return res.status(400).json({ ok: false, message: 'Email et mot de passe requis (à saisir, ou à enregistrer d\'abord).' });
    }
    // testerConnexionExchange ne rejette jamais : il résout toujours {ok, message}.
    const resultat = await testerConnexionExchange({ url, email, motDePasse });
    // On ne renvoie que ok + message : jamais l'email ni le mot de passe.
    res.json({ ok: !!resultat.ok, message: resultat.message });
  });

  // Crée un rendez-vous dans l'agenda, à partir des identifiants ENREGISTRÉS (jamais d'un mot de
  // passe transitant dans cette requête). Le client fournit l'objet, la date, l'heure, la durée, le
  // lieu et un corps de note.
  routeur.post('/exchange/rendez-vous', async (req, res) => {
    const reglages = parametresRepo.lireReglagesExchange();
    if (!reglages.actif) {
      return res.status(400).json({ ok: false, message: "La connexion à l'agenda n'est pas activée dans les Réglages." });
    }
    if (!reglages.email || !reglages.motDePasse) {
      return res.status(400).json({ ok: false, message: "Identifiants de messagerie manquants dans les Réglages." });
    }
    const b = req.body || {};
    const dateStr = String(b.date || '').trim();
    const heureStr = String(b.heure || '').trim();
    const sujet = String(b.sujet || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res.status(400).json({ ok: false, message: 'Date du rendez-vous invalide.' });
    }
    if (!/^\d{2}:\d{2}$/.test(heureStr)) {
      return res.status(400).json({ ok: false, message: 'Heure du rendez-vous invalide.' });
    }
    if (!sujet) {
      return res.status(400).json({ ok: false, message: 'Objet du rendez-vous manquant.' });
    }
    const dureeBrute = Number.parseInt(b.dureeMinutes, 10);
    const dureeMinutes = Number.isInteger(dureeBrute) && dureeBrute > 0 ? Math.min(600, dureeBrute) : 60;
    const resultat = await creerRendezVousExchange({
      url: reglages.url,
      email: reglages.email,
      motDePasse: reglages.motDePasse,
      rendezVous: {
        sujet,
        dateStr,
        heureStr,
        dureeMinutes,
        lieu: String(b.lieu || '').trim(),
        corps: String(b.corps || '').trim().slice(0, 8000),
        categorie: categorieValide(b.categorie),
        // Créer le rendez-vous dans le calendrier PARTAGÉ (celui de Sophie) quand il est configuré,
        // sinon dans le calendrier du compte de connexion. Voir ews.js/folderCalendrierXml.
        mailbox: reglages.calendrierPartage
      }
    }, injections);
    // Visible tout de suite dans la page Agenda de tous les postes, sans attendre le tour de lecture.
    if (resultat.ok && typeof parametresRepo.ajouterEvenementAgendaOffice === 'function') {
      parametresRepo.ajouterEvenementAgendaOffice({
        itemId: resultat.itemId || '', changeKey: resultat.changeKey || '', sujet, lieu: String(b.lieu || '').trim(),
        date: dateStr, heure: heureStr, heureFin: heureFinDepuisDuree(heureStr, dureeMinutes),
        categories: categorieValide(b.categorie) ? [categorieValide(b.categorie)] : [],
        signature: b.signature === true, dossierId: b.dossierId || null, dossierNom: b.dossierNom || null, creeDansClaire: true
      });
    }
    // L'identifiant de l'événement : le client le garde pour pouvoir le retirer ou le déplacer.
    res.json({ ok: !!resultat.ok, message: resultat.message, raison: resultat.raison || '',
      itemId: resultat.itemId || '', changeKey: resultat.changeKey || '' });
  });

  // Retire de l'agenda le rendez-vous de signature d'un dossier, quand l'étude le supprime dans
  // CLAIRE (demandé par l'étude). MoveToDeletedItems : il se récupère dans les éléments supprimés.
  // L'événement est désigné par l'identifiant mémorisé si CLAIRE l'a créé, sinon retrouvé à sa date
  // par la référence « VTE - … » — et un seul doit correspondre, sinon rien n'est retiré.
  routeur.post('/exchange/rendez-vous/supprimer', async (req, res) => {
    const reglages = parametresRepo.lireReglagesExchange();
    if (!reglages.actif) {
      return res.status(400).json({ ok: false, message: "La connexion à l'agenda n'est pas activée dans les Réglages." });
    }
    if (!reglages.email || !reglages.motDePasse) {
      return res.status(400).json({ ok: false, message: 'Identifiants de messagerie manquants dans les Réglages.' });
    }
    const b = req.body || {};
    const date = String(b.date || '').trim();
    const reference = String(b.reference || '').trim();
    const itemId = String(b.itemId || '').trim();
    const changeKey = String(b.changeKey || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ ok: false, message: 'Date du rendez-vous invalide.' });
    }
    if (!reference && !itemId) {
      return res.status(400).json({ ok: false, message: 'Nom du dossier manquant.' });
    }
    const acces = { url: reglages.url, email: reglages.email, motDePasse: reglages.motDePasse };
    const { debutUtc, finUtc } = fenetreJourneeParis(date);
    const trouve = await trouverRendezVousExchange({ ...acces, debutUtc, finUtc, mailbox: reglages.calendrierPartage });
    if (!trouve.ok) return res.json({ ok: false, message: trouve.message, raison: trouve.raison || '' });
    const choix = choisirRendezVousDossier(trouve.evenements, reference, itemId);
    if (choix.aucun) {
      return res.json({ ok: true, introuvable: true, message: "Aucun rendez-vous de ce dossier dans l'agenda à cette date : rien à retirer." });
    }
    if (choix.plusieurs) {
      return res.json({ ok: false, message: 'Plusieurs rendez-vous correspondent à cette date : aucun retiré, faites-le à la main dans Outlook.' });
    }
    const r = await supprimerAvecSuiviRepli(parametresRepo, { ...acces, itemId: choix.evt.itemId, changeKey: choix.evt.changeKey || changeKey });
    if (r.ok && typeof parametresRepo.retirerEvenementAgendaOffice === 'function') parametresRepo.retirerEvenementAgendaOffice(choix.evt.itemId);
    res.json({ ok: !!r.ok, message: r.ok ? "Rendez-vous retiré de l'agenda de l'office." : r.message, raison: r.raison || '' });
  });

  // Supprime N'IMPORTE QUEL rendez-vous de l'agenda de l'office depuis la page Agenda (demandé par
  // l'étude le 30/09, après confirmation côté client). Désigné par son identifiant Exchange, tel que
  // lu par le tour de lecture. MoveToDeletedItems : il se récupère dans les éléments supprimés
  // d'Outlook. Un seul essai.
  routeur.post('/exchange/evenement/supprimer', async (req, res) => {
    const reglages = parametresRepo.lireReglagesExchange();
    if (!reglages.actif) {
      return res.status(400).json({ ok: false, message: "La connexion à l'agenda n'est pas activée dans les Réglages." });
    }
    if (!reglages.email || !reglages.motDePasse) {
      return res.status(400).json({ ok: false, message: 'Identifiants de messagerie manquants dans les Réglages.' });
    }
    const b = req.body || {};
    const itemId = String(b.itemId || '').trim();
    if (!itemId) return res.status(400).json({ ok: false, message: 'Rendez-vous non désigné.' });
    const r = await supprimerAvecSuiviRepli(parametresRepo, {
      url: reglages.url, email: reglages.email, motDePasse: reglages.motDePasse, itemId, changeKey: String(b.changeKey || '').trim()
    });
    if (r.ok && typeof parametresRepo.retirerEvenementAgendaOffice === 'function') parametresRepo.retirerEvenementAgendaOffice(itemId);
    res.json({ ok: !!r.ok, message: r.ok ? "Rendez-vous supprimé de l'agenda de l'office." : r.message, raison: r.raison || '' });
  });

  // Notes d'un rendez-vous = son corps dans Outlook (étude, 30/09). Lues à l'ouverture du rendez-vous
  // dans la page Agenda (GetItem, un seul essai), écrites sur demande (UpdateItem du seul corps).
  // Jamais journalisées : elles peuvent parler du client.
  const reglagesPrets = (res) => {
    const reglages = parametresRepo.lireReglagesExchange();
    if (!reglages.actif) {
      res.status(400).json({ ok: false, message: "La connexion à l'agenda n'est pas activée dans les Réglages." });
      return null;
    }
    if (!reglages.email || !reglages.motDePasse) {
      res.status(400).json({ ok: false, message: 'Identifiants de messagerie manquants dans les Réglages.' });
      return null;
    }
    return reglages;
  };
  const identifiantValide = (v) => typeof v === 'string' && v.trim().length > 0 && v.length <= 1000;

  routeur.get('/exchange/evenement/notes', async (req, res) => {
    const itemId = String((req.query || {}).itemId || '');
    if (!identifiantValide(itemId)) return res.status(400).json({ ok: false, message: 'Rendez-vous non désigné.' });
    const reglages = reglagesPrets(res);
    if (!reglages) return;
    const r = await lireNotesExchange({ url: reglages.url, email: reglages.email, motDePasse: reglages.motDePasse, itemId: itemId.trim() }, injections);
    if (!r.ok) return res.json({ ok: false, message: r.message, raison: r.raison || '', introuvable: !!r.introuvable });
    res.json({ ok: true, notes: r.notes || '', itemId: r.itemId || itemId.trim(), changeKey: r.changeKey || '' });
  });

  routeur.put('/exchange/evenement/notes', async (req, res) => {
    const b = req.body || {};
    const itemId = String(b.itemId || '');
    if (!identifiantValide(itemId)) return res.status(400).json({ ok: false, message: 'Rendez-vous non désigné.' });
    if (typeof b.notes !== 'string') return res.status(400).json({ ok: false, message: 'Notes manquantes.' });
    if (b.notes.length > TAILLE_MAX_NOTES) {
      return res.status(400).json({ ok: false, message: `Notes trop longues (${TAILLE_MAX_NOTES} caractères au plus).` });
    }
    const reglages = reglagesPrets(res);
    if (!reglages) return;
    const r = await mettreAJourNotesExchange({
      url: reglages.url, email: reglages.email, motDePasse: reglages.motDePasse,
      itemId: itemId.trim(), changeKey: String(b.changeKey || '').trim(), notes: b.notes
    }, injections);
    // Le ChangeKey change à chaque écriture : l'événement gardé pour la page Agenda suit.
    if (r.ok && r.changeKey && typeof parametresRepo.lireAgendaOffice === 'function') {
      const stocke = ((parametresRepo.lireAgendaOffice() || {}).evenements || []).find((e) => e.itemId === itemId.trim());
      if (stocke) {
        parametresRepo.retirerEvenementAgendaOffice(stocke.itemId);
        parametresRepo.ajouterEvenementAgendaOffice({ ...stocke, itemId: r.itemId || stocke.itemId, changeKey: r.changeKey });
      }
    }
    res.json({ ok: !!r.ok, message: r.message, raison: r.raison || '', introuvable: !!r.introuvable,
      itemId: r.itemId || itemId.trim(), changeKey: r.changeKey || '' });
  });

  // Modifie N'IMPORTE QUEL rendez-vous depuis la page Agenda (étude, 01/10) : titre, date, heures —
  // formulaire « Modifier » ou glisser-déposer (confirmé côté client). Un seul essai. L'événement
  // gardé pour la page Agenda suit jusqu'au prochain tour de lecture.
  routeur.post('/exchange/evenement/modifier', async (req, res) => {
    const b = req.body || {};
    const itemId = String(b.itemId || '');
    if (!identifiantValide(itemId)) return res.status(400).json({ ok: false, message: 'Rendez-vous non désigné.' });
    let sujet;
    if (b.sujet !== undefined) {
      sujet = String(b.sujet || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200);
      if (!sujet) return res.status(400).json({ ok: false, message: 'Le titre ne peut pas être vide.' });
    }
    let categories;
    if (b.categories !== undefined) {
      if (!Array.isArray(b.categories) || b.categories.length > 5) return res.status(400).json({ ok: false, message: 'Catégories invalides.' });
      categories = [...new Set(b.categories.map(categorieValide).filter(Boolean))];
    }
    const journeeEntiere = b.journeeEntiere === true;
    const horaire = horaireModifie({ date: b.date, heure: b.heure, heureFin: b.heureFin, dateFin: b.dateFin, journeeEntiere });
    if (!horaire) return res.status(400).json({ ok: false, message: 'Date ou heures invalides : la fin doit suivre le début.' });
    const reglages = reglagesPrets(res);
    if (!reglages) return;
    const r = await modifierRendezVousExchange({
      url: reglages.url, email: reglages.email, motDePasse: reglages.motDePasse,
      itemId: itemId.trim(), changeKey: String(b.changeKey || '').trim(), sujet, debut: horaire.debut, fin: horaire.fin, categories
    }, injections);
    if (r.ok && typeof parametresRepo.lireAgendaOffice === 'function') {
      const stocke = ((parametresRepo.lireAgendaOffice() || {}).evenements || []).find((e) => e.itemId === itemId.trim());
      if (stocke) {
        parametresRepo.retirerEvenementAgendaOffice(stocke.itemId);
        parametresRepo.ajouterEvenementAgendaOffice({
          ...stocke, itemId: r.itemId || stocke.itemId, changeKey: r.changeKey || '',
          sujet: sujet !== undefined ? sujet : stocke.sujet,
          date: b.date, dateFin: journeeEntiere ? (b.dateFin || b.date) : b.date,
          heure: journeeEntiere ? null : b.heure, heureFin: journeeEntiere ? null : b.heureFin, journeeEntiere,
          ...(categories ? { categories } : {})
        });
      }
    }
    res.json({ ok: !!r.ok, message: r.message, raison: r.raison || '', introuvable: !!r.introuvable,
      itemId: r.itemId || itemId.trim(), changeKey: r.changeKey || '' });
  });

  // Déplace le rendez-vous de signature quand l'étude change sa date dans CLAIRE : même heure, même
  // durée, même lieu et même couleur, seul le jour change. Même rapprochement que le retrait ;
  // `introuvable` dit au client qu'il n'y avait rien à déplacer (il propose alors de le créer).
  routeur.post('/exchange/rendez-vous/deplacer', async (req, res) => {
    const reglages = parametresRepo.lireReglagesExchange();
    if (!reglages.actif) {
      return res.status(400).json({ ok: false, message: "La connexion à l'agenda n'est pas activée dans les Réglages." });
    }
    if (!reglages.email || !reglages.motDePasse) {
      return res.status(400).json({ ok: false, message: 'Identifiants de messagerie manquants dans les Réglages.' });
    }
    const b = req.body || {};
    const ancienneDate = String(b.ancienneDate || '').trim();
    const nouvelleDate = String(b.nouvelleDate || '').trim();
    const reference = String(b.reference || '').trim();
    const itemId = String(b.itemId || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ancienneDate) || !/^\d{4}-\d{2}-\d{2}$/.test(nouvelleDate)) {
      return res.status(400).json({ ok: false, message: 'Date du rendez-vous invalide.' });
    }
    if (!reference && !itemId) {
      return res.status(400).json({ ok: false, message: 'Nom du dossier manquant.' });
    }
    const acces = { url: reglages.url, email: reglages.email, motDePasse: reglages.motDePasse };
    const { debutUtc, finUtc } = fenetreJourneeParis(ancienneDate);
    const trouve = await trouverRendezVousExchange({ ...acces, debutUtc, finUtc, mailbox: reglages.calendrierPartage });
    if (!trouve.ok) return res.json({ ok: false, message: trouve.message, raison: trouve.raison || '' });
    const choix = choisirRendezVousDossier(trouve.evenements, reference, itemId);
    if (choix.aucun) {
      return res.json({ ok: true, introuvable: true, message: "Aucun rendez-vous de ce dossier dans l'agenda à l'ancienne date." });
    }
    if (choix.plusieurs) {
      return res.json({ ok: false, message: "Plusieurs rendez-vous correspondent à l'ancienne date : aucun déplacé, faites-le à la main dans Outlook." });
    }
    const horaire = horaireDeplace(choix.evt, nouvelleDate);
    const r = await deplacerRendezVousExchange({
      ...acces, itemId: choix.evt.itemId, changeKey: choix.evt.changeKey, debut: horaire.debut, fin: horaire.fin
    });
    // Page Agenda : l'événement gardé en base suit le déplacement jusqu'au prochain tour de lecture.
    if (r.ok && typeof parametresRepo.lireAgendaOffice === 'function') {
      const stocke = ((parametresRepo.lireAgendaOffice() || {}).evenements || []).find((e) => e.itemId === choix.evt.itemId);
      if (stocke) {
        parametresRepo.retirerEvenementAgendaOffice(choix.evt.itemId);
        parametresRepo.ajouterEvenementAgendaOffice({ ...stocke, itemId: r.itemId || stocke.itemId, changeKey: r.changeKey || '', date: nouvelleDate, dateFin: nouvelleDate });
      }
    }
    res.json({
      ok: !!r.ok, message: r.message, raison: r.raison || '', heure: r.ok ? horaire.heure : '',
      itemId: r.itemId || choix.evt.itemId, changeKey: r.changeKey || ''
    });
  });

  // Note dans le LIEU d'un rendez-vous EXISTANT de l'agenda qu'un envoi vient d'être fait
  // (« Appel de fonds envoyé », « Appel de fonds et projet envoyé ») — demandé par l'étude : quand
  // elle marque l'appel de fonds fait dans CLAIRE, la mention doit apparaître dans l'agenda partagé,
  // à côté des initiales du collaborateur. Deux temps : FindItem sur la journée du rendez-vous, puis
  // UpdateItem sur le seul champ Location de l'événement rapproché. Le rapprochement se fait par la
  // référence « VTE - … » du titre, avec les fonctions déjà éprouvées d'agendaOffice.js (mêmes
  // tolérances que la lecture de l’agenda). Aucun rendez-vous n'est CRÉÉ ici : on ne modifie qu'un
  // événement déjà présent, et on ne touche jamais à autre chose que son lieu.
  routeur.post('/exchange/rendez-vous/lieu', async (req, res) => {
    const reglages = parametresRepo.lireReglagesExchange();
    if (!reglages.actif) {
      return res.status(400).json({ ok: false, message: "La connexion à l'agenda n'est pas activée dans les Réglages." });
    }
    if (!reglages.email || !reglages.motDePasse) {
      return res.status(400).json({ ok: false, message: "Identifiants de messagerie manquants dans les Réglages." });
    }
    const b = req.body || {};
    const date = String(b.date || '').trim();
    const reference = String(b.reference || '').trim();
    const etat = { appelFonds: !!b.appelFonds, projet: !!b.projet, confrere: typeof b.confrere === 'string' ? b.confrere : '', initiales: typeof b.initiales === 'string' ? b.initiales : '' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ ok: false, message: 'Date du rendez-vous invalide.' });
    }
    if (!reference) {
      return res.status(400).json({ ok: false, message: 'Nom du dossier manquant.' });
    }
    if (!etat.appelFonds && !etat.projet) {
      return res.status(400).json({ ok: false, message: "Rien à noter dans l'agenda." });
    }
    const { debutUtc, finUtc } = fenetreJourneeParis(date);
    // Chercher dans le calendrier PARTAGÉ (celui de Sophie) s'il est configuré. L'ItemId renvoyé
    // par FindItem porte déjà le contexte de cette boîte : l'UpdateItem qui suit n'a pas besoin de
    // re-cibler le dossier, il opère sur cet ItemId.
    const trouve = await trouverRendezVousExchange({
      url: reglages.url, email: reglages.email, motDePasse: reglages.motDePasse,
      debutUtc, finUtc, mailbox: reglages.calendrierPartage
    });
    if (!trouve.ok) {
      return res.json({ ok: false, message: trouve.message });
    }
    // Rapprochement par la référence « VTE - … » : on ne garde que les rendez-vous du bon dossier.
    // dossierPourReferenceAgenda renvoie le dossier si un nom significatif est commun (avec ses
    // tolérances) — appelé avec une liste d'un seul dossier, il sert ici de simple test de
    // correspondance.
    const candidats = (trouve.evenements || []).filter((evt) => {
      const ref = extraireReferenceVte(evt.subject);
      return ref && dossierPourReferenceAgenda(ref, [{ id: 'x', nom: reference }]);
    });
    if (candidats.length === 0) {
      return res.json({ ok: false, message: "Aucun rendez-vous de ce dossier trouvé dans l'agenda à cette date — notez-le à la main dans Outlook." });
    }
    if (candidats.length > 1) {
      // Ne jamais deviner : deux rendez-vous du même dossier le même jour, aucun modifié.
      return res.json({ ok: false, message: 'Plusieurs rendez-vous correspondent à cette date : aucun modifié, notez-le à la main dans Outlook.' });
    }
    const evt = candidats[0];
    const nouveauLieu = composerLieuAgenda(evt.location, etat);
    if (nouveauLieu === (evt.location || '')) {
      return res.json({ ok: true, message: 'Le rendez-vous portait déjà cette mention dans l\'agenda.' });
    }
    const maj = await mettreAJourLieuExchange({
      url: reglages.url, email: reglages.email, motDePasse: reglages.motDePasse,
      itemId: evt.itemId, changeKey: evt.changeKey, lieu: nouveauLieu
    });
    res.json({ ok: !!maj.ok, message: maj.ok ? ('Agenda mis à jour : « ' + nouveauLieu + ' ».') : maj.message });
  });

  // Dates butoir (obtention du prêt, vente préalable) tenues dans le calendrier partagé — voir
  // ews.js. Trois actions : créer (renvoie l'identifiant de l'événement, que le client garde sur le
  // dossier), déplacer (même événement, nouvelle date) et retirer. C'est le CLIENT qui décide de
  // l'action d'après l'état du dossier (voir synchroniserEcheanceAgenda dans script.js) : ce serveur
  // ne crée jamais un événement de lui-même, et n'agit que sur l'identifiant qu'on lui présente.
  routeur.post('/exchange/echeance', async (req, res) => {
    const reglages = parametresRepo.lireReglagesExchange();
    if (!reglages.actif) {
      return res.status(400).json({ ok: false, message: "La connexion à l'agenda n'est pas activée dans les Réglages." });
    }
    if (!reglages.email || !reglages.motDePasse) {
      return res.status(400).json({ ok: false, message: 'Identifiants de messagerie manquants dans les Réglages.' });
    }
    const b = req.body || {};
    const action = String(b.action || '');
    const date = String(b.date || '').trim();
    const itemId = String(b.itemId || '').trim();
    const changeKey = String(b.changeKey || '').trim();
    const acces = { url: reglages.url, email: reglages.email, motDePasse: reglages.motDePasse };
    const dateValide = /^\d{4}-\d{2}-\d{2}$/.test(date);

    if (action === 'creer') {
      const sujet = String(b.sujet || '').trim().slice(0, 250);
      if (!dateValide) return res.status(400).json({ ok: false, message: 'Date invalide.' });
      if (!sujet) return res.status(400).json({ ok: false, message: "Objet de l'événement manquant." });
      const r = await creerEcheanceExchange({
        ...acces,
        echeance: { sujet, dateStr: date, corps: String(b.corps || '').slice(0, 2000), mailbox: reglages.calendrierPartage }
      });
      return res.json({ ok: !!r.ok, message: r.message, raison: r.raison || '', itemId: r.itemId || '', changeKey: r.changeKey || '' });
    }
    if (action === 'modifier') {
      if (!dateValide) return res.status(400).json({ ok: false, message: 'Date invalide.' });
      if (!itemId || !changeKey) return res.status(400).json({ ok: false, message: "Identifiant de l'événement manquant." });
      const r = await mettreAJourEcheanceExchange({ ...acces, itemId, changeKey, dateStr: date });
      // Un UpdateItem renvoie un NOUVEAU ChangeKey : c'est lui que le client doit garder.
      return res.json({
        ok: !!r.ok, message: r.message, raison: r.raison || '', introuvable: !!r.introuvable,
        itemId: r.itemId || itemId, changeKey: r.changeKey || changeKey
      });
    }
    if (action === 'supprimer') {
      if (!itemId) return res.status(400).json({ ok: false, message: "Identifiant de l'événement manquant." });
      const r = await supprimerAvecSuiviRepli(parametresRepo, { ...acces, itemId, changeKey });
      return res.json({ ok: !!r.ok, message: r.message, raison: r.raison || '' });
    }
    return res.status(400).json({ ok: false, message: 'Action inconnue.' });
  });

  return routeur;
}

module.exports = { heureFinDepuisDuree, creerRouteurExchange, reglagesExchangePublics, choisirRendezVousDossier, URL_EWS_DEFAUT };
