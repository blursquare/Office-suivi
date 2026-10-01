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
// `provisoire` : option d'un sondage de créneaux — « Provisoire » (Tentative) dans Outlook, sans
// rappel.
function corpsCreateRendezVous({ sujet, dateStr, heureStr, dureeMinutes, lieu, corps, mailbox, categorie, provisoire }) {
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
    // Catégorie Outlook = code couleur de l'étude (office, visio, confrère). Élément de ItemType :
    // après Body, avant les éléments de rappel — l'ordre du schéma EWS est obligatoire. La couleur
    // vient de la liste des catégories de la boîte : un nom qu'elle ne connaît pas s'affiche sans
    // couleur, d'où des noms réglables dans CLAIRE.
    + (categorie ? '<t:Categories><t:String>' + echapperXml(categorie) + '</t:String></t:Categories>' : '')
    + '<t:ReminderIsSet>' + (provisoire ? 'false' : 'true') + '</t:ReminderIsSet>'
    + (provisoire ? '' : '<t:ReminderMinutesBeforeStart>1440</t:ReminderMinutesBeforeStart>')
    + '<t:Start>' + formatEwsUtc(debut) + '</t:Start>'
    + '<t:End>' + formatEwsUtc(fin) + '</t:End>'
    + '<t:IsAllDayEvent>false</t:IsAllDayEvent>'
    + '<t:LegacyFreeBusyStatus>' + (provisoire ? 'Tentative' : 'Busy') + '</t:LegacyFreeBusyStatus>'
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
    // ChangeKey aussi : un UpdateItem en renvoie un NOUVEAU, et le prochain UpdateItem sur le même
    // événement doit présenter celui-là (voir mettreAJourEcheanceExchange).
    const idTag = (texte.match(/<t:ItemId\b[^>]*>/) || [])[0] || '';
    const itemId = (idTag.match(/\bId="([^"]+)"/) || [])[1] || '';
    const changeKey = (idTag.match(/\bChangeKey="([^"]+)"/) || [])[1] || '';
    return { ok: true, message: succes, itemId, changeKey };
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
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    // Références numériques : Exchange écrit le retour chariot d'un corps « &#xD; » (étude, 01/10 :
    // il traînait en clair dans les notes d'un rendez-vous).
    .replace(/&#(?:x([0-9a-f]{1,6})|(\d{1,7}));/gi, (t, h, n) => { const c = h ? parseInt(h, 16) : Number(n); return c > 0 && c <= 0x10ffff ? String.fromCodePoint(c) : t; })
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
    + '<t:FieldURI FieldURI="calendar:Start"/>'
    + '<t:FieldURI FieldURI="calendar:End"/>'
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
    const start = ((bloc.match(/<t:Start>([^<]+)<\/t:Start>/) || [])[1] || '').trim();
    const end = ((bloc.match(/<t:End>([^<]+)<\/t:End>/) || [])[1] || '').trim();
    evenements.push({ itemId, changeKey, subject, location, start, end });
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

// --- Lecture de l'agenda de l'office (remplace le flux .ics publié, 29/09) ---
//
// Le calendrier partagé de Sophie est lu directement par EWS (FindItem + CalendarView, qui développe
// les rendez-vous récurrents) : les rendez-vous « VTE - … », la mention d'envoi notée dans le Lieu,
// les catégories (couleurs) et les absences en journée entière. Le corps du rendez-vous n'est pas
// lu : FindItem ne le renvoie pas, et la convention de l'étude tient dans le titre et le Lieu.

// Fenêtre lue à chaque tour : six mois à partir d'aujourd'hui, en tranches de 62 jours pour rester
// loin de la limite de résultats d'un FindItem (1 000 par défaut sur Exchange 2019).
const JOURS_PAR_TRANCHE_CALENDRIER = 62;
const TRANCHES_CALENDRIER = 3;

function corpsLireCalendrier({ debutUtc, finUtc, mailbox }) {
  return ENVELOPPE_DEBUT
    + '<m:FindItem Traversal="Shallow">'
    + '<m:ItemShape><t:BaseShape>IdOnly</t:BaseShape>'
    + '<t:AdditionalProperties>'
    + '<t:FieldURI FieldURI="item:Subject"/>'
    + '<t:FieldURI FieldURI="item:Categories"/>'
    + '<t:FieldURI FieldURI="calendar:Location"/>'
    + '<t:FieldURI FieldURI="calendar:Start"/>'
    + '<t:FieldURI FieldURI="calendar:End"/>'
    + '<t:FieldURI FieldURI="calendar:IsAllDayEvent"/>'
    + '<t:FieldURI FieldURI="calendar:IsCancelled"/>'
    + '</t:AdditionalProperties></m:ItemShape>'
    + '<m:CalendarView StartDate="' + debutUtc + '" EndDate="' + finUtc + '"/>'
    + '<m:ParentFolderIds>' + folderCalendrierXml(mailbox) + '</m:ParentFolderIds>'
    + '</m:FindItem>' + ENVELOPPE_FIN;
}

// Réponse d'un FindItem de lecture → { evenements, complet }. PURE. `complet` est faux quand
// Exchange a coupé la liste (IncludesLastItemInRange="false") : l'appelant ne doit alors rien en
// conclure (un rendez-vous manquant passerait pour retiré de l'agenda).
function parseCalendrierEws(corps) {
  const texte = String(corps || '');
  const evenements = [];
  const re = /<t:CalendarItem\b[\s\S]*?<\/t:CalendarItem>/g;
  let m;
  while ((m = re.exec(texte)) !== null) {
    const bloc = m[0];
    const idTag = (bloc.match(/<t:ItemId\b[^>]*>/) || [])[0] || '';
    const valeur = (balise) => {
      const r = new RegExp('<t:' + balise + '>([\\s\\S]*?)</t:' + balise + '>');
      return desechapperXml((bloc.match(r) || [])[1] || '').trim();
    };
    const blocCategories = (bloc.match(/<t:Categories>([\s\S]*?)<\/t:Categories>/) || [])[1] || '';
    const categories = [];
    const reCat = /<t:String>([\s\S]*?)<\/t:String>/g;
    let c;
    while ((c = reCat.exec(blocCategories)) !== null) {
      const nom = desechapperXml(c[1]).trim();
      if (nom) categories.push(nom);
    }
    evenements.push({
      itemId: (idTag.match(/\bId="([^"]+)"/) || [])[1] || '',
      changeKey: (idTag.match(/\bChangeKey="([^"]+)"/) || [])[1] || '',
      subject: valeur('Subject'),
      location: valeur('Location'),
      start: valeur('Start'),
      end: valeur('End'),
      allDay: valeur('IsAllDayEvent') === 'true',
      cancelled: valeur('IsCancelled') === 'true',
      categories
    });
  }
  return { evenements, complet: !/IncludesLastItemInRange="false"/.test(texte) };
}

// Lit la fenêtre complète (toutes les tranches), en s'arrêtant au PREMIER échec : un refus
// d'identifiants n'est jamais présenté une seconde fois dans le même tour. Chaque tranche est un
// seul essai. Renvoie { ok:true, evenements } (dédoublonnés par ItemId : une absence à cheval sur
// deux tranches revient deux fois) ou { ok:false, raison, message }.
async function lireCalendrierExchange({ url, email, motDePasse, mailbox, aujourdHui, tranches, jours, delaiMs }, injections) {
  const nb = tranches || TRANCHES_CALENDRIER;
  // `jours` : longueur d'une tranche (une semaine pour la comparaison avec l'an dernier).
  const joursTranche = Number.isInteger(jours) && jours > 0 ? Math.min(jours, JOURS_PAR_TRANCHE_CALENDRIER) : JOURS_PAR_TRANCHE_CALENDRIER;
  const vus = new Set();
  const evenements = [];
  let debut = aujourdHui;
  for (let i = 0; i < nb; i++) {
    let fin = debut;
    for (let j = 0; j < joursTranche; j++) fin = dateSuivanteIso(fin);
    const r = await posterEws({
      url, email, motDePasse, delaiMs,
      body: corpsLireCalendrier({
        debutUtc: formatEwsUtc(instantUtcDepuisParis(debut, '00:00')),
        finUtc: formatEwsUtc(instantUtcDepuisParis(fin, '00:00')),
        mailbox
      })
    }, injections);
    if (r.echec) return r.echec;
    const corpsTexte = String(r.corps || '');
    if (r.statut === 401 || r.statut === 403) {
      return { ok: false, raison: 'auth', message: 'Identifiants de messagerie refusés par le serveur Exchange.' };
    }
    if (!/ResponseClass="Success"/.test(corpsTexte)) {
      const code = (corpsTexte.match(/<m:ResponseCode>([^<]+)<\/m:ResponseCode>/) || [])[1]
        || (corpsTexte.match(/<faultstring[^>]*>([^<]+)<\/faultstring>/) || [])[1] || '';
      const acces = /ErrorAccessDenied|ErrorFolderNotFound|ErrorNonExistentMailbox|ErrorItemNotFound/.test(code);
      return {
        ok: false,
        raison: acces ? 'acces' : 'ews',
        message: acces
          ? `Le compte de connexion n'a pas accès au calendrier partagé (${code}) : vérifiez l'adresse du calendrier et le partage dans Outlook.`
          : `La lecture de l'agenda a échoué${code ? ' (' + code + ')' : r.statut ? ' (' + r.statut + ')' : ''}.`
      };
    }
    const lu = parseCalendrierEws(corpsTexte);
    if (!lu.complet) {
      return { ok: false, raison: 'tronque', message: "Exchange n'a pas renvoyé tous les rendez-vous de la période : rien n'a été appliqué." };
    }
    for (const e of lu.evenements) {
      const cle = e.itemId || `${e.subject}|${e.start}|${e.end}`;
      if (vus.has(cle)) continue;
      vus.add(cle);
      evenements.push(e);
    }
    debut = fin;
  }
  return { ok: true, evenements };
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

// --- Dates butoir (obtention du prêt, vente préalable) posées dans l'agenda partagé ---
//
// Demandé par l'étude : ces deux dates ne passent plus par le flux .ics de CLAIRE, elles sont
// écrites directement dans le calendrier partagé de l'office. Un événement « toute la journée » par
// échéance, sans rappel Outlook (les rappels J-15/J-7 partent déjà par email) et marqué « Libre » :
// une date butoir ne bloque pas la journée. CLAIRE garde l'ItemId + ChangeKey de chaque événement
// créé, ce qui permet de le DÉPLACER quand la date change et de le RETIRER quand la condition est
// levée (offre reçue, vente préalable réalisée) ou la date effacée — jamais de le deviner par son
// titre. Mêmes règles que le reste du fichier : un seul essai, mot de passe jamais renvoyé.

const ENVELOPPE_DEBUT = '<?xml version="1.0" encoding="utf-8"?>'
  + '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"'
  + ' xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"'
  + ' xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages">'
  + '<soap:Header><t:RequestServerVersion Version="Exchange2013"/></soap:Header><soap:Body>';
const ENVELOPPE_FIN = '</soap:Body></soap:Envelope>';

// Minuit à Paris le jour J → minuit le lendemain : les bornes d'un événement « toute la journée ».
// Associées au fuseau Romance Standard Time à la création, elles tombent sur le bon jour dans
// Outlook quel que soit le fuseau du serveur.
function bornesJourneeEntiere(dateStr) {
  return {
    debut: formatEwsUtc(instantUtcDepuisParis(dateStr, '00:00')),
    fin: formatEwsUtc(instantUtcDepuisParis(dateSuivanteIso(dateStr), '00:00'))
  };
}

function corpsCreateEcheance({ sujet, dateStr, corps, mailbox }) {
  const { debut, fin } = bornesJourneeEntiere(dateStr);
  return ENVELOPPE_DEBUT
    + '<m:CreateItem SendMeetingInvitations="SendToNone">'
    + '<m:SavedItemFolderId>' + folderCalendrierXml(mailbox) + '</m:SavedItemFolderId>'
    + '<m:Items><t:CalendarItem>'
    + '<t:Subject>' + echapperXml(sujet) + '</t:Subject>'
    + '<t:Body BodyType="Text">' + echapperXml(corps || '') + '</t:Body>'
    + '<t:ReminderIsSet>false</t:ReminderIsSet>'
    + '<t:Start>' + debut + '</t:Start>'
    + '<t:End>' + fin + '</t:End>'
    + '<t:IsAllDayEvent>true</t:IsAllDayEvent>'
    + '<t:LegacyFreeBusyStatus>Free</t:LegacyFreeBusyStatus>'
    + '<t:StartTimeZone Id="Romance Standard Time"/>'
    + '<t:EndTimeZone Id="Romance Standard Time"/>'
    + '</t:CalendarItem></m:Items>'
    + '</m:CreateItem>' + ENVELOPPE_FIN;
}

// Déplace l'événement : Start et End dans la même requête (Exchange refuse un End antérieur au
// Start, même transitoirement). Rien d'autre n'est touché — ni le titre, ni une catégorie de
// couleur que l'étude aurait posée à la main.
function corpsUpdateEcheanceDate({ itemId, changeKey, dateStr }) {
  const { debut, fin } = bornesJourneeEntiere(dateStr);
  return ENVELOPPE_DEBUT
    + '<m:UpdateItem ConflictResolution="AutoResolve" SendMeetingInvitationsOrCancellations="SendToNone">'
    + '<m:ItemChanges><t:ItemChange>'
    + '<t:ItemId Id="' + echapperXml(itemId) + '" ChangeKey="' + echapperXml(changeKey) + '"/>'
    + '<t:Updates>'
    + '<t:SetItemField><t:FieldURI FieldURI="calendar:Start"/>'
    + '<t:CalendarItem><t:Start>' + debut + '</t:Start></t:CalendarItem></t:SetItemField>'
    + '<t:SetItemField><t:FieldURI FieldURI="calendar:End"/>'
    + '<t:CalendarItem><t:End>' + fin + '</t:End></t:CalendarItem></t:SetItemField>'
    + '</t:Updates>'
    + '</t:ItemChange></m:ItemChanges>'
    + '</m:UpdateItem>' + ENVELOPPE_FIN;
}

// Heure d'horloge à Paris (« 14:30 ») d'un instant EWS (« 2026-10-14T12:30:00Z »). Pure.
function heureParisDepuisInstant(isoUtc) {
  const t = Date.parse(isoUtc);
  if (!Number.isFinite(t)) return '';
  const local = new Date(t + decalageParisMinutes(new Date(t)) * 60000);
  return local.toISOString().slice(11, 16);
}

// Nouveau début/fin d'un rendez-vous déplacé à `nouvelleDate` : même heure d'horloge à Paris, même
// durée. Pure, testable. Durée illisible → 1 h.
function horaireDeplace({ start, end }, nouvelleDate) {
  const heure = heureParisDepuisInstant(start) || '14:00';
  const debut = instantUtcDepuisParis(nouvelleDate, heure);
  const duree = Date.parse(end) - Date.parse(start);
  const fin = new Date(debut.getTime() + (Number.isFinite(duree) && duree > 0 ? duree : 3600000));
  return { heure, debut: formatEwsUtc(debut), fin: formatEwsUtc(fin) };
}

// Déplace un rendez-vous horodaté : Start et End dans la même requête, rien d'autre (ni titre, ni
// lieu, ni catégorie de couleur).
function corpsUpdateRendezVousHoraire({ itemId, changeKey, debut, fin }) {
  return ENVELOPPE_DEBUT
    + '<m:UpdateItem ConflictResolution="AutoResolve" SendMeetingInvitationsOrCancellations="SendToNone">'
    + '<m:ItemChanges><t:ItemChange>'
    + '<t:ItemId Id="' + echapperXml(itemId) + '" ChangeKey="' + echapperXml(changeKey) + '"/>'
    + '<t:Updates>'
    + '<t:SetItemField><t:FieldURI FieldURI="calendar:Start"/>'
    + '<t:CalendarItem><t:Start>' + debut + '</t:Start></t:CalendarItem></t:SetItemField>'
    + '<t:SetItemField><t:FieldURI FieldURI="calendar:End"/>'
    + '<t:CalendarItem><t:End>' + fin + '</t:End></t:CalendarItem></t:SetItemField>'
    + '</t:Updates>'
    + '</t:ItemChange></m:ItemChanges>'
    + '</m:UpdateItem>' + ENVELOPPE_FIN;
}

// MoveToDeletedItems, jamais HardDelete : un retrait par erreur se récupère dans les éléments
// supprimés de la boîte partagée.
function corpsDeleteEcheance({ itemId, changeKey }) {
  return ENVELOPPE_DEBUT
    + '<m:DeleteItem DeleteType="MoveToDeletedItems" SendMeetingCancellations="SendToNone">'
    + '<m:ItemIds><t:ItemId Id="' + echapperXml(itemId) + '"'
    + (changeKey ? ' ChangeKey="' + echapperXml(changeKey) + '"' : '') + '/></m:ItemIds>'
    + '</m:DeleteItem>' + ENVELOPPE_FIN;
}

// Un événement déjà effacé à la main dans Outlook (ErrorItemNotFound) : l'état voulu — plus
// d'événement — est atteint, ce n'est pas un échec.
function interpreterReponseSuppression(statutHttp, corps) {
  const texte = String(corps || '');
  const code = (texte.match(/<m:ResponseCode>([^<]+)<\/m:ResponseCode>/) || [])[1] || '';
  if (code === 'ErrorItemNotFound') {
    return { ok: true, message: "L'événement n'était déjà plus dans l'agenda." };
  }
  return interpreterReponseCreation(statutHttp, corps,
    "Événement retiré de l'agenda.", 'Le retrait de l\'événement a échoué');
}

// Transport commun aux trois opérations ci-dessus : un seul essai, délai borné, erreur réseau
// réduite à son code (jamais les identifiants). `injections.poster` : pour les tests.
function posterEws({ url, email, motDePasse, body, delaiMs = 20000 }, injections = {}) {
  const poster = injections.poster || httpntlm.post;
  return new Promise((resolve) => {
    let repondu = false;
    const fini = (r) => { if (!repondu) { repondu = true; resolve(r); } };
    const minuteur = setTimeout(
      () => fini({ echec: { ok: false, raison: 'reseau', message: 'Le serveur Exchange n\'a pas répondu à temps.' } }),
      delaiMs
    );
    try {
      poster({
        url,
        username: String(email || ''),
        password: String(motDePasse || ''),
        domain: '',
        headers: { 'Content-Type': 'text/xml; charset=utf-8' },
        body
      }, (err, res) => {
        clearTimeout(minuteur);
        if (err) {
          fini({ echec: { ok: false, raison: 'reseau', message: 'Impossible de joindre le serveur Exchange : ' + (err.code || err.message || 'erreur réseau') + '.' } });
          return;
        }
        fini({ statut: res && res.statusCode, corps: res && res.body });
      });
    } catch (e) {
      clearTimeout(minuteur);
      fini({ echec: { ok: false, raison: 'reseau', message: 'Impossible de joindre le serveur Exchange.' } });
    }
  });
}

async function creerEcheanceExchange({ url, email, motDePasse, echeance, delaiMs }, injections) {
  const r = await posterEws({ url, email, motDePasse, delaiMs, body: corpsCreateEcheance(echeance || {}) }, injections);
  if (r.echec) return r.echec;
  return interpreterReponseCreation(r.statut, r.corps,
    "Date posée dans l'agenda.", 'La création de l\'événement a échoué');
}

async function mettreAJourEcheanceExchange({ url, email, motDePasse, itemId, changeKey, dateStr, delaiMs }, injections) {
  const r = await posterEws({ url, email, motDePasse, delaiMs, body: corpsUpdateEcheanceDate({ itemId, changeKey, dateStr }) }, injections);
  if (r.echec) return r.echec;
  // Effacé à la main dans Outlook : rien à déplacer, le client oubliera l'identifiant et recréera.
  if (/<m:ResponseCode>ErrorItemNotFound<\/m:ResponseCode>/.test(String(r.corps || ''))) {
    return { ok: false, introuvable: true, raison: 'ews', message: "L'événement n'est plus dans l'agenda." };
  }
  return interpreterReponseCreation(r.statut, r.corps,
    "Date déplacée dans l'agenda.", 'Le déplacement de l\'événement a échoué');
}

async function supprimerEcheanceExchange({ url, email, motDePasse, itemId, changeKey, delaiMs }, injections) {
  const r = await posterEws({ url, email, motDePasse, delaiMs, body: corpsDeleteEcheance({ itemId, changeKey }) }, injections);
  if (r.echec) return r.echec;
  return interpreterReponseSuppression(r.statut, r.corps);
}

async function deplacerRendezVousExchange({ url, email, motDePasse, itemId, changeKey, debut, fin, delaiMs }, injections) {
  const r = await posterEws({ url, email, motDePasse, delaiMs, body: corpsUpdateRendezVousHoraire({ itemId, changeKey, debut, fin }) }, injections);
  if (r.echec) return r.echec;
  return interpreterReponseCreation(r.statut, r.corps,
    "Rendez-vous déplacé dans l'agenda.", 'Le déplacement du rendez-vous a échoué');
}

// --- Modifier un rendez-vous depuis la page Agenda (étude, 01/10 : « modifier un rendez-vous, titre,
// date horaire et glisser déposé les rendez-vous ») ---
//
// Titre, début, fin et — si le poste les envoie — catégories (couleur : office, visio, confrère,
// annulé / à replacer) dans un seul UpdateItem ; ni lieu, ni notes, ni participants. Un seul essai.

// Pure : bornes EWS d'un horaire saisi à Paris. Rendez-vous horodaté : début et fin le même jour,
// fin après le début. Journée entière : minuit du premier jour → minuit du lendemain du dernier.
// null si l'horaire est incohérent.
function horaireModifie({ date, heure, heureFin, dateFin, journeeEntiere }) {
  const jourOk = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
  const heureOk = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || ''));
  if (!jourOk(date)) return null;
  if (journeeEntiere) {
    const dernier = jourOk(dateFin) ? dateFin : date;
    if (dernier < date) return null;
    return { debut: bornesJourneeEntiere(date).debut, fin: bornesJourneeEntiere(dernier).fin };
  }
  if (!heureOk(heure) || !heureOk(heureFin) || heureFin <= heure) return null;
  return {
    debut: formatEwsUtc(instantUtcDepuisParis(date, heure)),
    fin: formatEwsUtc(instantUtcDepuisParis(date, heureFin))
  };
}

function corpsModifierRendezVous({ itemId, changeKey, sujet, debut, fin, categories }) {
  const champ = (uri, xml) => '<t:SetItemField><t:FieldURI FieldURI="' + uri + '"/><t:CalendarItem>' + xml + '</t:CalendarItem></t:SetItemField>';
  return ENVELOPPE_DEBUT
    + '<m:UpdateItem ConflictResolution="AutoResolve" SendMeetingInvitationsOrCancellations="SendToNone">'
    + '<m:ItemChanges><t:ItemChange>'
    + '<t:ItemId Id="' + echapperXml(itemId) + '"' + (changeKey ? ' ChangeKey="' + echapperXml(changeKey) + '"' : '') + '/>'
    + '<t:Updates>'
    + (typeof sujet === 'string' ? champ('item:Subject', '<t:Subject>' + echapperXml(sujet) + '</t:Subject>') : '')
    // Catégories (couleur) : la liste entière est remplacée — le poste envoie celles à garder.
    + (Array.isArray(categories)
      ? (categories.length
        ? champ('item:Categories', '<t:Categories>' + categories.map((c) => '<t:String>' + echapperXml(c) + '</t:String>').join('') + '</t:Categories>')
        : '<t:DeleteItemField><t:FieldURI FieldURI="item:Categories"/></t:DeleteItemField>')
      : '')
    + champ('calendar:Start', '<t:Start>' + debut + '</t:Start>')
    + champ('calendar:End', '<t:End>' + fin + '</t:End>')
    + '</t:Updates>'
    + '</t:ItemChange></m:ItemChanges>'
    + '</m:UpdateItem>' + ENVELOPPE_FIN;
}

async function modifierRendezVousExchange({ url, email, motDePasse, itemId, changeKey, sujet, debut, fin, categories, delaiMs }, injections) {
  const r = await posterEws({ url, email, motDePasse, delaiMs, body: corpsModifierRendezVous({ itemId, changeKey, sujet, debut, fin, categories }) }, injections);
  if (r.echec) return r.echec;
  const texte = String(r.corps || '');
  if (/<m:ResponseCode>ErrorItemNotFound<\/m:ResponseCode>/.test(texte)) {
    return { ok: false, introuvable: true, raison: 'ews', message: "Ce rendez-vous n'est plus dans l'agenda." };
  }
  if (/<m:ResponseCode>ErrorIrresolvableConflict<\/m:ResponseCode>/.test(texte)) {
    return { ok: false, raison: 'conflit', message: 'Le rendez-vous a été modifié dans Outlook entre-temps : rechargez l’agenda puis recommencez.' };
  }
  return interpreterReponseCreation(r.statut, r.corps, 'Rendez-vous modifié dans l’agenda.', 'La modification du rendez-vous a échoué');
}

// --- Notes d'un rendez-vous (étude, 30/09 : « de quoi mettre des notes dans le rendez-vous ») ---
//
// La note EST le corps du rendez-vous dans Outlook (choix de l'étude) : on la voit dans Outlook comme
// dans CLAIRE, et une note tapée dans Outlook remonte dans CLAIRE. FindItem ne renvoie jamais le corps :
// GetItem sur le seul rendez-vous ouvert, en texte brut. L'écriture remplace le corps par du texte
// brut (la mise en forme d'un corps HTML n'est pas gardée). Un seul essai à chaque fois.
var TAILLE_MAX_NOTES = 8000;

function corpsLireNotes({ itemId }) {
  return ENVELOPPE_DEBUT
    + '<m:GetItem><m:ItemShape><t:BaseShape>IdOnly</t:BaseShape><t:BodyType>Text</t:BodyType>'
    + '<t:AdditionalProperties><t:FieldURI FieldURI="item:Body"/></t:AdditionalProperties></m:ItemShape>'
    + '<m:ItemIds><t:ItemId Id="' + echapperXml(itemId) + '"/></m:ItemIds>'
    + '</m:GetItem>' + ENVELOPPE_FIN;
}

// Réponse d'un GetItem → { notes, itemId, changeKey }. PURE. Retours à la ligne ramenés à \n.
function parseNotesEws(corps) {
  const texte = String(corps || '');
  const idTag = (texte.match(/<t:ItemId\b[^>]*>/) || [])[0] || '';
  const brut = (texte.match(/<t:Body\b[^>]*>([\s\S]*?)<\/t:Body>/) || [])[1] || '';
  return {
    // « &#xD; » resté en clair : trace d'une note relue avant la correction du 01/10 puis réenregistrée
    // (le texte « &#xD; » a alors été écrit tel quel dans Outlook) — retiré à la lecture.
    notes: desechapperXml(brut).replace(/&#(?:x0*D|0*13);/gi, '').replace(/\r\n?/g, '\n').trim(),
    itemId: (idTag.match(/\bId="([^"]+)"/) || [])[1] || '',
    changeKey: (idTag.match(/\bChangeKey="([^"]+)"/) || [])[1] || ''
  };
}

function corpsUpdateNotes({ itemId, changeKey, notes }) {
  return ENVELOPPE_DEBUT
    + '<m:UpdateItem ConflictResolution="AutoResolve" SendMeetingInvitationsOrCancellations="SendToNone">'
    + '<m:ItemChanges><t:ItemChange>'
    + '<t:ItemId Id="' + echapperXml(itemId) + '"' + (changeKey ? ' ChangeKey="' + echapperXml(changeKey) + '"' : '') + '/>'
    + '<t:Updates>'
    + '<t:SetItemField><t:FieldURI FieldURI="item:Body"/>'
    + '<t:CalendarItem><t:Body BodyType="Text">' + echapperXml(String(notes || '').slice(0, TAILLE_MAX_NOTES)) + '</t:Body></t:CalendarItem>'
    + '</t:SetItemField>'
    + '</t:Updates>'
    + '</t:ItemChange></m:ItemChanges>'
    + '</m:UpdateItem>' + ENVELOPPE_FIN;
}

async function lireNotesExchange({ url, email, motDePasse, itemId, delaiMs }, injections) {
  const r = await posterEws({ url, email, motDePasse, delaiMs, body: corpsLireNotes({ itemId }) }, injections);
  if (r.echec) return r.echec;
  const texte = String(r.corps || '');
  if (/<m:ResponseCode>ErrorItemNotFound<\/m:ResponseCode>/.test(texte)) {
    return { ok: false, introuvable: true, raison: 'ews', message: "Ce rendez-vous n'est plus dans l'agenda." };
  }
  const lu = interpreterReponseCreation(r.statut, r.corps, 'Notes lues.', 'La lecture des notes a échoué');
  if (!lu.ok) return lu;
  return { ok: true, ...parseNotesEws(texte) };
}

async function mettreAJourNotesExchange({ url, email, motDePasse, itemId, changeKey, notes, delaiMs }, injections) {
  const r = await posterEws({ url, email, motDePasse, delaiMs, body: corpsUpdateNotes({ itemId, changeKey, notes }) }, injections);
  if (r.echec) return r.echec;
  if (/<m:ResponseCode>ErrorItemNotFound<\/m:ResponseCode>/.test(String(r.corps || ''))) {
    return { ok: false, introuvable: true, raison: 'ews', message: "Ce rendez-vous n'est plus dans l'agenda." };
  }
  if (/<m:ResponseCode>ErrorIrresolvableConflict<\/m:ResponseCode>/.test(String(r.corps || ''))) {
    return { ok: false, raison: 'conflit', message: 'Le rendez-vous a été modifié dans Outlook entre-temps : rouvrez-le pour relire les notes.' };
  }
  return interpreterReponseCreation(r.statut, r.corps, 'Notes enregistrées dans le rendez-vous.', "L'enregistrement des notes a échoué");
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
  folderCalendrierXml,
  corpsCreateEcheance, corpsUpdateEcheanceDate, corpsDeleteEcheance, interpreterReponseSuppression,
  creerEcheanceExchange, mettreAJourEcheanceExchange, supprimerEcheanceExchange,
  heureParisDepuisInstant, horaireDeplace, corpsUpdateRendezVousHoraire, deplacerRendezVousExchange,
  posterEws, corpsLireCalendrier, parseCalendrierEws, lireCalendrierExchange,
  JOURS_PAR_TRANCHE_CALENDRIER, TRANCHES_CALENDRIER,
  horaireModifie, corpsModifierRendezVous, modifierRendezVousExchange,
  TAILLE_MAX_NOTES, corpsLireNotes, parseNotesEws, corpsUpdateNotes, lireNotesExchange, mettreAJourNotesExchange
};
