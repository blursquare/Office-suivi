// Flux calendrier "connecté" (abonnement webcal, voir server/README.md) : génère un .ics à la
// demande à partir des dossiers actifs du registre. Route volontairement HORS du middleware
// d'authentification par jeton de session (voir app.js) : un client calendrier (Outlook, webcal://)
// ne sait suivre qu'une URL — ni écran de connexion, ni en-tête Authorization possible — d'où un
// jeton dédié dans la query string (config.jetonCalendrier), distinct du mot de passe partagé :
// celui-ci resterait sinon visible en clair dans les paramètres de calendrier de n'importe quel
// poste abonné, et serait impossible à changer sans aussi déconnecter tout le monde de l'outil.
'use strict';

const express = require('express');
const { echeanceValidee } = require('../jobs/rappels');

function pad(n) { return String(n).padStart(2, '0'); }
function icsDate(iso) { return iso.replace(/-/g, ''); }

// RFC 5545 §3.3.11 : dans une valeur TEXT, l'antislash, le point-virgule, la virgule et le saut de
// ligne DOIVENT être échappés. Un nom de dossier en contient couramment (« DUPONT, Jean / MARTIN »,
// une échéance personnalisée « Levée; option ») : sans échappement, un lecteur strict peut prendre
// le point-virgule pour un séparateur de paramètre et rejeter l'événement.
function echapperTexteIcs(valeur) {
  return String(valeur == null ? '' : valeur)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// RFC 5545 §3.1 : une ligne ne dépasse pas 75 octets, au-delà elle est repliée — coupure, CRLF,
// puis une espace en tête de la continuation. Les titres d'échéance (libellé + acquéreur + nom
// complet du dossier) dépassent largement ce plafond. La coupe se fait par POINT DE CODE et non
// par octet : couper un caractère accentué en deux produirait de l'UTF-8 invalide.
function plierLigneIcs(ligne) {
  if (Buffer.byteLength(ligne, 'utf8') <= 75) return ligne;
  const morceaux = [];
  let courant = '';
  let octets = 0;
  let premier = true;
  for (const caractere of ligne) {
    const n = Buffer.byteLength(caractere, 'utf8');
    // Une ligne de continuation commence par une espace, qui compte dans les 75 octets.
    const plafond = premier ? 75 : 74;
    if (octets + n > plafond) {
      morceaux.push(courant);
      courant = '';
      octets = 0;
      premier = false;
    }
    courant += caractere;
    octets += n;
  }
  morceaux.push(courant);
  return morceaux.join('\r\n ');
}

function plierFluxIcs(corps) {
  return corps.split('\r\n').map(plierLigneIcs).join('\r\n');
}

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
// d'un rafraîchissement à l'autre plutôt que d'en accumuler un nouveau, et un SEQUENCE qui croît à
// chaque modification du dossier (RFC 5545, §3.8.7.4) pour qu'une date corrigée remplace bien
// l'ancienne.
//
// Ce flux ne publie JAMAIS d'événement annulé (STATUS:CANCELLED). Une version précédente le
// faisait, pour retirer d'un agenda déjà abonné une échéance qui n'avait plus à y figurer — en
// supposant qu'un client garde indéfiniment un événement qui disparaît simplement du flux. C'est
// faux pour un abonnement Internet Outlook : il REMPLACE le calendrier entier à chaque
// resynchronisation, donc un événement omis disparaît de lui-même, alors qu'un événement annulé
// reste AFFICHÉ. L'étude voyait ainsi « Appel de fonds », « Rendez-vous de signature »,
// « Signature de l'acte »… empilés sur le même jour (la date de repli des annulations).

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
    `SUMMARY:${echapperTexteIcs(summary)}\r\n` +
    'STATUS:CONFIRMED\r\n' +
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

// Ce que publie l'agenda, sur décision de l'étude (23/09) : UNIQUEMENT l'obtention du prêt et la
// vente préalable, et seulement tant qu'elles restent à obtenir. Les autres échéances (date butoir,
// appel de fonds, rendez-vous de signature, échéances personnalisées) ne sont plus publiées : elles
// se suivent dans CLAIRE et par les rappels email, l'agenda n'en garde que les deux conditions dont
// dépend la vente.
//
// Tout le reste est simplement OMIS (voir plus haut, jamais d'événement annulé) : un abonnement
// Outlook se resynchronise en entier, ce qui n'est plus dans le flux quitte l'agenda.
var TYPES_PUBLIES_AGENDA = ['pret', 'ventebien'];

// Une échéance est publiée si elle est ACTIVE sur le dossier (date renseignée ; pour le prêt, pas
// un achat comptant) et pas encore obtenue : offre de prêt reçue (statut NAS ou validation à la
// main), vente préalable marquée réalisée. Même définition que les rappels email (echeanceValidee).
//
// Transition vers le calendrier partagé (demandé par l'étude, 28/09) : une date déjà posée dans
// l'agenda Outlook par CLAIRE (d.agendaEcheances[type].itemId, voir /exchange/echeance) n'est plus
// publiée ici — elle y figurerait deux fois. Les dossiers existants, jamais repris d'office, restent
// publiés par ce flux jusqu'à leur prochaine modification de date : aucune date ne disparaît de
// l'agenda entre les deux.
function echeancePublieeAgenda(d, type) {
  if (!d || d.archive || !d[type]) return false;
  if (type === 'pret' && d.sansPret) return false;
  const pose = d.agendaEcheances && d.agendaEcheances[type];
  if (pose && pose.itemId) return false;
  return !echeanceValidee(d, type);
}

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

  const libelles = { pret: 'Obtention du prêt', ventebien: 'Vente préalable' };

  for (const d of dossiers) {
    const suffixe = ` — ${extraireNomAcquereur(d.nom)} - Dossier ${d.nom}`;
    const sequence = sequenceDepuisMaj(d.updatedAt);
    for (const cle of TYPES_PUBLIES_AGENDA) {
      if (echeancePublieeAgenda(d, cle)) {
        body += buildEvent(`${d.id}-${cle}`, `${libelles[cle]}${suffixe}`, d[cle], sequence);
      }
    }
  }

  body += 'END:VCALENDAR\r\n';
  return plierFluxIcs(body);
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
module.exports = { creerRouteurCalendrier, genererFluxIcs, echeancePublieeAgenda, sequenceDepuisMaj, echapperTexteIcs, plierLigneIcs };
