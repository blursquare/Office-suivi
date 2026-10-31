// Carte du Contrôle de l'urbanisme (étude 31/10 : « reproduire Géofoncier dans CLAIRE — la carte interactive pour voir les parcelles et
// leurs numéros, calculer des surfaces avec un outil pour dessiner et mesurer, fonds IGN ou photo aérienne, plan du cadastre, DVF pour
// voir les ventes, le service des numéros (adresse.data.gouv.fr), alignement, PC, PLU. L'outil ultime du contrôle de l'urbanisme, simple
// à utiliser et épuré : pas trop d'information, juste l'essentiel, mais professionnel »).
//
// Écran d'analyse (dernière étape de l'outil) : la carte à gauche, les informations dans une barre à droite (onglets Contrôle, Parcelle,
// Ventes, Travaux, Plans). Leaflet 1.9.4 est embarqué dans CLAIRE (vendor/leaflet, chargé à la première carte) ; tout ce que la carte
// lit passe par le SERVEUR du bureau (server/src/carteUrbanisme.js) : tuiles de l'IGN, parcelle et zone sous un clic, numéro de voie de
// la Base adresse nationale, servitude d'alignement, ventes DVF. Ne partent que des coordonnées, un code INSEE et une section.
// Les DMPC et le nom du géomètre-expert sont sur Géofoncier (données des géomètres, non ouvertes) : un lien l'ouvre centré sur la parcelle.

var carteUrb = { map: null, fond: 'plan', couches: { cadastre: true, plu: false, ventes: false }, calques: {}, cleDossier: '', ajustee: '',
  selection: null, lectureClic: 0, mesure: null, ventes: {}, filtreVentes: 'tout', venteChoisie: '', voirVentes: 30, onglet: 'controle', pluCle: '', pluLecture: 0 };

var ONGLETS_COTE_CARTE = [
  { cle: 'controle', libelle: 'Contrôle' }, { cle: 'parcelle', libelle: 'Parcelle' }, { cle: 'ventes', libelle: 'Ventes' },
  { cle: 'travaux', libelle: 'Travaux' }, { cle: 'plans', libelle: 'Plans' }
];

// ===== Calculs purs (testés) =====

var RAYON_TERRE_M = 6378137;

// Pure : surface d'un polygone sur la sphère (m²), points [[lat, lon], …] — même formule que Leaflet.draw (excès sphérique).
function aireGeodesiqueM2(points) {
  const p = (points || []).filter(x => Array.isArray(x) && Number.isFinite(x[0]) && Number.isFinite(x[1]));
  if (p.length < 3) return 0;
  const rad = Math.PI / 180;
  let aire = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i]; const b = p[(i + 1) % p.length];
    aire += (b[1] - a[1]) * rad * (2 + Math.sin(a[0] * rad) + Math.sin(b[0] * rad));
  }
  return Math.abs(aire * RAYON_TERRE_M * RAYON_TERRE_M / 2);
}

// Pure : distance entre deux points [lat, lon] (m), formule de haversine.
function distanceGeodesiqueM(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad; const dLon = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * RAYON_TERRE_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Pure : longueur d'une ligne (m) ; `fermee` ajoute le retour au premier point (périmètre).
function longueurLigneM(points, fermee) {
  const p = points || [];
  let l = 0;
  for (let i = 1; i < p.length; i++) l += distanceGeodesiqueM(p[i - 1], p[i]);
  if (fermee && p.length > 2) l += distanceGeodesiqueM(p[p.length - 1], p[0]);
  return l;
}

// Pure : contenance cadastrale « 2 ha 01 a 85 ca » (m² arrondis) ; sous l'hectare « 12 a 34 ca », sous l'are « 85 ca ».
function contenanceCadastrale(m2) {
  const n = Math.round(Number(m2) || 0);
  if (n <= 0) return '—';
  const ha = Math.floor(n / 10000); const a = Math.floor((n % 10000) / 100); const ca = n % 100;
  const deux = (x) => String(x).padStart(2, '0');
  if (ha) return `${ha} ha ${deux(a)} a ${deux(ca)} ca`;
  if (a) return `${a} a ${deux(ca)} ca`;
  return `${ca} ca`;
}

// Pure : « 1 234 m² » / « 1,25 km » — nombres à la française.
function surfaceLisible(m2) { return `${Math.round(Number(m2) || 0).toLocaleString('fr-FR')} m²`; }
function longueurLisible(m) {
  const n = Number(m) || 0;
  return n >= 1000 ? `${(n / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} km` : `${n.toLocaleString('fr-FR', { maximumFractionDigits: n < 10 ? 1 : 0 })} m`;
}

// Pure : couleur d'une zone du PLU par son type (U rouge, AU orange, A jaune, N vert — l'usage des plans de zonage).
function couleurZonePlu(typezone) {
  const t = String(typezone || '').toUpperCase();
  if (/^AU/.test(t)) return 'cat-orange';
  if (/^U/.test(t)) return 'cat-rouge';
  if (/^A/.test(t)) return 'cat-jaune';
  if (/^N/.test(t)) return 'cat-vert';
  return 'cat-gris';
}

// Pure : lien vers Géofoncier centré sur un point (même forme que le site : #zoom/lat/lon) — DMPC et géomètre-expert y sont.
function lienGeofoncier(lat, lon, zoom) {
  const z = Math.max(5, Math.min(20, Number(zoom) || 18));
  return `https://public.geofoncier.fr/#${z}/${Number(lat).toFixed(6)}/${Number(lon).toFixed(6)}`;
}

// Pure : les sections cadastrales distinctes d'une liste de parcelles (« AB 12, AB 13, C 4 » → ['AB', 'C']).
function sectionsDesParcellesCarte(texte) {
  return [...new Set(parcellesDepuisTexte(texte).map(p => p.section))].slice(0, 6);
}

// Pure : les ventes à montrer — filtre (tout / bâti / terrain), les plus récentes d'abord, sans doublon entre sections.
function ventesFiltreesCarte(listes, filtre) {
  const vus = new Set();
  const toutes = [];
  for (const l of listes || []) for (const v of (l || [])) { if (v && !vus.has(v.id)) { vus.add(v.id); toutes.push(v); } }
  const bati = (v) => (v.locaux || []).some(x => x.type && x.type !== 'Dépendance');
  return toutes.filter(v => filtre === 'bati' ? bati(v) : filtre === 'terrain' ? !bati(v) : true)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

// Pure : le résumé d'une vente sur une ligne (« Maison 95 m² · 4 p. · terrain 8 a 20 ca »).
function resumeVenteCarte(v) {
  const locaux = (v.locaux || []).filter(x => x.type !== 'Dépendance').map(x => [x.type, x.surface ? `${x.surface} m²` : '', x.pieces ? `${x.pieces} p.` : ''].filter(Boolean).join(' '));
  const parts = locaux.length ? locaux : ['Terrain'];
  if (v.surfaceTerrain) parts.push(`terrain ${contenanceCadastrale(v.surfaceTerrain)}`);
  if ((v.locaux || []).some(x => x.type === 'Dépendance')) parts.push('dépendance');
  return parts.join(' · ');
}

// ===== Leaflet, chargé à la première carte =====

var promesseLeafletCarte = null;
function chargerLeafletCarte() {
  if (typeof window !== 'undefined' && window.L) return Promise.resolve(window.L);
  if (promesseLeafletCarte) return promesseLeafletCarte;
  promesseLeafletCarte = new Promise((ok, ko) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'vendor/leaflet/leaflet.css';
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = 'vendor/leaflet/leaflet.js';
    s.onload = () => ok(window.L);
    s.onerror = () => { promesseLeafletCarte = null; ko(new Error('Leaflet introuvable')); };
    document.head.appendChild(s);
  });
  return promesseLeafletCarte;
}

function couleurJetonCarte(nom) {
  try { return getComputedStyle(document.documentElement).getPropertyValue('--' + nom).trim() || '#888'; } catch (e) { return '#888'; }
}

function cleDossierCarte() { return prEtat ? `${prEtat.insee || ''}|${prEtat.parcelles || ''}` : ''; }

// Appelée à chaque affichage de l'écran d'analyse (client/152) : crée la carte une fois, redessine le dossier s'il a changé.
function majCarteUrbanisme() {
  const zone = document.getElementById('pr-carte');
  if (!zone || !prEtat || pageCourantePreemption(prEtat) !== 'rendu') return;
  renderOngletsCoteCarte();
  renderBarreCarte();
  renderParcelleCarte();
  renderVentesCarte();
  chargerLeafletCarte().then((L) => {
    if (!carteUrb.map || carteUrb.map.getContainer() !== zone) creerCarteUrbanisme(L, zone);
    else carteUrb.map.invalidateSize();
    dessinerDossierCarte(L);
    chargerVentesDossierCarte();
  }).catch(() => {
    zone.innerHTML = '<div class="pr-carte-vide">La carte n’a pas pu être chargée.</div>';
  });
}

function creerCarteUrbanisme(L, zone) {
  if (carteUrb.map) { try { carteUrb.map.remove(); } catch (e) { /* ancienne carte */ } }
  zone.innerHTML = '';
  const map = L.map(zone, { zoomControl: false, attributionControl: true, maxZoom: 21, minZoom: 5, zoomSnap: 0.5, center: [47.59, 1.33], zoom: 13 });
  L.control.zoom({ position: 'bottomright', zoomInTitle: 'Rapprocher', zoomOutTitle: 'Éloigner' }).addTo(map);
  L.control.scale({ position: 'bottomleft', imperial: false }).addTo(map);
  map.attributionControl.setPrefix(false);
  const tuiles = (couche, natif, options) => L.tileLayer(`/api/urbanisme/tuile/${couche}/{z}/{x}/{y}`, Object.assign({ maxZoom: 21, maxNativeZoom: natif, attribution: 'IGN · Géoplateforme' }, options || {}));
  carteUrb.calques = {
    plan: tuiles('plan', 19),
    photo: tuiles('photo', 19),
    cadastre: tuiles('cadastre', 19, { minZoom: 13, attribution: 'Cadastre · DGFiP' }),
    plu: L.layerGroup(), ventes: L.layerGroup(), dossier: L.layerGroup(), selection: L.layerGroup(), mesure: L.layerGroup()
  };
  carteUrb.map = map;
  carteUrb.ajustee = '';
  carteUrb.cleDossier = '';
  appliquerCouchesCarte();
  carteUrb.calques.dossier.addTo(map);
  carteUrb.calques.selection.addTo(map);
  carteUrb.calques.mesure.addTo(map);
  map.on('click', (ev) => clicCarteUrbanisme(ev.latlng));
  map.on('dblclick', (ev) => { if (carteUrb.mesure) { L.DomEvent.stop(ev); terminerMesureCarte(); } });
  map.on('mousemove', (ev) => survolMesureCarte(ev.latlng));
  map.on('moveend', () => majZonesPluCarte());
  // La carte occupe sa place une fois la page affichée (une carte créée cachée calcule une taille nulle).
  setTimeout(() => map.invalidateSize(), 60);
}

function appliquerCouchesCarte() {
  const map = carteUrb.map;
  if (!map) return;
  const c = carteUrb.calques;
  [c.plan, c.photo].forEach(l => map.removeLayer(l));
  (carteUrb.fond === 'photo' ? c.photo : c.plan).addTo(map).bringToBack();
  for (const nom of ['cadastre', 'plu', 'ventes']) {
    if (carteUrb.couches[nom]) { if (!map.hasLayer(c[nom])) c[nom].addTo(map); } else map.removeLayer(c[nom]);
  }
  if (carteUrb.couches.plu) majZonesPluCarte();
}

// Les parcelles du dossier, surlignées, avec leur numéro ; la carte s'y cadre une fois par dossier.
function dessinerDossierCarte(L) {
  const cle = cleDossierCarte();
  const vue = prEtat && prEtat.historique && prEtat.historique.vue;
  const cleVue = cle + (vue ? '|vue' : '');
  if (carteUrb.cleDossier === cleVue) return;
  if (carteUrb.cleDossier.split('|').slice(0, 2).join('|') !== cle) { carteUrb.selection = null; carteUrb.calques.selection.clearLayers(); renderParcelleCarte(); }
  carteUrb.cleDossier = cleVue;
  const groupe = carteUrb.calques.dossier;
  groupe.clearLayers();
  if (!vue || !Array.isArray(vue.contours) || !vue.contours.length) {
    if (prEtat && prEtat.insee && prEtat.parcelles && typeof lancerHistoriqueParcellePreemption === 'function') lancerHistoriqueParcellePreemption();
    etatCarte(prEtat && prEtat.historique && prEtat.historique.erreur ? prEtat.historique.erreur : (prEtat && prEtat.parcelles ? 'Parcelles du dossier : lecture…' : 'Aucune parcelle connue : cliquez sur la carte pour en lire une.'));
    return;
  }
  const accent = couleurJetonCarte('focus');
  const anneaux = vue.contours.map(a => a.map(p => [p[1], p[0]]));
  L.polygon(anneaux, { color: accent, weight: 3, fillColor: accent, fillOpacity: 0.18, interactive: false }).addTo(groupe);
  (vue.etiquettes || []).filter(e => e.dossier).forEach(e => {
    L.tooltip({ permanent: true, direction: 'center', className: 'pr-carte-num', interactive: false }).setLatLng([e.y, e.x]).setContent(escapeHtml(String(e.texte || '').replace(/^0(?=[A-Z])/, ''))).addTo(groupe);
  });
  if (carteUrb.ajustee !== cle) {
    carteUrb.ajustee = cle;
    carteUrb.map.fitBounds(L.latLngBounds(anneaux.flat()), { padding: [60, 60], maxZoom: 18 });
  }
  etatCarte('');
}

function recentrerCarteDossier() {
  const L = window.L;
  const vue = prEtat && prEtat.historique && prEtat.historique.vue;
  if (!L || !carteUrb.map || !vue || !vue.contours || !vue.contours.length) return;
  carteUrb.map.fitBounds(L.latLngBounds(vue.contours.flat().map(p => [p[1], p[0]])), { padding: [60, 60], maxZoom: 18 });
}

function etatCarte(texte) {
  const z = document.getElementById('pr-carte-etat');
  if (z) { z.textContent = texte || ''; z.style.display = texte ? '' : 'none'; }
}

// ===== Barre de la carte : fond, calques, outils =====

function renderBarreCarte() {
  const barre = document.getElementById('pr-carte-barre');
  const outils = document.getElementById('pr-carte-outils');
  if (!barre || !outils) return;
  const bascule = (actif, texte, appel, titre) => `<wa-button appearance="outlined" size="s" class="vue-bascule-btn${actif ? ' actif' : ''}" type="button" title="${escapeAttr(titre || texte)}" onclick="${appel}">${texte}</wa-button>`;
  barre.innerHTML = `<wa-button-group label="Fond de carte">
      ${bascule(carteUrb.fond === 'plan', 'Plan IGN', "choisirFondCarte('plan')")}${bascule(carteUrb.fond === 'photo', 'Photo aérienne', "choisirFondCarte('photo')")}
    </wa-button-group>
    <wa-button-group label="Calques">
      ${bascule(carteUrb.couches.cadastre, 'Cadastre', "basculerCoucheCarte('cadastre')", 'Parcelles et numéros du cadastre')}${bascule(carteUrb.couches.plu, 'PLU', "basculerCoucheCarte('plu')", 'Zones du document d’urbanisme (Géoportail de l’urbanisme)')}${bascule(carteUrb.couches.ventes, 'Ventes', "basculerCoucheCarte('ventes')", 'Ventes publiées (DVF) des sections du dossier')}
    </wa-button-group>`;
  const outil = (nom, ic, titre, appel, actif) => `<wa-button appearance="outlined" size="s" class="bouton-icone pr-carte-outil${actif ? ' actif' : ''}" type="button" title="${escapeAttr(titre)}" aria-label="${escapeAttr(titre)}" onclick="${appel}">${icone(ic)}</wa-button>`;
  const m = carteUrb.mesure;
  outils.innerHTML = outil('surface', 'mesure-surface', 'Mesurer une surface', "commencerMesureCarte('surface')", m && m.mode === 'surface')
    + outil('distance', 'regle', 'Mesurer une distance', "commencerMesureCarte('distance')", m && m.mode === 'distance')
    + outil('recentrer', 'viser', 'Revenir sur les parcelles du dossier', 'recentrerCarteDossier()')
    + outil('geofoncier', 'lien-externe', 'Ouvrir ce lieu sur Géofoncier (DMPC, géomètre-expert)', 'ouvrirGeofoncierCarte()');
}

function choisirFondCarte(fond) {
  carteUrb.fond = fond === 'photo' ? 'photo' : 'plan';
  appliquerCouchesCarte();
  renderBarreCarte();
}

function basculerCoucheCarte(nom) {
  if (!(nom in carteUrb.couches)) return;
  carteUrb.couches[nom] = !carteUrb.couches[nom];
  if (nom === 'ventes' && carteUrb.couches.ventes) chargerVentesDossierCarte();
  appliquerCouchesCarte();
  renderBarreCarte();
  if (nom === 'ventes') dessinerVentesCarte();
}

function ouvrirGeofoncierCarte() {
  const s = carteUrb.selection && carteUrb.selection.point;
  const c = carteUrb.map ? carteUrb.map.getCenter() : null;
  const lat = s ? s.lat : c && c.lat; const lon = s ? s.lon : c && c.lng;
  if (lat == null) return;
  window.open(lienGeofoncier(lat, lon, carteUrb.map ? Math.round(carteUrb.map.getZoom()) : 18), '_blank', 'noopener');
}

// ===== Zones du PLU de l'emprise affichée =====

function majZonesPluCarte() {
  const map = carteUrb.map; const L = window.L;
  if (!map || !L || !carteUrb.couches.plu) return;
  const b = map.getBounds();
  const r = (x) => Math.round(x * 1000) / 1000;
  // Une emprise un peu plus large que l'écran, arrondie : un petit déplacement ne relit rien.
  const o = r(b.getWest() - 0.002); const s = r(b.getSouth() - 0.002); const e = r(b.getEast() + 0.002); const n = r(b.getNorth() + 0.002);
  if (e - o > 0.03 || n - s > 0.02) { etatCarte('Rapprochez-vous pour voir les zones du PLU.'); return; }
  const cle = [o, s, e, n].join(',');
  if (cle === carteUrb.pluCle) return;
  carteUrb.pluCle = cle;
  const tour = ++carteUrb.pluLecture;
  etatCarte('Zones du PLU : lecture…');
  fetchAvecAuth(`/api/urbanisme/zones?emprise=${encodeURIComponent(cle)}`).then(async rep => {
    const j = await rep.json().catch(() => ({}));
    if (tour !== carteUrb.pluLecture) return;
    const groupe = carteUrb.calques.plu;
    groupe.clearLayers();
    if (!rep.ok) { carteUrb.pluCle = ''; etatCarte(j.erreur || 'Zones du PLU non lues.'); return; }
    const feats = Array.isArray(j.features) ? j.features : [];
    if (!feats.length) { etatCarte('Aucune zone de PLU publiée ici (règlement national d’urbanisme ou carte communale ?).'); return; }
    L.geoJSON({ type: 'FeatureCollection', features: feats }, {
      interactive: false,
      style: (f) => { const c = couleurJetonCarte(couleurZonePlu(f.properties.typezone)); return { color: c, weight: 1.5, fillColor: c, fillOpacity: 0.16 }; },
      onEachFeature: (f, couche) => { if (f.properties.libelle) couche.bindTooltip(escapeHtml(f.properties.libelle), { permanent: true, direction: 'center', className: 'pr-carte-zone' }); }
    }).addTo(groupe);
    etatCarte('');
  }).catch(() => { if (tour === carteUrb.pluLecture) { carteUrb.pluCle = ''; etatCarte('Géoportail de l’urbanisme injoignable.'); } });
}

// ===== Clic sur la carte : la parcelle =====

function clicCarteUrbanisme(latlng) {
  if (carteUrb.mesure) { ajouterPointMesureCarte(latlng); return; }
  interrogerPointCarte(latlng.lat, latlng.lng);
}

function interrogerPointCarte(lat, lon) {
  const tour = ++carteUrb.lectureClic;
  carteUrb.selection = { lecture: true, point: { lat, lon } };
  choisirOngletCoteCarte('parcelle');
  return fetchAvecAuth(`/api/urbanisme/point?lon=${encodeURIComponent(lon)}&lat=${encodeURIComponent(lat)}`).then(async rep => {
    const j = await rep.json().catch(() => ({}));
    if (tour !== carteUrb.lectureClic) return null;
    carteUrb.selection = rep.ok ? j : { erreur: j.erreur || 'Lecture impossible.', point: { lat, lon } };
    dessinerSelectionCarte();
    renderParcelleCarte();
    const p = carteUrb.selection.parcelle;
    if (p && p.insee && p.section) chargerVentesSectionCarte(p.insee, p.section);
    return carteUrb.selection;
  }).catch(() => {
    if (tour !== carteUrb.lectureClic) return null;
    carteUrb.selection = { erreur: 'Serveur injoignable.', point: { lat, lon } };
    renderParcelleCarte();
    return null;
  });
}

function dessinerSelectionCarte() {
  const L = window.L;
  const groupe = carteUrb.calques.selection;
  if (!L || !groupe) return;
  groupe.clearLayers();
  const p = carteUrb.selection && carteUrb.selection.parcelle;
  if (p && p.geometry) L.geoJSON(p.geometry, { interactive: false, style: { color: couleurJetonCarte('cat-jaune'), weight: 3, fillOpacity: 0.25, fillColor: couleurJetonCarte('cat-jaune') } }).addTo(groupe);
}

function renderParcelleCarte() {
  const z = document.getElementById('pr-carte-parcelle');
  if (!z) return;
  const s = carteUrb.selection;
  if (!s) { z.innerHTML = `<div class="pr-cote-vide">${icone('map-pin')}<span>Cliquez sur une parcelle de la carte pour lire son numéro, sa contenance, sa zone, son adresse et ses ventes.</span></div>`; return; }
  if (s.lecture) { z.innerHTML = `<p class="hint">${icone('spinner')} Lecture de la parcelle…</p>`; return; }
  if (s.erreur) { z.innerHTML = `<p class="pr-erreur">${icone('alert-triangle')} ${escapeHtml(s.erreur)}</p>`; return; }
  const p = s.parcelle;
  const ligne = (titre, valeur, detail) => `<div class="pr-fiche-ligne"><span class="pr-fiche-titre">${escapeHtml(titre)}</span><span class="pr-fiche-valeur">${valeur}${detail ? `<span class="pr-fiche-detail">${detail}</span>` : ''}</span></div>`;
  const zone = s.zone ? `<span class="pr-zone-pastille" style="--zone:var(--${couleurZonePlu(s.zone.typezone)})">${escapeHtml(s.zone.libelle || s.zone.typezone)}</span>`
    : s.zoneLue ? 'Aucun PLU publié' : 'Non lue';
  const zoneDetail = s.zone ? escapeHtml(s.zone.libelong || '') : s.zoneLue ? 'Règlement national d’urbanisme ou carte communale : à vérifier en mairie.' : '';
  const adresse = s.adresse ? escapeHtml(s.adresse.libelle) : s.adresseLue ? 'Aucun numéro trouvé à proximité' : 'Non lue';
  const adresseDetail = s.adresse && s.adresse.distance != null ? `Base adresse nationale · à ${escapeHtml(longueurLisible(s.adresse.distance))} du point cliqué` : '';
  const alignement = s.alignement == null ? 'Non lu' : s.alignement.length ? escapeHtml(s.alignement.map(a => a.nom).join(' · ')) : 'Aucun plan d’alignement publié';
  const alignementDetail = s.alignement && s.alignement.length ? 'Servitude EL7 : demander le certificat d’alignement à la commune.' : s.alignement ? 'Seules les communes qui ont versé leurs servitudes au Géoportail y figurent.' : '';
  const ventesParcelle = p ? ventesFiltreesCarte(Object.values(carteUrb.ventes).map(x => x.ventes), 'tout').filter(v => (v.parcelles || []).includes(p.idu)) : [];
  z.innerHTML = p ? `<div class="pr-fiche-tete">
        <span class="pr-fiche-num">${escapeHtml(p.section)} ${escapeHtml(p.numero)}</span>
        <span class="pr-fiche-commune">${escapeHtml(p.commune)}</span>
      </div>
      ${ligne('Contenance', escapeHtml(contenanceCadastrale(p.contenance)), p.contenance ? escapeHtml(surfaceLisible(p.contenance)) : '')}
      ${ligne('Zone du PLU', zone, zoneDetail)}
      ${ligne('Adresse', adresse, adresseDetail)}
      ${ligne('Alignement', alignement, alignementDetail)}
      ${ligne('Ventes (DVF)', ventesParcelle.length ? `${ventesParcelle.length} vente${ventesParcelle.length > 1 ? 's' : ''}` : 'Aucune vente publiée', ventesParcelle[0] ? `Dernière : ${escapeHtml(formatDateFr(ventesParcelle[0].date))} · ${escapeHtml(ventesParcelle[0].prix ? formaterMontantEuros(ventesParcelle[0].prix) : 'prix non publié')}` : '')}
      <div class="pr-fiche-actions">
        <wa-button appearance="outlined" size="s" type="button" onclick="ouvrirGeofoncierCarte()">${icone('lien-externe')} DMPC et géomètre sur Géofoncier</wa-button>
      </div>
      <p class="hint">Identifiant cadastral ${escapeHtml(p.idu)}</p>`
    : `<p class="hint">Aucune parcelle à cet endroit (voie, cours d’eau ou domaine public).</p>${ligne('Adresse', adresse, adresseDetail)}${ligne('Zone du PLU', zone, zoneDetail)}`;
}

// ===== Ventes DVF =====

function chargerVentesDossierCarte() {
  if (!prEtat || !prEtat.insee) return;
  sectionsDesParcellesCarte(prEtat.parcelles).forEach(s => chargerVentesSectionCarte(prEtat.insee, s));
}

function chargerVentesSectionCarte(insee, section) {
  const cle = `${insee}:${section}`;
  if (carteUrb.ventes[cle]) return;
  carteUrb.ventes[cle] = { lecture: true, ventes: [] };
  renderVentesCarte();
  fetchAvecAuth(`/api/urbanisme/dvf?insee=${encodeURIComponent(insee)}&section=${encodeURIComponent(section)}`).then(async rep => {
    const j = await rep.json().catch(() => ({}));
    carteUrb.ventes[cle] = rep.ok ? { ventes: Array.isArray(j.ventes) ? j.ventes : [], section } : { erreur: j.erreur || 'Ventes non lues.', ventes: [], section };
    renderVentesCarte();
    renderParcelleCarte();
    dessinerVentesCarte();
  }).catch(() => { carteUrb.ventes[cle] = { erreur: 'Ventes non lues.', ventes: [], section }; renderVentesCarte(); });
}

function dessinerVentesCarte() {
  const L = window.L;
  const groupe = carteUrb.calques.ventes;
  if (!L || !groupe) return;
  groupe.clearLayers();
  if (!carteUrb.couches.ventes) return;
  const bati = couleurJetonCarte('cat-bleu'); const terrain = couleurJetonCarte('cat-gris');
  ventesFiltreesCarte(Object.values(carteUrb.ventes).map(x => x.ventes), carteUrb.filtreVentes).forEach(v => {
    if (!v.lat || !v.lon) return;
    const estBati = (v.locaux || []).some(x => x.type !== 'Dépendance');
    L.circleMarker([v.lat, v.lon], { radius: v.id === carteUrb.venteChoisie ? 9 : 6, color: couleurJetonCarte('blanc-fixe'), weight: 2, fillColor: estBati ? bati : terrain, fillOpacity: 0.95 })
      .bindTooltip(`${escapeHtml(formatDateFr(v.date))} · ${escapeHtml(v.prix ? formaterMontantEuros(v.prix) : 'prix non publié')}`, { direction: 'top' })
      .on('click', (ev) => { window.L.DomEvent.stop(ev); choisirVenteCarte(v.id); })
      .addTo(groupe);
  });
}

function renderVentesCarte() {
  const z = document.getElementById('pr-carte-ventes');
  if (!z) return;
  const etats = Object.values(carteUrb.ventes);
  if (!etats.length) { z.innerHTML = '<p class="hint">Les ventes publiées (DVF) des sections du dossier s’affichent ici.</p>'; return; }
  const enLecture = etats.some(x => x.lecture);
  const erreurs = etats.filter(x => x.erreur);
  const liste = ventesFiltreesCarte(etats.map(x => x.ventes), carteUrb.filtreVentes);
  const sections = [...new Set(etats.map(x => x.section).filter(Boolean))];
  const filtre = (cle, texte) => `<wa-button appearance="outlined" size="s" class="vue-bascule-btn${carteUrb.filtreVentes === cle ? ' actif' : ''}" type="button" onclick="filtrerVentesCarte('${cle}')">${texte}</wa-button>`;
  const ligne = (v) => `<button type="button" class="pr-vente${v.id === carteUrb.venteChoisie ? ' actif' : ''}" onclick="choisirVenteCarte('${escapeOnclickArg(v.id)}')">
      <span class="pr-vente-haut"><span class="pr-vente-prix">${escapeHtml(v.prix ? formaterMontantEuros(v.prix) : 'Prix non publié')}</span><span class="pr-vente-date">${escapeHtml(formatDateFr(v.date))}</span></span>
      <span class="pr-vente-quoi">${escapeHtml(resumeVenteCarte(v))}</span>
      <span class="pr-vente-bas">${escapeHtml(v.adresse || '')}${v.prixM2 ? `<span class="pr-vente-m2">${escapeHtml(v.prixM2.toLocaleString('fr-FR'))} €/m²</span>` : ''}</span>
    </button>`;
  z.innerHTML = `<div class="pr-ventes-tete">
      <span class="pr-cote-sous">${sections.length ? `Section${sections.length > 1 ? 's' : ''} ${escapeHtml(sections.join(', '))}` : ''} · ${liste.length} vente${liste.length > 1 ? 's' : ''}${enLecture ? ' · lecture…' : ''}</span>
      <wa-button-group label="Filtrer les ventes">${filtre('tout', 'Toutes')}${filtre('bati', 'Bâti')}${filtre('terrain', 'Terrain')}</wa-button-group>
    </div>
    ${erreurs.length ? `<p class="pr-erreur">${icone('alert-triangle')} ${escapeHtml(erreurs[0].erreur)}</p>` : ''}
    <div class="pr-ventes">${liste.slice(0, carteUrb.voirVentes).map(ligne).join('') || (enLecture ? '' : '<p class="hint">Aucune vente publiée.</p>')}</div>
    ${liste.length > carteUrb.voirVentes ? `<wa-button appearance="plain" size="s" class="bouton-discret" type="button" onclick="carteUrb.voirVentes += 30; renderVentesCarte()">Voir ${Math.min(30, liste.length - carteUrb.voirVentes)} de plus</wa-button>` : ''}
    <p class="hint">Demandes de valeurs foncières (DGFiP, publiées par Etalab) : cinq dernières années, sans nom.</p>`;
}

function filtrerVentesCarte(filtre) {
  carteUrb.filtreVentes = ['bati', 'terrain'].includes(filtre) ? filtre : 'tout';
  carteUrb.voirVentes = 30;
  renderVentesCarte();
  dessinerVentesCarte();
}

function choisirVenteCarte(id) {
  carteUrb.venteChoisie = String(id || '');
  const v = ventesFiltreesCarte(Object.values(carteUrb.ventes).map(x => x.ventes), 'tout').find(x => x.id === carteUrb.venteChoisie);
  if (!carteUrb.couches.ventes) { carteUrb.couches.ventes = true; appliquerCouchesCarte(); renderBarreCarte(); }
  choisirOngletCoteCarte('ventes');
  dessinerVentesCarte();
  if (v && v.lat && carteUrb.map) carteUrb.map.setView([v.lat, v.lon], Math.max(carteUrb.map.getZoom(), 17));
}

// ===== Mesures (surface, distance) =====

function commencerMesureCarte(mode) {
  if (carteUrb.mesure && carteUrb.mesure.mode === mode) { effacerMesureCarte(); return; }
  carteUrb.mesure = { mode: mode === 'distance' ? 'distance' : 'surface', points: [], fini: false };
  if (carteUrb.map) { carteUrb.map.doubleClickZoom.disable(); carteUrb.map.getContainer().classList.add('pr-carte-mesure-en-cours'); }
  dessinerMesureCarte();
  renderBarreCarte();
}

function ajouterPointMesureCarte(latlng) {
  const m = carteUrb.mesure;
  if (!m) return;
  if (m.fini) { m.points = []; m.fini = false; }
  m.points.push([latlng.lat, latlng.lng]);
  dessinerMesureCarte();
}

function survolMesureCarte(latlng) {
  const m = carteUrb.mesure;
  if (!m || m.fini || !m.points.length) return;
  m.survol = [latlng.lat, latlng.lng];
  dessinerMesureCarte();
}

function terminerMesureCarte() {
  const m = carteUrb.mesure;
  if (!m) return;
  m.fini = true;
  m.survol = null;
  dessinerMesureCarte();
}

function effacerMesureCarte() {
  carteUrb.mesure = null;
  if (carteUrb.calques.mesure) carteUrb.calques.mesure.clearLayers();
  if (carteUrb.map) { carteUrb.map.doubleClickZoom.enable(); carteUrb.map.getContainer().classList.remove('pr-carte-mesure-en-cours'); }
  const z = document.getElementById('pr-carte-mesure');
  if (z) { z.style.display = 'none'; z.innerHTML = ''; }
  renderBarreCarte();
}

// Pure : ce que dit la mesure — { titre, valeur, detail }.
function resultatMesureCarte(mode, points) {
  const p = points || [];
  if (mode === 'distance') {
    return { titre: 'Distance', valeur: p.length > 1 ? longueurLisible(longueurLigneM(p)) : '—', detail: p.length > 1 ? `${p.length} points` : 'Cliquez les points de la ligne ; double-clic pour finir.' };
  }
  const aire = aireGeodesiqueM2(p);
  return { titre: 'Surface', valeur: p.length > 2 ? surfaceLisible(aire) : '—',
    detail: p.length > 2 ? `${contenanceCadastrale(aire)} · périmètre ${longueurLisible(longueurLigneM(p, true))}` : 'Cliquez les angles du terrain ; double-clic pour finir.' };
}

function dessinerMesureCarte() {
  const L = window.L;
  const m = carteUrb.mesure;
  const z = document.getElementById('pr-carte-mesure');
  if (!m || !z) return;
  const points = m.survol ? m.points.concat([m.survol]) : m.points;
  if (L && carteUrb.calques.mesure) {
    const g = carteUrb.calques.mesure;
    g.clearLayers();
    const c = couleurJetonCarte('focus');
    if (m.mode === 'surface' && points.length > 2) L.polygon(points, { color: c, weight: 2, dashArray: m.fini ? null : '6 4', fillOpacity: 0.15, interactive: false }).addTo(g);
    else if (points.length > 1) L.polyline(points, { color: c, weight: 2, dashArray: m.fini ? null : '6 4', interactive: false }).addTo(g);
    m.points.forEach(p => L.circleMarker(p, { radius: 4, color: c, weight: 2, fillColor: couleurJetonCarte('blanc-fixe'), fillOpacity: 1, interactive: false }).addTo(g));
  }
  const r = resultatMesureCarte(m.mode, points);
  z.style.display = '';
  z.innerHTML = `<span class="pr-mesure-titre">${escapeHtml(r.titre)}</span><span class="pr-mesure-valeur">${escapeHtml(r.valeur)}</span><span class="pr-mesure-detail">${escapeHtml(r.detail)}</span>
    <span class="pr-mesure-actions">${!m.fini && m.points.length > (m.mode === 'surface' ? 2 : 1) ? '<wa-button appearance="outlined" size="s" type="button" onclick="terminerMesureCarte()">Terminer</wa-button>' : ''}<wa-button appearance="plain" size="s" type="button" onclick="effacerMesureCarte()">Effacer</wa-button></span>`;
}

// ===== Barre de droite : onglets =====

function renderOngletsCoteCarte() {
  const z = document.getElementById('pr-cote-onglets');
  if (!z) return;
  const nb = (cle) => cle === 'ventes' ? ventesFiltreesCarte(Object.values(carteUrb.ventes).map(x => x.ventes), 'tout').length : 0;
  z.innerHTML = `<wa-button-group label="Informations">${ONGLETS_COTE_CARTE.map(o => `<wa-button appearance="outlined" size="s" class="vue-bascule-btn${carteUrb.onglet === o.cle ? ' actif' : ''}" type="button" onclick="choisirOngletCoteCarte('${o.cle}')">${o.libelle}${nb(o.cle) ? ` <span class="pr-onglet-nb">${nb(o.cle)}</span>` : ''}</wa-button>`).join('')}</wa-button-group>`;
  document.querySelectorAll('#onglet-preemption .pr-cote-panneau').forEach(p => { p.style.display = p.dataset.onglet === carteUrb.onglet ? '' : 'none'; });
}

function choisirOngletCoteCarte(cle) {
  if (!ONGLETS_COTE_CARTE.some(o => o.cle === cle)) return;
  carteUrb.onglet = cle;
  renderOngletsCoteCarte();
}

// ===== « Demander à CLAIRE » : controle_urbanisme, actions « parcelles » et « ventes » (les mêmes lectures que la carte) =====

async function parcellesCarteAgent(etat) {
  const rep = await fetchAvecAuth(`/api/urbanisme/vue?insee=${encodeURIComponent(etat.insee)}&parcelles=${encodeURIComponent(etat.parcelles)}`);
  const vue = await rep.json().catch(() => ({}));
  if (!rep.ok) return { erreur: vue.erreur || 'parcelles introuvables au cadastre' };
  const centres = (vue.etiquettes || []).filter(x => x.dossier).slice(0, 10);
  const parcelles = [];
  for (const c of centres) {
    const r = await fetchAvecAuth(`/api/urbanisme/point?lon=${encodeURIComponent(c.x)}&lat=${encodeURIComponent(c.y)}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { parcelles.push({ parcelle: String(c.texte || '').replace(/^0(?=[A-Z])/, ''), erreur: j.erreur || 'non lue' }); continue; }
    const p = j.parcelle;
    parcelles.push({
      parcelle: p ? `${p.section} ${p.numero}` : String(c.texte || ''), commune: p ? p.commune : '',
      contenance: p && p.contenance ? contenanceCadastrale(p.contenance) : 'non lue',
      zone_plu: j.zone ? `${j.zone.libelle} — ${j.zone.libelong}` : j.zoneLue ? 'aucun PLU publié (RNU ou carte communale : à vérifier en mairie)' : 'non lue',
      adresse_la_plus_proche: j.adresse ? `${j.adresse.libelle}${j.adresse.distance != null ? ` (à ${j.adresse.distance} m)` : ''}` : j.adresseLue ? 'aucun numéro à proximité' : 'non lue',
      alignement: j.alignement == null ? 'non lu' : j.alignement.length ? j.alignement.map(a => a.nom).join(' ; ') : 'aucun plan d’alignement publié au Géoportail',
      geofoncier: p ? lienGeofoncier(c.y, c.x, 18) : ''
    });
  }
  return { parcelles, source: 'cadastre (DGFiP), Géoportail de l’urbanisme, Base adresse nationale — IGN' };
}

async function ventesCarteAgent(etat, filtre) {
  const sections = sectionsDesParcellesCarte(etat.parcelles);
  if (!sections.length) return { erreur: 'aucune section cadastrale sur la fiche' };
  const listes = [];
  const erreurs = [];
  for (const s of sections) {
    const r = await fetchAvecAuth(`/api/urbanisme/dvf?insee=${encodeURIComponent(etat.insee)}&section=${encodeURIComponent(s)}`);
    const j = await r.json().catch(() => ({}));
    if (r.ok) listes.push(j.ventes || []); else erreurs.push(`section ${s} : ${j.erreur || 'non lue'}`);
  }
  const ventes = ventesFiltreesCarte(listes, ['bati', 'terrain'].includes(filtre) ? filtre : 'tout').slice(0, 40).map(v => ({
    date: v.date, nature: v.nature, prix: v.prix ? formaterMontantEuros(v.prix) : 'non publié', quoi: resumeVenteCarte(v),
    prix_m2_bati: v.prixM2 ? `${v.prixM2} €/m²` : '', adresse: v.adresse, parcelles: (v.parcelles || []).map(x => `${x.slice(8, 10).replace(/^0/, '')} ${Number(x.slice(10))}`)
  }));
  return { sections, ventes, nombre: ventes.length, ...(erreurs.length ? { erreurs } : {}), source: 'DVF (DGFiP, publié par Etalab), cinq dernières années, sans nom' };
}
