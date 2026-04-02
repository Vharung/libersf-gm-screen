// === LIBER ENCOUNTER HELPER ===
// Compatible Foundry V13+
// Par Alexandre / ChatGPT (GPT-5)
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

class LiberEncounterHelper extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "liber-encounter-helper",
    window: {
      title: "Assistant de Rencontre - Liber Chronicles",
      icon: "fa-solid fa-scale-balanced"
    },
    position: { width: 650, height: 500 },
    tag: "section",
    classes: ["liber-helper", "sheet"],
    form: false,

    // ✅ Important pour Foundry V13 : définit la région principale
    layout: "main",

    actions: {
      compare: LiberEncounterHelper.compareCombat,
      create: LiberEncounterHelper.createEncounter
    },
  };

  static PARTS = {
    main: {
      template: "modules/liber-encounter-helper/templates/encounter-app.hbs"
    }
  };

  /** Contexte à rendre */
  async _prepareContext(options) {
    const characters = game.actors.filter(a => a.type === "character");

    const pack = game.packs.get("liber-chronicles.monstre");
    if (!pack) {
      ui.notifications.error("📦 Compendium 'liber-chronicles.monstre' introuvable !");
      return { characters: [], monsters: [] };
    }

    const monsters = await pack.getDocuments();

    monsters.sort((a, b) => {
      const folderA = a.folder?.name?.toLowerCase() ?? "";
      const folderB = b.folder?.name?.toLowerCase() ?? "";
      if (folderA < folderB) return -1;
      if (folderA > folderB) return 1;
      return a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
    });

    return {
      characters: characters.map(a => ({
        id: a.id,
        name: a.name,
        hp: a.system.hp?.max ?? 0,
        degat: a.system?.degat ?? "1d6+2"
      })),
      monsters: monsters.map(m => ({
        id: m.id,
        name: m.name,
        hp: m.system?.hp?.max ?? 0,
        nb: m.nb ?? 0,
        degat: m.system?.degat ?? "1d6"
      }))
    };
  }

  /** Compare la puissance (PV totaux) des PJ et des monstres */
  static async compareCombat(event, button) {
    const root = button.closest(".liber-helper");
    const chars = Array.from(root.querySelectorAll("input[name='char']:checked"));
    const monsters = Array.from(root.querySelectorAll("input[name='monster']:checked"));

    if (!chars.length || !monsters.length) {
      return ui.notifications.warn("Sélectionnez au moins un joueur et un monstre.");
    }

    let totalCharDmg = 0, totalCharHP = 0;

    for (let el of chars) {
      const actor = game.actors.get(el.value);
      if (!actor) continue;

      const dmgStr = actor.system?.degat || "1d6";
      const match = dmgStr.match(/(\d+)d(\d+)(?:\+(\d+))?/);
      const nbD = Number(match?.[1]) || 1;
      const typeD = Number(match?.[2]) || 6;
      const bonus = Number(match?.[3]) || 0;
      const maxDmg = nbD * typeD + bonus;

      totalCharDmg += maxDmg;
      totalCharHP += actor.system?.hp?.max ?? 0;
    }

    const pack = game.packs.get("liber-chronicles.monstre");
    if (!pack) return ui.notifications.error("⚠️ Compendium 'liber-chronicles.monstre' introuvable !");

    let totalMonsterHP = 0, totalMonsterDmg = 0;

    for (let el of monsters) {
      const doc = await pack.getDocument(el.value);
      if (!doc) continue;

      const nbInput = el.parentElement.querySelector("input[name='monster-qty']");
      const nb = parseInt(nbInput?.value) || 1;

      let hpmonster = doc.system?.hp?.max ?? doc.system?.psy?.max ?? 0;
      totalMonsterHP += hpmonster * nb;

      const dmgStr = doc.system?.degat ?? "1d6";
      const match = dmgStr.match(/(\d+)d(\d+)(?:\+(\d+))?/);
      const nbD = Number(match?.[1]) || 1;
      const typeD = Number(match?.[2]) || 6;
      const bonus = Number(match?.[3]) || 0;
      const monDmg = nbD * typeD + bonus;

      totalMonsterDmg += monDmg * nb;
    }

    const charEffective = totalCharDmg / 2;
    const monsterEffective = totalMonsterDmg / 2;

    const pj = totalMonsterHP / (charEffective || 1);
    const pn = totalCharHP / (monsterEffective || 1);

    const ratio = pj - pn;

    let difficulty = "Équilibré";
    let charRatio = 50;
    if (ratio >= 25) { difficulty = "Suicidaire"; charRatio = 10; }
    else if (ratio >= 15) { difficulty = "Difficile"; charRatio = 25; }
    else if (ratio >= 5) { difficulty = "Équilibré"; charRatio = 50; }
    else if (ratio >= -5) { difficulty = "Facile"; charRatio = 75; }
    else { difficulty = "Très Facile"; charRatio = 90; }

    const bar = root.querySelector(".difficulty-bar");
    if (bar) {
      const charBar = bar.querySelector(".pc");
      const monsterBar = bar.querySelector(".monster");
      const monsterRatio = 100 - charRatio;

      if (charBar && monsterBar) {
        charBar.style.width = `${charRatio}%`;
        monsterBar.style.width = `${monsterRatio}%`;
      }
    }

    root.querySelector(".result").innerHTML = `
      <b>${difficulty}</b><br>
      <b>PJ :</b> ${totalCharHP} PV / ${totalCharDmg} dégâts max<br>
      <b>Monstres :</b> ${totalMonsterHP} PV / ${totalMonsterDmg} dégâts max
    `;
  }

  /** Crée les monstres sélectionnés sur la scène */
  static async createEncounter(event, button) {
    const root = button.closest(".liber-helper");
    const selected = Array.from(root.querySelectorAll("input[name='monster']:checked"));
    if (!selected.length) return ui.notifications.warn("Aucun monstre sélectionné.");

    const pack = game.packs.get("liber-chronicles.monstre");
    if (!pack) return ui.notifications.error("Compendium 'monstres' introuvable !");
    const docs = await pack.getDocuments();

    const scene = game.scenes.current;
    if (!scene) return ui.notifications.warn("Aucune scène active.");

    const tokensToCreate = [];
    let x = 1000, y = 1000;
    const spacing = 150;
    const perRow = 5;

    for (const checkbox of selected) {
      const monsterId = checkbox.value;
      const qtyInput = root.querySelector(`.qty-${monsterId}`);
      const qty = Math.max(1, parseInt(qtyInput?.value) || 1);

      const mon = docs.find(d => d.id === monsterId);
      if (!mon) continue;

      for (let i = 0; i < qty; i++) {
        const actorData = mon.toObject();
        actorData.name = `${mon.name} ${qty > 1 ? i + 1 : ""}`.trim();

        const createdActor = await Actor.create(actorData, { renderSheet: false });
        if (!createdActor) continue;

        const imgPath = mon.img.replace("systems/liber/", "systems/liber-chronicles/");

        const tokenData = await createdActor.getTokenDocument({ x, y });
        tokenData.updateSource({
          name: createdActor.name,
          texture: { src: imgPath },
          actorLink: true,
          disposition: -1
        });

        tokensToCreate.push(tokenData);

        x += spacing;
        if ((i + 1) % perRow === 0) {
          x = 1000;
          y += spacing;
        }
      }

      y += spacing;
      x = 1000;
    }

    await scene.createEmbeddedDocuments("Token", tokensToCreate);
    ui.notifications.info(`${tokensToCreate.length} monstre(s) ajouté(s) et liés à leur fiche !`);
  }
}

// === INITIALISATION DU MODULE ===
Hooks.once("init", () => {
  console.log("Liber Encounter Helper | Initialisation du module");

  game.liberEncounterHelper = new LiberEncounterHelper();

  game.settings.registerMenu("liber-encounter-helper", "menu", {
    name: "Assistant de Rencontre",
    label: "Ouvrir l’assistant de rencontre",
    icon: "fa-solid fa-scale-balanced",
    type: LiberEncounterHelper,
    restricted: true
  });
});

// === AJOUT DU BOUTON DANS LE RÉPERTOIRE DES ACTEURS ===
Hooks.on("renderActorDirectory", (app, htmlElement) => {
  try {
    if (!game.user.isGM) return;

    const btn = document.createElement("button");
    btn.classList.add("liber-helper-btn");
    btn.innerHTML = `<i class="fa-solid fa-scale-balanced"></i> Assistant de Rencontre`;

    btn.addEventListener("click", () => {
      if (!game.liberEncounterHelper)
        game.liberEncounterHelper = new LiberEncounterHelper();
      game.liberEncounterHelper.render(true);
    });

    const footer = htmlElement.querySelector(".directory-footer") || htmlElement.querySelector(".header-actions");
    if (footer) footer.appendChild(btn);
    else htmlElement.appendChild(btn);

    console.log("Liber Encounter Helper | Bouton ajouté au répertoire d'acteurs.");
  } catch (err) {
    console.error("Liber Encounter Helper | Erreur lors de l’ajout du bouton :", err);
  }
});
