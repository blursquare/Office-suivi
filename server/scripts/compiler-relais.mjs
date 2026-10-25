// Compile le relais CLAIRE des postes (server/relais/CLAIRE-relais.cs) en server/relais/CLAIRE-relais.exe, gardé dans le dépôt.
//
// Le programme est le MÊME pour tous les postes et d'une version de CLAIRE à l'autre (étude 12/10 : Panda Endpoint Protection le
// mettait en quarantaine ; l'exclusion se fait par empreinte). À relancer seulement quand le .cs change — `mcs` (Mono) requis,
// l'icône de CLAIRE prise dans build/icone.ico s'il existe (construit par build:exe). L'empreinte du .cs compilé est écrite à
// côté (CLAIRE-relais.source.sha256) : le test du relais refuse un .exe qui ne correspond plus à son .cs. Une nouvelle
// compilation change l'empreinte du .exe : la redonner pour l'exclusion de l'antivirus (relais/LISEZMOI.md).
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(SERVER_DIR, 'relais', 'CLAIRE-relais.cs');
const sortie = path.join(SERVER_DIR, 'relais', 'CLAIRE-relais.exe');
const icone = path.join(SERVER_DIR, 'build', 'icone.ico');
execFileSync('mcs', ['-target:winexe', '-sdk:4.5', '-optimize+', '-nologo', `-out:${sortie}`,
  '-r:System.Web.Extensions.dll', '-r:System.Core.dll', '-r:System.Windows.Forms.dll', '-r:System.Drawing.dll', '-r:Microsoft.VisualBasic.dll',
  ...(fs.existsSync(icone) ? [`-win32icon:${icone}`] : []), source], { stdio: 'inherit' });
const empreinteSource = crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
fs.writeFileSync(path.join(SERVER_DIR, 'relais', 'CLAIRE-relais.source.sha256'), empreinteSource + '\n');
console.log('CLAIRE-relais.exe SHA-256 :', crypto.createHash('sha256').update(fs.readFileSync(sortie)).digest('hex'));
