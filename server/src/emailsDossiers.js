'use strict';
// ---- Emails des dossiers (étude, 02/10 : « tu peux lire le contenu » ; « tu peux lire les emails
// envoyés pour confirmer » ; choix : repérer, ranger les pièces jointes sur le NAS, résumé par l'IA locale ;
// « boîte de chacun » pour les envois) ----
//
// Toutes les minutes (étude 02/10), par EWS (mêmes identifiants et même disjoncteur que l'agenda, un seul essai par
// appel) :
//   - BOÎTE DE RÉCEPTION du compte relié (celle de Bastien, qui « reçoit tout en double ») : chaque email
//     rattaché à un dossier (expéditeur = client, partie ou confrère du dossier, sinon « VTE - NOM », réponse à un
//     échange du dossier, adresse à qui l'étude a écrit pour ce seul dossier, un nom du dossier dans l'objet, puis
//     les dossiers archivés — mêmes règles que le résumé du matin, étude 06/10) est relu en entier : texte et liste des
//     pièces jointes. Le TEXTE N'EST JAMAIS GARDÉ : il sert au résumé de l'IA locale (Ollama, sur le
//     serveur), puis il est jeté ; seuls l'expéditeur, l'objet, la date, les sujets repérés, le résumé et
//     la liste des pièces jointes sont conservés.
//   - « ÉLÉMENTS ENVOYÉS » de chaque collaborateur (adresses des Réglages › Collaborateurs) : le compte relié
//     lit les siens, et ceux des autres si l'accès lui a été donné dans Outlook (dossier partagé en lecture).
//     Seuls l'objet, les destinataires et la date sont lus — jamais le texte. Un email préparé par CLAIRE
//     (.eml ou brouillon) dont l'objet et un destinataire se retrouvent dans les envois est marqué
//     « envoyé le … par … ».
// Pièces jointes : rangées dans le dossier client du NAS par la fenêtre CLAIRE qui les reconnaît par leur
// nom (route /api/emails-dossiers/pj/ranger) ; le serveur les relit alors dans Exchange (GetAttachment) et
// en écrit une COPIE (scans.copierDansDossierClient), jamais d'écrasement, une seule fois par pièce jointe.

const crypto = require('node:crypto');
const { noterVerification } = require('./verificationsTerrain');
const { accesCollaborateur, marquerRefus, leverRefus } = require('./comptesCollaborateurs');
const { cocherProjetEnvoye, corpsALirePourProjet } = require('./projetEnvoyeEmail');
const { successionDeEnvoiBanque, cocherClotureComptes, envoisAGarder } = require('./clotureComptesEmail');

// Coche le projet sur la copie du dossier relue À L'INSTANT (audit 13/10) : la liste du début du tour est périmée après les
// lectures Exchange — l'écrire effaçait ce qu'un poste avait enregistré entre-temps. Synchrone entre la relecture et l'écriture.
function cocherProjetSurCopieFraiche(depot, d, envoye) {
  const frais = typeof depot.trouverParId === 'function' ? depot.trouverParId(d.id) : d;
  if (!frais || frais.deleted) return false;
  if (!cocherProjetEnvoye(frais, envoye)) return false;
  depot.remplacer(frais.id, frais);
  return true;
}
const { lireXml, tous, premier, texte: texteXml, texteDe, attribut, identifiantElement, codeReponse: codeReponseXml, succesSansErreur } = require('./exchange/xml');
const {
  contexteClassement, dossierDeEmailParAdresse, emailLieAuxAdressesDuDossier, parmiDossiersAdresse, normaliserObjet, normaliser, SUJETS_EMAIL, echapperXml, ENVELOPPE_DEBUT, ENVELOPPE_FIN
} = require('./emailsMatin');

const CLE_EMAILS_DOSSIERS = 'emails-dossiers';
const MAX_EMAILS = 3000;
const MAX_PREPARES = 500;
const MAX_LECTURES_TOUR = 30;
// Relecture d'une adresse nouvellement saisie sur une fiche (étude, 03/10 : « j'ai ajouté le courriel d'un
// confrère dans une fiche mais son email n'a pas été détecté » — reçu avant la saisie, il était déjà derrière
// le repère de lecture) : les 30 derniers jours de la boîte de réception, une fois par adresse.
const JOURS_RATTRAPAGE_ADRESSE = 30;
const MAX_ADRESSES_VUES = 3000;
// Même relecture pour un dossier tout juste créé (étude, 03/10 : « RE: VENTE MERCIER / FRANCOIS », reçu la veille
// de la création du dossier, jamais rattaché) : ses emails — par adresse ou par l'objet — des 30 derniers jours.
// À la toute première mise en place, les dossiers créés depuis moins de 3 jours comptent comme nouveaux.
const JOURS_DOSSIER_RECENT_INIT = 3;
const MAX_DOSSIERS_VUS = 5000;
const JOURS_PREMIERE_LECTURE = 7;
const INTERVALLE_EMAILS_MS = 60 * 1000; // étude 02/10 : « relevés toutes les minutes »
const TAILLE_MAX_PJ = 20 * 1024 * 1024;
const CODES_ACCES_REFUSE = /ErrorAccessDenied|ErrorNonExistentMailbox|ErrorFolderNotFound|ErrorInvalidSmtpAddress|ErrorMailboxMoveInProgress|ErrorImpersonat|ErrorInvalidUser/;

// ---- État gardé ----
const texte = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, max);
const dateIso = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);

function assainirPj(p) {
  if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !p.id) return null;
  const r = p.rangee && typeof p.rangee === 'object' ? {
    chemin: texte(p.rangee.chemin, 400), le: dateIso(p.rangee.le) || new Date().toISOString(), pieceCle: texte(p.rangee.pieceCle, 80),
    pieceLabel: texte(p.rangee.pieceLabel, 120), auto: p.rangee.auto === true
  } : null;
  return { id: texte(p.id, 400), nom: texte(p.nom, 200), taille: Number.isFinite(p.taille) ? p.taille : 0, type: texte(p.type, 100),
    rangee: r, echec: p.echec ? texte(p.echec, 200) : null, ignoree: p.ignoree === true };
}

function assainirEmail(e) {
  if (!e || typeof e !== 'object' || typeof e.id !== 'string' || !e.id) return null;
  return {
    id: texte(e.id, 64), itemId: texte(e.itemId, 400), dossierId: texte(e.dossierId, 80),
    sens: e.sens === 'envoye' ? 'envoye' : 'recu', date: dateIso(e.date) || new Date().toISOString(),
    de: { nom: texte(e.de && e.de.nom, 120), adresse: texte(e.de && e.de.adresse, 200).toLowerCase() },
    a: (Array.isArray(e.a) ? e.a : []).map((x) => texte(x, 200).toLowerCase()).filter(Boolean).slice(0, 20),
    objet: texte(e.objet, 300), sujets: (Array.isArray(e.sujets) ? e.sujets : []).map((x) => texte(x, 40)).slice(0, 8),
    boite: texte(e.boite, 200).toLowerCase(), collaborateur: texte(e.collaborateur, 80),
    pj: (Array.isArray(e.pj) ? e.pj : []).map(assainirPj).filter(Boolean).slice(0, 30),
    resume: e.resume ? texte(e.resume, 600) : null, resumeErreur: e.resumeErreur ? texte(e.resumeErreur, 200) : null,
    prepareId: e.prepareId ? texte(e.prepareId, 64) : null
  };
}

function assainirPrepare(p) {
  if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !p.id) return null;
  return {
    id: texte(p.id, 64), dossierId: texte(p.dossierId, 80), objet: texte(p.objet, 300),
    destinataires: (Array.isArray(p.destinataires) ? p.destinataires : []).map((x) => texte(x, 200).toLowerCase()).filter((x) => /@/.test(x)).slice(0, 20),
    collaborateur: texte(p.collaborateur, 80), geste: texte(p.geste, 60), prepareLe: dateIso(p.prepareLe) || new Date().toISOString(),
    envoyeLe: dateIso(p.envoyeLe), boite: texte(p.boite, 200).toLowerCase(), emailId: p.emailId ? texte(p.emailId, 64) : null
  };
}

function assainirEtatBoite(b) {
  const x = b && typeof b === 'object' ? b : {};
  return { collaborateur: texte(x.collaborateur, 80), dernier: dateIso(x.dernier), statut: ['ok', 'refuse', 'erreur', 'jamais'].includes(x.statut) ? x.statut : 'jamais',
    message: texte(x.message, 300), luLe: dateIso(x.luLe), lus: Number.isFinite(x.lus) ? x.lus : 0 };
}

function assainirEmailsDossiers(brut) {
  const b = brut && typeof brut === 'object' ? brut : {};
  const etat = b.etat && typeof b.etat === 'object' ? b.etat : {};
  const envoyes = {};
  for (const [k, v] of Object.entries(etat.envoyes && typeof etat.envoyes === 'object' ? etat.envoyes : {})) {
    if (/@/.test(k)) envoyes[k.toLowerCase().slice(0, 200)] = assainirEtatBoite(v);
  }
  return {
    // `rangementAuto` : pièces jointes rangées seules sur le NAS — ÉTEINT par défaut (étude 03/10 : « pas encore au
    // point ») ; « Ranger… » à la main reste possible. Un réglage absent (état d'avant) vaut éteint.
    // Rangement automatique des pièces jointes : retiré des Réglages le 13/10 (étude, tri des réglages) — toujours éteint.
    reglages: { actif: !(b.reglages && b.reglages.actif === false), rangementAuto: false },
    etat: { dernierTour: dateIso(etat.dernierTour), erreur: etat.erreur ? texte(etat.erreur, 300) : null, recus: assainirEtatBoite(etat.recus), envoyes,
      // Adresses des fiches déjà relues sur 30 jours (null : jamais initialisé — la première lecture de 7 jours suffit).
      adressesVues: Array.isArray(etat.adressesVues) ? [...new Set(etat.adressesVues.filter((a) => typeof a === 'string' && /@/.test(a)).map((a) => a.toLowerCase().slice(0, 200)))].slice(-MAX_ADRESSES_VUES) : null,
      // Dossiers dont les emails des 30 derniers jours ont déjà été relus (null : jamais initialisé).
      dossiersVus: Array.isArray(etat.dossiersVus) ? [...new Set(etat.dossiersVus.filter((x) => typeof x === 'string' && x).map((x) => x.slice(0, 100)))].slice(-MAX_DOSSIERS_VUS) : null },
    emails: (Array.isArray(b.emails) ? b.emails : []).map(assainirEmail).filter(Boolean)
      .sort((x, y) => x.date.localeCompare(y.date)).slice(-MAX_EMAILS),
    prepares: (Array.isArray(b.prepares) ? b.prepares : []).map(assainirPrepare).filter(Boolean).slice(-MAX_PREPARES),
    // Envois rattachés à aucun dossier (objet, destinataires, date ; 45 jours) : recoupés avec les courriers de clôture des comptes d'une
    // succession relevés dans Authentic (clotureComptesEmail.js), même relevés après l'envoi.
    envoisNonRattaches: envoisAGarder(Array.isArray(b.envoisNonRattaches) ? b.envoisNonRattaches : [], [], new Date())
  };
}

function lireEtat(parametresRepo) { return assainirEmailsDossiers(parametresRepo.lireJsonBrut(CLE_EMAILS_DOSSIERS, {})); }
function ecrireEtat(parametresRepo, e) { return parametresRepo.ecrireJsonBrut(CLE_EMAILS_DOSSIERS, assainirEmailsDossiers(e)); }
// Écriture par le TOUR (qui a lu l'état au départ puis attendu Exchange et l'IA) : les réglages et les emails préparés
// enregistrés entre-temps par une personne sont repris de l'état actuel (audit 12/10 : un interrupteur basculé pendant un
// tour revenait, un email préparé disparaissait).
function ecrireEtatTour(parametresRepo, e) {
  const actuel = lireEtat(parametresRepo);
  const ids = new Set((e.prepares || []).map((p) => p && p.id));
  const nouveaux = (actuel.prepares || []).filter((p) => p && !ids.has(p.id));
  return ecrireEtat(parametresRepo, { ...e, reglages: actuel.reglages, prepares: [...(e.prepares || []), ...nouveaux] });
}

// ---- Pur ----
const idCourt = (itemId) => crypto.createHash('sha1').update(String(itemId)).digest('hex').slice(0, 20);

// Un email envoyé est-il celui qu'un poste a préparé ? Même objet, un destinataire commun (si le
// préparé en nomme), envoyé après la préparation (10 min de marge d'horloge) et dans les 30 jours.
function correspondAuPrepare(prepare, envoye) {
  if (!prepare || !envoye || prepare.envoyeLe) return false;
  if (!prepare.objet || normaliserObjet(prepare.objet) !== normaliserObjet(envoye.objet)) return false;
  const t = Date.parse(envoye.date), p = Date.parse(prepare.prepareLe);
  if (!(t >= p - 10 * 60000 && t <= p + 30 * 86400000)) return false;
  if (!prepare.destinataires.length) return true;
  return prepare.destinataires.some((a) => (envoye.a || []).includes(a));
}

// Le dossier d'un email envoyé : un destinataire est une adresse d'un dossier en cours (l'objet départage un confrère
// de plusieurs dossiers), sinon un destinataire d'un dossier archivé (étude 06/10) — jamais l'objet seul (étude 07/10 :
// « ne mettre que les emails liés aux adresses des clients », voir dossierDeEmailParAdresse).
function dossierDeEmailEnvoye(e, ctx) {
  const sujetN = normaliser(e.objet);
  const parmi = (carte, archive) => {
    for (const a of e.a || []) {
      const adresse = String(a).toLowerCase();
      const d = parmiDossiersAdresse(carte && carte.get(adresse), sujetN, archive && ctx.parAdresse.has(adresse));
      if (d) return d;
    }
    return null;
  };
  return parmi(ctx.parAdresse) || parmi(ctx.parAdresseArchive, true);
}

// Point terrain (étude 06/10) : un email reçu rattaché à un dossier archivé. (Le rattachement par le fil de la conversation —
// réponse « RE: », adresse écrite par l'étude — est retiré depuis le 07/10 : adresses de la fiche seulement.)
function noterRegleRattachement(parametresRepo, ctx, e, d) {
  if (d && d.archive) noterVerification(parametresRepo, 'emails-rattachement-archive');
}

const sujetsDe = (objet, extrait) => {
  const t = normaliser(objet) + ' ' + normaliser(extrait);
  return SUJETS_EMAIL.filter((x) => x.re.test(t)).map((x) => x.libelle);
};

// Texte de l'email sans la partie citée (« Le … a écrit », « De : … », lignes « > »).
function texteSansCitation(t) {
  const lignes = String(t || '').replace(/\r/g, '').split('\n');
  const fin = lignes.findIndex((l) => /^\s*(?:>|-{2,}\s*(?:message d.origine|original message)|de\s*:\s|from\s*:\s)|a écrit\s*:\s*$|wrote\s*:\s*$/i.test(l));
  return (fin > 0 ? lignes.slice(0, fin) : lignes).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Adresses gardées dans les Réglages pour Teams seulement (étude 15/10 : factures de succession à Sophie) — jamais une boîte lue.
const PERSONNES_TEAMS_SEULEMENT = ['Sophie GOSSART'];

// Boîtes dont les envois sont lus : le compte relié, puis chaque collaborateur qui a une adresse.
function boitesEnvoyes(reglagesExchange, reglagesRappels) {
  const compte = String(reglagesExchange.email || '').trim().toLowerCase();
  const parAdresse = new Map();
  const emails = (reglagesRappels && reglagesRappels.emailsResponsables) || {};
  for (const [nom, adr] of Object.entries(emails)) {
    if (PERSONNES_TEAMS_SEULEMENT.includes(nom)) continue;
    const a = String(adr || '').trim().toLowerCase();
    if (/@/.test(a) && !parAdresse.has(a)) parAdresse.set(a, nom);
  }
  const liste = [];
  if (compte) liste.push({ adresse: compte, collaborateur: parAdresse.get(compte) || 'Compte relié', propre: true });
  for (const [a, nom] of parAdresse) if (a !== compte) liste.push({ adresse: a, collaborateur: nom, propre: false });
  return liste;
}

// Pure : les adresses des fiches qui n'ont pas encore été relues sur 30 jours.
function adressesNouvellesFiches(adresses, vues) {
  const v = vues instanceof Set ? vues : new Set(vues || []);
  return [...new Set((adresses || []).map((a) => String(a || '').toLowerCase()).filter((a) => /@/.test(a) && !v.has(a)))];
}

// Pure : les dossiers actifs pas encore relus sur 30 jours → { nouveaux: Set, vus: [] } (vus = état à garder
// si tout est repris). Première fois (`vus` null) : seuls les dossiers créés depuis moins de 3 jours.
function dossiersNouveauxEmails(actifs, vus, maintenant) {
  const ids = (actifs || []).filter((d) => d && d.id).map((d) => d.id);
  if (!Array.isArray(vus)) {
    const limite = new Date(maintenant).getTime() - JOURS_DOSSIER_RECENT_INIT * 86400000;
    const recent = (d) => ((d.historique || []).find((h) => h && h.texte === 'Dossier créé') || {}).date;
    const nouveaux = new Set((actifs || []).filter((d) => d && d.id && recent(d) && new Date(recent(d)).getTime() >= limite).map((d) => d.id));
    return { nouveaux, vus: ids.filter((id) => !nouveaux.has(id)) };
  }
  const v = new Set(vus);
  return { nouveaux: new Set(ids.filter((id) => !v.has(id))), vus: [...vus] };
}

// ---- EWS ----
function dossierEws(id, boite) {
  return boite
    ? `<t:DistinguishedFolderId Id="${id}"><t:Mailbox><t:EmailAddress>${echapperXml(boite)}</t:EmailAddress></t:Mailbox></t:DistinguishedFolderId>`
    : `<t:DistinguishedFolderId Id="${id}"/>`;
}

function corpsFind(dossier, boite, depuisUtc, champDate, { ordre = 'Ascending', max = 200 } = {}) {
  return ENVELOPPE_DEBUT
    + '<m:FindItem Traversal="Shallow"><m:ItemShape><t:BaseShape>IdOnly</t:BaseShape><t:AdditionalProperties>'
    + '<t:FieldURI FieldURI="item:Subject"/><t:FieldURI FieldURI="message:From"/>'
    + `<t:FieldURI FieldURI="${champDate}"/><t:FieldURI FieldURI="item:HasAttachments"/><t:FieldURI FieldURI="item:Preview"/>`
    + '</t:AdditionalProperties></m:ItemShape>'
    + `<m:IndexedPageItemView MaxEntriesReturned="${Math.max(1, Math.min(1000, Number(max) || 200))}" Offset="0" BasePoint="Beginning"/>`
    + `<m:Restriction><t:IsGreaterThan><t:FieldURI FieldURI="${champDate}"/>`
    + `<t:FieldURIOrConstant><t:Constant Value="${echapperXml(depuisUtc)}"/></t:FieldURIOrConstant></t:IsGreaterThan></m:Restriction>`
    + `<m:SortOrder><t:FieldOrder Order="${ordre === 'Descending' ? 'Descending' : 'Ascending'}"><t:FieldURI FieldURI="${champDate}"/></t:FieldOrder></m:SortOrder>`
    + `<m:ParentFolderIds>${dossierEws(dossier, boite)}</m:ParentFolderIds></m:FindItem>` + ENVELOPPE_FIN;
}

function corpsGetItems(itemIds, avecTexte) {
  return ENVELOPPE_DEBUT
    + `<m:GetItem><m:ItemShape><t:BaseShape>IdOnly</t:BaseShape>${avecTexte ? '<t:BodyType>Text</t:BodyType>' : ''}<t:AdditionalProperties>`
    + '<t:FieldURI FieldURI="message:ToRecipients"/><t:FieldURI FieldURI="message:CcRecipients"/>'
    + (avecTexte ? '<t:FieldURI FieldURI="item:Body"/><t:FieldURI FieldURI="item:Attachments"/>' : '')
    + '</t:AdditionalProperties></m:ItemShape><m:ItemIds>'
    + itemIds.map((id) => `<t:ItemId Id="${echapperXml(id)}"/>`).join('') + '</m:ItemIds></m:GetItem>' + ENVELOPPE_FIN;
}

function corpsGetAttachment(id) {
  return ENVELOPPE_DEBUT + `<m:GetAttachment><m:AttachmentIds><t:AttachmentId Id="${echapperXml(id)}"/></m:AttachmentIds></m:GetAttachment>` + ENVELOPPE_FIN;
}

// Lecture des réponses EWS par le lecteur XML commun (exchange/xml.js, fast-xml-parser) — plus d'expressions
// régulières sur le XML depuis le 04/10.
const lireBalise = (noeud, tag) => texteDe(noeud, tag).trim();
const adressesDe = (noeud) => tous(noeud, 'EmailAddress').map((a) => texteXml(a).trim().toLowerCase()).filter((a) => /@/.test(a));

function parseFind(corps) {
  const liste = [];
  for (const bloc of tous(lireXml(corps), 'Message')) {
    const from = premier(bloc, 'From');
    liste.push({
      itemId: identifiantElement(bloc).itemId,
      objet: lireBalise(bloc, 'Subject'),
      deNom: lireBalise(from, 'Name'),
      deAdresse: (adressesDe(from)[0] || ''),
      date: lireBalise(bloc, 'DateTimeReceived') || lireBalise(bloc, 'DateTimeSent'),
      pj: lireBalise(bloc, 'HasAttachments') === 'true',
      apercu: lireBalise(bloc, 'Preview')
    });
  }
  return liste.filter((x) => x.itemId);
}

function parseGetItems(corps) {
  const parId = new Map();
  for (const bloc of tous(lireXml(corps), 'Message')) {
    const id = identifiantElement(bloc).itemId;
    if (!id) continue;
    const a = adressesDe(premier(bloc, 'ToRecipients')).concat(adressesDe(premier(bloc, 'CcRecipients')));
    const pjs = [];
    for (const f of tous(bloc, 'FileAttachment')) {
      if (lireBalise(f, 'IsInline') === 'true') continue;
      const aid = attribut(premier(f, 'AttachmentId'), 'Id');
      if (aid) pjs.push({ id: aid, nom: lireBalise(f, 'Name'), type: lireBalise(f, 'ContentType'), taille: Number(lireBalise(f, 'Size')) || 0 });
    }
    parId.set(id, { a: [...new Set(a)], corps: texteDe(bloc, 'Body'), pjs });
  }
  return parId;
}

function parseGetAttachment(corps) {
  const bloc = premier(lireXml(corps), 'FileAttachment');
  if (!bloc) return null;
  const b64 = texteDe(bloc, 'Content');
  return { nom: lireBalise(bloc, 'Name'), contenu: Buffer.from(b64.replace(/\s+/g, ''), 'base64') };
}

const codeReponse = (corps) => codeReponseXml(lireXml(corps));
const succes = succesSansErreur;

// ---- Résumé par l'IA locale ----
function promptResumeEmail(e, dossierNom, corps) {
  return [
    'Tu es l’assistant d’une étude notariale française. Voici un email reçu pour le dossier de vente « VTE - ' + (dossierNom || '?') + ' ».',
    `De : ${e.de.nom || e.de.adresse} | Objet : ${e.objet || '(sans objet)'}${e.pj.length ? ' | pièces jointes : ' + e.pj.map((p) => p.nom).join(', ') : ''}`,
    'Texte :', String(corps || '').slice(0, 3000), '',
    'Résume en UNE phrase (25 mots au plus) ce que l’expéditeur apporte ou demande, sans inventer ni montant ni date absents du texte.',
    'Réponds avec un objet JSON exactement de cette forme : {"resume": "…"}'
  ].join('\n');
}

const validerResume = (o) => (o && typeof o.resume === 'string' && o.resume.trim() ? null : 'le champ "resume" (texte) est obligatoire');

async function resumerEnArrierePlan(parametresRepo, aResumer, ollama) {
  if (!ollama || !aResumer.length) return;
  let dispo;
  try { dispo = await ollama.verifierDisponibilite(); } catch (_) { dispo = { disponible: false }; }
  for (const x of aResumer) {
    let resume = null, erreur = null;
    if (!dispo.disponible) erreur = 'IA locale indisponible';
    else {
      try { resume = String((await ollama.genererJson(promptResumeEmail(x.email, x.dossierNom, x.corps), validerResume)).resume).trim(); }
      catch (e) { erreur = 'Résumé impossible'; }
    }
    x.corps = null; // le texte n'est jamais gardé
    const etat = lireEtat(parametresRepo);
    const cible = etat.emails.find((m) => m.id === x.email.id);
    if (cible) { cible.resume = resume; cible.resumeErreur = erreur; ecrireEtatTour(parametresRepo, etat); }
    noterVerification(parametresRepo, 'email-resume-ia', resume ? {} : { ok: false, message: erreur });
  }
}

// ---- Tour ----
function connexionPrete(r) { return Boolean(r && r.actif && r.url && r.email && r.motDePasse); }

// Un seul tour à la fois (relève automatique chaque minute et « Lire maintenant » partagent le même) : un
// second appel pendant un tour reçoit le résultat de celui en cours.
let tourCourant = null;
let fileResumes = Promise.resolve();
// Envois dont le texte est relu dans un tour pour y chercher « projet d'acte de vente » (objet muet, pièce jointe).
const MAX_CORPS_PROJET_TOUR = 20;

function executerTourEmailsDossiers(depot, parametresRepo, injections = {}, manuel = false) {
  if (tourCourant) return tourCourant;
  tourCourant = tourEmailsDossiers(depot, parametresRepo, injections, manuel).finally(() => { tourCourant = null; });
  return tourCourant;
}

async function tourEmailsDossiers(depot, parametresRepo, injections = {}, manuel = false) {
  const agendaWatch = require('./agendaWatch');
  const { posterEws } = require('./exchange/ews');
  const reglages = parametresRepo.lireReglagesExchange ? parametresRepo.lireReglagesExchange() : {};
  const etat = lireEtat(parametresRepo);
  const resultat = { ok: false, recus: 0, envoyes: 0, confirmes: 0, erreur: null };
  if (!etat.reglages.actif) { resultat.erreur = 'Lecture des emails des dossiers désactivée.'; return resultat; }
  if (!connexionPrete(reglages)) { resultat.erreur = 'La connexion Exchange n’est pas configurée (Réglages › Agenda et Outlook).'; return resultat; }
  if (!manuel && agendaWatch.lectureAgendaSuspendue(reglages)) { resultat.erreur = 'Lecture suspendue : identifiants de messagerie refusés.'; return resultat; }
  const poster = (body) => posterEws({ url: reglages.url, email: reglages.email, motDePasse: reglages.motDePasse, body }, injections);
  const maintenant = injections.maintenant ? new Date(injections.maintenant) : new Date();
  const depuisDefaut = new Date(maintenant.getTime() - JOURS_PREMIERE_LECTURE * 86400000).toISOString();
  const refus = (r) => !r.echec && (r.statut === 401 || r.statut === 403);
  const dossiers = depot.tousActifs();
  const rappels = parametresRepo.lireReglages ? parametresRepo.lireReglages() : {};
  const ignorees = [rappels.smtpUtilisateur, rappels.emailPasserelle].filter(Boolean);
  // Adresses de l'étude (compte relié, collaborateurs) : jamais une adresse « écrite pour un dossier ».
  const internes = [reglages.email, ...Object.values((rappels && rappels.emailsResponsables) || {})].filter(Boolean);
  const ctx = contexteClassement(dossiers, ignorees, { emails: etat.emails, prepares: etat.prepares, internes });
  // Emails rattachés avant la règle « adresses de la fiche seulement » (étude 07/10) par l'objet, un fil ou une adresse de
  // l'étude : retirés de leur dossier.
  const avantTri = etat.emails.length;
  etat.emails = etat.emails.filter((e) => emailLieAuxAdressesDuDossier(e, ctx));
  if (etat.emails.length < avantTri) resultat.retires = avantTri - etat.emails.length;
  const connus = new Set(etat.emails.map((e) => e.id));
  const aResumer = [];
  /** @type {any[]} */
  const nonRattaches = [];

  // 1. Boîte de réception du compte relié.
  const r = await poster(corpsFind('inbox', null, etat.etat.recus.dernier || depuisDefaut, 'item:DateTimeReceived'));
  if (refus(r)) { agendaWatch.signalerIdentifiantsRefuses(reglages); resultat.erreur = 'Identifiants de messagerie refusés : vérifiez les Réglages.'; etat.etat.erreur = resultat.erreur; ecrireEtatTour(parametresRepo, etat); return resultat; }
  if (r.echec || !succes(r.corps)) {
    etat.etat.recus = { ...etat.etat.recus, statut: 'erreur', message: r.echec ? r.echec.message : `Lecture impossible (${codeReponse(r.corps) || r.statut}).`, luLe: maintenant.toISOString() };
    noterVerification(parametresRepo, 'emails-dossiers-reception', { ok: false, message: etat.etat.recus.message });
  } else {
    const trouves = parseFind(r.corps);
    const aLire = [];
    for (const e of trouves) {
      if (connus.has(idCourt(e.itemId)) || ctx.ignorees.has(e.deAdresse) || /\[CLAIRE-/i.test(e.objet)) continue;
      const d = dossierDeEmailParAdresse({ sujet: e.objet, apercu: e.apercu, deAdresse: e.deAdresse }, ctx);
      if (d) aLire.push({ e, d });
    }
    const lot = aLire.slice(0, MAX_LECTURES_TOUR);
    const details = lot.length ? await poster(corpsGetItems(lot.map((x) => x.e.itemId), true)) : null;
    if (details && refus(details)) { agendaWatch.signalerIdentifiantsRefuses(reglages); resultat.erreur = 'Identifiants de messagerie refusés : vérifiez les Réglages.'; ecrireEtatTour(parametresRepo, etat); return resultat; }
    const parId = details && !details.echec ? parseGetItems(details.corps) : new Map();
    for (const { e, d } of lot) {
      const det = parId.get(e.itemId) || { a: [], corps: '', pjs: [] };
      const corps = texteSansCitation(det.corps);
      const email = assainirEmail({
        id: idCourt(e.itemId), itemId: e.itemId, dossierId: d.id, sens: 'recu', date: e.date,
        de: { nom: e.deNom, adresse: e.deAdresse }, a: det.a, objet: e.objet, sujets: sujetsDe(e.objet, corps.slice(0, 1500)),
        boite: reglages.email, pj: det.pjs.map((p) => ({ ...p, rangee: null }))
      });
      etat.emails.push(email);
      connus.add(email.id);
      resultat.recus++;
      noterRegleRattachement(parametresRepo, ctx, e, d);
      if (corps) aResumer.push({ email, dossierNom: d.nom, corps });
    }
    // Le repère n'avance que jusqu'au dernier email traité (le reste au tour suivant).
    const dernierTraite = lot.length < aLire.length ? lot[lot.length - 1].e.date : (trouves.length ? trouves[trouves.length - 1].date : null);
    if (resultat.recus) noterVerification(parametresRepo, 'emails-dossiers-reception');
    etat.etat.recus = { ...etat.etat.recus, statut: 'ok', message: '', luLe: maintenant.toISOString(), lus: (etat.etat.recus.lus || 0) + resultat.recus,
      dernier: dateIso(dernierTraite) || etat.etat.recus.dernier || depuisDefaut, collaborateur: 'Boîte de réception' };

    // 1 bis. Adresses nouvellement saisies sur une fiche (client, confrère) : relecture des 30 derniers jours,
    // emails de ces adresses seulement — sans toucher au repère de lecture.
    const adressesFiches = [...new Set([...ctx.parAdresse.keys(), ...ctx.parAdresseArchive.keys()])];
    if (etat.etat.adressesVues === null) etat.etat.adressesVues = adressesFiches;
    const parDossiers = dossiersNouveauxEmails(ctx.actifs, etat.etat.dossiersVus, maintenant);
    const nouveauxDossiers = parDossiers.nouveaux;
    if (!nouveauxDossiers.size) etat.etat.dossiersVus = parDossiers.vus;
    {
      const vues = new Set(etat.etat.adressesVues);
      const nouvelles = new Set(adressesNouvellesFiches(adressesFiches, vues));
      if (nouvelles.size || nouveauxDossiers.size) {
        const depuis30 = new Date(maintenant.getTime() - JOURS_RATTRAPAGE_ADRESSE * 86400000).toISOString();
        const rr = await poster(corpsFind('inbox', null, depuis30, 'item:DateTimeReceived', { ordre: 'Descending', max: 1000 }));
        if (refus(rr)) { agendaWatch.signalerIdentifiantsRefuses(reglages); resultat.erreur = 'Identifiants de messagerie refusés : vérifiez les Réglages.'; ecrireEtatTour(parametresRepo, etat); return resultat; }
        if (!rr.echec && succes(rr.corps)) {
          const aRattraper = parseFind(rr.corps).filter((e) => !connus.has(idCourt(e.itemId)) && !ctx.ignorees.has(e.deAdresse) && !/\[CLAIRE-/i.test(e.objet))
            .map((e) => {
              if (nouvelles.has(e.deAdresse)) { const d = dossierDeEmailParAdresse({ sujet: e.objet, apercu: e.apercu, deAdresse: e.deAdresse }, ctx); return d ? { e, d } : null; }
              const d = nouveauxDossiers.size ? dossierDeEmailParAdresse({ sujet: e.objet, apercu: e.apercu, deAdresse: e.deAdresse }, ctx) : null;
              return d && nouveauxDossiers.has(d.id) ? { e, d } : null;
            }).filter(Boolean);
          const lot2 = aRattraper.slice(0, MAX_LECTURES_TOUR);
          const det2 = lot2.length ? await poster(corpsGetItems(lot2.map((x) => x.e.itemId), true)) : null;
          const parId2 = det2 && !det2.echec && succes(det2.corps) ? parseGetItems(det2.corps) : (lot2.length ? null : new Map());
          if (parId2) {
            for (const { e, d } of lot2) {
              const det = parId2.get(e.itemId) || { a: [], corps: '', pjs: [] };
              const corps = texteSansCitation(det.corps);
              const email = assainirEmail({
                id: idCourt(e.itemId), itemId: e.itemId, dossierId: d.id, sens: 'recu', date: e.date,
                de: { nom: e.deNom, adresse: e.deAdresse }, a: det.a, objet: e.objet, sujets: sujetsDe(e.objet, corps.slice(0, 1500)),
                boite: reglages.email, pj: det.pjs.map((p) => ({ ...p, rangee: null }))
              });
              etat.emails.push(email);
              connus.add(email.id);
              resultat.recus++;
              resultat.rattrapes = (resultat.rattrapes || 0) + 1;
              noterRegleRattachement(parametresRepo, ctx, e, d);
              if (corps) aResumer.push({ email, dossierNom: d.nom, corps });
            }
            if (lot2.length) noterVerification(parametresRepo, 'emails-adresse-rattrapage', { detail: `${lot2.length} email(s) retrouvé(s)` });
            // Une adresse n'est marquée relue que si tous ses emails ont été repris (le reste au tour suivant).
            const reste = aRattraper.slice(MAX_LECTURES_TOUR);
            const restantes = new Set(reste.map((x) => x.e.deAdresse));
            const dossiersRestants = new Set(reste.map((x) => x.d.id));
            etat.etat.adressesVues = [...vues, ...[...nouvelles].filter((a) => !restantes.has(a))];
            if (nouveauxDossiers.size) etat.etat.dossiersVus = parDossiers.vus.concat([...nouveauxDossiers].filter((id) => !dossiersRestants.has(id)));
            if (lot2.some((x) => nouveauxDossiers.has(x.d.id))) noterVerification(parametresRepo, 'emails-dossier-rattrapage', { detail: `${lot2.filter((x) => nouveauxDossiers.has(x.d.id)).length} email(s) retrouvé(s)` });
          }
        }
      }
    }
  }

  // 2. Éléments envoyés de chaque boîte.
  for (const b of boitesEnvoyes(reglages, rappels)) {
    const prec = etat.etat.envoyes[b.adresse] || assainirEtatBoite({});
    // Compte du collaborateur enregistré (étude 05/10) : lecture avec SON identifiant, dans sa propre boîte (aucun accès délégué à
    // donner) ; refusé par Exchange → compte retenu, un seul essai, le tour continue (le compte relié n'y est pour rien).
    const acces = b.propre ? null : accesCollaborateur(parametresRepo, b.collaborateur, b.adresse);
    const posterBoite = acces ? (body) => posterEws({ url: reglages.url, email: acces.email, motDePasse: acces.motDePasse, body }, injections) : poster;
    const f = await posterBoite(corpsFind('sentitems', b.propre || acces ? null : b.adresse, prec.dernier || depuisDefaut, 'item:DateTimeSent'));
    if (acces && refus(f)) {
      marquerRefus(parametresRepo, b.collaborateur, maintenant.getTime());
      etat.etat.envoyes[b.adresse] = { ...prec, collaborateur: b.collaborateur, luLe: maintenant.toISOString(), statut: 'refuse',
        message: 'Identifiants du collaborateur refusés par Exchange : corrigez-les dans Réglages › Collaborateurs.' };
      noterVerification(parametresRepo, 'emails-envoyes-compte-collaborateur', { ok: false, message: 'identifiants du collaborateur refusés par Exchange' });
      continue;
    }
    if (refus(f)) { agendaWatch.signalerIdentifiantsRefuses(reglages); resultat.erreur = 'Identifiants de messagerie refusés : vérifiez les Réglages.'; break; }
    const code = f.echec ? '' : codeReponse(f.corps);
    if (f.echec || !succes(f.corps)) {
      const refuse = CODES_ACCES_REFUSE.test(code);
      etat.etat.envoyes[b.adresse] = { ...prec, collaborateur: b.collaborateur, luLe: maintenant.toISOString(),
        statut: refuse ? 'refuse' : 'erreur', message: refuse ? (acces ? 'Accès à la boîte refusé par Exchange avec le compte du collaborateur.' : 'Accès aux « Éléments envoyés » non donné au compte relié.') : (f.echec ? f.echec.message : `Lecture impossible (${code || f.statut}).`) };
      if (!b.propre) noterVerification(parametresRepo, acces ? 'emails-envoyes-compte-collaborateur' : 'emails-envoyes-collaborateur', { ok: false, message: etat.etat.envoyes[b.adresse].message });
      continue;
    }
    const trouves = parseFind(f.corps).filter((e) => !connus.has(idCourt(e.itemId)));
    const lot = trouves.slice(0, 50);
    const det = lot.length ? await posterBoite(corpsGetItems(lot.map((e) => e.itemId), false)) : null;
    const parId = det && !det.echec ? parseGetItems(det.corps) : new Map();
    /** @type {Array<{ itemId: string, envoye: any, d: any }>} */
    const corpsALire = [];
    for (const e of lot) {
      const a = (parId.get(e.itemId) || {}).a || [];
      const envoye = { objet: e.objet, a, date: e.date, pj: e.pj, boite: b.adresse, collaborateur: b.collaborateur };
      const prepare = etat.prepares.find((p) => correspondAuPrepare(p, envoye));
      const d = prepare ? dossiers.find((x) => x.id === prepare.dossierId) || dossierDeEmailEnvoye(envoye, ctx) : dossierDeEmailEnvoye(envoye, ctx);
      if (!d && !prepare) { nonRattaches.push({ id: idCourt(e.itemId), date: e.date, objet: e.objet, a }); continue; }
      const email = assainirEmail({ id: idCourt(e.itemId), itemId: e.itemId, dossierId: d ? d.id : (prepare && prepare.dossierId) || '', sens: 'envoye',
        date: e.date, de: { nom: b.collaborateur, adresse: b.adresse }, a, objet: e.objet, sujets: sujetsDe(e.objet, ''),
        boite: b.adresse, collaborateur: b.collaborateur, prepareId: prepare ? prepare.id : null });
      etat.emails.push(email);
      connus.add(email.id);
      resultat.envoyes++;
      // Projet d'acte envoyé (étude 06/10) : l'échéance du dossier est cochée ; la mention de l'agenda suit côté poste. Objet muet
      // mais pièce jointe : le texte est relu après la boucle (étude 07/10).
      if (d && typeof depot.remplacer === 'function') {
        if (cocherProjetSurCopieFraiche(depot, d, envoye)) {
          resultat.projetsCoches = (resultat.projetsCoches || 0) + 1;
          noterVerification(parametresRepo, 'email-projet-detecte');
        } else if (corpsALirePourProjet(d, envoye) && corpsALire.length < MAX_CORPS_PROJET_TOUR) corpsALire.push({ itemId: e.itemId, envoye, d });
      }
      if (prepare) { prepare.envoyeLe = email.date; prepare.boite = b.adresse; prepare.emailId = email.id; resultat.confirmes++; noterVerification(parametresRepo, 'email-prepare-envoye'); }
    }
    // Texte des envois candidats, lu le temps du test (partie citée retirée), jamais gardé ni journalisé.
    if (corpsALire.length) {
      const lu = await posterBoite(corpsGetItems(corpsALire.map((x) => x.itemId), true));
      const textes = lu && !lu.echec ? parseGetItems(lu.corps) : new Map();
      for (const x of corpsALire) {
        const corps = texteSansCitation((textes.get(x.itemId) || {}).corps || '');
        if (cocherProjetSurCopieFraiche(depot, x.d, { ...x.envoye, corps })) {
          resultat.projetsCoches = (resultat.projetsCoches || 0) + 1;
          noterVerification(parametresRepo, 'email-projet-detecte');
        }
      }
    }
    const dernier = lot.length < trouves.length ? lot[lot.length - 1].date : (trouves.length ? trouves[trouves.length - 1].date : null);
    if (!b.propre) noterVerification(parametresRepo, acces ? 'emails-envoyes-compte-collaborateur' : 'emails-envoyes-collaborateur');
    if (acces) leverRefus(parametresRepo, b.collaborateur);
    etat.etat.envoyes[b.adresse] = { collaborateur: b.collaborateur, statut: 'ok', message: '', luLe: maintenant.toISOString(),
      lus: (prec.lus || 0) + lot.length, dernier: dateIso(dernier) || prec.dernier || depuisDefaut };
  }

  // Clôture / transfert des comptes d'une succession (étude 16/10) : un courrier créé dans Authentic + son envoi par email à la banque.
  // Chaque dossier est relu juste avant d'être écrit (audit 13/10) ; un envoi qui a servi n'est plus gardé.
  etat.envoisNonRattaches = envoisAGarder(etat.envoisNonRattaches, nonRattaches, maintenant);
  if (typeof depot.remplacer === 'function' && etat.envoisNonRattaches.length) {
    const successions = depot.tousActifs().filter((x) => x && !x.archive && x.typeAffaire === 'succession');
    const servis = new Set();
    for (const envoye of successions.length ? etat.envoisNonRattaches : []) {
      const trouve = successionDeEnvoiBanque(successions, envoye, ctx.adresseEtude);
      if (!trouve) continue;
      const frais = typeof depot.trouverParId === 'function' ? depot.trouverParId(trouve.d.id) : trouve.d;
      if (!frais || !cocherClotureComptes(frais, trouve.courrier, envoye)) continue;
      depot.remplacer(frais.id, frais);
      Object.assign(trouve.d, frais);
      servis.add(envoye.id);
      resultat.cloturesCochees = (resultat.cloturesCochees || 0) + 1;
      noterVerification(parametresRepo, 'succession-cloture-comptes-email');
    }
    etat.envoisNonRattaches = etat.envoisNonRattaches.filter((e) => !servis.has(e.id));
  }

  // Les boîtes retirées des Réglages ne sont plus listées.
  const actuelles = new Set(boitesEnvoyes(reglages, rappels).map((b) => b.adresse));
  for (const k of Object.keys(etat.etat.envoyes)) if (!actuelles.has(k)) delete etat.etat.envoyes[k];
  etat.etat.dernierTour = maintenant.toISOString();
  etat.etat.erreur = resultat.erreur;
  ecrireEtatTour(parametresRepo, etat);
  resultat.ok = !resultat.erreur;

  const ollama = injections.ollama || (injections.config ? require('./llm').creerClientOllama(injections.config) : null);
  // Relève chaque minute : les résumés s'enchaînent dans une seule file (l'IA locale ne traite qu'un email
  // à la fois), le tour suivant n'attend jamais l'IA.
  const suite = fileResumes = fileResumes.catch(() => {}).then(() => resumerEnArrierePlan(parametresRepo, aResumer, ollama));
  if (injections.attendreIa) await suite; else suite.catch(() => {});
  return resultat;
}

// Une pièce jointe relue dans Exchange (pour l'ouvrir ou la ranger). Rend { nom, contenu } ou { erreur }.
async function lirePieceJointe(parametresRepo, emailId, pjId, injections = {}) {
  const { posterEws } = require('./exchange/ews');
  const reglages = parametresRepo.lireReglagesExchange ? parametresRepo.lireReglagesExchange() : {};
  if (!connexionPrete(reglages)) return { erreur: 'La connexion Exchange n’est pas configurée.', statut: 503 };
  const etat = lireEtat(parametresRepo);
  const email = etat.emails.find((e) => e.id === emailId);
  const pj = email && email.pj.find((p) => p.id === pjId);
  if (!pj) return { erreur: 'Pièce jointe inconnue.', statut: 404 };
  if (pj.taille > TAILLE_MAX_PJ) return { erreur: 'Pièce jointe trop lourde (20 Mo au plus).', statut: 413 };
  const r = await posterEws({ url: reglages.url, email: reglages.email, motDePasse: reglages.motDePasse, body: corpsGetAttachment(pj.id), delaiMs: 60000 }, injections);
  if (r.echec) return { erreur: r.echec.message, statut: 502 };
  if (r.statut === 401 || r.statut === 403) return { erreur: 'Identifiants de messagerie refusés.', statut: 502 };
  const f = succes(r.corps) ? parseGetAttachment(r.corps) : null;
  if (!f || !f.contenu.length) return { erreur: `Pièce jointe illisible (${codeReponse(r.corps) || r.statut}).`, statut: 502 };
  return { nom: f.nom || pj.nom, contenu: f.contenu, type: pj.type, email, pj };
}

// L'email en entier (étude 02/10 : « lisibles en entier dans CLAIRE »), relu dans Exchange à chaque ouverture
// et JAMAIS gardé ni journalisé : texte (Exchange convertit un email HTML en texte), destinataires, pièces
// jointes. Rend { texte, a, de, objet, date } ou { erreur, statut }.
async function lireEmailComplet(parametresRepo, emailId, injections = {}) {
  const { posterEws } = require('./exchange/ews');
  const reglages = parametresRepo.lireReglagesExchange ? parametresRepo.lireReglagesExchange() : {};
  if (!connexionPrete(reglages)) return { erreur: 'La connexion Exchange n’est pas configurée.', statut: 503 };
  const email = lireEtat(parametresRepo).emails.find((e) => e.id === emailId);
  if (!email || !email.itemId) return { erreur: 'Email inconnu.', statut: 404 };
  // Un email envoyé lu avec le compte du collaborateur n'existe que dans sa boîte : on le relit avec ce compte.
  const rappels = parametresRepo.lireReglages ? parametresRepo.lireReglages() : {};
  const acces = email.sens === 'envoye' && email.collaborateur && email.boite !== String(reglages.email || '').toLowerCase()
    ? accesCollaborateur(parametresRepo, email.collaborateur, ((rappels.emailsResponsables || {})[email.collaborateur]) || email.boite) : null;
  const r = await posterEws({ url: reglages.url, email: acces ? acces.email : reglages.email, motDePasse: acces ? acces.motDePasse : reglages.motDePasse, body: corpsGetItems([email.itemId], true), delaiMs: 30000 }, injections);
  if (r.echec) return { erreur: r.echec.message, statut: 502 };
  if (r.statut === 401 || r.statut === 403) return { erreur: 'Identifiants de messagerie refusés.', statut: 502 };
  const lu = succes(r.corps) ? parseGetItems(r.corps).get(email.itemId) : null;
  if (!lu) return { erreur: `Email introuvable dans la boîte (${codeReponse(r.corps) || r.statut}) : il a été déplacé ou supprimé (par exemple classé dans une archive locale d’Outlook, que CLAIRE ne peut pas lire).`, statut: 404, introuvable: true };
  return { texte: lu.corps, a: lu.a.length ? lu.a : email.a, de: email.de, objet: email.objet, date: email.date, sens: email.sens };
}

function demarrerSurveillanceEmailsDossiers(depot, parametresRepo, config, intervalleMs) {
  let enCours = false;
  const tour = async () => {
    if (enCours) return;
    enCours = true;
    try {
      const r = await executerTourEmailsDossiers(depot, parametresRepo, { config });
      if (r.erreur && !/n’est pas configurée|suspendue|désactivée/.test(r.erreur)) console.warn('[CLAIRE] Emails des dossiers :', r.erreur);
    } catch (e) {
      console.warn('[CLAIRE] Emails des dossiers interrompus :', e.message);
    } finally { enCours = false; }
  };
  setTimeout(tour, 20 * 1000);
  return setInterval(tour, intervalleMs || INTERVALLE_EMAILS_MS);
}

module.exports = {
  CLE_EMAILS_DOSSIERS, MAX_EMAILS, TAILLE_MAX_PJ, assainirEmailsDossiers, assainirPrepare, lireEtat, ecrireEtat, idCourt,
  normaliserObjet, correspondAuPrepare, dossierDeEmailEnvoye, texteSansCitation, boitesEnvoyes,
  adressesNouvellesFiches, JOURS_RATTRAPAGE_ADRESSE, dossiersNouveauxEmails,
  corpsFind, corpsGetItems, corpsGetAttachment, parseFind, parseGetItems, parseGetAttachment, promptResumeEmail,
  executerTourEmailsDossiers, lirePieceJointe, lireEmailComplet, demarrerSurveillanceEmailsDossiers
};
