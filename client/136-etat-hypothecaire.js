// Relecture de l'état hypothécaire (étude 27/10 : « la relecture d'un état hypothécaire dans les annexes [d'Authentic] pour vérifier s'il y a
// des inscriptions hypothécaires » ; choix : annexes d'Authentic, alerte sur la fiche + pièces à réclamer + proposition au responsable,
// inscriptions périmées signalées à part ; « les inscriptions seront en rouge » — la rubrique Charge de l'état-réponse ANF).
// « Relire l'état » sur la pièce jointe : le PDF lu dans Authentic (client/133 `blobPieceAuthenticAT`), son texte lu ICI par pdf.js — sans
// IA, sans OCR (les fiches anciennes scannées ne sont que comptées) —, la lecture de commun/etat-hypothecaire.js gardée sur la fiche
// (`d.etatHypothecaire`). Une inscription en cours : alerte, « Décompte de remboursement » et « Accord de mainlevée » par créancier dans la
// checklist (quand l'étude représente le vendeur), message de CLAIRE dans le canal du dossier (son responsable en est prévenu).

async function textePagesPdfEtat(blob) {
  const pdf = await pdfjsLib.getDocument({ isEvalSupported: false, data: await blob.arrayBuffer(), verbosity: (pdfjsLib.VerbosityLevel ? pdfjsLib.VerbosityLevel.ERRORS : 0) }).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages && p <= 200; p++) {
    const c = await (await pdf.getPage(p)).getTextContent();
    pages.push(c.items.map(it => it.str).join(' '));
  }
  return pages;
}

// Pure : les pièces à réclamer pour les inscriptions en cours — une paire par créancier (créancier non lu : une paire « à identifier »).
function piecesEtatHypothecaire(etat) {
  const enCours = inscriptionsEnCours(etat);
  const creanciers = [...new Set(enCours.map(x => x.creancier || ''))];
  return creanciers.flatMap(c => {
    const qui = c ? ` — ${c}` : ' — créancier à identifier';
    return [`Décompte de remboursement${qui}`, `Accord de mainlevée${qui}`];
  });
}

// Pure : la phrase de CLAIRE pour le canal du dossier (courte, comme une collègue).
function messageEtatHypothecaire(etat) {
  const n = inscriptionsEnCours(etat).length;
  const perimees = ((etat && etat.inscriptions) || []).filter(x => x.etat !== 'en_cours').length;
  const comp = ((etat && etat.chargesComplement) || []).length;
  const tete = n ? `État hypothécaire relu : ${n} inscription${n > 1 ? 's' : ''} en cours, à purger avant la signature.` : 'État hypothécaire relu : aucune inscription en cours dans le relevé des formalités.';
  const suite = [perimees ? `${perimees} radiée${perimees > 1 ? 's' : ''} ou périmée${perimees > 1 ? 's' : ''}` : '', comp ? `${comp} charge${comp > 1 ? 's' : ''} signalée${comp > 1 ? 's' : ''} dans un complément` : '',
    etat && etat.facesStock ? `${etat.facesStock} faces de fiches anciennes à relire` : ''].filter(Boolean).join(', ');
  return tete + (suite ? ` ${suite.charAt(0).toUpperCase() + suite.slice(1)}.` : '');
}

async function relireEtatHypothecaireAT(dossierId, pjId) {
  const d = dossiers.find(x => x.id === dossierId);
  if (!d) return;
  afficherToast('CLAIRE ouvre l’état dans Authentic et le relit (une minute environ)…', 'OK', null);
  try {
    const pages = await textePagesPdfEtat(await blobPieceAuthenticAT(dossierId, pjId));
    const etat = analyserEtatHypothecaire(pages, isoAujourdhuiLocal());
    if (!etat.anf && !etat.inscriptions.length) throw new Error('ce document n’a pas la forme d’un état-réponse ANF');
    const piece = (((instantanesAuthenticAT[dossierId] || {}).inst || {}).sousDossier || {}).pieces || [];
    const nom = (piece.find(p => p.pjId === pjId) || {}).nom || '';
    d.etatHypothecaire = Object.assign({ luLe: new Date().toISOString(), piece: nom }, etat);
    ajouterHistorique(d, `État hypothécaire relu : ${inscriptionsEnCours(etat).length} inscription(s) en cours`);
    // Pièces à réclamer : seulement quand l'étude représente le vendeur (un confrère du vendeur s'en charge sinon), jamais en double.
    if (inscriptionsEnCours(etat).length && !(typeof confrereRepresenteVendeur === 'function' && confrereRepresenteVendeur(d))) {
      d.piecesPersonnalisees = d.piecesPersonnalisees || [];
      for (const label of piecesEtatHypothecaire(etat)) {
        if (d.piecesPersonnalisees.some(p => p.label === label)) continue;
        d.piecesPersonnalisees.push({ cle: 'perso-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), label });
        ajouterHistorique(d, `Pièce ajoutée à la checklist : « ${label} » (état hypothécaire)`);
      }
    }
    sauvegarder(d);
    render();
    // Le message de CLAIRE dans le canal du dossier : son responsable en est prévenu (0.383.1).
    fetchAvecAuth(`/api/canaux/${encodeURIComponent('d:' + d.id)}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auteur: utilisateurPoste || '', claire: true, texte: messageEtatHypothecaire(etat) }) }).catch(() => {});
    noterVerificationPoste('etat-hypothecaire', { detail: `${etat.inscriptions.length} charge(s) lue(s)` });
    afficherToast(messageEtatHypothecaire(etat), 'OK', null);
  } catch (e) {
    noterVerificationPoste('etat-hypothecaire', { ok: false, message: String((e && e.message) || 'erreur').slice(0, 80) });
    afficherToast('État non relu : ' + (e && e.message ? e.message : 'erreur'), 'OK', null);
  }
}

// Le bloc de la fiche (panneau « Authentic ») : les inscriptions en cours en rouge, puis radiées / périmées, les charges des compléments et
// les fiches anciennes à relire.
function htmlEtatHypothecaireFiche(d) {
  const e = d && d.etatHypothecaire;
  if (!e || !Array.isArray(e.inscriptions)) return '';
  const date = (x) => (x ? formatDateFr(x) : '');
  const ligne = (x, classe) => `<li class="eh-ligne ${classe}"><span class="eh-nature">${escapeHtml(x.nature || 'Inscription')}</span>
    <span class="eh-detail">${escapeHtml([x.creancier || 'créancier à vérifier', x.montant, x.dateDepot ? 'déposée le ' + date(x.dateDepot) : '', x.reference,
      x.dateExtremeEffet ? (x.etat === 'perimee' ? 'périmée le ' : 'effet jusqu’au ') + date(x.dateExtremeEffet) : 'date extrême d’effet à vérifier',
      x.etat === 'radiee' ? 'radiée' : x.radiation === 'partielle' ? 'radiation partielle' : '', 'p. ' + x.page].filter(Boolean).join(' · '))}</span></li>`;
  const enCours = e.inscriptions.filter(x => x.etat === 'en_cours');
  const autres = e.inscriptions.filter(x => x.etat !== 'en_cours');
  return `<div class="at-groupe eh-bloc"><div class="at-groupe-titre">État hypothécaire${infoBulle('Relu par CLAIRE dans l’état-réponse ANF' + (e.delivreLe ? ` délivré le ${date(e.delivreLe)}` : '') + ' : rubrique Charge du relevé des formalités (depuis 2002). Les fiches d’avant sont des scans manuscrits que CLAIRE ne lit pas : à relire par le notaire. Assistance : le notaire garde l’analyse juridique.')}</div>
    ${enCours.length ? `<p class="eh-alerte">${enCours.length} inscription${enCours.length > 1 ? 's' : ''} en cours</p><ul class="at-liste">${enCours.map(x => ligne(x, 'eh-en-cours')).join('')}</ul>`
      : '<p class="eh-ok">Aucune inscription en cours dans le relevé des formalités.</p>'}
    ${autres.length ? `<details class="eh-autres"><summary>${autres.length} radiée${autres.length > 1 ? 's' : ''} ou périmée${autres.length > 1 ? 's' : ''}</summary><ul class="at-liste">${autres.map(x => ligne(x, 'eh-passee')).join('')}</ul></details>` : ''}
    ${(e.chargesComplement || []).length ? `<ul class="at-liste">${e.chargesComplement.map(c => `<li class="eh-ligne eh-complement"><span class="eh-nature">${escapeHtml(c.nature || 'Charge')}</span><span class="eh-detail">${escapeHtml((c.complement || 'charge signalée dans le complément') + ' · p. ' + c.page)}</span></li>`).join('')}</ul>` : ''}
    ${e.enAttente ? `<p class="eh-note">${e.enAttente} formalité${e.enAttente > 1 ? 's' : ''} en attente ou rejetée${e.enAttente > 1 ? 's' : ''} : à vérifier.</p>` : ''}
    ${e.facesStock ? `<p class="eh-note">${e.facesStock} faces de fiches anciennes (avant 2002) à relire par le notaire.</p>` : ''}
  </div>`;
}
