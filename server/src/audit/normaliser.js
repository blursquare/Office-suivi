'use strict';

// Normalisation des réponses du modèle local pour Outil 2 (Audit des actes), une fonction par
// passe — même discipline que server/src/extraction/normaliser.js (whitelist stricte, on écarte
// silencieusement plutôt que de laisser passer une valeur hors énumération jusqu'à l'interface).
// Rien ici ne calcule une gravité ni une durée : la seule chose ajoutée par rapport à ce que le
// modèle a écrit est un repli sûr ("A_VERIFIER") quand il s'est trompé d'énumération.

const GRAVITES = new Set(['CRITIQUE', 'IMPORTANT', 'A_VERIFIER', 'INFORMATION']);
const CATEGORIES_IDENTIFICATION = new Set(['IDENTIFICATION', 'PARTIES', 'PRIX', 'DATES', 'TITRE']);
const CATEGORIES_URBANISME = new Set(['URBANISME', 'AUTORISATION', 'GARANTIE', 'PREEMPTION', 'SERVITUDE']);
const NATURES_DIAGNOSTIC = new Set(['DPE', 'ERP', 'TERMITES', 'ELECTRICITE', 'GAZ', 'AMIANTE', 'PLOMB', 'ASSAINISSEMENT', 'MESURAGE', 'AUTRE']);
const REGEX_ISO = /^\d{4}-\d{2}-\d{2}$/;

const texteOuNull = (v) => (typeof v === 'string' && v.trim()) ? v.trim() : null;
const objet = (v) => (v && typeof v === 'object' && !Array.isArray(v)) ? v : null;
const liste = (v) => Array.isArray(v) ? v : [];

function normaliserSources(brut) {
  return liste(brut).map(objet).filter((s) => s && texteOuNull(s.extrait)).map((s) => ({
    document: texteOuNull(s.document),
    extrait: texteOuNull(s.extrait)
  }));
}

// Un constat "simple" (travaux, copropriété : une seule catégorie possible, pas d'ambiguïté à
// trancher) — normaliserConstatCategorise() l'étend d'un champ "categorie" pour les passes qui
// couvrent plusieurs sections à la fois (identification, urbanisme) et doivent router chaque
// constat vers le bon tableau de sortie (voir routes/auditActe.js).
function normaliserConstatSimple(c) {
  const o = objet(c);
  if (!o || !texteOuNull(o.titre)) return null;
  return {
    gravite: GRAVITES.has(o.gravite) ? o.gravite : 'A_VERIFIER',
    titre: texteOuNull(o.titre),
    description: texteOuNull(o.description) || '',
    action: texteOuNull(o.action),
    sources: normaliserSources(o.sources)
  };
}

function normaliserConstatCategorise(categoriesValides) {
  return (c) => {
    const base = normaliserConstatSimple(c);
    if (!base) return null;
    const o = objet(c);
    base.categorie = (o && categoriesValides.has(o.categorie)) ? o.categorie : null;
    return base;
  };
}

function normaliserListe(brut, fn) {
  return liste(brut).map(fn).filter(Boolean);
}

function normaliserPasseIdentification(brut) {
  const src = objet(brut) || {};
  return { constats: normaliserListe(src.constats, normaliserConstatCategorise(CATEGORIES_IDENTIFICATION)) };
}

function normaliserPasseDiagnostics(brut) {
  const src = objet(brut) || {};
  const diagnostics = normaliserListe(src.diagnostics, (d) => {
    const o = objet(d);
    if (!o || !texteOuNull(o.extrait)) return null;
    return {
      nature: NATURES_DIAGNOSTIC.has(o.nature) ? o.nature : 'AUTRE',
      document: texteOuNull(o.document),
      dateEtablissement: (typeof o.dateEtablissement === 'string' && REGEX_ISO.test(o.dateEtablissement)) ? o.dateEtablissement : null,
      bienConcerne: texteOuNull(o.bienConcerne),
      extrait: texteOuNull(o.extrait)
    };
  });
  return { diagnostics };
}

function normaliserPasseTravaux(brut) {
  const src = objet(brut) || {};
  return { travaux: normaliserListe(src.travaux, normaliserConstatSimple) };
}

function normaliserPasseUrbanisme(brut) {
  const src = objet(brut) || {};
  return { constats: normaliserListe(src.constats, normaliserConstatCategorise(CATEGORIES_URBANISME)) };
}

function normaliserPasseCopropriete(brut) {
  const src = objet(brut) || {};
  return { copropriete: normaliserListe(src.copropriete, normaliserConstatSimple) };
}

// Validateurs passés à genererJson() (voir llm.js) : une phrase décrivant le problème de FORME, ou
// null — un lot vide ("rien à signaler") n'est jamais une erreur, seule une mauvaise structure
// déclenche l'unique relance.
function validerListeGenerique(cle) {
  return (brut) => {
    const src = objet(brut);
    if (!src) return 'la réponse doit être un objet JSON';
    if (src[cle] !== undefined && !Array.isArray(src[cle])) return `"${cle}" doit être une liste`;
    return null;
  };
}

module.exports = {
  GRAVITES, CATEGORIES_IDENTIFICATION, CATEGORIES_URBANISME, NATURES_DIAGNOSTIC,
  normaliserPasseIdentification, normaliserPasseDiagnostics, normaliserPasseTravaux,
  normaliserPasseUrbanisme, normaliserPasseCopropriete,
  validerPasseIdentification: validerListeGenerique('constats'),
  validerPasseDiagnostics: validerListeGenerique('diagnostics'),
  validerPasseTravaux: validerListeGenerique('travaux'),
  validerPasseUrbanisme: validerListeGenerique('constats'),
  validerPasseCopropriete: validerListeGenerique('copropriete')
};
