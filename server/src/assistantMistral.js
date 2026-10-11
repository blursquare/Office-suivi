// @ts-check
'use strict';
// « Demander à CLAIRE » par l'API Mistral (étude 07/10 : « ok, on essaie », après le chiffrage — quelques dizaines de centimes
// par mois avec Mistral Small). Seule la PHRASE part, noms masqués avant l'envoi : noms, prénoms, noms d'usage, mots de l'adresse,
// de l'agence et des notaires des fiches, mots en capitales, mot qui suit une civilité, emails, téléphones et références Authentic
// sont remplacés par [NOM1], [EMAIL1]… (`pseudonymiserDemande`) ; la table de correspondance reste sur le serveur et les valeurs que
// l'IA recopie sont rétablies avant d'être relues par le code (`retablirTexte`). Aucune donnée de fiche dans le prompt.
// Même interface que le client Ollama (`verifierDisponibilite`, `genererJson`) : comprendreDemande ne voit pas la différence.

const A = require('../../commun/assistant');

const MODELE_ASSISTANT_MISTRAL = 'mistral-small-latest';
// Tarif de Mistral Small (début octobre 2026), en dollars par million de jetons, majoration de l'inférence dans l'UE comprise.
const TARIF_ASSISTANT_MISTRAL = { entree: 0.15, sortie: 0.6 };
const MAJORATION_UE = 1.1;
const DELAI_MISTRAL_MS = 20 * 1000;
const MAX_JETONS_MISTRAL = 400;
const CLE_USAGE = 'assistant-ia-usage';
const CLE_REGLAGES = 'assistant-ia';
// Claude en tête (étude 08/10 : « connecte Claude à Demander à CLAIRE pour toutes les requêtes ») ; voir assistantClaude.js.
const MOTEURS = ['claude', 'mistral', 'locale'];
// Usage tenu par moteur en ligne : clé de stockage et tarif (dollars par million de jetons, majoration comprise).
const USAGES = {
  mistral: { cle: CLE_USAGE },
  claude: { cle: 'assistant-ia-usage-claude' }
};
// Modèles Claude au choix (étude 08/10 : « je peux passer en Sonnet ou même Haiku ? ») — tarif en dollars par million de jetons
// (page des prix d'Anthropic relue le 08/10) ; `effort` : le modèle accepte `output_config.effort` (Haiku 4.5 : non envoyé).
const MODELES_CLAUDE_ASSISTANT = {
  'claude-sonnet-5': { libelle: 'Claude Sonnet 5', entree: 2, sortie: 10, effort: true },
  'claude-opus-5': { libelle: 'Claude Opus 5', entree: 5, sortie: 25, effort: true },
  'claude-haiku-4-5': { libelle: 'Claude Haiku 4.5', entree: 1, sortie: 5, effort: false }
};
const MODELE_CLAUDE_ASSISTANT_DEFAUT = 'claude-sonnet-5';
// Agent (étude 11/10 : « il faut que Demander à CLAIRE soit aussi intelligent que toi » ; choix : dossiers masqués, modèle au choix
// dans les Réglages, Opus par défaut) — assistantAgent.js. Tarif en dollars par million de jetons (lecture du cache : 0,1 × l'entrée,
// écriture : 1,25 ×). `secours` : le serveur d'Anthropic relance seul une demande refusée par ses filtres sur un autre modèle.
const MODELES_AGENT = {
  'claude-opus-5-5': { libelle: 'Claude Opus 5.5', entree: 4, sortie: 20, lectureCache: 0.2, secours: true },
  'claude-sonnet-5-5': { libelle: 'Claude Sonnet 5.5', entree: 2, sortie: 10, lectureCache: 0.2, secours: true },
  'claude-haiku-5-5': { libelle: 'Claude Haiku 5.5', entree: 0.1, sortie: 0.5, lectureCache: 0.01, secours: false }
};
const MODELE_AGENT_DEFAUT = 'claude-opus-5-5';
// Agent par Mistral (étude 11/10 : « idem pour Mistral ») : mêmes outils, même masquage. Tarif indicatif relevé le 11/10 (dollars par
// million de jetons) ; Large par défaut, le plus intelligent — et le moins cher des trois chez Mistral à cette date.
const MODELES_AGENT_MISTRAL = {
  'mistral-large-latest': { libelle: 'Mistral Large', entree: 0.5, sortie: 1.5 },
  'mistral-medium-latest': { libelle: 'Mistral Medium', entree: 0.4, sortie: 2 },
  'mistral-small-latest': { libelle: 'Mistral Small', entree: 0.15, sortie: 0.6 }
};
const MODELE_AGENT_MISTRAL_DEFAUT = 'mistral-large-latest';
const BASES = { eu: 'https://api.eu.mistral.ai', global: 'https://api.mistral.ai' };

// Sigles du métier gardés tels quels (ils disent l'intention, pas une personne).
// Mots courants en tête de phrase d'un texte libre (le reste, à majuscule en tête d'un long texte, est pris pour un nom).
const MOTS_COURANTS_TETE = new Set(['le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de', 'd', 'il', 'elle', 'ils', 'elles', 'ce', 'cet',
  'cette', 'ces', 'si', 'en', 'dans', 'pour', 'par', 'au', 'aux', 'avant', 'apres', 'lors', 'sous', 'sur', 'toute', 'tout', 'tous',
  'toutes', 'aucun', 'aucune', 'selon', 'le vendeur', 'vendeur', 'vendeurs', 'acquereur', 'acquereurs', 'promettant', 'beneficiaire',
  'attestation', 'fournir', 'remise', 'remettre', 'copie', 'justificatif', 'justifier', 'realiser', 'faire', 'obtenir', 'produire',
  'transmettre', 'communiquer', 'certificat', 'diagnostic', 'diagnostics', 'etat', 'releve', 'avis', 'titre', 'offre', 'piece', 'pieces',
  'dossier', 'email', 'mail', 'courrier', 'appel', 'projet', 'signature', 'rendez', 'date', 'delai', 'echeance', 'reponse', 'demande',
  'envoi', 'envoye', 'recu', 'recue', 'reception', 'fait', 'faite', 'pret', 'fonds', 'vente', 'acte', 'travaux', 'renonciation',
  'notification', 'mairie', 'commune', 'syndic', 'banque', 'agence', 'notaire', 'office', 'etude', 'nous', 'vous', 'je', 'on', 'merci',
  'bonjour', 'bonsoir', 'oui', 'non', 'ok', 'a', 'et', 'ou', 'mais', 'donc', 'car', 'puis', 'ensuite', 'enfin', 'deja', 'encore', 'jamais',
  'aujourd', 'hier', 'demain', 'ici', 'voici', 'voila', 'rien', 'quelle', 'quel', 'quels', 'quelles', 'qui', 'que', 'quoi', 'comment',
  'pourquoi', 'combien', 'est', 'sont', 'a-t-il', 'peux', 'pouvez', 'dois', 'devez', 'relancer', 'relance', 'rappeler', 'appeler',
  'ajouter', 'cocher', 'ouvrir', 'ouvre', 'prepare', 'preparer', 'envoie', 'envoyer', 'archive', 'archiver', 'cherche', 'chercher', 'trouve',
  'trouver', 'montre', 'liste', 'donne', 'dis', 'lance', 'place', 'placer', 'fixe', 'note', 'noter', 'mets', 'attribue', 'change',
  'explique', 'aide', 'rappelle', 'resume', 'compare', 'verifie', 'engagement', 'engagements', 'condition', 'conditions', 'clause',
  'observation', 'remarque', 'question', 'tache', 'taches', 'rappel', 'rappels', 'agenda', 'suivi', 'statut', 'probleme', 'attention']);
// Mots de CLAIRE écrits avec une majuscule au milieu d'une phrase, qui ne désignent personne.
const MOTS_MAJUSCULE_GARDES = new Set(['Agenda', 'Suivi', 'Réglages', 'Outils', 'Claire', 'Scan', 'Répertoire', 'Authentic', 'Outlook',
  'Teams', 'Exchange', 'Word', 'Excel', 'Mistral', 'Claude', 'Opus', 'Sonnet', 'Haiku', 'Large', 'Medium', 'Small', 'Ollama', 'Fichorga',
  'Demander', 'Tableau', 'Fonds', 'Pièces', 'Dossier', 'Historique', 'Échanges', 'Vendeur', 'Vendeurs', 'Acquéreur', 'Acquéreurs',
  'Notaire', 'Maître', 'Monsieur', 'Madame', 'Messieurs', 'Mesdames', 'Mademoiselle', 'Me', 'Mme', 'Mlle', 'Mr', 'Prêt', 'Signature',
  'Projet', 'Appel', 'Copropriété', 'Maison', 'Terrain', 'Succession', 'Vente', 'Donation', 'Promesse', 'Compromis', 'Acte',
  'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche', 'Aujourd', 'France', 'Internet', 'Visio', 'CDC',
  'Fait', 'Faite', 'Réponse', 'Renonciation', 'Certificat', 'Diagnostics', 'Avis', 'Titre', 'Offre', 'Relevé', 'Courrier', 'État',
  'Etat', 'Envoi', 'Rendez', 'Obtention', 'Date', 'Délai', 'Échéance', 'Urgent', 'Complet', 'Attente', 'Nouveau',
  // Collaborateurs de l'étude (pas des clients ; le prompt les nomme déjà) et outils / écrans de CLAIRE.
  'Bastien', 'Julie', 'Jérémy', 'Sophie', 'Quotités', 'Prorata', 'Provision', 'Décompte', 'Relecture', 'Contrôle', 'Urbanisme',
  'Rappels', 'Rappel', 'Préemption', 'Inventaire', 'Forfait', 'Mobilier', 'Simulateur', 'Arbitrage', 'Courriers', 'Tâches', 'Notes',
  'Modèles', 'Collaborateurs', 'Téléphonie', 'Sauvegarde', 'Mise', 'Général', 'Signalements', 'Activité', 'Statistiques', 'Avancement']);
const SIGLES = new Set(['VTE', 'SUCC', 'RIB', 'SAFER', 'DPU', 'DIA', 'PDF', 'TVA', 'TTC', 'HT', 'AF', 'NAS', 'CLAIRE', 'IA', 'EUR',
  'OK', 'RDV', 'SCI', 'SARL', 'PLU', 'CU', 'DPE', 'RHF', 'AAE', 'ECV', 'APR', 'JV', 'BA', 'JS', 'PJ', 'CDC',
  // Mots des pièces et des écrans que l'agent lit (11/10) : ce sont des sigles du métier, jamais des noms.
  'ERP', 'SRU', 'ABF', 'TEOM', 'ALUR', 'PLUI', 'ZAE', 'SAS', 'SASU', 'EURL', 'SNC', 'GFA', 'DP', 'PC', 'PA', 'DAACT', 'NAF', 'URSSAF',
  'MICEN', 'AR', 'LRAR', 'BAN', 'CNI', 'ICS', 'PDFA', 'ADNOV', 'TEAMS', 'EWS', 'SMS', 'TF', 'PV', 'RC', 'SA', 'UE', 'OK', 'PJ',
  'CU', 'IGN', 'INSEE', 'SIRET', 'SIREN', 'RCS', 'TTC', 'HT', 'N°', 'NB', 'CRIDON', 'SPF', 'SPFE', 'ID', 'AA', 'AAAA', 'MM', 'JJ', 'HH']);

/**
 * Réglages de l'assistant : moteur 'mistral' (par défaut, choix de l'étude 07/10) ou 'locale' ; `toutesDemandes` : Mistral lit
 * TOUTES les phrases, pas seulement celles que les mots-clés ne départagent pas. Vrai par défaut le matin du 07/10 (« active
 * Mistral de base pour voir »), FAUX depuis le soir (étude : clé gratuite, « limite de débit Mistral atteinte » — chaque phrase
 * comptait) ; se rallume dans Réglages › IA. Sans effet avec l'IA locale (trop lente sur le processeur du serveur). @param {any} brut
 */
function assainirReglagesAssistant(brut) {
  const b = brut && typeof brut === 'object' ? brut : {};
  return { moteur: MOTEURS.includes(b.moteur) ? b.moteur : 'claude', toutesDemandes: b.toutesDemandes === true,
    modeleClaude: MODELES_CLAUDE_ASSISTANT[b.modeleClaude] ? b.modeleClaude : MODELE_CLAUDE_ASSISTANT_DEFAUT,
    // L'agent (11/10) : allumé par défaut avec Claude ; le coupe revient à la compréhension d'une phrase d'avant.
    agent: b.agent !== false, modeleAgent: MODELES_AGENT[b.modeleAgent] ? b.modeleAgent : MODELE_AGENT_DEFAUT,
    modeleAgentMistral: MODELES_AGENT_MISTRAL[b.modeleAgentMistral] ? b.modeleAgentMistral : MODELE_AGENT_MISTRAL_DEFAUT };
}

// Révision des réglages enregistrés. 2 : un « toutes les demandes » gardé avant le 07/10 au soir (alors coché d'office) ne compte
// pas. 3 (étude 08/10) : un réglage d'avant passe à Claude, qui lit toutes les demandes.
const REVISION_REGLAGES_ASSISTANT = 3;

/**
 * Masque dans une phrase tout ce qui peut désigner une personne ou un dossier. `table` (Map jeton → texte d'origine) est complétée
 * et partagée entre la phrase, le libellé du dossier en consultation et les échanges précédents. Pure.
 * @param {string} texte @param {Set<string>} sensibles mots normalisés à masquer @param {Map<string, string>} table
 */
function masquer(texte, sensibles, table) {
  const parOrigine = new Map([...table].map(([jeton, origine]) => [origine.toLowerCase(), jeton]));
  const compteur = (prefixe) => [...table.keys()].filter((k) => k.startsWith('[' + prefixe)).length + 1;
  const jeton = (prefixe, origine) => {
    const deja = parOrigine.get(origine.toLowerCase());
    if (deja) return deja;
    const j = `[${prefixe}${compteur(prefixe)}]`;
    table.set(j, origine);
    parOrigine.set(origine.toLowerCase(), j);
    return j;
  };
  let t = String(texte || '');
  t = t.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => jeton('EMAIL', m));
  // IBAN avant les téléphones (un IBAN contient des suites qui ressemblent à un numéro).
  t = t.replace(/\b[A-Za-z]{2}\d{2}(?:[ ]?[A-Za-z0-9]{4}){3,7}(?:[ ]?[A-Za-z0-9]{1,4})?\b/g, (m) => jeton('NUM', m));
  // SIRET / SIREN et numéro fiscal écrits par groupes.
  t = t.replace(/\b\d{3}[ .]\d{3}[ .]\d{3}(?:[ .]\d{5})?\b/g, (m) => jeton('NUM', m));
  t = t.replace(/\b\d{2}[ .]\d{2}[ .]\d{3}[ .]\d{3}[ .]\d{3}\b/g, (m) => jeton('NUM', m));
  // Téléphones étrangers : +41 79 123 45 67, +32 470 12 34 56, +44 7700 900123…
  t = t.replace(/(?:\+|00)(?!33)\d{2,3}[\s.]?(?:\(0\)[\s.]?)?\d{1,4}(?:[\s./-]?\d{2,4}){2,5}/g, (m) => jeton('TEL', m));
  // Téléphones : 06 12 34 56 78, 06.12…, 06/12/…, +33 6…, +33 (0)6…, 0033 6…
  t = t.replace(/(?:(?:\+|00)33[\s.]?(?:\(0\)[\s.]?)?|0)[1-9](?:[\s./-]?\d{2}){4}/g, (m) => jeton('TEL', m));
  t = t.replace(/\b[A-Z]\s?\d{4}[\s-]?\d{4,6}\b/g, (m) => jeton('REF', m));
  t = t.replace(/\d{6,}/g, (m) => jeton('NUM', m));
  // Le mot qui suit une civilité est toujours un nom.
  // Les mots en majuscule qui suivent (prénom et nom, jusqu'à trois) aussi : « Monsieur Paul Martin ».
  t = t.replace(/\b(Monsieur|Madame|Mademoiselle|Messieurs|Mesdames|Maître|Me|Mme|Mlle|Mr|M\.)(\s+)([A-ZÀ-Ý][A-Za-zÀ-ÿ'-]+)((?:[ \t]+[A-ZÀ-Ý][A-Za-zÀ-ÿ'-]+){0,2})/g,
    (m, civ, esp, nom, suite) => {
      if (/^\[/.test(nom)) return m;
      const reste = String(suite || '').replace(/[A-ZÀ-Ý][A-Za-zÀ-ÿ'-]+/g, (mot) => jeton('NOM', mot));
      return civ + esp + jeton('NOM', nom) + reste;
    });
  // Un mot est masqué si l'un de ses morceaux (tirets, apostrophe : « Dupont-Martin », « l'Agenda ») est un mot des fiches, est
  // écrit en capitales (deux lettres au moins, hors sigles du métier), ou commence par une majuscule AILLEURS qu'en tête de phrase
  // (un nom propre : un tiers cité dans un engagement, un prénom dans la phrase, un lieu-dit) — sauf les mots de CLAIRE gardés.
  t = t.replace(/\[(?:NOM|EMAIL|TEL|REF|NUM)\d+\]|[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’-]*/g, (mot, position, tout) => {
    if (mot.startsWith('[')) return mot;
    const avant = String(tout).slice(0, position).replace(/[\s\u00a0]+$/, '');
    // Tête de phrase : début du texte, après « . ! ? » ou un retour à la ligne (pas après « : ( « • » — un nom y suit souvent).
    const enTete = !avant || /[.!?]$/.test(avant) || /\n\s*$/.test(String(tout).slice(0, position));
    // Dans un texte libre (engagement, historique), un mot à majuscule en tête de phrase n'est gardé que s'il est un mot courant.
    const texteLibre = String(tout).length > 40;
    const suite = String(tout).slice(position + mot.length);
    const morceaux = mot.split(/['’-]/).filter(Boolean);
    const sensible = morceaux.some((m, i) => {
      const n = A.normaliserDemande(m).replace(/^[^a-z]+|[^a-z]+$/g, '');
      if (n.length >= 2 && sensibles.has(n)) return true;
      if (parOrigine.has(m.toLowerCase())) return true;          // déjà masqué ailleurs dans la conversation
      if (SIGLES.has(m) || MOTS_MAJUSCULE_GARDES.has(m)) return false;
      // Capitales (deux lettres au moins) : un nom — sauf une section cadastrale (« AB 123 »).
      if (m.length >= 2 && m === m.toUpperCase() && /[A-ZÀ-Ý]/.test(m) && !/^(?:[LDJNSMTC]|QU)$/.test(m)) return !(m.length === 2 && /^\s*\d/.test(suite));
      if (!/^[A-ZÀ-Ý][a-zà-ÿ]/.test(m)) return false;
      const tete = enTete && (i === 0 || (i === 1 && /^[LDlds]$/.test(morceaux[0])));
      if (!tete) return true;
      return texteLibre && !MOTS_COURANTS_TETE.has(n);
    });
    return sensible ? jeton('NOM', mot) : mot;
  });
  return t;
}

/**
 * Pseudonymise la demande avant l'envoi à Mistral. `dossiers` : la liste reçue du poste (noms, parties, autres, contacts).
 * @param {string} texte
 * @param {{ dossierLibelle?: string, historique?: Array<{ texte?: string, intention?: string }> }} contexte
 * @param {Array<any>} dossiers
 */
function pseudonymiserDemande(texte, contexte, dossiers) {
  const sensibles = motsSensiblesDossiers(dossiers);
  const table = new Map();
  const c = contexte || {};
  return {
    texte: masquer(texte, sensibles, table),
    contexte: {
      ...c,
      dossierLibelle: c.dossierLibelle ? masquer(c.dossierLibelle, sensibles, table) : '',
      historique: (c.historique || []).map((h) => ({ ...h, texte: masquer((h && h.texte) || '', sensibles, table) }))
    },
    table
  };
}

/**
 * Les mots à masquer tirés des fiches reçues du poste (noms, prénoms, noms d'usage, mots de l'adresse, de l'agence, des notaires),
 * moins les mots du métier. Pure. @param {Array<any>} dossiers @returns {Set<string>}
 */
function motsSensiblesDossiers(dossiers) {
  const sensibles = new Set();
  // Noms de famille de deux lettres (LY, VO, LE…) : gardés, sauf les petits mots du français qui ne désignent personne.
  const PETITS = new Set(['de', 'du', 'la', 'le', 'les', 'et', 'en', 'un', 'au', 'aux', 'a', 'd', 'l', 'y', 'o']);
  const court = (s) => A.normaliserDemande(String(s || '')).split(/[^a-z]+/).forEach((m) => { if (m.length === 2 && !PETITS.has(m)) sensibles.add(m); });
  for (const d of dossiers || []) for (const p of (d && Array.isArray(d.parties) ? d.parties : [])) { court(p && p.nom); court(p && p.nomUsage); }
  const ajouter = (s) => A.normaliserDemande(String(s || '')).split(/[^a-z0-9-]+/).forEach((m) => {
    m.split('-').concat(m).forEach((x) => { if (x.length >= 3 && !/^\d+$/.test(x)) sensibles.add(x); });
  });
  for (const d of dossiers || []) {
    if (!d) continue;
    ajouter(String(d.nom || '').replace(/\b(VTE|SUCC|VENTE|SUCCESSION)\b/gi, ' '));
    for (const p of Array.isArray(d.parties) ? d.parties : []) { ajouter(p && p.nom); ajouter(p && p.prenom); ajouter(p && p.nomUsage); }
    for (const a of Array.isArray(d.autres) ? d.autres : []) ajouter(String(a || '').replace(/\b(rue|avenue|chemin|route|allee|allée|impasse|boulevard|place|quai|lieu-dit|des|du|de|la|le|les|et|maitre|maître|agence|immobilier|immobiliere|immobilière|notaires?|office)\b/gi, ' '));
  }
  // Mots du métier jamais masqués, même s'ils figurent dans une fiche (une rue « du Prêt », une agence « Projet Immo »).
  // Seuls les mots écrits en minuscules dans les exemples comptent : MARTIN, Lices, Blois y sont des noms.
  A.INTENTIONS_ASSISTANT.forEach((i) => (i.exemples || []).forEach((ex) => (String(ex).match(/[A-Za-zÀ-ÿ'’-]+/g) || [])
    .filter((m) => m === m.toLowerCase()).forEach((m) => A.normaliserDemande(m).split(/[^a-z]+/)
      .filter((x) => x.length >= 3).forEach((x) => sensibles.delete(x)))));
  ['pret', 'fonds', 'appel', 'projet', 'signature', 'rendez', 'vous', 'agenda', 'dossier', 'vendeur', 'acquereur', 'notaire',
    'demain', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'offre', 'piece', 'pieces', 'envoye', 'email', 'mail',
    'bis', 'ter', 'quater'].forEach((m) => sensibles.delete(m));
  return sensibles;
}

/**
 * Masque les montants (« 250 000 € », « 1.200,50 euros », « 12 000 ») d'un texte libre : un prix n'a pas à quitter le serveur. Utilisé par
 * l'échange libre (assistantConversation.js), où la phrase n'est pas bornée à une demande de dossier. `table` est complétée. Pure.
 * @param {string} texte @param {Map<string, string>} table
 */
function masquerMontants(texte, table) {
  let n = [...table.keys()].filter((k) => k.startsWith('[MONTANT')).length;
  const jeton = (origine) => { n += 1; const j = `[MONTANT${n}]`; table.set(j, origine); return j; };
  return String(texte || '')
    .replace(/\d[\d\s.,\u00a0\u202f]*\d?\s?(?:€|eur(?:os?)?)(?![A-Za-zÀ-ÿ])/gi, (m) => jeton(m))
    .replace(/(?<![\d.,])\d{1,3}(?:[\u00a0\u202f .]\d{3})+(?:,\d{1,2})?(?![\d.])/g, (m) => jeton(m));
}

/** Rétablit les valeurs masquées dans un texte rendu par l'IA. Pure. @param {string} texte @param {Map<string, string>} table */
function retablirTexte(texte, table) {
  return String(texte || '').replace(/\[(?:NOM|EMAIL|TEL|REF|NUM|MONTANT)\d+\]/g, (j) => table.get(j) || j);
}

/** Coût en dollars d'un nombre de jetons d'un modèle Claude. Pure. @param {number} entree @param {number} sortie @param {string} modele */
function coutClaudeUsd(entree, sortie, modele) {
  const t = MODELES_CLAUDE_ASSISTANT[modele] || MODELES_CLAUDE_ASSISTANT[MODELE_CLAUDE_ASSISTANT_DEFAUT];
  return ((entree || 0) * t.entree + (sortie || 0) * t.sortie) / 1e6;
}

/** Coût en dollars d'un nombre de jetons (Mistral). Pure. @param {number} entree @param {number} sortie */
function coutAssistantUsd(entree, sortie) {
  return Math.round(((entree || 0) * TARIF_ASSISTANT_MISTRAL.entree + (sortie || 0) * TARIF_ASSISTANT_MISTRAL.sortie) * MAJORATION_UE / 1e6 * 10000) / 10000;
}

/** Usage du mois en cours (demandes, jetons, coût estimé). @param {any} parametresRepo @param {Date} [maintenant] @param {string} [moteur] */
function lireUsageAssistant(parametresRepo, maintenant, moteur) {
  const mois = (maintenant || new Date()).toISOString().slice(0, 7);
  const u = parametresRepo.lireJsonBrut((USAGES[moteur || 'mistral'] || USAGES.mistral).cle, {}) || {};
  const courant = u.mois === mois ? u : { mois, demandes: 0, entree: 0, sortie: 0, erreurs: 0 };
  // Claude : le coût est cumulé à chaque demande (le modèle peut changer en cours de mois). Mistral : aussi depuis l'agent (11/10,
  // modèles à tarifs différents) ; un mois d'avant sans coût cumulé est estimé au tarif de Mistral Small.
  const cout = moteur === 'claude' || courant.coutUsd ? Math.round((courant.coutUsd || 0) * 10000) / 10000 : coutAssistantUsd(courant.entree, courant.sortie);
  return { ...courant, coutUsd: cout, precedent: u.mois !== mois && u.mois ? u : (u.precedent || null) };
}

/** @param {any} parametresRepo @param {{ entree?: number, sortie?: number, erreur?: boolean, coutUsd?: number, tour?: boolean }} ajout @param {Date} [maintenant] @param {string} [moteur] */
function noterUsageAssistant(parametresRepo, ajout, maintenant, moteur) {
  const mois = (maintenant || new Date()).toISOString().slice(0, 7);
  const CLE_USAGE = (USAGES[moteur || 'mistral'] || USAGES.mistral).cle;
  const u = parametresRepo.lireJsonBrut(CLE_USAGE, {}) || {};
  const precedent = u.mois && u.mois !== mois ? { mois: u.mois, demandes: u.demandes || 0, entree: u.entree || 0, sortie: u.sortie || 0 } : (u.precedent || null);
  const base = u.mois === mois ? u : { mois, demandes: 0, entree: 0, sortie: 0, erreurs: 0 };
  parametresRepo.ecrireJsonBrut(CLE_USAGE, {
    mois, precedent,
    // Un tour d'outils de l'agent n'est pas une demande de plus : seule sa réponse finale compte.
    demandes: (base.demandes || 0) + (ajout.erreur || ajout.tour ? 0 : 1),
    erreurs: (base.erreurs || 0) + (ajout.erreur ? 1 : 0),
    entree: (base.entree || 0) + (ajout.entree || 0),
    sortie: (base.sortie || 0) + (ajout.sortie || 0),
    coutUsd: (base.coutUsd || 0) + (ajout.coutUsd || 0)
  });
}

/**
 * Client Mistral à l'interface du client Ollama. `cle` vide → indisponible. Un seul essai, 20 s au plus, JSON obligatoire.
 * @param {{ cle: string, region?: string, fetchFn?: Function, parametresRepo?: any }} o
 */
function creerClientMistralAssistant({ cle, region, fetchFn, parametresRepo }) {
  const f = /** @type {any} */ (fetchFn || fetch);
  const base = BASES[region === 'global' ? 'global' : 'eu'];
  return {
    modele: MODELE_ASSISTANT_MISTRAL,
    moteur: 'mistral',
    async verifierDisponibilite() {
      return cle ? { disponible: true, raison: '' } : { disponible: false, raison: 'Aucune clé Mistral : à saisir dans Réglages › IA et relecture d’actes.' };
    },
    /** @param {string} prompt @param {(o: any) => string|null} valider @param {{ longueurMax?: number }} [limites] */
    async genererJson(prompt, valider, limites) {
      let r;
      try {
        r = await f(`${base}/v1/chat/completions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            // 400 jetons au moins (07/10 : « Mistral ne répond pas ») : à 160, Mistral qui recopie le gabarit du JSON
            // (« <pret|rib|…> ») était coupé avant la fin — réponse illisible, repli sur les mots-clés à chaque phrase.
            model: MODELE_ASSISTANT_MISTRAL, temperature: 0.1, max_tokens: Math.max(MAX_JETONS_MISTRAL, (limites && limites.longueurMax) || 0),
            response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }]
          }),
          signal: AbortSignal.timeout(DELAI_MISTRAL_MS)
        });
      } catch (err) {
        if (parametresRepo) noterUsageAssistant(parametresRepo, { erreur: true });
        throw new Error(err && (err.name === 'TimeoutError' || err.name === 'AbortError') ? 'Mistral n’a pas répondu en 20 s' : 'Mistral injoignable depuis le serveur');
      }
      if (!r.ok) {
        if (parametresRepo) noterUsageAssistant(parametresRepo, { erreur: true });
        throw new Error(r.status === 401 ? 'clé Mistral refusée' : r.status === 429 ? 'limite de débit Mistral atteinte' : `Mistral a répondu ${r.status}`);
      }
      const corps = await r.json().catch(() => ({}));
      const usage = corps && corps.usage ? corps.usage : {};
      if (parametresRepo) noterUsageAssistant(parametresRepo, { entree: usage.prompt_tokens || 0, sortie: usage.completion_tokens || 0, coutUsd: ((usage.prompt_tokens || 0) * TARIF_ASSISTANT_MISTRAL.entree + (usage.completion_tokens || 0) * TARIF_ASSISTANT_MISTRAL.sortie) * MAJORATION_UE / 1e6 });
      const choix = corps && corps.choices && corps.choices[0];
      const contenu = choix && choix.message ? choix.message.content : '';
      // Un JSON entouré de ```json … ``` reste lisible ; une réponse coupée par la limite de jetons est dite comme telle.
      const brut = String(typeof contenu === 'string' ? contenu : '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      let objet;
      try { objet = JSON.parse(brut); } catch (_) {
        throw new Error(choix && choix.finish_reason === 'length' ? 'réponse de Mistral coupée (trop longue)' : 'réponse de Mistral illisible');
      }
      const probleme = valider ? valider(objet) : null;
      if (probleme) throw new Error(`réponse de Mistral hors format (${probleme})`);
      return objet;
    }
  };
}

module.exports = {
  MODELES_AGENT, MODELE_AGENT_DEFAUT, MODELES_AGENT_MISTRAL, MODELE_AGENT_MISTRAL_DEFAUT, BASES, masquer, motsSensiblesDossiers,
  REVISION_REGLAGES_ASSISTANT, MODELE_ASSISTANT_MISTRAL, MODELES_CLAUDE_ASSISTANT, MODELE_CLAUDE_ASSISTANT_DEFAUT, coutClaudeUsd, CLE_REGLAGES, MOTEURS, assainirReglagesAssistant, pseudonymiserDemande, retablirTexte, masquerMontants,
  coutAssistantUsd, lireUsageAssistant, noterUsageAssistant, creerClientMistralAssistant
};
