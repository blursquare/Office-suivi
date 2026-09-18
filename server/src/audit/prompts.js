'use strict';

// Prompts d'Outil 2 (Audit des actes), un par PASSE (voir routes/auditActe.js pour l'ordre et le
// routage des documents). Cinq passes plutôt qu'une par section du cahier des charges (19 sections)
// : sur le CPU de bureau de l'étude (Core i5, pas de GPU), chaque appel Ollama coûte des dizaines de
// secondes — les sections qui partagent les mêmes documents et posent une question de même nature
// sont regroupées dans un seul appel (voir CLAUDE.md, section "Outil 2").
//
// Trois règles communes à toutes les passes (CONSIGNES_AUDIT ci-dessous), qui étendent les
// consignes déjà éprouvées pour l'extraction Outil 1 (CONSIGNES_COMMUNES) : distinguer explicitement
// ce qui est écrit de ce qui est déduit, ne jamais affirmer qu'une chose « n'existe pas » faute de
// l'avoir trouvée, et ne jamais transformer une simple absence de document en incident critique
// (§14/§16 du cahier des charges).

const { CONSIGNES_COMMUNES } = require('../extraction/prompts');

const CONSIGNES_AUDIT = `${CONSIGNES_COMMUNES}
- Distingue toujours ce qui est explicitement écrit, ce qui est raisonnablement déduit, ce qui n'a pas été retrouvé, et ce qui nécessite une vérification humaine ou juridique — ne présente jamais une déduction comme un fait écrit.
- N'affirme jamais qu'un document, une autorisation, une garantie ou un droit "n'existe pas" au seul motif que tu ne l'as pas trouvé dans les documents fournis : écris "non retrouvé dans les documents analysés" et laisse la vérification à l'humain.
- L'absence d'un document n'est pas, en elle-même, un problème CRITIQUE : réserve ce niveau à une vraie incohérence ou contradiction entre deux documents fournis.
- Chaque document t'est présenté avec son NOM exact (voir "DOCUMENT N : <nom>") : reprends ce nom exact dans "document" pour chaque source citée, jamais une appellation approximative.
- Dans "extrait", ne cite QUE des passages réellement présents dans le texte fourni, recopiés mot pour mot.`;

// Un document par bloc, avec son nom exact et un repère de troncature si son texte a dû être
// raccourci (voir server/src/routes/auditActe.js, preparerDocumentsPourPasse) — le modèle doit
// savoir qu'un document tronqué peut contenir plus que ce qu'il en voit.
function formaterDocuments(documents) {
  return documents
    .map((d, i) => `--- DOCUMENT ${i + 1} : ${d.nom}${d.tronque ? ' [TRONQUÉ ICI — la suite existe mais n\'est pas montrée]' : ''} ---\n${d.texte}`)
    .join('\n\n');
}

const FORMAT_SOURCE = '{"document": "...", "extrait": "..."}';
const FORMAT_CONSTAT_GRAVITE = '"gravite": "CRITIQUE"|"IMPORTANT"|"A_VERIFIER"|"INFORMATION"';

// Passe 1 — Identification du bien, parties, prix/conditions, dates, et titre de propriété (§3, §8
// du cahier des charges). Une seule passe : les quatre points se vérifient tous par comparaison
// entre les mêmes documents (projet, titre, et éventuellement le compromis de référence).
function construirePromptIdentification(documents, avecReference) {
  const consigneReference = avecReference
    ? `\nUn compromis ou une promesse de référence figure parmi les documents fournis (voir son nom) : compare-le explicitement au projet de vente sur les parties, le prix, la désignation du bien et les dates, et signale toute divergence entre les deux qui n'aurait pas déjà été relevée par ailleurs.`
    : '';
  return `Tu es un clerc de notaire chargé de relire un projet d'acte de vente immobilière (et ses pièces) avant signature, pour repérer toute incohérence entre les documents fournis.

Compare, ENTRE TOUS LES DOCUMENTS FOURNIS :
- L'IDENTIFICATION DU BIEN : adresse, commune, références cadastrales, superficies, dépendances — cohérence entre le projet, le titre de propriété et les autres pièces.
- LES PARTIES : identité, qualité (vendeur/acquéreur), représentation, pouvoirs — toute divergence de nom ou de rôle entre documents.
- LE PRIX ET LES CONDITIONS : prix, dépôt de garantie, modalités de paiement, financement, conditions suspensives, délais.
- LES DATES : cohérence entre les dates de signature, de rétractation, de réalisation des conditions suspensives, de signature de l'acte définitif.
- LE TITRE DE PROPRIÉTÉ : cohérence de la désignation, de l'origine de propriété et des servitudes qui y sont mentionnées avec le projet.${consigneReference}

${CONSIGNES_AUDIT}

Classe chaque constat dans EXACTEMENT une catégorie parmi "IDENTIFICATION" (bien), "PARTIES", "PRIX", "DATES", "TITRE".

${formaterDocuments(documents)}

Format exact :
{"constats": [{"categorie": "IDENTIFICATION"|"PARTIES"|"PRIX"|"DATES"|"TITRE", ${FORMAT_CONSTAT_GRAVITE}, "titre": "...", "description": "...", "action": "..." ou null, "sources": [${FORMAT_SOURCE}]}]}`;
}

// Passe 2 — Diagnostics (§4). Le modèle IDENTIFIE seulement (nature, document, date
// d'établissement, bien concerné) : le calcul de validité est fait ensuite en JS pur (voir
// server/src/audit/diagnostics.js), jamais par le modèle lui-même — « ne jamais inventer une durée
// de validité » est une règle absolue, pas une simple recommandation.
function construirePromptDiagnostics(documents, naturesConnues) {
  const natures = naturesConnues.join('", "');
  return `Tu es un clerc de notaire. Identifie chaque DIAGNOSTIC TECHNIQUE mentionné ou présent dans les documents suivants (diagnostic de performance énergétique, état des risques et pollutions, présence de termites, installation intérieure d'électricité ou de gaz, amiante, plomb, assainissement non collectif, mesurage loi Carrez, ou un autre diagnostic).

Pour chacun, donne :
- sa nature : une valeur EXACTE parmi "${natures}" (utilise "AUTRE" si aucune ne correspond) ;
- le document où il se trouve ;
- sa DATE D'ÉTABLISSEMENT telle qu'écrite dans le document, au format AAAA-MM-JJ (null si absente ou illisible) ;
- le bien concerné, si précisé.

NE CALCULE JAMAIS toi-même une durée de validité ni une date d'expiration : ce calcul est fait ailleurs, à partir de la date que tu rapportes.

${CONSIGNES_AUDIT}

${formaterDocuments(documents)}

Format exact :
{"diagnostics": [{"nature": "${natures}"|"AUTRE", "document": "...", "dateEtablissement": "AAAA-MM-JJ" ou null, "bienConcerne": "..." ou null, "extrait": "..."}]}`;
}

// Passe 3 — Travaux, marquée PRIORITAIRE par le cahier des charges (§5) : c'est le point qui a
// concrètement fait défaut à l'ancienne "Analyse approfondie" (une déclaration "aucun travaux" du
// projet contredite par une facture de toiture récente, jamais recoupée). Reçoit aussi le
// compromis de référence en mode "projet d'acte de vente" (§13, volet prose de la comparaison).
function construirePromptTravaux(documents, avecReference) {
  const consigneReference = avecReference
    ? `\nUn compromis ou une promesse de référence figure parmi les documents fournis : signale explicitement toute mention de travaux qui apparaît dans l'un des deux documents (projet de vente / compromis) sans figurer dans l'autre.`
    : '';
  return `Tu es un clerc de notaire. Cherche, dans TOUS les documents fournis, toute trace de TRAVAUX réalisés ou en cours sur le bien : toiture, charpente, murs, façade, extension, véranda, piscine, garage, dépendance, assainissement, électricité, plomberie, chauffage, ouverture ou modification de murs, modification de structure, création de surface, changement de destination, rénovation importante, travaux sur parties communes, ou tout autre travail — qu'elle figure dans une facture, une déclaration du vendeur, un document d'urbanisme, ou ailleurs.

Compare ensuite ce que tu trouves avec ce que le projet d'acte déclare sur ce point (par exemple une clause "le vendeur déclare n'avoir fait exécuter aucun travaux soumis à la garantie décennale"). Signale toute CONTRADICTION POTENTIELLE entre une déclaration du projet et une pièce qui indique le contraire : c'est le point le plus important de cette analyse.${consigneReference}

${CONSIGNES_AUDIT}

${formaterDocuments(documents)}

Format exact :
{"travaux": [{${FORMAT_CONSTAT_GRAVITE}, "titre": "...", "description": "...", "action": "..." ou null, "sources": [${FORMAT_SOURCE}]}]}`;
}

// Passe 4 — Urbanisme, autorisations, garanties, préemption, servitudes (§6, §7, §9, §10, §11).
// Regroupés car largement les mêmes documents (certificat d'urbanisme, titre, autorisations,
// décennales) répondent à ces cinq questions ; `titresTravaux` (issus de la passe 3) oriente le
// modèle vers les autorisations/garanties attendues SANS lui faire relire les travaux eux-mêmes.
function construirePromptUrbanisme(documents, titresTravaux) {
  const contexteTravaux = (titresTravaux && titresTravaux.length)
    ? `\nDes travaux ont déjà été identifiés dans ce dossier : ${titresTravaux.map((t) => `« ${t} »`).join(', ')}. Pour chacun, cherche une autorisation d'urbanisme (permis de construire, déclaration préalable, permis d'aménager, autorisation de travaux, certificat de conformité, DAACT) et, s'il date de moins de 10 ans, une garantie décennale ou une assurance dommages-ouvrage — sans conclure automatiquement à leur absence si tu ne les trouves pas (voir consignes).`
    : '';
  return `Tu es un clerc de notaire. Examine, dans tous les documents fournis :
- L'URBANISME : certificat d'urbanisme, PLU/PLUi, zonage, secteur, contraintes, monuments historiques, périmètres de protection, alignement, emplacements réservés, risques.
- LES AUTORISATIONS ET GARANTIES liées à d'éventuels travaux (voir ci-dessous).
- LE DROIT DE PRÉEMPTION : droit de préemption urbain, préemption renforcée, droit de préemption particulier, droit de préférence, SAFER.
- LES SERVITUDES : servitudes privées et servitudes d'utilité publique, passage, réseaux, vues, alignement — cohérence entre le titre, le certificat d'urbanisme et le projet.${contexteTravaux}

${CONSIGNES_AUDIT}

Classe chaque constat dans EXACTEMENT une catégorie parmi "URBANISME", "AUTORISATION", "GARANTIE", "PREEMPTION", "SERVITUDE".

${formaterDocuments(documents)}

Format exact :
{"constats": [{"categorie": "URBANISME"|"AUTORISATION"|"GARANTIE"|"PREEMPTION"|"SERVITUDE", ${FORMAT_CONSTAT_GRAVITE}, "titre": "...", "description": "...", "action": "..." ou null, "sources": [${FORMAT_SOURCE}]}]}`;
}

// Passe 5 — Copropriété (§12), uniquement pour un bien en copropriété (voir routes/auditActe.js).
function construirePromptCopropriete(documents) {
  return `Tu es un clerc de notaire. Le bien vendu est en copropriété. Compare, entre le règlement de copropriété, l'état descriptif de division, les procès-verbaux d'assemblée générale et le projet d'acte :
- Les lots et les tantièmes de parties communes.
- Les travaux votés ou déjà réalisés dans les parties communes.
- Les charges et les procédures en cours (judiciaires, contentieuses).

${CONSIGNES_AUDIT}

${formaterDocuments(documents)}

Format exact :
{"copropriete": [{${FORMAT_CONSTAT_GRAVITE}, "titre": "...", "description": "...", "action": "..." ou null, "sources": [${FORMAT_SOURCE}]}]}`;
}

module.exports = {
  CONSIGNES_AUDIT, formaterDocuments,
  construirePromptIdentification, construirePromptDiagnostics, construirePromptTravaux,
  construirePromptUrbanisme, construirePromptCopropriete
};
