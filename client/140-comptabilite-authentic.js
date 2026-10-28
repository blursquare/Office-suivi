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
    lue_le: String(c.luLe).slice(0, 16), solde_compte: c.soldeCompte, solde_affaire: c.soldeAffaire,
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
    <p class="at-compta-lu">Lu le ${escapeHtml(formatDateFr(String(c.luLe).slice(0, 10)))}${c.tronque ? ' · liste des opérations incomplète' : ''}</p></div>`;
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

// « Demander à CLAIRE » (outil `authentic_comptabilite`) : la lecture gardée ; relire = une session dans Authentic, après « Autoriser ».
async function comptabiliteAgent(e) {
  const d = dossiers.find(x => x && x.id === String((e && e.dossier_id) || ''));
  if (!d) return { erreur: 'aucun dossier avec cet id' };
  if (!String(d.referenceAuthentic || '').trim()) return { erreur: 'dossier pas relié à Authentic par sa référence : lis d’abord le dossier dans Authentic' };
  const deja = comptabilitePourAgent((d.authentic || {}).comptabilite);
  if (!(e && e.relire === true) && deja) return Object.assign({ dossier_id: d.id }, deja);
  if (lecturesComptabiliteEnCours.has(d.id)) return { erreur: 'une lecture de cette comptabilité est déjà en cours : attends son résultat' };
  if (!(await demanderAutorisationAgent(`Lire la comptabilité de ${libelleDossierAffiche(d)} dans Authentic (onglet « Comptabilité », lecture seule, une minute environ).`))) {
    return { refuse: true, message: 'l’utilisateur a refusé : ne le refais pas sans nouvelle demande' };
  }
  const r = await lireComptabiliteAT(d.id);
  if (!r.ok) return { erreur: 'lecture non faite : ' + r.texte, derniere_lecture: deja };
  const f = dossiers.find(x => x && x.id === d.id) || d;
  return Object.assign({ dossier_id: d.id, fait: true }, comptabilitePourAgent((f.authentic || {}).comptabilite) || { note: 'lue, la fiche se met à jour dans un instant' });
}
