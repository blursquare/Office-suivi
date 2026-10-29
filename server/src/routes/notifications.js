'use strict';

// Notifie par email le responsable d'un dossier qu'une ou plusieurs pièces viennent d'être
// trouvées sur le NAS — voir script.js, verifierDossierLocal()/notifierNouvellesPiecesTrouvees(),
// qui calcule le diff (avant/après un parcours) et appelle cette route UNE SEULE FOIS par dossier
// concerné, avec la liste complète des pièces nouvellement reçues lors de ce parcours : c'est ce
// qui garantit qu'un seul message est envoyé même si plusieurs pièces ont été trouvées en même
// temps (demandé explicitement par l'étude — "grouper les notifications").
//
// Réutilise telle quelle l'infrastructure déjà en place pour les rappels d'échéance (voir
// jobs/rappels.js) : même client (envoyerEmail), mêmes réglages (parametresRepo), et la même
// copie systématique à l'étude (reglages.copieEmail) — un seul mécanisme d'envoi dans tout le
// projet, pas un second à côté.

const express = require('express');
const { envoyerEmail, envoiConfigure, memeAdresseEmail } = require('../envoiEmail');
const { mettreCopiesEnAttente } = require('../nettoyageGmail');
const { urlLienPiece, baseDepuisRequete } = require('../liensPieces');
const { adressesLan } = require('../reseau');
const { formaterMontantEuros } = require('../../../commun/montants');
const CANAUX = require('../canaux/canaux');
const { COLLABORATEURS_ABSENCE } = require('../agendaOffice');

// Factures des successions (étude 15/10 : « simplifier la comptabilité pour Sophie et lui permettre de suivre s'il y a des factures en
// attente de règlement ») : chaque facture rangée par Claire Scan dans « Factures à régler » est annoncée sur Teams à Sophie GOSSART
// (adresse réglée avec celles des collaborateurs), avec le dossier, l'organisme et le montant. Pures.
const DESTINATAIRE_FACTURES_SUCCESSION = 'Sophie GOSSART';
function texteFactureSuccession(dossierNom, organisme, montant, url) {
  const m = Number.isFinite(montant) && montant > 0 ? formaterMontantEuros(montant) : 'montant non lu';
  return `🧾 CLAIRE — Facture à régler · ${dossierNom} : ${organisme || 'organisme non lu'} — ${m}.${url ? `\n${url}` : ''}`;
}
function htmlFactureSuccession(dossierNom, organisme, montant, url) {
  const m = Number.isFinite(montant) && montant > 0 ? formaterMontantEuros(montant) : 'montant non lu';
  const e = (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `🧾 CLAIRE — Facture à régler sur la succession <b>${e(dossierNom)}</b> :<br>• Organisme : ${e(organisme || 'non lu')}<br>• Montant : <b>${e(m)}</b>${url ? `<br>• <a href="${e(url)}">Ouvrir la facture</a>` : ''}`;
}

// Fonction pure et testable : le corps du message, séparé de l'envoi lui-même. Pas d'objet à
// construire — celui de l'email transporte l'adresse du destinataire, lue par le flux pour router
// le message Teams (voir envoiEmail.js) ; l'ancien `sujetNotificationPieces()` a disparu avec
// l'architecture qui l'avait fait naître.
function libelleNouvellesPieces(nombre) {
  return nombre > 1 ? 'Nouvelles pièces trouvées' : 'Nouvelle pièce trouvée';
}

// `liens` : [{label, url}] — une ligne par pièce dont le fichier est connu, pour l'ouvrir
// directement depuis le message (voir liensPieces.js). Absent ou vide : le message reste celui
// d'avant, sur une seule ligne. C'est la version TEXTE BRUT, qui garde l'adresse en clair ; la
// version HTML ci-dessous est celle que Teams affiche.
function texteNotificationPieces(dossierNom, pieces, liens) {
  const liste = pieces.join(', ');
  const entete = `📄 CLAIRE — ${libelleNouvellesPieces(pieces.length)} sur le dossier ${dossierNom} : ${liste}.`;
  const lignes = (Array.isArray(liens) ? liens : []).filter((l) => l && l.url).map((l) => `• ${l.label} : ${l.url}`);
  return lignes.length ? `${entete}\n${lignes.join('\n')}` : entete;
}

function echapperHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Version HTML, demandée par l'étude : dans Teams, c'est le NOM de la pièce qui est cliquable,
// plus une longue adresse affichée en clair après lui. Une pièce sans fichier connu reste un
// simple libellé. Tout ce qui vient d'un dossier (nom, libellés) est échappé : un nom de dossier
// contenant « < » ou « & » ne doit ni casser le message ni y injecter de balise.
function htmlNotificationPieces(dossierNom, pieces, liens) {
  const urls = new Map((Array.isArray(liens) ? liens : []).filter((l) => l && l.url).map((l) => [l.label, l.url]));
  const lignes = pieces.map((label) => {
    const url = urls.get(label);
    return url
      ? `• <a href="${echapperHtml(url)}">${echapperHtml(label)}</a>`
      : `• ${echapperHtml(label)}`;
  });
  return `📄 CLAIRE — ${libelleNouvellesPieces(pieces.length)} sur le dossier <b>${echapperHtml(dossierNom)}</b> :<br>${lignes.join('<br>')}`;
}

// Demandé par l'étude : prévenir le responsable dès qu'un dossier a tout reçu (offre de prêt et
// pièces), pour qu'il sache qu'il peut commencer la rédaction de l'acte.
function texteDossierComplet(dossierNom, succession) {
  // Succession (étude 16/10 : « les successions ne sont pas des ventes ») : ni offre de prêt, les pièces de la succession.
  if (succession) return `✅ CLAIRE — Succession ${dossierNom} : toutes les pièces sont reçues.`;
  return `✅ CLAIRE — Dossier ${dossierNom} complet : offre de prêt et pièces reçues.`;
}

// Demandé par l'étude : prévenir le responsable d'un dossier quand un AUTRE collaborateur y ajoute
// ou y change une date (rendez-vous, échéance…). Le client ne l'appelle que si l'auteur n'est pas
// le responsable (voir doitNotifierDateAjoutee dans script.js). Dates au format AAAA-MM-JJ.
const MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
function dateLongueFr(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  return `${parseInt(m[3], 10)} ${MOIS_FR[parseInt(m[2], 10) - 1] || m[2]} ${m[1]}`;
}

// Une date d'envoi saisie vaut envoi fait : le message dit le geste, pas « une date ajoutée ».
const ENVOIS_PAR_LIBELLE = { 'Envoi appel de fonds': 'l’appel de fonds', 'Envoi projet': 'le projet d’acte' };

function texteDateAjoutee(dossierNom, auteur, libelle, date, ancienneDate, heure, ancienneHeure) {
  const qui = auteur || 'Un collaborateur';
  const envoi = ENVOIS_PAR_LIBELLE[libelle];
  if (envoi && !ancienneDate) {
    return `✅ CLAIRE — ${qui} a envoyé ${envoi} du dossier ${dossierNom} (le ${dateLongueFr(date)}). La tâche est faite.`;
  }
  // Heures (rendez-vous déplacé depuis la page Agenda, étude 01/10) : seulement si elles sont données.
  const quand = (d, h) => `${dateLongueFr(d)}${heureValide(h) ? ` à ${heureFr(h)}` : ''}`;
  if (ancienneDate) {
    return `📅 CLAIRE — ${qui} a modifié une date du dossier ${dossierNom} : ${libelle} passe du ${quand(ancienneDate, ancienneHeure)} au ${quand(date, heure)}.`;
  }
  return `📅 CLAIRE — ${qui} a ajouté une date au dossier ${dossierNom} : ${libelle} le ${quand(date, heure)}.`;
}

function heureValide(h) { return /^\d{2}:\d{2}$/.test(String(h || '')); }
function heureFr(h) { return String(h).replace(':', ' h '); }

// Rendez-vous de signature vu dans l'agenda de l'office (étude, 01/10 : prévenir le responsable
// quand un rendez-vous est placé, déplacé ou marqué « annulé / à replacer » sans qu'il l'ait fait).
// `auteur` : le collaborateur qui l'a fait depuis CLAIRE ; vide quand c'est la lecture de l'agenda
// qui le relève (fait dans Outlook — CLAIRE ne sait pas par qui). Pure.
function texteRendezVousAgenda({ dossierNom, auteur, action, date, heure, ancienneDate }) {
  const quand = (d, h) => `${dateLongueFr(d)}${heureValide(h) ? ` à ${heureFr(h)}` : ''}`;
  if (action === 'aReplacer') {
    return auteur
      ? `⚠️ CLAIRE — ${auteur} a marqué « annulé / à replacer » le rendez-vous de signature du dossier ${dossierNom} (prévu le ${quand(date, heure)}) : il est à replacer.`
      : `⚠️ CLAIRE — Le rendez-vous de signature du dossier ${dossierNom} (prévu le ${quand(date, heure)}) est marqué « annulé / à replacer » dans l’agenda de l’office : il est à replacer.`;
  }
  if (ancienneDate) {
    return `📅 CLAIRE — Rendez-vous de signature du dossier ${dossierNom} déplacé dans l’agenda de l’office : du ${dateLongueFr(ancienneDate)} au ${quand(date, heure)}.`;
  }
  return `📅 CLAIRE — Rendez-vous de signature du dossier ${dossierNom} placé dans l’agenda de l’office : le ${quand(date, heure)}.`;
}

// Une pièce envoyée par le client : un libellé seul (ancienne forme), ou {label, chemin} quand le
// fichier trouvé sur le NAS est connu — le chemin, relatif à la racine du NAS, sert au lien.
function lirePiece(p) {
  if (typeof p === 'string') return p.trim() ? { label: p.trim(), chemin: null } : null;
  if (p && typeof p.label === 'string' && p.label.trim()) {
    return { label: p.label.trim(), chemin: typeof p.chemin === 'string' && p.chemin ? p.chemin : null };
  }
  return null;
}

// Une même pièce n'est notifiée qu'une fois (étude, 30/09 : « deux notifications pour le même
// document », à 11 minutes d'écart) : clé dossier + pièce + fichier, retenue 30 jours. Une pièce
// renouvelée (autre fichier) repart ; la même, relue par une autre fenêtre CLAIRE ou retrouvée après
// avoir paru manquante un instant, non. Pure : renvoie les pièces à envoyer et le registre à jour
// (entrées de plus de 30 jours purgées, nouvelles pièces enregistrées).
const DUREE_DEDOUBLONNAGE_MS = 30 * 86400000;
function normaliserCle(s) {
  return String(s || '').normalize('NFC').toLowerCase().replace(/\\/g, '/').replace(/\s+/g, ' ').trim();
}
function dedoublonnerPieces(registre, dossierCle, pieces, maintenantMs) {
  const limite = maintenantMs - DUREE_DEDOUBLONNAGE_MS;
  const suivant = {};
  for (const [k, v] of Object.entries(registre || {})) if (Date.parse(v) >= limite) suivant[k] = v;
  const date = new Date(maintenantMs).toISOString();
  const aEnvoyer = [];
  const vues = new Set();
  for (const p of pieces) {
    const cle = `${normaliserCle(dossierCle)}|${normaliserCle(p.label)}|${normaliserCle(p.chemin)}`;
    if (suivant[cle] || vues.has(cle)) continue;
    vues.add(cle);
    suivant[cle] = date;
    aEnvoyer.push(p);
  }
  return { aEnvoyer, registre: suivant };
}

// Envoie un texte au responsable puis, en copie, à l'adresse de l'étude — même schéma que
// executerTacheRappels() : la copie n'est envoyée qu'APRÈS le principal (ou reste le seul message
// quand aucun responsable n'est connu), jamais en double si elle coïncide avec l'adresse déjà
// notifiée. La copie Gmail est mise en attente d'effacement, jamais effacée tout de suite : le flux
// doit d'abord avoir lu le message (voir nettoyageGmail.js).
// `message` : chaîne, ou {texte, html} (voir envoiEmail.js).
// `options.sansCopiePour` : adresse à qui la copie n'est pas envoyée (l'auteur d'un changement n'a
// pas à recevoir le compte rendu de son propre geste).
async function envoyerAuResponsable(parametresRepo, envoyer, reglages, responsable, message, options = {}) {
  const email = responsable ? reglages.emailsResponsables[responsable] : null;
  // Aiguillage vers la conversation de CLAIRE : le dossier (sa conversation), ou « pièces » (aucune conversation) — voir messagesClaire.js.
  const optionsEnvoi = { dossierId: options.dossierId || '', sansConversationClaire: options.sansConversationClaire === true };
  const resultat = { ok: true, envoyeResponsable: false, envoyeCopie: false, erreurs: [] };
  const messagesEnvoyes = [];

  if (email) {
    const envoi = await envoyer(reglages, email, message, undefined, optionsEnvoi);
    resultat.envoyeResponsable = envoi.ok;
    if (envoi.ok && envoi.messageId) messagesEnvoyes.push(envoi.messageId);
    if (!envoi.ok) resultat.erreurs.push(envoi.erreur);
  } else if (responsable) {
    resultat.erreurs.push(`${responsable} : aucune adresse email configurée (voir Réglages).`);
  }

  if (reglages.copieEmail && !memeAdresseEmail(reglages.copieEmail, email) &&
      !(options.sansCopiePour && memeAdresseEmail(reglages.copieEmail, options.sansCopiePour))) {
    const copie = await envoyer(reglages, reglages.copieEmail, message, undefined, optionsEnvoi);
    resultat.envoyeCopie = copie.ok;
    if (copie.ok && copie.messageId) messagesEnvoyes.push(copie.messageId);
    if (!copie.ok) resultat.erreurs.push(copie.erreur);
  }

  if (typeof parametresRepo.lireCopiesEnAttente === 'function') {
    mettreCopiesEnAttente(parametresRepo, reglages, messagesEnvoyes);
  }
  return resultat;
}

// Une tâche d'un dossier faite par un autre collaborateur que son responsable (demandé par
// l'étude le 29/09 : « le prévenir comme pour la date du rendez-vous de signature »).
function texteTacheFaite(dossierNom, auteur, tache, detail) {
  const qui = auteur || 'Un collaborateur';
  return `✅ CLAIRE — ${qui} a fait une tâche de votre dossier ${dossierNom} : ${tache}${detail ? ` (${detail})` : ''}.`;
}

function creerRouteurNotifications(parametresRepo, envoyerFn, options = {}) {
  const router = express.Router();
  const envoyer = envoyerFn || envoyerEmail;
  const adresses = options.adressesLan || adressesLan;
  const horloge = options.horloge || (() => Date.now());

  router.post('/notifications/pieces-recues', async (req, res) => {
    const corps = req.body || {};
    const dossierNom = typeof corps.dossierNom === 'string' ? corps.dossierNom.trim() : '';
    const responsable = typeof corps.responsable === 'string' ? corps.responsable.trim() : '';
    let pieces = (Array.isArray(corps.pieces) ? corps.pieces : []).map(lirePiece).filter(Boolean);
    if (!dossierNom) return res.status(400).json({ erreur: 'dossierNom manquant.' });
    if (pieces.length === 0) return res.status(400).json({ erreur: 'pieces manquantes ou vide.' });

    const reglages = parametresRepo.lireReglages();
    // Envoi par email non activé : rien à envoyer, ce n'est pas une erreur — le client n'a pas à
    // vérifier lui-même cet état avant d'appeler la route (même principe que le job de rappels).
    if (!envoiConfigure(reglages)) return res.json({ ok: true, ignore: true });

    // Déjà notifiée : rien ne repart. Le registre est écrit AVANT l'envoi (synchrone, donc sans
    // course entre deux requêtes simultanées de deux fenêtres).
    if (typeof parametresRepo.lirePiecesNotifiees === 'function') {
      const dossierCle = typeof corps.dossierId === 'string' && corps.dossierId ? corps.dossierId : dossierNom;
      const r = dedoublonnerPieces(parametresRepo.lirePiecesNotifiees(), dossierCle, pieces, horloge());
      parametresRepo.ecrirePiecesNotifiees(r.registre);
      pieces = r.aEnvoyer;
      if (!pieces.length) return res.json({ ok: true, ignore: true, dejaNotifiees: true });
    }

    let liens = [];
    const avecChemin = pieces.filter((p) => p.chemin);
    if (avecChemin.length && typeof parametresRepo.lireSecretLiens === 'function') {
      const secret = parametresRepo.lireSecretLiens();
      const base = baseDepuisRequete(req, adresses);
      liens = avecChemin.map((p) => ({ label: p.label, url: urlLienPiece(base, secret, p.chemin) }));
    }
    const labels = pieces.map((p) => p.label);
    const message = {
      texte: texteNotificationPieces(dossierNom, labels, liens),
      html: htmlNotificationPieces(dossierNom, labels, liens)
    };
    res.json(await envoyerAuResponsable(parametresRepo, envoyer, reglages, responsable, message, { sansConversationClaire: true }));
  });

  router.post('/notifications/dossier-complet', async (req, res) => {
    const corps = req.body || {};
    const dossierNom = typeof corps.dossierNom === 'string' ? corps.dossierNom.trim() : '';
    const responsable = typeof corps.responsable === 'string' ? corps.responsable.trim() : '';
    if (!dossierNom) return res.status(400).json({ erreur: 'dossierNom manquant.' });
    const reglages = parametresRepo.lireReglages();
    if (!envoiConfigure(reglages)) return res.json({ ok: true, ignore: true });
    res.json(await envoyerAuResponsable(parametresRepo, envoyer, reglages, responsable, texteDossierComplet(dossierNom, req.body && req.body.succession === true), { dossierId: (typeof corps.dossierId === 'string' ? corps.dossierId.trim().slice(0, 80) : '') }));
  });

  router.post('/notifications/date-ajoutee', async (req, res) => {
    const corps = req.body || {};
    const texteChamp = (v) => (typeof v === 'string' ? v.trim() : '');
    const dossierNom = texteChamp(corps.dossierNom);
    const responsable = texteChamp(corps.responsable);
    const auteur = texteChamp(corps.auteur);
    const libelle = texteChamp(corps.libelle) || 'Échéance';
    const date = texteChamp(corps.date);
    const ancienneDate = texteChamp(corps.ancienneDate);
    if (!dossierNom) return res.status(400).json({ erreur: 'dossierNom manquant.' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ erreur: 'date manquante ou invalide.' });
    if (!responsable) return res.status(400).json({ erreur: 'responsable manquant.' });
    // Le client filtre déjà ce cas ; le serveur le refuse aussi pour qu'un appel direct ne fasse
    // jamais notifier quelqu'un de son propre changement.
    if (auteur && auteur === responsable) return res.json({ ok: true, ignore: true });
    const reglages = parametresRepo.lireReglages();
    if (!envoiConfigure(reglages)) return res.json({ ok: true, ignore: true });
    const message = texteDateAjoutee(dossierNom, auteur, libelle, date, /^\d{4}-\d{2}-\d{2}$/.test(ancienneDate) ? ancienneDate : '',
      texteChamp(corps.heure), texteChamp(corps.ancienneHeure));
    const sansCopiePour = auteur ? reglages.emailsResponsables[auteur] : null;
    res.json(await envoyerAuResponsable(parametresRepo, envoyer, reglages, responsable, message, { sansCopiePour, dossierId: (typeof corps.dossierId === 'string' ? corps.dossierId.trim().slice(0, 80) : '') }));
  });

  // Signature marquée « annulé / à replacer » depuis la page Agenda (le poste ; la lecture de
  // l'agenda prévient elle-même quand c'est fait dans Outlook, voir agendaWatch.js).
  router.post('/notifications/rendez-vous-agenda', async (req, res) => {
    const corps = req.body || {};
    const texteChamp = (v) => (typeof v === 'string' ? v.trim().slice(0, 300) : '');
    const dossierNom = texteChamp(corps.dossierNom);
    const responsable = texteChamp(corps.responsable);
    const auteur = texteChamp(corps.auteur);
    const date = texteChamp(corps.date);
    if (!dossierNom || !responsable || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ erreur: 'dossierNom, responsable ou date manquant.' });
    if (corps.action !== 'aReplacer') return res.status(400).json({ erreur: 'action inconnue.' });
    if (auteur && auteur === responsable) return res.json({ ok: true, ignore: true });
    const reglages = parametresRepo.lireReglages();
    if (!envoiConfigure(reglages)) return res.json({ ok: true, ignore: true });
    const message = texteRendezVousAgenda({ dossierNom, auteur, action: 'aReplacer', date, heure: texteChamp(corps.heure) });
    const sansCopiePour = auteur ? reglages.emailsResponsables[auteur] : null;
    res.json(await envoyerAuResponsable(parametresRepo, envoyer, reglages, responsable, message, { sansCopiePour, dossierId: (typeof corps.dossierId === 'string' ? corps.dossierId.trim().slice(0, 80) : '') }));
  });

  router.post('/notifications/tache-faite', async (req, res) => {
    const corps = req.body || {};
    const texteChamp = (v) => (typeof v === 'string' ? v.trim().slice(0, 300) : '');
    const dossierNom = texteChamp(corps.dossierNom);
    const responsable = texteChamp(corps.responsable);
    const auteur = texteChamp(corps.auteur);
    const tache = texteChamp(corps.tache);
    if (!dossierNom || !tache) return res.status(400).json({ erreur: 'dossierNom ou tache manquant.' });
    if (!responsable) return res.status(400).json({ erreur: 'responsable manquant.' });
    // Jamais prévenir quelqu'un de son propre geste (le client filtre déjà ce cas).
    if (!auteur || auteur === responsable) return res.json({ ok: true, ignore: true });
    const reglages = parametresRepo.lireReglages();
    if (!envoiConfigure(reglages)) return res.json({ ok: true, ignore: true });
    const message = texteTacheFaite(dossierNom, auteur, tache, texteChamp(corps.detail));
    const sansCopiePour = reglages.emailsResponsables[auteur] || null;
    res.json(await envoyerAuResponsable(parametresRepo, envoyer, reglages, responsable, message, { sansCopiePour, dossierId: (typeof corps.dossierId === 'string' ? corps.dossierId.trim().slice(0, 80) : '') }));
  });

  router.post('/notifications/facture-succession', async (req, res) => { try {
    const c = req.body || {};
    const t = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
    const dossierNom = t(c.dossierNom, 160);
    const chemin = t(c.chemin, 400);
    if (!dossierNom) return res.status(400).json({ erreur: 'dossierNom manquant.' });
    const montant = Number(c.montant);
    const organisme = t(c.organisme, 120);
    const reglages = parametresRepo.lireReglages();
    if (!envoiConfigure(reglages)) return res.json({ ok: true, ignore: true });
    // Une même facture (même fichier) n'est annoncée qu'une fois, comme une pièce trouvée.
    if (chemin && typeof parametresRepo.lirePiecesNotifiees === 'function') {
      const r = dedoublonnerPieces(parametresRepo.lirePiecesNotifiees(), t(c.dossierId, 80) || dossierNom, [{ label: 'facture-succession', chemin }], horloge());
      parametresRepo.ecrirePiecesNotifiees(r.registre);
      if (!r.aEnvoyer.length) return res.json({ ok: true, ignore: true, dejaNotifiee: true });
    }
    let url = '';
    if (chemin && typeof parametresRepo.lireSecretLiens === 'function') url = urlLienPiece(baseDepuisRequete(req, adresses), parametresRepo.lireSecretLiens(), chemin);
    const message = { texte: texteFactureSuccession(dossierNom, organisme, Number.isFinite(montant) ? montant : null, url), html: htmlFactureSuccession(dossierNom, organisme, Number.isFinite(montant) ? montant : null, url) };
    res.json(await envoyerAuResponsable(parametresRepo, envoyer, reglages, DESTINATAIRE_FACTURES_SUCCESSION, message));
  } catch (e) { console.error('[CLAIRE] Facture de succession :', e && e.message); if (!res.headersSent) res.status(500).json({ erreur: 'Envoi impossible.' }); } });

  const envoisRecents = [];
  function demandesDansLaMinute(maintenant) {
    while (envoisRecents.length && maintenant - envoisRecents[0] > 60000) envoisRecents.shift();
    if (envoisRecents.length >= 20) return false;
    envoisRecents.push(maintenant);
    return true;
  }

  // « Demander à CLAIRE » (étude 13/10) : un collaborateur demande à un autre de faire quelque chose — message Teams au collaborateur
  // (la tâche est posée dans sa liste « Aujourd'hui » par le poste) ; puis, quand il la coche, message à celui qui l'a demandée.
  router.post('/notifications/demande-collaborateur', async (req, res) => { try {
    const c = req.body || {};
    const t = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
    const collaborateur = t(c.collaborateur, 80);
    const texte = t(c.texte, 300);
    if (!collaborateur || !texte) return res.status(400).json({ erreur: 'collaborateur ou texte manquant.' });
    const reglages = parametresRepo.lireReglages();
    if (!envoiConfigure(reglages)) return res.json({ ok: true, ignore: true });
    if (!Object.prototype.hasOwnProperty.call(reglages.emailsResponsables || {}, collaborateur)) return res.status(400).json({ erreur: 'collaborateur inconnu.' });
    // Auteur : un collaborateur des Réglages, et pas plus de 20 demandes par minute (audit 13/10 : messages usurpés ou en rafale).
    if (c.auteur && !Object.prototype.hasOwnProperty.call(reglages.emailsResponsables || {}, t(c.auteur, 80))) return res.status(400).json({ erreur: 'auteur inconnu.' });
    if (!demandesDansLaMinute(horloge())) return res.status(429).json({ erreur: 'trop de demandes : réessayez dans une minute.' });
    const message = texteDemandeCollaborateur(t(c.auteur, 80), texte, t(c.dossierNom, 160), /^\d{4}-\d{2}-\d{2}$/.test(c.date || '') ? c.date : '');
    res.json(await envoyerAuResponsable(parametresRepo, envoyer, reglages, collaborateur, message, { sansCopiePour: reglages.emailsResponsables[t(c.auteur, 80)] || null }));
  } catch (e) { console.error('[CLAIRE] Demande à un collaborateur :', e && e.message); if (!res.headersSent) res.status(500).json({ erreur: 'Envoi impossible.' }); } });

  // « C'est fait » (étude 26/10 : « prévenue dans la conversation Claire », plus sur Teams) : CLAIRE écrit à celui qui avait fait la demande, dans
  // la conversation personnelle qu'il a avec celui qui l'a faite. Aucun envoi Teams ni email ; la pastille de la conversation le dit.
  router.post('/notifications/demande-faite', async (req, res) => { try {
    const c = req.body || {};
    const t = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
    const demandeur = t(c.demandeur, 80);
    const auteur = t(c.auteur, 80);
    const texte = t(c.texte, 300);
    if (!demandeur || !texte) return res.status(400).json({ erreur: 'demandeur ou texte manquant.' });
    const noms = COLLABORATEURS_ABSENCE.map((x) => x.nom);
    if (!noms.includes(demandeur)) return res.status(400).json({ erreur: 'demandeur inconnu.' });
    if (!auteur || !noms.includes(auteur) || auteur === demandeur) return res.status(400).json({ erreur: 'auteur inconnu.' });
    if (!demandesDansLaMinute(horloge())) return res.status(429).json({ erreur: 'trop de demandes : réessayez dans une minute.' });
    const canal = CANAUX.idPrive([demandeur, auteur]);
    const dossier = t(c.dossierNom, 160);
    const message = `✅ ${CANAUX.prenomDe(auteur)} a fait ce que vous lui aviez demandé : ${texte}${dossier ? ` (${dossier})` : ''}.`;
    const echappe = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const m = canal ? CANAUX.ajouterMessage(parametresRepo, canal, { auteur: 'CLAIRE', claire: true, texte: message, html: `<p>${echappe}</p>` }) : null;
    res.json({ ok: !!m, canal: m ? canal : '' });
  } catch (e) { console.error('[CLAIRE] Demande faite :', e && e.message); if (!res.headersSent) res.status(500).json({ erreur: 'Message impossible.' }); } });

  return router;
}

// Pure : le message Teams d'une demande à un collaborateur.
function texteDemandeCollaborateur(auteur, texte, dossierNom, date) {
  return `📌 CLAIRE — ${auteur || 'Un collaborateur'} vous demande : ${texte}${dossierNom ? ` (dossier ${dossierNom})` : ''}${date ? `, pour le ${dateLongueFr(date)}` : ''}. La tâche est dans votre liste « Aujourd’hui » de CLAIRE.`;
}

module.exports = { texteFactureSuccession, htmlFactureSuccession, DESTINATAIRE_FACTURES_SUCCESSION, texteDemandeCollaborateur, creerRouteurNotifications, dedoublonnerPieces, texteNotificationPieces, htmlNotificationPieces, texteDossierComplet, texteDateAjoutee, texteTacheFaite, texteRendezVousAgenda, envoyerAuResponsable };
