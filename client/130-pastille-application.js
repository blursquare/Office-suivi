// Pastille de l'APPLICATION installée (étude 27/10 : « l'API native App Badging de Google Chrome […] essaie ça ») : quand CLAIRE est
// installée comme application par Chrome ou Edge (menu ⋮ › Enregistrer et partager › Installer CLAIRE), la page pose elle-même le nombre
// sur son icône de la barre des tâches (`navigator.setAppBadge`), sans relais ni programme à part. Le même nombre que celui du relais
// (Réglages › Notifications, `totalPastille`). Deux conditions que la page ne peut pas remplir seule : l'application doit être INSTALLÉE,
// et l'adresse du serveur doit être tenue pour sûre — Chrome n'installe et ne badge qu'en HTTPS ou sur localhost ; les postes ouvrent
// http://<adresse IP>. Soit le réglage chrome://flags/#unsafely-treat-insecure-origin-as-secure sur le poste, soit la stratégie
// OverrideSecurityRestrictionsOnInsecureOrigin (fichier .reg ci-dessous, posé par Fichorga : HKLM demande un administrateur).
// Revers de cette stratégie (audit 0.372.0) : l'adresse http devient « sûre » pour tout le navigateur du poste — un service worker posé
// sur le réseau du bureau y survivrait ; client/37 retire tout service worker qui n'est pas /sw.js. La vraie réponse reste HTTPS.

var etatBadgeApplication = { pose: -1, refuse: false };

// Pur : où en est ce poste. `nav` = navigator, `contexte` = { secure, installee, chromium } (isSecureContext, display-mode standalone,
// Chrome ou Edge). Une fenêtre `--app` des raccourcis peut aussi se dire « standalone » : « prete » veut dire « l'API répond ici », la
// pastille n'apparaît que sur l'icône de l'application installée.
function etatPastilleApplication(nav, contexte) {
  if (!nav || typeof nav.setAppBadge !== 'function') return contexte && contexte.secure === false && contexte.chromium ? 'adresse' : 'navigateur';
  if (contexte && contexte.secure === false) return 'adresse';
  return contexte && contexte.installee ? 'prete' : 'installer';
}

function contextePastilleApplication() {
  let installee = false;
  try { installee = !!(window.matchMedia && (window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: window-controls-overlay)').matches)); } catch (e) { /* inconnu */ }
  const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '';
  return { secure: !!window.isSecureContext, installee, chromium: /Chrome\/|Edg\//.test(ua), edge: /Edg\//.test(ua) };
}

// La page pose elle-même la pastille (application installée, API acceptée) : les relevés des compteurs continuent fenêtre cachée comme
// avec le relais (client/122 `pastilleActiveHorsEcran`), et le relais ne pose pas la sienne par-dessus.
function pastilleApplicationActive() {
  return !etatBadgeApplication.refuse && etatPastilleApplication(typeof navigator !== 'undefined' ? navigator : null, contextePastilleApplication()) === 'prete';
}

// Appelée à chaque tour de la pastille (client/122). `total` = 0 retire la pastille. Rien sur le poste virtuel de CLAIRE.
function poserPastilleApplication(total, active) {
  if (typeof navigator === 'undefined' || typeof navigator.setAppBadge !== 'function' || (typeof POSTE_CLAIRE !== 'undefined' && POSTE_CLAIRE)) return;
  const n = active ? Math.max(0, Number(total) || 0) : 0;
  if (n === etatBadgeApplication.pose || etatBadgeApplication.refuse) return;
  etatBadgeApplication.pose = n;
  let p;
  try { p = n ? navigator.setAppBadge(n) : navigator.clearAppBadge(); } catch (e) { p = Promise.reject(e); }
  // Refusée une fois (navigateur qui la bloque) : plus d'essai dans cette fenêtre, et c'est dit au journal technique.
  Promise.resolve(p).catch((e) => {
    etatBadgeApplication.refuse = true;
    console.warn('Pastille de l’application refusée par le navigateur :', String((e && e.name) || e).slice(0, 60));
  });
}

// Pur : le fichier .reg de la stratégie de Chrome et d'Edge qui tient l'adresse du serveur pour sûre (UTF-16 attendu par regedit : voir
// `telechargerRegPastilleApplication`). `origine` = « http://192.168.60.5:3000 » ; rien d'autre n'y entre.
function regPastilleApplication(origine) {
  const o = String(origine || '').replace(/[^A-Za-z0-9:/.\-[\]]/g, '');
  const cle = (chemin) => `[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\${chemin}\\OverrideSecurityRestrictionsOnInsecureOrigin]\r\n"1"="${o}"\r\n`;
  return 'Windows Registry Editor Version 5.00\r\n\r\n' + cle('Google\\Chrome') + '\r\n' + cle('Microsoft\\Edge');
}

// Pur : regedit lit un .reg en UTF-16 petit-boutiste avec sa marque d'ordre.
function octetsUtf16Reg(texte) {
  const t = String(texte || '');
  const octets = new Uint8Array(2 + t.length * 2);
  octets[0] = 0xFF; octets[1] = 0xFE;
  for (let i = 0; i < t.length; i++) { const c = t.charCodeAt(i); octets[2 + i * 2] = c & 0xFF; octets[3 + i * 2] = c >> 8; }
  return octets;
}

function telechargerRegPastilleApplication() {
  const octets = octetsUtf16Reg(regPastilleApplication(location.origin));
  telechargerFichier(new Blob([octets], { type: 'application/octet-stream' }), 'CLAIRE-adresse-sure.reg', 'application/octet-stream');
}

// La ligne de Réglages › Notifications : l'état de ce poste et ce qu'il reste à faire.
function htmlPastilleApplication() {
  const ctx = contextePastilleApplication();
  const etat = etatBadgeApplication.refuse ? 'navigateur' : etatPastilleApplication(typeof navigator !== 'undefined' ? navigator : null, ctx);
  const flags = (ctx.edge ? 'edge' : 'chrome') + '://flags/#unsafely-treat-insecure-origin-as-secure';
  const textes = {
    prete: 'Le navigateur accepte la pastille ici : elle s’affiche sur l’icône de CLAIRE quand CLAIRE est ouverte par l’icône de l’application installée (menu ⋮ › Enregistrer et partager › Installer CLAIRE), pas par les raccourcis d’avant.',
    installer: 'Adresse acceptée par le navigateur. Reste à installer CLAIRE : menu ⋮ › Enregistrer et partager › Installer CLAIRE, puis ouvrir CLAIRE par l’icône de l’application.',
    adresse: `Le navigateur ne tient pas ${location.origin} pour sûre. Sur ce poste : ${flags}, y ajouter ${location.origin}, « Enabled », relancer le navigateur. Pour tous les postes : le fichier ci-dessous, à faire poser par Fichorga (il demande un administrateur ; si Fichorga pose déjà cette stratégie pour un autre outil, l’adresse s’ajoute à sa liste au lieu de la remplacer).`,
    navigateur: 'Ce navigateur ne sait pas poser de pastille sur l’icône d’une application (Chrome ou Edge récents seulement).'
  };
  return `<div class="reglages-section">
      <h3 class="reglages-section-titre">Pastille de l’application installée ${infoBulle('Sans relais : quand CLAIRE est installée comme application par Chrome ou Edge, elle pose elle-même le nombre de choses à voir sur son icône de la barre des tâches (le même nombre que la pastille du relais). Chrome ne le permet que sur une adresse qu’il tient pour sûre.')}</h3>
      <p class="hint">${escapeHtml(textes[etat])}</p>
      ${etat === 'adresse' ? `<div class="reglages-actions"><wa-button appearance="outlined" class="secondary" onclick="telechargerRegPastilleApplication()">Télécharger le fichier pour Fichorga</wa-button></div>` : ''}
    </div>`;
}
