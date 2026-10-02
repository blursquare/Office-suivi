'use strict';

// Annuaire des notaires de France (demandé par l'étude le 02/10/2026 : « compléter le répertoire par
// tous les notaires de France classés par département »). Relevé de l'annuaire public immonot (liste
// des offices de chaque département, puis la fiche de chaque office pour ses notaires et ses bureaux
// secondaires) — même source que le carnet initial du 41 (carnetConfreres.js). Coordonnées
// professionnelles publiques, pas des données clients.
//
// Une RÉFÉRENCE en lecture seule, distincte du carnet des confrères : le carnet reste la liste des
// offices avec qui l'étude traite (modifiable, rapprochée des fiches) ; l'annuaire se consulte par
// département, et un office s'y « ajoute au carnet » d'un clic. Il n'est jamais renvoyé en entier
// au navigateur (≈ 6 000 offices) : par département, ou par recherche.

let donnees = null;
function charger() {
  if (donnees) return donnees;
  try {
    // require au chemin écrit en toutes lettres (et non fs ni path.join) : c'est ainsi qu'esbuild
    // embarque le JSON dans le .exe — un chemin calculé laisserait l'annuaire vide sans erreur.
    // eslint-disable-next-line global-require
    donnees = require('./data/annuaire-notaires.json');
  } catch (e) {
    donnees = { source: '', releveLe: '', offices: [] };
  }
  if (!Array.isArray(donnees.offices)) donnees.offices = [];
  return donnees;
}

// Noms des départements (codes de l'annuaire, outre-mer compris).
const DEPARTEMENTS = {
  '01': 'Ain', '02': 'Aisne', '03': 'Allier', '04': 'Alpes-de-Haute-Provence', '05': 'Hautes-Alpes',
  '06': 'Alpes-Maritimes', '07': 'Ardèche', '08': 'Ardennes', '09': 'Ariège', '10': 'Aube', '11': 'Aude',
  '12': 'Aveyron', '13': 'Bouches-du-Rhône', '14': 'Calvados', '15': 'Cantal', '16': 'Charente',
  '17': 'Charente-Maritime', '18': 'Cher', '19': 'Corrèze', '2A': 'Corse-du-Sud', '2B': 'Haute-Corse',
  '21': 'Côte-d’Or', '22': 'Côtes-d’Armor', '23': 'Creuse', '24': 'Dordogne', '25': 'Doubs', '26': 'Drôme',
  '27': 'Eure', '28': 'Eure-et-Loir', '29': 'Finistère', '30': 'Gard', '31': 'Haute-Garonne', '32': 'Gers',
  '33': 'Gironde', '34': 'Hérault', '35': 'Ille-et-Vilaine', '36': 'Indre', '37': 'Indre-et-Loire',
  '38': 'Isère', '39': 'Jura', '40': 'Landes', '41': 'Loir-et-Cher', '42': 'Loire', '43': 'Haute-Loire',
  '44': 'Loire-Atlantique', '45': 'Loiret', '46': 'Lot', '47': 'Lot-et-Garonne', '48': 'Lozère',
  '49': 'Maine-et-Loire', '50': 'Manche', '51': 'Marne', '52': 'Haute-Marne', '53': 'Mayenne',
  '54': 'Meurthe-et-Moselle', '55': 'Meuse', '56': 'Morbihan', '57': 'Moselle', '58': 'Nièvre', '59': 'Nord',
  '60': 'Oise', '61': 'Orne', '62': 'Pas-de-Calais', '63': 'Puy-de-Dôme', '64': 'Pyrénées-Atlantiques',
  '65': 'Hautes-Pyrénées', '66': 'Pyrénées-Orientales', '67': 'Bas-Rhin', '68': 'Haut-Rhin', '69': 'Rhône',
  '70': 'Haute-Saône', '71': 'Saône-et-Loire', '72': 'Sarthe', '73': 'Savoie', '74': 'Haute-Savoie',
  '75': 'Paris', '76': 'Seine-Maritime', '77': 'Seine-et-Marne', '78': 'Yvelines', '79': 'Deux-Sèvres',
  '80': 'Somme', '81': 'Tarn', '82': 'Tarn-et-Garonne', '83': 'Var', '84': 'Vaucluse', '85': 'Vendée',
  '86': 'Vienne', '87': 'Haute-Vienne', '88': 'Vosges', '89': 'Yonne', '90': 'Territoire de Belfort',
  '91': 'Essonne', '92': 'Hauts-de-Seine', '93': 'Seine-Saint-Denis', '94': 'Val-de-Marne', '95': 'Val-d’Oise',
  '971': 'Guadeloupe', '972': 'Martinique', '973': 'Guyane', '974': 'La Réunion', '975': 'Saint-Pierre-et-Miquelon',
  '976': 'Mayotte', '977': 'Saint-Barthélemy', '978': 'Saint-Martin', '987': 'Polynésie française',
  '988': 'Nouvelle-Calédonie'
};

function sansAccents(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Ordre des départements : numérique (2A et 2B entre 19 et 21), outre-mer à la fin.
function cleTri(code) {
  if (code === '2A') return 20.1;
  if (code === '2B') return 20.2;
  return Number(code) || 999;
}

// Les départements présents, avec leur nombre d'offices.
function departementsAnnuaire() {
  const n = {};
  for (const o of charger().offices) n[o.departement] = (n[o.departement] || 0) + 1;
  return Object.keys(n).sort((a, b) => cleTri(a) - cleTri(b))
    .map(code => ({ code, nom: DEPARTEMENTS[code] || code, offices: n[code] }));
}

// Les offices d'un département, par ville puis par nom.
function officesDepartement(code) {
  return charger().offices.filter(o => o.departement === String(code || ''))
    .sort((a, b) => (a.ville || '').localeCompare(b.ville || '', 'fr') || (a.office || '').localeCompare(b.office || '', 'fr'));
}

// Recherche dans toute la France : chaque mot doit se trouver dans l'office, un notaire, la ville,
// le code postal, un bureau ou l'email. `max` résultats au plus.
function chercherAnnuaire(texte, max = 50) {
  const mots = sansAccents(texte).split(/[^a-z0-9@.-]+/).filter(m => m.length >= 2);
  if (!mots.length) return [];
  const res = [];
  for (const o of charger().offices) {
    const botte = sansAccents([o.office, (o.notaires || []).join(' '), o.ville, o.codePostal, (o.bureaux || []).join(' '), o.email].join(' '));
    if (mots.every(m => botte.indexOf(m) !== -1)) {
      res.push(o);
      if (res.length >= max) break;
    }
  }
  return res;
}

// Tous les offices (reconnaissance d'un appelant par 3CX, en dernier recours).
function officesAnnuaire() {
  return charger().offices;
}

// Tests : remplace les données relevées.
function definirDonneesAnnuaire(d) {
  donnees = d && Array.isArray(d.offices) ? d : null;
}

function infosAnnuaire() {
  const d = charger();
  return { source: d.source || '', releveLe: d.releveLe || '', offices: d.offices.length };
}

module.exports = { definirDonneesAnnuaire, DEPARTEMENTS, departementsAnnuaire, officesDepartement, chercherAnnuaire, officesAnnuaire, infosAnnuaire, cleTri };
