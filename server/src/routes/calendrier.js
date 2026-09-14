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

// Même format qu'un événement toute la journée que buildEvent() côté client (script.js,
// telechargerICS()) : un UID stable (id du dossier + type d'échéance) pour qu'Outlook mette à jour
// le MÊME événement d'un rafraîchissement à l'autre plutôt que d'en accumuler un nouveau à chaque
// fois qu'il resynchronise l'abonnement.
function buildEvent(uid, summary, iso) {
  if (!iso) return '';
  return (
    'BEGIN:VEVENT\r\n' +
    `UID:${uid}@claire-calendrier\r\n` +
    `DTSTAMP:${dtstampMaintenant()}\r\n` +
    `DTSTART;VALUE=DATE:${icsDate(iso)}\r\n` +
    `DTEND;VALUE=DATE:${icsDate(addDays(iso, 1))}\r\n` +
    `SUMMARY:${summary}\r\n` +
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
// archivé n'a plus d'échéance active à suivre au quotidien — exclu, comme partout ailleurs dans
// l'outil (voir CLAUDE.md, "dossiers actifs").
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

  for (const d of dossiers) {
    if (d.archive) continue;
    const nomAcquereur = extraireNomAcquereur(d.nom);
    const suffixe = ` — ${nomAcquereur} - Dossier ${d.nom}`;
    body += buildEvent(`${d.id}-pret`, `Obtention du prêt${suffixe}`, d.pret);
    body += buildEvent(`${d.id}-acte`, `Signature de l'acte${suffixe}`, d.acte);
    body += buildEvent(`${d.id}-ventebien`, `Vente préalable${suffixe}`, d.ventebien);
    (Array.isArray(d.autres) ? d.autres : []).forEach((a, i) => {
      body += buildEvent(`${d.id}-autre-${i}`, `${a.label || 'Échéance'}${suffixe}`, a.date);
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
      .send(body);
  });

  return routeur;
}

// genererFluxIcs exposée pour les tests uniquement (voir server/test/calendrier.test.js) —
// creerRouteurCalendrier() reste le seul point d'entrée réel.
module.exports = { creerRouteurCalendrier, genererFluxIcs };
