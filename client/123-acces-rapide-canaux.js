// Accès rapide aux discussions dans la barre latérale (étude 26/10 : « met un accès rapide dans la sidebar aux conversations de
// nous quatre et au canal général ») : sous « Discussions », une ligne « Général » et une ligne par collègue (le message privé de
// l'équipe à deux : Julie, Jérémy, Sophie…), avec la pastille des messages non lus du canal. Les canaux viennent de la liste que
// client/114 relit déjà (aucune requête de plus) ; un clic ouvre Discussions sur ce canal.

// Pure : les lignes à montrer, dans l'ordre — Général, puis chaque collègue dont le message privé existe dans la liste.
// `nonLus` suit la règle de la pastille de l'étincelle : un canal muet ne compte rien, « mentions » ne compte que les mentions.
function lignesAccesRapideCanaux(liste, collaborateurs, moi) {
  const l = Array.isArray(liste) ? liste : [];
  const compte = (c) => (c.notif === 'muet' ? 0 : c.notif === 'mentions' ? Number(c.mentions) || 0 : Number(c.nonLus) || 0);
  const general = l.find(c => c.id === 'general') || { id: 'general' };
  /** @type {{ id: string, libelle: string, titre: string, nom: string, nonLus: number }[]} */
  const lignes = [{ id: 'general', libelle: 'Général', titre: 'Canal général de l’étude', nom: '', nonLus: compte(general) }];
  for (const nom of Array.isArray(collaborateurs) ? collaborateurs : []) {
    if (!nom || nom === moi) continue;
    const c = l.find(x => x.prive && Array.isArray(x.membres) && x.membres.length === 2 && x.membres.includes(moi) && x.membres.includes(nom));
    if (!c) continue;
    const prenom = String(nom).split(/\s+/)[0];
    lignes.push({ id: c.id, libelle: prenom, titre: `Message privé avec ${prenom}`, nom, nonLus: compte(c) });
  }
  return lignes;
}

function majAccesRapideCanaux() {
  const zone = document.getElementById('sidebar-acces-canaux');
  if (!zone) return;
  if (!utilisateurPoste || !canaux.charge) { zone.style.display = 'none'; zone.textContent = ''; zone.dataset.rendu = ''; return; }
  const surDiscussions = ecranAffiche('assistant');
  const lignes = lignesAccesRapideCanaux(canaux.liste, canaux.collaborateurs && canaux.collaborateurs.length ? canaux.collaborateurs : RESPONSABLES, utilisateurPoste);
  const html = lignes.map((x) => {
    const actif = surDiscussions && canaux.actif === x.id;
    const marque = x.nom ? htmlPresence(x.nom) : '<span class="sb-canal-marque" aria-hidden="true">#</span>';
    const initiale = x.nom ? x.libelle.charAt(0).toUpperCase() : '#';
    return `<button type="button" class="sidebar-link sidebar-sousmenu-item sb-canal${actif ? ' actif' : ''}${x.nonLus ? ' non-lu' : ''}" onclick="ouvrirAccesRapideCanal('${escapeOnclickArg(x.id)}')" title="${escapeAttr(x.titre)}" aria-label="${escapeAttr(x.titre + (x.nonLus ? `, ${x.nonLus} non lu${x.nonLus > 1 ? 's' : ''}` : ''))}"${actif ? ' aria-current="true"' : ''}>`
      + `${marque}<span class="sb-canal-initiale" aria-hidden="true">${escapeHtml(initiale)}</span><span class="sb-canal-nom">${escapeHtml(x.libelle)}</span>`
      + `${x.nonLus ? `<span class="sidebar-badge-notif">${x.nonLus > 99 ? '99+' : x.nonLus}</span>` : ''}</button>`;
  }).join('');
  // Rien à redessiner si rien n'a changé : le focus clavier d'une ligne reste en place (relecture 0.356.0).
  if (zone.dataset.rendu !== html) { zone.innerHTML = html; zone.dataset.rendu = html; }
  zone.style.display = '';
}

function ouvrirAccesRapideCanal(id) {
  definirOnglet('assistant');
  setTimeout(() => ouvrirCanal(id), 0);
}
