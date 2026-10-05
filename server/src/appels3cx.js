'use strict';

// Appels reçus par la téléphonie 3CX (étude, 01/10). 3CX ne donne pas d'historique, mais son
// « Intégration CRM » (client web, réglage de chaque collaborateur, « Ouvrir le contact dans un CRM
// personnalisé ») ouvre une adresse à la SONNERIE avec le numéro et le nom affiché de l'appelant :
//   http://<serveur CLAIRE>/appel?numero=%CallerNumber%&nom=%CallerDisplayName%&poste=<collaborateur>
// Le serveur note l'appel (journal `appels-recus`), reconnaît l'appelant (téléphone d'une partie d'un
// dossier, confrère du carnet, contact du répertoire) et la fenêtre CLAIRE du collaborateur ouvre la
// fiche. Seuls les appels qui sonnent sur un poste où le client web 3CX est ouvert sont notés.
// Rien n'est journalisé dans la console (numéros et noms de clients), rien ne part dans le rapport.

var DUREE_JOURNAL_JOURS = 400;
var MAX_JOURNAL = 3000;

// Pure : chiffres d'un numéro, indicatif français ramené à 0 (+33 6… / 0033 6… → 06…).
function normaliserNumero(numero) {
  let n = String(numero || '').replace(/[^\d+]/g, '');
  if (n.startsWith('+33')) n = '0' + n.slice(3);
  else if (n.startsWith('0033')) n = '0' + n.slice(4);
  n = n.replace(/\D/g, '');
  // « +33… » non encodé dans l'adresse ouverte par 3CX : le « + » y est lu comme une espace.
  if (n.length === 11 && n.startsWith('33')) n = '0' + n.slice(2);
  // 3CX préfixe parfois le 0 de la ligne extérieure (« 006… ») : on retire un 0 en trop.
  if (n.length === 11 && n.startsWith('00')) n = n.slice(1);
  return n;
}

// Pure : clé de comparaison (9 derniers chiffres : indifférente au 0, à +33 ou à un préfixe).
function cleNumero(numero) {
  const n = normaliserNumero(numero);
  return n.length >= 9 ? n.slice(-9) : '';
}

// Pure : « 06 12 34 56 78 » pour un numéro français à 10 chiffres, sinon les chiffres tels quels.
function formaterNumero(numero) {
  const n = normaliserNumero(numero);
  return n.length === 10 ? n.replace(/(\d{2})(?=\d)/g, '$1 ') : n;
}

// Pure : les numéros d'un champ libre (« 06 12 34 56 78 / 02.54.00.00.00 »).
function numerosDansTexte(texte) {
  const trouves = String(texte || '').match(/(?:\+|00)?\d[\d .\-]{7,}\d/g) || [];
  return trouves.map(cleNumero).filter(Boolean);
}

function sansAccents(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

// Pure : qui appelle ? Les dossiers dont une partie a ce numéro (vendeur/acquéreur), sinon le
// confrère du carnet (et les dossiers en cours où son office figure), sinon un contact du répertoire.
function reconnaitreAppelant(numero, { dossiers = [], carnet = [], repertoire = [] } = {}) {
  const cle = cleNumero(numero);
  const res = { dossiers: [], contact: null };
  if (!cle) return res;
  for (const d of dossiers) {
    if (!d || d.deleted) continue;
    for (const partie of ['vendeur', 'acquereur']) {
      const champ = partie === 'vendeur' ? d.telephoneVendeur : d.telephoneAcquereur;
      if (numerosDansTexte(champ).indexOf(cle) !== -1) res.dossiers.push({ id: d.id, partie, archive: !!d.archive });
    }
    // Confrère saisi sur la fiche (téléphone du notaire du vendeur ou de l'acquéreur, étude 05/10).
    if ([d.telephoneConfrereVendeur, d.telephoneNotaireParticipant].some(champ => numerosDansTexte(champ).indexOf(cle) !== -1)
      && !res.dossiers.some(x => x.id === d.id)) {
      res.dossiers.push({ id: d.id, partie: 'confrere', archive: !!d.archive });
    }
    // Succession : téléphones des parties reprises d'Authentic.
    if (d.typeAffaire === 'succession' && Array.isArray(d.parties)
      && d.parties.some(p => p && numerosDansTexte((p.telephones || []).join(' / ')).indexOf(cle) !== -1)) {
      res.dossiers.push({ id: d.id, partie: 'partie', archive: !!d.archive });
    }
  }
  if (res.dossiers.length) {
    // Les dossiers en cours d'abord.
    res.dossiers.sort((a, b) => Number(a.archive) - Number(b.archive));
    return res;
  }
  const office = (carnet || []).find(o => numerosDansTexte(o && o.telephone).indexOf(cle) !== -1);
  if (office) {
    res.contact = { type: 'confrere', libelle: office.office || '' };
    const noms = (office.notaires || []).map(n => sansAccents(n).split(/\s+/).filter(m => m.length > 2).pop()).filter(Boolean);
    for (const d of dossiers) {
      if (!d || d.deleted || d.archive) continue;
      const texte = sansAccents([d.notaireVendeur, d.notaireAcquereur].join(' '));
      if (noms.some(n => new RegExp('(^|[^A-Z])' + n.replace(/[^A-Z-]/g, '') + '([^A-Z]|$)').test(texte))) {
        res.dossiers.push({ id: d.id, partie: 'confrere', archive: false });
      }
    }
    return res;
  }
  const contact = (repertoire || []).find(c => (c && c.telephones || []).some(t => numerosDansTexte(t).indexOf(cle) !== -1));
  if (contact) {
    res.contact = { type: 'repertoire', libelle: [contact.organisme, contact.service].filter(Boolean).join(' — ') };
  }
  return res;
}

function texteCourt(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
}

// Pure : journal assaini, du plus récent au plus ancien, borné en durée et en nombre.
function assainirJournalAppels(liste, maintenant = Date.now()) {
  if (!Array.isArray(liste)) return [];
  const limite = maintenant - DUREE_JOURNAL_JOURS * 86400000;
  return liste
    .filter(a => a && typeof a.id === 'string' && typeof a.t === 'string' && Date.parse(a.t) >= limite)
    .map(a => ({
      id: texteCourt(a.id, 40),
      t: a.t,
      numero: texteCourt(a.numero, 30),
      nom: texteCourt(a.nom, 120),
      poste: texteCourt(a.poste, 80),
      dossiers: Array.isArray(a.dossiers) ? a.dossiers.filter(x => x && typeof x.id === 'string').slice(0, 10)
        .map(x => ({ id: texteCourt(x.id, 80), partie: ['vendeur', 'acquereur', 'confrere'].indexOf(x.partie) !== -1 ? x.partie : 'acquereur', archive: !!x.archive })) : [],
      contact: a.contact && typeof a.contact === 'object' ? { type: a.contact.type === 'confrere' ? 'confrere' : 'repertoire', libelle: texteCourt(a.contact.libelle, 160) } : null
    }))
    .sort((a, b) => b.t.localeCompare(a.t))
    .slice(0, MAX_JOURNAL);
}

// Pure : clé d'un poste — le prénom sans accent, en minuscules (« Jérémy SAUJOT », « Jeremy »,
// « jeremy » → « jeremy ») : l'adresse saisie dans 3CX et la fenêtre CLAIRE se retrouvent toujours.
function clePoste(poste) {
  return String(poste || '').trim().split(/\s+/)[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 40);
}

// Pure : une variable 3CX non remplie (« undefined » : %CallerDisplayName% dans la V20, « %CallerNumber% »
// laissé tel quel) ne vaut rien.
function valeur3cx(v) {
  const s = texteCourt(v, 200);
  return /^(undefined|null|%\w+%)$/i.test(s) ? '' : s;
}

// Pure : l'appel tel qu'il est noté.
function creerEntreeAppel({ numero, nom, poste }, sources, maintenant = new Date()) {
  numero = valeur3cx(numero);
  const n = normaliserNumero(numero);
  const reconnu = reconnaitreAppelant(n, sources);
  // 3CX met le numéro dans le nom affiché quand il n'a pas de nom : inutile de le répéter.
  const nomAffiche = texteCourt(valeur3cx(nom), 120);
  return {
    id: 'ap-' + maintenant.getTime().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
    t: maintenant.toISOString(),
    numero: formaterNumero(n) || texteCourt(numero, 30),
    nom: normaliserNumero(nomAffiche) === n ? '' : nomAffiche,
    poste: clePoste(poste),
    dossiers: reconnu.dossiers,
    contact: reconnu.contact
  };
}

// Page rendue dans l'onglet que 3CX ouvre à la sonnerie : elle se ferme d'elle-même quand la
// fenêtre CLAIRE du collaborateur est ouverte et visible (c'est elle qui montre l'appel), sinon elle
// ouvre CLAIRE sur l'appel. Un appelant que CLAIRE ne connaît pas (aucun dossier, ni confrère, ni
// répertoire) n'ouvre rien : l'onglet se ferme (étude 05/10) — l'appel reste noté et montré dans le
// bandeau de la fenêtre CLAIRE. Aucune donnée dans la page.
function pageSonnerie({ id, fenetreVisible, inconnu }) {
  const cible = '/index.html#appel=' + encodeURIComponent(id);
  return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>CLAIRE — appel</title>'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<style>body{font:15px system-ui,sans-serif;background:#f4f5f7;color:#1d2433;display:grid;place-items:center;min-height:100vh;margin:0}</style></head>'
    + '<body><p>Appel noté dans CLAIRE.</p><script>'
    + (fenetreVisible || inconnu
      ? 'window.close();'
      : 'location.replace(' + JSON.stringify(cible) + ');')
    + '</script></body></html>';
}

module.exports = {
  normaliserNumero, cleNumero, formaterNumero, numerosDansTexte, reconnaitreAppelant,
  assainirJournalAppels, creerEntreeAppel, pageSonnerie, clePoste, valeur3cx, DUREE_JOURNAL_JOURS
};
