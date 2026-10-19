// @ts-check
'use strict';
// ---- Rangement d'emails dans un dossier Outlook (étude, 19/10 : « il faudrait placer dans Traiter à distance : les e-mails
// du SPF avec l'objet "Facture Dossier FIDJI", les emails de quarantaine@notaires.fr ») ----
//
// Toutes les 5 minutes, par EWS (mêmes identifiants et même disjoncteur que l'agenda, un seul essai par appel) : les
// derniers emails de la BOÎTE DE RÉCEPTION du compte relié (objet et expéditeur seulement — jamais le texte), REÇUS DEPUIS LA MISE EN
// PLACE seulement (étude 19/10 : « que ma boîte et que les prochains » — repère `depuis`, posé au premier tour et à chaque remise en
// marche ; les emails déjà là ne bougent pas) ; ceux qu'une
// règle désigne sont DÉPLACÉS (MoveItem, jamais supprimés) dans le dossier « Traiter à distance » de la même boîte.
// Le dossier est retrouvé par son nom (accents et casse ignorés) ; absent ou en double → rien n'est déplacé, l'état le dit
// dans Réglages › Agenda et Outlook. Un déplacement refusé n'est pas retenté avant 6 h. Les règles sont écrites ici, à la
// demande de l'étude : une nouvelle règle = une entrée de REGLES_RANGEMENT_OUTLOOK + son test.

const { noterVerification } = require('./verificationsTerrain');
const { lireXml, tous, premier, texteDe, attribut, identifiantElement, analyseEws } = require('./exchange/xml');

const CLE_RANGEMENT_OUTLOOK = 'rangement-outlook';
const NOM_DOSSIER_OUTLOOK = 'Traiter à distance';
const INTERVALLE_RANGEMENT_MS = 5 * 60 * 1000;
const MAX_EMAILS_LUS = 300;
const MAX_DEPLACES_TOUR = 50;
const DELAI_REESSAI_MS = 6 * 3600 * 1000;
const MAX_ECHECS_GARDES = 200;

/** @typedef {{ id: string, libelle: string, objet?: string, expediteur?: string }} RegleRangement */
/** @type {RegleRangement[]} */
const REGLES_RANGEMENT_OUTLOOK = [
  { id: 'spf-facture-fidji', libelle: 'Objet « Facture Dossier FIDJI » (SPF)', objet: 'facture dossier fidji' },
  { id: 'quarantaine-notaires', libelle: 'Expéditeur quarantaine@notaires.fr', expediteur: 'quarantaine@notaires.fr' }
];

const ENVELOPPE_DEBUT = '<?xml version="1.0" encoding="utf-8"?>'
  + '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"'
  + ' xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"'
  + ' xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages">'
  + '<soap:Header><t:RequestServerVersion Version="Exchange2013"/></soap:Header><soap:Body>';
const ENVELOPPE_FIN = '</soap:Body></soap:Envelope>';

/** @param {any} v */
function echapperXml(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Pure : texte comparable — sans accents, minuscules, espaces réduits. @param {any} t */
function normaliserTexte(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Pure : la règle qui désigne cet email, null sinon. @param {{ objet?: string, de?: string }} e */
function regleRangementPourEmail(e) {
  const objet = normaliserTexte(e && e.objet);
  const de = normaliserTexte(e && e.de);
  for (const r of REGLES_RANGEMENT_OUTLOOK) {
    if (r.objet && objet.includes(normaliserTexte(r.objet))) return r;
    if (r.expediteur && de === normaliserTexte(r.expediteur)) return r;
  }
  return null;
}

/** Pure : l'identifiant du dossier « Traiter à distance » parmi les dossiers de la boîte ; '' si absent, 'double' si plusieurs. @param {{ id: string, nom: string }[]} dossiers */
function dossierRangementParmi(dossiers) {
  const cible = normaliserTexte(NOM_DOSSIER_OUTLOOK);
  const trouves = (dossiers || []).filter((d) => d && d.id && normaliserTexte(d.nom) === cible);
  if (trouves.length > 1) return 'double';
  return trouves.length ? trouves[0].id : '';
}

function corpsFindFolders() {
  return ENVELOPPE_DEBUT
    + '<m:FindFolder Traversal="Deep"><m:FolderShape><t:BaseShape>IdOnly</t:BaseShape><t:AdditionalProperties>'
    + '<t:FieldURI FieldURI="folder:DisplayName"/></t:AdditionalProperties></m:FolderShape>'
    + '<m:IndexedPageFolderView MaxEntriesReturned="1000" Offset="0" BasePoint="Beginning"/>'
    + '<m:ParentFolderIds><t:DistinguishedFolderId Id="msgfolderroot"/></m:ParentFolderIds></m:FindFolder>' + ENVELOPPE_FIN;
}

/** Pure : les dossiers d'une réponse FindFolder. @param {string} corps */
function parseFindFolders(corps) {
  return tous(lireXml(corps), 'Folder').map((f) => ({ id: attribut(premier(f, 'FolderId'), 'Id'), nom: texteDe(f, 'DisplayName').trim() }));
}

/** @param {string} depuisUtc @param {number} [max] */
function corpsFindRecents(depuisUtc, max = MAX_EMAILS_LUS) {
  return ENVELOPPE_DEBUT
    + '<m:FindItem Traversal="Shallow"><m:ItemShape><t:BaseShape>IdOnly</t:BaseShape><t:AdditionalProperties>'
    + '<t:FieldURI FieldURI="item:Subject"/><t:FieldURI FieldURI="message:From"/>'
    + '</t:AdditionalProperties></m:ItemShape>'
    + `<m:IndexedPageItemView MaxEntriesReturned="${Number(max) || MAX_EMAILS_LUS}" Offset="0" BasePoint="Beginning"/>`
    + '<m:Restriction><t:IsGreaterThanOrEqualTo><t:FieldURI FieldURI="item:DateTimeReceived"/>'
    + `<t:FieldURIOrConstant><t:Constant Value="${echapperXml(depuisUtc)}"/></t:FieldURIOrConstant>`
    + '</t:IsGreaterThanOrEqualTo></m:Restriction>'
    + '<m:SortOrder><t:FieldOrder Order="Descending"><t:FieldURI FieldURI="item:DateTimeReceived"/></t:FieldOrder></m:SortOrder>'
    + '<m:ParentFolderIds><t:DistinguishedFolderId Id="inbox"/></m:ParentFolderIds></m:FindItem>' + ENVELOPPE_FIN;
}

/** Pure : identifiant, objet et expéditeur des emails d'une réponse FindItem. @param {string} corps */
function parseRecents(corps) {
  return tous(lireXml(corps), 'Message').map((m) => ({
    itemId: identifiantElement(m).itemId,
    objet: texteDe(m, 'Subject').trim(),
    de: texteDe(premier(m, 'From'), 'EmailAddress').trim().toLowerCase()
  })).filter((m) => m.itemId);
}

/** @param {string[]} itemIds @param {string} dossierId */
function corpsMoveItems(itemIds, dossierId) {
  return ENVELOPPE_DEBUT
    + `<m:MoveItem><m:ToFolderId><t:FolderId Id="${echapperXml(dossierId)}"/></m:ToFolderId><m:ItemIds>`
    + itemIds.map((id) => `<t:ItemId Id="${echapperXml(id)}"/>`).join('')
    + '</m:ItemIds></m:MoveItem>' + ENVELOPPE_FIN;
}

/** Pure : succès de chaque déplacement, dans l'ordre des emails envoyés. @param {string} corps */
function parseMoveItems(corps) {
  return tous(lireXml(corps), 'MoveItemResponseMessage').map((r) => attribut(r, 'ResponseClass') === 'Success');
}

/** Pure : l'état gardé (clé `rangement-outlook`), assaini. @param {any} brut */
function assainirRangementOutlook(brut) {
  const b = brut && typeof brut === 'object' ? brut : {};
  const date = (/** @type {any} */ v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);
  /** @type {Record<string, number>} */
  const ranges = {};
  for (const r of REGLES_RANGEMENT_OUTLOOK) {
    const n = b.ranges && b.ranges[r.id];
    ranges[r.id] = Number.isInteger(n) && n > 0 ? n : 0;
  }
  /** @type {Record<string, string>} */
  const echecs = {};
  const entrees = Object.entries(b.echecs && typeof b.echecs === 'object' ? b.echecs : {})
    .map(([id, le]) => [String(id).slice(0, 400), date(le)]).filter(([id, le]) => id && le)
    .sort((x, y) => String(y[1]).localeCompare(String(x[1]))).slice(0, MAX_ECHECS_GARDES);
  for (const [id, le] of entrees) echecs[String(id)] = String(le);
  return {
    actif: b.actif !== false,
    statut: ['ok', 'erreur', 'introuvable', 'jamais'].includes(b.statut) ? b.statut : 'jamais',
    message: String(b.message || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, 200),
    dernierTour: date(b.dernierTour),
    dernierRangement: date(b.dernierRangement),
    depuis: date(b.depuis),
    ranges,
    echecs
  };
}

/** @param {any} parametresRepo */
function lireEtatRangement(parametresRepo) { return assainirRangementOutlook(parametresRepo.lireJsonBrut(CLE_RANGEMENT_OUTLOOK, {})); }
/** @param {any} parametresRepo @param {any} e */
function ecrireEtatRangement(parametresRepo, e) { return parametresRepo.ecrireJsonBrut(CLE_RANGEMENT_OUTLOOK, assainirRangementOutlook(e)); }

/** @param {any} r */
function connexionPrete(r) { return Boolean(r && r.actif && r.url && r.email && r.motDePasse); }

/** @type {Promise<any>|null} */
let tourCourant = null;
// Identifiant du dossier Outlook, retrouvé une fois par démarrage (relu si un déplacement échoue en entier).
let dossierConnu = '';

/** Un seul tour à la fois (relève et « Ranger maintenant » partagent le même). @param {any} parametresRepo @param {any} [injections] @param {boolean} [manuel] */
function executerTourRangement(parametresRepo, injections = {}, manuel = false) {
  if (tourCourant) return tourCourant;
  tourCourant = tourRangement(parametresRepo, injections, manuel).finally(() => { tourCourant = null; });
  return tourCourant;
}

/** @param {any} parametresRepo @param {any} injections @param {boolean} manuel */
async function tourRangement(parametresRepo, injections, manuel) {
  const agendaWatch = require('./agendaWatch');
  const { posterEws } = require('./exchange/ews');
  const reglages = parametresRepo.lireReglagesExchange ? parametresRepo.lireReglagesExchange() : {};
  const etat = lireEtatRangement(parametresRepo);
  const resultat = { ok: false, ranges: 0, erreur: /** @type {string|null} */ (null) };
  if (!etat.actif) { resultat.erreur = 'Rangement dans Outlook désactivé.'; return resultat; }
  if (!connexionPrete(reglages)) { resultat.erreur = 'La connexion Exchange n’est pas configurée (Réglages › Agenda et Outlook).'; return resultat; }
  if (!manuel && agendaWatch.lectureAgendaSuspendue(reglages)) { resultat.erreur = 'Lecture suspendue : identifiants de messagerie refusés.'; return resultat; }
  const poster = (/** @type {string} */ body) => posterEws({ url: reglages.url, email: reglages.email, motDePasse: reglages.motDePasse, body }, injections);
  const maintenant = injections.maintenant ? new Date(injections.maintenant) : new Date();
  const refus = (/** @type {any} */ r) => !r.echec && (r.statut === 401 || r.statut === 403);
  const finir = (/** @type {string} */ statut, /** @type {string} */ message) => {
    etat.statut = statut; etat.message = message; etat.dernierTour = maintenant.toISOString();
    ecrireEtatRangement(parametresRepo, etat);
    if (message) resultat.erreur = message;
    return resultat;
  };
  const erreurDe = (/** @type {any} */ r) => (r.echec ? r.echec.message : `Réponse d’Exchange inattendue (${analyseEws(r.corps).code || r.statut}).`);

  // Premier tour : seuls les emails reçus à partir de maintenant seront rangés (étude 19/10).
  if (!etat.depuis) { etat.depuis = maintenant.toISOString(); ecrireEtatRangement(parametresRepo, etat); }

  if (!dossierConnu) {
    const f = await poster(corpsFindFolders());
    if (refus(f)) { agendaWatch.signalerIdentifiantsRefuses(reglages); return finir('erreur', 'Identifiants de messagerie refusés : vérifiez les Réglages.'); }
    if (f.echec || !analyseEws(f.corps).ok) return finir('erreur', erreurDe(f));
    const id = dossierRangementParmi(parseFindFolders(f.corps));
    if (id === 'double') return finir('introuvable', `Plusieurs dossiers « ${NOM_DOSSIER_OUTLOOK} » dans la boîte : rien n’est déplacé.`);
    if (!id) return finir('introuvable', `Dossier « ${NOM_DOSSIER_OUTLOOK} » introuvable dans la boîte du compte relié : rien n’est déplacé.`);
    dossierConnu = id;
  }

  const r = await poster(corpsFindRecents(etat.depuis || maintenant.toISOString()));
  if (refus(r)) { agendaWatch.signalerIdentifiantsRefuses(reglages); return finir('erreur', 'Identifiants de messagerie refusés : vérifiez les Réglages.'); }
  if (r.echec || !analyseEws(r.corps).ok) return finir('erreur', erreurDe(r));
  const limite = maintenant.getTime() - DELAI_REESSAI_MS;
  const aRanger = parseRecents(r.corps)
    .map((m) => ({ ...m, regle: regleRangementPourEmail(m) }))
    .filter((m) => m.regle && !(etat.echecs[m.itemId] && Date.parse(etat.echecs[m.itemId]) > limite))
    .slice(0, MAX_DEPLACES_TOUR);
  if (aRanger.length) {
    const d = await poster(corpsMoveItems(aRanger.map((m) => m.itemId), dossierConnu));
    if (refus(d)) { agendaWatch.signalerIdentifiantsRefuses(reglages); return finir('erreur', 'Identifiants de messagerie refusés : vérifiez les Réglages.'); }
    const succes = d.echec ? [] : parseMoveItems(d.corps);
    aRanger.forEach((m, i) => {
      if (succes[i]) { etat.ranges[m.regle.id] = (etat.ranges[m.regle.id] || 0) + 1; resultat.ranges += 1; delete etat.echecs[m.itemId]; }
      else etat.echecs[m.itemId] = maintenant.toISOString();
    });
    // Rien n'a pu être déplacé : le dossier a peut-être été renommé ou recréé — il est recherché au tour suivant.
    if (!resultat.ranges) dossierConnu = '';
    if (resultat.ranges) etat.dernierRangement = maintenant.toISOString();
    noterVerification(parametresRepo, 'rangement-outlook', resultat.ranges
      ? { detail: `${resultat.ranges} email(s) déplacé(s)` }
      : { ok: false, message: d.echec ? d.echec.message : `déplacement refusé (${analyseEws(d.corps).code || d.statut})` });
    if (!resultat.ranges) return finir('erreur', d.echec ? d.echec.message : `Déplacement refusé par Exchange (${analyseEws(d.corps).code || d.statut}).`);
  }
  resultat.ok = true;
  return finir('ok', '');
}

/** @param {any} parametresRepo @param {any} [config] */
function demarrerRangementOutlook(parametresRepo, config) {
  let enCours = false;
  const tour = async () => {
    if (enCours) return;
    enCours = true;
    try {
      const r = await executerTourRangement(parametresRepo, { config });
      if (r.erreur && !/n’est pas configurée|suspendue|désactivé/.test(r.erreur)) console.warn('[CLAIRE] Rangement dans Outlook :', r.erreur);
    } catch (e) {
      console.warn('[CLAIRE] Rangement dans Outlook interrompu :', e && e.message);
    } finally { enCours = false; }
  };
  setTimeout(tour, 45 * 1000);
  return setInterval(tour, INTERVALLE_RANGEMENT_MS);
}

/** Tests seulement. */
function oublierDossierRangement() { dossierConnu = ''; }

module.exports = {
  CLE_RANGEMENT_OUTLOOK, NOM_DOSSIER_OUTLOOK, REGLES_RANGEMENT_OUTLOOK, normaliserTexte, regleRangementPourEmail, dossierRangementParmi,
  corpsFindFolders, parseFindFolders, corpsFindRecents, parseRecents, corpsMoveItems, parseMoveItems, assainirRangementOutlook,
  lireEtatRangement, ecrireEtatRangement, executerTourRangement, demarrerRangementOutlook, oublierDossierRangement
};
