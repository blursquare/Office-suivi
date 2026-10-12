'use strict';

// Tâches posées dans l'agenda de l'office (étude, 04/10) : rendez-vous rouge + initiales en tête du titre.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { tacheDepuisEvenement, synchroniserTachesAgenda, idTacheAgenda } = require('../src/tachesAgenda');
const { assainirRappelPerso } = require('../src/parametresRepo');

const evt = (sujet, categories, extra) => ({ itemId: 'AAMk+1/x==', changeKey: 'CK1', sujet, date: '2026-10-06', categories, ...extra });

test('tacheDepuisEvenement : rouge ET initiales en tête, sinon rien', () => {
  const t = tacheDepuisEvenement(evt('JV - Relancer le syndic', ['Catégorie Rouge']));
  assert.equal(t.collaborateur, 'Julie VASSELIN');
  assert.equal(t.texte, 'Relancer le syndic');
  assert.equal(tacheDepuisEvenement(evt('JS: appeler la banque', ['Red category'])).collaborateur, 'Jérémy SAUJOT');
  assert.equal(tacheDepuisEvenement(evt('BA Appeler Me Exemple', ['rouge'])).texte, 'Appeler Me Exemple');
  // Pas rouge, initiales ailleurs, minuscules, mot qui commence par les initiales, initiales inconnues : rien.
  assert.equal(tacheDepuisEvenement(evt('JV - Relancer le syndic', ['Catégorie Verte'])), null);
  assert.equal(tacheDepuisEvenement(evt('Relancer le syndic (JV)', ['Rouge'])), null);
  assert.equal(tacheDepuisEvenement(evt('jv relancer', ['Rouge'])), null);
  assert.equal(tacheDepuisEvenement(evt('JVA - réunion', ['Rouge'])), null);
  assert.equal(tacheDepuisEvenement(evt('XY - réunion', ['Rouge'])), null);
  assert.equal(tacheDepuisEvenement(evt('VTE - MARTEL / FAURE', ['Rouge'])), null);
});

test('synchroniserTachesAgenda : création, mise à jour, retrait, cochée gardée', () => {
  const debut = '2026-09-28';
  const e1 = evt('JV - Relancer le syndic', ['Rouge']);
  let r = synchroniserTachesAgenda([{ id: 'rp-1', auteur: 'Julie VASSELIN', texte: 'Mon rappel', fait: false }], [e1], debut, '2026-10-04T08:00:00Z');
  assert.equal(r.length, 2);
  const t = r.find(x => x.agendaItemId);
  assert.equal(t.id, idTacheAgenda('AAMk+1/x=='));
  assert.equal(t.auteur, 'Julie VASSELIN');
  assert.equal(t.echeance, '2026-10-06');
  assert.ok(assainirRappelPerso(t), 'le rappel passe le contrôle du serveur');
  assert.equal(assainirRappelPerso(t).agendaItemId, 'AAMk+1/x==');
  // Déplacée et renommée dans Outlook : suivie.
  r = synchroniserTachesAgenda(r, [{ ...e1, sujet: 'JV - Relancer le syndic (2e)', date: '2026-10-08' }], debut);
  assert.equal(r.find(x => x.agendaItemId).texte, 'Relancer le syndic (2e)');
  assert.equal(r.find(x => x.agendaItemId).echeance, '2026-10-08');
  // Rendez-vous supprimé de l'agenda, tâche non cochée : cochée (faite à l'heure du tour), jamais retirée de l'agenda
  // par le poste ensuite. Les rappels ordinaires restent tels quels.
  // (une lecture réelle porte d'autres rendez-vous : la tâche n'est jugée que jusqu'au dernier jour lu)
  const autre = { itemId: 'AUTRE', sujet: 'Rendez-vous', date: '2027-03-01', categories: [] };
  const supprime = synchroniserTachesAgenda(r, [autre], debut, '2026-10-04T10:00:00Z');
  assert.equal(supprime.length, 2);
  const faite = supprime.find(x => x.agendaItemId);
  assert.equal(faite.fait, true);
  assert.equal(faite.faitLe, '2026-10-04T10:00:00Z');
  assert.equal(faite.agendaSupprimeLe, '2026-10-04T10:00:00Z');
  assert.equal(assainirRappelPerso(faite).fait, true, 'passe le contrôle du serveur');
  assert.equal(supprime.find(x => x.id === 'rp-1').fait, false);
  assert.equal(synchroniserTachesAgenda(supprime, [autre], debut).find(x => x.agendaItemId).faitLe, '2026-10-04T10:00:00Z', 'plus touchée ensuite');
  // Rendez-vous encore là mais plus une tâche (plus rouge) : retirée.
  assert.equal(synchroniserTachesAgenda(r, [{ ...e1, categories: ['Bleu'] }], debut).map(x => x.id).join(','), 'rp-1');
  assert.equal(synchroniserTachesAgenda(r, [{ ...e1, sujet: 'Relancer le syndic' }], debut).map(x => x.id).join(','), 'rp-1');
  // Cochée : gardée telle quelle, même relue ou disparue.
  const coche = r.map(x => x.agendaItemId ? { ...x, fait: true, faitLe: '2026-10-04T09:00:00Z' } : x);
  assert.equal(synchroniserTachesAgenda(coche, [], debut).length, 2);
  assert.equal(synchroniserTachesAgenda(coche, [{ ...e1, sujet: 'JV - Autre' }], debut).find(x => x.agendaItemId).texte, 'Relancer le syndic (2e)');
  // Retirée de l'agenda par CLAIRE puis décochée : reste un rappel.
  const decoche = r.map(x => x.agendaItemId ? { ...x, agendaSupprimeLe: '2026-10-04T09:00:00Z' } : x);
  assert.equal(synchroniserTachesAgenda(decoche, [], debut).length, 2);
  // Plus ancienne que la fenêtre lue : jamais retirée faute d'avoir été relue.
  const ancienne = r.map(x => x.agendaItemId ? { ...x, echeance: '2026-09-01' } : x);
  assert.equal(synchroniserTachesAgenda(ancienne, [], debut).length, 2);
});

test('tour de lecture : un rendez-vous rouge « JV - … » devient une tâche de Julie dans ses rappels', async () => {
  const { executerEtEnregistrerTourAgenda, reinitialiserDisjoncteurAgenda } = require('../src/agendaWatch');
  const { ouvrirDb } = require('../src/db');
  const { creerDepot } = require('../src/dossiersRepo');
  const { creerRepoParametres } = require('../src/parametresRepo');
  reinitialiserDisjoncteurAgenda();
  const db = ouvrirDb(':memory:');
  const parametresRepo = creerRepoParametres(db);
  parametresRepo.ecrireReglagesExchange({ actif: true, url: 'https://mail.exemple.test/EWS/Exchange.asmx', email: 'bastien@etude.test', motDePasse: 'x', calendrierPartage: 'sophie@etude.test' });
  const demain = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const corps = '<?xml version="1.0"?><s:Envelope><s:Body><m:FindItemResponse><m:ResponseMessages>'
    + '<m:FindItemResponseMessage ResponseClass="Success"><m:ResponseCode>NoError</m:ResponseCode>'
    + '<m:RootFolder TotalItemsInView="1" IncludesLastItemInRange="true"><t:Items>'
    + '<t:CalendarItem><t:ItemId Id="TACHE1" ChangeKey="ck"/><t:Subject>JV - Relancer le syndic</t:Subject>'
    + '<t:Categories><t:String>Catégorie Rouge</t:String></t:Categories>'
    + `<t:Start>${demain}T08:00:00Z</t:Start><t:End>${demain}T08:30:00Z</t:End><t:IsAllDayEvent>false</t:IsAllDayEvent><t:IsCancelled>false</t:IsCancelled>`
    + '</t:CalendarItem></t:Items></m:RootFolder></m:FindItemResponseMessage></m:ResponseMessages></m:FindItemResponse></s:Body></s:Envelope>';
  const poster = (options, rappel) => setImmediate(() => rappel(null, { statusCode: 200, body: corps }));
  const r = await executerEtEnregistrerTourAgenda(creerDepot(db), parametresRepo, { poster });
  assert.equal(r.ok, true);
  const rappels = parametresRepo.lireRappelsPerso();
  const t = rappels.find(x => x.agendaItemId === 'TACHE1');
  assert.ok(t, 'tâche créée');
  assert.equal(t.auteur, 'Julie VASSELIN');
  assert.equal(t.texte, 'Relancer le syndic');
  assert.equal(t.echeance, demain);
  reinitialiserDisjoncteurAgenda();
  db.close();
});

test('synchroniserTachesAgenda : garde-fous — après le dernier jour lu, lecture tronquée, calendrier changé (audit 12/10)', () => {
  const debut = '2026-09-28';
  const t = (id, date) => ({ id: 'ag-' + id, auteur: 'Julie VASSELIN', texte: 'Tâche', echeance: date, fait: false, agendaItemId: id });
  const autre = (date) => ({ itemId: 'X' + date, sujet: 'Rendez-vous', date, categories: [] });
  // Après le dernier jour lu : pas cochée.
  assert.equal(synchroniserTachesAgenda([t('A', '2027-06-01')], [autre('2027-01-01')], debut)[0].fait, false);
  // Lecture tronquée (3 000) : rien de coché.
  const beaucoup = Array.from({ length: 3000 }, (_, i) => ({ itemId: 'E' + i, sujet: 'x', date: '2026-11-01', categories: [] }));
  assert.equal(synchroniserTachesAgenda([t('A', '2026-10-10')], beaucoup, debut)[0].fait, false);
  // Calendrier changé dans les Réglages : rien de coché.
  const r = synchroniserTachesAgenda([t('A', '2026-10-10'), t('B', '2026-10-12')], [autre('2027-01-01')], debut, undefined, { calendrierChange: true });
  assert.equal(r.filter(x => x.fait).length, 0);
  // … et au tour suivant non plus : elles sont devenues des rappels ordinaires.
  assert.equal(synchroniserTachesAgenda(r, [autre('2027-01-01')], debut).filter(x => x.fait).length, 0);
  // Même calendrier, toutes supprimées d'un coup dans Outlook : toutes cochées (étude 04/10).
  assert.equal(synchroniserTachesAgenda([t('A', '2026-10-10'), t('B', '2026-10-12')], [autre('2027-01-01')], debut).filter(x => x.fait).length, 2);
  // Une retrouvée, l'autre disparue : celle-ci cochée.
  const r2 = synchroniserTachesAgenda([t('A', '2026-10-10'), t('B', '2026-10-12')], [autre('2027-01-01'), { itemId: 'A', sujet: 'Autre', date: '2026-10-10', categories: [] }], debut);
  assert.equal(r2.find(x => x.agendaItemId === 'B').fait, true);
});

test('tacheDepuisEvenement : « JS : tâche » et variantes (étude 12/10)', () => {
  const t = (sujet) => { const r = tacheDepuisEvenement({ itemId: '1', date: '2026-10-12', categories: ['Catégorie rouge'], sujet }); return r ? r.texte + '|' + r.collaborateur : null; };
  assert.equal(t('JS : Relancer le syndic'), 'Relancer le syndic|Jérémy SAUJOT');
  assert.equal(t('JS\u00a0: Relancer'), 'Relancer|Jérémy SAUJOT');
  assert.equal(t('JS - : Relancer'), 'Relancer|Jérémy SAUJOT');
  assert.equal(t('(JV) Relancer'), 'Relancer|Julie VASSELIN');
  assert.equal(t('Js : Relancer'), 'Relancer|Jérémy SAUJOT');
  assert.equal(t('js relancer'), null);
  assert.equal(t('JSA relancer'), null);
});
