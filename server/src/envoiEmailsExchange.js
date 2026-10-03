'use strict';
// ---- Envoi d'un email depuis CLAIRE (étude, 03/10 : « répondre aux emails directement depuis CLAIRE », « voir
// cette interface pour l'envoi des rappels au lieu de les télécharger » ; choix : envoyé depuis CLAIRE, depuis la
// boîte de chacun, premier jet de réponse par l'IA locale, tous les emails) ----
//
// Rien ne part sans un clic sur « Envoyer » dans la fenêtre d'email du poste. Par EWS, avec le compte relié des
// Réglages (mêmes identifiants, même disjoncteur que l'agenda, un seul essai par appel) :
//   1. un BROUILLON est créé (CreateItem SaveOnly) — email nouveau avec ses pièces jointes, ou réponse à un email
//      reçu (ReplyToItem / ReplyAllToItem : l'email cité reste dessous, la conversation est gardée), dont les
//      pièces jointes sont ajoutées ensuite (CreateAttachment) ;
//   2. il est ENVOYÉ (SendItem), copie dans les « Éléments envoyés » du compte relié.
// Un échec entre les deux laisse l'email dans les Brouillons d'Outlook (rien n'est perdu, rien n'est envoyé deux
// fois). EXPÉDITEUR : la boîte du collaborateur du poste (adresse des Réglages › Collaborateurs) via le droit
// « Envoyer en tant que » donné au compte relié dans Exchange ; tant qu'il n'est pas donné (refus d'Exchange),
// l'email part du compte relié et le refus est retenu 7 jours (pas de nouvel essai à chaque envoi). Le texte de
// l'email n'est jamais journalisé ni gardé par le serveur.

const { noterVerification } = require('./verificationsTerrain');
const { echapperXml, desechapperXml, ENVELOPPE_DEBUT, ENVELOPPE_FIN } = require('./emailsMatin');

const CLE_ENVOI_EMAILS = 'envoi-emails';
const JOURS_REFUS_RETENU = 7;
const MAX_DESTINATAIRES = 20;
const MAX_PIECES = 20;
// 21 Mo de pièces (seuil de l'étude, 03/10) en base64, plus les images de la signature.
const MAX_BASE64_TOTAL = 30 * 1024 * 1024;
const CODES_REFUS_EN_TANT_QUE = /ErrorSendAsDenied|ErrorAccessDenied|ErrorImpersonat|ErrorNotDelegate|ErrorDelegate/;
const RE_ADRESSE = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;

// ---- Pur ----
function adresseValide(a) { return RE_ADRESSE.test(String(a || '').trim()); }

// « a@x.fr; b@y.fr, Nom <c@z.fr> » → adresses distinctes, en minuscules.
function adressesDepuisTexte(valeur) {
  const brut = Array.isArray(valeur) ? valeur.join(',') : String(valeur || '');
  const vues = new Set();
  for (const m of brut.matchAll(/[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+/g)) {
    const a = m[0].toLowerCase();
    if (adresseValide(a)) vues.add(a);
  }
  return [...vues].slice(0, MAX_DESTINATAIRES);
}

const destinatairesXml = (balise, adresses) => (adresses.length
  ? `<t:${balise}>${adresses.map((a) => `<t:Mailbox><t:EmailAddress>${echapperXml(a)}</t:EmailAddress></t:Mailbox>`).join('')}</t:${balise}>`
  : '');
const deXml = (de) => (de ? `<t:From><t:Mailbox><t:EmailAddress>${echapperXml(de)}</t:EmailAddress></t:Mailbox></t:From>` : '');

function pieceXml(p) {
  return '<t:FileAttachment>'
    + `<t:Name>${echapperXml(p.nom || 'piece-jointe')}</t:Name>`
    + (p.type ? `<t:ContentType>${echapperXml(p.type)}</t:ContentType>` : '')
    + (p.contentId ? `<t:ContentId>${echapperXml(p.contentId)}</t:ContentId>` : '')
    + `<t:IsInline>${p.contentId ? 'true' : 'false'}</t:IsInline>`
    + `<t:Content>${String(p.contenuBase64 || '')}</t:Content>`
    + '</t:FileAttachment>';
}

// Brouillon d'un email NOUVEAU (ordre du schéma : Subject, Body, Attachments de ItemType, puis ToRecipients,
// CcRecipients, From de MessageType).
function corpsBrouillonNouveau({ a, cc, sujet, html, pieces, de }) {
  const jointes = (pieces || []).map(pieceXml).join('');
  return ENVELOPPE_DEBUT
    + '<m:CreateItem MessageDisposition="SaveOnly"><m:SavedItemFolderId><t:DistinguishedFolderId Id="drafts"/></m:SavedItemFolderId>'
    + '<m:Items><t:Message>'
    + `<t:Subject>${echapperXml(sujet || '')}</t:Subject>`
    + `<t:Body BodyType="HTML">${echapperXml(html || '')}</t:Body>`
    + (jointes ? `<t:Attachments>${jointes}</t:Attachments>` : '')
    + destinatairesXml('ToRecipients', a || []) + destinatairesXml('CcRecipients', cc || []) + deXml(de)
    + '</t:Message></m:Items></m:CreateItem>' + ENVELOPPE_FIN;
}

// Brouillon d'une RÉPONSE à un email reçu : le texte écrit va dans NewBodyContent, Exchange ajoute l'email cité
// dessous et garde le fil. Ordre du schéma de ReplyToItem : Subject, ToRecipients, CcRecipients, From,
// ReferenceItemId, NewBodyContent.
function corpsBrouillonReponse({ itemId, a, cc, sujet, html, de, tous }) {
  const balise = tous ? 'ReplyAllToItem' : 'ReplyToItem';
  return ENVELOPPE_DEBUT
    + '<m:CreateItem MessageDisposition="SaveOnly"><m:SavedItemFolderId><t:DistinguishedFolderId Id="drafts"/></m:SavedItemFolderId>'
    + `<m:Items><t:${balise}>`
    + (sujet ? `<t:Subject>${echapperXml(sujet)}</t:Subject>` : '')
    + destinatairesXml('ToRecipients', a || []) + destinatairesXml('CcRecipients', cc || []) + deXml(de)
    + `<t:ReferenceItemId Id="${echapperXml(itemId)}"/>`
    + `<t:NewBodyContent BodyType="HTML">${echapperXml(html || '')}</t:NewBodyContent>`
    + `</t:${balise}></m:Items></m:CreateItem>` + ENVELOPPE_FIN;
}

function corpsAjoutPieces({ itemId, changeKey, pieces }) {
  return ENVELOPPE_DEBUT
    + `<m:CreateAttachment><m:ParentItemId Id="${echapperXml(itemId)}"${changeKey ? ` ChangeKey="${echapperXml(changeKey)}"` : ''}/>`
    + `<m:Attachments>${(pieces || []).map(pieceXml).join('')}</m:Attachments></m:CreateAttachment>` + ENVELOPPE_FIN;
}

function corpsEnvoiBrouillon({ itemId, changeKey }) {
  return ENVELOPPE_DEBUT
    + '<m:SendItem SaveItemToFolder="true"><m:ItemIds>'
    + `<t:ItemId Id="${echapperXml(itemId)}"${changeKey ? ` ChangeKey="${echapperXml(changeKey)}"` : ''}/>`
    + '</m:ItemIds><m:SavedItemFolderId><t:DistinguishedFolderId Id="sentitems"/></m:SavedItemFolderId></m:SendItem>' + ENVELOPPE_FIN;
}

// Brouillon abandonné après un refus « Envoyer en tant que » (jamais un email reçu ou envoyé : seulement le
// brouillon que CLAIRE vient de créer), mis dans les éléments supprimés.
function corpsRetraitBrouillon({ itemId }) {
  return ENVELOPPE_DEBUT
    + `<m:DeleteItem DeleteType="MoveToDeletedItems"><m:ItemIds><t:ItemId Id="${echapperXml(itemId)}"/></m:ItemIds></m:DeleteItem>`
    + ENVELOPPE_FIN;
}

const codeReponse = (corps) => (String(corps || '').match(/<m:ResponseCode>([^<]+)<\/m:ResponseCode>/) || [])[1] || '';
const succes = (corps) => /ResponseClass="Success"/.test(String(corps || '')) && !/ResponseClass="Error"/.test(String(corps || ''));

function idBrouillon(corps) {
  const m = String(corps || '').match(/<t:ItemId\b[^>]*\bId="([^"]+)"(?:[^>]*\bChangeKey="([^"]+)")?/);
  return m ? { itemId: desechapperXml(m[1]), changeKey: m[2] ? desechapperXml(m[2]) : '' } : null;
}

// Nouvelle clé de modification de l'email après l'ajout des pièces jointes (la dernière rendue).
function changeKeyApresPieces(corps) {
  const toutes = [...String(corps || '').matchAll(/\bRootItemChangeKey="([^"]+)"/g)];
  return toutes.length ? desechapperXml(toutes[toutes.length - 1][1]) : '';
}

// Pièces reçues du poste : base64 nettoyé, nom et type bornés ; rend { pieces } ou { erreur }.
function piecesValides(brutes, { inline = false } = {}) {
  const liste = Array.isArray(brutes) ? brutes : [];
  if (liste.length > MAX_PIECES) return { erreur: 'Trop de pièces jointes.' };
  const pieces = [];
  let total = 0;
  for (const p of liste) {
    const contenuBase64 = p && typeof p.contenuBase64 === 'string' ? p.contenuBase64.replace(/\s/g, '') : '';
    if (!contenuBase64 || !/^[A-Za-z0-9+/=]+$/.test(contenuBase64)) continue;
    total += contenuBase64.length;
    pieces.push({
      nom: String(p.nom || 'piece-jointe').replace(/[\r\n]/g, ' ').slice(0, 200),
      type: p.type ? String(p.type).slice(0, 100) : '',
      contentId: inline && p.contentId ? String(p.contentId).replace(/[^A-Za-z0-9._@-]/g, '').slice(0, 120) : '',
      contenuBase64
    });
  }
  return { pieces, total };
}

// L'adresse d'expédition du collaborateur (Réglages › Collaborateurs), jamais une adresse venue du poste.
function adresseCollaborateur(reglagesRappels, collaborateur) {
  const emails = (reglagesRappels && reglagesRappels.emailsResponsables) || {};
  const a = String(emails[String(collaborateur || '')] || '').trim().toLowerCase();
  return adresseValide(a) ? a : '';
}

function lireEtatEnvoi(parametresRepo) {
  const brut = parametresRepo.lireJsonBrut ? parametresRepo.lireJsonBrut(CLE_ENVOI_EMAILS, {}) : {};
  const refus = {};
  for (const [k, v] of Object.entries(brut && brut.refusEnTantQue && typeof brut.refusEnTantQue === 'object' ? brut.refusEnTantQue : {})) {
    if (adresseValide(k) && !Number.isNaN(Date.parse(v))) refus[k.toLowerCase()] = new Date(v).toISOString();
  }
  const reussis = {};
  for (const [k, v] of Object.entries(brut && brut.enTantQueReussi && typeof brut.enTantQueReussi === 'object' ? brut.enTantQueReussi : {})) {
    if (adresseValide(k) && !Number.isNaN(Date.parse(v))) reussis[k.toLowerCase()] = new Date(v).toISOString();
  }
  return { refusEnTantQue: refus, enTantQueReussi: reussis };
}
function ecrireEtatEnvoi(parametresRepo, etat) {
  if (parametresRepo.ecrireJsonBrut) parametresRepo.ecrireJsonBrut(CLE_ENVOI_EMAILS, etat);
}

// Pure : l'adresse d'expédition demandée est-elle à essayer, ou un refus récent la fait-il passer par le compte relié ?
function refusRecent(etat, adresse, maintenant) {
  const le = etat && etat.refusEnTantQue ? etat.refusEnTantQue[adresse] : null;
  return Boolean(le && (maintenant - Date.parse(le)) < JOURS_REFUS_RETENU * 86400000);
}

function connexionPrete(r) { return Boolean(r && r.actif && r.url && r.email && r.motDePasse); }

// ---- Envoi ----
// `demande` : { collaborateur, a, cc, sujet, html, pieces, images, reponseA: { itemId, tous } }.
// Rend { ok, envoyeLe, de, repli, brouillonLaisse, message, code }.
async function envoyerEmailExchange(parametresRepo, demande, injections = {}) {
  const { posterEws } = require('./exchange/ews');
  const agendaWatch = require('./agendaWatch');
  const reglages = parametresRepo.lireReglagesExchange ? parametresRepo.lireReglagesExchange() : {};
  if (!connexionPrete(reglages)) return { ok: false, statut: 503, message: 'La connexion Exchange n’est pas configurée (Réglages › Agenda et Outlook).' };
  if (agendaWatch.lectureAgendaSuspendue(reglages)) return { ok: false, statut: 503, message: 'Identifiants de messagerie refusés : corrigez-les dans Réglages › Agenda et Outlook.' };
  const d = demande || {};
  const a = adressesDepuisTexte(d.a);
  const cc = adressesDepuisTexte(d.cc).filter((x) => !a.includes(x));
  const reponse = d.reponseA && d.reponseA.itemId ? { itemId: String(d.reponseA.itemId), tous: d.reponseA.tous === true } : null;
  if (!a.length && !reponse) return { ok: false, statut: 400, message: 'Aucun destinataire valide.' };
  const sujet = String(d.sujet || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 300);
  if (!sujet && !reponse) return { ok: false, statut: 400, message: 'Objet de l’email manquant.' };
  const pj = piecesValides(d.pieces);
  if (pj.erreur) return { ok: false, statut: 400, message: pj.erreur };
  const img = piecesValides(d.images, { inline: true });
  if (img.erreur) return { ok: false, statut: 400, message: img.erreur };
  if (pj.total + img.total > MAX_BASE64_TOTAL) return { ok: false, statut: 413, message: 'Pièces jointes trop lourdes pour la messagerie (21 Mo au plus).' };
  const pieces = img.pieces.concat(pj.pieces);
  const html = String(d.html || '');

  const maintenant = injections.maintenant ? Date.parse(injections.maintenant) : Date.now();
  const compte = String(reglages.email || '').trim().toLowerCase();
  const rappels = parametresRepo.lireReglages ? parametresRepo.lireReglages() : {};
  const souhaitee = adresseCollaborateur(rappels, d.collaborateur);
  const etatEnvoi = lireEtatEnvoi(parametresRepo);
  const enTantQue = souhaitee && souhaitee !== compte && !refusRecent(etatEnvoi, souhaitee, maintenant) ? souhaitee : '';
  const poster = (body, delaiMs = 60000) => posterEws({ url: reglages.url, email: reglages.email, motDePasse: reglages.motDePasse, body, delaiMs }, injections);
  const refusIdentifiants = (r) => r.statut === 401 || r.statut === 403;

  const essayer = async (de) => {
    // 1. Brouillon.
    const r1 = await poster(reponse
      ? corpsBrouillonReponse({ itemId: reponse.itemId, tous: reponse.tous, a, cc, sujet, html, de })
      : corpsBrouillonNouveau({ a, cc, sujet, html, pieces, de }));
    if (r1.echec) return { ok: false, message: r1.echec.message };
    if (refusIdentifiants(r1)) { agendaWatch.signalerIdentifiantsRefuses(reglages); return { ok: false, message: 'Identifiants de messagerie refusés.' }; }
    const code1 = codeReponse(r1.corps);
    if (!succes(r1.corps)) return { ok: false, code: code1, refusEnTantQue: Boolean(de && CODES_REFUS_EN_TANT_QUE.test(code1)), message: messageEchec(code1, r1.statut) };
    const brouillon = idBrouillon(r1.corps);
    if (!brouillon) return { ok: false, message: 'Exchange n’a pas rendu le brouillon créé.' };
    // 1 bis. Pièces jointes d'une réponse.
    if (reponse && pieces.length) {
      const r2 = await poster(corpsAjoutPieces({ itemId: brouillon.itemId, changeKey: brouillon.changeKey, pieces }), 120000);
      if (r2.echec || !succes(r2.corps)) {
        return { ok: false, brouillonLaisse: true, message: 'Pièces jointes refusées par Exchange' + (r2.echec ? '' : ` (${codeReponse(r2.corps) || r2.statut})`) + ' : la réponse est restée dans les Brouillons d’Outlook.' };
      }
      brouillon.changeKey = changeKeyApresPieces(r2.corps) || brouillon.changeKey;
    }
    // 2. Envoi.
    const r3 = await poster(corpsEnvoiBrouillon(brouillon), 120000);
    if (r3.echec) return { ok: false, brouillonLaisse: true, message: r3.echec.message + ' L’email est resté dans les Brouillons d’Outlook.' };
    const code3 = codeReponse(r3.corps);
    if (!succes(r3.corps)) {
      if (de && CODES_REFUS_EN_TANT_QUE.test(code3)) {
        await poster(corpsRetraitBrouillon(brouillon), 30000);
        return { ok: false, code: code3, refusEnTantQue: true, message: messageEchec(code3, r3.statut) };
      }
      return { ok: false, code: code3, brouillonLaisse: true, message: messageEchec(code3, r3.statut) + ' L’email est resté dans les Brouillons d’Outlook.' };
    }
    return { ok: true };
  };

  let resultat = await essayer(enTantQue);
  let repli = Boolean(souhaitee && souhaitee !== compte && !enTantQue);
  if (!resultat.ok && resultat.refusEnTantQue && enTantQue) {
    // « Envoyer en tant que » pas encore donné dans Exchange : refus retenu, l'email part du compte relié.
    etatEnvoi.refusEnTantQue[enTantQue] = new Date(maintenant).toISOString();
    ecrireEtatEnvoi(parametresRepo, etatEnvoi);
    noterVerification(parametresRepo, 'email-envoye-en-tant-que', { ok: false, message: 'droit « Envoyer en tant que » refusé par Exchange' });
    resultat = await essayer('');
    repli = true;
  } else if (resultat.ok && enTantQue) {
    delete etatEnvoi.refusEnTantQue[enTantQue];
    etatEnvoi.enTantQueReussi[enTantQue] = new Date(maintenant).toISOString();
    ecrireEtatEnvoi(parametresRepo, etatEnvoi);
    noterVerification(parametresRepo, 'email-envoye-en-tant-que', {});
  }
  if (!resultat.ok) {
    noterVerification(parametresRepo, reponse ? 'email-reponse-exchange' : 'email-envoye-exchange', { ok: false, message: resultat.code || 'échec de l’envoi' });
    return { ok: false, statut: 502, message: resultat.message, brouillonLaisse: !!resultat.brouillonLaisse };
  }
  noterVerification(parametresRepo, reponse ? 'email-reponse-exchange' : 'email-envoye-exchange', {});
  return { ok: true, envoyeLe: new Date(maintenant).toISOString(), de: repli || !enTantQue ? compte : enTantQue, repli, destinataires: a.concat(cc) };
}

function messageEchec(code, statut) {
  if (/ErrorMessageSizeExceeded|ErrorExceededMessageLimit|ErrorAttachmentSizeLimitExceeded/.test(code)) return 'Email trop lourd pour la messagerie : retirez une pièce jointe ou passez par WeTransfer.';
  if (/ErrorItemNotFound|ErrorInvalidIdMalformed/.test(code)) return 'L’email auquel vous répondez n’est plus dans la boîte (déplacé ou supprimé).';
  if (/ErrorInvalidRecipients|ErrorInvalidSmtpAddress/.test(code)) return 'Adresse de destinataire refusée par Exchange.';
  if (CODES_REFUS_EN_TANT_QUE.test(code)) return 'Exchange refuse d’envoyer depuis cette boîte.';
  return 'Exchange a refusé l’envoi' + (code || statut ? ` (${code || statut})` : '') + '.';
}

// ---- Proposition de réponse par l'IA locale ----
// Premier jet seulement : jamais envoyé seul, jamais gardé. Le texte de l'email reçu est relu dans Exchange
// (lireEmailComplet) et jeté après la proposition.
function promptPropositionReponse({ objet, deNom, texte, dossier, confrere, pj }) {
  return [
    'Tu rédiges, pour une étude notariale française (Maître Sophie GOSSART, Blois), un PREMIER JET de réponse à l’email ci-dessous.',
    `Dossier : ${dossier || '(non précisé)'} | De : ${deNom || '?'} | Objet : ${objet || '(sans objet)'}${pj && pj.length ? ' | Pièces jointes reçues : ' + pj.join(', ') : ''}`,
    'Email reçu :', String(texte || '').slice(0, 4000), '',
    'Consignes :',
    confrere
      ? '- C’est un confrère notaire : commence par « Mon Cher Maître, » et termine par « Dans l’attente et vous en remerciant par avance, » puis « Votre bien dévoué. ».'
      : '- C’est un client : commence par « Madame, Monsieur, » (ou « Madame, » / « Monsieur, » si l’email le permet sans doute) et termine par « Bien cordialement, ».',
    '- 2 à 5 phrases, ton professionnel et courtois, en français.',
    '- Si des documents sont joints, accuse-en réception en les nommant simplement.',
    '- N’invente aucune date, aucun montant, aucun délai, aucune pièce, aucun engagement : écris « [à compléter] » là où une information manque.',
    '- Ne donne aucun avis juridique et ne promets rien au nom du notaire.',
    '- Pas de signature (elle est ajoutée ensuite), pas d’objet.',
    'Réponds avec un objet JSON exactement de cette forme : {"reponse": "…"}'
  ].join('\n');
}

const validerProposition = (o) => (o && typeof o.reponse === 'string' && o.reponse.trim() ? null : 'le champ "reponse" (texte) est obligatoire');

module.exports = {
  CLE_ENVOI_EMAILS, JOURS_REFUS_RETENU, MAX_BASE64_TOTAL,
  adresseValide, adressesDepuisTexte, corpsBrouillonNouveau, corpsBrouillonReponse, corpsAjoutPieces, corpsEnvoiBrouillon,
  corpsRetraitBrouillon, idBrouillon, changeKeyApresPieces, piecesValides, adresseCollaborateur, refusRecent, lireEtatEnvoi,
  envoyerEmailExchange, messageEchec, promptPropositionReponse, validerProposition
};
