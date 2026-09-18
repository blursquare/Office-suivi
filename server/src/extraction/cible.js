'use strict';

// Relance CIBLÉE à l'IA locale sur un seul champ, demandée explicitement par l'étude pour
// automatiser un geste répétitif : jusqu'ici, un champ resté « à vérifier » après les trois lots
// automatiques (parties/bien/dates, voir routes/extractionIa.js) ne pouvait être redemandé qu'en
// relançant les TROIS lots au complet — coûteux sur un CPU de bureau pour une seule donnée qui pose
// question. Un bouton par ligne du panneau de révision ("Ce que l'outil a compris", script.js)
// appelle cette même route avec `lot: 'cible'` et le nom du champ.
//
// Fenêtre de texte volontairement PLUS LARGE que celle d'un lot normal (voir CHAMPS_CIBLE ci-dessous,
// comparé aux réglages de LOTS dans routes/extractionIa.js) : la clause qui intéresse CE champ
// précis peut être plus loin des mots-clés génériques d'un lot que ne le permettait le plafond
// habituel — un geste explicite de l'étude sur un seul champ justifie ce coût supplémentaire, que
// l'automatique des trois lots en parallèle à chaque import ne pouvait pas se permettre.
//
// Comme pour les trois lots existants : le modèle ne calcule JAMAIS une date à partir d'un délai
// (voir prompts.js/CONSIGNES_COMMUNES) et chaque élément cite un extrait vérifié mécaniquement
// contre le texte (voir extraits.js) — cette relance ciblée ne relâche aucune de ces deux garanties.

const { construireFenetres } = require('./extraits');
const { CONSIGNES_COMMUNES } = require('./prompts');

const REGEX_ISO = /^\d{4}-\d{2}-\d{2}$/;
const TYPES_ACTE = new Set(['COMPROMIS_DE_VENTE', 'PROMESSE_DE_VENTE', 'PROMESSE_D_ACHAT', 'AUTRE', 'INCONNU']);
const UNITES_DELAI = new Set(['jours', 'mois']);

const texteOuNull = (v) => (typeof v === 'string' && v.trim()) ? v.trim() : null;
const objet = (v) => (v && typeof v === 'object' && !Array.isArray(v)) ? v : null;
const entierPositifOuNull = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0) ? Math.round(v) : null;
const dateOuNull = (v) => (typeof v === 'string' && REGEX_ISO.test(v)) ? v : null;

// Plafond plus généreux que celui des lots normaux (40 000, voir LIMITE_CARACTERES_TEXTE) : une
// seule question à la fois coûte moins cher au modèle qu'un lot complet à quinze champs.
const LIMITE_CARACTERES_CIBLE = 60000;

// Une entrée par champ du panneau de révision qui a un sens à redemander seul (le rôle de l'étude,
// dérivé de la règle métier sur les notaires plutôt que d'une lecture directe, n'en fait pas
// partie — le redemander au modèle n'aurait aucun sens, ce n'est pas une donnée du texte).
const CHAMPS_CIBLE = {
  nom: {
    libelle: "le nom du dossier : les patronymes du VENDEUR (ou du PROMETTANT pour une promesse de vente) puis de l'ACQUÉREUR (ou du BÉNÉFICIAIRE), tels qu'ils figurent dans l'acte",
    categorie: 'texte',
    motif: /vendeu?rs?|acqu[ée]reurs?|promettants?|b[ée]n[ée]ficiaires?|monsieur|madame/gi,
    rayon: 700, maxFenetres: 12000, tete: 6000
  },
  adresseBien: {
    libelle: "l'adresse complète du bien vendu — jamais l'adresse d'une partie (introduite par « demeurant ») ni celle d'un office notarial",
    categorie: 'texte',
    motif: /d[ée]signation|cadastr|sis(?:e)?\s+[àa]|situ[ée]e?\s+[àa]/gi,
    rayon: 1200, maxFenetres: 20000, tete: 3000
  },
  prixVente: {
    libelle: 'le prix de vente du bien, en euros, sous forme de nombre entier',
    categorie: 'nombre',
    motif: /prix\s+(?:de\s+vente|est|convenu|principal)/gi,
    rayon: 900, maxFenetres: 12000, tete: 2000
  },
  emailAcquereur: {
    libelle: "l'adresse email de l'acquéreur (ou du bénéficiaire pour une promesse de vente, ou du vendeur/promettant pour une promesse d'achat)",
    categorie: 'texte',
    motif: /acqu[ée]reurs?|b[ée]n[ée]ficiaires?|@|courriel|e-?mail/gi,
    rayon: 500, maxFenetres: 8000, tete: 4000
  },
  typeActe: {
    libelle: "le type de l'acte",
    categorie: 'typeActe',
    motif: /compromis|promesse|synallagmatique|unilat[ée]rale?/gi,
    rayon: 600, maxFenetres: 8000, tete: 6000
  },
  signature: {
    libelle: "la date de signature de l'avant-contrat lui-même (le compromis ou la promesse, pas l'acte authentique)",
    categorie: 'date',
    motif: /sign[ée]|l['’]an\s+deux\s+mille|fait\s+[àa]\s+/gi,
    rayon: 600, maxFenetres: 8000, tete: 4000
  },
  pret: {
    libelle: "la date limite d'obtention du prêt (condition suspensive de financement)",
    categorie: 'date',
    motif: /pr[êe]t|financement|emprunt/gi,
    rayon: 1200, maxFenetres: 24000, tete: 2000
  },
  acte: {
    libelle: "la date limite de signature de l'acte authentique de vente",
    categorie: 'date',
    motif: /acte\s+authentique|r[ée]it[ée]r/gi,
    rayon: 1200, maxFenetres: 24000, tete: 2000
  },
  ventebien: {
    libelle: "la date limite de la vente préalable d'un autre bien dont dépend celle-ci",
    categorie: 'date',
    motif: /vente\s+pr[ée]alable|revente|bien\s+actuel/gi,
    rayon: 1200, maxFenetres: 24000, tete: 2000
  }
};

// Même principe que construireContexte() dans routes/extractionIa.js (tête du document + fenêtres
// autour des mots-clés), avec des plafonds relevés — voir le commentaire d'en-tête. Sans aucun
// mot-clé trouvé, on retombe sur un morceau plus généreux de la tête plutôt que la seule tête
// habituelle : sur une relance ciblée, mieux vaut donner plus de matière que d'habitude.
function construireContexteCible(texte, champ) {
  const config = CHAMPS_CIBLE[champ];
  const source = texte.length > LIMITE_CARACTERES_CIBLE ? texte.slice(0, LIMITE_CARACTERES_CIBLE) : texte;
  const tete = source.slice(0, config.tete);
  const fenetres = construireFenetres(source, config.motif, config.rayon, config.maxFenetres);
  return fenetres ? `${tete}\n[...]\n${fenetres}` : source.slice(0, config.tete + config.maxFenetres);
}

function construirePromptCible(champ, contexte) {
  const config = CHAMPS_CIBLE[champ];
  const consigneDate = config.categorie === 'date'
    ? `\nDeux cas et deux seulement : l'acte donne une DATE CALENDAIRE (remplis "dateExplicite" au format AAAA-MM-JJ, laisse "delai" à null) ; ou l'acte donne un DÉLAI ("dans les 60 jours", "trois mois à compter de...") — remplis "delai" avec sa valeur numérique, son unité ("jours" ou "mois") et le point de départ tel que l'acte le nomme, laisse "dateExplicite" à null. NE CALCULE JAMAIS toi-même la date correspondant à un délai : le calcul est fait ailleurs, déterministe.`
    : '';
  const formats = {
    texte: '{"valeur": "..." ou null, "extrait": "..." ou null}',
    nombre: '{"valeur": nombre ou null, "extrait": "..." ou null}',
    typeActe: `{"valeur": ${[...TYPES_ACTE].map((v) => `"${v}"`).join('|')}, "extrait": "..." ou null}`,
    date: '{"dateExplicite": "AAAA-MM-JJ" ou null, "delai": {"valeur": nombre, "unite": "jours"|"mois", "pointDepart": "..."} ou null, "extrait": "..." ou null}'
  };

  return `Tu es un clerc de notaire. Une première lecture automatique de cet avant-contrat de vente immobilière n'a pas permis d'établir avec certitude UNE SEULE information : ${config.libelle}.

Concentre-toi UNIQUEMENT sur cette information. Relis attentivement le texte fourni ci-dessous, en entier si nécessaire.${consigneDate}

${CONSIGNES_COMMUNES}

TEXTE :
${contexte}

Format exact :
${formats[config.categorie]}`;
}

function normaliserCible(brut, categorie) {
  const src = objet(brut) || {};
  const extrait = texteOuNull(src.extrait);
  if (categorie === 'texte') return { valeur: texteOuNull(src.valeur), extrait };
  if (categorie === 'nombre') return { valeur: entierPositifOuNull(src.valeur), extrait };
  if (categorie === 'typeActe') return { valeur: TYPES_ACTE.has(src.valeur) ? src.valeur : null, extrait };
  if (categorie === 'date') {
    const delaiBrut = objet(src.delai);
    const valeurDelai = delaiBrut ? entierPositifOuNull(delaiBrut.valeur) : null;
    const delai = valeurDelai && UNITES_DELAI.has(delaiBrut.unite)
      ? { valeur: valeurDelai, unite: delaiBrut.unite, pointDepart: texteOuNull(delaiBrut.pointDepart) }
      : null;
    return { dateExplicite: dateOuNull(src.dateExplicite), delai, extrait };
  }
  return { valeur: null, extrait };
}

// Validateur passé à genererJson() (une seule relance si le modèle se trompe de forme) — souple sur
// le contenu (répondre "rien trouvé" est une réponse légitime), strict sur la structure.
function validerCible(brut, categorie) {
  const src = objet(brut);
  if (!src) return 'la réponse doit être un objet JSON';
  if (categorie === 'typeActe' && src.valeur !== null && src.valeur !== undefined && !TYPES_ACTE.has(src.valeur)) {
    return `"valeur" doit valoir ${[...TYPES_ACTE].join(', ')} ou null`;
  }
  if (categorie === 'date' && src.delai !== undefined && src.delai !== null && !objet(src.delai)) {
    return '"delai" doit être un objet ou null';
  }
  return null;
}

module.exports = {
  CHAMPS_CIBLE, LIMITE_CARACTERES_CIBLE,
  construireContexteCible, construirePromptCible, normaliserCible, validerCible
};
