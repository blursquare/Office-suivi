// Relais CLAIRE d'un poste (étude 12/10 : « l'antivirus bloque le relais Word » — l'ouverture du .vbs était bloquée).
//
// Remplace l'installateur .vbs qui écrivait un script PowerShell (server/src/relaisWord.js avant 0.221.1) : un vrai programme,
// compilé une fois et gardé dans le dépôt (server/relais/CLAIRE-relais.exe, même fichier pour tous les postes : une exclusion de
// l'antivirus par empreinte vaut pour tous — voir server/relais/LISEZMOI.md), téléchargé depuis CLAIRE ; la configuration du
// poste arrive par un code copié par CLAIRE (voir « Configuration du poste »).
//
//  - Lancé sans argument (depuis Téléchargements) : il lit le code (presse-papiers, sinon demandé), le vérifie auprès du serveur,
//    puis s'installe — configuration dans relais.json, copie dans %LOCALAPPDATA%\CLAIRE\CLAIRE-relais.exe, arrêt
//    d'un relais déjà lancé (et de l'ancien relais PowerShell), démarrage à l'ouverture de session (clé Run de HKCU), lancement
//    en arrière-plan, message de confirmation. Aucun droit d'administrateur.
//  - Lancé avec --fond : une seule copie à la fois (mutex) ; toutes les 0,5 s, le paragraphe de Word où se trouve le curseur
//    (COM) et son intitulé, envoyés au serveur quand ils changent, battement chaque seconde ; la réponse porte les insertions
//    demandées depuis CLAIRE (« Insérer dans Word ») et les sonneries 3CX du poste (fenêtre CLAIRE au premier plan pour un
//    appelant d'un dossier, sinon la fenêtre d'avant la sonnerie), et le compteur de la pastille et les nouveautés du collaborateur
//    (étude 25/10 : « des notifications pastille sur l'app ») — rond rouge et nombre en haut à droite de l'icône de la fenêtre CLAIRE
//    (WM_SETICON), carte de notification sombre en bas à droite (1.2 : répondre, ouvrir, comme Teams ; icône CLAIRE dans la zone de
//    notification), sans clignotement.
// Aucune frappe simulée : le premier plan passe par AttachThreadInput. Rien n'est écrit sur le disque hors de son installation.

using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using Microsoft.Win32;

// Propriétés du fichier (Windows › Propriétés › Détails) : un programme qui dit ce qu'il est.
[assembly: System.Reflection.AssemblyTitle("Relais CLAIRE du poste")]
[assembly: System.Reflection.AssemblyDescription("Relais CLAIRE du poste : appels 3CX, pastille et notifications de CLAIRE")]
[assembly: System.Reflection.AssemblyCompany("Etude de Maitre Sophie GOSSART")]
[assembly: System.Reflection.AssemblyProduct("CLAIRE")]
[assembly: System.Reflection.AssemblyVersion("1.2.0.0")]
[assembly: System.Reflection.AssemblyFileVersion("1.2.0.0")]

// ---- Pastille et notifications (étude 25/10) : un fil à part, avec sa boucle de messages (la zone de notification et la barre des
// tâches l'exigent) ; la boucle du relais lui passe le compteur et les nouveautés par BeginInvoke. ----
static class PastilleWindows
{
    [DllImport("user32.dll")] static extern bool DestroyIcon(IntPtr h);
    [DllImport("user32.dll")] static extern IntPtr SendMessageW(IntPtr h, int message, IntPtr w, IntPtr l);

    static System.Windows.Forms.Control porte;
    static System.Windows.Forms.NotifyIcon zone;
    static IntPtr fenetre = IntPtr.Zero, grandePosee = IntPtr.Zero, petitePosee = IntPtr.Zero;
    static System.Drawing.Bitmap iconeClaire;
    static int voulu = 0, pose = -1;
    static DateTime poseLe = DateTime.MinValue;

    public static void Demarrer()
    {
        Thread t = new Thread(delegate ()
        {
            try
            {
                System.Windows.Forms.Application.SetUnhandledExceptionMode(System.Windows.Forms.UnhandledExceptionMode.CatchException);
                System.Windows.Forms.Application.ThreadException += delegate { };
                porte = new System.Windows.Forms.Control();
                porte.CreateControl();
                IntPtr forcer = porte.Handle;
                zone = new System.Windows.Forms.NotifyIcon();
                try { zone.Icon = System.Drawing.Icon.ExtractAssociatedIcon(System.Reflection.Assembly.GetEntryAssembly().Location); } catch { zone.Icon = System.Drawing.SystemIcons.Information; }
                zone.Text = "CLAIRE";
                zone.Visible = true;
                zone.MouseClick += delegate (object o, System.Windows.Forms.MouseEventArgs e) { if (e.Button == System.Windows.Forms.MouseButtons.Left) RelaisClaire.MontrerClaire(); };
                zone.BalloonTipClicked += delegate { RelaisClaire.MontrerClaire(); };
                System.Windows.Forms.Application.Run();
            }
            catch { }
        });
        t.IsBackground = true;
        t.SetApartmentState(ApartmentState.STA);
        t.Start();
    }

    static void SurLeFil(System.Windows.Forms.MethodInvoker m)
    {
        // Une erreur de dessin ou de la barre des tâches ne remonte jamais dans la boucle de messages (pas de boîte « exception non gérée »).
        System.Windows.Forms.MethodInvoker sur = delegate { try { m(); } catch { } };
        try { if (porte != null && porte.IsHandleCreated) porte.BeginInvoke(sur); } catch { }
    }

    // Appelé à chaque relevé (une seconde). Étude 25/10 : « la pastille de l'icône en haut à droite » — la pastille de Windows
    // (SetOverlayIcon) est toujours posée en bas à droite ; l'icône de la fenêtre CLAIRE est donc REMPLACÉE (WM_SETICON) par celle de
    // CLAIRE avec un rond rouge et le nombre en haut à droite. Reposée quand le nombre change, quand la fenêtre change (rouverte) et
    // toutes les 15 s (le navigateur remet son icône quand il redessine la page).
    public static void Mettre(int n)
    {
        SurLeFil(delegate
        {
            voulu = Math.Max(0, Math.Min(n, 999));
            IntPtr h = RelaisClaire.TrouverClaire();
            if (zone != null) zone.Text = voulu > 0 ? "CLAIRE — " + voulu + " à voir" : "CLAIRE";
            if (h == IntPtr.Zero) { fenetre = IntPtr.Zero; return; }
            if (h == fenetre && voulu == pose && (DateTime.Now - poseLe).TotalSeconds < 15) return;
            IntPtr grande = IconePour(voulu, 32), petite = IconePour(voulu, 16);
            if (grande == IntPtr.Zero || petite == IntPtr.Zero) return;
            SendMessageW(h, 0x80, (IntPtr)1, grande);  // WM_SETICON, ICON_BIG (barre des tâches)
            SendMessageW(h, 0x80, (IntPtr)0, petite);  // ICON_SMALL (titre de la fenêtre)
            if (grandePosee != IntPtr.Zero) DestroyIcon(grandePosee);
            if (petitePosee != IntPtr.Zero) DestroyIcon(petitePosee);
            grandePosee = grande; petitePosee = petite; fenetre = h; pose = voulu; poseLe = DateTime.Now;
        });
    }

    // Les nouveautés (0.350.0, « comme Teams ») : une carte CLAIRE par nouveauté en bas à droite de l'écran, par-dessus le travail en
    // cours, sans lui prendre la main ; trois au plus empilées. Pas de clignotement du bouton (étude 25/10).
    public static void Notifier(List<Dictionary<string, object>> nouvelles)
    {
        if (nouvelles.Count == 0) return;
        SurLeFil(delegate
        {
            foreach (Dictionary<string, object> n in nouvelles) CarteNotification.Montrer(n);
        });
    }

    // L'icône de CLAIRE (celle du programme) avec, en haut à droite, un rond rouge et le nombre (9+ au-delà ; un simple point en 16 px).
    static IntPtr IconePour(int n, int taille)
    {
        try
        {
            if (iconeClaire == null)
                using (System.Drawing.Icon i = System.Drawing.Icon.ExtractAssociatedIcon(System.Reflection.Assembly.GetEntryAssembly().Location)) iconeClaire = i.ToBitmap();
            using (System.Drawing.Bitmap b = new System.Drawing.Bitmap(taille, taille))
            using (System.Drawing.Graphics g = System.Drawing.Graphics.FromImage(b))
            {
                g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
                g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
                g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                g.Clear(System.Drawing.Color.Transparent);
                g.DrawImage(iconeClaire, 0, 0, taille, taille);
                if (n > 0)
                {
                    int d = taille >= 32 ? 18 : 8;
                    using (System.Drawing.SolidBrush rouge = new System.Drawing.SolidBrush(System.Drawing.Color.FromArgb(220, 38, 38))) g.FillEllipse(rouge, taille - d, 0, d - 1, d - 1);
                    if (taille >= 32)
                    {
                        string t = n > 9 ? "9+" : n.ToString();
                        using (System.Drawing.Font f = new System.Drawing.Font("Segoe UI", t.Length > 1 ? 9f : 11f, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Pixel))
                        using (System.Drawing.StringFormat sf = new System.Drawing.StringFormat())
                        {
                            sf.Alignment = System.Drawing.StringAlignment.Center; sf.LineAlignment = System.Drawing.StringAlignment.Center;
                            g.DrawString(t, f, System.Drawing.Brushes.White, new System.Drawing.RectangleF(taille - d, 0, d - 1, d - 1), sf);
                        }
                    }
                }
                return b.GetHicon();
            }
        }
        catch { return IntPtr.Zero; }
    }
}

// ---- La carte d'une nouveauté (0.350.0), sur le modèle des notifications de Teams (étude 25/10, capture d'exemple) : carte pleine à
// la couleur de CLAIRE (bordeaux, jamais en clair), grand avatar rond (photo de profil du collaborateur, sinon ses initiales ; l'icône
// de CLAIRE pour CLAIRE), nom en gras, canal et heure, début du message, « ↩ Répondre » qui ouvre le champ (Entrée pour envoyer) ; un clic
// sur la carte ouvre CLAIRE. Se retire seule au bout de quelques secondes, sauf souris dessus ou frappe. Le texte vient du serveur.
class CarteNotification : System.Windows.Forms.Form
{
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr SendMessageW(IntPtr h, int message, IntPtr w, string l);
    static readonly List<CarteNotification> ouvertes = new List<CarteNotification>();
    static readonly System.Drawing.Color FOND = System.Drawing.Color.FromArgb(91, 30, 43);        // bordeaux de CLAIRE, assombri
    static readonly System.Drawing.Color FILET = System.Drawing.Color.FromArgb(122, 52, 67);
    static readonly System.Drawing.Color CHAMP = System.Drawing.Color.FromArgb(68, 21, 31);
    static readonly System.Drawing.Color BLANC = System.Drawing.Color.FromArgb(255, 255, 255);
    static readonly System.Drawing.Color DOUX = System.Drawing.Color.FromArgb(241, 217, 222);     // texte secondaire, rosé
    static readonly System.Drawing.Color PALE = System.Drawing.Color.FromArgb(214, 176, 185);
    const int LARGEUR = 380, MARGE = 18, AVATAR = 52, SECONDES = 6;
    static System.Drawing.Image iconeClaire;

    readonly Dictionary<string, object> n;
    readonly System.Windows.Forms.Timer minuterie = new System.Windows.Forms.Timer();
    System.Windows.Forms.Panel cadre;
    System.Windows.Forms.TextBox saisie;
    System.Windows.Forms.Label repondre, etat;
    int restant = SECONDES;
    bool envoi;

    protected override bool ShowWithoutActivation { get { return true; } }
    protected override System.Windows.Forms.CreateParams CreateParams
    {
        get { System.Windows.Forms.CreateParams cp = base.CreateParams; cp.ExStyle |= 0x80 | 0x8; return cp; } // WS_EX_TOOLWINDOW | WS_EX_TOPMOST
    }

    static string T(Dictionary<string, object> d, string cle) { object v; return d != null && d.TryGetValue(cle, out v) && v != null ? Convert.ToString(v) : ""; }

    public static void Montrer(Dictionary<string, object> n)
    {
        while (ouvertes.Count >= 3) ouvertes[0].Close();
        CarteNotification c = new CarteNotification(n);
        ouvertes.Add(c);
        Ranger();
        c.Show();
    }

    static void Ranger()
    {
        System.Drawing.Rectangle zone = System.Windows.Forms.Screen.PrimaryScreen.WorkingArea;
        int bas = zone.Bottom - 12;
        for (int i = ouvertes.Count - 1; i >= 0; i--)
        {
            CarteNotification c = ouvertes[i];
            c.Location = new System.Drawing.Point(zone.Right - LARGEUR - 12, bas - c.Height);
            bas -= c.Height + 6;
        }
    }

    static string Initiales(string nom)
    {
        string[] mots = nom.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
        return mots.Length == 0 ? "?" : mots[0].Substring(0, 1).ToUpperInvariant();
    }

    // L'avatar : photo (JPEG en base64 fourni par le serveur), icône de CLAIRE, sinon initiales sur un rond rosé.
    System.Windows.Forms.Control Avatar(string auteur, string photo)
    {
        System.Drawing.Image image = null;
        try
        {
            if (photo != "") image = System.Drawing.Image.FromStream(new MemoryStream(Convert.FromBase64String(photo)));
            else if (auteur == "CLAIRE")
            {
                if (iconeClaire == null)
                    using (System.Drawing.Icon i = System.Drawing.Icon.ExtractAssociatedIcon(System.Reflection.Assembly.GetEntryAssembly().Location)) iconeClaire = i.ToBitmap();
                image = iconeClaire;
            }
        }
        catch { image = null; }
        System.Windows.Forms.Control c;
        if (image != null)
            c = new System.Windows.Forms.PictureBox { Image = image, SizeMode = System.Windows.Forms.PictureBoxSizeMode.Zoom, BackColor = auteur == "CLAIRE" ? BLANC : FOND };
        else
            c = new System.Windows.Forms.Label { Text = Initiales(auteur), TextAlign = System.Drawing.ContentAlignment.MiddleCenter, BackColor = DOUX, ForeColor = FOND,
                Font = new System.Drawing.Font("Segoe UI", 15f, System.Drawing.FontStyle.Bold), UseMnemonic = false };
        c.Size = new System.Drawing.Size(AVATAR, AVATAR);
        c.Location = new System.Drawing.Point(MARGE, MARGE);
        c.Region = Arrondi(AVATAR, AVATAR, AVATAR / 2);
        return c;
    }

    CarteNotification(Dictionary<string, object> notification)
    {
        n = notification;
        string type = T(n, "type");
        FormBorderStyle = System.Windows.Forms.FormBorderStyle.None;
        ShowInTaskbar = false; TopMost = true; StartPosition = System.Windows.Forms.FormStartPosition.Manual;
        BackColor = FOND; ForeColor = BLANC;
        Font = new System.Drawing.Font("Segoe UI", 10f);
        Width = LARGEUR;
        Cursor = System.Windows.Forms.Cursors.Hand;
        string auteur = type == "message" ? T(n, "auteur") : "CLAIRE";
        Controls.Add(Avatar(auteur, T(n, "photo")));
        System.Windows.Forms.Label croix = new System.Windows.Forms.Label { Text = "✕", ForeColor = DOUX, AutoSize = true, Location = new System.Drawing.Point(LARGEUR - 30, 14), Font = new System.Drawing.Font("Segoe UI", 11f) };
        croix.Click += delegate { Close(); };
        Controls.Add(croix);
        int x = MARGE + AVATAR + 14, large = LARGEUR - x - 40;
        int y = MARGE + 2;
        string nom = type == "message" ? auteur : type == "proposition" ? "Proposition de CLAIRE" : T(n, "titre");
        y = Ajouter(Libelle(nom, BLANC, 11f, true), x, y, large, 2);
        string ou = type == "message" ? (T(n, "contexte") != "" ? T(n, "contexte") + " · " : "") + T(n, "titre") + (T(n, "heure") != "" ? " · " + T(n, "heure") : "")
            : type == "proposition" ? T(n, "titre") : "";
        if (ou != "") y = Ajouter(Libelle(ou, PALE, 8.5f, false), x, y, large, 4);
        y = Ajouter(Libelle(T(n, "texte"), DOUX, 10f, false), x, y, large + 22, 10);
        if (type == "message")
        {
            repondre = Libelle("↩  Répondre", BLANC, 10f, false);
            repondre.Click += delegate { OuvrirReponse(); };
            y = Ajouter(repondre, x, y, large, 8);
            // Champ de réponse, montré au clic sur « Répondre » (comme Teams).
            cadre = new System.Windows.Forms.Panel { BackColor = CHAMP, Location = new System.Drawing.Point(x, y), Size = new System.Drawing.Size(LARGEUR - x - MARGE, 34), Visible = false, Cursor = System.Windows.Forms.Cursors.IBeam };
            cadre.Region = Arrondi(cadre.Width, cadre.Height, 6);
            saisie = new System.Windows.Forms.TextBox { BorderStyle = System.Windows.Forms.BorderStyle.None, BackColor = CHAMP, ForeColor = BLANC, Location = new System.Drawing.Point(10, 8), Width = cadre.Width - 20, Font = new System.Drawing.Font("Segoe UI", 10f) };
            saisie.KeyDown += delegate (object o, System.Windows.Forms.KeyEventArgs e) { if (e.KeyCode == System.Windows.Forms.Keys.Enter) { e.SuppressKeyPress = true; Repondre(); } if (e.KeyCode == System.Windows.Forms.Keys.Escape) Close(); };
            saisie.HandleCreated += delegate { try { SendMessageW(saisie.Handle, 0x1501, (IntPtr)1, "Répondre à " + auteur + "… (Entrée pour envoyer)"); } catch { } };
            cadre.Controls.Add(saisie);
            Controls.Add(cadre);
        }
        else if (type == "proposition")
        {
            // Bouton plein et clair, comme « Rejoindre » de Teams : la proposition se décide dans CLAIRE.
            System.Windows.Forms.Button b = new System.Windows.Forms.Button { Text = "Ouvrir dans CLAIRE", Location = new System.Drawing.Point(x, y), Size = new System.Drawing.Size(LARGEUR - x - MARGE, 34),
                FlatStyle = System.Windows.Forms.FlatStyle.Flat, BackColor = BLANC, ForeColor = FOND, Font = new System.Drawing.Font("Segoe UI", 10f, System.Drawing.FontStyle.Bold) };
            b.FlatAppearance.BorderColor = BLANC;
            b.Region = Arrondi(b.Width, b.Height, 4);
            b.Click += delegate { Ouvrir(); };
            Controls.Add(b);
            y += 44;
        }
        etat = new System.Windows.Forms.Label { AutoSize = false, Location = new System.Drawing.Point(x, y), Size = new System.Drawing.Size(LARGEUR - x - MARGE, 16), ForeColor = PALE, Font = new System.Drawing.Font("Segoe UI", 8f), UseMnemonic = false };
        Controls.Add(etat);
        Height = Math.Max(y + 18, MARGE * 2 + AVATAR);
        Region = Arrondi(Width, Height, 8);
        Paint += delegate (object o, System.Windows.Forms.PaintEventArgs e) { using (System.Drawing.Pen p = new System.Drawing.Pen(FILET)) e.Graphics.DrawRectangle(p, 0, 0, Width - 1, Height - 1); };
        // Un clic sur la carte (hors croix, « Répondre » et champ) ouvre CLAIRE, comme Teams.
        Click += delegate { Ouvrir(); };
        foreach (System.Windows.Forms.Control c in Controls)
            if (c != croix && c != repondre && c != cadre && !(c is System.Windows.Forms.Button)) c.Click += delegate { Ouvrir(); };
        minuterie.Interval = 1000;
        minuterie.Tick += delegate
        {
            bool dessus = Bounds.Contains(System.Windows.Forms.Cursor.Position);
            bool frappe = cadre != null && cadre.Visible && (saisie.Focused || saisie.Text.Length > 0);
            if (dessus || frappe || envoi) { restant = Math.Max(restant, 3); return; }
            if (--restant <= 0) Close();
        };
        minuterie.Start();
        FormClosed += delegate { minuterie.Stop(); minuterie.Dispose(); ouvertes.Remove(this); Ranger(); };
    }

    static System.Windows.Forms.Label Libelle(string texte, System.Drawing.Color couleur, float taille, bool gras)
    {
        return new System.Windows.Forms.Label { Text = texte, ForeColor = couleur, UseMnemonic = false, BackColor = System.Drawing.Color.Transparent,
            Font = new System.Drawing.Font("Segoe UI", taille, gras ? System.Drawing.FontStyle.Bold : System.Drawing.FontStyle.Regular) };
    }

    void OuvrirReponse()
    {
        if (cadre == null || cadre.Visible) return;
        cadre.Visible = true;
        repondre.Visible = false;
        cadre.Top = repondre.Top;
        etat.Top = cadre.Bottom + 4;
        Height = Math.Max(etat.Bottom + 8, MARGE * 2 + AVATAR);
        Region = Arrondi(Width, Height, 8);
        Ranger();
        Activate();
        saisie.Focus();
    }

    // Coins arrondis (rayon r), par un chemin du dessin : pas d'appel à gdi32.
    static System.Drawing.Region Arrondi(int w, int h, int r)
    {
        System.Drawing.Drawing2D.GraphicsPath c = new System.Drawing.Drawing2D.GraphicsPath();
        int d = 2 * r;
        c.AddArc(0, 0, d, d, 180, 90); c.AddArc(w - d, 0, d, d, 270, 90); c.AddArc(w - d, h - d, d, d, 0, 90); c.AddArc(0, h - d, d, d, 90, 90);
        c.CloseFigure();
        return new System.Drawing.Region(c);
    }

    int Ajouter(System.Windows.Forms.Label l, int x, int y, int large, int apres)
    {
        // Hauteur mesurée sur la largeur donnée, retours à la ligne compris : jamais un texte coupé.
        System.Drawing.Size taille = System.Windows.Forms.TextRenderer.MeasureText(l.Text == "" ? " " : l.Text, l.Font, new System.Drawing.Size(large, 0),
            System.Windows.Forms.TextFormatFlags.WordBreak | System.Windows.Forms.TextFormatFlags.NoPrefix);
        l.AutoSize = false; l.Size = new System.Drawing.Size(large, taille.Height + 2); l.Location = new System.Drawing.Point(x, y);
        Controls.Add(l);
        return y + l.Height + apres;
    }

    // Les appels au serveur partent hors du fil d'affichage ; la carte dit le résultat.
    void Envoyer(string route, Dictionary<string, object> corps, string reussi, bool puisMontrer = false)
    {
        if (envoi) return;
        envoi = true;
        etat.ForeColor = PALE; etat.Text = "Envoi…";
        ThreadPool.QueueUserWorkItem(delegate
        {
            string erreur = RelaisClaire.PosterRelais(route, corps);
            try
            {
                if (IsDisposed) return;
                BeginInvoke((System.Windows.Forms.MethodInvoker)delegate
                {
                    envoi = false;
                    if (erreur == "") { if (saisie != null) saisie.Text = ""; etat.Text = reussi; restant = 2; if (puisMontrer) { RelaisClaire.MontrerClaire(); restant = 1; } }
                    else { etat.ForeColor = System.Drawing.Color.FromArgb(255, 186, 186); etat.Text = erreur; if (saisie != null) saisie.Enabled = true; }
                });
            }
            catch { }
        });
    }

    void Repondre()
    {
        if (envoi) return;
        string texte = saisie.Text.Trim();
        if (texte == "") return;
        saisie.Enabled = false;
        Dictionary<string, object> c = new Dictionary<string, object>();
        c["canal"] = T(n, "canal"); c["texte"] = texte; c["parent"] = T(n, "parent");
        Envoyer("repondre", c, "Réponse envoyée");
    }

    // Le geste est d'abord déposé au serveur, PUIS la fenêtre CLAIRE passe devant : elle le trouve à sa première demande (relecture 25/10).
    void Ouvrir()
    {
        Dictionary<string, object> c = new Dictionary<string, object>();
        c["canal"] = T(n, "canal");
        Envoyer("ouvrir", c, "", true);
    }
}

static class RelaisClaire
{
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
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool DeleteFileW(string chemin);

    [STAThread]
    static int Main(string[] args)
    {
        ServicePointManager.Expect100Continue = false;
        string soi = System.Reflection.Assembly.GetEntryAssembly().Location;
        if (Array.IndexOf(args, "--retirer") >= 0) return Retirer();
        bool lisible = LireConfigFichier();
        // --verifier : configuration lue et un relevé envoyé au serveur, résultat écrit sur la sortie (contrôle de la
        // construction et de l'installation ; jamais le jeton).
        if (Array.IndexOf(args, "--verifier") >= 0)
        {
            if (!lisible) { Console.WriteLine("configuration illisible"); return 2; }
            try { Console.WriteLine("ok " + url + " " + poste + " " + Verifier()); return 0; }
            catch (Exception e) { Console.WriteLine("serveur : " + e.Message); return 3; }
        }
        bool fond = false;
        foreach (string a in args) if (a == "--fond") fond = true;
        if (!fond) return Installer(soi);
        if (!lisible) return 1;
        bool cree;
        using (Mutex mutex = new Mutex(true, "Local\\CLAIRE-relais", out cree))
        {
            if (!cree) return 0;
            PastilleWindows.Demarrer();
            Boucle();
        }
        return 0;
    }

    // ---- Configuration du poste ----
    // Le programme est le MÊME pour tous les postes (étude 12/10 : Panda Endpoint Protection le mettait en quarantaine ; une
    // exclusion par empreinte ne vaut que pour un fichier identique). La configuration (adresse du serveur, collaborateur, jeton)
    // arrive par un CODE que CLAIRE copie dans le presse-papiers au téléchargement (« CLAIRE-RELAIS: » + base64 du JSON), lu à
    // l'installation, puis gardée dans %LOCALAPPDATA%\CLAIRE\relais.json.
    const string PREFIXE_CODE = "CLAIRE-RELAIS:";

    static string DossierClaire()
    {
        return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CLAIRE");
    }

    static string FichierConfig() { return Path.Combine(DossierClaire(), "relais.json"); }

    static bool LireConfigFichier()
    {
        try { return LireConfigJson(File.ReadAllText(FichierConfig(), Encoding.UTF8)); } catch { return false; }
    }

    static bool LireConfigJson(string json)
    {
        try
        {
            Dictionary<string, object> cfg = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(json);
            url = Texte(cfg, "url"); poste = Texte(cfg, "poste"); jeton = Texte(cfg, "jeton");
            string p = Texte(cfg, "profil"); profil = p != "" ? p : "Claire";
            return url.StartsWith("http") && url.EndsWith("/") && poste != "" && jeton != "";
        }
        catch { return false; }
    }

    // Le JSON d'un code d'installation, ou null.
    static string JsonDuCode(string code)
    {
        try
        {
            string c = (code ?? "").Trim();
            int i = c.IndexOf(PREFIXE_CODE);
            if (i < 0) return null;
            string b64 = Regex.Match(c.Substring(i + PREFIXE_CODE.Length), "^[A-Za-z0-9+/=]+").Value;
            return Encoding.UTF8.GetString(Convert.FromBase64String(b64));
        }
        catch { return null; }
    }

    static string LirePressePapiers()
    {
        try { return System.Windows.Forms.Clipboard.ContainsText() ? System.Windows.Forms.Clipboard.GetText() : ""; } catch { return ""; }
    }

    // Contrôle du jeton seulement (« verifier ») : le serveur ne touche à rien de ce qui attend le relais en marche sur ce
    // poste. Rend la réponse du serveur (une exception si refusé ou injoignable).
    static string Verifier()
    {
        Dictionary<string, object> corps = new Dictionary<string, object>();
        corps["poste"] = poste; corps["jeton"] = jeton; corps["verifier"] = true;
        return Poster(url + "api/relais-word/releve", new JavaScriptSerializer().Serialize(corps));
    }

    static string Texte(IDictionary d, string cle)
    {
        return d != null && d.Contains(cle) && d[cle] != null ? Convert.ToString(d[cle]) : "";
    }

    // ---- Installation ----
    static int Installer(string soi)
    {
        // Le code copié par CLAIRE au téléchargement ; sinon demandé (à coller depuis CLAIRE).
        string json = JsonDuCode(LirePressePapiers());
        // Le code porte le jeton du poste : il ne reste pas dans le presse-papiers (ni dans son historique).
        if (json != null) try { System.Windows.Forms.Clipboard.Clear(); } catch { }
        if (json == null)
        {
            string saisi = Microsoft.VisualBasic.Interaction.InputBox("Collez le code d'installation affiche par CLAIRE (Reglages, Telephonie 3CX, ou Aide a la redaction, bouton d'installation du relais) :", TITRE, "");
            if (String.IsNullOrEmpty(saisi)) return 1;
            json = JsonDuCode(saisi);
        }
        if (json == null || !LireConfigJson(json))
        {
            MessageBoxW(IntPtr.Zero, "Ce code n'est pas un code d'installation de CLAIRE. Recommencez depuis CLAIRE : le bouton d'installation du relais copie le code.", TITRE, 0x30);
            return 1;
        }
        try { Verifier(); }
        catch (WebException e)
        {
            HttpWebResponse r = e.Response as HttpWebResponse;
            MessageBoxW(IntPtr.Zero, r != null && r.StatusCode == HttpStatusCode.Forbidden
                ? "CLAIRE ne reconnait pas ce code (un code plus recent a ete demande depuis). Recommencez depuis CLAIRE."
                : "Le serveur CLAIRE n'a pas accepte le code (adresse " + url + ") : installation abandonnee.", TITRE, 0x30);
            return 1;
        }
        catch (Exception e)
        {
            MessageBoxW(IntPtr.Zero, "Verification aupres du serveur CLAIRE impossible (" + e.Message + ") : installation abandonnee.", TITRE, 0x30);
            return 1;
        }
        try
        {
            string dossier = DossierClaire();
            Directory.CreateDirectory(dossier);
            string cible = Path.Combine(dossier, "CLAIRE-relais.exe");
            int moi = Process.GetCurrentProcess().Id;
            foreach (Process p in Process.GetProcessesByName("CLAIRE-relais"))
            {
                if (p.Id == moi) continue;
                try { p.Kill(); p.WaitForExit(3000); } catch { }
            }
            RetirerAncienRelaisPowerShell();
            if (!String.Equals(Path.GetFullPath(soi), Path.GetFullPath(cible), StringComparison.OrdinalIgnoreCase))
            {
                // L'ancien relais vient d'être arrêté : son fichier peut rester verrouillé un instant.
                for (int essai = 0; ; essai++)
                {
                    try { File.Copy(soi, cible, true); break; }
                    catch (IOException) { if (essai >= 5) throw; Thread.Sleep(500); }
                }
                // La marque « téléchargé d'Internet » suit la copie : retirée (pas d'avertissement à l'ouverture de session).
                DeleteFileW(cible + ":Zone.Identifier");
            }
            // La configuration après la copie : un échec de copie laisse l'ancienne en place.
            File.WriteAllText(FichierConfig(), json, new UTF8Encoding(false));
            using (RegistryKey run = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run"))
            {
                run.SetValue("CLAIRE-relais", "\"" + cible + "\" --fond");
                try { run.DeleteValue("CLAIRE-Word", false); } catch { }
            }
            Process.Start(new ProcessStartInfo(cible, "--fond") { UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = dossier });
            MessageBoxW(IntPtr.Zero, "Le relais CLAIRE de ce poste est installe :\n"
                + "- l'Aide a la redaction suit le paragraphe ou se trouve le curseur de Word ;\n"
                + "- a chaque appel 3CX, la fenetre CLAIRE passe au premier plan si l'appelant a un dossier, sinon la fenetre d'avant revient.\n\n"
                + "Il demarre seul a chaque ouverture de session. Pour le retirer : CLAIRE-relais.exe --retirer.", TITRE, 0x40);
            return 0;
        }
        catch (Exception e)
        {
            MessageBoxW(IntPtr.Zero, "Installation impossible : " + e.Message, TITRE, 0x10);
            return 1;
        }
    }

    // Relais d'avant (script PowerShell lancé par un .vbs, 0.219.0 – 0.221.0) : ses fichiers et son démarrage retirés. Le
    // processus encore en marche s'arrête seul : le nouveau téléchargement a changé le jeton, le serveur le refuse.
    static void RetirerAncienRelaisPowerShell()
    {
        string ancien = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "CLAIRE");
        foreach (string f in new[] { "word-claire.ps1", "word-claire.vbs" })
            try { File.Delete(Path.Combine(ancien, f)); } catch { }
    }

    // --retirer : relais arrêté, démarrage retiré, fichier effacé (au mieux : le programme en cours ne peut pas s'effacer).
    static int Retirer()
    {
        int moi = Process.GetCurrentProcess().Id;
        foreach (Process p in Process.GetProcessesByName("CLAIRE-relais"))
            if (p.Id != moi) try { p.Kill(); p.WaitForExit(3000); } catch { }
        try
        {
            using (RegistryKey run = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true))
                if (run != null) { run.DeleteValue("CLAIRE-relais", false); run.DeleteValue("CLAIRE-Word", false); }
        }
        catch { }
        RetirerAncienRelaisPowerShell();
        string cible = Path.Combine(DossierClaire(), "CLAIRE-relais.exe");
        try { File.Delete(cible); } catch { }
        try { File.Delete(FichierConfig()); } catch { }
        MessageBoxW(IntPtr.Zero, "Le relais CLAIRE de ce poste est retire.", TITRE, 0x40);
        return 0;
    }

    // ---- Fenêtres ----
    internal static IntPtr TrouverClaire()
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
                corps["resultats"] = resultats.ToArray(); corps["appels"] = 1; corps["pastille"] = 1;
                if (!inchange) { corps["titre"] = titre; corps["paragraphe"] = para; }
                try
                {
                    string reponse = Poster(url + "api/relais-word/releve", json.Serialize(corps));
                    dernier = cle; refus = 0; resultats.Clear(); envoi = maintenant;
                    Dictionary<string, object> rep = json.Deserialize<Dictionary<string, object>>(reponse);
                    foreach (object c in Liste(rep, "commandes")) resultats.Add(Inserer(wordObj, c as Dictionary<string, object>));
                    if (rep != null && rep.ContainsKey("renvoyer") && Equals(rep["renvoyer"], true)) dernier = null;
                    foreach (object a in Liste(rep, "appels")) Appel(a as Dictionary<string, object>);
                    if (rep != null && rep.ContainsKey("pastille")) { try { PastilleWindows.Mettre(Convert.ToInt32(rep["pastille"])); } catch { } }
                    List<Dictionary<string, object>> nouvelles = new List<Dictionary<string, object>>();
                    foreach (object n in Liste(rep, "notifications"))
                    {
                        Dictionary<string, object> d = n as Dictionary<string, object>;
                        if (d != null && Texte(d, "titre") != "") nouvelles.Add(d);
                    }
                    PastilleWindows.Notifier(nouvelles);
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

    // Un geste d'une carte (répondre, ouvrir, décider) : poste et jeton du relais ajoutés. Rend '' ou un message d'erreur court.
    internal static string PosterRelais(string route, Dictionary<string, object> corps)
    {
        corps["poste"] = poste; corps["jeton"] = jeton;
        try { Poster(url + "api/relais-word/" + route, new JavaScriptSerializer().Serialize(corps)); return ""; }
        catch (WebException e)
        {
            HttpWebResponse r = e.Response as HttpWebResponse;
            return r == null ? "Serveur CLAIRE injoignable." : (int)r.StatusCode == 403 ? "Relais refusé par CLAIRE." : "Refusé par CLAIRE.";
        }
        catch { return "Envoi impossible."; }
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

    // Clic sur l'icône CLAIRE de la zone de notification ou sur une notification : la fenêtre CLAIRE devant, ouverte si elle est fermée.
    internal static void MontrerClaire()
    {
        IntPtr h = TrouverClaire();
        if (h != IntPtr.Zero) { Montrer(h); return; }
        string navigateur = Navigateur();
        try
        {
            if (navigateur != "") Process.Start(navigateur, "--profile-directory=\"" + profil + "\" --app=\"" + url + "\"");
            else Process.Start(url);
        }
        catch { }
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
