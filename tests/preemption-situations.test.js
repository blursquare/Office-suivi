'use strict';

// Revue de toutes les situations « droit de préemption (DPU) × SAFER » (étude 09/10 : « ne pas mettre droit de préemption s'il n'y a
// qu'une SAFER à purger, revoir toutes les situations pour parer aux bugs ») : ce que l'analyse du contrôle de l'urbanisme garde sur la
// fiche (`d.preemption.droits`) décide de ce qu'on attend — mairie (renonciation) et SAFER (délai, réponse). Dossiers inventés.

const test = require('node:test');
const assert = require('node:assert/strict');
const planning = require('../commun/planning');
const { checklistPiecesBase } = require('../commun/pieces');

const STATUTS = ['oui', 'non', 'verifier'];
const TYPES = ['maison', 'copropriete', 'terre'];
const aRenonciation = (d) => checklistPiecesBase(d.typeVente, d).some(p => p.cle === 'renonciationPreemption');

function dossier({ type, dpu, safer, authenticSafer, recue }) {
  const d = {
    id: 'x', nom: 'DUPONT / MARTIN', typeVente: type, sansPret: true, acte: '2026-12-20',
    pieces: recue ? { renonciationPreemption: 'recue' } : {},
    preemption: { droits: [{ cle: 'dpu', statut: dpu }, { cle: 'safer', statut: safer }], piecesAjoutees: [] }
  };
  if (safer === 'oui') { d.piecesPersonnalisees = [{ cle: 'perso-safer', label: 'Réponse SAFER' }]; d.pieces['perso-safer'] = 'manquante'; }
  if (authenticSafer) d.authentic = { safer: { envoyeeLe: '2026-08-03', priseEnCompteLe: '2026-08-03' } };
  return d;
}

test('DPU × SAFER × type × Authentic : la mairie n’est attendue que si le DPU n’est pas « non » ; la SAFER que si elle n’est pas « non »', () => {
  for (const type of TYPES) for (const dpu of STATUTS) for (const safer of STATUTS) for (const authenticSafer of [false, true]) {
    const d = dossier({ type, dpu, safer, authenticSafer });
    const nom = `${type} dpu=${dpu} safer=${safer} authentic=${authenticSafer}`;
    // Mairie.
    if (dpu === 'non') {
      assert.equal(planning.preemptionLevee(d), true, `${nom} : rien à attendre de la mairie`);
      assert.equal(aRenonciation(d), false, `${nom} : pas de renonciation dans la checklist`);
    } else if (type !== 'copropriete') {
      assert.equal(planning.preemptionLevee(d), false, `${nom} : renonciation attendue`);
      assert.equal(aRenonciation(d), true, `${nom} : renonciation dans la checklist`);
    }
    // SAFER.
    if (safer === 'non') {
      assert.equal(planning.saferLevee(d), true, `${nom} : SAFER sans objet`);
      assert.equal(planning.echeanceSaferDossier(d), '', `${nom} : pas de délai SAFER`);
    } else if (safer === 'oui' || authenticSafer) {
      assert.equal(planning.saferLevee(d), false, `${nom} : SAFER attendue`);
    }
  }
});

test('Seule une SAFER à purger (DPU non, SAFER oui) : la signature n’attend pas la mairie mais attend la SAFER', () => {
  const d = dossier({ type: 'terre', dpu: 'non', safer: 'oui', authenticSafer: true });
  assert.equal(planning.preemptionLevee(d), true);
  assert.equal(planning.saferLevee(d), false);
  assert.equal(planning.echeanceSaferDossier(d), '2026-10-03');
  const types = planning.echeancesPlanning(d).map(i => i.type);
  assert.ok(types.includes('safer'));
  assert.ok(!types.includes('dia'));
});

test('Une renonciation déjà reçue reste dans la checklist, même quand l’analyse dit « non »', () => {
  const d = dossier({ type: 'maison', dpu: 'non', safer: 'non', recue: true });
  assert.equal(aRenonciation(d), true);
  assert.equal(planning.preemptionLevee(d), true);
});

test('Analyse sans DPU « non » (à vérifier, oui, ou pas d’analyse) : rien ne change', () => {
  for (const dpu of ['oui', 'verifier']) {
    const d = dossier({ type: 'maison', dpu, safer: 'non' });
    assert.equal(planning.preemptionLevee(d), false);
  }
  const sansAnalyse = { id: 'y', nom: 'A / B', typeVente: 'maison', pieces: {} };
  assert.equal(planning.preemptionLevee(sansAnalyse), false);
  assert.equal(aRenonciation(sansAnalyse), true);
  assert.equal(planning.saferLevee(sansAnalyse), true);
});

test('Participation et succession : jamais d’attente, quelle que soit l’analyse', () => {
  const part = dossier({ type: 'maison', dpu: 'oui', safer: 'oui', authenticSafer: true });
  part.roleNotaire = 'participant';
  assert.equal(planning.preemptionLevee(part), true);
  assert.equal(planning.saferLevee(part), true);
  const succ = dossier({ type: 'maison', dpu: 'oui', safer: 'oui' });
  succ.typeAffaire = 'succession';
  assert.equal(planning.preemptionLevee(succ), true);
});

test('Analyse abîmée (droits absents, null, statut inconnu) : jamais de plantage ni de « non » deviné', () => {
  for (const preemption of [null, {}, { droits: null }, { droits: [null, {}, { cle: 'dpu' }] }, { droits: [{ cle: 'dpu', statut: 'peut-etre' }] }]) {
    const d = { id: 'z', nom: 'A / B', typeVente: 'maison', pieces: {}, preemption };
    assert.equal(planning.preemptionLevee(d), false);
    assert.equal(aRenonciation(d), true);
  }
});
