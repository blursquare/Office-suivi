'use strict';

// Lecture de l'agenda de l'office (flux .ics) : détecte automatiquement, dans les rendez-vous que
// l'étude note elle-même, qu'un appel de fonds vient de partir ou qu'un projet d'acte vient d'être
// envoyé au client — pour renseigner d.appelFonds/d.projetEnvoye sans ressaisie (voir agendaWatch.js
// pour le tour périodique et l'écriture sur les dossiers). Demandé par l'étude, qui utilise déjà ce
// même flux dans un autre artefact (« brief du matin ») — rien de nouveau à créer côté agenda.
//
// Convention réelle donnée par l'étude, à ne pas généraliser au-delà de ce qu'elle a décrit :
//   - chaque renvoi de vente porte « VTE - NOM DU DOSSIER » dans son titre (ou sa description) ;
//   - « appel de fonds » et/ou « projet envoyé » sont notés sur ce même événement, l'un, l'autre,
//     ou les deux ;
//   - trois couleurs Outlook distinguent le LIEU du rendez-vous (vert = office, violet = visio,
//     orange = confrère) — sans rapport avec cette détection, jamais lues ici.
//
// Un lien .ics PUBLIC (Outlook > Publier ce calendrier), sans authentification, confirmé par
// l'étude — exactement ce que son propre artefact « brief du matin » lit déjà. Aucun accès
// Microsoft Graph n'est nécessaire (déjà écarté une fois pour les relances email/calendrier, voir
// CLAUDE.md) : un simple GET HTTP suffit.
//
// Rapprochement au dossier CLAIRE par MOTS SIGNIFICATIFS EN COMMUN, comme le rapprochement NAS
// (voir nas.js, rapprochementParfait/motsSignificatifs) — même prudence : ce job tourne sans
// personne pour arbitrer une ambiguïté, se tromper de dossier remplirait une date sur le mauvais
// dossier. Une seule correspondance SANS AMBIGUÏTÉ met à jour un dossier ; sinon, rien.

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
      courant = { summary: '', description: '', dtstart: '', status: '' };
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
    else if (cle === 'DTSTART') courant.dtstart = valeur.trim();
    else if (cle === 'STATUS') courant.status = valeur.trim().toUpperCase();
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

// « VTE » comme mot entier, suivi d'un séparateur optionnel (tiret cadratin/simple, deux-points),
// puis tout le reste de la ligne — jamais coupé avant un mot-clé d'action (« Appel de fonds »
// peut suivre juste après, sur la même ligne) : la comparaison par mots significatifs qui suit
// tolère très bien ces mots en trop.
const RE_REFERENCE_VTE = /\bVTE\b\s*[-–:]?\s*(.+)/i;

function extraireReferenceVte(texte) {
  const m = RE_REFERENCE_VTE.exec(String(texte || ''));
  return m ? m[1].trim() : '';
}

// Cherchée dans le résumé D'ABORD, la description ensuite — l'étude a décrit le titre comme
// support de la référence, la description reste un repli si elle l'a mise là à la place.
function referenceDossierEvenement(evenement) {
  return extraireReferenceVte(evenement.summary) || extraireReferenceVte(evenement.description);
}

// « AF » en abréviation n'est accepté qu'EN MAJUSCULES (donc sans /i) : en minuscules, « af » n'est
// pas un mot français et se prêterait à des faux positifs sur un texte quelconque, alors qu'en
// capitales c'est une convention de bureau reconnaissable sans ambiguïté.
function detecteAppelDeFonds(texte) {
  const t = String(texte || '');
  return /appel\s+de\s+fonds/i.test(t) || /\bAF\b/.test(t);
}

// Deux ordres de mots tolérés (« projet ... envoyé » et « envoi ... projet »), fenêtre de 40
// caractères entre les deux pour couvrir « projet d'acte envoyé au client » comme « envoi du
// projet d'acte » sans dériver vers un tout autre sens de ces deux mots pris séparément.
const RE_PROJET_ENVOYE = /\bprojet\b[\s\S]{0,40}?\benvoy[ée]/i;
const RE_ENVOI_PROJET = /\benvoi\b[\s\S]{0,40}?\bprojet\b/i;
function detecteProjetEnvoye(texte) {
  const t = String(texte || '');
  return RE_PROJET_ENVOYE.test(t) || RE_ENVOI_PROJET.test(t);
}

function detecterActionsEvenement(evenement) {
  const texte = `${evenement.summary || ''} ${evenement.description || ''}`;
  return {
    appelFonds: detecteAppelDeFonds(texte),
    projetEnvoye: detecteProjetEnvoye(texte)
  };
}

// Une seule correspondance possible, jamais un choix arbitraire entre deux dossiers : TOUS les
// mots significatifs du nom du dossier CLAIRE doivent se retrouver dans la référence lue au
// calendrier, et un SEUL dossier actif doit remplir cette condition — même règle et même prudence
// que rapprochementParfait() pour le NAS, réécrite ici dans l'autre sens (une seule référence à
// tester contre plusieurs dossiers, plutôt qu'un seul dossier à tester contre plusieurs candidats).
function dossierPourReferenceAgenda(reference, dossiersActifs) {
  const motsRef = new Set(normaliserNomRapprochement(reference).split(' ').filter(Boolean));
  if (motsRef.size === 0) return null;
  const correspondants = (dossiersActifs || []).filter((d) => {
    if (!d || typeof d.nom !== 'string') return false;
    const attendus = motsSignificatifs(d.nom);
    return attendus.length > 0 && attendus.every((mot) => motsRef.has(mot));
  });
  return correspondants.length === 1 ? correspondants[0] : null;
}

// Fonction d'ensemble, pure et testable de bout en bout à partir d'un texte .ics et de la liste
// des dossiers actifs (chacun avec au moins {id, nom}) : une entrée par (événement, action)
// détectée — un même événement peut porter les deux actions à la fois. `dossierId`/`dossierNom`
// restent `null` quand aucune correspondance sûre n'a été trouvée : c'est à l'appelant de décider
// quoi en faire (voir agendaWatch.js, qui les liste sans jamais rien écrire dans ce cas).
function actionsDetecteesDepuisIcs(icsTexte, dossiersActifs) {
  const evenements = parseIcsEvenements(icsTexte);
  const resultats = [];
  for (const evt of evenements) {
    if (evt.status === 'CANCELLED') continue;
    const reference = referenceDossierEvenement(evt);
    if (!reference) continue;
    const dateIso = dateDepuisDtstart(evt.dtstart);
    if (!dateIso) continue;
    const actions = detecterActionsEvenement(evt);
    if (!actions.appelFonds && !actions.projetEnvoye) continue;
    const dossier = dossierPourReferenceAgenda(reference, dossiersActifs);
    resultats.push({
      reference,
      dateIso,
      resume: (evt.summary || reference).slice(0, 200),
      appelFonds: actions.appelFonds,
      projetEnvoye: actions.projetEnvoye,
      dossierId: dossier ? dossier.id : null,
      dossierNom: dossier ? dossier.nom : null
    });
  }
  return resultats;
}

module.exports = {
  deplierLignesIcs, decoderTexteIcs, parseIcsEvenements, dateDepuisDtstart,
  extraireReferenceVte, referenceDossierEvenement, detecteAppelDeFonds, detecteProjetEnvoye,
  detecterActionsEvenement, dossierPourReferenceAgenda, actionsDetecteesDepuisIcs
};
