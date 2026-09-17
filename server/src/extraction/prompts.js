'use strict';

// Prompts de l'extraction assistée, un par LOT (parties / bien / dates). Trois appels ciblés
// plutôt qu'un seul fourre-tout : un modèle 7-8B tenu de remplir quinze champs hétérogènes d'un
// coup en bâcle une partie, alors qu'il s'en sort correctement sur une tâche à la fois — et chaque
// lot peut recevoir un contexte différent (voir construireFenetres), ce qu'un appel unique
// interdisait.
//
// Trois consignes reviennent dans les trois prompts, ce sont les garde-fous de la spec :
//   1. `null` plutôt qu'une supposition — un champ vide se corrige d'un coup d'œil, une valeur
//      inventée passe inaperçue et se retrouve dans un dossier ;
//   2. tout élément est accompagné de l'EXTRAIT EXACT du texte qui le justifie, recopié mot pour
//      mot — c'est ce qui rend la réponse vérifiable mécaniquement (voir extraits.js) ;
//   3. le modèle ne calcule JAMAIS une date à partir d'un délai : il rapporte le délai et son
//      point de départ, le calcul est fait côté client, déterministe et testé.

const CONSIGNES_COMMUNES = `Règles impératives :
- N'utilise QUE ce qui figure explicitement dans le texte fourni. Si une information n'y est pas, réponds null : ne devine jamais, ne complète jamais par ce qui te semble habituel dans ce type d'acte.
- Pour chaque information, donne dans "extrait" le passage EXACT du texte qui la justifie, recopié mot pour mot (copier-coller, 10 à 30 mots), sans le reformuler, le résumer ni le traduire en langage courant. Si tu ne peux pas citer un passage exact, n'ajoute pas l'information.
- Réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte avant ou après.`;

function construirePromptParties(texte) {
  return `Tu es un clerc de notaire. Tu lis un avant-contrat de vente immobilière et tu identifies son TYPE et ses PARTIES.

Le type d'acte détermine qui est vendeur et qui est acquéreur — c'est le point le plus important :
- "COMPROMIS_DE_VENTE" : promesse synallagmatique, les deux parties s'engagent.
- "PROMESSE_DE_VENTE" : promesse unilatérale de VENTE. Le PROMETTANT s'engage à vendre : c'est le VENDEUR. Le BÉNÉFICIAIRE est l'acquéreur.
- "PROMESSE_D_ACHAT" : promesse unilatérale d'ACHAT. Le PROMETTANT s'engage à acheter : c'est l'ACQUÉREUR. Le BÉNÉFICIAIRE est le vendeur. C'est l'inverse du cas précédent.
- "AUTRE" : autre type d'acte.
- "INCONNU" : le texte ne permet pas de trancher. Utilise cette valeur plutôt que de choisir au hasard.

Pour chaque partie, donne son nom tel qu'il figure dans l'acte, la qualité sous laquelle l'acte la désigne ("vendeur", "acquereur", "promettant" ou "beneficiaire"), son rôle réel déduit du type d'acte ("VENDEUR" ou "ACQUEREUR"), si c'est une personne physique ou morale, et le cas échéant son représentant.

Identifie aussi les NOTAIRES cités : leur nom, la ville de leur office, la partie dont ils sont le notaire ("vendeur", "acquereur" ou null), et si le texte dit explicitement lequel reçoit l'acte ("instrumentaire"), lequel y participe ("participant"), ou rien ("null" — ne le devine pas, une règle métier s'en chargera ailleurs).

${CONSIGNES_COMMUNES}

TEXTE :
${texte}

Format exact :
{"typeActe": {"valeur": "COMPROMIS_DE_VENTE"|"PROMESSE_DE_VENTE"|"PROMESSE_D_ACHAT"|"AUTRE"|"INCONNU", "extrait": "..."},
 "parties": [{"nom": "...", "qualiteActe": "vendeur"|"acquereur"|"promettant"|"beneficiaire", "role": "VENDEUR"|"ACQUEREUR", "qualitePersonne": "physique"|"morale", "representant": "..." ou null, "extrait": "..."}],
 "notaires": [{"nom": "...", "office": "..." ou null, "cote": "vendeur"|"acquereur" ou null, "roleExplicite": "instrumentaire"|"participant" ou null, "extrait": "..."}]}`;
}

function construirePromptBien(texte) {
  return `Tu es un clerc de notaire. Tu relèves la DÉSIGNATION DU BIEN VENDU et le PRIX dans un avant-contrat de vente immobilière.

Attention : un acte contient plusieurs adresses — celle du domicile du vendeur, celle du domicile de l'acquéreur, celles des offices notariaux. Tu ne dois relever QUE l'adresse du bien vendu, celle qui figure dans la désignation du bien (souvent introduite par "sis à", "situé à", ou sous un titre "DÉSIGNATION"). Une adresse introduite par "demeurant" est celle d'une partie : ne la relève jamais comme adresse du bien.

Donne les composants de l'adresse séparément (leur ordre varie d'un acte à l'autre) : numéro, type de voie, nom de la voie, lieu-dit, code postal, commune. Un lieu-dit n'est pas une voie : ne le transforme pas en nom de rue.

Relève aussi les références cadastrales si elles figurent, et le prix de vente en euros sous forme d'un nombre entier (sans symbole, sans séparateur de milliers). Dans un acte notarié, le prix est généralement écrit en toutes lettres puis répété en chiffres entre parenthèses.

${CONSIGNES_COMMUNES}

TEXTE :
${texte}

Format exact :
{"adresse": {"numero": "..." ou null, "typeVoie": "..." ou null, "nomVoie": "..." ou null, "lieuDit": "..." ou null, "codePostal": "..." ou null, "commune": "..." ou null, "extrait": "..."} ou null,
 "cadastre": {"section": "...", "numero": "...", "extrait": "..."} ou null,
 "prixVente": {"valeur": nombre, "extrait": "..."} ou null,
 "typeVente": {"valeur": "maison"|"copropriete"|"terrain", "extrait": "..."} ou null}`;
}

function construirePromptDates(texte) {
  return `Tu es un clerc de notaire. Tu relèves les ÉCHÉANCES d'un avant-contrat de vente immobilière, en identifiant la FONCTION JURIDIQUE de chacune.

Types attendus :
- "SIGNATURE_AVANT_CONTRAT" : date de signature du compromis ou de la promesse lui-même.
- "BUTOIR_PRET" : date limite d'obtention du prêt (condition suspensive de financement).
- "REITERATION_ACTE" : date limite de signature de l'acte authentique de vente.
- "BUTOIR_VENTE_PREALABLE" : date limite de la vente d'un autre bien dont dépend celle-ci.

Ne relève pas les dates qui n'ont aucune de ces fonctions (dates de diagnostics, citations de lois, dates de naissance, prises d'effet d'une garantie ou d'un taux). Ne relève pas non plus le délai de notification au notaire du refus ou de l'octroi du prêt : ce n'est pas la condition suspensive elle-même.

Pour chaque échéance, deux cas et deux seulement :
- l'acte donne une DATE CALENDAIRE : remplis "dateExplicite" au format AAAA-MM-JJ et laisse "delai" à null ;
- l'acte donne un DÉLAI ("dans les 60 jours", "un délai de trois mois à compter de...") : remplis "delai" avec sa valeur numérique, son unité ("jours" ou "mois") et le point de départ tel que l'acte le nomme, et laisse "dateExplicite" à null.
NE CALCULE JAMAIS toi-même la date correspondant à un délai : rapporte le délai, le calcul est fait ailleurs. Si l'acte donne les deux (une date ET un délai), remplis les deux champs sans chercher à les concilier.

Relève enfin les ENGAGEMENTS DU VENDEUR à justifier avant la vente : un entretien déjà réalisé à prouver ("entretien"), des travaux à faire exécuter ("travaux"), ou un document à produire ("document").

${CONSIGNES_COMMUNES}

TEXTE :
${texte}

Format exact :
{"dates": [{"type": "SIGNATURE_AVANT_CONTRAT"|"BUTOIR_PRET"|"REITERATION_ACTE"|"BUTOIR_VENTE_PREALABLE", "dateExplicite": "AAAA-MM-JJ" ou null, "delai": {"valeur": nombre, "unite": "jours"|"mois", "pointDepart": "..."} ou null, "extrait": "..."}],
 "engagementsVendeur": [{"type": "entretien"|"travaux"|"document", "extrait": "..."}]}`;
}

module.exports = { construirePromptParties, construirePromptBien, construirePromptDates, CONSIGNES_COMMUNES };
