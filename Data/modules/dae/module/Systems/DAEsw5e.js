import { applyDaeEffects, daeSystemClass } from "../dae.js";
import { DAESystemDND5E } from "./DAEdnd5e.js";
import { ValidSpec, wildcardEffects } from "./DAESystem.js";
//@ts-ignore
const CONFIG = globalThis.CONFIG;
export class DAESystemSW5E extends DAESystemDND5E {
    static get systemConfig() {
        return CONFIG.SW5E;
    }
    static modifyBaseValues(actorType, baseValues, characterSpec) {
        super.modifyBaseValues(actorType, baseValues, characterSpec);
        let charFlagKeys = Object.keys(CONFIG.SW5E.characterFlags);
        charFlagKeys.forEach(key => {
            let theKey = `flags.sw5e.${key}`;
            if ([`flags.sw5e.weaponCriticalThreshold`,
                `flags.sw5e.powerCriticalThreshold`,
                `flags.sw5e.meleeCriticalDamageDice`,
                `flags.dnd5e.spellCriticalThreshold`].includes(theKey)) {
                delete baseValues[theKey];
            }
        });
    }
    static modifySpecials(actorType, specials, characterSpec) {
        super.modifySpecials(actorType, specials, characterSpec);
        //@ts-ignore
        const ACTIVE_EFFECT_MODES = CONST.ACTIVE_EFFECT_MODES;
        specials["system.traits.sdi.all"] = [false, ACTIVE_EFFECT_MODES.CUSTOM];
        specials["system.traits.sdi.value"] = ["", -1];
        specials["system.traits.sdi.custom"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
        specials["system.traits.sdr.all"] = [false, ACTIVE_EFFECT_MODES.CUSTOM];
        specials["system.traits.sdr.value"] = ["", -1];
        specials["system.traits.sdr.custom"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
        specials["system.traits.sdv.all"] = [false, ACTIVE_EFFECT_MODES.CUSTOM];
        specials["system.traits.sdv.value"] = ["", -1];
        specials["system.traits.sdv.custom"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
        specials["system.attributes.powerForceLightDC"] = [0, ACTIVE_EFFECT_MODES.CUSTOM];
        specials["system.attributes.powerForceDarkDC"] = [0, ACTIVE_EFFECT_MODES.CUSTOM];
        specials["system.attributes.powerForceUnivDC"] = [0, ACTIVE_EFFECT_MODES.CUSTOM];
        specials["system.attributes.powerTechDC"] = [0, ACTIVE_EFFECT_MODES.CUSTOM];
        // move all the characteer flags to specials so that the can be custom effects only
        let charFlagKeys = Object.keys(CONFIG.SW5E.characterFlags);
        charFlagKeys.forEach(key => {
            let theKey = `flags.sw5e.${key}`;
            if ([`flags.sw5e.weaponCriticalThreshold`,
                `flags.sw5e.powerCriticalThreshold`,
                `flags.sw5e.meleeCriticalDamageDice`,
                `flags.sw5e.spellCriticalThreshold`].includes(theKey)) {
                specials[theKey] = [0, -1];
            }
        });
    }
    static async editConfig() {
        if (game.system.id === "sw5e") {
            try {
                const armorPack = game.packs.get("sw5e.armor");
                let pack;
                const profs = [
                    { type: "tool", list: this.toolProfList },
                    { type: "armor", list: this.armorProfList },
                    { type: "weapon", list: this.weaponProfList }
                ];
                for (let { type, list } of profs) {
                    let choices = CONFIG.SW5E[`${type}Proficiencies`];
                    const ids = CONFIG.SW5E[`${type}Ids`];
                    if (ids !== undefined) {
                        const typeProperty = (type !== "armor") ? `${type}Type` : `armor.type`;
                        for (const [key, id] of Object.entries(ids)) {
                            const item = await fromUuid(`Compendium.${id}`);
                            list[key] = item.name;
                        }
                    }
                }
                this.profInit = true;
            }
            catch (err) {
                console.error(err);
                this.profInit = false;
            }
        }
    }
    static configureLists(daeConfig) {
        daeSystemClass.traitList = duplicate(CONFIG.SW5E.damageResistanceTypes);
        Object.keys(CONFIG.SW5E.damageResistanceTypes).forEach(type => {
            daeSystemClass.traitList[`-${type}`] = `-${CONFIG.SW5E.damageResistanceTypes[type]}`;
        });
        daeSystemClass.languageList = duplicate(CONFIG.SW5E.languages);
        Object.keys(CONFIG.SW5E.languages).forEach(type => {
            daeSystemClass.languageList[`-${type}`] = `-${CONFIG.SW5E.languages[type]}`;
        });
        daeSystemClass.conditionList = duplicate(CONFIG.SW5E.conditionTypes);
        Object.keys(CONFIG.SW5E.conditionTypes).forEach(type => {
            daeSystemClass.conditionList[`-${type}`] = `-${CONFIG.SW5E.conditionTypes[type]}`;
        });
        if (daeSystemClass.profInit) {
            daeSystemClass.toolProfList = daeSystemClass.toolProfList;
            daeSystemClass.armorProfList = daeSystemClass.armorProfList;
            daeSystemClass.weaponProfList = daeSystemClass.weaponProfList;
        }
        else {
            daeSystemClass.toolProfList = duplicate(CONFIG.SW5E.toolProficiencies);
            Object.keys(CONFIG.SW5E.toolProficiencies).forEach(type => {
                daeSystemClass.toolProfList[`-${type}`] = `-${CONFIG.SW5E.toolProficiencies[type]}`;
            });
            daeSystemClass.armorProfList = duplicate(CONFIG.SW5E.armorProficiencies);
            Object.keys(CONFIG.SW5E.armorProficiencies).forEach(type => {
                daeSystemClass.armorProfList[`-${type}`] = `-${CONFIG.SW5E.armorProficiencies[type]}`;
            });
            daeSystemClass.weaponProfList = duplicate(CONFIG.SW5E.weaponProficiencies);
            Object.keys(CONFIG.SW5E.weaponProficiencies).forEach(type => {
                daeSystemClass.weaponProfList[`-${type}`] = `-${CONFIG.SW5E.weaponProficiencies[type]}`;
            });
        }
    }
    static get applyBaseEffectsFunc() {
        return applyBaseActiveEffectssw5e;
    }
    static getOptionsForSpec(spec) {
        if (spec.includes("system.skills") && spec.includes("ability"))
            return CONFIG.SW5E.abilities;
        return super.getOptionsForSpec(spec);
    }
    static initSystemData() {
        super.initSystemData();
        daeSystemClass.daeActionTypeKeys = daeSystemClass.daeActionTypeKeys.concat(Object.keys(CONFIG.SW5E.itemActionTypes));
        daeSystemClass.spellAttacks = daeSystemClass.spellAttacks.concat(["mpak", "rpak"]);
    }
    static initActions() {
        super.initActions();
    }
}
// this function replaces applyActiveEffects in Actor
function applyBaseActiveEffectssw5e() {
    if (this._prepareScaleValues)
        this._prepareScaleValues();
    // The Active Effects do not have access to their parent at preparation time, so we wait until this stage to
    // determine whether they are suppressed or not.
    this.effects.forEach(e => e.determineSuppression());
    applyDaeEffects.bind(this)(ValidSpec.specs[this.type].baseSpecsObj, {}, false, wildcardEffects, []);
}
if (!globalThis.daeSystems)
    globalThis.daeSystems = {};
setProperty(globalThis.daeSystems, "sw5e", DAESystemSW5E);