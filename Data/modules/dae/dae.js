// Import TypeScript modules RTRR
import { registerSettings } from "./module/settings.js";
import { preloadTemplates } from "./module/preloadTemplates.js";
import { daeSetupActions, doEffects, daeInitActions, fetchParams, daeMacro, DAEfromUuid, DAEfromActorUuid, daeSystemClass, actionQueue } from "./module/dae.js";
import { daeReadyActions } from "./module/dae.js";
import { convertDuration, setupSocket } from "./module/GMAction.js";
import { checkLibWrapperVersion, cleanActorItemsEffectOrigins, cleanEffectOrigins, fixTransferEffects, fixupDDBAC, migrateActorDAESRD, migrateAllActorsDAESRD, migrateAllNPCDAESRD, tobMapper } from "./module/migration.js";
import { ActiveEffects } from "./module/apps/ActiveEffects.js";
import { patchingSetup, patchingInitSetup } from "./module/patching.js";
import { addAutoFields, DAEActiveEffectConfig } from "./module/apps/DAEActiveEffectConfig.js";
import { teleportToToken, blindToken, restoreVision, setTokenVisibility, setTileVisibility, moveToken, renameToken, getTokenFlag, setTokenFlag, setFlag, unsetFlag, getFlag, deleteActiveEffect, createToken, teleportToken } from "./module/daeMacros.js";
import { EditOwnedItemEffectsItemSheet } from './module/editItemEffects/classes/item-sheet.js';
import { ValidSpec, wildcardEffects } from "./module/Systems/DAESystem.js";
export let setDebugLevel = (debugText) => {
    debugEnabled = { "none": 0, "warn": 1, "debug": 2, "all": 3 }[debugText] || 0;
    // 0 = none, warnings = 1, debug = 2, all = 3
    if (debugEnabled >= 3)
        CONFIG.debug.hooks = true;
};
export var debugEnabled;
// 0 = none, warnings = 1, debug = 2, all = 3
export let debug = (...args) => { if (debugEnabled > 1)
    console.log("DEBUG: dae | ", ...args); };
export let log = (...args) => console.log("dae | ", ...args);
export let warn = (...args) => { if (debugEnabled > 0)
    console.warn("dae | ", ...args); };
export let error = (...args) => console.error("dae | ", ...args);
export let timelog = (...args) => warn("dae | ", Date.now(), ...args);
export let i18n = key => {
    return game.i18n.localize(key);
};
export let daeAlternateStatus;
export let changesQueue;
export var gameSystemCompatible = "maybe"; // no, yes, partial, maybe
export var daeUntestedSystems;
/* ------------------------------------ */
/* Initialize module					*/
/* ------------------------------------ */
Hooks.once('init', async function () {
    debug('Init setup actions');
    CONFIG.compatibility.excludePatterns.push(new RegExp("/modules/itemacro/"));
    CONFIG.compatibility.excludePatterns.push(new RegExp("/modules/socketlib/"));
    CONFIG.compatibility.excludePatterns.push(new RegExp("/modules/libWrapper/"));
    const daeFlags = game.modules.get("dae").flags;
    const systemDaeFlag = game.system.flags?.daeCompatible;
    if (daeFlags.compatible?.includes(game.system.id) || systemDaeFlag === true)
        gameSystemCompatible = "yes";
    else if (daeFlags.incompatible?.includes(game.system.id) || systemDaeFlag === false)
        gameSystemCompatible = "no";
    if (gameSystemCompatible === "no") {
        console.error(`DAE is not compatible with ${game.system.title} module disabled`);
    }
    else {
        registerSettings();
        daeUntestedSystems = game.settings.get("dae", "DAEUntestedSystems");
        if (gameSystemCompatible === "yes" || daeUntestedSystems) {
            if (gameSystemCompatible === "maybe")
                console.warn(`DAE compatibility warning for ${game.system.title} is not tested with DAE`);
            daeInitActions();
            patchingInitSetup();
            fetchParams(false);
            // Preload Handlebars templates
            await preloadTemplates();
            //@ts-ignore Semaphore
            changesQueue = new window.Semaphore(1);
        }
    }
    ;
});
export var daeSpecialDurations;
export var daeMacroRepeats;
Hooks.once('ready', async function () {
    if (gameSystemCompatible !== "no" && (gameSystemCompatible === "yes" || daeUntestedSystems)) {
        if ("maybe" === gameSystemCompatible) {
            if (game.user.isGM)
                ui.notifications.warn(`DAE is has not been tested with ${game.system.title}. Disable DAE if there are problems`);
        }
        checkLibWrapperVersion();
        fetchParams();
        debug("ready setup actions");
        daeSpecialDurations = { "None": "" };
        if (game.modules.get("times-up")?.active && isNewerVersion(game.modules.get("times-up").version, "0.0.9")) {
            daeSpecialDurations["turnStart"] = i18n("dae.turnStart");
            daeSpecialDurations["turnEnd"] = i18n("dae.turnEnd");
            daeSpecialDurations["turnStartSource"] = i18n("dae.turnStartSource");
            daeSpecialDurations["turnEndSource"] = i18n("dae.turnEndSource");
            daeSpecialDurations["combatEnd"] = i18n("COMBAT.End");
            daeSpecialDurations["joinCombat"] = i18n("COMBAT.CombatantCreate");
            "COMBAT.CombatantCreate";
            daeMacroRepeats = {
                "none": "",
                "startEveryTurn": i18n("dae.startEveryTurn"),
                "endEveryTurn": i18n("dae.endEveryTurn")
            };
        }
        daeReadyActions();
        EditOwnedItemEffectsItemSheet.init();
        // setupDAEMacros();
    }
    else if (gameSystemCompatible === "maybe" && !daeUntestedSystems) {
        ui.notifications.error(`DAE is not certified compatible with ${game.system.id} - enable Untested Systems in DAE settings to enable`);
    }
    else {
        ui.notifications.error(`DAE is not compatible with ${game.system.id} - module disabled`);
    }
});
/* ------------------------------------ */
/* Setup module							*/
/* ------------------------------------ */
Hooks.once('setup', function () {
    if (gameSystemCompatible === "no" || (gameSystemCompatible === "maybe" && !daeUntestedSystems)) {
        ui.notifications.warn(`DAE disabled for ${game.system.name} - to enable choose Allow Untested Systems from the DAE settings`);
    }
    else {
        // Do anything after initialization but before
        // ready
        debug("setup actions");
        daeSetupActions();
        patchingSetup();
        //@ts-ignore
        window.DAE = {
            ActiveEffects: ActiveEffects,
            addAutoFields: addAutoFields,
            blindToken: blindToken,
            cleanEffectOrigins,
            cleanActorItemsEffectOrigins,
            confirmAction,
            convertDuration,
            createToken: createToken,
            DAEActiveEffectConfig: DAEActiveEffectConfig,
            DAEfromActorUuid: DAEfromActorUuid,
            DAEfromUuid: DAEfromUuid,
            daeMacro: daeMacro,
            daeSpecialDurations: () => { return daeSpecialDurations; },
            deleteActiveEffect: deleteActiveEffect,
            doEffects,
            fixTransferEffects: fixTransferEffects,
            fixupDDBAC: fixupDDBAC,
            getFlag: getFlag,
            getTokenFlag: getTokenFlag,
            migrateActorDAESRD: migrateActorDAESRD,
            migrateAllActorsDAESRD: migrateAllActorsDAESRD,
            migrateAllNPCDAESRD: migrateAllNPCDAESRD,
            moveToken: moveToken,
            renameToken: renameToken,
            restoreVision: restoreVision,
            setFlag: setFlag,
            setTileVisibility: setTileVisibility,
            setTokenFlag: setTokenFlag,
            setTokenVisibility: setTokenVisibility,
            teleportToken: teleportToken,
            teleportToToken: teleportToToken,
            tobMapper: tobMapper,
            unsetFlag: unsetFlag,
            ValidSpec,
            actionQueue: actionQueue,
            wildcardBaseEffects: wildcardEffects,
            daeCustomEffect: daeSystemClass.daeCustomEffect
        };
        setupSocket();
        Hooks.callAll("DAE.setupComplete");
    }
});
export function confirmAction(toCheck, confirmFunction, title = i18n("dae.confirm")) {
    if (toCheck) {
        let d = new Dialog({
            // localize this text
            title,
            content: `<p>${i18n("dae.sure")}</p>`,
            buttons: {
                one: {
                    icon: '<i class="fas fa-check"></i>',
                    label: "Confirm",
                    callback: confirmFunction
                },
                two: {
                    icon: '<i class="fas fa-times"></i>',
                    label: "Cancel",
                    callback: () => { }
                }
            },
            default: "two"
        });
        d.render(true);
    }
    else
        return confirmFunction();
}