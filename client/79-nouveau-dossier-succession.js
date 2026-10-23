// ---- « Nouveau dossier » pour une SUCCESSION (étude 16/10 : « adapte l'ajout de nouveau dossier au dossier de succession car ce n'est
// pas les mêmes champs à remplir ») ----
// Repris d'Authentic, l'assistant d'une succession ne montre plus les champs d'une vente (prix, agence, notaires, emails vendeur /
// acquéreur — déjà masqués par #panel.wizard-succession) mais ceux d'une succession : le défunt (nom, date et lieu du décès), le
// conjoint survivant, le type de succession (proposé par CLAIRE), le rendez-vous d'ouverture avec Sophie (d'où partent les délais de
// 1, 2 et 6 mois), puis, en lecture, les héritiers et les biens relevés dans Authentic. Ce qui est lu d'Authentic pré-remplit ; ce qui
// est corrigé ici est gardé sur la fiche (`d.defunt`, `d.succession`) — exactement comme sur la fiche d'une succession.

var wizardSuccessionCle = '';
// La proposition d'Authentic AFFICHÉE dans le bloc : la saisie lui est comparée (jamais à un recalcul, relecture 16/10).
var wizardSuccessionProposition = null;
// Personnes ajoutées à la main pendant « Vérifier » (étude 21/10) : [{ nom, qualite: 'Conjoint survivant' | 'Héritier' }].
var wizardSuccessionAjouts = [];

// Pure : le dossier tel qu'il sera créé (parties, biens, comparants et fiches client d'Authentic) — pour lire défunt, héritiers, conjoint
// survivant et type proposé avec les mêmes règles que la fiche.
function dossierProvisoireSuccession(donnees, ajouts) {
  const exp = donnees || {};
  const d = { id: 'nouveau', nom: exp.intitule || '', typeAffaire: 'succession', sansPret: true,
    parties: partiesSuccessionDepuisAuthentic(exp), biens: biensDepuisAuthentic(exp),
    authentic: Object.assign({}, exp.infosAuthentic || {}) };
  appliquerPersonnesSaisiesSuccession(d, ajouts);
  (exp.personnes || []).forEach(p => retenirFicheClientAuthentic(d, p, ''));
  return d;
}

// Modifie d.parties : les personnes ajoutées à la main (conjointe survivante, héritier). Une personne déjà là — sa fiche d'Authentic lue —
// reçoit sa qualité ; sinon elle est ajoutée. Rend d.
function appliquerPersonnesSaisiesSuccession(d, ajouts) {
  const parties = Array.isArray(d.parties) ? d.parties.slice() : [];
  (Array.isArray(ajouts) ? ajouts : []).filter(a => a && a.nom).forEach(a => {
    const marque = a.qualite === 'Conjoint survivant' ? { qualite: 'Conjoint survivant' } : { heritierSaisi: true };
    const i = parties.findIndex(p => p && memePersonneNommee(p.nom, a.nom));
    if (i >= 0) parties[i] = Object.assign({}, parties[i], marque);
    else parties.push(Object.assign({ nom: a.nom, role: 'PARTIE', qualiteActe: '', qualitePersonne: 'physique', representant: null, origine: 'saisie' }, marque));
  });
  d.parties = parties;
  return d;
}

// Pure : ce que l'assistant propose pour une succession → { defunt, decesDate, decesLieu, conjoint (bool), type, heritiers, biens }.
function propositionWizardSuccession(donnees, ajouts) {
  const d = dossierProvisoireSuccession(donnees, ajouts === undefined ? wizardSuccessionAjouts : ajouts);
  const df = defuntConstitution(d).champs;
  const heritiers = personnesSuccession(d).heritiers;
  return {
    defunt: [df.prenoms, df.nom].filter(Boolean).join(' '), prenoms: df.prenoms || '', nom: df.nom || '', decesDate: df.decesDate || '', decesLieu: df.decesLieu || '',
    // La conjointe lue dans le volet de la fiche du défunt figure avec les héritiers : elle fait le conjoint survivant (étude 21/10).
    conjoint: conjointSurvivant(d) || heritiers.some(h => /survivant/i.test(String(h.qualite || ''))), type: typeSuccessionPropose(d),
    heritiers, biens: d.biens || [],
    // Bien principal (étude 16/10) : le premier bien de la liste — fiche bien d'Authentic lue, sinon la première ligne de la rubrique
    // « Immeubles » de la page du dossier.
    bienPrincipal: ((d.biens || [])[0] && d.biens[0].adresse) || String((d.authentic && d.authentic.premierImmeuble) || '')
  };
}

// Pure : la clé du dossier d'Authentic repris — ses noms (`cleNomsDossierAuthentic`), à défaut son intitulé tel quel.
function cleDossierWizardSuccession(donnees) {
  const intitule = String((donnees && donnees.intitule) || '');
  return cleNomsDossierAuthentic(intitule) || intitule;
}

// « Nouveau dossier » d'une succession ouvert à « Vérifier » : chaque page d'Authentic relevée (fiche du défunt, d'un héritier, d'un bien)
// met à jour le dossier repris — même intitulé, même référence —, puis le bloc « Succession » (étude 19/10).
var wizardSuccessionRelance = 0;
async function rafraichirWizardSuccessionAuthentic() {
  if (!exportAuthenticActuel || !successionEnCoursWizard()) return;
  const bloc = document.getElementById('wizard-bloc-succession');
  if (!bloc || !bloc.offsetParent) return;
  // Jamais pendant une saisie dans le bloc (il est redessiné) — mais la page relevée n'est pas perdue : nouvel essai dans 2 s, six fois au plus
  // (étude 23/10 : le lien avec la fiche d'Authentic ne se faisait qu'au bout de quelques secondes, le curseur restant dans le bloc).
  if (bloc.contains(document.activeElement)) {
    if (wizardSuccessionRelance < 6) { wizardSuccessionRelance++; setTimeout(rafraichirWizardSuccessionAuthentic, 2000); }
    return;
  }
  wizardSuccessionRelance = 0;
  const actuel = exportAuthenticActuel;
  try {
    const r = await fetchAvecAuth('/api/authentic/releves/recents');
    if (!r.ok) return;
    const { releves } = await r.json();
    const g = dossiersDepuisRelevesAuthentic(releves || [], { apercu: true })
      .find(x => cleDossierWizardSuccession(x) === cleDossierWizardSuccession(actuel) && (!actuel.reference || !x.reference || x.reference === actuel.reference));
    if (!g || exportAuthenticActuel !== actuel || JSON.stringify(g.export) === JSON.stringify(actuel)) return;
    exportAuthenticActuel = g.export;
    renderWizardSuccession();
  } catch (_) { /* hors ligne : le dossier repris reste tel quel */ }
}

// Pure : les fiches à ouvrir dans Authentic pendant « Vérifier » (étude 20/10 : « que CLAIRE demande : ouvrez la fiche de… ; ça se
// complète, c'est gardé — idem pour le défunt, les héritiers, les biens ») → [{ libelle, recue }]. Chaque page lue coche sa ligne.
function pagesAOuvrirWizardSuccession(p, d) {
  const r = [];
  const ficheDefunt = defuntDepuisFiches(d).fiche;
  const cle = (n) => normaliserPourRecherche(String(n || '')).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean).sort().join(' ');
  // Un héritier n'est jamais coché par la fiche du défunt (père et fils qui partagent un prénom), ni par une fiche qui porte un décès.
  const defunt = p.defunt || '';
  // Le défunt : sa fiche porte la date du décès, ou exactement son nom.
  const defuntLu = !!ficheDefunt && (!!(ficheDefunt.deces && ficheDefunt.deces.date) || (!!defunt && cle(ficheDefunt.nom) === cle(defunt)));
  const fiche = (nom) => { const f = nom ? ficheClientDe(d, nom) : null; return !!f && (f !== ficheDefunt || !defuntLu) && !(f.deces && f.deces.date); };
  r.push({ libelle: defunt ? `Fiche de ${defunt} (défunt)` : 'Fiche du défunt', recue: defuntLu });
  (p.heritiers || []).forEach(h => r.push({ libelle: `Fiche de ${h.nom}`, recue: fiche(h.nom) }));
  const lus = (p.biens || []).length;
  const annonces = Number(d && d.authentic && d.authentic.biensDossier && d.authentic.biensDossier.nombre) || 0;
  (p.biens || []).forEach(b => r.push({ libelle: `Fiche du bien ${b.adresse || ''}`.trim(), recue: true }));
  const manquants = Math.min(6, Math.max(annonces - lus, !lus && p.bienPrincipal ? 1 : 0));
  for (let i = 0; i < manquants; i++) r.push({ libelle: i === 0 && !lus && p.bienPrincipal ? `Fiche du bien ${p.bienPrincipal}` : 'Fiche d’un autre bien', recue: false });
  return r;
}

function valeurChampWizardSuccession(id) {
  const el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}

// Le bloc « Succession » de l'étape Vérifier (pré-rempli une fois par dossier d'Authentic, la saisie reste ensuite).
function renderWizardSuccession() {
  const bloc = document.getElementById('wizard-bloc-succession');
  if (!bloc) return;
  if (!successionEnCoursWizard()) { bloc.innerHTML = ''; wizardSuccessionCle = ''; wizardSuccessionProposition = null; return; }
  // Le même dossier d'Authentic tant que ses NOMS sont les mêmes : la référence qui apparaît, ou un intitulé relevé autrement par la page
  // d'une fiche, ne remet plus la saisie à zéro (étude 23/10 : « au second héritier il efface toutes les données »).
  const cle = cleDossierWizardSuccession(exportAuthenticActuel);
  const garder = wizardSuccessionCle === cle && !!wizardSuccessionProposition;
  if (!garder) wizardSuccessionAjouts = [];
  // Relu à chaque fois (étude 19/10 : date et lieu du décès vides) : une fiche du défunt ouverte dans Authentic pendant « Vérifier »
  // complète les champs restés vides — une saisie n'est jamais remplacée.
  // Un champ qui vaut encore ce qu'Authentic proposait n'est pas une saisie : il suit la nouvelle proposition (relecture 0.290.1 — sinon
  // l'ancienne valeur d'Authentic devenait une correction à l'ajout et la fiche ne suivait plus Authentic).
  const p = propositionWizardSuccession(exportAuthenticActuel);
  const ancienne = garder ? wizardSuccessionProposition : null;
  const v = (id, cleP) => {
    const champ = garder ? valeurChampWizardSuccession(id) : '';
    return (champ && !(ancienne && champ === String(ancienne[cleP] || '')) ? champ : '') || p[cleP] || '';
  };
  const typeChoisi = v('f-succ-type', 'type');
  const conj = garder ? valeurChampWizardSuccession('f-succ-conjoint') : '';
  const ouverture = garder ? valeurChampWizardSuccession('f-succ-ouverture') : '';
  const contact = (h) => [(h.emails || [])[0], (h.telephones || [])[0]].filter(Boolean).join(' · ');
  const heritiers = p.heritiers.length
    ? p.heritiers.map(h => `<li><span class="prop-texte">${escapeHtml([civiliteLibelle(h.civilite), h.nom].filter(Boolean).join(' '))}</span>${h.qualite ? ` <span class="hint">${escapeHtml(h.qualite)}</span>` : ''}${contact(h) ? ` <span class="hint">${escapeHtml(contact(h))}</span>` : ''}</li>`).join('')
    : '<li class="hint">Aucun héritier relevé : ouvrez la page du dossier dans Authentic (rubrique « Comparants »).</li>';
  const biens = p.biens.length
    ? p.biens.map(b => `<li><span class="prop-texte">${escapeHtml(b.adresse || 'Adresse non relevée')}</span>${b.parcelles ? ` <span class="hint">${escapeHtml(b.parcelles)}</span>` : ''}</li>`).join('')
    : p.bienPrincipal ? `<li><span class="prop-texte">${escapeHtml(p.bienPrincipal)}</span> <span class="hint">rubrique « Immeubles » ; fiche du bien pas encore ouverte</span></li>`
      : '<li class="hint">Aucun bien immobilier relevé dans Authentic.</li>';
  const aOuvrir = pagesAOuvrirWizardSuccession(p, dossierProvisoireSuccession(exportAuthenticActuel, wizardSuccessionAjouts));
  const restent = aOuvrir.filter(x => !x.recue).length;
  const ouvrir = `<div class="wizard-succ-ouvrir"><div class="analyse-sous-titre">${restent ? `À ouvrir dans Authentic <span class="analyse-compteur">${restent}</span>` : 'Tout est lu dans Authentic'} ${infoBulle('Ouvrez chaque fiche dans Authentic pendant que cet écran est affiché : elle se coche ici, ses données complètent ce qui est montré et sont gardées à l’ajout du dossier.')}</div>
      <ul class="pa-pages">${aOuvrir.map(x => `<li class="pa-page ${x.recue ? 'recue' : 'manque'}">${icone(x.recue ? 'check' : 'alert-triangle')}<span>${escapeHtml(x.libelle)}</span></li>`).join('')}</ul></div>`;
  const ajoutTape = valeurChampWizardSuccession('f-succ-ajout-nom');
  bloc.innerHTML = `<div class="wizard-bloc-titre">Succession</div>
    ${ouvrir}
    <div class="field-row">
      <div><label for="f-succ-prenoms">Prénoms du défunt ${infoBulle('Tels qu’ils s’écrivent dans les courriers. Repris d’Authentic : comparant « Défunt », sinon le premier comparant quand le nom du dossier le désigne, sinon la fiche portant une date de décès.')}</label>
        <input type="text" id="f-succ-prenoms" value="${escapeAttr(v('f-succ-prenoms', 'prenoms'))}" placeholder="Ex. Jeanne Marie"></div>
      <div><label for="f-succ-nom">Nom du défunt</label><input type="text" id="f-succ-nom" value="${escapeAttr(v('f-succ-nom', 'nom'))}" placeholder="Ex. DURAND"></div>
    </div>
    <div class="field-row">
      <div><label for="f-succ-deces-date">Date du décès ${infoBulle('Lue sur la fiche client du défunt dans Authentic (case « Personne décédée »). Vide : ouvrez cette fiche dans Authentic, la date et le lieu se remplissent ici.')}</label><input type="date" id="f-succ-deces-date" value="${escapeAttr(v('f-succ-deces-date', 'decesDate'))}"></div>
      <div><label for="f-succ-deces-lieu">Lieu du décès</label><input type="text" id="f-succ-deces-lieu" value="${escapeAttr(v('f-succ-deces-lieu', 'decesLieu'))}" placeholder="Ex. BLOIS (41000)"></div>
    </div>
    <div class="field-row">
      <div><label for="f-succ-conjoint">Conjoint survivant ${infoBulle('Avec un conjoint survivant, les comptes lui sont transférés : l’étude ne reçoit aucun fonds.')}</label>
        <select id="f-succ-conjoint">
          <option value=""${conj ? '' : ' selected'}>Selon Authentic : ${p.conjoint ? 'oui' : 'non'}</option>
          <option value="oui"${conj === 'oui' ? ' selected' : ''}>Oui</option>
          <option value="non"${conj === 'non' ? ' selected' : ''}>Non</option>
        </select></div>
    </div>
    <div class="field-row">
      <div><label for="f-succ-type">Type de succession ${infoBulle('Proposé par CLAIRE : avec un bien immobilier, notoriété, déclaration et attestation immobilière ; sinon l’acte de notoriété, et la déclaration au-delà de 50 000 € d’actif.')}</label>
        <select id="f-succ-type">${TYPES_SUCCESSION.map(t => `<option value="${t.cle}"${t.cle === typeChoisi ? ' selected' : ''}>${escapeHtml(t.libelle)}${t.cle === p.type ? ' (proposé)' : ''}</option>`).join('')}</select></div>
      <div><label for="f-succ-ouverture">Date d’ouverture (rendez-vous avec Sophie) ${infoBulle('Acte de notoriété à 1 mois et contrôle des droits à 2 mois depuis elle ; la succession se règle dans les 6 mois du décès. À placer plus tard dans l’agenda si la date n’est pas encore connue.')}</label>
        <input type="date" id="f-succ-ouverture" value="${escapeAttr(ouverture)}"></div>
    </div>
    <div class="wizard-succ-listes">
      <div><div class="analyse-sous-titre">Héritiers <span class="analyse-compteur">${p.heritiers.length || ''}</span></div><ul class="wizard-succ-liste">${heritiers}</ul>
        ${ajoutPersonneWizardSuccession()}</div>
      <div><div class="analyse-sous-titre">Biens</div><ul class="wizard-succ-liste">${biens}</ul></div>
    </div>`;
  const champAjout = document.getElementById('f-succ-ajout-nom');
  if (garder && champAjout && ajoutTape) champAjout.value = ajoutTape;
  // Bien principal pré-rempli une fois par dossier d'Authentic, jamais par-dessus une saisie.
  const champBien = document.getElementById('f-adresse-bien');
  if (!garder && champBien && !champBien.value.trim() && p.bienPrincipal) champBien.value = p.bienPrincipal;
  wizardSuccessionCle = cle;
  wizardSuccessionProposition = p;
}

// Ajout à la main d'une personne (conjointe survivante, héritier) : son nom aide à reconnaître sa fiche quand on l'ouvre dans Authentic.
function ajoutPersonneWizardSuccession() {
  const saisies = wizardSuccessionAjouts.map((a, i) => `<li><span class="prop-texte">${escapeHtml(a.nom)}</span> <span class="hint">${escapeHtml(a.qualite)} (ajouté à la main)</span>
    <wa-button appearance="plain" size="s" type="button" class="bouton-icone" title="Retirer" onclick="retirerPersonneWizardSuccession(${i})">${icone('x')}</wa-button></li>`).join('');
  return `${saisies ? `<ul class="wizard-succ-liste">${saisies}</ul>` : ''}<div class="fcddv-ajout">
    <input type="text" id="f-succ-ajout-nom" class="prop-champ" placeholder="Prénom NOM" aria-label="Nom de la personne à ajouter">
    <select id="f-succ-ajout-qualite" class="prop-champ" aria-label="Qualité"><option>Conjoint survivant</option><option>Héritier</option></select>
    <wa-button appearance="outlined" size="s" type="button" class="bouton-ajout" onclick="ajouterPersonneWizardSuccession()"><span slot="start" class="bouton-ajout-plus">+</span>Personne</wa-button></div>`;
}

function ajouterPersonneWizardSuccession() {
  const nom = valeurChampWizardSuccession('f-succ-ajout-nom');
  const qualite = valeurChampWizardSuccession('f-succ-ajout-qualite') === 'Héritier' ? 'Héritier' : 'Conjoint survivant';
  if (!nom || wizardSuccessionAjouts.some(a => memePersonneNommee(a.nom, nom))) return;
  wizardSuccessionAjouts = wizardSuccessionAjouts.concat({ nom: nom.slice(0, 120), qualite });
  renderWizardSuccession();   // la proposition est recalculée avec la personne ajoutée
}

function retirerPersonneWizardSuccession(i) {
  wizardSuccessionAjouts = wizardSuccessionAjouts.filter((_, k) => k !== i);
  renderWizardSuccession();
}

function civiliteLibelle(c) {
  return c === 'M' ? 'Monsieur' : c === 'Mme' ? 'Madame' : String(c || '');
}

// Champs communs relibellés pour une succession (nom du dossier, bien) — et remis comme pour une vente sinon.
function adapterChampsWizardSuccession(succession) {
  const nom = document.getElementById('f-nom');
  if (nom) nom.placeholder = succession ? 'Ex. DURAND Jeanne (défunt)' : 'Ex. DUPONT / MARTIN (vendeur / acquéreur)';
  const lbl = document.querySelector('label[for="f-adresse-bien"]');
  if (lbl) lbl.textContent = succession ? 'Bien immobilier principal (facultatif)' : 'Adresse du bien';
  if (succession) renderWizardSuccession();
}

// Pure (modifie le dossier) : ce qui a été saisi dans le bloc « Succession » gardé sur la fiche. `saisie` = valeurs des champs,
// `p` = la proposition d'Authentic : seul ce qui en diffère devient une correction (`d.defunt`) — le reste suit Authentic.
function appliquerSaisieWizardSuccession(d, saisie, p) {
  const s = saisie || {};
  const prop = p || {};
  const defunt = Object.assign({}, d.defunt || {});
  // Prénoms et nom saisis à part (relecture 16/10 : « DURAND Jeanne » se découpait à l'envers) ; un champ vidé n'efface rien.
  if (s.prenoms && s.prenoms !== prop.prenoms) defunt.prenoms = s.prenoms;
  if (s.nom && s.nom !== prop.nom) defunt.nom = s.nom.toUpperCase();
  if (s.decesDate && s.decesDate !== prop.decesDate) defunt.decesDate = s.decesDate;
  if (s.decesLieu && s.decesLieu !== prop.decesLieu) defunt.decesLieu = s.decesLieu;
  if (Object.keys(defunt).length) d.defunt = defunt;
  appliquerPersonnesSaisiesSuccession(d, wizardSuccessionAjouts);
  const succ = Object.assign({}, d.succession || {});
  if (s.conjoint === 'oui' || s.conjoint === 'non') succ.conjointSurvivant = s.conjoint === 'oui';
  else if (prop.conjoint === true) succ.conjointSurvivant = true;   // « Selon Authentic : oui » est gardé : la fiche ne le redéduit pas des seuls comparants.
  if (s.type && s.type !== prop.type) succ.type = s.type;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s.ouverture || '')) succ.ouvertureLe = s.ouverture;
  if (Object.keys(succ).length) d.succession = succ;
  return d;
}

// À l'ajout d'une succession reprise d'Authentic (client/18) : fiches client retenues (défunt, héritiers) et saisie du bloc gardées.
function appliquerWizardSuccessionSurDossier(d) {
  if (!d || !exportAuthenticActuel) return d;
  return appliquerSaisieWizardSuccession(d, saisieWizardSuccession(), wizardSuccessionProposition || propositionWizardSuccession(exportAuthenticActuel));
}

// « Annuler » / nouvelle reprise : la saisie d'avant n'est jamais reprise.
function oublierWizardSuccession() {
  wizardSuccessionCle = '';
  wizardSuccessionProposition = null;
  wizardSuccessionAjouts = [];
  const bloc = document.getElementById('wizard-bloc-succession');
  if (bloc) bloc.innerHTML = '';
}

function saisieWizardSuccession() {
  return {
    prenoms: valeurChampWizardSuccession('f-succ-prenoms'), nom: valeurChampWizardSuccession('f-succ-nom'), decesDate: valeurChampWizardSuccession('f-succ-deces-date'),
    decesLieu: valeurChampWizardSuccession('f-succ-deces-lieu'), conjoint: valeurChampWizardSuccession('f-succ-conjoint'),
    type: valeurChampWizardSuccession('f-succ-type'), ouverture: valeurChampWizardSuccession('f-succ-ouverture')
  };
}

// Pure : les lignes du récapitulatif (étape Valider) propres à une succession.
function lignesRecapSuccession(saisie, p) {
  const s = saisie || {};
  const prop = p || { heritiers: [], biens: [] };
  const type = TYPES_SUCCESSION.find(t => t.cle === (s.type || prop.type));
  const conjoint = s.conjoint === 'oui' ? 'Oui' : s.conjoint === 'non' ? 'Non' : (prop.conjoint ? 'Oui (Authentic)' : 'Non (Authentic)');
  return [
    { libelle: 'Défunt', valeur: [s.prenoms, s.nom].filter(Boolean).join(' ') },
    { libelle: 'Décès', valeur: [s.decesDate ? formatDateFr(s.decesDate) : '', s.decesLieu].filter(Boolean).join(' à ') },
    { libelle: 'Héritiers', valeur: (prop.heritiers || []).map(h => h.nom).join(', ') },
    { libelle: 'Conjoint survivant', valeur: conjoint },
    { libelle: 'Type de succession', valeur: type ? type.libelle : '' },
    { libelle: 'Rendez-vous d’ouverture', valeur: s.ouverture ? formatDateFr(s.ouverture) : '', facultatif: true },
    { libelle: 'Biens', valeur: (prop.biens || []).map(b => b.adresse || b.parcelles).filter(Boolean).join(' · '), facultatif: true }
  ].filter(l => l.valeur || !l.facultatif);
}
