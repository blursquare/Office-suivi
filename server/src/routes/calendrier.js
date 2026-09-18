// Flux calendrier "connecté" (abonnement webcal, voir server/README.md) : génère un .ics à la
// demande à partir des dossiers actifs du registre. Route volontairement HORS du middleware
// d'authentification par jeton de session (voir app.js) : un client calendrier (Outlook, webcal://)
// ne sait suivre qu'une URL — ni écran de connexion, ni en-tête Authorization possible — d'où un
// jeton dédié dans la query string (config.jetonCalendrier), distinct du mot de passe partagé :
// celui-ci resterait sinon visible en clair dans les paramètres de calendrier de n'importe quel
// poste abonné, et serait impossible à changer sans aussi déconnecter tout le monde de l'outil.
'use strict';

const express = require('express');

function pad(n) { return String(n).padStart(2, '0'); }
function icsDate(iso) { return iso.replace(/-/g, ''); }

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

function dtstampMaintenant() {
  const now = new Date();
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
}

// Un UID stable (id du dossier + type d'échéance) pour qu'Outlook mette à jour le MÊME événement
// d'un rafraîchissement à l'autre plutôt que d'en accumuler un nouveau. Mais un UID stable ne
// suffit pas, et c'est ce qui manquait :
//
//   1. SEQUENCE — un client calendrier NE REMPLACE PAS un événement qu'il connaît déjà si le
//      numéro de séquence n'a pas augmenté (RFC 5545, §3.8.7.4 : il « DOIT » être incrémenté à
//      chaque changement significatif, et un changement de DTSTART en est un). Sans lui, une date
//      butoir corrigée dans CLAIRE n'arrivait jamais dans Outlook, qui gardait l'ancienne.
//   2. STATUS:CANCELLED — un client NE SUPPRIME PAS un événement qui disparaît simplement du
//      flux. Une date de vente préalable effacée, ou un dossier archivé, restaient donc affichés
//      indéfiniment. Il faut publier explicitement leur annulation.
//
// Les deux expliquent exactement ce que l'étude a constaté : « il y a encore des dates de vente
// dessus et pas les nouvelles dates butoir d'obtention de prêt ».

// Origine des numéros de séquence : 1er janvier 2024. Le SEQUENCE doit tenir dans un entier que
// tous les clients acceptent — l'horodatage en millisecondes depuis 1970 est bien trop grand,
// des secondes depuis une origine récente donnent un nombre modeste et strictement croissant.
const ORIGINE_SEQUENCE = Date.UTC(2024, 0, 1);

function sequenceDepuisMaj(updatedAt) {
  const ms = Number(updatedAt);
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.floor((ms - ORIGINE_SEQUENCE) / 1000));
}

function buildEvent(uid, summary, iso, sequence) {
  if (!iso) return '';
  const horodatage = dtstampMaintenant();
  return (
    'BEGIN:VEVENT\r\n' +
    `UID:${uid}@claire-calendrier\r\n` +
    `SEQUENCE:${sequence}\r\n` +
    `DTSTAMP:${horodatage}\r\n` +
    `LAST-MODIFIED:${horodatage}\r\n` +
    `DTSTART;VALUE=DATE:${icsDate(iso)}\r\n` +
    `DTEND;VALUE=DATE:${icsDate(addDays(iso, 1))}\r\n` +
    `SUMMARY:${summary}\r\n` +
    'STATUS:CONFIRMED\r\n' +
    'END:VEVENT\r\n'
  );
}

// Annulation explicite d'une échéance qui n'existe plus (date effacée, dossier archivé). La date
// portée n'a pas d'importance — un client ne l'affiche pas — mais un VEVENT doit en avoir une.
function buildEventAnnule(uid, summary, isoRepli, sequence) {
  const horodatage = dtstampMaintenant();
  return (
    'BEGIN:VEVENT\r\n' +
    `UID:${uid}@claire-calendrier\r\n` +
    `SEQUENCE:${sequence}\r\n` +
    `DTSTAMP:${horodatage}\r\n` +
    `LAST-MODIFIED:${horodatage}\r\n` +
    `DTSTART;VALUE=DATE:${icsDate(isoRepli)}\r\n` +
    `DTEND;VALUE=DATE:${icsDate(addDays(isoRepli, 1))}\r\n` +
    `SUMMARY:${summary}\r\n` +
    'STATUS:CANCELLED\r\n' +
    'METHOD:CANCEL\r\n' +
    'END:VEVENT\r\n'
  );
}

// Le nom du dossier est au format "VENDEUR(S) / ACQUEREUR(S)" (voir CLAUDE.md) : on isole la
// partie acquéreur pour la mettre en avant dans le titre de l'événement — même logique que
// extraireNomAcquereur() côté client, dupliquée ici faute de pouvoir partager du code entre
// script.js (navigateur) et le serveur sans étape de build.
function extraireNomAcquereur(nomDossier) {
  const parties = String(nomDossier || '').split(' / ');
  return parties.length > 1 ? parties[1].trim() : nomDossier;
}

// Un événement par échéance ACTIVE de chaque dossier actif : obtention du prêt, signature de
// l'acte, vente préalable, échéances personnalisées (d.autres). Contrairement à l'export .ics
// manuel côté client (telechargerICS(), volontairement limité à la seule date de prêt sur demande
// de l'étude, pour un export ponctuel d'UN dossier) : ici c'est un abonnement continu censé
// refléter tout le portefeuille, donc toutes les échéances de tous les dossiers actifs. Un dossier
// archivé n'a plus d'échéance à suivre : ses événements sont publiés ANNULÉS (voir
// buildEventAnnule) plutôt qu'omis — les omettre les laissait affichés pour toujours.
function genererFluxIcs(dossiers) {
  let body =
    'BEGIN:VCALENDAR\r\n' +
    'VERSION:2.0\r\n' +
    'PRODID:-//CLAIRE//Calendrier connecté//FR\r\n' +
    'CALSCALE:GREGORIAN\r\n' +
    'X-WR-CALNAME:CLAIRE — Échéances\r\n' +
    // Indication (best-effort, ignorée par certains clients) de la fréquence de resynchronisation
    // souhaitée — Outlook resynchronise de toute façon selon son propre calendrier interne
    // (typiquement toutes les quelques heures pour un abonnement Internet), voir server/README.md.
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H\r\n' +
    'X-PUBLISHED-TTL:PT1H\r\n';

  const aujourdHui = new Date().toISOString().slice(0, 10);

  for (const d of dossiers) {
    const nomAcquereur = extraireNomAcquereur(d.nom);
    const suffixe = ` — ${nomAcquereur} - Dossier ${d.nom}`;
    const sequence = sequenceDepuisMaj(d.updatedAt);
    // Une échéance sans date — ou tout un dossier archivé — doit être ANNULÉE explicitement, et
    // non simplement omise : un client calendrier garderait sinon l'ancien événement pour
    // toujours. Le repli de date n'a pas d'importance pour un événement annulé.
    const repli = d.pret || d.acte || d.ventebien || aujourdHui;
    const standard = [
      { cle: 'pret', libelle: 'Obtention du prêt', iso: d.pret },
      { cle: 'acte', libelle: "Signature de l'acte", iso: d.acte },
      { cle: 'ventebien', libelle: 'Vente préalable', iso: d.ventebien }
    ];
    for (const e of standard) {
      const uid = `${d.id}-${e.cle}`;
      body += (!d.archive && e.iso)
        ? buildEvent(uid, `${e.libelle}${suffixe}`, e.iso, sequence)
        : buildEventAnnule(uid, `${e.libelle}${suffixe}`, repli, sequence);
    }
    (Array.isArray(d.autres) ? d.autres : []).forEach((a, i) => {
      const uid = `${d.id}-autre-${i}`;
      body += (!d.archive && a.date)
        ? buildEvent(uid, `${a.label || 'Échéance'}${suffixe}`, a.date, sequence)
        : buildEventAnnule(uid, `${a.label || 'Échéance'}${suffixe}`, repli, sequence);
    });
  }

  body += 'END:VCALENDAR\r\n';
  return body;
}

function creerRouteurCalendrier(depot, config) {
  const routeur = express.Router();

  routeur.get('/calendrier.ics', (req, res) => {
    if (!config.jetonCalendrier) {
      res.status(503).type('text/plain; charset=utf-8').send(
        "Calendrier connecté non configuré sur ce serveur (aucun jeton défini) — voir server/README.md."
      );
      return;
    }
    if (req.query.token !== config.jetonCalendrier) {
      res.status(403).type('text/plain; charset=utf-8').send('Jeton invalide.');
      return;
    }
    const body = genererFluxIcs(depot.tousActifs());
    res
      .type('text/calendar; charset=utf-8')
      .set('Content-Disposition', 'inline; filename="claire-echeances.ics"')
      // Le flux change dès qu'une échéance change : ni le client ni un proxy ne doivent en servir
      // une copie mise en cache.
      .set('Cache-Control', 'no-cache, no-store, must-revalidate')
      .send(body);
  });

  return routeur;
}

// genererFluxIcs exposée pour les tests uniquement (voir server/test/calendrier.test.js) —
// creerRouteurCalendrier() reste le seul point d'entrée réel.
module.exports = { creerRouteurCalendrier, genererFluxIcs, sequenceDepuisMaj };
