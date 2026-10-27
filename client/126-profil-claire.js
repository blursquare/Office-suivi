// CLAIRE, une collègue dans les Discussions (étude 26/10 : « transforme À traiter en un profil individuel de Claire où elle interagit avec
// nous : on voit sa photo de profil, son statut, et on lui écrit sous forme d'échange ; place-la dans les discussions comme une collègue »).
// Sa conversation est la conversation personnelle de « Demander à CLAIRE » (même agent, mêmes outils). Sa ligne de la liste des Discussions est
// celle d'une collaboratrice — son nom seul, ni statut ni rôle (étude 27/10) ; plus d'en-tête au-dessus de la conversation (étude 27/10 : « fait doublon » avec sa présentation).
// Étude 27/10 : « la discussion individuelle avec CLAIRE est juste une conversation, pas de tâches au-dessus », « laisser les tâches de dossier
// dans la conversation du dossier » — les propositions des routines vivent dans le canal de leur dossier (ou « général »), avec leur carte ;
// ici, les notifications de l'office (client/129) et les échanges, à leur heure. L'ancien lien `@traiter` mène encore ici.

// L'avatar de CLAIRE (disque sombre, étoile) avec son point « en ligne » : le même partout où elle apparaît comme une collègue.
function htmlAvatarProfilClaire() {
  return `<span class="pf-claire-av" aria-hidden="true">${icone('discussion')}<span class="cx-pres en-ligne" title="En ligne"></span></span>`;
}

// Ouvre la conversation de CLAIRE depuis la barre latérale ou la liste des discussions.
function ouvrirProfilClaire() {
  definirOnglet('assistant');
  setTimeout(() => {
    if (typeof quitterCanal === 'function') quitterCanal();
    if (typeof renderAssistant === 'function') renderAssistant();
    if (typeof chargerTravauxClaire === 'function') chargerTravauxClaire();
    if (typeof marquerMessagesClaireLus === 'function') marquerMessagesClaireLus();
    const champ = document.getElementById('assistant-saisie');
    if (champ) champ.focus();
  }, 0);
}

// Ses travaux en arrière-plan, mêlés aux étapes du travail en cours dans le bloc « Son travail » de la colonne de droite (étude 27/10 :
// « faire un mix entre étapes du travail et ses travaux ») ; on les lui confie par la zone de saisie (client/128). '' hors de son espace.
function htmlTravauxColonneClaire() {
  if (POSTE_CLAIRE || canaux.actif || !estAdministrateur(utilisateurPoste)) return '';
  return htmlTravauxClaire();
}
