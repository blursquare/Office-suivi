'use strict';

// Duplication volontaire, côté serveur, d'un SOUS-ENSEMBLE de checklistPieces() (script.js) — même
// choix déjà documenté dans ce projet pour buildEvent/icsDate (calendrier.js) et
// toutesEcheances/echeanceValidee (jobs/rappels.js) : pas de mécanisme de build partagé entre le
// navigateur et Node. Ne reprend QUE ce qu'il faut pour lister, dans un email de rappel, les pièces
// déjà reçues et celles encore manquantes d'un dossier — les libellés (cle + label), jamais les
// `motifNom` (inutiles ici : la reconnaissance par nom de fichier reste l'affaire du parcours NAS
// côté client, ce module ne fait que relire le statut déjà calculé sur `d.pieces`).
//
// En modifiant la checklist côté client (PIECES_URBANISME/PIECES_AUTRES/PIECES_COPROPRIETE/
// PIECES_TERRAIN_AUTRES/PIECES_ENGAGEMENTS_AUTO dans script.js), vérifier si cette liste doit
// suivre. Volontairement PAS de reprise de `clesChecklistDepuisDocuments()` (rétroactivité pour un
// dossier créé avant l'existence de `cleChecklist` sur DOCUMENTS_VENDEUR_CONNUS) : cas de
// compatibilité ascendante mineur, sans conséquence sur l'utilité du message pour l'immense
// majorité des dossiers, qui portent déjà `d.piecesEngagementsDetectees`.

const PIECES_URBANISME = [
  { cle: 'certificatUrbanisme', label: "Certificat d'urbanisme" },
  { cle: 'certificatAlignement', label: "Certificat d'alignement" },
  { cle: 'certificatNumerotage', label: 'Certificat de numérotage' },
  { cle: 'reponseAssainissement', label: 'Courrier réponse assainissement' },
  { cle: 'renonciationPreemption', label: 'Renonciation au droit de préemption' }
];

const PIECES_AUTRES = [
  { cle: 'diagnosticsTechniques', label: 'Diagnostics techniques' },
  { cle: 'erp', label: 'ERP (état des risques et pollution)' },
  { cle: 'avisTaxeFonciere', label: 'Avis de taxe foncière' },
  { cle: 'titrePropriete', label: 'Titre de propriété' }
];

const PIECES_COPROPRIETE = [
  { cle: 'etatDate', label: 'État daté' },
  { cle: 'article20', label: 'Article 20-II' },
  { cle: 'ribCopro', label: 'RIB de la copropriété' }
];

const PIECES_TERRAIN_AUTRES = PIECES_AUTRES.map((p) => (p.cle === 'diagnosticsTechniques'
  ? { cle: 'etudeSol', label: 'Étude de sol' }
  : p));

const PIECES_ENGAGEMENTS_AUTO = [
  { cle: 'ramonage', label: 'Ramonage (attestation ou facture)' },
  { cle: 'entretienChaudiere', label: 'Entretien de la chaudière' },
  { cle: 'entretienPac', label: 'Entretien de la pompe à chaleur (PAC)' },
  { cle: 'entretienClim', label: 'Entretien de la climatisation' },
  { cle: 'vidangeFosse', label: 'Vidange de la fosse septique' },
  { cle: 'entretienAdoucisseur', label: "Entretien de l'adoucisseur d'eau" },
  { cle: 'debroussaillage', label: 'Débroussaillage / élagage' },
  { cle: 'travauxRemiseEtat', label: 'Travaux de remise en état' },
  { cle: 'miseEnConformite', label: 'Régularisation / mise en conformité' },
  { cle: 'cuveCiterne', label: 'Enlèvement / neutralisation de cuve ou citerne' },
  { cle: 'debarras', label: 'Débarras des encombrants' },
  { cle: 'attestationConformite', label: 'Attestation de conformité' },
  { cle: 'garantieDecennale', label: 'Garantie décennale' },
  { cle: 'dommageOuvrage', label: 'Assurance dommage-ouvrage' },
  { cle: 'facturesTravaux', label: 'Factures des travaux réalisés' },
  { cle: 'etatParasitaire', label: 'État parasitaire / mérule' },
  { cle: 'auditEnergetique', label: 'Audit énergétique' },
  { cle: 'securitePiscine', label: 'Conformité sécurité piscine' },
  { cle: 'resiliationContrat', label: 'Justificatif de résiliation de contrat' }
];

function checklistPieces(typeVente, d) {
  const base = typeVente === 'copropriete'
    ? [...PIECES_URBANISME, ...PIECES_COPROPRIETE, ...PIECES_AUTRES]
    : typeVente === 'terrain'
      ? [...PIECES_URBANISME, ...PIECES_TERRAIN_AUTRES]
      : [...PIECES_URBANISME, ...PIECES_AUTRES];
  const retirees = new Set((d && d.piecesRetirees) || []);
  const standard = base.filter((p) => !retirees.has(p.cle));
  const detectees = new Set((d && d.piecesEngagementsDetectees) || []);
  const clesStandard = new Set(standard.map((p) => p.cle));
  const auto = PIECES_ENGAGEMENTS_AUTO.filter((p) => detectees.has(p.cle) && !retirees.has(p.cle) && !clesStandard.has(p.cle));
  const perso = ((d && d.piecesPersonnalisees) || []).map((p) => ({ cle: p.cle, label: p.label }));
  return [...standard, ...auto, ...perso];
}

// Pour le message de rappel : les statuts "manquante" et "pas encore vérifié" (absence de clé dans
// d.pieces, voir CLAUDE.md) sont réunis sous "manquantes" — du point de vue du responsable relancé,
// une pièce jamais vérifiée est aussi une pièce à réclamer/confirmer, pas une anomalie distincte.
// Un dossier "participant" (voir renderPiecesDossier côté client) n'affiche pas cette checklist du
// tout : le message ne la mentionne pas non plus pour ce rôle.
function piecesRecuesEtManquantes(d) {
  if (!d || d.roleNotaire === 'participant') return { recues: [], manquantes: [] };
  const liste = checklistPieces(d.typeVente || 'maison', d);
  const statuts = d.pieces || {};
  const recues = [];
  const manquantes = [];
  for (const p of liste) {
    if (statuts[p.cle] === 'recue') recues.push(p.label);
    else manquantes.push(p.label);
  }
  return { recues, manquantes };
}

module.exports = { checklistPieces, piecesRecuesEtManquantes };
