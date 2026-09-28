// Test de connexion à l'Exchange de l'office (hébergé chez Fichorga / Authentic Connect) par EWS,
// la même porte qu'Outlook — voir CLAUDE.md, section « Connexion Exchange (test) ». Microsoft Graph
// n'atteint pas ces boîtes (hébergées hors de Microsoft 365), d'où ce chemin.
//
// L'authentification Windows (NTLMv2) est déléguée à la bibliothèque httpntlm : on ne fait ici
// qu'une requête HTTP applicative, on ne construit aucun message d'authentification à la main.
//
// RÈGLES à ne pas assouplir :
//   - le mot de passe n'est ni journalisé, ni recopié dans un message d'erreur ou un diagnostic ;
//   - une seule tentative par appel : aucun réessai automatique (plusieurs échecs verrouillent le
//     compte de messagerie, exactement comme Outlook).
'use strict';

const httpntlm = require('httpntlm');

// Requête EWS en LECTURE SEULE : lire la fiche du dossier « Calendrier ». Prouve à la fois que
// l'authentification passe ET que le compte a bien accès à un agenda, sans rien créer ni modifier.
function corpsGetFolderCalendrier() {
  return '<?xml version="1.0" encoding="utf-8"?>'
    + '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"'
    + ' xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"'
    + ' xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages">'
    + '<soap:Header><t:RequestServerVersion Version="Exchange2013"/></soap:Header>'
    + '<soap:Body><m:GetFolder>'
    + '<m:FolderShape><t:BaseShape>Default</t:BaseShape></m:FolderShape>'
    + '<m:FolderIds><t:DistinguishedFolderId Id="calendar"/></m:FolderIds>'
    + '</m:GetFolder></soap:Body></soap:Envelope>';
}

// --- Création d'un rendez-vous dans l'agenda (CreateItem sur un CalendarItem) ---

function echapperXml(valeur) {
  return String(valeur == null ? '' : valeur)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// Décalage de Paris (en minutes à AJOUTER à UTC pour obtenir l'heure locale : +120 l'été, +60
// l'hiver) à un instant donné. Calculé via Intl pour ne JAMAIS dépendre du fuseau du serveur (le
// poste du bureau est à l'heure de Paris, mais l'environnement de développement tourne en UTC).
function decalageParisMinutes(instant) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const p = dtf.formatToParts(instant).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  const commeUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((commeUtc - instant.getTime()) / 60000);
}

// Heure d'horloge à Paris (« 2026-10-14 », « 14:30 ») → instant absolu (Date UTC). Convention
// standard « wall-clock dans un fuseau nommé → instant » : on part d'une supposition UTC, on lit le
// décalage de Paris à cet instant, on l'applique. Gère l'heure d'été/hiver correctement (la seule
// ambiguïté possible est dans l'heure repliée du changement d'heure, à 2-3h du matin — sans objet
// pour un rendez-vous notarial).
function instantUtcDepuisParis(dateStr, heureStr) {
  const [Y, M, D] = String(dateStr).split('-').map(Number);
  const [h, m] = String(heureStr || '00:00').split(':').map(Number);
  const suppose = Date.UTC(Y, (M || 1) - 1, D || 1, h || 0, m || 0);
  const dec = decalageParisMinutes(new Date(suppose));
  return new Date(suppose - dec * 60000);
}

function formatEwsUtc(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// Corps SOAP CreateItem pour un rendez-vous (CalendarItem). SendMeetingInvitations="SendToNone" :
// aucun participant, donc aucune invitation envoyée — c'est un simple repère dans l'agenda, comme
// ceux que l'étude saisit à la main. L'ORDRE des éléments suit le schéma EWS (éléments de ItemType
// puis de CalendarItemType) : le respecter est obligatoire, Exchange rejette un ordre différent.
// StartTimeZone/EndTimeZone (« Romance Standard Time » = Paris) associent le bon fuseau à l'instant
// UTC fourni, pour que l'affichage tombe sur la bonne heure locale dans Outlook.
function corpsCreateRendezVous({ sujet, dateStr, heureStr, dureeMinutes, lieu, corps }) {
  const debut = instantUtcDepuisParis(dateStr, heureStr);
  const fin = new Date(debut.getTime() + (dureeMinutes > 0 ? dureeMinutes : 60) * 60000);
  return '<?xml version="1.0" encoding="utf-8"?>'
    + '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"'
    + ' xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"'
    + ' xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages">'
    + '<soap:Header><t:RequestServerVersion Version="Exchange2013"/></soap:Header>'
    + '<soap:Body><m:CreateItem SendMeetingInvitations="SendToNone">'
    + '<m:SavedItemFolderId><t:DistinguishedFolderId Id="calendar"/></m:SavedItemFolderId>'
    + '<m:Items><t:CalendarItem>'
    + '<t:Subject>' + echapperXml(sujet) + '</t:Subject>'
    + '<t:Body BodyType="Text">' + echapperXml(corps || '') + '</t:Body>'
    + '<t:ReminderIsSet>true</t:ReminderIsSet>'
    + '<t:ReminderMinutesBeforeStart>1440</t:ReminderMinutesBeforeStart>'
    + '<t:Start>' + formatEwsUtc(debut) + '</t:Start>'
    + '<t:End>' + formatEwsUtc(fin) + '</t:End>'
    + '<t:IsAllDayEvent>false</t:IsAllDayEvent>'
    + '<t:LegacyFreeBusyStatus>Busy</t:LegacyFreeBusyStatus>'
    + (lieu ? '<t:Location>' + echapperXml(lieu) + '</t:Location>' : '')
    + '<t:StartTimeZone Id="Romance Standard Time"/>'
    + '<t:EndTimeZone Id="Romance Standard Time"/>'
    + '</t:CalendarItem></m:Items>'
    + '</m:CreateItem></soap:Body></soap:Envelope>';
}

// Interprète la réponse d'un CreateItem. Fonction PURE, testable sans réseau. Ne reçoit jamais le
// mot de passe. Renvoie l'identifiant de l'élément créé (utile plus tard pour retrouver/annuler le
// rendez-vous), jamais affiché tel quel à l'utilisateur.
function interpreterReponseCreation(statutHttp, corps) {
  const texte = String(corps || '');
  if (statutHttp === 401 || statutHttp === 403) {
    return { ok: false, raison: 'auth', message: "Identifiants refusés par le serveur. Vérifiez les identifiants de messagerie dans les Réglages." };
  }
  if (statutHttp >= 500 && !/ResponseCode|ResponseClass/.test(texte)) {
    return { ok: false, raison: 'serveur', message: 'Le serveur Exchange a renvoyé une erreur (' + statutHttp + ').' };
  }
  if (/ResponseClass="Success"/.test(texte) || /<m:ResponseCode>NoError<\/m:ResponseCode>/.test(texte)) {
    const itemId = (texte.match(/<t:ItemId[^>]*\bId="([^"]+)"/) || [])[1] || '';
    return { ok: true, message: 'Rendez-vous créé dans l\'agenda Outlook.', itemId };
  }
  const code = (texte.match(/<m:ResponseCode>([^<]+)<\/m:ResponseCode>/) || [])[1]
    || (texte.match(/<faultstring[^>]*>([^<]+)<\/faultstring>/) || [])[1] || '';
  return { ok: false, raison: 'ews', message: "La création du rendez-vous a échoué" + (code ? ' (' + code + ')' : '') + '.' };
}

// Un seul essai, mêmes règles que testerConnexionExchange (mot de passe jamais journalisé/renvoyé,
// aucun réessai automatique). `injections.poster` : uniquement pour les tests.
function creerRendezVousExchange({ url, email, motDePasse, rendezVous, delaiMs = 20000 }, injections = {}) {
  const poster = injections.poster || httpntlm.post;
  return new Promise((resolve) => {
    let repondu = false;
    const fini = (r) => { if (!repondu) { repondu = true; resolve(r); } };
    const minuteur = setTimeout(
      () => fini({ ok: false, raison: 'reseau', message: 'Le serveur Exchange n\'a pas répondu à temps.' }),
      delaiMs
    );
    try {
      poster({
        url,
        username: String(email || ''),
        password: String(motDePasse || ''),
        domain: '',
        headers: { 'Content-Type': 'text/xml; charset=utf-8' },
        body: corpsCreateRendezVous(rendezVous || {})
      }, (err, res) => {
        clearTimeout(minuteur);
        if (err) {
          fini({ ok: false, raison: 'reseau', message: 'Impossible de joindre le serveur Exchange : ' + (err.code || err.message || 'erreur réseau') + '.' });
          return;
        }
        fini(interpreterReponseCreation(res && res.statusCode, res && res.body));
      });
    } catch (e) {
      clearTimeout(minuteur);
      fini({ ok: false, raison: 'reseau', message: 'Impossible de joindre le serveur Exchange.' });
    }
  });
}

// Interprète la réponse d'Exchange. Fonction PURE (statut HTTP + corps), testable sans réseau ni
// serveur réel — voir server/test/ews.test.js. Ne reçoit jamais le mot de passe.
function interpreterReponseEws(statutHttp, corps) {
  const texte = String(corps || '');
  if (statutHttp === 401 || statutHttp === 403) {
    return {
      ok: false,
      raison: 'auth',
      message: "Identifiants refusés par le serveur. Vérifiez l'adresse email et le mot de passe de messagerie."
        + ' Si vous êtes certain des identifiants, le serveur exige peut-être une protection de connexion'
        + ' que ce test ne gère pas encore (à signaler).'
    };
  }
  if (statutHttp >= 500 && !/ResponseCode|ResponseClass/.test(texte)) {
    return { ok: false, raison: 'serveur', message: 'Le serveur Exchange a renvoyé une erreur (' + statutHttp + ').' };
  }
  if (/ResponseClass="Success"/.test(texte) || /<m:ResponseCode>NoError<\/m:ResponseCode>/.test(texte)) {
    const nom = (texte.match(/<t:DisplayName>([^<]*)<\/t:DisplayName>/) || [])[1] || '';
    return { ok: true, message: 'Connexion réussie' + (nom ? ' — agenda « ' + nom + ' » accessible.' : ', agenda accessible.') };
  }
  // 200 mais échec applicatif (SOAP Fault, ResponseClass="Error") : on remonte le code EWS s'il y est.
  const code = (texte.match(/<m:ResponseCode>([^<]+)<\/m:ResponseCode>/) || [])[1]
    || (texte.match(/<faultstring[^>]*>([^<]+)<\/faultstring>/) || [])[1] || '';
  return {
    ok: false,
    raison: 'ews',
    message: 'Connexion établie mais la lecture de l\'agenda a échoué' + (code ? ' (' + code + ')' : '') + '.'
  };
}

// Un seul essai, avec un délai maximal. `url` doit pointer vers .../EWS/Exchange.asmx.
// `injections` : uniquement pour les tests (faux transport). Jamais utilisé en production.
function testerConnexionExchange({ url, email, motDePasse, delaiMs = 20000 }, injections = {}) {
  const poster = injections.poster || httpntlm.post;
  return new Promise((resolve) => {
    let repondu = false;
    const fini = (r) => { if (!repondu) { repondu = true; resolve(r); } };
    const minuteur = setTimeout(
      () => fini({ ok: false, raison: 'reseau', message: 'Le serveur Exchange n\'a pas répondu à temps.' }),
      delaiMs
    );
    try {
      poster({
        url,
        username: String(email || ''),
        password: String(motDePasse || ''),
        domain: '',
        headers: { 'Content-Type': 'text/xml; charset=utf-8' },
        body: corpsGetFolderCalendrier()
      }, (err, res) => {
        clearTimeout(minuteur);
        if (err) {
          // Message d'erreur réseau seulement (code/host), jamais les identifiants.
          fini({ ok: false, raison: 'reseau', message: 'Impossible de joindre le serveur Exchange : ' + (err.code || err.message || 'erreur réseau') + '.' });
          return;
        }
        fini(interpreterReponseEws(res && res.statusCode, res && res.body));
      });
    } catch (e) {
      clearTimeout(minuteur);
      fini({ ok: false, raison: 'reseau', message: 'Impossible de joindre le serveur Exchange.' });
    }
  });
}

module.exports = {
  corpsGetFolderCalendrier, interpreterReponseEws, testerConnexionExchange,
  corpsCreateRendezVous, interpreterReponseCreation, creerRendezVousExchange,
  instantUtcDepuisParis, decalageParisMinutes
};
