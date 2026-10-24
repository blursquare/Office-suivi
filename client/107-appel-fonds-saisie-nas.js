// Courrier d'appel de fonds — saisie des montants dans l'aperçu, rangement sur le NAS (étude 23/10), frais estimés, décompte collé et « À compléter » suivi (étude 24/10) ; suite de client/40-generateur-appel-fonds.js.

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

// Étude 24/10 (« teste l'appel de fonds dans tous les sens ») : les frais et droits de l'acte restaient à 0,00 € quand le
// département ou la nature du bien n'étaient choisis que dans l'outil — le barème n'était lu qu'à la reprise du dossier.
// Une ligne de frais encore à zéro, ou remplie par le barème et jamais retouchée (`estime`), prend l'estimation du moment
// (taux plein, comme à la reprise) ; une saisie à la main n'est jamais écrasée. Décompte de l'office seulement.
function remplirFraisActeEstimesAppelFonds(fourchette) {
  if (afModeDecompte !== 'office' || !fourchette) return;
  const ligne = (afLignes.debit || []).find(l => l && !l.memoire && /frais\s+et\s+droits\s+de\s+l.acte\s+de\s+vente/i.test(l.libelle || ''));
  if (!ligne || !(ligne.estime || (!ligne.montant && !ligne.main))) return;
  ligne.montant = Math.ceil(fourchette.max);
  ligne.estime = true;
}

// Texte collé à la main (étude 24/10 : un décompte collé sans « € » ne donnait « aucune ligne reconnue ») : un montant en fin
// de ligne sans « € » le reçoit, « 185 000 » devient « 185 000,00 € », « A déduire : dépôt de garantie 9 250,00 » se coupe
// en deux lignes (bascule puis ligne), « Débit » / « Crédit » seuls valent « A payer » / « A déduire ». Seulement pour le
// collage : un PDF garde la lecture d'origine, plus stricte. Pure.
function texteDecompteColleNormalise(texte) {
  const sortie = [];
  String(texte || '').split(/\r?\n/).forEach(brute => {
    let l = brute.replace(/\t+/g, ' ').trim();
    if (!l) return;
    if (/^d[ée]bits?\s*:?$/i.test(l)) { sortie.push('A payer'); return; }
    if (/^cr[ée]dits?\s*:?$/i.test(l)) { sortie.push('A déduire'); return; }
    const bascule = /^((?:a|à)\s*d[ée]duire|sommes?\s+(?:a|à)\s+d[ée]duire|(?:a|à)\s*payer|(?:a|à)\s*ajouter)\s*[:\-–]\s*(\S.*)$/i.exec(l);
    if (bascule) { sortie.push(bascule[1]); l = bascule[2]; }
    // Montant entier à séparateur de milliers, sans centimes (« 185 000 », « 185.000 € ») : centimes ajoutés.
    l = l.replace(/(?<![\d.,])(\d{1,3}(?:[ .\u00a0\u202f]\d{3})+)(\s*€)?\s*$/, '$1,00 €');
    // Montant à centimes en fin de ligne sans « € ».
    if (/(?<![\d.,])(?:\d{1,3}(?:[.\s\u00a0\u202f]\d{3})+|\d+),\d{2}\s*$/.test(l)) l = l.replace(/\s*$/, ' €');
    sortie.push(l.replace(/[\u00a0\u202f]/g, ' '));
  });
  return sortie.join('\n');
}

// « À compléter vous-même » suit la saisie (étude 24/10 : la liste restait telle qu'à la reprise du dossier, « barème n'a pas
// pu estimer » compris, une fois tout rempli) : un point réglé dans l'outil est barré et coché. Les points qui ne se règlent
// pas dans l'outil (dépôt chez un tiers, honoraires…) restent tels quels.
var AF_POINTS_RECAP = [
  { motif: /^Situation des acquéreurs/, fait: () => !!afValeur('af-situation') },
  { motif: /^Adresse du bien/, fait: () => !!afValeur('af-adresse-bien').trim() },
  { motif: /^Date du rendez-vous/, fait: () => !!afValeur('af-date-rdv') },
  { motif: /^Heure du rendez-vous/, fait: () => !!afValeur('af-heure-rdv') },
  { motif: /^Prix d’acquisition\./, fait: () => (afLignes.debit || []).some(l => /prix\s+d.acquisition/i.test(l.libelle || '') && l.montant > 0) },
  { motif: /^Garanties du prêt inconnues/, fait: () => { const a = afEl('af-sans-pret'); const b = afEl('af-pret-hypothecaire'); return !!((a && a.checked) || (b && b.checked)); } },
  { motif: /^Montant des frais et droits de l’acte de vente/, fait: () => (afLignes.debit || []).some(l => /frais\s+et\s+droits\s+de\s+l.acte\s+de\s+vente/i.test(l.libelle || '') && l.montant > 0) }
];
function majRecapManquantsAppelFonds() {
  const liste = document.querySelector('#af-recap-prefill ul.af-recap-manquant');
  if (!liste) return;
  liste.querySelectorAll('li').forEach(li => {
    const point = AF_POINTS_RECAP.find(x => x.motif.test(li.textContent || ''));
    let fait = false;
    try { fait = !!(point && point.fait()); } catch (e) { fait = false; }
    li.classList.toggle('af-recap-fait', fait);
  });
}

// Nom de famille d'un client pour « Monsieur et Madame NOM » : la suite de mots en capitales du nom (« Paul DUPONT » et
// « DUPONT Paul » → « DUPONT », « Jean d'ARTAGNAN » → « d'ARTAGNAN »), particules en minuscules juste avant gardées
// (« Jean de la FONTAINE » → « de la FONTAINE »), une initiale (« J. ») n'en est pas ; sinon le nom tel quel. Pure.
function nomFamilleClientAppelFonds(c) {
  const mots = String((c && c.nom) || '').trim().split(/\s+/).filter(Boolean);
  const capitales = m => { const coeur = m.replace(/^[dl][’']/i, ''); return /\p{Lu}{2}/u.test(coeur) && coeur === coeur.toLocaleUpperCase('fr-FR'); };
  const i = mots.findIndex(capitales);
  if (i < 0) return mots.join(' ');
  let fin = i;
  while (fin + 1 < mots.length && (capitales(mots[fin + 1]) || /^-/.test(mots[fin + 1]))) fin++;
  let debut = i;
  while (debut > 0 && /^(de|du|des|la|le|d[’'])$/i.test(mots[debut - 1])) debut--;
  return mots.slice(debut, fin + 1).join(' ');
}

// Recalcule un prorata annoncé par le confrère. Un écart de plus de 2 centimes est signalé :
// c'est la seule vérification que l'outil peut faire sur un décompte qu'il n'a pas produit.
function verifierProrataLigne(ligne) {
  if (!ligne || !ligne.formule) return { statut: 'non-verifiable' };
  const m = AF_FORMULE_RE.exec(ligne.formule);
  if (!m) return { statut: 'non-verifiable' };
  const base = montantDepuisTexteFr(m[1]);
  const num = parseFloat(m[2]);
  const den = parseFloat(m[3]);
  if (base == null || !num || !den) return { statut: 'non-verifiable' };
  const attendu = Math.round((base * num / den) * 100) / 100;
  return Math.abs(attendu - ligne.montant) <= 0.02
    ? { statut: 'ok', attendu }
    : { statut: 'ecart', attendu };
}
