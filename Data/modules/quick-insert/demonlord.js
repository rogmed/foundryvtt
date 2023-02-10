import { CharacterSheetContext, getSetting, ModuleSetting, QuickInsert, setSetting } from './quick-insert.js';
import './vendor.js';

// Shadow of the Demon Lord integration
const SYSTEM_NAME = "demonlord";
const defaultSheetFilters = {
    armor: "demonlord.armor",
    ammo: "demonlord.ammunition",
    weapon: "demonlord.weapons",
    item: "",
    spell: "",
    talent: "",
    profession: "",
    feature: "",
    "character.path": "",
    "character.ancestry": "",
    "creature.weapon": "demonlord.weapons creature",
    "creature.endoftheround": "",
    "creature.specialaction": "",
};
class DemonLordSheetContext extends CharacterSheetContext {
    constructor(documentSheet, anchor, sheetType, insertType) {
        super(documentSheet, anchor);
        if (sheetType && insertType) {
            const sheetFilters = getSetting(ModuleSetting.FILTERS_SHEETS).baseFilters;
            this.filter =
                sheetFilters[`${sheetType}.${insertType}`] || sheetFilters[insertType];
        }
    }
}
function demonlordRenderHook(app, sheetType) {
    if (app.element.find(".quick-insert-link").length > 0) {
        return;
    }
    const link = `<a class="item-control quick-insert-link" title="Quick Insert"><i class="fas fa-search"></i></a>`;
    app.element.find("a.item-create,a.spell-create").each((i, el) => {
        const linkEl = $(link);
        $(el).after(linkEl);
        const type = el.dataset.type;
        linkEl.on("click", () => {
            const context = new DemonLordSheetContext(app, linkEl, sheetType, type);
            QuickInsert.open(context);
        });
    });
    app.element.find(".ancestry-frame ~ h3").each((i, el) => {
        const linkEl = $(link);
        $(el).after(linkEl);
        linkEl.on("click", () => {
            const context = new DemonLordSheetContext(app, linkEl, sheetType, "ancestry");
            QuickInsert.open(context);
        });
    });
    app.element.find(".path-frame ~ h3").each((i, el) => {
        const linkEl = $(link);
        $(el).after(linkEl);
        linkEl.on("click", () => {
            const context = new DemonLordSheetContext(app, linkEl, sheetType, "path");
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
    Hooks.on("renderDLCharacterSheet", (app) => {
        getSetting(ModuleSetting.FILTERS_SHEETS_ENABLED) &&
            demonlordRenderHook(app, "character");
    });
    Hooks.on("renderDLCreatureSheet", (app) => {
        getSetting(ModuleSetting.FILTERS_SHEETS_ENABLED) &&
            demonlordRenderHook(app, "creature");
    });
    console.log("Quick Insert | demonlord system extensions initiated");
}

export { DemonLordSheetContext, SYSTEM_NAME, defaultSheetFilters, demonlordRenderHook, init };
//# sourceMappingURL=demonlord.js.map
