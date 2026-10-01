'use strict';

const champ = document.getElementById('serveur');
const etat = document.getElementById('etat');
const montrer = (texte, classe) => { etat.textContent = texte; etat.className = classe || ''; };

browser.storage.local.get('serveur').then(({ serveur }) => { if (serveur) champ.value = serveur; });

document.getElementById('enregistrer').addEventListener('click', async () => {
  let url;
  try { url = new URL(champ.value.trim()); } catch (e) { montrer('Adresse invalide (exemple : http://192.168.60.10:3000).', 'err'); return; }
  const serveur = url.origin;
  // Permission limitée à la machine de CLAIRE (tous ports) : demandée ici, au geste de l'utilisateur.
  const accorde = await browser.permissions.request({ origins: [url.protocol + '//' + url.hostname + '/*'] });
  if (!accorde) { montrer('Autorisation refusée : l’extension ne pourra pas joindre CLAIRE.', 'err'); return; }
  await browser.storage.local.set({ serveur });
  champ.value = serveur;
  try {
    const r = await fetch(serveur + '/api/health');
    const j = r.ok ? await r.json() : null;
    montrer(j && j.ok ? 'Enregistré — CLAIRE répond.' : 'Enregistré, mais CLAIRE ne répond pas comme prévu (' + r.status + ').', j && j.ok ? 'ok' : 'err');
  } catch (e) {
    montrer('Enregistré, mais CLAIRE est injoignable à cette adresse.', 'err');
  }
});
