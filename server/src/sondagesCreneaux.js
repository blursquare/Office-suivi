'use strict';

// Sondage de créneaux de signature « comme un Doodle », sans rien héberger (étude, 30/09 : « on
// propose plusieurs créneaux et les clients votent »). CLAIRE ne publie aucune page : chaque
// participant reçoit un email préparé par le poste (.eml, jamais envoyé seul — contrainte 4) dont
// les boutons sont des liens `mailto:` vers la boîte du compte Exchange, avec un objet porteur d'un
// jeton « [CLAIRE-CODE-n] ». Le serveur relit les OBJETS reçus dans cette boîte (FindItem seul,
// jamais le corps), rapproche l'expéditeur d'un participant et compte les votes.
//
// Les créneaux proposés peuvent être bloqués « en option » dans l'agenda partagé (rendez-vous
// provisoire, titre « VTE - NOM ? … » : le point d'interrogation est la marque de l'étude pour un
// rendez-vous non confirmé, il n'écrit rien sur la fiche — voir agendaOffice.estRendezVousSignature).
// Les options sont retirées (MoveToDeletedItems) au placement, à l'annulation, ou d'elles-mêmes
// après 5 jours ouvrés sans décision.
//
// Règles EWS reprises d'ews.js : un seul essai par appel, disjoncteur partagé avec la lecture de
// l'agenda (mêmes identifiants) — un refus suspend la relecture automatique.

const crypto = require('node:crypto');

const CLE_SONDAGES = 'sondages-creneaux';
const MAX_SONDAGES = 200;
const MAX_CRENEAUX = 5;
const MAX_PARTICIPANTS = 6;
const JOURS_OUVRES_OPTION = 5;
const STATUTS = ['ouvert', 'place', 'annule', 'expire'];
const ROLES_PARTICIPANT = ['vendeur', 'acquereur', 'confrere-vendeur', 'confrere-acquereur', 'autre'];
const ALPHABET_CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function texteBorne(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
}
const dateValide = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
const heureValide = (v) => (/^\d{2}:\d{2}$/.test(String(v || '')) ? String(v) : '');
function adresseValide(a) {
  return typeof a === 'string' && /^[^\s@<>"]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(a.trim());
}

// Code du sondage : 6 caractères sans ambiguïté de lecture (ni O/0 ni I/1).
function codeSondage(aleatoire) {
  const octets = aleatoire || crypto.randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) code += ALPHABET_CODE[octets[i] % ALPHABET_CODE.length];
  return code;
}

// Le jeton porté par l'objet de la réponse : n = numéro du créneau, 0 = « aucun ne convient ».
function jetonReponse(code, n) {
  return `[CLAIRE-${code}-${n}]`;
}

// Pure : les jetons d'un objet (« RE: [CLAIRE-ABC234-2] Créneau 2 … » → [{ code, n }]).
// « L » : réponse « en une seule fois » (étude, 01/10) — les créneaux retenus sont les lignes
// cochées d'un X dans le texte de l'email (voir choixDepuisTexteListe) ; rend { code, liste: true }.
// « P » : réponse venue de la page de réponse (page-sondage/index.html, étude 01/10, vote à la
// manière de Rallly) — « P13S2 » = oui aux créneaux 1 et 3, « si nécessaire » au 2 ; « P0 » = aucun ;
// rend { code, page: true, choix, siBesoin, cle }. « -Q7AB » à la suite : le code personnel du
// destinataire (lien à lui), qui le désigne quand la réponse arrive par le relais Google (expéditeur =
// compte Gmail de l'étude, pas le client).
function jetonsDansObjet(sujet) {
  const liste = [];
  const re = /CLAIRE-([A-HJ-NP-Z2-9]{6})-(P(?:\d{1,5}(?:S\d{1,5})?|S\d{1,5})|L|\d)(?:-([A-HJ-NP-Z2-9]{4}))?(?![0-9A-Za-z])/gi;
  let m;
  const numeros = (t) => [...new Set(String(t || '').split('').map(Number).filter((n) => n > 0))].sort();
  while ((m = re.exec(String(sujet || ''))) !== null) {
    const code = m[1].toUpperCase();
    if (/^l$/i.test(m[2])) liste.push({ code, liste: true });
    else if (/^p/i.test(m[2])) {
      const [oui, si] = m[2].slice(1).toUpperCase().split('S');
      const choix = numeros(oui);
      const jeton = { code, page: true, choix, siBesoin: numeros(si).filter((n) => !choix.includes(n)) };
      if (m[3]) jeton.cle = m[3].toUpperCase();
      liste.push(jeton);
    } else liste.push({ code, n: Number(m[2]) });
  }
  return liste;
}

// Pure : les créneaux cochés dans le texte d'une réponse « en une seule fois ». Une ligne
// « [X] 2 - Mardi … » (X, x, ✓ ou ✔ entre les crochets) retient le créneau 2 ; « [ ] » non. Le texte
// cité d'un autre email (lignes commençant par « > ») est ignoré.
function choixDepuisTexteListe(texte, numeros) {
  const valides = new Set(numeros || []);
  const choix = new Set();
  for (const ligne of String(texte || '').split(/\r?\n/)) {
    if (/^\s*>/.test(ligne)) continue;
    const m = /^\s*\[\s*[xX✓✔]\s*\]\s*(\d)(?![0-9])/.exec(ligne);
    if (m && valides.has(Number(m[1]))) choix.add(Number(m[1]));
  }
  return [...choix].sort();
}

// Pure : n jours ouvrés (lundi → vendredi) après une date.
function joursOuvresApres(dateIso, n) {
  const d = new Date(dateIso + 'T12:00:00Z');
  let restants = n;
  while (restants > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const j = d.getUTCDay();
    if (j !== 0 && j !== 6) restants--;
  }
  return d.toISOString().slice(0, 10);
}

function assainirCreneau(c, i) {
  if (!c || typeof c !== 'object') return null;
  const date = dateValide(c.date);
  const heure = heureValide(c.heure);
  if (!date || !heure) return null;
  const duree = Number.parseInt(c.dureeMinutes, 10);
  return {
    n: Number.isInteger(c.n) && c.n > 0 && c.n <= MAX_CRENEAUX ? c.n : i + 1,
    date, heure,
    dureeMinutes: Number.isInteger(duree) && duree > 0 ? Math.min(600, duree) : 60,
    option: c.option && typeof c.option === 'object' && c.option.itemId
      ? { itemId: texteBorne(c.option.itemId, 400), changeKey: texteBorne(c.option.changeKey, 200) }
      : null
  };
}

function assainirParticipant(p) {
  if (!p || typeof p !== 'object' || !adresseValide(p.email)) return null;
  return {
    role: ROLES_PARTICIPANT.includes(p.role) ? p.role : 'autre',
    nom: texteBorne(p.nom, 120),
    email: p.email.trim().toLowerCase(),
    confrere: !!p.confrere,
    // Code personnel (4 caractères) du lien de ce destinataire vers la page de réponse.
    cle: /^[A-HJ-NP-Z2-9]{4}$/.test(String(p.cle || '')) ? p.cle : ''
  };
}

// Codes personnels distincts pour chaque destinataire d'un sondage.
function attribuerCles(participants, aleatoire) {
  const pris = new Set();
  return participants.map((p, i) => {
    let cle = '';
    for (let essai = 0; essai < 20 && (!cle || pris.has(cle)); essai++) {
      const octets = aleatoire ? Buffer.from([...aleatoire].map((o) => (o + i * 7 + essai) % 256)) : crypto.randomBytes(6);
      cle = codeSondage(octets).slice(0, 4);
    }
    pris.add(cle);
    return { ...p, cle };
  });
}

function assainirReponse(r) {
  if (!r || typeof r !== 'object' || !adresseValide(r.email)) return null;
  const choix = Array.isArray(r.choix) ? [...new Set(r.choix.filter((n) => Number.isInteger(n) && n > 0 && n <= MAX_CRENEAUX))].sort() : [];
  return {
    email: r.email.trim().toLowerCase(),
    nom: texteBorne(r.nom, 120),
    choix,
    // « Si nécessaire » (page de réponse) : possible, mais pas souhaité.
    siBesoin: Array.isArray(r.siBesoin) ? [...new Set(r.siBesoin.filter((n) => Number.isInteger(n) && n > 0 && n <= MAX_CRENEAUX && !choix.includes(n)))].sort() : [],
    aucun: !!r.aucun && !choix.length && !(Array.isArray(r.siBesoin) && r.siBesoin.length),
    recuLe: texteBorne(r.recuLe, 40)
  };
}

function assainirSondage(s) {
  if (!s || typeof s !== 'object') return null;
  const id = texteBorne(s.id, 80);
  const code = /^[A-HJ-NP-Z2-9]{6}$/.test(String(s.code || '')) ? s.code : '';
  if (!id || !code) return null;
  const creneaux = (Array.isArray(s.creneaux) ? s.creneaux : []).map(assainirCreneau).filter(Boolean).slice(0, MAX_CRENEAUX);
  if (!creneaux.length) return null;
  const participants = (Array.isArray(s.participants) ? s.participants : []).map(assainirParticipant).filter(Boolean).slice(0, MAX_PARTICIPANTS);
  const reponses = (Array.isArray(s.reponses) ? s.reponses : []).map(assainirReponse).filter(Boolean).slice(0, 20);
  return {
    id, code,
    dossierId: texteBorne(s.dossierId, 80),
    dossierNom: texteBorne(s.dossierNom, 200),
    // Sondage sans dossier (étude, 01/10 : « plusieurs propositions de rendez-vous sans être lié à un
    // dossier ») : le titre du rendez-vous à placer.
    titre: texteBorne(s.titre, 120),
    statut: STATUTS.includes(s.statut) ? s.statut : 'ouvert',
    creeLe: texteBorne(s.creeLe, 40),
    creePar: texteBorne(s.creePar, 80),
    expireLe: dateValide(s.expireLe),
    adresseReponse: adresseValide(s.adresseReponse) ? s.adresseReponse.trim() : '',
    typeRdv: texteBorne(s.typeRdv, 20),
    creneaux, participants, reponses,
    relances: (Array.isArray(s.relances) ? s.relances : []).map((x) => texteBorne(x, 40)).filter(Boolean).slice(-10),
    choisi: Number.isInteger(s.choisi) && s.choisi > 0 ? s.choisi : null,
    closLe: texteBorne(s.closLe, 40),
    // Options qu'un retrait a manquées (Exchange injoignable) : retentées au tour suivant.
    optionsARetirer: (Array.isArray(s.optionsARetirer) ? s.optionsARetirer : [])
      .filter((o) => o && o.itemId).map((o) => ({ itemId: texteBorne(o.itemId, 400), changeKey: texteBorne(o.changeKey, 200) })).slice(0, MAX_CRENEAUX)
  };
}

function assainirSondages(brut) {
  const liste = Array.isArray(brut) ? brut : [];
  return liste.map(assainirSondage).filter(Boolean).slice(-MAX_SONDAGES);
}

// Pure : applique des emails reçus ({ sujet, deAdresse, deNom, recuLe }) aux sondages. Emails
// traités dans l'ordre de réception : un créneau s'ajoute aux choix de l'expéditeur, « aucun »
// (n = 0) les efface. Seuls les sondages ouverts comptent ; un jeton d'un numéro de créneau qui
// n'existe pas est ignoré. Rend { sondages, nouvelles } (nouvelles = réponses qui ont changé).
function appliquerReponses(sondages, emails) {
  const parCode = new Map(sondages.filter((s) => s.statut === 'ouvert').map((s) => [s.code, s]));
  const nouvelles = [];
  const tries = (emails || []).slice().sort((a, b) => String(a.recuLe || '').localeCompare(String(b.recuLe || '')));
  for (const e of tries) {
    const expediteur = String(e.deAdresse || '').trim().toLowerCase();
    for (const { code, n, liste, page, choix, siBesoin, cle } of jetonsDansObjet(e.sujet)) {
      const s = parCode.get(code);
      if (!s) continue;
      // Code personnel : il désigne le destinataire (réponse relayée) ; un code inconnu est écarté.
      let adresse = expediteur;
      if (cle) {
        const p = s.participants.find((x) => x.cle === cle);
        if (!p) continue;
        adresse = p.email;
      }
      if (!adresseValide(adresse)) continue;
      // Réponse « en une seule fois » : seulement si son texte a été lu et coche au moins un créneau.
      if (liste && !(Array.isArray(e.choixListe) && e.choixListe.length)) continue;
      if (n > 0 && !s.creneaux.some((c) => c.n === n)) continue;
      let r = s.reponses.find((x) => x.email === adresse);
      // Un email déjà compté (même heure de réception) ne recompte rien : la boîte est relue à
      // chaque tour depuis la création du sondage.
      if (r && r.recuLe && e.recuLe && r.recuLe >= e.recuLe) continue;
      if (!r) {
        const p = s.participants.find((x) => x.email === adresse);
        r = { email: adresse, nom: (p && p.nom) || texteBorne(e.deNom, 120), choix: [], siBesoin: [], aucun: false, recuLe: '' };
        s.reponses.push(r);
      }
      if (page) {
        // Réponse complète de la personne : remplace ses choix précédents (P0 = aucun).
        r.choix = choix.filter((x) => s.creneaux.some((c) => c.n === x)).sort();
        r.siBesoin = siBesoin.filter((x) => s.creneaux.some((c) => c.n === x)).sort();
        r.aucun = !r.choix.length && !r.siBesoin.length;
      } else if (liste) {
        // Remplace les choix précédents : c'est la réponse complète de la personne.
        r.choix = e.choixListe.filter((x) => s.creneaux.some((c) => c.n === x)).sort();
        r.siBesoin = [];
        r.aucun = false;
        if (!r.choix.length) continue;
      } else if (n === 0) { r.choix = []; r.siBesoin = []; r.aucun = true; } else if (!r.choix.includes(n)) {
        r.choix = [...r.choix, n].sort(); r.siBesoin = (r.siBesoin || []).filter((x) => x !== n); r.aucun = false;
      }
      r.recuLe = texteBorne(e.recuLe, 40);
      nouvelles.push({ sondageId: s.id, dossierId: s.dossierId, email: adresse, n: page ? 'page' : liste ? 'liste' : n });
    }
  }
  return { sondages, nouvelles };
}

// Pure : pour chaque créneau, qui l'accepte (oui), qui le prendrait « si nécessaire », et s'il est
// possible pour tous les participants (oui ou si nécessaire).
function syntheseSondage(s) {
  const participants = s.participants || [];
  const rep = (p) => (s.reponses || []).find((r) => r.email === p.email);
  return (s.creneaux || []).map((c) => {
    const accepte = participants.filter((p) => { const r = rep(p); return r && r.choix.includes(c.n); }).length;
    const siBesoin = participants.filter((p) => { const r = rep(p); return r && (r.siBesoin || []).includes(c.n); }).length;
    return {
      n: c.n, date: c.date, heure: c.heure, accepte, siBesoin, total: participants.length,
      tous: participants.length > 0 && accepte + siBesoin === participants.length,
      tousOui: participants.length > 0 && accepte === participants.length
    };
  });
}

// Pure : sondages ouverts dont le délai des options est passé.
function sondagesExpires(sondages, aujourdHui) {
  return (sondages || []).filter((s) => s.statut === 'ouvert' && s.expireLe && s.expireLe < aujourdHui);
}

// FindItem sur la boîte de réception : objets contenant « CLAIRE- », depuis `depuisUtc`. Objet,
// expéditeur et heure seulement — jamais le corps ni l'aperçu.
const ENVELOPPE_DEBUT = '<?xml version="1.0" encoding="utf-8"?>'
  + '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"'
  + ' xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"'
  + ' xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages">'
  + '<soap:Header><t:RequestServerVersion Version="Exchange2013"/></soap:Header><soap:Body>';
const ENVELOPPE_FIN = '</soap:Body></soap:Envelope>';

function echapperXml(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function corpsFindReponsesSondages(depuisUtc) {
  return ENVELOPPE_DEBUT
    + '<m:FindItem Traversal="Shallow">'
    + '<m:ItemShape><t:BaseShape>IdOnly</t:BaseShape><t:AdditionalProperties>'
    + '<t:FieldURI FieldURI="item:Subject"/>'
    + '<t:FieldURI FieldURI="message:From"/>'
    + '<t:FieldURI FieldURI="item:DateTimeReceived"/>'
    + '</t:AdditionalProperties></m:ItemShape>'
    + '<m:IndexedPageItemView MaxEntriesReturned="200" Offset="0" BasePoint="Beginning"/>'
    + '<m:Restriction><t:And>'
    + '<t:IsGreaterThanOrEqualTo><t:FieldURI FieldURI="item:DateTimeReceived"/>'
    + `<t:FieldURIOrConstant><t:Constant Value="${echapperXml(depuisUtc)}"/></t:FieldURIOrConstant>`
    + '</t:IsGreaterThanOrEqualTo>'
    + '<t:Contains ContainmentMode="Substring" ContainmentComparison="IgnoreCase">'
    + '<t:FieldURI FieldURI="item:Subject"/><t:Constant Value="CLAIRE-"/></t:Contains>'
    + '</t:And></m:Restriction>'
    + '<m:SortOrder><t:FieldOrder Order="Ascending"><t:FieldURI FieldURI="item:DateTimeReceived"/></t:FieldOrder></m:SortOrder>'
    + '<m:ParentFolderIds><t:DistinguishedFolderId Id="inbox"/></m:ParentFolderIds>'
    + '</m:FindItem>' + ENVELOPPE_FIN;
}

function desechapperXml(s) {
  return String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(?:x([0-9a-f]{1,6})|(\d{1,7}));/gi, (t, h, n) => { const c = h ? parseInt(h, 16) : Number(n); return c > 0 && c <= 0x10ffff ? String.fromCodePoint(c) : t; })
    .replace(/&amp;/g, '&');
}

// Pure : les messages d'une réponse FindItem, avec leur identifiant (pour lire, au besoin, le texte
// d'une réponse « en une seule fois »).
function parseFindReponses(corps) {
  const liste = [];
  const re = /<t:Message\b[\s\S]*?<\/t:Message>/g;
  let m;
  while ((m = re.exec(String(corps || ''))) !== null) {
    const bloc = m[0];
    const lire = (tag) => desechapperXml((bloc.match(new RegExp(`<t:${tag}>([\\s\\S]*?)</t:${tag}>`)) || [])[1] || '').trim();
    const from = (bloc.match(/<t:From>([\s\S]*?)<\/t:From>/) || [])[1] || '';
    liste.push({
      itemId: desechapperXml((bloc.match(/<t:ItemId\b[^>]*\bId="([^"]+)"/) || [])[1] || ''),
      sujet: lire('Subject'),
      deNom: desechapperXml((from.match(/<t:Name>([\s\S]*?)<\/t:Name>/) || [])[1] || '').trim(),
      deAdresse: desechapperXml((from.match(/<t:EmailAddress>([\s\S]*?)<\/t:EmailAddress>/) || [])[1] || '').trim().toLowerCase(),
      recuLe: lire('DateTimeReceived')
    });
  }
  return liste;
}

// GetItem du seul texte (BodyType Text) des réponses « en une seule fois » — jamais gardé : seuls
// les numéros cochés en sont tirés.
function corpsLireTextesReponses(itemIds) {
  return ENVELOPPE_DEBUT
    + '<m:GetItem><m:ItemShape><t:BaseShape>IdOnly</t:BaseShape><t:BodyType>Text</t:BodyType>'
    + '<t:AdditionalProperties><t:FieldURI FieldURI="item:Body"/></t:AdditionalProperties></m:ItemShape>'
    + '<m:ItemIds>' + itemIds.map((id) => `<t:ItemId Id="${echapperXml(id)}"/>`).join('') + '</m:ItemIds>'
    + '</m:GetItem>' + ENVELOPPE_FIN;
}

// Pure : itemId → texte, d'une réponse GetItem.
function parseTextesReponses(corps) {
  const textes = new Map();
  const re = /<t:Message\b[\s\S]*?<\/t:Message>/g;
  let m;
  while ((m = re.exec(String(corps || ''))) !== null) {
    const id = desechapperXml((m[0].match(/<t:ItemId\b[^>]*\bId="([^"]+)"/) || [])[1] || '');
    const texte = desechapperXml((m[0].match(/<t:Body\b[^>]*>([\s\S]*?)<\/t:Body>/) || [])[1] || '');
    if (id) textes.set(id, texte);
  }
  return textes;
}

// Pure : les réponses « en une seule fois » dont il faut lire le texte — sondage ouvert, et pas
// déjà comptées (même règle de date que appliquerReponses). Au plus 20 par tour.
function reponsesListeALire(sondages, emails) {
  const parCode = new Map(sondages.filter((s) => s.statut === 'ouvert').map((s) => [s.code, s]));
  return emails.filter((e) => e.itemId && jetonsDansObjet(e.sujet).some((j) => {
    if (!j.liste) return false;
    const s = parCode.get(j.code);
    if (!s) return false;
    const r = s.reponses.find((x) => x.email === String(e.deAdresse || '').toLowerCase());
    return !(r && r.recuLe && e.recuLe && r.recuLe >= e.recuLe);
  })).slice(0, 20);
}

function dateDuJourParis(maintenant) {
  return new Date(maintenant || Date.now()).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
}

function connexionPrete(r) {
  return Boolean(r && r.actif && r.url && r.email && r.motDePasse);
}

// Retire les options d'un sondage (un essai par option). Rend { restantes, refus }.
async function retirerOptions(options, reglages, injections) {
  const { supprimerEcheanceExchange } = require('./exchange/ews');
  const restantes = [];
  let refus = false;
  for (const o of options) {
    if (refus) { restantes.push(o); continue; }
    const r = await supprimerEcheanceExchange({ url: reglages.url, email: reglages.email, motDePasse: reglages.motDePasse, itemId: o.itemId, changeKey: o.changeKey }, injections);
    // Déjà supprimée à la main dans Outlook : rien à retenter.
    if (r.ok || /ErrorItemNotFound/.test(String(r.message || ''))) continue;
    if (r.raison === 'auth') refus = true;
    restantes.push(o);
  }
  return { restantes, refus };
}

// Clôt un sondage (placé, annulé, expiré) : ses options sont retirées de l'agenda. Pur sur la
// liste passée ; les options non retirées restent dans `optionsARetirer`.
async function clore(s, statut, reglages, parametresRepo, injections, choisi) {
  const options = s.creneaux.filter((c) => c.option).map((c) => c.option).concat(s.optionsARetirer || []);
  s.statut = statut;
  s.closLe = new Date().toISOString();
  if (choisi) s.choisi = choisi;
  s.creneaux = s.creneaux.map((c) => ({ ...c, option: null }));
  if (!options.length) { s.optionsARetirer = []; return { refus: false }; }
  if (!connexionPrete(reglages)) { s.optionsARetirer = options; return { refus: false }; }
  const { restantes, refus } = await retirerOptions(options, reglages, injections);
  const retirees = options.filter((o) => !restantes.includes(o));
  if (parametresRepo && typeof parametresRepo.retirerEvenementAgendaOffice === 'function') {
    for (const o of retirees) parametresRepo.retirerEvenementAgendaOffice(o.itemId);
  }
  s.optionsARetirer = restantes;
  return { refus };
}

// Un tour : relit la boîte (s'il y a des sondages ouverts), puis clôt les sondages expirés et
// retente les options restées en place. `manuel` : demandé par une personne (le disjoncteur ne
// l'empêche pas, comme « Tester maintenant »).
async function executerTourSondages(parametresRepo, injections = {}, manuel = false) {
  const agendaWatch = require('./agendaWatch');
  const { posterEws } = require('./exchange/ews');
  const reglages = parametresRepo.lireReglagesExchange ? parametresRepo.lireReglagesExchange() : {};
  const sondages = parametresRepo.lireSondagesCreneaux();
  const resultat = { ok: false, lus: 0, nouvelles: [], expires: [], erreur: null };
  const ouverts = sondages.filter((s) => s.statut === 'ouvert');
  const aRetirer = sondages.filter((s) => (s.optionsARetirer || []).length);
  if (!ouverts.length && !aRetirer.length) { resultat.ok = true; return resultat; }
  if (!connexionPrete(reglages)) { resultat.erreur = 'La connexion Exchange n’est pas configurée (Réglages › Rappels et agenda).'; return resultat; }
  if (!manuel && agendaWatch.lectureAgendaSuspendue(reglages)) { resultat.erreur = 'Lecture suspendue : identifiants de messagerie refusés.'; return resultat; }

  if (ouverts.length) {
    const depuis = ouverts.map((s) => s.creeLe).filter(Boolean).sort()[0] || new Date(Date.now() - 30 * 86400000).toISOString();
    const r = await posterEws({ url: reglages.url, email: reglages.email, motDePasse: reglages.motDePasse, body: corpsFindReponsesSondages(depuis) }, injections);
    if (r.echec) { resultat.erreur = r.echec.message; return resultat; }
    if (r.statut === 401 || r.statut === 403) {
      agendaWatch.signalerIdentifiantsRefuses(reglages);
      resultat.erreur = 'Identifiants de messagerie refusés : vérifiez les Réglages.';
      return resultat;
    }
    if (!/ResponseClass="Success"/.test(String(r.corps || ''))) {
      const code = (String(r.corps || '').match(/<m:ResponseCode>([^<]+)<\/m:ResponseCode>/) || [])[1] || String(r.statut || '');
      resultat.erreur = `Lecture des réponses impossible${code ? ' (' + code + ')' : ''}.`;
      return resultat;
    }
    const emails = parseFindReponses(r.corps);
    resultat.lus = emails.length;
    // Réponses « en une seule fois » : leur texte est lu (un seul GetItem pour toutes), pour y
    // trouver les créneaux cochés d'un X. Le texte n'est ni gardé ni journalisé.
    const aLire = reponsesListeALire(sondages, emails);
    if (aLire.length) {
      const g = await posterEws({ url: reglages.url, email: reglages.email, motDePasse: reglages.motDePasse, body: corpsLireTextesReponses(aLire.map((e) => e.itemId)) }, injections);
      if (!g.echec && (g.statut === 401 || g.statut === 403)) {
        agendaWatch.signalerIdentifiantsRefuses(reglages);
        resultat.erreur = 'Identifiants de messagerie refusés : vérifiez les Réglages.';
        return resultat;
      }
      const textes = g.echec ? new Map() : parseTextesReponses(g.corps);
      for (const e of aLire) {
        const s = sondages.find((x) => x.statut === 'ouvert' && jetonsDansObjet(e.sujet).some((j) => j.liste && j.code === x.code));
        if (s && textes.has(e.itemId)) e.choixListe = choixDepuisTexteListe(textes.get(e.itemId), s.creneaux.map((c) => c.n));
      }
    }
    resultat.nouvelles = appliquerReponses(sondages, emails).nouvelles;
  }

  const aujourdHui = dateDuJourParis();
  for (const s of sondagesExpires(sondages, aujourdHui)) {
    const { refus } = await clore(s, 'expire', reglages, parametresRepo, injections);
    resultat.expires.push(s.id);
    if (refus) { agendaWatch.signalerIdentifiantsRefuses(reglages); break; }
  }
  for (const s of sondages.filter((x) => x.statut !== 'ouvert' && (x.optionsARetirer || []).length)) {
    const { restantes, refus } = await retirerOptions(s.optionsARetirer, reglages, injections);
    s.optionsARetirer = restantes;
    if (refus) { agendaWatch.signalerIdentifiantsRefuses(reglages); break; }
  }
  parametresRepo.ecrireSondagesCreneaux(sondages);
  resultat.ok = true;
  return resultat;
}

// Toutes les 5 minutes, seulement s'il y a un sondage ouvert (ou une option à retirer).
const INTERVALLE_SONDAGES_MS = 5 * 60 * 1000;

function demarrerSurveillanceSondages(parametresRepo, injections, intervalleMs) {
  let enCours = false;
  const tour = async () => {
    if (enCours) return;
    enCours = true;
    try {
      const r = await executerTourSondages(parametresRepo, injections);
      if (r.erreur && !/n’est pas configurée|suspendue/.test(r.erreur)) console.warn('[CLAIRE] Sondages de créneaux :', r.erreur);
    } catch (e) {
      console.warn('[CLAIRE] Sondages de créneaux interrompus :', e.message);
    } finally {
      enCours = false;
    }
  };
  return setInterval(tour, intervalleMs || INTERVALLE_SONDAGES_MS);
}

module.exports = {
  CLE_SONDAGES, MAX_CRENEAUX, MAX_PARTICIPANTS, JOURS_OUVRES_OPTION, ROLES_PARTICIPANT,
  codeSondage, jetonReponse, jetonsDansObjet, joursOuvresApres, adresseValide, attribuerCles,
  choixDepuisTexteListe, parseFindReponses, corpsLireTextesReponses, parseTextesReponses, reponsesListeALire,
  assainirSondage, assainirSondages, appliquerReponses, syntheseSondage, sondagesExpires,
  corpsFindReponsesSondages, executerTourSondages, demarrerSurveillanceSondages, clore, retirerOptions,
  dateDuJourParis, connexionPrete
};
