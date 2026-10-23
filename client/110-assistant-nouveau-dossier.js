// « Demander à CLAIRE » prépare seul un nouveau dossier de vente (étude 24/10 : « que CLAIRE sache remplir seul un nouveau dossier de
// vente en lui uploadant un compromis ou une promesse »). Même chemin que « Nouveau dossier › Compromis (PDF) » : le PDF joint au message
// est lu par le poste (texte, OCR d'un scan), le dossier d'Authentic qui correspond est repris, le formulaire « Vérifier » est rempli.
// Un nouveau dossier se crée toujours depuis Authentic (étude 18/10) : sans dossier d'Authentic qui correspond, rien n'est créé et le
// formulaire reste à l'étape « Importer ». La création elle-même (mode « creer ») passe par la carte « Autoriser / Refuser ».

var DELAI_CREATION_DOSSIER_AGENT_MS = 4000;

function champNouveauDossierAgent(id) {
  const el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}

// Ce que le formulaire contient maintenant, au plus court : donné à l'agent (masqué par le serveur comme tout résultat d'outil).
function resumeFormulaireNouveauDossierAgent() {
  const champs = {
    nom: champNouveauDossierAgent('f-nom'), type_de_vente: champNouveauDossierAgent('f-type-vente'), role_de_l_etude: champNouveauDossierAgent('f-role-notaire'),
    responsable: champNouveauDossierAgent('f-responsable'), adresse_du_bien: champNouveauDossierAgent('f-adresse-bien'), prix_de_vente: champNouveauDossierAgent('f-prix-vente'),
    email_acquereur: champNouveauDossierAgent('f-email-acquereur'), email_vendeur: champNouveauDossierAgent('f-email-vendeur'), agence: champNouveauDossierAgent('f-nom-agence'),
    obtention_du_pret: champNouveauDossierAgent('f-pret'), date_butoir_acte: champNouveauDossierAgent('f-acte'), vente_prealable: champNouveauDossierAgent('f-ventebien')
  };
  return { champs, a_completer: Object.keys(champs).filter(k => !champs[k]) };
}

async function nouveauDossierDepuisCompromisAgent(entree) {
  const e = entree || {};
  const doc = documentsAgentConnus[e.document_id];
  if (e.mode === 'creer') return creerNouveauDossierAgent(e);
  if (!doc || doc.sortePiece !== 'pdf' || !doc.fichier) return { erreur: 'document_id inconnu : le compromis doit être un PDF joint au message (pj1, pj2…)' };
  if (typeof traiterFichierPdf !== 'function') return { erreur: 'lecture indisponible' };
  definirOnglet('nouveau');
  choisirModeImport('pdf');
  await chargerRelevesAuthenticRecents();
  await traiterFichierPdf(doc.fichier);
  if (!dernierTexteTraite) { noterVerificationPoste('assistant-nouveau-dossier', { ok: false, message: 'compromis illisible' }); return { erreur: 'le PDF n’a pas pu être lu (texte absent ou illisible)' }; }
  if (e.responsable) { const r = document.getElementById('f-responsable'); if (r) { const v = String(e.responsable).trim(); if ([...r.options || []].some(o => o.value === v)) r.value = v; } }
  const nomLu = champNouveauDossierAgent('f-nom');
  const tries = groupesAuthenticPourCompromis(groupesAuthenticRecents, nomLu);
  const correspond = (g) => !!nomLu && scoreDossierAuthentic(g.intitule, '', { nom: nomLu }).score >= SEUIL_DOSSIER_AUTHENTIC;
  const existantDe = (g) => dossierPourIntituleAuthentic(g.intitule, dossiers, g.adresse, g.reference);
  const trouve = dossierAuthenticPourCompromis(tries, correspond, existantDe);
  const deja = tries.find(x => correspond(x.g) && existantDe(x.g));
  if (!trouve) {
    noterVerificationPoste('assistant-nouveau-dossier', { ok: false, message: 'aucun dossier d’Authentic ne correspond' });
    return { pret: false, compromis_lu: true, ...resumeFormulaireNouveauDossierAgent(),
      raison: deja ? 'un dossier correspondant existe déjà dans CLAIRE : le compromis peut le compléter depuis sa fiche (« Compléter »)'
        : 'aucun dossier d’Authentic ne correspond de façon certaine : l’utilisateur doit ouvrir la page du dossier dans Authentic, puis choisir le dossier à l’étape « Importer » (le formulaire reste ouvert, compromis lu)' };
  }
  creerDepuisAuthentic(trouve.i);
  noterVerificationPoste('assistant-nouveau-dossier', { detail: 'compromis lu, dossier d’Authentic repris' });
  return { pret: true, compromis_lu: true, authentic_repris: true, ...resumeFormulaireNouveauDossierAgent(),
    suite: 'le formulaire est à l’étape « Vérifier » : l’utilisateur peut le relire et cliquer « Ajouter le dossier », ou tu peux le créer avec mode « creer » (carte d’autorisation)' };
}

async function creerNouveauDossierAgent() {
  if (!exportAuthenticActuel || !dernierTexteTraite) return { erreur: 'aucun nouveau dossier n’est prêt : prépare-le d’abord (mode « preparer »)' };
  const r = resumeFormulaireNouveauDossierAgent();
  if (!r.champs.nom) return { erreur: 'le nom du dossier est vide : l’utilisateur doit le renseigner dans le formulaire' };
  const description = `Créer le dossier « ${libelleDossierParNom(r.champs.nom)} » avec les données lues dans le compromis et dans Authentic.\n${r.a_completer.length ? 'Non renseigné : ' + r.a_completer.join(', ').replace(/_/g, ' ') + '.' : 'Tous les champs principaux sont renseignés.'}`;
  if (!(await demanderAutorisationAgent(description))) return { refuse: true, message: 'l’utilisateur a refusé : ne le refais pas sans nouvelle demande' };
  const avant = new Set(dossiers.map(d => d.id));
  await ajouterDossier();
  const limite = Date.now() + DELAI_CREATION_DOSSIER_AGENT_MS;
  let cree = dossiers.find(d => !avant.has(d.id));
  while (!cree && Date.now() < limite) { await new Promise(res => setTimeout(res, 200)); cree = dossiers.find(d => !avant.has(d.id)); }
  if (!cree) {
    const erreur = document.getElementById('form-error');
    return { cree: false, raison: (erreur && erreur.style.display !== 'none' && erreur.textContent) || 'une confirmation ou une correction est demandée à l’écran : l’utilisateur doit la valider dans le formulaire' };
  }
  return { cree: true, dossier_id: cree.id, libelle: libelleDossierAffiche(cree) };
}
