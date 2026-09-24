'use strict';

// Relecture d'un projet d'acte par l'API Claude (Outil 2) — le « cœur » porté du prototype
// « Notariat IA » fourni par l'étude (grille de vérification explicite injectée dans le prompt,
// texte pseudonymisé, sortie structurée par un schéma), adapté à CLAIRE :
//   - la grille vient du CLIENT (GRILLE_RELECTURE_OUTIL2 dans script.js, seule source), filtrée
//     selon le mode (projet d'avant-contrat / projet d'acte de vente) : un seul endroit à tenir à
//     jour, et le rendu du tableau de bord lit la même table ;
//   - la pseudonymisation est faite dans le NAVIGATEUR, pas ici : la table de correspondance jeton
//     → valeur réelle ne traverse jamais le réseau, même interne (plus strict que le prototype) ;
//   - plusieurs documents (projet, avant-contrat de référence, annexes) balisés page par page, et
//     chaque constat cite document + page + extrait LITTÉRAL, vérifié mécaniquement ensuite —
//     jamais un score de confiance déclaré par le modèle (même doctrine que extraction/extraits.js).
//
// Fonctions pures ici ; l'appel réseau lui-même est dans routes/relectureClaude.js.

const { localiserExtrait } = require('../extraction/extraits');

// Tarifs publics Anthropic en dollars par million de jetons (première partie, API directe).
// L'écriture en cache coûte 1,25 fois l'entrée, la lecture 0,1 fois. Un modèle absent de la table
// n'a PAS de coût affiché plutôt qu'un coût faux.
const TARIFS_USD_PAR_MILLION = {
  'claude-sonnet-5': { entree: 2, sortie: 10 },
  'claude-opus-5': { entree: 5, sortie: 25 }
};

function calculerCoutUsd(usage, modele) {
  const t = TARIFS_USD_PAR_MILLION[modele];
  const u = usage || {};
  const n = (v) => (Number.isFinite(v) && v > 0 ? v : 0);
  if (!t) return null;
  const cout = (n(u.input_tokens) * t.entree
    + n(u.cache_creation_input_tokens) * t.entree * 1.25
    + n(u.cache_read_input_tokens) * t.entree * 0.1
    + n(u.output_tokens) * t.sortie) / 1e6;
  return Math.round(cout * 10000) / 10000;
}

// Estimation avant lancement : l'entrée est comptée exactement (count_tokens), la sortie ne peut
// qu'être estimée — une grille de ~45 points avec citations + la réflexion du modèle tourne
// autour de 8 000 à 15 000 jetons. On affiche une fourchette plutôt qu'un chiffre faussement sûr.
const SORTIE_ESTIMEE = { basse: 8000, haute: 20000 };

function estimerCoutUsd(jetonsEntree, modele) {
  const t = TARIFS_USD_PAR_MILLION[modele];
  if (!t || !Number.isFinite(jetonsEntree)) return null;
  const base = jetonsEntree * t.entree / 1e6;
  const arrondi = (v) => Math.round(v * 100) / 100;
  return {
    bas: arrondi(base + SORTIE_ESTIMEE.basse * t.sortie / 1e6),
    haut: arrondi(base + SORTIE_ESTIMEE.haute * t.sortie / 1e6)
  };
}

const STATUTS_POINT = ['present', 'absent', 'non_applicable', 'a_verifier'];
const GRAVITES_ANOMALIE = ['elevee', 'moyenne', 'faible'];
const MAX_POINTS_GRILLE = 90;
const MAX_DOCUMENTS = 40;
// Garde-fou grossier : ~250 000 jetons de français. Au-delà on REFUSE avec un message explicite
// plutôt que de tronquer en silence — une annexe coupée en deux produirait un « absent » faux.
const MAX_CARACTERES_TOTAL = 900000;

const ID_POINT_RE = /^[a-z0-9_]{2,40}$/;

function texteCourt(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max || 500) : '';
}

function validerGrille(brut) {
  if (!Array.isArray(brut) || brut.length === 0) return { erreur: 'Grille de relecture absente.' };
  if (brut.length > MAX_POINTS_GRILLE) return { erreur: 'Grille de relecture trop longue.' };
  const vus = new Set();
  const grille = [];
  for (const p of brut) {
    if (!p || typeof p !== 'object' || !ID_POINT_RE.test(p.id) || vus.has(p.id)) {
      return { erreur: 'Point de grille invalide.' };
    }
    vus.add(p.id);
    grille.push({
      id: p.id,
      section: texteCourt(p.section, 80),
      intitule: texteCourt(p.intitule, 300),
      declencheur: texteCourt(p.declencheur, 300),
      base_legale: texteCourt(p.base_legale, 200)
    });
  }
  return { grille };
}

function validerDocuments(brut) {
  if (!Array.isArray(brut) || brut.length === 0) return { erreur: 'Aucun document à analyser.' };
  if (brut.length > MAX_DOCUMENTS) return { erreur: `Trop de documents (maximum ${MAX_DOCUMENTS}).` };
  const documents = [];
  let total = 0;
  brut.forEach((d, i) => {
    const texte = typeof (d && d.texte) === 'string' ? d.texte : '';
    const pages = Array.isArray(d && d.pages) ? d.pages
      .filter(p => p && Number.isInteger(p.numero) && Number.isInteger(p.debut) && Number.isInteger(p.fin) && p.debut >= 0 && p.fin >= p.debut)
      .map(p => ({ numero: p.numero, debut: p.debut, fin: Math.min(p.fin, texte.length) }))
      : [];
    total += texte.length;
    documents.push({
      numero: i + 1,
      nom: texteCourt(d && d.nom, 160) || `Document ${i + 1}`,
      nature: texteCourt(d && d.nature, 80) || 'autre',
      role: texteCourt(d && d.role, 40) || 'annexe',
      annexesDepuisPage: Number.isInteger(d && d.annexesDepuisPage) ? d.annexesDepuisPage : null,
      texte,
      pages
    });
  });
  if (documents.every(d => d.texte.trim().length < 20)) return { erreur: 'Aucun texte exploitable dans les documents.' };
  if (total > MAX_CARACTERES_TOTAL) {
    return { erreur: `Documents trop volumineux pour une seule analyse (${Math.round(total / 1000)} 000 caractères, maximum ${MAX_CARACTERES_TOTAL / 1000} 000). Retirez les annexes les moins utiles.` };
  }
  return { documents };
}

// Le texte envoyé : chaque document entre balises, chaque page précédée de son numéro — c'est ce
// qui permet au modèle de citer une page, et à nous de la vérifier. Les pages d'annexes intégrées
// au PDF principal (repérées côté client par estDebutPageAnnexe) sont marquées comme telles.
function construireTexteDocuments(documents) {
  return documents.map(d => {
    const entete = `<document numero="${d.numero}" nom="${d.nom.replace(/"/g, "'")}" role="${d.role}" nature="${d.nature}">`;
    let corps;
    if (d.pages.length) {
      corps = d.pages.map(p => {
        const annexe = d.annexesDepuisPage && p.numero >= d.annexesDepuisPage ? ' — annexe jointe' : '';
        return `[[page ${p.numero}${annexe}]]\n${d.texte.slice(p.debut, p.fin)}`;
      }).join('\n');
    } else {
      corps = d.texte;
    }
    return `${entete}\n${corps}\n</document>`;
  }).join('\n\n');
}

function grilleVersTexte(grille) {
  const parSection = new Map();
  for (const p of grille) {
    if (!parSection.has(p.section)) parSection.set(p.section, []);
    parSection.get(p.section).push(p);
  }
  const blocs = [];
  for (const [section, points] of parSection) {
    const lignes = points.map(p => `  - [${p.id}] ${p.intitule} — s'applique si : ${p.declencheur}${p.base_legale ? ` (${p.base_legale})` : ''}`).join('\n');
    blocs.push(`${section} :\n${lignes}`);
  }
  return blocs.join('\n\n');
}

const OBJET_PAR_MODE = {
  compromis: "un PROJET d'avant-contrat (compromis ou promesse de vente) qui n'est pas encore signé, accompagné le cas échéant de ses annexes",
  acte: "un PROJET d'acte authentique de vente qui n'est pas encore signé, à comparer à l'avant-contrat déjà signé (document de rôle « avant_contrat » s'il est fourni) et à ses annexes"
};

// Commentaires de l'étude sur de précédentes relectures (« faux positif », « oubli »…), portée
// « tous les dossiers » ou ce dossier : transmis comme consignes, bornés en nombre et en longueur.
function validerConsignes(brut) {
  if (!Array.isArray(brut)) return [];
  return brut.filter(c => typeof c === 'string' && c.trim()).slice(0, 30).map(c => c.trim().slice(0, 400));
}

function construireSystemPrompt(mode, grille, consignes) {
  const objet = OBJET_PAR_MODE[mode] || OBJET_PAR_MODE.compromis;
  const comparaison = mode === 'acte'
    ? `
Comparaison avec l'avant-contrat : quand un document de rôle « avant_contrat » est fourni, relève
dans "anomalies" toute divergence entre lui et le projet (parties, quotités, prix, désignation,
lots, conditions, charges, engagements du vendeur). Une divergence n'est pas forcément une erreur
(un report de date peut être voulu) : décris-la, et laisse le notaire juger.`
    : '';
  return `Tu assistes un notaire français dans la relecture de ${objet}.
Tu produis une fiche structurée selon le schéma imposé. Ta réponse est une aide à la relecture :
elle ne remplace ni le contrôle ni la décision du notaire, qui reste seul juge.

Le texte a été pseudonymisé avant de t'être transmis : noms, adresses, contacts, identifiants,
références cadastrales ont été remplacés par des jetons de la forme ⟦CATEGORIE_n⟧ (par exemple
⟦PERSONNE_1⟧, ⟦ADRESSE_2⟧, ⟦CADASTRE_1⟧). Un même élément porte le même jeton dans tous les
documents : deux jetons différents désignent donc deux valeurs différentes, ce qui te permet de
repérer une incohérence sans connaître la valeur. Reprends les jetons tels quels, ne cherche jamais
à deviner ce qu'ils masquent.

Chaque document est encadré par <document numero="…" role="…" nature="…"> et chaque page commence
par [[page N]]. Une page marquée « annexe jointe » appartient à une pièce annexée au document.

Règles impératives :
- N'invente rien. Ce qui n'est pas dans le texte n'existe pas pour toi : « non trouvé » n'est pas
  « absent du dossier ». N'invente jamais de référence légale ni de jurisprudence ; ne cite un texte
  de loi que s'il figure dans la grille ou dans les documents eux-mêmes.
- Chaque constat qui s'appuie sur le texte porte au moins une citation : le numéro du document, le
  numéro de page, et un extrait recopié MOT POUR MOT (15 à 40 mots, jetons compris). Ces extraits
  sont vérifiés automatiquement ; un extrait reformulé sera signalé comme introuvable.
- Plusieurs copropriétés peuvent coexister dans un même acte (lots dépendant de deux immeubles ou
  de deux syndicats distincts). Recense-les une par une dans "coproprietes" ; pour chaque point
  copropriété de la grille, examine CHAQUE copropriété et précise dans le commentaire laquelle est
  concernée — le statut retenu est celui de la copropriété la moins bien documentée.
- "synthese" : 3 à 5 phrases factuelles, sans jugement de valeur, à destination du notaire.
${comparaison}

GRILLE DE RELECTURE — pour "points", renvoie EXACTEMENT un item par point ci-dessous (même id, sans
ajout ni omission), avec son statut :
- "present" : le document traite le point ou l'annexe correspondante figure au dossier fourni ;
- "absent" : le déclencheur s'applique manifestement d'après le texte, mais rien ne l'atteste ;
- "non_applicable" : le déclencheur ne s'applique pas à cette opération ;
- "a_verifier" : le texte ne permet pas de trancher. En cas de doute, c'est ce statut, jamais "absent".
Le commentaire dit en une ou deux phrases ce qui a été trouvé (ou pourquoi le point reste ouvert).

Tout autre point d'attention (incohérence de dates ou de montants, clause ambiguë, contradiction
entre documents) va dans "anomalies", avec sa gravité : "elevee" (à régler avant signature),
"moyenne" (à surveiller), "faible" (à noter).

${grilleVersTexte(grille)}${(consignes && consignes.length) ? `

CONSIGNES DE L'ÉTUDE, tirées de ses commentaires sur de précédentes relectures — elles priment sur
ton appréciation quand elles s'appliquent :
${consignes.map(c => `- ${c}`).join('\n')}` : ''}`;
}

// Schéma de sortie structurée (output_config.format). Écrit à la main plutôt que via zod : le
// serveur n'a pas cette dépendance et le schéma reste court. Contraintes du mode strict :
// additionalProperties false et tous les champs requis.
const SCHEMA_CITATION = {
  type: 'object',
  additionalProperties: false,
  required: ['document', 'page', 'extrait'],
  properties: {
    document: { type: 'integer', description: 'Numéro du document (attribut numero de la balise <document>).' },
    page: { type: 'integer', description: 'Numéro de page indiqué par le repère [[page N]].' },
    extrait: { type: 'string', description: 'Passage recopié mot pour mot, 15 à 40 mots.' }
  }
};

const SCHEMA_RELECTURE = {
  type: 'object',
  additionalProperties: false,
  required: ['type_acte', 'synthese', 'coproprietes', 'points', 'anomalies'],
  properties: {
    type_acte: { type: 'string' },
    synthese: { type: 'string' },
    coproprietes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['designation', 'lots', 'observations'],
        properties: {
          designation: { type: 'string' },
          lots: { type: 'string' },
          observations: { type: 'string' }
        }
      }
    },
    points: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'statut', 'commentaire', 'citations'],
        properties: {
          id: { type: 'string' },
          statut: { type: 'string', enum: STATUTS_POINT },
          commentaire: { type: 'string' },
          citations: { type: 'array', items: SCHEMA_CITATION }
        }
      }
    },
    anomalies: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['titre', 'description', 'gravite', 'citations'],
        properties: {
          titre: { type: 'string' },
          description: { type: 'string' },
          gravite: { type: 'string', enum: GRAVITES_ANOMALIE },
          citations: { type: 'array', items: SCHEMA_CITATION }
        }
      }
    }
  }
};

function pageDepuisIndex(pages, index) {
  for (const p of pages) if (index >= p.debut && index < p.fin) return p.numero;
  return null;
}

// Chaque citation est cherchée LITTÉRALEMENT dans le document qu'elle nomme (puis, à défaut, dans
// tous les autres : le modèle se trompe plus souvent de numéro de document que d'extrait). Trouvée
// → page RECALCULÉE depuis la position réelle, la page annoncée par le modèle n'étant qu'un indice.
// Introuvable → marquée comme telle, jamais retirée : le notaire doit voir qu'elle ne se vérifie pas.
function verifierCitations(citations, documents) {
  if (!Array.isArray(citations)) return [];
  return citations.slice(0, 6).map(c => {
    const extrait = texteCourt(c && c.extrait, 600);
    const annonce = documents.find(d => d.numero === (c && c.document));
    const ordre = annonce ? [annonce, ...documents.filter(d => d !== annonce)] : documents;
    for (const d of ordre) {
      const pos = localiserExtrait(d.texte, extrait);
      if (pos >= 0) {
        return { document: d.numero, page: pageDepuisIndex(d.pages, pos) || (c && c.page) || null, extrait, verifie: true };
      }
    }
    const pageValide = annonce && Number.isInteger(c && c.page) && annonce.pages.some(p => p.numero === c.page);
    return { document: annonce ? annonce.numero : null, page: pageValide ? c.page : null, extrait, verifie: false };
  });
}

// Remet la réponse d'aplomb contre la grille envoyée : un point oublié par le modèle ressort
// « a_verifier » avec un commentaire explicite (jamais « present » par défaut), un point inventé est
// écarté, l'ordre est celui de la grille.
function normaliserAnalyse(brute, grille, documents) {
  const a = (brute && typeof brute === 'object') ? brute : {};
  const parId = new Map();
  for (const p of (Array.isArray(a.points) ? a.points : [])) {
    if (p && typeof p.id === 'string' && !parId.has(p.id)) parId.set(p.id, p);
  }
  const points = grille.map(g => {
    const p = parId.get(g.id);
    if (!p) return { id: g.id, statut: 'a_verifier', commentaire: "Point non traité par l'analyse : à contrôler à la main.", citations: [], omis: true };
    return {
      id: g.id,
      statut: STATUTS_POINT.indexOf(p.statut) >= 0 ? p.statut : 'a_verifier',
      commentaire: texteCourt(p.commentaire, 800),
      citations: verifierCitations(p.citations, documents)
    };
  });
  const anomalies = (Array.isArray(a.anomalies) ? a.anomalies : [])
    .filter(x => x && typeof x.titre === 'string' && x.titre.trim())
    .slice(0, 40)
    .map(x => ({
      titre: texteCourt(x.titre, 200),
      description: texteCourt(x.description, 1200),
      gravite: GRAVITES_ANOMALIE.indexOf(x.gravite) >= 0 ? x.gravite : 'moyenne',
      citations: verifierCitations(x.citations, documents)
    }));
  const coproprietes = (Array.isArray(a.coproprietes) ? a.coproprietes : [])
    .filter(c => c && typeof c.designation === 'string')
    .slice(0, 6)
    .map(c => ({ designation: texteCourt(c.designation, 300), lots: texteCourt(c.lots, 300), observations: texteCourt(c.observations, 800) }));
  return {
    type_acte: texteCourt(a.type_acte, 160),
    synthese: texteCourt(a.synthese, 2000),
    coproprietes,
    points,
    anomalies
  };
}

module.exports = {
  TARIFS_USD_PAR_MILLION, calculerCoutUsd, estimerCoutUsd,
  validerGrille, validerDocuments, validerConsignes, construireTexteDocuments, construireSystemPrompt,
  SCHEMA_RELECTURE, verifierCitations, normaliserAnalyse, pageDepuisIndex,
  MAX_CARACTERES_TOTAL, STATUTS_POINT
};
