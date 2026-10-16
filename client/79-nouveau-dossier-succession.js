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

// Pure : le dossier tel qu'il sera créé (parties, biens, comparants et fiches client d'Authentic) — pour lire défunt, héritiers, conjoint
// survivant et type proposé avec les mêmes règles que la fiche.
function dossierProvisoireSuccession(donnees) {
  const exp = donnees || {};
  const d = { id: 'nouveau', nom: exp.intitule || '', typeAffaire: 'succession', sansPret: true,
    parties: partiesSuccessionDepuisAuthentic(exp), biens: biensDepuisAuthentic(exp),
    authentic: Object.assign({}, exp.infosAuthentic || {}) };
  (exp.personnes || []).forEach(p => retenirFicheClientAuthentic(d, p, ''));
  return d;
}

// Pure : ce que l'assistant propose pour une succession → { defunt, decesDate, decesLieu, conjoint (bool), type, heritiers, biens }.
function propositionWizardSuccession(donnees) {
  const d = dossierProvisoireSuccession(donnees);
  const df = defuntConstitution(d).champs;
  return {
    defunt: [df.prenoms, df.nom].filter(Boolean).join(' '), prenoms: df.prenoms || '', nom: df.nom || '', decesDate: df.decesDate || '', decesLieu: df.decesLieu || '',
    conjoint: conjointSurvivant(d), type: typeSuccessionPropose(d),
    heritiers: personnesSuccession(d).heritiers, biens: d.biens || []
  };
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
  const cle = String(exportAuthenticActuel.intitule || '') + '|' + String(exportAuthenticActuel.reference || '');
  const garder = wizardSuccessionCle === cle && !!wizardSuccessionProposition;
  const p = garder ? wizardSuccessionProposition : propositionWizardSuccession(exportAuthenticActuel);
  const v = (id, defaut) => (garder ? valeurChampWizardSuccession(id) : '') || defaut || '';
  const typeChoisi = v('f-succ-type', p.type);
  const conj = garder ? valeurChampWizardSuccession('f-succ-conjoint') : '';
  const ouverture = garder ? valeurChampWizardSuccession('f-succ-ouverture') : '';
  const contact = (h) => [(h.emails || [])[0], (h.telephones || [])[0]].filter(Boolean).join(' · ');
  const heritiers = p.heritiers.length
    ? p.heritiers.map(h => `<li><span class="prop-texte">${escapeHtml([civiliteLibelle(h.civilite), h.nom].filter(Boolean).join(' '))}</span>${h.qualite ? ` <span class="hint">${escapeHtml(h.qualite)}</span>` : ''}${contact(h) ? ` <span class="hint">${escapeHtml(contact(h))}</span>` : ''}</li>`).join('')
    : '<li class="hint">Aucun héritier relevé : ouvrez la page du dossier dans Authentic (rubrique « Comparants »).</li>';
  const biens = p.biens.length
    ? p.biens.map(b => `<li><span class="prop-texte">${escapeHtml(b.adresse || 'Adresse non relevée')}</span>${b.parcelles ? ` <span class="hint">${escapeHtml(b.parcelles)}</span>` : ''}</li>`).join('')
    : '<li class="hint">Aucun bien immobilier relevé dans Authentic.</li>';
  bloc.innerHTML = `<div class="wizard-bloc-titre">Succession</div>
    <div class="field-row">
      <div><label for="f-succ-prenoms">Prénoms du défunt ${infoBulle('Tels qu’ils s’écrivent dans les courriers. Repris d’Authentic (comparant « Défunt » ou fiche portant une date de décès).')}</label>
        <input type="text" id="f-succ-prenoms" value="${escapeAttr(v('f-succ-prenoms', p.prenoms))}" placeholder="Ex. Jeanne Marie"></div>
      <div><label for="f-succ-nom">Nom du défunt</label><input type="text" id="f-succ-nom" value="${escapeAttr(v('f-succ-nom', p.nom))}" placeholder="Ex. DURAND"></div>
    </div>
    <div class="field-row">
      <div><label for="f-succ-deces-date">Date du décès</label><input type="date" id="f-succ-deces-date" value="${escapeAttr(v('f-succ-deces-date', p.decesDate))}"></div>
      <div><label for="f-succ-deces-lieu">Lieu du décès</label><input type="text" id="f-succ-deces-lieu" value="${escapeAttr(v('f-succ-deces-lieu', p.decesLieu))}" placeholder="Ex. BLOIS (41000)"></div>
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
      <div><label for="f-succ-ouverture">Date d’ouverture (rendez-vous avec Sophie) ${infoBulle('Les délais partent d’elle : acte de notoriété à 1 mois, contrôle des droits à 2 mois, déclaration de succession à 6 mois. À placer plus tard dans l’agenda si la date n’est pas encore connue.')}</label>
        <input type="date" id="f-succ-ouverture" value="${escapeAttr(ouverture)}"></div>
    </div>
    <div class="wizard-succ-listes">
      <div><div class="analyse-sous-titre">Héritiers <span class="analyse-compteur">${p.heritiers.length || ''}</span></div><ul class="wizard-succ-liste">${heritiers}</ul></div>
      <div><div class="analyse-sous-titre">Biens</div><ul class="wizard-succ-liste">${biens}</ul></div>
    </div>`;
  wizardSuccessionCle = cle;
  wizardSuccessionProposition = p;
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
  const succ = Object.assign({}, d.succession || {});
  if (s.conjoint === 'oui' || s.conjoint === 'non') succ.conjointSurvivant = s.conjoint === 'oui';
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
