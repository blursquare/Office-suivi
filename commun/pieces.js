// @ts-check
'use strict';
// Pièces de la checklist d’un dossier de vente (reconnues par le NOM du fichier, motifNom) et checklist par type.
// Code COMMUN au poste (navigateur, <script> classique chargé avant client/) et au serveur (require) — écrit une fois,
// jamais en miroir (étude, 04/10). Dans le navigateur, les noms exportés deviennent des globaux (comme les fonctions de
// client/) ; côté Node, module.exports. Pas de syntaxe réservée à l'un des deux mondes.
/** @param {typeof import('./dossier')} C — les autres fichiers de commun/ dont celui-ci dépend */
(function (C) {
  // ---- suivi des pièces du dossier (checklist de constitution, selon le type de vente) ----
  //
  // Listes fournies par l'étude (voir CLAUDE.md, "Checklist de constitution d'un dossier") — deux
  // types de vente sur trois pour l'instant (maison, copropriété ; pas encore "terrain nu", à
  // ajouter le jour où l'étude fournit sa liste). Les motifs de reconnaissance sont un premier jet
  // à partir du seul intitulé de chaque pièce (pas encore confronté à de vrais titres de documents,
  // contrairement à OFFRE_PRET_RE qui a déjà été affiné sur des cas réels) : à resserrer ou élargir
  // dès qu'un vrai dossier fait remonter un faux positif/négatif, comme pour toute regex du fichier.
  // var (pas const) : mêmes raisons que OFFRE_PRET_RE, pour rester testable depuis les tests.
  //
  // **Toutes les pièces sont désormais détectées UNIQUEMENT par le NOM DU FICHIER (`motifNom`),
  // plus du tout par son contenu (`motif`, retiré partout dans ces trois listes).** Décision
  // explicite de l'étude, après une série de faux positifs par contenu qui n'étaient pas tous
  // réductibles à une clause précise à exclure : `certificatUrbanisme`/`certificatAlignement`/
  // `certificatNumerotage`/`renonciationPreemption`/`titrePropriete` avaient déjà perdu leur
  // `motif` un par un (voir l'historique dans CLAUDE.md — ce sont des conditions juridiques que le
  // compromis décrit systématiquement en boilerplate, que la pièce existe ou non, sans qu'aucune
  // formulation-piège ponctuelle ne puisse suivre "chaque agence a des clauses différentes, il y
  // en a des centaines"). Le même risque existant en germe pour les pièces restantes
  // (ERP/diagnostics/taxe foncière/assainissement/pièces de copropriété), l'étude a demandé de
  // généraliser tout de suite plutôt que d'attendre un signalement pièce par pièce. Bénéfice
  // secondaire, pas la motivation initiale mais réel : `verifierDossierLocal()` n'a plus besoin
  // d'ouvrir/lire un PDF (ni d'y recourir à l'OCR) pour vérifier une pièce, seul son nom est
  // consulté — un fichier n'est ouvert que si l'offre de prêt reste à chercher, ce qui réduit
  // nettement le nombre de PDF réellement lus sur un dossier local volumineux.
  // Listes de noms de fichiers données par l'étude pour les 4 premières pièces concernées (voir
  // CLAUDE.md) : ERP → "ERP", "état des risques et pollution" ; assainissement → "rapport
  // assainissement", "courrier assainissement", "SPANC", "assainissement" ; taxe foncière → "TF",
  // "taxes foncières" (parfois suivi de l'année) ; titre de propriété → "Titre", "titre de
  // propriété", "titre vendeur". Chaque motifNom tolère les fautes de frappe/variantes les plus
  // plausibles (accent absent ou mal placé, double lettre oubliée) SANS pour autant devenir assez
  // large pour qu'un mot commun avec une AUTRE pièce la valide par erreur (ex. "certificat
  // d'urbanisme" qui mentionnerait l'alignement en passant ne doit pas valider "Certificat
  // d'alignement", d'où l'exigence de la phrase complète plutôt que le mot seul). Les motifNom des
  // pièces de copropriété (`etatDate`/`article20`/`ribCopro`) et des dernières pièces basculées
  // (`diagnosticsTechniques`/`erp`/`avisTaxeFonciere`/`reponseAssainissement`) reprennent tels
  // quels les anciens motifs de contenu, faute d'exemples réels de noms de fichiers pour l'instant
  // — à resserrer/élargir dès qu'un vrai dossier en fait remonter un.
  var PIECES_URBANISME = [
    // "réponse urbanisme"/"réponse d'urbanisme" (alias courant côté étude pour ce même document)
    // ajouté au motifNom, en plus de "certificat d'urbanisme"/"CU a)".
    { cle: 'certificatUrbanisme', label: "Certificat d'urbanisme", motifNom: /certificat\s+d?[’']?\s*urbanisme|\bCU\s*a\)|r[ée]ponse\s+(?:d[’']?\s*)?urbanisme/i },
    // Deuxième alternative ajoutée : l'alignement et le numérotage sont parfois réunis dans UN SEUL
    // document, nommé "Alignement et numérotage"/"Certificat d'alignement et numérotage" ou une
    // variante proche — sans le mot "certificat" devant "alignement" dans ce cas, ce que la
    // première alternative (déjà en place) n'accepte pas seule. Ne PAS se contenter d'un "alignement"
    // nu pour autant : ça réintroduirait le faux positif déjà corrigé une fois (un certificat
    // d'urbanisme qui mentionne "réponse alignement voirie" en passant, voir le test de
    // non-régression juste en dessous) — la seconde alternative n'accepte donc "alignement" SANS
    // "certificat" devant que s'il est à proximité immédiate (20 caractères) du mot "numérotage",
    // dans un ordre ou l'autre : c'est spécifiquement le document combiné qui est visé, pas
    // n'importe quel fichier mentionnant "alignement".
    { cle: 'certificatAlignement', label: "Certificat d'alignement", motifNom: /certificat\s+d?[’']?\s*alignement|arr[êe]t[ée]s?[\s'’][^.]{0,30}?alignement|courriel\s+(?:d['’]\s*)?alignement|alignement.{0,20}num[ée]\s?rotage|num[ée]\s?rotage.{0,20}alignement/i },
    // \s? après l'accent : un fichier réel de l'étude a été nommé "...nume_rotage..." (le mot
    // "numérotage" coupé en deux à l'endroit de l'accent, très probablement une frappe accidentelle
    // d'espace dans "numé rotage" avant conversion espace→underscore) — voir CLAUDE.md.
    { cle: 'certificatNumerotage', label: 'Certificat de numérotage', motifNom: /num[ée]\s?rotage/i },
    // ass?ainissement : tolère "asainissement" (un seul "s"), faute de frappe courante.
    { cle: 'reponseAssainissement', label: 'Courrier réponse assainissement', motifNom: /ass?ainissement|\bSPANC\b/i },
    // Pas de motif de contenu (voir le commentaire structurel ci-dessus) : "préemption" seul
    // apparaît quasi systématiquement dans le corps du compromis (clause sur les conséquences
    // d'un exercice du droit de préemption), sans rapport avec une vraie renonciation obtenue.
    // "DPU" (Droit de Préemption Urbain) ajouté : nom de fichier réel de l'étude ("Renonciation au
    // DPU"), sigle assez spécifique pour être accepté seul (même principe que TF/SPANC/ERP/CU —
    // voir CLAUDE.md — pas un mot susceptible d'apparaître incidemment ailleurs dans ce contexte).
    { cle: 'renonciationPreemption', label: 'Renonciation au droit de préemption', motifNom: /pr[ée]emption|\bDPU\b/i }
  ];
  var PIECES_AUTRES = [
    { cle: 'diagnosticsTechniques', label: 'Diagnostics techniques', motifNom: /diagnostics?|\bDDT\b/i },
    // "ERP" est ambigu dans le CORPS DU TEXTE (aussi "Établissement Recevant du Public"), mais pas
    // dans un NOM DE FICHIER d'un dossier de vente d'une maison, où "ERP.pdf" désigne sans
    // ambiguïté l'état des risques et pollutions (un ERP au sens accessibilité n'a pas sa place
    // dans ce type de vente) — motifNom peut donc se permettre le sigle seul.
    { cle: 'erp', label: 'ERP (état des risques et pollution)', motifNom: /\bERP\b|[ée]tat\s+des\s+risques(?:\s+et\s+pollutions?)?/i },
    // \bTF\b avant les chiffres d'une année éventuelle ("TF 2024.pdf") : pas besoin de motif
    // spécifique, \b ne consomme aucun caractère et laisse la suite du nom de fichier de côté.
    // \s? après l'accent de "foncière" : même précaution que "numérotage" ci-dessus.
    { cle: 'avisTaxeFonciere', label: 'Avis de taxe foncière', motifNom: /\bTF\b|taxes?\s+fonci[èe]\s?re/i },
    // Pas de motif de contenu (voir le commentaire structurel plus haut) : "les titres de
    // propriété ne devront révéler aucune charge..." est une clause de condition suspensive
    // quasi systématique du compromis, sans rapport avec la production réelle des titres.
    // "titre" seul valide déjà (fichier couramment nommé juste "Titre.pdf" dans les dossiers de
    // l'étude) ; le groupe optionnel ne fait qu'accepter EN PLUS "titre de propriété"/"titre
    // vendeur" sans les exiger. \s? après chaque accent de "propriété" : même précaution que
    // "numérotage"/"foncière" ci-dessus (deux positions ici, "propri[é]" et "t[é]").
    { cle: 'titrePropriete', label: 'Titre de propriété', motifNom: /titre(?:\s+de\s+propri[ée]\s?t[ée]\s?|\s+vendeur)?/i }
  ];
  var PIECES_COPROPRIETE = [
    // Un pré-état daté n'est pas un état daté (voir RE_PRE_ETAT_DATE) : « Pré-état daté.pdf » ne
    // doit pas faire passer l'état daté « reçu » (corrigé le 30/09 avec le classeur des scans).
    { cle: 'etatDate', label: 'État daté', motifNom: /(?<!pr[ée][\s-]*)[ée]tat\s+dat[ée]/i },
    { cle: 'article20', label: 'Article 20-II', motifNom: /article\s*20[\s.-]*(?:ii|2)\b/i },
    { cle: 'ribCopro', label: 'RIB de la copropriété', motifNom: /\bRIB\b[^\n]{0,50}(?:copropri[ée]t[ée]|syndic)|(?:copropri[ée]t[ée]|syndic)[^\n]{0,50}\bRIB\b/i }
  ];
  // Pour un terrain à bâtir : mêmes pièces "autres" qu'une maison (ERP, taxe foncière, titre de
  // propriété — voir PIECES_AUTRES ci-dessus), à une exception près demandée par l'étude : pas de
  // diagnostics techniques (DPE, plomb...), qui n'ont pas de sens sur un terrain nu, remplacés par
  // une étude de sol. Dérivée de PIECES_AUTRES par substitution plutôt que recopiée à la main : les
  // trois autres pièces restent automatiquement synchronisées si elles sont un jour retouchées
  // là-bas, pas besoin d'y penser une seconde fois ici.
  var PIECES_TERRAIN_AUTRES = PIECES_AUTRES.map(p => p.cle === 'diagnosticsTechniques'
    ? { cle: 'etudeSol', label: 'Étude de sol', motifNom: /[ée]tude\s+de\s+sol|\bG1\b|\bG2\b/i }
    : p);
  // Terre agricole / terrain non bâti (étude 08/10 : « un nouveau type de vente : terrain ou terre ») : pièces d'urbanisme, ERP,
  // taxe foncière, titre — ni diagnostics techniques ni étude de sol. « Réponse SAFER » est posée d'office sur le dossier, en
  // pièce personnalisée (la même qu'Authentic et l'analyse des droits de préemption, voir ajouterPieceSaferTerre côté poste).
  var PIECES_TERRE_AUTRES = PIECES_AUTRES.filter(p => p.cle !== 'diagnosticsTechniques');

  // Pièces ajoutées automatiquement à la checklist d'UN dossier précis quand le compromis mentionne
  // le document correspondant (voir `cleChecklist` sur DOCUMENTS_VENDEUR_CONNUS). Même forme que
  // les autres pièces standard (`cle`/`label`/`motifNom`) : réutilisent sans aucun changement toute
  // la mécanique déjà en place (recherche dans le dossier local par `verifierDossierLocal()`,
  // retrait via `retirerPieceStandard()`, préremplissage à "manquante" au premier lien...) — ce ne
  // sont PAS des pièces personnalisées (`personnalisee`), qui n'ont pas de motifNom et ne sont
  // retrouvées que par sous-chaîne de leur libellé.
  // `motifNom` volontairement plus permissif que le `motif` de contenu du compromis ci-dessus : un
  // fichier réel s'appelle plus souvent "Entretien chaudière.pdf"/"Facture ramonage.pdf" que
  // "Justificatif d'entretien de la chaudière.pdf" — même principe que les autres motifNom du
  // fichier (voir normaliserNomPourMotif juste plus bas pour la normalisation appliquée avant test).
  // Étendu de 3 à toute la liste des documents connus sur demande explicite de l'étude : ces motifs
  // sont un premier jet, écrits à partir du seul intitulé de chaque pièce (comme les PIECES_* en
  // leur temps) — à resserrer/élargir dès qu'un vrai dossier fait remonter un problème. Écrits
  // assez spécifiques pour ne pas se déclencher sur le nom d'un autre document du même dossier :
  // "piscine" seul suffit (aucun autre document d'une vente ne le contient), "conformité" seul non
  // (trop courant), d'où les tournures composées.
  var PIECES_ENGAGEMENTS_AUTO = [
    { cle: 'ramonage', label: 'Ramonage (attestation ou facture)', motifNom: /ramonage/i },
    { cle: 'entretienChaudiere', label: 'Entretien de la chaudière', motifNom: /entretien.{0,20}chaudi[èe]re|chaudi[èe]re.{0,20}entretien|contrat.{0,20}chaudi[èe]re/i },
    { cle: 'entretienPac', label: 'Entretien de la pompe à chaleur (PAC)', motifNom: /entretien.{0,20}(?:pompe\s+[àa]\s+chaleur|\bpac\b)|(?:pompe\s+[àa]\s+chaleur|\bpac\b).{0,20}entretien/i },
    { cle: 'entretienClim', label: 'Entretien de la climatisation', motifNom: /climatisation|\bclim\b/i },
    { cle: 'vidangeFosse', label: 'Vidange de la fosse septique', motifNom: /fosse|vidange/i },
    { cle: 'entretienAdoucisseur', label: "Entretien de l'adoucisseur d'eau", motifNom: /adoucisseur/i },
    { cle: 'debroussaillage', label: 'Débroussaillage / élagage', motifNom: /d[ée]\s?broussaill|[ée]lagage/i },
    { cle: 'travauxRemiseEtat', label: 'Travaux de remise en état', motifNom: /remise\s*en\s*[ée]\s?tat|remise\s*en\s*etat/i },
    { cle: 'miseEnConformite', label: 'Régularisation / mise en conformité', motifNom: /mise\s*en\s*conformit[ée]|r[ée]\s?gularisation/i },
    { cle: 'cuveCiterne', label: 'Enlèvement / neutralisation de cuve ou citerne', motifNom: /citerne|cuve\s*[àa]?\s*(?:fioul|mazout|gaz)?|d[ée]\s?gazage/i },
    { cle: 'debarras', label: 'Débarras des encombrants', motifNom: /d[ée]\s?barras|encombrants/i },
    { cle: 'attestationConformite', label: 'Attestation de conformité', motifNom: /consuel|(?:attestation|certificat).{0,20}conformit[ée]/i },
    { cle: 'garantieDecennale', label: 'Garantie décennale', motifNom: /d[ée]\s?cennale/i },
    { cle: 'dommageOuvrage', label: 'Assurance dommage-ouvrage', motifNom: /dommages?[\s-]*ouvrage/i },
    { cle: 'facturesTravaux', label: 'Factures des travaux réalisés', motifNom: /factures?.{0,20}travaux|travaux.{0,20}factures?/i },
    { cle: 'etatParasitaire', label: 'État parasitaire / mérule', motifNom: /parasitaire|m[ée]\s?rule|termites?/i },
    { cle: 'auditEnergetique', label: 'Audit énergétique', motifNom: /audit\s*[ée]\s?nerg/i },
    { cle: 'securitePiscine', label: 'Conformité sécurité piscine', motifNom: /piscine/i },
    { cle: 'resiliationContrat', label: 'Justificatif de résiliation de contrat', motifNom: /r[ée]\s?siliation/i }
  ];

  // La checklist d'un dossier : pièces standard selon le type de vente (moins celles retirées), pièces d'engagement
  // détectées dans l'avant-contrat (`d.piecesEngagementsDetectees` + `clesEnPlus`, fournies par le poste depuis les
  // documents de l'analyse), pièces personnalisées. Succession : les pièces personnalisées seules.
  function checklistPiecesBase(typeVente, d, clesEnPlus) {
    const base = typeVente === 'copropriete'
      ? [...PIECES_URBANISME, ...PIECES_COPROPRIETE, ...PIECES_AUTRES]
      : typeVente === 'terrain'
        ? [...PIECES_URBANISME, ...PIECES_TERRAIN_AUTRES]
        : typeVente === 'terre'
          ? [...PIECES_URBANISME, ...PIECES_TERRE_AUTRES]
        : [...PIECES_URBANISME, ...PIECES_AUTRES];
    if (!d) return base;
    if (C.estSuccession(d)) return (d.piecesPersonnalisees || []).map(p => ({ cle: p.cle, label: p.label, personnalisee: true }));
    const retirees = new Set(d.piecesRetirees || []);
    const standard = base.filter(p => !retirees.has(p.cle));
    const detectees = new Set([...(d.piecesEngagementsDetectees || []), ...(clesEnPlus || [])]);
    // Une clé déjà présente dans la checklist standard (assainissement, diagnostics) ne doit pas
    // apparaître une seconde fois : la pièce standard, plus précise, l'emporte.
    const clesStandard = new Set(standard.map(p => p.cle));
    const auto = PIECES_ENGAGEMENTS_AUTO
      .filter(p => detectees.has(p.cle) && !retirees.has(p.cle) && !clesStandard.has(p.cle))
      .map(p => ({ ...p, autoEngagement: true }));
    const perso = (d.piecesPersonnalisees || []).map(p => ({ cle: p.cle, label: p.label, personnalisee: true }));
    return [...standard, ...auto, ...perso];
  }

  const exportes = { PIECES_URBANISME, PIECES_AUTRES, PIECES_COPROPRIETE, PIECES_TERRAIN_AUTRES, PIECES_ENGAGEMENTS_AUTO, checklistPiecesBase };
  // Node : module.exports ; navigateur : des globaux (noms nus, comme les fonctions de client/).
  if (typeof module !== 'undefined' && module.exports) module.exports = exportes; else Object.assign(globalThis, exportes);
})(
  // Les autres fichiers de commun/ dont celui-ci dépend : require côté Node, globaux déjà chargés côté navigateur.
  typeof module !== 'undefined' && module.exports ? Object.assign({}, require('./dossier')) : /** @type {any} */ (globalThis)
);
