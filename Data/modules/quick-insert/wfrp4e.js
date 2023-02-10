import { CharacterSheetContext, getSetting, ModuleSetting, QuickInsert, setSetting } from './quick-insert.js';
import './vendor.js';

// Warhammer Fantasy Roleplay 4th edition integration
const SYSTEM_NAME = "wfrp4e";
const defaultSheetFilters = {
    career: "wfrp4e.careers",
    skill: "wfrp4e.skills",
    talent: "wfrp4e.talents",
    injury: "wfrp4e.injuries",
    critical: "wfrp4e.criticals",
    weapon: "wfrp4e.trappings",
    trapping: "wfrp4e.trappings",
    spell: "wfrp4e.spells",
    prayer: "wfrp4e.prayers",
    psychology: "wfrp4e.psychologies",
    mutation: "wfrp4e.mutations",
    disease: "wfrp4e.diseases",
};
class Wfrp4eSheetContext extends CharacterSheetContext {
    constructor(documentSheet, anchor, sheetType, insertType) {
        super(documentSheet, anchor);
        this.spawnCSS = {
            ...this.spawnCSS,
            left: this.spawnCSS?.left - 10,
            bottom: this.spawnCSS?.bottom + 10,
        };
        if (sheetType && insertType) {
            const sheetFilters = getSetting(ModuleSetting.FILTERS_SHEETS).baseFilters;
            this.filter =
                sheetFilters[`${sheetType}.${insertType}`] || sheetFilters[insertType];
        }
    }
}
function sheetWfrp4eRenderHook(app, sheetType) {
    if (app.element.find(".quick-insert-link").length > 0) {
        return;
    }
    const link = `<a class="quick-insert-link" title="Quick Insert"><i class="fas fa-search"></i></a>`;
    app.element.find("a.item-create").each((i, el) => {
        const type = el.dataset.type || "";
        if (!Object.keys(defaultSheetFilters).includes(type))
            return;
        const linkEl = $(link);
        $(el).after(linkEl);
        linkEl.on("click", () => {
            const context = new Wfrp4eSheetContext(app, linkEl, sheetType, type);
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
    Hooks.on("renderActorSheetWfrp4eCharacter", (app) => {
        getSetting(ModuleSetting.FILTERS_SHEETS_ENABLED) &&
            sheetWfrp4eRenderHook(app, "character");
    });
    console.log("Quick Insert | wfrp4e system extensions initiated");
}

export { SYSTEM_NAME, Wfrp4eSheetContext, defaultSheetFilters, init, sheetWfrp4eRenderHook };
//# sourceMappingURL=wfrp4e.js.map
