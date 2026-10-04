// @ts-check
'use strict';

// Lecture des réponses EWS par un vrai lecteur XML (fast-xml-parser), à la place des expressions régulières
// écrites à la main jusqu'au 04/10 (étude : « s'appuyer sur des solutions open source déjà éprouvées »).
// Les requêtes, elles, restent construites en texte avec echapperXml : seule la LECTURE change.
//
// Préfixes de noms retirés (t:, m:, s:… → « CalendarItem », « ResponseCode »), attributs gardés sous « @_Nom »,
// valeurs laissées en texte (jamais converties en nombre ou booléen : « 0012 », « true » restent des chaînes),
// entités décodées (&amp;, &#xD;…). Une réponse illisible (page HTML d'erreur, corps vide) rend null.

const { XMLParser } = require('fast-xml-parser');

const lecteur = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  processEntities: true,
  htmlEntities: true
});

function lireXml(texte) {
  const t = String(texte == null ? '' : texte);
  if (!t.trim().startsWith('<')) return null;
  try {
    const r = lecteur.parse(t);
    return r && typeof r === 'object' ? r : null;
  } catch (e) {
    return null;
  }
}

// Tous les éléments `nom` sous `noeud`, à toute profondeur, dans l'ordre du document (un élément trouvé n'est pas
// fouillé plus loin : un <CalendarItem> dans un <CalendarItem> n'existe pas en EWS).
function tous(noeud, nom) {
  const res = [];
  const visiter = (n) => {
    if (Array.isArray(n)) { n.forEach(visiter); return; }
    if (!n || typeof n !== 'object') return;
    for (const [cle, val] of Object.entries(n)) {
      if (cle.startsWith('@_') || cle === '#text') continue;
      if (cle === nom) (Array.isArray(val) ? val : [val]).forEach((v) => res.push(v));
      else visiter(val);
    }
  };
  visiter(noeud);
  return res;
}

function premier(noeud, nom) {
  return tous(noeud, nom)[0];
}

// Texte d'un élément : chaîne, « #text » d'un élément à attributs, '' sinon.
function texte(noeud) {
  if (noeud == null) return '';
  if (typeof noeud === 'string') return noeud;
  if (typeof noeud === 'number' || typeof noeud === 'boolean') return String(noeud);
  if (typeof noeud === 'object' && !Array.isArray(noeud) && noeud['#text'] != null) return String(noeud['#text']);
  return '';
}

function texteDe(noeud, nom) {
  return texte(premier(noeud, nom));
}

function attribut(noeud, nom) {
  return noeud && typeof noeud === 'object' && noeud['@_' + nom] != null ? String(noeud['@_' + nom]) : '';
}

// Réponse EWS : premier code rendu (« NoError », « ErrorAccessDenied »…), succès, message d'erreur.
function codeReponse(doc) {
  return texteDe(doc, 'ResponseCode').trim();
}
function reponseReussie(doc) {
  let succes = false;
  const visiter = (n) => {
    if (succes || !n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(visiter); return; }
    if (n['@_ResponseClass'] === 'Success') { succes = true; return; }
    Object.keys(n).forEach((cle) => { if (!cle.startsWith('@_')) visiter(n[cle]); });
  };
  visiter(doc);
  return succes || codeReponse(doc) === 'NoError';
}
function messageErreur(doc) {
  return texteDe(doc, 'MessageText').trim();
}
// Erreur SOAP (soap:Fault) : son texte, '' sinon.
function texteFault(doc) {
  const f = premier(doc, 'Fault');
  if (!f) return '';
  return (texteDe(f, 'faultstring') || texteDe(f, 'Text') || texteDe(f, 'Message')).trim();
}

// Premier <ItemId Id="…" ChangeKey="…"/> sous `noeud`.
function identifiantElement(noeud) {
  const id = premier(noeud, 'ItemId');
  return { itemId: attribut(id, 'Id'), changeKey: attribut(id, 'ChangeKey') };
}

// Tout ce qu'un appelant lit d'une réponse EWS, en une fois : document, succès, code (ResponseCode, à défaut
// le faultstring d'une erreur SOAP), présence d'une réponse EWS codée (sinon : page d'erreur du serveur).
function analyseEws(corps) {
  const doc = lireXml(corps);
  const code = codeReponse(doc) || texteFault(doc);
  const codee = tous(doc, 'ResponseCode').length > 0 || reponseReussie(doc);
  return { doc, ok: !!doc && reponseReussie(doc), code, codee };
}

// Un des codes rendus est `code` (« ErrorItemNotFound »…), où qu'il soit dans la réponse.
function aCodeReponse(corps, code) {
  return tous(lireXml(corps), 'ResponseCode').some((c) => texte(c).trim() === code);
}

// Succès franc : au moins une réponse « Success » et aucune « Error » (lot de plusieurs éléments).
function succesSansErreur(corps) {
  const classes = [];
  const visiter = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(visiter); return; }
    if (n['@_ResponseClass']) classes.push(n['@_ResponseClass']);
    Object.keys(n).forEach((k) => { if (!k.startsWith('@_')) visiter(n[k]); });
  };
  visiter(lireXml(corps));
  return classes.includes('Success') && !classes.includes('Error');
}

module.exports = { succesSansErreur, aCodeReponse, identifiantElement, analyseEws, lireXml, tous, premier, texte, texteDe, attribut, codeReponse, reponseReussie, messageErreur, texteFault };
