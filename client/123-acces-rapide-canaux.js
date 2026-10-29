// Accès rapide aux discussions dans la barre latérale (étude 26/10 : « met un accès rapide dans la sidebar aux conversations de
// nous quatre et au canal général ») : sous « Discussions », une ligne « Général » et une ligne par collègue (le message privé de
// l'équipe à deux : Julie, Jérémy, Sophie…), avec la pastille des messages non lus du canal. Les canaux viennent de la liste que
// client/114 relit déjà (aucune requête de plus) ; un clic ouvre Discussions sur ce canal.

// Pure : les lignes à montrer, dans l'ordre — Général, puis chaque collègue dont le message privé existe dans la liste.
// `nonLus` suit la règle de la pastille de l'étincelle : un canal muet ne compte rien, « mentions » ne compte que les mentions.
function lignesAccesRapideCanaux(liste, collaborateurs, moi, aDecider, attenteGeneral) {
  const l = Array.isArray(liste) ? liste : [];
  const compte = (c) => (c.notif === 'muet' ? 0 : c.notif === 'mentions' ? Number(c.mentions) || 0 : Number(c.nonLus) || 0);
  const general = l.find(c => c.id === 'general') || { id: 'general' };
  /** @type {{ id: string, libelle: string, titre: string, nom: string, nonLus: number, attente?: number, claire?: boolean }[]} */
  const lignes = [{ id: 'general', libelle: 'Général', titre: 'Canal général de l’étude', nom: '', nonLus: compte(general), attente: Math.max(0, Number(attenteGeneral) || 0) }];
  for (const nom of Array.isArray(collaborateurs) ? collaborateurs : []) {
    if (!nom) continue;
    if (nom === moi) continue;   // soi-même : plus de ligne « vous », la conversation personnelle est celle de CLAIRE
    const c = l.find(x => x.prive && Array.isArray(x.membres) && x.membres.length === 2 && x.membres.includes(moi) && x.membres.includes(nom));
    if (!c) continue;
    const prenom = String(nom).split(/\s+/)[0];
    lignes.push({ id: c.id, libelle: prenom, titre: `Message privé avec ${prenom}`, nom, nonLus: compte(c) });
  }
  // CLAIRE parmi les collègues, pas à l'écart (étude 26/10) : sa conversation est la conversation personnelle ; la pastille = ses messages non lus
  // (les propositions sont dans le canal de leur dossier, étude 27/10).
  lignes.push({ id: 'claire', libelle: 'Claire', titre: 'Conversation avec Claire', nom: '', nonLus: Math.max(0, Number(aDecider) || 0), claire: true });
  return lignes;
}

// Pure : le rendu sans les identifiants de masque numérotés des icônes (ils changent à chaque dessin sans rien changer à l'écran).
function cleRenduAccesRapide(html) {
  return String(html || '').replace(/(id="|url\(#)([a-z-]+)-\d+/g, '$1$2');
}

function majAccesRapideCanaux() {
  const zone = document.getElementById('sidebar-acces-canaux');
  if (!zone) return;
  if (!utilisateurPoste || !canaux.charge) { zone.style.display = 'none'; zone.textContent = ''; zone.dataset.rendu = ''; return; }
  const surDiscussions = ecranAffiche('assistant');
  const lignes = lignesAccesRapideCanaux(canaux.liste, canaux.collaborateurs && canaux.collaborateurs.length ? canaux.collaborateurs : RESPONSABLES, utilisateurPoste, messagesClaireEtat.nonLus || 0, propositionsEnAttente('general').attente.length);
  const html = lignes.map((x) => {
    const actif = surDiscussions && (x.claire ? !canaux.actif : canaux.actif === x.id);
    // Petit avatar encadré : photo ou initiale, point de présence en bas à droite (vert = en ligne, vide = hors ligne) ; « # » encadré pour Général.
    const initiales = x.nom ? x.libelle.charAt(0).toUpperCase() : '#';
    const marque = x.claire ? htmlAvatarProfilClaire()
      : x.nom
      ? htmlAvatarPresence(x.nom)
      : '<span class="sb-canal-avatar sb-canal-diese" aria-hidden="true">#</span>';
    const initiale = initiales;
    return `<button type="button" class="sidebar-link sidebar-sousmenu-item sb-canal${actif ? ' actif' : ''}${x.nonLus ? ' non-lu' : ''}" onclick="ouvrirAccesRapideCanal('${escapeOnclickArg(x.id)}')" title="${escapeAttr(x.titre)}" aria-label="${escapeAttr(x.titre + (x.nonLus ? `, ${x.nonLus} non lu${x.nonLus > 1 ? 's' : ''}` : ''))}"${actif ? ' aria-current="true"' : ''}>`
      + `${marque}<span class="sb-canal-initiale" aria-hidden="true">${escapeHtml(initiale)}</span><span class="sb-canal-nom">${escapeHtml(x.libelle)}</span>`
      + `${x.nonLus ? `<span class="sidebar-badge-notif">${x.nonLus > 99 ? '99+' : x.nonLus}</span>` : ''}`
      + `${x.attente ? `<span class="sidebar-badge-notif sidebar-badge-attente" title="${escapeAttr(`${x.attente} proposition${x.attente > 1 ? 's' : ''} en attente de votre décision`)}">${x.attente}</span>` : ''}</button>`;
  }).join('');
  // Rien à redessiner si rien n'a changé : le focus clavier d'une ligne reste en place (relecture 0.356.0). L'icône de CLAIRE porte un
  // identifiant de masque numéroté à chaque dessin (`claire-discussions-N`) : comparé sans lui, sinon le bloc était refait toutes les
  // 30 s et clignotait (étude 27/10).
  const empreinte = cleRenduAccesRapide(html);
  if (zone.dataset.rendu !== empreinte) { zone.innerHTML = html; zone.dataset.rendu = empreinte; }
  zone.style.display = '';
}

function ouvrirAccesRapideCanal(id) {
  definirOnglet('assistant');
  if (id === 'claire') { ouvrirProfilClaire(); return; }
  setTimeout(() => ouvrirCanal(id), 0);
}
