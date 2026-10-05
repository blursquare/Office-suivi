'use strict';

// Comptes Exchange des collaborateurs (étude 05/10 : « permettre d'ajouter les adresses et mots de passe des collaborateurs pour
// surveiller les emails envoyés et leur permettre d'envoyer des emails aussi »). Avec son propre identifiant et mot de passe,
// CLAIRE lit les « Éléments envoyés » d'un collaborateur et envoie depuis SA boîte — sans accès délégué « Relecteur » ni droit
// « Envoyer en tant que » à demander à Fichorga. Sans compte enregistré, rien ne change (compte relié + accès délégué).
//
// Secrets (règle n° 6) : stockés en base (clé `comptes-collaborateurs`), JAMAIS renvoyés par une route (un booléen « enregistré »),
// conservés si le formulaire ne les réémet pas, effacés sur chaîne vide explicite, jamais journalisés ni repris dans un message.
// Disjoncteur par compte : un refus d'identifiants (401/403) retient le compte (`refuseLe`) et plus aucun essai n'est fait avec
// lui tant que l'identifiant ou le mot de passe n'a pas été réécrit ou testé avec succès (chaque essai raté compte comme une
// tentative échouée et plusieurs verrouillent le compte).

const { COLLABORATEURS_ABSENCE } = require('./agendaOffice');

const CLE_COMPTES_COLLABORATEURS = 'comptes-collaborateurs';
const NOMS_COLLABORATEURS = COLLABORATEURS_ABSENCE.map((c) => c.nom);

const texte = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Pure : assainit la valeur lue en base. Noms hors de la liste fermée écartés ; une entrée sans identifiant ni mot de passe aussi.
function assainirComptes(brut) {
  const sortie = {};
  const source = brut && typeof brut === 'object' && !Array.isArray(brut) ? brut : {};
  for (const nom of NOMS_COLLABORATEURS) {
    const c = source[nom];
    if (!c || typeof c !== 'object') continue;
    const identifiant = texte(c.identifiant, 200);
    const motDePasse = typeof c.motDePasse === 'string' ? c.motDePasse.slice(0, 500) : '';
    if (!identifiant && !motDePasse) continue;
    const entree = { identifiant, motDePasse };
    if (typeof c.refuseLe === 'string' && !Number.isNaN(Date.parse(c.refuseLe))) entree.refuseLe = new Date(c.refuseLe).toISOString();
    sortie[nom] = entree;
  }
  return sortie;
}

function lireComptes(parametresRepo) {
  const brut = parametresRepo && parametresRepo.lireJsonBrut ? parametresRepo.lireJsonBrut(CLE_COMPTES_COLLABORATEURS, {}) : {};
  return assainirComptes(brut);
}

function ecrireComptes(parametresRepo, comptes) {
  if (parametresRepo && parametresRepo.ecrireJsonBrut) parametresRepo.ecrireJsonBrut(CLE_COMPTES_COLLABORATEURS, assainirComptes(comptes));
}

// Pure : ce que les routes peuvent renvoyer — jamais le mot de passe.
function comptesPublics(comptes) {
  const sortie = {};
  for (const [nom, c] of Object.entries(comptes || {})) {
    sortie[nom] = { identifiant: c.identifiant || '', motDePasseEnregistre: !!c.motDePasse, refuseLe: c.refuseLe || null };
  }
  return sortie;
}

// Écriture d'un compte : `identifiant` toujours pris tel qu'envoyé ; `motDePasse` absent (undefined) = on garde celui en base, chaîne
// vide = on l'efface, sinon on le remplace. Tout changement lève le disjoncteur. Rend le compte public, ou null s'il n'y a plus rien.
function ecrireCompte(parametresRepo, nom, corps) {
  if (!NOMS_COLLABORATEURS.includes(nom)) return { erreur: 'Collaborateur inconnu.' };
  const b = corps && typeof corps === 'object' ? corps : {};
  const comptes = lireComptes(parametresRepo);
  const avant = comptes[nom] || { identifiant: '', motDePasse: '' };
  const identifiant = texte(b.identifiant, 200);
  const motDePasse = typeof b.motDePasse === 'string' ? b.motDePasse.slice(0, 500) : avant.motDePasse;
  if (!identifiant && !motDePasse) delete comptes[nom];
  else comptes[nom] = { identifiant, motDePasse };
  ecrireComptes(parametresRepo, comptes);
  return { compte: comptesPublics(comptes)[nom] || null };
}

function retirerCompte(parametresRepo, nom) {
  const comptes = lireComptes(parametresRepo);
  delete comptes[nom];
  ecrireComptes(parametresRepo, comptes);
}

function marquerRefus(parametresRepo, nom, maintenant) {
  const comptes = lireComptes(parametresRepo);
  if (!comptes[nom]) return;
  comptes[nom].refuseLe = new Date(maintenant || Date.now()).toISOString();
  ecrireComptes(parametresRepo, comptes);
}

function leverRefus(parametresRepo, nom) {
  const comptes = lireComptes(parametresRepo);
  if (!comptes[nom] || !comptes[nom].refuseLe) return;
  delete comptes[nom].refuseLe;
  ecrireComptes(parametresRepo, comptes);
}

// Pure : l'identifiant de connexion d'un collaborateur — celui saisi, à défaut son adresse des Réglages › Collaborateurs.
function identifiantDe(compte, adresseReglages) {
  return (compte && compte.identifiant) || String(adresseReglages || '').trim();
}

// Les identifiants à utiliser pour ce collaborateur, ou null : compte enregistré complet et non retenu après un refus.
// `adresseReglages` = son adresse de Réglages › Collaborateurs (identifiant par défaut).
function accesCollaborateur(parametresRepo, nom, adresseReglages) {
  const c = lireComptes(parametresRepo)[nom];
  if (!c || !c.motDePasse || c.refuseLe) return null;
  const email = identifiantDe(c, adresseReglages);
  return email ? { email, motDePasse: c.motDePasse, nom } : null;
}

module.exports = {
  CLE_COMPTES_COLLABORATEURS, NOMS_COLLABORATEURS, assainirComptes, lireComptes, comptesPublics, ecrireCompte, retirerCompte,
  marquerRefus, leverRefus, identifiantDe, accesCollaborateur
};
