'use strict';

// Normalisation des réponses du modèle local, un normaliseur par lot. Deux rôles pour le même
// code :
//   - VALIDER (voir `valider*` en bas) : dire, en une phrase, ce qui cloche dans l'objet renvoyé —
//     c'est ce message qui est renvoyé au modèle lors de l'unique relance de genererJson() ;
//   - NORMALISER : ne laisser passer que des valeurs de la bonne forme, en écartant silencieusement
//     le reste. Un modèle 7-8B invente régulièrement une énumération ("qualiteActe": "propriétaire"),
//     une date au format français, ou un nombre écrit en toutes lettres — mieux vaut un champ vide
//     qu'une valeur inexploitable qui traverserait jusqu'à la fiche du dossier.
//
// Rien ici ne calcule : une date n'est jamais déduite d'un délai côté serveur (voir prompts.js).

const REGEX_ISO = /^\d{4}-\d{2}-\d{2}$/;
const TYPES_ACTE = new Set(['COMPROMIS_DE_VENTE', 'PROMESSE_DE_VENTE', 'PROMESSE_D_ACHAT', 'AUTRE', 'INCONNU']);
const QUALITES_ACTE = new Set(['vendeur', 'acquereur', 'promettant', 'beneficiaire']);
const ROLES = new Set(['VENDEUR', 'ACQUEREUR']);
const COTES = new Set(['vendeur', 'acquereur']);
const ROLES_NOTAIRE = new Set(['instrumentaire', 'participant']);
const TYPES_DATE = new Set(['SIGNATURE_AVANT_CONTRAT', 'BUTOIR_PRET', 'REITERATION_ACTE', 'BUTOIR_VENTE_PREALABLE']);
const TYPES_ENGAGEMENT = new Set(['entretien', 'travaux', 'document', 'autre']);
const TYPES_VENTE = new Set(['maison', 'copropriete', 'terrain']);
const UNITES_DELAI = new Set(['jours', 'mois']);

const texteOuNull = (v) => (typeof v === 'string' && v.trim()) ? v.trim() : null;
const dateOuNull = (v) => (typeof v === 'string' && REGEX_ISO.test(v)) ? v : null;
const entierPositifOuNull = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0) ? Math.round(v) : null;
const objet = (v) => (v && typeof v === 'object' && !Array.isArray(v)) ? v : null;
const liste = (v) => Array.isArray(v) ? v : [];

function normaliserLotParties(brut) {
  const src = objet(brut) || {};
  const typeBrut = objet(src.typeActe);
  const typeActe = typeBrut && TYPES_ACTE.has(typeBrut.valeur)
    ? { valeur: typeBrut.valeur, extrait: texteOuNull(typeBrut.extrait) }
    : null;

  const parties = liste(src.parties)
    .map(objet)
    .filter((p) => p && texteOuNull(p.nom) && ROLES.has(p.role))
    .map((p) => ({
      nom: texteOuNull(p.nom),
      // Une qualité hors énumération (« propriétaire », « cédant »…) est effacée plutôt que
      // conservée : c'est elle qui pilote la correspondance qualité → rôle côté client, une valeur
      // fantaisiste y ferait plus de dégâts qu'une absence.
      qualiteActe: QUALITES_ACTE.has(p.qualiteActe) ? p.qualiteActe : null,
      role: p.role,
      qualitePersonne: p.qualitePersonne === 'morale' ? 'morale' : 'physique',
      representant: texteOuNull(p.representant),
      extrait: texteOuNull(p.extrait)
    }));

  const notaires = liste(src.notaires)
    .map(objet)
    .filter((n) => n && texteOuNull(n.nom))
    .map((n) => ({
      nom: texteOuNull(n.nom),
      office: texteOuNull(n.office),
      cote: COTES.has(n.cote) ? n.cote : null,
      roleExplicite: ROLES_NOTAIRE.has(n.roleExplicite) ? n.roleExplicite : null,
      extrait: texteOuNull(n.extrait)
    }));

  return { typeActe, parties, notaires };
}

function normaliserLotBien(brut) {
  const src = objet(brut) || {};
  const a = objet(src.adresse);
  const cadastre = objet(src.cadastre);
  const prix = objet(src.prixVente);
  const typeVente = objet(src.typeVente);

  const adresse = a && (texteOuNull(a.codePostal) || texteOuNull(a.commune) || texteOuNull(a.nomVoie))
    ? {
      numero: texteOuNull(a.numero), typeVoie: texteOuNull(a.typeVoie), nomVoie: texteOuNull(a.nomVoie),
      lieuDit: texteOuNull(a.lieuDit),
      // Un code postal français fait exactement 5 chiffres : tout le reste (une année, un numéro
      // d'article capturé de travers) est écarté — c'est de lui qu'on déduit le département, donc
      // le notaire instrumentaire côté client.
      codePostal: (typeof a.codePostal === 'string' && /^\d{5}$/.test(a.codePostal.trim())) ? a.codePostal.trim() : null,
      commune: texteOuNull(a.commune),
      extrait: texteOuNull(a.extrait)
    }
    : null;

  return {
    adresse,
    cadastre: cadastre && texteOuNull(cadastre.section)
      ? { section: texteOuNull(cadastre.section), numero: texteOuNull(cadastre.numero), extrait: texteOuNull(cadastre.extrait) }
      : null,
    prixVente: prix && entierPositifOuNull(prix.valeur)
      ? { valeur: entierPositifOuNull(prix.valeur), extrait: texteOuNull(prix.extrait) }
      : null,
    typeVente: typeVente && TYPES_VENTE.has(typeVente.valeur)
      ? { valeur: typeVente.valeur, extrait: texteOuNull(typeVente.extrait) }
      : null
  };
}

function normaliserLotDates(brut) {
  const src = objet(brut) || {};
  const dates = liste(src.dates)
    .map(objet)
    .filter((d) => d && TYPES_DATE.has(d.type))
    .map((d) => {
      const delaiBrut = objet(d.delai);
      const valeur = delaiBrut ? entierPositifOuNull(delaiBrut.valeur) : null;
      const delai = valeur && UNITES_DELAI.has(delaiBrut.unite)
        ? { valeur, unite: delaiBrut.unite, pointDepart: texteOuNull(delaiBrut.pointDepart) }
        : null;
      return { type: d.type, dateExplicite: dateOuNull(d.dateExplicite), delai, extrait: texteOuNull(d.extrait) };
    })
    // Ni date ni délai : le modèle a nommé une échéance sans rien en dire. Rien à en faire.
    .filter((d) => d.dateExplicite || d.delai);

  const engagementsVendeur = liste(src.engagementsVendeur)
    .map(objet)
    .filter((e) => e && texteOuNull(e.extrait))
    .map((e) => ({ type: TYPES_ENGAGEMENT.has(e.type) ? e.type : 'document', extrait: texteOuNull(e.extrait) }));

  return { dates, engagementsVendeur };
}

// Validateurs passés à genererJson() : une phrase décrivant le problème, ou null. Volontairement
// souples sur le CONTENU (un lot peut légitimement ne rien trouver) et stricts sur la FORME : on
// ne relance le modèle que quand il s'est trompé de structure, pas quand l'acte est avare.
function validerLotParties(brut) {
  const src = objet(brut);
  if (!src) return 'la réponse doit être un objet JSON';
  if (src.parties !== undefined && !Array.isArray(src.parties)) return '"parties" doit être une liste';
  if (src.notaires !== undefined && !Array.isArray(src.notaires)) return '"notaires" doit être une liste';
  if (src.typeActe !== undefined && src.typeActe !== null && !objet(src.typeActe)) {
    return '"typeActe" doit être un objet {valeur, extrait} ou null';
  }
  if (objet(src.typeActe) && !TYPES_ACTE.has(src.typeActe.valeur)) {
    return `"typeActe.valeur" doit valoir ${[...TYPES_ACTE].join(', ')}`;
  }
  return null;
}

function validerLotBien(brut) {
  const src = objet(brut);
  if (!src) return 'la réponse doit être un objet JSON';
  for (const cle of ['adresse', 'cadastre', 'prixVente', 'typeVente']) {
    if (src[cle] !== undefined && src[cle] !== null && !objet(src[cle])) {
      return `"${cle}" doit être un objet ou null`;
    }
  }
  return null;
}

function validerLotDates(brut) {
  const src = objet(brut);
  if (!src) return 'la réponse doit être un objet JSON';
  if (src.dates !== undefined && !Array.isArray(src.dates)) return '"dates" doit être une liste';
  if (src.engagementsVendeur !== undefined && !Array.isArray(src.engagementsVendeur)) {
    return '"engagementsVendeur" doit être une liste';
  }
  for (const d of liste(src.dates)) {
    const o = objet(d);
    if (!o) return 'chaque entrée de "dates" doit être un objet';
    if (!TYPES_DATE.has(o.type)) return `"type" doit valoir ${[...TYPES_DATE].join(', ')}`;
  }
  return null;
}

module.exports = {
  normaliserLotParties, normaliserLotBien, normaliserLotDates,
  validerLotParties, validerLotBien, validerLotDates
};
