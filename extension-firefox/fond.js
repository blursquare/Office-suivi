// Bouton « Envoyer à CLAIRE » : relève la page d'Authentic affichée (capture.js, dans chacun de ses
// cadres), l'envoie au serveur CLAIRE du bureau et ouvre CLAIRE sur la page reçue. Rien ne part
// ailleurs que vers l'adresse de CLAIRE réglée dans les options.
'use strict';

function signal(texte, couleur) {
  browser.browserAction.setBadgeText({ text: texte });
  if (couleur) browser.browserAction.setBadgeBackgroundColor({ color: couleur });
  if (texte) setTimeout(() => browser.browserAction.setBadgeText({ text: '' }), 6000);
}

// Plusieurs cadres : un seul relevé, champs et tableaux mis bout à bout, titre du cadre principal.
function fusionner(releves) {
  const liste = (releves || []).filter(Boolean);
  const principal = liste[0] || {};
  return {
    titre: principal.titre || '',
    adresse: principal.adresse || '',
    champs: [].concat(...liste.map(r => r.champs || [])),
    tableaux: [].concat(...liste.map(r => r.tableaux || [])),
    texte: liste.map(r => r.texte || '').filter(Boolean).join('\n\n')
  };
}

browser.browserAction.onClicked.addListener(async (onglet) => {
  const { serveur } = await browser.storage.local.get('serveur');
  if (!serveur) { browser.runtime.openOptionsPage(); return; }
  signal('…', '#6B7280');
  try {
    const releves = await browser.tabs.executeScript(onglet.id, { file: 'capture.js', allFrames: true });
    const r = await fetch(serveur + '/api/authentic/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fusionner(releves))
    });
    if (!r.ok) throw new Error(r.status === 401 ? 'CLAIRE demande un mot de passe (authentification active) : non géré par l’extension.' : 'CLAIRE a refusé la page (' + r.status + ').');
    const { id } = await r.json();
    const adresse = serveur + '/#authentic=' + encodeURIComponent(id);
    // Un onglet CLAIRE déjà ouvert dans Firefox est réutilisé (l'adresse ne change que derrière le #).
    let ouverts = [];
    try { ouverts = await browser.tabs.query({ url: new URL(serveur).origin.replace(/:\d+$/, '') + '/*' }); } catch (e) { /* motif refusé */ }
    const cible = ouverts.find(t => t.url && t.url.startsWith(serveur));
    if (cible) {
      await browser.tabs.update(cible.id, { url: adresse, active: true });
      await browser.windows.update(cible.windowId, { focused: true });
    } else {
      await browser.tabs.create({ url: adresse });
    }
    signal('✓', '#15803D');
  } catch (e) {
    signal('!', '#B91C1C');
    console.error('CLAIRE pour Authentic :', e && e.message ? e.message : e);
    browser.browserAction.setTitle({ title: 'Envoyer à CLAIRE — dernier envoi échoué : ' + (e && e.message ? e.message : 'erreur') });
    setTimeout(() => browser.browserAction.setTitle({ title: 'Envoyer à CLAIRE' }), 15000);
  }
});
