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

// L'écran « Nouveau dossier » s'affiche à droite de la conversation (étude 24/10 : « monte-le à droite aussi »), comme les autres outils ;
// repli sur son onglet quand le panneau ne peut pas le monter. Déjà monté : rien à faire.
function montrerNouveauDossierAgent() {
  if (outilsMontesAssistant.nouveau) return;
  if (outilMontableAssistant('nouveau') && ecranAffiche('assistant')) {
    const id = ouvrirOutilArtefactAssistant('Nouveau dossier', null, () => ouvrirOutilClaireAgent('nouveau_dossier', null), { onglet: 'nouveau', outil: 'nouveau_dossier' });
    monterOutilAssistant(id);
    return;
  }
  definirOnglet('nouveau');
}

// Étape « Authentic » : les dossiers ouverts dans Authentic aujourd'hui (extension « CLAIRE pour Authentic »), relus à l'instant, avec de
// quoi choisir (résumé, déjà suivi dans CLAIRE ou non, succession). `authentic_id` est le rang dans cette liste pour cette session.
async function listerDossiersAuthenticAgent() {
  montrerNouveauDossierAgent();
  await chargerRelevesAuthenticRecents();
  const liste = groupesAuthenticRecents.map((g, i) => ({
    authentic_id: String(i), intitule: g.intitule, resume: resumeGroupeAuthentic(g), reference: g.reference || '',
    deja_dans_claire: !!dossierPourIntituleAuthentic(g.intitule, dossiers, g.adresse, g.reference), a_creer: !!g.aCreer,
    succession: RE_INTITULE_SUCCESSION_AUTHENTIC.test(g.intitule || '') || !!(g.export && g.export.type === 'succession')
  })).slice(0, 30);
  return { nombre: liste.length, dossiers_authentic: liste,
    ...(liste.length ? {} : { raison: 'aucune page de dossier relevée dans Authentic ces dernières 24 h : l’utilisateur doit ouvrir la page du dossier dans Authentic (extension « CLAIRE pour Authentic »), puis les fiches vendeur, acquéreur et bien' }) };
}

// Pure ou presque : le « fichier » que lit `traiterFichierPdf` — la pièce jointe elle-même, ou le PDF du NAS récupéré par le serveur
// (même route que « Compléter le dossier » avec le compromis du NAS) ; null si le document n'est pas un PDF connu.
async function fichierCompromisAgent(doc) {
  if (!doc) return null;
  if (doc.sorte === 'joint') return doc.sortePiece === 'pdf' && doc.fichier ? doc.fichier : null;
  if (doc.sorte !== 'fichier' || !doc.chemin || !/\.pdf$/i.test(String(doc.chemin))) return null;
  const r = await fetchAvecAuth((doc.libre ? '/api/nas-libre/pdf?chemin=' : '/api/nas/fichier?chemin=') + encodeURIComponent(doc.chemin));
  if (!r.ok) throw new Error(`lecture impossible (${r.status})`);
  const buffer = await r.arrayBuffer();
  return { name: String(doc.chemin).split(/[\\/]/).pop() || 'compromis.pdf', arrayBuffer: async () => buffer };
}

async function nouveauDossierDepuisCompromisAgent(entree) {
  const e = entree || {};
  if (e.mode === 'authentic') return listerDossiersAuthenticAgent();
  if (e.mode === 'creer') return creerNouveauDossierAgent(e);
  const sansPdf = !e.document_id;
  const doc = documentsAgentConnus[e.document_id];
  // Le compromis : un PDF joint au message (pj1…) OU un PDF du dossier du NAS rendu par documents_du_dossier / nas_libre (étude 24/10 :
  // « à la création d'une vente, si je demande à Claire de récupérer le compromis dans le dossier NAS »).
  let fichierCompromis = null;
  if (!sansPdf) {
    try { fichierCompromis = await fichierCompromisAgent(doc); } catch (err) { return { erreur: 'le compromis n’a pas pu être récupéré : ' + String(err && err.message || err).slice(0, 120) }; }
    if (!fichierCompromis) return { erreur: 'document_id inconnu : le compromis doit être un PDF joint au message (pj1, pj2…) ou un PDF du dossier du NAS (document_id rendu par documents_du_dossier)' };
  }
  if (sansPdf && !e.authentic_id) return { erreur: 'joins le compromis (document_id) ou choisis un dossier d’Authentic (authentic_id, rendu par le mode « authentic »)' };
  montrerNouveauDossierAgent();
  await chargerRelevesAuthenticRecents();
  const choisi = e.authentic_id ? groupesAuthenticRecents[Number(e.authentic_id)] : null;
  if (e.authentic_id && !choisi) return { erreur: 'authentic_id inconnu : relis la liste avec le mode « authentic »' };
  if (sansPdf) {
    // Sans compromis : Authentic seul (dates butoir à saisir), vente ou succession.
    choisirModeImport('seul');
    creerDepuisAuthentic(Number(e.authentic_id));
    noterVerificationPoste('assistant-nouveau-dossier', { detail: 'dossier d’Authentic repris sans compromis' });
    return { pret: true, authentic_repris: true, compromis_lu: false, ...resumeFormulaireNouveauDossierAgent(),
      suite: 'le formulaire est à l’étape « Vérifier » (sans compromis : dates butoir à saisir si besoin) ; crée-le avec le mode « creer » (autorisation) ou laisse l’utilisateur le relire' };
  }
  if (typeof traiterFichierPdf !== 'function') return { erreur: 'lecture indisponible' };
  choisirModeImport('pdf');
  await traiterFichierPdf(fichierCompromis);
  if (!dernierTexteTraite) { noterVerificationPoste('assistant-nouveau-dossier', { ok: false, message: 'compromis illisible' }); return { erreur: 'le PDF n’a pas pu être lu (texte absent ou illisible)' }; }
  if (e.responsable) { const r = document.getElementById('f-responsable'); if (r) { const v = String(e.responsable).trim(); if ([...r.options || []].some(o => o.value === v)) r.value = v; } }
  const nomLu = champNouveauDossierAgent('f-nom');
  const tries = groupesAuthenticPourCompromis(groupesAuthenticRecents, nomLu);
  const correspond = (g) => !!nomLu && scoreDossierAuthentic(g.intitule, '', { nom: nomLu }).score >= SEUIL_DOSSIER_AUTHENTIC;
  const existantDe = (g) => dossierPourIntituleAuthentic(g.intitule, dossiers, g.adresse, g.reference);
  // Le dossier d'Authentic choisi par l'agent (après le mode « authentic »), sinon celui qui correspond de façon certaine.
  const trouve = choisi ? { i: Number(e.authentic_id) } : dossierAuthenticPourCompromis(tries, correspond, existantDe);
  const deja = tries.find(x => correspond(x.g) && existantDe(x.g));
  if (!trouve) {
    noterVerificationPoste('assistant-nouveau-dossier', { ok: false, message: 'aucun dossier d’Authentic ne correspond' });
    return { pret: false, compromis_lu: true, ...resumeFormulaireNouveauDossierAgent(),
      raison: deja ? 'un dossier correspondant existe déjà dans CLAIRE : le compromis peut le compléter depuis sa fiche (« Compléter »)'
        : 'aucun dossier d’Authentic ne correspond de façon certaine : liste ceux d’Authentic (mode « authentic ») et rappelle « preparer » avec authentic_id, ou demande à l’utilisateur d’ouvrir la page du dossier dans Authentic (compromis lu, formulaire ouvert)' };
  }
  creerDepuisAuthentic(trouve.i);
  noterVerificationPoste('assistant-nouveau-dossier', { detail: 'compromis lu, dossier d’Authentic repris' });
  return { pret: true, compromis_lu: true, authentic_repris: true, ...resumeFormulaireNouveauDossierAgent(),
    suite: 'le formulaire est à l’étape « Vérifier » : l’utilisateur peut le relire et cliquer « Ajouter le dossier », ou tu peux le créer avec mode « creer » (carte d’autorisation)' };
}

async function creerNouveauDossierAgent() {
  if (!exportAuthenticActuel) return { erreur: 'aucun nouveau dossier n’est prêt : prépare-le d’abord (mode « preparer »)' };
  const r = resumeFormulaireNouveauDossierAgent();
  if (!r.champs.nom) return { erreur: 'le nom du dossier est vide : l’utilisateur doit le renseigner dans le formulaire' };
  const description = `Créer le dossier « ${libelleDossierParNom(r.champs.nom)} » avec les données d’Authentic${dernierTexteTraite ? ' et du compromis' : ''}.\n${r.a_completer.length ? 'Non renseigné : ' + r.a_completer.join(', ').replace(/_/g, ' ') + '.' : 'Tous les champs principaux sont renseignés.'}`;
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

// « Demander à CLAIRE » et l'agent Yousign (étude 24/10 : « que CLAIRE puisse travailler aussi avec l'agent API Youtrust ») : brouillon de la
// signature du RIB d'un acquéreur (après la carte « Autoriser »), ou état de la demande déjà créée. Le signataire est pris sur la fiche par
// le poste : l'IA ne voit ni ne donne aucun nom, email ou numéro. Jamais d'envoi : l'étude vérifie et envoie dans Yousign.
async function yousignRibAgent(entree) {
  const e = entree || {};
  const d = dossiers.find(x => x.id === e.dossier_id);
  if (!d) return { erreur: 'dossier introuvable : cherche-le d’abord (chercher_dossiers)' };
  if (e.action === 'statut') {
    if (!d.signatureRib || !d.signatureRib.id) return { erreur: 'aucun brouillon de signature n’a été créé depuis CLAIRE pour ce dossier' };
    try {
      const r = await fetchAvecAuth('/api/signature-rib/statut', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: d.signatureRib.id }) });
      const j = await r.json().catch(() => ({}));
      return r.ok && j.ok ? { statut: j.statut, brouillon_cree_le: d.signatureRib.le || '' } : { erreur: (j && j.raison) || 'état illisible' };
    } catch (err) { return { erreur: 'le serveur n’a pas répondu' }; }
  }
  const liste = acquereursSignatureRib(d);
  const choisi = liste[Math.max(1, Number(e.acquereur) || 1) - 1];
  if (!choisi) return { erreur: 'aucun acquéreur à ce rang dans la fiche' };
  const s = signataireRibDePartie(d, choisi.partie);
  const manques = manquesSignatureRib(s);
  if (manques.length) return { erreur: `il manque sur la fiche : ${manques.join(', ')}` };
  if (signatureRibAuto !== true) return { erreur: 'l’agent Yousign n’est pas utilisable : clé d’API Claude des Réglages absente ou refusée' };
  const description = `Préparer dans Yousign le brouillon « Signature d’attestation et envoi de RIB » pour ${s.prenom} ${s.nom} (${libelleDossierAffiche(d)}). Rien n’est envoyé : vous le vérifiez dans Yousign. Prénom, nom, email et portable partent en clair à l’agent Yousign d’Anthropic.`;
  if (!(await demanderAutorisationAgent(description))) return { refuse: true, message: 'l’utilisateur a refusé : ne le refais pas sans nouvelle demande' };
  try {
    const r = await fetchAvecAuth('/api/signature-rib/brouillon', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok && j.url) { noterSignatureRibDemandee(d.id, j); return { cree: true, lien: j.url, rappel: 'brouillon seulement : l’étude le vérifie et l’envoie dans Yousign' }; }
    return { cree: false, erreur: (j && j.raison) || 'le brouillon n’a pas pu être préparé' };
  } catch (err) { return { cree: false, erreur: 'le serveur n’a pas répondu : vérifier dans Yousign si un brouillon a été créé avant de recommencer' }; }
}
