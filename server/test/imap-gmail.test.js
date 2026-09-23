'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');

const {
  effacerCopiesEnvoyees, estCompteGmail, dossiersSpeciaux, lireUidsSearch, lireCopyUid, quoterImap
} = require('../src/imapGmail');

const GMAIL = {
  smtpHote: 'smtp.gmail.com', smtpUtilisateur: 'claire.etude@gmail.com', smtpMotDePasse: 'abcd efgh ijkl mnop'
};

// Faux serveur IMAP : répond aux commandes du client selon un petit état, et consigne tout ce qu'il
// reçoit. `copyuid` false simule un serveur sans COPYUID ; `trouveApres` le nombre de recherches
// vides avant que le message n'apparaisse (copie pas encore rangée par Gmail).
function fauxServeur({ copyuid = true, trouveApres = 0, loginOk = true, messages = ['<m1@claire>'] } = {}) {
  const recu = [];
  let recherches = 0;
  let dossier = null;
  const serveur = net.createServer((socket) => {
    socket.setEncoding('utf8');
    socket.write('* OK Gimap ready\r\n');
    let tampon = '';
    socket.on('data', (d) => {
      tampon += d;
      let i;
      while ((i = tampon.indexOf('\r\n')) >= 0) {
        const ligne = tampon.slice(0, i);
        tampon = tampon.slice(i + 2);
        recu.push(ligne);
        const [tag, cmd, ...reste] = ligne.split(' ');
        const suite = reste.join(' ');
        const ok = (t) => socket.write(`${tag} OK ${t || 'Success'}\r\n`);
        if (cmd === 'LOGIN') {
          if (loginOk) ok(); else socket.write(`${tag} NO [AUTHENTICATIONFAILED] Invalid credentials\r\n`);
        } else if (cmd === 'LIST') {
          socket.write('* LIST (\\HasNoChildren) "/" "INBOX"\r\n');
          socket.write('* LIST (\\HasNoChildren \\Sent) "/" "[Gmail]/Messages envoy&AOk-s"\r\n');
          socket.write('* LIST (\\HasNoChildren \\Trash) "/" "[Gmail]/Corbeille"\r\n');
          ok();
        } else if (cmd === 'SELECT') {
          dossier = suite;
          socket.write('* 3 EXISTS\r\n');
          ok('[READ-WRITE] Selected');
        } else if (cmd === 'NOOP') {
          ok();
        } else if (cmd === 'UID' && reste[0] === 'SEARCH') {
          recherches++;
          const vise = messages.find((m) => suite.includes(m));
          const dansCorbeille = dossier && dossier.includes('Corbeille');
          const uid = dansCorbeille ? 900 : 12;
          socket.write(`* SEARCH${vise && recherches > trouveApres ? ' ' + uid : ''}\r\n`);
          ok();
        } else if (cmd === 'UID' && reste[0] === 'MOVE') {
          if (copyuid) socket.write('* OK [COPYUID 7 12 900] Moved\r\n');
          socket.write('* 1 EXPUNGE\r\n');
          ok();
        } else if (cmd === 'UID' && (reste[0] === 'STORE' || reste[0] === 'EXPUNGE')) {
          ok();
        } else if (cmd === 'LOGOUT') {
          socket.write('* BYE\r\n');
          ok();
          socket.end();
        } else {
          socket.write(`${tag} BAD Unknown\r\n`);
        }
      }
    });
    socket.on('error', () => {});
  });
  return new Promise((resoudre) => {
    serveur.listen(0, '127.0.0.1', () => {
      const port = serveur.address().port;
      resoudre({
        recu,
        fermer: () => new Promise((r) => serveur.close(r)),
        creerSocket: () => net.connect(port, '127.0.0.1')
      });
    });
  });
}

test('estCompteGmail : seul un serveur SMTP Gmail déclenche l\'effacement', () => {
  assert.equal(estCompteGmail({ smtpHote: 'smtp.gmail.com' }), true);
  assert.equal(estCompteGmail({ smtpHote: 'SMTP.GoogleMail.com' }), true);
  assert.equal(estCompteGmail({ smtpHote: 'smtp.office365.com' }), false);
  assert.equal(estCompteGmail({ smtpHote: 'gmail.com.pirate.fr' }), false);
  assert.equal(estCompteGmail({}), false);
});

test('dossiersSpeciaux lit \\Sent et \\Trash, quel que soit le nom localisé', () => {
  const d = dossiersSpeciaux([
    '* LIST (\\HasNoChildren) "/" "INBOX"',
    '* LIST (\\HasNoChildren \\Sent) "/" "[Gmail]/Messages envoy&AOk-s"',
    '* LIST (\\Trash \\HasNoChildren) "/" "[Gmail]/Corbeille"'
  ]);
  assert.equal(d.envoyes, '[Gmail]/Messages envoy&AOk-s');
  assert.equal(d.corbeille, '[Gmail]/Corbeille');
  // Sans attribut, repli sur les noms anglais par défaut de Gmail.
  const repli = dossiersSpeciaux(['* LIST (\\HasNoChildren) "/" "INBOX"']);
  assert.equal(repli.envoyes, '[Gmail]/Sent Mail');
  assert.equal(repli.corbeille, '[Gmail]/Trash');
});

test('lecture des réponses SEARCH / COPYUID et guillemets IMAP', () => {
  assert.equal(lireUidsSearch(['* SEARCH 12 45', 'C3 OK']).join(','), '12,45');
  assert.equal(lireUidsSearch(['* SEARCH', 'C3 OK']).length, 0);
  assert.equal(lireCopyUid(['* OK [COPYUID 7 12,45 100:101] Moved']), '100:101');
  assert.equal(lireCopyUid(['* 1 EXPUNGE']), null);
  assert.equal(quoterImap('a"b\\c'), '"a\\"b\\\\c"');
});

test('rien à faire hors Gmail, ou sans message à effacer : aucune connexion', async () => {
  let connexions = 0;
  const creerSocket = () => { connexions++; throw new Error('ne doit pas être appelé'); };
  const r1 = await effacerCopiesEnvoyees({ smtpHote: 'smtp.office365.com' }, ['<x@y>'], { creerSocket });
  const r2 = await effacerCopiesEnvoyees(GMAIL, [], { creerSocket });
  assert.equal(r1.ignore, true);
  assert.equal(r2.ignore, true);
  assert.equal(connexions, 0);
});

test('efface la copie : recherche par Message-ID exact, corbeille puis suppression définitive', async () => {
  const f = await fauxServeur();
  try {
    const r = await effacerCopiesEnvoyees(GMAIL, ['<m1@claire>'], { creerSocket: f.creerSocket, pauseMs: 0 });
    assert.equal(r.ok, true);
    assert.equal(r.effaces, 1);
    const cmds = f.recu.map((l) => l.replace(/^C\d+ /, ''));
    assert.ok(cmds.includes('SELECT "[Gmail]/Messages envoy&AOk-s"'));
    assert.ok(cmds.includes('UID SEARCH HEADER Message-ID "<m1@claire>"'));
    assert.ok(cmds.includes('UID MOVE 12 "[Gmail]/Corbeille"'));
    assert.ok(cmds.includes('SELECT "[Gmail]/Corbeille"'));
    assert.ok(cmds.includes('UID STORE 900 +FLAGS.SILENT (\\Deleted)'));
    // UID EXPUNGE, jamais un EXPUNGE global qui viderait d'autres messages de la corbeille.
    assert.ok(cmds.includes('UID EXPUNGE 900'));
    assert.ok(!cmds.includes('EXPUNGE'));
  } finally { await f.fermer(); }
});

test('relance la recherche quand la copie n\'est pas encore rangée', async () => {
  const f = await fauxServeur({ trouveApres: 2 });
  try {
    const r = await effacerCopiesEnvoyees(GMAIL, ['<m1@claire>'], { creerSocket: f.creerSocket, pauseMs: 0 });
    assert.equal(r.ok, true);
    assert.equal(r.effaces, 1);
  } finally { await f.fermer(); }
});

test('sans COPYUID, retrouve le message dans la corbeille par le même Message-ID', async () => {
  const f = await fauxServeur({ copyuid: false });
  try {
    const r = await effacerCopiesEnvoyees(GMAIL, ['<m1@claire>'], { creerSocket: f.creerSocket, pauseMs: 0 });
    assert.equal(r.ok, true);
    const cmds = f.recu.map((l) => l.replace(/^C\d+ /, ''));
    assert.ok(cmds.includes('UID EXPUNGE 900'));
  } finally { await f.fermer(); }
});

test('message introuvable : rien n\'est déplacé, avertissement explicite', async () => {
  const f = await fauxServeur({ messages: [] });
  try {
    const r = await effacerCopiesEnvoyees(GMAIL, ['<absent@claire>'], { creerSocket: f.creerSocket, pauseMs: 0 });
    assert.equal(r.ok, false);
    assert.equal(r.introuvables, 1);
    assert.match(r.erreur, /introuvable/);
    assert.ok(!f.recu.some((l) => / UID MOVE /.test(l)));
  } finally { await f.fermer(); }
});

test('connexion refusée : erreur lisible, jamais le mot de passe dans le message', async () => {
  const f = await fauxServeur({ loginOk: false });
  try {
    const r = await effacerCopiesEnvoyees(GMAIL, ['<m1@claire>'], { creerSocket: f.creerSocket, pauseMs: 0 });
    assert.equal(r.ok, false);
    assert.match(r.erreur, /AUTHENTICATIONFAILED/);
    assert.ok(!r.erreur.includes(GMAIL.smtpMotDePasse));
  } finally { await f.fermer(); }
});

test('compte ou mot de passe manquant : pas de connexion, erreur explicite', async () => {
  const r = await effacerCopiesEnvoyees({ smtpHote: 'smtp.gmail.com' }, ['<m1@claire>'], {
    creerSocket: () => { throw new Error('ne doit pas être appelé'); }
  });
  assert.equal(r.ok, false);
  assert.match(r.erreur, /mot de passe/);
});
