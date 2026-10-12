// Relais CLAIRE d'un poste (étude 12/10 : « l'antivirus bloque le relais Word » — l'ouverture du .vbs était bloquée).
//
// Remplace l'installateur .vbs qui écrivait un script PowerShell (server/src/relaisWord.js avant 0.221.1) : un vrai programme,
// compilé avec CLAIRE (server/scripts/build-windows-exe.mjs, mcs), téléchargé depuis CLAIRE avec la configuration du poste
// ajoutée à la fin du fichier (adresse du serveur, collaborateur, jeton, profil du navigateur — voir executableRelaisAvecConfig).
//
//  - Lancé sans argument (depuis Téléchargements) : il s'installe — copie dans %LOCALAPPDATA%\CLAIRE\CLAIRE-relais.exe, arrêt
//    d'un relais déjà lancé (et de l'ancien relais PowerShell), démarrage à l'ouverture de session (clé Run de HKCU), lancement
//    en arrière-plan, message de confirmation. Aucun droit d'administrateur.
//  - Lancé avec --fond : une seule copie à la fois (mutex) ; toutes les 0,5 s, le paragraphe de Word où se trouve le curseur
//    (COM) et son intitulé, envoyés au serveur quand ils changent, battement chaque seconde ; la réponse porte les insertions
//    demandées depuis CLAIRE (« Insérer dans Word ») et les sonneries 3CX du poste (fenêtre CLAIRE au premier plan pour un
//    appelant d'un dossier, sinon la fenêtre d'avant la sonnerie).
// Aucune frappe simulée : le premier plan passe par AttachThreadInput. Rien n'est écrit sur le disque hors de son installation.

using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Management;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using Microsoft.Win32;

static class RelaisClaire
{
    const string MARQUE = "#CLAIRE-RELAIS#";
    const string FIN = "#FIN#";
    const string TITRE = "CLAIRE";

    static string url = "", poste = "", jeton = "", profil = "Claire";

    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int MessageBoxW(IntPtr h, string texte, string titre, uint type);
    delegate bool Rappel(IntPtr h, IntPtr p);
    [DllImport("user32.dll")] static extern bool EnumWindows(Rappel r, IntPtr p);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int c);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr pid);
    [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool attacher);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();

    [STAThread]
    static int Main(string[] args)
    {
        string soi = System.Reflection.Assembly.GetEntryAssembly().Location;
        bool lisible = LireConfig(soi);
        // --verifier : configuration lue et un relevé envoyé au serveur, résultat écrit sur la sortie (contrôle de la
        // construction et de l'installation ; jamais le jeton).
        if (Array.IndexOf(args, "--verifier") >= 0)
        {
            if (!lisible) { Console.WriteLine("configuration illisible"); return 2; }
            try
            {
                Dictionary<string, object> corps = new Dictionary<string, object>();
                corps["poste"] = poste; corps["jeton"] = jeton; corps["word"] = false; corps["inchange"] = false;
                corps["titre"] = ""; corps["paragraphe"] = ""; corps["resultats"] = new object[0]; corps["appels"] = 1;
                Console.WriteLine("ok " + url + " " + poste + " " + Poster(url + "api/relais-word/releve", new JavaScriptSerializer().Serialize(corps)));
                return 0;
            }
            catch (Exception e) { Console.WriteLine("serveur : " + e.Message); return 3; }
        }
        if (!lisible)
        {
            MessageBoxW(IntPtr.Zero, "Ce programme se telecharge depuis CLAIRE (Reglages, Telephonie 3CX, ou Aide a la redaction) : il porte la configuration de votre poste.", TITRE, 0x30);
            return 1;
        }
        bool fond = false;
        foreach (string a in args) if (a == "--fond") fond = true;
        if (!fond) return Installer(soi);
        bool cree;
        using (Mutex mutex = new Mutex(true, "Local\\CLAIRE-relais", out cree))
        {
            if (!cree) return 0;
            Boucle();
        }
        return 0;
    }

    // ---- Configuration ajoutée à la fin du programme par le serveur ----
    static bool LireConfig(string chemin)
    {
        try
        {
            byte[] octets = File.ReadAllBytes(chemin);
            int lire = Math.Min(octets.Length, 8192);
            string fin = Encoding.ASCII.GetString(octets, octets.Length - lire, lire);
            int i = fin.LastIndexOf(MARQUE);
            int j = fin.LastIndexOf(FIN);
            if (i < 0 || j < i) return false;
            string b64 = fin.Substring(i + MARQUE.Length, j - i - MARQUE.Length);
            string json = Encoding.UTF8.GetString(Convert.FromBase64String(b64));
            Dictionary<string, object> cfg = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(json);
            url = Texte(cfg, "url"); poste = Texte(cfg, "poste"); jeton = Texte(cfg, "jeton");
            string p = Texte(cfg, "profil"); if (p != "") profil = p;
            return url.StartsWith("http") && poste != "" && jeton != "";
        }
        catch { return false; }
    }

    static string Texte(IDictionary d, string cle)
    {
        return d != null && d.Contains(cle) && d[cle] != null ? Convert.ToString(d[cle]) : "";
    }

    // ---- Installation ----
    static int Installer(string soi)
    {
        try
        {
            string dossier = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CLAIRE");
            Directory.CreateDirectory(dossier);
            string cible = Path.Combine(dossier, "CLAIRE-relais.exe");
            int moi = Process.GetCurrentProcess().Id;
            foreach (Process p in Process.GetProcessesByName("CLAIRE-relais"))
            {
                if (p.Id == moi) continue;
                try { p.Kill(); p.WaitForExit(3000); } catch { }
            }
            ArreterAncienRelaisPowerShell();
            if (!String.Equals(Path.GetFullPath(soi), Path.GetFullPath(cible), StringComparison.OrdinalIgnoreCase))
                File.Copy(soi, cible, true);
            using (RegistryKey run = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run"))
            {
                run.SetValue("CLAIRE-relais", "\"" + cible + "\" --fond");
                try { run.DeleteValue("CLAIRE-Word", false); } catch { }
            }
            Process.Start(new ProcessStartInfo(cible, "--fond") { UseShellExecute = false, CreateNoWindow = true });
            MessageBoxW(IntPtr.Zero, "Le relais CLAIRE de ce poste est installe :\n"
                + "- l'Aide a la redaction suit le paragraphe ou se trouve le curseur de Word ;\n"
                + "- a chaque appel 3CX, la fenetre CLAIRE passe au premier plan si l'appelant a un dossier, sinon la fenetre d'avant revient.\n\n"
                + "Il demarre seul a chaque ouverture de session.", TITRE, 0x40);
            return 0;
        }
        catch (Exception e)
        {
            MessageBoxW(IntPtr.Zero, "Installation impossible : " + e.Message, TITRE, 0x10);
            return 1;
        }
    }

    // Relais d'avant (script PowerShell lancé par un .vbs, 0.219.0 – 0.221.0) : arrêté et retiré.
    static void ArreterAncienRelaisPowerShell()
    {
        try
        {
            using (ManagementObjectSearcher s = new ManagementObjectSearcher("select ProcessId from Win32_Process where Name='powershell.exe' and CommandLine like '%word-claire.ps1%'"))
                foreach (ManagementObject o in s.Get())
                    try { Process.GetProcessById(Convert.ToInt32(o["ProcessId"])).Kill(); } catch { }
        }
        catch { }
        string ancien = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "CLAIRE");
        foreach (string f in new[] { "word-claire.ps1", "word-claire.vbs" })
            try { File.Delete(Path.Combine(ancien, f)); } catch { }
    }

    // ---- Fenêtres ----
    static IntPtr TrouverClaire()
    {
        IntPtr trouve = IntPtr.Zero;
        EnumWindows(delegate (IntPtr h, IntPtr p)
        {
            if (!IsWindowVisible(h)) return true;
            StringBuilder sb = new StringBuilder(512);
            GetWindowText(h, sb, 512);
            string t = sb.ToString();
            // « CLAIRE — » (tiret cadratin) sans nom de navigateur : la fenêtre « application », jamais un onglet ni un dossier.
            if (t.StartsWith("CLAIRE —") && t.IndexOf("Google Chrome") < 0 && t.IndexOf("Microsoft") < 0 && t.IndexOf("Firefox") < 0) { trouve = h; return false; }
            return true;
        }, IntPtr.Zero);
        return trouve;
    }

    static void Montrer(IntPtr h)
    {
        if (h == IntPtr.Zero || !IsWindow(h)) return;
        IntPtr devant = GetForegroundWindow();
        if (devant == h) return;
        if (IsIconic(h)) ShowWindow(h, 9);
        uint lui = GetWindowThreadProcessId(devant, IntPtr.Zero);
        uint moi = GetCurrentThreadId();
        bool attache = lui != 0 && lui != moi && AttachThreadInput(moi, lui, true);
        BringWindowToTop(h);
        SetForegroundWindow(h);
        if (attache) AttachThreadInput(moi, lui, false);
    }

    // ---- Boucle ----
    struct Echantillon { public DateTime t; public IntPtr h; }
    static readonly List<Echantillon> historique = new List<Echantillon>();

    static void Boucle()
    {
        string dernier = null;
        List<object> resultats = new List<object>();
        DateTime envoi = DateTime.MinValue;
        int refus = 0;
        JavaScriptSerializer json = new JavaScriptSerializer();
        while (true)
        {
            historique.Add(new Echantillon { t = DateTime.Now, h = GetForegroundWindow() });
            while (historique.Count > 40) historique.RemoveAt(0);
            object wordObj = null;
            bool avecDoc = false;
            string titre = "", para = "";
            try { wordObj = Marshal.GetActiveObject("Word.Application"); } catch { wordObj = null; }
            if (wordObj != null)
            {
                try
                {
                    dynamic word = wordObj;
                    if ((int)word.Documents.Count > 0)
                    {
                        avecDoc = true;
                        dynamic p = word.Selection.Paragraphs.Item(1);
                        para = Convert.ToString(p.Range.Text) ?? "";
                        for (int i = 0; i < 15; i++)
                        {
                            p = p.Previous();
                            if (p == null) break;
                            string t = Normaliser(Convert.ToString(p.Range.Text));
                            if (t.Length > 0 && t.Length <= 90 && t.IndexOf("---") < 0) { titre = t; break; }
                        }
                    }
                }
                catch { }
            }
            if (para.Length > 4000) para = para.Substring(0, 4000);
            string cle = titre + "|" + para;
            bool inchange = cle == dernier;
            DateTime maintenant = DateTime.Now;
            if (!inchange || resultats.Count > 0 || (maintenant - envoi).TotalSeconds >= 1)
            {
                Dictionary<string, object> corps = new Dictionary<string, object>();
                corps["poste"] = poste; corps["jeton"] = jeton; corps["word"] = avecDoc; corps["inchange"] = inchange;
                corps["resultats"] = resultats.ToArray(); corps["appels"] = 1;
                if (!inchange) { corps["titre"] = titre; corps["paragraphe"] = para; }
                try
                {
                    string reponse = Poster(url + "api/relais-word/releve", json.Serialize(corps));
                    dernier = cle; refus = 0; resultats.Clear(); envoi = maintenant;
                    Dictionary<string, object> rep = json.Deserialize<Dictionary<string, object>>(reponse);
                    foreach (object c in Liste(rep, "commandes")) resultats.Add(Inserer(wordObj, c as Dictionary<string, object>));
                    if (rep != null && rep.ContainsKey("renvoyer") && Equals(rep["renvoyer"], true)) dernier = null;
                    foreach (object a in Liste(rep, "appels")) Appel(a as Dictionary<string, object>);
                }
                catch (WebException e)
                {
                    HttpWebResponse r = e.Response as HttpWebResponse;
                    // Jeton refusé (relais réinstallé ailleurs ou retiré) : on ralentit, puis on s'arrête.
                    if (r != null && r.StatusCode == HttpStatusCode.Forbidden) { refus++; if (refus >= 10) return; Thread.Sleep(30000); }
                }
                catch { }
            }
            if (wordObj != null)
            {
                try { Marshal.ReleaseComObject(wordObj); } catch { }
                wordObj = null;
                GC.Collect();
                GC.WaitForPendingFinalizers();
            }
            Thread.Sleep(500);
        }
    }

    static IEnumerable Liste(Dictionary<string, object> d, string cle)
    {
        if (d == null || !d.ContainsKey(cle) || d[cle] == null) return new object[0];
        IEnumerable e = d[cle] as IEnumerable;
        return e != null && !(d[cle] is string) ? e : new object[] { d[cle] };
    }

    static string Poster(string adresse, string corps)
    {
        HttpWebRequest req = (HttpWebRequest)WebRequest.Create(adresse);
        req.Method = "POST";
        req.ContentType = "application/json; charset=utf-8";
        req.Timeout = 5000;
        req.ReadWriteTimeout = 5000;
        req.Proxy = null; // serveur du réseau du bureau : jamais par un proxy
        byte[] octets = Encoding.UTF8.GetBytes(corps);
        req.ContentLength = octets.Length;
        using (Stream s = req.GetRequestStream()) s.Write(octets, 0, octets.Length);
        using (HttpWebResponse r = (HttpWebResponse)req.GetResponse())
        using (StreamReader lecteur = new StreamReader(r.GetResponseStream(), Encoding.UTF8))
            return lecteur.ReadToEnd();
    }

    static string Normaliser(string s)
    {
        return Regex.Replace(s ?? "", @"[\s\x00-\x1f]+", " ").Trim();
    }

    // ---- « Insérer dans Word » : le n-ième « --- » du paragraphe, repéré sur son TEXTE (même compte que le poste, /-{3,}/),
    // la plage contrôlée avant d'écrire (un champ ou un texte masqué décale les positions : rien n'est écrit). ----
    static Dictionary<string, object> Inserer(object wordObj, Dictionary<string, object> c)
    {
        Dictionary<string, object> r = new Dictionary<string, object>();
        r["id"] = Texte(c, "id"); r["ok"] = false;
        try
        {
            if (wordObj == null) { r["message"] = "Word n est pas ouvert."; return r; }
            dynamic word = wordObj;
            if ((int)word.Documents.Count == 0) { r["message"] = "Word n est pas ouvert."; return r; }
            dynamic pr = word.Selection.Paragraphs.Item(1).Range;
            string txt = Convert.ToString(pr.Text) ?? "";
            if (Normaliser(txt) != Normaliser(Texte(c, "attendu"))) { r["message"] = "Le curseur n est plus dans ce paragraphe."; return r; }
            if (txt.Length > 4000) { r["message"] = "Paragraphe trop long : copiez la valeur."; return r; }
            MatchCollection ms = Regex.Matches(txt, "-{3,}");
            int k = Convert.ToInt32(c["occurrence"]);
            if (k < 0 || k >= ms.Count) { r["message"] = "Blanc introuvable dans le paragraphe."; return r; }
            Match m = ms[k];
            int debut = (int)pr.Start + m.Index;
            dynamic plage = pr.Document.Range(debut, debut + m.Length);
            if (Convert.ToString(plage.Text) != m.Value) { r["message"] = "Blanc introuvable a sa place (champ ou texte masque) : copiez la valeur."; return r; }
            plage.Text = Texte(c, "valeur");
            r["ok"] = true;
            r.Remove("message");
        }
        catch { r["message"] = "Word a refuse l insertion."; }
        return r;
    }

    // ---- Sonnerie 3CX : l'onglet de 3CX se ferme seul ; appelant d'un dossier → fenêtre CLAIRE devant (ouverte sur l'appel si
    // elle était fermée) ; sinon la dernière fenêtre au premier plan avant la sonnerie revient. ----
    static void Appel(Dictionary<string, object> a)
    {
        if (a == null) return;
        double ilYa = 0;
        try { ilYa = Convert.ToDouble(a["ilYaMs"]); } catch { }
        // L'onglet de 3CX passe devant AVANT que sa requête n'atteigne le serveur : marge de 1,5 s.
        DateTime quand = DateTime.Now.AddMilliseconds(-ilYa - 1500);
        if (ilYa < 1200) Thread.Sleep((int)(1200 - ilYa));
        bool dossier = a.ContainsKey("dossier") && Equals(a["dossier"], true);
        if (dossier)
        {
            IntPtr h = TrouverClaire();
            if (h != IntPtr.Zero) { Montrer(h); Thread.Sleep(600); Montrer(h); return; }
            string id = Regex.Replace(Texte(a, "id"), "[^A-Za-z0-9_-]", "");
            string adresse = url + "#appel=" + id;
            string navigateur = Navigateur();
            try
            {
                if (navigateur != "") Process.Start(navigateur, "--profile-directory=\"" + profil + "\" --app=\"" + adresse + "\"");
                else Process.Start(adresse);
            }
            catch { }
            // La nouvelle fenêtre, créée par le navigateur déjà lancé, est ramenée devant dès qu'elle paraît (3 s au plus).
            for (int i = 0; i < 15; i++) { Thread.Sleep(200); h = TrouverClaire(); if (h != IntPtr.Zero) { Montrer(h); break; } }
            return;
        }
        IntPtr devant = GetForegroundWindow();
        IntPtr avant = IntPtr.Zero;
        for (int i = historique.Count - 1; i >= 0; i--)
        {
            Echantillon e = historique[i];
            if (e.t < quand && e.h != IntPtr.Zero && e.h != devant) { avant = e.h; break; }
        }
        if (avant != IntPtr.Zero) { Montrer(avant); Thread.Sleep(600); Montrer(avant); }
    }

    static string Navigateur()
    {
        string[] candidats = {
            Environment.GetEnvironmentVariable("ProgramFiles") + @"\Google\Chrome\Application\chrome.exe",
            Environment.GetEnvironmentVariable("ProgramFiles(x86)") + @"\Google\Chrome\Application\chrome.exe",
            Environment.GetEnvironmentVariable("LOCALAPPDATA") + @"\Google\Chrome\Application\chrome.exe",
            Environment.GetEnvironmentVariable("ProgramFiles") + @"\Microsoft\Edge\Application\msedge.exe",
            Environment.GetEnvironmentVariable("ProgramFiles(x86)") + @"\Microsoft\Edge\Application\msedge.exe"
        };
        foreach (string c in candidats) if (File.Exists(c)) return c;
        return "";
    }
}
