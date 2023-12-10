import { confirmDelete, cubActive, ceActive, atlActive, daeSystemClass } from "../dae.js";
import { i18n, confirmAction, daeSpecialDurations, daeMacroRepeats, log } from "../../dae.js";
import { ValidSpec } from "../Systems/DAESystem.js";
export var otherFields = [];
export function addAutoFields(fields) {
    fields.forEach(f => {
        if (!otherFields.includes(f))
            otherFields.push(f);
    });
    otherFields.sort();
}
export class DAEActiveEffectConfig extends ActiveEffectConfig {
    tokenMagicEffects;
    fieldsList;
    cubConditionList;
    ceEffectList;
    statusEffectList;
    ConditionalVisibilityList;
    ConditionalVisibilityVisionList;
    ATLPresets;
    ATLVisionModes;
    validFields;
    object;
    constructor(object = {}, options = {}) {
        super(object, options);
        this.object = object;
        this.tokenMagicEffects = {};
        //@ts-ignore
        if (game.modules.get("tokenmagic")?.active) {
            globalThis.TokenMagic.getPresets().forEach(preset => {
                this.tokenMagicEffects[preset.name] = preset.name;
            });
        }
        else
            this.tokenMagicEffects["invalid"] = "module not installed";
        let validSpecsToUse = ValidSpec.specs["union"];
        //@ts-expect-error parent documentClass
        if (this.object.parent instanceof CONFIG.Actor.documentClass) {
            validSpecsToUse = ValidSpec.specs[this.object.parent.type];
        }
        this.fieldsList = Object.keys(validSpecsToUse.allSpecsObj);
        this.fieldsList = this.fieldsList.concat(otherFields);
        //@ts-ignore
        // if (window.MidiQOL?.midiFlags)  this.fieldsList = this.fieldsList.concat(window.MidiQOL.midiFlags);
        this.fieldsList.sort();
        //@ts-ignore
        log(`There are ${this.fieldsList.length} fields to choose from of which ${window.MidiQOL?.midiFlags?.length || 0} come from midi-qol and ${validSpecsToUse.allSpecs.length} from dae`);
        this.fieldsList = this.fieldsList.join(", ");
        daeSystemClass.configureLists(this);
        if (cubActive) {
            this.cubConditionList = {};
            game.cub.conditions?.forEach(cubc => {
                this.cubConditionList[cubc.name] = cubc.name;
            });
        }
        this.statusEffectList = {};
        let efl = CONFIG.statusEffects;
        efl = efl.filter(se => se.id)
            .map(se => {
            if (se.id.startsWith("combat-utility-belt."))
                return { id: se.id, label: `${se.name || se.label} (CUB)` };
            if (se.id.startsWith("Convenient Effect:"))
                return { id: se.id, label: `${se.name || se.label} (CE)` };
            return { id: se.id, label: i18n(se.label) };
        })
            .sort((a, b) => a.label < b.label ? -1 : 1);
        efl.forEach(se => {
            this.statusEffectList[se.id] = se.label;
        });
        if (ceActive) {
            this.ceEffectList = {};
            game.dfreds.effects?.all.forEach(ceEffect => {
                this.ceEffectList[ceEffect.name || ceEffect.label] = ceEffect.name || ceEffect.label;
            });
        }
        if (atlActive) {
            this.ATLPresets = {};
            game.settings.get("ATL", "presets").forEach(preset => this.ATLPresets[preset.name] = preset.name);
            this.ATLVisionModes =
                {
                    "blind": i18n("VISION.ModeBlindness"),
                    "basic": i18n("VISION.ModeBasicVision"),
                    "darkvision": i18n("VISION.ModeDarkvision"),
                    "monochromatic": i18n("VISION.ModeMonochromatic"),
                    "tremorsense": i18n("VISION.ModeTremorsense"),
                    "lightAmplification": i18n("VISION.ModeLightAmplification")
                };
        }
        this.validFields = { "__": "" };
        this.validFields = validSpecsToUse.allSpecs
            .filter(e => e._fieldSpec.includes(""))
            .reduce((mods, em) => {
            mods[em._fieldSpec] = em._label;
            return mods;
        }, this.validFields);
        for (let field of otherFields) {
            this.validFields[field] = field;
        }
    }
    /** @override */
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            classes: ["sheet", "active-effect-sheet"],
            title: "EFFECT.ConfigTitle",
            template: `./modules/dae/templates/DAEActiveSheetConfig.html`,
            width: 900,
            height: "auto",
            resizable: true,
            tabs: [{ navSelector: ".tabs", contentSelector: "form", initial: "details" }],
            dragDrop: [{ dropSelector: ".value" }]
        });
    }
    /* ----------------------------------------- */
    /** @override */
    get title() {
        let suffix = this.object.parent.isOwned ? "(Owned Item) Experimental" : "";
        return `${i18n("EFFECT.ConfigTitle")}: ${this.object.name || this.object.label}` + suffix;
    }
    get id() {
        const object = this.object;
        let id = `ActiveEffectsConfig-${object?.id}`;
        if (object?.isToken)
            id += `-${object.token.id}`;
        return id;
    }
    /* ----------------------------------------- */
    getOptionsForSpec(spec) {
        if (spec.includes("tokenMagic"))
            return this.tokenMagicEffects;
        if (spec === "macro.CUB")
            return this.cubConditionList;
        if (spec === "macro.CE")
            return this.ceEffectList;
        if (spec === "StatusEffect")
            return this.statusEffectList;
        if (spec === "macro.ConditionalVisibility")
            return this.ConditionalVisibilityList;
        if (spec === "macro.ConditionalVisibilityVision")
            return this.ConditionalVisibilityVisionList;
        if (spec === "ATL.preset")
            return this.ATLPresets;
        if (spec === "ATL.sight.visionMode")
            return this.ATLVisionModes;
        return daeSystemClass.getOptionsForSpec(spec);
    }
    /** @override */
    async getData(options) {
        if (getProperty(this.object, "flags.dae.specialDuration") === undefined)
            setProperty(this.object, "flags.dae.specialDuration", []);
        const data = await super.getData(options);
        let validSpecsToUse = ValidSpec.specs["union"]; // TODO this needs to be thought about
        await daeSystemClass.editConfig();
        //@ts-ignore
        const allModes = Object.entries(CONST.ACTIVE_EFFECT_MODES)
            .reduce((obj, e) => {
            //@ts-ignore
            obj[e[1]] = game.i18n.localize("EFFECT.MODE_" + e[0]);
            return obj;
        }, {});
        data.modes = allModes;
        //@ts-ignore
        data.specialDuration = daeSpecialDurations;
        data.macroRepeats = daeMacroRepeats;
        const translations = geti18nTranslations();
        data.stackableOptions = translations.stackableOptions ?? { "noneName": "Effects do not stack by name", "none": "Effects do not stack", "multi": "Stacking effects apply the effect multiple times", "count": "each stack increase stack count by 1" };
        if (this.object.parent) {
            //@ts-ignore documentClass
            data.isItem = this.object.parent instanceof CONFIG.Item.documentClass;
            //@ts-ignore documentClass
            data.isActor = this.object.parent instanceof CONFIG.Actor.documentClass;
        }
        if (data.isItem)
            validSpecsToUse = ValidSpec.specs["union"]; // TODO think about what it means to edit an item effect
        if (data.isActor)
            validSpecsToUse = ValidSpec.specs[this.object.parent.type];
        data.validFields = this.validFields;
        data.submitText = "EFFECT.Submit";
        //@ts-ignore
        data.effect.changes.forEach(change => {
            if (change.key.startsWith("flags.midi-qol")) {
                //@ts-ignore
                change.modes = allModes; //change.mode ? allModes: [allModes[CONST.ACTIVE_EFFECT_MODES.CUSTOM]];
            }
            else if ([-1, undefined].includes(validSpecsToUse.allSpecsObj[change.key]?.forcedMode)) {
                change.modes = allModes;
            }
            else {
                const mode = {};
                mode[validSpecsToUse.allSpecsObj[change.key]?.forcedMode] = allModes[validSpecsToUse.allSpecsObj[change.key]?.forcedMode];
                change.modes = mode;
            }
            change.options = this.getOptionsForSpec(change.key);
            if (!change.priority)
                change.priority = change.mode * 10;
        });
        const simpleCalendar = globalThis.SimpleCalendar?.api;
        if (simpleCalendar && data.effect.duration?.startTime) {
            const dateTime = simpleCalendar.formatDateTime(simpleCalendar.timestampToDate(data.effect.duration.startTime));
            data.startTimeString = dateTime.date + " " + dateTime.time;
            if (data.effect.duration.seconds) {
                const duration = simpleCalendar.formatDateTime(simpleCalendar.timestampToDate(data.effect.duration.startTime + data.effect.duration.seconds));
                data.durationString = duration.date + " " + duration.time;
            }
        }
        setProperty(data.effect, "flags.dae.durationExpression", this.object.flags?.dae?.durationExpression);
        if (!data.effect.flags.dae?.specialDuration || !(data.effect.flags.dae.specialDuration instanceof Array))
            setProperty(data.effect.flags, "dae.specialDuration", []);
        data.sourceName = await this.object.sourceName;
        data.fieldsList = this.fieldsList;
        if (false && game.modules.get("dfreds-convenient-effects")?.active && !getProperty(this.object, "flags.convenientDescription")) {
            setProperty(this.object, "flags.convenientDescription", "");
            setProperty(data.effect, "flags.convenientDescription", "");
        }
        return data;
    }
    _keySelected(event) {
        const target = event.target;
        if (target.selectedIndex === 0)
            return; // Account for dummy element 0
        $(target.parentElement.parentElement.parentElement.children[0]).find(".awesomplete").val(target.value);
        return this.submit({ preventClose: true }).then(() => this.render());
    }
    /* ----------------------------------------- */
    /** @override */
    activateListeners(html) {
        super.activateListeners(html);
        html.find(".keylist").change(this._keySelected.bind(this));
        html.find(".awesomplete").on("awesomplete-selectcomplete", this._textSelected.bind(this));
        // html.find("value").onDrop = ev => this._onDrop(ev);
        // this.form.ondrop = ev => this._onDrop(ev);
    }
    /* ----------------------------------------- */
    _textSelected(event) {
        return this.submit({ preventClose: true }).then(() => this.render());
    }
    _onDragStart(ev) { }
    _onDrop(ev) {
        ev.preventDefault();
        //@ts-ignore
        const data = TextEditor.getDragEventData(ev);
        if (data.uuid)
            ev.target.value += data.uuid;
    }
    // TODO find out how to do this proerply
    async _renderOuter(options) {
        let html = await super._renderOuter(options);
        $(html).find(".window-content").css({ overflow: "visible" });
        return html;
    }
    /* ----------------------------------------- */
    _onEffectControl(event) {
        event.preventDefault();
        const button = event.currentTarget;
        switch (button.dataset.action) {
            case "add":
                this._addEffectChange();
            case "delete":
                return confirmAction(confirmDelete, () => {
                    button.closest(".effect-change").remove();
                    this.submit({ preventClose: true }).then(() => this.render());
                });
            case "add-specDur":
                this._addSpecDuration();
                return this.submit({ preventClose: true }).then(() => this.render());
            case "delete-specDur":
                return confirmAction(confirmDelete, () => {
                    button.closest(".effect-special-duration").remove();
                    this.submit({ preventClose: true }).then(() => this.render());
                });
        }
    }
    _addSpecDuration() {
        const idx = this.object.flags?.dae.specialDuration?.length ?? 0;
        if (idx === 0)
            setProperty(this.object, "flags.dae.specialDuration", []);
        return this.submit({
            preventClose: true, updateData: {
                //@ts-ignore
                [`flags.dae.specialDuration.${idx}`]: ""
            }
        });
    }
    /* ----------------------------------------- */
    async _addEffectChange() {
        //@ts-expect-error .document
        const idx = (this.document ?? this.object).changes.length;
        return this.submit({
            preventClose: true, updateData: {
                //@ts-ignore
                [`changes.${idx}`]: { key: "", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "" }
            }
        });
    }
    _getSubmitData(updateData = {}) {
        //@ts-expect-error getSubmitData
        const data = super._getSubmitData(updateData);
        for (let change of data.changes) {
            if (change.priority === undefined)
                change.priority = change.mode ? change.mode * 10 : 0;
            if (typeof change.priority === "string")
                change.priority = Number(change.priority);
        }
        if (data.disabledX !== undefined) {
            data.disabled = data.disabledX;
            delete data.disabledX;
        }
        if (!data.tint || data.tint === "")
            data.tint = null;
        // fixed for very old items
        if (this.object.origin?.includes("OwnedItem."))
            data.origin = this.object.origin.replace("OwnedItem.", "Item.");
        setProperty(data.flags, "dae.specialDuration", Array.from(Object.values(data.flags?.dae?.specialDuration ?? {})));
        return data;
    }
    /* ----------------------------------------- */
    /** @override */
    async _updateObject(event, formData) {
        if (formData.duration) {
            //@ts-ignore isNumeric
            if (Number.isNumeric(formData.duration?.startTime) && Math.abs(Number(formData.duration.startTime) < 3600)) {
                let startTime = parseInt(formData.duration.startTime);
                if (Math.abs(startTime) <= 3600) { // Only acdept durations of 1 hour or less as the start time field
                    formData.duration.startTime = game.time.worldTime + parseInt(formData.duration.startTime);
                }
            }
            else if (this.object.parent.isOwned)
                formData.duration.startTime = null;
        }
        await this.object.update(formData);
    }
}
export function geti18nTranslations() {
    let translations = game.i18n.translations["dae"];
    //@ts-ignore _fallback not accessible
    if (!translations)
        translations = game.i18n._fallback["dae"];
    return translations ?? {};
}