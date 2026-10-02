'use strict';
// ---- Emails des dossiers (étude, 02/10 : « tu peux lire le contenu » ; « tu peux lire les emails
// envoyés pour confirmer » ; choix : repérer, ranger les pièces jointes sur le NAS, résumé par l'IA locale ;
// « boîte de chacun » pour les envois) ----
//
// Toutes les minutes (étude 02/10), par EWS (mêmes identifiants et même disjoncteur que l'agenda, un seul essai par
// appel) :
//   - BOÎTE DE RÉCEPTION du compte relié (celle de Bastien, qui « reçoit tout en double ») : chaque email
//     rattaché à un dossier (expéditeur = client ou confrère du dossier, sinon « VTE - NOM » ou un nom du
//     dossier dans l'objet — mêmes règles que le résumé du matin) est relu en entier : texte et liste des
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
const {
  contexteClassement, dossierDeEmail, normaliser, SUJETS_EMAIL, desechapperXml, echapperXml, ENVELOPPE_DEBUT, ENVELOPPE_FIN
} = require('./emailsMatin');

const CLE_EMAILS_DOSSIERS = 'emails-dossiers';
const MAX_EMAILS = 3000;
const MAX_PREPARES = 500;
const MAX_LECTURES_TOUR = 30;
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
    reglages: { actif: !(b.reglages && b.reglages.actif === false) },
    etat: { dernierTour: dateIso(etat.dernierTour), erreur: etat.erreur ? texte(etat.erreur, 300) : null, recus: assainirEtatBoite(etat.recus), envoyes },
    emails: (Array.isArray(b.emails) ? b.emails : []).map(assainirEmail).filter(Boolean)
      .sort((x, y) => x.date.localeCompare(y.date)).slice(-MAX_EMAILS),
    prepares: (Array.isArray(b.prepares) ? b.prepares : []).map(assainirPrepare).filter(Boolean).slice(-MAX_PREPARES)
  };
}

function lireEtat(parametresRepo) { return assainirEmailsDossiers(parametresRepo.lireJsonBrut(CLE_EMAILS_DOSSIERS, {})); }
function ecrireEtat(parametresRepo, e) { return parametresRepo.ecrireJsonBrut(CLE_EMAILS_DOSSIERS, assainirEmailsDossiers(e)); }

// ---- Pur ----
const idCourt = (itemId) => crypto.createHash('sha1').update(String(itemId)).digest('hex').slice(0, 20);

// Objet comparé sans « RE : », « TR : », accents ni espaces multiples.
function normaliserObjet(s) {
  let o = String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 4; i++) o = o.replace(/^(?:re|tr|fw|fwd|aw)\s*:\s*/, '');
  return o;
}

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

// Le dossier d'un email envoyé : un destinataire est une adresse du dossier, sinon l'objet le désigne.
function dossierDeEmailEnvoye(e, ctx) {
  for (const a of e.a || []) { const d = ctx.parAdresse.get(a); if (d) return d; }
  return dossierDeEmail({ sujet: e.objet, apercu: '', deAdresse: '' }, ctx);
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

// Boîtes dont les envois sont lus : le compte relié, puis chaque collaborateur qui a une adresse.
function boitesEnvoyes(reglagesExchange, reglagesRappels) {
  const compte = String(reglagesExchange.email || '').trim().toLowerCase();
  const parAdresse = new Map();
  const emails = (reglagesRappels && reglagesRappels.emailsResponsables) || {};
  for (const [nom, adr] of Object.entries(emails)) {
    const a = String(adr || '').trim().toLowerCase();
    if (/@/.test(a) && !parAdresse.has(a)) parAdresse.set(a, nom);
  }
  const liste = [];
  if (compte) liste.push({ adresse: compte, collaborateur: parAdresse.get(compte) || 'Compte relié', propre: true });
  for (const [a, nom] of parAdresse) if (a !== compte) liste.push({ adresse: a, collaborateur: nom, propre: false });
  return liste;
}

// ---- EWS ----
function dossierEws(id, boite) {
  return boite
    ? `<t:DistinguishedFolderId Id="${id}"><t:Mailbox><t:EmailAddress>${echapperXml(boite)}</t:EmailAddress></t:Mailbox></t:DistinguishedFolderId>`
    : `<t:DistinguishedFolderId Id="${id}"/>`;
}

function corpsFind(dossier, boite, depuisUtc, champDate) {
  return ENVELOPPE_DEBUT
    + '<m:FindItem Traversal="Shallow"><m:ItemShape><t:BaseShape>IdOnly</t:BaseShape><t:AdditionalProperties>'
    + '<t:FieldURI FieldURI="item:Subject"/><t:FieldURI FieldURI="message:From"/>'
    + `<t:FieldURI FieldURI="${champDate}"/><t:FieldURI FieldURI="item:HasAttachments"/><t:FieldURI FieldURI="item:Preview"/>`
    + '</t:AdditionalProperties></m:ItemShape>'
    + '<m:IndexedPageItemView MaxEntriesReturned="200" Offset="0" BasePoint="Beginning"/>'
    + `<m:Restriction><t:IsGreaterThan><t:FieldURI FieldURI="${champDate}"/>`
    + `<t:FieldURIOrConstant><t:Constant Value="${echapperXml(depuisUtc)}"/></t:FieldURIOrConstant></t:IsGreaterThan></m:Restriction>`
    + `<m:SortOrder><t:FieldOrder Order="Ascending"><t:FieldURI FieldURI="${champDate}"/></t:FieldOrder></m:SortOrder>`
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

const lireBalise = (bloc, tag) => desechapperXml((String(bloc).match(new RegExp(`<t:${tag}>([\\s\\S]*?)</t:${tag}>`)) || [])[1] || '').trim();
const adressesDe = (bloc) => [...String(bloc || '').matchAll(/<t:EmailAddress>([\s\S]*?)<\/t:EmailAddress>/g)].map((m) => desechapperXml(m[1]).trim().toLowerCase()).filter((a) => /@/.test(a));

function parseFind(corps) {
  const liste = [];
  for (const m of String(corps || '').matchAll(/<t:Message\b[\s\S]*?<\/t:Message>/g)) {
    const bloc = m[0];
    const from = (bloc.match(/<t:From>([\s\S]*?)<\/t:From>/) || [])[1] || '';
    liste.push({
      itemId: desechapperXml((bloc.match(/<t:ItemId\b[^>]*\bId="([^"]+)"/) || [])[1] || ''),
      objet: lireBalise(bloc, 'Subject'),
      deNom: desechapperXml((from.match(/<t:Name>([\s\S]*?)<\/t:Name>/) || [])[1] || '').trim(),
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
  for (const m of String(corps || '').matchAll(/<t:Message\b[\s\S]*?<\/t:Message>/g)) {
    const bloc = m[0];
    const id = desechapperXml((bloc.match(/<t:ItemId\b[^>]*\bId="([^"]+)"/) || [])[1] || '');
    if (!id) continue;
    const a = adressesDe((bloc.match(/<t:ToRecipients>([\s\S]*?)<\/t:ToRecipients>/) || [])[1])
      .concat(adressesDe((bloc.match(/<t:CcRecipients>([\s\S]*?)<\/t:CcRecipients>/) || [])[1]));
    const pjs = [];
    for (const f of bloc.matchAll(/<t:FileAttachment>([\s\S]*?)<\/t:FileAttachment>/g)) {
      if (lireBalise(f[1], 'IsInline') === 'true') continue;
      const aid = desechapperXml((f[1].match(/<t:AttachmentId\b[^>]*\bId="([^"]+)"/) || [])[1] || '');
      if (aid) pjs.push({ id: aid, nom: lireBalise(f[1], 'Name'), type: lireBalise(f[1], 'ContentType'), taille: Number(lireBalise(f[1], 'Size')) || 0 });
    }
    parId.set(id, { a: [...new Set(a)], corps: desechapperXml((bloc.match(/<t:Body\b[^>]*>([\s\S]*?)<\/t:Body>/) || [])[1] || ''), pjs });
  }
  return parId;
}

function parseGetAttachment(corps) {
  const bloc = (String(corps || '').match(/<t:FileAttachment>([\s\S]*?)<\/t:FileAttachment>/) || [])[1];
  if (!bloc) return null;
  const b64 = (bloc.match(/<t:Content>([\s\S]*?)<\/t:Content>/) || [])[1] || '';
  return { nom: lireBalise(bloc, 'Name'), contenu: Buffer.from(b64.replace(/\s+/g, ''), 'base64') };
}

const codeReponse = (corps) => (String(corps || '').match(/<m:ResponseCode>([^<]+)<\/m:ResponseCode>/) || [])[1] || '';
const succes = (corps) => /ResponseClass="Success"/.test(String(corps || '')) && !/ResponseClass="Error"/.test(String(corps || ''));

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
    if (cible) { cible.resume = resume; cible.resumeErreur = erreur; ecrireEtat(parametresRepo, etat); }
  }
}

// ---- Tour ----
function connexionPrete(r) { return Boolean(r && r.actif && r.url && r.email && r.motDePasse); }

// Un seul tour à la fois (relève automatique chaque minute et « Lire maintenant » partagent le même) : un
// second appel pendant un tour reçoit le résultat de celui en cours.
let tourCourant = null;
let fileResumes = Promise.resolve();
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
  const ctx = contexteClassement(dossiers, ignorees);
  const connus = new Set(etat.emails.map((e) => e.id));
  const aResumer = [];

  // 1. Boîte de réception du compte relié.
  const r = await poster(corpsFind('inbox', null, etat.etat.recus.dernier || depuisDefaut, 'item:DateTimeReceived'));
  if (refus(r)) { agendaWatch.signalerIdentifiantsRefuses(reglages); resultat.erreur = 'Identifiants de messagerie refusés : vérifiez les Réglages.'; etat.etat.erreur = resultat.erreur; ecrireEtat(parametresRepo, etat); return resultat; }
  if (r.echec || !succes(r.corps)) {
    etat.etat.recus = { ...etat.etat.recus, statut: 'erreur', message: r.echec ? r.echec.message : `Lecture impossible (${codeReponse(r.corps) || r.statut}).`, luLe: maintenant.toISOString() };
  } else {
    const trouves = parseFind(r.corps);
    const aLire = [];
    for (const e of trouves) {
      if (connus.has(idCourt(e.itemId)) || ctx.ignorees.has(e.deAdresse) || /\[CLAIRE-/i.test(e.objet)) continue;
      const d = dossierDeEmail({ sujet: e.objet, apercu: e.apercu, deAdresse: e.deAdresse }, ctx);
      if (d) aLire.push({ e, d });
    }
    const lot = aLire.slice(0, MAX_LECTURES_TOUR);
    const details = lot.length ? await poster(corpsGetItems(lot.map((x) => x.e.itemId), true)) : null;
    if (details && refus(details)) { agendaWatch.signalerIdentifiantsRefuses(reglages); resultat.erreur = 'Identifiants de messagerie refusés : vérifiez les Réglages.'; ecrireEtat(parametresRepo, etat); return resultat; }
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
      if (corps) aResumer.push({ email, dossierNom: d.nom, corps });
    }
    // Le repère n'avance que jusqu'au dernier email traité (le reste au tour suivant).
    const dernierTraite = lot.length < aLire.length ? lot[lot.length - 1].e.date : (trouves.length ? trouves[trouves.length - 1].date : null);
    etat.etat.recus = { ...etat.etat.recus, statut: 'ok', message: '', luLe: maintenant.toISOString(), lus: (etat.etat.recus.lus || 0) + resultat.recus,
      dernier: dateIso(dernierTraite) || etat.etat.recus.dernier || depuisDefaut, collaborateur: 'Boîte de réception' };
  }

  // 2. Éléments envoyés de chaque boîte.
  for (const b of boitesEnvoyes(reglages, rappels)) {
    const prec = etat.etat.envoyes[b.adresse] || assainirEtatBoite({});
    const f = await poster(corpsFind('sentitems', b.propre ? null : b.adresse, prec.dernier || depuisDefaut, 'item:DateTimeSent'));
    if (refus(f)) { agendaWatch.signalerIdentifiantsRefuses(reglages); resultat.erreur = 'Identifiants de messagerie refusés : vérifiez les Réglages.'; break; }
    const code = f.echec ? '' : codeReponse(f.corps);
    if (f.echec || !succes(f.corps)) {
      const refuse = CODES_ACCES_REFUSE.test(code);
      etat.etat.envoyes[b.adresse] = { ...prec, collaborateur: b.collaborateur, luLe: maintenant.toISOString(),
        statut: refuse ? 'refuse' : 'erreur', message: refuse ? 'Accès aux « Éléments envoyés » non donné au compte relié.' : (f.echec ? f.echec.message : `Lecture impossible (${code || f.statut}).`) };
      continue;
    }
    const trouves = parseFind(f.corps).filter((e) => !connus.has(idCourt(e.itemId)));
    const lot = trouves.slice(0, 50);
    const det = lot.length ? await poster(corpsGetItems(lot.map((e) => e.itemId), false)) : null;
    const parId = det && !det.echec ? parseGetItems(det.corps) : new Map();
    for (const e of lot) {
      const a = (parId.get(e.itemId) || {}).a || [];
      const envoye = { objet: e.objet, a, date: e.date };
      const prepare = etat.prepares.find((p) => correspondAuPrepare(p, envoye));
      const d = prepare ? dossiers.find((x) => x.id === prepare.dossierId) || dossierDeEmailEnvoye(envoye, ctx) : dossierDeEmailEnvoye(envoye, ctx);
      if (!d && !prepare) continue;
      const email = assainirEmail({ id: idCourt(e.itemId), itemId: e.itemId, dossierId: d ? d.id : (prepare && prepare.dossierId) || '', sens: 'envoye',
        date: e.date, de: { nom: b.collaborateur, adresse: b.adresse }, a, objet: e.objet, sujets: sujetsDe(e.objet, ''),
        boite: b.adresse, collaborateur: b.collaborateur, prepareId: prepare ? prepare.id : null });
      etat.emails.push(email);
      connus.add(email.id);
      resultat.envoyes++;
      if (prepare) { prepare.envoyeLe = email.date; prepare.boite = b.adresse; prepare.emailId = email.id; resultat.confirmes++; }
    }
    const dernier = lot.length < trouves.length ? lot[lot.length - 1].date : (trouves.length ? trouves[trouves.length - 1].date : null);
    etat.etat.envoyes[b.adresse] = { collaborateur: b.collaborateur, statut: 'ok', message: '', luLe: maintenant.toISOString(),
      lus: (prec.lus || 0) + lot.length, dernier: dateIso(dernier) || prec.dernier || depuisDefaut };
  }

  // Les boîtes retirées des Réglages ne sont plus listées.
  const actuelles = new Set(boitesEnvoyes(reglages, rappels).map((b) => b.adresse));
  for (const k of Object.keys(etat.etat.envoyes)) if (!actuelles.has(k)) delete etat.etat.envoyes[k];
  etat.etat.dernierTour = maintenant.toISOString();
  etat.etat.erreur = resultat.erreur;
  ecrireEtat(parametresRepo, etat);
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
  const r = await posterEws({ url: reglages.url, email: reglages.email, motDePasse: reglages.motDePasse, body: corpsGetItems([email.itemId], true), delaiMs: 30000 }, injections);
  if (r.echec) return { erreur: r.echec.message, statut: 502 };
  if (r.statut === 401 || r.statut === 403) return { erreur: 'Identifiants de messagerie refusés.', statut: 502 };
  const lu = succes(r.corps) ? parseGetItems(r.corps).get(email.itemId) : null;
  if (!lu) return { erreur: `Email introuvable dans la boîte (${codeReponse(r.corps) || r.statut}) : il a peut-être été déplacé ou supprimé.`, statut: 404 };
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
  corpsFind, corpsGetItems, corpsGetAttachment, parseFind, parseGetItems, parseGetAttachment, promptResumeEmail,
  executerTourEmailsDossiers, lirePieceJointe, lireEmailComplet, demarrerSurveillanceEmailsDossiers
};
