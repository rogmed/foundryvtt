import { CharacterSheetContext, getSetting, ModuleSetting, QuickInsert, setSetting } from './quick-insert.js';
import './vendor.js';

// Starfinder integration
const SYSTEM_NAME = "sfrpg";
const defaultSheetFilters = {
    class: "sfrpg.classes",
    race: "sfrpg.races",
    theme: "sfrpg.themes",
    // asi: "",
    archetype: "sfrpg.archetypes",
    feat: "sfrpg.feats",
    spell: "sfrpg.spells",
    weapon: "sfrpg.equipment",
    shield: "sfrpg.equipment",
    equipment: "sfrpg.equipment",
    consumable: "sfrpg.equipment",
    goods: "sfrpg.equipment",
    container: "sfrpg.equipment",
    technological: "sfrpg.equipment",
    fusion: "sfrpg.equipment",
    upgrade: "sfrpg.equipment",
    augmentation: "sfrpg.equipment",
};
class SfrpgSheetContext extends CharacterSheetContext {
    constructor(documentSheet, anchor, sheetType, insertType) {
        super(documentSheet, anchor);
        if (sheetType && insertType) {
            const sheetFilters = getSetting(ModuleSetting.FILTERS_SHEETS).baseFilters;
            this.filter =
                sheetFilters[`${sheetType}.${insertType}`] || sheetFilters[insertType];
        }
    }
}
function sheetSfrpgRenderHook(app, sheetType) {
    if (app.element.find(".quick-insert-link").length > 0) {
        return;
    }
    const link = `<a class="item-control quick-insert-link" title="Quick Insert"><i class="fas fa-search"></i></a>`;
    app.element
        .find("a.item-create, .item-control.spell-browse")
        .each((i, el) => {
        const linkEl = $(link);
        $(el).after(linkEl);
        const type = el.dataset.type;
        linkEl.on("click", () => {
            const context = new SfrpgSheetContext(app, linkEl, sheetType, type);
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
    Hooks.on("renderActorSheetSFRPGCharacter", (app) => {
        getSetting(ModuleSetting.FILTERS_SHEETS_ENABLED) &&
            sheetSfrpgRenderHook(app, "character");
    });
    console.log("Quick Insert | sfrpg system extensions initiated");
}

export { SYSTEM_NAME, SfrpgSheetContext, defaultSheetFilters, init, sheetSfrpgRenderHook };
//# sourceMappingURL=sfrpg.js.map
