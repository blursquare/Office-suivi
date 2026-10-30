// ==== Comptabilité d'un dossier lue dans Authentic (étude 28/10) ====
//
// « L'onglet s'appelle Comptabilité, commence par la succession : infos comptables (MONTANT). » Le navigateur du SERVEUR ouvre le dossier dans
// Authentic, clique l'onglet « Comptabilité » et relève la page (server/src/authenticClaire.js `lireComptabilite`, lecture seule) ; le serveur
// garde les montants sur la fiche (`d.authentic.comptabilite` : soldes du compte et de l'affaire, taxes, dernières opérations). Le panneau
// « Authentic » de l'onglet Dossier les montre ; « Demander à CLAIRE » les lit (outil `authentic_comptabilite`, relecture après « Autoriser »).

var lecturesComptabiliteEnCours = new Set();

// Pure : un montant pour l'écran (« 1 234,56 € »), « — » quand il n'a pas été lu.
function montantComptaAT(n) {
  return typeof n === 'number' && Number.isFinite(n) ? formaterMontantEuros(n) : '—';
}

// Pure : la comptabilité gardée, pour « Demander à CLAIRE » — montants et dates, libellés des opérations (masqués par le serveur).
function comptabilitePourAgent(c) {
  if (!c || !c.luLe) return null;
  return {
    lue_le: String(c.luLe).slice(0, 16), lue_dans: c.sousDossier === 'promesse' ? 'promesse (la vente n’a pas de comptabilité liée)' : 'vente', solde_compte: c.soldeCompte, solde_affaire: c.soldeAffaire,
    taxes: (c.taxes || []).map(t => ({ montant: t.montant })),
    operations: (c.operations || []).slice(0, 30).map(o => ({ date: o.date, libelle: o.libelle, debit: o.debit, credit: o.credit, solde: o.solde })),
    total_debit_des_operations_listees: c.totalDebitListe, total_credit_des_operations_listees: c.totalCreditListe, nombre_de_comptes: c.nombreComptes || 1, liste_incomplete: !!c.tronque
  };
}

function htmlComptabiliteAT(d) {
  if (!d || !String(d.referenceAuthentic || '').trim()) return '';
  const c = (d.authentic || {}).comptabilite;
  const enCours = lecturesComptabiliteEnCours.has(d.id);
  const bouton = `<wa-button appearance="outlined" size="s" onclick="lireComptabiliteAT('${escapeOnclickArg(d.id)}')"${enCours ? ' loading disabled' : ''}>${icone('banknote')}${c ? 'Relire' : 'Lire la comptabilité'}</wa-button>`;
  if (!c) return `<div class="at-bloc at-compta"><div class="at-bloc-tete"><span class="at-bloc-titre">Comptabilité ${infoBulle('Lue dans l’onglet « Comptabilité » d’Authentic par CLAIRE (lecture seule).')}</span>${bouton}</div></div>`;
  const lignes = (c.operations || []).slice(0, 8).map(o => `<tr><td>${escapeHtml(formatDateFr(o.date))}</td><td>${escapeHtml(o.libelle)}</td><td class="at-compta-n">${o.debit ? escapeHtml(montantComptaAT(o.debit)) : ''}</td><td class="at-compta-n">${o.credit ? escapeHtml(montantComptaAT(o.credit)) : ''}</td></tr>`).join('');
  return `<div class="at-bloc at-compta"><div class="at-bloc-tete"><span class="at-bloc-titre">Comptabilité ${infoBulle('Lue dans l’onglet « Comptabilité » d’Authentic par CLAIRE (lecture seule).')}</span>${bouton}</div>
    <div class="at-compta-soldes"><span>Solde de l’affaire <b>${escapeHtml(montantComptaAT(c.soldeAffaire))}</b></span><span>Solde du compte <b>${escapeHtml(montantComptaAT(c.soldeCompte))}</b></span>${(c.taxes || []).map(t => `<span>${escapeHtml(t.libelle || 'Taxe')} <b>${escapeHtml(montantComptaAT(t.montant))}</b></span>`).join('')}</div>
    ${lignes ? `<table class="at-compta-table"><thead><tr><th>Date</th><th>Opération</th><th>Débit</th><th>Crédit</th></tr></thead><tbody>${lignes}</tbody></table>` : '<p class="cfb-vide">Aucune opération récente.</p>'}
    <p class="at-compta-lu">Lu le ${escapeHtml(formatDateFr(String(c.luLe).slice(0, 10)))}${c.sousDossier === 'promesse' ? ' · dans la promesse' : ''}${c.tronque ? ' · liste des opérations incomplète' : ''}</p></div>`;
}

// Carte « Comptabilité » de l'onglet Fonds (étude 30/10 : « carte comptabilité lue sur Authentic avec un bouton pour lire ou relire ») — vente
// et succession ; mêmes montants que le panneau « Authentic », même lecture (`lireComptabiliteAT`).
function renderComptabiliteFonds(d) {
  if (!d) return '';
  const c = (d.authentic || {}).comptabilite;
  const avecReference = !!String(d.referenceAuthentic || '').trim();
  const enCours = lecturesComptabiliteEnCours.has(d.id);
  const bouton = avecReference && !d.archive
    ? `<wa-button appearance="outlined" size="s" pill type="button" class="action-rapide" onclick="lireComptabiliteAT('${escapeOnclickArg(d.id)}')"${enCours ? ' loading disabled' : ''}>${icone(c ? 'rotate-ccw' : 'banknote')} ${c ? 'Relire' : 'Lire la comptabilité'}</wa-button>` : '';
  let corps;
  if (!avecReference) corps = '<p class="fiche-vide">Référence d’Authentic inconnue : CLAIRE ne sait pas quel dossier ouvrir.</p>';
  else if (!c || !c.luLe) corps = '<p class="fiche-vide">Pas encore lue.</p>';
  else {
    const lignes = (c.operations || []).slice(0, 6).map(o => `<tr><td>${escapeHtml(formatDateFr(o.date))}</td><td>${escapeHtml(o.libelle)}</td><td class="at-compta-n">${o.debit ? escapeHtml(montantComptaAT(o.debit)) : ''}</td><td class="at-compta-n">${o.credit ? escapeHtml(montantComptaAT(o.credit)) : ''}</td></tr>`).join('');
    corps = `<ul class="fonds-offre-lignes">
        <li><span class="fonds-offre-cle">Solde de l’affaire</span><span>${escapeHtml(montantComptaAT(c.soldeAffaire))}</span></li>
        <li><span class="fonds-offre-cle">Solde du compte</span><span>${escapeHtml(montantComptaAT(c.soldeCompte))}</span></li>
        ${(c.taxes || []).map(x => `<li><span class="fonds-offre-cle">${escapeHtml(x.libelle || 'Taxe')}</span><span>${escapeHtml(montantComptaAT(x.montant))}</span></li>`).join('')}
      </ul>
      ${lignes ? `<table class="at-compta-table"><thead><tr><th>Date</th><th>Opération</th><th>Débit</th><th>Crédit</th></tr></thead><tbody>${lignes}</tbody></table>` : '<p class="at-compta-lu">Aucune opération récente.</p>'}
      <p class="at-compta-lu">Lu le ${escapeHtml(formatDateFr(String(c.luLe).slice(0, 10)))}${c.sousDossier === 'promesse' ? ' · dans la promesse (la vente n’en a pas)' : ''}${c.tronque ? ' · liste des opérations incomplète' : ''}${(c.nombreComptes || 1) > 1 ? ' · plusieurs comptes : seul le premier solde est lu' : ''}</p>`;
  }
  return `<div class="echanges-groupe fonds-compta-carte">
      <div class="echanges-tete">
        <span class="pieces-titre">${icone('banknote')}<span class="pieces-titre-texte">Comptabilité</span>${infoBulle('Lue dans l’onglet « Comptabilité » d’Authentic par le navigateur du serveur (lecture seule).')}</span>
      </div>
      ${corps}
      ${bouton ? `<div class="fonds-offre-actions">${bouton}</div>` : ''}
    </div>`;
}

// Lit la comptabilité dans Authentic (tâche du navigateur du serveur) ; la fiche est relue ensuite. Rend { ok, texte }.
async function lireComptabiliteAT(id) {
  if (lecturesComptabiliteEnCours.has(id)) return { ok: false, texte: 'lecture déjà en cours' };
  lecturesComptabiliteEnCours.add(id);
  render();
  try {
    const r = await gesteAuthenticClaire('comptabilite', { dossierId: id, auteur: utilisateurPoste || '' });
    if (typeof rattraperDossiersDistants === 'function') await rattraperDossiersDistants();
    afficherToast(r.ok ? r.texte : 'Comptabilité non lue : ' + r.texte, 'OK', null);
    return r;
  } finally {
    lecturesComptabiliteEnCours.delete(id);
    render();
  }
}

// ---- Vente : fonds reçus d'après la comptabilité d'Authentic, comparés à l'appel de fonds (étude 28/10 : « pour la vente maintenant :
// fonds reçus comparés à l'appel de fonds ») ----

// Pure : la comparaison, PRUDENTE (audit 0.390.0) : le solde de l'affaire peut contenir un acompte, un dépôt de garantie ou des provisions — il
// n'est jamais dit « couvert », seulement « égal au solde à verser, à vérifier ». Seul le solde de l'affaire compte (les crédits des dernières
// opérations ne sont qu'une liste partielle) ; non lu → « non lu » ; acte signé (fonds décaissés) → le solde seul, sans verdict ; en
// participation où le confrère représente l'acquéreur, les fonds peuvent être encaissés chez lui (dit). Attendu = le « Solde à verser » du
// courrier d'appel de fonds (bilanFondsDossier). null pour une succession ou sans comptabilité lue.
function comparaisonFondsComptaAT(d) {
  if (!d || estSuccession(d)) return null;
  const c = (d.authentic || {}).comptabilite;
  if (!c || !c.luLe) return null;
  const solde = typeof c.soldeAffaire === 'number' && Number.isFinite(c.soldeAffaire) ? c.soldeAffaire : null;
  const b = bilanFondsDossier(d);
  const attendu = b && b.attendu ? Number(b.attendu) : null;
  const base = { solde, attendu, ecart: null, luLe: c.luLe, plusieursComptes: (c.nombreComptes || 1) > 1,
    chezConfrere: d.roleNotaire === 'participant' && typeof notaireParticipantRepresenteAcquereur === 'function' && !!notaireParticipantRepresenteAcquereur(d) };
  if (solde == null) return Object.assign(base, { etat: 'non-lu' });
  const signe = typeof signatureFaiteSuivi === 'function' && !!signatureFaiteSuivi(d);
  if (signe) return Object.assign(base, { etat: 'signe' });
  if (!attendu) return Object.assign(base, { etat: 'sans-attendu' });
  const ecart = Math.round((solde - attendu) * 100) / 100;
  const marge = typeof MARGE_FONDS_RECUS === 'number' ? MARGE_FONDS_RECUS : 2;
  const etat = Math.abs(ecart) <= marge && solde > 0 ? 'egal' : ecart < 0 ? 'ecart-moins' : 'ecart-plus';
  return Object.assign(base, { etat, ecart });
}

function htmlFondsComptaAT(d) {
  if (!d || estSuccession(d) || !String(d.referenceAuthentic || '').trim()) return '';
  const k = comparaisonFondsComptaAT(d);
  // Lire / relire : bouton de la carte « Comptabilité » de l'onglet Fonds (étude 30/10), plus ici.
  if (!k) return '';
  const aide = infoBulle('Solde de l’affaire dans Authentic (lecture seule) comparé au « Solde à verser » du courrier d’appel de fonds, à 2 € près. Il peut comprendre un acompte, le dépôt de garantie ou des provisions : vérifiez l’écriture dans Authentic avant de valider les fonds.');
  const m = montantComptaAT;
  const textes = {
    egal: ['dl-neutre', `solde de l’affaire ${m(k.solde)}, égal au solde à verser (à 2 € près) — à vérifier avant de valider les fonds`],
    'ecart-moins': ['dl-pret', `solde de l’affaire ${m(k.solde)}, solde à verser ${m(k.attendu)} — écart de ${m(-k.ecart)}, à vérifier`],
    'ecart-plus': ['dl-pret', `solde de l’affaire ${m(k.solde)}, solde à verser ${m(k.attendu)} — ${m(k.ecart)} de plus, à vérifier`],
    'sans-attendu': ['dl-neutre', `solde de l’affaire ${m(k.solde)} (montant de l’appel de fonds inconnu)`],
    signe: ['dl-neutre', `solde de l’affaire ${m(k.solde)} (acte signé : pas de comparaison)`],
    'non-lu': ['dl-neutre', 'solde de l’affaire non lu']
  };
  const [cls, texte] = textes[k.etat];
  const notes = [k.plusieursComptes ? 'plusieurs comptes : seul le premier solde est lu' : '', k.chezConfrere ? 'participation : les fonds peuvent être encaissés par le confrère' : ''].filter(Boolean).join(' · ');
  return `<div class="fonds-compta"><span class="dot-label ${cls}"><span class="dot"></span>Authentic : ${escapeHtml(texte)}</span>
    <span class="fonds-compta-source">lu le ${escapeHtml(formatDateFr(String(k.luLe).slice(0, 10)))}${notes ? ' · ' + escapeHtml(notes) : ''} ${aide}</span></div>`;
}

// « Demander à CLAIRE » (outil `authentic_comptabilite`) : la lecture gardée ; relire = une session dans Authentic, après « Autoriser ».
async function comptabiliteAgent(e) {
  const d = dossiers.find(x => x && x.id === String((e && e.dossier_id) || ''));
  if (!d) return { erreur: 'aucun dossier avec cet id' };
  if (!String(d.referenceAuthentic || '').trim()) return { erreur: 'dossier pas relié à Authentic par sa référence : lis d’abord le dossier dans Authentic' };
  const deja = comptabilitePourAgent((d.authentic || {}).comptabilite);
  const comparer = (x) => {
    const k = comparaisonFondsComptaAT(x);
    return k ? { solde_affaire_compare_au_solde_a_verser: { etat: k.etat, solde_affaire: k.solde, solde_a_verser: k.attendu, ecart: k.ecart, plusieurs_comptes: k.plusieursComptes, participation_fonds_peut_etre_chez_le_confrere: k.chezConfrere,
      note: 'le solde de l’affaire peut comprendre un acompte, le dépôt de garantie ou des provisions : « egal » ne vaut pas réception des fonds, à vérifier dans Authentic ; « signe » : fonds décaissés, pas de comparaison' } } : {};
  };
  if (!(e && e.relire === true) && deja) return Object.assign({ dossier_id: d.id }, deja, comparer(d));
  if (lecturesComptabiliteEnCours.has(d.id)) return { erreur: 'une lecture de cette comptabilité est déjà en cours : attends son résultat' };
  if (!(await demanderAutorisationAgent(`Lire la comptabilité de ${libelleDossierAffiche(d)} dans Authentic (onglet « Comptabilité », lecture seule, une minute environ).`))) {
    return { refuse: true, message: 'l’utilisateur a refusé : ne le refais pas sans nouvelle demande' };
  }
  const r = await lireComptabiliteAT(d.id);
  if (!r.ok) return { erreur: 'lecture non faite : ' + r.texte, derniere_lecture: deja };
  const f = dossiers.find(x => x && x.id === d.id) || d;
  return Object.assign({ dossier_id: d.id, fait: true }, comptabilitePourAgent((f.authentic || {}).comptabilite) || { note: 'lue, la fiche se met à jour dans un instant' }, comparer(f));
}

// Pure : la comptabilité d'Authentic mise sous la forme d'un relevé de compte client lu (même résultat que `analyserReleveCompteClient` sur le
// PDF de JurisWeb) — retour de l'étude 30/10 : « pour l'appel de fonds, au lieu de déposer le relevé de compte client, aller le chercher dans la
// compta d'Authentic ». Une ligne par opération, les deux colonnes Débit / Crédit toujours écrites, donc aucune colonne devinée.
function analyseReleveDepuisComptabilite(c) {
  const montant = (n) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const lignes = ['Relevé de compte client'];
  (c && Array.isArray(c.operations) ? c.operations : []).forEach((o) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(o && o.date || ''));
    if (!m || !o.libelle || !(Number(o.debit) > 0 || Number(o.credit) > 0)) return;
    lignes.push(`${m[3]}/${m[2]}/${m[1]} ${String(o.libelle).replace(/\s+/g, ' ').trim()} ${montant(o.debit)} ${montant(o.credit)}`);
  });
  return analyserReleveCompteClient(lignes);
}

// « Lire dans Authentic » de l'outil Appel de fonds : relit la comptabilité du dossier relié (navigateur du serveur, lecture seule) puis pose le
// relevé comme une pièce lue. Rend { ok, texte }.
async function lireReleveCompteDansAuthentic() {
  const d = typeof dossierAppelFondsLie === 'function' ? dossierAppelFondsLie() : null;
  if (!d || !String(d.referenceAuthentic || '').trim()) { afficherToast('Reliez d’abord un dossier qui a sa référence Authentic : le relevé est lu dans sa comptabilité.', 'OK', null); return { ok: false, texte: 'pas de dossier Authentic' }; }
  const r = await lireComptabiliteAT(d.id);
  const c = ((dossiers.find((x) => x.id === d.id) || d).authentic || {}).comptabilite;
  if (!r.ok || !c) return { ok: false, texte: r.texte || 'comptabilité non lue' };
  return poserReleveCompteAppelFonds(analyseReleveDepuisComptabilite(c));
}

// Le dossier repris par l'outil (pour lire son relevé dans la comptabilité d'Authentic, client/140).
function dossierAppelFondsLie() {
  return afDossierLie ? dossiers.find(x => x.id === afDossierLie) || null : null;
}

// Pose un relevé de compte déjà analysé (comptabilité d'Authentic) comme la pièce « relevé de compte client ».
function poserReleveCompteAppelFonds(analyse) {
  effacerPieceAppelFonds('releve', true);
  afPieces.releve = { fichier: 'Comptabilité d’Authentic', analyse };
  appliquerPieceAppelFonds('releve');
  return { ok: true, texte: 'Relevé lu dans la comptabilité d’Authentic' };
}
