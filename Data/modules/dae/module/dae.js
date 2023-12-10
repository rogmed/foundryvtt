import { applyActiveEffects, socketlibSocket } from "./GMAction.js";
import { warn, error, debug, setDebugLevel, i18n } from "../dae.js";
import { ActiveEffects } from "./apps/ActiveEffects.js";
import { DAEActiveEffectConfig } from "./apps/DAEActiveEffectConfig.js";
import { macroActorUpdate } from "./daeMacros.js";
import { ValidSpec } from "./Systems/DAESystem.js";
import { DAESystemDND5E } from "./Systems/DAEdnd5e.js";
import { DAESystemSW5E } from "./Systems/DAEsw5e.js";
let templates = {};
export var aboutTimeInstalled = false;
export var timesUpInstalled = false;
export var simpleCalendarInstalled = false;
export var cubActive;
export var ceActive;
export var atlActive;
export var furnaceActive;
export var itemacroActive;
export var midiActive;
export var statusCounterActive;
export var debugEnabled;
// export var useAbilitySave;
export var activeConditions;
export var confirmDelete;
export var ehnanceStatusEffects;
export var expireRealTime;
export var noDupDamageMacro;
export var disableEffects;
export var daeTitleBar;
export var daeNoTitleText;
export var libWrapper;
export var needStringNumericValues;
export var actionQueue;
export var linkedTokens;
export var CECustomEffectsItemUuid;
export var allMacroEffects = ["macro.execute", "macro.execute.local", "macro.execute.GM", "macro.itemMacro", "macro.itemMacro.local", "macro.itemMacro.GM", "macro.actorUpdate"];
export var macroDestination = {
    "macro.execute": "mixed",
    "macro.execute.local": "local",
    "macro.execute.GM": "GM",
    "macro.itemMacro": "mixed",
    "macro.itemMacro.local": "local",
    "macro.itemMacro.GM": "GM",
    "macro.actorUpdate": "local"
};
export var daeSystemClass;
if (!globalThis.daeSystems)
    globalThis.daeSystems = {};
// export var showDeprecation = true;
export var showInline = false;
let debugLog = true;
function flagChangeKeys(actor, change) {
    if (!(["dnd5e", "sw5e"].includes(game.system.id)))
        return;
    const hasSaveBonus = change.key.startsWith("data.abilities.") && change.key.endsWith(".save") && !change.key.endsWith(".bonuses.save");
    if (hasSaveBonus) {
        const saveBonus = change.key.match(/data.abilities.(\w\w\w).save/);
        const abl = saveBonus[1];
        console.error(`dae | deprecated change key ${change.key} found in ${actor.name} use system.abilities.${abl}.bonuses.save instead`);
        // change.key = `data.abilities.${abl}.bonuses.save`;
        return;
    }
    const hasCheckBonus = change.key.startsWith("data.abilities.") && change.key.endsWith(".mod");
    if (hasCheckBonus) {
        const checkBonus = change.key.match(/data.abilities.(\w\w\w).mod/);
        const abl = checkBonus[1];
        console.error(`dae | deprecated change key ${change.key} found in ${actor.name} use syatem.abilities.${abl}.bonuses.check instead`);
        // change.key = `data.abilities.${abl}.bonuses.check`;
        return;
    }
    const hasSkillMod = change.key.startsWith("data.skills") && change.key.endsWith(".mod");
    if (hasSkillMod) {
        const skillMod = change.key.match(/data.skills.(\w\w\w).mod/);
        const abl = skillMod[1];
        console.error(`dae | deprecated change key ${change.key} found in ${actor.name} use syatem.skills.${abl}.bonuses.check instead`);
        // change.key = `data.skills.${abl}.bonuses.check`;
        return;
    }
    const hasSkillPassive = change.key.startsWith("data.skills.") && !change.key.endsWith(".bonuses.passive") && change.key.endsWith(".passive");
    if (hasSkillPassive) {
        const skillPassive = change.key.match(/data.skills.(\w\w\w).passive/);
        const abl = skillPassive[1];
        console.error(`dae | deprecated change key ${change.key} found in ${actor.name} use syatem.skills.${abl}.bonuses.passive instead`);
        // change.key = `data.dkills.${abl}.bonuses.passive`;
        return;
    }
    const hasSkillBonus = change.key.startsWith("flags.skill-customization-5e");
    if (hasSkillBonus) {
        const skillPassive = change.key.match(/lags.skill-customization-5e.(\w\w\w).skill-bonus/);
        const abl = skillPassive[1];
        console.error(`dae | deprecated change key ${change.key} found in ${actor.name} use syatem.skills.${abl}.bonuses.check instead`);
        // change.key = `data.dkills.${abl}.bonuses.passive`;
        return;
    }
}
/*
 * Replace default appplyAffects to do value lookups
 */
export function applyDaeEffects(specList, completedSpecs, allowAllSpecs, wildCardsInclude, wildCardsExclude) {
    if (disableEffects)
        return;
    const overrides = {};
    const effects = this.effects.contents;
    if (isNewerVersion(game.version, "11.293") && !CONFIG.ActiveEffect.legacyTransferral) {
        effects.push(...this.items.contents.flatMap(i => i.transferredEffects));
    }
    if (!this.effects || this.effects.size === 0)
        return this.overrides || {};
    const changes = this.effects.reduce((changes, effect) => {
        if (daeSystemClass.effectDisabled(this, effect))
            return changes;
        if (isNewerVersion(game.version, "11.293") && effect.changes.some(c => specList[c.key] !== undefined)) {
            for (const statusId of effect.statuses) {
                this.statuses.add(statusId);
            }
        }
        // TODO find a solution for flags.? perhaps just a generic speclist
        return changes.concat(expandEffectChanges(effect.changes)
            .filter(c => {
            return !completedSpecs[c.key]
                && (allowAllSpecs || specList[c.key] !== undefined || wildCardsInclude.some(re => c.key.match(re) !== null))
                && (!wildCardsExclude.some(re => c.key.match(re) !== null))
                && !c.key.startsWith("ATL.");
        })
            .map(c => {
            c = duplicate(c);
            flagChangeKeys(this, c);
            if (c.key.startsWith("flags.midi-qol.optional")) { // patch for optional effects
                const parts = c.key.split(".");
                if (["save", "check", "skill", "damage", "attack"].includes(parts[parts.length - 1])) {
                    console.error(`dae/midi-qol | deprecation error ${c.key} should be ${c.key}.all on actor ${this.name}`);
                    c.key = `${c.key}.all`;
                }
            }
            if (c.key === "flags.midi-qol.OverTime")
                c.key = `flags.midi-qol.OverTime.${randomID()}`;
            c.effect = effect;
            if (["system.traits.ci.value", "system.traits.ci.all", "system.traits.ci.custom"].includes(c.key))
                c.priority = 0;
            else
                c.priority = c.priority ?? (c.mode * 10);
            return c;
        }));
    }, []);
    // Organize non-disabled effects by their application priority
    changes.sort((a, b) => a.priority - b.priority);
    if (changes.length > 0 && debugEnabled > 0)
        warn("Applying effect ", this.name, changes);
    // Apply all changes
    for (let c of changes) {
        if (!c.key)
            continue;
        //TODO remove @data sometime
        if (typeof c.value === "string" && c.value.includes("@data.")) {
            console.warn("dae | @data.key is deprecated, use @key instead", c.value);
            c.value = c.value.replace(/@data./g, "@");
        }
        const stackCount = c.effect.flags?.dae?.stacks ?? c.effect.flags?.dae?.statuscounter?.counter.value ?? 1;
        //@ts-ignore
        if (typeof specList[c.key]?.sampleValue !== "number" || c.mode === CONST.ACTIVE_EFFECT_MODES.CUSTOM)
            c.value = c.value.replace("@stackCount", stackCount);
        //@ts-ignore
        if (c.mode !== CONST.ACTIVE_EFFECT_MODES.CUSTOM) {
            if (typeof specList[c.key]?.sampleValue === "number" && typeof c.value === "string") {
                debug("appplyDaeEffects: Doing eval of ", c, c.value);
                const rollData = this.getRollData();
                rollData.stackCount = stackCount;
                c.value = c.value.replace("@item.level", "@itemLevel");
                //@ts-ignore replaceFormulaData
                let value = Roll.replaceFormulaData(c.value, rollData, { missing: 0, warn: false });
                try { // Roll parser no longer accepts some expressions it used to so we will try and avoid using it
                    if (needStringNumericValues) {
                        //@ts-ignore - this will throw an error if there are roll expressions
                        c.value = `${Roll.safeEval(value)}`;
                    }
                    else {
                        //@ts-ignore
                        c.value = Roll.safeEval(value);
                    }
                }
                catch (err) { // safeEval failed try a roll
                    try {
                        console.warn("dae | you are using dice expressions in a numeric field this will be disabled eventually");
                        console.warn(`Actor ${this.name} ${this.uuid} Change is ${c.key}: ${c.value}`);
                        //@ts-ignore evaluate - TODO work out how to do this async
                        c.value = `${new Roll(value).evaluate({ async: false }).total}`;
                    }
                    catch (err) {
                        console.warn("change value calculation failed for", this, c);
                        console.warn(err);
                    }
                }
            }
        }
        const currentValue = getProperty(this, c.key);
        if (typeof ValidSpec.specs[this.type].allSpecsObj[c.key]?.sampleValue === "number" && typeof currentValue !== "number") {
            //@ts-ignore coerce the value to a number
            const guess = Number.fromString ? Number.fromString(currentValue || "0") : Number(currentValue) || "0";
            if (!Number.isNaN(guess))
                setProperty(this, c.key, guess);
            else
                setProperty(this, c.key, 0);
        }
        const result = c.effect.apply(this, c);
        Object.assign(overrides, result);
    }
    // Expand the set of final overrides + merge sincey
    this.overrides = mergeObject(this.overrides || {}, expandObject(overrides) || {}, { inplace: true, overwrite: true });
}
function mySafeEval(expression, sandbox, onErrorReturn = undefined) {
    let result;
    try {
        const src = 'with (sandbox) { return ' + expression + '}';
        const evl = new Function('sandbox', src);
        //@ts-expect-error
        sandbox = mergeObject(sandbox, Roll.MATH_PROXY);
        result = evl(sandbox);
    }
    catch (err) {
        console.warn("midi-qol | expression evaluation failed ", expression, err);
        result = onErrorReturn;
    }
    //@ts-expect-error
    if (Number.isNumeric(result))
        return Number(result);
    return result;
}
;
function expandEffectChanges(changes) {
    let returnChanges = changes.reduce((list, change) => {
        if (!daeSystemClass.bonusSelectors[change.key]) {
            list.push(change);
        }
        else {
            const attacks = daeSystemClass.bonusSelectors[change.key].attacks;
            const selector = daeSystemClass.bonusSelectors[change.key].selector;
            attacks.forEach(at => {
                const c = duplicate(change);
                c.key = `system.bonuses.${at}.${selector}`;
                list.push(c);
            });
        }
        return list;
    }, []);
    return returnChanges;
}
//@ts-ignore
export async function addCreateItemChange(change, actor, effect) {
    await actionQueue.add(socketlibSocket.executeAsGM.bind(socketlibSocket), "createActorItem", { uuid: actor.uuid, itemDetails: change.value, effectUuid: effect.uuid, callItemMacro: change.key === "macro.createItemRunMacro" });
}
//@ts-ignore
export async function removeCreateItemChange(itemId, actor, effect) {
    let [uuid, option] = itemId.split(",").map(s => s.trim());
    if (option === "permanent")
        return; // don't delete permanent items
    if ((effect.flags?.dae?.itemsToDelete ?? []).length === 0)
        return;
    await actionQueue.add(socketlibSocket.executeAsGM.bind(socketlibSocket), "removeActorItem", { uuid: actor.uuid, itemUuid: itemId, itemUuids: effect.flags?.dae?.itemsToDelete });
}
export async function addTokenMagicChange(actor, change, tokens) {
    const tokenMagic = globalThis.TokenMagic;
    if (!tokenMagic)
        return;
    for (let token of tokens) {
        if (token.object)
            token = token.object; // in case we have a token document
        const tokenUuid = token.document.uuid;
        // Put this back if TMFX does awaited calls
        // await actionQueue.add(tokenMagic.addFilters, token, change.value); - see if gm execute solve problem
        await actionQueue.add(socketlibSocket.executeAsGM.bind(socketlibSocket), "applyTokenMagic", { tokenUuid, effectId: change.value });
    }
}
export async function removeTokenMagicChange(actor, change, tokens) {
    const tokenMagic = globalThis.TokenMagic;
    if (!tokenMagic)
        return;
    for (let token of tokens) {
        if (token.object)
            token = token.object; // in case we have a token document
        // put this back if TMFX does awaited calls
        // await actionQueue.add(tokenMagic.deleteFilters, token, change.value);
        const tokenUuid = token.document.uuid;
        await actionQueue.add(socketlibSocket.executeAsGM.bind(socketlibSocket), "removeTokenMagic", { tokenUuid, effectId: change.value });
    }
}
async function myRemoveCEEffect(effectName, uuid, origin, isToken, metaData) {
    const ceInterface = game?.dfreds?.effectInterface;
    let interval = 1;
    if (isNewerVersion("11.294", game.version))
        interval = isToken ? 250 : 1;
    await delay(interval); // let all of the stuff settle down
    return await ceInterface.removeEffect({ effectName, uuid, origin, metaData });
}
export async function removeConvenientEffectsChange(effectName, uuid, origin, isToken, metaData = {}) {
    if (isToken)
        await delay(1); // let all of the stuff settle down
    const returnValue = await actionQueue.add(myRemoveCEEffect, effectName, uuid, origin, isToken, metaData);
    return returnValue;
}
async function myAddCEEffectWith(effectData, uuid, origin, overlay, isToken) {
    const ceInterface = game?.dfreds?.effectInterface;
    let interval = 1;
    if (isNewerVersion("11.294", game.version))
        interval = isToken ? 250 : 0;
    if (interval)
        await delay(interval);
    return await ceInterface.addEffectWith({ effectData, uuid, origin, overlay: false });
}
export async function addConvenientEffectsChange(effectName, uuid, origin, context, isToken, CEmetaData = {}) {
    let ceEffect = game.dfreds.effects.all.find(e => (e.name || e.label) === effectName);
    if (!ceEffect)
        return;
    let effectData = mergeObject(ceEffect.toObject(), context.metaData);
    let returnValue;
    returnValue = await actionQueue.add(myAddCEEffectWith, effectData, uuid, origin, false, isToken);
    return returnValue;
}
export async function addCubChange(conditionName, tokens, options = {}) {
    const cubInterface = game?.cub;
    const isToken = tokens.find(t => t.actor.isToken);
    if (isToken)
        await new Promise(resolve => setTimeout(resolve, 1)); // let all of the stuff settle down
    if (cubInterface?.enhancedConditions.supported)
        await actionQueue.add(cubInterface.addCondition, conditionName, tokens);
}
export async function removeCubChange(conditionName, tokens, options = {}) {
    const cubInterface = game?.cub;
    const isToken = tokens.find(t => t.actor.isToken);
    if (isToken)
        await delay(1); // let all of the stuff settle down
    if (cubInterface?.enhancedConditions.supported)
        await actionQueue.add(cubInterface.removeCondition, conditionName, tokens, options);
}
export function prepareLastArgData(effect, actor, lastArgOptions = {}) {
    if (!effect.changes)
        return effect;
    let tokenUuid;
    if (actor.token)
        tokenUuid = actor.token.uuid;
    else {
        const selfTarget = getSelfTarget(actor);
        if (selfTarget.document)
            tokenUuid = selfTarget.document.uuid;
        else
            tokenUuid = selfTarget.uuid;
    }
    let lastArg = mergeObject(lastArgOptions, {
        //@ts-ignore - undefined fields
        effectId: effect.id,
        origin: effect.origin,
        efData: effect.toObject(false),
        actorId: actor.id,
        actorUuid: actor.uuid,
        tokenId: actor.token ? actor.token.id : getSelfTarget(actor)?.id,
        tokenUuid,
    }, { overwrite: false, insertKeys: true, insertValues: true, inplace: false });
    return lastArg;
}
function createActiveEffectHook(...args) {
    let [effect, context, userId] = args;
    if (userId !== game.user.id)
        return true;
    if (context.isUndo)
        return;
    const parent = effect.parent;
    //@ts-ignore documentClass TODO v10
    if (!parent || !(parent instanceof CONFIG.Actor.documentClass))
        return true;
    const actor = parent;
    const tokens = parent.isToken ? [parent.token.object] : parent.getActiveTokens();
    const token = tokens[0];
    effect.determineSuppression && effect.determineSuppression();
    if (effect.changes && !effect.disabled && !effect.isSuppressed) {
        let changeLoop = async () => {
            try {
                const selfAuraChange = getProperty(effect, "flags.ActiveAuras.isAura") === true
                    && getProperty(effect, "flags.ActiveAuras.ignoreSelf") === true
                    && effect.origin.startsWith(actor.uuid);
                // don't apply macro or macro like effects if active aura and not targeting self
                if (selfAuraChange)
                    return;
                for (let change of effect.changes) {
                    if (cubActive && change.key === "macro.CUB" && token) {
                        await addCubChange(change.value, [token]);
                    }
                    if (ceActive && change.key === "macro.CE") {
                        const lastArg = prepareLastArgData(effect, actor);
                        await addConvenientEffectsChange(change.value, actor.uuid, effect.origin, context, actor.isToken, lastArg);
                    }
                    if (["macro.createItem", "macro.createItemRunMacro"].includes(change.key)) {
                        await addCreateItemChange(change, actor, effect);
                    }
                    const tokenMagic = globalThis.TokenMagic;
                    if (tokenMagic && change.key === "macro.tokenMagic" && token)
                        await addTokenMagicChange(parent, change, tokens); //TODO check disabled
                }
                if (effect.changes.some(change => change.key.startsWith("macro.execute") || change.key.startsWith("macro.itemMacro") || change.key.startsWith("macro.actorUpdate"))) {
                    await actionQueue.add(daeMacro, "on", parent, effect.toObject(false), {}); // TODO revisit to see if passing the effect is ok
                }
            }
            catch (err) {
                console.warn("dae | create effect error", err);
            }
            finally {
                return true;
            }
        };
        if (!context.isUndo) {
            changeLoop().then(() => removeExistingEffectsHook(...args));
        }
    }
    else
        removeExistingEffectsHook(...args);
    return true;
}
async function _preCreateActiveEffect(...args) {
    let [data, options, user] = args;
    // await wrapped(...args);
    const parent = this.parent;
    //@ts-ignore documentClass TODO v10
    if (!parent || !(parent instanceof CONFIG.Actor.documentClass))
        return;
    const actor = parent;
    const tokens = parent.isToken ? [parent.token.object] : parent.getActiveTokens();
    const token = tokens[0];
    this.determineSuppression && this.determineSuppression();
    if (this.changes && !this.disabled && !this.isSuppressed) {
        if (parent.isToken)
            await delay(200); // let all of the stuff settle down
        try {
            for (let change of this.changes) {
                if (cubActive && change.key === "macro.CUB" && token) {
                    await addCubChange(change.value, [token]);
                }
                if (ceActive && change.key === "macro.CE") {
                    const lastArg = prepareLastArgData(this, actor);
                    if (actor.isToken)
                        await addConvenientEffectsChange(change.value, actor.uuid, this.origin, {}, actor.isToken, options.lastArg);
                    else
                        await addConvenientEffectsChange(change.value, actor.uuid, this.origin, {}, actor.isToken, options.lastArg);
                }
                const tokenMagic = globalThis.TokenMagic;
                if (tokenMagic && change.key === "macro.tokenMagic" && token)
                    await addTokenMagicChange(parent, change, tokens); //TODO check disabled
            }
            if (this.changes.some(change => change.key.startsWith("macro.execute") || change.key.startsWith("macro.itemMacro") || change.key.startsWith("macro.actorUpdate"))) {
                await actionQueue.add(daeMacro, "on", parent, this.toObject(false), {}); // TODO revisit to see if passing the effect is ok
            }
        }
        catch (err) {
            console.warn("dae | create effect error", err);
        }
        finally {
            return true;
        }
    }
    ;
}
function removeExistingEffectsHook(...args) {
    let [effect, data, options, user] = args;
    const parent = effect.parent;
    if (options.isUndo)
        return true;
    //@ts-expect-error
    if (!(parent instanceof CONFIG.Actor.documentClass) /*|| actor.isToken*/)
        return true;
    if (!effect.flags?.dae?.specialDuration)
        effect.updateSource({ "flags.dae.specialDuration": [] });
    // if (getProperty(effect, "flags.dae.stackable") === undefined) effect.updateSource({ "flags.dae.stackable": "noneName" });
    const stackable = getProperty(effect, "flags.dae.stackable");
    if ( /* effectIsTransfer(effect) && */["noneName", "none"].includes(stackable)) { // transfer effects should replace the existing effect
        if (!parent)
            return true;
        const hasExisting = parent.effects.filter(ef => {
            if (ef.id === effect.id)
                return false;
            switch (stackable) {
                case "noneName":
                    return (ef.name || ef.label) === (effect.name || effect.label);
                case "none":
                    return effect.origin && ef.origin !== CECustomEffectsItemUuid && ef.origin === effect.origin && (ef.name ?? ef.label) === (effect.name ?? effect.label);
            }
        });
        if (hasExisting.length === 0)
            return true;
        try {
            if (debugEnabled > 0)
                warn("deleting existing effects ", parent.name, parent, hasExisting);
            effect.parent.deleteEmbeddedDocuments("ActiveEffect", hasExisting.map(ef => ef.id));
        }
        finally {
            return true;
        }
        // hasExisting.forEach(existingEffect =>
        // actionQueue.add(existingEffect.delete.bind(existingEffect)));
        // return true;
    }
}
function preCreateActiveEffectHook(candidate, data, options, user) {
    try {
        if (options.isUndo)
            return true;
        const actor = candidate.parent;
        // Check if we are trying to create an existing item
        if (actor.effects?.find(ef => ef.id === data._idid)) {
            if (debugEnabled > 0)
                warn("Blocking creation of duplcate effect", candidate, actor.effects?.find(ef => ef.id === data._idid));
            return false;
        }
        //@ts-ignore
        if (!(actor instanceof CONFIG.Actor.documentClass) /*|| actor.isToken*/)
            return true;
        if (!candidate.flags?.dae?.specialDuration)
            candidate.updateSource({ "flags.dae.specialDuration": [] });
        const stackable = getProperty(candidate, "flags.dae.stackable");
        if (candidate.origin === candidate.parent?.uuid)
            return false;
        if (stackable === "noneName" && actor.effects.contents.some(ef => (ef.name || ef.label) === (candidate.name || candidate.label))) {
            warn("Blocking creation of", candidate.name ?? candidate.label, "name");
            return false;
        }
        if (stackable === "none" && actor.effects.contents.some(ef => ef.origin && ef.orign !== CECustomEffectsItemUuid && ef.origin === candidate.origin)) {
            warn("Blocking creation of", candidate.name ?? candidate.label, "origin");
            return false;
        }
        const parent = candidate.parent;
        if (parent && parent instanceof Actor) {
            let updates = {};
            setProperty(updates, "flags.dae.transfer", data.transfer === true ? true : false);
            if (candidate.flags?.dae?.durationExpression && parent instanceof Actor) {
                let sourceActor = parent;
                if (!data.transfer) {
                    //@ts-expect-error
                    const thing = fromUuidSync(candidate.origin);
                    //@ts-ignore
                    if (thing?.actor)
                        sourceActor = thing.actor;
                }
                //@ts-expect-error roll argument async
                const theDuration = new Roll(`${candidate.flags.dae.durationExpression}`, sourceActor?.getRollData()).roll({ async: false });
                //@ts-expect-error turnData.actor
                const inCombat = game.combat?.turns?.some(turnData => turnData.actor?.uuid === parent.uuid);
                if (inCombat) {
                    updates["duration.rounds"] = Math.floor(theDuration.total / CONFIG.time.roundTime + 0.5);
                    updates["duration.seconds"] = null;
                }
                else
                    updates["duration.seconds"] = theDuration.total;
            }
            let changesChanged = false;
            let newChanges = [];
            for (let change of candidate.changes) {
                const inline = typeof change.value === "string" && change.value.includes("[[");
                if (change.key === "StatusEffect") {
                    const statusEffect = CONFIG.statusEffects.find(se => se.id === change.value);
                    if (statusEffect) {
                        let changes = statusEffect.changes ?? [];
                        if (game.dfreds?.effects && isNewerVersion(game.version, "11.0")) {
                            const ceEffect = game.dfreds.effects.all.find(ef => ef.statuses.has(statusEffect.id));
                            if (ceEffect)
                                changes = ceEffect.changes;
                        }
                        newChanges = newChanges.concat(changes);
                        updates["icon"] = statusEffect.icon;
                        if (isNewerVersion(game.version, "11.290")) {
                            updates["name"] = i18n(statusEffect.name ?? statusEffect.label);
                        }
                        else {
                            updates["label"] = i18n(statusEffect.label);
                        }
                        changesChanged = true;
                        if (statusEffect.flags) {
                            setProperty(updates, "flags", statusEffect.flags);
                        }
                        if (isNewerVersion(game.version, "11.0")) { //TODO check in v11
                            updates["statuses"] = statusEffect.statuses ?? new Set();
                            if (updates.statuses.size === 0)
                                updates.statuses.add(statusEffect.id);
                            updates.statuses = Array.from(updates.statuses);
                            // updates["statuses"].add(statusEffect.id);
                        }
                        else
                            updates["flags.core.statusId"] = statusEffect.id;
                    }
                }
                else if (change.key === "StatusEffectLabel") {
                    updates["label"] = change.value;
                }
                else if (inline) {
                    const rgx = /\[\[(\/[a-zA-Z]+\s)?(.*?)([\]]{2,3})(?:{([^}]+)})?/gi;
                    const newChange = duplicate(change);
                    changesChanged = true;
                    for (let match of change.value.matchAll(rgx)) {
                        if (!match[1]) {
                            const newValue = evalInline(match[2], parent, candidate);
                            newChange.value = newChange.value.replace(match[0], `${newValue}`);
                        }
                    }
                    newChanges.push(newChange);
                }
                else if (change.key.startsWith("macro.itemMacro")) {
                    //@ts-expect-error
                    const item = fromUuidSync(candidate.origin);
                    if (item instanceof Item) {
                        //@ts-expect-error
                        let macroCommand = item?.flags.itemacro?.macro.command ?? item?.flags.itemacro?.macro.data.command;
                        setProperty(updates, `flags.dae.itemMacro`, macroCommand);
                    }
                }
                else
                    newChanges.push(change);
            }
            if (changesChanged)
                updates["changes"] = newChanges;
            candidate.updateSource(updates);
        }
    }
    catch (err) {
        console.warn("dae | preCreateActiveEffectHook", err);
    }
    finally {
        return true;
    }
}
function evalInline(expression, actor, effect) {
    try {
        warn("Doing inlinve eval", expression);
        //@ts-ignore replaceAll
        expression = expression.replaceAll("@data.", "@");
        //@ts-ignore evaluate
        const roll = (new Roll(expression, actor?.getRollData())).evaluate({ async: false });
        if (showInline) {
            roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${effect.name || effect.label} ${expression}`, chatMessage: true });
        }
        return `${roll.total}`;
    }
    catch (err) {
        console.warn(`dae | evaluate args error: rolling ${expression} failed`);
        return "0";
    }
}
export function preDeleteCombatHook(...args) {
    // This could cause race conditions....
    const [combat, options, user] = args;
    for (let combatant of combat.combatants) {
        const actor = combatant.actor;
        if (!actor)
            continue;
        const effectsToDelete = actor.effects.filter(ef => ef.flags.dae?.specialDuration?.includes("combatEnd")).map(ef => ef.id);
        actionQueue.add(actor.deleteEmbeddedDocuments.bind(actor), "ActiveEffect", effectsToDelete);
    }
}
export function preCreateCombatantHook(...args) {
    const [combatant, data, options, user] = args;
    const actor = combatant.actor;
    if (!actor)
        return;
    const effectsToDelete = actor.effects.filter(ef => ef.flags.dae?.specialDuration?.includes("joinCombat")).map(ef => ef.id);
    actionQueue.add(actor.deleteEmbeddedDocuments.bind(actor), "ActiveEffect", effectsToDelete);
}
export function updateActiveEffectHook(...args) {
    let [effect, changes, context, userId] = args;
    if (context.isUndo)
        return true;
    if (userId !== game.user.id)
        return true;
    const parent = effect.parent;
    //@ts-ignore documentClass
    if (!parent || !(parent instanceof CONFIG.Actor.documentClass))
        return true;
    let changeLoop = async () => {
        try {
            // const item = await fromUuid(effect.origin);
            const tokens = parent.isToken ? [parent.token.object] : parent.getActiveTokens();
            const token = tokens[0];
            if (effect.determineSuppression)
                effect.determineSuppression();
            // Just deal with equipped etc
            warn("add active effect actions", parent, changes);
            if (effect.changes) {
                const tokenMagic = globalThis.TokenMagic;
                if (changes.disabled === true) {
                    for (let change of effect.changes) {
                        if (token && cubActive && change.key === "macro.CUB") {
                            await removeCubChange(change.value, [token], { warn: false });
                        }
                        if (ceActive && change.key === "macro.CE") {
                            const lastArg = prepareLastArgData(effect, parent);
                            await removeConvenientEffectsChange(change.value, parent.uuid, undefined, parent.isToken, lastArg);
                        }
                        if (token && tokenMagic && change.key === "macro.tokenMagic")
                            removeTokenMagicChange(parent, change, tokens);
                        if (["macro.createItem", "macro.createItemRunMacro"].includes(change.key)) {
                            await removeCreateItemChange(change.value, parent, effect);
                        }
                    }
                    if (effect.changes.some(change => change.key.startsWith("macro.execute") || change.key.startsWith("macro.itemMacro") || change.key.startsWith("macro.actorUpdate")))
                        warn("dae add macro off", actionQueue._queue.length);
                    await actionQueue.add(daeMacro, "off", parent, effect.toObject(false), {});
                }
                else if (changes.disabled === false && !effect.isSuppressed) {
                    for (let change of effect.changes) {
                        if (token && cubActive && change.key === "macro.CUB") {
                            await addCubChange(change.value, [token]);
                        }
                        if (ceActive && change.key === "macro.CE") {
                            const lastArg = prepareLastArgData(effect, parent);
                            await addConvenientEffectsChange(change.value, parent.uuid, undefined, parent.isToken, lastArg);
                        }
                        if (token && tokenMagic && change.key === "macro.tokenMagic")
                            addTokenMagicChange(parent, change, tokens);
                        if (["macro.createItem", "macro.createItemRunMacro"].includes(change.key)) {
                            await addCreateItemChange(change, parent, effect);
                        }
                    }
                    if (effect.changes.some(change => change.key.startsWith("macro.execute") || change.key.startsWith("macro.itemMacro") || change.key.startsWith("macro.actorUpdate"))) {
                        warn("action queue add dae macro on ", actionQueue._queue.length);
                        await actionQueue.add(daeMacro, "on", parent, effect.toObject(false), {});
                    }
                }
            }
        }
        catch (err) {
            console.warn("dae | updating active effect error", err);
        }
        finally {
            return true;
        }
    };
    changeLoop();
    return true;
}
export function preUpdateActiveEffectEvalInlineHook(candidate, updates, options, user) {
    const parent = candidate.parent;
    if (options.isUndo)
        return true;
    //@ts-ignore documentClass
    if (!parent || !(parent instanceof CONFIG.Actor.documentClass)) {
        return true;
    }
    try {
        const rgx = /\[\[(\/[a-zA-Z]+\s)?(.*?)([\]]{2,3})(?:{([^}]+)})?/gi;
        for (let change of updates.changes ?? []) {
            let inline = typeof change.value === "string" && change.value.includes("[[");
            if (inline) {
                const rgx = /\[\[(\/[a-zA-Z]+\s)?(.*?)([\]]{2,3})(?:{([^}]+)})?/gi;
                let newChangeValue = duplicate(change.value);
                for (let match of change.value.matchAll(rgx)) {
                    if (!match[1]) {
                        const newValue = evalInline(match[2], this.parent, this);
                        newChangeValue = newChangeValue.replace(match[0], `${newValue}`);
                    }
                }
                change.value = newChangeValue;
            }
            ;
        }
    }
    catch (err) {
        console.warn(`dae | update active effect Actor ${parent.name}, Effect ${this.name || this.label}`, updates, err);
    }
    finally {
        return true;
    }
}
export async function _preUpdateActiveEffectEvalInline(wrapped, updates, options, user) {
    const parent = this.parent;
    //@ts-ignore documentClass
    if (!parent || !(parent instanceof CONFIG.Actor.documentClass)) {
        return wrapped(updates, options, user);
    }
    try {
        const rgx = /\[\[(\/[a-zA-Z]+\s)?(.*?)([\]]{2,3})(?:{([^}]+)})?/gi;
        for (let change of updates.changes ?? []) {
            let inline = typeof change.value === "string" && change.value.includes("[[");
            if (inline) {
                const rgx = /\[\[(\/[a-zA-Z]+\s)?(.*?)([\]]{2,3})(?:{([^}]+)})?/gi;
                let newChangeValue = duplicate(change.value);
                for (let match of change.value.matchAll(rgx)) {
                    if (!match[1]) {
                        const newValue = evalInline(match[2], this.parent, this);
                        newChangeValue = newChangeValue.replace(match[0], `${newValue}`);
                    }
                }
                change.value = newChangeValue;
            }
            ;
        }
    }
    catch (err) {
        console.warn(`dae | update active effect Actor ${parent.name}, Effect ${this.name || this.label}`, updates, err);
    }
    finally {
        return wrapped(updates, options, user);
    }
}
export async function _preDeleteActiveEffect(wrapped, ...args) {
    let [data, options, user] = args;
    await wrapped(...args);
    if (options.isUndo)
        return true;
    //@ts-ignore documentClass
    if (!(this.parent instanceof CONFIG.Actor.documentClass))
        return true;
    let changesMade = false;
    const actor = this.parent;
    const tokens = actor.token ? [actor.token] : actor.getActiveTokens();
    const token = tokens[0];
    const tokenMagic = globalThis.TokenMagic;
    /// if (actor.isToken) await delay(1);
    try {
        let entityToDelete;
        if (this.changes) {
            const theChanges = duplicate(this.changes);
            for (let change of theChanges) {
                if (token && tokenMagic && change.key === "macro.tokenMagic")
                    await removeTokenMagicChange(actor, change, tokens);
                if (["macro.createItem", "macro.createItemRunMacro"].includes(change.key)) {
                    await removeCreateItemChange(change.value, actor, this);
                }
                if (ceActive && change.key === "macro.CE") {
                    const lastArg = prepareLastArgData(this, actor);
                    await removeConvenientEffectsChange(change.value, actor.uuid, lastArg.origin, actor.isToken, lastArg);
                }
                if (token && cubActive && change.key === "macro.CUB") {
                    await removeCubChange(change.value, [token]);
                }
                if (change.key === "flags.dae.deleteUuid" && change.value) {
                    await socketlibSocket.executeAsGM("deleteUuid", { uuid: change.value });
                }
                if (change.key === "flags.dae.deleteOrigin")
                    entityToDelete = this.origin;
            }
            if (this.changes.some(change => change.key.startsWith("macro.execute") || change.key.startsWith("macro.itemMacro") || change.key.startsWith("macro.actorUpdate"))) {
                warn("action queue add daemacro off ", actionQueue._queue.length);
                await actionQueue.add(daeMacro, "off", actor, this.toObject(false), options);
            }
            if (entityToDelete)
                await socketlibSocket.executeAsGM("deleteUuid", { uuid: entityToDelete });
        }
        if (this.origin) {
            let origin = await fromUuid(this.origin);
            // Remove the associated animation if the origin points to the actor or if the items parent is the effects parent
            // Covers the spirit guardian case where all the aura's point back to the source item.
            if (globalThis.Sequencer && (origin === this.parent || origin?.parent === this.parent))
                globalThis.Sequencer.EffectManager.endEffects({ origin: this.origin });
            if (canvas?.scene && (origin === this.parent || origin?.parent === this.parent)) {
                const removeTiles = canvas.scene.tiles.filter(tile => tile.flags?.autoanimations?.origin === this.origin).map(tile => tile.id);
                // if (removeTiles.length > 0) await canvas.Scene.deleteEmbeddedDocuments("Tile", removeTiles);
            }
        }
    }
    catch (err) {
        console.warn("dae | error deleting active effect ", err);
    }
    return true;
}
export function deleteActiveEffectHook(...args) {
    let [effect, options, userId] = args;
    if (game.user.id !== userId)
        return true;
    if (options.isUndo)
        return true;
    //@ts-ignore documentClass
    if (!(effect.parent instanceof CONFIG.Actor.documentClass))
        return true;
    let changesMade = false;
    let changesLoop = async () => {
        const actor = effect.parent;
        const tokens = actor.token ? [actor.token] : actor.getActiveTokens();
        const token = tokens[0];
        const tokenMagic = globalThis.TokenMagic;
        /// if (actor.isToken) await delay(1);
        try {
            let entityToDelete;
            if (effect.changes) {
                for (let change of effect.changes) {
                    if (token && tokenMagic && change.key === "macro.tokenMagic")
                        await removeTokenMagicChange(actor, change, tokens);
                    if (["macro.createItem", "macro.createItemRunMacro"].includes(change.key)) {
                        await removeCreateItemChange(change.value, actor, effect);
                    }
                    if (ceActive && change.key === "macro.CE") {
                        const lastArg = prepareLastArgData(effect, actor);
                        await removeConvenientEffectsChange(change.value, actor.uuid, lastArg.origin, actor.isToken, lastArg);
                    }
                    if (token && cubActive && change.key === "macro.CUB") {
                        await removeCubChange(change.value, [token]);
                    }
                    if (change.key === "flags.dae.deleteUuid" && change.value) {
                        await socketlibSocket.executeAsGM("deleteUuid", { uuid: change.value });
                    }
                    if (change.key === "flags.dae.deleteOrigin")
                        entityToDelete = effect.origin;
                }
                if (effect.changes.some(change => change.key.startsWith("macro.execute") || change.key.startsWith("macro.itemMacro") || change.key.startsWith("macro.actorUpdate"))) {
                    warn("action queue dae macro add off ", actionQueue._queue.length);
                    await actionQueue.add(daeMacro, "off", actor, effect.toObject(false), options);
                }
                if (entityToDelete)
                    await socketlibSocket.executeAsGM("deleteUuid", { uuid: entityToDelete });
            }
            if (effect.origin) {
                let origin = await fromUuid(effect.origin);
                // Remove the associated animation if the origin points to the actor or if the items parent is the effects parent
                // Covers the spirit guardian case where all the aura's point back to the source item.
                if (globalThis.Sequencer && (origin === effect.parent || origin?.parent === effect.parent))
                    globalThis.Sequencer.EffectManager.endEffects({ origin: effect.origin });
                if (canvas?.scene && (origin === effect.parent || origin?.parent === effect.parent)) {
                    const removeTiles = canvas.scene.tiles.filter(tile => tile.flags?.autoanimations?.origin === effect.origin).map(tile => tile.id);
                    // if (removeTiles.length > 0) await canvas.Scene.deleteEmbeddedDocuments("Tile", removeTiles);
                }
            }
        }
        catch (err) {
            console.warn("dae | error deleting active effect ", err);
        }
    };
    changesLoop();
    return true;
}
export function getSelfTarget(actor) {
    if (actor.token)
        return actor.token.object;
    const speaker = ChatMessage.getSpeaker({ actor });
    if (speaker.token)
        return canvas.tokens.get(speaker.token);
    const tokenData = actor.prototypeToken.toObject(false);
    //@ts-ignore this is a token document not a token ??
    return new CONFIG.Token.documentClass(tokenData, { actor });
}
export async function daeMacro(action, actor, effectData, lastArgOptions = {}) {
    let result;
    let effects;
    let selfTarget;
    let v11args = {};
    // Work out what itemdata should be
    warn("Dae macro ", action, actor, effectData, lastArgOptions);
    if (!effectData.changes)
        return effectData;
    let tokenUuid;
    if (actor.token) {
        tokenUuid = actor.token.uuid;
        selfTarget = actor.token.object;
    }
    else {
        selfTarget = getSelfTarget(actor);
        tokenUuid = selfTarget.uuid ?? selfTarget.document.uuid;
    }
    let source = effectData.origin ? DAEfromUuid(effectData.origin) : undefined;
    let context = actor.getRollData();
    //@ts-ignore
    if (source instanceof CONFIG.Item.documentClass) {
        context.item = source;
        //@ts-ignore toObject
        context.itemData = source.toObject(false);
    }
    let theItem;
    if (effectData.flags.dae?.itemUuid) {
        theItem = DAEfromUuid(effectData.flags.dae.itemUuid);
    }
    if (!theItem && effectData.flags?.dae?.itemData) {
        //@ts-ignore documentClass
        theItem = new CONFIG.Item.documentClass(effectData.flags.dae.itemData, { actor });
    }
    for (let change of effectData.changes) {
        try {
            if (!allMacroEffects.includes(change.key))
                continue;
            context.stackCount = effectData.flags?.dae?.stacks ?? effectData.flags?.dae?.statuscounter?.counter.value ?? 1;
            const theChange = await evalArgs({ item: theItem, effectData, context, actor, change, doRolls: true });
            let args = [];
            let v11args = {};
            if (typeof theChange.value === "string") {
                tokenizer.tokenize(theChange.value, (token) => args.push(token));
                if (theItem)
                    args = args.map(arg => {
                        if ("@itemData" === arg) {
                            return theItem.toObject(false);
                        }
                        else if ("@item" === arg) {
                            return theItem.toTobject(false);
                        }
                        if (typeof arg === "string") {
                            const splitArg = arg.split("=");
                            if (splitArg.length === 2) {
                                if (splitArg[1] === "@itemData" || splitArg[1] === "@item") {
                                    const itemData = theItem?.toObject(false);
                                    v11args[splitArg[0]] = itemData;
                                    return itemData;
                                }
                                else
                                    v11args[splitArg[0]] = splitArg[1];
                            }
                        }
                        return arg;
                    });
            }
            else
                args = change.value;
            if (theChange.key.includes("macro.execute") || theChange.key.includes("macro.itemMacro")) {
                const macro = await getMacro({ change, name: args[0] }, theItem, effectData);
                if (!macro) {
                    //TODO localize this
                    if (action !== "off") {
                        ui.notifications.warn(`macro.execute/macro.itemMacro | No macro ${args[0]} found`);
                        warn(`macro.execute/macro.itemMacro | No macro ${args[0]} found`);
                        continue;
                    }
                }
                let lastArg = mergeObject(lastArgOptions, {
                    //@ts-ignore - undefined fields
                    effectId: effectData._id,
                    origin: effectData.origin,
                    efData: effectData,
                    actorId: actor.id,
                    actorUuid: actor.uuid,
                    tokenId: selfTarget.id,
                    tokenUuid,
                }, { overwrite: false, insertKeys: true, insertValues: true, inplace: false });
                if (theChange.key.includes("macro.execute"))
                    args = args.slice(1);
                let macroArgs = [action];
                macroArgs = macroArgs.concat(args).concat(lastArg);
                const scope = { actor, token: selfTarget, lastArgValue: lastArg, item: theItem };
                scope.args = macroArgs.filter(arg => {
                    if (typeof arg === "string") {
                        const parts = arg.split("=");
                        if (parts.length === 2) {
                            scope[parts[0]] = parts[1];
                            return false;
                        }
                    }
                    return true;
                });
                if (isNewerVersion(game.version, "11.293")) {
                    return macro.execute(scope);
                }
                else {
                    const AsyncFunction = (async function () { }).constructor;
                    const speaker = ChatMessage.getSpeaker({ token: selfTarget?.document ?? selfTarget, actor });
                    const character = game.user?.character;
                    let body = `return (async () => {
          ${macro.command ?? macro.data?.command}
          })()`;
                    body = macro.command ?? macro.data?.command;
                    const argNames = Object.keys(scope);
                    const argValues = Object.values(scope);
                    //@ts-expect-error
                    const fn = new AsyncFunction("speaker", "actor", "token", "character", "scope", ...argNames, body);
                    // const fn = Function("{speaker, actor, token, character, item, args}={}", body);
                    return fn.call(macro, speaker, actor, selfTarget, character, scope, ...argValues);
                }
            }
            else if (theChange.key === "macro.actorUpdate") {
                let lastArg = mergeObject(lastArgOptions, {
                    //@ts-ignore - undefined fields
                    effectId: effectData._id,
                    origin: effectData.origin,
                    efData: effectData,
                    actorId: actor.id,
                    actorUuid: actor.uuid,
                    tokenId: selfTarget.id,
                    tokenUuid,
                }, { overwrite: false, insertKeys: true, insertValues: true, inplace: false });
                await macroActorUpdate(action, ...args, lastArg);
                // result = await macroActorUpdate(action, ...args, lastArg);
            }
        }
        catch (err) {
            console.warn("dae | daemacro", err);
        }
    }
    ;
    return effectData;
}
export async function evalArgs({ effectData = null, item, context, actor, change, spellLevel = 0, damageTotal = 0, doRolls = false, critical = false, fumble = false, whisper = false, itemCardId = null }) {
    const itemId = item?.id ?? getProperty(effectData.flags, "dae.itemId");
    const itemUuid = item?.uuid ?? getProperty(effectData.flags, "dae.itemUuid");
    //@ts-ignore 
    if (!item && itemUuid)
        item = await DAEfromUuid(itemUuid);
    if (typeof change.value !== 'string')
        return change; // nothing to do
    const returnChange = duplicate(change);
    let contextToUse = mergeObject({
        scene: canvas.scene.id,
        token: ChatMessage.getSpeaker({ actor }).token,
        target: "@target",
        targetUuid: "@targetUuid",
        spellLevel,
        itemLevel: spellLevel,
        damage: damageTotal,
        itemCardId: itemCardId,
        unique: randomID(),
        actor: actor.id,
        actorUuid: actor.uuid,
        critical,
        fumble,
        whisper,
        change: JSON.stringify(change.toJSON),
        itemId: item?.id,
        itemUuid: item?.uuid,
    }, context, { overwrite: true });
    //contextToUse["item"] = "@item";
    if (item) {
        setProperty(effectData, "flags.dae.itemUuid", item.uuid);
        setProperty(effectData, "flags.dae.itemData", item.toObject(false));
        contextToUse["itemData"] = "@itemData";
        contextToUse["item"] = item.getRollData()?.item;
    }
    else {
        contextToUse["itemData"] = "@itemData";
        contextToUse["item"] = "@item";
    }
    returnChange.value = returnChange.value.replace("@item.level", "@itemLevel");
    returnChange.value = returnChange.value.replace(/@data./g, "@");
    //@ts-ignore replaceFormulaData
    const returnChangeValue = Roll.replaceFormulaData(returnChange.value, contextToUse, { missing: 0, warn: false });
    if (typeof returnChange.value === "object") {
        console.error("object returned from replaceFormula Data", returnChange.value);
    }
    else {
        returnChange.value = returnChangeValue;
    }
    returnChange.value = returnChange.value.replaceAll("##", "@");
    if (typeof returnChange.value === "string" && !returnChange.value.includes("[[")) {
        switch (change.key) {
            case "macro.itemMacro":
            case "macro.itemMacro.local":
            case "macro.itemMacro.GM":
            case "macro.execute":
            case "macro.execute.local":
            case "macro.execute.GM":
            case "macro.actorUpdate":
                break;
            case "macro.CE":
            case "macro.CUB":
            case "macro.tokenMagic":
            case "macro.createItem":
            case "macro.createItemRunMacro":
            case "macro.summonToken":
                break;
            default:
                if (doRolls && typeof ValidSpec.specs[actor.type].allSpecsObj[change.key]?.sampleValue === "number") {
                    //@ts-ignore evaluate - probably need to make this a saveEval
                    returnChange.value = new Roll(returnChange.value, context).evaluate({ async: false }).total;
                }
                ;
                break;
        }
        ;
        debug("evalargs: change is ", returnChange);
    }
    return returnChange;
}
export async function getMacro({ change, name }, item, effectData) {
    if (change.key.includes("macro.execute")) {
        if (change.value.startsWith("Compendium")) {
        }
        else { // the first argument conatins the macro name
            return game.macros.getName(name);
        }
    }
    else if (change.key.startsWith("macro.itemMacro")) {
        /*
        // Get the macro command for the macro
        // TODO look at using an item name as well?
        let macroCommand = item?.flags.itemacro?.macro.command ?? item?.flags.itemacro?.macro.data.command;
        if (!macroCommand) macroCommand = getProperty(effectData, "flags.dae.itemData.flags.itemacro.macro.command");
        if (!macroCommand) macroCommand = getProperty(effectData, "flags.dae.itemData.flags.itemacro.macro.data.command");
        // Could not get the macro from the item or we had no item
        if (!macroCommand && !item) { // we never got an item do a last ditch attempt
          warn("eval args: fetching item from effectData/origin ", effectData?.origin);
          item = DAEfromUuid(effectData?.origin); // Try and get it from the effectData
          //@ts-ignore
          macroCommand = item?.flags.itemacro?.macro.command ?? item?.flags.itemacro?.macro.data.command;
        }
        if (!macroCommand && !item) {
          const itemUuid = getProperty(effectData.flags, "dae.itemUuid");
          if (itemUuid) item = DAEfromUuid(itemUuid);
          macroCommand = item?.flags.itemacro?.macro.command ?? item?.flags.itemacro?.macro.data.command;
        }
    
        if (effectData && item) {
          // setProperty(effectData.flags, "dae.itemData", item.toObject());
          setProperty(effectData.flags, "dae.itemUuid", item.uuid);
          setProperty(effectData.flags, "dae.itemId", item.id);
          setProperty(effectData.flags, "dae.itemData", item.toObject(false));
        }
    
        */
        let macroCommand = item?.flags.itemacro?.macro.command ?? item?.flags.itemacro?.macro.data.command;
        if (!macroCommand)
            macroCommand = getProperty(effectData, "flags.dae.itemData.flags.itemacro.macro.command");
        if (!macroCommand)
            macroCommand = getProperty(effectData, "flags.dae.itemData.flags.itemacro.macro.data.command");
        if (!macroCommand && !item) { // we never got an item do a last ditch attempt
            warn("eval args: fetching item from effectData/origin ", effectData?.origin);
            item = DAEfromUuid(effectData?.origin); // Try and get it from the effectData
            //@ts-ignore
            macroCommand = item?.flags.itemacro?.macro.command ?? item?.flags.itemacro?.macro.data.command;
        }
        if (!macroCommand) {
            macroCommand = effectData.flags?.dae?.itemMacro;
        }
        if (!macroCommand) {
            macroCommand = `if (!args || args[0] === "on") {ui.notifications.warn("macro.itemMacro | No macro found for item ${item?.name}");}`;
            warn(`No macro found for item ${item?.name}`);
        }
        return CONFIG.Macro.documentClass.create({
            name: "DAE-Item-Macro",
            type: "script",
            img: null,
            command: macroCommand,
            // TODO see if this should change.
            flags: { "dnd5e.itemMacro": true }
        }, { displaySheet: false, temporary: true });
    }
    else if (change.key === "actorUpdate") {
        console.error("Should not be trying to lookup the macro for actorUpdate");
    }
}
/*
 * appply non-transfer effects to target tokens - provided for backwards compat
 */
export async function doEffects(item, activate, targets = undefined, options = {
    whisper: false, spellLevel: 0, damageTotal: null, itemCardId: null, critical: false,
    fumble: false, effectsToApply: [], removeMatchLabel: false, toggleEffect: false,
    selfEffects: "none"
}) {
    return await applyNonTransferEffects(item, activate, targets, options);
}
// Apply non-transfer effects to targets.
// macro arguments are evaluated in the context of the actor applying to the targets
// @target is left unevaluated.
// request is passed to a GM client if the token is not owned
export async function applyNonTransferEffects(item, activate, targets, options = { whisper: false, spellLevel: 0, damageTotal: null, itemCardId: null, critical: false, fumble: false, tokenId: undefined, effectsToApply: [], removeMatchLabel: false, toggleEffect: false, selfEffects: "none" }) {
    if (!targets)
        return;
    let macroLocation = "mixed";
    let appliedEffects = [];
    switch (options.selfEffects) {
        case "selfEffectsAlways":
            appliedEffects = duplicate(item.effects.filter(ae => ae.transfer !== true && ae.flags?.dae?.selfTargetAlways));
            break;
        case "selfEffectsAll":
            appliedEffects = duplicate(item.effects.filter(ae => ae.transfer !== true && (ae.flags?.dae?.selfTargetAlways || ae.flags?.dae.selfTarget)));
            break;
        case "none":
        default:
            appliedEffects = duplicate(item.effects.filter(ae => ae.transfer !== true && !ae.flags?.dae?.selfTargetAlways && !ae.flags?.dae?.selfTarget));
    }
    if (options.effectsToApply?.length > 0)
        appliedEffects = appliedEffects.filter(aeData => options.effectsToApply.includes(aeData._id));
    if (appliedEffects.length === 0)
        return;
    const rollData = item.getRollData(); //TODO if not caster eval move to evalArgs call
    for (let [aeIndex, activeEffectData] of appliedEffects.entries()) {
        for (let [changeIndex, change] of activeEffectData.changes.entries()) {
            const doRolls = allMacroEffects.includes(change.key);
            if (doRolls) {
                if (macroDestination[change.key] === "local" && macroLocation !== "GM") {
                    macroLocation = "local";
                }
                else if (macroDestination[change.key] === "GM")
                    macroLocation = "GM";
            }
            // eval args before calling GMAction so macro arguments are evaled in the casting context.
            // Any @fields for macros are looked up in actor context and left unchanged otherwise
            rollData.stackCount = activeEffectData.flags?.dae?.stacks ?? activeEffectData.flags?.dae?.statuscounter?.counter.value ?? 1;
            const evalArgsOptions = mergeObject(options, {
                effectData: activeEffectData,
                context: rollData,
                change,
                doRolls
            });
            evalArgsOptions.item = item;
            if (item.actor)
                evalArgsOptions.actor = item.actor;
            let newChange = await evalArgs(evalArgsOptions);
            activeEffectData.changes[changeIndex] = newChange;
        }
        ;
        activeEffectData.origin = item.uuid;
        activeEffectData.duration.startTime = game.time.worldTime;
        daeSystemClass.addDAEMetaData(activeEffectData, item, options);
        appliedEffects[aeIndex] = activeEffectData;
    }
    // Split up targets according to whether they are owned on not. Owned targets have effects applied locally, only unowned are passed ot the GM
    const targetList = Array.from(targets);
    const stringTokens = targetList.filter(t => typeof t === "string");
    if (stringTokens.length)
        console.warn("String tokens in apply non transfer are ", stringTokens);
    //@ts-ignore
    let localTargets = targetList.filter(t => macroLocation === "local" || (t.isOwner && macroLocation === "mixed")).map(
    //@ts-ignore
    t => {
        if (typeof t === "string")
            return t;
        //@ts-ignore t.document
        if (t.document)
            return t.document.uuid; // means we have a token
        //@ts-ignore
        if (t instanceof CONFIG.Actor.documentClass)
            return t.uuid;
        //@ts-ignore
        if (t instanceof CONFIG.Token.documentClass)
            return t.actor?.uuid;
        //@ts-ignore .uuid
        return t.uuid;
    });
    //@ts-ignore
    let gmTargets = targetList.filter(t => (!t.isOwner && macroLocation === "mixed") || macroLocation === "GM").map(
    //@ts-ignore
    t => typeof t === "string" ? t : (t.document?.uuid ?? t.uuid));
    debug("apply non-transfer effects: About to call gmaction ", activate, appliedEffects, targets, localTargets, gmTargets);
    if (gmTargets.length > 0) {
        await socketlibSocket.executeAsGM("applyActiveEffects", { userId: game.user.id, activate, activeEffects: appliedEffects, tokenList: gmTargets, itemDuration: item.system.duration, itemCardId: options.itemCardId, removeMatchLabel: options.removeMatchLabel, toggleEffect: options.toggleEffect, metaData: options.metaData });
    }
    if (localTargets.length > 0) {
        const result = await applyActiveEffects({ activate, tokenList: localTargets, activeEffects: appliedEffects, itemDuration: item.system.duration, itemCardId: options.itemCardId, removeMatchLabel: options.removeMatchLabel, toggleEffect: options.toggleEffect, metaData: options.metaData });
    }
}
function preUpdateItemHook(candidate, updates, options, user) {
    return true;
}
// Update the actor active effects when editing an owned item
function updateItemEffects(candidate, updates, options, user) {
    if (!candidate.isOwned)
        return true;
    if (user !== game.user.id)
        return true;
    if (options.isUndo)
        return true;
    if (options.isAdvancement) {
        console.warn(`Dae | Skipping effect re-creation for class advancement ${candidate.parent?.name ?? ""} item ${candidate.name}`);
        return;
    }
    if (updates.effects) { // item effects have changed - update transferred effects
        //@ts-ignore
        const itemUuid = candidate.uuid;
        // delete all actor effects for the given item
        let deletions = [];
        for (let aef of candidate.parent.effects) { // remove all transferred effects for the item
            const isTransfer = aef.flags.dae?.transfer;
            if (isTransfer && (aef.origin === itemUuid))
                deletions.push(aef.id);
        }
        ;
        // Now get all the item transfer effects
        let additions = candidate.effects.filter(aef => {
            const isTransfer = aef.transfer;
            setProperty(aef.flags, "dae.transfer", isTransfer);
            return isTransfer;
        });
        additions = additions.map(ef => ef.toObject(false));
        additions.forEach(efData => {
            efData.origin = itemUuid;
        });
        if (deletions.length > 0) {
            actionQueue.add(candidate.parent.deleteEmbeddedDocuments.bind(candidate.parent), "ActiveEffect", deletions);
        }
        if (additions.length > 0) {
            actionQueue.add(candidate.parent.createEmbeddedDocuments.bind(candidate.parent), "ActiveEffect", additions);
        }
    }
    return true;
}
// When an item is created any effects have a source that points to the original item
// Need to update to refer to the created item
// THe id in the this is not the final _id
export function preCreateItemHook(candidate, data, options, user) {
    if (options.isUndo)
        return true;
    return true;
}
// When an item is created any effects have a source that points to the original item
// Need to update to refer to the created item
// Can't do in precreate since the _id is wrong.
export function createItemHook(candidate, options, user) {
    if (options.isUndo)
        return;
    return;
}
export function preUpdateActorHook(candidate, updates, options, user) {
    try {
        if (options.onUpdateCalled)
            return true;
        for (let onUpdate of (getProperty(candidate, "flags.dae.onUpdateTarget") ?? [])) {
            if (onUpdate.macroName.length === 0)
                continue;
            if (onUpdate.filter.startsWith("data.")) {
                onUpdate.filter = onUpdate.filter.replace("data.", "system.");
            }
            if (getProperty(updates, onUpdate.filter) === undefined)
                continue;
            const originObject = DAEfromUuid(onUpdate.origin);
            const sourceTokenDocument = DAEfromUuid(onUpdate.sourceTokenUuid);
            const targetTokenDocument = DAEfromUuid(onUpdate.targetTokenUuid);
            const sourceActor = DAEfromActorUuid(onUpdate.sourceActorUuid);
            const sourceToken = sourceTokenDocument?.object;
            const targetActor = targetTokenDocument?.actor;
            const targetToken = targetTokenDocument?.object;
            let originItem = (originObject instanceof Item) ? originObject : undefined;
            if (!originItem) {
                const theEffect = targetActor.effects.find(ef => ef.origin === onUpdate.origin);
                if (getProperty(theEffect, "flags.dae.itemUuid")) {
                    //@ts-ignore fromUUid type error
                    originItem = fromUuidSync(getProperty(theEffect, "flags.dae.itemUuid"));
                }
            }
            let lastArg = {
                tag: "onUpdateTarget",
                effectId: null,
                origin: onUpdate.origin,
                efData: null,
                actorId: targetActor.id,
                actorUuid: targetActor.uuid,
                tokenId: targetToken.id,
                tokenUuid: targetTokenDocument.uuid,
                actor: candidate,
                updates,
                options,
                user,
                sourceActor,
                sourceToken,
                targetActor,
                targetToken,
                originItem
            };
            let macroText;
            if (onUpdate.macroName.startsWith("ItemMacro")) { // TODO Come back and make sure this is tagged to the effect
                if (onUpdate.macroName === "ItemMacro") {
                    macroText = originObject?.flags?.itemacro?.macro.command ?? originObject?.flags?.itemacro?.macro.data.command;
                }
                else if (onUpdate.macroName.startsWith("ItemMacro.")) {
                    let macroObject = sourceActor?.items.getName(onUpdate.macroName.split(".")[1]);
                    if (!macroObject)
                        macroObject = originObject?.parent?.items.getName(onUpdate.macroName.split(".")[1]);
                    //@ts-ignore .flags
                    macroText = macroObject?.flags?.itemacro?.macro?.command ?? macroObject.data?.flags?.itemacro?.macro?.data?.command;
                }
            }
            else {
                const theMacro = game.macros.getName(onUpdate.macroName);
                if (!theMacro) {
                    console.warn(`dae | onUpdateActor no macro found for actor ${candidate.name} macro ${onUpdate.macroName}`);
                    continue;
                }
                //@ts-ignore type v10
                if (theMacro?.type === "chat") {
                    theMacro.execute(); // use the core foundry processing for chat macros
                    continue;
                }
                //@ts-ignore
                macroText = theMacro?.command;
            }
            try { // TODO make an actual macro and then call macro.execute....
                const speaker = ChatMessage.getSpeaker({ actor: candidate });
                const args = ["onUpdateActor"].concat(onUpdate.args);
                args.push(lastArg);
                const character = undefined; // game.user?.character;
                const scope = { args, lastArgValue: lastArg, item: originItem };
                args.forEach(argString => {
                    if (typeof argString === "string") {
                        const parts = argString.split("=");
                        if (parts.length === 2) {
                            scope[parts[0]] = parts[1];
                        }
                    }
                });
                macroText = `try { ${macroText} } catch(err) { console.warn("macro error", err) };`;
                const AsyncFunction = (async function () { }).constructor;
                const argNames = Object.keys(scope);
                const argValues = Object.values(scope);
                //@ts-expect-error
                const fn = new AsyncFunction("speaker", "actor", "token", "character", "scope", ...argNames, macroText);
                fn.call(this, speaker, candidate, targetTokenDocument?.object, character, scope, ...argValues);
            }
            catch (err) {
                ui.notifications?.error(`There was an error running your macro. See the console (F12) for details`);
                error("dae | Error evaluating macro for onUpdateActor", err);
            }
        }
    }
    catch (err) {
        console.warn("dae | error in onUpdateTarget ", err);
    }
    finally {
        return true;
        // return wrapped(updates, options, user);
    }
}
export function daeReadyActions() {
    ValidSpec.localizeSpecs();
    // initSheetTab();
    //@ts-ignore
    if (game.settings.get("dae", "disableEffects")) {
        ui?.notifications?.warn("DAE effects disabled no DAE effect processing");
        console.warn("dae disabled - no active effects");
    }
    daeSystemClass.readyActions();
    aboutTimeInstalled = game.modules.get("about-time")?.active;
    simpleCalendarInstalled = game.modules.get("foundryvtt-simple-calendar")?.active;
    timesUpInstalled = game.modules.get("times-up")?.active;
    if (game.modules.get("dfreds-convenient-effects")?.active) {
        const ceItemId = game.settings.get("dfreds-convenient-effects", "customEffectsItemId");
        CECustomEffectsItemUuid = game.items.get(ceItemId)?.uuid;
    }
}
export function localDeleteFilters(tokenId, filterName) {
    let tokenMagic = globalThis.TokenMagic;
    let token = canvas.tokens.get(tokenId);
    tokenMagic.deleteFilters(token, filterName);
}
export var tokenizer;
function daeApply(wrapped, actor, change) {
    //TODO revisit this for item changes, requires setProperty(map, "index", value) to work.
    // Probably won't ever work since items only has a getter - need to rethink.
    try {
        if (change.key?.startsWith("items")) {
            const fields = change.key.split(".");
            const name = fields[1];
            let indices;
            if (false || daeSystemClass.daeActionTypeKeys.includes(name)) { //TODO multiple changes are a problem
                const items = actor.items.contents.map((item, index) => item.system.actionType === name ? index : -1);
                indices = items.filter(index => index !== -1);
            }
            else {
                indices = [actor.items.contents.findIndex(i => i.name === name)];
            }
            if (indices.length > 0) { // Only works for a single effect because of overrides
                for (let index of indices) {
                    fields[1] = `contents.${index}`;
                    if (fields[1] !== -1) {
                        change.key = fields.join(".");
                        var rval = wrapped(actor, change);
                    }
                }
                // change.key = originalKey;
                return rval;
            }
        }
    }
    catch (err) {
        console.warn("dae | dae apply error");
    }
    return wrapped(actor, change);
}
export function matchItemMacroName(candidate, updates, options, user) {
    if (options.isUndo)
        return true;
    // if (!data.transfer) return true;
    //@ts-expect-error .documentClass
    if (!candidate.parent || !(candidate.parent instanceof CONFIG.Actor.documentClass))
        return true;
    const macroChanges = candidate.changes.map(change => {
        if (change.value === "ItemMacro")
            change.value = change.value.replace("ItemMacro", `ItemMacro.${candidate.origin}`);
        return change;
    });
    candidate.updateSource({ "changes": macroChanges });
    return true;
}
// Fix for v11 not adding effects as expected. i.e. token.effects.visible ending up false
async function drawEffects(wrapped) {
    const tokenEffects = this.document.effects;
    const actorEffects = this.actor?.temporaryEffects || [];
    this.effects.visible = this.effects.visible || tokenEffects.length || actorEffects.length;
    return wrapped();
}
export function daeInitActions() {
    // Default systtem class is setup, this oeverrides with system specific calss
    const dnd5esystem = DAESystemDND5E; // force reference so they are installed?
    const sw5eSystem = DAESystemSW5E;
    libWrapper = globalThis.libWrapper;
    if (getProperty(globalThis.daeSystems, game.system.id))
        daeSystemClass = getProperty(globalThis.daeSystems, game.system.id);
    else
        //@ts-ignore
        daeSystemClass = globalThis.CONFIG.DAE.systemClass;
    daeSystemClass.initActions();
    daeSystemClass.initSystemData();
    needStringNumericValues = isNewerVersion("9.250", game.version);
    ValidSpec.createValidMods();
    if (game.settings.get("dae", "disableEffects")) {
        ui?.notifications?.warn("DAE effects disabled no DAE effect processing");
        console.warn("DAE active effects disabled.");
        return;
    }
    libWrapper.register("dae", "CONFIG.Token.objectClass.prototype.drawEffects", drawEffects, "WRAPPER");
    // TODO put this back when doing item effects.
    // libWrapper.register("dae", "CONFIG.ActiveEffect.documentClass.prototype.apply", daeApply, "WRAPPER");
    // libWrapper.register("dae", "CONFIG.Actor.documentClass.prototype.applyActiveEffects", applyBaseActiveEffects, "OVERRIDE");
    // If updating item effects recreate actor effects for updated item.
    Hooks.on("updateItem", updateItemEffects);
    Hooks.on("preCreateActiveEffect", preCreateActiveEffectHook);
    // Fixup ItemMacro references on transfer effects
    Hooks.on("preCreateActiveEffect", matchItemMacroName);
    // Hooks.on("preUpdateItem", preUpdateItemHook);
    // Hooks.on("preCreateItem", preCreateItemHook);
    // Hooks.on("createItem", createItemHook);
    async function doPreCreateActiveEffect(wrapped, ...args) {
        let [data, options, user] = args;
        let result;
        try {
            if (!options.isUndo) {
                // await _preCreateActiveEffectUpdateData.bind(this)(...args); // moved to preCreateActiveEffect hook
                // await _removeExistingEffects.bind(this)(...args);
                // await _preCreateActiveEffect.bind(this)(...args);
            }
        }
        finally {
            return wrapped(...args);
        }
    }
    // libWrapper.register("dae", "CONFIG.Actor.documentClass.prototype._preUpdate", preUpdateActor, "WRAPPER");
    // libWrapper.register("dae", "CONFIG.ActiveEffect.documentClass.prototype._preCreate", doPreCreateActiveEffect, "WRAPPER");
    // libWrapper.register("dae", "CONFIG.ActiveEffect.documentClass.prototype._preDelete", _preDeleteActiveEffect, "WRAPPER");
    // libWrapper.register("dae", "CONFIG.ActiveEffect.documentClass.prototype._preUpdate", _preUpdateActiveEffectEvalInline, "WRAPPER");
    // libWrapper.register("dae", "CONFIG.Item.documentClass.prototype._preCreate", _preCreateItem, "WRAPPER");
    Hooks.on("preUpdateActor", preUpdateActorHook);
    Hooks.on("createActiveEffect", createActiveEffectHook);
    Hooks.on("deleteActiveEffect", deleteActiveEffectHook);
    Hooks.on("preUpdateActiveEffect", preUpdateActiveEffectEvalInlineHook);
    Hooks.on("updateActiveEffect", updateActiveEffectHook);
    // Add the active effects title bar actions
    Hooks.on('renderActorSheet', initActorSheetHook);
    Hooks.on('renderItemSheet', initItemSheetHook);
    Hooks.on("preDeleteCombat", preDeleteCombatHook);
    Hooks.on("preCreateCombatant", preCreateCombatantHook);
    //@ts-ignore
    tokenizer = new DETokenizeThis({
        shouldTokenize: ['(', ')', ',', '*', '/', '%', '+', '===', '==', '!=', '!', '<', '> ', '<=', '>=', '^']
    });
    actionQueue = new globalThis.Semaphore();
}
function initActorSheetHook(app, html, data) {
    if (!daeTitleBar)
        return;
    const title = game.i18n.localize('dae.ActiveEffectName');
    let titleText = daeNoTitleText ? "" : title;
    let openBtn = $(`<a class="open-actor-effect" title="${title}"><i class="fas fa-wrench"></i>${titleText}</a>`);
    openBtn.click(ev => {
        new ActiveEffects(app.document, {}).render(true);
    });
    html.closest('.app').find('.open-actor-effect').remove();
    let titleElement = html.closest('.app').find('.window-title');
    if (!app._minimized)
        openBtn.insertAfter(titleElement);
}
function initItemSheetHook(app, html, data) {
    if (!daeTitleBar)
        return true;
    const title = game.i18n.localize('dae.ActiveEffectName');
    let titleText = daeNoTitleText ? "" : title;
    let openBtn = $(`<a class="open-item-effect" title="${title}"><i class="fas fa-wrench"></i>${titleText}</a>`);
    openBtn.click(ev => {
        new ActiveEffects(app.document, {}).render(true);
    });
    html.closest('.app').find('.open-item-effect').remove();
    let titleElement = html.closest('.app').find('.window-title');
    openBtn.insertAfter(titleElement);
    return true;
}
export function daeSetupActions() {
    cubActive = game.modules.get("combat-utility-belt")?.active;
    ceActive = game.modules.get("dfreds-convenient-effects")?.active && isNewerVersion(game.modules.get("dfreds-convenient-effects").version, "1.6.2");
    debug("Combat utility belt active ", cubActive, " and cub version is ", game.modules.get("combat-utility-belt")?.version);
    atlActive = game.modules.get("ATL")?.active;
    if (cubActive && !isNewerVersion(game.modules.get("combat-utility-belt")?.version, "1.1.2")) {
        ui.notifications.warn("Combat Utility Belt needs to be version 1.1.3 or later - conditions disabled");
        console.warn("Combat Utility Belt needs to be version 1.1.3 or later - conditions disabled");
        cubActive = false;
    }
    else if (cubActive) {
        debug("dae | Combat Utility Belt active and conditions enabled");
    }
    itemacroActive = game.modules.get("itemacro")?.active;
    furnaceActive = game.modules.get("furnace")?.active || game.modules.get("advanced-macros")?.active;
    midiActive = game.modules.get("midi-qol")?.active;
    statusCounterActive = game.modules.get("statuscounter")?.active;
    daeSystemClass.setupActions();
}
export function fetchParams(doUpdatePatches = true) {
    debugEnabled = setDebugLevel(game.settings.get("dae", "ZZDebug"));
    // useAbilitySave = game.settings.get("dae", "useAbilitySave") disabled as of 0.8.74
    confirmDelete = game.settings.get("dae", "confirmDelete");
    noDupDamageMacro = game.settings.get("dae", "noDupDamageMacro");
    disableEffects = game.settings.get("dae", "disableEffects");
    daeTitleBar = game.settings.get("dae", "DAETitleBar");
    daeNoTitleText = game.settings.get("dae", "DAENoTitleText");
    let useDAESheet = game.settings.get("dae", "useDAESheet");
    if (useDAESheet) { // TODO v10 Do this properly
        if (CONFIG.ActiveEffect.sheetClasses.base)
            CONFIG.ActiveEffect.sheetClasses.base["core.ActiveEffectConfig"].cls = DAEActiveEffectConfig;
    }
    else {
        if (CONFIG.ActiveEffect.sheetClasses.base)
            CONFIG.ActiveEffect.sheetClasses.base["core.ActiveEffectConfig"].cls = ActiveEffectConfig;
        // CONFIG.ActiveEffect.sheetClass = ActiveEffectConfig;
    }
    expireRealTime = game.settings.get("dae", "expireRealTime");
    // showDeprecation = game.settings.get("dae", "showDeprecation") ?? true;
    showInline = game.settings.get("dae", "showInline") ?? false;
    Hooks.callAll("dae.settingsChanged");
}
export function DAEfromUuid(uuid) {
    let doc;
    if (!uuid)
        return null;
    //@ts-ignore foundry v10 types
    return fromUuidSync(uuid);
}
export function DAEfromActorUuid(uuid) {
    let doc = DAEfromUuid(uuid);
    if (doc instanceof CONFIG.Token.documentClass)
        doc = doc.actor;
    return doc || null;
}
// Allow limited recursion of the formula replace function for things like
// bonuses.heal.damage in spell formulas.
export function replaceFormulaData(wrapped, formula, data, { missing, warn = false } = { missing: undefined, warn: false }) {
    let result = formula;
    const maxIterations = 3;
    if (typeof formula !== "string")
        return formula;
    for (let i = 0; i < maxIterations; i++) {
        if (!result.includes("@"))
            break;
        try {
            result = wrapped(result, data, { missing, warn });
        }
        catch (err) {
            error(err, formula, data, missing, warn);
        }
    }
    return result;
}
export function tokenForActor(actor) {
    const tokens = actor.getActiveTokens();
    if (!tokens.length)
        return undefined;
    const controlled = tokens.filter(t => t._controlled);
    return controlled.length ? controlled.shift() : tokens.shift();
}
export function effectIsTransfer(effect) {
    if (effect.transfer !== undefined)
        return effect.transfer;
    return effect.flags.dae?.transfer;
}
export async function delay(interval) {
    await new Promise(resolve => setTimeout(resolve, interval));
}