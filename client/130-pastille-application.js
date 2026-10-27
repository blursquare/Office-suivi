// Pastille de l'APPLICATION installée (étude 27/10 : « l'API native App Badging de Google Chrome […] essaie ça ») : quand CLAIRE est
// installée comme application par Chrome ou Edge (menu ⋮ › Enregistrer et partager › Installer CLAIRE), la page pose elle-même le nombre
// sur son icône de la barre des tâches (`navigator.setAppBadge`), sans relais ni programme à part. Le même nombre que celui du relais
// (Réglages › Notifications, `totalPastille`). Deux conditions que la page ne peut pas remplir seule : l'application doit être INSTALLÉE,
// et l'adresse du serveur doit être tenue pour sûre — Chrome n'installe et ne badge qu'en HTTPS ou sur localhost ; les postes ouvrent
// http://<adresse IP>. Soit le réglage chrome://flags/#unsafely-treat-insecure-origin-as-secure sur le poste, soit la stratégie
// OverrideSecurityRestrictionsOnInsecureOrigin (fichier .reg ci-dessous, posé par Fichorga : HKLM demande un administrateur).

var etatBadgeApplication = { pose: -1 };

// Pur : où en est ce poste. `nav` = navigator, `contexte` = { secure, installee } (isSecureContext, display-mode standalone).
function etatPastilleApplication(nav, contexte) {
  if (!nav || typeof nav.setAppBadge !== 'function') return contexte && contexte.secure === false ? 'adresse' : 'navigateur';
  if (contexte && contexte.secure === false) return 'adresse';
  return contexte && contexte.installee ? 'prete' : 'installer';
}

function contextePastilleApplication() {
  let installee = false;
  try { installee = !!(window.matchMedia && (window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: window-controls-overlay)').matches)); } catch (e) { /* inconnu */ }
  return { secure: !!window.isSecureContext, installee };
}

// Appelée à chaque tour de la pastille (client/122). `total` = 0 retire la pastille. Rien sur le poste virtuel de CLAIRE.
function poserPastilleApplication(total, active) {
  if (typeof navigator === 'undefined' || typeof navigator.setAppBadge !== 'function' || (typeof POSTE_CLAIRE !== 'undefined' && POSTE_CLAIRE)) return;
  const n = active ? Math.max(0, Number(total) || 0) : 0;
  if (n === etatBadgeApplication.pose) return;
  etatBadgeApplication.pose = n;
  const p = n ? navigator.setAppBadge(n) : navigator.clearAppBadge();
  Promise.resolve(p).then(() => {
    if (n && contextePastilleApplication().installee) noterVerificationPoste('pastille-application', { detail: 'pastille posée sur l’application installée' });
  }).catch(() => { etatBadgeApplication.pose = -1; });
}

// Pur : le fichier .reg de la stratégie de Chrome et d'Edge qui tient l'adresse du serveur pour sûre (UTF-16 attendu par regedit : voir
// `telechargerRegPastilleApplication`). `origine` = « http://192.168.60.5:3000 » ; rien d'autre n'y entre.
function regPastilleApplication(origine) {
  const o = String(origine || '').replace(/[^A-Za-z0-9:/.\-[\]]/g, '');
  const cle = (chemin) => `[HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\${chemin}\\OverrideSecurityRestrictionsOnInsecureOrigin]\r\n"1"="${o}"\r\n`;
  return 'Windows Registry Editor Version 5.00\r\n\r\n' + cle('Google\\Chrome') + '\r\n' + cle('Microsoft\\Edge');
}

function telechargerRegPastilleApplication() {
  const texte = regPastilleApplication(location.origin);
  // regedit lit un .reg en UTF-16 petit-boutiste avec sa marque d'ordre.
  const octets = new Uint8Array(2 + texte.length * 2);
  octets[0] = 0xFF; octets[1] = 0xFE;
  for (let i = 0; i < texte.length; i++) { const c = texte.charCodeAt(i); octets[2 + i * 2] = c & 0xFF; octets[3 + i * 2] = c >> 8; }
  telechargerFichier(new Blob([octets], { type: 'application/octet-stream' }), 'CLAIRE-adresse-sure.reg', 'application/octet-stream');
}

// La ligne de Réglages › Notifications : l'état de ce poste et ce qu'il reste à faire.
function htmlPastilleApplication() {
  const etat = etatPastilleApplication(typeof navigator !== 'undefined' ? navigator : null, contextePastilleApplication());
  const textes = {
    prete: 'Prête : la pastille s’affiche sur l’icône de l’application CLAIRE installée.',
    installer: 'Adresse acceptée par le navigateur. Reste à installer CLAIRE : menu ⋮ › Enregistrer et partager › Installer CLAIRE, puis ouvrir CLAIRE par l’icône de l’application.',
    adresse: `Le navigateur ne tient pas ${location.origin} pour sûre. Sur ce poste : chrome://flags/#unsafely-treat-insecure-origin-as-secure, y ajouter ${location.origin}, « Enabled », relancer Chrome. Pour tous les postes : le fichier ci-dessous, à faire poser par Fichorga (il demande un administrateur).`,
    navigateur: 'Ce navigateur ne sait pas poser de pastille sur l’icône d’une application (Chrome ou Edge récents seulement).'
  };
  return `<div class="reglages-section">
      <h3 class="reglages-section-titre">Pastille de l’application installée ${infoBulle('Sans relais : quand CLAIRE est installée comme application par Chrome ou Edge, elle pose elle-même le nombre de choses à voir sur son icône de la barre des tâches (le même nombre que la pastille du relais). Chrome ne le permet que sur une adresse qu’il tient pour sûre.')}</h3>
      <p class="hint">${escapeHtml(textes[etat])}</p>
      ${etat === 'adresse' ? `<div class="reglages-actions"><wa-button appearance="outlined" class="secondary" onclick="telechargerRegPastilleApplication()">Télécharger le fichier pour Fichorga</wa-button></div>` : ''}
    </div>`;
}
