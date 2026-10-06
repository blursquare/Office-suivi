// Droits de préemption (client/45-preemption-regles.js, client/46-droits-preemption.js) : règles des tableaux fournis par
// l'étude (Cheuvreux DPU/DPUR, CRIDON SAFER, Letulle bois et forêts), périmètres de DPU renforcé de Blois. Cas inventés.
const test = require('node:test');
const assert = require('node:assert');
const { chargerApplication } = require('./helpers/load-app');

const app = chargerApplication();
const droit = (r, cle) => app.analyserPreemption(r).droits.find(d => d.cle === cle || d.cle.startsWith(cle));

test('zone du document d’urbanisme réduite à sa famille', () => {
  assert.strictEqual(['Ui2', 'U', 'AUc', 'AUs', 'A', 'Ah', 'N', 'Nd', '', 'ZZ'].map(z => app.familleZonePreemption(z)).join(','), 'U,U,AU,AU,A,A,N,N,,');
});

test('DPU : maison en zone U d’Agglopolys → à purger, DIA à la mairie', () => {
  const d = droit({ mutation: 'vente', bien: 'bati', achevementMoins4ans: false, zone: 'U', agglopolys: true }, 'dpu');
  assert.strictEqual(d.statut, 'oui');
  assert.match(d.formalite, /^DIA à adresser à la mairie de la commune.*2 mois/);
});

test('DPU : zone A d’Agglopolys, hors DPUR → non applicable ; commune hors Agglopolys sans réponse → à vérifier', () => {
  assert.strictEqual(droit({ mutation: 'vente', bien: 'bati', achevementMoins4ans: false, zone: 'A', agglopolys: true }, 'dpu').statut, 'non');
  const d = droit({ mutation: 'vente', bien: 'bati', achevementMoins4ans: false, zone: 'U' }, 'dpu');
  assert.strictEqual(d.statut, 'verifier');
  assert.match(d.motif, /si la commune a institué le DPU/);
  assert.strictEqual(droit({ mutation: 'vente', bien: 'bati', achevementMoins4ans: false, zone: 'U', dpuInstitue: 'oui' }, 'dpu').statut, 'oui');
});

test('DPU : lot de copropriété de plus de 10 ans → DPU renforcé seulement', () => {
  const base = { mutation: 'vente', bien: 'lot-copro', achevementMoins4ans: false, reglementPlusDe10ans: true, zone: 'U', agglopolys: true };
  assert.strictEqual(droit(Object.assign({}, base, { dpur: 'non' }), 'dpu').statut, 'non');
  const inconnu = droit(base, 'dpu');
  assert.strictEqual(inconnu.statut, 'verifier');
  assert.match(inconnu.motif, /périmètre de DPU renforcé/);
  const renforce = droit(Object.assign({}, base, { dpur: 'oui', dpurDelegataire: 'la Ville de Blois (délégation)' }), 'dpu');
  assert.strictEqual(renforce.statut, 'oui');
  assert.strictEqual(renforce.titre, 'Droit de préemption urbain renforcé');
  assert.match(renforce.formalite, /la Ville de Blois/);
  // Copropriété de moins de 10 ans, locaux commerciaux, maison en copropriété horizontale : DPU simple.
  assert.strictEqual(droit(Object.assign({}, base, { reglementPlusDe10ans: false, dpur: 'non' }), 'dpu').statut, 'oui');
  assert.strictEqual(droit(Object.assign({}, base, { locauxAutreHabitation: true, dpur: 'non' }), 'dpu').statut, 'oui');
  assert.strictEqual(droit(Object.assign({}, base, { maisonCoproHorizontale: true, dpur: 'non' }), 'dpu').statut, 'oui');
});

test('DPU : immeuble de moins de 4 ans, VEFA, HLM, mutations hors champ', () => {
  const u = { zone: 'U', agglopolys: true, dpur: 'non' };
  assert.strictEqual(droit(Object.assign({ mutation: 'vente', bien: 'bati', achevementMoins4ans: true }, u), 'dpu').statut, 'non');
  assert.strictEqual(droit(Object.assign({ mutation: 'vente', bien: 'bati', achevementMoins4ans: true }, u, { dpur: 'oui' }), 'dpu').statut, 'oui');
  assert.strictEqual(droit(Object.assign({ mutation: 'vente', bien: 'bati', casBati: 'vefa-neuf' }, u), 'dpu').statut, 'non');
  assert.strictEqual(droit(Object.assign({ mutation: 'vente', bien: 'bati', casBati: 'hlm-locataire' }, u), 'dpu').statut, 'non');
  assert.strictEqual(droit(Object.assign({ mutation: 'usufruit', bien: 'terrain' }, u), 'dpu').statut, 'non');
  assert.strictEqual(droit(Object.assign({ mutation: 'donation', donationEntreParents: true, bien: 'terrain' }, u), 'dpu').statut, 'non');
  assert.strictEqual(droit(Object.assign({ mutation: 'donation', donationEntreParents: false, bien: 'terrain' }, u), 'dpu').statut, 'oui');
  assert.strictEqual(droit(Object.assign({ mutation: 'parts-sci', partsMajoritaires: true, sciFamiliale: true, bien: 'terrain' }, u), 'dpu').statut, 'non');
  assert.strictEqual(droit(Object.assign({ mutation: 'adjudication', bien: 'terrain' }, u), 'dpu').statut, 'verifier');
  assert.strictEqual(droit(Object.assign({ mutation: 'parts-sci', bien: 'parts-attribution' }, u, { dpur: 'oui', partsMajoritaires: true, sciFamiliale: false }), 'dpu').statut, 'oui');
});

test('SAFER : maison en zone U sans usage agricole → pas de préemption mais information obligatoire (étude 06/10) ; lot de copropriété → non, informée aussi', () => {
  const s = droit({ bien: 'bati', usageAgricole: false, zone: 'U' }, 'safer');
  assert.strictEqual(s.statut, 'non');
  assert.match(s.formalite, /Information obligatoire de la SAFER/);
  assert.doesNotMatch(s.formalite, /Aucune notification/);
  assert.strictEqual(droit({ bien: 'lot-copro' }, 'safer').statut, 'non');
  assert.match(droit({ bien: 'lot-copro' }, 'safer').formalite, /Information obligatoire de la SAFER/);
  assert.match(droit({ bien: 'terrain', zone: 'U', usageAgricole: false }, 'safer').formalite, /Information obligatoire/);
  assert.strictEqual(droit({ bien: 'bati' }, 'safer').statut, 'verifier');
});

test('SAFER : bâtiment en zone A ou N (5 dernières années) ; terrain en zone agricole, bois, massif, installations', () => {
  const bati = droit({ bien: 'bati', usageAgricole: false, zone: 'A', utilise5ans: false }, 'safer');
  assert.strictEqual(bati.statut, 'non');
  assert.match(bati.formalite, /Information obligatoire de la SAFER/);
  assert.strictEqual(droit({ bien: 'bati', usageAgricole: false, zone: 'N', utilise5ans: true }, 'safer').statut, 'oui');
  assert.strictEqual(droit({ bien: 'bati', usageAgricole: true }, 'safer').statut, 'oui');
  assert.strictEqual(droit({ bien: 'terrain', zone: 'A', bois: false, installations: false }, 'safer').statut, 'oui');
  assert.strictEqual(droit({ bien: 'terrain', zone: 'A', bois: false, installations: true }, 'safer').statut, 'non');
  assert.strictEqual(droit({ bien: 'terrain', zone: 'N', bois: true, massif4ha: true }, 'safer').statut, 'non');
  assert.strictEqual(droit({ bien: 'terrain', zone: 'N', bois: true, massif4ha: false }, 'safer').statut, 'oui');
  // Zone U : usage agricole puis seuil de la SAFER.
  assert.strictEqual(droit({ bien: 'terrain', zone: 'U', usageAgricole: false }, 'safer').statut, 'non');
  assert.strictEqual(droit({ bien: 'terrain', zone: 'U', usageAgricole: true, seuilSafer: true }, 'safer').statut, 'oui');
  assert.strictEqual(droit({ bien: 'terrain', zone: 'U', usageAgricole: true, seuilSafer: false }, 'safer').statut, 'non');
});

test('Bois et forêts : État, commune, préférence des voisins, exceptions', () => {
  const r = (x) => app.analyserPreemption(Object.assign({ bien: 'terrain', bois: true, superficieMoins4ha: true }, x)).droits.filter(d => d.cle.startsWith('foret'));
  assert.strictEqual(r({ bois: false })[0].statut, 'non');
  assert.strictEqual(r({ superficieMoins4ha: false })[0].statut, 'non');
  assert.strictEqual(r({ foretDomaniale: true })[0].cle, 'foret-etat');
  assert.strictEqual(r({ foretDomaniale: false, communeBoiseeContigue: true })[0].cle, 'foret-commune');
  assert.strictEqual(r({ foretDomaniale: false, communeBoiseeContigue: false, acquereurPrivilegie: true })[0].statut, 'non');
  assert.strictEqual(r({ foretDomaniale: false, communeBoiseeContigue: false, acquereurPrivilegie: false, partieBoiseeMoinsMoitie: true })[0].statut, 'non');
  const pref = r({ foretDomaniale: false, communeBoiseeContigue: false, acquereurPrivilegie: false, partieBoiseeMoinsMoitie: false })[0];
  assert.strictEqual(pref.cle, 'foret-preference');
  assert.match(pref.formalite, /voisins/);
  assert.strictEqual(r({})[0].statut, 'verifier');
  // Pas de question forestière pour une maison.
  assert.ok(!app.analyserPreemption({ bien: 'bati' }).droits.some(d => d.cle.startsWith('foret')));
});

test('DPU renforcé de Blois : parcelle AL 839, rues du centre-ville (à vérifier), ailleurs', () => {
  assert.strictEqual(app.cleParcelle('al', '839'), 'AL0839');
  assert.strictEqual(app.dpurBlois('41018', [{ section: 'AL', numero: '839' }], '').statut, 'oui');
  assert.strictEqual(app.dpurBlois('41018', [], 'BLOIS (41000), 12 rue Porte Côté').statut, 'probable');
  assert.strictEqual(app.dpurBlois('41018', [], 'BLOIS (41000), 4 rue des Orfèvres').statut, 'probable');
  assert.strictEqual(app.dpurBlois('41018', [], 'BLOIS (41000), 3 rue des Lices').statut, 'non');
  assert.strictEqual(app.dpurBlois('41269', [{ section: 'AL', numero: '839' }], '').statut, '');
});

test('parcelles lues dans un texte, pré-remplissage depuis la fiche, réponses déduites du zonage', () => {
  assert.strictEqual(app.parcellesDepuisTexte('AL 839, AL n° 840 et B12').map(p => p.section + p.numero).join(','), 'AL839,AL840,B12');
  const d = { id: 'd1', nom: 'MARTIN / DUPUIS', typeVente: 'copropriete', adresseBien: 'BLOIS (41000), 13 place René Coty',
    bien: { adresse: { codePostal: '41000', commune: 'BLOIS' }, cadastre: { section: 'AL', numero: '839' } } };
  const e = app.prefillPreemption(d);
  assert.strictEqual(e.cp, '41000');
  assert.strictEqual(e.parcelles, 'AL 839');
  assert.strictEqual(e.reponses.bien, 'lot-copro');
  e.insee = '41018';
  e.zonages = [{ section: 'AL', numero: '839', statut: 'ok', resultat: { epciSiren: '200030385', zones: [{ libelle: 'Ui2', typezone: 'U' }] } }];
  const rep = app.reponsesPreemption(e);
  assert.strictEqual(rep.agglopolys, true);
  assert.strictEqual(rep.dpur, 'oui');
  assert.match(rep.dpurDelegataire, /Ville de Blois/);
  e.reponses.achevementMoins4ans = false;
  e.reponses.reglementPlusDe10ans = true;
  const fiche = app.preemptionPourFiche(e, new Date(2026, 9, 6, 11, 0));
  assert.strictEqual(fiche.zone, 'Ui2 (U)');
  assert.strictEqual(fiche.droits.find(x => x.cle === 'dpu').statut, 'oui');
  assert.strictEqual(fiche.droits.find(x => x.cle === 'safer').statut, 'non');
});

test('plusieurs parcelles : zone lue par parcelle, zone choisie à la main, droit le plus exigeant gardé', () => {
  const zonages = [
    { section: 'AL', numero: '839', statut: 'ok', resultat: { zones: [{ libelle: 'Ui2', typezone: 'U' }], parcelle: { contenance: 1624 } } },
    { section: 'B', numero: '12', statut: 'ok', resultat: { zones: [{ libelle: 'A', typezone: 'A' }], parcelle: { contenance: 5400 } } },
    { section: 'B', numero: '13', statut: 'erreur', erreur: 'Parcelle introuvable.' }
  ];
  const lignes = app.lignesZonageParcelles(zonages, { [app.cleParcelle('B', '13')]: 'A' });
  assert.strictEqual(lignes.map(l => `${l.libelle}:${l.lue || '-'}>${l.famille}`).join(' '), 'AL 839:U>U B 12:A>A B 13:->A');
  const rep = { mutation: 'vente', bien: 'terrain', agglopolys: true, dpur: 'non', bois: false, installations: false };
  const a = app.analyserPreemptionParcelles(rep, lignes);
  const dpu = a.droits.find(d => d.cle === 'dpu');
  assert.strictEqual(dpu.statut, 'oui');
  assert.match(dpu.motif, /AL 839 : zone U ; B 12, B 13 : zone A/);
  const safer = a.droits.find(d => d.cle === 'safer');
  assert.strictEqual(safer.statut, 'oui');
  assert.ok(a.manques.includes('usageAgricole'), 'la parcelle en zone U demande encore l’usage agricole');
  // Toutes dans la même zone : analyse simple, sans détail par parcelle.
  const memes = app.lignesZonageParcelles(zonages.slice(0, 1), {});
  assert.strictEqual(app.analyserPreemptionParcelles(rep, memes).droits.find(d => d.cle === 'dpu').motif, app.analyserPreemption(Object.assign({}, rep, { zone: 'U' })).droits.find(d => d.cle === 'dpu').motif);
  // Sur la fiche : la zone de chaque parcelle.
  const e = app.etatPreemptionVierge();
  e.zonages = zonages.slice(0, 2);
  e.reponses = Object.assign({}, rep);
  const fiche = app.preemptionPourFiche(e, new Date(2026, 9, 6, 12, 0));
  assert.strictEqual(fiche.zone, 'AL 839 : Ui2 (U) · B 12 : A (A)');
  assert.strictEqual(fiche.parcelles.length, 2);
});
