import { CharacterSheetContext, getSetting, ModuleSetting, QuickInsert, setSetting } from './quick-insert.js';
import './vendor.js';

// D&D 5th edition integration
const SYSTEM_NAME = "dnd5e";
const defaultSheetFilters = {
    class: "dnd5e.classes",
    feat: "dnd5e.classfeatures",
    "npc.feat": "dnd5e.monsterfeatures",
    spell: "dnd5e.spells",
    weapon: "dnd5e.items",
    equipment: "dnd5e.items",
    consumable: "dnd5e.items",
    backpack: "dnd5e.items",
    tool: "dnd5e.items",
    loot: "dnd5e.items",
};
class Dnd5eSheetContext extends CharacterSheetContext {
    constructor(documentSheet, anchor, sheetType, insertType) {
        super(documentSheet, anchor);
        if (sheetType && insertType) {
            const sheetFilters = getSetting(ModuleSetting.FILTERS_SHEETS).baseFilters;
            this.filter =
                sheetFilters[`${sheetType}.${insertType}`] || sheetFilters[insertType];
        }
    }
}
function sheet5eRenderHook(app, sheetType) {
    if (app.element.find(".quick-insert-link").length > 0) {
        return;
    }
    const link = `<a class="item-control quick-insert-link" title="Quick Insert"><i class="fas fa-search"></i></a>`;
    app.element.find("a.item-create").each((i, el) => {
        const linkEl = $(link);
        $(el).after(linkEl);
        const type = el.dataset.type;
        linkEl.on("click", () => {
            const context = new Dnd5eSheetContext(app, linkEl, sheetType, type);
            QuickInsert.open(context);
        });
    });
}
function init() {
    if (game.user?.isGM) {
        const customFilters = getSetting(ModuleSetting.FILTERS_SHEETS).baseFilters;
        setSetting(ModuleSetting.FILTERS_SHEETS, {
            baseFilters: {
                ...defaultSheetFilters,
                ...customFilters,
            },
        });
    }
    Hooks.on("renderActorSheet5eCharacter", (app) => {
        getSetting(ModuleSetting.FILTERS_SHEETS_ENABLED) &&
            sheet5eRenderHook(app, "character");
    });
    Hooks.on("renderActorSheet5eNPC", (app) => {
        getSetting(ModuleSetting.FILTERS_SHEETS_ENABLED) &&
            sheet5eRenderHook(app, "npc");
    });
    Hooks.on("renderTidy5eSheet", (app) => {
        getSetting(ModuleSetting.FILTERS_SHEETS_ENABLED) &&
            sheet5eRenderHook(app, "character");
    });
    Hooks.on("renderTidy5eNPC", (app) => {
        getSetting(ModuleSetting.FILTERS_SHEETS_ENABLED) &&
            sheet5eRenderHook(app, "npc");
    });
    console.log("Quick Insert | dnd5e system extensions initiated");
}

export { Dnd5eSheetContext, SYSTEM_NAME, defaultSheetFilters, init, sheet5eRenderHook };
//# sourceMappingURL=dnd5e.js.map
