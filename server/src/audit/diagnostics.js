'use strict';

// Durées de validité des diagnostics immobiliers — §4 du cahier des charges d'Outil 2 (Audit des
// actes) : « ne jamais inventer une durée de validité ». Cette table est LA seule source pour ce
// calcul — le modèle Ollama (voir prompts.js, passe "diagnostics") n'a plus qu'à identifier chaque
// diagnostic (nature, date d'établissement, bien concerné) avec sa citation ; le calcul
// d'expiration lui-même est fait ici, en JS pur, jamais redemandé au modèle — même principe déjà
// appliqué au calcul des délais de l'extraction Outil 1 (voir script.js, ajouterMois/
// calculerDateEcheance : dupliqué ici côté serveur en l'absence de module partagé navigateur/Node,
// même choix déjà fait pour buildEvent/icsDate dans server/src/routes/calendrier.js).
//
// Reprend et complète les durées déjà en dur dans l'ancien prompt de "Analyse approfondie" (DPE
// 10 ans, ERP 6 mois, termites 6 mois, électricité/gaz 3 ans). Premier jet, comme PIECES_URBANISME/
// PIECES_AUTRES en leur temps côté client (voir CLAUDE.md) : les durées "simples" (mois fixes) sont
// fiables ; celles qui dépendent d'un résultat ou d'une décision locale (plomb, assainissement,
// amiante) sont volontairement laissées à "vérifier manuellement" plutôt que de deviner une règle
// non tranchée ici.

var DUREES_VALIDITE_DIAGNOSTIC = {
  DPE: { label: 'Diagnostic de performance énergétique (DPE)', dureeMois: 120 },
  ERP: { label: 'État des risques et pollutions (ERP)', dureeMois: 6 },
  TERMITES: { label: 'État relatif à la présence de termites', dureeMois: 6 },
  ELECTRICITE: { label: "État de l'installation intérieure d'électricité", dureeMois: 36 },
  GAZ: { label: "État de l'installation intérieure de gaz", dureeMois: 36 },
  AMIANTE: {
    label: "Constat de repérage d'amiante (avant-vente)", dureeMois: null,
    note: 'Durée illimitée si le résultat est négatif — dépend du résultat, non déductible automatiquement ici : à vérifier manuellement.'
  },
  PLOMB: {
    label: "Constat de risque d'exposition au plomb (CREP)", dureeMois: null,
    note: 'Durée illimitée en l’absence de plomb, 1 an si présence détectée — dépend du résultat, non déductible automatiquement ici : à vérifier manuellement.'
  },
  ASSAINISSEMENT: {
    label: "Diagnostic d'assainissement non collectif", dureeMois: null,
    note: 'Durée fixée par chaque service public d’assainissement non collectif (SPANC), variable d’une commune à l’autre — à vérifier manuellement.'
  },
  MESURAGE: {
    label: 'Mesurage (loi Carrez)', dureeMois: null,
    note: 'Illimitée sauf travaux modifiant la surface depuis son établissement — à vérifier si des travaux sont mentionnés par ailleurs dans le dossier.'
  }
};

// Addition de mois calée sur le quantième, bornée au dernier jour du mois d'arrivée (28/29 février
// notamment) — même règle que ajouterMois() côté client (script.js).
function ajouterMoisIso(iso, mois) {
  const d = new Date(String(iso) + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return null;
  const jourVoulu = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + mois, 1);
  const dernierJourDuMois = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(jourVoulu, dernierJourDuMois));
  return d.toISOString().slice(0, 10);
}

// nature = une clé de DUREES_VALIDITE_DIAGNOSTIC (ou une clé absente/inconnue — le résultat le dit
// explicitement plutôt que de deviner une durée). dateEtablissement/dateReference sont des chaînes
// AAAA-MM-JJ ; dateReference par défaut = aujourd'hui (date de l'audit). Sans dateEtablissement
// connue, aucun calcul n'est possible — retourne un statut dédié plutôt que d'inventer une date
// d'expiration.
function calculerValiditeDiagnostic(nature, dateEtablissement, dateReference) {
  const entree = DUREES_VALIDITE_DIAGNOSTIC[nature];
  if (!entree) {
    return {
      statut: 'NATURE_INCONNUE', label: null, dateExpiration: null, valide: null,
      message: 'Type de diagnostic non reconnu par la table de validité — durée non déterminée automatiquement, à vérifier.'
    };
  }
  if (!dateEtablissement) {
    return {
      statut: 'DATE_MANQUANTE', label: entree.label, dateExpiration: null, valide: null,
      message: `Date d'établissement du diagnostic (${entree.label}) non identifiée — impossible de calculer sa validité.`
    };
  }
  if (entree.dureeMois == null) {
    return {
      statut: 'NON_CALCULABLE', label: entree.label, dateExpiration: null, valide: null,
      message: entree.note || 'Durée de validité non déterminable automatiquement pour ce diagnostic — à vérifier manuellement.'
    };
  }
  const dateExpiration = ajouterMoisIso(dateEtablissement, entree.dureeMois);
  if (!dateExpiration) {
    return {
      statut: 'DATE_INVALIDE', label: entree.label, dateExpiration: null, valide: null,
      message: `Date d'établissement du diagnostic (${entree.label}) illisible — impossible de calculer sa validité.`
    };
  }
  const reference = dateReference || new Date().toISOString().slice(0, 10);
  const valide = dateExpiration >= reference;
  return {
    statut: valide ? 'VALIDE' : 'EXPIRE', label: entree.label, dateExpiration, valide,
    message: valide
      ? `${entree.label} valable jusqu'au ${dateExpiration}.`
      : `${entree.label} expiré depuis le ${dateExpiration} — un diagnostic à jour doit être produit.`
  };
}

module.exports = { DUREES_VALIDITE_DIAGNOSTIC, calculerValiditeDiagnostic };
