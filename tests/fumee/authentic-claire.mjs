// Parcours de CLAIRE dans Authentic (server/src/authenticClaire.js) joué dans un vrai Chromium contre un faux Authentic
// (tests/fumee/faux-authentic.html, structure des captures de l'étude du 27/10, noms inventés) : connexion, recherche du dossier, relevé
// du dossier et de ses fiches, demande CJN puis Comedec — « Envoi immédiat » allumé au départ doit être ÉTEINT avant « Valider », aucun
// bouton interdit (Envoyer, Nouveau dossier) cliqué, le mot de passe dans aucune étape.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const A = require(path.join(racine, 'server/src/authenticClaire.js'));
const { SessionNavigation } = require(path.join(racine, 'server/src/navigateur/session.js'));
const P = require(path.join(racine, 'server/src/authenticPilote.js'));
const { trouverNavigateur } = require(path.join(racine, 'server/src/navigateur/chrome.js'));

const page = readFileSync(path.join(racine, 'tests/fumee/faux-authentic.html'));
// La visionneuse de la GED (`dynamiccontent`) rend un PDF ; tout le reste, la page.
const serveur = createServer((req, res) => {
  if (/dynamiccontent/.test(req.url || '')) { res.writeHead(200, { 'Content-Type': 'application/pdf' }); res.end('%PDF-1.4 piece jointe essai'); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(page);
});
await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
const adresse = `http://127.0.0.1:${serveur.address().port}/`;

let echecs = 0;
const verifier = (ok, texte) => { console.log(`  ${ok ? 'ok  ' : 'ÉCHEC'} ${texte}`); if (!ok) echecs++; };

if (!(await trouverNavigateur())) { console.log('Pas de navigateur : parcours Authentic sauté.'); serveur.close(); process.exit(0); }
const etapes = [];
const etape = (t) => etapes.push(String(t));
const reglages = { adresse, identifiant: 'etude-essai', motDePasse: 'secret-essai' };
const s = await SessionNavigation.ouvrir({ profil: path.join(os.tmpdir(), 'claire-authentic-fumee-' + process.pid), domaines: ['127.0.0.1'] });
try {
  await A.seConnecter(s, reglages, etape);
  verifier(await s.evaluer("document.getElementById('accueil').classList.contains('active')"), 'connexion : la page d’accueil s’affiche');
  verifier(await s.evaluer('window.__silicium') === 2, 'vérification Silicium passée à l’ouverture et après la connexion');
  verifier(JSON.stringify(await s.evaluer('window.__connexion')) === JSON.stringify({ id: 'etude-essai', mdp: 'secret-essai' }), 'identifiant et mot de passe saisis');

  const captures = [];
  const script = await A.scriptReleve({ racineRepo: racine });
  const r = await A.lireDossier(s, { reference: 'A 2026 00500', libelle: 'VTE MARTIN / DURAND' }, { script, recevoir: (c) => { captures.push(c); return { ok: true }; }, etape });
  verifier(captures.some((c) => (c.pieces || []).some((p) => p.pjId === 'pj11' && p.dossier === 'Non classé')), 'la liste des pièces jointes est relevée (identifiant, dossier de l’arbre)');
  verifier(!(await s.evaluer('window.__panneauLateral')), 'le résultat de recherche est ouvert par son icône (goToDossier), jamais par le titre (panneau latéral)');
  verifier(!(await s.evaluer('window.__promesse')), 'depuis la page du dossier (bandeau seul), le sous-dossier de VENTE est ouvert par la liste, jamais la promesse');
  const piece = await A.lirePiecePdf(s, { reference: 'A 2026 00500', libelle: 'VTE MARTIN / DURAND' }, 'pj11', { etape });
  verifier(piece.pdf.toString().startsWith('%PDF') && /Titre de propriété/.test(piece.nom), 'le PDF d’une pièce jointe est lu à la demande');
  const ehf = await A.lirePiecePdf(s, { reference: 'A 2026 00500', libelle: 'VTE MARTIN / DURAND' }, 'pj12', { etape });
  verifier(ehf.pdf.toString().startsWith('%PDF') && /Etat reponse/.test(ehf.nom), 'l’état hypothécaire d’un répertoire REPLIÉ des pièces jointes : répertoire déplié, PDF lu');
  verifier(await s.evaluer('window.__groupes') === 1, 'deux groupes repliés l’un sous l’autre : chacun déplié par son chevron, aucune ligne cliquée');
  verifier(r.pages === 6 && captures.length === 7, `lecture : page du dossier, un aperçu de formalité, la page relevée de nouveau tiroir fermé, et 3 fiches (${captures.length})`);
  const avecApercu = captures.find((c) => c.apercu);
  verifier(!!avecApercu && /Reçue le/.test(avecApercu.apercu.texte) && /MARTIN Paul/.test(avecApercu.apercu.titre), 'l’aperçu de la formalité est relevé (tiroir ouvert au survol, titre et dates)');
  verifier(!(await s.evaluer('window.__interdit')), 'la corbeille de la ligne (« Supprimer l’aperçu ») n’est jamais cliquée');
  verifier(await s.evaluer('window.__apercus') === 1 && await s.evaluer("document.getElementById('sideView').style.display") === 'none', 'aperçu ouvert une fois puis refermé');
  verifier(captures.some((c) => (c.champs || []).some((x) => /MARTIN/.test(x.valeur))), 'la fiche client de MARTIN est relevée');

  // Infos comptables : l'onglet au vrai libellé (« Infos comptables 12,50 € »), jamais « Générer en PDF ».
  const compta = await A.lireComptabilite(s, { reference: 'A 2026 00500', libelle: 'VTE MARTIN / DURAND' }, { script, etape });
  verifier(!!compta && /Dernières opérations/.test(JSON.stringify(compta)), 'l’onglet « Infos comptables » est ouvert, le compte principal choisi par son libellé, le détail relevé');
  verifier(!(await s.evaluer('window.__interdit')), '« Générer en PDF » n’est jamais cliqué');
  verifier(compta && compta.sousDossierCompta === 'vente', 'comptabilité liée à la vente : lue dans la vente');
  // Comptabilité non liée à la vente (« Infos comptables : indisponible ») : celle de la promesse est lue (étude 30/10).
  await s.evaluer(`(() => { voir('dossier'); const b = [...document.querySelectorAll('#dossier button')].find((x) => /Infos comptables/.test(x.textContent)); b.textContent = 'Infos comptables : indisponible'; b.onclick = () => { window.__interdit = 'onglet indisponible cliqué'; };
    const l = [...document.querySelectorAll('#dossier .lien')].find((x) => /^1 - Promesse/.test(x.textContent)); l.onclick = () => voir('promesse'); document.getElementById('detail-compte').textContent = 'Sélectionnez un compte pour en voir le détail'; })()`);
  const comptaPromesse = await A.lireComptabilite(s, { reference: 'A 2026 00500', libelle: 'VTE MARTIN / DURAND' }, { script, etape });
  verifier(comptaPromesse && comptaPromesse.sousDossierCompta === 'promesse' && await s.evaluer('window.__comptaPromesse') === true, 'comptabilité indisponible dans la vente : celle de la promesse est lue');
  verifier(!(await s.evaluer('window.__interdit')), 'l’onglet « indisponible » de la vente n’est jamais cliqué');

  // Étape 7 : les quatre écrans de suivi, par leurs menus ; « Exporter » jamais cliqué.
  const AT = require(path.join(racine, 'commun/authentic-modele.js'));
  const suivis = await A.lireSuivis(s, { script, etape });
  verifier(JSON.stringify(Object.keys(suivis).sort()) === JSON.stringify(['actesASigner', 'etatCivil', 'micen', 'safer']), `les quatre écrans de suivi sont relevés (${Object.keys(suivis).join(', ')})`);
  const safer = AT.suiviDepuisCaptureAT('safer', suivis.safer, '2026-10-27T10:00:00Z');
  verifier(safer.lignes.length === 2 && safer.lignes[0].reference === 'A 2026 00500' && safer.lignes[0].enAttente && !safer.lignes[1].enAttente, 'SAFER : références lues, « Non préemption » sortie de l’attente');
  verifier(!(await s.evaluer('window.__interdit')), '« Exporter » et les autres entrées du menu ne sont jamais cliqués');

  await A.preparerFormalite(s, { reference: 'A 2026 00500', libelle: 'VTE MARTIN / DURAND' }, { type: 'cjn', parties: [{ nom: 'DURAND', prenom: 'Claire' }], etape, ecriture: true });
  verifier(!(await s.evaluer('window.__mauvais')), 'l’homonyme des résultats (autre référence) n’est jamais pris');
  const cjn = await s.evaluer('window.__valide');
  verifier(cjn && cjn.type === 'cjn' && cjn.rapide === true && cjn.envoi === null, `CJN validée avec Création rapide allumée, sans interrupteur d’envoi comme le vrai bloc (${JSON.stringify(cjn)})`);
  verifier(cjn && cjn.cases && cjn.cases['Mme DURAND Claire (41000 BLOIS)'] === true && cjn.cases['M. MARTIN Paul (41000 BLOIS)'] === false, `CJN : l’acquéreur coché, l’autre personne décochée avant « Valider » (${JSON.stringify(cjn && cjn.cases)})`);

  const parties = [{ nom: 'MARTIN', prenom: 'Paul', marie: false }, { nom: 'DURAND', prenom: 'Claire', marie: true }];
  await A.preparerFormalite(s, { reference: 'A 2026 00500', libelle: 'VTE MARTIN / DURAND' }, { type: 'comedec', parties, etape, ecriture: true });
  const com = await s.evaluer('window.__valide');
  verifier(com && com.type === 'comedec' && com.envoi === false && com.rapide === true, 'Comedec validée sans envoi');
  const choix = (com && com.choix) || {};
  verifier(JSON.stringify(choix['M. MARTIN Paul (41000 BLOIS)']) === '["Naissance"]', 'MARTIN : naissance seule');
  verifier(JSON.stringify(choix['Mme DURAND Claire épouse de M. LEROY Marc']) === '["Naissance","Mariage"]', 'DURAND (mariée) : naissance et mariage');
  verifier(!(choix['M. LEROY Marc'] || []).length, 'LEROY (conjoint, pas partie) : « Décès » coché d’avance par Authentic est DÉCOCHÉ');
  verifier(!(await s.evaluer('window.__interdit')), 'aucun bouton interdit cliqué (Envoyer, Nouveau dossier)');
  verifier(!etapes.some((t) => t.includes('secret-essai')), 'le mot de passe n’apparaît dans aucune étape');

  // Claude PILOTE (étude 29/10) : un faux Claude choisit des positions réelles dans le vrai navigateur ; la garde refuse l'envoi et « Valider » tant que
  // « Envoi immédiat » est allumé, permet de l'ÉTEINDRE, puis « Valider ».
  await s.evaluer("window.__valide = null; window.__interdit = null; details('comedec'); true");
  const centre = async (texteBouton) => s.evaluer(`(() => { const e = [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === ${JSON.stringify(texteBouton)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  const interrupteurEnvoi = async () => s.evaluer(`(() => { const l = [...document.querySelectorAll('label')].find((x) => /envoi imm/i.test(x.innerText)); const sw = l && l.nextElementSibling; if (!sw) return null; sw.scrollIntoView({ block: 'center' }); const r = sw.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  const messagesPilote = [];
  const pasPilote = (nom, entree) => ({ content: [{ type: 'tool_use', id: 'u' + messagesPilote.length, name: nom, input: entree }], usage: { input_tokens: 100 } });
  const scenario = [];
  const clientPilote = { messages: { create: async (req) => { messagesPilote.push(JSON.stringify(req.messages.slice(-1))); const f = scenario.shift(); return f ? await f() : pasPilote('terminer', { etat: 'partiel', compte_rendu: 'fin' }); } } };
  const sansAttente = async () => {};
  const posEnvoyer = await centre('Envoyer');
  scenario.push(async () => pasPilote('cliquer', posEnvoyer || { x: 5, y: 5 }));
  await P.piloter({ s, client: clientPilote, consigne: 'Essai : clique Envoyer', etape, annule: () => false, attendre: sansAttente });
  verifier(!!posEnvoyer && !(await s.evaluer('window.__interdit')), 'pilote : « Envoyer » n’est jamais cliqué (refusé par la garde)');
  verifier(/REFUSÉ par le contrôle de CLAIRE/.test(messagesPilote.join('')), 'pilote : le refus est dit à Claude');
  const posValider = await centre('Valider');
  scenario.push(async () => pasPilote('cliquer', posValider || { x: 5, y: 5 }));
  await P.piloter({ s, client: clientPilote, consigne: 'Essai : valide', etape, annule: () => false, attendre: sansAttente });
  verifier(!!posValider && !(await s.evaluer('window.__valide')), 'pilote : « Valider » refusé tant qu’« Envoi immédiat » est allumé');
  const posEnvoi = await interrupteurEnvoi();
  scenario.push(async () => pasPilote('cliquer', posEnvoi || { x: 5, y: 5 }));
  scenario.push(async () => { const p = await centre('Valider'); return pasPilote('cliquer', p || { x: 5, y: 5 }); });
  await P.piloter({ s, client: clientPilote, consigne: 'Essai : éteins l’envoi puis valide', etape, annule: () => false, attendre: sansAttente });
  const valide = await s.evaluer('window.__valide');
  verifier(!!posEnvoi && valide && valide.envoi === false, `pilote : « Envoi immédiat » éteint par Claude puis « Valider » permis (${JSON.stringify(valide)})`);
  verifier(!(await s.evaluer('window.__interdit')), 'pilote : aucun bouton interdit cliqué');
  // Sans référence : aucune demande (on ne peut pas être sûr du dossier).
  let refus = '';
  try { await A.preparerFormalite(s, { reference: '', libelle: 'VTE MARTIN / DURAND' }, { type: 'cjn', parties: [{ nom: 'DURAND', prenom: 'Claire' }], etape, ecriture: true }); } catch (e) { refus = e.message; }
  verifier(/sans référence/.test(refus), 'sans référence d’Authentic : aucune demande');
  // Écriture éteinte (défaut, plan du 27/10) : rien n'est tenté dans Authentic.
  await s.evaluer('window.__valide = null');
  let eteinte = '';
  try { await A.preparerFormalite(s, { reference: 'A 2026 00500', libelle: 'VTE MARTIN / DURAND' }, { type: 'cjn', parties: [{ nom: 'DURAND', prenom: 'Claire' }], etape }); } catch (e) { eteinte = e.message; }
  verifier(/éteint/.test(eteinte) && !(await s.evaluer('window.__valide')), 'préparer des demandes éteint : aucune demande, aucun clic');
} catch (e) {
  console.log('  ÉCHEC parcours interrompu :', e && e.message);
  echecs++;
} finally {
  await s.fermer().catch(() => {});
  serveur.close();
}
console.log(echecs ? `\nparcours Authentic : ${echecs} échec(s)` : '\nparcours Authentic : tous les contrôles passent');
process.exit(echecs ? 1 : 0);
