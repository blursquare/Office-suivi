// Actes d'état civil dans la fiche d'un dossier (étude 29/10) : demander l'acte de naissance et/ou de mariage par Comedec (un seul acte à la fois),
// ou PAR PAPIER à la mairie quand elle n'a pas Comedec — courrier du modèle de l'étude, Word et PDF —, et lire l'état hypothécaire. Les demandes
// papier sont celles que la page du dossier d'Authentic montre en « APR » (d.authentic.etatsCivilsPapier, client/30) ; la Constitution de dossier
// (client/72) propose les mêmes courriers pour chaque personne. Jamais une donnée devinée : lieu, date ou conjoint absents = « À compléter ».

// Pure : la fiche client d'Authentic d'une partie (par prénom et nom), ou null.
function ficheClientDeLaPartie(d, p) {
  const fiches = (d && d.authentic && d.authentic.fichesClients) || {};
  const complet = [p && p.prenom, p && p.nom].filter(Boolean).join(' ');
  const cle = normaliserPourRecherche(complet).replace(/[^a-z0-9]+/g, ' ').trim();
  if (!cle) return null;
  return fiches[cle] || Object.values(fiches).find(f => f && normaliserPourRecherche(f.nom || '').replace(/[^a-z0-9]+/g, ' ').trim() === cle) || null;
}

// Pure : mêmes prénom et nom (mots entiers, sans accent ni casse) ?
function memeNomPrenomEtatCivil(a, b) {
  const mots = (x) => normaliserPourRecherche([x && x.prenom, x && x.nom].filter(Boolean).join(' ')).split(/[^a-z0-9]+/).filter(Boolean).sort().join(' ');
  return !!mots(a) && mots(a) === mots(b);
}

// Pure : ce qu'il faut à un courrier d'état civil pour une personne — { nom, feminin, naissanceDate, naissanceLieu, mariageDate, conjoint }.
// `p` : { nom, prenom } (partie de la fiche) ; `extra` : valeurs déjà connues (défunt d'une succession).
function donneesEtatCivilPersonne(d, p, extra) {
  const f = ficheClientDeLaPartie(d, p) || {};
  const e = extra || {};
  const sm = f.situationMatrimoniale || null;
  // Civilité : la fiche client d'Authentic, sinon celle de la partie sur la fiche CLAIRE ; inconnue = « Né(e) » sur le courrier (jamais devinée d'après le prénom).
  const partie = (Array.isArray(d && d.parties) ? d.parties : []).find(x => x && memeNomPrenomEtatCivil(x, p));
  const civilite = String(f.civilite || p.civilite || (partie && partie.civilite) || '').toLowerCase();
  const nomFamille = f.nomFamille || p.nom || '';
  const prenoms = [f.prenom || p.prenom, f.autresPrenoms].filter(Boolean).join(' ');
  return {
    nom: [prenoms, nomFamille].filter(Boolean).join(' ').trim() || String(p.nom || '').trim(),
    feminin: /^(mme|madame|m(lle|ademoiselle))/.test(civilite) ? true : /^(m|monsieur)\.?$/.test(civilite) ? false : undefined,
    naissanceDate: e.naissanceDate || f.dateNaissance || '', naissanceLieu: e.naissanceLieu || f.lieuNaissance || '',
    mariageDate: e.mariageDate || (sm && (sm.dateMariage || sm.date)) || '', conjoint: e.conjoint || (sm && sm.conjoint) || ''
  };
}

// Pure : le courrier d'un acte pour une personne, au format des courriers fidèles (commun/courriers-etat-civil.js).
function documentEtatCivilPersonne(d, p, type, dateIso, extra) {
  const x = donneesEtatCivilPersonne(d, p, extra);
  return documentCourrierEtatCivil(type, { nom: x.nom, feminin: x.feminin, naissanceDate: x.naissanceDate, mariageDate: x.mariageDate, conjoint: x.conjoint,
    mairie: type === 'naissance' ? { commune: x.naissanceLieu } : { commune: (extra && extra.mariageLieu) || '' }, dateIso });
}

// Pure : les personnes d'un dossier pour lesquelles un acte peut être demandé — [{ cle, nom, prenom, role, naissance, mariage, extra }]. Vente : les parties que
// l'étude représente (mariage pour un seul des deux époux, comme Comedec) ; succession : le défunt (naissance, mariage s'il avait un conjoint) et les héritiers (naissance).
function personnesEtatCivilDossier(d) {
  if (!d) return [];
  const cleDe = (p) => normaliserPourRecherche([p.prenom, p.nom].filter(Boolean).join(' ')).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (estSuccession(d)) {
    const df = defuntConstitution(d).champs;
    const liste = [];
    if (df.nom) liste.push({ cle: cleDe({ prenom: df.prenoms, nom: df.nom }), nom: df.nom, prenom: df.prenoms, role: 'DEFUNT', naissance: true, mariage: !!df.conjointNom,
      extra: { naissanceDate: df.naissanceDate, naissanceLieu: df.naissanceLieu, conjoint: df.conjointNom } });
    (personnesSuccession(d).heritiers || []).forEach(h => { if (h && h.nom) liste.push({ cle: cleDe({ nom: h.nom }), nom: h.nom, prenom: '', role: 'HERITIER', naissance: true, mariage: false, extra: {} }); });
    return liste;
  }
  return partiesComedecDossier(d, {}).map(p => ({ cle: cleDe(p), nom: p.nom, prenom: p.prenom, role: p.role, naissance: true, mariage: !!p.marie, extra: {} }));
}

// Pure : les demandes PAPIER à faire, d'après les lignes « APR » d'Authentic — [{ id, type, libelle, personne }], la personne retrouvée par son nom ET son prénom
// dans le libellé de la ligne ; une ligne qui ne désigne personne n'est pas rattachée (jamais devinée) : `personne` null.
function demandesPapierDossier(d) {
  const lignes = Object.values((d && d.authentic && d.authentic.etatsCivilsPapier) || {});
  const personnes = personnesEtatCivilDossier(d);
  return lignes.filter(l => l && (l.type === 'naissance' || l.type === 'mariage')).map(l => {
    const net = normaliserPourRecherche(l.label || '');
    // Nom ET prénom (le premier prénom pour le défunt, dont la ligne ne porte pas toujours tous les prénoms) : le nom seul désignerait aussi un parent ou un conjoint.
    const trouvees = personnes.filter(p => libelleDitPersonne([net], { nom: p.nom, prenom: String(p.prenom || '').trim().split(/\s+/)[0] }));
    return { id: l.type + ':' + normaliserPourRecherche(l.label || '').replace(/[^a-z0-9]+/g, '-').slice(0, 40), type: l.type, libelle: String(l.label || ''), personne: trouvees.length === 1 ? trouvees[0] : null };
  });
}

// Un courrier d'un acte dans un format : { blob, nom, format }. Signé (tampon et signature « p/o ») : décision de l'étude, comme les courriers de la Constitution.
async function genererCourrierEtatCivil(d, personne, type, format, options) {
  const o = options || {};
  const doc = documentEtatCivilPersonne(d, { nom: personne.nom, prenom: personne.prenom }, type, isoAujourdhuiLocal(), personne.extra);
  const nom = nomFichierCourrierEtatCivil(type, [personne.prenom, personne.nom].filter(Boolean).join(' '));
  const signe = o.signe !== false;
  if (format === 'pdf') {
    const { blob } = await genererPdfAAppelFonds(null, nom + '.docx', { fidele: doc, refLignes: refLignesCourrier(d), ref: d.nom || '', signe });
    return { blob, nom: nom + '.pdf', format };
  }
  return { blob: await docxCourrierFidele(doc, d, { signe }), nom: nom + '.docx', format: 'docx' };
}

async function telechargerCourrierEtatCivil(dossierId, cle, type, format) {
  const d = dossiers.find(x => x.id === dossierId);
  if (!d) return;
  const personne = personnesEtatCivilDossier(d).find(p => p.cle === cle);
  if (!personne) { afficherToast('Personne introuvable sur la fiche.', 'OK', null); return false; }
  try {
    const r = await genererCourrierEtatCivil(d, personne, type, format);
    telechargerFichier(r.blob, r.nom);
    ajouterHistorique(d, `Demande papier d'acte de ${type === 'mariage' ? 'mariage' : 'naissance'} préparée (${format === 'pdf' ? 'PDF' : 'Word'}) : ${[personne.prenom, personne.nom].filter(Boolean).join(' ')}`);
    sauvegarder(d);
    const manque = (documentEtatCivilPersonne(d, { nom: personne.nom, prenom: personne.prenom }, type, isoAujourdhuiLocal(), personne.extra).adresse || []).includes('À compléter');
    afficherToast(manque ? `${r.nom} téléchargé : la mairie (code postal, lieu) est « À compléter »${format === 'pdf' ? ' — préférez le Word, modifiable' : ''}.` : `${r.nom} téléchargé.`, 'OK', null);
    return true;
  } catch (e) {
    console.error(e);
    afficherToast('Le courrier n’a pas pu être généré. La première fois, le poste doit avoir accès au réseau (une bibliothèque est téléchargée une seule fois).', 'OK', null);
    return false;
  }
}

// Demande Comedec d'UN acte depuis la fiche : confirmée par l'utilisateur (c'est son clic), Envoi immédiat éteint comme toujours.
function demanderActeEtatCivilFiche(dossierId, actes) {
  const d = dossiers.find(x => x.id === dossierId);
  if (!d) return;
  const quoi = actes === 'mariage' ? 'l’acte de mariage' : actes === 'naissance' ? 'l’acte de naissance' : 'les actes de naissance et de mariage';
  demanderConfirmation(`Créer dans Authentic la demande d’état civil (Comedec) pour ${quoi} des parties ? Création rapide, Envoi immédiat éteint : rien n’est envoyé, la demande reste à envoyer depuis Authentic.`, async () => {
    const r = await preparerFormaliteAuthentic(d, 'comedec', { agent: false, actes });
    if (r && r.fait && /papier|APR/i.test(String(r.resultat || ''))) afficherToast('Une demande papier est à faire : voir « Demandes papier » sur la fiche.', 'OK', null);
    // Déjà demandé, mais la demande précédente est fausse (un seul acte au lieu de tous, étude 30/10) : on peut recommencer.
    if ((r && r.fait && /d[ée]j[àa] demand[ée]/i.test(String(r.resultat || ''))) || (r && /d[ée]j[àa] pr[ée]par[ée]e par CLAIRE/i.test(String(r.erreur || '')))) refaireActeEtatCivilFiche(d, actes);
  }, { bouton: 'Créer la demande', ton: 'valider' });
}

// Casier judiciaire (CJN) des acquéreurs, depuis la Constitution de dossier d'une vente (étude 30/10 : « mettre aussi les demandes CJN pour les
// constitutions de vente ») : la même demande que l'agent et les routines (`preparerFormaliteAuthentic`), préparée dans Authentic sans envoi.
function demanderCjnFiche(dossierId) {
  const d = dossiers.find(x => x.id === dossierId);
  if (!d) return;
  const raison = raisonSansCjn(d);
  if (raison) { afficherToast('Pas de demande de casier ici : ' + raison + '.', 'OK', null); return; }
  demanderConfirmation('Créer dans Authentic la demande de casier judiciaire (CJN) des acquéreurs ? Création rapide, Envoi immédiat éteint : rien n’est envoyé, la demande est à envoyer ensuite depuis Authentic.', async () => {
    const r = await preparerFormaliteAuthentic(d, 'cjn', { agent: false });
    if (r && r.erreur) afficherToast(r.erreur, 'OK', null);
    render();
  }, { bouton: 'Créer la demande', ton: 'valider' });
}

function refaireActeEtatCivilFiche(d, actes) {
  demanderConfirmation('Une demande a déjà été préparée. La refaire (par exemple si la précédente ne portait que sur une partie) ? Seuls les actes qui n’y figurent pas encore sont demandés ; rien n’est envoyé.', async () => {
    const r = await preparerFormaliteAuthentic(d, 'comedec', { agent: false, actes, refaire: true });
    if (r && r.fait && /papier|APR/i.test(String(r.resultat || ''))) afficherToast('Une demande papier est à faire : voir « Demandes papier » sur la fiche.', 'OK', null);
  }, { bouton: 'Refaire la demande', ton: 'valider' });
}

// Lire l'état hypothécaire depuis la fiche : le clic vaut autorisation (pas de carte).
async function lireEhfDepuisFiche(dossierId) {
  const r = await etatHypothecaireAgent({ dossier_id: dossierId, relire: true, sansCarte: true });
  if (r && r.erreur) afficherToast(r.erreur, 'OK', null);
  else if (r && r.note) afficherToast(String(r.note).slice(0, 200), 'OK', null);
  render();
}

// Les boutons de la fiche (colonne des outils de l'onglet Dossier) + les demandes papier à faire.
function renderEtatCivilFiche(d) {
  if (!d || d.archive) return '';
  const bouton = (ic, libelle, onclick, titre) => `<wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="${onclick}" title="${escapeAttr(titre)}">${icone(ic)}${escapeHtml(libelle)}</wa-button>`;
  const personnes = personnesEtatCivilDossier(d);
  const succession = estSuccession(d);
  const boutons = [];
  if (!succession && personnes.length) {
    boutons.push(bouton('file-text', 'Acte de naissance', `demanderActeEtatCivilFiche('${escapeOnclickArg(d.id)}', 'naissance')`, 'Demande Comedec de l’acte de naissance de chaque partie (créée dans Authentic, rien n’est envoyé)'));
    if (personnes.some(p => p.mariage)) boutons.push(bouton('file-text', 'Acte de mariage', `demanderActeEtatCivilFiche('${escapeOnclickArg(d.id)}', 'mariage')`, 'Demande Comedec de l’acte de mariage du couple (un seul acte pour les deux époux)'));
  }
  if (!succession) boutons.push(bouton('archive', 'Lire l’EHF', `lireEhfDepuisFiche('${escapeOnclickArg(d.id)}')`, 'Relire l’état hypothécaire (état-réponse) déposé dans Authentic : inscriptions, pièces de mainlevée'));
  const papier = demandesPapierDossier(d);
  const lignesPapier = papier.map(x => {
    const p = x.personne;
    const actions = p
      ? `<wa-button appearance="plain" size="s" type="button" onclick="telechargerCourrierEtatCivil('${escapeOnclickArg(d.id)}', '${escapeOnclickArg(p.cle)}', '${x.type}', 'docx')" title="Le courrier du modèle de l’étude, en Word">Word</wa-button><wa-button appearance="plain" size="s" type="button" onclick="telechargerCourrierEtatCivil('${escapeOnclickArg(d.id)}', '${escapeOnclickArg(p.cle)}', '${x.type}', 'pdf')" title="Le même courrier en PDF">PDF</wa-button>`
      : '<span class="jour-vide">personne non reconnue : Constitution de dossier</span>';
    return `<li class="ec-papier"><span class="ec-papier-lib" title="${escapeAttr(x.libelle)}">${escapeHtml(x.type === 'mariage' ? 'Mariage' : 'Naissance')} — ${escapeHtml(x.libelle.slice(0, 50))}</span>${actions}</li>`;
  }).join('');
  const bloc = papier.length
    ? `<div class="ec-papier-bloc"><span class="section-eyebrow">Demandes papier${infoBulle('Authentic marque « APR » une demande d’état civil envoyée par papier (mairie sans Comedec). CLAIRE prépare le courrier du modèle de l’étude, avec le tampon et la signature p/o : à envoyer avec une enveloppe timbrée.')}</span><ul class="ec-papier-liste">${lignesPapier}</ul></div>` : '';
  return boutons.join('') + bloc;
}

// ---- Constitution de dossier : une étape « État civil » (vente et succession) ----

// Pure : l'état de l'étape en une ligne.
function etatCivilSousConstitution(d) {
  const papier = demandesPapierDossier(d).length;
  return papier ? `${papier} demande${papier > 1 ? 's' : ''} papier à faire` : `${personnesEtatCivilDossier(d).length} personne${personnesEtatCivilDossier(d).length > 1 ? 's' : ''}`;
}

// Une ligne par personne : naissance (et mariage pour un défunt ou un époux) en courrier papier, Word ou PDF ; Comedec pour une vente.
function renderEtatCivilConstitution(d) {
  const personnes = personnesEtatCivilDossier(d);
  if (!personnes.length) return '<p class="hint">Aucune personne sur la fiche pour demander un acte.</p>';
  const papier = demandesPapierDossier(d);
  const aPapier = (p, type) => papier.some(x => x.type === type && x.personne && x.personne.cle === p.cle);
  const format = (p, type, f, lib) => `<wa-button appearance="outlined" size="s" type="button" onclick="telechargerCourrierEtatCivil('${escapeOnclickArg(d.id)}', '${escapeOnclickArg(p.cle)}', '${type}', '${f}')" title="${escapeAttr(`Courrier à la mairie, modèle de l’étude (${lib})`)}">${lib}</wa-button>`;
  const cellule = (p, type, libelle) => `<span class="ec-acte${aPapier(p, type) ? ' ec-acte-apr' : ''}"><span class="ec-acte-lib">${escapeHtml(libelle)}${aPapier(p, type) ? ` <span class="pastille-apr" title="Authentic marque cette demande « APR » : papier">APR</span>` : ''}</span>${format(p, type, 'docx', 'Word')}${format(p, type, 'pdf', 'PDF')}</span>`;
  const lignes = personnes.map(p => `<li class="ec-personne"><span class="ec-nom">${escapeHtml([p.prenom, p.nom].filter(Boolean).join(' '))}${p.role === 'DEFUNT' ? ' <span class="hint">défunt</span>' : ''}</span>
      ${cellule(p, 'naissance', 'Naissance')}${p.mariage ? cellule(p, 'mariage', 'Mariage') : ''}</li>`).join('');
  const aide = '<p class="hint">Mairie sans Comedec : le courrier papier est préparé au modèle de l’étude (tampon et signature p/o), l’enveloppe timbrée est à joindre. La mairie de naissance est celle du lieu de naissance de la fiche : le code postal et le lieu manquants se complètent sur le courrier.</p>';
  // Succession : pas de Comedec par CLAIRE, chaque courrier papier se prépare ici.
  if (estSuccession(d)) return `${aide}<ul class="ec-liste">${lignes}</ul>`;
  // Vente (étude 30/10 : « d'abord on clique sur le bouton pour rechercher les Comedec et s'il y a des demandes papier, l'outil propose de les
  // faire en papier ») : 1. la demande Comedec dans Authentic ; 2. seulement les demandes qu'Authentic marque « APR » (mairie sans Comedec)
  // reçoivent leur courrier papier ; le courrier pour n'importe quelle personne reste replié, en secours.
  const cjn = raisonSansCjn(d) ? '' : `<wa-button appearance="outlined" size="s" type="button" onclick="demanderCjnFiche('${escapeOnclickArg(d.id)}')" title="Demande de casier judiciaire des acquéreurs, préparée dans Authentic (rien n’est envoyé)">${icone('file-text')} Casier judiciaire (CJN)</wa-button>`;
  const comedec = `<div class="ec-comedec"><wa-button variant="brand" size="s" type="button" onclick="demanderActeEtatCivilFiche('${escapeOnclickArg(d.id)}', 'naissance')">${icone('file-text')} Demander par Comedec : naissance</wa-button>${personnes.some(p => p.mariage) ? `<wa-button appearance="outlined" size="s" type="button" onclick="demanderActeEtatCivilFiche('${escapeOnclickArg(d.id)}', 'mariage')">Comedec : mariage</wa-button>` : ''}${cjn}</div>`;
  const lignesApr = papier.map(x => {
    const p = x.personne;
    const lib = x.type === 'mariage' ? 'Mariage' : 'Naissance';
    return p
      ? `<li class="ec-personne"><span class="ec-nom">${escapeHtml([p.prenom, p.nom].filter(Boolean).join(' '))}</span><span class="ec-acte ec-acte-apr"><span class="ec-acte-lib">${lib} <span class="pastille-apr" title="Authentic marque cette demande « APR » : papier">APR</span></span>${format(p, x.type, 'docx', 'Word')}${format(p, x.type, 'pdf', 'PDF')}</span></li>`
      : `<li class="ec-personne"><span class="ec-nom" title="${escapeAttr(x.libelle)}">${escapeHtml(x.libelle.slice(0, 60))}</span><span class="jour-vide">personne non reconnue : courrier ci-dessous</span></li>`;
  }).join('');
  const etape2 = papier.length
    ? `<span class="section-eyebrow">Demandes papier à faire${infoBulle('Lignes « APR » d’Authentic : la mairie n’est pas sur Comedec. Le courrier est au modèle de l’étude.')}</span><ul class="ec-liste">${lignesApr}</ul>${aide}`
    : '<p class="hint">Aucune demande papier pour l’instant : après la demande Comedec, une mairie sans Comedec apparaît ici (ligne « APR » d’Authentic) avec son courrier.</p>';
  return `<span class="section-eyebrow">1. Demande Comedec dans Authentic</span>${comedec}
    <span class="section-eyebrow">2. Courriers papier</span>${etape2}
    <details class="ec-papier-tous"><summary>Préparer un courrier papier pour une autre personne</summary><ul class="ec-liste">${lignes}</ul></details>`;
}

// Outil `courrier_etat_civil` de l'agent : le courrier papier à la mairie (après « Autoriser »), pour une personne ou pour chaque demande APR en attente.
async function courrierEtatCivilAgent(entree) {
  const e = entree || {};
  const d = dossiers.find(x => x.id === e.dossier_id);
  if (!d) return { erreur: 'dossier_id inconnu' };
  const type = e.acte === 'mariage' ? 'mariage' : e.acte === 'naissance' ? 'naissance' : '';
  if (!type) return { erreur: 'acte inconnu (naissance ou mariage)' };
  const format = e.format === 'pdf' ? 'pdf' : 'docx';
  const personnes = personnesEtatCivilDossier(d).filter(p => type === 'naissance' ? p.naissance : p.mariage);
  let cibles;
  if (e.personne) {
    const mots = normaliserPourRecherche(String(e.personne)).split(/[^a-z0-9]+/).filter(m => m.length > 1);
    const trouvees = personnes.filter(p => { const n = normaliserPourRecherche([p.prenom, p.nom].filter(Boolean).join(' ')).split(/[^a-z0-9]+/); return mots.length && mots.every(m => n.includes(m)); });
    if (!trouvees.length) return { erreur: 'aucune personne de ce nom pour cet acte sur la fiche' };
    if (trouvees.length > 1) return { erreur: 'plusieurs personnes correspondent : précise le prénom' };
    cibles = trouvees;
  } else {
    cibles = demandesPapierDossier(d).filter(x => x.type === type && x.personne).map(x => x.personne);
    cibles = cibles.filter((p, i) => cibles.findIndex(q => q.cle === p.cle) === i);
    if (!cibles.length) return { fait: true, statut: 'fait', resultat: 'Aucune demande papier (APR) en attente pour cet acte : rien à préparer. Précise une personne pour faire le courrier quand même.' };
  }
  if (!(await demanderAutorisationAgent(`Préparer le courrier papier à la mairie (extrait d’acte de ${type}, ${format === 'pdf' ? 'PDF' : 'Word'}) — ${libelleDossierAffiche(d)} : ${cibles.length} courrier${cibles.length > 1 ? 's' : ''} téléchargé${cibles.length > 1 ? 's' : ''}.`))) {
    return { refuse: true, message: 'l’utilisateur a refusé : ne le refais pas sans nouvelle demande' };
  }
  let faits = 0;
  for (const p of cibles) { if (await telechargerCourrierEtatCivil(d.id, p.cle, type, format)) faits++; await new Promise(ok => setTimeout(ok, 400)); }
  if (!faits) return { erreur: 'aucun courrier n’a pu être généré (bibliothèque non chargée ?)', statut: 'echec' };
  if (faits < cibles.length) return { fait: true, statut: 'fait', resultat: `${faits} courrier(s) sur ${cibles.length} téléchargé(s) : les autres n’ont pas pu être générés.` };
  return { fait: true, statut: 'fait', resultat: `${faits} courrier${faits > 1 ? 's' : ''} de demande d’acte de ${type} téléchargé${faits > 1 ? 's' : ''} (${format === 'pdf' ? 'PDF' : 'Word'}). Lieu et code postal de la mairie, s’ils manquaient, sont « À compléter » sur le courrier. Une enveloppe timbrée est à joindre.` };
}
