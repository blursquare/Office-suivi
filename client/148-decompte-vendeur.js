// ==== Décompte vendeur (étude 30/10 : « voici un modèle de décompte vendeur pour que CLAIRE sache le faire aussi ») ====
//
// Outil du tiroir (Outils › Vente) et de la fiche d'une vente : le décompte des sommes qui reviennent au vendeur le jour de la signature,
// sur le modèle de l'étude — « Références dossier », « Date de signature prévisionnelle », « DECOMPTE VENDEUR », le vendeur, puis un tableau
// DEBIT / CREDIT : prix de vente (crédit), prorata de taxes foncières (crédit, part de l'acquéreur du jour de l'acte au 31/12, avis du NAS),
// commission due à l'agence (débit, quand l'avant-contrat la met à la charge du vendeur), remboursement anticipé du prêt (débit, LU dans le
// décompte de remboursement de la banque trouvé sur le NAS — choix de l'étude), provision sur frais d'acte de mainlevée (débit, 450 € modifiable
// — choix de l'étude — quand une inscription est en cours sur le bien ou qu'un remboursement est lu), « Ensemble », « Solde », et la phrase de
// l'étude sur le R.I.B., mot pour mot. Toutes les lignes se corrigent, s'ajoutent, se retirent ; rien n'est deviné : un montant non lu reste à
// saisir. Le même document donne le PDF/A et le Word sur le papier à en-tête (courriers fidèles, client/73) et l'email au vendeur — premier
// jet de CLAIRE, rien ne part sans « Envoyer ». « Demander à CLAIRE » : outil `decompte_vendeur`.

var PROVISION_MAINLEVEE_VENDEUR = 450;
var PIED_DECOMPTE_VENDEUR = 'Pour le règlement du prix de vente, veuillez-vous munir d\'un R.I.B. pour le jour de la signature';
// Le décompte de remboursement de la banque, reconnu par le NOM du fichier (jamais par le contenu, règle des pièces) ; jamais notre propre
// décompte (vendeur, acquéreur, appel de fonds) ni celui d'un confrère.
var RE_NOM_DECOMPTE_REMBOURSEMENT = /(d[ée]compte|decompte).{0,40}(rembours|anticip|pr[eê]t|cr[ée]dit|banque)|rembours\w*.{0,20}anticip|(?:^|[^a-z])(?:ra|rap)(?:[^a-z]|$).{0,30}(?:pr[eê]t|banque)/i;
var RE_NOM_PAS_REMBOURSEMENT = /vendeur|acqu[ée]reur|appel\s*de\s*fonds|convocation|projet|tableau\s*d.?amortissement|offre/i;

let dvEtat = { dossierId: '', lignes: [], date: '', datePrevue: false, destinataire: [], lectures: {}, jeton: 0, envoi: false };
let dvIdLigne = 0;

// Pure : le montant total à rembourser lu dans le décompte d'une banque — « Total à rembourser », « Montant total du remboursement
// anticipé », « Somme due au … », « Total dû » ; plusieurs prêts dans le même décompte : le plus grand des totaux (le total général). Rien de
// sûr = null (le montant reste à saisir, jamais deviné).
function montantRemboursementDansTexte(texte) {
  const t = String(texte || '').replace(/[   ]/g, ' ');
  const montant = '(\\d{1,3}(?:[ .]\\d{3})+(?:,\\d{2})|\\d+(?:,\\d{2}))\\s*(?:€|EUR|euros?)?';
  const motifs = [
    'total\\s+(?:g[ée]n[ée]ral\\s+)?(?:[àa]\\s+(?:rembourser|r[ée]gler|payer|verser)|d[uû]|des\\s+sommes\\s+dues|du\\s+remboursement(?:\\s+anticip[ée]e?)?|du\\s+d[ée]compte)',
    'montant\\s+(?:total\\s+)?(?:du\\s+|de\\s+(?:la\\s+)?)?remboursement\\s+(?:anticip[ée]e?|total)',
    // « due » / « dû » seulement : « montant du prêt » est le capital emprunté, jamais ce qui reste à rembourser.
    '(?:somme|montant)\\s+(?:totale?\\s+)?(?:restant\\s+)?(?:due|dû)(?![a-zà-ü])',
    'solde\\s+(?:[àa]\\s+(?:rembourser|r[ée]gler)|restant\\s+d[uû])'
  ];
  for (const m of motifs) {
    // Entre le libellé et le montant : du texte, ou une date (« au 01/12/2026 »), jamais un autre nombre.
    const re = new RegExp(m + '(?:[^\\d\\n]|\\d{1,2}/\\d{1,2}/\\d{2,4}){0,60}?' + montant, 'gi');
    const trouves = [];
    let x;
    while ((x = re.exec(t))) { const n = montantDepuisTexteFr(x[1]); if (n > 0) trouves.push(n); }
    if (trouves.length) return Math.round(Math.max(...trouves) * 100) / 100;
  }
  return null;
}

// Pure : le nom du fichier dit-il un décompte de remboursement d'un prêt du vendeur ?
function nomDitDecompteRemboursement(nom) {
  const n = normaliserNomPourMotif(String(nom || '').split(/[\\/]/).pop());
  return /\.pdf$/i.test(String(nom || '')) && RE_NOM_DECOMPTE_REMBOURSEMENT.test(n) && !RE_NOM_PAS_REMBOURSEMENT.test(n)
    && !(typeof nomDitDecompteConfrere === 'function' && nomDitDecompteConfrere(n));
}

// Pure : les vendeurs du dossier au format des clients du courrier d'appel de fonds (civilité, prénom, nom).
function vendeursDecompteVendeur(d) {
  if (!d) return [];
  const parties = partiesCoteDossier(d, 'vendeur').filter(p => String(p.nom || '').trim());
  if (parties.length) {
    return parties.map(p => {
      if (p.qualitePersonne === 'morale') return { civilite: 'SCI', prenom: '', nom: p.nom || '' };
      return { civilite: civiliteDepuisTexte(p.civilite) || 'M', prenom: String(p.prenom || '').trim(), nom: p.nom || '' };
    });
  }
  const nom = String(d.nom || '').replace(/^\s*(?:VTE|VENTE)\s*-?\s*/i, '');
  return (nom.includes('/') ? nom.split('/')[0] : '').split('&').map(s => s.trim()).filter(Boolean).map(n => ({ civilite: 'M', prenom: '', nom: n }));
}

// Pure : la commission d'agence à la charge du vendeur (montant TTC lu dans l'avant-contrat), sinon null.
function commissionVendeurDecompte(d) {
  const h = d && d.honoraires;
  if (!h || h.direct || h.charge !== 'VENDEUR') return null;
  return { montant: Number(h.montantTTC) > 0 ? Number(h.montantTTC) : null, agence: String(h.nom || '').trim() };
}

// Pure : les lignes de départ du décompte — { prix, prorata, remboursements: [montant|null], mainlevee: bool } → [{ id, libelle, sens, montant, source }].
// Un montant inconnu reste null (« à saisir »).
function lignesDecompteVendeurInitiales(d, lus) {
  const l = lus || {};
  const lignes = [];
  const ajouter = (libelle, sens, montant, source) => lignes.push({ id: 'dv' + (++dvIdLigne), libelle, sens, montant: Number(montant) > 0 ? Math.round(Number(montant) * 100) / 100 : null, source: source || '' });
  ajouter('Prix de vente', 'credit', montantDossierAppelFonds(d && d.prixVente), d && d.prixVente ? 'fiche' : '');
  ajouter('Prorata de taxes foncières', 'credit', l.prorata, l.prorata ? 'avis de taxe foncière' : '');
  const commission = commissionVendeurDecompte(d);
  if (commission) ajouter('Commission due à l\'agence', 'debit', commission.montant, commission.montant ? 'avant-contrat' : '');
  const remb = Array.isArray(l.remboursements) ? l.remboursements : [];
  remb.forEach(m => ajouter('Remboursement anticipé prêt', 'debit', m, m ? 'décompte de la banque' : ''));
  if (l.mainlevee || remb.length) ajouter('Provision sur frais acte de mainlevée', 'debit', PROVISION_MAINLEVEE_VENDEUR, 'provision de l’étude');
  return lignes;
}

// Pure : les lignes lues sur le NAS posées sans perdre une ligne corrigée à la main pendant la lecture (gardée à la place de la ligne de même
// libellé, chacune une seule fois ; une ligne ajoutée à la main reste à la fin).
function fusionLignesDecompteVendeur(avant, neuves) {
  const prises = new Set();
  const garde = (n) => { const m = (avant || []).find(x => x.modifiee && !prises.has(x) && x.libelle === n.libelle); if (m) { prises.add(m); return m; } return n; };
  const sortie = (neuves || []).map(garde);
  return sortie.concat((avant || []).filter(x => x.modifiee && !prises.has(x)));
}

// Pure : « Ensemble » (débit, crédit) et « Solde » (crédit − débit ; négatif = la somme manque au vendeur). Lignes sans montant ignorées.
function totauxDecompteVendeur(lignes) {
  const somme = (sens) => Math.round((lignes || []).filter(x => x && x.sens === sens && Number(x.montant) > 0).reduce((s, x) => s + Number(x.montant), 0) * 100) / 100;
  const debit = somme('debit');
  const credit = somme('credit');
  return { debit, credit, solde: Math.round((credit - debit) * 100) / 100 };
}

// Pure : le décompte au format des courriers fidèles (client/73) — destinataire à droite, « Blois, le … », références, date de signature,
// titre, tableau DEBIT / CREDIT, phrase du R.I.B. Un montant vide ou une ligne sans libellé = « à compléter » sur la ligne.
function documentDecompteVendeur(o) {
  const e = o || {};
  const euros = (n) => (Number(n) > 0 ? formaterMontantEuros(n) : '');
  const t = totauxDecompteVendeur(e.lignes);
  const entete = ['', 'DEBIT', 'CREDIT'].map((x, i) => ({ texte: x ? `**${x}**` : '', jc: i ? 'center' : 'left', fond: 'E6E6E6' }));
  const rangees = [{ cellules: entete }];
  (e.lignes || []).forEach(x => {
    const m = Number(x.montant) > 0 ? euros(x.montant) : '[à compléter]';
    rangees.push({ cellules: [{ texte: String(x.libelle || '').trim() || '[à compléter]' }, { texte: x.sens === 'debit' ? m : '', jc: 'right' }, { texte: x.sens === 'credit' ? m : '', jc: 'right' }] });
  });
  rangees.push({ cellules: [{ texte: '**Ensemble :**' }, { texte: `**${euros(t.debit)}**`, jc: 'right' }, { texte: `**${euros(t.credit)}**`, jc: 'right' }] });
  const solde = `**${formaterMontantEuros(Math.abs(t.solde))}**`;
  rangees.push({ cellules: [{ texte: t.solde < 0 ? '**Solde à verser par le vendeur :**' : '**Solde :**' }, { texte: t.solde < 0 ? solde : '', jc: 'right' }, { texte: t.solde >= 0 ? solde : '', jc: 'right' }] });
  // « 01/10/2026 », comme le modèle de l'étude.
  const dateSig = /^\d{4}-\d{2}-\d{2}/.test(String(e.date || '')) ? String(e.date).slice(0, 10).split('-').reverse().join('/') : '[à compléter]';
  return {
    adresseDebut: 1, adresse: (e.destinataire || []).length ? e.destinataire : ['[à compléter]'], ligneDate: 10,
    date: `Blois, le ${formatDateFr(e.aujourdhui || isoAujourdhuiLocal())}`,
    lignes: ['', '', `**Références dossier :** ${String(e.reference || '').trim() || '[à compléter]'}`,
      `${e.datePrevue ? 'Date de signature prévisionnelle' : 'Date de signature'} : ${dateSig}`, '', '**DECOMPTE VENDEUR**', '',
      { type: 'tableau', grille: [4700, 1900, 1900], ind: 0, lignes: rangees }, '', PIED_DECOMPTE_VENDEUR],
    signature: 'Me  Sophie GOSSART', blancsSignature: 2
  };
}

// Pure : « VENTE VENDEUR / ACQUÉREUR », comme la référence du modèle de l'étude.
function referenceDecompteVendeur(d) {
  return d ? libelleDossierAffiche(d).replace(/^VTE - /, 'VENTE ') : '';
}

// Pure : le premier jet de l'email au vendeur (CLAIRE) — formule selon les civilités, date de signature, phrase du R.I.B. de l'étude.
function corpsEmailDecompteVendeur(vendeurs, situation, date, datePrevue) {
  const quand = /^\d{4}-\d{2}-\d{2}/.test(String(date || '')) ? ` ${datePrevue ? 'prévue' : 'fixée'} le ${formatDateFr(String(date).slice(0, 10))}` : '';
  return [salutationAppelFonds(vendeurs, situation), '',
    `Veuillez trouver ci-joint le décompte des sommes qui vous reviendront lors de la signature de l’acte de vente${quand}.`, '',
    PIED_DECOMPTE_VENDEUR + '.', '', 'Bien cordialement,'].join('\n');
}

function dvDossier() { return dossiers.find(x => x && x.id === dvEtat.dossierId) || null; }

function dvDossiersVente() {
  return dossiers.filter(d => d && !d.archive && !estSuccession(d)).sort((a, b) => libelleDossierAffiche(a).localeCompare(libelleDossierAffiche(b), 'fr'));
}

// Ouvre l'outil sur un dossier : lignes de la fiche aussitôt, puis l'avis de taxe foncière et le décompte de la banque lus sur le NAS.
async function dvChoisirDossier(id) {
  const d = dossiers.find(x => x && x.id === id);
  dvEtat = { dossierId: d ? d.id : '', lignes: [], date: '', datePrevue: false, destinataire: [], lectures: {}, jeton: dvEtat.jeton + 1, envoi: false };
  if (!d) { renderDecompteVendeur(); return; }
  const auj = isoAujourdhuiLocal();
  const prevue = d.rendezVousSignature ? null : signaturePrevueDossier(d, auj);
  dvEtat.date = String(d.rendezVousSignature || (prevue && prevue.date) || '').slice(0, 10);
  dvEtat.datePrevue = !d.rendezVousSignature;
  dvEtat.destinataire = lignesDestinatairesAppelFonds(vendeursDecompteVendeur(d), situationClientDossier(d, 'vendeur'));
  const mainlevee = typeof inscriptionsEnCoursDuBien === 'function' && inscriptionsEnCoursDuBien(d).length > 0;
  dvEtat.lignes = lignesDecompteVendeurInitiales(d, { mainlevee });
  dvEtat.lectures = { nas: d.nasDossier ? 'lecture' : 'non relié' };
  renderDecompteVendeur();
  if (d.nasDossier) await dvLireNas(d, dvEtat.jeton, mainlevee);
}

async function dvLireNas(d, jeton, mainlevee) {
  const encore = () => jeton === dvEtat.jeton && dvEtat.dossierId === d.id;
  const lus = { remboursements: [], mainlevee };
  const notes = [];
  try {
    const fichiers = await listerFichiersNas(d);
    if (!encore()) return;
    if (typeof pdfjsLib !== 'undefined') {
      const tf = fichierPieceNasAppelFonds(d, fichiers, 'avisTaxeFonciere', motifPieceChecklist(d, 'avisTaxeFonciere'));
      if (tf && dvEtat.date) {
        try {
          const avis = await lireAvisTaxeFonciere(await fichierNasPourLecture(tf.chemin, tf.nom));
          // Plusieurs biens sur l'avis : le montant n'est pas tranché ici (bien vendu à choisir dans l'outil Prorata).
          const ligne = avis && avis.montant && !(avis.biens && avis.biens.length > 1) ? ligneProrataTaxeFonciere(avis.montant, dvEtat.date) : null;
          if (ligne) { lus.prorata = ligne.montant; notes.push(`taxe foncière : « ${tf.nom} »`); } else notes.push(`taxe foncière : « ${tf.nom} » à vérifier (montant ou bien non lu)`);
        } catch (e) { notes.push('taxe foncière illisible'); }
      } else if (!tf) notes.push('aucun avis de taxe foncière');
      const decomptes = fichiers.filter(f => f && f.chemin && nomDitDecompteRemboursement(f.nom || f.chemin))
        .sort((a, b) => String(b.modifie || '').localeCompare(String(a.modifie || ''))).slice(0, 3);
      for (const f of decomptes) {
        if (!encore()) return;
        try {
          const fichier = await fichierNasPourLecture(cheminNasComplet(d, f.chemin), f.nom);
          const pdf = await pdfjsLib.getDocument({ isEvalSupported: false, data: await fichier.arrayBuffer() }).promise;
          const m = montantRemboursementDansTexte(await lireTextePdfEnLignes(pdf));
          lus.remboursements.push(m);
          notes.push(m ? `remboursement : « ${f.nom} »` : `remboursement : « ${f.nom} » — total non lu, à saisir`);
        } catch (e) { lus.remboursements.push(null); notes.push(`« ${f.nom} » illisible`); }
      }
      if (!decomptes.length) notes.push('aucun décompte de remboursement de la banque');
    }
  } catch (e) { notes.push('NAS injoignable'); }
  if (!encore()) return;
  // Les lignes déjà corrigées à la main sont gardées ; seules les lignes encore vides ou absentes sont posées.
  dvEtat.lignes = fusionLignesDecompteVendeur(dvEtat.lignes, lignesDecompteVendeurInitiales(d, lus));
  dvEtat.lectures = { nas: 'lu', notes };
  noterVerificationPoste('decompte-vendeur-nas', { ok: lus.remboursements.every(Boolean), detail: `${lus.remboursements.length} décompte(s) de la banque, prorata ${lus.prorata ? 'lu' : 'non lu'}` });
  renderDecompteVendeur();
}

function dvLigne(id) { return dvEtat.lignes.find(x => x.id === id); }

function dvChanger(id, champ, valeur) {
  const l = dvLigne(id);
  if (!l) return;
  if (champ === 'libelle') l.libelle = String(valeur || '').slice(0, 120);
  if (champ === 'sens') l.sens = valeur === 'credit' ? 'credit' : 'debit';
  if (champ === 'montant') { const n = montantSaisiAppelFonds(valeur); l.montant = Number(n) > 0 ? Math.round(n * 100) / 100 : null; }
  l.modifiee = true;
  if (champ !== 'libelle') renderDecompteVendeur(); else dvMajApercu();
}

function dvAjouterLigne() {
  dvEtat.lignes.push({ id: 'dv' + (++dvIdLigne), libelle: '', sens: 'debit', montant: null, source: '', modifiee: true });
  renderDecompteVendeur();
}

function dvRetirerLigne(id) {
  dvEtat.lignes = dvEtat.lignes.filter(x => x.id !== id);
  renderDecompteVendeur();
}

function dvChangerEntete(champ, valeur) {
  if (champ === 'date') { dvEtat.date = /^\d{4}-\d{2}-\d{2}$/.test(String(valeur || '')) ? valeur : ''; renderDecompteVendeur(); return; }
  if (champ === 'prevue') { dvEtat.datePrevue = !!valeur; dvMajApercu(); return; }
  if (champ === 'destinataire') { dvEtat.destinataire = String(valeur || '').split('\n').map(x => x.trim()).filter(Boolean).slice(0, 6); dvMajApercu(); }
}

function dvDocument() {
  const d = dvDossier();
  return documentDecompteVendeur({ lignes: dvEtat.lignes, destinataire: dvEtat.destinataire, reference: referenceDecompteVendeur(d), date: dvEtat.date, datePrevue: dvEtat.datePrevue });
}

function dvNomFichier() {
  const d = dvDossier();
  return ('Décompte vendeur - ' + (d ? libelleDossierAffiche(d) : '')).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function initDecompteVendeur() {
  if (dvEtat.dossierId && !dvDossier()) dvEtat.dossierId = '';
  if (!window.APPEL_FONDS_MODELE && typeof chargerModeleAppelFonds === 'function') chargerModeleAppelFonds().then(() => dvMajApercu()).catch(() => {});
  renderDecompteVendeur();
}

// Depuis la fiche d'une vente.
function ouvrirDecompteVendeurDepuisFiche(id) {
  fermerDossierDrawer();
  definirOnglet('decompte-vendeur');
  dvChoisirDossier(id);
}

function dvCartesAccueil(q) {
  const actifs = dvDossiersVente();
  const liste = q ? actifs.filter(x => normaliserPourRecherche(libelleDossierAffiche(x)).includes(q) || normaliserPourRecherche(x.responsable || '').includes(q)).slice(0, 12)
    : (() => { const recents = dossiersConsultesRecents(lireDossiersConsultes(), actifs).map(x => x.dossier); return recents.concat(actifs.filter(x => !recents.includes(x))).slice(0, 6); })();
  const cartes = liste.map(x => `<button type="button" class="cst-accueil-carte" onclick="dvChoisirDossier('${escapeOnclickArg(x.id)}')">
      <span class="cst-accueil-carte-icone" aria-hidden="true">${icone('home')}</span>
      <span class="cst-accueil-carte-texte"><span class="cst-accueil-carte-titre">${escapeHtml(libelleDossierAffiche(x))}</span>
      <span class="cst-accueil-carte-sous">${escapeHtml(['Vente', x.referenceAuthentic, x.responsable].filter(Boolean).join(' · '))}</span></span></button>`).join('');
  return cartes ? `<div class="cst-accueil-liste-titre"><span class="pieces-titre">${icone(q ? 'search' : 'clock')}<span class="pieces-titre-texte">${q ? 'Résultats' : 'Derniers dossiers'}</span></span></div><div class="cst-accueil-grille">${cartes}</div>` : '<div class="dash-recherche-vide">Aucune vente ne correspond.</div>';
}

function dvRechercher(valeur) {
  const zone = document.getElementById('dv-cartes');
  if (zone) zone.innerHTML = dvCartesAccueil(normaliserPourRecherche(String(valeur || '').trim()));
}

function dvMajApercu() {
  const zone = document.getElementById('dv-apercu');
  const d = dvDossier();
  if (!zone || !d) return;
  try {
    const assets = (window.APPEL_FONDS_MODELE && window.APPEL_FONDS_MODELE.assets) || {};
    zone.innerHTML = htmlCourrierFidele(dvDocument(), refLignesCourrier(d), assets, false, {});
    const lettre = zone.querySelector('.cstp');
    if (lettre) paginerApercuCourrier(lettre);
    const r = lettre && lettre.offsetWidth ? zone.clientWidth / lettre.offsetWidth : 1;
    if (lettre && r > 0 && r < 1) lettre.style.zoom = String(Math.floor(r * 100) / 100);
  } catch (e) { zone.innerHTML = '<p class="hint">Aperçu impossible.</p>'; console.error(e); }
}

// Un redessin ne fait pas perdre le champ en cours (montant tapé, sens changé au clavier).
function renderDecompteVendeur() {
  const actif = document.activeElement && document.activeElement.id;
  dvRendreCorps();
  if (actif) { const e = document.getElementById(actif); if (e && e.focus && e !== document.activeElement) e.focus(); }
}

function dvRendreCorps() {
  const carte = document.getElementById('dv-carte');
  if (!carte) return;
  const d = dvDossier();
  const entete = `<div class="dash-header"><div><div class="dash-eyebrow">Vente</div><div class="dash-titre-ligne"><h1 class="dash-titre">Décompte vendeur</h1>${infoBulle('Sur le modèle de l’étude : prix et prorata de taxes foncières au crédit ; commission d’agence (à la charge du vendeur), remboursement anticipé du prêt lu dans le décompte de la banque trouvé sur le NAS et provision de mainlevée (450 €) au débit. Toutes les lignes se corrigent ; un montant non lu reste à saisir.')}</div></div></div>`;
  if (!d) {
    carte.innerHTML = `<div class="cst-accueil">
      <span class="cst-accueil-icone" aria-hidden="true">${icone('banknote')}</span>
      <h2 class="cst-accueil-titre">Pour quelle vente ?</h2>
      <p class="cst-accueil-sous">Décompte préparé d’après la fiche et le dossier du NAS.</p>
      <div class="pr-dossier-recherche-bloc cst-recherche cst-accueil-recherche"><input type="search" id="dv-recherche" class="nas-choix-recherche" autocomplete="off" placeholder="Rechercher une vente…" aria-label="Rechercher une vente" oninput="dvRechercher(this.value)"></div>
      <div id="dv-cartes" class="aut-cartes">${dvCartesAccueil('')}</div>
    </div>`;
    return;
  }
  const t = totauxDecompteVendeur(dvEtat.lignes);
  const idJs = escapeOnclickArg(d.id);
  const lignes = dvEtat.lignes.map(x => {
    const id = escapeOnclickArg(x.id);
    const ida = escapeAttr(x.id);
    return `<div class="dv-ligne">
      <input type="text" id="dv-l-${ida}" class="dv-libelle" value="${escapeAttr(x.libelle)}" placeholder="Libellé" aria-label="Libellé" oninput="dvChanger('${id}', 'libelle', this.value)">
      <select id="dv-s-${ida}" class="dv-sens" aria-label="Débit ou crédit" onchange="dvChanger('${id}', 'sens', this.value)"><option value="debit"${x.sens === 'debit' ? ' selected' : ''}>Débit</option><option value="credit"${x.sens === 'credit' ? ' selected' : ''}>Crédit</option></select>
      <input type="text" inputmode="decimal" id="dv-m-${ida}" class="dv-montant${x.montant ? '' : ' dv-a-saisir'}" value="${x.montant ? escapeAttr(formaterMontantEuros(x.montant).replace(/\s*€$/, '')) : ''}" placeholder="À saisir" aria-label="Montant" onchange="dvChanger('${id}', 'montant', this.value)">
      <wa-button appearance="plain" size="s" class="bouton-icone" type="button" title="Retirer la ligne" aria-label="Retirer la ligne" onclick="dvRetirerLigne('${id}')">${icone('x')}</wa-button>
      ${x.source ? `<span class="dv-source">${escapeHtml(x.source)}</span>` : ''}</div>`;
  }).join('');
  const notes = dvEtat.lectures.nas === 'lecture' ? 'Lecture du dossier du NAS…'
    : dvEtat.lectures.nas === 'non relié' ? 'Dossier non relié au NAS : taxe foncière et remboursement à saisir.'
    : (dvEtat.lectures.notes || []).join(' · ');
  const manque = dvEtat.lignes.some(x => !(Number(x.montant) > 0) || !String(x.libelle || '').trim()) || !dvEtat.date;
  carte.innerHTML = `${entete}
    <div class="cst-corps">
      <div class="cst-barre">
        <span class="cst-dossier-titre">${escapeHtml(libelleDossierAffiche(d))}</span>
        <wa-button appearance="outlined" size="s" type="button" onclick="dvChoisirDossier('')" title="Revenir au choix du dossier">${icone('rotate-ccw')} Changer de dossier</wa-button>
        <wa-button appearance="outlined" size="s" type="button" onclick="dvChoisirDossier('${idJs}')" title="Reprendre la fiche et relire le NAS (les corrections sont perdues)">${icone('rotate-ccw')} Relire</wa-button>
        <span class="aut-barre-actions">
          <wa-button appearance="outlined" size="s" type="button" onclick="telechargerDecompteVendeur('word')">${icone('download')}Word</wa-button>
          <wa-button appearance="outlined" size="s" type="button" onclick="envoyerDecompteVendeur()"${dvEtat.envoi ? ' loading' : ''}>${icone('mail')}Envoyer au vendeur</wa-button>
          <wa-button variant="brand" size="s" type="button" onclick="telechargerDecompteVendeur('pdf')">${icone('download')}PDF</wa-button>
        </span>
      </div>
      ${notes ? `<p class="hint">${escapeHtml(notes)}</p>` : ''}
      <div class="cst-mise-en-page">
        <div class="cst-gauche">
          <div class="cst-bloc-titre">Lignes</div>
          <div class="dv-lignes">${lignes}</div>
          <wa-button appearance="outlined" class="bouton-ajout" type="button" onclick="dvAjouterLigne()"><span slot="start" class="bouton-ajout-plus">+</span>Ajouter une ligne</wa-button>
          <div class="dv-totaux"><span>Débit <b>${escapeHtml(formaterMontantEuros(t.debit))}</b></span><span>Crédit <b>${escapeHtml(formaterMontantEuros(t.credit))}</b></span>
            <span class="${t.solde < 0 ? 'dv-solde-negatif' : ''}">${t.solde < 0 ? 'Solde à verser par le vendeur' : 'Solde'} <b>${escapeHtml(formaterMontantEuros(Math.abs(t.solde)))}</b></span></div>
          <div class="cst-bloc-titre">Signature et vendeur</div>
          <div class="reglages-champ"><label for="dv-date">Date de signature</label>
            <input type="date" id="dv-date" value="${escapeAttr(dvEtat.date)}" onchange="dvChangerEntete('date', this.value)"></div>
          <label class="reglages-option"><wa-switch id="dv-prevue"${dvEtat.datePrevue ? ' checked' : ''} onchange="dvChangerEntete('prevue', this.checked)"></wa-switch><span>Date prévisionnelle</span></label>
          <div class="reglages-champ"><label for="dv-dest">Vendeur (en tête du décompte)</label>
            <textarea id="dv-dest" rows="3" oninput="dvChangerEntete('destinataire', this.value)">${escapeHtml(dvEtat.destinataire.join('\n'))}</textarea></div>
          ${manque ? '<p class="hint">Ce qui manque est écrit « [à compléter] » sur le décompte.</p>' : ''}
        </div>
        <div class="cst-droite"><div class="cst-bloc-titre">Aperçu</div><div id="dv-apercu" class="dv-apercu"></div></div>
      </div>
    </div>`;
  dvMajApercu();
}

async function dvBlob(format) {
  const d = dvDossier();
  if (!d) throw new Error('aucun dossier');
  const doc = dvDocument();
  if (format === 'word') return { blob: await docxCourrierFidele(doc, d, { signe: false }), nom: dvNomFichier() + '.docx', doc };
  const { blob } = await genererPdfAAppelFonds(null, dvNomFichier() + '.docx', { fidele: doc, refLignes: refLignesCourrier(d), ref: d.nom || '', signe: false });
  return { blob, nom: dvNomFichier() + '.pdf', doc };
}

async function telechargerDecompteVendeur(format) {
  try {
    const { blob, nom } = await dvBlob(format === 'word' ? 'word' : 'pdf');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nom;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    const d = dvDossier();
    if (d) { ajouterHistorique(d, `Décompte vendeur téléchargé (${format === 'word' ? 'Word' : 'PDF'}) — solde ${formaterMontantEuros(totauxDecompteVendeur(dvEtat.lignes).solde)}`); sauvegarder(d); }
  } catch (err) { afficherToast('Décompte impossible à produire : ' + (err && err.message ? err.message : 'erreur'), 'OK', null); }
}

// L'email au vendeur, décompte en PDF joint : la fenêtre d'email s'ouvre, rien ne part sans « Envoyer ».
async function envoyerDecompteVendeur() {
  const d = dvDossier();
  if (!d || dvEtat.envoi) return { ok: false };
  dvEtat.envoi = true;
  renderDecompteVendeur();
  try {
    const { blob, nom } = await dvBlob('pdf');
    const vendeurs = vendeursDecompteVendeur(d);
    const r = await livrerEmailDossier({
      destinataire: String(d.emailVendeur || '').trim(), sujet: `Décompte vendeur — ${referenceDecompteVendeur(d)}`,
      corps: corpsEmailDecompteVendeur(vendeurs, situationClientDossier(d, 'vendeur'), dvEtat.date, dvEtat.datePrevue),
      pieces: [{ nom, type: 'application/pdf', contenuBase64: await base64DepuisBlob(blob) }],
      responsableSignature: d.responsable, dossierId: d.id, geste: 'decompteVendeur'
    });
    if (r && r.ok) {
      ajouterHistorique(d, `Décompte vendeur ${r.mode === 'envoye' ? 'envoyé' : 'préparé'} par email — solde ${formaterMontantEuros(totauxDecompteVendeur(dvEtat.lignes).solde)}`);
      sauvegarder(d);
      noterVerificationPoste('decompte-vendeur-email', { detail: r.mode === 'envoye' ? 'envoyé depuis CLAIRE' : 'préparé' });
    }
    return r || { ok: false };
  } catch (err) {
    afficherToast('Email impossible à préparer : ' + (err && err.message ? err.message : 'erreur'), 'OK', null);
    return { ok: false };
  } finally { dvEtat.envoi = false; renderDecompteVendeur(); }
}

// « Demander à CLAIRE » (outil `decompte_vendeur`) : ouvre l'outil sur le dossier, attend la lecture du NAS et rend les lignes et le solde
// (montants et libellés de l'étude, jamais un nom). email = true : la fenêtre d'email au vendeur, après la carte « Autoriser » ; rien ne part
// sans « Envoyer ».
async function decompteVendeurAgent(e) {
  const d = dossiers.find(x => x && x.id === String((e && e.dossier_id) || ''));
  if (!d) return { erreur: 'aucun dossier avec cet id' };
  if (estSuccession(d)) return { erreur: 'une succession n’a pas de décompte vendeur' };
  if (dvEtat.dossierId !== d.id || e.relire) {
    definirOnglet('decompte-vendeur');
    await dvChoisirDossier(d.id);
  } else definirOnglet('decompte-vendeur');
  const t = totauxDecompteVendeur(dvEtat.lignes);
  const sortie = {
    dossier_id: d.id, date_signature: dvEtat.date, date_previsionnelle: dvEtat.datePrevue,
    lignes: dvEtat.lignes.map(x => ({ libelle: x.libelle, sens: x.sens, montant: x.montant, source: x.source || (x.modifiee ? 'saisi à la main' : 'à saisir') })),
    debit: t.debit, credit: t.credit, solde: t.solde, a_completer: dvEtat.lignes.filter(x => !(Number(x.montant) > 0)).map(x => x.libelle || 'ligne sans libellé'),
    lecture_nas: (dvEtat.lectures.notes || []).map(n => n.replace(/« [^»]*»/g, '(fichier)')),
    email_vendeur_connu: !!String(d.emailVendeur || '').trim(),
    consigne: 'Outil « Décompte vendeur » ouvert sur le poste : l’utilisateur corrige les lignes à l’écran (PDF, Word, email au vendeur).'
  };
  if (e.email) {
    const ok = await demanderAutorisationAgent(`Préparer l’email du décompte vendeur (${referenceDecompteVendeur(d)}), PDF joint — la fenêtre d’email s’ouvre, rien ne part sans « Envoyer ».`);
    if (!ok) return Object.assign(sortie, { email: 'refusé par l’utilisateur' });
    const r = await envoyerDecompteVendeur();
    sortie.email = r && r.ok ? (r.mode === 'envoye' ? 'envoyé' : 'fenêtre ouverte') : (r && r.annule ? 'fenêtre fermée sans envoi' : 'non préparé');
  }
  return sortie;
}
