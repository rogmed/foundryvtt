import { CharacterSheetContext, getSetting, ModuleSetting, QuickInsert, setSetting } from './quick-insert.js';
import './vendor.js';

// Savage Worlds Adventure Edition integration
const SYSTEM_NAME = "swade";
const defaultSheetFilters = {
    skill: "swade.skills",
    hindrance: "swade.hindrances",
    edge: "swade.edges",
    ability: "",
    weapon: "",
    armor: "",
    shield: "",
    gear: "",
    "character.choice": "",
    "vehicle.choice": "",
    mod: "",
    "vehicle-weapon": "",
};
class SwadeSheetContext extends CharacterSheetContext {
    constructor(documentSheet, anchor, sheetType, insertType, equipped) {
        super(documentSheet, anchor);
        this.equipped = false;
        this.equipped = Boolean(equipped);
        if (sheetType && insertType) {
            const sheetFilters = getSetting(ModuleSetting.FILTERS_SHEETS).baseFilters;
            this.filter =
                sheetFilters[`${sheetType}.${insertType}`] || sheetFilters[insertType];
        }
    }
    onSubmit(item) {
        const res = super.onSubmit(item);
        if (this.equipped && res) {
            res.then((items) => {
                const item = items.length && items[0];
                if (!item)
                    return;
                //@ts-ignore
                if (item?.data?.equippable) {
                    item.update({ "data.equipped": true });
                }
            });
        }
        return res;
    }
}
function sheetSwadeRenderHook(app, sheetType) {
    if (app.element.find(".quick-insert-link").length > 0) {
        return;
    }
    // Legacy sheets
    const link = `<a class="quick-insert-link" title="Quick Insert"><i class="fas fa-search"></i></a>`;
    app.element.find("a.item-create").each((i, el) => {
        const type = el.dataset.type || "";
        const equipped = el.dataset.equipped === "true";
        const linkEl = $(link);
        $(el).after(linkEl);
        linkEl.on("click", () => {
            const context = new SwadeSheetContext(app, linkEl, sheetType, type, equipped);
            QuickInsert.open(context);
        });
    });
    // New character sheet
    app.element.find("button.item-create").each((i, el) => {
        const type = el.dataset.type || "";
        const linkEl = $(link);
        $(el).after(linkEl);
        linkEl.on("click", () => {
            const context = new SwadeSheetContext(app, linkEl, sheetType, type);
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
    Hooks.on("renderCharacterSheet", (app) => {
        getSetting(ModuleSetting.FILTERS_SHEETS_ENABLED) &&
            sheetSwadeRenderHook(app, "character");
    });
    Hooks.on("renderSwadeNPCSheet", (app) => {
        getSetting(ModuleSetting.FILTERS_SHEETS_ENABLED) &&
            sheetSwadeRenderHook(app, "npc");
    });
    Hooks.on("renderSwadeVehicleSheet", (app) => {
        getSetting(ModuleSetting.FILTERS_SHEETS_ENABLED) &&
            sheetSwadeRenderHook(app, "vehicle");
    });
    console.log("Quick Insert | swade system extensions initiated");
}

export { SYSTEM_NAME, SwadeSheetContext, defaultSheetFilters, init, sheetSwadeRenderHook };
//# sourceMappingURL=swade.js.map
