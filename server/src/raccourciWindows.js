// Icône nette de la fenêtre CLAIRE dans la barre des tâches de Windows (29/09).
//
// Le serveur ouvre CLAIRE dans une fenêtre Chrome « --app » non installée : Chrome donne alors à
// Windows l'icône de l'onglet (16 px), que la barre des tâches agrandit — floue quel que soit le
// dessin (constaté par l'étude après plusieurs essais). Mais la barre des tâches préfère l'icône
// d'un RACCOURCI du menu Démarrer qui porte le même identifiant d'application (AppUserModelID) que
// la fenêtre. Le serveur crée donc « CLAIRE.lnk » dans le menu Démarrer de l'utilisateur, avec
// l'icône haute définition de CLAIRE-serveur.exe et l'identifiant exact que Chrome donne à cette
// fenêtre, recalculé ici d'après le code source de Chrome :
//   GetAppUserModelIdForApp (chrome/browser/shell_integration_win.cc) = base_app_id (« Chrome »)
//   + nom d'application (GenerateApplicationNameFromURL : hôte + "_" + chemin, « localhost_/ »)
//   + identifiant de profil (nom du dossier User Data + "." + profil, lettres/chiffres/points
//   seulement : « UserData.ClaireServeur »), chaque composant raccourci au milieu pour tenir en
//   64 caractères au total (ShellUtil::BuildAppUserModelId, chrome/installer/util/shell_util.cc).
'use strict';

const LONGUEUR_MAX_AUMID = 64;

// ShellUtil::BuildAppUserModelId. Pure.
function construireAppUserModelId(composants) {
  const disponibles = LONGUEUR_MAX_AUMID - (composants.length - 1);
  const max = Math.floor(disponibles / composants.length);
  return composants.map((c) => (c.length > max
    ? c.slice(0, Math.floor(max / 2)) + c.slice(c.length - Math.floor((max + 1) / 2))
    : c)).join('.').replace(/ /g, '_');
}

// Identifiant de la fenêtre « --app=<url> » ouverte dans le profil `profil` du dossier de données
// `dossierDonnees` (« User Data »). `baseAppId` : « Chrome » (Chrome stable), « MSEdge » (Edge).
// Pure.
function appUserModelIdFenetreApp({ baseAppId, url, dossierDonnees, profil }) {
  const u = new URL(url);
  const nomApp = `${u.hostname}_${u.pathname}`;
  const idProfil = profil && profil !== 'Default'
    ? `${dossierDonnees}.${profil}`.replace(/[^A-Za-z0-9.]/g, '')
    : '';
  return construireAppUserModelId([baseAppId, nomApp].concat(idProfil ? [idProfil] : []));
}

function baseAppIdNavigateur(cheminNavigateur) {
  return /msedge\.exe$/i.test(String(cheminNavigateur || '')) ? 'MSEdge' : 'Chrome';
}

// Chaîne PowerShell entre apostrophes. Pure.
function psTexte(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

// Script PowerShell qui crée (ou remplace) le raccourci avec son AppUserModelID — propriété que
// WScript.Shell ne sait pas poser, d'où l'appel COM (IShellLinkW + IPropertyStore). Pure.
function scriptPowerShellRaccourci({ chemin, cible, argumentsLigne, icone, aumid, description }) {
  return `$ErrorActionPreference = 'Stop'
$code = @"
using System;
using System.Runtime.InteropServices;
using System.Text;
[ComImport, Guid("000214F9-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IShellLinkW {
  void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder f, int c, IntPtr d, uint fl);
  void GetIDList(out IntPtr p); void SetIDList(IntPtr p);
  void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder n, int c);
  void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string n);
  void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder d, int c);
  void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string d);
  void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder a, int c);
  void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string a);
  void GetHotkey(out short h); void SetHotkey(short h);
  void GetShowCmd(out int s); void SetShowCmd(int s);
  void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder p, int c, out int i);
  void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string p, int i);
  void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string p, uint r);
  void Resolve(IntPtr h, uint f);
  void SetPath([MarshalAs(UnmanagedType.LPWStr)] string f);
}
[ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IPropertyStore {
  void GetCount(out uint c); void GetAt(uint i, out ClairePropertyKey k);
  void GetValue(ref ClairePropertyKey k, out ClairePropVariant v);
  void SetValue(ref ClairePropertyKey k, ref ClairePropVariant v); void Commit();
}
[ComImport, Guid("0000010b-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IPersistFileClaire {
  void GetClassID(out Guid c); [PreserveSig] int IsDirty();
  void Load([MarshalAs(UnmanagedType.LPWStr)] string f, uint m);
  void Save([MarshalAs(UnmanagedType.LPWStr)] string f, bool r);
  void SaveCompleted([MarshalAs(UnmanagedType.LPWStr)] string f);
  void GetCurFile([MarshalAs(UnmanagedType.LPWStr)] out string f);
}
[StructLayout(LayoutKind.Sequential, Pack = 4)] public struct ClairePropertyKey { public Guid fmtid; public uint pid; }
[StructLayout(LayoutKind.Explicit, Size = 24)] public struct ClairePropVariant { [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public IntPtr p; }
[ComImport, Guid("00021401-0000-0000-C000-000000000046")] public class ClaireShellLink {}
public static class ClaireRaccourci {
  public static void Creer(string lnk, string cible, string args, string icone, string aumid, string desc) {
    IShellLinkW l = (IShellLinkW)new ClaireShellLink();
    l.SetPath(cible); l.SetArguments(args); l.SetIconLocation(icone, 0); l.SetDescription(desc);
    IPropertyStore ps = (IPropertyStore)l;
    ClairePropertyKey k = new ClairePropertyKey();
    k.fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"); k.pid = 5;
    ClairePropVariant v = new ClairePropVariant(); v.vt = 31; v.p = Marshal.StringToCoTaskMemUni(aumid);
    try { ps.SetValue(ref k, ref v); ps.Commit(); } finally { Marshal.FreeCoTaskMem(v.p); }
    ((IPersistFileClaire)l).Save(lnk, true);
  }
}
"@
Add-Type -TypeDefinition $code
[ClaireRaccourci]::Creer(${psTexte(chemin)}, ${psTexte(cible)}, ${psTexte(argumentsLigne)}, ${psTexte(icone)}, ${psTexte(aumid)}, ${psTexte(description)})
`;
}

module.exports = {
  construireAppUserModelId, appUserModelIdFenetreApp, baseAppIdNavigateur, scriptPowerShellRaccourci
};
