'use strict';

// ---- Résumé des emails du matin (demandé par l'étude le 29/09) ----
// À 8 h 50 les jours ouvrés, CLAIRE lit la boîte de réception du compte Exchange déjà configuré
// pour l'agenda (la boîte de Bastien, qui « reçoit tout en double ») : les emails arrivés depuis la
// veille 18 h (le vendredi 18 h pour un lundi), et les range par dossier pour la fenêtre du matin
// (« Aujourd'hui »).
//
// Sans IA, par choix : les emails contiennent des données clients, rien ne quitte le bureau. Le
// classement est déterministe — l'expéditeur est l'acquéreur ou le confrère d'un dossier, ou l'objet
// cite le dossier (« VTE - NOM », ou un nom du dossier en mot entier) — et quelques sujets connus
// sont repérés (offre de prêt, fonds, RIB, rendez-vous…).
//
// Ce qui est GARDÉ : l'expéditeur, l'objet, l'heure, les sujets repérés, la présence de pièces
// jointes — jamais le corps de l'email (l'aperçu sert au repérage, puis est jeté). Le résumé est
// remplacé chaque matin.
//
// EWS : lecture seule (FindItem sur la boîte de réception du compte), un seul essai par jour à
// 8 h 50 — jamais de nouvelle tentative automatique après un échec (verrouillage du compte en cas
// d'identifiants refusés, même règle que l'agenda). « Actualiser » dans la fenêtre refait UN essai.

const CLE_RESUME_EMAILS = 'resume-emails-matin';
const HEURE_RESUME = '08:50';
const MAX_EMAILS = 200;

const ENVELOPPE_DEBUT = '<?xml version="1.0" encoding="utf-8"?>'
  + '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"'
  + ' xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"'
  + ' xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages">'
  + '<soap:Header><t:RequestServerVersion Version="Exchange2013"/></soap:Header><soap:Body>';
const ENVELOPPE_FIN = '</soap:Body></soap:Envelope>';

// Date AAAA-MM-JJ et heure HH:MM à Paris pour un instant donné.
function momentParis(instant) {
  const d = instant instanceof Date ? instant : new Date(instant);
  return {
    date: d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }),
    heure: d.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })
  };
}

// Décalage de Paris par rapport à UTC (minutes) à un instant donné (heure d'été comprise).
function decalageParis(instant) {
  const d = new Date(instant);
  const texte = d.toLocaleString('sv-SE', { timeZone: 'Europe/Paris' }).replace(' ', 'T') + 'Z';
  return Math.round((Date.parse(texte) - d.getTime()) / 60000);
}

// Pure : début de la fenêtre — 18 h (Paris) le jour ouvré précédent, en ISO UTC.
function debutFenetreEmails(aujourdhuiIso) {
  const d = new Date(aujourdhuiIso + 'T12:00:00Z');
  do { d.setUTCDate(d.getUTCDate() - 1); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  const jour = d.toISOString().slice(0, 10);
  const approx = new Date(jour + 'T18:00:00Z');
  return new Date(approx.getTime() - decalageParis(approx) * 60000).toISOString();
}

function echapperXml(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function desechapperXml(s) {
  return String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&');
}

// FindItem sur la boîte de réception du compte de connexion, depuis `depuisUtc`.
function corpsFindEmails(depuisUtc, max = MAX_EMAILS) {
  return ENVELOPPE_DEBUT
    + '<m:FindItem Traversal="Shallow">'
    + '<m:ItemShape><t:BaseShape>IdOnly</t:BaseShape><t:AdditionalProperties>'
    + '<t:FieldURI FieldURI="item:Subject"/>'
    + '<t:FieldURI FieldURI="message:From"/>'
    + '<t:FieldURI FieldURI="item:DateTimeReceived"/>'
    + '<t:FieldURI FieldURI="item:HasAttachments"/>'
    + '<t:FieldURI FieldURI="item:Preview"/>'
    + '</t:AdditionalProperties></m:ItemShape>'
    + `<m:IndexedPageItemView MaxEntriesReturned="${Number(max) || MAX_EMAILS}" Offset="0" BasePoint="Beginning"/>`
    + '<m:Restriction><t:IsGreaterThanOrEqualTo><t:FieldURI FieldURI="item:DateTimeReceived"/>'
    + `<t:FieldURIOrConstant><t:Constant Value="${echapperXml(depuisUtc)}"/></t:FieldURIOrConstant>`
    + '</t:IsGreaterThanOrEqualTo></m:Restriction>'
    + '<m:SortOrder><t:FieldOrder Order="Ascending"><t:FieldURI FieldURI="item:DateTimeReceived"/></t:FieldOrder></m:SortOrder>'
    + '<m:ParentFolderIds><t:DistinguishedFolderId Id="inbox"/></m:ParentFolderIds>'
    + '</m:FindItem>' + ENVELOPPE_FIN;
}

// Pure : les emails d'une réponse FindItem.
function parseFindEmails(corps) {
  const texte = String(corps || '');
  const emails = [];
  const re = /<t:Message\b[\s\S]*?<\/t:Message>/g;
  let m;
  while ((m = re.exec(texte)) !== null) {
    const bloc = m[0];
    const lire = (tag) => desechapperXml((bloc.match(new RegExp(`<t:${tag}>([\\s\\S]*?)</t:${tag}>`)) || [])[1] || '').trim();
    const from = (bloc.match(/<t:From>([\s\S]*?)<\/t:From>/) || [])[1] || '';
    emails.push({
      sujet: lire('Subject'),
      deNom: desechapperXml((from.match(/<t:Name>([\s\S]*?)<\/t:Name>/) || [])[1] || '').trim(),
      deAdresse: desechapperXml((from.match(/<t:EmailAddress>([\s\S]*?)<\/t:EmailAddress>/) || [])[1] || '').trim().toLowerCase(),
      recuLe: lire('DateTimeReceived'),
      pj: lire('HasAttachments') === 'true',
      apercu: lire('Preview')
    });
  }
  return emails;
}

// ---- Classement (pur) ----
function normaliser(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

// Mots qui ne désignent jamais un dossier à eux seuls.
const MOTS_VIDES = new Set(['EPOUX', 'EPOUSE', 'CONSORTS', 'MONSIEUR', 'MADAME', 'SARL', 'SCI', 'SAS', 'SOCIETE',
  'VENTE', 'INDIVISION', 'SUCCESSION', 'DOSSIER', 'NOTAIRE', 'MAITRE', 'OFFICE']);

function motsDuDossier(d) {
  return [...new Set(normaliser(d && d.nom).split(/[^A-Z]+/).filter(m => m.length >= 4 && !MOTS_VIDES.has(m)))];
}

const SUJETS_EMAIL = [
  { cle: 'offre', libelle: 'Offre de prêt', re: /OFFRE (DE )?(PRET|CREDIT)|ACCORD DE (PRET|FINANCEMENT)|EDITION DE L.OFFRE/ },
  { cle: 'fonds', libelle: 'Fonds', re: /VIREMENT|FONDS|AVIS D.OPERATION|SOLDE A VERSER/ },
  { cle: 'rib', libelle: 'RIB', re: /(^|[^A-Z])RIB([^A-Z]|$)|RELEVE D.IDENTITE BANCAIRE/ },
  { cle: 'rdv', libelle: 'Rendez-vous', re: /RENDEZ.VOUS|(^|[^A-Z])RDV([^A-Z]|$)|SIGNATURE/ },
  { cle: 'projet', libelle: 'Projet d’acte', re: /PROJET D.ACTE|PROJET DE VENTE/ },
  { cle: 'pieces', libelle: 'Pièces', re: /DIAGNOSTIC|PIECES?|DOCUMENTS?|ATTESTATION|JUSTIFICATIF/ },
  { cle: 'urgent', libelle: 'Urgent', re: /URGENT/ }
];

// `dossiers` : les dossiers actifs ; `adressesIgnorees` : les adresses de CLAIRE elle-même (envoi
// des rappels, passerelle Teams), dont les copies ne sont pas des emails reçus.
function classerEmails(emails, dossiers, adressesIgnorees) {
  const ignorees = new Set((adressesIgnorees || []).filter(Boolean).map(a => String(a).toLowerCase()));
  const actifs = (dossiers || []).filter(d => d && !d.archive);
  const parAdresse = new Map();
  for (const d of actifs) {
    for (const a of [d.emailAcquereur, d.emailNotaireParticipant]) {
      if (typeof a === 'string' && a.trim()) parAdresse.set(a.trim().toLowerCase(), d);
    }
  }
  const groupes = new Map();
  const autres = [];
  for (const e of emails || []) {
    if (!e || ignorees.has(e.deAdresse)) continue;
    const sujetN = normaliser(e.sujet);
    const texteN = sujetN + ' ' + normaliser(e.apercu);
    let dossier = parAdresse.get(e.deAdresse) || null;
    if (!dossier) {
      // « VTE - NOM » ou « VENTE - NOM » cité dans l'objet ou le début du message.
      dossier = actifs.find(d => d.nom && (texteN.includes(normaliser('VTE - ' + d.nom))
        || texteN.includes(normaliser('VENTE - ' + d.nom)))) || null;
    }
    if (!dossier) {
      // Un nom du dossier, en mot entier, dans l'OBJET seulement (le corps cite trop de noms).
      let meilleur = null, score = 0;
      for (const d of actifs) {
        const n = motsDuDossier(d).filter(m => new RegExp(`(^|[^A-Z])${m}([^A-Z]|$)`).test(sujetN)).length;
        if (n > score) { score = n; meilleur = d; }
      }
      dossier = meilleur;
    }
    const heure = e.recuLe ? momentParis(e.recuLe).heure.replace(':', ' h ') : '';
    const resume = {
      de: e.deNom || e.deAdresse || 'Expéditeur inconnu', adresse: e.deAdresse, sujet: e.sujet || '(sans objet)',
      recuLe: e.recuLe, heure, pj: !!e.pj,
      sujets: SUJETS_EMAIL.filter(s => s.re.test(texteN)).map(s => s.libelle)
    };
    if (!dossier) { autres.push(resume); continue; }
    if (!groupes.has(dossier.id)) groupes.set(dossier.id, { dossierId: dossier.id, dossierNom: dossier.nom, responsable: dossier.responsable || '', emails: [] });
    groupes.get(dossier.id).emails.push(resume);
  }
  return { dossiers: [...groupes.values()], autres };
}

// ---- Tâche ----
function lireResume(parametresRepo) {
  return parametresRepo.lireResumeEmails ? parametresRepo.lireResumeEmails() : null;
}

function adressesDeClaire(parametresRepo) {
  const r = parametresRepo.lireReglages ? parametresRepo.lireReglages() : {};
  return [r.smtpUtilisateur, r.emailPasserelle].filter(Boolean);
}

// Un tour : lit la boîte, classe, enregistre. Un seul essai ; le résultat (ou l'erreur) est gardé
// pour la journée. `injections.poster` : faux transport pour les tests.
async function genererResumeEmails(depot, parametresRepo, maintenant, injections = {}) {
  const { posterEws } = require('./exchange/ews');
  const quand = maintenant || new Date();
  const { date } = momentParis(quand);
  const depuis = debutFenetreEmails(date);
  const base = { date, depuis, genereLe: new Date(quand).toISOString() };
  const reglages = parametresRepo.lireReglagesExchange ? parametresRepo.lireReglagesExchange() : {};
  let resume;
  if (!reglages.actif || !reglages.email || !reglages.motDePasse) {
    resume = { ...base, erreur: 'La connexion Exchange n’est pas configurée (Réglages › Rappels et agenda).' };
  } else {
    const r = await posterEws({ url: reglages.url, email: reglages.email, motDePasse: reglages.motDePasse, body: corpsFindEmails(depuis) }, injections);
    if (r.echec) resume = { ...base, erreur: r.echec.message };
    else if (r.statut === 401 || r.statut === 403) resume = { ...base, erreur: 'Identifiants de messagerie refusés : vérifiez les Réglages.' };
    else if (!/ResponseClass="Success"/.test(String(r.corps || ''))) {
      const code = (String(r.corps || '').match(/<m:ResponseCode>([^<]+)<\/m:ResponseCode>/) || [])[1] || String(r.statut || '');
      resume = { ...base, erreur: `Lecture de la boîte de réception impossible${code ? ' (' + code + ')' : ''}.` };
    } else {
      const emails = parseFindEmails(r.corps);
      resume = { ...base, total: emails.length, ...classerEmails(emails, depot.tousActifs(), adressesDeClaire(parametresRepo)) };
    }
  }
  return parametresRepo.ecrireResumeEmails ? parametresRepo.ecrireResumeEmails(resume) : resume;
}

// Pure : faut-il générer maintenant ? Jours ouvrés, à partir de 8 h 50, une fois par jour.
function resumeDu(maintenant, dernier) {
  const { date, heure } = momentParis(maintenant);
  const jour = new Date(date + 'T12:00:00Z').getUTCDay();
  if (jour === 0 || jour === 6) return false;
  if (heure < HEURE_RESUME) return false;
  return !(dernier && dernier.date === date);
}

function demarrerResumeEmails(depot, parametresRepo, intervalleMs = 60 * 1000) {
  let enCours = false;
  const tour = async () => {
    if (enCours || !resumeDu(new Date(), lireResume(parametresRepo))) return;
    enCours = true;
    try { await genererResumeEmails(depot, parametresRepo); }
    catch (e) { console.warn('[CLAIRE] Résumé des emails du matin interrompu :', e.message); }
    finally { enCours = false; }
  };
  tour();
  return setInterval(tour, intervalleMs);
}

module.exports = {
  CLE_RESUME_EMAILS, debutFenetreEmails, corpsFindEmails, parseFindEmails, classerEmails, motsDuDossier,
  genererResumeEmails, lireResume, resumeDu, demarrerResumeEmails, momentParis
};
