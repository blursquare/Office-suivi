// @ts-check
'use strict';
// Plan de situation des parcelles vendues, tiré du site cadastre.gouv.fr (étude 14/10 : « consulter le site du cadastre et sortir un
// plan de situation des parcelles, les surligner en fluo jaune pour les repérer comme si c'était fait à la main sans dépasser » ;
// « A4 portrait » ; « il faut passer par le site du cadastre » ; « il ne faut pas de gros rond et bien voir toutes les parcelles en entier »).
//
// Parcours écrit à l'avance (aucune IA ne décide des clics), dans le navigateur de CLAIRE :
//   recherche par références cadastrales (commune, département, section, numéro) → carte de la parcelle → outils avancés › Imprimer ›
//   « Extrait de plan » (l'outil « Plan de situation » du site entoure la sélection d'un grand cercle : écarté), A4, portrait, échelle,
//   rotation 0°, sans drapeau → clic sur la carte au centre des parcelles (la zone d'impression s'y place) → « Aperçu et édition (PDF) ».
// Le PDF officiel de la DGFiP revient avec l'emprise imprimée (MAPBBOX, envoyée par le site) : le surlignage se pose dessus (surlignage.js).
// NE PART vers le site : la commune, son code postal, le département, la section et le numéro des parcelles — jamais un nom, une adresse ni un
// dossier. Quand le site propose plusieurs communes pour le nom tapé, la bonne est choisie par son nom et son code postal (16/10).

const { versCC, zoneCCDepuisSrs, emprisePoints } = require('./lambert');

const ACCUEIL = 'https://www.cadastre.gouv.fr/scpc/accueil.do';
const DOMAINES_CADASTRE = ['cadastre.gouv.fr'];
// Échelles proposées par l'extrait de plan du site, et la carte imprimée en A4 portrait (mm), relevée sur ses PDF (14/10).
const ECHELLES_EXTRAIT = [200, 500, 650, 1000, 1250, 1500, 2000, 2500, 4000, 5000];
const CADRE_A4_PORTRAIT_MM = { largeur: 195.5, hauteur: 211 };
// Les parcelles occupent au plus cette part du cadre : on les voit en entier, avec leurs voisines et les rues autour.
const OCCUPATION_MAX = 0.6;
const ECHELLE_MIN = 500;

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Pure : l'échelle de l'extrait — la plus grande (plus petit dénominateur) où toutes les parcelles tiennent dans le cadre avec de la
 * marge ; une échelle demandée trop grande est relevée. Rend { echelle, relevee } ou { erreur } si même le 1/5000 ne suffit pas.
 * @param {[number, number, number, number]} emprise en mètres @param {number} [demandee]
 */
function echelleExtrait(emprise, demandee) {
  const largeurM = Math.max(1, emprise[2] - emprise[0]);
  const hauteurM = Math.max(1, emprise[3] - emprise[1]);
  const minimum = Math.max(ECHELLE_MIN,
    (largeurM * 1000) / (OCCUPATION_MAX * CADRE_A4_PORTRAIT_MM.largeur),
    (hauteurM * 1000) / (OCCUPATION_MAX * CADRE_A4_PORTRAIT_MM.hauteur));
  // Tient-elle seulement ? (95 % du cadre : au-delà, une parcelle toucherait le bord.)
  const tient = (e) => (largeurM * 1000) / e <= 0.95 * CADRE_A4_PORTRAIT_MM.largeur && (hauteurM * 1000) / e <= 0.95 * CADRE_A4_PORTRAIT_MM.hauteur;
  const voulue = ECHELLES_EXTRAIT.includes(Number(demandee)) ? Number(demandee) : 0;
  if (voulue && tient(voulue)) return { echelle: voulue, relevee: false };
  const choisie = ECHELLES_EXTRAIT.find((e) => e >= minimum) || ECHELLES_EXTRAIT.find((e) => tient(e));
  if (!choisie || !tient(choisie)) return { erreur: 'Les parcelles sont trop éloignées pour tenir sur une page A4 au 1/5000.' };
  return { echelle: choisie, relevee: !!voulue };
}

/** Pure : l'emprise imprimée lue dans le formulaire envoyé par le site (« MAPBBOX=x1,y1,x2,y2 »). @param {string} corps */
function emprisePlanDepuisEnvoi(corps) {
  const m = /(?:^|&)MAPBBOX=([^&]+)/.exec(String(corps || ''));
  if (!m) return null;
  const v = decodeURIComponent(m[1].replace(/\+/g, ' ')).split(',').map(Number);
  return v.length === 4 && v.every(isFinite) && v[2] > v[0] && v[3] > v[1] ? v : null;
}

/** Pure : département au format du site (« 41 », « 2A », « 974 ») depuis un code INSEE. @param {string} insee */
function departementDepuisInsee(insee) {
  const s = String(insee || '').toUpperCase();
  if (/^97\d/.test(s)) return s.slice(0, 3);
  return s.slice(0, 2);
}

/** Attend que la carte du site soit dessinée. @param {any} s */
async function attendreCarte(s, maxMs = 20000) {
  const fin = Date.now() + maxMs;
  while (Date.now() < fin) {
    const pret = await s.evaluer('!!(window.carte && window.carte.getViewGeoBox && !window.carte.nbReqEnCours)').catch(() => false);
    if (pret) { await attendre(800); return true; }
    await attendre(300);
  }
  return false;
}

// Lisibilité (étude 14/10 : « idem si pas lisible ou trop petite ») : sur le papier, le plus grand côté de chaque parcelle mesure au
// moins 4 mm (12 mm jusqu'au 15/10 : dix parcelles de 17 à 113 m de Blois, sur 415 × 330 m, étaient coupées en trois plans alors qu'un
// seul au 1/4000 convenait — « en dézoomant un peu ») ; sinon elle part sur un plan à elle, plus rapproché. Au 1/500 (l'échelle la
// plus fine retenue) une parcelle plus petite reste sur ce plan : on ne peut pas faire mieux.
const LISIBLE_MM = 4;
const MAX_PLANS = 8;

/**
 * Pure : les plans à tirer (étude 14/10 : « si plusieurs parcelles proches, les mettre sur le même plan ; si trop éloignées faire
 * plusieurs plans ; idem si pas lisible ou trop petite »). Regroupe de proche en proche, à partir de la première parcelle : une
 * parcelle rejoint le plan si toutes y tiennent encore ET restent lisibles. Rend [{ indices, echelle }] ou { erreur }.
 * @param {Array<{ anneaux: Array<Array<[number, number]>> }>} parcellesCC
 */
function groupesPlans(parcellesCC) {
  const infos = parcellesCC.map((p, i) => {
    const e = /** @type {[number, number, number, number]} */ (emprisePoints(p.anneaux));
    return { i, e, taille: Math.max(e[2] - e[0], e[3] - e[1]), c: [(e[0] + e[2]) / 2, (e[1] + e[3]) / 2] };
  });
  const emprise = (g) => /** @type {[number, number, number, number]} */ ([Math.min(...g.map((x) => x.e[0])), Math.min(...g.map((x) => x.e[1])),
    Math.max(...g.map((x) => x.e[2])), Math.max(...g.map((x) => x.e[3]))]);
  const echelleSi = (g) => {
    const choix = echelleExtrait(emprise(g));
    if ('erreur' in choix) return 0;
    const lisible = Math.max(ECHELLE_MIN, (Math.min(...g.map((x) => x.taille)) * 1000) / LISIBLE_MM);
    return choix.echelle <= lisible ? choix.echelle : 0;
  };
  const restants = infos.slice();
  const groupes = [];
  while (restants.length) {
    if (groupes.length >= MAX_PLANS) return { erreur: `Plus de ${MAX_PLANS} plans seraient nécessaires : choisir moins de parcelles.` };
    const g = [/** @type {any} */ (restants.shift())];
    for (;;) {
      const e = emprise(g);
      const centre = [(e[0] + e[2]) / 2, (e[1] + e[3]) / 2];
      const proches = restants.slice().sort((a, b) => Math.hypot(a.c[0] - centre[0], a.c[1] - centre[1]) - Math.hypot(b.c[0] - centre[0], b.c[1] - centre[1]));
      const ajout = proches.find((x) => echelleSi([...g, x]));
      if (!ajout) break;
      g.push(ajout);
      restants.splice(restants.indexOf(ajout), 1);
    }
    const seule = echelleExtrait(emprise(g));
    if ('erreur' in seule) return { erreur: 'Une parcelle est trop grande pour tenir sur une page A4 au 1/5000.' };
    groupes.push({ indices: g.map((x) => x.i), echelle: echelleSi(g) || seule.echelle });
  }
  return groupes;
}

/**
 * Pure : la commune à choisir dans la liste que le site propose quand le nom tapé en désigne plusieurs (essai du 16/10 : « Chaumont-sur-Tharonne »
 * rend « CHAUMONT SUR THARONNE - 41600 », « CHAUMONT SUR LOIRE - 41150 », « SEUR - 41120 »). Même nom (accents, tirets, « ST » / « SAINT »
 * ignorés), puis le code postal s'il en reste plusieurs. Rend la valeur de l'option, ou '' (jamais deviné : une autre commune serait un autre plan).
 * @param {Array<{ value: string, text: string }>} options @param {string} commune @param {string} [codePostal]
 */
function communeDansListeCadastre(options, commune, codePostal) {
  const net = (/** @type {string} */ t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
    .replace(/\bSTE\b/g, 'SAINTE').replace(/\bST\b/g, 'SAINT');
  const voulu = net(commune);
  const cp = /^\d{5}$/.test(String(codePostal || '')) ? String(codePostal) : '';
  const lues = (options || []).filter((o) => o && o.value).map((o) => {
    const m = /^(.*?)\s*-\s*(\d{5})\s*$/.exec(String(o.text || '').trim());
    return { value: String(o.value), nom: net(m ? m[1] : o.text), cp: m ? m[2] : '' };
  });
  let memes = voulu ? lues.filter((o) => o.nom === voulu) : [];
  if (memes.length > 1 && cp) memes = memes.filter((o) => o.cp === cp);
  if (!memes.length && cp && !voulu) memes = lues.filter((o) => o.cp === cp);
  return memes.length === 1 ? memes[0].value : '';
}

/** Ouvre la carte du site sur une parcelle (recherche par références cadastrales). @param {any} s @param {{ commune: string, insee: string, codePostal?: string }} demande
 * @param {{ section: string, numero: string }} p @param {(t: string) => void} etape */
async function ouvrirCarteParcelle(s, demande, p, etape) {
  const dep = departementDepuisInsee(demande.insee);
  const cp = /^\d{5}$/.test(String(demande.codePostal || '')) ? String(demande.codePostal) : '';
  etape('Ouvre cadastre.gouv.fr');
  await s.aller(ACCUEIL);
  const lienRecherche = await s.evaluer(`(() => { const a = document.querySelector('a[href*="afficherRechercherPlanCad"]'); return a ? a.getAttribute('href') : ''; })()`);
  if (!lienRecherche) throw new Error('Le site du cadastre a changé : recherche par références cadastrales introuvable.');
  await s.aller(new URL(lienRecherche, ACCUEIL).href);
  etape(`Cherche la parcelle ${p.section} ${Number(p.numero) || p.numero} à ${demande.commune}${cp ? ` (${cp})` : ''}`);
  // Section, numéro et préfixe (000 par défaut, sinon le site refuse) : reposés aussi au second envoi, après le choix de la commune.
  const parcelleJs = `const rp = [...f.querySelectorAll('input[name=rechercheType]')][0]; if (rp) rp.checked = true;
    if (f.prefixeParcelle && !f.prefixeParcelle.value) f.prefixeParcelle.value = '000';
    f.sectionLibelle.value = ${JSON.stringify(p.section)}; f.numeroParcelle.value = ${JSON.stringify(String(Number(p.numero) || p.numero))};`;
  const rempli = await s.evaluer(`(() => { const f = document.getElementById('rech'); if (!f || !f.ville) return 'formulaire';
    f.ville.value = ${JSON.stringify(String(demande.commune || ''))};
    if (f.codePostal) f.codePostal.value = ${JSON.stringify(cp)};
    const o = [...f.codeDepartement.options].find((x) => x.text.trim().startsWith(${JSON.stringify(dep + ' -')}));
    if (!o) return 'département'; f.codeDepartement.value = o.value;
    ${parcelleJs}
    f.submit(); return ''; })()`);
  if (rempli) throw new Error(`Le site du cadastre a changé : ${rempli} de la recherche introuvable.`);
  await s.attendreStable();
  // Plusieurs communes répondent au nom (le site le fait même pour un nom complet) : la liste « Ville, Commune » est proposée — la bonne
  // est choisie par son nom et son code postal, puis la recherche est relancée.
  const liste = await s.evaluer(`(() => { const sel = document.getElementById('codeCommune'); return sel ? [...sel.options].map((o) => ({ value: o.value, text: o.text })) : null; })()`);
  if (Array.isArray(liste)) {
    const valeur = communeDansListeCadastre(liste, demande.commune, cp);
    if (!valeur) throw new Error(`cadastre.gouv.fr : la commune ${demande.commune}${cp ? ` (${cp})` : ''} n’est pas dans la liste proposée par le site.`);
    etape(`Choisit la commune ${demande.commune}${cp ? ` (${cp})` : ''} dans la liste du site`);
    const choisi = await s.evaluer(`(() => { const f = document.getElementById('rech'); const sel = document.getElementById('codeCommune'); if (!f || !sel) return 'formulaire';
      sel.value = ${JSON.stringify(valeur)}; if (sel.value !== ${JSON.stringify(valeur)}) return 'commune';
      ${parcelleJs}
      f.submit(); return ''; })()`);
    if (choisi) throw new Error(`Le site du cadastre a changé : ${choisi} de la recherche introuvable.`);
    await s.attendreStable();
  }
  const lienCarte = await s.evaluer(`(() => { const a = document.querySelector('a[onclick*="afficherCarteParcelle"]'); return a ? a.getAttribute('onclick') : ''; })()`);
  const m = /'(afficherCarteParcelle[^']+)'/.exec(String(lienCarte || ''));
  if (!m) {
    const page = await s.instantane().catch(() => ({ texte: '' }));
    const motif = /aucun|introuvable|pas de r/i.exec(page.texte || '') ? 'parcelle inconnue du site pour cette commune' : 'plusieurs communes ou aucun résultat';
    throw new Error(`cadastre.gouv.fr : ${motif} (${demande.commune}, ${p.section} ${p.numero}).`);
  }
  etape('Ouvre la carte de la parcelle');
  await s.aller(new URL(m[1], ACCUEIL).href);
  if (!await attendreCarte(s)) throw new Error('La carte du cadastre ne s’est pas affichée.');
  const zone = zoneCCDepuisSrs(await s.evaluer('String(carte.getSRS())'));
  if (!zone) throw new Error('Système de coordonnées du site non reconnu.');
  return zone;
}

/** L'extrait A4 portrait centré sur un groupe de parcelles, la carte du site étant ouverte. Rend { pdf, emprisePlan, centre }.
 * @param {any} s @param {[number, number, number, number]} emprise @param {number} echelle @param {(t: string) => void} etape */
async function extraitSurCarte(s, emprise, echelle, etape) {
  const cx = (emprise[0] + emprise[2]) / 2;
  const cy = (emprise[1] + emprise[3]) / 2;
  // Vue de la carte : la zone imprimée et un peu autour, pour que le clic tombe au bon endroit.
  const demiL = (CADRE_A4_PORTRAIT_MM.largeur * echelle) / 1000 * 0.75;
  const demiH = (CADRE_A4_PORTRAIT_MM.hauteur * echelle) / 1000 * 0.75;
  await s.evaluer(`(() => { const b = carte.getViewGeoBox().clone(); b.minX = ${cx - demiL}; b.maxX = ${cx + demiL}; b.minY = ${cy - demiH}; b.maxY = ${cy + demiH};
    carte.setViewGeoBox(b); carte.reload(); })()`);
  await attendreCarte(s);
  etape(`Prépare l’extrait de plan A4 portrait au 1/${echelle}`);
  if (!await s.evaluer('!!window.myMenu')) throw new Error('Le site du cadastre a changé : menu des outils introuvable.');
  await s.evaluer('myMenu.avance(); myMenu.impression();');
  // Le panneau « Imprimer » se dessine après coup : on attend que l'outil « Extrait de plan » y soit.
  let outil = false;
  for (let i = 0; i < 20 && !outil; i++) {
    await attendre(300);
    outil = await s.evaluer(`(() => { const t = document.getElementById('tool_avances_impressions_extrait'); if (!t) return false; myMenu.activerOutil(t); return true; })()`);
  }
  if (!outil) throw new Error('Le site du cadastre a changé : outil « Extrait de plan » introuvable.');
  await attendre(1500);
  const reglage = await s.evaluer(`(() => {
    const ech = document.querySelector('select[name=scale]'); if (!ech) return 'échelle';
    const o = [...ech.options].find((x) => Number(x.value) === ${echelle} || x.text.replace(/\\s/g, '') === '1/${echelle}');
    if (!o) return 'échelle 1/${echelle}';
    ech.value = o.value; ech.dispatchEvent(new Event('change', { bubbles: true }));
    const rot = document.querySelector('select[name=rotation]'); if (rot) { const z = [...rot.options].find((x) => /^0/.test(x.text.trim())); if (z) { rot.value = z.value; rot.dispatchEvent(new Event('change', { bubbles: true })); } }
    const a4 = [...document.querySelectorAll('input[type=radio]')].find((x) => /A4/.test((x.nextSibling && x.nextSibling.textContent) || '') || x.value === 'A4');
    if (a4 && !a4.checked) a4.click();
    const portrait = document.querySelector('input[type=radio][name=orient][value="1"]'); if (portrait && !portrait.checked) portrait.click();
    const sansDrapeau = document.querySelector('input[type=radio][name=drapeau][value="false"]'); if (sansDrapeau && !sansDrapeau.checked) sansDrapeau.click();
    return ''; })()`);
  if (reglage) throw new Error(`Le site du cadastre a changé : réglage « ${reglage} » introuvable.`);
  await attendre(800);
  etape('Place la zone imprimée sur les parcelles');
  const point = await s.evaluer(`(() => { const p = carte.geoToPixel(${cx}, ${cy}); const c = carte.getContainer(); const r = c.getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y, dedans: p.x >= 0 && p.y >= 0 && p.x <= r.width && p.y <= r.height }; })()`);
  if (!point || !point.dedans) throw new Error('Les parcelles ne sont pas dans la carte affichée par le site.');
  await s.cliquerPosition(point.x, point.y);
  await attendre(1200);
  etape('Demande le PDF au site');
  const avant = s.documents.length;
  const envoisAvant = s.envois.length;
  const clic = await s.evaluer(`(() => { const a = [...document.querySelectorAll('a')].find((x) => /aper.u et .dition/i.test(x.textContent || '') && x.offsetParent);
    if (!a) return false; a.click(); return true; })()`);
  if (!clic) throw new Error('Le site du cadastre a changé : bouton « Aperçu et édition (PDF) » introuvable.');
  const fin = Date.now() + 60000;
  while (Date.now() < fin && !s.documents.slice(avant).some((d) => /pdf/i.test(d.type))) await attendre(400);
  const doc = s.documents.slice(avant).find((d) => /pdf/i.test(d.type));
  if (!doc) throw new Error('Le site du cadastre n’a pas rendu de PDF (service lent ou en panne : réessayer plus tard).');
  const envoi = s.envois.slice(envoisAvant).reverse().find((e) => /MAPBBOX=/.test(e.corps));
  if (s.onglets.length > 1) await s.fermerOngletActif();
  /** @type {[number, number]} */
  const centre = [cx, cy];
  return { pdf: doc.octets, emprisePlan: envoi ? emprisePlanDepuisEnvoi(envoi.corps) : null, centre };
}

/**
 * Les plans (PDF officiels) des parcelles : un par groupe de parcelles proches et lisibles ensemble (groupesPlans).
 * Rend { zone, plans: [{ pdf, emprisePlan, echelle, relevee, centre, parcelles: [{ section, numero, anneaux (CC) }] }] }.
 * @param {any} s SessionNavigation ouverte sur les domaines du cadastre
 * @param {{ commune: string, insee: string, codePostal?: string, parcelles: Array<{ section: string, numero: string, anneaux: Array<Array<[number, number]>>, trous?: Array<Array<[number, number]>> }>, echelle?: number }} demande
 * @param {(texte: string) => void} [etape] ce que CLAIRE fait, pour l'écran
 */
async function planCadastre(s, demande, etape = () => {}) {
  const parcelles = (demande.parcelles || []).filter((p) => p && p.section && p.numero && Array.isArray(p.anneaux) && p.anneaux.length);
  if (!parcelles.length) throw new Error('Aucune parcelle à placer (contours introuvables au cadastre de l’IGN).');
  const zone = await ouvrirCarteParcelle(s, demande, parcelles[0], etape);
  const projeter = (a) => /** @type {Array<[number, number]>} */ (a.map((q) => versCC(q, zone)).filter(Boolean));
  /** @type {Array<{ section: string, numero: string, anneaux: Array<Array<[number, number]>>, trous: Array<Array<[number, number]>> }>} */
  const parcellesCC = parcelles.map((p) => ({ section: p.section, numero: p.numero, anneaux: p.anneaux.map(projeter), trous: (p.trous || []).map(projeter) }));
  const groupes = groupesPlans(parcellesCC);
  if (!Array.isArray(groupes)) throw new Error(groupes.erreur);
  if (groupes.length > 1) etape(`${groupes.length} plans : parcelles trop éloignées ou trop petites pour un seul`);
  const plans = [];
  for (const [n, g] of groupes.entries()) {
    const membres = g.indices.map((i) => parcellesCC[i]);
    if (groupes.length > 1) etape(`Plan ${n + 1}/${groupes.length} : ${membres.map((p) => `${p.section} ${Number(p.numero) || p.numero}`).join(', ')}`);
    // Le premier groupe commence par la parcelle déjà ouverte ; les suivants rouvrent la carte sur leur première parcelle.
    if (n > 0) await ouvrirCarteParcelle(s, demande, membres[0], etape);
    const emprise = /** @type {[number, number, number, number]} */ (emprisePoints(membres.flatMap((p) => p.anneaux)));
    // Une échelle demandée par l'étude est gardée si tout le groupe y tient ; sinon celle du regroupement.
    const voulue = ECHELLES_EXTRAIT.includes(Number(demande.echelle)) ? echelleExtrait(emprise, demande.echelle) : null;
    const echelle = voulue && !('erreur' in voulue) && !voulue.relevee ? voulue.echelle : g.echelle;
    const extrait = await extraitSurCarte(s, emprise, echelle, etape);
    plans.push({ ...extrait, echelle, relevee: !!demande.echelle && echelle !== Number(demande.echelle), parcelles: membres });
  }
  return { zone, plans };
}

module.exports = { planCadastre, groupesPlans, communeDansListeCadastre, echelleExtrait, emprisePlanDepuisEnvoi, departementDepuisInsee, DOMAINES_CADASTRE, ECHELLES_EXTRAIT, CADRE_A4_PORTRAIT_MM, LISIBLE_MM };
