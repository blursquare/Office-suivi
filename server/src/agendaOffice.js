'use strict';

// Lecture de l'agenda de l'office : détecte automatiquement, dans les rendez-vous que l'étude note
// elle-même, qu'un appel de fonds vient de partir ou qu'un projet d'acte vient d'être envoyé au
// client — pour renseigner d.appelFonds/d.projetEnvoye sans ressaisie — ainsi que les rendez-vous de
// signature et les absences des collaborateurs (voir agendaWatch.js pour le tour périodique et
// l'écriture sur les dossiers).
//
// Source (29/09) : le calendrier partagé de Sophie, lu par EWS (exchange/ews.js,
// lireCalendrierExchange) — le même agenda que le flux .ics publié qu'on lisait avant, sans lien de
// publication à entretenir. Les fonctions de ce fichier sont PURES et ne connaissent qu'un modèle
// d'événement neutre (voir evenementDepuisEws) : aucun appel réseau ici.
//
// Convention réelle donnée par l'étude, à ne pas généraliser au-delà de ce qu'elle a décrit :
//   - chaque rendez-vous de vente porte « VTE - NOM DU DOSSIER » (ou « VENTE - NOM DU DOSSIER »)
//     dans son titre — ce nom ne reprend
//     pas forcément TOUS les noms de famille du dossier CLAIRE ;
//   - le déclencheur est noté dans le LIEU du rendez-vous : les initiales du collaborateur suivies
//     de « Appel de fonds envoyé » ou de « Appel de fonds et projet envoyé » — le titre est lu aussi,
//     en repli ;
//   - seuls les rendez-vous À VENIR (à partir du jour de la lecture) sont pris en compte ;
//   - trois couleurs Outlook (catégories) distinguent le LIEU du rendez-vous (vert = office,
//     violet = visio, orange = confrère).
//
// Rapprochement au dossier CLAIRE par MOTS SIGNIFICATIFS EN COMMUN (voir nas.js,
// motsSignificatifs), avec TOLÉRANCE : l'agenda peut ne citer qu'une partie des noms du dossier, ou
// les écrire avec une faute. Le dossier qui partage le plus de noms avec la référence l'emporte —
// mais seulement s'il est SEUL en tête : deux dossiers ex æquo ne donnent rien plutôt qu'un choix
// arbitraire, ce job tournant sans personne pour arbitrer (une date écrite sur le mauvais dossier
// est pire qu'une date non relevée).

const { normaliserNomRapprochement, motsSignificatifs } = require('./nas');

// Date (AAAA-MM-JJ) et heure (HH:MM) à Paris d'un instant ISO renvoyé par Exchange (en UTC,
// « 2026-10-02T12:00:00Z »). Indépendant du fuseau du serveur.
function momentParisDepuisIso(iso) {
  const d = new Date(String(iso || ''));
  if (isNaN(d.getTime())) return null;
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).formatToParts(d).reduce((acc, x) => { acc[x.type] = x.value; return acc; }, {});
  return { date: `${p.year}-${p.month}-${p.day}`, heure: `${p.hour}:${p.minute}` };
}

// « JJ/MM/AAAA » pour les libellés d'historique écrits par le serveur (agendaWatch, echeancesAgenda).
function formatDateFr(iso) {
  const [a, m, j] = String(iso).split('-');
  return a && m && j ? `${j}/${m}/${a}` : String(iso);
}

// Le jour civil précédent (AAAA-MM-JJ), en UTC pour ne pas dépendre du fuseau du serveur : la fin
// d'un événement « toute la journée » est EXCLUSIVE (minuit du lendemain du dernier jour réel).
function veilleDe(iso) {
  const d = new Date(String(iso) + 'T00:00:00Z');
  if (isNaN(d.getTime())) return iso;
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Un rendez-vous tel que rendu par parseCalendrierEws → le modèle lu par les détections :
//   { sujet, lieu, date, heure, dateFin, heureFin, journeeEntiere, annule, categories }
// Journée entière : Exchange renvoie minuit (heure de Paris) exprimé en UTC, la fin étant minuit du
// lendemain du dernier jour — `dateFin` est ramené au dernier jour réel, et `heure` reste null.
// Un rendez-vous sans début lisible rend null.
function evenementDepuisEws(e) {
  const x = e || {};
  const debut = momentParisDepuisIso(x.start);
  if (!debut) return null;
  const fin = momentParisDepuisIso(x.end);
  const journeeEntiere = x.allDay === true;
  let dateFin = fin ? fin.date : debut.date;
  if (journeeEntiere && fin) dateFin = veilleDe(fin.date);
  if (dateFin < debut.date) dateFin = debut.date;
  return {
    itemId: String(x.itemId || ''),
    changeKey: String(x.changeKey || ''),
    sujet: String(x.subject || ''),
    lieu: String(x.location || ''),
    date: debut.date,
    heure: journeeEntiere ? null : debut.heure,
    dateFin,
    heureFin: journeeEntiere || !fin ? null : fin.heure,
    journeeEntiere,
    annule: x.cancelled === true,
    categories: Array.isArray(x.categories) ? x.categories.filter((c) => typeof c === 'string' && c.trim()) : []
  };
}

function evenementsDepuisEws(liste) {
  return (liste || []).map(evenementDepuisEws).filter(Boolean);
}

// « VTE » comme mot entier, suivi d'un séparateur optionnel (tiret cadratin/simple, deux-points),
// puis tout le reste de la ligne — jamais coupé avant un mot-clé d'action (« Appel de fonds »
// peut suivre juste après, sur la même ligne) : la comparaison par mots significatifs qui suit
// tolère très bien ces mots en trop.
const RE_REFERENCE_VTE = /\bVTE\b\s*[-–:]?\s*(.+)/i;
// « VENTE » en toutes lettres est accepté aussi (« VENTE MOKADEM / DE SOUSA MARTINS »), mais
// seulement EN TÊTE de ligne : tout événement porteur d'une référence est pris pour le rendez-vous
// de signature (voir `estRendezVousSignature`), et « Visite de la vente DUPONT » ou « point sur la
// vente » au fil d'une description ne doivent pas le devenir. « VTE » est un sigle de l'étude, il
// reste reconnu où qu'il soit.
const RE_REFERENCE_VENTE = /^\s*VENTE\b\s*[-–:]?\s*(.+)/im;
// « VENTE - … » (demandé par l'étude, 29/09) : reconnu aussi AU MILIEU du titre (« RDV VENTE -
// DUPONT », « Signature VENTE - DUPONT ») — mais seulement écrit en CAPITALES et suivi d'un tiret
// ou de deux-points, la forme d'une référence : « Visite de la vente - point » en minuscules, ou
// « VENTE » sans tiret au fil du texte, ne le deviennent pas. Jamais à l'intérieur d'un mot
// (« PREVENTE - … »).
const RE_REFERENCE_VENTE_TIRET = /(?<![A-Za-zÀ-ɏ])VENTE\s*[-–:]\s*(.+)/;

function extraireReferenceVte(texte) {
  const source = String(texte || '');
  const m = RE_REFERENCE_VTE.exec(source) || RE_REFERENCE_VENTE.exec(source) || RE_REFERENCE_VENTE_TIRET.exec(source);
  return m ? m[1].trim() : '';
}

// Cherchée dans le titre du rendez-vous, support de la référence décrit par l'étude.
function referenceDossierEvenement(evenement) {
  return extraireReferenceVte(evenement.sujet);
}

// Le déclencheur donné par l'étude est un ENVOI FAIT : « Appel de fonds envoyé », « Appel de fonds
// et projet envoyé ». Exiger le participe « envoyé » (et pas seulement les mots « appel de fonds »)
// évite de relever une note de préparation (« appel de fonds à faire », « projet à envoyer ») comme
// un envoi déjà parti. `ENVOYE` refuse « envoyer »/« envoyez » (un infinitif n'est pas un envoi) ;
// une négation juste avant (« pas envoyé », « non envoyé ») annule le déclencheur.
const ENVOYE = String.raw`envoy[ée]e?s?(?![A-Za-zÀ-ÿ])`;
const RE_APPEL_ENVOYE = new RegExp(String.raw`appel\s+de\s+fonds[\s\S]{0,40}?` + ENVOYE, 'i');
const RE_ENVOI_APPEL = /\benvoi\s+(?:de\s+l['’]\s*|d['’]\s*|de\s+)?appel\s+de\s+fonds/i;
// « AF » en abréviation n'est accepté qu'EN MAJUSCULES : en minuscules, « af » n'est pas un mot
// français et se prêterait à des faux positifs, alors qu'en capitales c'est une convention de bureau.
const RE_AF_ENVOYE = new RegExp(String.raw`\bAF\b[\s\S]{0,40}?` + ENVOYE.replace('[ée]', '[ÉEée]'));
const RE_NEGATION_ENVOI = /\b(?:non|pas|jamais)\s+(?:encore\s+)?$/i;

// Un match n'est retenu que si le participe n'est pas nié juste avant (« AF pas envoyé »).
function matchNonNie(re, texte) {
  const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let m;
  while ((m = global.exec(texte)) !== null) {
    const idxEnvoi = m[0].search(/envo[iy]/i);
    const avant = texte.slice(Math.max(0, m.index + idxEnvoi - 20), m.index + idxEnvoi);
    if (!RE_NEGATION_ENVOI.test(avant)) return true;
    if (m[0].length === 0) global.lastIndex++;
  }
  return false;
}

function detecteAppelDeFonds(texte) {
  const t = String(texte || '');
  return matchNonNie(RE_APPEL_ENVOYE, t) || matchNonNie(RE_ENVOI_APPEL, t) || matchNonNie(RE_AF_ENVOYE, t);
}

// Deux ordres de mots tolérés (« projet ... envoyé » et « envoi ... projet »), fenêtre de 40
// caractères entre les deux pour couvrir « projet d'acte envoyé au client » comme « envoi du
// projet d'acte ». « Appel de fonds et projet envoyé » déclenche donc les DEUX actions.
const RE_PROJET_ENVOYE = new RegExp(String.raw`\bprojet\b[\s\S]{0,40}?` + ENVOYE, 'i');
const RE_ENVOI_PROJET = /\benvoi\b[\s\S]{0,40}?\bprojet\b/i;
function detecteProjetEnvoye(texte) {
  const t = String(texte || '');
  return matchNonNie(RE_PROJET_ENVOYE, t) || matchNonNie(RE_ENVOI_PROJET, t);
}

// Écriture dans l'agenda (voir routes/exchange.js, POST /exchange/rendez-vous/lieu) : l'INVERSE de la
// détection ci-dessus. Compose le nouveau LIEU d'un rendez-vous à partir de son lieu actuel, en
// garantissant que la mention d'envoi (« Appel de fonds envoyé », « Appel de fonds et projet
// envoyé ») y figure — SANS la dupliquer et SANS toucher au reste (les initiales du collaborateur,
// une note de visioconférence…). Une mention déjà présente (tapée à la main par l'étude, ou écrite
// par un push précédent) est d'abord retirée puis réécrite dans sa forme canonique à jour. Fonction
// pure, testable, jamais d'appel réseau.
const MENTION_APPEL_SEUL = 'Appel de fonds envoyé';
const MENTION_APPEL_PROJET = 'Appel de fonds et projet envoyé';
const MENTION_PROJET_SEUL = 'Projet envoyé';
const RE_MENTION_APPEL = new RegExp(String.raw`appel\s+de\s+fonds(?:\s+et\s+projet(?:\s+d['’]acte)?)?\s+` + ENVOYE, 'ig');
const RE_MENTION_ENVOI_APPEL = /envoi\s+(?:de\s+l['’]\s*|d['’]\s*|de\s+)?appel\s+de\s+fonds/ig;
const RE_MENTION_PROJET = new RegExp(String.raw`projet(?:\s+d['’]acte)?\s+` + ENVOYE, 'ig');

function composerLieuAgenda(lieuExistant, etat) {
  const e = etat || {};
  // Retirer toute mention d'envoi déjà présente (à la main ou d'un push précédent), pour la réécrire
  // à jour sans doublon. « appel de fonds [et projet] envoyé » d'abord (englobe la forme combinée),
  // puis un « projet envoyé » resté seul, puis « envoi de l'appel de fonds ».
  let base = String(lieuExistant || '')
    .replace(RE_MENTION_APPEL, '')
    .replace(RE_MENTION_ENVOI_APPEL, '')
    .replace(RE_MENTION_PROJET, '');
  // Nettoyer les séparateurs devenus orphelins après le retrait (doublés, ou en tête/fin, espaces
  // doubles) — les INITIALES du collaborateur et le reste du lieu (note de visio…) sont préservés.
  base = base
    .replace(/\s*[—–-]\s*[—–-]\s*/g, ' - ')
    .replace(/^[\s—–:,-]+/, '')
    .replace(/[\s—–:,-]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // Le confrère (« Me DURAND en 1er » / « en 2nd », voir confrereLieuAgenda côté client) entre les
  // initiales et la mention : ajouté s'il manque, remis à jour s'il y figure déjà sous une autre
  // forme (sans rang, ou avec l'autre rang), jamais en double.
  const confrere = typeof e.confrere === 'string' ? e.confrere.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  const mConfrere = /^Me\s+(.+?)\s+en\s+(1er|2nd)$/i.exec(confrere);
  if (mConfrere) {
    const famille = mConfrere[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const reExistant = new RegExp(String.raw`(?<![A-Za-zÀ-ÿ])(?:M(?:e|a[iî]tre)\.?\s+)?` + famille + String.raw`(?![A-Za-zÀ-ÿ])(?:\s+en\s+(?:1er|2nd|premier|second))?`, 'i');
    base = reExistant.test(base) ? base.replace(reExistant, confrere) : (base ? base + ' - ' + confrere : confrere);
  }
  const mention = (e.appelFonds && e.projet) ? MENTION_APPEL_PROJET
    : e.appelFonds ? MENTION_APPEL_SEUL
      : e.projet ? MENTION_PROJET_SEUL
        : '';
  if (!mention) return base;
  // La mention est ajoutée APRÈS le contenu existant (les initiales « AL - … »), avec le même
  // séparateur « - » que la convention de l'étude. Le code couleur du rendez-vous (catégorie
  // Outlook : vert = office, violet = visio, orange = confrère) n'est jamais touché : la mise à jour
  // ne modifie que le champ Lieu, jamais la catégorie/couleur (voir corpsUpdateLieu).
  return base ? base + ' - ' + mention : mention;
}

// Le LIEU d'abord (c'est là que l'étude note le déclencheur), puis le titre.
function detecterActionsEvenement(evenement) {
  const texte = [evenement.lieu, evenement.sujet].filter(Boolean).join(' \n ');
  return {
    appelFonds: detecteAppelDeFonds(texte),
    projetEnvoye: detecteProjetEnvoye(texte)
  };
}

// Distance d'édition (Levenshtein), bornée : sert uniquement à tolérer une faute de frappe dans
// un nom de famille noté à la main dans l'agenda (« DUPOND » pour « DUPONT »).
function distanceEdition(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let precedente = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const courante = [i];
    let minLigne = i;
    for (let j = 1; j <= b.length; j++) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1;
      courante[j] = Math.min(precedente[j] + 1, courante[j - 1] + 1, precedente[j - 1] + cout);
      if (courante[j] < minLigne) minLigne = courante[j];
    }
    if (minLigne > max) return max + 1;
    precedente = courante;
  }
  return precedente[b.length];
}

// Deux noms sont « les mêmes » s'ils sont identiques, ou — à partir de 5 lettres, première lettre
// identique — s'ils ne diffèrent que d'une lettre. Un nom court (« RAY », « DIAS ») doit être exact :
// une lettre de différence y change trop souvent de famille.
function motsVoisins(a, b) {
  if (a === b) return true;
  if (a.length < 5 || b.length < 5 || a[0] !== b[0]) return false;
  return distanceEdition(a, b, 1) <= 1;
}

// Mots qui accompagnent la référence dans un titre d'agenda sans jamais désigner une personne —
// ignorés de part et d'autre, sans quoi « VTE - DUPONT signature » ne se distinguerait plus d'un
// dossier dont un nom commencerait par l'un d'eux.
const MOTS_AGENDA_IGNORES = new Set([
  'VTE', 'RDV', 'SIGNATURE', 'ACTE', 'PROMESSE', 'COMPROMIS', 'APPEL', 'FONDS', 'PROJET', 'ENVOYE',
  'ENVOI', 'VISIO', 'OFFICE', 'CONFRERE', 'SCI', 'SARL', 'SAS', 'CONSORTS', 'SUCCESSION'
]);

function motsNomsDeFamille(texte) {
  return motsSignificatifs(texte).filter((m) => !MOTS_AGENDA_IGNORES.has(m));
}

// Score d'un dossier : nombre de ses noms retrouvés (exactement ou à une faute près) dans la
// référence. Au moins un nom en commun est exigé, et le dossier en tête l'emporte s'il y est SEUL.
// À score égal, deux cas :
//   - les deux dossiers ont été retenus sur les MÊMES noms de la référence (« VTE - DUPONT » face à
//     « DUPONT » et « DUPONT / MARTIN ») : celui dont la plus grande part des noms est citée gagne ;
//   - ils l'ont été sur des noms DIFFÉRENTS (« VTE - PETIT DUPONT » face à « DUPONT / MARTIN » et
//     « LEROY / PETIT ») : la référence désigne deux dossiers à la fois, rien n'est retenu.
function dossierPourReferenceAgenda(reference, dossiersActifs) {
  const motsRef = [...new Set(motsNomsDeFamille(reference))];
  if (motsRef.length === 0) return null;
  const candidats = [];
  for (const d of dossiersActifs || []) {
    if (!d || typeof d.nom !== 'string') continue;
    const attendus = [...new Set(motsNomsDeFamille(d.nom))];
    if (attendus.length === 0) continue;
    const communs = attendus.filter((mot) => motsRef.some((r) => motsVoisins(mot, r)));
    if (communs.length === 0) continue;
    const refTouches = motsRef.filter((r) => communs.some((mot) => motsVoisins(mot, r))).sort().join(' ');
    candidats.push({ d, communs: communs.length, part: communs.length / attendus.length, refTouches });
  }
  if (candidats.length === 0) return null;
  candidats.sort((x, y) => (y.communs - x.communs) || (y.part - x.part));
  const premier = candidats[0];
  const exAequo = candidats.slice(1).filter((c) => c.communs === premier.communs);
  if (exAequo.some((c) => c.refTouches !== premier.refTouches || c.part === premier.part)) return null;
  return premier.d;
}

// Rendez-vous de signature (demandé par l'étude, 25/09) : tout rendez-vous « VTE - … » à venir est
// le rendez-vous de signature de la vente — sa date remplit d.rendezVousSignature (voir
// agendaWatch.js). Deux exclusions :
//   - un point d'interrogation dans le titre ou le lieu (« VTE - DUPONT ? », « ?? ») : l'étude note
//     ainsi un rendez-vous pas encore confirmé — il ne doit rien écrire sur la fiche. Les adresses
//     (lien de visioconférence) sont retirées avant ce test, leur « ? » ne dit rien du rendez-vous ;
//   - un événement « toute la journée » : un rendez-vous de signature a
//     toujours une heure, une journée entière est une note (« AF à envoyer »), pas une signature.
function sansAdresses(texte) {
  return String(texte || '').replace(/\b(?:https?|webcals?):\/\/\S+/gi, ' ');
}

function estRendezVousSignature(evenement) {
  if (evenement.journeeEntiere || !evenement.heure) return false;
  return !/\?/.test(sansAdresses(evenement.sujet) + ' ' + sansAdresses(evenement.lieu));
}

// Fonction d'ensemble, pure et testable de bout en bout à partir des événements (voir
// evenementDepuisEws) et de la liste des dossiers actifs (chacun avec au moins {id, nom}) : une
// entrée par événement porteur d'une référence et d'au moins une action — un même événement peut
// porter les deux envois à la fois, et être en plus le rendez-vous de signature (`rendezVous`).
// `dossierId`/`dossierNom` restent `null` quand aucune correspondance sûre n'a été trouvée : c'est
// à l'appelant de décider quoi en faire (voir agendaWatch.js, qui les liste sans jamais rien écrire
// dans ce cas). `aujourdHui` (AAAA-MM-JJ) : seuls les rendez-vous de ce jour ou postérieurs sont
// lus, comme demandé par l'étude. Omis : aucun filtre (tests).
function actionsDetecteesDepuisEvenements(evenements, dossiersActifs, aujourdHui) {
  const resultats = [];
  for (const evt of evenements || []) {
    if (!evt || evt.annule) continue;
    const reference = referenceDossierEvenement(evt);
    if (!reference) continue;
    const dateIso = evt.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateIso || ''))) continue;
    if (aujourdHui && dateIso < aujourdHui) continue;
    const actions = detecterActionsEvenement(evt);
    const rendezVous = estRendezVousSignature(evt);
    if (!actions.appelFonds && !actions.projetEnvoye && !rendezVous) continue;
    const dossier = dossierPourReferenceAgenda(reference, dossiersActifs);
    resultats.push({
      reference,
      dateIso,
      resume: (evt.sujet || reference).slice(0, 200),
      appelFonds: actions.appelFonds,
      projetEnvoye: actions.projetEnvoye,
      rendezVous,
      heure: evt.heure || null,
      heureFin: evt.heureFin || null,
      lieu: String(evt.lieu || '').slice(0, 160),
      categories: (evt.categories || []).slice(0, 5),
      dossierId: dossier ? dossier.id : null,
      dossierNom: dossier ? dossier.nom : null
    });
  }
  return resultats;
}

// Noms distincts des catégories Outlook portées par les rendez-vous lus, pour que les Réglages
// proposent les noms exacts de la boîte (la couleur d'un rendez-vous tient à ce nom). Pure.
function categoriesDistinctes(evenements) {
  const vus = new Map();
  for (const evt of evenements || []) {
    for (const c of (evt && evt.categories) || []) {
      const cle = c.toLowerCase();
      if (!vus.has(cle)) vus.set(cle, c);
    }
  }
  return [...vus.values()].sort((a, b) => a.localeCompare(b, 'fr')).slice(0, 40);
}

// ---- Absences des collaborateurs (demandé par l'étude, 28/09) ----
// « Prendre en compte sur l'agenda si la personne est présente ou non la semaine suivante (parfois
// JV ou JS absent) ». Source choisie par l'étude : l'agenda de l'office lui-même — les absences y
// sont posées en événements « toute la journée » (congés, absent, RTT…), CLAIRE les lit sans double
// saisie. On ne devine JAMAIS à qui appartient une absence : le titre doit nommer un collaborateur
// (initiales JV/JS/BA, prénom ou nom de famille) ET porter un mot d'absence — sinon rien n'est retenu
// (un « Congés » anonyme ne dit pas de qui il s'agit ; une journée entière « Réunion équipe » n'est
// pas une absence).
//
// `collaborateur` = le nom complet, tel qu'il figure dans d.responsable côté client (comparaison
// directe, aucun mapping à tenir à jour). Premier jet, comme les autres motifs de ce fichier : à
// resserrer/élargir sur retour réel de l'étude (le vocabulaire d'absence réel de son agenda).
const COLLABORATEURS_ABSENCE = [
  { nom: 'Bastien ANGLUMENT', prenom: 'Bastien', nomFamille: 'ANGLUMENT', initiales: 'BA' },
  { nom: 'Julie VASSELIN', prenom: 'Julie', nomFamille: 'VASSELIN', initiales: 'JV' },
  { nom: 'Jérémy SAUJOT', prenom: 'Jérémy', nomFamille: 'SAUJOT', initiales: 'JS' }
];

// Testé sur le titre NORMALISÉ (majuscules, sans accent — voir normaliserNomRapprochement) : « congés »
// y devient « CONGES ». Volontairement limité aux mots qui disent clairement « pas à l'office »
// (congé, absent, absence, vacances, RTT, indisponible, repos) — pas « télétravail »/« formation »/
// « déplacement », où une signature reste possible : les inclure produirait de fausses alertes.
// Option posée par un sondage de créneaux (voir sondagesCreneaux.js) : « VTE - NOM ? — option
// CLAIRE, créneau 2/3 ».
const RE_OPTION_SONDAGE = /option CLAIRE/i;
const RE_MOT_ABSENCE = /\b(?:CONGE|CONGES|ABSENT|ABSENTE|ABSENTS|ABSENTES|ABSENCE|VACANCES|RTT|INDISPONIBLE|INDISPO|REPOS)\b/;

function estEvenementJourneeEntiere(evenement) {
  return Boolean(evenement && evenement.journeeEntiere);
}

function motsNormalises(texte) {
  return new Set(normaliserNomRapprochement(texte).split(' ').filter(Boolean));
}

// Les collaborateurs nommés dans un titre : initiales (BA/JV/JS), prénom ou nom de famille, tous
// comparés comme des MOTS ENTIERS d'un texte normalisé — « Congés Julie », « JV absente », « Absence
// VASSELIN » se rattachent tous à Julie VASSELIN. Plusieurs peuvent être nommés dans le même
// événement (rare, mais possible).
function collaborateursDansTexte(texte) {
  const mots = motsNormalises(texte);
  return COLLABORATEURS_ABSENCE.filter((c) =>
    mots.has(c.initiales)
    || mots.has(normaliserNomRapprochement(c.prenom))
    || mots.has(normaliserNomRapprochement(c.nomFamille)));
}

// Pure et testable : les périodes d'absence lues dans l'agenda. Une entrée par (événement,
// collaborateur nommé). `aujourdHui` (AAAA-MM-JJ) : une absence entièrement passée est écartée (elle
// n'intéresse plus l'agenda, tourné vers la semaine en cours et les suivantes). Omis : aucun filtre
// de date (tests).
function absencesDepuisEvenements(evenements, aujourdHui) {
  const absences = [];
  for (const evt of evenements || []) {
    if (!evt || evt.annule) continue;
    if (!estEvenementJourneeEntiere(evt)) continue;
    const titre = String(evt.sujet || '');
    if (!RE_MOT_ABSENCE.test(normaliserNomRapprochement(titre))) continue;
    const debut = evt.date;
    if (!debut) continue;
    let fin = evt.dateFin || debut;
    if (fin < debut) fin = debut;
    if (aujourdHui && fin < aujourdHui) continue;
    const collaborateurs = collaborateursDansTexte(titre);
    if (collaborateurs.length === 0) continue;
    for (const c of collaborateurs) {
      absences.push({ collaborateur: c.nom, initiales: c.initiales, debut, fin, resume: titre.slice(0, 120) });
    }
  }
  return absences;
}

// ---- Agenda du jour (fenêtre du matin, demandé par l'étude le 30/09) ----
// « Insérer tous les rendez-vous de l'agenda du jour » : chaque tour de lecture garde les événements
// du jour (Paris) du calendrier lu — titre, lieu, horaire, catégories, tels qu'ils figurent dans
// l'agenda —, avec le dossier reconnu par la même référence « VTE … » que les détections. Pure,
// testable. Un événement annulé est écarté ; un événement de plusieurs jours qui couvre le jour y
// figure en journée entière (son horaire de début ou de fin n'est pas celui du jour).
const MAX_AGENDA_JOUR = 60;
function agendaDuJourDepuisEvenements(evenements, jour, dossiersActifs) {
  const liste = [];
  for (const evt of evenements || []) {
    if (!evt || evt.annule || !evt.date) continue;
    const fin = evt.dateFin || evt.date;
    if (evt.date > jour || fin < jour) continue;
    const journeeEntiere = !!evt.journeeEntiere || !evt.heure || evt.date < jour || fin > jour;
    const reference = referenceDossierEvenement(evt);
    const dossier = reference ? dossierPourReferenceAgenda(reference, dossiersActifs) : null;
    const titre = String(evt.sujet || '');
    liste.push({
      sujet: titre.slice(0, 200),
      lieu: String(evt.lieu || '').slice(0, 160),
      heure: journeeEntiere ? null : evt.heure,
      heureFin: journeeEntiere ? null : (evt.heureFin || null),
      journeeEntiere,
      categories: (evt.categories || []).slice(0, 5),
      signature: !!reference && estRendezVousSignature(evt),
      absence: !!evt.journeeEntiere && RE_MOT_ABSENCE.test(normaliserNomRapprochement(titre)),
      option: RE_OPTION_SONDAGE.test(titre),
      dossierId: dossier ? dossier.id : null,
      dossierNom: dossier ? dossier.nom : null
    });
  }
  liste.sort((a, b) => (a.journeeEntiere === b.journeeEntiere ? 0 : a.journeeEntiere ? -1 : 1)
    || String(a.heure || '').localeCompare(String(b.heure || ''))
    || String(a.heureFin || '').localeCompare(String(b.heureFin || '')));
  return liste.slice(0, MAX_AGENDA_JOUR);
}

// ---- Agenda complet (page Agenda, demandé par l'étude le 30/09) ----
// Le lundi de la semaine précédant celle de `jour` (AAAA-MM-JJ) : début de la fenêtre lue, pour que
// la page Agenda montre la semaine en cours depuis son lundi, et la précédente. Pure, en UTC.
function lundiSemainePrecedente(jour) {
  const d = new Date(String(jour) + 'T00:00:00Z');
  if (isNaN(d.getTime())) return jour;
  const decalage = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - decalage - 7);
  return d.toISOString().slice(0, 10);
}

// Tous les rendez-vous lus (annulés exceptés), sous la forme gardée en base et montrée par la page
// Agenda : l'identifiant Exchange (pour la suppression), le titre, le lieu, les dates et heures, les
// catégories, et le dossier reconnu par la référence « VTE … ». Triés par date puis heure. Pure.
const MAX_AGENDA_OFFICE = 3000;
function evenementsAgendaOffice(evenements, dossiersActifs) {
  const liste = [];
  for (const evt of evenements || []) {
    if (!evt || evt.annule || !evt.date) continue;
    const reference = referenceDossierEvenement(evt);
    const dossier = reference ? dossierPourReferenceAgenda(reference, dossiersActifs) : null;
    const titre = String(evt.sujet || '');
    const journeeEntiere = !!evt.journeeEntiere || !evt.heure;
    liste.push({
      itemId: evt.itemId || '',
      changeKey: evt.changeKey || '',
      sujet: titre.slice(0, 200),
      lieu: String(evt.lieu || '').slice(0, 160),
      date: evt.date,
      dateFin: evt.dateFin || evt.date,
      heure: journeeEntiere ? null : evt.heure,
      heureFin: journeeEntiere ? null : (evt.heureFin || null),
      journeeEntiere,
      categories: (evt.categories || []).slice(0, 5),
      signature: !!reference && estRendezVousSignature(evt),
      absence: !!evt.journeeEntiere && RE_MOT_ABSENCE.test(normaliserNomRapprochement(titre)),
      option: RE_OPTION_SONDAGE.test(titre),
      dossierId: dossier ? dossier.id : null,
      dossierNom: dossier ? dossier.nom : null
    });
  }
  liste.sort((a, b) => a.date.localeCompare(b.date)
    || (a.journeeEntiere === b.journeeEntiere ? 0 : a.journeeEntiere ? -1 : 1)
    || String(a.heure || '').localeCompare(String(b.heure || '')));
  return liste.slice(0, MAX_AGENDA_OFFICE);
}

module.exports = {
  momentParisDepuisIso, veilleDe, formatDateFr, evenementDepuisEws, evenementsDepuisEws,
  extraireReferenceVte, referenceDossierEvenement, detecteAppelDeFonds, detecteProjetEnvoye,
  detecterActionsEvenement, dossierPourReferenceAgenda, actionsDetecteesDepuisEvenements, motsVoisins,
  estRendezVousSignature, composerLieuAgenda,
  absencesDepuisEvenements, estEvenementJourneeEntiere, collaborateursDansTexte, COLLABORATEURS_ABSENCE,
  categoriesDistinctes, agendaDuJourDepuisEvenements, lundiSemainePrecedente, evenementsAgendaOffice
};
