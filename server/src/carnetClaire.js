// @ts-check
'use strict';
// Carnet de consignes de CLAIRE — « CLAIRE.md » (étude 18/10 : « le carnet de consignes pour toute l'étude, un fichier comme
// Claude.md » ; « que CLAIRE puisse tout comprendre et s'adapter »). Un document Markdown unique pour l'étude, gardé en base (clé
// `carnet-claire`, 20 versions précédentes), lu par l'agent de « Demander à CLAIRE » avant chaque conversation. Modifié dans
// Réglages › Consignes de CLAIRE ou par le bouton « Corriger » sous une réponse. Jamais un nom de client ni de dossier : une
// consigne qui en cite un est refusée (`motsNominatifs`) ; à l'envoi, les mots des fiches qui s'y trouveraient malgré tout sont
// masqués comme le reste (`masquerCarnet`).

const A = require('../../commun/assistant');
const { motsSensiblesDossiers } = require('./assistantMistral');

const CLE_CARNET = 'carnet-claire';
const MAX_CARNET = 60000;
const MAX_CONSIGNE = 600;
const MAX_VERSIONS = 20;
const MAX_CARNET_AGENT = 20000;
const TITRE_CORRECTIONS = "## Corrections de l'étude";

const CARNET_INITIAL = "# CLAIRE.md — consignes de l'étude\n\nCe carnet est lu par CLAIRE avant chaque demande faite dans « Demander à CLAIRE ». Il vaut pour toute l'étude.\nÉcrivez des règles générales, jamais le nom d'un client ni d'un dossier. Une ligne = une consigne.\n\n## Ton et formules\n- Vouvoyer toujours, avec chaleur et naturel ; aller à l'essentiel.\n- Ne jamais écrire « Sauf erreur de ma part » ni « Sauf erreur de notre part ».\n- Au confrère : « Mon Cher Maître, … Votre bien dévoué. »\n\n## Vocabulaire de l'étude\n- « Appel de fonds » : le courrier envoyé à l'acquéreur avec le décompte, 10 jours avant la signature.\n- « Le commun » : le NAS de l'étude, où sont rangés les dossiers clients.\n- « Authentic » : le logiciel de rédaction des actes ; ses données font foi sur la fiche.\n\n## Règles de l'étude\n- Rendez-vous de signature : jamais à 9 h, ni entre 12 h et 14 h, ni après 18 h ; 6 rendez-vous par jour au plus.\n- Seule Maître GOSSART reçoit les actes.\n- Une DIA n'est jamais renoncée tacitement : le rendez-vous ne se place qu'avec la renonciation reçue.\n- Aucun email au client ne part sans un clic sur « Envoyer ».\n\n## Corrections de l'étude\n<!-- Les consignes ajoutées par le bouton « Corriger » sous une réponse de CLAIRE arrivent ici, datées. -->";

// Mots de l'étude et de CLAIRE jamais pris pour un nom de client (ils figurent aussi dans des fiches : un prénom « Claire », une
// adresse à Blois, le nom de l'office).
const MOTS_ETUDE = new Set(['claire', 'gossart', 'sophie', 'bastien', 'anglument', 'julie', 'vasselin', 'jeremy', 'saujot', 'blois',
  'authentic', 'maitre', 'notaire', 'notaires', 'office', 'etude', 'vente', 'succession', 'dossier', 'dossiers', 'agence',
  // Petits mots, formes juridiques et mots d'usage que portent des noms de dossiers (« SCI LES TILLEULS », « Consorts X ») :
  // relecture 0.280.0 — sans eux, le texte de départ lui-même était refusé.
  'les', 'des', 'aux', 'sur', 'sous', 'pour', 'par', 'avec', 'sci', 'sarl', 'sas', 'sasu', 'eurl', 'scp', 'snc', 'selarl', 'scea', 'gaec',
  'earl', 'commune', 'societe', 'consorts', 'consort', 'epoux', 'indivision', 'ville', 'mairie', 'association', 'immobiliere', 'immobilier',
  'veuve', 'veuf', 'epouse', 'nee', 'divorce', 'divorcee', 'promesse', 'avenant', 'succ', 'vte']);

/** @param {any} t */
function assainirTexteCarnet(t) {
  return String(t == null ? '' : t).replace(/\r\n?/g, '\n').replace(/\u0000/g, '').slice(0, MAX_CARNET);
}

/** Le carnet de l'étude (le texte de départ tant que personne ne l'a enregistré). @param {any} repo */
function lireCarnet(repo) {
  const b = repo && repo.lireJsonBrut ? repo.lireJsonBrut(CLE_CARNET, null) : null;
  if (!b || typeof b.texte !== 'string') return { texte: CARNET_INITIAL, maj: '', auteur: '', initial: true, versions: [] };
  return { texte: b.texte, maj: String(b.maj || ''), auteur: String(b.auteur || ''), initial: false,
    versions: Array.isArray(b.versions) ? b.versions.slice(0, MAX_VERSIONS) : [] };
}

/** Enregistre le carnet ; la version d'avant est gardée (20 au plus). @param {any} repo @param {string} texte @param {string} auteur @param {number} [maintenant] */
function ecrireCarnet(repo, texte, auteur, maintenant) {
  const avant = lireCarnet(repo);
  const versions = avant.initial ? [] : [{ texte: avant.texte, maj: avant.maj, auteur: avant.auteur }, ...avant.versions].slice(0, MAX_VERSIONS);
  const nouveau = { texte: assainirTexteCarnet(texte), maj: new Date(maintenant || Date.now()).toISOString(), auteur: String(auteur || '').slice(0, 60), versions };
  repo.ecrireJsonBrut(CLE_CARNET, nouveau);
  return nouveau;
}

/**
 * Pure : le carnet avec une consigne de plus, datée, à la fin de la section des corrections (créée si elle manque).
 * @param {string} texte @param {string} consigne @param {string} auteur @param {string} dateIso AAAA-MM-JJ
 */
function ajouterConsigne(texte, consigne, auteur, dateIso) {
  const c = String(consigne || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CONSIGNE);
  if (!c) return String(texte || '');
  const [a, m, j] = String(dateIso || '').split('-');
  const ligne = `- ${j && m && a ? `${j}/${m}/${a}` : ''}${auteur ? ` (${String(auteur).slice(0, 40)})` : ''} : ${c}`.replace(/^- {2}/, '- ').replace(/^- : /, '- ');
  const t = String(texte || '').replace(/\s+$/, '');
  const i = t.indexOf(TITRE_CORRECTIONS);
  if (i < 0) return `${t}\n\n${TITRE_CORRECTIONS}\n${ligne}\n`;
  // Fin de la section : le titre « ## » suivant, sinon la fin du carnet.
  const suite = t.slice(i + TITRE_CORRECTIONS.length);
  const k = suite.search(/\n#{1,2} /);
  if (k < 0) return `${t}\n${ligne}\n`;
  const fin = i + TITRE_CORRECTIONS.length + k;
  return `${t.slice(0, fin).replace(/\s+$/, '')}\n${ligne}\n${t.slice(fin)}\n`;
}

/**
 * Pure : les noms de clients et de dossiers cités dans un texte (noms des dossiers, noms et noms d'usage des parties ; trois lettres
 * au moins ; jamais un mot de l'étude). Rend les mots trouvés, tels qu'écrits dans le texte.
 * @param {string} texte @param {any[]} dossiers
 */
function motsNominatifs(texte, dossiers) {
  // Les mots que l'agent masque déjà (mots du métier retirés), sans les prénoms : « Paul » ou « Claire » écrits dans une règle ne
  // désignent personne.
  const pourNoms = (dossiers || []).filter(Boolean).map((d) => ({ nom: d.nom,
    parties: (Array.isArray(d.parties) ? d.parties : []).map((p) => ({ nom: p && p.nom, nomUsage: p && p.nomUsage })) }));
  const noms = new Set([...motsSensiblesDossiers(pourNoms)].filter((x) => x.length >= 3 && !/^\d+$/.test(x) && !MOTS_ETUDE.has(x)));
  const trouves = new Set();
  // Seul un mot écrit comme un nom (majuscule initiale ou capitales) est refusé : un client PETIT ne bloque pas « un petit rappel »
  // (le mot partirait de toute façon masqué).
  for (const mot of (String(texte || '').match(/\p{L}[\p{L}\p{M}'’-]*/gu) || []).filter((m) => /^\p{Lu}/u.test(m))) {
    for (const morceau of mot.split(/['’-]/)) if (noms.has(A.normaliserDemande(morceau))) trouves.add(mot);
  }
  return [...trouves];
}

/**
 * Pure : le carnet tel que l'agent le reçoit — commentaires HTML retirés, borné ; emails, téléphones et mots des fiches remplacés par
 * des codes de la conversation (même table que le reste : rétablis au retour).
 * @param {string} texte @param {Set<string>} sensibles @param {Map<string, string>} table
 */
function masquerCarnet(texte, sensibles, table) {
  let t = String(texte || '').replace(/<!--[\s\S]*?-->/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_CARNET_AGENT);
  const parOrigine = new Map([...table].map(([jeton, origine]) => [origine.toLowerCase(), jeton]));
  const jeton = (prefixe, origine) => {
    const deja = parOrigine.get(origine.toLowerCase());
    if (deja) return deja;
    const n = [...table.keys()].filter((k) => k.startsWith('[' + prefixe)).length + 1;
    const j = `[${prefixe}${n}]`;
    table.set(j, origine); parOrigine.set(origine.toLowerCase(), j);
    return j;
  };
  t = t.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => jeton('EMAIL', m));
  t = t.replace(/\b[A-Za-z]{2}\d{2}(?:\s?[A-Za-z0-9]{4}){3,7}(?:\s?[A-Za-z0-9]{1,3})?\b/g, (m) => jeton('REF', m));
  t = t.replace(/\bA\s?20\d{2}\s?\d{5}\b/g, (m) => jeton('REF', m));
  t = t.replace(/(?:(?:\+|00)33[\s.]?(?:\(0\)[\s.]?)?|0)[1-9](?:[\s./-]?\d{2}){4}/g, (m) => jeton('TEL', m));
  t = t.replace(/\d(?:[\s.]?\d){5,}/g, (m) => (/^\d{4}$/.test(m.replace(/\D/g, '')) ? m : jeton('NUM', m)));
  // Un mot après une civilité (« Monsieur Zorglub », « Mme Durand ») : un tiers absent des fiches ; jamais un nom de l'étude.
  // Jusqu'à trois mots à majuscule (« Monsieur Jean DURAND »), un confrère (« Maître X ») compris.
  t = t.replace(/(^|[^\p{L}])(Monsieur|Madame|Mademoiselle|Ma[iî]tre|Me|M\.|Mme|Mlle|Messieurs|Mesdames)((?:[ \t]+\p{Lu}[\p{L}\p{M}'’-]*){1,3})/gu, (m, avant, civ, noms) =>
    avant + civ + noms.replace(/\p{Lu}[\p{L}\p{M}'’-]*/gu, (nom) => (MOTS_ETUDE.has(A.normaliserDemande(nom)) ? nom : jeton('NOM', nom))));
  // Mots des fiches, morceaux d'un nom à apostrophe ou à tiret compris (« L'HERMITE », « MARTIN-DUPONT »).
  t = t.replace(/\[(?:NOM|EMAIL|TEL|REF|NUM)\d+\]|\p{L}[\p{L}\p{M}'’-]*/gu, (mot) => {
    if (mot.startsWith('[')) return mot;
    const sensible = (x) => { const n = A.normaliserDemande(x); return n.length >= 2 && !MOTS_ETUDE.has(n) && !!sensibles && sensibles.has(n); };
    return sensible(mot) || mot.split(/['’-]/).some((m) => m.length >= 3 && sensible(m)) ? jeton('NOM', mot) : mot;
  });
  return t;
}

module.exports = { CLE_CARNET, CARNET_INITIAL, MAX_CARNET, MAX_CONSIGNE, TITRE_CORRECTIONS, assainirTexteCarnet, lireCarnet, ecrireCarnet,
  ajouterConsigne, motsNominatifs, masquerCarnet };
