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
const ADRESSE_DEFAUT = 'https://www.cloud-fichorga.fr/';
const MAX_FICHES = 12;

// Libellés jamais cliqués et gestes permis : authentic/garde.js (étape 1 du plan Authen.TIC, 27/10).
const { libelleInterdit, controlerClic } = require('./authentic/garde');

/** Pure : les réglages gardés, propres (secret compris : jamais rendu par une route). @param {any} brut */
function assainirConnexionAuthentic(brut) {
  const b = brut && typeof brut === 'object' ? brut : {};
  let adresse = typeof b.adresse === 'string' ? b.adresse.trim().slice(0, 300) : '';
  try { const u = new URL(adresse); if (u.protocol !== 'https:' || !/(^|\.)cloud-fichorga\.fr$/i.test(u.hostname) || u.username || u.password) adresse = ''; } catch (_) { adresse = ''; }
  return {
    actif: b.actif === true,
    // Préparer des demandes dans Authentic (CJN, Comedec) = ÉCRIRE dans Authentic : éteint par défaut (plan validé le 27/10 : lecture seule).
    preparerDemandes: b.preparerDemandes === true,
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
  return { actif: r.actif, preparerDemandes: r.preparerDemandes, adresse: r.adresse, identifiant: r.identifiant, motDePasseEnregistre: !!r.motDePasse, refuseLe: r.refuseLe };
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
 * @param {string} libelle @param {Array<{ nom: string, prenom?: string, marie?: boolean }>} parties
 * @returns {string[]}
 */
function demandesComedecIntervenant(libelle, parties) {
  // Le nom de la personne de la ligne : avant « époux de / épouse de / veuve de / divorcé(e) de » et la parenthèse du lieu.
  const tete = plat(String(libelle || '').replace(/\(.*$/, '')).split(/\b(?:epoux|epouse|veuve|veuf|divorcee?)\s+de\b/)[0]
    .replace(/^(m\.|mme|mlle|monsieur|madame)\s+/, '').trim();
  if (!tete) return [];
  const mots = tete.split(/[\s-]+/).filter((m) => m.length > 1);
  const p = (parties || []).find((x) => {
    const nom = plat(x.nom).split(/[\s-]+/).filter((m) => m.length > 1);
    const prenom = plat(x.prenom || '').split(/[\s-]+/).filter((m) => m.length > 1);
    // Nom ET prénom exigés (dans `prenom`, ou dans `nom` qui porte « Prénom NOM ») : le nom seul désignerait aussi le conjoint du même
    // nom, qui n'est pas partie (relecture 0.373.0).
    if (nom.length + prenom.length < 2 || !nom.every((m) => mots.includes(m))) return false;
    return !prenom.length || prenom.some((m) => mots.includes(m));
  });
  if (!p) return [];
  return p.marie ? ['Naissance', 'Mariage'] : ['Naissance'];
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
    out.push({ libelle: libelle.slice(0, 80), ligne: ligne ? net(ligne.innerText).slice(0, 160) : '', coche, x, y, sur: !!(dessous && (boite.contains(dessous) || dessous.contains(boite))) });
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

// Le champ de saisie le plus proche d'un libellé ou d'un texte d'aide (placeholder, aria-label) : { x, y } ou null.
const scriptChamp = (libelle) => `(() => {
  const net = (t) => String(t || '').replace(/\\s+/g, ' ').trim().toLowerCase();
  const c = net(${JSON.stringify(String(libelle))});
  for (const e of document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea')) {
    const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    const l = e.labels && e.labels[0] ? e.labels[0].innerText : '';
    if ([e.placeholder, e.getAttribute('aria-label'), l, e.name, e.id, e.title].some((v) => net(v).includes(c))) return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), motDePasse: e.type === 'password' };
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
const scriptLigneComedec = (i) => `(() => { const tr = ${TABLE_COMEDEC}[${Number(i) | 0}]; if (!tr) return null;
  const td = tr.querySelectorAll('td'); const liste = td[td.length - 1].querySelector('.ui-selectcheckboxmenu, .ui-selectonemenu, select, [role=combobox]') || td[td.length - 1];
  liste.scrollIntoView({ block: 'center' }); const r = liste.getBoundingClientRect(); if (r.width < 2) return null;
  const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2); const d = document.elementFromPoint(x, y);
  return { x, y, sur: !!(d && (liste.contains(d) || d.contains(liste))) }; })()`;

// Les options du panneau à choix multiple ouvert : [{ libelle, coche, x, y }].
const SCRIPT_OPTIONS_OUVERTES = `(() => {
  const net = (t) => String(t || '').replace(/\\s+/g, ' ').trim();
  const out = [];
  document.querySelectorAll('.ui-selectcheckboxmenu-panel li, .ui-selectcheckboxmenu-items li, [role=option]').forEach((li) => {
    const r = li.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return;
    const boite = li.querySelector('.ui-chkbox-box') || li;
    const b = boite.getBoundingClientRect();
    const coche = !!(li.querySelector('.ui-chkbox-box.ui-state-active, input:checked') || li.getAttribute('aria-checked') === 'true');
    out.push({ libelle: net(li.innerText).slice(0, 60), coche, x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) });
  });
  return out;
})()`;

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
    if (el.cache) throw new Error(`« ${String(el.texte).slice(0, 40)} » est recouvert par autre chose : pas cliqué`);
    controlerClic({ geste: c && c.geste, vise: texte, bouton: el.bouton, texte: el.texte, ecritureAutorisee: !!o.ecriture });
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
  return { ev, cdp, cliquerTexte, ecrire, entree, echap, attendreTexte, texte, etape };
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
  return { element: !!el, bloque, primefaces: !!(window.PrimeFaces && typeof window.PrimeFaces.ab === 'function') };
})()`;
const SCRIPT_PASSER_SILICIUM = "PrimeFaces.ab({ s: 'redirectionInstallationPosteClient', p: 'redirectionInstallationPosteClient', ps: true, pa: ['true'] }), true";

/** Pure : la page est-elle la page d'installation du poste client à passer ? @param {any} etat ce que rend SCRIPT_PAGE_SILICIUM */
function pageSiliciumAPasser(etat) {
  return !!(etat && etat.element && etat.bloque && etat.primefaces);
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
    await s.attendreStable(10000);
    await attendre(600);
  }
  return n;
}

/** Connexion (identifiant, mot de passe, « Se connecter »). Rien ne s'écrit si la session est déjà ouverte. @param {any} s @param {any} r @param {(t: string) => void} etape */
async function seConnecter(s, r, etape) {
  if (!r.identifiant || !r.motDePasse) throw new Error('identifiant ou mot de passe d’Authentic non enregistré (Réglages › Authentic)');
  const g = gestes(s, etape);
  etape('Ouvre Authentic');
  await s.aller(r.adresse);
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
  etape('Connectée');
}

/** Pure : la PREMIÈRE ligne de la page qui commence par une référence d'Authentic (« A 2026 00286 VTE … ») — l'en-tête du dossier affiché
 * (les titres des onglets ne commencent pas par une référence). @param {string} texte */
function referenceEnTete(texte) {
  const l = String(texte || '').split('\n').map((x) => x.trim()).find((x) => /^[A-Z]\s+(?:19|20)\d{2}\s+\d{4,6}\b/.test(x));
  return l ? (/^([A-Z]\s+(?:19|20)\d{2}\s+\d{4,6})\b/.exec(l) || ['', ''])[1].replace(/\s+/g, ' ') : '';
}

/** Pure : le dossier affiché est-il CE dossier ? Référence de l'en-tête égale à la sienne (exigée quand elle est connue) ; sans
 * référence, le libellé exact de cet en-tête. Toujours la rubrique « Comparants (N) ». @param {string} texte @param {{ reference?: string, libelle?: string }} cible */
function estCeDossier(texte, cible) {
  if (!/Comparants\s*\(\d+\)/i.test(String(texte || ''))) return false;
  const ref = String(cible.reference || '').replace(/\s+/g, ' ').trim();
  if (ref) return referenceEnTete(texte) === ref;
  // Sans référence : l'EN-TÊTE (première ligne qui commence par une référence) porte exactement ce libellé — jamais un titre d'onglet.
  const lib = plat(cible.libelle);
  const tete = String(texte || '').split('\n').map((x) => x.trim()).find((x) => /^[A-Z]\s+(?:19|20)\d{2}\s+\d{4,6}\b/.test(x));
  return !!lib && !!tete && plat(tete).replace(/^[a-z]\s+\d{4}\s+\d{4,6}\s+/, '') === lib;
}

/**
 * Retrouve et ouvre CE dossier : un lien dont le texte est sa référence (« Derniers dossiers ouverts », résultats), sinon la recherche
 * générale par la référence puis par le libellé. Une page qui ne montre pas SA référence en tête n'est jamais prise (relecture 0.373.0 :
 * « VTE DUPONT / MARTIN » ouvrait « VTE DUPONT / MARTINEZ »).
 * @param {any} s @param {{ reference?: string, libelle?: string }} cible @param {(t: string) => void} etape
 */
async function ouvrirDossier(s, cible, etape) {
  const g = gestes(s, etape);
  const ref = String(cible.reference || '').replace(/\s+/g, ' ').trim();
  const lib = String(cible.libelle || '').trim();
  if (!ref && !lib) throw new Error('dossier sans référence ni nom dans Authentic');
  etape('Cherche le dossier');
  await passerVerificationSilicium(s, etape);
  if (estCeDossier(await g.texte(), cible)) return;
  // Un lien qui porte la référence (« A 2026 00286 VTE … ») ou, sans référence, exactement le libellé.
  const essayer = async () => {
    const ok = ref ? await g.cliquerTexte(ref, { geste: 'donnee' }) : await g.cliquerTexte(lib, { exact: true, geste: 'donnee' });
    if (!ok) return false;
    await s.attendreStable(15000);
    return estCeDossier(await g.texte(), cible);
  };
  if (await essayer()) return;
  for (const quoi of [ref, lib].filter(Boolean)) {
    const champ = await g.ev(scriptChamp('rechercher'));
    if (!champ) break;
    await g.ecrire(champ, quoi);
    await g.entree();
    if (await essayer()) return;
  }
  throw new Error(ref ? `dossier ${ref} introuvable dans Authentic` : 'dossier introuvable dans Authentic par son nom');
}

/** Ouvre le sous-dossier de vente (« N - VTE … » / « N - Vente … », jamais la promesse ni l'avenant) et vérifie qu'il est affiché.
 * Rend faux s'il n'y en a pas. @param {any} s @param {{ reference?: string, libelle?: string }} cible @param {(t: string) => void} etape */
async function ouvrirSousDossierVente(s, cible, etape) {
  const g = gestes(s, etape);
  const lignes = [...new Set(String(await g.texte()).split('\n').map((l) => l.trim()).filter((l) => /^\d{1,3}\s*-\s*(VTE|Vente)\b/i.test(l) && !/promesse|avenant|compromis/i.test(l)))];
  if (lignes.length !== 1) return false;   // aucun, ou plusieurs ventes : on ne choisit pas
  etape('Ouvre le sous-dossier de vente');
  if (!(await g.cliquerTexte(lignes[0], { exact: true, geste: 'donnee' }))) return false;
  await s.attendreStable(12000);
  return estCeDossier(await g.texte(), cible);
}

// Aperçus des formalités (plan Authen.TIC, étape 4 ; cartographie du 27/10 : « s'ouvre par l'icône image qui apparaît au survol d'une ligne
// de formalité, et non par le clic sur le titre, qui peut bloquer le chargement »). Les lignes : un élément visible dont le texte commence par
// un badge (APR, ECV, T@, ACT, MIC…), le plus intérieur ; chacune reçoit un repère `data-claire-ligne`.
const SCRIPT_LIGNES_FORMALITES = `(() => {
  const re = /^(APR|ECV|T@|ACT|MIC|SPR|BRI|CJN)(?=\\s|$)/;
  const vus = [];
  document.querySelectorAll('tr, li, [class*="formalite"], [class*="ui-datalist-item"]').forEach((e) => {
    if (!e.offsetWidth || !e.offsetHeight || e.closest('[id*="previewFormalite"], [id*="sideView"]')) return;
    const t = String(e.innerText || '').trim();
    if (!re.test(t) || t.length > 400) return;
    if ([...e.querySelectorAll('tr, li')].some((x) => re.test(String(x.innerText || '').trim()))) return;
    vus.push(e);
  });
  vus.slice(0, 15).forEach((e, i) => e.setAttribute('data-claire-ligne', String(i)));
  return Math.min(vus.length, 15);
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
  const dit = /aper[çc]u|preview|visibility|(?<![a-z])voir(?![a-z])|image|photo/i;
  const e = [...l.querySelectorAll('button, a, [role=button], i, span, img')]
    // Jamais une corbeille, même si son titre dit « aperçu » (« Supprimer l'aperçu ») : elle et ce qui la contient sont écartés d'avance ; la
    // garde contrôle encore ce qui est sous le pointeur.
    .filter((x) => !/supprim|corbeille|trash|delete|poubelle/i.test(libelle(x) + ' ' + [...x.querySelectorAll('*')].map(libelle).join(' ')))
    .find((x) => x.getClientRects().length && getComputedStyle(x).visibility !== 'hidden' && String(x.innerText || '').trim().length <= 3 && dit.test(libelle(x)));
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
const SCRIPT_TIROIR_OUVERT = `!![...document.querySelectorAll('${SELECTEUR_TIROIR}')].find((e) => e.getClientRects().length)`;
// « Fermer » cherché DANS le tiroir seulement, vérifié sous le pointeur : { x, y, texte } ou null.
const SCRIPT_FERMER_TIROIR = `(() => {
  const t = [...document.querySelectorAll('${SELECTEUR_TIROIR}')].find((e) => e.getClientRects().length);
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
  const nb = Number(await g.ev(SCRIPT_LIGNES_FORMALITES)) || 0;
  let n = 0;
  for (let i = 0; i < nb; i++) {
    if (await g.ev(SCRIPT_TIROIR_OUVERT)) break;
    try {
      const pos = await g.ev(scriptPlacerLigne(i));
      if (!pos) continue;
      await g.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x, y: pos.y });
      await attendre(400);
      const ic = await g.ev(scriptIconeApercu(i));
      if (!ic) continue;
      controlerClic({ geste: 'apercu', vise: '', bouton: ic.bouton, texte: ic.bouton });
      await s.cliquerPosition(ic.x, ic.y);
      await s.attendreStable(8000);
      if (!(await g.ev(SCRIPT_TIROIR_OUVERT))) continue;
      if (n === 0) o.etape('Relève les aperçus des formalités');
      await releverPage(s, o.script, o.recevoir);
      n++;
      await g.echap();
      await attendre(400);
      if (await g.ev(SCRIPT_TIROIR_OUVERT)) {
        const f = await g.ev(SCRIPT_FERMER_TIROIR);
        if (f) { controlerClic({ geste: 'navigation', vise: f.texte, bouton: f.texte, texte: f.texte }); await s.cliquerPosition(f.x, f.y); await attendre(400); }
      }
    } catch (e) {
      // Un refus de la garde ou une ligne qui ne s'ouvre pas : la ligne suivante, sans s'arrêter.
      if (e && e.refusGarde) o.etape('Passe un aperçu (refusé par CLAIRE)');
    }
  }
  if (await g.ev(SCRIPT_TIROIR_OUVERT)) o.etape('Un aperçu ne s’est pas refermé : lecture des aperçus arrêtée');
  return n;
}

// Pièces jointes du sous-dossier (GED, étape 5) : l'onglet « Pièces jointes » ouvert, la liste relevée (nom, identifiant, dossier de l'arbre).
/** @param {any} s @param {{ script: string, recevoir: (c: any) => any, etape: (t: string) => void }} o */
async function lirePiecesJointes(s, o) {
  const g = gestes(s, o.etape);
  if (!(await g.cliquerTexte('Pièces jointes', { geste: 'navigation' }))) return false;
  await s.attendreStable(10000);
  o.etape('Relève la liste des pièces jointes');
  await releverPage(s, o.script, o.recevoir);
  return true;
}

/** La position du fichier `pjId` dans l'arbre de la GED, vérifiée sous le pointeur : { x, y, nom, bouton } ou null. @param {string} pjId */
const scriptPositionPiece = (pjId) => `(() => {
  const id = ${JSON.stringify(String(pjId))};
  const e = [...document.querySelectorAll('[onclick*="selectTreeNode"]')].find((x) => new RegExp("selectTreeNode\\\\(\\\\s*[^,]*,\\\\s*'?" + id + "'?[\\\\s,)]").test(x.getAttribute('onclick') || ''));
  if (!e) return null;
  e.scrollIntoView({ block: 'center' });
  const r = e.getBoundingClientRect();
  const x = Math.round(r.left + Math.min(r.width / 2, 120)), y = Math.round(r.top + r.height / 2);
  const d = document.elementFromPoint(x, y);
  if (!d || !(e.contains(d) || d.contains(e))) return null;
  // Le bouton sous le pointeur, lu comme dans scriptTrouverTexte (audit 0.381.0) : texte, title, aria-label, corbeille = « supprimer ».
  const b = d.closest('button, a, [role=button], .ui-button') || d;
  const corbeille = !!(b.querySelector && b.querySelector('[class*=trash], [class*=delete], [class*=corbeille]')) || /trash|delete|corbeille/i.test(String(d.className || ''));
  const bouton = [b.innerText, b.getAttribute('title'), b.getAttribute('aria-label'), corbeille ? 'supprimer' : ''].filter(Boolean).join(' ');
  return { x, y, nom: String(e.textContent || '').trim().slice(0, 200), bouton: String(bouton).trim().slice(0, 160) };
})()`;
// L'adresse du PDF affiché par la visionneuse de la GED (`dynamiccontent` de PrimeFaces), du MÊME site seulement.
const SCRIPT_SOURCE_PDF = `(() => { const u = [...document.querySelectorAll('iframe, embed, object')].map((x) => x.src || x.data || '').find((v) => /dynamiccontent/i.test(v));
  if (!u) return ''; try { const a = new URL(u, location.href); return a.origin === location.origin ? a.href : ''; } catch (e) { return ''; } })()`;
/** Le PDF lu dans la page (cookies de la séance), en base64 ; null s'il dépasse 20 Mo ou n'est pas un PDF. @param {string} url */
const scriptLirePdf = (url) => `fetch(${JSON.stringify(url)}, { credentials: 'include' }).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => {
  if (!b || b.byteLength > 20 * 1024 * 1024) return null;
  const u = new Uint8Array(b);
  if (String.fromCharCode(u[0], u[1], u[2], u[3]) !== '%PDF') return null;
  let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768));
  return btoa(s);
})`;

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
  const pos = await g.ev(scriptPositionPiece(pjId));
  if (!pos) throw new Error('pièce introuvable dans la liste d’Authentic');
  controlerClic({ geste: 'donnee', vise: pos.nom, bouton: pos.bouton, texte: pos.nom });
  o.etape('Ouvre la pièce');
  await s.cliquerPosition(pos.x, pos.y);
  await s.attendreStable(10000);
  let url = '';
  for (let i = 0; i < 20 && !url; i++) { url = String(await g.ev(SCRIPT_SOURCE_PDF) || ''); if (!url) await attendre(500); }
  if (!url) throw new Error('la visionneuse d’Authentic n’a pas affiché de PDF');
  const b64 = await g.ev(scriptLirePdf(url));
  if (!b64) throw new Error('PDF illisible ou de plus de 20 Mo');
  return { nom: pos.nom, pdf: Buffer.from(String(b64), 'base64') };
}

/** Relève la page affichée (le relevé de l'extension) et la confie à la file des relevés. @param {any} s @param {string} script @param {(c: any) => any} recevoir */
async function releverPage(s, script, recevoir) {
  const capture = await s.evaluer(`(() => { ${script}\n; return window.__claireRelever(); })()`);
  if (!capture) return null;
  return recevoir(capture);
}

/** Pure : les noms de comparants et les adresses d'immeubles lus dans le texte de la page du dossier. @param {string} texte */
function liensFichesDuTexte(texte) {
  const lignes = String(texte || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const out = { comparants: /** @type {string[]} */ ([]), immeubles: /** @type {string[]} */ ([]) };
  let zone = '';
  for (const l of lignes) {
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
 * @param {any} s @param {{ reference?: string, libelle?: string }} cible @param {{ script: string, recevoir: (c: any) => any, etape: (t: string) => void }} o
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
  for (const [i, nom] of [...comparants, ...immeubles].entries()) {
    const fiche = i < comparants.length ? `la fiche client ${i + 1}` : `la fiche bien ${i - comparants.length + 1}`;
    try {
      if (!(await g.cliquerTexte(nom, { exact: true, geste: 'donnee' }))) continue;
      await s.attendreStable(12000);
      o.etape(`Relève ${fiche}`);
      await releverPage(s, o.script, o.recevoir);
      pages++;
      // Retour à la page du dossier : « Retour » d'Authentic, sinon l'onglet du dossier.
      if (!(await g.cliquerTexte('Retour', { exact: true, geste: 'navigation' }))) await g.cliquerTexte(String(cible.reference || cible.libelle || ''), { geste: 'donnee' });
      await s.attendreStable(12000);
      if (!estCeDossier(await g.texte(), cible)) { o.etape('Revient au dossier'); await ouvrirDossier(s, cible, o.etape); await ouvrirSousDossierVente(s, cible, o.etape); }
    } catch (e) { o.etape(`Passe ${fiche} (${String(e && e.message).slice(0, 60)})`); }
  }
  // La liste des pièces jointes (étape 5), sur la page du dossier : sans jamais bloquer le reste.
  try {
    if (!estCeDossier(await g.texte(), cible)) { await ouvrirDossier(s, cible, o.etape); await ouvrirSousDossierVente(s, cible, o.etape); }
    if (estCeDossier(await g.texte(), cible) && await lirePiecesJointes(s, o)) pages++;
  } catch (e) { o.etape('Pièces jointes non lues'); }
  return { pages, apercus };
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
      if (!(await g.cliquerTexte(e.menu, { exact: true, geste: 'suivi' }))) { o.etape(`Menu « ${e.menu} » introuvable`); continue; }
      await s.attendreStable(5000);
      if (!(await g.cliquerTexte(e.entree, { exact: true, geste: 'suivi' }))) { o.etape(`« ${e.entree} » introuvable`); continue; }
      await s.attendreStable(15000);
      const capture = await s.evaluer(`(() => { ${o.script}\n; return window.__claireRelever(); })()`);
      if (capture) captures[e.cle] = capture;
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
  o.etape('Ouvre l’onglet Comptabilité');
  if (!(await g.cliquerTexte('Comptabilité', { exact: true, geste: 'navigation' }))) throw new Error('onglet « Comptabilité » introuvable dans le dossier');
  await s.attendreStable(15000);
  if (!(await g.attendreTexte(/Solde de l.affaire|Derni[èe]res op[ée]rations/i, 20000))) throw new Error('page de comptabilité non reconnue (ni « Solde de l’affaire », ni « Dernières opérations »)');
  // La page affichée est encore celle de CE dossier (son en-tête), sinon rien n'est gardé.
  if (!estCeDossier(await g.texte(), cible)) throw new Error('la comptabilité affichée n’est pas celle de ce dossier : rien relevé');
  o.etape('Relève les infos comptables');
  return s.evaluer(`(() => { ${o.script}\n; return window.__claireRelever(); })()`);
}

/**
 * Prépare une demande CJN ou Comedec dans le sous-dossier de vente : Création rapide allumée, Envoi immédiat éteint, puis Valider.
 * @param {any} s @param {{ reference?: string, libelle?: string }} cible
 * @param {{ type: 'cjn' | 'comedec', parties: Array<{ nom: string, prenom?: string, marie?: boolean }>, etape: (t: string) => void, ecriture?: boolean }} o
 */
async function preparerFormalite(s, cible, o) {
  // Écrire dans Authentic : seulement si l'étude l'a allumé (Réglages › Authentic › « Préparer des demandes »), dit par l'appelant.
  if (!o.ecriture) throw new Error('préparer des demandes dans Authentic est éteint (Réglages › Authentic) : rien n’est écrit');
  const g = gestes(s, o.etape, { ecriture: true });
  if (!String(cible.reference || '').trim()) throw new Error('dossier sans référence d’Authentic retenue : aucune demande sans être sûr du dossier');
  await ouvrirDossier(s, cible, o.etape);
  if (!(await ouvrirSousDossierVente(s, cible, o.etape))) throw new Error('sous-dossier de vente introuvable (ou plusieurs) : aucune demande');
  o.etape('Ouvre les formalités préalables');
  if (!(await g.cliquerTexte('Formalités préalables', { exact: true, geste: 'navigation' }))) throw new Error('onglet « Formalités préalables » introuvable');
  await s.attendreStable(10000);
  if (!(await g.cliquerTexte('Ajouter des formalités préalables', { exact: true, geste: 'ecriture' }))) throw new Error('« Ajouter des formalités préalables » introuvable');
  await s.attendreStable(10000);
  const nom = o.type === 'cjn' ? 'Casier Judiciaire National dématérialisé (CJN)' : 'Etat civil dématérialisé (COMEDEC)';
  const champ = await g.ev(scriptChamp('rechercher une formalit'));
  if (champ) { await g.ecrire(champ, o.type === 'cjn' ? 'Casier Judiciaire' : 'COMEDEC'); await attendre(1200); }
  o.etape(o.type === 'cjn' ? 'Ajoute la demande de casier judiciaire' : 'Ajoute la demande d’état civil');
  if (!(await g.cliquerTexte(nom, { exact: true, geste: 'ecriture' }))) throw new Error(`formalité « ${nom} » introuvable dans la liste`);
  await s.attendreStable(10000);
  if (!(await g.attendreTexte(o.type === 'cjn' ? /acqu[ée]reurs? [aâ]g[ée]s/i : /Type de Demande/i, 10000))) throw new Error('le bloc de la demande ne s’est pas affiché');

  let choisies = 0;
  if (o.type === 'comedec') {
    o.etape('Coche naissance pour chaque partie, mariage pour les mariés');
    const lignes = (await g.ev(SCRIPT_LIGNES_COMEDEC)) || [];
    for (const [i, l] of lignes.entries()) {
      const voulues = demandesComedecIntervenant(l.libelle, o.parties);
      // Une ligne sans demande voulue et sans rien de coché : on n'y touche pas.
      if (!voulues.length && !String(l.choisi || '').trim()) continue;
      const pos = await g.ev(scriptLigneComedec(i));
      if (!pos || !pos.sur) throw new Error('liste « Type de Demande » recouverte : rien validé');
      await s.cliquerPosition(pos.x, pos.y);
      await attendre(500);
      const options = (await g.ev(SCRIPT_OPTIONS_OUVERTES)) || [];
      // Chaque option : cochée si voulue, DÉCOCHÉE sinon (une ligne préremplie par Authentic pour un conjoint ou un décès non voulu).
      for (const opt of options) {
        const voulue = voulues.some((v) => plat(v) === plat(opt.libelle));
        if (opt.coche !== voulue) { await s.cliquerPosition(opt.x, opt.y); await attendre(300); }
      }
      const relues = (await g.ev(SCRIPT_OPTIONS_OUVERTES)) || [];
      for (const v of voulues) if (!relues.some((x) => plat(x.libelle) === plat(v) && x.coche)) throw new Error(`« ${v} » n’a pas pu être coché : rien validé`);
      if (relues.some((x) => x.coche && !voulues.some((v) => plat(v) === plat(x.libelle)))) throw new Error('une demande non voulue reste cochée : rien validé');
      choisies += voulues.length;
      await g.echap();
      await attendre(300);
    }
    if (!choisies) throw new Error('aucune partie du dossier reconnue parmi les intervenants : rien de coché, rien validé');
  } else {
    // CJN : chaque intervenant coché par Authentic doit être un acquéreur de la fiche (nom et prénom), sinon rien n'est validé.
    const cases = ((await g.ev(SCRIPT_INTERRUPTEURS)) || []).filter((c) => c.ligne && c.coche && !/nom de l.intervenant/i.test(c.ligne));
    if (!cases.length) throw new Error('aucun acquéreur coché dans la demande de casier : rien validé');
    const etranger = cases.find((c) => !demandesComedecIntervenant(c.ligne, o.parties).length);
    if (etranger) throw new Error('un intervenant coché n’est pas un acquéreur de la fiche : rien validé');
    choisies = cases.length;
  }

  // Les deux interrupteurs : Création rapide ALLUMÉE, Envoi immédiat ÉTEINT — lus avant, corrigés, RELUS avant « Valider ».
  const lire = async () => {
    await g.ev(`(() => { const l = [...document.querySelectorAll('label, span, div')].find((e) => /^envoi imm[ée]diat/i.test(String(e.innerText).trim()) && e.children.length < 3); if (l) l.scrollIntoView({ block: 'center' }); })()`);
    const tous = ((await g.ev(SCRIPT_INTERRUPTEURS)) || []).filter((c) => c.sur);
    return { rapide: tous.find((c) => /cr[ée]ation rapide/i.test(c.libelle)), envoi: tous.find((c) => /envoi imm[ée]diat/i.test(c.libelle)) };
  };
  let i = await lire();
  if (!i.envoi || !i.rapide) throw new Error('interrupteurs « Création rapide » / « Envoi immédiat » introuvables : rien validé');
  if (i.envoi.coche) { await s.cliquerPosition(i.envoi.x, i.envoi.y); await attendre(500); }
  if (!i.rapide.coche) { await s.cliquerPosition(i.rapide.x, i.rapide.y); await attendre(500); }
  i = await lire();
  if (!i.envoi || i.envoi.coche !== false) throw new Error('« Envoi immédiat » n’a pas pu être lu éteint : rien validé');
  if (!i.rapide || i.rapide.coche !== true) throw new Error('« Création rapide » n’a pas pu être lue allumée : rien validé');
  o.etape('Création rapide allumée, Envoi immédiat éteint : valide la création');
  if (!(await g.cliquerTexte('Valider', { exact: true, geste: 'ecriture' }))) throw new Error('bouton « Valider » introuvable');
  await s.attendreStable(15000);
  const erreurs = (await g.ev(SCRIPT_ERREURS)) || [];
  if (erreurs.length) throw new Error('Authentic a répondu : ' + erreurs.join(' ; ').slice(0, 200));
  return { demandes: choisies };
}

module.exports = {
  CLE_CONNEXION_AUTHENTIC, DOMAINES_AUTHENTIC, ADRESSE_DEFAUT,
  libelleInterdit, assainirConnexionAuthentic, lireConnexionAuthentic, vueConnexionAuthentic, ecrireConnexionAuthentic,
  demandesComedecIntervenant, liensFichesDuTexte, scriptReleve, pageSiliciumAPasser, passerVerificationSilicium, lireApercusFormalites, lirePiecesJointes, lirePiecePdf,
  referenceEnTete, estCeDossier, seConnecter, lireDossier, lireSuivis, lireComptabilite, preparerFormalite
};
