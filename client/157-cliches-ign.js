// Visionneuse des clichés aériens d'origine de l'IGN (étude 31/10 : « quand on clique sur une photo aérienne, ouvrir la photo dans une
// fenêtre pour se déplacer dedans et pouvoir la télécharger » ; « tu arriveras à retrouver et entourer la parcelle sur la photo ? » ;
// « remettre la délimitation exacte de la parcelle » ; « proposer le choix des tranches d'années pour comparer »).
//
// Le serveur lit le fichier officiel de la Géoplateforme par morceaux (server/src/clichesIgn.js) et rend ses carrés en JPEG ; la fenêtre
// les montre avec Leaflet en coordonnées de pixels. Le contour EXACT des parcelles du dossier (cadastre) est posé sur la photo d'après les
// quatre coins au sol du cliché (liste officielle pva:image) : une photo d'origine n'est pas redressée (relief, inclinaison de l'avion),
// le contour peut donc tomber à quelques dizaines de mètres — « Ajuster le contour » le fait glisser à la main. Ne part que l'identifiant
// public du cliché.

var visionneuseCliche = { gauche: '', droite: '', cartes: {}, decalages: {}, ajuster: false, synchro: false };

// ===== Calculs purs (testés) =====

// Pure : coordonnées locales (lon aplatie, lat) — une petite zone se traite comme un plan.
function planLocalCliche(coins) {
  const lat0 = coins.reduce((s, c) => s + c[1], 0) / coins.length;
  const k = Math.cos(lat0 * Math.PI / 180);
  return { vers: (lon, lat) => [lon * k, lat], depuis: (x, y) => [x / k, y] };
}

// Pure : le point au sol d'un pixel du cliché (coins = haut gauche, haut droit, bas droit, bas gauche de l'image, en [lon, lat]).
function pointDuPixelCliche(coins, x, y, largeur, hauteur) {
  const pl = planLocalCliche(coins);
  const q = coins.map(c => pl.vers(c[0], c[1]));
  const u = x / largeur; const v = y / hauteur;
  const X = (1 - u) * (1 - v) * q[0][0] + u * (1 - v) * q[1][0] + u * v * q[2][0] + (1 - u) * v * q[3][0];
  const Y = (1 - u) * (1 - v) * q[0][1] + u * (1 - v) * q[1][1] + u * v * q[2][1] + (1 - u) * v * q[3][1];
  const r = pl.depuis(X, Y);
  return { lon: r[0], lat: r[1] };
}

// Pure : le pixel du cliché d'un point au sol (inverse de la précédente, par approximations successives) ; null si les coins sont illisibles.
function pixelDuPointCliche(coins, lon, lat, largeur, hauteur) {
  if (!Array.isArray(coins) || coins.length !== 4 || !(largeur > 0) || !(hauteur > 0)) return null;
  const pl = planLocalCliche(coins);
  const q = coins.map(c => pl.vers(c[0], c[1]));
  const P = pl.vers(lon, lat);
  const f = (u, v) => [0, 1].map(i => (1 - u) * (1 - v) * q[0][i] + u * (1 - v) * q[1][i] + u * v * q[2][i] + (1 - u) * v * q[3][i]);
  let u = 0.5; let v = 0.5;
  for (let n = 0; n < 30; n++) {
    const p = f(u, v);
    const e = [P[0] - p[0], P[1] - p[1]];
    const du = [0, 1].map(i => (1 - v) * (q[1][i] - q[0][i]) + v * (q[2][i] - q[3][i]));
    const dv = [0, 1].map(i => (1 - u) * (q[3][i] - q[0][i]) + u * (q[2][i] - q[1][i]));
    const det = du[0] * dv[1] - du[1] * dv[0];
    if (!det) return null;
    const a = (e[0] * dv[1] - e[1] * dv[0]) / det;
    const b = (du[0] * e[1] - du[1] * e[0]) / det;
    u += a; v += b;
    if (Math.abs(a) < 1e-9 && Math.abs(b) < 1e-9) break;
  }
  if (!Number.isFinite(u) || !Number.isFinite(v)) return null;
  return { x: u * largeur, y: v * hauteur, dedans: u >= 0 && u <= 1 && v >= 0 && v <= 1 };
}

// Pure : les contours des parcelles ([[lon, lat], …] par anneau) en pixels du cliché, décalés de (dx, dy).
function contoursSurCliche(contours, coins, largeur, hauteur, decalage) {
  const d = decalage || { dx: 0, dy: 0 };
  return (contours || []).map(a => a.map(p => pixelDuPointCliche(coins, p[0], p[1], largeur, hauteur)).filter(Boolean).map(p => [p.y + d.dy, p.x + d.dx])).filter(a => a.length > 2);
}

// Pure : un cliché par année pour la liste « Comparer avec » (le premier de l'année), le plus récent d'abord.
function clichesParAnneeIgn(annees) {
  return (annees || []).map(a => (a.cliches || []).find(c => c.coins) || null).filter(Boolean);
}

// ===== Fenêtre =====

function clicheIgnParId(id) {
  for (const a of clichesCarte.annees || []) { const c = (a.cliches || []).find(x => x.id === id); if (c) return c; }
  return null;
}

function ouvrirClicheIgn(id) {
  const c = clicheIgnParId(id);
  if (!c) return;
  visionneuseCliche.gauche = id;
  visionneuseCliche.droite = '';
  visionneuseCliche.ajuster = false;
  let overlay = document.getElementById('cliche-ign-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'cliche-ign-overlay';
    overlay.className = 'scan-apercu-overlay cliche-ign-overlay';
    overlay.addEventListener('click', (e) => { if (clicSurFond(e)) fermerClicheIgn(); });
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'flex';
  renderVisionneuseCliche();
}

function fermerClicheIgn() {
  const overlay = document.getElementById('cliche-ign-overlay');
  Object.values(visionneuseCliche.cartes).forEach(m => { try { m.carte.remove(); } catch (e) { /* déjà retirée */ } });
  visionneuseCliche.cartes = {};
  imagesClichesIgn.clear();
  if (overlay) { overlay.style.display = 'none'; overlay.innerHTML = ''; }
}

// Échap ferme la visionneuse seule, jamais ce qui est dessous (relecture 0.416.0 : écouté en capture, comme l'aperçu des scans).
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const o = document.getElementById('cliche-ign-overlay');
  if (o && o.style.display !== 'none' && o.innerHTML) { e.stopPropagation(); e.preventDefault(); fermerClicheIgn(); }
}, true);

function libelleClicheIgn(c) { return `${formatDateFr(c.date)} · cliché ${c.numero || '—'}`; }

function renderVisionneuseCliche() {
  const overlay = document.getElementById('cliche-ign-overlay');
  const g = clicheIgnParId(visionneuseCliche.gauche);
  if (!overlay || !g) return;
  Object.values(visionneuseCliche.cartes).forEach(m => { try { m.carte.remove(); } catch (e) { /* déjà retirée */ } });
  visionneuseCliche.cartes = {};
  const autres = clichesParAnneeIgn(clichesCarte.annees).filter(c => c.id !== g.id);
  const parDecennie = decenniesClichesCarte(clichesCarte.annees);
  const options = parDecennie.map(d => {
    const liste = autres.filter(c => d.annees.includes(c.annee));
    return liste.length ? `<optgroup label="${escapeAttr(d.decennie)}">${liste.map(c => `<option value="${escapeAttr(c.id)}"${c.id === visionneuseCliche.droite ? ' selected' : ''}>${escapeHtml(String(c.annee))} — ${escapeHtml(formatDateFr(c.date))}</option>`).join('')}</optgroup>` : '';
  }).join('');
  const d = clicheIgnParId(visionneuseCliche.droite);
  const volet = (c, cote) => `<div class="cliche-volet">
      <div class="cliche-volet-tete">
        <span class="cliche-volet-titre">${escapeHtml(String(c.annee))}</span><span class="cliche-volet-sous">${escapeHtml(libelleClicheIgn(c))}</span>
        <span class="cliche-volet-liens">
          <a href="${escapeAttr(c.telecharger || '')}" target="_blank" rel="noopener" title="Le fichier d’origine de l’IGN (TIFF, souvent plus de 100 Mo)">${icone('download')} Télécharger l’original</a>
          ${clichesCarte.centre ? `<a href="${escapeAttr(lienRemonterLeTemps(clichesCarte.centre.lon, clichesCarte.centre.lat, c.annee, c.mission))}" target="_blank" rel="noopener">${icone('lien-externe')} Remonter le temps</a>` : ''}
        </span>
      </div>
      <div class="cliche-carte" id="cliche-carte-${cote}"><p class="hint cliche-etat">${icone('spinner')} Lecture du cliché…</p></div>
    </div>`;
  overlay.innerHTML = `<div class="scan-apercu cliche-ign" role="dialog" aria-modal="true" aria-labelledby="cliche-ign-titre">
      <header class="scan-apercu-tete">
        <div class="scan-apercu-titres">
          <h2 id="cliche-ign-titre">Clichés aériens de l’IGN</h2>
          <div class="scan-apercu-meta"><span>Contour jaune : les parcelles du dossier d’après le cadastre</span></div>
        </div>
        <label class="cliche-comparer">Comparer avec
          <select id="cliche-comparer" onchange="comparerClicheIgn(this.value)"><option value="">— aucun —</option>${options}</select>
        </label>
        <wa-button appearance="outlined" size="s" type="button" class="vue-bascule-btn${visionneuseCliche.ajuster ? ' actif' : ''}" onclick="basculerAjusterCliche()" title="La photo d’origine n’est pas redressée : faites glisser le contour sur la parcelle">${icone('viser')} Ajuster le contour</wa-button>
        <wa-button appearance="plain" size="s" type="button" class="bouton-icone icon-btn" onclick="fermerClicheIgn()" aria-label="Fermer">${icone('x')}</wa-button>
      </header>
      <div class="cliche-corps${d ? ' deux' : ''}">${volet(g, 'gauche')}${d ? volet(d, 'droite') : ''}</div>
    </div>`;
  chargerLeafletCarte().then(L => {
    monterVoletCliche(L, 'gauche', g);
    if (d) monterVoletCliche(L, 'droite', d);
  }).catch(() => {
    overlay.querySelectorAll('.cliche-carte').forEach(z => { z.innerHTML = `<p class="pr-erreur">${icone('alert-triangle')} Carte indisponible.</p>`; });
  });
}

function comparerClicheIgn(id) {
  visionneuseCliche.droite = clicheIgnParId(id) ? id : '';
  renderVisionneuseCliche();
}

function basculerAjusterCliche() {
  visionneuseCliche.ajuster = !visionneuseCliche.ajuster;
  document.querySelectorAll('#cliche-ign-overlay .cliche-ign .vue-bascule-btn').forEach(b => b.classList.toggle('actif', visionneuseCliche.ajuster));
  Object.values(visionneuseCliche.cartes).forEach(m => {
    if (visionneuseCliche.ajuster) m.carte.dragging.disable(); else m.carte.dragging.enable();
    m.carte.getContainer().classList.toggle('cliche-ajuster', visionneuseCliche.ajuster);
  });
}

// Pure : la matrice qui tourne le cliché pour que le nord soit en haut, comme la carte et le cadastre (étude 31/10 : « faire tourner les
// photos pour que les clichés soient dans le même sens que les parcelles »). D = M · P, P en pixels du cliché, D en « pixels » de l'écran
// (même taille : la matrice ne fait que tourner, d'après la direction au sol des bords haut et gauche de l'image).
function matriceCliche(coins, largeur, hauteur) {
  if (!Array.isArray(coins) || coins.length !== 4 || !(largeur > 0) || !(hauteur > 0)) return null;
  const pl = planLocalCliche(coins);
  const q = coins.map(c => pl.vers(c[0], c[1]));
  const ux = [(q[1][0] - q[0][0]) / largeur, (q[1][1] - q[0][1]) / largeur];   // au sol, un pixel vers la droite de l'image
  const uy = [(q[3][0] - q[0][0]) / hauteur, (q[3][1] - q[0][1]) / hauteur];   // au sol, un pixel vers le bas de l'image
  const r = Math.hypot(ux[0], ux[1]) || 1;
  // Écran : x vers l'est, y vers le sud.
  const a = ux[0] / r; const b = -ux[1] / r; const c = uy[0] / r; const d = -uy[1] / r;
  const det = a * d - b * c;
  if (!det) return null;
  return { a, b, c, d, versEcran: (x, y) => [a * x + c * y, b * x + d * y], versCliche: (X, Y) => [(d * X - c * Y) / det, (-b * X + a * Y) / det] };
}

// Pure : l'emprise à l'écran d'un cliché tourné (les quatre coins de l'image passés par la matrice).
function bornesEcranCliche(m, largeur, hauteur) {
  const pts = [[0, 0], [largeur, 0], [largeur, hauteur], [0, hauteur]].map(p => m.versEcran(p[0], p[1]));
  const xs = pts.map(p => p[0]); const ys = pts.map(p => p[1]);
  return { ouest: Math.min(...xs), est: Math.max(...xs), nord: Math.min(...ys), sud: Math.max(...ys) };
}

var imagesClichesIgn = new Map();
function imageClicheIgn(url) {
  if (imagesClichesIgn.has(url)) { const p = imagesClichesIgn.get(url); imagesClichesIgn.delete(url); imagesClichesIgn.set(url, p); return p; }
  // Un carré en échec n'est pas gardé : il sera redemandé (relecture 0.416.0).
  const p = new Promise(res => { const img = new Image(); img.onload = () => res(img); img.onerror = () => { imagesClichesIgn.delete(url); res(null); }; img.src = url; });
  imagesClichesIgn.set(url, p);
  while (imagesClichesIgn.size > 80) imagesClichesIgn.delete(imagesClichesIgn.keys().next().value);
  return p;
}

async function monterVoletCliche(L, cote, c) {
  const zone = document.getElementById(`cliche-carte-${cote}`);
  if (!zone) return;
  let info;
  try {
    const r = await fetchAvecAuth(`/api/urbanisme/cliche/${encodeURIComponent(c.lot)}/${encodeURIComponent(c.id)}/info`);
    info = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(info.erreur || 'Cliché non lu.');
  } catch (e) {
    if (document.getElementById(`cliche-carte-${cote}`) === zone) zone.innerHTML = `<p class="pr-erreur">${icone('alert-triangle')} ${escapeHtml(e.message || 'Cliché non lu.')} Le lien « Télécharger l’original » reste possible.</p>`;
    return;
  }
  if (document.getElementById(`cliche-carte-${cote}`) !== zone || clicheIgnParId(cote === 'gauche' ? visionneuseCliche.gauche : visionneuseCliche.droite) !== c) return;
  zone.innerHTML = '';
  const N = info.niveaux.length - 1;
  const W = info.largeur; const H = info.hauteur;
  // Sans emprise lisible, la photo reste telle quelle (ni rotation ni contour) ; sinon, nord en haut.
  const M = matriceCliche(c.coins, W, H) || { a: 1, b: 0, c: 0, d: 1, versEcran: (x, y) => [x, y], versCliche: (x, y) => [x, y] };
  const bo = bornesEcranCliche(M, W, H);
  // Coordonnées de la carte = l'écran tourné, en pixels du cliché (y vers le bas) ; au zoom N, un pixel d'écran = un pixel du cliché.
  const crs = L.extend({}, L.CRS.Simple, {
    transformation: new L.Transformation(1, 0, 1, 0),
    scale: (z) => Math.pow(2, z - N),
    zoom: (s) => Math.log(s) / Math.LN2 + N
  });
  const bornes = L.latLngBounds([bo.nord, bo.ouest], [bo.sud, bo.est]);
  const carte = L.map(zone, { crs, minZoom: 0, maxZoom: N + 1, zoomSnap: 0.5, attributionControl: true, maxBounds: bornes.pad(0.2) });
  carte.attributionControl.setPrefix('').addAttribution('Prise de vues aérienne © IGN');
  const niveaux = info.niveaux;
  const base = `/api/urbanisme/cliche/${encodeURIComponent(c.lot)}/${encodeURIComponent(c.id)}`;
  // Chaque case de l'écran est dessinée sur un canevas : les carrés du cliché qui la recouvrent, tournés (Leaflet ne tourne pas une couche).
  const Couche = L.GridLayer.extend({
    createTile(t, fait) {
      const taille = this.getTileSize();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const toile = document.createElement('canvas');
      toile.width = taille.x * ratio; toile.height = taille.y * ratio;
      const k = Math.max(0, Math.min(N, N - t.z));
      const s = Math.pow(2, t.z - N);
      const x0 = t.x * taille.x / s; const y0 = t.y * taille.y / s;
      const coinsCase = [[x0, y0], [x0 + taille.x / s, y0], [x0, y0 + taille.y / s], [x0 + taille.x / s, y0 + taille.y / s]].map(p => M.versCliche(p[0], p[1]));
      const f = Math.pow(2, k);
      const nv = niveaux[k];
      const cols = Math.ceil(nv.largeur / 512); const lignes = Math.ceil(nv.hauteur / 512);
      const xs = coinsCase.map(p => p[0] / f / 512); const ys = coinsCase.map(p => p[1] / f / 512);
      const i0 = Math.max(0, Math.floor(Math.min(...xs))); const i1 = Math.min(cols - 1, Math.floor(Math.max(...xs)));
      const j0 = Math.max(0, Math.floor(Math.min(...ys))); const j1 = Math.min(lignes - 1, Math.floor(Math.max(...ys)));
      const attentes = [];
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) attentes.push(imageClicheIgn(`${base}/${k}/${i}/${j}`).then(img => ({ img, i, j })));
      if (!attentes.length) { setTimeout(() => fait(null, toile), 0); return toile; }
      Promise.all(attentes).then(liste => {
        const ctx = toile.getContext('2d');
        const e = s * f * ratio;
        ctx.setTransform(e * M.a, e * M.b, e * M.c, e * M.d, -x0 * s * ratio, -y0 * s * ratio);
        // Un pixel de recouvrement entre carrés : pas de fil clair à leurs joints une fois tournés.
        liste.forEach(({ img, i, j }) => { if (img) ctx.drawImage(img, i * 512, j * 512, img.width + 1, img.height + 1); });
        fait(null, toile);
      });
      return toile;
    }
  });
  new Couche({ tileSize: 512, minZoom: 0, maxZoom: N + 1, noWrap: true, bounds: bornes, keepBuffer: 2 }).addTo(carte);
  const centre = clichesCarte.centre;
  const pix = centre && c.coins ? pixelDuPointCliche(c.coins, centre.lon, centre.lat, W, H) : null;
  const groupe = L.layerGroup().addTo(carte);
  const m = { carte, c, W, H, N, M, groupe, pix };
  visionneuseCliche.cartes[cote] = m;
  dessinerContourCliche(L, m);
  if (pix && pix.dedans) { const p = M.versEcran(pix.x, pix.y); carte.setView([p[1], p[0]], Math.max(0, N - 1)); }
  else {
    carte.fitBounds(bornes);
    const avis = document.createElement('p');
    avis.className = 'cliche-avis';
    avis.textContent = !c.coins ? 'Emprise du cliché illisible : contour impossible.' : centre ? 'Le bien n’est pas sur ce cliché : choisissez-en un autre.' : 'Parcelles du dossier non lues : contour impossible.';
    zone.appendChild(avis);
  }
  // Glisser le contour (mode « Ajuster », souris ou doigt) : le décalage est gardé par cliché tant que CLAIRE est ouverte.
  let depart = null;
  const point = (ev) => carte.mouseEventToLatLng(ev);
  zone.addEventListener('pointerdown', (ev) => { if (!visionneuseCliche.ajuster || (ev.target && ev.target.closest && ev.target.closest('.leaflet-control'))) return; depart = { ll: point(ev), d: Object.assign({ dx: 0, dy: 0 }, visionneuseCliche.decalages[c.id]) }; try { zone.setPointerCapture(ev.pointerId); } catch (e) { /* ancien navigateur */ } ev.preventDefault(); });
  zone.addEventListener('pointermove', (ev) => {
    if (!depart) return;
    const ll = point(ev);
    visionneuseCliche.decalages[c.id] = { dx: depart.d.dx + (ll.lng - depart.ll.lng), dy: depart.d.dy + (ll.lat - depart.ll.lat) };
    dessinerContourCliche(L, m);
  });
  const finir = () => { depart = null; };
  zone.addEventListener('pointerup', finir);
  zone.addEventListener('pointercancel', finir);
  if (visionneuseCliche.ajuster) { carte.dragging.disable(); zone.classList.add('cliche-ajuster'); }
  // Deux clichés : le second suit le premier, au même endroit du sol.
  carte.on('moveend', () => synchroniserClichesIgn(cote));
  setTimeout(() => { carte.invalidateSize(); synchroniserClichesIgn('gauche'); }, 60);
}

function dessinerContourCliche(L, m) {
  m.groupe.clearLayers();
  if (!m.c.coins) return;
  const vue = prEtat && prEtat.historique && prEtat.historique.vue;
  const d = visionneuseCliche.decalages[m.c.id] || { dx: 0, dy: 0 };
  const anneaux = contoursSurCliche(vue && vue.contours, m.c.coins, m.W, m.H, null)
    .map(a => a.map(p => { const e = m.M.versEcran(p[1], p[0]); return [e[1] + d.dy, e[0] + d.dx]; }));
  if (anneaux.length) L.polygon(anneaux, { color: couleurJetonCarte('cat-jaune'), weight: 3, fill: false, interactive: false }).addTo(m.groupe);
}

// Mètres au sol par pixel du cliché (largeur de l'emprise / largeur de l'image).
function resolutionCliche(m) {
  const k = planLocalCliche(m.c.coins);
  const a = k.vers(m.c.coins[0][0], m.c.coins[0][1]); const b = k.vers(m.c.coins[1][0], m.c.coins[1][1]);
  return Math.hypot(a[0] - b[0], a[1] - b[1]) * 111320 / m.W || 1;
}

function synchroniserClichesIgn(source) {
  if (visionneuseCliche.synchro) return;
  const a = visionneuseCliche.cartes[source];
  const b = visionneuseCliche.cartes[source === 'gauche' ? 'droite' : 'gauche'];
  // Sans emprise lisible d'un des deux clichés, pas de correspondance au sol (relecture 0.416.0).
  if (!a || !b || !a.c.coins || !b.c.coins) return;
  const c = a.carte.getCenter();
  const da = visionneuseCliche.decalages[a.c.id] || { dx: 0, dy: 0 };
  const db = visionneuseCliche.decalages[b.c.id] || { dx: 0, dy: 0 };
  const pa = a.M.versCliche(c.lng - da.dx, c.lat - da.dy);
  const sol = pointDuPixelCliche(a.c.coins, pa[0], pa[1], a.W, a.H);
  const p = pixelDuPointCliche(b.c.coins, sol.lon, sol.lat, b.W, b.H);
  if (!p) return;
  const e = b.M.versEcran(p.x, p.y);
  // Même échelle au sol : le zoom tient compte de la taille du pixel de chaque cliché et de son nombre de niveaux.
  const z = a.carte.getZoom() - a.N + b.N + Math.log2(resolutionCliche(b) / resolutionCliche(a));
  visionneuseCliche.synchro = true;
  b.carte.setView([e[1] + db.dy, e[0] + db.dx], Math.max(0, Math.min(b.N + 1, z)), { animate: false });
  visionneuseCliche.synchro = false;
}
