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

// Cible du dossier « Calendrier » : celui du compte de connexion par défaut, ou — quand `mailbox`
// est renseignée — le calendrier PARTAGÉ d'une autre boîte (celui de Sophie, où vivent réellement
// les rendez-vous de l'office). Un <t:Mailbox><t:EmailAddress> dans le DistinguishedFolderId adresse
// le dossier « calendar » de CETTE boîte ; le compte de connexion doit y avoir un accès délégué.
function folderCalendrierXml(mailbox) {
  const m = typeof mailbox === 'string' ? mailbox.trim() : '';
  if (!m) return '<t:DistinguishedFolderId Id="calendar"/>';
  return '<t:DistinguishedFolderId Id="calendar"><t:Mailbox><t:EmailAddress>'
    + echapperXml(m) + '</t:EmailAddress></t:Mailbox></t:DistinguishedFolderId>';
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
function corpsCreateRendezVous({ sujet, dateStr, heureStr, dureeMinutes, lieu, corps, mailbox }) {
  const debut = instantUtcDepuisParis(dateStr, heureStr);
  const fin = new Date(debut.getTime() + (dureeMinutes > 0 ? dureeMinutes : 60) * 60000);
  return '<?xml version="1.0" encoding="utf-8"?>'
    + '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"'
    + ' xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"'
    + ' xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages">'
    + '<soap:Header><t:RequestServerVersion Version="Exchange2013"/></soap:Header>'
    + '<soap:Body><m:CreateItem SendMeetingInvitations="SendToNone">'
    + '<m:SavedItemFolderId>' + folderCalendrierXml(mailbox) + '</m:SavedItemFolderId>'
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
// rendez-vous), jamais affiché tel quel à l'utilisateur. `messageSucces` permet de réutiliser la
// même interprétation pour un rendez-vous ou un brouillon (l'échec en dit la nature via le verbe).
function interpreterReponseCreation(statutHttp, corps, messageSucces, actionEchec) {
  const texte = String(corps || '');
  const succes = messageSucces || 'Rendez-vous créé dans l\'agenda Outlook.';
  const echec = actionEchec || 'La création du rendez-vous a échoué';
  if (statutHttp === 401 || statutHttp === 403) {
    return { ok: false, raison: 'auth', message: "Identifiants refusés par le serveur. Vérifiez les identifiants de messagerie dans les Réglages." };
  }
  if (statutHttp >= 500 && !/ResponseCode|ResponseClass/.test(texte)) {
    return { ok: false, raison: 'serveur', message: 'Le serveur Exchange a renvoyé une erreur (' + statutHttp + ').' };
  }
  if (/ResponseClass="Success"/.test(texte) || /<m:ResponseCode>NoError<\/m:ResponseCode>/.test(texte)) {
    const itemId = (texte.match(/<t:ItemId[^>]*\bId="([^"]+)"/) || [])[1] || '';
    return { ok: true, message: succes, itemId };
  }
  const code = (texte.match(/<m:ResponseCode>([^<]+)<\/m:ResponseCode>/) || [])[1]
    || (texte.match(/<faultstring[^>]*>([^<]+)<\/faultstring>/) || [])[1] || '';
  return { ok: false, raison: 'ews', message: echec + (code ? ' (' + code + ')' : '') + '.' };
}

// Corps SOAP CreateItem pour un BROUILLON d'email (Message), enregistré dans le dossier « Brouillons »
// (MessageDisposition="SaveOnly", jamais envoyé automatiquement — l'étude relit et envoie elle-même
// depuis Outlook). C'est ce qui permet de JOINDRE un fichier, ce qu'un `mailto:` ne sait pas faire.
// ORDRE des éléments (schéma EWS) : ceux de ItemType d'abord (Subject, Body, Attachments), PUIS ceux
// de MessageType (ToRecipients) — Attachments appartient à ItemType, donc AVANT ToRecipients.
// `pieces` : [{ nom, contenuBase64, type }].
function corpsCreateBrouillon({ destinataire, sujet, corps, pieces }) {
  const jointes = (Array.isArray(pieces) ? pieces : []).map((p) => (
    '<t:FileAttachment>'
    + '<t:Name>' + echapperXml(p && p.nom ? p.nom : 'piece-jointe') + '</t:Name>'
    + (p && p.type ? '<t:ContentType>' + echapperXml(p.type) + '</t:ContentType>' : '')
    + '<t:IsInline>false</t:IsInline>'
    + '<t:Content>' + String(p && p.contenuBase64 ? p.contenuBase64 : '') + '</t:Content>'
    + '</t:FileAttachment>'
  )).join('');
  return '<?xml version="1.0" encoding="utf-8"?>'
    + '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"'
    + ' xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"'
    + ' xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages">'
    + '<soap:Header><t:RequestServerVersion Version="Exchange2013"/></soap:Header>'
    + '<soap:Body><m:CreateItem MessageDisposition="SaveOnly">'
    + '<m:SavedItemFolderId><t:DistinguishedFolderId Id="drafts"/></m:SavedItemFolderId>'
    + '<m:Items><t:Message>'
    + '<t:Subject>' + echapperXml(sujet) + '</t:Subject>'
    + '<t:Body BodyType="Text">' + echapperXml(corps || '') + '</t:Body>'
    + (jointes ? '<t:Attachments>' + jointes + '</t:Attachments>' : '')
    + '<t:ToRecipients><t:Mailbox><t:EmailAddress>' + echapperXml(destinataire) + '</t:EmailAddress></t:Mailbox></t:ToRecipients>'
    + '</t:Message></m:Items>'
    + '</m:CreateItem></soap:Body></soap:Envelope>';
}

// Un seul essai, mêmes règles que testerConnexionExchange/creerRendezVousExchange (mot de passe
// jamais journalisé/renvoyé, aucun réessai automatique). `injections.poster` : pour les tests.
function creerBrouillonExchange({ url, email, motDePasse, brouillon, delaiMs = 30000 }, injections = {}) {
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
        body: corpsCreateBrouillon(brouillon || {})
      }, (err, res) => {
        clearTimeout(minuteur);
        if (err) {
          fini({ ok: false, raison: 'reseau', message: 'Impossible de joindre le serveur Exchange : ' + (err.code || err.message || 'erreur réseau') + '.' });
          return;
        }
        fini(interpreterReponseCreation(res && res.statusCode, res && res.body,
          'Brouillon créé dans Outlook (avec la pièce jointe).', 'La création du brouillon a échoué'));
      });
    } catch (e) {
      clearTimeout(minuteur);
      fini({ ok: false, raison: 'reseau', message: 'Impossible de joindre le serveur Exchange.' });
    }
  });
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

// --- Noter dans un rendez-vous EXISTANT (FindItem pour le retrouver, UpdateItem pour son lieu) ---
//
// Sert à écrire « Appel de fonds envoyé » dans le LIEU du rendez-vous de signature, à la demande de
// l'étude (voir routes/exchange.js, POST /exchange/rendez-vous/lieu). Deux opérations EWS : d'abord
// FindItem (CalendarView sur la journée du rendez-vous) pour obtenir l'ItemId + ChangeKey de
// l'événement, puis UpdateItem/SetItemField sur calendar:Location. Chacune est un seul essai, sans
// réessai automatique — mêmes règles que le reste de ce fichier (mot de passe jamais journalisé ni
// renvoyé). Le rapprochement de l'événement au dossier (par la référence « VTE - … » du titre) se
// fait dans la route, avec les fonctions déjà écrites d'agendaOffice.js : ces fonctions-ci ne font
// que le transport et l'analyse XML.

function desechapperXml(s) {
  return String(s == null ? '' : s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&'); // &amp; en dernier pour ne pas re-décoder une entité déjà décodée
}

// Jour civil de Paris [00:00, lendemain 00:00[ en instants UTC (chaînes EWS), pour une CalendarView
// couvrant tout le rendez-vous quel que soit son horaire. Réutilise instantUtcDepuisParis (gère
// l'heure d'été/hiver), donc indépendant du fuseau du serveur.
function dateSuivanteIso(dateIso) {
  const [Y, M, D] = String(dateIso).split('-').map(Number);
  const d = new Date(Date.UTC(Y, (M || 1) - 1, D || 1));
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
function fenetreJourneeParis(dateIso) {
  return {
    debutUtc: formatEwsUtc(instantUtcDepuisParis(dateIso, '00:00')),
    finUtc: formatEwsUtc(instantUtcDepuisParis(dateSuivanteIso(dateIso), '00:00'))
  };
}

// FindItem sur le dossier « Calendrier », vue calendrier bornée à la journée — renvoie l'ItemId,
// le ChangeKey, le sujet et le lieu de chaque rendez-vous, de quoi retrouver le bon et le mettre à
// jour ensuite. IdOnly + AdditionalProperties : on ne rapatrie que ce qu'il faut.
function corpsFindRendezVous({ debutUtc, finUtc, mailbox }) {
  return '<?xml version="1.0" encoding="utf-8"?>'
    + '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"'
    + ' xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"'
    + ' xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages">'
    + '<soap:Header><t:RequestServerVersion Version="Exchange2013"/></soap:Header>'
    + '<soap:Body><m:FindItem Traversal="Shallow">'
    + '<m:ItemShape><t:BaseShape>IdOnly</t:BaseShape>'
    + '<t:AdditionalProperties>'
    + '<t:FieldURI FieldURI="item:Subject"/>'
    + '<t:FieldURI FieldURI="calendar:Location"/>'
    + '</t:AdditionalProperties></m:ItemShape>'
    + '<m:CalendarView StartDate="' + debutUtc + '" EndDate="' + finUtc + '"/>'
    + '<m:ParentFolderIds>' + folderCalendrierXml(mailbox) + '</m:ParentFolderIds>'
    + '</m:FindItem></soap:Body></soap:Envelope>';
}

// Analyse la réponse d'un FindItem. Fonction PURE, testable sans réseau. L'attribut ItemId est
// auto-fermant (<t:ItemId Id="…" ChangeKey="…"/>) ; sujet et lieu sont dés-échappés. Un événement
// sans Id ou ChangeKey exploitable est ignoré (on ne pourrait pas le mettre à jour).
function parseFindRendezVous(corps) {
  const texte = String(corps || '');
  const evenements = [];
  const re = /<t:CalendarItem\b[\s\S]*?<\/t:CalendarItem>/g;
  let m;
  while ((m = re.exec(texte)) !== null) {
    const bloc = m[0];
    const idTag = (bloc.match(/<t:ItemId\b[^>]*>/) || [])[0] || '';
    const itemId = (idTag.match(/\bId="([^"]+)"/) || [])[1] || '';
    const changeKey = (idTag.match(/\bChangeKey="([^"]+)"/) || [])[1] || '';
    if (!itemId || !changeKey) continue;
    const subject = desechapperXml((bloc.match(/<t:Subject>([\s\S]*?)<\/t:Subject>/) || [])[1] || '');
    const location = desechapperXml((bloc.match(/<t:Location>([\s\S]*?)<\/t:Location>/) || [])[1] || '');
    evenements.push({ itemId, changeKey, subject, location });
  }
  return evenements;
}

// UpdateItem/SetItemField sur le seul champ calendar:Location. SendMeetingInvitationsOrCancellations
// ="SendToNone" : l'événement n'a aucun participant, aucune mise à jour n'est diffusée. Le wrapper
// <t:CalendarItem> autour de <t:Location> est requis par le schéma EWS d'un SetItemField.
function corpsUpdateLieu({ itemId, changeKey, lieu }) {
  return '<?xml version="1.0" encoding="utf-8"?>'
    + '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"'
    + ' xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"'
    + ' xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages">'
    + '<soap:Header><t:RequestServerVersion Version="Exchange2013"/></soap:Header>'
    + '<soap:Body>'
    + '<m:UpdateItem ConflictResolution="AutoResolve" SendMeetingInvitationsOrCancellations="SendToNone">'
    + '<m:ItemChanges><t:ItemChange>'
    + '<t:ItemId Id="' + echapperXml(itemId) + '" ChangeKey="' + echapperXml(changeKey) + '"/>'
    + '<t:Updates><t:SetItemField>'
    + '<t:FieldURI FieldURI="calendar:Location"/>'
    + '<t:CalendarItem><t:Location>' + echapperXml(lieu) + '</t:Location></t:CalendarItem>'
    + '</t:SetItemField></t:Updates>'
    + '</t:ItemChange></m:ItemChanges>'
    + '</m:UpdateItem></soap:Body></soap:Envelope>';
}

// Réutilise l'interprétation de CreateItem (Success → ok), avec des libellés propres à la mise à jour.
function interpreterReponseUpdate(statutHttp, corps) {
  return interpreterReponseCreation(statutHttp, corps,
    'Agenda mis à jour.', 'La mise à jour du rendez-vous a échoué');
}

// FindItem — un seul essai. Renvoie { ok:true, evenements:[…] } ou { ok:false, message }. Ne reçoit
// jamais le mot de passe dans un message. `injections.poster` : uniquement pour les tests.
function trouverRendezVousExchange({ url, email, motDePasse, debutUtc, finUtc, mailbox, delaiMs = 20000 }, injections = {}) {
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
        body: corpsFindRendezVous({ debutUtc, finUtc, mailbox })
      }, (err, res) => {
        clearTimeout(minuteur);
        if (err) {
          fini({ ok: false, raison: 'reseau', message: 'Impossible de joindre le serveur Exchange : ' + (err.code || err.message || 'erreur réseau') + '.' });
          return;
        }
        const statut = res && res.statusCode;
        const body = String((res && res.body) || '');
        if (statut === 401 || statut === 403) {
          fini({ ok: false, raison: 'auth', message: 'Identifiants refusés par le serveur. Vérifiez les identifiants de messagerie dans les Réglages.' });
          return;
        }
        if (statut >= 500 && !/ResponseCode|ResponseClass/.test(body)) {
          fini({ ok: false, raison: 'serveur', message: 'Le serveur Exchange a renvoyé une erreur (' + statut + ').' });
          return;
        }
        if (/ResponseClass="Success"/.test(body) || /<m:ResponseCode>NoError<\/m:ResponseCode>/.test(body)) {
          fini({ ok: true, evenements: parseFindRendezVous(body) });
          return;
        }
        const code = (body.match(/<m:ResponseCode>([^<]+)<\/m:ResponseCode>/) || [])[1]
          || (body.match(/<faultstring[^>]*>([^<]+)<\/faultstring>/) || [])[1] || '';
        fini({ ok: false, raison: 'ews', message: 'La lecture de l\'agenda a échoué' + (code ? ' (' + code + ')' : '') + '.' });
      });
    } catch (e) {
      clearTimeout(minuteur);
      fini({ ok: false, raison: 'reseau', message: 'Impossible de joindre le serveur Exchange.' });
    }
  });
}

// UpdateItem — un seul essai. `injections.poster` : uniquement pour les tests.
function mettreAJourLieuExchange({ url, email, motDePasse, itemId, changeKey, lieu, delaiMs = 20000 }, injections = {}) {
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
        body: corpsUpdateLieu({ itemId, changeKey, lieu })
      }, (err, res) => {
        clearTimeout(minuteur);
        if (err) {
          fini({ ok: false, raison: 'reseau', message: 'Impossible de joindre le serveur Exchange : ' + (err.code || err.message || 'erreur réseau') + '.' });
          return;
        }
        fini(interpreterReponseUpdate(res && res.statusCode, res && res.body));
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
  corpsCreateBrouillon, creerBrouillonExchange,
  instantUtcDepuisParis, decalageParisMinutes,
  desechapperXml, fenetreJourneeParis, corpsFindRendezVous, parseFindRendezVous,
  corpsUpdateLieu, interpreterReponseUpdate, trouverRendezVousExchange, mettreAJourLieuExchange,
  folderCalendrierXml
};
