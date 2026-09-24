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
const { envoyerEmail, envoiConfigure } = require('../envoiEmail');
const { mettreCopiesEnAttente } = require('../nettoyageGmail');
const { urlLienPiece, baseDepuisRequete } = require('../liensPieces');
const { adressesLan } = require('../reseau');

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
function texteDossierComplet(dossierNom) {
  return `✅ CLAIRE — Dossier ${dossierNom} complet : offre de prêt et pièces reçues. Il est prêt à être rédigé.`;
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

// Envoie un texte au responsable puis, en copie, à l'adresse de l'étude — même schéma que
// executerTacheRappels() : la copie n'est envoyée qu'APRÈS le principal (ou reste le seul message
// quand aucun responsable n'est connu), jamais en double si elle coïncide avec l'adresse déjà
// notifiée. La copie Gmail est mise en attente d'effacement, jamais effacée tout de suite : le flux
// doit d'abord avoir lu le message (voir nettoyageGmail.js).
// `message` : chaîne, ou {texte, html} (voir envoiEmail.js).
async function envoyerAuResponsable(parametresRepo, envoyer, reglages, responsable, message) {
  const email = responsable ? reglages.emailsResponsables[responsable] : null;
  const resultat = { ok: true, envoyeResponsable: false, envoyeCopie: false, erreurs: [] };
  const messagesEnvoyes = [];

  if (email) {
    const envoi = await envoyer(reglages, email, message);
    resultat.envoyeResponsable = envoi.ok;
    if (envoi.ok && envoi.messageId) messagesEnvoyes.push(envoi.messageId);
    if (!envoi.ok) resultat.erreurs.push(envoi.erreur);
  } else if (responsable) {
    resultat.erreurs.push(`${responsable} : aucune adresse email configurée (voir Réglages).`);
  }

  if (reglages.copieEmail && reglages.copieEmail !== email) {
    const copie = await envoyer(reglages, reglages.copieEmail, message);
    resultat.envoyeCopie = copie.ok;
    if (copie.ok && copie.messageId) messagesEnvoyes.push(copie.messageId);
    if (!copie.ok) resultat.erreurs.push(copie.erreur);
  }

  if (typeof parametresRepo.lireCopiesEnAttente === 'function') {
    mettreCopiesEnAttente(parametresRepo, reglages, messagesEnvoyes);
  }
  return resultat;
}

function creerRouteurNotifications(parametresRepo, envoyerFn, options = {}) {
  const router = express.Router();
  const envoyer = envoyerFn || envoyerEmail;
  const adresses = options.adressesLan || adressesLan;

  router.post('/notifications/pieces-recues', async (req, res) => {
    const corps = req.body || {};
    const dossierNom = typeof corps.dossierNom === 'string' ? corps.dossierNom.trim() : '';
    const responsable = typeof corps.responsable === 'string' ? corps.responsable.trim() : '';
    const pieces = (Array.isArray(corps.pieces) ? corps.pieces : []).map(lirePiece).filter(Boolean);
    if (!dossierNom) return res.status(400).json({ erreur: 'dossierNom manquant.' });
    if (pieces.length === 0) return res.status(400).json({ erreur: 'pieces manquantes ou vide.' });

    const reglages = parametresRepo.lireReglages();
    // Envoi par email non activé : rien à envoyer, ce n'est pas une erreur — le client n'a pas à
    // vérifier lui-même cet état avant d'appeler la route (même principe que le job de rappels).
    if (!envoiConfigure(reglages)) return res.json({ ok: true, ignore: true });

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
    res.json(await envoyerAuResponsable(parametresRepo, envoyer, reglages, responsable, message));
  });

  router.post('/notifications/dossier-complet', async (req, res) => {
    const corps = req.body || {};
    const dossierNom = typeof corps.dossierNom === 'string' ? corps.dossierNom.trim() : '';
    const responsable = typeof corps.responsable === 'string' ? corps.responsable.trim() : '';
    if (!dossierNom) return res.status(400).json({ erreur: 'dossierNom manquant.' });
    const reglages = parametresRepo.lireReglages();
    if (!envoiConfigure(reglages)) return res.json({ ok: true, ignore: true });
    res.json(await envoyerAuResponsable(parametresRepo, envoyer, reglages, responsable, texteDossierComplet(dossierNom)));
  });

  return router;
}

module.exports = { creerRouteurNotifications, texteNotificationPieces, htmlNotificationPieces, texteDossierComplet };
