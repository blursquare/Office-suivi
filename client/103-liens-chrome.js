// ==== Liens externes ouverts dans un onglet de Chrome (étude 22/10 : « quand on clique sur un lien dans CLAIRE, l'ouvrir dans un onglet
// Chrome du navigateur de l'ordinateur et pas dans une fenêtre de l'app CLAIRE ») ====
//
// Une page web ne peut pas sortir d'une fenêtre d'application : l'ouverture passe par un lien Windows `claire-web:` (fichier .reg du poste,
// server/src/relaisAppelReg.js) qui lance PowerShell, lequel n'ouvre QU'UNE adresse http(s) validée dans Chrome. Sans ce fichier importé, le
// lien ne ferait rien : le comportement n'est donc changé que sur un poste qui l'a installé (réglage « Ouvrir les liens dans Chrome »,
// gardé sur le poste). Les liens internes de CLAIRE (même adresse) et les liens mailto / tel gardent leur comportement.

var CLE_LIENS_CHROME = 'claire-liens-chrome';

function liensChromeActifs() {
  try { return localStorage.getItem(CLE_LIENS_CHROME) === '1'; } catch (e) { return false; }
}

function choisirLiensChrome(actif) {
  ecrireLocal(CLE_LIENS_CHROME, actif ? '1' : '0');
}

/** Pure : une adresse vers un AUTRE site (http ou https), donc à ouvrir hors de la fenêtre CLAIRE. @param {string} href @param {string} origine */
function lienExternePourChrome(href, origine) {
  try {
    const u = new URL(String(href || ''), origine);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.origin !== origine ? u.href : '';
  } catch (e) { return ''; }
}

/** Ouvre une adresse externe : dans Chrome si le poste l'a installé (réglage), sinon comme avant. @param {string} url */
function ouvrirLienExterne(url) {
  const externe = lienExternePourChrome(url, location.origin);
  if (!externe || !liensChromeActifs()) { window.open(url, '_blank', 'noopener'); return; }
  const lien = document.createElement('a');
  lien.href = 'claire-web:' + encodeURIComponent(externe);
  document.body.appendChild(lien);
  lien.click();
  document.body.removeChild(lien);
}

// Un clic sur un lien d'un autre site : ouvert dans Chrome (réglage actif). Pris à la capture, avant les gestionnaires de la page.
if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('click', (ev) => {
  if (ev.defaultPrevented || ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.shiftKey || !liensChromeActifs()) return;
  const lien = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
  if (!lien) return;
  const externe = lienExternePourChrome(lien.getAttribute('href'), location.origin);
  if (!externe) return;
  ev.preventDefault();
  ev.stopPropagation();
  ouvrirLienExterne(externe);
}, true);

async function telechargerInstallateurLiensChrome() {
  try {
    const r = await fetchAvecAuth('/api/appels/relais/liens-web');
    if (!r.ok) throw new Error('statut ' + r.status);
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(await r.blob());
    lien.download = 'CLAIRE-liens-dans-Chrome.reg';
    document.body.appendChild(lien);
    lien.click();
    document.body.removeChild(lien);
    setTimeout(() => URL.revokeObjectURL(lien.href), 60000);
    afficherInfoAction('Fichier téléchargé', 'Ouvrez CLAIRE-liens-dans-Chrome.reg (double-clic), puis « Oui » à l’Éditeur du Registre : aucun programme n’est installé. Revenez ici, activez « Ouvrir les liens dans Chrome », puis fermez et rouvrez Chrome. À la première ouverture, Chrome peut demander d’autoriser le lien : cochez « Toujours autoriser ».');
  } catch (e) {
    afficherToast('Téléchargement impossible : ' + e.message, 'OK', null);
  }
}
