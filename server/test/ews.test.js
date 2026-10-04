'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  interpreterReponseEws, testerConnexionExchange, corpsGetFolderCalendrier,
  corpsCreateRendezVous, interpreterReponseCreation, creerRendezVousExchange, instantUtcDepuisParis,
  corpsCreateBrouillon, creerBrouillonExchange,
  fenetreJourneeParis, corpsFindRendezVous, parseFindRendezVous,
  corpsUpdateLieu, interpreterReponseUpdate, trouverRendezVousExchange, mettreAJourLieuExchange,
  folderCalendrierXml
} = require('../src/exchange/ews');

test('succès EWS : ResponseClass Success + nom d\'agenda', () => {
  const corps = '<m:GetFolderResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode>'
    + '<m:Folders><t:CalendarFolder><t:DisplayName>Calendrier</t:DisplayName></t:CalendarFolder></m:Folders></m:GetFolderResponseMessage>';
  const r = interpreterReponseEws(200, corps);
  assert.equal(r.ok, true);
  assert.match(r.message, /Calendrier/);
});

test('401 : identifiants refusés, mention de la protection de connexion', () => {
  const r = interpreterReponseEws(401, '');
  assert.equal(r.ok, false);
  assert.equal(r.raison, 'auth');
  assert.match(r.message, /refus/i);
});

test('200 mais erreur applicative : code EWS remonté', () => {
  const corps = '<m:GetFolderResponseMessage ResponseClass="Error"><m:ResponseCode>ErrorAccessDenied</m:ResponseCode></m:GetFolderResponseMessage>';
  const r = interpreterReponseEws(200, corps);
  assert.equal(r.ok, false);
  assert.match(r.message, /ErrorAccessDenied/);
});

test('500 sans corps EWS : erreur serveur', () => {
  const r = interpreterReponseEws(500, '<html>Bad Gateway</html>');
  assert.equal(r.ok, false);
  assert.equal(r.raison, 'serveur');
});

test('le corps de la requête est du GetFolder en lecture seule sur le calendrier', () => {
  const c = corpsGetFolderCalendrier();
  assert.match(c, /GetFolder/);
  assert.match(c, /DistinguishedFolderId Id="calendar"/);
  assert.doesNotMatch(c, /CreateItem|CreateFolder|UpdateItem|DeleteItem/);
});

test('testerConnexionExchange : le mot de passe ne fuit jamais dans le résultat', async () => {
  const poster = (opts, cb) => cb(null, { statusCode: 401, body: '' });
  const r = await testerConnexionExchange({ url: 'https://x/EWS/Exchange.asmx', email: 'a@b.fr', motDePasse: 'SECRET123' }, { poster });
  assert.equal(r.ok, false);
  assert.doesNotMatch(JSON.stringify(r), /SECRET123/);
});

test('testerConnexionExchange : erreur réseau → raison reseau, sans identifiants', async () => {
  const poster = (opts, cb) => cb(Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }));
  const r = await testerConnexionExchange({ url: 'https://x/EWS/Exchange.asmx', email: 'a@b.fr', motDePasse: 'SECRET123' }, { poster });
  assert.equal(r.ok, false);
  assert.equal(r.raison, 'reseau');
  assert.doesNotMatch(JSON.stringify(r), /SECRET123|a@b\.fr/);
});

test('testerConnexionExchange : succès transmis', async () => {
  const poster = (opts, cb) => cb(null, { statusCode: 200, body: '<m:ResponseCode>NoError</m:ResponseCode>' });
  const r = await testerConnexionExchange({ url: 'https://x/EWS/Exchange.asmx', email: 'a@b.fr', motDePasse: 'x' }, { poster });
  assert.equal(r.ok, true);
});

// --- Création de rendez-vous ---

test('instantUtcDepuisParis : heure d\'été (14:30 Paris CEST = 12:30 UTC)', () => {
  // Juillet : Paris est à UTC+2.
  const d = instantUtcDepuisParis('2026-07-14', '14:30');
  assert.equal(d.toISOString(), '2026-07-14T12:30:00.000Z');
});

test('instantUtcDepuisParis : heure d\'hiver (14:30 Paris CET = 13:30 UTC)', () => {
  // Décembre : Paris est à UTC+1.
  const d = instantUtcDepuisParis('2026-12-14', '14:30');
  assert.equal(d.toISOString(), '2026-12-14T13:30:00.000Z');
});

test('corpsCreateRendezVous : CreateItem sur le calendrier, sans invitation, fuseau Paris', () => {
  const c = corpsCreateRendezVous({ sujet: 'VTE - DUPONT', dateStr: '2026-07-14', heureStr: '14:30', dureeMinutes: 60, lieu: 'Étude', corps: 'Rendez-vous de signature' });
  assert.match(c, /CreateItem SendMeetingInvitations="SendToNone"/);
  assert.match(c, /DistinguishedFolderId Id="calendar"/);
  assert.match(c, /<t:CalendarItem>/);
  assert.match(c, /<t:Subject>VTE - DUPONT<\/t:Subject>/);
  assert.match(c, /<t:Start>2026-07-14T12:30:00Z<\/t:Start>/);
  assert.match(c, /<t:End>2026-07-14T13:30:00Z<\/t:End>/);
  assert.match(c, /Romance Standard Time/);
});

test('corpsCreateRendezVous : XML échappé dans l\'objet (pas d\'injection)', () => {
  const c = corpsCreateRendezVous({ sujet: 'VTE - A & B <x>', dateStr: '2026-07-14', heureStr: '09:00', dureeMinutes: 30 });
  assert.match(c, /VTE - A &amp; B &lt;x&gt;/);
  assert.doesNotMatch(c, /<x>/);
});

test('interpreterReponseCreation : succès + ItemId récupéré', () => {
  const corps = '<m:CreateItemResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode>'
    + '<m:Items><t:CalendarItem><t:ItemId Id="AAA123" ChangeKey="CK"/></t:CalendarItem></m:Items></m:CreateItemResponseMessage>';
  const r = interpreterReponseCreation(200, corps);
  assert.equal(r.ok, true);
  assert.equal(r.itemId, 'AAA123');
});

test('interpreterReponseCreation : 401 → auth', () => {
  const r = interpreterReponseCreation(401, '');
  assert.equal(r.ok, false);
  assert.equal(r.raison, 'auth');
});

test('interpreterReponseCreation : erreur applicative → code EWS', () => {
  const corps = '<m:CreateItemResponseMessage ResponseClass="Error"><m:ResponseCode>ErrorImpersonateUserDenied</m:ResponseCode></m:CreateItemResponseMessage>';
  const r = interpreterReponseCreation(200, corps);
  assert.equal(r.ok, false);
  assert.match(r.message, /ErrorImpersonateUserDenied/);
});

test('creerRendezVousExchange : mot de passe jamais dans le résultat', async () => {
  const poster = (opts, cb) => cb(null, { statusCode: 200, body: '<m:ResponseCode>NoError</m:ResponseCode><t:ItemId Id="X"/>' });
  const r = await creerRendezVousExchange({
    url: 'https://x/EWS/Exchange.asmx', email: 'a@b.fr', motDePasse: 'SECRET123',
    rendezVous: { sujet: 'VTE - X', dateStr: '2026-07-14', heureStr: '14:30', dureeMinutes: 60 }
  }, { poster });
  assert.equal(r.ok, true);
  assert.doesNotMatch(JSON.stringify(r), /SECRET123/);
});

// --- Brouillon avec pièce jointe ---

test('corpsCreateBrouillon : SaveOnly dans Brouillons, destinataire, pièce jointe, ordre schéma', () => {
  const c = corpsCreateBrouillon({
    destinataire: 'client@exemple.fr', sujet: 'Questionnaire', corps: 'Bonjour',
    pieces: [{ nom: 'questionnaire.pdf', type: 'application/pdf', contenuBase64: 'QUJD' }]
  });
  assert.match(c, /CreateItem MessageDisposition="SaveOnly"/);
  assert.match(c, /DistinguishedFolderId Id="drafts"/);
  assert.match(c, /<t:EmailAddress>client@exemple\.fr<\/t:EmailAddress>/);
  assert.match(c, /<t:FileAttachment>.*questionnaire\.pdf.*QUJD.*<\/t:FileAttachment>/s);
  // Attachments (élément de ItemType) doit précéder ToRecipients (élément de MessageType).
  assert.ok(c.indexOf('<t:Attachments>') < c.indexOf('<t:ToRecipients>'));
});

test('corpsCreateBrouillon : sans pièce, pas de bloc Attachments', () => {
  const c = corpsCreateBrouillon({ destinataire: 'a@b.fr', sujet: 'x', corps: 'y', pieces: [] });
  assert.doesNotMatch(c, /<t:Attachments>/);
});

test('corpsCreateBrouillon : objet et nom de pièce échappés', () => {
  const c = corpsCreateBrouillon({ destinataire: 'a@b.fr', sujet: 'A & B', corps: '', pieces: [{ nom: '<x>.pdf', contenuBase64: 'AA' }] });
  assert.match(c, /A &amp; B/);
  assert.match(c, /&lt;x&gt;\.pdf/);
});

test('interpreterReponseCreation : message de brouillon quand demandé', () => {
  const r = interpreterReponseCreation(200, '<m:ResponseCode>NoError</m:ResponseCode>', 'Brouillon créé.', 'La création du brouillon a échoué');
  assert.equal(r.ok, true);
  assert.match(r.message, /Brouillon/);
});

test('creerBrouillonExchange : mot de passe jamais dans le résultat', async () => {
  const poster = (opts, cb) => cb(null, { statusCode: 200, body: '<m:ResponseCode>NoError</m:ResponseCode>' });
  const r = await creerBrouillonExchange({
    url: 'https://x/EWS/Exchange.asmx', email: 'a@b.fr', motDePasse: 'SECRET123',
    brouillon: { destinataire: 'c@d.fr', sujet: 'x', corps: 'y', pieces: [] }
  }, { poster });
  assert.equal(r.ok, true);
  assert.doesNotMatch(JSON.stringify(r), /SECRET123/);
});

// --- Noter dans un rendez-vous existant (FindItem + UpdateItem sur le lieu) ---

test('fenetreJourneeParis : jour civil de Paris borné en UTC (heure d\'été)', () => {
  const f = fenetreJourneeParis('2026-07-14');
  // 14 juillet 00:00 Paris (CEST, UTC+2) = 13 juillet 22:00 UTC ; le lendemain de même.
  assert.equal(f.debutUtc, '2026-07-13T22:00:00Z');
  assert.equal(f.finUtc, '2026-07-14T22:00:00Z');
});

test('corpsFindRendezVous : CalendarView sur le calendrier, sujet + lieu demandés, lecture seule', () => {
  const f = fenetreJourneeParis('2026-10-14');
  const c = corpsFindRendezVous(f);
  assert.match(c, /<m:FindItem/);
  assert.match(c, /DistinguishedFolderId Id="calendar"/);
  assert.match(c, /<m:CalendarView StartDate="[^"]+" EndDate="[^"]+"\/>/);
  assert.match(c, /FieldURI="item:Subject"/);
  assert.match(c, /FieldURI="calendar:Location"/);
  assert.doesNotMatch(c, /CreateItem|UpdateItem|DeleteItem/);
});

test('folderCalendrierXml : calendrier par défaut sans boîte, calendrier partagé avec boîte', () => {
  assert.equal(folderCalendrierXml(''), '<t:DistinguishedFolderId Id="calendar"/>');
  assert.equal(folderCalendrierXml('   '), '<t:DistinguishedFolderId Id="calendar"/>');
  const partage = folderCalendrierXml('sophie@gossart.notaires.fr');
  assert.match(partage, /<t:DistinguishedFolderId Id="calendar"><t:Mailbox><t:EmailAddress>sophie@gossart\.notaires\.fr<\/t:EmailAddress><\/t:Mailbox><\/t:DistinguishedFolderId>/);
});

test('corpsFindRendezVous / corpsCreateRendezVous : ciblent le calendrier partagé quand mailbox fournie', () => {
  const f = fenetreJourneeParis('2026-10-14');
  const find = corpsFindRendezVous({ ...f, mailbox: 'sophie@gossart.notaires.fr' });
  assert.match(find, /<t:Mailbox><t:EmailAddress>sophie@gossart\.notaires\.fr<\/t:EmailAddress><\/t:Mailbox>/);
  const create = corpsCreateRendezVous({ sujet: 'VTE - X', dateStr: '2026-10-14', heureStr: '14:00', dureeMinutes: 60, mailbox: 'sophie@gossart.notaires.fr' });
  assert.match(create, /<m:SavedItemFolderId><t:DistinguishedFolderId Id="calendar"><t:Mailbox><t:EmailAddress>sophie@gossart\.notaires\.fr<\/t:EmailAddress>/);
});

test('parseFindRendezVous : ItemId + ChangeKey + sujet + lieu, entités dés-échappées', () => {
  const corps = '<m:FindItemResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode>'
    + '<m:RootFolder><t:Items>'
    + '<t:CalendarItem><t:ItemId Id="AAA=" ChangeKey="CK1"/>'
    + '<t:Subject>VTE - A &amp; B</t:Subject><t:Location>AL - visio</t:Location></t:CalendarItem>'
    + '<t:CalendarItem><t:ItemId Id="BBB=" ChangeKey="CK2"/>'
    + '<t:Subject>VTE - DUPONT</t:Subject></t:CalendarItem>'
    + '</t:Items></m:RootFolder></m:FindItemResponseMessage>';
  const evts = parseFindRendezVous(corps);
  assert.equal(evts.length, 2);
  assert.equal(evts[0].itemId, 'AAA=');
  assert.equal(evts[0].changeKey, 'CK1');
  assert.equal(evts[0].subject, 'VTE - A & B');
  assert.equal(evts[0].location, 'AL - visio');
  assert.equal(evts[1].location, ''); // pas de <t:Location> → chaîne vide
});

test('parseFindRendezVous : un item sans ItemId exploitable est ignoré', () => {
  const corps = '<t:Items><t:CalendarItem><t:Subject>Sans id</t:Subject></t:CalendarItem></t:Items>';
  assert.equal(parseFindRendezVous(corps).length, 0);
});

test('corpsUpdateLieu : SetItemField sur calendar:Location uniquement, id/lieu échappés', () => {
  const c = corpsUpdateLieu({ itemId: 'AAA=', changeKey: 'CK1', lieu: 'AL - Appel de fonds envoyé' });
  assert.match(c, /<m:UpdateItem[^>]*SendMeetingInvitationsOrCancellations="SendToNone"/);
  assert.match(c, /<t:ItemId Id="AAA=" ChangeKey="CK1"\/>/);
  assert.match(c, /<t:SetItemField><t:FieldURI FieldURI="calendar:Location"\/>/);
  assert.match(c, /<t:CalendarItem><t:Location>AL - Appel de fonds envoyé<\/t:Location><\/t:CalendarItem>/);
  // On ne touche jamais à la catégorie/couleur : un seul SetItemField, sur le lieu.
  assert.equal((c.match(/<t:SetItemField>/g) || []).length, 1);
  assert.doesNotMatch(c, /Categories|calendar:Color/);
});

test('interpreterReponseUpdate : succès et échec avec libellés de mise à jour', () => {
  assert.equal(interpreterReponseUpdate(200, '<m:ResponseCode>NoError</m:ResponseCode>').ok, true);
  const echec = interpreterReponseUpdate(200, '<m:ResponseCode>ErrorItemNotFound</m:ResponseCode>');
  assert.equal(echec.ok, false);
  assert.match(echec.message, /ErrorItemNotFound/);
  assert.match(echec.message, /mise à jour/i);
});

test('trouverRendezVousExchange : succès → événements, mot de passe jamais dans le résultat', async () => {
  const body = '<m:ResponseCode>NoError</m:ResponseCode><t:Items>'
    + '<t:CalendarItem><t:ItemId Id="X" ChangeKey="K"/><t:Subject>VTE - DUPONT</t:Subject><t:Location>AL</t:Location></t:CalendarItem>'
    + '</t:Items>';
  const poster = (opts, cb) => cb(null, { statusCode: 200, body });
  const r = await trouverRendezVousExchange({ url: 'https://x/EWS/Exchange.asmx', email: 'a@b.fr', motDePasse: 'SECRET123', debutUtc: 'x', finUtc: 'y' }, { poster });
  assert.equal(r.ok, true);
  assert.equal(r.evenements.length, 1);
  assert.doesNotMatch(JSON.stringify(r), /SECRET123/);
});

test('trouverRendezVousExchange : 401 → échec auth', async () => {
  const poster = (opts, cb) => cb(null, { statusCode: 401, body: '' });
  const r = await trouverRendezVousExchange({ url: 'https://x/EWS/Exchange.asmx', email: 'a@b.fr', motDePasse: 'x', debutUtc: 'a', finUtc: 'b' }, { poster });
  assert.equal(r.ok, false);
  assert.equal(r.raison, 'auth');
});

test('mettreAJourLieuExchange : mot de passe jamais dans le résultat', async () => {
  const poster = (opts, cb) => cb(null, { statusCode: 200, body: '<m:ResponseCode>NoError</m:ResponseCode>' });
  const r = await mettreAJourLieuExchange({ url: 'https://x/EWS/Exchange.asmx', email: 'a@b.fr', motDePasse: 'SECRET123', itemId: 'X', changeKey: 'K', lieu: 'AL - Appel de fonds envoyé' }, { poster });
  assert.equal(r.ok, true);
  assert.doesNotMatch(JSON.stringify(r), /SECRET123/);
});

// --- Dates butoir (prêt, vente préalable) dans le calendrier partagé ---
const {
  corpsCreateEcheance, corpsUpdateEcheanceDate, corpsDeleteEcheance, interpreterReponseSuppression,
  creerEcheanceExchange, mettreAJourEcheanceExchange, supprimerEcheanceExchange
} = require('../src/exchange/ews');

test('corpsCreateEcheance : journée entière, libre, sans rappel, dans le calendrier partagé', () => {
  const c = corpsCreateEcheance({ sujet: 'Obtention du prêt — MARTIN - Dossier DUPONT / MARTIN', dateStr: '2026-07-14', mailbox: 'sophie@etude.fr' });
  assert.match(c, /<t:IsAllDayEvent>true<\/t:IsAllDayEvent>/);
  assert.match(c, /<t:LegacyFreeBusyStatus>Free<\/t:LegacyFreeBusyStatus>/);
  assert.match(c, /<t:ReminderIsSet>false<\/t:ReminderIsSet>/);
  assert.match(c, /<t:EmailAddress>sophie@etude\.fr<\/t:EmailAddress>/);
  // Minuit à Paris en été = 22:00 UTC la veille ; fin = minuit le lendemain.
  assert.match(c, /<t:Start>2026-07-13T22:00:00Z<\/t:Start>/);
  assert.match(c, /<t:End>2026-07-14T22:00:00Z<\/t:End>/);
  assert.match(c, /SendMeetingInvitations="SendToNone"/);
});

test('corpsUpdateEcheanceDate : déplace Start et End, rien d\'autre (ni titre ni couleur)', () => {
  const c = corpsUpdateEcheanceDate({ itemId: 'AAA=', changeKey: 'CK1', dateStr: '2026-12-01' });
  assert.match(c, /FieldURI="calendar:Start"/);
  assert.match(c, /FieldURI="calendar:End"/);
  assert.match(c, /<t:Start>2026-11-30T23:00:00Z<\/t:Start>/); // hiver : UTC+1
  assert.doesNotMatch(c, /Subject|Categories|calendar:Color/);
  assert.match(c, /ChangeKey="CK1"/);
});

test('corpsDeleteEcheance : récupérable (éléments supprimés), jamais HardDelete', () => {
  const c = corpsDeleteEcheance({ itemId: 'AAA=', changeKey: 'CK1' });
  assert.match(c, /DeleteType="MoveToDeletedItems"/);
  assert.doesNotMatch(c, /HardDelete/);
});

test('interpreterReponseSuppression : un événement déjà effacé à la main vaut succès', () => {
  const r = interpreterReponseSuppression(200, '<m:DeleteItemResponseMessage ResponseClass="Error"><m:ResponseCode>ErrorItemNotFound</m:ResponseCode></m:DeleteItemResponseMessage>');
  assert.equal(r.ok, true);
  assert.equal(interpreterReponseSuppression(200, '<m:ResponseCode>ErrorAccessDenied</m:ResponseCode>').ok, false);
});

test('creerEcheanceExchange : renvoie ItemId et ChangeKey, jamais le mot de passe', async () => {
  const poster = (opts, cb) => cb(null, { statusCode: 200, body: '<m:CreateItemResponseMessage ResponseClass="Success"><t:ItemId Id="ID1" ChangeKey="CK1"/></m:CreateItemResponseMessage>' });
  const r = await creerEcheanceExchange({ url: 'https://x/EWS/Exchange.asmx', email: 'a@b.fr', motDePasse: 'SECRET123', echeance: { sujet: 'x', dateStr: '2026-07-14' } }, { poster });
  assert.equal(r.ok, true);
  assert.equal(r.itemId, 'ID1');
  assert.equal(r.changeKey, 'CK1');
  assert.doesNotMatch(JSON.stringify(r), /SECRET123/);
});

test('mettreAJourEcheanceExchange : nouveau ChangeKey renvoyé ; événement effacé → introuvable', async () => {
  const ok = await mettreAJourEcheanceExchange({ url: 'https://x', email: 'a@b.fr', motDePasse: 's', itemId: 'ID1', changeKey: 'CK1', dateStr: '2026-07-20' },
    { poster: (o, cb) => cb(null, { statusCode: 200, body: '<m:UpdateItemResponseMessage ResponseClass="Success"><t:ItemId Id="ID1" ChangeKey="CK2"/></m:UpdateItemResponseMessage>' }) });
  assert.equal(ok.ok, true);
  assert.equal(ok.changeKey, 'CK2');
  const perdu = await mettreAJourEcheanceExchange({ url: 'https://x', email: 'a@b.fr', motDePasse: 's', itemId: 'ID1', changeKey: 'CK1', dateStr: '2026-07-20' },
    { poster: (o, cb) => cb(null, { statusCode: 200, body: '<m:ResponseCode>ErrorItemNotFound</m:ResponseCode>' }) });
  assert.equal(perdu.ok, false);
  assert.equal(perdu.introuvable, true);
});

test('supprimerEcheanceExchange : identifiants refusés → raison auth', async () => {
  const r = await supprimerEcheanceExchange({ url: 'https://x', email: 'a@b.fr', motDePasse: 's', itemId: 'ID1', changeKey: 'CK1' },
    { poster: (o, cb) => cb(null, { statusCode: 401, body: '' }) });
  assert.equal(r.ok, false);
  assert.equal(r.raison, 'auth');
});

test('supprimerEcheanceExchange : ErrorCannotDeleteObject (délégué) → une seconde requête en SoftDelete, jamais HardDelete', async () => {
  const corps = [];
  const repondre = (o, cb) => {
    corps.push(o.body);
    if (/MoveToDeletedItems/.test(o.body)) return cb(null, { statusCode: 200, body: '<m:DeleteItemResponseMessage ResponseClass="Error"><m:ResponseCode>ErrorCannotDeleteObject</m:ResponseCode></m:DeleteItemResponseMessage>' });
    cb(null, { statusCode: 200, body: '<m:DeleteItemResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode></m:DeleteItemResponseMessage>' });
  };
  const r = await supprimerEcheanceExchange({ url: 'https://x', email: 'a@b.fr', motDePasse: 's', itemId: 'ID1', changeKey: 'CK1' }, { poster: repondre });
  assert.equal(r.ok, true);
  assert.match(r.message, /Récupérer les éléments supprimés/);
  assert.equal(corps.length, 2);
  assert.match(corps[1], /DeleteType="SoftDelete"/);
  assert.doesNotMatch(corps.join(''), /HardDelete/);
  // Une autre erreur : aucun second essai.
  const un = [];
  const refus = await supprimerEcheanceExchange({ url: 'https://x', email: 'a@b.fr', motDePasse: 's', itemId: 'ID1' },
    { poster: (o, cb) => { un.push(o.body); cb(null, { statusCode: 200, body: '<m:ResponseCode>ErrorAccessDenied</m:ResponseCode>' }); } });
  assert.equal(refus.ok, false);
  assert.equal(un.length, 1);
  // Un type inconnu retombe sur MoveToDeletedItems.
  assert.match(corpsDeleteEcheance({ itemId: 'A', typeSuppression: 'HardDelete' }), /DeleteType="MoveToDeletedItems"/);
});

test('rendez-vous : catégorie de couleur posée entre Body et le rappel, absente sans nom', () => {
  const ews = require('../src/exchange/ews');
  const avec = ews.corpsCreateRendezVous({ sujet: 'VTE - A', dateStr: '2026-10-14', heureStr: '14:30', dureeMinutes: 60, categorie: 'Catégorie <Verte>' });
  assert.ok(avec.includes('<t:Categories><t:String>Catégorie &lt;Verte&gt;</t:String></t:Categories>'));
  assert.ok(avec.indexOf('</t:Body>') < avec.indexOf('<t:Categories>'));
  assert.ok(avec.indexOf('<t:Categories>') < avec.indexOf('<t:ReminderIsSet>'));
  const sans = ews.corpsCreateRendezVous({ sujet: 'VTE - A', dateStr: '2026-10-14', heureStr: '14:30', dureeMinutes: 60 });
  assert.ok(!sans.includes('Categories'));
});

test('rendez-vous déplacé : même heure à Paris et même durée, y compris au passage à l\'heure d\'hiver', () => {
  const ews = require('../src/exchange/ews');
  assert.equal(ews.heureParisDepuisInstant('2026-10-14T12:30:00Z'), '14:30');
  const h = ews.horaireDeplace({ start: '2026-10-14T12:30:00Z', end: '2026-10-14T13:30:00Z' }, '2026-11-04');
  assert.equal(h.heure, '14:30');
  assert.equal(h.debut, '2026-11-04T13:30:00Z');
  assert.equal(h.fin, '2026-11-04T14:30:00Z');
  const corps = ews.corpsUpdateRendezVousHoraire({ itemId: 'I', changeKey: 'C', debut: h.debut, fin: h.fin });
  assert.ok(corps.includes('calendar:Start') && corps.includes('calendar:End'));
  assert.ok(!corps.includes('Categories') && !corps.includes('Location'), 'ni couleur ni lieu touchés');
});

test('FindItem : début et fin de chaque rendez-vous relus', () => {
  const ews = require('../src/exchange/ews');
  const corps = '<m:FindItemResponse><t:CalendarItem><t:ItemId Id="A1" ChangeKey="K1"/><t:Subject>VTE - DUPONT</t:Subject>'
    + '<t:Start>2026-10-14T12:30:00Z</t:Start><t:End>2026-10-14T13:30:00Z</t:End></t:CalendarItem></m:FindItemResponse>';
  const [e] = ews.parseFindRendezVous(corps);
  assert.equal(e.start, '2026-10-14T12:30:00Z');
  assert.equal(e.end, '2026-10-14T13:30:00Z');
  assert.ok(ews.corpsFindRendezVous({ debutUtc: 'a', finUtc: 'b' }).includes('calendar:Start'));
});

// --- Lecture de l'agenda de l'office (remplace le flux .ics publié) ---

test('parseCalendrierEws : sujet et lieu dés-échappés, catégories, journée entière, annulation, liste coupée', () => {
  const { parseCalendrierEws, corpsLireCalendrier } = require('../src/exchange/ews');
  const corps = '<m:RootFolder IncludesLastItemInRange="true"><t:Items><t:CalendarItem><t:ItemId Id="X1" ChangeKey="C1"/>'
    + '<t:Subject>VTE - DUPONT &amp; MARTIN</t:Subject><t:Categories><t:String>Catégorie Verte</t:String><t:String>Visio</t:String></t:Categories>'
    + '<t:Start>2026-10-11T22:00:00Z</t:Start><t:End>2026-10-12T22:00:00Z</t:End><t:IsAllDayEvent>true</t:IsAllDayEvent>'
    + '<t:IsCancelled>true</t:IsCancelled><t:Location>BA &lt;Visio&gt;</t:Location></t:CalendarItem></t:Items></m:RootFolder>';
  const { evenements, complet } = parseCalendrierEws(corps);
  assert.equal(complet, true);
  assert.equal(evenements.length, 1);
  const e = evenements[0];
  assert.equal(e.itemId, 'X1');
  assert.equal(e.subject, 'VTE - DUPONT & MARTIN');
  assert.equal(e.location, 'BA <Visio>');
  assert.equal(e.categories.join('|'), 'Catégorie Verte|Visio');
  assert.equal(e.allDay, true);
  assert.equal(e.cancelled, true);
  assert.equal(parseCalendrierEws(corps.replace('"true"', '"false"')).complet, false);
  // Lecture seule : FindItem sur une vue calendrier du calendrier partagé, jamais une écriture.
  const requete = corpsLireCalendrier({ debutUtc: '2026-09-28T22:00:00Z', finUtc: '2026-11-29T23:00:00Z', mailbox: 'sophie@etude.test' });
  assert.match(requete, /<m:FindItem Traversal="Shallow">/);
  assert.match(requete, /FieldURI="calendar:IsAllDayEvent"/);
  assert.match(requete, /FieldURI="item:Categories"/);
  assert.doesNotMatch(requete, /CreateItem|UpdateItem|DeleteItem/);
});

test('Notes d\'un rendez-vous : GetItem du corps en texte, UpdateItem du seul corps', async () => {
  const {
    corpsLireNotes, parseNotesEws, corpsUpdateNotes, lireNotesExchange, mettreAJourNotesExchange
  } = require('../src/exchange/ews');
  const lire = corpsLireNotes({ itemId: 'AAMk<1>' });
  assert.match(lire, /<m:GetItem>/);
  assert.match(lire, /<t:BodyType>Text<\/t:BodyType>/);
  assert.match(lire, /FieldURI="item:Body"/);
  assert.match(lire, /Id="AAMk&lt;1&gt;"/);

  const reponse = '<m:ResponseCode>NoError</m:ResponseCode><t:CalendarItem><t:ItemId Id="ID1" ChangeKey="CK2"/>'
    + '<t:Body BodyType="Text">Clés à remettre &amp; chèque\r\nApporter le RIB</t:Body></t:CalendarItem>';
  const lu = parseNotesEws(reponse);
  assert.equal(lu.notes, 'Clés à remettre & chèque\nApporter le RIB');
  assert.equal(`${lu.itemId}/${lu.changeKey}`, 'ID1/CK2');
  assert.equal(parseNotesEws('<t:ItemId Id="X"/><t:Body BodyType="Text"/>').notes, '');

  const maj = corpsUpdateNotes({ itemId: 'ID1', changeKey: 'CK2', notes: 'A <b> & C' });
  assert.match(maj, /SetItemField><t:FieldURI FieldURI="item:Body"\/>/);
  assert.match(maj, /<t:Body BodyType="Text">A &lt;b&gt; &amp; C<\/t:Body>/);
  assert.match(maj, /SendMeetingInvitationsOrCancellations="SendToNone"/);
  assert.doesNotMatch(maj, /Subject|Location|Start/, 'rien d\'autre que le corps');

  let envoye = '';
  const poster = (opts, cb) => { envoye = opts.body; cb(null, { statusCode: 200, body: '<m:GetItemResponseMessage ResponseClass="Success">' + reponse }); };
  const r = await lireNotesExchange({ url: 'https://x/EWS/Exchange.asmx', email: 'a@b.fr', motDePasse: 'SECRET', itemId: 'ID1' }, { poster });
  assert.equal(r.ok, true);
  assert.equal(r.notes.split('\n')[1], 'Apporter le RIB');
  assert.match(envoye, /GetItem/);

  const absent = await lireNotesExchange({ url: 'u', email: 'a', motDePasse: 'b', itemId: 'Z' },
    { poster: (o, cb) => cb(null, { statusCode: 200, body: '<m:ResponseCode>ErrorItemNotFound</m:ResponseCode>' }) });
  assert.equal(absent.introuvable, true);

  const conflit = await mettreAJourNotesExchange({ url: 'u', email: 'a', motDePasse: 'SECRET', itemId: 'Z', changeKey: 'old', notes: 'x' },
    { poster: (o, cb) => cb(null, { statusCode: 200, body: '<m:ResponseCode>ErrorIrresolvableConflict</m:ResponseCode>' }) });
  assert.equal(conflit.raison, 'conflit');
  assert.doesNotMatch(conflit.message, /SECRET/);

  const ok = await mettreAJourNotesExchange({ url: 'u', email: 'a', motDePasse: 'b', itemId: 'ID1', changeKey: 'CK2', notes: 'x' },
    { poster: (o, cb) => cb(null, { statusCode: 200, body: '<m:UpdateItemResponseMessage ResponseClass="Success"><t:ItemId Id="ID1" ChangeKey="CK3"/>' }) });
  assert.equal(`${ok.ok}/${ok.changeKey}`, 'true/CK3');
});

test('Notes : le retour chariot d\'Exchange ne traîne plus en clair (étude, 01/10)', () => {
  const { parseNotesEws } = require('../src/exchange/ews');
  const reponse = '<t:ItemId Id="ID1" ChangeKey="CK"/><t:Body BodyType="Text">permettre de modifier un rendez-vous&#xD;\nglisser déposer</t:Body>';
  assert.equal(parseNotesEws(reponse).notes, 'permettre de modifier un rendez-vous\nglisser déposer');
  // Note relue avant la correction puis réenregistrée : « &#xD; » écrit en clair dans Outlook.
  const ancienne = '<t:ItemId Id="ID1"/><t:Body BodyType="Text">A&amp;#xD;&#xD;\nB</t:Body>';
  assert.equal(parseNotesEws(ancienne).notes, 'A\nB');
});

test('Modifier un rendez-vous : horaire à Paris, journée entière, incohérences refusées', async () => {
  const { horaireModifie, corpsModifierRendezVous, modifierRendezVousExchange } = require('../src/exchange/ews');
  assert.equal(JSON.stringify(horaireModifie({ date: '2026-12-03', heure: '09:30', heureFin: '10:15' })),
    '{"debut":"2026-12-03T08:30:00Z","fin":"2026-12-03T09:15:00Z"}', 'hiver : UTC+1');
  assert.equal(horaireModifie({ date: '2026-12-03', heure: '10:00', heureFin: '10:00' }), null);
  assert.equal(horaireModifie({ date: '2026-12-03', heure: '25:00', heureFin: '26:00' }), null);
  assert.equal(horaireModifie({ date: '03/12/2026', heure: '09:00', heureFin: '10:00' }), null);
  assert.equal(JSON.stringify(horaireModifie({ date: '2026-10-05', dateFin: '2026-10-06', journeeEntiere: true })),
    '{"debut":"2026-10-04T22:00:00Z","fin":"2026-10-06T22:00:00Z"}');
  assert.equal(horaireModifie({ date: '2026-10-06', dateFin: '2026-10-05', journeeEntiere: true }), null);

  const corps = corpsModifierRendezVous({ itemId: 'A<1>', changeKey: 'K', sujet: 'VTE - X & Y', debut: 'D', fin: 'F' });
  assert.match(corps, /<m:UpdateItem ConflictResolution="AutoResolve" SendMeetingInvitationsOrCancellations="SendToNone">/);
  assert.match(corps, /Id="A&lt;1&gt;" ChangeKey="K"/);
  assert.match(corps, /FieldURI="item:Subject"\/><t:CalendarItem><t:Subject>VTE - X &amp; Y<\/t:Subject>/);
  assert.match(corps, /<t:Start>D<\/t:Start>[\s\S]*<t:End>F<\/t:End>/);
  assert.doesNotMatch(corpsModifierRendezVous({ itemId: 'A', debut: 'D', fin: 'F' }), /Subject|ChangeKey/);

  const conflit = await modifierRendezVousExchange({ url: 'u', email: 'a', motDePasse: 'SECRET', itemId: 'A', debut: 'D', fin: 'F' },
    { poster: (o, cb) => cb(null, { statusCode: 200, body: '<m:ResponseCode>ErrorIrresolvableConflict</m:ResponseCode>' }) });
  assert.equal(conflit.raison, 'conflit');
  const refus = await modifierRendezVousExchange({ url: 'u', email: 'a', motDePasse: 'SECRET', itemId: 'A', debut: 'D', fin: 'F' },
    { poster: (o, cb) => cb(null, { statusCode: 401, body: '' }) });
  assert.equal(refus.raison, 'auth');
  assert.doesNotMatch(refus.message, /SECRET/);
});
