// CLAIRE, une collègue dans les Discussions (étude 26/10 : « transforme À traiter en un profil individuel de Claire où elle interagit avec
// nous : on voit sa photo de profil, son statut, et on lui écrit sous forme d'échange ; place-la dans les discussions comme une collègue »).
// Sa conversation est la conversation personnelle de « Demander à CLAIRE » (même agent, mêmes outils) ; en tête, un profil (avatar, statut) et ce
// qu'elle a anticipé : les propositions des routines qui attendent MA décision, écrites comme des messages d'elle avec leur carte
// « Autoriser / Plus tard / Déjà fait ». Remplace la vue « À traiter » (l'ancien lien `@traiter` y mène).

// Pure : le statut de CLAIRE — `ecrit` si elle répond, sinon ce qu'elle a préparé pour la personne.
function statutProfilClaire(nbADecider, enCours) {
  const n = Math.max(0, Number(nbADecider) || 0);
  if (enCours) return { etat: 'ecrit', texte: 'Écrit…' };
  if (n) return { etat: 'anticipe', texte: `J’ai anticipé ${n} chose${n > 1 ? 's' : ''} pour vous` };
  return { etat: 'libre', texte: 'En ligne · rien à décider' };
}

// L'avatar de CLAIRE (disque sombre, étoile) avec son point « en ligne » : le même partout où elle apparaît comme une collègue.
function htmlAvatarProfilClaire(grand) {
  return `<span class="pf-claire-av${grand ? ' pf-grand' : ''}" aria-hidden="true">${icone('discussion')}<span class="cx-pres en-ligne" title="En ligne"></span></span>`;
}

// Les propositions à décider, écrites comme des messages de CLAIRE : « j'ai anticipé… », puis une carte par proposition.
function htmlAnticipationsClaire() {
  const liste = propositionsClaire.liste;
  const reportees = propositionsClaire.reportees || [];
  const surtitre = (p) => {
    const d = p.dossierId ? dossiers.find(x => x.id === p.dossierId) : null;
    return d ? `<button type="button" class="pf-dossier" onclick="ouvrirCanal('d:${escapeOnclickArg(d.id)}')" title="Ouvrir le canal du dossier">${icone('folder')}${escapeHtml(libelleDossierAffiche(d))}</button>` : '';
  };
  const message = (texte, cartes) => `<div class="cx-m cx-claire pf-message">${avatarClaireHtml()}<div class="cx-corps"><div class="cx-nom">Claire</div><p class="pf-texte">${texte}</p>${cartes}</div></div>`;
  const prenom = typeof prenomPosteAssistant === 'function' ? prenomPosteAssistant() : '';
  let html = '';
  if (liste.length) {
    html += message(`${prenom ? `Bonjour ${escapeHtml(prenom)}, ` : ''}j’ai anticipé ${liste.length} chose${liste.length > 1 ? 's' : ''} pour vous faire gagner du temps. Rien ne part sans votre clic.`,
      liste.map(p => `<div class="pf-item">${surtitre(p)}${carteProposition(p, { compacte: true })}</div>`).join(''));
  }
  if (reportees.length) {
    html += message(`Vous m’avez demandé de revenir plus tard sur ${reportees.length} chose${reportees.length > 1 ? 's' : ''}.`,
      `<details class="pf-reportees"><summary>Voir ce qui est reporté</summary>${reportees.map(p => `<div class="pf-item">${surtitre(p)}${carteProposition(p, { compacte: true })}</div>`).join('')}</details>`);
  }
  return html;
}

// L'en-tête du profil : avatar, nom, statut.
function htmlProfilClaire() {
  const s = statutProfilClaire(propositionsClaire.liste.length, assistantEnCours);
  return `<header class="pf-claire">${htmlAvatarProfilClaire(true)}<div class="pf-claire-id"><h2 class="pf-claire-nom">CLAIRE</h2>
    <p class="pf-claire-role">Collègue de l’étude · assistante</p><p class="pf-claire-statut pf-${escapeAttr(s.etat)}">${escapeHtml(s.texte)}</p></div></header>`;
}

// Ouvre la conversation de CLAIRE depuis la barre latérale ou la liste des discussions.
function ouvrirProfilClaire() {
  definirOnglet('assistant');
  setTimeout(() => {
    if (typeof quitterCanal === 'function') quitterCanal();
    if (typeof renderAssistant === 'function') renderAssistant();
    const champ = document.getElementById('assistant-saisie');
    if (champ) champ.focus();
  }, 0);
}
