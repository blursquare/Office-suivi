// Contrôle de l'ordinateur virtuel de CLAIRE (étude 26/10) dans un vrai Chromium : le serveur ouvre la fenêtre sans écran, elle se met en « poste de
// CLAIRE » (Réglages retirés, envoi inerte), le serveur lui refuse réglages et envois (403), et une demande d'autorisation de l'agent devient une
// proposition de validation pour Bastien que sa décision débloque. Lancé par `npm run fumee`.
import path from 'node:path';
import net from 'node:net';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { creerApp } = require(path.join(racine, 'server', 'src', 'app.js'));
const { ouvrirDb } = require(path.join(racine, 'server', 'src', 'db.js'));

const libre = () => new Promise((ok) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
const erreurs = [];
const verifier = (cond, msg) => { console.log(`  ${cond ? 'ok  ' : 'KO  '} ${msg}`); if (!cond) erreurs.push(msg); };

const port = await libre();
const db = ouvrirDb(':memory:');
const { app, posteClaire } = creerApp({ db, config: { motDePasse: '', authActive: false, racineRepo: racine, port, jetonCalendrier: '', cheminDb: path.join(os.tmpdir(), `claire-pc-${process.pid}`, 'claire.db') } });
const serveur = app.listen(port, '127.0.0.1');
await new Promise((ok) => serveur.once('listening', ok));
const base = `http://127.0.0.1:${port}`;
try {
  // 1. Le serveur lance la fenêtre sans écran à la première consigne ; la page est le poste de CLAIRE.
  const t0 = Date.now();
  const r = await fetch(`${base}/api/poste-claire/travail`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consigne: 'Dis simplement bonjour.', demandeur: 'Bastien ANGLUMENT' }) });
  const { id: idTravail } = await r.json();
  verifier(r.status === 202 && Date.now() - t0 < 2000, `le travail est confié tout de suite, en arrière-plan (HTTP ${r.status})`);
  // 2. Elle le fait en arrière-plan : on suit la file jusqu'au compte rendu (l'agent n'a pas de clé ici).
  let travail;
  for (let i = 0; i < 180; i++) {
    travail = ((await (await fetch(`${base}/api/poste-claire/travaux?utilisateur=${encodeURIComponent('Bastien ANGLUMENT')}`)).json()).travaux || []).find((t) => t.id === idTravail);
    if (travail && (travail.etat === 'fini' || travail.etat === 'erreur')) break;
    await new Promise((ok) => setTimeout(ok, 1000));
  }
  verifier(travail && travail.etat === 'fini' && typeof travail.resultat === 'string', `la fenêtre s'ouvre et rend un compte rendu en arrière-plan (${travail && travail.etat}, ${Math.round((Date.now() - t0) / 1000)} s : ${String(travail && (travail.resultat || travail.erreur)).slice(0, 80)})`);
  const etat = await (await fetch(`${base}/api/poste-claire/etat`)).json();
  verifier(etat.ouvert === true, 'la fenêtre reste ouverte après le travail');
  // 3. Le cookie du poste : refus des réglages et de l'envoi.
  const cookie = `claire-poste=${posteClaire.jeton()}`;
  verifier((await fetch(`${base}/api/reglages`, { headers: { Cookie: cookie } })).status === 403, 'le poste de CLAIRE n\'a pas accès aux réglages (403)');
  verifier((await fetch(`${base}/api/emails/envoyer`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}' })).status === 403, 'le poste de CLAIRE n\'envoie pas d\'email (403)');
  verifier((await fetch(`${base}/api/reglages`)).status !== 403, 'un collaborateur garde ses réglages');
  // 4. Une demande de validation → proposition pour Bastien → décision lue par le poste.
  const d = await fetch(`${base}/api/poste-claire/demande`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ description: 'Cocher la pièce RIB\nDossier inventé' }) });
  const { id } = await d.json();
  verifier(d.status === 200 && /^val-/.test(id), 'une demande de validation est enregistrée');
  const dec = await fetch(`${base}/api/propositions/${id}/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ auteur: 'Bastien ANGLUMENT', decision: 'refusee' }) });
  verifier(dec.status === 200, 'Bastien décide');
  verifier((await (await fetch(`${base}/api/poste-claire/demande/${id}`, { headers: { Cookie: cookie } })).json()).etat === 'refusee', 'le poste de CLAIRE lit le refus');
  // 5. La page elle-même : Réglages retirés, envoi inerte, et la carte « Autoriser » de l'agent devient une demande à Bastien.
  const nav = await chromium.launch();
  try {
    const ctx = await nav.newContext();
    await ctx.addCookies([{ name: 'claire-poste', value: posteClaire.jeton(), url: base }]);
    const page = await ctx.newPage();
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (rt) => rt.abort());
    await page.goto(`${base}/?poste-claire=1`);
    await page.waitForFunction(() => typeof travaillerPosteClaire === 'function' && Array.isArray(dossiers), null, { timeout: 30000 });
    const etatPage = await page.evaluate(async () => {
      const avant = ongletActuel;
      definirOnglet('reglages');
      const reglagesCaches = getComputedStyle(document.getElementById('tab-reglages')).display === 'none';
      const envoi = await envoyerRedaction();
      window.__demande = demanderAutorisationAgent('Cocher la pièce « RIB »\nDossier inventé');
      await new Promise((ok) => setTimeout(ok, 800));
      return { reste: ongletActuel === avant, reglagesCaches, envoiInerte: envoi && envoi.ok === false, classe: document.documentElement.classList.contains('poste-claire'), promesse: !!window.__demande };
    });
    verifier(etatPage.classe && etatPage.reglagesCaches && etatPage.reste && etatPage.envoiInerte, `la page est le poste de CLAIRE : Réglages caché et refusé, envoi inerte (${JSON.stringify(etatPage)})`);
    const propositions = (await (await fetch(`${base}/api/propositions?utilisateur=${encodeURIComponent('Bastien ANGLUMENT')}&etat=a-traiter`)).json()).propositions;
    const demande = propositions.find((p) => p.type === 'validation' && /RIB/.test(p.titre));
    verifier(!!demande, 'la carte « Autoriser » de l\'agent est devenue une demande de validation pour Bastien');
    if (demande) {
      await fetch(`${base}/api/propositions/${demande.id}/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ auteur: 'Bastien ANGLUMENT', decision: 'acceptee' }) });
      const autorisee = await page.evaluate(() => Promise.race([window.__demande, new Promise((ok) => setTimeout(() => ok('délai'), 15000))]));
      verifier(autorisee === true, `la décision de Bastien débloque la fenêtre de CLAIRE (${autorisee})`);
    }
  } finally { await nav.close(); }
} finally {
  await posteClaire.arreter();
  serveur.close();
  db.close();
}
console.log(erreurs.length ? `\n${erreurs.length} erreur(s)` : '\nposte de CLAIRE : tous les contrôles passent');
process.exit(erreurs.length ? 1 : 0);
