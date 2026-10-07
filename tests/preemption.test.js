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

test('SAFER : information obligatoire seulement en zone A ou N (étude 07/10) — maison en zone U : rien ; zone non lue : à vérifier', () => {
  const s = droit({ bien: 'bati', usageAgricole: false, zone: 'U' }, 'safer');
  assert.strictEqual(s.statut, 'non');
  assert.strictEqual(s.formalite, '', 'hors zone A ou N : pas de notification à la SAFER');
  assert.strictEqual(droit({ bien: 'lot-copro', zone: 'U' }, 'safer').formalite, '');
  assert.strictEqual(droit({ bien: 'terrain', zone: 'AU', usageAgricole: false }, 'safer').formalite, '');
  // Zone non lue : ni oui ni non, la zone est demandée.
  const copro = droit({ bien: 'lot-copro' }, 'safer');
  assert.strictEqual(copro.statut, 'non');
  assert.match(copro.formalite, /à vérifier : obligatoire si le bien est en zone A ou N/);
  assert.ok(copro.manque.includes('zone'));
  assert.strictEqual(droit({ bien: 'bati' }, 'safer').statut, 'verifier');
  // Zone A ou N sans préemption : informée.
  assert.match(droit({ bien: 'lot-copro', zone: 'N' }, 'safer').formalite, /Information obligatoire de la SAFER/);
});

test('SAFER, plusieurs parcelles (U et A) : l’information due pour la parcelle en zone A est gardée', () => {
  const lignes = [{ libelle: 'AB 1', statut: 'ok', famille: 'U' }, { libelle: 'ZC 2', statut: 'ok', famille: 'A' }];
  const s = app.analyserPreemptionParcelles({ bien: 'bati', usageAgricole: false, utilise5ans: false }, lignes).droits.find(d => d.cle === 'safer');
  assert.strictEqual(s.statut, 'non');
  assert.match(s.formalite, /Information obligatoire de la SAFER/);
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

// ---- À l'ajout d'un dossier de vente (étude 07/10) : l'outil lu seul, la fiche et les pièces complétées ----
function ficheAuto(d, zonages, reponses) {
  const e = app.prefillPreemption(d);
  e.insee = '41018';
  e.zonages = zonages;
  Object.assign(e.reponses, reponses || {});
  return Object.assign(app.preemptionPourFiche(e, new Date(2026, 9, 7, 10, 0)), { auto: true, signature: app.signaturePreemptionDossier(d) });
}
const zoneU = [{ section: 'AB', numero: '12', statut: 'ok', resultat: { epciSiren: '200030385', zones: [{ libelle: 'UB', typezone: 'U' }], parcelle: { contenance: 640 } } }];
const zoneA = [{ section: 'ZC', numero: '4', statut: 'ok', resultat: { epciSiren: '200030385', zones: [{ libelle: 'A', typezone: 'A' }], parcelle: { contenance: 12000 } } }];
const venteInventee = (o) => Object.assign({ id: 'v1', nom: 'MARTIN / DUPUIS', typeVente: 'maison', roleNotaire: 'instrumentaire', preemptionAuto: true,
  adresseBien: 'VINEUIL (41350), 3 rue des Tilleuls', pieces: {}, piecesPersonnalisees: [],
  bien: { adresse: { codePostal: '41350' }, cadastre: { section: 'AB', numero: '12' } } }, o || {});

test('analyse automatique : seulement les ventes ajoutées depuis la règle, refaite quand commune, parcelles ou nature changent', () => {
  const d = venteInventee();
  assert.strictEqual(app.signaturePreemptionDossier(d), '41350|AB 12|bati');
  assert.strictEqual(app.preemptionAutoAFaire(d), true);
  assert.strictEqual(app.preemptionAutoAFaire(venteInventee({ preemptionAuto: false })), false, 'dossier d’avant la règle');
  assert.strictEqual(app.preemptionAutoAFaire(venteInventee({ roleNotaire: 'participant' })), false);
  assert.strictEqual(app.preemptionAutoAFaire(venteInventee({ archive: true })), false);
  d.preemption = ficheAuto(d, zoneU);
  assert.strictEqual(app.preemptionAutoAFaire(d), false);
  d.bien.cadastre = { parcelles: [{ section: 'AB', numero: '12' }, { section: 'AB', numero: '13' }] };
  assert.strictEqual(app.preemptionAutoAFaire(d), true, 'une parcelle de plus');
  d.preemption.signature = app.signaturePreemptionDossier(d);
  d.preemption.auto = false;
  d.typeVente = 'terrain';
  assert.strictEqual(app.preemptionAutoAFaire(d), false, 'résultat enregistré depuis l’outil : jamais remplacé');
  const incomplet = venteInventee();
  incomplet.preemption = Object.assign(ficheAuto(incomplet, zoneU), { incomplet: true, le: '2026-10-07T08:00:00.000Z' });
  assert.strictEqual(app.preemptionAutoAFaire(incomplet, new Date('2026-10-07T08:30:00Z')), false);
  assert.strictEqual(app.preemptionAutoAFaire(incomplet, new Date('2026-10-07T09:30:00Z')), true, 'Géoportail injoignable : relu une heure plus tard');
});

test('maison en zone U d’Agglopolys : questions posées sur la fiche, rien d’ajouté tant que rien n’est à purger', () => {
  const d = venteInventee();
  d.preemption = ficheAuto(d, zoneU);
  assert.strictEqual(d.preemption.deduites.agglopolys, true);
  assert.strictEqual(d.preemption.lignes.length, 1);
  assert.strictEqual(d.preemption.droits.find(x => x.cle === 'dpu').statut, 'verifier');
  assert.strictEqual(app.questionsPreemptionFiche(d.preemption).map(q => q.cle).join(','), 'achevementMoins4ans,usageAgricole');
  assert.strictEqual(app.appliquerPreemptionSurPieces(d).length, 0);
  // Réponses données sur la fiche : DPU à purger (la pièce standard existe déjà), SAFER non applicable.
  app.appliquerReponsePreemptionFiche(d, 'achevementMoins4ans', false);
  const r = app.appliquerReponsePreemptionFiche(d, 'usageAgricole', false);
  assert.strictEqual(d.preemption.droits.find(x => x.cle === 'dpu').statut, 'oui');
  assert.strictEqual(d.preemption.droits.find(x => x.cle === 'safer').statut, 'non');
  assert.strictEqual(r.pieces.length, 0);
  assert.strictEqual(d.piecesPersonnalisees.length, 0);
  assert.strictEqual(app.questionsPreemptionFiche(d.preemption).length, 0);
  // Recliquer la même réponse l'efface : la question revient.
  app.appliquerReponsePreemptionFiche(d, 'usageAgricole', false);
  assert.strictEqual(app.questionsPreemptionFiche(d.preemption).map(q => q.cle).join(','), 'usageAgricole');
});

test('terrain en zone A : « Réponse SAFER » à attendre, retirée si le droit tombe, jamais en double d’Authentic', () => {
  const d = venteInventee({ typeVente: 'terrain', bien: { adresse: { codePostal: '41350' }, cadastre: { section: 'ZC', numero: '4' } } });
  d.preemption = ficheAuto(d, zoneA, { bois: false, installations: false });
  assert.strictEqual(d.preemption.droits.find(x => x.cle === 'safer').statut, 'oui');
  assert.strictEqual(d.preemption.droits.find(x => x.cle === 'dpu').statut, 'non', 'zone A d’Agglopolys : hors DPU');
  const textes = app.appliquerPreemptionSurPieces(d);
  assert.match(textes.join(' '), /Réponse SAFER/);
  assert.strictEqual(d.piecesPersonnalisees.map(p => p.cle).join(','), 'perso-safer');
  assert.strictEqual(d.pieces['perso-safer'], 'manquante');
  assert.strictEqual(d.preemption.piecesAjoutees.join(','), 'perso-safer');
  assert.strictEqual(app.appliquerPreemptionSurPieces(d).length, 0, 'une seule fois');
  // Le droit tombe (installations) : la pièce ajoutée par l'analyse, pas reçue, est retirée.
  app.appliquerReponsePreemptionFiche(d, 'installations', true);
  assert.strictEqual(d.piecesPersonnalisees.length, 0);
  assert.strictEqual(d.pieces['perso-safer'], undefined);
  // SAFER déjà posée par Authentic : pas de seconde pièce, et la sienne n'est jamais retirée.
  const a = venteInventee({ typeVente: 'terrain', piecesPersonnalisees: [{ cle: 'perso-safer', label: 'Réponse SAFER' }], pieces: { 'perso-safer': 'manquante' },
    authentic: { safer: { envoyeeLe: '2026-10-01' }, saferPieceAjoutee: true } });
  a.preemption = ficheAuto(a, zoneA, { bois: false, installations: false });
  assert.strictEqual(app.appliquerPreemptionSurPieces(a).length, 0);
  assert.strictEqual(a.piecesPersonnalisees.length, 1);
});

test('lot de copropriété soumis au DPU : la DIA retient la signature ; bois : droit de préférence à attendre', () => {
  const c = venteInventee({ typeVente: 'copropriete' });
  c.preemption = ficheAuto(c, zoneU, { achevementMoins4ans: false, reglementPlusDe10ans: false });
  assert.strictEqual(c.preemption.droits.find(x => x.cle === 'dpu').statut, 'oui');
  assert.strictEqual(app.preemptionLevee(c), true, 'avant : la copropriété n’attend rien');
  app.appliquerPreemptionSurPieces(c);
  assert.strictEqual((c.piecesPersonnalisees || []).length, 0, 'plus de seconde pièce « (DIA) » : la pièce standard est retenue');
  assert.ok(c.preemption.piecesAjoutees.includes('renonciationPreemption'));
  assert.strictEqual(app.preemptionLevee(c), false, 'la renonciation retient « Fixer le rendez-vous »');
  c.pieces.renonciationPreemption = 'recue';
  assert.strictEqual(app.preemptionLevee(c), true, 'reçue (scan, NAS, Authentic) : levée');
  // Bois de moins de 4 ha, aucun voisin privilégié : droit de préférence des voisins.
  const b = venteInventee({ typeVente: 'terrain', bien: { adresse: { codePostal: '41350' }, cadastre: { section: 'ZC', numero: '4' } } });
  b.preemption = ficheAuto(b, zoneA, { bois: true, massif4ha: true, superficieMoins4ha: true, foretDomaniale: false, communeBoiseeContigue: false, acquereurPrivilegie: false, partieBoiseeMoinsMoitie: false });
  assert.strictEqual(b.preemption.droits.find(x => x.cle === 'foret-preference').statut, 'oui');
  app.appliquerPreemptionSurPieces(b);
  assert.strictEqual(b.piecesPersonnalisees.map(p => p.cle).join(','), 'perso-foret-preference');
  // Une pièce standard retirée à la main n'est remise que par l'outil (geste explicite).
  const m = venteInventee({ piecesRetirees: ['renonciationPreemption'] });
  m.preemption = ficheAuto(m, zoneU, { achevementMoins4ans: false, usageAgricole: false });
  assert.strictEqual(app.appliquerPreemptionSurPieces(m).length, 0);
  assert.strictEqual(app.appliquerPreemptionSurPieces(m, { explicite: true }).join(''), '« Renonciation au droit de préemption » remise dans les pièces');
  assert.strictEqual(m.piecesRetirees.length, 0);
});

test('droits relus depuis les réponses gardées : une liste réunie par la fusion du serveur ne double rien', () => {
  const d = venteInventee({ typeVente: 'terrain', bien: { adresse: { codePostal: '41350' }, cadastre: { section: 'ZC', numero: '4' } } });
  d.preemption = ficheAuto(d, zoneA, { bois: false, installations: false });
  const juste = app.droitsPreemptionFiche(d.preemption).map(x => x.cle + ':' + x.statut).join(' ');
  d.preemption.droits = d.preemption.droits.concat({ cle: 'safer', titre: 'SAFER', statut: 'verifier', motif: 'ancien', formalite: '' });
  d.preemption.lignes = d.preemption.lignes.concat(d.preemption.lignes);
  assert.strictEqual(app.droitsPreemptionFiche(d.preemption).map(x => x.cle + ':' + x.statut).join(' '), juste);
  assert.strictEqual(juste, 'dpu:non safer:oui foret:non');
  // Résultat d'avant cette règle (sans lignes) : lu tel quel.
  assert.strictEqual(app.droitsPreemptionFiche({ droits: [{ cle: 'dpu', statut: 'oui' }] }).length, 1);
});
