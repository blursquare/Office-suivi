// Extension Chrome sur une copie du guichet d'Agglopolys (17/10, d'après la vidéo de l'étude) : accueil dessiné après « Traitements en cours »,
// bandeau « FORMULER » avec boutons ronds, commune de dépôt, assistant d'adresse et assistant des références cadastrales. Vérifie que CLAIRE
// clique la démarche de « Formuler » (jamais une carte de « Suivre »), remplit les deux assistants, n'ajoute aucune parcelle deux fois, laisse
// une adresse qui ne correspond pas à l'étude, et ne clique jamais « Transmettre ma demande ». Données inventées.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const ext = path.resolve(ici, '..', '..', 'extension-chrome');
const scenario = JSON.parse(fs.readFileSync(path.join(ext, 'scenarios', 'cua-gnau-agglopolys.json'), 'utf8'));
const erreurs = [];

async function jouer(fiche, avant) {
  const run = { id: 'r1', scenario, fiche, speed: 'fast', status: 'running', fields: {} };
  const browser = await chromium.launch(process.env.PLAYWRIGHT_BROWSERS_PATH ? {} : { executablePath: '/opt/pw-browsers/chromium' });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const journal = [];
    await page.exposeFunction('__envoi', (m) => { journal.push(m); return null; });
    await page.addInitScript((r) => {
      window.chrome = { runtime: { sendMessage: async (m) => { await window.__envoi(m); if (m.type === 'content.hello') return r; if (m.type === 'content.plan') return { nom: 'Plan cadastral.pdf', b64: btoa('%PDF-1.4 essai') }; return {}; }, onMessage: { addListener() {} } } };
      window.addEventListener('click', (e) => { const t = e.target.closest && e.target.closest('[ng-click]'); if (t && /transmettre/i.test(t.getAttribute('ng-click'))) window.__transmis = true; }, true);
    }, run);
    page.on('pageerror', (e) => erreurs.push('erreur de page : ' + e.message));
    await page.goto('file://' + path.join(ici, 'gnau-agglopolys.html'));
    if (avant) await page.evaluate(avant);
    for (const f of ['lib/fiche.js', 'content/content.js']) await page.addScriptTag({ path: path.join(ext, f) });
    for (let i = 0; i < 400 && !journal.some((m) => m.type === 'content.finish'); i++) await new Promise((r) => setTimeout(r, 250));
    const valeurs = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('input[id]')].map((i) => [i.id, i.value])));
    const etat = await page.evaluate(() => ({ commune: window.__commune || '', piece: window.__piece || '', hash: location.hash, transmis: !!window.__transmis, carteSuivi: !!window.__carteSuivi, lignes: (window.__parcelles || []).length, modales: document.querySelectorAll('.modal').length }));
    return { journal, valeurs, etat, assistants: Object.fromEntries(journal.filter((m) => m.type === 'content.assistant').map((m) => [m.assistant, m])) };
  } finally { await browser.close(); }
}
const verifier = (ok, texte) => { if (!ok) erreurs.push(texte); };
const base = { terrain: { numero: '51', voie: 'Rue Racine', commune: 'BLOIS', codePostal: '41000' }, superficie: '2989',
  parcelles: [{ section: 'BA', numero: '21', surface: '234' }, { section: 'BA', numero: '22', surface: '333' }, { section: 'BA', numero: '23', surface: '2311' }, { section: 'RE', numero: '432', surface: '111' }],
  signature: { lieu: 'BLOIS', date: '2026-10-17' }, notaire: {}, dossier: { id: 'x' } };

const a = await jouer(base);
verifier(a.etat.hash === '#/saisie/19333', 'la démarche de « Formuler » est ouverte après le chargement');
verifier(a.etat.commune === 'Blois', 'commune de dépôt = celle du dossier (Blois) : ' + a.etat.commune);
verifier(a.valeurs.T2V_voie === 'RUE RACINE' && a.valeurs.T2Q_numero === '51' && a.valeurs.T2C_code === '41000', 'adresse posée par l’assistant');
verifier(a.valeurs.T2S_section === 'BA' && a.valeurs.T2NP3_numero === '23' && a.valeurs.D5T_total === '2989', 'parcelles posées par l’assistant (4, la dernière en annexe)');
verifier(a.etat.lignes === 4, 'quatre parcelles, aucune deux fois');
verifier(!a.etat.transmis, '« Transmettre ma demande » jamais cliqué');
verifier(a.etat.piece === 'Plan cadastral.pdf', 'plan joint à « CU1. Un plan de situation » (champ nommé « Ajouter ») : ' + a.etat.piece);
verifier((a.assistants.parcelles || {}).etat === 'done' && (a.assistants.adresse || {}).etat === 'done', 'assistants faits');

const b = await jouer(Object.assign({}, base, { terrain: { numero: '9', voie: 'Chemin Inconnu', commune: 'BLOIS', codePostal: '41000' } }));
verifier((b.assistants.adresse || {}).etat === 'manuel', 'adresse sans proposition conforme : laissée à l’étude');
verifier(!b.valeurs.T2V_voie, 'aucune adresse proposée par erreur');
verifier(b.valeurs.T2S_section === 'BA', 'les parcelles restent saisies');

// Relecture du 17/10 : voie proche, autre numéro, autre commune ; parcelle déjà au tableau (zéros en tête) ; boutons « Formuler » dessinés après
// le reste avec un bloc « Mes dossiers » ; chargement de 25 s.
const c = await jouer(base, () => { window.__cfg = { adresses: ['51 Rue Jean Racine 41000 Blois', '151 Rue Racine 41000 Blois'] }; });
verifier((c.assistants.adresse || {}).etat === 'manuel' && !c.valeurs.T2V_voie, '« Rue Jean Racine » et « 151 » refusés pour « 51 Rue Racine »');
const d = await jouer(Object.assign({}, base, { terrain: { numero: '51', voie: 'Rue Racine', commune: 'VINEUIL', codePostal: '41350' } }),
  () => { window.__cfg = { adresses: ['51 Rue Racine 41350 Saint-Claude-de-Diray'] }; });
verifier((d.assistants.adresse || {}).etat === 'manuel' && !d.valeurs.T2V_voie, 'même voie dans une autre commune refusée');
verifier(d.etat.commune === 'Vineuil', 'commune de dépôt = celle du dossier (Vineuil) : ' + d.etat.commune);
const e = await jouer(base, () => { window.__cfg = { parcellesInit: [{ pre: '', s: 'BA', n: '0021', u: '234' }] }; });
verifier(e.etat.lignes === 4, 'parcelle déjà au tableau (« BA 0021 ») jamais rajoutée : ' + e.etat.lignes);
const f = await jouer(base, () => { window.__cfg = { boutonsTard: true, titreSuivi: 'MES DOSSIERS' }; });
verifier(f.etat.hash === '#/saisie/19333' && !f.etat.carteSuivi, 'boutons de « Formuler » attendus, jamais une carte du suivi');
const h = await jouer(base, () => { window.__cfg = { boutonsTard: true, suiviSection: true }; });
verifier(!h.etat.carteSuivi, '« Suivre » d’une autre forme que « Formuler » et boutons en retard : jamais une carte du suivi');
const i = await jouer(Object.assign({}, base, { terrain: { numero: '51', voie: 'Av. Racine', commune: 'BLOIS', codePostal: '41000' } }),
  () => { window.__cfg = { adresses: ['51 Avenue Racine 41000 Blois'] }; });
verifier(i.valeurs.T2V_voie === 'AVENUE RACINE', 'abréviation de la fiche (« Av. ») reconnue : ' + i.valeurs.T2V_voie);
const g = await jouer(base, () => { window.__cfg = { chargement: 25000 }; });
verifier(g.etat.hash !== '#/saisie/19333' || !g.etat.carteSuivi, 'chargement long : jamais une carte du suivi');

console.log(erreurs.length ? 'Extension GNAU : ' + erreurs.length + ' échec(s)\n' + erreurs.join('\n') : 'Extension GNAU : parcours d’Agglopolys joué sans erreur.');
process.exit(erreurs.length ? 1 : 0);
