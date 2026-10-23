// Courrier d'appel de fonds — saisie des montants dans l'aperçu et rangement sur le NAS (étude 23/10) ; suite de client/40-generateur-appel-fonds.js.

// Le navigateur peut retirer le <span> d'une cellule quand on en efface tout le texte (le « € » supprimé, puis un chiffre tapé) : le texte
// reste dans la cellule, hors de tout champ — la ligne n'était plus additionnée ni reprise dans le courrier (étude 23/10). Le champ est
// reconstruit autour du texte, curseur à la fin.
function reparerChampsDecompteAppelFonds() {
  ['af-tbody-debit', 'af-tbody-credit'].forEach(id => {
    const tbody = afEl(id);
    if (!tbody) return;
    tbody.querySelectorAll('tr').forEach(tr => {
      if (tr.classList.contains('af-sous-total')) return;
      const lib = tr.querySelector('.af-champ[data-af-champ="libelle"]');
      if (!lib) return;
      const cellules = [...tr.querySelectorAll('td.af-montant')];
      if (cellules.some(c => c.querySelector('.af-champ[data-af-champ="montant"]'))) return;
      const cellule = cellules.find(c => (c.textContent || '').trim());
      if (!cellule) return;
      const span = document.createElement('span');
      span.className = 'af-champ';
      span.setAttribute('data-af-section', lib.getAttribute('data-af-section'));
      span.setAttribute('data-af-index', lib.getAttribute('data-af-index'));
      span.setAttribute('data-af-champ', 'montant');
      span.textContent = cellule.textContent.trim();
      cellule.textContent = '';
      cellule.appendChild(span);
      try {
        const sel = window.getSelection();
        const plage = document.createRange();
        plage.selectNodeContents(span);
        plage.collapse(false);
        sel.removeAllRanges();
        sel.addRange(plage);
      } catch (e) { /* curseur : confort seulement */ }
    });
  });
}

// À la sortie d'une cellule de montant (le curseur passe à une autre cellule ou quitte le courrier) : un nombre est remis en forme
// (« 24 » → « 24,00 € »), un texte (« pour mémoire ») reste tel quel. Le courrier est UN seul bloc modifiable : la sortie se suit au curseur.
var afChampMontantActif = null;
function formaterMontantSortieAppelFonds(span) {
  if (!span || !span.isConnected) return;
  const section = span.getAttribute('data-af-section');
  const i = parseInt(span.getAttribute('data-af-index'), 10);
  const ligne = afLignes[section] && afLignes[section][i];
  if (ligne && !ligne.memoire) span.textContent = montantVersTexteFr(ligne.montant || 0);
}
function suivreCurseurMontantAppelFonds() {
  const lettre = afEl('af-lettre');
  const sel = window.getSelection ? window.getSelection() : null;
  let noeud = sel && sel.anchorNode;
  if (noeud && noeud.nodeType === 3) noeud = noeud.parentNode;
  const actuel = lettre && noeud && lettre.contains(noeud) && noeud.closest ? noeud.closest('.af-champ[data-af-champ="montant"]') : null;
  if (actuel === afChampMontantActif) return;
  const precedent = afChampMontantActif;
  afChampMontantActif = actuel;
  if (precedent) formaterMontantSortieAppelFonds(precedent);
}
if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('selectionchange', suivreCurseurMontantAppelFonds);


// La convocation rangée à la RACINE du dossier de la vente sur le NAS, Word et PDF/A, au lieu du dossier de téléchargement du poste (étude 23/10).
// Même voie que « Constitution de dossier » et les rendus de l'agent : POST /api/nas/deposer-document, dossier relu par le serveur, copie
// « Nom (2) » plutôt qu'écraser, sur clic seulement. Le PDF/A est facultatif : sans les bibliothèques, le Word est rangé quand même.
async function rangerAppelFondsDansDossier(btn) {
  const d = afDossierLie ? dossiers.find(x => x.id === afDossierLie) : null;
  if (!d || !d.nasDossier) { afficherToast('Reliez un dossier lui-même relié au NAS pour y ranger le courrier.', 'OK', null); return; }
  const libelleInitial = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Enregistrement…'; }
  const ranges = [];
  try {
    const word = await genererBlobAppelFonds();
    const nomBase = word.nom.replace(/\.docx$/i, '');
    const deposer = async (blob, format) => {
      const r = await fetchAvecAuth('/api/nas/deposer-document', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dossierId: d.id, nom: nomBase, contenu: await blobVersBase64(blob), format }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erreur || `le serveur a répondu ${r.status}`);
      ranges.push(String(j.chemin || '').split(/[\\/]/).pop() || nomBase + '.' + format);
      // Tracé dès le premier dépôt réussi : un nouvel essai après une panne ne laisse pas un doublon sans explication.
      ajouterHistorique(d, `Courrier d'appel de fonds enregistré dans le dossier du NAS (${ranges[ranges.length - 1]})`);
      sauvegarder(d);
    };
    // Génération et dépôt du PDF/A séparés : une génération impossible (bibliothèques) n'empêche pas le Word, un dépôt refusé se dit.
    let pdf = null;
    try { pdf = await genererPdfAAppelFonds(word.donnees, word.nom); } catch (e) { console.error(e); }
    await deposer(word.blob, 'docx');
    if (pdf) await deposer(pdf.blob, 'pdf');
    enregistrerAppelFondsHistorique('telecharge', word.nom, word.donnees);
    afficherToast(pdf ? `Rangé dans le dossier de la vente : ${ranges.join(' · ')}` : `Word rangé : ${ranges[0]}. Le PDF/A n’a pas pu être généré (bibliothèques non chargées).`, 'OK', null);
  } catch (e) {
    console.error(e);
    afficherToast('Courrier non rangé en entier : ' + (e && e.message ? e.message : 'erreur') + (ranges.length ? ` (déjà rangé : ${ranges.join(', ')})` : ''), 'OK', null);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = libelleInitial; }
  }
}

// Le champ de montant où se trouve le curseur est remis en forme avant la génération du courrier (« 24 » → « 24,00 € »).
function formaterChampMontantActifAppelFonds() { formaterMontantSortieAppelFonds(afChampMontantActif); }
