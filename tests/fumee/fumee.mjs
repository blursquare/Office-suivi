// Test de fumée (04/10) : la page chargée dans un vrai Chromium, servie par le vrai serveur (base en mémoire, dossiers
// inventés), chaque écran ouvert, une fiche de chaque sorte — et AUCUNE erreur d'exécution. C'est le filet que le lint et les
// tests unitaires n'offrent pas : un ordre de chargement faux, un `undefined.x` au rendu, un sélecteur disparu.
// Lancé par `npm run fumee` (racine) et par la construction du .exe. Les CDN sont coupés (réseau interdit) : les erreurs de
// chargement de ressources externes sont attendues et ignorées, tout le reste compte.
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { creerApp } = require(path.join(racine, 'server', 'src', 'app.js'));
const { ouvrirDb } = require(path.join(racine, 'server', 'src', 'db.js'));

const dans = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const hist = (texte) => [{ date: dans(-12) + 'T09:00:00', texte }];
// Noms, adresses et montants inventés (contrainte n° 7 de CLAUDE.md).
const DOSSIERS = [
  { id: 'f1', nom: 'MOREAU / LAMBERT', responsable: 'Julie VASSELIN', typeVente: 'maison', emailAcquereur: 'acquereur@exemple.fr',
    roleNotaire: 'instrumentaire', rendezVousSignature: dans(9), rendezVousSignatureHeure: '10:30', pret: dans(5), prixVente: 245000,
    bien: { adresse: 'BLOIS (41000), 12 rue des Lices' }, parties: [{ role: 'VENDEUR', nom: 'MOREAU', prenom: 'Paul' }, { role: 'ACQUEREUR', nom: 'LAMBERT', prenom: 'Claire' }],
    pieces: {}, historique: hist('Dossier créé'), dossierLie: true },
  { id: 'f2', nom: 'ABIME', responsable: 'Julie VASSELIN', pieces: 'texte', parties: 'x', historique: { a: 1 }, rendezVousSignature: 12345, echeancesValidees: 'oui' },
  { id: 'f3', nom: 'DURAND', responsable: 'Julie VASSELIN', typeAffaire: 'succession', sansPret: true, parties: [{ role: 'PARTIE', nom: 'DURAND', prenom: 'Marie' }], biens: [], pieces: {}, historique: hist('Dossier créé') },
  { id: 'f4', nom: 'PETIT / ROUX', responsable: 'Jérémy SAUJOT', archive: true, archiveLe: dans(-20), rendezVousSignature: dans(-30), echeancesValidees: { acte: true, rendezVousSignature: true }, pieces: {}, parties: [], historique: hist('Dossier créé') }
];
const ONGLETS = ['suivi', 'agenda', 'scans', 'nouveau', 'confreres', 'outils', 'calculateur', 'appel-fonds', 'quotites', 'prorata', 'inventaire', 'analyse-ia', 'reglages', 'dashboard'];
const ONGLETS_FICHE = ['echeances', 'pieces', 'echanges', 'historique'];

const db = ouvrirDb(':memory:');
const { app, depot } = creerApp({ db, config: { racineRepo: racine, authActive: false, estSea: () => false } });
for (const d of DOSSIERS) depot.creer(d);
const serveur = app.listen(0);
await new Promise((r) => serveur.once('listening', r));
const B = 'http://127.0.0.1:' + serveur.address().port;

const erreurs = [];
const constats = [];
const verifier = (ok, texte) => { if (!ok) erreurs.push('constat : ' + texte); else constats.push(texte); };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
// Un geste qui lève dans la page est noté puis la suite continue : on veut la liste complète, pas la première casse.
const geste = async (page, nom, fn, arg) => { try { return await page.evaluate(fn, arg); } catch (e) { erreurs.push(`${nom} : ${String(e.message || e).split('\n')[0]}`); return null; } };

// Un <wa-button> mal fermé (« </button> » au lieu de « </wa-button> ») avale tout ce qui le suit : il ne doit contenir que
// son libellé (texte, icône, petite mise en forme), jamais un bloc de l'écran.
const boutonsIntacts = async (page, ou) => {
  const fautifs = await page.evaluate(() => [...document.querySelectorAll('wa-button')]
    .filter((b) => b.querySelector('div, p, section, table, ul, li, form, input, select, textarea, button, wa-button, h1, h2, h3'))
    .map((b) => (b.id || b.className || 'wa-button') + ' : ' + (b.textContent || '').trim().slice(0, 40)));
  if (fautifs.length) erreurs.push(`${ou} : bouton qui contient un bloc (balise mal fermée ?) — ${fautifs.slice(0, 3).join(' | ')}`);
};
const navigateur = await chromium.launch();
try {
  for (const ecran of [{ nom: 'bureau', viewport: { width: 1400, height: 900 } }, { nom: 'téléphone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]) {
    const ctx = await navigateur.newContext({ viewport: ecran.viewport, isMobile: !!ecran.isMobile, hasTouch: !!ecran.hasTouch });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    await ctx.addInitScript(() => { localStorage.setItem('claire-utilisateur-poste', 'Julie VASSELIN'); });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => erreurs.push(`[${ecran.nom}] erreur de page : ${e.message}`));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const t = m.text();
      if (/Failed to load resource|net::ERR_|ERR_FAILED/.test(t)) return; // CDN coupés : attendu
      erreurs.push(`[${ecran.nom}] console : ${t.slice(0, 200)}`);
    });
    await page.goto(B + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction((n) => typeof dossiers !== 'undefined' && dossiers.length >= n, DOSSIERS.length, { timeout: 20000 });
    await page.evaluate(() => { try { fermerFenetreAujourdhui(); } catch (e) { /* fenêtre absente */ } });
    await pause(500);

    // Composants Web Awesome (04/10) : le paquet local est chargé, et le bouton est défini.
    await page.waitForFunction(() => !!customElements.get('wa-button'), null, { timeout: 10000 }).catch(() => {});
    verifier(await page.evaluate(() => !!customElements.get('wa-button')), `[${ecran.nom}] Web Awesome chargé (wa-button défini)`);
    const tdb = await page.evaluate(() => ({ widgets: document.querySelectorAll('#widgets-dashboard .w-carte').length, dossiers: dossiers.length }));
    verifier(tdb.dossiers === DOSSIERS.length, `[${ecran.nom}] ${tdb.dossiers} dossiers chargés`);
    verifier(tdb.widgets >= 3, `[${ecran.nom}] tableau de bord : ${tdb.widgets} widgets`);

    for (const onglet of ONGLETS) {
      const avant = erreurs.length;
      await geste(page, `[${ecran.nom}] écran ${onglet}`, (o) => definirOnglet(o), onglet);
      await pause(ecran.nom === 'bureau' ? 350 : 200);
      if (erreurs.length === avant) constats.push(`[${ecran.nom}] écran ${onglet}`);
      await boutonsIntacts(page, `[${ecran.nom}] écran ${onglet}`);
      if (onglet === 'suivi') {
        const suivi = await page.evaluate(() => { const l = document.getElementById('dossier-list'); return { lignes: l ? l.querySelectorAll('tr, li, .ligne-suivi').length : 0, texte: l ? l.textContent : '' }; });
        verifier(suivi.lignes >= 2 && /MOREAU/.test(suivi.texte), `[${ecran.nom}] Suivi : ${suivi.lignes} lignes, MOREAU présent`);
      }
      if (onglet === 'agenda') {
        const ag = await page.evaluate(() => document.querySelectorAll('[class^="ag-"], [class*=" ag-"]').length);
        verifier(ag > 0, `[${ecran.nom}] agenda rendu (${ag} éléments)`);
      }
    }

    if (ecran.nom === 'bureau') {
      for (const [id, attendu] of [['f1', 'MOREAU'], ['f3', 'SUCC'], ['f2', 'ABIME'], ['f4', 'PETIT']]) {
        await geste(page, `fiche ${id}`, (x) => ouvrirDossierDepuisDashboard(x), id);
        await pause(400);
        const fiche = await page.evaluate(() => { const o = document.getElementById('dossier-drawer-overlay'); return { ouverte: !!o && o.style.display !== 'none', texte: (document.getElementById('dossier-drawer') || {}).textContent || '' }; });
        verifier(fiche.ouverte && fiche.texte.includes(attendu), `fiche ${id} ouverte (${attendu})`);
        for (const o of ONGLETS_FICHE) { await geste(page, `fiche ${id} › ${o}`, (x) => definirOngletFiche(x), o); await pause(150); await boutonsIntacts(page, `fiche ${id} › ${o}`); }
        await page.evaluate(() => { try { fermerDossierDrawer(); } catch (e) { /* déjà fermée */ } });
      }
      // « À propos » : le numéro de version et chaque entrée de l'historique (numéro + jour) s'affichent.
      await geste(page, 'À propos', () => ouvrirAPropos());
      const propos = await page.evaluate(() => ({ numero: (document.getElementById('apropos-version-valeur') || {}).textContent, attendu: VERSION_APP, lignes: document.querySelectorAll('#apropos-historique-liste li').length, entrees: HISTORIQUE_VERSIONS.length, jour: (document.getElementById('apropos-version-date') || {}).textContent }));
      verifier(/^\d+\.\d+\.\d+$/.test(propos.numero || '') && propos.numero === propos.attendu, `À propos : version ${propos.numero}`);
      verifier(propos.lignes === propos.entrees && /\d{2}\/\d{2} \d{2}:\d{2}/.test(propos.jour || ''), `À propos : ${propos.lignes} versions listées, date ${propos.jour}`);
      await geste(page, 'fermer À propos', () => fermerAPropos());
      // Fenêtre d'email : redessinée alors que « Envoyer » (un <wa-button> recréé) a le focus — c'est ce qui empêchait l'envoi
      // (rapport du 05/10, « Cannot read properties of null (reading 'focus') »).
      await geste(page, 'fenêtre d’email', () => {
        envoiDirectPossible = () => true;
        ouvrirRedactionEmail({ mode: 'nouveau', destinataire: 'client@exemple.fr', sujet: 'Essai', corps: 'Bonjour', dossierId: 'f1', responsableSignature: 'Julie VASSELIN' });
      });
      await pause(500);
      const avantEmail = erreurs.length;
      await geste(page, 'fenêtre d’email › redessin avec le focus sur Envoyer', () => { const b = document.getElementById('redaction-envoyer'); if (b) b.focus(); renderRedaction(); });
      await pause(300);
      verifier(erreurs.length === avantEmail, 'fenêtre d’email : redessin avec le focus sur « Envoyer » sans erreur');
      await geste(page, 'abandonner l’email', () => abandonnerRedaction());
      await page.evaluate(() => definirOnglet('dashboard'));
      await pause(300);
    }
    await ctx.close();
  }
} catch (e) {
  erreurs.push('exception : ' + (e && e.stack || e));
} finally {
  await navigateur.close();
  serveur.close();
  db.close();
}

console.log(`${constats.length} points vérifiés`);
if (erreurs.length) {
  console.error(`\n${erreurs.length} erreur(s) :`);
  for (const e of erreurs) console.error(' - ' + e);
  process.exit(1);
}
console.log('Test de fumée : aucune erreur.');
