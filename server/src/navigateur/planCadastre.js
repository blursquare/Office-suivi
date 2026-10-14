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
// NE PART vers le site : la commune, le département, la section et le numéro des parcelles — jamais un nom, une adresse ni un dossier.

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

/**
 * Le plan (PDF officiel) des parcelles. Rend { pdf, emprisePlan, echelle, relevee, zone, parcelles: [{ section, numero, anneaux (CC) }] }.
 * @param {any} s SessionNavigation ouverte sur les domaines du cadastre
 * @param {{ commune: string, insee: string, parcelles: Array<{ section: string, numero: string, anneaux: Array<Array<[number, number]>> }>, echelle?: number }} demande
 * @param {(texte: string) => void} [etape] ce que CLAIRE fait, pour l'écran
 */
async function planCadastre(s, demande, etape = () => {}) {
  const parcelles = (demande.parcelles || []).filter((p) => p && p.section && p.numero && Array.isArray(p.anneaux) && p.anneaux.length);
  if (!parcelles.length) throw new Error('Aucune parcelle à placer (contours introuvables au cadastre de l’IGN).');
  const dep = departementDepuisInsee(demande.insee);
  etape('Ouvre cadastre.gouv.fr');
  await s.aller(ACCUEIL);
  const lienRecherche = await s.evaluer(`(() => { const a = document.querySelector('a[href*="afficherRechercherPlanCad"]'); return a ? a.getAttribute('href') : ''; })()`);
  if (!lienRecherche) throw new Error('Le site du cadastre a changé : recherche par références cadastrales introuvable.');
  await s.aller(new URL(lienRecherche, ACCUEIL).href);
  const p0 = parcelles[0];
  etape(`Cherche la parcelle ${p0.section} ${Number(p0.numero) || p0.numero} à ${demande.commune}`);
  const rempli = await s.evaluer(`(() => { const f = document.getElementById('rech'); if (!f || !f.ville) return 'formulaire';
    f.ville.value = ${JSON.stringify(String(demande.commune || ''))};
    const o = [...f.codeDepartement.options].find((x) => x.text.trim().startsWith(${JSON.stringify(dep + ' -')}));
    if (!o) return 'département'; f.codeDepartement.value = o.value;
    const rp = [...f.querySelectorAll('input[name=rechercheType]')][0]; if (rp) rp.checked = true;
    f.sectionLibelle.value = ${JSON.stringify(p0.section)}; f.numeroParcelle.value = ${JSON.stringify(String(Number(p0.numero) || p0.numero))};
    f.submit(); return ''; })()`);
  if (rempli) throw new Error(`Le site du cadastre a changé : ${rempli} de la recherche introuvable.`);
  await s.attendreStable();
  const lienCarte = await s.evaluer(`(() => { const a = document.querySelector('a[onclick*="afficherCarteParcelle"]'); return a ? a.getAttribute('onclick') : ''; })()`);
  const m = /'(afficherCarteParcelle[^']+)'/.exec(String(lienCarte || ''));
  if (!m) {
    const page = await s.instantane().catch(() => ({ texte: '' }));
    const motif = /aucun|introuvable|pas de r/i.exec(page.texte || '') ? 'parcelle inconnue du site pour cette commune' : 'plusieurs communes ou aucun résultat';
    throw new Error(`cadastre.gouv.fr : ${motif} (${demande.commune}, ${p0.section} ${p0.numero}).`);
  }
  etape('Ouvre la carte de la parcelle');
  await s.aller(new URL(m[1], ACCUEIL).href);
  if (!await attendreCarte(s)) throw new Error('La carte du cadastre ne s’est pas affichée.');
  const zone = zoneCCDepuisSrs(await s.evaluer('String(carte.getSRS())'));
  if (!zone) throw new Error('Système de coordonnées du site non reconnu.');
  /** @type {Array<{ section: string, numero: string, anneaux: Array<Array<[number, number]>> }>} */
  const parcellesCC = parcelles.map((p) => ({ section: p.section, numero: p.numero,
    anneaux: p.anneaux.map((a) => /** @type {Array<[number, number]>} */ (a.map((q) => versCC(q, zone)).filter(Boolean))) }));
  const emprise = /** @type {[number, number, number, number]} */ (emprisePoints(parcellesCC.flatMap((p) => p.anneaux)));
  const choix = echelleExtrait(emprise, demande.echelle);
  if ('erreur' in choix) throw new Error(String(choix.erreur));
  const cx = (emprise[0] + emprise[2]) / 2;
  const cy = (emprise[1] + emprise[3]) / 2;
  // Vue de la carte : la zone imprimée et un peu autour, pour que le clic tombe au bon endroit.
  const demiL = (CADRE_A4_PORTRAIT_MM.largeur * choix.echelle) / 1000 * 0.75;
  const demiH = (CADRE_A4_PORTRAIT_MM.hauteur * choix.echelle) / 1000 * 0.75;
  await s.evaluer(`(() => { const b = carte.getViewGeoBox().clone(); b.minX = ${cx - demiL}; b.maxX = ${cx + demiL}; b.minY = ${cy - demiH}; b.maxY = ${cy + demiH};
    carte.setViewGeoBox(b); carte.reload(); })()`);
  await attendreCarte(s);
  etape(`Prépare l’extrait de plan A4 portrait au 1/${choix.echelle}`);
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
    const o = [...ech.options].find((x) => Number(x.value) === ${choix.echelle} || x.text.replace(/\\s/g, '') === '1/${choix.echelle}');
    if (!o) return 'échelle 1/${choix.echelle}';
    ech.value = o.value; ech.dispatchEvent(new Event('change', { bubbles: true }));
    const rot = document.querySelector('select[name=rotation]'); if (rot) { const z = [...rot.options].find((x) => /^0/.test(x.text.trim())); if (z) { rot.value = z.value; rot.dispatchEvent(new Event('change', { bubbles: true })); } }
    const radio = (nom, texte) => { const r = [...document.querySelectorAll('input[type=radio][name="' + nom + '"]')]
      .find((x) => (x.parentElement ? x.parentElement.innerText : '').includes(texte) || (x.nextSibling && String(x.nextSibling.textContent || '').includes(texte)));
      if (r && !r.checked) r.click(); return !!r; };
    const a4 = [...document.querySelectorAll('input[type=radio]')].find((x) => /A4/.test((x.nextSibling && x.nextSibling.textContent) || '') || x.value === 'A4');
    if (a4 && !a4.checked) a4.click();
    const portrait = document.querySelector('input[type=radio][name=orient][value="1"]'); if (portrait && !portrait.checked) portrait.click();
    const sansDrapeau = document.querySelector('input[type=radio][name=drapeau][value="false"]'); if (sansDrapeau && !sansDrapeau.checked) sansDrapeau.click();
    radio('format', 'A4');
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
  const emprisePlan = envoi ? emprisePlanDepuisEnvoi(envoi.corps) : null;
  if (s.onglets.length > 1) await s.fermerOngletActif();
  /** @type {[number, number]} */
  const centre = [cx, cy];
  return { pdf: doc.octets, emprisePlan, echelle: choix.echelle, relevee: choix.relevee, zone, centre, parcelles: parcellesCC };
}

module.exports = { planCadastre, echelleExtrait, emprisePlanDepuisEnvoi, departementDepuisInsee, DOMAINES_CADASTRE, ECHELLES_EXTRAIT, CADRE_A4_PORTRAIT_MM };
