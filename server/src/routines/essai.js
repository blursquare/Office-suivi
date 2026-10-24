// @ts-check
'use strict';
// Routine « essai » (phase 0) : dépose une proposition de chaque sorte dans la boîte du collaborateur qui la lance, pour voir à quoi
// ressemblera le travail de CLAIRE. Aucun dossier réel, aucun nom de client ; chaque exemple est marqué « Exemple ».

/** @param {{ responsable: string, jour: string }} contexte @returns {any[]} */
function proposerExemples(contexte) {
  const base = { routine: 'essai', responsable: contexte.responsable, exemple: true };
  const empreinte = (type) => `essai:${type}:${contexte.responsable}:${contexte.jour}`;
  const id = (type) => `essai-${type}-${contexte.jour}-${contexte.responsable.replace(/[^A-Za-z0-9]+/g, '-')}`;
  return [
    Object.assign({}, base, { id: id('email'), type: 'email', action: 'email', empreinte: empreinte('email'),
      titre: 'Exemple · Relance de l’offre de prêt',
      resume: 'Un brouillon d’email prêt à relire. Rien ne part sans votre clic sur « Envoyer ».',
      details: { destinataire: '', sujet: 'Exemple de brouillon préparé par CLAIRE', corps: 'Bonjour,\n\nCeci est un exemple de brouillon préparé par CLAIRE : vous le relisez, vous le corrigez si besoin, puis vous cliquez sur « Envoyer ».\n\nBien cordialement,' } }),
    Object.assign({}, base, { id: id('document'), type: 'document', action: 'outil', empreinte: empreinte('document'),
      titre: 'Exemple · Courrier d’appel de fonds',
      resume: 'Un document préparé d’après les données du dossier, ouvert dans son outil pour validation.',
      details: { outil: 'appel-fonds' } }),
    Object.assign({}, base, { id: id('tache'), type: 'tache', action: 'tache', empreinte: empreinte('tache'),
      titre: 'Exemple · Relancer le syndic pour l’état daté',
      resume: 'Une tâche posée dans votre liste « À faire » une fois autorisée.',
      details: { libelle: 'Exemple : relancer le syndic pour l’état daté' } }),
    Object.assign({}, base, { id: id('alerte'), type: 'alerte', action: 'vu', empreinte: empreinte('alerte'),
      titre: 'Exemple · Fiche de signature prête',
      resume: 'Une information à lire : « Vous pouvez imprimer la fiche, 2 conditions restent à lever. »' })
  ];
}

module.exports = { proposerExemples };
