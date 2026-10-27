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

// Libellés jamais cliqués par CLAIRE dans Authentic (wiki de Fichorga, fichiers 03 § 9, 04 § 11, 06 ; décision de l'étude du 27/10).
const RE_INTERDIT = /(envo[iy]|prêt pour envoi|pret pour envoi|signer|signature électronique|supprim|corbeille|virement|euros?\b|intégrer|integrer|nouveau dossier|export|réinitialiser|reinitialiser|mode expert|données littérales|donnees litterales|débloquer|debloquer|déblocage|deblocage|archiver|clôturer|cloturer|dupliquer|payer|paiement)/i;

/** Pure : un libellé que CLAIRE ne clique jamais. @param {string} libelle */
function libelleInterdit(libelle) {
  return RE_INTERDIT.test(String(libelle || ''));
}

/** Pure : les réglages gardés, propres (secret compris : jamais rendu par une route). @param {any} brut */
function assainirConnexionAuthentic(brut) {
  const b = brut && typeof brut === 'object' ? brut : {};
  let adresse = typeof b.adresse === 'string' ? b.adresse.trim().slice(0, 300) : '';
  try { const u = new URL(adresse); if (u.protocol !== 'https:' || !/(^|\.)cloud-fichorga\.fr$/i.test(u.hostname) || u.username || u.password) adresse = ''; } catch (_) { adresse = ''; }
  return {
    actif: b.actif === true,
    adresse: adresse || ADRESSE_DEFAUT,
    identifiant: typeof b.identifiant === 'string' ? b.identifiant.trim().slice(0, 120) : '',
    motDePasse: typeof b.motDePasse === 'string' ? b.motDePasse.slice(0, 200) : ''
  };
}

/** @param {any} repo */
function lireConnexionAuthentic(repo) { return assainirConnexionAuthentic(repo.lireJsonBrut(CLE_CONNEXION_AUTHENTIC, null)); }

/** Ce qu'une route rend : jamais le mot de passe, seulement s'il est enregistré. @param {any} r */
function vueConnexionAuthentic(r) {
  return { actif: r.actif, adresse: r.adresse, identifiant: r.identifiant, motDePasseEnregistre: !!r.motDePasse };
}

/** Enregistre (mot de passe gardé s'il n'est pas réémis, effacé sur chaîne vide explicite). @param {any} repo @param {any} modif */
function ecrireConnexionAuthentic(repo, modif) {
  const avant = lireConnexionAuthentic(repo);
  const m = modif && typeof modif === 'object' ? modif : {};
  const suivant = assainirConnexionAuthentic({
    actif: typeof m.actif === 'boolean' ? m.actif : avant.actif,
    adresse: typeof m.adresse === 'string' ? m.adresse : avant.adresse,
    identifiant: typeof m.identifiant === 'string' ? m.identifiant : avant.identifiant,
    motDePasse: typeof m.motDePasse === 'string' ? m.motDePasse : avant.motDePasse
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
    if (!nom.length || !nom.every((m) => mots.includes(m))) return false;
    // Prénom exigé quand la fiche le connaît (deux personnes du même nom dans le dossier).
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
    out.push({ libelle: libelle.slice(0, 80), ligne: ligne ? net(ligne.innerText).slice(0, 160) : '', coche, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
  });
  return out;
})()`;

// Le plus petit élément visible dont le texte commence par (ou est) `cible`, hors de la barre latérale : { x, y, texte } ou null.
const scriptTrouverTexte = (cible, exact) => `(() => {
  const net = (t) => String(t || '').replace(/\\s+/g, ' ').trim().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();
  const c = net(${JSON.stringify(String(cible))});
  let meilleur = null;
  document.querySelectorAll('a, button, span, div, li, td, label, h1, h2, h3, h4, h5').forEach((e) => {
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight || r.left < 200 && r.width < 240 && e.closest('nav, .layout-sidebar, .menu, [class*=sidebar]')) return;
    const t = net(e.innerText);
    if (!(${exact ? 't === c' : 't === c || t.startsWith(c)'})) return;
    if (!meilleur || t.length < meilleur.t.length || (t.length === meilleur.t.length && r.width * r.height < meilleur.aire)) meilleur = { t, aire: r.width * r.height, x: Math.round(r.left + Math.min(r.width / 2, 160)), y: Math.round(r.top + r.height / 2), texte: String(e.innerText).trim().slice(0, 160) };
  });
  return meilleur ? { x: meilleur.x, y: meilleur.y, texte: meilleur.texte } : null;
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

// Les lignes du tableau « Intervenants | Type de Demande » du bloc Comedec : [{ libelle, x, y }] (centre de la liste à choix).
const SCRIPT_LIGNES_COMEDEC = `(() => {
  const net = (t) => String(t || '').replace(/\\s+/g, ' ').trim();
  const out = [];
  for (const table of document.querySelectorAll('table')) {
    const tete = net((table.tHead || table).innerText).toLowerCase();
    if (!tete.includes('intervenant') || !tete.includes('type de demande')) continue;
    for (const tr of table.querySelectorAll('tbody tr')) {
      const cases = tr.querySelectorAll('td');
      if (cases.length < 2) continue;
      const liste = cases[cases.length - 1].querySelector('.ui-selectcheckboxmenu, .ui-selectonemenu, select, [role=combobox]') || cases[cases.length - 1];
      const r = liste.getBoundingClientRect(); if (r.width < 2) continue;
      out.push({ libelle: net(cases[0].innerText).slice(0, 200), choisi: net(cases[cases.length - 1].innerText).slice(0, 80), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
    }
  }
  return out;
})()`;

// Les options du panneau à choix multiple ouvert : [{ libelle, coche, x, y }].
const SCRIPT_OPTIONS_OUVERTES = `(() => {
  const net = (t) => String(t || '').replace(/\\s+/g, ' ').trim();
  const out = [];
  document.querySelectorAll('.ui-selectcheckboxmenu-panel li, .ui-selectcheckboxmenu-items li, [role=option]').forEach((li) => {
    const r = li.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return;
    const boite = li.querySelector('.ui-chkbox-box') || li;
    const b = boite.getBoundingClientRect();
    const coche = !!(li.querySelector('.ui-chkbox-box.ui-state-active, input:checked') || li.getAttribute('aria-checked') === 'true' || li.classList.contains('ui-state-highlight'));
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
 * Les gestes de base sur une séance (navigateur/session.js), pour les parcours ci-dessous.
 * @param {any} s @param {(texte: string) => void} etape
 */
function gestes(s, etape) {
  const ev = (expr) => s.evaluer(expr);
  const cdp = (methode, params) => s.cdp.envoyer(methode, params, s.ongletActif().session);
  /** Clique un texte visible (jamais un libellé interdit). @param {string} texte @param {{ exact?: boolean, permis?: boolean }} [o] */
  async function cliquerTexte(texte, o = {}) {
    const el = await ev(scriptTrouverTexte(texte, !!o.exact));
    if (!el) return false;
    if (!o.permis && libelleInterdit(el.texte)) throw new Error(`bouton « ${String(el.texte).slice(0, 40)} » refusé par CLAIRE`);
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

/** Connexion (identifiant, mot de passe, « Se connecter »). Rien ne s'écrit si la session est déjà ouverte. @param {any} s @param {any} r @param {(t: string) => void} etape */
async function seConnecter(s, r, etape) {
  if (!r.identifiant || !r.motDePasse) throw new Error('identifiant ou mot de passe d’Authentic non enregistré (Réglages › Authentic)');
  const g = gestes(s, etape);
  etape('Ouvre Authentic');
  await s.aller(r.adresse);
  const pw = await g.ev(SCRIPT_CHAMP_MOT_DE_PASSE);
  if (!pw) { etape('Session déjà ouverte'); return; }
  etape('Se connecte avec le compte de l’étude');
  const id = await g.ev(SCRIPT_CHAMP_IDENTIFIANT);
  if (!id) throw new Error('champ « Identifiant » introuvable sur la page de connexion');
  await g.ecrire(id, r.identifiant);
  await g.ecrire(pw, r.motDePasse);
  if (!(await g.cliquerTexte('Se connecter', { exact: true }))) await g.entree();
  await s.attendreStable(20000);
  if (await g.ev(SCRIPT_CHAMP_MOT_DE_PASSE)) throw Object.assign(new Error('connexion refusée par Authentic (identifiant ou mot de passe)'), { refusIdentifiants: true });
  etape('Connectée');
}

/**
 * Retrouve et ouvre un dossier : « Derniers dossiers ouverts » de l'accueil, sinon la recherche générale (référence, puis libellé).
 * @param {any} s @param {{ reference?: string, libelle?: string }} cible @param {(t: string) => void} etape
 */
async function ouvrirDossier(s, cible, etape) {
  const g = gestes(s, etape);
  const ref = String(cible.reference || '').trim();
  const lib = String(cible.libelle || '').trim();
  const essais = [ref, lib].filter(Boolean);
  if (!essais.length) throw new Error('dossier sans référence ni nom dans Authentic');
  etape('Cherche le dossier');
  for (const quoi of essais) {
    if (await g.cliquerTexte(quoi)) { await s.attendreStable(15000); if (await dossierOuvert(g, essais)) return; }
    const champ = await g.ev(scriptChamp('rechercher'));
    if (!champ) continue;
    await g.ecrire(champ, quoi);
    await g.entree();
    if (await g.cliquerTexte(quoi)) { await s.attendreStable(15000); if (await dossierOuvert(g, essais)) return; }
  }
  throw new Error('dossier introuvable dans Authentic (référence ou nom)');
}

/** @param {any} g @param {string[]} essais */
async function dossierOuvert(g, essais) {
  const t = plat(await g.texte());
  return /comparants\s*\(\d+\)/.test(t) && essais.some((e) => t.includes(plat(e)));
}

/** Ouvre le sous-dossier de vente (« N - VTE … » / « N - Vente … », jamais la promesse ni l'avenant). @param {any} s @param {(t: string) => void} etape */
async function ouvrirSousDossierVente(s, etape) {
  const g = gestes(s, etape);
  const lignes = String(await g.texte()).split('\n').map((l) => l.trim()).filter((l) => /^\d{1,3}\s*-\s*(VTE|Vente)\b/i.test(l) && !/promesse|avenant|compromis/i.test(l));
  if (!lignes.length) return false;
  etape('Ouvre le sous-dossier de vente');
  await g.cliquerTexte(lignes[lignes.length - 1], { exact: true });
  await s.attendreStable(12000);
  return true;
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
  await ouvrirSousDossierVente(s, o.etape);
  o.etape('Relève la page du dossier');
  await releverPage(s, o.script, o.recevoir);
  let pages = 1;
  const { comparants, immeubles } = liensFichesDuTexte(await g.texte());
  for (const [i, nom] of [...comparants, ...immeubles].entries()) {
    const fiche = i < comparants.length ? `la fiche client ${i + 1}` : `la fiche bien ${i - comparants.length + 1}`;
    try {
      if (!(await g.cliquerTexte(nom, { exact: true }))) continue;
      await s.attendreStable(12000);
      o.etape(`Relève ${fiche}`);
      await releverPage(s, o.script, o.recevoir);
      pages++;
      // Retour à la page du dossier : « Retour » d'Authentic, sinon l'onglet du dossier.
      if (!(await g.cliquerTexte('Retour', { exact: true }))) await g.cliquerTexte(String(cible.reference || cible.libelle || ''));
      await s.attendreStable(12000);
    } catch (e) { o.etape(`Passe ${fiche} (${String(e && e.message).slice(0, 60)})`); }
  }
  return { pages };
}

/**
 * Prépare une demande CJN ou Comedec dans le sous-dossier de vente : Création rapide allumée, Envoi immédiat éteint, puis Valider.
 * @param {any} s @param {{ reference?: string, libelle?: string }} cible
 * @param {{ type: 'cjn' | 'comedec', parties: Array<{ nom: string, prenom?: string, marie?: boolean }>, etape: (t: string) => void }} o
 */
async function preparerFormalite(s, cible, o) {
  const g = gestes(s, o.etape);
  await ouvrirDossier(s, cible, o.etape);
  await ouvrirSousDossierVente(s, o.etape);
  o.etape('Ouvre les formalités préalables');
  if (!(await g.cliquerTexte('Formalités préalables', { exact: true }))) throw new Error('onglet « Formalités préalables » introuvable');
  await s.attendreStable(10000);
  if (!(await g.cliquerTexte('Ajouter des formalités préalables', { exact: true }))) throw new Error('« Ajouter des formalités préalables » introuvable');
  await s.attendreStable(10000);
  const nom = o.type === 'cjn' ? 'Casier Judiciaire National dématérialisé (CJN)' : 'Etat civil dématérialisé (COMEDEC)';
  const champ = await g.ev(scriptChamp('rechercher une formalit'));
  if (champ) { await g.ecrire(champ, o.type === 'cjn' ? 'Casier Judiciaire' : 'COMEDEC'); await attendre(1200); }
  o.etape(o.type === 'cjn' ? 'Ajoute la demande de casier judiciaire' : 'Ajoute la demande d’état civil');
  if (!(await g.cliquerTexte(nom, { exact: true }))) throw new Error(`formalité « ${nom} » introuvable dans la liste`);
  await s.attendreStable(10000);
  if (!(await g.attendreTexte(o.type === 'cjn' ? /acqu[ée]reurs? [aâ]g[ée]s/i : /Type de Demande/i, 10000))) throw new Error('le bloc de la demande ne s’est pas affiché');

  let choisies = 0;
  if (o.type === 'comedec') {
    o.etape('Coche naissance pour chaque partie, mariage pour les mariés');
    const lignes = await g.ev(SCRIPT_LIGNES_COMEDEC);
    for (const l of lignes || []) {
      const voulues = demandesComedecIntervenant(l.libelle, o.parties);
      if (!voulues.length) continue;
      await s.cliquerPosition(l.x, l.y);
      await attendre(500);
      const options = await g.ev(SCRIPT_OPTIONS_OUVERTES);
      for (const v of voulues) {
        const opt = (options || []).find((x) => plat(x.libelle) === plat(v));
        if (opt && !opt.coche) { await s.cliquerPosition(opt.x, opt.y); await attendre(300); }
        if (opt) choisies++;
      }
      await g.echap();
      await attendre(300);
    }
    if (!choisies) throw new Error('aucune partie du dossier reconnue parmi les intervenants : rien de coché, rien validé');
  } else {
    const cases = (await g.ev(SCRIPT_INTERRUPTEURS)) || [];
    choisies = cases.filter((c) => c.ligne && c.coche && !/nom de l.intervenant/i.test(c.ligne)).length;
    if (!choisies) throw new Error('aucun acquéreur coché dans la demande de casier : rien validé');
  }

  // Les deux interrupteurs : Création rapide ALLUMÉE, Envoi immédiat ÉTEINT — lus avant, corrigés, RELUS avant « Valider ».
  const lire = async () => {
    const tous = (await g.ev(SCRIPT_INTERRUPTEURS)) || [];
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
  if (!(await g.cliquerTexte('Valider', { exact: true }))) throw new Error('bouton « Valider » introuvable');
  await s.attendreStable(15000);
  const erreurs = (await g.ev(SCRIPT_ERREURS)) || [];
  if (erreurs.length) throw new Error('Authentic a répondu : ' + erreurs.join(' ; ').slice(0, 200));
  return { demandes: choisies };
}

module.exports = {
  CLE_CONNEXION_AUTHENTIC, DOMAINES_AUTHENTIC, ADRESSE_DEFAUT,
  libelleInterdit, assainirConnexionAuthentic, lireConnexionAuthentic, vueConnexionAuthentic, ecrireConnexionAuthentic,
  demandesComedecIntervenant, liensFichesDuTexte, scriptReleve,
  seConnecter, lireDossier, preparerFormalite
};
