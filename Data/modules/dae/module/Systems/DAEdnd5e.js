import { daeSpecialDurations, debug, error, i18n, log, warn } from "../../dae.js";
import { actionQueue, addConvenientEffectsChange, addCreateItemChange, addCubChange, addTokenMagicChange, applyDaeEffects, daeMacro, daeSystemClass, fetchParams, libWrapper, noDupDamageMacro, prepareLastArgData, removeConvenientEffectsChange, removeCreateItemChange, removeCubChange, removeTokenMagicChange } from "../dae.js";
import { ValidSpec, wildcardEffects } from "./DAESystem.js";
var displayTraits;
var specialTraitsPatched = false;
var d20Roll;
var dice;
// @ts-ignore
const CONFIG = globalThis.CONFIG;
export class DAESystemDND5E extends CONFIG.DAE.systemClass {
    traitList;
    languageList;
    conditionList;
    bypassesList;
    customDamageResistanceList;
    armorClassCalcList;
    static profInit;
    static toolProfList;
    static armorProfList;
    static weaponProfList;
    static get systemConfig() {
        return CONFIG.DND5E;
    }
    static modifyBaseValues(actorType, baseValues, characterSpec) {
        super.modifyBaseValues(actorType, baseValues, characterSpec);
        //@ts-ignore
        const modes = CONST.ACTIVE_EFFECT_MODES;
        baseValues["system.attributes.prof"] = [0, -1];
        ;
        baseValues["system.details.level"] = [0, -1];
        baseValues["system.attributes.ac.bonus"] = [0, -1];
        baseValues["system.attributes.ac.base"] = [0, -1];
        ;
        baseValues["system.attributes.ac.cover"] = [0, -1];
        ;
        baseValues["system.attributes.ac.calc"] = ["", modes.OVERRIDE];
        baseValues["system.attributes.ac.formula"] = ["", -1];
        if (characterSpec.system.bonuses) {
            // system.attributes.prof/system.details.level and system.attributes.hd are all calced in prepareBaseData
            baseValues["system.bonuses.All-Attacks"] = ["", -1];
            baseValues["system.bonuses.weapon.attack"] = ["", -1];
            baseValues["system.bonuses.spell.attack"] = ["", -1];
            baseValues["system.bonuses.All-Damage"] = ["", -1];
            baseValues["system.bonuses.weapon.damage"] = ["", -1];
            baseValues["system.bonuses.spell.damage"] = ["", -1];
            // These are for item action types - works by accident.
            baseValues["system.bonuses.heal.damage"] = ["", -1];
            baseValues["system.bonuses.heal.attack"] = ["", -1];
            baseValues["system.bonuses.save.damage"] = ["", -1];
            baseValues["system.bonuses.check.damage"] = ["", -1];
            baseValues["system.bonuses.abil.damage"] = ["", -1];
            baseValues["system.bonuses.other.damage"] = ["", -1];
            baseValues["system.bonuses.util.damage"] = ["", -1];
        }
        // move all the characteer flags to specials so that the can be custom effects only
        let charFlagKeys = Object.keys(daeSystemClass.systemConfig.characterFlags);
        charFlagKeys.forEach(key => {
            let theKey = `flags.${game.system.id}.${key}`;
            if ([`flags.${game.system.id}.weaponCriticalThreshold`,
                `flags.${game.system.id}.meleeCriticalDamageDice`,
                `flags.${game.system.id}.spellCriticalThreshold`].includes(theKey)) {
                delete baseValues[theKey];
            }
            else
                baseValues[theKey] = false;
        });
        // Need to add spellSniper by hand
        baseValues[`flags.${game.system.id}.spellSniper`] = false;
        if (game.modules.get("skill-customization-5e")?.active && game.system.id === "dnd5e") {
            Object.keys(daeSystemClass.systemConfig.skills).forEach(skl => {
                baseValues[`flags.skill-customization-5e.${skl}.skill-bonus`] = "";
            });
        }
        //TODO work out how to evaluate this to a number in prepare data - it looks like this is wrong
        if (characterSpec.system.bonuses)
            baseValues["system.bonuses.spell.dc"] = 0;
        Object.keys(baseValues).forEach(key => {
            // can't modify many spell details.
            if (key.includes("system.spells")) {
                delete baseValues[key];
            }
            if (key.includes("system.spells") && key.includes("override")) {
                baseValues[key] = 0;
            }
        });
        /*
        baseValues["system.traits.di.all"] = false;
        baseValues["system.traits.di.value"] = "";
        baseValues["system.traits.di.custom"] = "";
        baseValues["system.traits.di.bypasses"] = "";
        baseValues["system.traits.dr.all"] = false;
        baseValues["system.traits.dr.value"] = "";
        baseValues["system.traits.dr.bypasses"] = "";
        baseValues["system.traits.dr.custom"] = "";
        baseValues["system.traits.dv.all"] = false;
        baseValues["system.traits.dv.value"] = "";
        baseValues["system.traits.dv.bypasses"] = "";
        baseValues["system.traits.dv.custom"] = "";
        baseValues["system.traits.ci.all"] = false;
        baseValues["system.traits.ci.value"] = "";
        baseValues["system.traits.ci.custom"] = "";
        baseValues["system.traits.size"] = "";
        */
        delete baseValues["system.attributes.init.total"];
        delete baseValues["system.attributes.init.mod"];
        delete baseValues["system.attributes.init.bonus"];
        delete baseValues["flags"];
        baseValues["system.traits.ci.all"] = [false, modes.CUSTOM];
        baseValues["system.traits.ci.value"] = ["", modes.CUSTOM];
        baseValues["system.traits.ci.custom"] = ["", modes.CUSTOM];
        if (["character", "npc"].includes(actorType) && game.system.id === "dnd5e") {
            if (game.settings.get("dnd5e", "honorScore")) {
                baseValues["system.abilities.hon.value"] = [0, -1];
                baseValues["system.abilities.hon.bonuses.save"] = ["", -1];
                baseValues["system.abilities.hon.bonuses.check"] = ["", -1];
            }
            if (game.settings.get("dnd5e", "sanityScore") && game.system.id === "dnd5e") {
                baseValues["system.abilities.san.value"] = [0, -1];
                baseValues["system.abilities.san.bonuses.save"] = ["", -1];
                baseValues["system.abilities.san.bonuses.check"] = ["", -1];
            }
        }
    }
    static modifySpecials(actorType, specials, characterSpec) {
        super.modifySpecials(actorType, specials, characterSpec);
        //@ts-expect-error
        const ACTIVE_EFFECT_MODES = CONST.ACTIVE_EFFECT_MODES;
        if (actorType === "vehicle") {
            specials["system.attributes.ac.motionless"] = [0, -1];
            specials["system.attributes.ac.flat"] = [0, -1];
        }
        else {
            specials["system.attributes.ac.value"] = [0, -1];
            specials["system.attributes.ac.min"] = [0, -1];
        }
        specials["system.attributes.hp.max"] = [0, -1];
        specials["system.attributes.hp.tempmax"] = [0, -1];
        specials["system.attributes.hp.min"] = [0, -1];
        specials["system.attributes.init.total"] = [0, -1];
        specials["system.attributes.init.bonus"] = [0, -1];
        for (let abl of Object.keys(daeSystemClass.systemConfig.abilities)) {
            specials["system.abilities.${abl}.dc"] = [0, ACTIVE_EFFECT_MODES.CUSTOM];
        }
        specials["system.attributes.encumbrance.max"] = [0, -1];
        specials["system.traits.di.all"] = [false, ACTIVE_EFFECT_MODES.CUSTOM];
        specials["system.traits.di.value"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
        specials["system.traits.di.custom"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
        specials["system.traits.di.bypasses"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
        specials["system.traits.dr.all"] = [false, ACTIVE_EFFECT_MODES.CUSTOM];
        specials["system.traits.dr.value"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
        specials["system.traits.dr.custom"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
        specials["system.traits.dr.bypasses"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
        specials["system.traits.dv.all"] = [false, ACTIVE_EFFECT_MODES.CUSTOM];
        specials["system.traits.dv.value"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
        specials["system.traits.dv.custom"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
        specials["system.traits.dv.bypasses"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
        // specials["system.traits.ci.all"] = [false, ACTIVE_EFFECT_MODES.CUSTOM];
        // specials["system.traits.ci.value"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
        // specials["system.traits.ci.custom"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
        specials["system.traits.size"] = ["", ACTIVE_EFFECT_MODES.OVERRIDE];
        specials["system.spells.pact.level"] = [0, -1];
        specials["flags.dae"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
        specials["system.attributes.movement.all"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
        specials["system.attributes.movement.hover"] = [0, ACTIVE_EFFECT_MODES.CUSTOM];
        specials["system.attributes.ac.EC"] = [0, -1];
        specials["system.attributes.ac.AR"] = [0, -1];
        if (characterSpec.system.attributes?.hd)
            specials["system.attributes.hd"] = [0, -1];
        if (characterSpec.system.traits?.weaponProf) {
            specials["system.traits.weaponProf.all"] = [false, ACTIVE_EFFECT_MODES.CUSTOM];
            specials["system.traits.weaponProf.value"] = ["", -1];
            specials["system.traits.weaponProf.custom"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
        }
        if (characterSpec.system.traits?.languages) {
            specials["system.traits.languages.all"] = [false, ACTIVE_EFFECT_MODES.CUSTOM];
            specials["system.traits.languages.value"] = ["", -1];
            specials["system.traits.languages.custom"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
        }
        if (characterSpec.system.traits?.armorProf) {
            specials["system.traits.armorProf.all"] = [false, ACTIVE_EFFECT_MODES.CUSTOM];
            specials["system.traits.armorProf.value"] = ["", -1];
            specials["system.traits.armorProf.custom"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
        }
        if (characterSpec.system.traits?.toolProf) {
            specials["system.traits.toolProf.all"] = [false, ACTIVE_EFFECT_MODES.CUSTOM];
            specials["system.traits.toolProf.value"] = ["", -1];
            specials["system.traits.toolProf.custom"] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
        }
        if (characterSpec.system.resources) {
            specials["system.resources.primary.max"] = [0, -1];
            specials["system.resources.primary.label"] = ["", ACTIVE_EFFECT_MODES.OVERRIDE];
            specials["system.resources.secondary.max"] = [0, -1];
            specials["system.resources.secondary.label"] = ["", ACTIVE_EFFECT_MODES.OVERRIDE];
            specials["system.resources.tertiary.max"] = [0, -1];
            specials["system.resources.tertiary.label"] = ["", ACTIVE_EFFECT_MODES.OVERRIDE];
            specials["system.resources.legact.max"] = [0, -1];
            specials["system.resources.legres.max"] = [0, -1];
            if (game.modules.get("resourcesplus")?.active) {
                for (let res of ["fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"]) {
                    specials[`system.resources.${res}.max`] = [0, -1];
                    specials[`system.resources.${res}.label`] = ["", ACTIVE_EFFECT_MODES.OVERRIDE];
                }
            }
            if (characterSpec.system.spells) {
                for (let spellSpec of Object.keys(characterSpec.system.spells))
                    specials[`system.spells.${spellSpec}.max`] = [0, -1];
            }
            if (["character", "npc"].includes(actorType) && game.system.id === "dnd5e") {
                if (game.settings.get("dnd5e", "honorScore")) {
                }
                if (game.settings.get("dnd5e", "sanityScore")) {
                    specials["system.abilities.san.value"] = [0, -1];
                }
            }
            /*/
            if (game.modules.get("resourcesplus")?.active) {
              const maxResources = Math.min(game.settings.get("resourcesplus", "globalLimit"), game.settings.get("resourcesplus", "localLimit"));
              if (maxResources > 3)  {
                const resourceLabels =  ["fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
                for (let i = 0; i < maxResources - 3; i++) {
                specials[`system.resources.${resourceLabels[i]}.max`] = [0, -1];
                specials[`system.resources.${resourceLabels[i]}.label`] = ["", ACTIVE_EFFECT_MODES.OVERRIDE];
                }
              }
            }
            /*/
        }
        specials[`flags.${game.system.id}.initiativeHalfProf`] = [false, ACTIVE_EFFECT_MODES.CUSTOM];
        specials[`flags.${game.system.id}.DamageBonusMacro`] = ["", ACTIVE_EFFECT_MODES.CUSTOM];
        specials[`flags.${game.system.id}.initiativeDisadv`] = [false, ACTIVE_EFFECT_MODES.CUSTOM];
        if (game.modules.get("tidy5e-sheet")?.active)
            specials["system.details.maxPreparedSpells"] = [0, -1];
        // change movement effects to be after prepareDerivedData
        for (let key of Object.keys(daeSystemClass.systemConfig.movementTypes)) {
            specials[`system.attributes.movement.${key}`] = [0, -1];
        }
        // move all the characteer flags to specials so that the can be custom effects only
        let charFlagKeys = Object.keys(daeSystemClass.systemConfig?.characterFlags ?? {});
        charFlagKeys.forEach(key => {
            let theKey = `flags.${game.system.id}.${key}`;
            if ([`flags.${game.system.id}.weaponCriticalThreshold`,
                `flags.${game.system.id}.powerCriticalThreshold`,
                `flags.${game.system.id}.meleeCriticalDamageDice`,
                `flags.${game.system.id}.spellCriticalThreshold`].includes(theKey)) {
                specials[theKey] = [0, -1];
            }
        });
    }
    static modifyDerivedSpecs(actorType, derivedSpecs, characterSpec) {
        super.modifyDerivedSpecs(actorType, derivedSpecs, characterSpec);
        // Do the system specific part
        // 1. abilities add mod and save to each;
        if (characterSpec.system.abilities)
            Object.keys(characterSpec.system.abilities).forEach(ablKey => {
                let abl = characterSpec.system.abilities[ablKey];
                derivedSpecs.push(new ValidSpec(`system.abilities.${ablKey}.mod`, 0));
                derivedSpecs.push(new ValidSpec(`system.abilities.${ablKey}.save`, 0));
                derivedSpecs.push(new ValidSpec(`system.abilities.${ablKey}.min`, 0));
            });
        // adjust specs for bonuses - these are strings, @fields are looked up but dice are not rolled.
        // Skills add mod, passive and bonus fields
        if (characterSpec.system.skills)
            Object.keys(characterSpec.system.skills).forEach(sklKey => {
                let skl = characterSpec.system.skills[sklKey];
                derivedSpecs.push(new ValidSpec(`system.skills.${sklKey}.mod`, 0));
                derivedSpecs.push(new ValidSpec(`system.skills.${sklKey}.passive`, 0));
            });
    }
    static modifyValidSpec(spec, validSpec) {
        //@ts-ignore
        const ACTIVE_EFFECT_MODES = CONST.ACTIVE_EFFECT_MODES;
        if (spec.includes("system.skills") && spec.includes("ability")) {
            validSpec.forcedMode = ACTIVE_EFFECT_MODES.OVERRIDE;
        }
        if (spec.includes("system.bonuses.abilities")) {
            validSpec.forcedMode = -1;
        }
        return validSpec;
    }
    // Any actions to be called on init Hook 
    static initActions() {
        warn("system is ", game.system);
        if (game.modules.get("dnd5e-custom-skills")?.active) {
            wildcardEffects.push(/system\.skills\..*\.value/);
            wildcardEffects.push(/system\.skills\..*\.ability/);
            wildcardEffects.push(/system\.skills\..*\.bonuses/);
            wildcardEffects.push(/system\.abilities\..*\.value/);
        }
        dice = game[game.system.id].dice;
        if (!dice)
            error("Dice not defined! Many things won't work");
        else
            d20Roll = dice?.d20Roll;
        game.settings.register("dae", "displayTraits", {
            scope: "world",
            default: false,
            config: true,
            type: Boolean,
            onChange: fetchParams,
            name: game.i18n.localize("dae.displayTraits.Name"),
            hint: game.i18n.localize("dae.displayTraits.Hint"),
        });
        // We will call this in prepareData
        libWrapper.register("dae", "CONFIG.Actor.documentClass.prototype.applyActiveEffects", this.applyBaseEffectsFunc, "OVERRIDE");
        // Add flags to roll data so they can be referenced in effects
        libWrapper.register("dae", "CONFIG.Actor.documentClass.prototype.getRollData", getRollData, "WRAPPER");
        // Overide prepareData so it can add the extra pass
        libWrapper.register("dae", "CONFIG.Actor.documentClass.prototype.prepareData", prepareData, "WRAPPER");
        // Fix for dnd5e broken determine suppression (does not work for unlinked actors) + support condition immunity
        libWrapper.register("dae", "CONFIG.ActiveEffect.documentClass.prototype.determineSuppression", determineSuppression, "OVERRIDE");
        // This supplies DAE custom effects - the main game
        Hooks.on("applyActiveEffect", this.daeCustomEffect.bind(this));
        // done here as it references some .system data
        Hooks.on("preUpdateItem", preUpdateItemHook);
    }
    static setupActions() {
    }
    static readyActions() {
        // checkArmorDisabled();
        // Modify armor attribution for DAE specific cases
        patchPrepareArmorClassAttribution();
        Hooks.on("dae.settingsChanged", () => {
            patchSpecialTraits();
        });
        patchSpecialTraits();
        if (game.modules.get("midi-qol")?.active) {
            daeSpecialDurations["1Action"] = i18n("dae.1Action");
            daeSpecialDurations["1Spell"] = i18n("dae.1Spell");
            //@ts-ignore
            daeSpecialDurations["1Attack"] = game.i18n.format("dae.1Attack", { type: `${i18n("dae.spell")}/${i18n("dae.weapon")} ${i18n("dae.attack")}` });
            daeSpecialDurations["1Hit"] = game.i18n.format("dae.1Hit", { type: `${i18n("dae.spell")}/${i18n("dae.weapon")}` });
            //    daeSpecialDurations["1Hit"] = i18n("dae.1Hit");
            daeSpecialDurations["1Reaction"] = i18n("dae.1Reaction");
            let attackTypes = ["mwak", "rwak", "msak", "rsak"];
            if (game.system.id === "sw5e")
                attackTypes = ["mwak", "rwak", "mpak", "rpak"];
            attackTypes.forEach(at => {
                //@ts-ignore
                daeSpecialDurations[`1Attack:${at}`] = `${daeSystemClass.systemConfig.itemActionTypes[at]}: ${game.i18n.format("dae.1Attack", { type: daeSystemClass.systemConfig.itemActionTypes[at] })}`;
                daeSpecialDurations[`1Hit:${at}`] = `${daeSystemClass.systemConfig.itemActionTypes[at]}: ${game.i18n.format("dae.1Hit", { type: daeSystemClass.systemConfig.itemActionTypes[at] })}`;
            });
            daeSpecialDurations["DamageDealt"] = i18n("dae.DamageDealt");
            daeSpecialDurations["isAttacked"] = i18n("dae.isAttacked");
            daeSpecialDurations["isDamaged"] = i18n("dae.isDamaged");
            daeSpecialDurations["isHealed"] = i18n("dae.isHealed");
            daeSpecialDurations["zeroHP"] = i18n("dae.ZeroHP");
            daeSpecialDurations["isHit"] = i18n("dae.isHit");
            daeSpecialDurations["isSave"] = `${i18n("dae.isRollBase")} ${i18n("dae.isSaveDetail")}`;
            daeSpecialDurations["isSaveSuccess"] = `${i18n("dae.isRollBase")} ${i18n("dae.isSaveDetail")}: ${i18n("dae.success")}`;
            daeSpecialDurations["isSaveFailure"] = `${i18n("dae.isRollBase")} ${i18n("dae.isSaveDetail")}: ${i18n("dae.failure")}`;
            daeSpecialDurations["isCheck"] = `${i18n("dae.isRollBase")} ${i18n("dae.isCheckDetail")}`;
            daeSpecialDurations["isSkill"] = `${i18n("dae.isRollBase")} ${i18n("dae.isSkillDetail")}`;
            daeSpecialDurations["isInitiative"] = `${i18n("dae.isRollBase")} ${i18n("dae.isInitiativeDetail")}`;
            daeSpecialDurations["isMoved"] = i18n("dae.isMoved");
            daeSpecialDurations["longRest"] = i18n("DND5E.LongRest");
            daeSpecialDurations["shortRest"] = i18n("DND5E.ShortRest");
            daeSpecialDurations["newDay"] = `${i18n("DND5E.NewDay")}`;
            Object.keys(daeSystemClass.systemConfig.abilities).forEach(abl => {
                let ablString = daeSystemClass.systemConfig.abilities[abl];
                if (ablString.label)
                    ablString = ablString.label;
                daeSpecialDurations[`isSave.${abl}`] = `${i18n("dae.isRollBase")} ${ablString} ${i18n("dae.isSaveDetail")}`;
                daeSpecialDurations[`isSaveSuccess.${abl}`] = `${i18n("dae.isRollBase")} ${ablString} ${i18n("dae.isSaveDetail")}: ${i18n("dae.success")}`;
                daeSpecialDurations[`isSaveFailure.${abl}`] = `${i18n("dae.isRollBase")} ${ablString} ${i18n("dae.isSaveDetail")}: ${i18n("dae.failure")}`;
                daeSpecialDurations[`isCheck.${abl}`] = `${i18n("dae.isRollBase")} ${ablString} ${i18n("dae.isCheckDetail")}`;
            });
            Object.keys(daeSystemClass.systemConfig.damageTypes).forEach(dt => {
                daeSpecialDurations[`isDamaged.${dt}`] = `${i18n("dae.isDamaged")}: ${daeSystemClass.systemConfig.damageTypes[dt]}`;
            });
            daeSpecialDurations[`isDamaged.healing`] = `${i18n("dae.isDamaged")}: ${daeSystemClass.systemConfig.healingTypes["healing"]}`;
            Object.keys(daeSystemClass.systemConfig.skills).forEach(skillId => {
                daeSpecialDurations[`isSkill.${skillId}`] = `${i18n("dae.isRollBase")} ${i18n("dae.isSkillDetail")} ${daeSystemClass.systemConfig.skills[skillId].label}`;
            });
        }
        // Rely on suppression Hooks.on("updateItem", updateItem); // deal with disabling effects for unequipped items
    }
    static get applyBaseEffectsFunc() {
        return applyBaseActiveEffectsdnd5e;
    }
    static initSystemData() {
        // Setup attack types and expansion change mappings
        this.spellAttacks = ["msak", "rsak"];
        this.weaponAttacks = ["mwak", "rwak"];
        this.attackTypes = this.weaponAttacks.concat(this.spellAttacks);
        this.bonusSelectors = {
            "system.bonuses.All-Attacks": { attacks: this.attackTypes, selector: "attack" },
            "system.bonuses.weapon.attack": { attacks: this.weaponAttacks, selector: "attack" },
            "system.bonuses.spell.attack": { attacks: this.spellAttacks, selector: "attack" },
            "system.bonuses.All-Damage": { attacks: this.attackTypes, selector: "damage" },
            "system.bonuses.weapon.damage": { attacks: this.weaponAttacks, selector: "damage" },
            "system.bonuses.spell.damage": { attacks: this.spellAttacks, selector: "damage" }
        };
        daeSystemClass.daeActionTypeKeys = Object.keys(daeSystemClass.systemConfig.itemActionTypes);
    }
    static effectDisabled(actor, effect, itemData = null) {
        effect.determineSuppression();
        const disabled = effect.disabled || effect.isSuppressed;
        return disabled;
    }
    // For DAE Editor
    static configureLists(daeConfig) {
        // this.traitList = duplicate(daeSystemClass.systemConfig.damageResistanceTypes);
        this.traitList = duplicate(daeSystemClass.systemConfig.damageTypes);
        this.traitList = mergeObject(this.traitList, daeSystemClass.systemConfig.healingTypes);
        this.bypassesList = duplicate(daeSystemClass.systemConfig.physicalWeaponProperties);
        const drTypes = Object.values(daeSystemClass.systemConfig.damageResistanceTypes);
        const damageTypes = Object.values(daeSystemClass.systemConfig.damageTypes);
        this.customDamageResistanceList = drTypes.filter((drt) => !damageTypes.includes(drt))
            .reduce((obj, key) => { obj[key] = key; return obj; }, {});
        Object.keys(this.traitList).forEach(type => {
            this.traitList[`-${type}`] = `-${daeSystemClass.systemConfig.damageTypes[type]}`;
        });
        this.languageList = duplicate(daeSystemClass.systemConfig.languages);
        Object.keys(daeSystemClass.systemConfig.languages).forEach(type => {
            // V2.4 this.languageList[`-${type}`] = `-${daeSystemClass.systemConfig.languages[type]}`;
            //@ts-expect-error .version
            if (isNewerVersion(game.system.version, "2.3.9")) {
                this.languageList[`-${type}`] = `-${daeSystemClass.systemConfig.languages[type].label}`;
            }
            else
                this.languageList[`-${type}`] = `-${daeSystemClass.systemConfig.languages[type]}`;
        });
        this.armorClassCalcList = {};
        for (let acCalc in daeSystemClass.systemConfig.armorClasses) {
            this.armorClassCalcList[acCalc] = daeSystemClass.systemConfig.armorClasses[acCalc].label;
        }
        this.conditionList = duplicate(daeSystemClass.systemConfig.conditionTypes);
        Object.keys(daeSystemClass.systemConfig.conditionTypes).forEach(type => {
            this.conditionList[`-${type}`] = `-${daeSystemClass.systemConfig.conditionTypes[type]}`;
        });
        if (this.profInit) {
            this.toolProfList = this.toolProfList;
            this.armorProfList = this.armorProfList;
            this.weaponProfList = this.weaponProfList;
        }
        else {
            this.toolProfList = duplicate(daeSystemClass.systemConfig.toolProficiencies);
            Object.keys(daeSystemClass.systemConfig.toolProficiencies).forEach(type => {
                this.toolProfList[`-${type}`] = `-${daeSystemClass.systemConfig.toolProficiencies[type]}`;
            });
            this.armorProfList = duplicate(daeSystemClass.systemConfig.armorProficiencies);
            Object.keys(daeSystemClass.systemConfig.armorProficiencies).forEach(type => {
                this.armorProfList[`-${type}`] = `-${daeSystemClass.systemConfig.armorProficiencies[type]}`;
            });
            this.weaponProfList = duplicate(daeSystemClass.systemConfig.weaponProficiencies);
            Object.keys(daeSystemClass.systemConfig.weaponProficiencies).forEach(type => {
                this.weaponProfList[`-${type}`] = `-${daeSystemClass.systemConfig.weaponProficiencies[type]}`;
            });
        }
    }
    static getOptionsForSpec(spec) {
        if (spec === "system.traits.languages.value")
            return this.languageList;
        if (spec === "system.traits.ci.value")
            return this.conditionList;
        if (spec === "system.traits.toolProf.value")
            return this.toolProfList;
        if (spec === "system.traits.armorProf.value")
            return this.armorProfList;
        if (spec === "system.traits.weaponProf.value")
            return this.weaponProfList;
        if (["system.traits.di.value", "system.traits.dr.value", "system.traits.dv.value"].includes(spec))
            return this.traitList;
        if (["system.traits.di.custom", "system.traits.dr.custom", "system.traits.dv.custom"].includes(spec)) {
            return this.customDamageResistanceList;
        }
        if (spec === "system.attributes.ac.calc") {
            return this.armorClassCalcList;
        }
        if (["system.traits.di.bypasses", "system.traits.dr.bypasses", "system.traits.dv.bypasses"].includes(spec))
            return this.bypassesList;
        if (spec.includes("system.skills") && spec.includes("value"))
            return { 0: "Not Proficient", 0.5: "Half Proficiency", 1: "Proficient", 2: "Expertise" };
        if (spec.includes("system.skills") && spec.includes("ability")) {
            if (game.system.id === "dnd5e")
                return daeSystemClass.systemConfig.abilities;
        }
        if (spec === "system.traits.size")
            return daeSystemClass.systemConfig?.actorSizes;
        return super.getOptionsForSpec(spec);
    }
    static async editConfig() {
        if (game.system.id === "dnd5e") {
            try {
                const pack = game.packs.get(daeSystemClass.systemConfig.sourcePacks.ITEMS);
                const profs = [
                    { type: "tool", list: this.toolProfList },
                    { type: "armor", list: this.armorProfList },
                    { type: "weapon", list: this.weaponProfList }
                ];
                for (let { type, list } of profs) {
                    let choices = daeSystemClass.systemConfig[`${type}Proficiencies`];
                    const ids = daeSystemClass.systemConfig[`${type}Ids`];
                    if (ids !== undefined) {
                        const typeProperty = (type !== "armor") ? `${type}Type` : `armor.type`;
                        for (const [key, id] of Object.entries(ids)) {
                            const item = game.dnd5e.documents.Trait.getBaseItem(id, { indexOnly: true });
                            // const item = await pack.getDocument(id);
                            list[key] = item.name;
                        }
                    }
                }
                this.profInit = true;
            }
            catch (err) {
                this.profInit = false;
            }
        }
    }
    // Special case handling of (expr)dX
    static attackDamageBonusEval(bonusString, actor) {
        return bonusString;
        if (typeof bonusString === "string") {
            const special = bonusString.match(/\((.+)\)\s*d([0-9]+)(.*)/);
            // const special = bonusString.match(/\(([\s\S]+)\)\s+d([0-9]*)\)([\s\S]+)/);
            if (special && special.length >= 3) {
                try {
                    return new Roll(special[1].replace(/ /g, ""), actor.getRollData()).roll().total + "d" + special[2] + (special[3] ?? "");
                }
                catch (err) {
                    console?.warn(`DAE eval error for: ${special[1].replace(/ /g, "")} in actor ${actor.name}`, err);
                    return bonusString;
                }
            }
        }
        return `${bonusString || ""}`;
    }
    /*
     * do custom effefct applications
     * damage resistance/immunity/vulnerabilities
     * languages
     */
    static daeCustomEffect(actor, change, current, delta, changes) {
        if (!super.daeCustomEffect(actor, change))
            return;
        const systemConfig = daeSystemClass.systemConfig;
        // const current = getProperty(actor, change.key);
        var validValues;
        var value;
        if (typeof change?.key !== "string")
            return true;
        const damageBonusMacroFlag = `flags.${game.system.id}.DamageBonusMacro`;
        if (change.key === damageBonusMacroFlag) {
            let current = getProperty(actor, change.key);
            // includes wont work for macro names that are subsets of other macro names
            if (noDupDamageMacro && current?.split(",").some(macro => macro === change.value))
                return true;
            setProperty(actor, change.key, current ? `${current},${change.value}` : change.value);
            return true;
        }
        if (change.key.includes(`flags.${game.system.id}`)) {
            //@ts-ignore safeEval
            const value = new Boolean(Roll.safeEval(change.value)).valueOf(); // ["1", "true", 1, true].includes(change.value);
            setProperty(actor, change.key, value);
            return true;
        }
        if (change.key.startsWith("system.skills.") && change.key.endsWith(".value")) {
            const currentProf = getProperty(actor, change.key) || 0;
            const profValues = { "0.5": 0.5, "1": 1, "2": 2 };
            const upgrade = profValues[change.value];
            if (upgrade === undefined)
                return;
            let newProf = Number(currentProf) + upgrade;
            if (newProf > 1 && newProf < 2)
                newProf = 1;
            if (newProf > 2)
                newProf = 2;
            return setProperty(actor, change.key, newProf);
        }
        if (change.key.startsWith("system.abilities") && (change.key.endsWith("bonuses.save") || change.key.endsWith("bonuses.check"))) {
            value = change.value;
            if (!current)
                return setProperty(actor, change.key, value);
            value = current + ((change.value.startsWith("+") || change.value.startsWith("-")) ? change.value : "+" + change.value);
            return setProperty(actor, change.key, value);
        }
        /*
        if (change.key.startsWith("items.")) {
          let originalKey = duplicate(change.key);
          const fields = change.key.split("."); // items.contents.index......
          const index = fields[2];
          const itemKey = fields.slice(3).join(".")
          const item = actor.items.contents[index];
          let value = getProperty(item, itemKey);
          if (value === undefined) value = change.value;
          else if (value instanceof Array) {
            const newEntry = eval(change.value)
            value = value.concat([newEntry]);
          } else if (typeof value === "string") value = `${value} + ${change.value}`;
          //@ts-ignore
          else if (typeof value === "boolean") value = Roll.safeEval(change.value);
          //@ts-ignore
          else value = Roll.safeEval(value + change.value);
          setProperty(item, itemKey, value)
          return true;
        }
        */
        switch (change.key) {
            case "system.attributes.movement.hover":
                setProperty(actor, change.key, change.value ? true : false);
                return true;
            case "system.traits.di.all":
            case "system.traits.dr.all":
            case "system.traits.dv.all":
            case "system.traits.sdi.all":
            case "system.traits.sdr.all":
            case "system.traits.sdv.all":
                const key = change.key.replace(".all", ".value");
                if (getProperty(actor, key) instanceof Set)
                    setProperty(actor, key, new Set(Object.keys(systemConfig.damageResistanceTypes).filter(k => !["healing", "temphp"].includes(k))));
                else
                    setProperty(actor, key, Object.keys(systemConfig.damageResistanceTypes).filter(k => !["healing", "temphp"].includes(k)));
                return true;
            case "system.traits.di.value":
            case "system.traits.dr.value":
            case "system.traits.dv.value":
            case "system.traits.sdi.value":
            case "system.traits.sdr.value":
            case "system.traits.sdv.value":
                return super.doCustomArrayValue(actor, current, change, Object.keys(systemConfig.damageResistanceTypes));
            case "system.traits.di.bypasses":
            case "system.traits.dr.bypasses":
            case "system.traits.dv.bypasses":
                return super.doCustomArrayValue(actor, current, change, Object.keys(systemConfig.physicalWeaponProperties));
            case "system.traits.di.custom":
            case "system.traits.dr.custom":
            case "system.traits.dv.custom":
            case "system.traits.sdi.custom":
            case "system.traits.sdr.custom":
            case "system.traits.sdv.custom":
            case "system.traits.ci.custom":
                value = (current ?? "").length > 0 ? current.trim().split(";").map(s => s.trim()) : [];
                const traitSet = new Set(value);
                traitSet.add(change.value);
                value = Array.from(traitSet).join("; ");
                setProperty(actor, change.key, value);
                return true;
            case "system.traits.languages.custom":
            case "system.traits.toolProf.custom":
            case "system.traits.armorProf.custom":
            case "system.traits.weaponProf.custom":
                value = (current ?? "").length > 0 ? current.trim().split(";").map(s => s.trim()) : [];
                const setValue = new Set(value);
                setValue.add(change.value);
                value = Array.from(setValue).join("; ");
                setProperty(actor, change.key, value);
                return true;
            case "system.traits.languages.all":
                if (actor.system.traits.languages.value instanceof Set)
                    setProperty(actor, "system.traits.languages.value", new Set(Object.keys(systemConfig.languages)));
                else
                    setProperty(actor, "system.traits.languages.value", Object.keys(systemConfig.languages));
                return true;
            case "system.traits.languages.value":
                return super.doCustomArrayValue(actor, current, change, Object.keys(systemConfig.languages));
            case "system.traits.ci.all":
                if (actor.system.traits.ci.value instanceof Set)
                    setProperty(actor, "system.traits.ci.value", new Set(Object.keys(systemConfig.conditionTypes)));
                else
                    setProperty(actor, "system.traits.ci.value", Object.keys(systemConfig.conditionTypes));
                return true;
            case "system.traits.ci.value":
                return super.doCustomArrayValue(actor, current, change, Object.keys(systemConfig.conditionTypes));
            case "system.traits.toolProf.value":
                return super.doCustomArrayValue(actor, current, change, Object.keys(systemConfig.toolProficiencies));
            case "system.traits.toolProf.all":
                if (actor.system.traits.toolProf.value instanceof Set)
                    setProperty(actor, "system.traits.toolProf.value", new Set(Object.keys(systemConfig.toolProficiencies)));
                else
                    setProperty(actor, "system.traits.toolProf.value", Object.keys(systemConfig.toolProficiencies));
                return true;
            case "system.traits.armorProf.value":
                return super.doCustomArrayValue(actor, current, change, Object.keys(systemConfig.armorProficiencies));
            case "system.traits.armorProf.all":
                if (actor.system.traits.armorProf.value instanceof Set)
                    setProperty(actor, "system.traits.armorProf.value", new Set(Object.keys(systemConfig.armorProficiencies)));
                else
                    setProperty(actor, "system.traits.armorProf.value", Object.keys(systemConfig.armorProficiencies));
                return true;
            case "system.traits.weaponProf.value": // TODO v10 armor and weapon proiciencies
                return super.doCustomArrayValue(actor, current, change, Object.keys(systemConfig.weaponProficiencies));
            case "system.traits.weaponProf.all":
                if (actor.system.traits.weaponProf.value instanceof Set)
                    setProperty(actor, "system.traits.weaponProf.value", new Set(Object.keys(systemConfig.weaponProficiencies)));
                else
                    setProperty(actor, "system.traits.weaponProf.value", Object.keys(systemConfig.weaponProficiencies));
                return true;
            case "system.bonuses.weapon.damage":
                value = this.attackDamageBonusEval(change.value, actor);
                if (current)
                    value = (change.value.startsWith("+") || change.value.startsWith("-")) ? value : "+" + value;
                this.weaponAttacks.forEach(atType => actor.system.bonuses[atType].damage += value);
                return true;
            case "system.bonuses.spell.damage":
                value = this.attackDamageBonusEval(change.value, actor);
                if (current)
                    value = (change.value.startsWith("+") || change.value.startsWith("-")) ? value : "+" + value;
                this.spellAttacks.forEach(atType => actor.system.bonuses[atType].damage += value);
                return true;
            case "system.bonuses.mwak.attack":
            case "system.bonuses.mwak.damage":
            case "system.bonuses.rwak.attack":
            case "system.bonuses.rwak.damage":
            case "system.bonuses.msak.attack":
            case "system.bonuses.msak.damage":
            case "system.bonuses.mpak.attack":
            case "system.bonuses.mpak.damage":
            case "system.bonuses.rpak.attack":
            case "system.bonuses.rpak.damage":
            case "system.bonuses.rsak.attack":
            case "system.bonuses.rsak.damage":
            case "system.bonuses.heal.attack":
            case "system.bonuses.heal.damage":
            case "system.bonuses.abilities.save":
            case "system.bonuses.abilities.check":
            case "system.bonuses.abilities.skill":
            case "system.bonuses.power.forceLightDC":
            case "system.bonuses.power.forceDarkDC":
            case "system.bonuses.power.forceUnivDC":
            case "system.bonuses.power.techDC":
                // TODO: remove if fixed in core
                let result = this.attackDamageBonusEval(change.value, actor);
                value = result;
                if (current)
                    value = (result.startsWith("+") || result.startsWith("-")) ? result : "+" + result;
                setProperty(actor, change.key, (current || "") + value);
                return true;
            case "system.attributes.movement.all":
                const movement = actor.system.attributes.movement;
                let op = "";
                if (typeof change.value === "string") {
                    change.value = change.value.trim();
                    if (["+", "-", "/", "*"].includes(change.value[0])) {
                        op = change.value[0];
                    }
                }
                for (let key of Object.keys(movement)) {
                    if (["units", "hover"].includes(key))
                        continue;
                    let valueString = change.value;
                    if (op !== "") {
                        //@ts-ignore isNumeric
                        if (!movement[key])
                            continue;
                        valueString = `${movement[key]} ${change.value}`;
                    }
                    try {
                        //@ts-ignore
                        let result = (new Roll(valueString, actor.getRollData())).evaluate({ async: false }).total;
                        movement[key] = Math.floor(Math.max(0, result) + 0.5);
                    }
                    catch (err) {
                        console.warn(`dae | Error evaluating custom movement.all = ${valueString}`, key, err);
                    }
                }
                ;
                return true;
            //TODO review this for 1.5
            case "system.abilities.str.dc":
            case "system.abilities.dex.dc":
            case "system.abilities.int.dc":
            case "system.abilities.wis.dc":
            case "system.abilities.cha.dc":
            case "system.abilities.con.dc":
            case "system.bonuses.spell.dc":
            case "system.attributes.powerForceLightDC":
            case "system.attributes.powerForceDarkDC":
            case "system.attributes.powerForceUnivDC":
            case "system.attributes.powerTechDC":
                //@ts-ignore
                if (Number.isNumeric(change.value)) {
                    value = parseInt(change.value);
                }
                else {
                    try {
                        //@ts-ignore
                        value = (new Roll(change.value, actor.getRollData())).evaluate({ async: false }).total;
                    }
                    catch (err) { }
                    ;
                }
                if (value !== undefined) {
                    setProperty(actor, change.key, Number(current) + value);
                }
                else
                    return;
                // Spellcasting DC
                const ad = actor.system;
                const spellcastingAbility = ad.abilities[ad.attributes.spellcasting];
                ad.attributes.spelldc = spellcastingAbility ? spellcastingAbility.dc : 8 + ad.attributes.prof;
                if (actor.items) {
                    actor.items.forEach(item => {
                        item.getSaveDC();
                        item.getAttackToHit();
                    });
                }
                ;
                return true;
            case "flags.dae":
                let list = change.value.split(" ");
                const flagName = list[0];
                let formula = list.splice(1).join(" ");
                const rollData = actor.getRollData();
                const flagValue = getProperty(rollData.flags, `dae.${flagName}`) || 0;
                // ensure the flag is not undefined when doing the roll, supports flagName @flags.dae.flagName + 1
                setProperty(rollData, `flags.dae.${flagName}`, flagValue);
                //@ts-ignore evaluate 
                value = new Roll(formula, rollData).evaluate({ async: false }).total;
                setProperty(actor, `flags.dae.${flagName}`, value);
                return true;
        }
    }
}
// this function replaces applyActiveEffects in Actor
function applyBaseActiveEffectsdnd5e() {
    if (this._prepareScaleValues)
        this._prepareScaleValues();
    if (this.system?.prepareEmbeddedData instanceof Function)
        this.system.prepareEmbeddedData();
    // The Active Effects do not have access to their parent at preparation time, so we wait until this stage to
    // determine whether they are suppressed or not.
    // Handle traits.ci specially - they can disable other effects so need to be done at the very start.
    const traitsCI = {};
    traitsCI["system.traits.ci.all"] = ValidSpec.specs[this.type].baseSpecsObj["system.traits.ci.all"];
    traitsCI["system.traits.ci.value"] = ValidSpec.specs[this.type].baseSpecsObj["system.traits.ci.value"];
    applyDaeEffects.bind(this)(traitsCI, {}, false, wildcardEffects, []);
    this.effects.forEach(e => e.determineSuppression());
    applyDaeEffects.bind(this)(ValidSpec.specs[this.type].baseSpecsObj, {}, false, wildcardEffects, []);
}
function getRollData(wrapped, ...args) {
    const data = wrapped(...args);
    data.flags = this.flags;
    data.effects = this.effects;
    return data;
}
async function preparePassiveSkills() {
    const skills = this.system.skills;
    if (!skills)
        return;
    for (let skillId of Object.keys(skills)) {
        const skill = this.system.skills[skillId];
        const abilityId = skill.ability;
        const advdisadv = procAdvantageSkill(this, abilityId, skillId);
        skill.passive = skill.passive + 5 * advdisadv;
    }
}
function prepareData(wrapped) {
    try {
        debug("prepare data: before passes", this.name, this._source);
        const specialStatuses = new Map();
        if (isNewerVersion(game.version, "11.293")) {
            this.statuses = this.statuses ?? new Set();
            // Identify which special statuses had been active
            for (const statusId of Object.values(CONFIG.specialStatusEffects)) {
                specialStatuses.set(statusId, this.statuses.has(statusId));
            }
            this.statuses.clear();
        }
        setProperty(this, "flags.dae.onUpdateTarget", getProperty(this._source, "flags.dae.onUpdateTarget"));
        this.overrides = {};
        wrapped();
        const hasHeavy = this.items.find(i => i.system.equipped && i.system.stealth) !== undefined;
        if (hasHeavy)
            setProperty(this, "flags.midi-qol.disadvantage.skill.ste", true);
        applyDaeEffects.bind(this)(ValidSpec.specs[this.type].derivedSpecsObj, ValidSpec.specs[this.type].baseSpecsObj, true, [], wildcardEffects);
        preparePassiveSkills.bind(this)();
        // Fix for dnd5e _prepareSpellcasting overwriting the _source pact.value
        const pact = this.system.spells?.pact;
        if (pact)
            pact.value = this._source.system.spells.pact?.value;
        //TODO find another way to tdo this
        // this._prepareOwnedItems(this.items)
        if (isNewerVersion(game.version, "11.293")) {
            // Apply special statuses that changed to active tokens
            let tokens;
            for (const [statusId, wasActive] of specialStatuses) {
                const isActive = this.statuses.has(statusId);
                if (isActive === wasActive)
                    continue;
                tokens = tokens ?? this.getActiveTokens();
                for (const token of tokens)
                    token._onApplyStatusEffect(statusId, isActive);
            }
        }
        debug("prepare data: after passes", this);
    }
    catch (err) {
        console.error("Could not prepare data ", this.name, err);
    }
}
function procAdvantageSkill(actor, abilityId, skillId) {
    const midiFlags = actor.flags["midi-qol"] ?? {};
    const advantage = midiFlags.advantage ?? {};
    const disadvantage = midiFlags.disadvantage ?? {};
    let withAdvantage = advantage.all ?? false;
    let withDisadvantage = disadvantage.all ?? false;
    if (advantage.ability) {
        withAdvantage = withAdvantage || advantage.ability.all || advantage.ability.check?.all;
    }
    if (advantage.ability?.check) {
        withAdvantage = withAdvantage || advantage.ability.check[abilityId];
    }
    if (advantage.skill) {
        withAdvantage = withAdvantage || advantage.skill.all || advantage.skill[skillId];
    }
    if (disadvantage.ability) {
        withDisadvantage = withDisadvantage || disadvantage.all || disadvantage.ability.all || disadvantage.ability.check?.all;
    }
    if (disadvantage.ability?.check) {
        withDisadvantage = withDisadvantage || disadvantage.ability.check[abilityId];
    }
    if (disadvantage.skill) {
        withDisadvantage = withDisadvantage || disadvantage.skill.all || disadvantage.skill[skillId];
    }
    if ((withAdvantage && withDisadvantage) || (!withAdvantage && !withDisadvantage))
        return 0;
    else if (withAdvantage)
        return 1;
    else
        return -1;
}
function _prepareArmorClassAttribution(wrapped, data) {
    const attributions = wrapped(data);
    if (this.object?.effects) {
        for (let effect of this.object.effects) {
            for (let change of effect.changes) {
                //@ts-ignore .isNumeric - core does not look at ac.value or non-numeric ac.bonus
                if ((change.key === "system.attributes.ac.value" || change.key === "system.attributes.ac.bonus" && !Number.isNumeric(change.value)) && !effect.disabled && !effect.isSuppressed) {
                    attributions.push({
                        label: `${effect.name || effect.label} (dae)`,
                        mode: change.mode,
                        value: change.value
                    });
                }
            }
        }
    }
    return attributions;
}
function patchPrepareArmorClassAttribution() {
    if (game.system.id === "dnd5e") {
        libWrapper.register("dae", "CONFIG.Actor.sheetClasses.character['dnd5e.ActorSheet5eCharacter'].cls.prototype._prepareArmorClassAttribution", _prepareArmorClassAttribution, "WRAPPER");
        libWrapper.register("dae", "CONFIG.Actor.sheetClasses.npc['dnd5e.ActorSheet5eNPC'].cls.prototype._prepareArmorClassAttribution", _prepareArmorClassAttribution, "WRAPPER");
        libWrapper.register("dae", "CONFIG.Actor.sheetClasses.vehicle['dnd5e.ActorSheet5eVehicle'].cls.prototype._prepareArmorClassAttribution", _prepareArmorClassAttribution, "WRAPPER");
    }
    else if (game.system.id === "sw5e") {
        libWrapper.register("dae", "CONFIG.Actor.sheetClasses.character['sw5e.ActorSheet5eCharacter'].cls.prototype._prepareArmorClassAttribution", _prepareArmorClassAttribution, "WRAPPER");
        libWrapper.register("dae", "CONFIG.Actor.sheetClasses.npc['sw5e.ActorSheet5eNPC'].cls.prototype._prepareArmorClassAttribution", _prepareArmorClassAttribution, "WRAPPER");
        libWrapper.register("dae", "CONFIG.Actor.sheetClasses.vehicle['sw5e.ActorSheet5eVehicle'].cls.prototype._prepareArmorClassAttribution", _prepareArmorClassAttribution, "WRAPPER");
    }
}
// Patch for actor-flags app to display settings including active effects
function patchSpecialTraits() {
    displayTraits = game.settings.get("dae", "displayTraits");
    //@ts-ignore
    if (["dnd5e", "sw5e"].includes(game.system.id)) {
        log(`Patching game.${game.system.id}.applications.actor.ActorSheetFlags.prototype._updateObject (override=${displayTraits})`);
        log(`Patching game.${game.system.id}.applications.actor.ActorSheetFlags.prototype._getFlags (override=${displayTraits})`);
        log(`Patching game.${game.system.id}.applications.actor.ActorSheetFlags.prototype._getBonuses (override=${displayTraits})`);
        if (!displayTraits) {
            if (specialTraitsPatched) {
                libWrapper.unregister("dae", `game.${game.system.id}.applications.actor.ActorSheetFlags.prototype._updateObject`);
                libWrapper.unregister("dae", `game.${game.system.id}.applications.actor.ActorSheetFlags.prototype._getFlags`);
                libWrapper.unregister("dae", `game.${game.system.id}.applications.actor.ActorSheetFlags.prototype._getBonuses`);
            }
        }
        else {
            if (!specialTraitsPatched) {
                libWrapper.register("dae", `game.${game.system.id}.applications.actor.ActorSheetFlags.prototype._updateObject`, _updateObject, "OVERRIDE");
                libWrapper.register("dae", `game.${game.system.id}.applications.actor.ActorSheetFlags.prototype._getFlags`, _getFlags[game.system.id], "OVERRIDE");
                libWrapper.register("dae", `game.${game.system.id}.applications.actor.ActorSheetFlags.prototype._getBonuses`, _getBonuses[game.system.id], "OVERRIDE");
            }
        }
        specialTraitsPatched = displayTraits;
    }
}
const _getBonuses = { "dnd5e": _getBonusesdnd5e, "sw5e": _getBonusessw5e };
const _getFlags = { "dnd5e": _getFlagsdnd5e, "sw5e": _getFlagssw5e };
function _getFlagsdnd5e() {
    const flags = {};
    const baseData = this.document;
    for (let [k, v] of Object.entries(daeSystemClass.systemConfig.characterFlags)) {
        //@ts-ignore
        if (!flags.hasOwnProperty(v.section))
            flags[v.section] = {};
        let flag = duplicate(v);
        //@ts-ignore
        flag.type = v.type.name;
        //@ts-ignore
        flag.isCheckbox = v.type === Boolean;
        //@ts-ignore
        flag.isSelect = v.hasOwnProperty('choices');
        //@ts-ignore
        flag.value = getProperty(baseData.flags, `dnd5e.${k}`);
        //@ts-ignore
        flags[v.section][`flags.dnd5e.${k}`] = flag;
    }
    return flags;
}
function _getFlagssw5e() {
    const flags = {};
    const baseData = this.document;
    for (let [k, v] of Object.entries(daeSystemClass.systemConfig.characterFlags)) {
        //@ts-ignore
        if (!flags.hasOwnProperty(v.section))
            flags[v.section] = {};
        let flag = duplicate(v);
        //@ts-ignore
        flag.type = v.type.name;
        //@ts-ignore
        flag.isCheckbox = v.type === Boolean;
        //@ts-ignore
        flag.isSelect = v.hasOwnProperty('choices');
        //@ts-ignore
        flag.value = getProperty(baseData.flags, `sw5e.${k}`);
        //@ts-ignore
        flags[v.section][`flags.sw5e.${k}`] = flag;
    }
    return flags;
}
function _getBonusesdnd5e() {
    const bonuses = [
        { name: "system.bonuses.mwak.attack", label: "DND5E.BonusMWAttack" },
        { name: "system.bonuses.mwak.damage", label: "DND5E.BonusMWDamage" },
        { name: "system.bonuses.rwak.attack", label: "DND5E.BonusRWAttack" },
        { name: "system.bonuses.rwak.damage", label: "DND5E.BonusRWDamage" },
        { name: "system.bonuses.msak.attack", label: "DND5E.BonusMSAttack" },
        { name: "system.bonuses.msak.damage", label: "DND5E.BonusMSDamage" },
        { name: "system.bonuses.rsak.attack", label: "DND5E.BonusRSAttack" },
        { name: "system.bonuses.rsak.damage", label: "DND5E.BonusRSDamage" },
        { name: "system.bonuses.abilities.check", label: "DND5E.BonusAbilityCheck" },
        { name: "system.bonuses.abilities.save", label: "DND5E.BonusAbilitySave" },
        { name: "system.bonuses.abilities.skill", label: "DND5E.BonusAbilitySkill" },
        { name: "system.bonuses.spell.dc", label: "DND5E.BonusSpellDC" }
    ];
    for (let b of bonuses) {
        //@ts-ignore
        b.value = getProperty(this.object, b.name) || "";
    }
    return bonuses;
}
function _getBonusessw5e() {
    const bonuses = [
        { name: "system.bonuses.mwak.attack", label: "SW5E.BonusMWAttack" },
        { name: "system.bonuses.mwak.damage", label: "SW5E.BonusMWDamage" },
        { name: "system.bonuses.rwak.attack", label: "SW5E.BonusRWAttack" },
        { name: "system.bonuses.rwak.damage", label: "SW5E.BonusRWDamage" },
        { name: "system.bonuses.mpak.attack", label: "SW5E.BonusMPAttack" },
        { name: "system.bonuses.mpak.damage", label: "SW5E.BonusMPDamage" },
        { name: "system.bonuses.rpak.attack", label: "SW5E.BonusRPAttack" },
        { name: "system.bonuses.rpak.damage", label: "SW5E.BonusRPDamage" },
        { name: "system.bonuses.abilities.check", label: "SW5E.BonusAbilityCheck" },
        { name: "system.bonuses.abilities.save", label: "SW5E.BonusAbilitySave" },
        { name: "system.bonuses.abilities.skill", label: "SW5E.BonusAbilitySkill" },
        { name: "system.bonuses.spell.dc", label: "SW5E.BonusPowerlDC" }
    ];
    for (let b of bonuses) {
        //@ts-ignore
        b.value = getProperty(this.object, b.name) || "";
    }
    return bonuses;
}
async function _updateObject(event, formData) {
    const actor = this.object;
    let updateData = expandObject(formData);
    const src = actor.toObject();
    // Unset any flags which are "false"
    const flags = updateData.flags[game.system.id];
    for (let [k, v] of Object.entries(flags)) {
        //@ts-ignore
        if ([undefined, null, "", false, 0].includes(v)) {
            delete flags[k];
            if (hasProperty(src.flags, `${game.system.id}.${k}`)) {
                flags[`-=${k}`] = null;
            }
        }
    }
    // Clear any bonuses which are whitespace only
    for (let b of Object.values(updateData.system.bonuses)) {
        for (let [k, v] of Object.entries(b)) {
            b[k] = v.trim();
        }
    }
    // Diff the data against any applied overrides and apply
    await actor.update(diffObject(actor.overrides || {}, updateData), { diff: false });
}
function determineSuppression() {
    this.isSuppressed = false;
    if (this.disabled || (this.parent.documentName !== "Actor"))
        return;
    if (this.origin) {
        const originParts = this.origin.split(".");
        if (originParts[originParts.length - 2] === "Item") {
            const item = this.parent.items.get(originParts[originParts.length - 1]);
            if (item)
                this.isSuppressed = item.areEffectsSuppressed;
        }
    }
    if (this.parent) {
        const ci = this.parent.system.traits?.ci?.value;
        if (ci instanceof Set) {
            const statusId = (this.name || this.label || "no effect").toLocaleLowerCase();
            const capStatusId = duplicate(statusId).replace(statusId[0], statusId[0].toUpperCase());
            const ciSuppressed = ci?.has(statusId) || ci?.has(`Convenient Effect: ${capStatusId}`);
            this.disabled = Boolean(ciSuppressed);
        }
        else {
            const statusId = (this.name || this.label || "no effect").toLocaleLowerCase();
            const ciSuppressed = (ci?.length && ci.some(c => statusId == c));
            this.disabled = Boolean(ciSuppressed);
        }
    }
}
function preUpdateItemHook(candidate, updates, options, user) {
    if (!candidate.isOwned)
        return true;
    const actor = candidate.parent;
    if (!(actor instanceof Actor))
        return true;
    if (updates.system?.equipped === undefined && updates.system?.attunement === undefined)
        return true;
    try {
        const wasSuppressed = candidate.areEffectsSuppressed;
        const updatedItem = candidate.clone({
            "system.equipped": updates.system?.equipped ?? candidate.system.equipped,
            "system.attunement": updates.system?.attunement ?? candidate.system.attunement
        });
        const isSuppressed = updatedItem.areEffectsSuppressed;
        if (wasSuppressed === isSuppressed)
            return true;
        const tokens = actor.getActiveTokens();
        const token = tokens[0];
        for (let effect of actor.effects) {
            // if (!effect.transfer || effect.origin !== candidate.uuid) continue;
            if (!effect.transfer && !effect.flags?.dae?.transfer)
                continue;
            if (effect.origin !== candidate.uuid)
                continue;
            for (let change of effect.changes) {
                if (isSuppressed) {
                    switch (change.key) {
                        case "macro.CE":
                            const lastArg = prepareLastArgData(effect, actor);
                            removeConvenientEffectsChange(change.value, actor.uuid, effect.origin, actor.isToken, lastArg);
                            break;
                        case "macro.CUB":
                            removeCubChange(change.value, [token]);
                            break;
                        case "macro.tokenMagic":
                            removeTokenMagicChange(actor, change, tokens);
                            break;
                        case "macro.createItem":
                        case "macro.createItemRunMacro":
                            //@ts-expect-error
                            const effects = actor.effects.filter(ef => ef.origin === candidate.uuid && ef.flags?.dae?.transfer);
                            for (let effect of effects) {
                                removeCreateItemChange(change.value, actor, effect);
                            }
                            break;
                        default:
                    }
                }
                else {
                    switch (change.key) {
                        case "macro.CE":
                            const lastArg = prepareLastArgData(effect, actor);
                            addConvenientEffectsChange(change.value, actor.uuid, effect.origin, {}, actor.isToken, lastArg);
                            break;
                        case "macro.CUB":
                            addCubChange(change.value, [token]);
                            break;
                        case "macro.tokenMagic":
                            addTokenMagicChange(actor, change, tokens);
                            break;
                        case "macro.createItem":
                        case "macro.createItemRunMacro":
                            //@ts-expect-error
                            const effects = actor.effects.filter(ef => ef.origin === candidate.uuid && ef.flags?.dae?.transfer);
                            for (let effect of effects) {
                                addCreateItemChange(change, actor, effect);
                            }
                            break;
                        default:
                    }
                }
            } /*
            // Toggle macro.XX effects
            if (effect.changes.some(change => change.key.startsWith("macro.execute") || change.key.startsWith("macro.itemMacro") || change.key.startsWith("macro.actorUpdate")))
              setProperty(effect, "flags.dae.itemUuid", candidate.uuid);
            */
            warn("action queue add suppressed ", actionQueue._queue.length);
            actionQueue.add(daeMacro, isSuppressed ? "off" : "on", actor, effect.toObject(), actor.getRollData());
        }
    }
    catch (err) {
        console.warn("dae | preItemUpdate ", err);
    }
    finally {
        return true;
    }
}
if (!globalThis.daeSystems)
    globalThis.daeSystems = {};
setProperty(globalThis.daeSystems, "dnd5e", DAESystemDND5E);