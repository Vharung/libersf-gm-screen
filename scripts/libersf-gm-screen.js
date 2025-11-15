// scripts/libersf-gm-screen.js
/**
 * Liber GM Screen — Écran du MJ pour Foundry VTT v13+
 */
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

class LiberGMScreen extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "libersf-gm-screen",
    window: {
      title: "Écran du MJ - Liber SF",
      icon: "fa-solid fa-dragon",
    },
    position: { width: 950, height: 600 },
    tag: "section",
    classes: ["libersf-gm", "sheet"],
    form: false,
    actions: {
      menulink: LiberGMScreen.menulink
    }
  };

  static PARTS = {
    navigation: {
      template: "modules/libersf-gm-screen/templates/navigation.hbs",
    },
    content: {
      template: "modules/libersf-gm-screen/templates/content.hbs",
    },
  };

  constructor(options = {}) {
    super(options);
    this.activeTab = "regles"; // Onglet par défaut
  }

  /** Titre dynamique depuis les paramètres */
  get title() {
    return game.settings.get("libersf-gm-screen", "screenTitle") || "Écran du MJ - Liber SF";
  }

  /** Prépare les données pour les templates */
  async _prepareContext(options) {
    return {
      activeTab: this.activeTab,
      tabs: this.#getTabs(),
    };
  }

  /** Mise à jour du titre de la fenêtre */
  _updateTitle() {
    const windowTitle = this.element.querySelector(".window-title");
    if (windowTitle) {
      windowTitle.textContent = this.title;
    }
  }

  /** Override de render pour mettre à jour le titre */
  async render(force = false, options = {}) {
    await super.render(force, options);
    this._updateTitle();
    return this;
  }

  /** Gestion du rendu et des clics d'onglets */
  async _onRender(context, options) {
    super._onRender(context, options);

    // Retrouve l'onglet actif depuis le stockage local
    const activeTab = localStorage.getItem(`activeTab-liber`) || "regles";
    this._setActiveTab(activeTab);

    // Gestion des clics sur les onglets
    this.element.querySelectorAll(".gm-tab").forEach((tab) => {
      tab.addEventListener("click", (event) => {
        const newTab = event.currentTarget.dataset.tab;
        this._setActiveTab(newTab);
      });
    });
  }

  /** Ouvre la fenêtre (singleton, visible selon paramètres) */
  static async show() {
    const visibleToPlayers = game.settings.get("libersf-gm-screen", "visibleToPlayers");
    
    if (!game.user.isGM && !visibleToPlayers) {
      return ui.notifications.warn("⚠️ Réservé au MJ !");
    }
    
    if (this._instance) this._instance.close();
    this._instance = new LiberGMScreen();
    await this._instance.render(true);
  }

  /** Active un onglet spécifique */
  _setActiveTab(tabId) {
    // Enregistre l'onglet actif
    localStorage.setItem(`activeTab-liber`, tabId);

    // Masque tous les onglets
    this.element.querySelectorAll(".tab").forEach((tab) => {
      tab.style.display = "none";
    });

    // Affiche l'onglet actif
    const activeTab = this.element.querySelector(`.tab[data-tab="${tabId}"]`);
    if (activeTab) activeTab.style.display = "block";

    // Met à jour la navigation
    this.element.querySelectorAll(".sheet-tabs [data-tab]").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.tab === tabId);
    });

    // Si ce n'est pas un MJ → masque les zones "réponse"
    if (!game.user.isGM) {
      this.element.querySelectorAll(".reponse").forEach((el) => {
        el.style.display = "none";
      });
    }
  }

  /** Liste des onglets disponibles */
  #getTabs() {
    return [
      { id: "regles", label: "Règles" },
      { id: "jet", label: "Jet de dès" },
      { id: "pnj", label: "Personnage" },
      { id: "objets", label: "Armes" },
      { id: "combat", label: "Blessure" },
      { id: "soin", label: "Santé" },
      { id: "magie", label: "Véhicule" },
    ];
  }

  /** L'action du menu pour scroll vers une section */
  static async menulink(event, button) {
    event.preventDefault();

    // Récupérer l'ID cible depuis data-target
    const targetId = button.dataset.target;
    const target = document.getElementById(targetId);

    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}

/* ------------------------------------------- */
/* INITIALISATION DU MODULE                    */
/* ------------------------------------------- */
Hooks.once("init", () => {
  console.log("Liber GM Screen | Initialisation du module");

  game.libergmscreen = LiberGMScreen;

  // Paramètre : Titre de l'écran
  game.settings.register("libersf-gm-screen", "screenTitle", {
    name: "Titre de l'écran du MJ",
    hint: "Personnalisez le titre affiché dans la fenêtre de l'écran du MJ.",
    scope: "world",
    config: true,
    type: String,
    default: "Écran du MJ - Liber SF",
    onChange: value => {
      console.log("onChange screenTitle ->", value);
      // Si l'instance existe, rafraîchir le rendu
      if (LiberGMScreen._instance?.rendered) {
        LiberGMScreen._instance.render(true);
      }
    }
  });

  // Paramètre : Visible aux joueurs
  game.settings.register("libersf-gm-screen", "visibleToPlayers", {
    name: "Visible aux joueurs",
    hint: "Si activé, les joueurs pourront également ouvrir l'écran du MJ (certaines sections restent masquées).",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: value => {
      console.log("onChange visibleToPlayers ->", value);
    }
  });

  // Enregistrement dans le menu Foundry
  game.settings.registerMenu("libersf-gm-screen", "menu", {
    name: "Écran du MJ",
    label: "Ouvrir l'écran du MJ",
    icon: "fa-solid fa-dragon",
    type: LiberGMScreen,
    restricted: false, // Permet l'accès selon le paramètre visibleToPlayers
  });
});

/* ------------------------------------------- */
/* AJOUT DU BOUTON DANS L'ONGLET JOURNAL (v13) */
/* ------------------------------------------- */
Hooks.on("renderJournalDirectory", (app, htmlElement) => {
  try {
    const visibleToPlayers = game.settings.get("libersf-gm-screen", "visibleToPlayers");
    
    // Vérifie les permissions
    if (!game.user.isGM && !visibleToPlayers) return;

    // Vérifie qu'on a bien un élément DOM
    const root = htmlElement instanceof HTMLElement ? htmlElement : htmlElement[0];
    if (!root) return console.warn("Liber GM Screen | JournalDirectory introuvable.");

    // Évite les doublons
    if (root.querySelector(".libersf-gm-btn")) return;

    // Création du bouton
    const btn = document.createElement("button");
    btn.classList.add("libersf-gm-btn");
    btn.innerHTML = `<i class="fa-solid fa-dragon"></i> Écran du MJ`;

    btn.addEventListener("click", () => LiberGMScreen.show());

    // Trouve le footer du répertoire
    const footer = root.querySelector(".directory-footer");
    if (footer) footer.appendChild(btn);
    else root.appendChild(btn);

    console.log("Liber GM Screen | Bouton ajouté dans l'onglet Journal.");
  } catch (err) {
    console.error("Liber GM Screen | Erreur renderJournalDirectory :", err);
  }
});

Hooks.once("ready", () => {
  document.querySelectorAll('.menu-link').forEach(link => {
    link.addEventListener('click', ev => {
      ev.preventDefault();

      const targetId = ev.currentTarget.dataset.target.replace(/^#/, ''); // retire le #
      const target = document.getElementById(targetId);

      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
});