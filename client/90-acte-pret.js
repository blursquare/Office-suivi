// ==== Acte de prêt et déclaration d'origine des deniers (DOD) — étude 20/10 ====
// « S'il y a une hypothèque légale ou conventionnelle et que l'on est en participation, il faut mettre dans À faire :
// rédiger l'acte de prêt, et envoyer la DOD au notaire instrumentaire. Si on est notaire vendeur et qu'un confrère
// représente l'acquéreur, c'est l'inverse : il doit nous envoyer sa DOD. Si on est seul notaire, le prêt est rédigé dans
// l'acte de vente. Détecter le sous-dossier Authentic « prêt » pour savoir s'il est prêt ou en cours de rédaction.
// Mettre en avant l'hypothèque près du prix de vente, en haut de la fiche. »
// Les hypothèques viennent de l'offre de prêt (garanties lues, client/36) : ni caution ni « sans garantie » n'appellent d'acte de prêt.

var CLES_HYPOTHEQUE_PRET = ['hypothequeLegale', 'hypothequeConventionnelle'];

// Pure : les hypothèques lues dans l'offre de prêt, [{ cle, label }] (la légale d'abord).
function hypothequesPret(d) {
  if (!d || d.sansPret) return [];
  const lues = Array.isArray(d.garantiesPret) ? d.garantiesPret : [];
  return CLES_HYPOTHEQUE_PRET.filter(c => lues.includes(c)).map(c => ({ cle: c, label: (GARANTIES_PRET.find(g => g.cle === c) || {}).label || c }));
}

// Pure : qui rédige l'acte de prêt, selon le rôle de l'étude — null sans hypothèque (ou en succession).
//   'redige'    : participation, notre client est l'acquéreur : nous rédigeons l'acte de prêt et envoyons la DOD au notaire
//                 instrumentaire (le confrère du vendeur) ;
//   'attendu'   : nous recevons l'acte, un confrère représente l'acquéreur : c'est lui qui rédige, sa DOD nous est due ;
//   'dans-acte' : seul notaire : le prêt est rédigé dans l'acte de vente, rien à faire à part.
// Participation côté vendeur (l'acquéreur est celui d'un confrère qui reçoit l'acte) : rien pour nous.
function circuitActePret(d) {
  if (!d || d.deleted || estSuccession(d) || !hypothequesPret(d).length) return null;
  const confrereAcquereur = notaireParticipantRepresenteAcquereur(d);
  if (d.roleNotaire === 'participant') {
    // Notre client est l'acquéreur seulement si un confrère représente le vendeur (c'est lui qui reçoit l'acte) : sinon, rien.
    return !confrereAcquereur && confrereRepresenteVendeur(d) ? { mode: 'redige', destinataire: emailConfrereVendeurDossier(d) } : null;
  }
  return confrereAcquereur ? { mode: 'attendu', destinataire: emailDestinataireRelance(d) } : { mode: 'dans-acte', destinataire: '' };
}

// Pure : le sous-dossier « prêt » lu dans Authentic ({ etat: 'a_rediger' | 'redaction' | 'signe', libelle, date, vuLe }), null si jamais lu.
function etatActePretAuthentic(d) {
  const p = d && d.authentic && d.authentic.pret;
  return p && p.etat ? p : null;
}

// Pure : l'acte de prêt est-il pris en charge ? Commencé ou signé dans Authentic, ou noté fait à la main.
function actePretPrisEnCharge(d) {
  const p = etatActePretAuthentic(d);
  return !!(d && (d.actePretLe || (p && (p.etat === 'redaction' || p.etat === 'signe'))));
}

// Pure : l'état de l'acte de prêt d'après la page du sous-dossier « prêt » d'Authentic — le tableau « Rédaction » (« Non rédigé »,
// « En cours », « Signé le … »), lu comme pour l'acte de vente. null quand la page n'en dit rien.
function lireActePretAuthentic(capture) {
  const e = etatActeAuthentic(capture);
  if (!e || !e.etat) return null;
  const libelles = { signe: 'Acte de prêt signé', redaction: 'Acte de prêt en cours de rédaction', a_rediger: 'Acte de prêt pas encore rédigé' };
  return libelles[e.etat] ? { etat: e.etat, libelle: libelles[e.etat], date: e.date || '' } : null;
}

// Modifie le dossier : retient l'état lu dans le sous-dossier « prêt » (Authentic). → vrai si quelque chose a changé.
function appliquerActePretAuthentic(d, lu, aujourdhuiIso) {
  if (!d || !lu) return false;
  d.authentic = d.authentic || {};
  const avant = d.authentic.pret || {};
  if (avant.etat === lu.etat && (avant.date || '') === (lu.date || '')) {
    if (avant.vuLe !== aujourdhuiIso) d.authentic.pret = Object.assign({}, avant, { vuLe: aujourdhuiIso });
    return false;
  }
  d.authentic.pret = { etat: lu.etat, libelle: lu.libelle, date: lu.date || '', vuLe: aujourdhuiIso };
  ajouterHistorique(d, `${lu.libelle}${lu.date ? ` le ${formatDateFr(lu.date)}` : ''} (sous-dossier prêt d’Authentic)`);
  return true;
}

// Sous-dossier « Promesse » d'Authentic (étude 22/10 : « date de l'avant-contrat inconnue — c'est la date de signature du compromis ou de la
// promesse de vente ») : son « Signé le … » est la date de l'avant-contrat des statistiques. Jamais par-dessus une date déjà posée (créée à
// l'import, saisie à la main). → vrai si la fiche a changé. Forme de la page non vérifiée au bureau (point `avant-contrat-authentic`).
function retenirDateAvantContratAuthentic(d, capture) {
  if (!d || d.deleted || estSuccession(d) || /^\d{4}-\d{2}-\d{2}$/.test(d.dateAvantContrat || '')) return false;
  const e = etatActeAuthentic(capture);
  let date = e && e.etat === 'signe' ? (e.date || '') : '';
  // Badge du sous-dossier : « Signé » puis sa date, sur deux lignes (structure reçue le 22/10 pour un sous-dossier signé).
  if (!date) {
    const m = /(?:^|\n)\s*Sign[ée]e?\s*\n\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4})/.exec(String((capture && capture.texte) || ''));
    date = m ? dateIsoDepuisFr(m[1]) : '';
  }
  const signe = /^\d{4}-\d{2}-\d{2}$/.test(date || '');
  noterVerificationPoste('avant-contrat-authentic', signe ? { detail: 'date de signature lue' } : { ok: false, detail: 'sous-dossier promesse sans « Signé le » lisible' });
  if (!signe) return false;
  d.dateAvantContrat = date;
  ajouterHistorique(d, `Date de l’avant-contrat reprise d’Authentic : signé le ${formatDateFr(date)}`);
  return true;
}

// Page du sous-dossier « prêt » reçue pour ce dossier : lit son état et le retient. → vrai si la fiche a changé.
function retenirPageActePretAuthentic(d, capture, aujourdhuiIso) {
  const lu = lireActePretAuthentic(capture);
  noterVerificationPoste('pret-authentic-sous-dossier', lu ? { detail: lu.libelle } : { ok: false, detail: 'sous-dossier prêt sans état de rédaction lisible' });
  return appliquerActePretAuthentic(d, lu, aujourdhuiIso);
}

// Pure : les tâches de « À faire » d'un dossier (même forme que celles d'actionsDuJour). Rien une fois l'acte signé.
function tachesActePret(d, aujourdhuiIso) {
  const c = circuitActePret(d);
  if (!c || c.mode === 'dans-acte' || d.archive || signatureFaiteSuivi(d)) return [];
  const j = d.rendezVousSignature ? ecartJours(aujourdhuiIso, d.rendezVousSignature) : null;
  const gravite = j !== null && j <= 3 ? 'critique' : 'vigilance';
  const hyp = hypothequesPret(d).map(h => h.label).join(' et ').toLowerCase();
  const out = [];
  if (c.mode === 'redige') {
    if (!actePretPrisEnCharge(d)) {
      const lu = etatActePretAuthentic(d);
      out.push({
        type: 'actePret', categorie: 'pret', categorieLabel: 'Acte de prêt',
        titre: 'Rédiger l’acte de prêt',
        contexte: `Prêt garanti par ${hyp} : en participation, c’est notre office qui rédige l’acte de prêt. ${lu ? `Authentic (vu ${quandJour(lu.vuLe, aujourdhuiIso)}) : ${lu.libelle.toLowerCase()}.` : 'Rien lu dans le sous-dossier prêt d’Authentic.'}`,
        jours: j, gravite, geste: { type: 'fiche' }, bouton: 'Ouvrir la fiche',
        second: { type: 'marquer', champ: 'actePret', libelle: 'Déjà fait' }
      });
    }
    if (!d.dodEnvoyeeLe) {
      out.push({
        type: 'dodEnvoi', categorie: 'pret', categorieLabel: 'Acte de prêt',
        titre: 'Envoyer la DOD au notaire instrumentaire',
        contexte: `Déclaration d’origine des deniers à adresser à ${d.notaireVendeur || 'l’office qui reçoit l’acte'}.${c.destinataire ? '' : ' Email du confrère non renseigné.'}`,
        jours: j, gravite, geste: c.destinataire ? { type: 'dod', sens: 'envoi' } : { type: 'fiche' },
        bouton: c.destinataire ? 'Ouvrir l’email' : 'Ouvrir la fiche',
        second: { type: 'marquer', champ: 'dodEnvoi', libelle: 'Déjà envoyée' }
      });
    }
  } else if (c.mode === 'attendu' && !d.dodRecueLe && !d.dodDemandeeLe) {
    out.push({
      type: 'dodAttendue', categorie: 'pret', categorieLabel: 'Acte de prêt',
      titre: 'Réclamer la DOD au confrère',
      contexte: `Prêt garanti par ${hyp} : ${d.notaireAcquereur || 'le confrère de l’acquéreur'} rédige l’acte de prêt et doit nous envoyer sa déclaration d’origine des deniers.${c.destinataire ? '' : ' Email du confrère non renseigné.'}`,
      jours: j, gravite, geste: c.destinataire ? { type: 'dod', sens: 'demande' } : { type: 'fiche' },
      bouton: c.destinataire ? 'Ouvrir l’email' : 'Ouvrir la fiche',
      second: { type: 'marquer', champ: 'dodAttendue', libelle: 'Déjà reçue' }
    });
  }
  return out;
}

// Pure : l'email de la DOD, premier jet de CLAIRE (à remplacer par le texte de l'étude) — 'envoi' au notaire instrumentaire,
// 'demande' au confrère de l'acquéreur.
function construireEmailDod(d, sens) {
  const sujet = `${sens === 'envoi' ? 'DOD' : 'Votre DOD'} — ${libelleDossierAffiche(d)}`;
  const corps = sens === 'envoi'
    ? ['Mon Cher Maître,',
      'Veuillez trouver ci-joint la déclaration d’origine des deniers (DOD) de notre client, l’acquéreur, dont le prêt est garanti par une hypothèque. L’acte de prêt est rédigé par notre office.',
      'Vous en souhaitant bonne réception.',
      'Votre bien dévoué.']
    : ['Mon Cher Maître,',
      'Le prêt de votre client est garanti par une hypothèque. Pouvez-vous nous adresser votre déclaration d’origine des deniers (DOD) s’il vous plaît ?',
      'Dans l’attente et vous en remerciant par avance,',
      'Votre bien dévoué.'];
  return { sujet, corps: corps.join('\n\n') };
}

// Ouvre la fenêtre d'email de la DOD ; rien n'est noté tant que l'email n'est pas parti ou préparé. → vrai si c'est le cas.
async function ouvrirEmailDod(id, sens) {
  const d = dossiers.find(x => x.id === id);
  const c = d && circuitActePret(d);
  if (!d || !c || !c.destinataire) { ouvrirDossierDepuisDashboard(id); return false; }
  const { sujet, corps } = construireEmailDod(d, sens);
  const r = await livrerEmailDossier({ destinataire: c.destinataire, sujet, corps, confrere: true, responsableSignature: d.responsable, dossierId: d.id, geste: sens === 'envoi' ? 'dodEnvoi' : 'dodDemande' });
  if (!r.ok) { if (!r.annule) afficherToast(r.message || 'L’email n’a pas pu être préparé.', 'OK', null); return false; }
  d[sens === 'envoi' ? 'dodEnvoyeeLe' : 'dodDemandeeLe'] = isoAujourdhuiLocal();
  ajouterHistorique(d, sens === 'envoi' ? 'Email envoyé — DOD au notaire instrumentaire' : 'Email envoyé — DOD demandée au confrère');
  notifierTacheFaite(d, sens === 'envoi' ? 'Envoyer la DOD au notaire instrumentaire' : 'Réclamer la DOD au confrère', `${libelleEmailFait(r).toLowerCase()} au confrère`);
  noterVerificationPoste('dod-email', { detail: sens === 'envoi' ? 'DOD envoyée au notaire instrumentaire' : 'DOD demandée au confrère' });
  await sauvegarder(d);
  render();
  return true;
}

// Pure : la ligne « Acte de prêt » du bloc « Offre de prêt » de l'onglet Fonds — { texte, classe }, null sans hypothèque.
function ligneActePretFonds(d) {
  const c = circuitActePret(d);
  if (!c) return null;
  if (c.mode === 'dans-acte') return { texte: 'Rédigé dans l’acte de vente', classe: '' };
  const lu = etatActePretAuthentic(d);
  const authentic = lu ? ` · ${lu.libelle.replace('Acte de prêt ', '')} dans Authentic` : '';
  if (c.mode === 'redige') {
    const dod = d.dodEnvoyeeLe ? ` · DOD envoyée le ${formatDateFr(d.dodEnvoyeeLe)}` : ' · DOD à envoyer au notaire instrumentaire';
    return { texte: `${actePretPrisEnCharge(d) ? 'Rédaction commencée' : 'À faire rédiger par l’office'}${authentic}${dod}`, classe: actePretPrisEnCharge(d) && d.dodEnvoyeeLe ? '' : 'a-faire' };
  }
  const dod = d.dodRecueLe ? ` · DOD reçue le ${formatDateFr(d.dodRecueLe)}` : (d.dodDemandeeLe ? ` · DOD demandée le ${formatDateFr(d.dodDemandeeLe)}` : ' · DOD du confrère à réclamer');
  return { texte: `Rédigé par le confrère de l’acquéreur${authentic}${dod}`, classe: d.dodRecueLe ? '' : 'a-faire' };
}

// Pastilles d'hypothèque près du prix en haut de la fiche (étude 20/10 : « mettre en avant s'il y a une hypothèque ») — l'hypothèque
// légale de prêteur de deniers et la conventionnelle, jamais la caution.
function pastillesHypothequeEntete(d) {
  const hyp = hypothequesPret(d);
  if (!hyp.length) return '';
  const c = circuitActePret(d);
  const lu = etatActePretAuthentic(d);
  const ligne = ligneActePretFonds(d);
  const info = [ligne ? `Acte de prêt : ${ligne.texte.toLowerCase()}` : '', lu && c && c.mode === 'dans-acte' ? lu.libelle : ''].filter(Boolean).join(' — ');
  return `<span class="fiche-entete-hypotheque" title="${escapeAttr(info || 'Prêt garanti par une hypothèque')}">${hyp.map(h =>
    `<span class="garantie-pastille garantie-forte">${icone('key')}${escapeHtml(h.cle === 'hypothequeLegale' ? 'Hypothèque légale' : 'Hypothèque conventionnelle')}</span>`).join('')}</span>`;
}
