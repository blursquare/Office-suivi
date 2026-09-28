'use strict';

// Lecture de l'agenda de l'office (flux .ics) : détecte automatiquement, dans les rendez-vous que
// l'étude note elle-même, qu'un appel de fonds vient de partir ou qu'un projet d'acte vient d'être
// envoyé au client — pour renseigner d.appelFonds/d.projetEnvoye sans ressaisie (voir agendaWatch.js
// pour le tour périodique et l'écriture sur les dossiers). Demandé par l'étude, qui utilise déjà ce
// même flux dans un autre artefact (« brief du matin ») — rien de nouveau à créer côté agenda.
//
// Convention réelle donnée par l'étude, à ne pas généraliser au-delà de ce qu'elle a décrit :
//   - chaque rendez-vous de vente porte « VTE - NOM DU DOSSIER » dans son titre (ou sa
//     description) — ce nom ne reprend pas forcément TOUS les noms de famille du dossier CLAIRE ;
//   - le déclencheur est le plus souvent noté dans le LIEU du rendez-vous (propriété LOCATION) :
//     les initiales du collaborateur suivies de « Appel de fonds envoyé » ou de « Appel de fonds et
//     projet envoyé » — le titre et la description sont lus aussi, en repli ;
//   - seuls les rendez-vous À VENIR (à partir du jour de la lecture) sont pris en compte ;
//   - trois couleurs Outlook distinguent le LIEU du rendez-vous (vert = office, violet = visio,
//     orange = confrère) — sans rapport avec cette détection, jamais lues ici.
//
// Un lien .ics PUBLIC (Outlook > Publier ce calendrier), sans authentification, confirmé par
// l'étude — exactement ce que son propre artefact « brief du matin » lit déjà. Aucun accès
// Microsoft Graph n'est nécessaire (déjà écarté une fois pour les relances email/calendrier, voir
// CLAUDE.md) : un simple GET HTTP suffit.
//
// Rapprochement au dossier CLAIRE par MOTS SIGNIFICATIFS EN COMMUN (voir nas.js,
// motsSignificatifs), avec TOLÉRANCE : l'agenda peut ne citer qu'une partie des noms du dossier, ou
// les écrire avec une faute. Le dossier qui partage le plus de noms avec la référence l'emporte —
// mais seulement s'il est SEUL en tête : deux dossiers ex æquo ne donnent rien plutôt qu'un choix
// arbitraire, ce job tournant sans personne pour arbitrer (une date écrite sur le mauvais dossier
// est pire qu'une date non relevée).

const { normaliserNomRapprochement, motsSignificatifs } = require('./nas');

// RFC 5545 §3.1 : une ligne longue est repliée (« folded ») sur plusieurs lignes, chaque ligne de
// continuation commençant par une unique espace ou tabulation. Sans ce dépliage, un SUMMARY/
// DESCRIPTION un peu long arriverait tronqué au milieu d'un mot — potentiellement en plein milieu
// de la référence VTE ou du mot-clé cherché.
function deplierLignesIcs(texte) {
  const brut = String(texte || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lignesBrutes = brut.split('\n');
  const lignes = [];
  for (const ligne of lignesBrutes) {
    if ((ligne.startsWith(' ') || ligne.startsWith('\t')) && lignes.length > 0) {
      lignes[lignes.length - 1] += ligne.slice(1);
    } else {
      lignes.push(ligne);
    }
  }
  return lignes;
}

// Antislash-échappements du format iCalendar (RFC 5545 §3.3.11) : un texte réel de SUMMARY/
// DESCRIPTION peut contenir une virgule ou un point-virgule échappés, ou un retour à la ligne
// littéral encodé en « \n ».
function decoderTexteIcs(valeur) {
  return String(valeur || '')
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

// Découpe le flux en ses VEVENT, avec seulement les propriétés utiles à cette détection —
// jamais de gestion de RRULE (un événement récurrent développé sur plusieurs occurrences) : un
// appel de fonds ou un envoi de projet est par nature un événement ponctuel, pas une répétition.
// Un STATUS:CANCELLED est conservé tel quel (filtré par l'appelant) plutôt qu'ignoré ici : les deux
// usages (diagnostic affiché à l'étude, détection réelle) ont besoin de savoir qu'il existait.
function parseIcsEvenements(texte) {
  const lignes = deplierLignesIcs(texte);
  const evenements = [];
  let courant = null;
  // Un VEVENT réel embarque souvent un sous-composant VALARM (le rappel Outlook), qui porte SA
  // PROPRE propriété DESCRIPTION (« Rappel »...) — sans ce compteur, elle écraserait celle de
  // l'événement lui-même, faussant la recherche de la référence VTE/des mots-clés d'action.
  let profondeurSousComposant = 0;
  for (const ligneBrute of lignes) {
    const ligne = ligneBrute.replace(/\s+$/, '');
    const majLigne = ligne.trim().toUpperCase();
    if (majLigne === 'BEGIN:VEVENT') {
      courant = { summary: '', description: '', location: '', dtstart: '', status: '', categories: [] };
      profondeurSousComposant = 0;
      continue;
    }
    if (majLigne === 'END:VEVENT') {
      if (courant) evenements.push(courant);
      courant = null;
      continue;
    }
    if (!courant) continue;
    if (majLigne.startsWith('BEGIN:')) { profondeurSousComposant++; continue; }
    if (majLigne.startsWith('END:')) { profondeurSousComposant = Math.max(0, profondeurSousComposant - 1); continue; }
    if (profondeurSousComposant > 0) continue;
    const idx = ligne.indexOf(':');
    if (idx === -1) continue;
    // Le nom de propriété et ses paramètres (avant le premier « : ») ne contiennent jamais de
    // « : » eux-mêmes en usage normal — seule la VALEUR peut légitimement en porter d'autres
    // (une URL dans une description, par exemple), d'où le premier « : » seul comme séparateur.
    const cle = ligne.slice(0, idx).split(';')[0].trim().toUpperCase();
    const valeur = ligne.slice(idx + 1);
    if (cle === 'SUMMARY') courant.summary = decoderTexteIcs(valeur);
    else if (cle === 'DESCRIPTION') courant.description = decoderTexteIcs(valeur);
    else if (cle === 'LOCATION') courant.location = decoderTexteIcs(valeur);
    else if (cle === 'DTSTART') courant.dtstart = valeur.trim();
    else if (cle === 'DTEND') courant.dtend = valeur.trim();
    else if (cle === 'STATUS') courant.status = valeur.trim().toUpperCase();
    // CATEGORIES : liste séparée par des virgules (une virgule échappée « \, » appartient au nom).
    // C'est la catégorie Outlook qui donne sa couleur à l'événement.
    else if (cle === 'CATEGORIES') {
      for (const nom of valeur.split(/(?<!\\),/)) {
        const t = decoderTexteIcs(nom).trim();
        if (t) courant.categories.push(t);
      }
    }
  }
  return evenements;
}

// Une date AAAA-MM-JJ à partir de la forme « toute la journée » (20260930) comme de la forme
// horodatée (20260930T140000Z ou ...T140000, sans zone) : les huit premiers chiffres suffisent
// dans les deux cas, le modèle de dossier ne connaissant que des dates sans heure.
function dateDepuisDtstart(dtstart) {
  if (typeof dtstart !== 'string') return null;
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(dtstart.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// L'heure « HH:MM » d'un DTSTART/DTEND horodaté, à l'heure de Paris — null pour un événement
// « toute la journée » (date seule). La forme en UTC (suffixe Z) est convertie ; la forme sans
// zone, ou avec TZID (le paramètre est déjà retiré par parseIcsEvenements), est l'heure locale du
// calendrier telle qu'écrite — Exchange publie dans la zone de l'agenda de l'office.
function heureDepuisDtstart(dtstart) {
  if (typeof dtstart !== 'string') return null;
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?/.exec(dtstart.trim());
  if (!m) return null;
  if (!m[7]) return `${m[4]}:${m[5]}`;
  const instant = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
  const parties = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(instant);
  const h = (parties.find(p => p.type === 'hour') || {}).value;
  const mn = (parties.find(p => p.type === 'minute') || {}).value;
  return h && mn ? `${h}:${mn}` : null;
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

function extraireReferenceVte(texte) {
  const source = String(texte || '');
  const m = RE_REFERENCE_VTE.exec(source) || RE_REFERENCE_VENTE.exec(source);
  return m ? m[1].trim() : '';
}

// Cherchée dans le résumé D'ABORD, la description ensuite — l'étude a décrit le titre comme
// support de la référence, la description reste un repli si elle l'a mise là à la place.
function referenceDossierEvenement(evenement) {
  return extraireReferenceVte(evenement.summary) || extraireReferenceVte(evenement.description);
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

// Le LIEU d'abord (c'est là que l'étude note le déclencheur), puis le titre et la description.
function detecterActionsEvenement(evenement) {
  const texte = [evenement.location, evenement.summary, evenement.description]
    .filter(Boolean).join(' \n ');
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
//     la description n'est pas lue pour la même raison ;
//   - un événement « toute la journée » (DTSTART sans heure) : un rendez-vous de signature a
//     toujours une heure, une journée entière est une note (« AF à envoyer »), pas une signature.
function sansAdresses(texte) {
  return String(texte || '').replace(/\b(?:https?|webcals?):\/\/\S+/gi, ' ');
}

function estRendezVousSignature(evenement) {
  if (!/^\d{8}T\d{4}/.test(String(evenement.dtstart || '').trim())) return false;
  return !/\?/.test(sansAdresses(evenement.summary) + ' ' + sansAdresses(evenement.location));
}

// Fonction d'ensemble, pure et testable de bout en bout à partir d'un texte .ics et de la liste
// des dossiers actifs (chacun avec au moins {id, nom}) : une entrée par (événement, action)
// détectée — un même événement peut porter les deux actions à la fois, et être en plus le
// rendez-vous de signature (`rendezVous`). `dossierId`/`dossierNom`
// restent `null` quand aucune correspondance sûre n'a été trouvée : c'est à l'appelant de décider
// quoi en faire (voir agendaWatch.js, qui les liste sans jamais rien écrire dans ce cas).
// `aujourdHui` (AAAA-MM-JJ) : seuls les rendez-vous de ce jour ou postérieurs sont lus, comme
// demandé par l'étude — un rendez-vous passé ne déclenche plus rien. Omis : aucun filtre (tests).
function actionsDetecteesDepuisIcs(icsTexte, dossiersActifs, aujourdHui) {
  const evenements = parseIcsEvenements(icsTexte);
  const resultats = [];
  for (const evt of evenements) {
    if (evt.status === 'CANCELLED') continue;
    const reference = referenceDossierEvenement(evt);
    if (!reference) continue;
    const dateIso = dateDepuisDtstart(evt.dtstart);
    if (!dateIso) continue;
    if (aujourdHui && dateIso < aujourdHui) continue;
    const actions = detecterActionsEvenement(evt);
    const rendezVous = estRendezVousSignature(evt);
    if (!actions.appelFonds && !actions.projetEnvoye && !rendezVous) continue;
    const dossier = dossierPourReferenceAgenda(reference, dossiersActifs);
    resultats.push({
      reference,
      dateIso,
      resume: (evt.summary || reference).slice(0, 200),
      appelFonds: actions.appelFonds,
      projetEnvoye: actions.projetEnvoye,
      rendezVous,
      heure: heureDepuisDtstart(evt.dtstart),
      heureFin: heureDepuisDtstart(evt.dtend),
      lieu: String(evt.location || '').slice(0, 160),
      categories: (evt.categories || []).slice(0, 5),
      dossierId: dossier ? dossier.id : null,
      dossierNom: dossier ? dossier.nom : null
    });
  }
  return resultats;
}

// Noms distincts des catégories Outlook portées par les événements du flux, pour que les Réglages
// proposent les noms exacts de la boîte (la couleur d'un rendez-vous tient à ce nom). Pure.
function categoriesDistinctesIcs(icsTexte) {
  const vus = new Map();
  for (const evt of parseIcsEvenements(icsTexte)) {
    for (const c of evt.categories || []) {
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
const RE_MOT_ABSENCE = /\b(?:CONGE|CONGES|ABSENT|ABSENTE|ABSENTS|ABSENTES|ABSENCE|VACANCES|RTT|INDISPONIBLE|INDISPO|REPOS)\b/;

function estEvenementJourneeEntiere(evenement) {
  return /^\d{8}$/.test(String(evenement.dtstart || '').trim());
}

// Le jour civil précédent (AAAA-MM-JJ), en UTC pour ne pas dépendre du fuseau du serveur : le DTEND
// d'un événement « toute la journée » est EXCLUSIF en iCalendar (le lendemain du dernier jour réel).
function veilleDe(iso) {
  const d = new Date(String(iso) + 'T00:00:00Z');
  if (isNaN(d.getTime())) return iso;
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
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

// Pure et testable : les périodes d'absence lues dans le flux .ics. Une entrée par (événement,
// collaborateur nommé). `aujourdHui` (AAAA-MM-JJ) : une absence entièrement passée est écartée (elle
// n'intéresse plus l'agenda, tourné vers la semaine en cours et les suivantes). Omis : aucun filtre
// de date (tests).
function absencesDepuisIcs(icsTexte, aujourdHui) {
  const evenements = parseIcsEvenements(icsTexte);
  const absences = [];
  for (const evt of evenements) {
    if (evt.status === 'CANCELLED') continue;
    if (!estEvenementJourneeEntiere(evt)) continue;
    const titre = String(evt.summary || '');
    if (!RE_MOT_ABSENCE.test(normaliserNomRapprochement(titre))) continue;
    const debut = dateDepuisDtstart(evt.dtstart);
    if (!debut) continue;
    const finBrute = dateDepuisDtstart(evt.dtend);
    let fin = finBrute ? veilleDe(finBrute) : debut;
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

module.exports = {
  deplierLignesIcs, decoderTexteIcs, parseIcsEvenements, dateDepuisDtstart,
  extraireReferenceVte, referenceDossierEvenement, detecteAppelDeFonds, detecteProjetEnvoye,
  detecterActionsEvenement, dossierPourReferenceAgenda, actionsDetecteesDepuisIcs, motsVoisins,
  estRendezVousSignature, heureDepuisDtstart, composerLieuAgenda,
  absencesDepuisIcs, estEvenementJourneeEntiere, collaborateursDansTexte, COLLABORATEURS_ABSENCE,
  categoriesDistinctesIcs
};
