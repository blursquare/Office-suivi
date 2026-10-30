// @ts-check
'use strict';
// CLAIRE dans Authentic (étude 27/10 : « construis la fonction de connexion à Authentic avec toutes les fonctions dont on a parlé ; les
// demandes d'action passeront pour le moment par les conversations de CLAIRE, individuelles ou par dossier »). Le navigateur SANS FENÊTRE
// du serveur (navigateur/session.js, le même que pour cadastre.gouv.fr) se connecte à Authentic avec le compte réglé dans
// Réglages › Authentic (un seul compte, celui de Bastien ; identifiant et mot de passe, sans double authentification — choix de l'étude),
// puis suit un parcours ÉCRIT À L'AVANCE, sans IA :
//   - lire un dossier : le retrouver, ouvrir son sous-dossier de vente, relever la page du dossier, ses fiches clients et ses fiches biens
//     avec le MÊME relevé que l'extension Firefox (extension-firefox/releve.js) ; chaque page part dans la file des relevés
//     (routes/authentic.js) et la fenêtre CLAIRE d'un poste l'applique comme une page envoyée par l'extension ;
//   - préparer une demande de casier judiciaire (CJN, acquéreurs) ou d'état civil (Comedec : naissance de chaque partie, mariage des
//     mariés — choix de l'étude) : « Création rapide » ALLUMÉE, « Envoi immédiat » ÉTEINT, puis « Valider » ; rien n'est envoyé, l'étude
//     retrouve les demandes à envoyer elle-même (décision du 27/10).
// Garde-fous TENUS PAR LE CODE : seul le domaine cloud-fichorga.fr est chargé ; aucun bouton dont le libellé envoie, signe, supprime,
// vire ou intègre des données n'est jamais cliqué (`libelleInterdit`) ; « Valider » n'est cliqué qu'après avoir LU « Envoi immédiat »
// éteint et « Création rapide » allumée ; le mot de passe n'apparaît dans aucune étape, aucun journal, aucune réponse de route.

const fsp = require('node:fs/promises');
const path = require('node:path');

const CLE_CONNEXION_AUTHENTIC = 'authentic-connexion';
const DOMAINES_AUTHENTIC = ['cloud-fichorga.fr'];
// L'adresse de connexion de l'étude (étude 28/10 : « ce n'est pas le bon lien, le voici ») : la racine du site ne répond pas.
const ADRESSE_DEFAUT = 'https://www.cloud-fichorga.fr/41089-Authentic';
const MAX_FICHES = 12;

// Libellés jamais cliqués et gestes permis : authentic/garde.js (étape 1 du plan Authen.TIC, 27/10).
const { libelleInterdit, controlerClic } = require('./authentic/garde');

/** Pure : les réglages gardés, propres (secret compris : jamais rendu par une route). @param {any} brut */
function assainirConnexionAuthentic(brut) {
  const b = brut && typeof brut === 'object' ? brut : {};
  let adresse = typeof b.adresse === 'string' ? b.adresse.trim().slice(0, 300) : '';
  try {
    const u = new URL(adresse);
    if (u.protocol !== 'https:' || !/(^|\.)cloud-fichorga\.fr$/i.test(u.hostname) || u.username || u.password) adresse = '';
    // La racine seule (l'ancienne adresse par défaut) ne répond pas : celle de l'étude la remplace.
    else if (u.pathname === '/' && !u.search) adresse = '';
  } catch (_) { adresse = ''; }
  return {
    actif: b.actif === true,
    // Préparer des demandes dans Authentic (CJN, Comedec) = ÉCRIRE dans Authentic : éteint par défaut (plan validé le 27/10 : lecture seule).
    preparerDemandes: b.preparerDemandes === true,
    // Claude PILOTE Authentic (étude 29/10, authenticPilote.js) : il voit les pages EN CLAIR (noms, dates de naissance : une capture ne se masque pas) chez
    // Anthropic. Éteint par défaut ; l'administrateur l'allume après confirmation (`piloteClaudeLe` = qui et quand, garde la trace).
    piloteClaude: b.piloteClaude === true,
    piloteClaudeLe: typeof b.piloteClaudeLe === 'string' ? b.piloteClaudeLe.slice(0, 80) : '',
    adresse: adresse || ADRESSE_DEFAUT,
    identifiant: typeof b.identifiant === 'string' ? b.identifiant.trim().slice(0, 120) : '',
    motDePasse: typeof b.motDePasse === 'string' ? b.motDePasse.slice(0, 200) : '',
    // Identifiants refusés par Authentic : plus aucune connexion tant qu'ils ne sont pas changés (un compte se verrouille ; même règle
    // que pour Exchange, relecture 0.373.0).
    refuseLe: typeof b.refuseLe === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(b.refuseLe) ? b.refuseLe : ''
  };
}

/** @param {any} repo */
function lireConnexionAuthentic(repo) { return assainirConnexionAuthentic(repo.lireJsonBrut(CLE_CONNEXION_AUTHENTIC, null)); }

/** Ce qu'une route rend : jamais le mot de passe, seulement s'il est enregistré. @param {any} r */
function vueConnexionAuthentic(r) {
  return { actif: r.actif, preparerDemandes: r.preparerDemandes, piloteClaude: r.piloteClaude, piloteClaudeLe: r.piloteClaudeLe, adresse: r.adresse, identifiant: r.identifiant, motDePasseEnregistre: !!r.motDePasse, refuseLe: r.refuseLe };
}

/** Enregistre (mot de passe gardé s'il n'est pas réémis, effacé sur chaîne vide explicite). @param {any} repo @param {any} modif */
function ecrireConnexionAuthentic(repo, modif) {
  const avant = lireConnexionAuthentic(repo);
  const m = modif && typeof modif === 'object' ? modif : {};
  const identifiant = typeof m.identifiant === 'string' ? m.identifiant : avant.identifiant;
  const motDePasse = typeof m.motDePasse === 'string' ? m.motDePasse : avant.motDePasse;
  const change = identifiant.trim() !== avant.identifiant || motDePasse !== avant.motDePasse;
  const suivant = assainirConnexionAuthentic({
    actif: typeof m.actif === 'boolean' ? m.actif : avant.actif,
    preparerDemandes: typeof m.preparerDemandes === 'boolean' ? m.preparerDemandes : avant.preparerDemandes,
    piloteClaude: typeof m.piloteClaude === 'boolean' ? m.piloteClaude : avant.piloteClaude,
    // Qui l'a allumé (posé par la route, jamais par le poste seul) ; effacé à l'extinction.
    piloteClaudeLe: typeof m.piloteClaude === 'boolean' ? (m.piloteClaude ? String(m.piloteClaudeLe || '').slice(0, 80) : '') : avant.piloteClaudeLe,
    adresse: typeof m.adresse === 'string' ? m.adresse : avant.adresse,
    identifiant, motDePasse,
    // Le refus retenu tombe quand l'identifiant ou le mot de passe change ; `refuseLe` posé par le serveur seul (noterRefusAuthentic).
    refuseLe: m.refuseLe === true ? new Date().toISOString() : change ? '' : avant.refuseLe
  });
  repo.ecrireJsonBrut(CLE_CONNEXION_AUTHENTIC, suivant);
  return suivant;
}

/** Pure : sans accent ni casse, espaces réduits. @param {string} t */
function plat(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase(); }

/**
 * Pure : les demandes Comedec à cocher pour un intervenant d'Authentic (libellé de la ligne : « M. DUPONT Jean époux de Mme … (41000 BLOIS) »),
 * d'après les parties de la fiche CLAIRE : naissance pour chaque partie, mariage en plus pour une partie mariée (choix de l'étude 27/10).
 * Une ligne qui ne désigne aucune partie (conjoint qui ne vend ni n'achète, ligne vide) : rien. Une partie accompagnée par un confrère :
 * rien (son notaire fait ses demandes).
 * @param {string} libelle @param {Array<{ nom: string, prenom?: string, marie?: boolean, naissance?: boolean, dejaNaissance?: boolean, dejaMariage?: boolean, pasNaissance?: boolean, pasMariage?: boolean }>} parties
 * @returns {string[]}
 */
function demandesComedecIntervenant(libelle, parties) {
  const p = partieDeLaLigne(libelle, parties);
  if (!p) return [];
  // Naissance sauf né à l'étranger (Comedec ne la délivre pas : étude 29/10) ; mariage pour UN seul des deux époux (même acte).
  // Le libellé de la ligne d'Authentic dit lui-même « épouse de / époux de » (les autres — veuve, divorcé(e) — n'ont plus de mariage à demander) : mariée
  // même quand la fiche de la personne ou la situation du couple ne le disent pas (étude 29/10 : « il ne demande pas le mariage »).
  const marieParLigne = /\b(?:epoux|epouse)\s+de\b/.test(plat(String(libelle || '').replace(/\(.*$/, '')));
  // Une demande déjà faite dans Authentic (acte vu sur la page du dossier, état autre que « négatif ») n'est jamais redemandée.
  return [...(p.naissance === false || p.dejaNaissance || p.pasNaissance ? [] : ['Naissance']), ...((p.marie || marieParLigne) && !p.dejaMariage && !p.pasMariage ? ['Mariage'] : [])];
}

/** Pure : la partie de la fiche que désigne une ligne d'intervenant d'Authentic (nom ET prénom), sinon null. @param {string} libelle @param {any[]} parties */
function partieDeLaLigne(libelle, parties) {
  // Le nom de la personne de la ligne : avant « époux de / épouse de / veuve de / divorcé(e) de » et la parenthèse du lieu.
  const tete = plat(String(libelle || '').replace(/\(.*$/, '')).split(/\b(?:epoux|epouse|veuve|veuf|divorcee?)\s+de\b/)[0]
    .replace(/^(m\.|mme|mlle|monsieur|madame)\s+/, '').trim();
  if (!tete) return null;
  const mots = tete.split(/[\s-]+/).filter((m) => m.length > 1);
  const p = (parties || []).find((x) => {
    const nom = plat(x.nom).split(/[\s-]+/).filter((m) => m.length > 1);
    const prenom = plat(x.prenom || '').split(/[\s-]+/).filter((m) => m.length > 1);
    // Nom ET prénom exigés (dans `prenom`, ou dans `nom` qui porte « Prénom NOM ») : le nom seul désignerait aussi le conjoint du même
    // nom, qui n'est pas partie (relecture 0.373.0).
    if (nom.length + prenom.length < 2 || !nom.every((m) => mots.includes(m))) return false;
    return !prenom.length || prenom.some((m) => mots.includes(m));
  });
  return p || null;
}

/** Pure : une case d'une ligne d'intervenant du bloc CJN (« Mme NOM Prénom (41000 BLOIS) »), jamais l'en-tête ni une autre case. @param {any} c */
function estLigneIntervenantCjn(c) {
  return !!(c && c.ligne && !/nom de l.intervenant/i.test(c.ligne) && /\(\s*\d{5}\b/.test(c.ligne));
}

/** Pure : les cases du bloc CJN sont-elles justes ? Chaque acquéreur a SA case cochée, aucune autre ne l'est ; sinon une erreur (rien validé). @param {any[]} cases @param {any[]} parties */
function verifierCasesCjn(cases, parties) {
  const cochees = cases.filter((c) => c.coche);
  if (!cochees.length) throw new Error('aucun acquéreur coché dans la demande de casier : rien validé');
  if (cochees.some((c) => !partieDeLaLigne(c.ligne, parties))) throw new Error('un intervenant coché n’est pas un acquéreur de la fiche : rien validé');
  const manquants = (parties || []).filter((p) => !cochees.some((c) => partieDeLaLigne(c.ligne, [p])));
  if (manquants.length) throw new Error(`${manquants.length} acquéreur(s) de la fiche sans case cochée dans la liste d’Authentic : rien validé`);
  return cochees.length;
}

/** Coche la case de chaque acquéreur, décoche les autres intervenants, relit après chaque clic ; rend le nombre de cases cochées. */
async function cocherAcquereursCjn(g, s, parties) {
  await g.ev(`(() => { const t = [...document.querySelectorAll('th, td, span, div')].find((e) => /^nom de l.intervenant$/i.test(String(e.innerText || '').trim())); if (t) t.scrollIntoView({ block: 'start' }); })()`);
  await attendre(300);
  for (let i = 0; i < 12; i++) {
    const cases = ((await g.ev(SCRIPT_INTERRUPTEURS)) || []).filter(estLigneIntervenantCjn);
    const a = cases.find((c) => !!partieDeLaLigne(c.ligne, parties) !== !!c.coche);
    if (!a) return verifierCasesCjn(cases, parties);
    if (!a.sur) throw new Error('la case d’un intervenant est recouverte : rien validé');
    await s.cliquerPosition(a.x, a.y);
    await attendre(400);
  }
  throw new Error('les cases des acquéreurs ne se laissent pas cocher : rien validé');
}

/** Pure : le nom du conjoint écrit après « époux de / épouse de » dans le libellé d'une ligne (''si aucun) — pour ne demander le mariage qu'UNE fois quand
 * les deux époux ont leur ligne. @param {string} libelle */
function conjointDuLibelle(libelle) {
  const m = /\b(?:epoux|epouse)\s+de\s+(.+)$/.exec(plat(String(libelle || '').replace(/\(.*$/, '')));
  return m ? m[1].replace(/^(m\.|mme|mlle|monsieur|madame)\s+/, '').trim() : '';
}

// ---- Scripts exécutés dans la page (écrits ici, jamais un texte de l'IA) ----

// Les interrupteurs et cases visibles avec le libellé qui les précède : [{ libelle, coche, x, y }].
const SCRIPT_INTERRUPTEURS = `(() => {
  const net = (t) => String(t || '').replace(/\\s+/g, ' ').trim();
  const out = [];
  const vus = new Set();
  const visible = (e) => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < innerHeight ? r : null; };
  document.querySelectorAll('.ui-toggleswitch, .ui-chkbox, .ui-inputswitch, [role=switch], input[type=checkbox]').forEach((e) => {
    const boite = e.matches('input') ? (e.closest('.ui-toggleswitch, .ui-chkbox, .ui-inputswitch') || e) : e;
    if (vus.has(boite)) return; vus.add(boite);
    const r = visible(boite.matches('.ui-chkbox') ? (boite.querySelector('.ui-chkbox-box') || boite) : boite);
    if (!r) return;
    const input = boite.matches('input') ? boite : boite.querySelector('input[type=checkbox]');
    const coche = !!((input && input.checked) || boite.classList.contains('ui-toggleswitch-checked') || boite.classList.contains('ui-inputswitch-checked')
      || boite.getAttribute('aria-checked') === 'true' || (boite.querySelector('.ui-chkbox-box.ui-state-active, .ui-icon-check') && true));
    let libelle = '';
    if (input && input.id) { const l = document.querySelector('label[for="' + CSS.escape(input.id) + '"]'); if (l) libelle = net(l.innerText); }
    let prec = boite.previousElementSibling;
    while (!libelle && prec) { libelle = net(prec.innerText); prec = prec.previousElementSibling; }
    if (!libelle && boite.parentElement) { let p = boite.parentElement.previousElementSibling; while (!libelle && p) { libelle = net(p.innerText); p = p.previousElementSibling; } }
    const ligne = boite.closest('tr');
    const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
    const dessous = document.elementFromPoint(x, y);
    out.push({ libelle: libelle.slice(0, 80), ligne: ligne ? net(ligne.innerText).slice(0, 160) : '', coche, x, y, l: Math.round(r.width), h: Math.round(r.height), sur: !!(dessous && (boite.contains(dessous) || dessous.contains(boite))) });
  });
  return out;
})()`;

// Le plus petit élément AFFICHÉ (même hors de l'écran : il est amené à l'écran) dont le texte est `cible` (ou commence par lui), hors de la
// barre latérale : { x, y, texte, bouton } ou null. Le point rendu est vérifié : l'élément qui s'y trouve est bien celui-là (ou dedans) —
// jamais un clic à l'aveugle sur ce qui le recouvre (relecture 0.373.0).
const scriptTrouverTexte = (cible, exact) => `(() => {
  const net = (t) => String(t || '').replace(/\\s+/g, ' ').trim().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();
  const c = net(${JSON.stringify(String(cible))});
  let meilleur = null;
  document.querySelectorAll('a, button, span, div, li, td, label, h1, h2, h3, h4, h5').forEach((e) => {
    if (!e.offsetWidth && !e.offsetHeight) return;
    if (e.closest('nav, .layout-sidebar, .layout-menu, [class*=sidebar]')) return;
    // Jamais un conteneur qui porte une case ou un champ (la case d'export d'une ligne de tableau — relecture 0.395.6).
    if (e.matches('input, textarea') || e.querySelector('input, textarea')) return;
    const t = net(e.innerText);
    if (!(${exact ? 't === c' : 't === c || t.startsWith(c + " ")'})) return;
    const aire = e.offsetWidth * e.offsetHeight;
    if (!meilleur || t.length < meilleur.t.length || (t.length === meilleur.t.length && aire < meilleur.aire)) meilleur = { t, aire, e };
  });
  if (!meilleur) return null;
  meilleur.e.scrollIntoView({ block: 'center', inline: 'nearest' });
  const r = meilleur.e.getBoundingClientRect();
  const x = Math.round(r.left + Math.min(r.width / 2, 160)), y = Math.round(r.top + r.height / 2);
  const dessous = document.elementFromPoint(x, y);
  if (!dessous || !(meilleur.e.contains(dessous) || dessous.contains(meilleur.e))) return { cache: true, texte: String(meilleur.e.innerText).trim().slice(0, 160) };
  const bouton = dessous.closest('button, a, [role=button], .ui-button');
  // Le libellé contrôlé du bouton : son texte, son titre, son aria-label et une icône de corbeille (audit 0.376.0 : une corbeille sans texte).
  const icone = bouton && bouton.querySelector('[class*=trash], [class*=delete], [class*=supprim], [class*=corbeille]') ? ' supprimer' : '';
  return { x, y, texte: String(meilleur.e.innerText).trim().slice(0, 160), bouton: bouton ? (String(bouton.innerText || bouton.getAttribute('title') || bouton.getAttribute('aria-label') || '').trim().slice(0, 80) + icone).trim() : '' };
})()`;

// Un résultat de recherche qui CONTIENT le numéro du dossier, avec ou sans espaces (« VTE X / Y (A202600500) », liste déroulante) — le plus
// petit élément cliquable qui le porte. Même forme de retour que scriptTrouverTexte. (Étude 28/10 : « dossier A 2026 00500 introuvable ».)
const scriptTrouverReference = (ref, liste) => `(() => {
  const liste = ${liste ? 'true' : 'false'};
  const compact = (t) => String(t || '').replace(/\\s+/g, '').toLowerCase();
  const c = compact(${JSON.stringify(String(ref))});
  if (!c) return null;
  // Le numéro, pas un numéro plus long qui le commence (« A2026005000 ») — audit 0.391.1.
  const porte = (t) => { let i = t.indexOf(c); while (i >= 0) { if (!/[0-9]/.test(t.charAt(i + c.length))) return true; i = t.indexOf(c, i + 1); } return false; };
  const candidats = [];
  document.querySelectorAll('a, li, tr, td, span, div, [role=option]').forEach((e) => {
    if (!e.offsetWidth && !e.offsetHeight) return;
    if (e.closest('nav, .layout-sidebar, .layout-menu, [class*=sidebar], [role=tab], [role=tablist]')) return;
    if (e.matches('input, textarea') || e.querySelector('input, textarea')) return;
    const t = compact(e.innerText);
    if (!porte(t) || t.length > c.length + 200) return;
    // Seulement un résultat qu'on clique (lien, option d'une liste, ligne cliquable) — jamais une cellule d'un tableau de suivi.
    // \`liste\` : seulement une option de la liste déroulante qui s'ouvre sous le champ de recherche (avant Entrée).
    const cliquable = liste ? e.closest('[role=option], .ui-autocomplete li, .ui-autocomplete-item, .ui-autocomplete-panel li, [role=listbox] *')
      : e.closest('a, button, [role=option], [role=button], [onclick], .ui-autocomplete li, .ui-autocomplete-item') || getComputedStyle(e).cursor === 'pointer';
    if (!cliquable) return;
    candidats.push({ t, aire: e.offsetWidth * e.offsetHeight, e });
  });
  if (!candidats.length) return null;
  candidats.sort((a, b) => a.t.length - b.t.length || a.aire - b.aire);
  // Le plus petit élément CLIQUABLE (pas recouvert par une liste déroulante ou une fenêtre) parmi ceux qui portent le numéro.
  let meilleur = null, x = 0, y = 0, dessous = null;
  for (const k of candidats.slice(0, 40)) {
    k.e.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = k.e.getBoundingClientRect();
    const kx = Math.round(r.left + Math.min(r.width / 2, 160)), ky = Math.round(r.top + r.height / 2);
    const sous = document.elementFromPoint(kx, ky);
    if (sous && (k.e.contains(sous) || sous.contains(k.e))) { meilleur = k; x = kx; y = ky; dessous = sous; break; }
  }
  if (!meilleur) return { cache: true };
  const bouton = dessous.closest('button, a, [role=button], .ui-button');
  const icone = bouton && bouton.querySelector('[class*=trash], [class*=delete], [class*=supprim], [class*=corbeille]') ? ' supprimer' : '';
  return { x, y, texte: String(meilleur.e.innerText).trim().slice(0, 160), bouton: bouton ? (String(bouton.innerText || bouton.getAttribute('title') || bouton.getAttribute('aria-label') || '').trim().slice(0, 80) + icone).trim() : '' };
})()`;

// Les champs de saisie visibles de la page, DÉCRITS par leurs libellés fixes (placeholder, aria-label, étiquette, title, name/id sans
// chiffres) — jamais leur valeur : pour le message d'échec de la recherche (étude 28/10 : « aucun champ de recherche trouvé »).
const SCRIPT_CHAMPS_VISIBLES = `(() => [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=password]), textarea')]
  .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2; })
  .map((e) => {
    const d = [e.placeholder, e.getAttribute('aria-label')].map((v) => String(v || '').replace(/\\s+/g, ' ').trim()).find(Boolean);
    return (d || ('[' + String(e.name || e.id || e.type || 'champ').replace(/[0-9]+/g, '').replace(/[^A-Za-z:_-]/g, '').slice(-30) + ']')).slice(0, 40); })
  .slice(0, 6))()`;

// Le lien qui OUVRE le dossier dans le résultat de recherche qui porte son numéro (relevé de l'étude du 28/10 : chaque résultat a deux
// liens — le titre « A 202600500 VTE … », `…:ouvreDossierSideView`, qui n'ouvre qu'un panneau latéral, et l'icône de dossier bleue, sans texte,
// `…:goToDossier`, qui ouvre le dossier). Le bloc du résultat doit porter CE numéro (pas un numéro plus long qui le commence), le lien doit
// être sous le pointeur. Même forme de retour que scriptTrouverTexte.
const scriptOuvrirResultat = (ref) => `(() => {
  const compact = (t) => String(t || '').replace(/\\s+/g, '').toLowerCase();
  const c = compact(${JSON.stringify(String(ref))});
  if (!c) return null;
  const porte = (t) => { let i = t.indexOf(c); while (i >= 0) { if (!/[0-9]/.test(t.charAt(i + c.length))) return true; i = t.indexOf(c, i + 1); } return false; };
  const lien = [...document.querySelectorAll('[id$=":goToDossier"]')].find((a) => {
    if (!a.getClientRects().length) return false;
    // Le bloc du résultat : l'élément dont l'identifiant est celui du lien sans « :goToDossier », sinon la ligne qui le contient (jamais le lien).
    // Sinon le plus petit ancêtre qui contient aussi le titre du MÊME résultat (\`…:ouvreDossierSideView\`), jamais toute la liste.
    const prefixe = a.id.replace(/:goToDossier$/, '');
    let bloc = document.getElementById(prefixe);
    if (!bloc) { const titre = document.getElementById(prefixe + ':ouvreDossierSideView'); bloc = a.parentElement; while (bloc && titre && !bloc.contains(titre)) bloc = bloc.parentElement; }
    if (!bloc) bloc = a.parentElement && a.parentElement.closest('li, tr');
    return !!bloc && porte(compact(bloc.innerText));
  });
  if (!lien) return null;
  lien.scrollIntoView({ block: 'center', inline: 'nearest' });
  const r = lien.getBoundingClientRect();
  const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
  const dessous = document.elementFromPoint(x, y);
  if (!dessous || !(lien.contains(dessous) || dessous.contains(lien))) return { cache: true };
  const icone = lien.querySelector('[class*=trash], [class*=delete], [class*=supprim], [class*=corbeille]') ? ' supprimer' : '';
  return { x, y, texte: '', bouton: (String(lien.innerText || lien.getAttribute('title') || lien.getAttribute('aria-label') || '').trim().slice(0, 80) + icone).trim() };
})()`;

// Le « + » au bout de la ligne « Formalités préalables (N) » du sous-dossier (capture du wiki d'Authentic, version Silicium : c'est lui qui
// ouvre « Ajouter des formalités préalables », pas un onglet). Le bouton sans texte (ou « + ») le plus proche de l'en-tête, dans la même
// rangée, vérifié sous le pointeur ; jamais une corbeille. Même forme de retour que scriptTrouverTexte.
const SCRIPT_PLUS_FORMALITES_PREALABLES = `(() => {
  const net = (t) => String(t || '').replace(/\\s+/g, ' ').trim().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();
  const tetes = [...document.querySelectorAll('a, span, div, h2, h3, h4, label')].filter((e) => e.offsetWidth && /^formalites prealables( \\(\\d+\\))?$/.test(net(e.innerText)));
  if (!tetes.length) return null;
  // Le plus INTÉRIEUR (le texte de l'en-tête, pas la rangée qui le contient avec ses boutons).
  const tete = tetes.find((e) => !tetes.some((x) => x !== e && e.contains(x)));
  const rt = tete.getBoundingClientRect(), milieu = rt.top + rt.height / 2;
  let rangee = tete.parentElement;
  for (let k = 0; rangee && k < 4; k++, rangee = rangee.parentElement) {
    // Un bouton qui DIT « ajouter » : « + », mot d'icône Material « add… », classe « plus » / « add » (relecture 0.391.5 : jamais un chevron,
    // un avion ou un engrenage sans texte pris pour le « + »).
    const ditPlus = (b) => /^(\\+|add|add_box|add_circle|add_circle_outline)?$/.test(net(b.innerText))
      && (/^(\\+|add\\w*)$/.test(net(b.innerText)) || /(^|[\\s_-])(plus|add)([\\s_-]|$)|pi-plus|fa-plus|ui-icon-plus/.test(String(b.className || '') + ' ' + [...b.querySelectorAll('*')].map((x) => String(x.className || '')).join(' ')));
    const boutons = [...rangee.querySelectorAll('a, button, [role=button]')].filter((b) => b !== tete && !b.contains(tete) && b.offsetWidth && ditPlus(b)
      && !b.querySelector('[class*=trash], [class*=delete], [class*=supprim], [class*=corbeille], [class*=send], [class*=settings]')
      // Sur la MÊME ligne que l'en-tête, à sa droite (jamais le « + » des comparants ou des formalités postérieures).
      && Math.abs(b.getBoundingClientRect().top + b.getBoundingClientRect().height / 2 - milieu) < 16 && b.getBoundingClientRect().left >= rt.right - 2)
      .sort((a, c) => a.getBoundingClientRect().left - c.getBoundingClientRect().left);
    if (!boutons.length) continue;
    const b = boutons[0];
    b.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = b.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
    const d = document.elementFromPoint(x, y);
    if (!d || !(b.contains(d) || d.contains(b))) return { cache: true };
    const classes = [b, ...b.querySelectorAll('*')].map((x) => String(x.className || '')).join(' ');
    return { x, y, texte: '', bouton: [b.innerText, b.getAttribute('title'), b.getAttribute('aria-label'), classes].filter(Boolean).join(' ').replace(/\\s+/g, ' ').trim().slice(0, 160) };
  }
  return null;
})()`;

// Ce qu'on voit VRAIMENT à l'écran (un volet PrimeFaces fermé reste dans la page, poussé hors de l'écran) — captures du wiki, 28/10.
const VISIBLE_ECRAN = `((e) => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2 && r.left < innerWidth && r.right > 0
  && r.top < innerHeight && r.bottom > 0 && getComputedStyle(e).visibility !== 'hidden'; })`;

// Affiché dans la page (même hors de la fenêtre, sous le bas de l'écran) : un élément d'un onglet caché ou d'un volet fermé n'a pas de boîte.
const AFFICHE = `((e) => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(e).visibility !== 'hidden'; })`;

// Le bandeau du dossier ouvert (`…:dossierHeader`, relevé de l'étude : « A 2026 00500 VTE … ») — présent sur la page du dossier comme sur celle
// d'un sous-dossier, quand « Comparants » n'y est pas encore (page du dossier sans sous-dossier choisi, wiki « Crea13 »).
const SCRIPT_EN_TETE_DOSSIER = `(() => { const e = [...document.querySelectorAll('[id$=":dossierHeader"]')].find(${VISIBLE_ECRAN});
  return e ? String(e.innerText || '') : ''; })()`;

// Les sous-dossiers du dossier (`…:listeSousDossier:<i>:selectSousDossier`, relevé de l'étude), chacun marqué `data-claire-sd` ; leur libellé.
const SCRIPT_SOUS_DOSSIERS = `(() => {
  document.querySelectorAll('[data-claire-sd]').forEach((a) => a.removeAttribute('data-claire-sd'));
  return [...document.querySelectorAll('[id$=":selectSousDossier"]')].filter(${AFFICHE}).map((a, i) => {
    a.setAttribute('data-claire-sd', String(i));
    return String(a.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 200);
  });
})()`;
/** Le sous-dossier i, à l'écran et sous le pointeur : { x, y, bouton } ou null. @param {number} i */
const scriptPlacerSousDossier = (i) => `(() => {
  const a = document.querySelector('[data-claire-sd="${Number(i)}"]');
  if (!a || !${AFFICHE}(a)) return null;
  a.scrollIntoView({ block: 'center', inline: 'nearest' });
  const r = a.getBoundingClientRect();
  const x = Math.round(r.left + Math.min(r.width / 2, 120)), y = Math.round(r.top + r.height / 2);
  const d = document.elementFromPoint(x, y);
  if (!d || !a.contains(d)) return null;
  const b = d.closest('button, a, [role=button]') || d;
  const corbeille = b.querySelector && b.querySelector('[class*=trash], [class*=delete], [class*=supprim], [class*=corbeille]') ? ' supprimer' : '';
  return { x, y, bouton: (String(b.innerText || b.getAttribute('title') || '').replace(/\\s+/g, ' ').trim().slice(0, 160) + corbeille).trim() };
})()`;
const SCRIPT_SOUS_DOSSIER_OUVERT = `(() => { const e = [...document.querySelectorAll('[id$=":informationSousDossier:libelle"]')].find(${VISIBLE_ECRAN});
  return e ? String(e.innerText || '').replace(/\\s+/g, ' ').trim() : ''; })()`;

/**
 * Le PREMIER chevron FERMÉ d'un bloc replié dont l'en-tête répond à `re` (texte sans accents, en minuscules) et porte un nombre non nul : « ›
 * Formalités préalables (3) », un groupe « Envoyé (12) » d'un écran de suivi (captures du wiki, 28/10). Seulement un chevron qui dit être
 * fermé (aria-expanded="false", mot d'icône ou classe « …right »), sur la ligne de l'en-tête — jamais l'en-tête, qui porte « + »,
 * corbeille ou avion d'envoi. UN seul à la fois, amené à l'écran (relecture 0.391.5 : un dépliage déplace tout ce qui suit) : [{ x, y, bouton }].
 * @param {string} reSource
 */
const scriptChevronsFermes = (reSource, racine) => `(() => {
  const net = (t) => String(t || '').replace(/\\s+/g, ' ').trim().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();
  const re = new RegExp(${JSON.stringify(reSource)});
  const visible = ${AFFICHE};
  // Un chevron FERMÉ : son mot d'icône ou sa classe le disent ; « aria-expanded=false » seulement avec une classe de chevron. Jamais le
  // bouton d'un menu d'actions (SplitButton, MenuButton, aria-haspopup — audit 0.392.0), jamais un chevron déjà refusé ou recouvert.
  const classe = (c) => (typeof c.className === 'string' ? c.className : '');
  const ferme = (c) => !c.closest('[aria-haspopup], .ui-splitbutton, .ui-menubutton, [data-claire-refuse], [data-claire-masque]')
    && (/^(keyboard_arrow_right|chevron_right|arrow_right|navigate_next)$/.test(String(c.innerText || '').trim())
      || /(chevron|arrow|caret|triangle)[-_]?(right|1-e)\\b|ui-icon-triangle-1-e|toggler[^ ]*\\s[^ ]*(right|collapsed)/i.test(classe(c))
      || (c.getAttribute('aria-expanded') === 'false' && /toggler|chevron|caret|triangle/i.test(classe(c))));
  // Seulement dans la zone demandée (l'arbre des pièces jointes, audit 0.393.0), sinon toute la page.
  const racines = ${JSON.stringify(racine || '')} ? [...document.querySelectorAll(${JSON.stringify(racine || 'body')})].filter(visible) : [document.body];
  // Tous les chevrons fermés (comptés), puis le PREMIER qui n'est pas recouvert, amené à l'écran ; un chevron recouvert est marqué et passé
  // (relecture 0.393.0 : il arrêtait tout et le dépliage passait pour complet).
  const paires = [];
  racines.forEach((rac) => [...rac.querySelectorAll('a, span, div, h2, h3, h4, label, legend')].forEach((tete) => {
    // Un en-tête est court : le texte des grands conteneurs n'est pas recalculé (audit 0.392.0, performance).
    if (paires.length >= 40 || String(tete.textContent || '').length > 120 || !visible(tete) || !re.test(net(tete.innerText))) return;
    if ([...tete.children].some((c) => re.test(net(c.innerText)))) return;
    const rt = tete.getBoundingClientRect(), milieu = rt.top + rt.height / 2;
    let rangee = tete.parentElement;
    for (let k = 0; rangee && k < 3; k++, rangee = rangee.parentElement) {
      const ch = [...rangee.querySelectorAll('*')].find((c) => visible(c) && !c.contains(tete) && ferme(c)
        && Math.abs(c.getBoundingClientRect().top + c.getBoundingClientRect().height / 2 - milieu) < 14);
      if (ch) { if (!paires.includes(ch)) paires.push(ch); break; }
    }
  }));
  for (const ch of paires) {
    ch.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = ch.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
    const d = document.elementFromPoint(x, y);
    if (!d || !(ch.contains(d) || d.contains(ch))) { ch.setAttribute('data-claire-masque', '1'); continue; }
    const b = d.closest('button, a, [role=button]') || d;
    ch.setAttribute('data-claire-chevron', '1');
    return { reste: paires.length, cible: { x, y, bouton: [classe(ch), ch.getAttribute('aria-label'), String(ch.innerText || '').trim(),
      b !== ch ? String(b.innerText || b.getAttribute('title') || '').trim() : ''].filter(Boolean).join(' ').replace(/\\s+/g, ' ').slice(0, 160) } };
  }
  return { reste: paires.length, cible: null };
})()`;

// Le menu de gauche d'Authentic se déplie au SURVOL (relevé de l'étude ; wiki : replié = icônes seules) : le point où poser la souris.
const SCRIPT_POINT_MENU = `(() => {
  const r = [...document.querySelectorAll('nav, .layout-sidebar, .layout-menu, [class*=sidebar], [class*=menu-gauche], [class*=side-menu]')]
    .map((e) => e.getBoundingClientRect()).find((x) => x.width > 20 && x.height > 200 && x.left < 80);
  return r ? { x: Math.round(r.left + Math.min(r.width / 2, 25)), y: Math.round(r.top + r.height / 2) } : { x: 25, y: Math.round(innerHeight / 2) };
})()`;
/** L'icône (police Material) de ce mot dans le menu de gauche : { x, y } vérifié sous le pointeur, ou null. @param {string} mot */
const scriptIconeMenu = (mot) => `(() => {
  const e = [...document.querySelectorAll('.material-icons, .material-symbols-outlined, .material-icons-outlined')]
    .find((x) => { const r = x.getBoundingClientRect(); return r.width > 2 && r.height > 2 && String(x.textContent || '').trim().toLowerCase() === ${JSON.stringify(String(mot))} && x.closest('nav, .layout-sidebar, .layout-menu, [class*=sidebar]'); });
  if (!e) return null;
  const r = e.getBoundingClientRect();
  const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
  const d = document.elementFromPoint(x, y);
  return d && (e.contains(d) || d.contains(e)) ? { x, y } : null;
})()`;
/** Une entrée du menu (« Suivis », « Suivi SAFER / DIA-DPU »…) visible : le plus petit élément dont le texte est EXACTEMENT ce libellé (sans
 * casse ni accents), jamais un onglet ; vérifié sous le pointeur. { x, y, bouton } ou null. @param {string} libelle */
const scriptEntreeMenu = (libelle) => `(() => {
  const net = (t) => String(t || '').replace(/\\s+/g, ' ').trim().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();
  const c = net(${JSON.stringify(String(libelle))});
  const visible = ${VISIBLE_ECRAN};
  const e = [...document.querySelectorAll('a, span, li, div, button, label')].filter((x) => visible(x) && !x.closest('[role=tab], [role=tablist]') && net(x.innerText) === c)
    .sort((a, b) => a.offsetWidth * a.offsetHeight - b.offsetWidth * b.offsetHeight)[0];
  if (!e) return null;
  const r = e.getBoundingClientRect();
  const x = Math.round(r.left + Math.min(r.width / 2, 100)), y = Math.round(r.top + r.height / 2);
  const d = document.elementFromPoint(x, y);
  if (!d || !(e.contains(d) || d.contains(e))) return null;
  const b = d.closest('button, a, [role=button], [role=menuitem], li') || d;
  return { x, y, bouton: String(b.innerText || b.getAttribute('title') || '').replace(/\\s+/g, ' ').trim().slice(0, 160) };
})()`;

// Comptabilité : à l'ouverture, AUCUN compte n'est choisi (« Sélectionnez un compte pour en voir le détail », capture 4.19.2 du wiki) — le
// libellé « Compte n°… » de la carte du compte principal, jamais sa case à cocher (qui active « Détacher de l'acte » et « Générer en PDF »).
const SCRIPT_COMPTE_PRINCIPAL = `(() => {
  const net = (t) => String(t || '').replace(/\\s+/g, ' ').trim().toLowerCase();
  const visible = ${VISIBLE_ECRAN};
  const tous = [...document.querySelectorAll('span, div, label, a, td, li, b, strong')].filter(visible);
  const tete = tous.find((e) => net(e.innerText) === 'compte principal');
  const comptes = tous.filter((e) => String(e.textContent || '').length < 160 && /^compte n/.test(net(e.innerText)) && ![...e.children].some((x) => /^compte n/.test(net(x.innerText)))
    && !(e.matches('label') && (e.getAttribute('for') || e.querySelector('input'))));
  // Sous le titre « Compte principal » ; sans ce titre, seulement s'il n'y a qu'UN compte (audit 0.392.0 : jamais un autre pris pour lui).
  const e = tete ? comptes.find((x) => tete.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING) : (comptes.length === 1 ? comptes[0] : null);
  if (!e) return null;
  e.scrollIntoView({ block: 'center', inline: 'nearest' });
  const r = e.getBoundingClientRect();
  const x = Math.round(r.left + Math.min(r.width / 2, 120)), y = Math.round(r.top + r.height / 2);
  const d = document.elementFromPoint(x, y);
  if (!d || !(e.contains(d) || d.contains(e)) || d.closest('.ui-chkbox, input, [role=checkbox]')) return null;
  const b = d.closest('button, a, [role=button]') || d;
  return { x, y, texte: String(e.innerText).replace(/\\s+/g, ' ').trim().slice(0, 120), bouton: String(b.innerText || b.getAttribute('title') || '').replace(/\\s+/g, ' ').trim().slice(0, 160) };
})()`;

// Le filtre de la liste des formalités (volet « Ajouter des formalités préalables ») : un champ dont un ancêtre proche montre la liste
// (« … formalité(s) trouvée(s) », « Liste des formalités préalables », les entrées CJN / COMEDEC) — jamais le « Filtrer » du sous-dossier.
const SCRIPT_CHAMP_FILTRE_FORMALITES = `(() => {
  const re = /formalit[ée]\\(s\\) trouv|liste des formalit|etat civil d[ée]mat|casier judiciaire|ajouter des formalit/i;
  const visible = ${VISIBLE_ECRAN};
  let meilleur = null;
  for (const e of document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=password])')) {
    if (!visible(e)) continue;
    let a = e.parentElement;
    for (let k = 0; a && k < 5; k++, a = a.parentElement) {
      if (re.test(String(a.innerText || ''))) { if (!meilleur || k < meilleur.k) meilleur = { e, k }; break; }
    }
  }
  if (!meilleur) return null;
  const r = meilleur.e.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
})()`;

// « Valider » de la demande quand il n'a pas de texte (bloc Comedec : rond vert « ✓ », captures 2021-2022 du wiki) : dans le plus petit bloc
// qui porte « Création rapide », un bouton sans texte (ou « check ») dont le titre dit « Valider » ou qui porte une icône de coche.
const SCRIPT_VALIDER_ICONE = `(() => {
  const visible = ${VISIBLE_ECRAN};
  const blocs = [...document.querySelectorAll('div, form, fieldset')].filter((d) => visible(d) && /cr[ée]ation rapide/i.test(String(d.innerText || '')));
  blocs.sort((a, b) => String(a.innerText).length - String(b.innerText).length);
  for (const bloc of blocs.slice(0, 4)) {
    // Le titre dit « Valider », ou l'icône est une coche (« check », pi-check…) — jamais une case, un interrupteur « …-checked » ni une liste
    // à cases (relecture 0.391.5).
    const coche = (x) => /^(check|done|check_circle)$/i.test(String(x.innerText || '').trim())
      || [x, ...x.querySelectorAll('*')].some((y) => /(^|\\s)(pi-check|fa-check|ui-icon-check)(\\s|$)/.test(String(y.className || '')));
    const b = [...bloc.querySelectorAll('button, a, [role=button]')].find((x) => visible(x) && /^(check|done|check_circle)?$/i.test(String(x.innerText || '').trim())
      && !x.closest('.ui-chkbox, .ui-toggleswitch, .ui-inputswitch, .ui-selectcheckboxmenu, [role=checkbox], [role=switch]')
      && (/^valider$/i.test(String(x.getAttribute('title') || x.getAttribute('aria-label') || '').trim()) || coche(x)));
    if (!b) continue;
    const r = b.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
    const d = document.elementFromPoint(x, y);
    if (!d || !(b.contains(d) || d.contains(b))) return null;
    return { x, y, bouton: [b.getAttribute('title'), b.getAttribute('aria-label'), String(b.innerText || '').trim(), String(b.className || '')].filter(Boolean).join(' ').slice(0, 160) };
  }
  return null;
})()`;

// Page « Dossiers › Rechercher » (menu de gauche, étude 29/10 : « il faut aller dans la sidebar Dossiers › Rechercher ») : le champ du NUMÉRO du
// dossier — par son étiquette visible (placeholder, aria-label, étiquette liée), sinon l'UNIQUE champ de saisie visible hors de la barre du haut.
// { x, y, motDePasse } ou null ; jamais un champ si plusieurs se disputent la place.
const SCRIPT_CHAMP_NUMERO_RECHERCHE = `(() => {
  const net = (t) => String(t || '').replace(/\\s+/g, ' ').trim().toLowerCase();
  const champs = [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=password]):not([type=submit]):not([type=button])')]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 20 && r.height > 8 && r.top > 70 && !e.closest('nav, .layout-sidebar, .layout-menu, [class*=sidebar], header, [class*=topbar]'); });
  const etiquette = (e) => [e.placeholder, e.getAttribute('aria-label'), e.labels && e.labels[0] ? e.labels[0].innerText : ''].map(net).join(' ');
  const pt = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; };
  // Page réelle (relevé de l'étude, 29/10) : « N° de dossier » (champ numérique), « Libellé de dossier », « Libellé de sous-dossier »,
  // « Réf. de dossier », « Réf. de l'acte », « N° du répertoire »… — seul « N° de dossier » (ou « Numéro de dossier ») est le bon.
  const exact = champs.filter((e) => /^(n°|n\\u00ba|no|num[ée]ro)\\s*(de\\s*)?dossier\\b/.test(etiquette(e).trim()));
  if (exact.length === 1) return pt(exact[0]);
  if (exact.length > 1) return null;
  const parNumero = champs.filter((e) => /num[ée]ro|n°|n\\u00ba|dossier/.test(etiquette(e)) && !/libell|sous-dossier|r[ée]f|acte|r[ée]pertoire/.test(etiquette(e)));
  if (parNumero.length === 1) return pt(parNumero[0]);
  return null;
})()`;

// Page VIDE (étude 29/10 : « page /…-Authentic/ : 0 champ, 0 bouton, 0 cadre », aucun mot reconnu) : ni champ, ni bouton, ni cadre, presque aucun texte —
// l'application n'est pas affichée (chargement, redirection, session perdue).
const SCRIPT_PAGE_VIDE = `(() => !document.body || (String(document.body.innerText || '').trim().length < 30 && !document.querySelector('input, button, a[href], iframe, frame, table')))()`;

// L'ALLURE de la page quand la recherche échoue (étude 29/10 : « champs visibles : aucun ») : rien de ce que la page contient en dehors d'un
// vocabulaire fermé — chemin sans chiffres ni identifiants, nombres d'éléments, mots fixes reconnus, mots d'icône des boutons visibles.
// { chemin, champs, cadres, boutons, mots: [...], icones: [...] }.
const SCRIPT_ALLURE_PAGE = `(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
  const texte = String((document.body && document.body.innerText) || '').toLowerCase();
  const MOTS = ['silicium', 'mot de passe', 'connexion', 'identifiant', 'installer', 'erreur', 'expir', 'session', 'accès refusé', 'chargement', 'rechercher', 'comparants', 'formalités', 'dossier'];
  // Seulement le MOT D'ICÔNE d'un élément de police d'icônes (ligature Material : « search », « menu »…) — jamais le texte, le title ni l'aria-label
  // d'un bouton ou d'un lien (un nom de client en lien d'un seul mot passerait).
  const icones = [...document.querySelectorAll('.material-icons, .material-symbols-outlined, .material-icons-outlined')].filter(vis)
    .map((e) => String(e.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase())
    .filter((t) => /^[a-z]+(?:_[a-z]+)*$/.test(t) && t.length >= 3 && t.length <= 25);
  return { chemin: String(location.pathname).replace(/[0-9]+/g, '#').replace(/;jsessionid=[^/]*/i, '').slice(0, 60),
    champs: [...document.querySelectorAll('input, textarea, select')].filter(vis).length, cadres: document.querySelectorAll('iframe, frame').length,
    boutons: [...document.querySelectorAll('button, [role=button]')].filter(vis).length, mots: MOTS.filter((m) => texte.includes(m)).slice(0, 8),
    icones: [...new Set(icones)].slice(0, 8) };
})()`;

// Le champ de saisie le plus proche d'un libellé ou d'un texte d'aide (placeholder, aria-label) : { x, y } ou null.
const scriptChamp = (libelle, libellesSeuls) => `(() => {
  const seuls = ${libellesSeuls ? 'true' : 'false'};
  const net = (t) => String(t || '').replace(/\\s+/g, ' ').trim().toLowerCase();
  const c = net(${JSON.stringify(String(libelle))});
  for (const e of document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea')) {
    const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    const l = e.labels && e.labels[0] ? e.labels[0].innerText : '';
    // \`seuls\` : seulement ce que l'utilisateur VOIT (placeholder, aria-label, étiquette) — jamais name/id (un « …dossierTabView… » JSF).
    if ((seuls ? [e.placeholder, e.getAttribute('aria-label'), l] : [e.placeholder, e.getAttribute('aria-label'), l, e.name, e.id, e.title]).some((v) => net(v).includes(c))) return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), motDePasse: e.type === 'password' };
  }
  return null;
})()`;

const SCRIPT_CHAMP_MOT_DE_PASSE = `(() => { const e = [...document.querySelectorAll('input[type=password]')].find((x) => x.getBoundingClientRect().width > 2);
  if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`;

const SCRIPT_CHAMP_IDENTIFIANT = `(() => { const pw = [...document.querySelectorAll('input[type=password]')].find((x) => x.getBoundingClientRect().width > 2);
  const champs = [...document.querySelectorAll('input[type=text], input[type=email], input:not([type])')].filter((x) => x.getBoundingClientRect().width > 2);
  const e = champs.find((x) => pw && (x.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING)) || champs[0];
  if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`;

// Les lignes du tableau « Intervenants | Type de Demande » du bloc Comedec : [{ libelle, choisi }] ; `scriptLigneComedec(i)` amène la i-ème
// à l'écran et rend le centre de sa liste à choix (élément sous le point vérifié).
const TABLE_COMEDEC = `[...document.querySelectorAll('table')].filter((t) => { const h = String((t.tHead || t).innerText).toLowerCase(); return h.includes('intervenant') && h.includes('type de demande'); })
  .flatMap((t) => [...t.querySelectorAll('tbody tr')].filter((tr) => tr.querySelectorAll('td').length >= 2))`;
const SCRIPT_LIGNES_COMEDEC = `(() => ${TABLE_COMEDEC}.map((tr) => { const td = tr.querySelectorAll('td');
  return { libelle: String(td[0].innerText).replace(/\\s+/g, ' ').trim().slice(0, 200), choisi: String(td[td.length - 1].innerText).replace(/\\s+/g, ' ').trim().slice(0, 80) }; }))()`;
const scriptLigneComedec = (i, defiler) => `(() => { const tr = ${TABLE_COMEDEC}[${Number(i) | 0}]; if (!tr) return null;
  const td = tr.querySelectorAll('td'); const liste = td[td.length - 1].querySelector('.ui-selectcheckboxmenu-trigger, .ui-selectcheckboxmenu, .ui-selectonemenu, select, [role=combobox]') || td[td.length - 1];
  ${defiler ? "liste.scrollIntoView({ block: 'center', behavior: 'instant' });" : ''} const r = liste.getBoundingClientRect(); if (r.width < 2) return null;
  const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2); const d = document.elementFromPoint(x, y);
  return { x, y, sur: !!(d && (liste.contains(d) || d.contains(liste))) }; })()`;

// Ouvre la liste de la i-ème ligne DEPUIS LA PAGE (clic du composant PrimeFaces sur sa zone d'ouverture), sans viser de position : filet quand le clic à la
// position tombe à côté (ligne qui descend après la demande précédente — étude 29/10, 0.396.8). Ne touche à aucune option.
const scriptOuvrirListeComedec = (i) => `(() => { const tr = ${TABLE_COMEDEC}[${Number(i) | 0}]; if (!tr) return false;
  const td = tr.querySelectorAll('td'); const cell = td[td.length - 1];
  const cible = cell.querySelector('.ui-selectcheckboxmenu-trigger') || cell.querySelector('.ui-selectcheckboxmenu-label-container, .ui-selectcheckboxmenu-label') || cell.querySelector('.ui-selectcheckboxmenu');
  if (!cible) return false;
  for (const t of ['mousedown', 'mouseup', 'click']) cible.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
  return true; })()`;

// Les options du panneau à choix multiple ouvert : [{ libelle, coche, x, y }].
const SCRIPT_OPTIONS_OUVERTES = `(() => {
  const net = (t) => String(t || '').replace(/\\s+/g, ' ').trim();
  const out = [];
  // Seul le panneau VISIBLE compte (jamais un autre menu de la page) ; à défaut de panneau PrimeFaces, les éléments role=option visibles.
  const panneaux = [...document.querySelectorAll('.ui-selectcheckboxmenu-panel')].filter((p) => { const r = p.getBoundingClientRect(); return r.width > 2 && r.height > 2; });
  const elements = panneaux.length ? panneaux.flatMap((p) => [...p.querySelectorAll('li')]) : [...document.querySelectorAll('[role=option]')];
  elements.forEach((li) => {
    const r = li.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return;
    const boite = li.querySelector('.ui-chkbox-box') || li;
    const b = boite.getBoundingClientRect();
    const coche = !!(li.querySelector('.ui-chkbox-box.ui-state-active, input:checked') || li.getAttribute('aria-checked') === 'true');
    out.push({ libelle: net(li.innerText).slice(0, 60), coche, x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) });
  });
  return out;
})()`;

// Amène UNE option du panneau ouvert à l'écran (celle qu'on va cliquer) ; les positions sont ensuite relues, jamais gardées.
const scriptDefilerOption = (libelle) => `(() => { const l = ${JSON.stringify(String(libelle))}; const n = (t) => String(t || '').replace(/\\s+/g, ' ').trim();
  const li = [...document.querySelectorAll('.ui-selectcheckboxmenu-panel li')].find((x) => n(x.innerText) === l); if (li) li.scrollIntoView({ block: 'nearest', behavior: 'instant' }); return !!li; })()`;

const SCRIPT_ERREURS = `(() => [...document.querySelectorAll('.ui-messages-error, .ui-growl-message-error, .ui-message-error, .ui-messages-warn, .ui-growl-message-warn')]
  .filter((e) => e.getBoundingClientRect().width > 2).map((e) => String(e.innerText).replace(/\\s+/g, ' ').trim().slice(0, 200)).filter(Boolean).slice(0, 4))()`;

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/** Le relevé de l'extension (même code), lu une fois : asset du .exe, sinon le fichier du dépôt. @param {{ racineRepo?: string }} [config] */
async function scriptReleve(config) {
  try {
    const sea = require('node:sea');
    if (sea.isSea()) return sea.getAsset('authentic/releve.js', 'utf8');
  } catch (_) { /* hors exécutable */ }
  const racine = (config && config.racineRepo) || path.resolve(__dirname, '..', '..');
  return fsp.readFile(path.join(racine, 'extension-firefox', 'releve.js'), 'utf8');
}

/**
 * Les gestes de base sur une séance (navigateur/session.js), pour les parcours ci-dessous. `o.ecriture` : écrire dans Authentic est permis
 * pour CE parcours (préparation CJN / Comedec allumée par l'étude) ; sinon tout geste d'écriture est refusé par la garde.
 * @param {any} s @param {(texte: string) => void} etape @param {{ ecriture?: boolean }} [o]
 */
function gestes(s, etape, o = {}) {
  const ev = (expr) => s.evaluer(expr);
  const cdp = (methode, params) => s.cdp.envoyer(methode, params, s.ongletActif().session);
  /**
   * Clique un texte visible. Chaque clic dit son GESTE (authentic/garde.js) : connexion, navigation, donnee (un texte de la fiche : nom du
   * dossier, d'une personne, d'un bien) ou ecriture ; la garde refuse un geste inconnu, une écriture non permise, un libellé hors de la liste
   * du geste et tout bouton interdit sous le pointeur.
   * @param {string} texte @param {{ exact?: boolean, geste: 'connexion' | 'navigation' | 'donnee' | 'suivi' | 'ecriture' }} c
   */
  async function cliquerTexte(texte, c) {
    const el = await ev(scriptTrouverTexte(texte, !!(c && c.exact)));
    if (!el) return false;
    // Jamais le texte d'une donnée (nom d'un client) dans un message d'erreur (audit 0.391.1).
    if (el.cache) throw new Error(`« ${c && c.geste === 'donnee' ? 'l’élément cherché' : String(texte).slice(0, 40)} » est recouvert par autre chose : pas cliqué`);
    controlerClic({ geste: c && c.geste, vise: texte, bouton: el.bouton, texte: el.texte, ecritureAutorisee: !!o.ecriture });
    await s.cliquerPosition(el.x, el.y);
    return true;
  }
  /** Clique le résultat qui porte le numéro du dossier (geste « donnée » : contrôlé par la garde comme tout clic). @param {string} ref */
  async function cliquerReference(ref, liste) {
    const el = await ev(scriptTrouverReference(ref, !!liste));
    if (!el) return false;
    if (el.cache) return false;   // seuls des éléments recouverts portent le numéro : la recherche continue (Entrée, autre champ)
    controlerClic({ geste: 'donnee', vise: ref, bouton: el.bouton, texte: el.texte, ecritureAutorisee: !!o.ecriture });
    await s.cliquerPosition(el.x, el.y);
    return true;
  }
  /** Clique l'icône qui ouvre le dossier dans le résultat de recherche qui porte son numéro (jamais le titre, qui n'ouvre qu'un panneau
   * latéral). @param {string} ref */
  async function ouvrirResultat(ref) {
    const el = await ev(scriptOuvrirResultat(ref));
    if (!el || el.cache) return false;
    controlerClic({ geste: 'donnee', vise: ref, bouton: el.bouton, texte: el.texte, ecritureAutorisee: !!o.ecriture });
    await s.cliquerPosition(el.x, el.y);
    return true;
  }
  /** Écrit dans le champ sous le pointeur (tout ce qu'il contenait est remplacé). @param {{ x: number, y: number }} pos @param {string} texte */
  async function ecrire(pos, texte) {
    await s.cliquerPosition(pos.x, pos.y);
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: 2, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 2, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 });
    await cdp('Input.insertText', { text: String(texte) });
  }
  async function entree() {
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await s.attendreStable(12000);
  }
  async function echap() {
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  }
  /** Attend qu'un texte apparaisse dans la page. @param {RegExp} re @param {number} [ms] */
  async function attendreTexte(re, ms = 15000) {
    const fin = Date.now() + ms;
    while (Date.now() < fin) {
      const t = await ev('document.body ? document.body.innerText : ""').catch(() => '');
      if (re.test(String(t))) return true;
      await attendre(400);
    }
    return false;
  }
  const texte = () => ev('document.body ? document.body.innerText : ""').then(String).catch(() => '');
  /** Déplie les blocs ou groupes REPLIÉS dont l'en-tête répond à `reSource` (chevron fermé seulement, geste « deplier » contrôlé par la
   * garde). Rend { n : chevrons cliqués, fermes : blocs restés repliés }. @param {string} reSource */
  async function deplier(reSource, racine) {
    let n = 0;
    let refuses = 0;
    const nettoyer = (attr) => ev(`(() => document.querySelectorAll('[${attr}]').forEach((x) => x.removeAttribute('${attr}')))()`);
    // Une marque laissée par une lecture interrompue ne doit jamais désigner un autre chevron.
    await nettoyer('data-claire-chevron');
    await nettoyer('data-claire-masque');
    // Un chevron par lecture de la page : chaque dépliage déplace ce qui suit (relecture 0.391.5) ; 20 au plus.
    let reste = Infinity;
    let r = { reste: 0, cible: null };
    while (n + refuses < 20) {
      r = (await ev(scriptChevronsFermes(reSource, racine))) || { reste: 0, cible: null };
      if (!r.cible || r.reste >= reste) break;
      reste = r.reste;
      try {
        controlerClic({ geste: 'deplier', vise: '', bouton: r.cible.bouton, texte: r.cible.bouton });
      } catch (e) {
        // Refusé par la garde : marqué pour ne plus être proposé, le dépliage continue avec les autres (audit 0.392.0).
        if (!(e && e.refusGarde)) throw e;
        await ev(`(() => { const x = document.querySelector('[data-claire-chevron]'); if (x) { x.removeAttribute('data-claire-chevron'); x.setAttribute('data-claire-refuse', '1'); } })()`);
        refuses++;
        reste = Infinity;
        continue;
      }
      await nettoyer('data-claire-chevron');
      await s.cliquerPosition(r.cible.x, r.cible.y);
      await attendre(500);
      n++;
    }
    if (n) await s.attendreStable(5000);
    // Ce qui reste fermé (refusé, recouvert ou au-delà de 20) : dit par l'appelant (suivi « tronqué », pièces jointes incomplètes).
    const fin = (await ev(scriptChevronsFermes(reSource, racine))) || { reste: 0 };
    await nettoyer('data-claire-chevron');
    await nettoyer('data-claire-masque');
    return { n, fermes: (fin.reste || 0) + refuses };
  }
  /** Clique une entrée du menu de gauche (« Suivis », « Suivi MICEN »…) après avoir posé la souris sur le menu, qui se déplie au survol.
   * `chercherSeulement` : dit seulement si l'entrée est visible. @param {string} libelle @param {boolean} [chercherSeulement] */
  async function cliquerMenu(libelle, chercherSeulement) {
    const p = await ev(SCRIPT_POINT_MENU);
    if (p) { await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y }); await attendre(400); }
    const el = await ev(scriptEntreeMenu(libelle));
    if (!el || chercherSeulement) return !!el;
    controlerClic({ geste: 'suivi', vise: libelle, bouton: el.bouton, texte: libelle, ecritureAutorisee: !!o.ecriture });
    await s.cliquerPosition(el.x, el.y);
    return true;
  }
  /** Menu de gauche REPLIÉ (icônes seules, capture de l'étude 29/10) : clique l'icône d'une rubrique par son MOT d'icône (« folder » =
   * « Dossiers ») pour déplier le menu. Le libellé contrôlé est « <rubrique> <mot d'icône> » : la garde le lit comme un bouton de menu.
   * @param {string} mot @param {string} libelle */
  async function cliquerIconeMenu(mot, libelle) {
    const el = await ev(scriptIconeMenu(mot));
    if (!el) return false;
    controlerClic({ geste: 'suivi', vise: libelle, bouton: `${libelle} ${mot}`, texte: libelle, ecritureAutorisee: !!o.ecriture });
    await s.cliquerPosition(el.x, el.y);
    return true;
  }
  /** Referme le tiroir ou le panneau latéral ouvert (Échap, sinon son « Fermer »). Rend vrai s'il est fermé. */
  async function fermerTiroir() {
    if (!(await ev(SCRIPT_TIROIR_OUVERT))) return true;
    await echap();
    await attendre(400);
    if (await ev(SCRIPT_TIROIR_OUVERT)) {
      const f = await ev(SCRIPT_FERMER_TIROIR);
      if (f) { controlerClic({ geste: 'navigation', vise: f.texte, bouton: f.texte, texte: f.texte }); await s.cliquerPosition(f.x, f.y); await attendre(400); }
    }
    return !(await ev(SCRIPT_TIROIR_OUVERT));
  }
  return { ev, cdp, cliquerTexte, cliquerReference, ouvrirResultat, deplier, cliquerMenu, cliquerIconeMenu, fermerTiroir, ecrire, entree, echap, attendreTexte, texte, etape };
}

// Vérification du poste client Silicium (étude 27/10 : « à l'ouverture d'Authen.TIC, l'application vérifie que le poste client Silicium est
// installé ; sinon elle redirige vers une page d'installation et bloque l'accès ») : l'étude la passe en déclenchant l'appel serveur que lance
// normalement l'élément `redirectionInstallationPosteClient`, avec le paramètre true. C'est le SEUL appel PrimeFaces que CLAIRE fait elle-même,
// écrit ici en dur ; il n'est lancé que sur la page d'installation (adresse « installation », ou texte qui dit à la fois « poste client », « Silicium » et
// « install… ») où cet élément existe — jamais sur une fiche qui dit seulement « Installation » (diagnostics gaz d'une fiche immeuble).
const SCRIPT_PAGE_SILICIUM = `(() => {
  const el = document.getElementById('redirectionInstallationPosteClient');
  const t = document.body ? String(document.body.innerText || '') : '';
  const bloque = (/installation/i.test(location.href) || (/poste client/i.test(t) && /silicium/i.test(t) && /install/i.test(t))) && ![...document.querySelectorAll('input[type="password"]')].some((x) => x.getClientRects().length);
  // Session ouverte = le champ de recherche de l'accueil (« searchForm:query », étude 29/10) est affiché : la page d'installation n'est plus là.
  const recherche = document.getElementById('searchForm:query');
  const session = !!(recherche && recherche.getClientRects().length);
  return { element: !!el, bloque, session, motDePasse: [...document.querySelectorAll('input[type="password"]')].some((x) => x.getClientRects().length), chemin: String(location.pathname), primefaces: !!(window.PrimeFaces && typeof window.PrimeFaces.ab === 'function') };
})()`;
const SCRIPT_PASSER_SILICIUM = "PrimeFaces.ab({ s: 'redirectionInstallationPosteClient', p: 'redirectionInstallationPosteClient', ps: true, pa: ['true'] }), true";

/** Pure : la page est-elle la page d'installation du poste client à passer ? @param {any} etat ce que rend SCRIPT_PAGE_SILICIUM */
function pageSiliciumAPasser(etat) {
  // Le test fiable (étude 29/10, l'adresse reste « authentication.xhtml » et le texte varie) : l'élément `redirectionInstallationPosteClient`
  // est dans la page et PrimeFaces est défini ; jamais quand le champ de recherche de l'accueil montre la session déjà ouverte.
  return !!(etat && etat.element && etat.primefaces && !etat.session && !etat.motDePasse);
}

/** Passe la vérification Silicium si la page la montre (trois fois au plus : elle revient après la connexion). Rend le nombre de passages.
 * @param {any} s @param {(t: string) => void} etape */
async function passerVerificationSilicium(s, etape) {
  let n = 0;
  for (let i = 0; i < 3; i++) {
    const etat = await s.evaluer(SCRIPT_PAGE_SILICIUM).catch(() => null);
    if (!pageSiliciumAPasser(etat)) break;
    etape('Passe la vérification du poste client Silicium');
    await s.evaluer(SCRIPT_PASSER_SILICIUM).catch(() => null);   // la page qui change pendant l'appel n'arrête rien
    n++;
    // Attendre la bascule vers l'accueil (main.xhtml, champ de recherche affiché) avant tout nouvel appel : jamais deux fois à l'aveugle.
    for (let k = 0; k < 24; k++) {
      await attendre(500);
      const apres = await s.evaluer(SCRIPT_PAGE_SILICIUM).catch(() => null);
      if (!apres || !apres.element || apres.session || apres.chemin !== etat.chemin) break;
    }
    await s.attendreStable(10000);
  }
  return n;
}

/**
 * Diagnostic quand le navigateur du serveur ne charge pas Authentic (étude 28/10 : « le site ne répond pas » deux fois) : le SERVEUR lui-même
 * (Node, hors navigateur) joint-il l'adresse ? Une seule requête HEAD, 15 s, rien n'est envoyé d'autre (ni identifiant, ni cookie).
 * Rend une phrase pour le message d'échec. @param {string} adresse @param {{ requete?: any }} [inj]
 */
function diagnosticAccesAuthentic(adresse, inj) {
  const https = (inj && inj.requete) || require('node:https');
  const debut = Date.now();
  return new Promise((ok) => {
    let fini = false;
    const finir = (/** @type {string} */ t) => { if (!fini) { fini = true; ok(t); } };
    try {
      const req = https.request(adresse, { method: 'HEAD', timeout: 15000 }, (/** @type {any} */ res) => {
        res.resume && res.resume();
        finir(`le serveur joint pourtant Authentic (${res.statusCode} en ${((Date.now() - debut) / 1000).toFixed(1).replace('.', ',')} s) : c’est son navigateur qui ne charge pas la page (proxy du navigateur, Silicium, certificat demandé)`);
      });
      req.on('timeout', () => { req.destroy(); finir('le serveur ne joint pas Authentic (aucune réponse en 15 s) : Internet, proxy ou pare-feu du serveur à vérifier'); });
      req.on('error', (/** @type {any} */ e) => {
        const code = String((e && e.code) || 'erreur réseau').slice(0, 30);
        finir(`le serveur ne joint pas Authentic (${code}) : ${/^(CERT_|UNABLE_|SELF_SIGNED|DEPTH_)/.test(code) ? 'certificat intercepté (antivirus ?), ' : ''}Internet, DNS, proxy ou pare-feu du serveur à vérifier`);
      });
      req.end();
    } catch (e) { finir('diagnostic impossible'); }
  });
}

/** Connexion (identifiant, mot de passe, « Se connecter »). Rien ne s'écrit si la session est déjà ouverte. @param {any} s @param {any} r @param {(t: string) => void} etape */
async function seConnecter(s, r, etape) {
  if (!r.identifiant || !r.motDePasse) throw new Error('identifiant ou mot de passe d’Authentic non enregistré (Réglages › Authentic)');
  const g = gestes(s, etape);
  etape('Ouvre Authentic');
  try {
    await s.aller(r.adresse);
  } catch (e) {
    if (!/ne répond pas|non chargée/.test(String(e && e.message))) throw e;
    etape('Authentic ne répond pas : diagnostic de l’accès du serveur');
    throw new Error(`Authentic ne se charge pas — ${await diagnosticAccesAuthentic(r.adresse)}`);
  }
  await passerVerificationSilicium(s, etape);
  const pw = await g.ev(SCRIPT_CHAMP_MOT_DE_PASSE);
  if (!pw) {
    if (await g.ev(scriptChamp('rechercher'))) { etape('Session déjà ouverte'); return; }
    throw new Error('page de connexion d’Authentic non reconnue (ni mot de passe, ni recherche)');
  }
  etape('Se connecte avec le compte de l’étude');
  const id = await g.ev(SCRIPT_CHAMP_IDENTIFIANT);
  if (!id) throw new Error('champ « Identifiant » introuvable sur la page de connexion');
  await g.ecrire(id, r.identifiant);
  await g.ecrire(pw, r.motDePasse);
  if (!(await g.cliquerTexte('Se connecter', { exact: true, geste: 'connexion' }))) await g.entree();
  await s.attendreStable(20000);
  await passerVerificationSilicium(s, etape);
  if (await g.ev(SCRIPT_CHAMP_MOT_DE_PASSE)) throw Object.assign(new Error('connexion refusée par Authentic (identifiant ou mot de passe)'), { refusIdentifiants: true });
  // La page « Installation du poste client » encore là après les essais : dit tout de suite, plutôt qu'un dossier « introuvable » plus tard.
  const silicium = await g.ev(SCRIPT_PAGE_SILICIUM).catch(() => null);
  if (pageSiliciumAPasser(silicium)) throw new Error('vérification du poste client Silicium non passée : Authentic demande toujours d’installer le poste client');
  etape('Connectée');
}

/** Pure : la PREMIÈRE ligne de la page qui commence par une référence d'Authentic (« A 2026 00286 VTE … ») — l'en-tête du dossier affiché
 * (les titres des onglets ne commencent pas par une référence). @param {string} texte */
function referenceEnTete(texte) {
  // Avec ou sans espaces (« A 2026 00500 » ou « A202600500 », relecture 0.390.1), rendue toujours au format à espaces.
  const l = String(texte || '').split('\n').map((x) => x.trim()).find((x) => /^[A-Z]\s*(?:19|20)\d{2}\s*\d{4,6}(?!\d)/.test(x));
  const m = l ? /^([A-Z])\s*((?:19|20)\d{2})\s*(\d{4,6})(?!\d)/.exec(l) : null;
  return m ? `${m[1]} ${m[2]} ${m[3]}` : '';
}

/** Pure : le dossier affiché est-il CE dossier ? Référence de l'en-tête égale à la sienne (exigée quand elle est connue) ; sans
 * référence, le libellé exact de cet en-tête. Toujours la rubrique « Comparants (N) ». @param {string} texte @param {{ reference?: string, libelle?: string }} cible */
function estCeDossier(texte, cible) {
  if (!/Comparants\s*\(\d+\)/i.test(String(texte || ''))) return false;
  const ref = String(cible.reference || '').replace(/\s+/g, ' ').trim();
  if (ref) return referenceEnTete(texte) === ref;
  // Sans référence : l'EN-TÊTE (première ligne qui commence par une référence) porte exactement ce libellé — jamais un titre d'onglet.
  const lib = plat(cible.libelle);
  const tete = String(texte || '').split('\n').map((x) => x.trim()).find((x) => /^[A-Z]\s*(?:19|20)\d{2}\s*\d{4,6}(?!\d)/.test(x));
  return !!lib && !!tete && plat(tete).replace(/^[a-z]\s*\d{4}\s*\d{4,6}\s+/, '') === lib;
}

/**
 * Retrouve et ouvre CE dossier : un lien dont le texte est sa référence (« Derniers dossiers ouverts », résultats), sinon la recherche
 * générale par la référence puis par le libellé. Une page qui ne montre pas SA référence en tête n'est jamais prise (relecture 0.373.0 :
 * « VTE DUPONT / MARTIN » ouvrait « VTE DUPONT / MARTINEZ »).
 * @param {any} s @param {{ reference?: string, libelle?: string }} cible @param {(t: string) => void} etape
 */
/** Pure : la référence telle que la recherche d'Authentic l'attend, sans espace (« A 2026 00500 » → « A202600500 »). @param {string} ref */
function referenceRecherche(ref) { return String(ref || '').replace(/\s+/g, ''); }

/** CE dossier est-il affiché ? Sa page de sous-dossier (« Comparants » et sa référence en tête), ou la page du dossier sans sous-dossier
 * choisi, reconnue à son seul BANDEAU `…:dossierHeader` (jamais au titre d'un résultat de recherche, qui commence aussi par la référence).
 * @param {ReturnType<typeof gestes>} g @param {{ reference?: string, libelle?: string }} cible */
async function dossierAffiche(g, cible) {
  if (estCeDossier(await g.texte(), cible)) return true;
  const tete = String((await g.ev(SCRIPT_EN_TETE_DOSSIER).catch(() => '')) || '');
  if (!referenceEnTete(tete)) return false;
  return estCeDossier(`Comparants (0)\n${tete}`, cible);
}

/** Le numéro tapé dans la recherche : sans espace d'abord (« A202600500 »), puis avec. @param {string} ref */
const numeros0 = (ref) => [...new Set([String(ref || '').replace(/\D+/g, ''), referenceRecherche(ref)].filter(Boolean))];

/** Le numéro tel que la liste de résultats l'AFFICHE : la lettre, une espace, les chiffres (« A 202600500 », relevé de l'étude 29/10). @param {string} ref */
function referenceAffichee(ref) {
  const m = /^([A-Za-z])\s*(\d{4})\s*(\d{4,6})$/.exec(String(ref || '').replace(/\s+/g, ' ').trim().replace(/^([A-Za-z]) (\d)/, '$1$2').replace(/(\d{4}) (\d)/, '$1$2'));
  return m ? `${m[1].toUpperCase()} ${m[2]}${m[3]}` : '';
}

async function ouvrirDossier(s, cible, etape) {
  const g = gestes(s, etape);
  const ref = String(cible.reference || '').replace(/\s+/g, ' ').trim();
  const lib = String(cible.libelle || '').trim();
  if (!ref && !lib) throw new Error('dossier sans référence ni nom dans Authentic');
  etape('Cherche le dossier');
  await passerVerificationSilicium(s, etape);
  // Page VIDE (l'application n'est pas affichée) : patience, puis la page d'accueil de l'application (`main.xhtml`, relevé de l'étude : l'adresse
  // du navigateur est « …/41089-Authentic/main.xhtml ») — jamais une recherche dans une page blanche (étude 29/10).
  if (await g.ev(SCRIPT_PAGE_VIDE)) {
    etape('Page vide : attente de l’application');
    await attendre(4000);
    await s.attendreStable(15000);
    if (await g.ev(SCRIPT_PAGE_VIDE)) {
      etape('Page vide : ouverture de la page d’accueil d’Authentic');
      const href = String(await g.ev('location.href') || '').replace(/[?#].*$/, '');
      let accueil = '';
      try { accueil = new URL('main.xhtml', /\.[a-z]{2,6}$/i.test(href) ? href : href.replace(/\/?$/, '/')).href; } catch (_) { /* adresse illisible */ }
      if (accueil) {
        try { await s.aller(accueil); } catch (e) { if (!/ne répond pas|non chargée/.test(String(e && e.message))) throw e; }
        await passerVerificationSilicium(s, etape);
        await s.attendreStable(15000);
      }
      if (await g.ev(SCRIPT_CHAMP_MOT_DE_PASSE)) throw new Error('Authentic affiche sa page de connexion (session perdue) : nouvelle tentative à lancer');
      if (await g.ev(SCRIPT_PAGE_VIDE)) throw new Error('la page d’Authentic reste vide (application non affichée) : nouvelle tentative à lancer, ou vérifier la connexion dans Réglages › Authentic');
    }
  }
  if (await dossierAffiche(g, cible)) return;
  // Ce qui s'est passé, pour le message d'échec (étude 28/10 : « dossier … introuvable ») : jamais un nom, seulement les étapes et une référence.
  const diag = { champs: /** @type {string[]} */ ([]), visible: false, clic: false, enTete: '', menu: '' };
  // Un lien qui porte la référence (« A 2026 00286 VTE … », ou sans espaces), sinon un résultat qui la CONTIENT ; sans référence, exactement
  // le libellé. Une recherche qui ouvre directement le dossier compte.
  const essayer = async (apresRecherche) => {
    // Après une recherche : d'abord l'icône qui OUVRE le dossier (le titre d'un résultat n'ouvre qu'un panneau latéral), puis le texte du numéro.
    const ok = ref ? ((apresRecherche && await g.ouvrirResultat(ref)) || await g.cliquerTexte(ref, { geste: 'donnee' }) || await g.cliquerTexte(referenceRecherche(ref), { geste: 'donnee' })
      || (referenceAffichee(ref) && await g.cliquerTexte(referenceAffichee(ref), { geste: 'donnee' }))
      || (apresRecherche && await g.cliquerReference(ref)))
      : await g.cliquerTexte(lib, { exact: true, geste: 'donnee' });
    if (ok) { diag.clic = true; await s.attendreStable(15000); }
    if (await dossierAffiche(g, cible)) return true;
    const t = await g.texte();
    if (ok) diag.enTete = referenceEnTete(t) || diag.enTete;
    // Un clic qui n'a ouvert qu'un panneau latéral (titre d'un résultat) : refermé, sinon son voile gris recouvre tout le reste.
    if (ok) await g.fermerTiroir().catch(() => false);
    return false;
  };
  if (await essayer()) return;
  // Par le menu de gauche « Dossiers › Rechercher » (étude 29/10) : la page de recherche d'un dossier ; le numéro SANS espace, puis Entrée,
  // puis le résultat (icône du dossier). Lecture seule : taper et chercher ne créent rien dans Authentic.
  if (ref) {
    try {
      if (!(await g.cliquerMenu('Rechercher', true))) {
        // Menu replié (icônes seules) : « Dossiers » par son texte au survol, sinon par son icône de dossier.
        if (await g.cliquerMenu('Dossiers') || await g.cliquerIconeMenu('folder', 'Dossiers')) await attendre(700);
      }
      if (await g.cliquerMenu('Rechercher')) {
        diag.menu = 'page ouverte';
        await s.attendreStable(15000);
        for (const quoi of numeros0(ref)) {
          const champ = await g.ev(SCRIPT_CHAMP_NUMERO_RECHERCHE);
          if (!champ) { diag.menu = 'page ouverte, champ du numéro non trouvé'; break; }
          diag.menu = 'numéro tapé';
          await g.ecrire(champ, quoi);
          await g.entree();
          await attendre(1500);
          await s.attendreStable(15000);
          if (String(await g.texte()).replace(/\s+/g, '').toLowerCase().includes(referenceRecherche(ref).toLowerCase())) diag.visible = true;
          if (await essayer(true)) return;
        }
      } else diag.menu = 'entrée du menu introuvable';
    } catch (e) {
      if (e && e.annule) throw e;
      diag.menu = `échec (${String((e && e.message) || e).slice(0, 60)})`;
    }
  }
  // Deux champs de recherche dans Authentic : « Rechercher une affaire » puis « Rechercher » ; la liste déroulante d'abord, puis Entrée.
  // Le numéro est tapé SANS espace d'abord (« A202600500 » : seule forme vue fonctionner par l'étude, 28/10), puis avec (« A 2026 00500 »).
  // Libellés essayés, du plus précis au plus large (le vrai libellé d'Authentic n'est pas encore relevé).
  // « recherche » / « search » : seulement par ce que la page affiche (placeholder, aria-label, étiquette), et le NUMÉRO seul — jamais le nom
  // du dossier (noms des clients) dans un champ trouvé par un libellé large (relecture 0.391.2). Ni « affaire » ni « dossier » seuls.
  const numeros = ref ? [referenceRecherche(ref), ref] : [];
  // Un libellé plus large qui retrouve un champ DÉJÀ essayé (même place à l'écran) : rien à retaper (relecture 0.391.3).
  const champsEssayes = new Set();
  for (const { libelleChamp, large } of [{ libelleChamp: 'rechercher une affaire', large: false }, { libelleChamp: 'rechercher', large: false }, { libelleChamp: 'recherche', large: true }, { libelleChamp: 'search', large: true }]) {
    const quois = (large ? numeros : [...numeros, lib]).filter(Boolean);
    for (const quoi of quois) {
      const champ = await g.ev(scriptChamp(libelleChamp, large));
      if (!champ) break;
      const place = `${champ.x},${champ.y}`;
      if (quoi === quois[0] && champsEssayes.has(place)) break;
      champsEssayes.add(place);
      if (!diag.champs.includes(libelleChamp)) diag.champs.push(libelleChamp);
      await g.ecrire(champ, quoi);
      await attendre(1500);
      if (ref && String(await g.texte()).replace(/\s+/g, '').toLowerCase().includes(referenceRecherche(ref).toLowerCase())) diag.visible = true;
      // Avant Entrée : seulement une option de la liste déroulante (jamais un autre élément de la page qui porterait le numéro).
      if (ref && await g.cliquerReference(ref, true)) {
        diag.clic = true;
        await s.attendreStable(15000);
        if (await dossierAffiche(g, cible)) return;
      }
      await g.entree();
      if (ref && String(await g.texte()).replace(/\s+/g, '').toLowerCase().includes(referenceRecherche(ref).toLowerCase())) diag.visible = true;
      if (await essayer(true)) return;
    }
  }
  let visibles = [];
  let allure = null;
  if (!diag.champs.length) {
    try { visibles = (await g.ev(SCRIPT_CHAMPS_VISIBLES)) || []; } catch (_) { /* page fermée */ }
    try { allure = await g.ev(SCRIPT_ALLURE_PAGE); } catch (_) { /* page fermée */ }
  }
  const dit = [diag.champs.length ? `recherche tapée dans « ${diag.champs.map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join(' » puis « ')} »`
    : 'aucun champ de recherche trouvé',
    diag.menu ? `menu Dossiers › Rechercher : ${diag.menu}` : '',
    ref ? `numéro affiché ensuite : ${diag.visible ? 'oui' : 'non'}` : '', `résultat cliqué : ${diag.clic ? 'oui' : 'non'}`,
    diag.enTete ? `page ouverte : ${diag.enTete}` : '',
    // En dernier : le message est coupé à 320 caractères dans la discussion.
    !diag.champs.length ? `champs visibles : ${visibles.length ? visibles.map((v) => `« ${v} »`).join(', ') : 'aucun'}` : '',
    allure ? `page ${allure.chemin} : ${allure.champs} champ(s), ${allure.boutons} bouton(s), ${allure.cadres} cadre(s)${allure.mots.length ? `, mots : ${allure.mots.join('/')}` : ''}${allure.icones.length ? `, icônes : ${allure.icones.join('/')}` : ''}` : ''].filter(Boolean).join(' ; ');
  throw new Error(`${ref ? `dossier ${ref} introuvable dans Authentic` : 'dossier introuvable dans Authentic par son nom'} (${dit})`);
}

/** Ouvre le sous-dossier de vente (« N - VTE … » / « N - Vente … », jamais la promesse ni l'avenant) et vérifie qu'il est affiché.
 * Rend faux s'il n'y en a pas. @param {any} s @param {{ reference?: string, libelle?: string }} cible @param {(t: string) => void} etape */
async function ouvrirSousDossierVente(s, cible, etape) { return ouvrirSousDossierDe(s, cible, etape, 'vente'); }

/** Le sous-dossier de la PROMESSE (ou du compromis), jamais un avenant — pour la comptabilité quand la vente n'en a pas (étude 30/10). */
async function ouvrirSousDossierPromesse(s, cible, etape) { return ouvrirSousDossierDe(s, cible, etape, 'promesse'); }

/** @param {any} s @param {any} cible @param {(t: string) => void} etape @param {'vente' | 'promesse'} sorte */
async function ouvrirSousDossierDe(s, cible, etape, sorte) {
  const g = gestes(s, etape);
  const estVente = sorte === 'promesse'
    ? (/** @type {string} */ l) => /^\d{1,3}\s*-\s*(Promesse|Compromis)\b/i.test(l) && !/avenant/i.test(l)
    : (/** @type {string} */ l) => /^\d{1,3}\s*-\s*(VTE|Vente)\b/i.test(l) && !/promesse|avenant|compromis/i.test(l);
  const nomEtape = sorte === 'promesse' ? 'Ouvre le sous-dossier de la promesse' : 'Ouvre le sous-dossier de vente';
  // Un mot d'icône en tête (« folder 2 - Vente d'immeuble ») n'est pas le libellé.
  const libelle = (/** @type {any} */ l) => String(l || '').replace(/^[a-z_]{3,}\s+(?=\d)/, '').trim();
  // La liste réelle des sous-dossiers (`…:selectSousDossier`, relevé de l'étude) : le libellé y figure trois fois sur la page (ligne repliable,
  // titre, liste) — seule la liste est cliquée (wiki, 28/10 : la ligne repliable replierait Comparants et Immeubles).
  const liste = ((await g.ev(SCRIPT_SOUS_DOSSIERS)) || []).map(libelle);
  if (liste.length) {
    const ventes = liste.map((l, i) => ({ l, i })).filter((x) => estVente(x.l));
    if (ventes.length !== 1) return false;   // aucune, ou plusieurs ventes : on ne choisit pas
    const ouvert = libelle(await g.ev(SCRIPT_SOUS_DOSSIER_OUVERT));
    if (ouvert && plat(ouvert) === plat(ventes[0].l) && estCeDossier(await g.texte(), cible)) return true;
    etape(nomEtape);
    const pos = await g.ev(scriptPlacerSousDossier(ventes[0].i));
    if (!pos) return false;
    controlerClic({ geste: 'donnee', vise: ventes[0].l, bouton: pos.bouton, texte: ventes[0].l });
    await s.cliquerPosition(pos.x, pos.y);
    await s.attendreStable(12000);
    return estCeDossier(await g.texte(), cible);
  }
  const lignes = [...new Set(String(await g.texte()).split('\n').map((l) => l.trim()).filter(estVente))];
  if (lignes.length !== 1) return false;   // aucun, ou plusieurs : on ne choisit pas
  etape(nomEtape);
  if (!(await g.cliquerTexte(lignes[0], { exact: true, geste: 'donnee' }))) return false;
  await s.attendreStable(12000);
  return estCeDossier(await g.texte(), cible);
}

// Aperçus des formalités (plan Authen.TIC, étape 4 ; cartographie du 27/10 : « s'ouvre par l'icône image qui apparaît au survol d'une ligne
// de formalité, et non par le clic sur le titre, qui peut bloquer le chargement »). Les lignes : un élément visible dont le texte commence par
// un badge (APR, ECV, T@, ACT, MIC…), le plus intérieur ; chacune reçoit un repère `data-claire-ligne`.
const SCRIPT_LIGNES_FORMALITES = `(() => {
  const re = /^(APR|ECV|T@|ACT|MIC|SPR|BRI|CJN|TAC)(?=\\s|$)/;
  const vus = [];
  document.querySelectorAll('tr, li, [class*="formalite"], [class*="ui-datalist-item"]').forEach((e) => {
    if (!e.offsetWidth || !e.offsetHeight || e.closest('[id*="previewFormalite"], [id*="sideView"]')) return;
    const t = String(e.innerText || '').trim();
    if (!re.test(t) || t.length > 400) return;
    if ([...e.querySelectorAll('tr, li')].some((x) => re.test(String(x.innerText || '').trim()))) return;
    vus.push(e);
  });
  vus.slice(0, 40).forEach((e, i) => e.setAttribute('data-claire-ligne', String(i)));
  return Math.min(vus.length, 40);
})()`;
/** La ligne i amenée à l'écran ; sa position APRÈS le défilement (audit 0.378.0) : { x, y } ou null. @param {number} i */
const scriptPlacerLigne = (i) => `(() => {
  const l = document.querySelector('[data-claire-ligne="${Number(i)}"]');
  if (!l) return null;
  l.scrollIntoView({ block: 'center' });
  const r = l.getBoundingClientRect();
  return { x: Math.round(r.left + Math.min(r.width / 2, 200)), y: Math.round(r.top + r.height / 2) };
})()`;
/**
 * L'icône d'aperçu de la ligne i, visible après le survol : jamais un élément qui porte le texte de la ligne (son titre), toujours une icône
 * dont le libellé dit l'aperçu. Le libellé rendu est celui de ce qui est RÉELLEMENT sous le pointeur (titre, aria-label, alt, classe de
 * l'élément et de son bouton, « supprimer » s'il porte une corbeille) — audit 0.378.0. { x, y, bouton } ou null. @param {number} i
 */
const scriptIconeApercu = (i) => `(() => {
  const l = document.querySelector('[data-claire-ligne="${Number(i)}"]');
  if (!l) return null;
  const libelle = (x) => [x.getAttribute('title'), x.getAttribute('aria-label'), x.getAttribute('alt'), typeof x.className === 'string' ? x.className : '', x.innerText].filter(Boolean).join(' ').replace(/\\s+/g, ' ').trim();
  // L'icône d'aperçu est un pictogramme « pile d'images » (captures du wiki, 28/10) — mot d'icône Material écrit dans la page (« photo_library »).
  const dit = /aper[çc]u|preview|visibility|(?<![a-z])voir(?![a-z])|image|photo|collections|perm_media/i;
  // Une icône : 3 caractères au plus, ou un mot d'icône seul ; jamais l'engrenage d'une formalité non constituée (« Constituer »).
  const court = (x) => { const t = String(x.innerText || '').trim(); return t.length <= 3 || /^[a-z_]{3,30}$/.test(t); };
  const e = [...l.querySelectorAll('button, a, [role=button], i, span, img')]
    // Jamais une corbeille, même si son titre dit « aperçu » (« Supprimer l'aperçu ») : elle et ce qui la contient sont écartés d'avance ; la
    // garde contrôle encore ce qui est sous le pointeur.
    .filter((x) => !/supprim|corbeille|trash|delete|poubelle|settings|constitu|engrenage/i.test(libelle(x) + ' ' + [...x.querySelectorAll('*')].map(libelle).join(' ')))
    .find((x) => x.getClientRects().length && getComputedStyle(x).visibility !== 'hidden' && court(x) && dit.test(libelle(x)));
  if (!e) return null;
  const r = e.getBoundingClientRect();
  const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
  const dessous = document.elementFromPoint(x, y);
  if (!dessous || !(e.contains(dessous) || dessous.contains(e))) return null;
  const b = dessous.closest('button, a, [role=button]') || dessous;
  const corbeille = (b.matches('[class*=trash], [class*=delete], [class*=supprim], [class*=corbeille]') || b.querySelector('[class*=trash], [class*=delete], [class*=supprim], [class*=corbeille]')) ? ' supprimer' : '';
  const bouton = (libelle(dessous) + ' ' + (b !== dessous ? libelle(b) : '') + corbeille).replace(/\\s+/g, ' ').trim().slice(0, 160);
  return bouton ? { x, y, bouton } : null;
})()`;
const SELECTEUR_TIROIR = '[id*="previewFormalite"], [id*="sideView"]';
const SCRIPT_TIROIR_OUVERT = `!![...document.querySelectorAll('${SELECTEUR_TIROIR}')].find(${VISIBLE_ECRAN})`;
// « Fermer » cherché DANS le tiroir seulement, vérifié sous le pointeur : { x, y, texte } ou null.
const SCRIPT_FERMER_TIROIR = `(() => {
  const t = [...document.querySelectorAll('${SELECTEUR_TIROIR}')].find(${VISIBLE_ECRAN});
  if (!t) return null;
  const f = [...t.querySelectorAll('button, a, [role=button]')].find((x) => /^fermer$/i.test(String(x.innerText || x.getAttribute('title') || x.getAttribute('aria-label') || '').trim()));
  if (!f) return null;
  const r = f.getBoundingClientRect();
  const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
  const d = document.elementFromPoint(x, y);
  return d && (f.contains(d) || d.contains(f)) ? { x, y, texte: String(f.innerText || f.getAttribute('title') || f.getAttribute('aria-label') || '').trim() } : null;
})()`;

/**
 * Ouvre l'aperçu de chaque formalité du sous-dossier affiché (15 au plus), relève la page tiroir ouvert, puis le referme (Échap, sinon
 * « Fermer » du tiroir). Un tiroir qui ne se referme pas arrête tout (jamais un clic à l'aveugle sous lui). Rien n'est cliqué dans le tiroir
 * que « Fermer ». Rend le nombre d'aperçus relevés.
 * @param {any} s @param {{ script: string, recevoir: (c: any) => any, etape: (t: string) => void }} o
 */
async function lireApercusFormalites(s, o) {
  const g = gestes(s, o.etape);
  // Les blocs « Formalités préalables (N) », « Actes (N) », « Formalités postérieures (N) » et leurs groupes (« Urbanisme (1) »…) sont souvent
  // REPLIÉS (captures du wiki, 28/10) : dépliés par leur chevron, jamais par leur titre (l'onglet du même nom ouvre la fenêtre d'ajout).
  try {
    const d = await g.deplier('^(formalites prealables|actes|formalites posterieures|[a-z][a-z0-9 \'/@.-]{1,40}) \\(([1-9][0-9]*)\\)$');
    if (d.fermes) o.etape(`${d.fermes} bloc(s) replié(s) non déplié(s)`);
  } catch (e) { if (e && e.annule) throw e; o.etape('Blocs repliés non dépliés'); }
  const nb = Number(await g.ev(SCRIPT_LIGNES_FORMALITES)) || 0;
  if (!nb) o.etape('Aucune ligne de formalité visible : aperçus non lus');
  let n = 0, sansIcone = 0;
  const fin = Date.now() + 4 * 60 * 1000;
  for (let i = 0; i < nb; i++) {
    if (await g.ev(SCRIPT_TIROIR_OUVERT)) break;
    // Un plafond propre (audit 0.392.0 : 40 lignes × 8 s) ; une étape par ligne, pour que l'arrêt demandé soit vu.
    if (Date.now() > fin) { o.etape(`Aperçus arrêtés après 4 minutes (${i}/${nb})`); break; }
    o.etape(`Aperçu ${i + 1}/${nb}`);
    try {
      const pos = await g.ev(scriptPlacerLigne(i));
      if (!pos) continue;
      await g.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x, y: pos.y });
      await attendre(400);
      const ic = await g.ev(scriptIconeApercu(i));
      if (!ic) { sansIcone++; continue; }
      controlerClic({ geste: 'apercu', vise: '', bouton: ic.bouton, texte: ic.bouton });
      await s.cliquerPosition(ic.x, ic.y);
      await s.attendreStable(8000);
      if (!(await g.ev(SCRIPT_TIROIR_OUVERT))) continue;
      if (n === 0) o.etape('Relève les aperçus des formalités');
      await releverPage(s, o.script, o.recevoir);
      n++;
      await g.fermerTiroir();
    } catch (e) {
      // Un refus de la garde ou une ligne qui ne s'ouvre pas : la ligne suivante, sans s'arrêter.
      if (e && e.refusGarde) o.etape('Passe un aperçu (refusé par CLAIRE)');
    }
  }
  if (await g.ev(SCRIPT_TIROIR_OUVERT)) o.etape('Un aperçu ne s’est pas refermé : lecture des aperçus arrêtée');
  if (sansIcone) o.etape(`${sansIcone} ligne(s) sans icône d’aperçu trouvée`);
  return n;
}

// Pièces jointes du sous-dossier (GED, étape 5) : l'onglet « Pièces jointes » ouvert, la liste relevée (nom, identifiant, dossier de l'arbre).
/** @param {any} s @param {{ script: string, recevoir: (c: any) => any, etape: (t: string) => void }} o */
// Les répertoires de l'arbre de la GED (« Non classé (3) », « Annexes MICEN (1) »…) sont souvent REPLIÉS (captures du wiki, 28/10) : une
// pièce d'un répertoire fermé — l'EHF, un acte de naissance — n'est ni relevée ni trouvée. Dépliés par leur chevron seulement.
const RE_NOEUDS_GED = '^[^()]{1,80} \\(([1-9][0-9]*)\\)$';
// L'arbre de la GED seulement (jamais les blocs « Formalités (N) » ou « Mails (N) » de la page, audit 0.393.0) ; sélecteur à relever.
const ARBRE_GED = '.ui-tree, [id*="sousDossierTree"], [id*="Tree"], [class*="tree"]';

async function lirePiecesJointes(s, o) {
  const g = gestes(s, o.etape);
  if (!(await g.cliquerTexte('Pièces jointes', { geste: 'navigation' }))) return false;
  await s.attendreStable(10000);
  let fermes = 0;
  try {
    fermes = (await g.deplier(RE_NOEUDS_GED, ARBRE_GED)).fermes;
    if (fermes) o.etape(`${fermes} répertoire(s) des pièces jointes resté(s) replié(s)`);
  } catch (e) { if (e && e.annule) throw e; fermes = 1; o.etape('Répertoires des pièces jointes non dépliés'); }
  o.etape('Relève la liste des pièces jointes');
  // Des répertoires restés repliés : la liste est INCOMPLÈTE, dite (jamais « pas d'EHF » sur une liste partielle, audit 0.393.0).
  await releverPage(s, o.script, o.recevoir, fermes ? { groupesFermes: fermes } : null);
  return true;
}

/** La position du fichier `pjId` dans l'arbre de la GED, vérifiée sous le pointeur : { x, y, nom, bouton } ou null. @param {string} pjId */
const scriptPositionPiece = (pjId) => `(() => {
  const id = ${JSON.stringify(String(pjId))};
  const e = [...document.querySelectorAll('[onclick*="selectTreeNode"]')].find((x) => new RegExp("selectTreeNode\\\\(\\\\s*[^,]*,\\\\s*'?" + id + "'?[\\\\s,)]").test(x.getAttribute('onclick') || ''));
  if (!e) return null;
  // Le NOM du fichier (wiki, capture « 212 » : le nom ouvre l'aperçu, la case ne fait que sélectionner) : son libellé, sinon le plus petit
  // élément de texte, jamais une case à cocher ; la ligne entière en dernier recours.
  const nomEl = e.querySelector('.ui-treenode-label') || [...e.querySelectorAll('span, a, label')].find((x) => !x.children.length
    && /\\.[a-z0-9]{2,5}$/i.test(String(x.textContent || '').trim()) && !x.closest('.ui-chkbox, [role=checkbox], button, [role=button]')) || e;
  nomEl.scrollIntoView({ block: 'center' });
  const r = nomEl.getBoundingClientRect();
  const x = Math.round(r.left + Math.min(r.width / 2, 120)), y = Math.round(r.top + r.height / 2);
  const d = document.elementFromPoint(x, y);
  if (!d || !(e.contains(d) || d.contains(e)) || d.closest('.ui-chkbox, input, [role=checkbox]')) return null;
  // Le bouton sous le pointeur, lu comme dans scriptTrouverTexte (audit 0.381.0) : texte, title, aria-label, corbeille = « supprimer ».
  const b = d.closest('button, a, [role=button], .ui-button') || d;
  const corbeille = !!(b.querySelector && b.querySelector('[class*=trash], [class*=delete], [class*=corbeille]')) || /trash|delete|corbeille/i.test(String(d.className || ''));
  const bouton = [b.innerText, b.getAttribute('title'), b.getAttribute('aria-label'), corbeille ? 'supprimer' : ''].filter(Boolean).join(' ');
  return { x, y, nom: String(nomEl.textContent || '').trim().slice(0, 200), bouton: String(bouton).trim().slice(0, 160) };
})()`;
// L'adresse du PDF affiché par la visionneuse de la GED (`dynamiccontent` de PrimeFaces), du MÊME site seulement.
// Un lecteur pdf.js servi par Authentic (`…viewer.html?file=<adresse encodée>`, l'allure des captures du wiki) : l'adresse du PDF dans `file`.
const SCRIPT_SOURCE_PDF = `(() => { const u = [...document.querySelectorAll('iframe, embed, object')].map((x) => x.src || x.data || '').find((v) => /dynamiccontent/i.test(v));
  if (!u) return '';
  try {
    let a = new URL(u, location.href);
    const f = a.searchParams.get('file');
    if (f && /dynamiccontent/i.test(f)) a = new URL(f, a.href);
    return a.origin === location.origin ? a.href : '';
  } catch (e) { return ''; } })()`;
/** Le PDF lu dans la page (cookies de la séance) SANS l'attendre : gardé dans l'onglet (`window.__clairePdf`), en base64, avec son état.
 * Jusqu'à 60 Mo (un état hypothécaire avec les fiches anciennes scannées dépasse 20 Mo, étude 28/10). Audit 0.393.0 : un seul
 * `Runtime.evaluate` de 80 Mo dépassait le délai du navigateur et bloquait le serveur — l'appelant attend l'état puis rapatrie par morceaux.
 * @param {string} url */
const scriptChargerPdf = (url) => `(() => {
  window.__clairePdf = { etat: 'en cours', b64: '' };
  fetch(${JSON.stringify(url)}, { credentials: 'include' }).then((r) => {
    const n = Number(r.headers.get('content-length') || 0);
    if (!r.ok || n > 60 * 1024 * 1024) return null;
    return r.arrayBuffer();
  }).then((b) => {
    if (!b || b.byteLength > 60 * 1024 * 1024) { window.__clairePdf = { etat: 'refuse', b64: '' }; return; }
    const u = new Uint8Array(b);
    if (String.fromCharCode(u[0], u[1], u[2], u[3]) !== '%PDF') { window.__clairePdf = { etat: 'refuse', b64: '' }; return; }
    let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768));
    window.__clairePdf = { etat: 'pret', b64: btoa(s) };
  }).catch(() => { window.__clairePdf = { etat: 'refuse', b64: '' }; });
  return true;
})()`;
const SCRIPT_ETAT_PDF = `(() => { const p = window.__clairePdf; return p ? { etat: p.etat, longueur: p.b64.length } : null; })()`;
/** Un morceau du PDF gardé dans l'onglet (8 Mo de base64). @param {number} debut */
const scriptMorceauPdf = (debut) => `(window.__clairePdf && window.__clairePdf.b64.slice(${Number(debut) | 0}, ${(Number(debut) | 0) + 8 * 1024 * 1024})) || ''`;
const SCRIPT_OUBLIER_PDF = `(() => { delete window.__clairePdf; return true; })()`;

/**
 * Le PDF d'une pièce jointe, à la demande (étape 5 : « PDF affiché à la demande ») : le dossier, son sous-dossier de vente, l'onglet
 * « Pièces jointes », un clic sur le NOM du fichier (jamais un bouton de la barre d'actions), puis le PDF que la visionneuse affiche,
 * lu dans la page. Gardé quelques minutes dans la mémoire du serveur, le temps que le poste le reçoive et l'affiche.
 * @param {any} s @param {{ reference?: string, libelle?: string }} cible @param {string} pjId @param {{ etape: (t: string) => void }} o
 */
async function lirePiecePdf(s, cible, pjId, o) {
  if (!/^[\w-]{1,40}$/.test(String(pjId || ''))) throw new Error('pièce inconnue');
  const g = gestes(s, o.etape);
  await ouvrirDossier(s, cible, o.etape);
  await ouvrirSousDossierVente(s, cible, o.etape);
  if (!estCeDossier(await g.texte(), cible)) throw new Error('le dossier ouvert n’est pas le bon : rien lu');
  if (!(await g.cliquerTexte('Pièces jointes', { geste: 'navigation' }))) throw new Error('onglet « Pièces jointes » introuvable');
  await s.attendreStable(10000);
  // La pièce peut être dans un répertoire replié : déplié d'abord (sans bloquer la lecture si rien ne se déplie).
  if (!(await g.ev(scriptPositionPiece(pjId)))) { try { await g.deplier(RE_NOEUDS_GED, ARBRE_GED); } catch (e) { if (e && e.annule) throw e; } }
  const pos = await g.ev(scriptPositionPiece(pjId));
  if (!pos) throw new Error('pièce introuvable dans la liste d’Authentic');
  // Un « nom » court qui est un mot interdit (« Supprimer ») n'est pas un nom de fichier : il neutraliserait la liste noire (audit 0.392.0).
  if (/^\s*(supprimer|envoyer|signer|exporter|t[ée]l[ée]charger|modifier|d[ée]placer|partager|imprimer|renommer|fusionner)\s*$/i.test(pos.nom)) throw new Error('pièce introuvable dans la liste d’Authentic (libellé douteux) : pas cliqué');
  controlerClic({ geste: 'donnee', vise: pos.nom, bouton: pos.bouton, texte: pos.nom });
  o.etape('Ouvre la pièce');
  await s.cliquerPosition(pos.x, pos.y);
  await s.attendreStable(10000);
  let url = '';
  for (let i = 0; i < 20 && !url; i++) { url = String(await g.ev(SCRIPT_SOURCE_PDF) || ''); if (!url) await attendre(500); }
  if (!url) throw new Error('la visionneuse d’Authentic n’a pas affiché de PDF');
  // Téléchargé dans l'onglet (3 minutes au plus), puis rapatrié par morceaux de 8 Mo, toujours effacé de l'onglet.
  try {
    await g.ev(scriptChargerPdf(url));
    let etat = null;
    for (let i = 0; i < 360; i++) {
      etat = await g.ev(SCRIPT_ETAT_PDF);
      if (!etat || etat.etat !== 'en cours') break;
      await attendre(500);
    }
    if (!etat || etat.etat !== 'pret' || !etat.longueur) throw new Error('PDF illisible, trop long à venir ou de plus de 60 Mo');
    const morceaux = [];
    for (let debut = 0; debut < etat.longueur; debut += 8 * 1024 * 1024) morceaux.push(String(await g.ev(scriptMorceauPdf(debut)) || ''));
    const b64 = morceaux.join('');
    if (b64.length !== etat.longueur) throw new Error('PDF reçu incomplet');
    return { nom: pos.nom, pdf: Buffer.from(b64, 'base64') };
  } finally {
    await g.ev(SCRIPT_OUBLIER_PDF).catch(() => false);
  }
}

/** Relève la page affichée (le relevé de l'extension) et la confie à la file des relevés. @param {any} s @param {string} script @param {(c: any) => any} recevoir */
async function releverPage(s, script, recevoir, ajout) {
  const capture = await s.evaluer(`(() => { ${script}\n; return window.__claireRelever(); })()`);
  if (!capture) return null;
  return recevoir(ajout ? Object.assign(capture, ajout) : capture);
}

/** Pure : les noms de comparants et les adresses d'immeubles lus dans le texte de la page du dossier. @param {string} texte */
function liensFichesDuTexte(texte) {
  const lignes = String(texte || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const out = { comparants: /** @type {string[]} */ ([]), immeubles: /** @type {string[]} */ ([]) };
  let zone = '';
  for (const brute of lignes) {
    // Le nom et sa qualité sur deux colonnes de tableau (« M. X\tVendeur », « 41000 BLOIS, … \tImmeuble vendu ») : le nom seul (le texte
    // d'un même élément reste entier, c'est lui qui est cliqué).
    const l = brute.split('\t')[0].trim();
    if (/^Comparants\s*\(\d+\)/i.test(l)) { zone = 'c'; continue; }
    if (/^Immeubles\s*\(\d+\)/i.test(l)) { zone = 'i'; continue; }
    if (/^(Tiers|Parties prenantes)\b/i.test(l) || /^\d{1,3}\s*-\s*\S/.test(l)) { zone = ''; continue; }
    if (!zone || /^(person|domain|home|apartment|Vendeur|Acquéreur|Acquereur|Immeuble \w+|[A-Z] ?[A-Z]?|E|O)$/i.test(l) || l.length < 4) continue;
    if (zone === 'c' && out.comparants.length < MAX_FICHES && /\b(M\.|Mme|Monsieur|Madame|Mlle)\s|[A-Z]{2,}/.test(l)) out.comparants.push(l.slice(0, 120));
    if (zone === 'i' && out.immeubles.length < MAX_FICHES && /^\d{5}\s/.test(l)) out.immeubles.push(l.slice(0, 120));
  }
  return out;
}

/**
 * Lire un dossier : page du dossier, fiches clients, fiches biens — chaque page part dans la file des relevés.
 * @param {any} s @param {{ reference?: string, libelle?: string }} cible @param {{ script: string, recevoir: (c: any) => any, etape: (t: string) => void, fiches?: string, dejaClients?: string[], dejaImmeubles?: number }} o
 */
async function lireDossier(s, cible, o) {
  const g = gestes(s, o.etape);
  await ouvrirDossier(s, cible, o.etape);
  await ouvrirSousDossierVente(s, cible, o.etape);
  if (!estCeDossier(await g.texte(), cible)) throw new Error('le dossier ouvert n’est plus le bon : rien relevé');
  o.etape('Relève la page du dossier');
  await releverPage(s, o.script, o.recevoir);
  let pages = 1;
  let apercus = 0;
  // Les aperçus des formalités (étape 4) : sans jamais bloquer la lecture du reste.
  try { apercus = await lireApercusFormalites(s, o); pages += apercus; } catch (e) { o.etape('Aperçus des formalités non lus'); }
  // La page du dossier relevée de nouveau, tiroirs refermés : c'est elle que le magasin garde (audit 0.378.0).
  if (apercus && !(await g.ev(SCRIPT_TIROIR_OUVERT)) && estCeDossier(await g.texte(), cible)) await releverPage(s, o.script, o.recevoir);
  if (!estCeDossier(await g.texte(), cible)) { o.etape('Revient au dossier'); await ouvrirDossier(s, cible, o.etape); await ouvrirSousDossierVente(s, cible, o.etape); }
  const { comparants, immeubles } = liensFichesDuTexte(await g.texte());
  // Les fiches clients et biens ne sont rouvertes que SI ON LE DEMANDE ou si elles manquent (étude 29/10 : « qu'en utilisant Authentic il n'y ait pas besoin
  // d'ouvrir à chaque fois les fiches clients, sauf si on lui demande ») : `fiches` = 'toutes' (à la demande), 'aucune', ou par défaut les seules fiches pas
  // encore connues de la fiche CLAIRE (`dejaClients` : noms déjà relevés ; `dejaImmeubles` : nombre de biens déjà relevés).
  const modeFiches = o.fiches === 'toutes' || o.fiches === 'aucune' ? o.fiches : 'nouvelles';
  const connus = new Set((Array.isArray(o.dejaClients) ? o.dejaClients : []).map((n) => plat(String(n))));
  const aOuvrir = [...comparants, ...immeubles].map((nom, i) => ({ nom, i })).filter(({ nom, i }) => {
    if (modeFiches === 'toutes') return true;
    if (modeFiches === 'aucune') return false;
    return i < comparants.length ? !connus.has(plat(String(nom))) : !(Number(o.dejaImmeubles) >= immeubles.length);
  });
  if (aOuvrir.length < comparants.length + immeubles.length) o.etape(`Fiches déjà connues : ${comparants.length + immeubles.length - aOuvrir.length} non rouverte(s)`);
  for (const { nom, i } of aOuvrir) {
    const fiche = i < comparants.length ? `la fiche client ${i + 1}` : `la fiche bien ${i - comparants.length + 1}`;
    try {
      if (!(await g.cliquerTexte(nom, { exact: true, geste: 'donnee' }))) continue;
      await s.attendreStable(12000);
      o.etape(`Relève ${fiche}`);
      await releverPage(s, o.script, o.recevoir);
      pages++;
      // Retour à la page du dossier : une fiche client ou immeuble de Silicium n'a que « Fermer » (wiki, 28/10) ; « Retour » ailleurs.
      if (!(await g.cliquerTexte('Fermer', { exact: true, geste: 'navigation' })) && !(await g.cliquerTexte('Retour', { exact: true, geste: 'navigation' }))) {
        await g.cliquerTexte(String(cible.reference || cible.libelle || ''), { geste: 'donnee' });
      }
      await s.attendreStable(12000);
      if (!estCeDossier(await g.texte(), cible)) { o.etape('Revient au dossier'); await ouvrirDossier(s, cible, o.etape); await ouvrirSousDossierVente(s, cible, o.etape); }
    } catch (e) { o.etape(`Passe ${fiche} (${String(e && e.message).slice(0, 60)})`); }
  }
  // La liste des pièces jointes (étape 5), sur la page du dossier : sans jamais bloquer le reste.
  try {
    if (!estCeDossier(await g.texte(), cible)) { await ouvrirDossier(s, cible, o.etape); await ouvrirSousDossierVente(s, cible, o.etape); }
    if (estCeDossier(await g.texte(), cible) && await lirePiecesJointes(s, o)) pages++;
  } catch (e) { o.etape('Pièces jointes non lues'); }
  // Les demandes d'état civil PAR PAPIER (ligne « APR » des formalités, étude 29/10) : leur nombre est dit, le courrier se prépare sur la fiche.
  let papier = 0;
  try { papier = (await g.texte()).split('\n').filter((l) => /^\s*APR(?![A-Za-z0-9])/.test(l)).length; } catch (e) { /* page illisible : pas de décompte */ }
  return { pages, apercus, papier };
}

/**
 * Après une demande Comedec : retour sur le dossier de vente, la page est relevée (les formalités d'état civil à jour) et les lignes « APR » (demande papier)
 * sont comptées — rien d'autre : ni fiche, ni aperçu, ni pièce jointe (audit 0.399.0).
 * @param {any} s @param {{ reference?: string, libelle?: string }} cible @param {{ script: string, recevoir: (c: any) => any, etape: (t: string) => void }} o
 */
async function relireFormalitesApresDemande(s, cible, o) {
  const g = gestes(s, o.etape);
  await ouvrirDossier(s, cible, o.etape);
  await ouvrirSousDossierVente(s, cible, o.etape);
  if (!estCeDossier(await g.texte(), cible)) throw new Error('le dossier ouvert n’est plus le bon : rien relevé');
  o.etape('Relève les formalités d’état civil');
  await releverPage(s, o.script, o.recevoir);
  return { papier: (await g.texte()).split('\n').filter((l) => /^\s*APR(?![A-Za-z0-9])/.test(l)).length };
}

/**
 * Les écrans de suivi d'Authentic (étape 7 : actes à signer, SAFER/DIA, état civil, MICEN) : chaque écran ouvert par son menu, son tableau
 * relevé tel qu'affiché (jamais « Exporter », jamais un bouton de la page), rien envoyé à la file des relevés. Un écran introuvable est passé.
 * Rend { ecran: capture } ; la mise en forme est celle de commun/authentic-modele.js (`suiviDepuisCaptureAT`).
 * @param {any} s @param {{ script: string, etape: (t: string) => void }} o
 */
async function lireSuivis(s, o) {
  const AT = require('../../commun/authentic-modele');
  const g = gestes(s, o.etape);
  /** @type {Record<string, any>} */
  const captures = {};
  for (const e of AT.ECRANS_SUIVIS_AT) {
    try {
      o.etape(`Ouvre ${e.titre}`);
      // L'entrée d'abord : la rubrique déjà dépliée par l'écran précédent se replierait si on la recliquait (accordéon, wiki 28/10).
      const visibleEntree = async () => { for (const en of e.entrees) if (await g.cliquerMenu(en, true)) return en; return ''; };
      let entree = await visibleEntree();
      if (!entree) {
        if (!(await g.cliquerMenu(e.menu))) { o.etape(`Menu « ${e.menu} » introuvable`); continue; }
        await attendre(700);
        entree = await visibleEntree();
      }
      if (!entree || !(await g.cliquerMenu(entree))) { o.etape(`« ${e.entrees[0]} » introuvable`); continue; }
      await s.attendreStable(15000);
      // Les lignes sont rangées en GROUPES repliés par statut (« Envoyé (12) ») : dépliés par leur chevron seulement — l'en-tête d'un groupe
      // porte corbeille et avion d'envoi (captures du wiki, 28/10).
      let fermes = 0;
      try { fermes = (await g.deplier('^[a-z][a-z0-9 \'/-]{2,50} \\(([1-9][0-9]*)\\)$')).fermes; } catch (err) { if (err && err.annule) throw err; fermes = 1; }
      if (fermes) o.etape(`${e.titre} : ${fermes} groupe(s) resté(s) replié(s), lecture incomplète`);
      const capture = await s.evaluer(`(() => { ${o.script}\n; return window.__claireRelever(); })()`);
      // Des groupes restés repliés : le suivi lu est incomplet, il sera dit « tronqué » (audit 0.392.0).
      if (capture) captures[e.cle] = fermes ? Object.assign(capture, { groupesFermes: fermes }) : capture;
    } catch (err) {
      if (err && err.annule) throw err;
      o.etape(`Passe ${e.titre} (${String(err && err.message).slice(0, 60)})`);
    }
  }
  return captures;
}

/**
 * La comptabilité d'un dossier (étude 28/10 : onglet « Comptabilité », infos comptables) : le dossier ouvert (sous-dossier de vente s'il y en a
 * un seul), l'onglet cliqué par son nom (geste de navigation), la page relevée telle qu'affichée — jamais « Générer en PDF », « Détacher de
 * l'acte », « Ajouter un compte » ni aucun autre bouton. Rend la capture ; la mise en forme est commun/authentic-modele.js
 * (`comptabiliteDepuisCaptureAT`).
 * @param {any} s @param {{ reference?: string, libelle?: string }} cible @param {{ script: string, etape: (t: string) => void }} o
 */
async function lireComptabilite(s, cible, o) {
  const g = gestes(s, o.etape);
  await ouvrirDossier(s, cible, o.etape);
  await ouvrirSousDossierVente(s, cible, o.etape);
  if (!estCeDossier(await g.texte(), cible)) throw new Error('le dossier ouvert n’est plus le bon : rien relevé');
  // La comptabilité n'est pas toujours liée à la vente : celle de la PROMESSE est lue à la place (étude 30/10 : « si la comptabilité n'est pas
  // visible dans la vente, aller voir dans l'onglet comptabilité de la promesse de vente »). Le dossier est contrôlé de nouveau.
  const absente = (/** @type {string} */ m) => Object.assign(new Error(m), { comptaAbsente: true });
  const ouvrirOnglet = async () => {
    o.etape('Ouvre l’onglet Infos comptables');
    // Le vrai libellé est « Infos comptables » suivi du solde (« Infos comptables 12,50 € », relevé de l'étude du 28/10) ; « Comptabilité » en repli.
    // En rouge « indisponible » quand la comptabilité n'est pas liée au sous-dossier : dit tel quel, sans attendre une page qui ne viendra pas.
    if (/infos\s+comptables\s*:?\s*indisponible/i.test(await g.texte())) throw absente('comptabilité indisponible dans Authentic pour ce dossier (non liée) : rien relevé');
    if (!(await g.cliquerTexte('Infos comptables', { geste: 'navigation' })) && !(await g.cliquerTexte('Comptabilité', { exact: true, geste: 'navigation' }))) {
      throw absente('onglet « Infos comptables » introuvable dans le dossier');
    }
  };
  let sousDossier = 'vente';
  try { await ouvrirOnglet(); } catch (e) {
    if (!(e && /** @type {any} */ (e).comptaAbsente)) throw e;
    o.etape('Comptabilité absente de la vente : regarde dans la promesse');
    if (!(await ouvrirSousDossierPromesse(s, cible, o.etape))) throw e;
    if (!estCeDossier(await g.texte(), cible)) throw new Error('le dossier ouvert n’est plus le bon : rien relevé');
    await ouvrirOnglet();
    sousDossier = 'promesse';
  }
  await s.attendreStable(15000);
  if (!(await g.attendreTexte(/Solde du compte|Compte principal|S[ée]lectionnez un compte|Solde de l.affaire|Derni[èe]res op[ée]rations/i, 20000))) {
    throw new Error('page de comptabilité non reconnue (ni comptes, ni « Dernières opérations »)');
  }
  // À l'ouverture, aucun compte n'est choisi (capture 4.19.2 du wiki) : le compte principal, par son libellé « Compte n°… » (jamais sa case).
  if (/S[ée]lectionnez un compte/i.test(await g.texte())) {
    const c = await g.ev(SCRIPT_COMPTE_PRINCIPAL);
    if (c) {
      o.etape('Choisit le compte principal');
      controlerClic({ geste: 'donnee', vise: c.texte, bouton: c.bouton, texte: c.texte });
      await s.cliquerPosition(c.x, c.y);
      await s.attendreStable(10000);
      if (!(await g.attendreTexte(/Derni[èe]res op[ée]rations/i, 10000))) o.etape('Détail du compte non affiché : soldes seulement');
    } else o.etape('Compte principal introuvable : soldes seulement');
  }
  // La page affichée est encore celle de CE dossier : le dossier a été vérifié avant le clic, et l'écran « € Comptabilité » ne montre plus
  // forcément sa référence (wiki, 28/10) — seule une AUTRE référence lue l'écarte. Sans référence connue, le contrôle complet.
  const apres = await g.texte();
  const ref = String(cible.reference || '').replace(/\s+/g, ' ').trim();
  if (!ref && !estCeDossier(apres, cible)) throw new Error('en-tête du dossier absent de la page de comptabilité : rien relevé');
  // Toute référence affichée (bandeau, puis texte) doit être la sienne ; aucune affichée : le dossier a été vérifié juste avant le clic.
  const lue = referenceEnTete(String((await g.ev(SCRIPT_EN_TETE_DOSSIER).catch(() => '')) || '')) || referenceEnTete(apres);
  if (ref && lue && lue !== ref) throw new Error('la comptabilité affichée est celle d’un autre dossier : rien relevé');
  o.etape('Relève les infos comptables');
  const capture = await s.evaluer(`(() => { ${o.script}\n; return window.__claireRelever(); })()`);
  return capture && typeof capture === 'object' ? Object.assign({}, capture, { sousDossierCompta: sousDossier }) : capture;
}

/**
 * Prépare une demande CJN ou Comedec dans le sous-dossier de vente : Création rapide allumée, Envoi immédiat éteint, puis Valider.
 * @param {any} s @param {{ reference?: string, libelle?: string }} cible
 * @param {{ type: 'cjn' | 'comedec', parties: Array<{ nom: string, prenom?: string, marie?: boolean, naissance?: boolean, dejaNaissance?: boolean, dejaMariage?: boolean, pasNaissance?: boolean, pasMariage?: boolean }>, etape: (t: string) => void, ecriture?: boolean }} o
 */
async function preparerFormalite(s, cible, o) {
  // Écrire dans Authentic : seulement si l'étude l'a allumé (Réglages › Authentic › « Préparer des demandes »), dit par l'appelant.
  if (!o.ecriture) throw new Error('préparer des demandes dans Authentic est éteint (Réglages › Authentic) : rien n’est écrit');
  const g = gestes(s, o.etape, { ecriture: true });
  if (!String(cible.reference || '').trim()) throw new Error('dossier sans référence d’Authentic retenue : aucune demande sans être sûr du dossier');
  await ouvrirDossier(s, cible, o.etape);
  if (!(await ouvrirSousDossierVente(s, cible, o.etape))) throw new Error('sous-dossier de vente introuvable (ou plusieurs) : aucune demande');
  o.etape('Ouvre les formalités préalables');
  // Version Silicium (capture du wiki) : le « + » au bout de la ligne « Formalités préalables (N) » ouvre le volet « Ajouter des formalités
  // préalables ». Ancienne version : l'onglet « Formalités préalables », puis « Ajouter des formalités préalables ».
  const plus = await g.ev(SCRIPT_PLUS_FORMALITES_PREALABLES);
  if (plus && !plus.cache) {
    controlerClic({ geste: 'ecriture', vise: 'Ajouter des formalités préalables', bouton: plus.bouton, texte: plus.texte, ecritureAutorisee: !!o.ecriture });
    await s.cliquerPosition(plus.x, plus.y);
    await s.attendreStable(10000);
  } else {
    if (!(await g.cliquerTexte('Formalités préalables', { exact: true, geste: 'navigation' }))) throw new Error('« + » des formalités préalables introuvable');
    await s.attendreStable(10000);
  }
  if (!(await g.attendreTexte(/Ajouter des formalit[ée]s pr[ée]alables/i, 10000))) throw new Error('« Ajouter des formalités préalables » ne s’est pas ouvert');
  // Le volet peut s'ouvrir déjà sur « Ajouter » : son en-tête n'est recliqué que s'il est là (clic sans effet sinon).
  await g.cliquerTexte('Ajouter des formalités préalables', { exact: true, geste: 'ecriture' });
  await s.attendreStable(10000);
  const nom = o.type === 'cjn' ? 'Casier Judiciaire National dématérialisé (CJN)' : 'Etat civil dématérialisé (COMEDEC)';
  // Le filtre de la liste : « Filtrer » (wiki, ancienne version), « Rechercher une formalité » ; sinon la liste entière (le libellé est cherché dedans).
  const champ = (await g.ev(scriptChamp('rechercher une formalit'))) || (await g.ev(SCRIPT_CHAMP_FILTRE_FORMALITES));
  if (champ) { await g.ecrire(champ, o.type === 'cjn' ? 'Casier Judiciaire' : 'COMEDEC'); await attendre(1200); }
  o.etape(o.type === 'cjn' ? 'Ajoute la demande de casier judiciaire' : 'Ajoute la demande d’état civil');
  if (!(await g.cliquerTexte(nom, { exact: true, geste: 'ecriture' }))) throw new Error(`formalité « ${nom} » introuvable dans la liste`);
  await s.attendreStable(10000);
  if (!(await g.attendreTexte(o.type === 'cjn' ? /acqu[ée]reurs? [aâ]g[ée]s/i : /Type de Demande/i, 10000))) throw new Error('le bloc de la demande ne s’est pas affiché');

  let choisies = 0;
  let nonCochees = 0;
  if (o.type === 'comedec') {
    o.etape('Coche naissance pour chaque partie, mariage pour les mariés');
    const lignes = (await g.ev(SCRIPT_LIGNES_COMEDEC)) || [];
    const refusees = {};   // les options qui ne changent pas d'état au clic, pour la ligne en cours
    const mariagesDemandes = [];   // les conjoints (nom lu dans le libellé) dont le mariage vient d'être demandé sur une ligne plus haute
    const vocabulaire = (x) => /^(naissance|mariage|d[ée]c[èe]s|acte de naissance)( |$)/i.test(plat(x.libelle));
    const lireOptions = async () => (await g.ev(SCRIPT_OPTIONS_OUVERTES)) || [];
    // L'indice COURANT de la ligne : relu à chaque fois d'après son libellé (et son rang parmi les libellés identiques), jamais gardé d'un tour à l'autre —
    // une ligne cochée change la hauteur du tableau, et un rafraîchissement du composant peut le redessiner entièrement (anticipé, étude 29/10).
    const indiceLigne = async (libelle, rang) => {
      const fraiches = (await g.ev(SCRIPT_LIGNES_COMEDEC)) || [];
      const memes = fraiches.map((x, k) => [x, k]).filter(([x]) => x.libelle === libelle);
      return memes[rang] ? memes[rang][1] : -1;
    };
    // La position de la liste de la ligne, mesurée après un défilement instantané jusqu'à ce qu'elle ne bouge plus.
    const positionStable = async (idx) => {
      let pos = await g.ev(scriptLigneComedec(idx, true));
      for (let k = 0; k < 6 && pos; k++) {
        await attendre(300);
        const p2 = await g.ev(scriptLigneComedec(idx, false));
        const stable = !!p2 && p2.x === pos.x && p2.y === pos.y;
        pos = p2;
        if (stable) break;
      }
      return pos;
    };
    // Ouvre la liste de la ligne : clic à la position, puis (si rien ne s'ouvre) ouverture depuis la page ; rend les options lues ([] = pas ouverte).
    const ouvrirListe = async (libelle, rang) => {
      // Échap seulement si un panneau est ouvert (sinon il pourrait fermer autre chose dans la page).
      if ((await lireOptions()).length) { await g.echap(); await attendre(250); }
      await s.attendreStable(4000);
      const idx = await indiceLigne(libelle, rang);
      if (idx < 0) return { options: [], raison: 'ligne introuvable (tableau redessiné)' };
      const pos = await positionStable(idx);
      if (!pos) return { options: [], raison: 'liste introuvable' };
      if (!pos.sur) return { options: [], raison: 'liste recouverte' };
      await s.cliquerPosition(pos.x, pos.y);
      await attendre(500);
      let options = await lireOptions();
      if (!options.length) { await attendre(500); options = await lireOptions(); }
      if (!options.length && (await g.ev(scriptOuvrirListeComedec(idx)))) { await attendre(900); options = await lireOptions(); }
      return { options, raison: '' };
    };
    const occurrences = {};
    for (const l of lignes) {
      const rang = occurrences[l.libelle] = (occurrences[l.libelle] === undefined ? 0 : occurrences[l.libelle] + 1);
      let voulues = demandesComedecIntervenant(l.libelle, o.parties);
      // Le mariage d'un couple est UN seul acte : si le conjoint nommé sur cette ligne a déjà sa ligne plus haut avec le mariage, il n'est pas redemandé.
      const nomLigne = plat(String(l.libelle || '').replace(/\(.*$/, '')).split(/\b(?:epoux|epouse|veuve|veuf|divorcee?)\s+de\b/)[0].replace(/^(m\.|mme|mlle|monsieur|madame)\s+/, '').trim();
      const conjoint = conjointDuLibelle(l.libelle);
      // Deux noms désignent la même personne si les mots de l'un sont tous dans l'autre (« Prénom NOM » ou « NOM Prénom »).
      const memeNom = (a, b) => { const x = String(a || '').split(/[\s-]+/).filter((m) => m.length > 1); const y = String(b || '').split(/[\s-]+/).filter((m) => m.length > 1); return !!x.length && !!y.length && (x.every((m) => y.includes(m)) || y.every((m) => x.includes(m))); };
      if (voulues.includes('Mariage') && mariagesDemandes.some((c) => memeNom(c.nom, nomLigne) || memeNom(c.conjoint, nomLigne) || (conjoint && memeNom(c.nom, conjoint)))) voulues = voulues.filter((v) => v !== 'Mariage');
      else if (voulues.includes('Mariage')) mariagesDemandes.push({ nom: nomLigne, conjoint });
      // Une ligne sans demande voulue et sans rien de coché : on n'y touche pas.
      if (!voulues.length && !String(l.choisi || '').trim()) continue;
      // Jusqu'à trois essais par ligne : liste pas ouverte, tableau redessiné, panneau refermé au premier clic d'option, clic tombé à côté.
      let relues = [];
      let derniere = '';
      for (let essai = 0; essai < 3; essai++) {
        let { options, raison } = await ouvrirListe(l.libelle, rang);
        if (!options.some(vocabulaire)) { derniere = raison || (options.length ? `${options.length} option(s) d’un autre menu` : 'aucune option lue'); relues = options; continue; }
        // Chaque option : cochée si voulue, DÉCOCHÉE sinon (ligne préremplie par Authentic) ; les options sont RELUES après chaque clic (le panneau peut se
        // refermer ou se décaler) et jamais cliquées sur des positions gardées.
        let rouvert = 0;
        for (let tour = 0; tour < 8; tour++) {
          const ecart = options.find((opt) => opt.coche !== voulues.some((v) => plat(v) === plat(opt.libelle)) && !(opt.libelle in refusees));
          if (!ecart) break;
          // L'option est amenée à l'écran puis RELUE (position fraîche) avant le clic.
          await g.ev(scriptDefilerOption(ecart.libelle));
          const fraiche = (await lireOptions()).find((x) => x.libelle === ecart.libelle) || ecart;
          await s.cliquerPosition(fraiche.x, fraiche.y);
          await attendre(350);
          const apres = await lireOptions();
          if (!apres.some(vocabulaire)) {
            // Le panneau s'est refermé (ou autre chose s'est ouvert) : une réouverture au plus par essai, sinon l'essai est recommencé.
            if (rouvert++ >= 1) { options = apres; break; }
            ({ options } = await ouvrirListe(l.libelle, rang));
            if (!options.some(vocabulaire)) break;
            continue;
          }
          // Une option qui ne change pas d'état après le clic (grisée, non offerte) : dite, jamais recliquée.
          const meme = apres.find((x) => x.libelle === ecart.libelle);
          if (meme && meme.coche === ecart.coche) refusees[ecart.libelle] = true;
          options = apres;
        }
        relues = await lireOptions();
        if (relues.some(vocabulaire)) break;
        derniere = relues.length ? `${relues.length} option(s) d’un autre menu` : 'aucune option lue';
      }
      for (const k of Object.keys(refusees)) delete refusees[k];
      // La BONNE liste : une option Naissance, Mariage, Décès ou « Acte de naissance établi à l'étranger » (menu d'Authentic, relecture 0.396.3 : jamais les
      // options d'un autre menu). Les libellés dits à l'échec sont ceux de ce vocabulaire fermé seulement (jamais un nom de client).
      if (!relues.some(vocabulaire)) throw new Error(`la liste « Type de Demande » ne s’est pas ouverte (${derniere || 'aucune option lue'}) : rien validé`);
      // Une demande qu'Authentic ne laisse pas cocher (personne née à l'étranger, option grisée) : dite, pas bloquante — les autres lignes passent
      // (étude 29/10). Rien n'est coché de force.
      const manquantes = voulues.filter((v) => !relues.some((x) => plat(x.libelle) === plat(v) && x.coche));
      if (manquantes.length) nonCochees += manquantes.length;
      if (relues.some((x) => x.coche && !voulues.some((v) => plat(v) === plat(x.libelle)))) throw new Error('une demande non voulue reste cochée : rien validé');
      choisies += voulues.length - manquantes.length;
      await g.echap();
      await attendre(300);
    }
    // Tout ce qui était voulu figure déjà dans Authentic : rien n'est coché ni validé (jamais de « Valider » à vide).
    if (!choisies && (o.parties || []).some((p) => p.dejaNaissance || p.dejaMariage)) {
      o.etape('Tout est déjà demandé dans Authentic : rien à redemander');
      return { demandes: 0, remarques: ['tout est déjà demandé dans Authentic : rien à redemander'], erreurs: 0 };
    }
    if (!choisies) throw new Error('aucune partie du dossier reconnue parmi les intervenants : rien de coché, rien validé');
  } else {
    // CJN (étude 30/10 : « toujours cocher les cases devant les noms des acquéreurs avant de valider ») : la case de chaque acquéreur de la fiche
    // (nom et prénom) est COCHÉE par CLAIRE si elle ne l'est pas, celle d'un intervenant qui n'est pas acquéreur décochée ; puis tout est RELU —
    // un acquéreur non coché ou un autre coché : rien n'est validé. La case d'en-tête « Nom de l'intervenant » (tout cocher) n'est jamais touchée.
    // Relecture 0.405.1 : seules les lignes d'intervenant (« NOM Prénom (41000 BLOIS) ») sont touchées ; la liste est ramenée à l'écran ; un clic
    // seulement sur une case dégagée, puis tout est relu (un clic redessine) ; chaque acquéreur de la fiche doit avoir SA case cochée.
    choisies = await cocherAcquereursCjn(g, s, o.parties);
  }

  // Les deux interrupteurs : Création rapide ALLUMÉE, Envoi immédiat ÉTEINT — lus avant, corrigés, RELUS avant « Valider ».
  const lire = async () => {
    // Ramené à l'écran : « Envoi immédiat », sinon « Création rapide » (bloc CJN sans interrupteur d'envoi — relecture 0.406.2).
    await g.ev(`(() => { const trouver = (re) => [...document.querySelectorAll('label, span, div')].find((e) => re.test(String(e.innerText).trim()) && e.children.length < 3); const l = trouver(/^envoi imm[ée]diat/i) || trouver(/^cr[ée]ation rapide/i); if (l) l.scrollIntoView({ block: 'center' }); })()`);
    const tous = ((await g.ev(SCRIPT_INTERRUPTEURS)) || []).filter((c) => c.sur);
    return { rapide: tous.find((c) => /cr[ée]ation rapide/i.test(c.libelle)), envoi: tous.find((c) => /envoi imm[ée]diat/i.test(c.libelle)) };
  };
  // Un seul bloc de création ouvert : sinon « Valider » pourrait être celui d'un autre bloc, où l'envoi est allumé (audit 0.392.0).
  const nbEnvoi = ((await g.ev(SCRIPT_INTERRUPTEURS)) || []).filter((c) => /envoi imm[ée]diat/i.test(c.libelle)).length;
  if (nbEnvoi > 1) throw new Error('plusieurs blocs de création ouverts dans Authentic : rien validé');
  let i = await lire();
  // CJN : le vrai bloc n'a QUE « Création rapide » (capture de l'étude du 30/10 ; le wiki, lot 03 § 2.3 : « envoi immédiat si les droits le
  // permettent » — pas d'interrupteur = pas d'envoi possible pour ce compte) ; « Valider » y crée la demande — l'étude l'a voulu (30/10 :
  // « valider sans Envoi immédiat », CJN seulement). Permis seulement quand AUCUN « Envoi immédiat » n'est sur la page (sinon la règle d'avant).
  const cjnSansEnvoi = o.type === 'cjn' && nbEnvoi === 0 && !i.envoi;
  if ((!i.envoi && !cjnSansEnvoi) || !i.rapide) throw new Error('interrupteurs « Création rapide » / « Envoi immédiat » introuvables : rien validé');
  if (i.envoi && i.envoi.coche) { await s.cliquerPosition(i.envoi.x, i.envoi.y); await attendre(500); }
  if (!i.rapide.coche) { await s.cliquerPosition(i.rapide.x, i.rapide.y); await attendre(500); }
  i = await lire();
  if (!cjnSansEnvoi && (!i.envoi || i.envoi.coche !== false)) throw new Error('« Envoi immédiat » n’a pas pu être lu éteint : rien validé');
  if (cjnSansEnvoi && (i.envoi || ((await g.ev(SCRIPT_INTERRUPTEURS)) || []).some((c) => /envoi imm[ée]diat/i.test(c.libelle)))) throw new Error('« Envoi immédiat » apparu sur la page : rien validé');
  // Filet (relecture 0.406.2) : le TEXTE de la page, sans condition de visibilité ni de composant, ne doit nommer aucun « Envoi immédiat ».
  if (cjnSansEnvoi && (await g.ev(`/envoi\\s+imm[ée]diat/i.test(String(document.body && document.body.innerText || ''))`))) throw new Error('« Envoi immédiat » écrit sur la page : rien validé');
  if (!i.rapide || i.rapide.coche !== true) throw new Error('« Création rapide » n’a pas pu être lue allumée : rien validé');
  // CJN : les cases relues juste avant « Valider » (le basculement d'un interrupteur peut redessiner le tableau).
  if (o.type === 'cjn') verifierCasesCjn(((await g.ev(SCRIPT_INTERRUPTEURS)) || []).filter(estLigneIntervenantCjn), o.parties);
  o.etape(cjnSansEnvoi ? 'Création rapide allumée, acquéreurs cochés : valide la demande de casier' : 'Création rapide allumée, Envoi immédiat éteint : valide la création');
  if (!(await g.cliquerTexte('Valider', { exact: true, geste: 'ecriture' }))) {
    // Le bloc Comedec valide par un rond vert « ✓ » sans texte (captures du wiki) : son titre ou sa coche, dans le bloc de « Création rapide ».
    const v = await g.ev(SCRIPT_VALIDER_ICONE);
    if (!v) throw new Error('bouton « Valider » introuvable : rien validé');
    controlerClic({ geste: 'ecriture', vise: 'Valider', bouton: v.bouton, texte: 'Valider', ecritureAutorisee: !!o.ecriture });
    await s.cliquerPosition(v.x, v.y);
  }
  await s.attendreStable(15000);
  // Après « Valider », jamais un échec « à refaire » : la demande peut exister (doublon). Ce qu'Authentic montre est DIT (wiki, 28/10).
  const remarques = [];
  const erreurs = ((await g.ev(SCRIPT_ERREURS)) || []).filter((m) => !/liaison comedec|n.a pas adh[ée]r/i.test(m));
  const apres = await g.texte();
  if (o.type === 'cjn' && (/Alimentation obligatoire de la base des r[ée]f[ée]rences/i.test(apres) || apres.split('\n').some((l) => /\bCJN\b/.test(l) && /Bloqu[ée]/i.test(l)))) remarques.push('casier « Bloqué » : la BRI de l’avant-contrat doit d’abord être envoyée (un notaire peut débloquer)');
  if (/Liaison COMEDEC|n.a pas adh[ée]r[ée] au dispositif COMEDEC/i.test(apres)) remarques.push('commune non adhérente à Comedec : demande faite en courrier papier');
  if (/Cr[ée]ation (CJN|[ÉE]tat[- ]?civil)/i.test(apres)) remarques.push('écran de création encore ouvert dans Authentic : demandes à finir là-bas (non conformes)');
  // Le texte d'un message d'Authentic peut nommer un intervenant : jamais repris, seulement dit (règle de CLAIRE : aucun nom dans une étape).
  if (erreurs.length) remarques.push(`${erreurs.length} message(s) d’erreur ou d’avertissement affiché(s) par Authentic`);
  if (nonCochees) remarques.push(`${nonCochees} demande(s) qu’Authentic ne laisse pas cocher (personne née à l’étranger ?) : à faire autrement`);
  return { demandes: choisies, remarques, erreurs: erreurs.length };
}

module.exports = {
  SCRIPT_INTERRUPTEURS,
  CLE_CONNEXION_AUTHENTIC, DOMAINES_AUTHENTIC, ADRESSE_DEFAUT,
  libelleInterdit, assainirConnexionAuthentic, lireConnexionAuthentic, vueConnexionAuthentic, ecrireConnexionAuthentic,
  demandesComedecIntervenant, partieDeLaLigne, verifierCasesCjn, estLigneIntervenantCjn, scriptLigneComedec, scriptOuvrirListeComedec, liensFichesDuTexte, scriptReleve, pageSiliciumAPasser, passerVerificationSilicium, lireApercusFormalites, lirePiecesJointes, lirePiecePdf,
  ouvrirDossier, ouvrirSousDossierVente,
  relireFormalitesApresDemande, referenceEnTete, referenceRecherche, referenceAffichee, scriptTrouverReference, estCeDossier, diagnosticAccesAuthentic, seConnecter, lireDossier, lireSuivis, lireComptabilite, preparerFormalite
};
