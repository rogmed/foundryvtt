// import {ItemEffectSelector} from "./apps/daeSelector"
import { confirmDelete, effectIsTransfer, simpleCalendarInstalled } from "../dae.js";
import { i18n, confirmAction, daeSpecialDurations } from "../../dae.js";
import { EditOwnedItemEffectsActiveEffect } from "../editItemEffects/classes/owned-item-effect.js";
import { ValidSpec } from "../Systems/DAESystem.js";
export class ActiveEffects extends FormApplication {
    static filters = new Set().add("summary");
    hookId = null;
    itemHookId = null;
    effectHookIdu = null;
    effectHookIdc = null;
    effectHookIdd = null;
    effectHookIdt = null;
    effectHookIda = null;
    timeHookId = null;
    combatHookId = null;
    effect;
    effectList;
    static get defaultOptions() {
        const options = super.defaultOptions;
        // options.id = "effect-selector-actor";
        options.classes = ["dnd5e", "sw5e"];
        options.title = game.i18n.localize("dae.ActiveEffectName");
        options.template = "./modules/dae/templates/ActiveEffects.html";
        options.submitOnClose = true;
        options.height = 400;
        options.width = 600;
        options.resizable = true;
        return options;
    }
    get id() {
        const actor = this.object;
        let id = `ActiveEffects-${actor.id}`;
        if (actor.isToken)
            id += `-${actor.token.id}`;
        return id;
    }
    get title() {
        return game.i18n.localize("dae.ActiveEffectName") + ` ${this.object.name}` + (this.object.isOwned ? " (Owned Item) EXPERIMENTAL" : "");
    }
    get filters() { return ActiveEffects.filters; }
    getData() {
        const object = this.object;
        //@ts-expect-error
        const EFFECTMODES = CONST.ACTIVE_EFFECT_MODES;
        const modeKeys = Object.keys(EFFECTMODES);
        let actives = object.effects.map(ae => {
            let newAe = duplicate(ae);
            newAe.duration = duplicate(ae.duration);
            if (simpleCalendarInstalled && newAe.duration?.type === "seconds") {
                const simpleCalendar = globalThis.SimpleCalendar?.api;
                ae._prepareDuration(); // TODO remove this if v10 change made
                simpleCalendar.formatDateTime(simpleCalendar.timestampToDate(ae.duration.remaining)).time;
            }
            else if (newAe.duration.label) {
                newAe.duration.label = newAe.duration.label.replace("Seconds", "s").replace("Rounds", "R").replace("Turns", "T");
            }
            let specialDuration = getProperty(ae.flags, "dae.specialDuration") || [daeSpecialDurations["None"]];
            if (typeof specialDuration === "string")
                specialDuration = [ae.flags.dae.specialDuration];
            newAe.duration.label += ", " + `[${specialDuration.map(dur => daeSpecialDurations[dur])}]`;
            newAe.isTemporary = true;
            newAe.isTemporary = ae.isTemporary;
            newAe.sourceName = ae.sourceName;
            if (newAe.sourceName === (newAe.name ?? newAe.label))
                newAe.sourceName = "";
            else
                newAe.sourceName = `(${newAe.sourceName})`;
            if (this.filters.has("summary")) {
                newAe.changes = [];
                return newAe;
            }
            newAe.changes.map(change => {
                //@ts-ignore documentClass
                if (this.object instanceof CONFIG.Item.documentClass)
                    change.label = ValidSpec.specs["union"].allSpecsObj[change.key]?.label || change.key;
                else
                    change.label = ValidSpec.specs[object.type].allSpecsObj[change.key]?.label || change.key;
                if (typeof change.value === "string" && change.value.length > 40) {
                    change.value = change.value.substring(0, 30) + " ... ";
                }
                else if (Array.isArray(change.value)) {
                    if (typeof change.value[0] === "string" && change.value[0].length > 20)
                        change.value[0] = "<Macro>";
                    change.value = change.value.join("|");
                }
                return change;
            });
            return newAe;
        });
        if (this.filters.has("temporary"))
            actives = actives.filter(e => e.isTemporary);
        if (this.filters.has("enabled"))
            actives = actives.filter(e => !e.disabled);
        actives.sort((a, b) => a.label < b.label ? -1 : 1);
        actives.forEach(e => {
            setProperty(e, "flags.dae.active", !e.disabled);
            let id = e.origin?.match(/Actor.*Item\.(.*)/);
            if (id?.length === 2) {
                const item = object.items?.get(id[1]);
                setProperty(e, "flags.dae.itemName", item?.name || "???");
            }
            else {
                setProperty(e, "flags.dae.itemName", "????");
            }
            e.transfer = effectIsTransfer(e) ?? true;
        });
        let efl = CONFIG.statusEffects
            .map(se => { return { "id": se.id, "label": se.id?.startsWith("combat-utility-belt.") ? `${se.name || se.label} (CUB)` : i18n(se.label) }; })
            .sort((a, b) => a.label < b.label ? -1 : 1);
        this.effectList = { "new": "new" };
        efl.forEach(se => {
            this.effectList[se.id] = se.label;
        });
        //@ts-ignore documentClass;
        const isItem = this.object instanceof CONFIG.Item.documentClass;
        let data = {
            actives: actives,
            isGM: game.user.isGM,
            isItem,
            isOwned: object.isOwned,
            flags: object.flags,
            modes: modeKeys,
            validSpecs: isItem ? ValidSpec.specs["union"].allSpecsObj : ValidSpec.specs[object.type],
            //@ts-ignore
            // canEdit: game.user.isGM || (playersCanSeeEffects === "edit" && game.user.isTrusted),
            canEdit: true,
            // showEffects: playersCanSeeEffects !== "none" || game.user.isGM,
            showEffects: true,
            effectList: this.effectList,
            newEffect: "new"
        };
        return data;
    }
    async _updateObject(event, formData) {
        const object = this.object;
        formData = expandObject(formData);
        if (!formData.changes)
            formData.changes = [];
        formData.changes = Object.values(formData.changes);
        for (let c of formData.changes) {
            //@ts-ignore
            if (Number.isNumeric(c.value))
                c.value = parseFloat(c.value);
        }
        return object.update(formData);
    }
    _initializeFilterItemList(i, ul) {
        const set = this.filters;
        const filters = ul.querySelectorAll(".filter-item");
        for (let li of filters) {
            if (set.has(li.dataset.filter))
                li.classList.add("active");
        }
    }
    _onToggleFilter(event) {
        event.preventDefault();
        const li = event.currentTarget;
        const set = this.filters;
        const filter = li.dataset.filter;
        if (set.has(filter))
            set.delete(filter);
        else
            set.add(filter);
        this.render();
    }
    // delete change
    activateListeners(html) {
        super.activateListeners(html);
        const filterLists = html.find(".filter-list");
        filterLists.each(this._initializeFilterItemList.bind(this));
        filterLists.on("click", ".filter-item", this._onToggleFilter.bind(this));
        html.find('.refresh').click(async (ev) => {
            return this.submit({ preventClose: true }).then(() => this.render());
        });
        // Delete Effect
        html.find('.effect-delete').click(async (ev) => {
            const object = this.object;
            const effectid = $(ev.currentTarget).parents(".effect-header").attr("effect-id");
            //@ts-ignore
            if (object instanceof CONFIG.Actor.documentClass) {
                confirmAction(confirmDelete, () => {
                    object.deleteEmbeddedDocuments("ActiveEffect", [effectid]);
                });
            }
            else {
                let effect = object.effects.get(effectid);
                effect = new EditOwnedItemEffectsActiveEffect(effect.toObject(), effect.parent);
                confirmAction(confirmDelete, () => {
                    effect.delete({});
                });
            }
        });
        html.find('.effect-edit').click(async (ev) => {
            const object = this.object;
            if (object.parent instanceof Item)
                return; // TODO Think about editing effects on items in bags
            const effectid = $(ev.currentTarget).parents(".effect-header").attr("effect-id");
            let effect = object.effects.get(effectid);
            const ownedItemEffect = new EditOwnedItemEffectsActiveEffect(effect.toObject(), effect.parent);
            return ownedItemEffect.sheet.render(true);
        });
        html.find('.effect-add').click(async (ev) => {
            const object = this.object;
            let effect_name = $(ev.currentTarget).parents(".effect-header").find(".newEffect option:selected").text();
            let AEDATA;
            let id = Object.entries(this.effectList).find(([key, value]) => value === effect_name)[0];
            if (effect_name === "new") {
                //@ts-ignore
                AEDATA = {
                    label: object.name,
                    icon: object.img || "icons/svg/mystery-man.svg",
                    changes: [],
                    transfer: false,
                };
            }
            else {
                AEDATA = CONFIG.statusEffects.find(se => se.id === id);
                AEDATA.label = i18n(AEDATA.name || AEDATA.label);
                //TODO remove this when core has this already?
                if (isNewerVersion(game.version, "11.0")) {
                    AEDATA["statuses"] = [id];
                    if (AEDATA["flags.core.statusId"])
                        delete AEDATA["flags.core.statusId"];
                }
                else {
                    AEDATA["flags.core.statusId"] = id;
                }
            }
            //@ts-ignore
            if (object instanceof CONFIG.Actor.documentClass) {
                object.createEmbeddedDocuments("ActiveEffect", [AEDATA]);
            }
            else {
                let parent = this.object;
                //@ts-ignore
                const created = new EditOwnedItemEffectsActiveEffect(duplicate(AEDATA), this.object);
                //@ts-ignore
                created.create();
            }
        });
        function efhandler(type, effect, data, options, user) {
            if (this.object.id === effect.parent.id) {
                setTimeout(() => this.render(), 0);
            }
        }
        ;
        function itmHandler(item, data, options, user) {
            if (this.object.id === item.id) {
                setTimeout(() => this.render(), 0);
            }
        }
        ;
        function tmHandler(worldTime, dt) {
            //@ts-ignore
            if (Array.from(this.object.effects).some(ef => ef.isTemporary))
                setTimeout(() => this.render(), 0);
        }
        function tkHandler(token, update, options, user) {
            if (token.actor.id !== this.object.id)
                return;
            setTimeout(() => this.render(), 0);
        }
        function actHandler(actor, updates, options, user) {
            if (actor.id !== this.object.id)
                return;
            setTimeout(() => this.render(), 0);
        }
        if (!this.effectHookIdu)
            this.effectHookIdu = Hooks.on("updateActiveEffect", efhandler.bind(this, "update"));
        if (!this.effectHookIdc)
            this.effectHookIdc = Hooks.on("createActiveEffect", efhandler.bind(this, "create"));
        if (!this.effectHookIdd)
            this.effectHookIdd = Hooks.on("deleteActiveEffect", efhandler.bind(this, "delete"));
        if (!this.itemHookId)
            this.itemHookId = Hooks.on("updateItem", itmHandler.bind(this));
        if (!this.effectHookIdt)
            this.effectHookIdt = Hooks.on("updateToken", tkHandler.bind(this));
        if (!this.effectHookIda)
            this.effectHookIda = Hooks.on("updateActor", actHandler.bind(this));
        if (!this.timeHookId)
            this.timeHookId = Hooks.on("updateWorldTime", tmHandler.bind(this));
        if (!this.combatHookId)
            this.combatHookId = Hooks.on("updateCombat", tmHandler.bind(this));
    }
    async close() {
        Hooks.off("updateActiveEffect", this.effectHookIdu);
        Hooks.off("createActiveEffect", this.effectHookIdc);
        Hooks.off("deleteActiveEffect", this.effectHookIdd);
        Hooks.off("updateWorldTime", this.timeHookId);
        Hooks.off("updateToken", this.effectHookIdt);
        Hooks.off("updateActor", this.effectHookIda);
        Hooks.off("updateItem", this.itemHookId);
        Hooks.off("updateCombat", this.combatHookId);
        return super.close();
    }
}