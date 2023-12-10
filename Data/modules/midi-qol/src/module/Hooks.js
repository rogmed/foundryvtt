import { warn, error, debug, i18n, debugEnabled, overTimeEffectsToDelete, allAttackTypes, failedSaveOverTimeEffectsToDelete } from "../midi-qol.js";
import { colorChatMessageHandler, nsaMessageHandler, hideStuffHandler, chatDamageButtons, processItemCardCreation, hideRollUpdate, hideRollRender, onChatCardAction, betterRollsButtons, processCreateBetterRollsMessage, processCreateDDBGLMessages, ddbglPendingHook, betterRollsUpdate, checkOverTimeSaves } from "./chatMesssageHandling.js";
import { processUndoDamageCard } from "./GMAction.js";
import { untargetDeadTokens, untargetAllTokens, midiCustomEffect, MQfromUuid, getConcentrationEffect, removeReactionUsed, removeBonusActionUsed, checkflanking, getSystemCONFIG, expireRollEffect, doMidiConcentrationCheck, MQfromActorUuid, removeActionUsed, getConcentrationLabel } from "./utils.js";
import { OnUseMacros, activateMacroListeners } from "./apps/Item.js";
import { checkMechanic, configSettings, dragDropTargeting } from "./settings.js";
import { installedModules } from "./setupModules.js";
import { checkWounded, lookupItemMacro, preDeleteTemplate, preRollDeathSaveHook, preUpdateItemActorOnUseMacro, removeConcentration, zeroHPExpiry } from "./patching.js";
import { preItemUsageConsumptionHook, preRollDamageHook } from "./itemhandling.js";
export const concentrationCheckItemName = "Concentration Check - Midi QOL";
export var concentrationCheckItemDisplayName = "Concentration Check";
export var midiFlagTypes = {};
export let readyHooks = async () => {
	// Handle removing effects when the token is moved.
	Hooks.on("updateToken", (tokenDocument, update, diff, userId) => {
		if (game.user?.id !== userId)
			return;
		if ((update.x || update.y) === undefined)
			return;
		const actor = tokenDocument.actor;
		const expiredEffects = actor?.effects.filter(ef => {
			const specialDuration = getProperty(ef.flags, "dae.specialDuration");
			return specialDuration?.includes("isMoved");
		}) ?? [];
		if (expiredEffects.length > 0)
			actor?.deleteEmbeddedDocuments("ActiveEffect", expiredEffects.map(ef => ef.id), { "expiry-reason": "midi-qol:isMoved" });
	});
	Hooks.on("template3dUpdatePreview", (at, t) => {
		//@ts-expect-error Volumetrictemplates
		VolumetricTemplates.compute3Dtemplate(t);
	});
	Hooks.on("targetToken", debounce(checkflanking, 150));
	Hooks.on("ddb-game-log.pendingRoll", (data) => {
		ddbglPendingHook(data);
	});
	Hooks.on("preDeleteMeasuredTemplate", preDeleteTemplate);
	// Handle updates to the characters HP
	// Handle concentration checks
	Hooks.on("updateActor", async (actor, update, options, user) => {
		if (user !== game.user?.id)
			return;
		const hpUpdate = getProperty(update, "system.attributes.hp.value");
		const temphpUpdate = getProperty(update, "system.attributes.hp.temp");
		if (hpUpdate !== undefined || temphpUpdate !== undefined) {
			let hpDiff = getProperty(actor, "flags.midi-qol.concentration-damage") ?? 0;
			const hpUpdateFunc = async () => {
				await checkWounded(actor, update, options, user);
				await zeroHPExpiry(actor, update, options, user);
			};
			await hpUpdateFunc();
			if (configSettings.concentrationAutomation && !configSettings.noConcnetrationDamageCheck && hpDiff > 0 && !options.noConcentrationCheck) {
				// expireRollEffect.bind(actor)("Damaged", ""); - not this simple - need to think about specific damage types
				concentrationCheckItemDisplayName = i18n("midi-qol.concentrationCheckName");
				const concentrationEffect = getConcentrationEffect(actor);
				if (concentrationEffect) {
					if (actor.system.attributes.hp.value <= 0) {
						if (globalThis.DAE?.actionQueue)
							globalThis.DAE.actionQueue.add(concentrationEffect.delete.bind(concentrationEffect));
						else
							await concentrationEffect.delete();
					}
					else {
						const saveDC = Math.max(10, Math.floor(hpDiff / 2));
						await doMidiConcentrationCheck(actor, saveDC);
					}
				}
			}
		}
		return true;
	});
	Hooks.on("renderActorArmorConfig", (app, html, data) => {
		if (configSettings.optionalRules.challengeModeArmor) {
			const ac = data.ac;
			const element = html.find(".stacked"); // TODO do this better
			let ARHtml = $(`<div>EC: ${ac.EC}</div><div>AR: ${ac.AR}</div>`);
			element.append(ARHtml);
		}
	});
	// Handle removal of concentration
	Hooks.on("deleteActiveEffect", (...args) => {
		let [deletedEffect, options, user] = args;
		const checkConcentration = globalThis.MidiQOL?.configSettings()?.concentrationAutomation;
		debug("Deleted effects is ", deletedEffect, options);
		if (!checkConcentration || options.noConcentrationCheck)
			return;
		let gmToUse = game.users?.find(u => u.isGM && u.active);
		if (gmToUse?.id !== game.user?.id)
			return;
		if (!(deletedEffect.parent instanceof CONFIG.Actor.documentClass))
			return;
		const concentrationLabel = getConcentrationLabel();
		let isConcentration = (deletedEffect.name || deletedEffect.label) === concentrationLabel;
		const origin = MQfromUuid(deletedEffect.origin);
		async function changefunc() {
			if (isConcentration)
				return await removeConcentration(deletedEffect.parent, deletedEffect.uuid);
			if (origin instanceof CONFIG.Item.documentClass && origin.parent instanceof CONFIG.Actor.documentClass) {
				const concentrationData = getProperty(origin.parent, "flags.midi-qol.concentration-data");
				if (concentrationData && deletedEffect.origin === concentrationData.uuid) {
					const allConcentrationTargets = concentrationData.targets.filter(target => {
						let actor = MQfromActorUuid(target.actorUuid);
						const hasEffects = actor.effects.some(effect => effect.origin === concentrationData.uuid
							&& !effect.flags.dae.transfer
							&& effect.uuid !== deletedEffect.uuid);
						return hasEffects;
					});
					const concentrationTargets = concentrationData.targets.filter(target => {
						let actor = MQfromActorUuid(target.actorUuid);
						const hasEffects = actor.effects.some(effect => effect.origin === concentrationData.uuid
							&& !effect.flags.dae.transfer
							&& effect.uuid !== deletedEffect.uuid
							&& (effect.name || effect.label) !== concentrationLabel);
						return hasEffects;
					});
					if (["effects", "effectsTemplates"].includes(configSettings.removeConcentrationEffects)
						&& concentrationTargets.length < 1
						&& concentrationTargets.length < concentrationData.targets.length
						&& concentrationData.templates.length === 0
						&& concentrationData.removeUuids.length === 0) {
						// non concentration effects left
						await removeConcentration(origin.parent, deletedEffect.uuid);
					}
					else if (concentrationData.targets.length !== allConcentrationTargets.length) {
						// update the concentration data
						concentrationData.targets = allConcentrationTargets;
						await origin.parent.setFlag("midi-qol", "concentration-data", concentrationData);
					}
				}
			}
		}
		// if (globalThis.DAE?.actionQueue) globalThis.DAE.actionQueue.add(changefunc);
		changefunc();
	});
	// Hooks.on("restCompleted", restManager); I think this means 1.6 is required.
	Hooks.on("dnd5e.restCompleted", restManager);
	if (game.settings.get("midi-qol", "itemUseHooks") && game.system.id === "dnd5e") {
		// Hooks.on("dnd5e.preUseItem", preItemUseHook);
		Hooks.on("dnd5e.preItemUsageConsumption", preItemUsageConsumptionHook);
		// Hooks.on("dnd5e.useItem", useItemHook);
		// Hooks.on("dnd5e.preDisplayCard", preDisplayCardHook);
		// Hooks.on("dnd5e.displayCard", displayCardHook); - displayCard is wrapped instead.
		// Hooks.on("dnd5e.preRollAttack", preRollAttackHook);
		// Hooks.on("dnd5e.preRollAttack", (item, rollConfig) => {return preRollMacro(item, rollConfig, "dnd5e.preRollttack")});
		// Hooks.on("dnd5e.rollAttack", rollAttackMacro);
		// Hooks.on("dnd5e.rollAttack", rollAttackHook)
		Hooks.on("dnd5e.preRollDamage", (item, rollConfig) => {
			preRollDamageHook(item, rollConfig);
			// && preRollMacro(item, rollConfig, "dnd5e.preRollDamage");
		});
		// Hooks.on("dnd5e.rollDamage", rollDamageMacro)
		// Hooks.on("dnd5e.rollDamage", rollDamageHook)
		// Hooks.on("dnd5e.preRollFormula", (item, rollConfig) => {return preRollMacro(item, rollConfig, "dnd5e.preRollFormula")});
		// Hooks.on("dnd5e.rollFormula", rollFormulaMacro);
		// Hooks.on("dnd5e.preRollToolCheck", (item, rollConfig) => preRollMacro(item, rollConfig, "dnd5e.preRollToolCheck"));
		// Hooks.on("dnd5e.rollToolCheck", rollToolCheckMacro);
		// Hooks.on("dnd5e.preRollAbilitySave", preRollAbilitySaveHook);
		// Hooks.on("dnd5e.preRollAbilityTest", preRollAbilitySaveHook);
		// Hooks.on("dnd5e.rollAbilitySave", rollAbilitySaveHook);
		// Hooks.on("dnd5e.rollAbilityTest", rollAbilityTestHook)
	}
	else {
		Hooks.on("dnd5e.preItemUsageConsumption", preItemUsageConsumptionHook);
		Hooks.on("dnd5e.preRollDamage", (item, rollConfig) => {
			return preRollDamageHook(item, rollConfig);
		});
		// Hooks.on("dnd5e.rollDamage", rollDamageMacro);
	}
	Hooks.on("updateCombat", (combat, update, options, userId) => {
		if (userId !== game.user?.id)
			return;
		if (!update.hasOwnProperty("round"))
			return;
		if (!checkMechanic("autoRerollInitiative"))
			return;
		let combatantIds = combat.combatants.map(c => c.id);
		if (combat.combatants?.size > 0) {
			combat.rollInitiative(combatantIds, { updateTurn: true }).then(() => combat.update({ turn: 0 }));
		}
	});
	Hooks.on("dnd5e.preRollDeathSave", preRollDeathSaveHook);
	// Concentration Check is rolled as an item roll so we need an item.
	if (installedModules.get("combat-utility-belt")) {
		//@ts-ignore game.cub
		const concentrationCondition = game.cub.getCondition(game.settings.get("combat-utility-belt", "concentratorConditionName"));
		itemJSONData.name = concentrationCheckItemName;
		itemJSONData.img = concentrationCondition?.icon;
	}
	else {
		itemJSONData.name = concentrationCheckItemName;
	}
};
export function restManager(actor, result) {
	if (!actor || !result)
		return;
	removeReactionUsed(actor); // remove reaction used for a rest
	removeBonusActionUsed(actor);
	removeActionUsed(actor);
	const myExpiredEffects = actor.effects.filter(ef => {
		const specialDuration = getProperty(ef.flags, "dae.specialDuration");
		return specialDuration && ((result.longRest && specialDuration.includes(`longRest`))
			|| (result.newDay && specialDuration.includes(`newDay`))
			|| specialDuration.includes(`shortRest`));
	}).map(ef => ef.id);
	;
	if (myExpiredEffects?.length > 0)
		actor?.deleteEmbeddedDocuments("ActiveEffect", myExpiredEffects, { "expiry-reason": "midi-qol:rest" });
}
export function initHooks() {
	if (debugEnabled > 0)
		warn("Init Hooks processing");
	Hooks.on("preCreateChatMessage", (message, data, options, user) => {
		if (debugEnabled > 1)
			debug("preCreateChatMessage entering", message, data, options, user);
		nsaMessageHandler(message, data, options, user);
		checkOverTimeSaves(message, data, options, user);
		return true;
	});
	Hooks.on("createChatMessage", (message, options, user) => {
		if (debugEnabled > 1)
			debug("Create Chat Message ", message.id, message, options, user);
		processCreateBetterRollsMessage(message, user);
		processItemCardCreation(message, user);
		processCreateDDBGLMessages(message, options, user);
		return true;
	});
	Hooks.on("updateChatMessage", (message, update, options, user) => {
		hideRollUpdate(message, update, options, user);
		betterRollsUpdate(message, update, options, user);
		//@ts-ignore scrollBottom
		ui.chat?.scrollBottom();
	});
	Hooks.on("updateCombat", (combat, data, options, user) => {
		untargetAllTokens(combat, data.options, user);
		untargetDeadTokens();
		// updateReactionRounds(combat, data, options, user); This is handled in processOverTime
	});
	Hooks.on("renderChatMessage", (message, html, data) => {
		if (debugEnabled > 1)
			debug("render message hook ", message.id, message, html, data);
		chatDamageButtons(message, html, data);
		processUndoDamageCard(message, html, data);
		colorChatMessageHandler(message, html, data);
		hideRollRender(message, html, data);
		betterRollsButtons(message, html, data);
		hideStuffHandler(message, html, data);
	});
	Hooks.on("midi-qol.RollComplete", async (workflow) => {
		const wfuuid = workflow.uuid;
		if (failedSaveOverTimeEffectsToDelete[wfuuid]) {
			if (workflow.saves.size === 1 || !workflow.hasSave) {
				let effectId = failedSaveOverTimeEffectsToDelete[wfuuid].effectId;
				let actor = failedSaveOverTimeEffectsToDelete[wfuuid].actor;
				await actor.deleteEmbeddedDocuments("ActiveEffect", [effectId]), { "expiry-reason": "midi-qol:overTime" };
			}
			delete failedSaveOverTimeEffectsToDelete[wfuuid];
		}
		if (overTimeEffectsToDelete[wfuuid]) {
			let effectId = overTimeEffectsToDelete[wfuuid].effectId;
			let actor = overTimeEffectsToDelete[wfuuid].actor;
			await actor.deleteEmbeddedDocuments("ActiveEffect", [effectId]), { "expiry-reason": "midi-qol:overTime" };
			delete overTimeEffectsToDelete[wfuuid];
		}
		if (debugEnabled > 1)
			debug("Finished the roll", wfuuid);
	});
	setupMidiFlagTypes();
	Hooks.on("applyActiveEffect", midiCustomEffect);
	Hooks.on("preCreateActiveEffect", lookupItemMacro);
	// Hooks.on("preCreateActiveEffect", checkImmunity); Disabled in lieu of having effect marked suppressed
	Hooks.on("preUpdateItem", preUpdateItemActorOnUseMacro);
	Hooks.on("preUpdateActor", (actor, update, options, user) => {
		// need to record the damage done since it is not available in the update actor hook
		const hpUpdate = getProperty(update, "system.attributes.hp.value");
		const temphpUpdate = getProperty(update, "system.attributes.hp.temp");
		let concHPDiff = 0;
		if (hpUpdate !== undefined || temphpUpdate !== undefined) {
			if (hpUpdate !== undefined) {
				let hpChange = actor.system.attributes.hp.value - hpUpdate;
				if (hpChange > 0)
					concHPDiff = concHPDiff + hpChange;
			}
			if (configSettings.tempHPDamageConcentrationCheck && temphpUpdate !== undefined) {
				let temphpDiff = actor.system.attributes.hp.temp - temphpUpdate;
				if (temphpDiff > 0)
					concHPDiff = concHPDiff + temphpDiff;
			}
			if (concHPDiff !== getProperty(actor, "flags.midi-qol.concentration-damage")) {
				if (!actor.isToken)
					setProperty(update, "flags.midi-qol.concentration-damage", concHPDiff ?? 0);
				else
					setProperty(update, "flags", mergeObject({ "midi-qol.concentration-damage": concHPDiff ?? 0 }, actor._source.flags, { overwrite: false }));
			}
		}
		preUpdateItemActorOnUseMacro(actor, update, options, user); // This needs to run second so there is no duplication
		return true;
	});
	Hooks.on("updateCombatant", (combatant, updates, options, user) => {
		if (game?.user?.id !== user)
			return true;
		if (combatant.actor && updates.initiative)
			expireRollEffect.bind(combatant.actor)("Initiative", "none");
		return true;
	});
	Hooks.on("renderItemSheet", (app, html, data) => {
		const element = html.find('input[name="system.chatFlavor"]').parent().parent();
		const criticalElement = html.find('input[name="system.critical.threshold"]');
		element.append('<h3 class="form-header">Midi Qol Fields</h3>');
		if (criticalElement.length > 0) {
			let currentFumble = getProperty(app.object, "flags.midi-qol.fumbleThreshold");
			const labelText = i18n("midi-qol.FumbleThreshold");
			const fumbleThreshold = `<div class="form-group"><label>${labelText}</label><div class="form-fields"><input type="Number" name="flags.midi-qol.fumbleThreshold" value="${currentFumble}"/></div></div>`;
			element.append(fumbleThreshold);
		}
		if (configSettings.allowUseMacro) {
			const labelText = i18n("midi-qol.onUseMacroLabel");
			const macros = new OnUseMacros(getProperty(app.object, "flags.midi-qol.onUseMacroName"));
			const macroField = `
		<h4 class="damage-header">${labelText}
		<a class="macro-control damage-control add-macro"><i class="fas fa-plus"></i></a>
		</h4>
		<ol class="damage-parts onusemacro-group form-group">
		${macros.selectListOptions}
	</ol>`;
			element.append(macroField);
		}
		const labelText = i18n("midi-qol.EffectActivation");
		let currentEffectActivation = getProperty(app.object, "flags.midi-qol.effectActivation") ?? "";
		const activationField = `<div class="form-group"><label>${labelText}</label><input type="checkbox" name="flags.midi-qol.effectActivation" ${currentEffectActivation ? "checked" : ""}/> </div>`;
		element.append(activationField);
		if (installedModules.get("dfreds-convenient-effects")) {
			//@ts-ignore dfreds
			const ceForItem = game.dfreds.effects.all.find(e => (e.name || e.label) === app.object.name);
			if (ceForItem) {
				const element = html.find('input[name="system.chatFlavor"]').parent().parent();
				if (["both", "cepri", "itempri"].includes(configSettings.autoCEEffects)) {
					const offLabel = i18n("midi-qol.convenientEffectsOff");
					const currentEffect = getProperty(app.object, "flags.midi-qol.forceCEOff") ?? false;
					const effect = `<div class="form-group"><label>${offLabel}</label><input type="checkbox" name="flags.midi-qol.forceCEOff" data-dtype="Boolean" ${currentEffect ? "checked" : ""}></div>`;
					element.append(effect);
				}
				if (["none", "itempri"].includes(configSettings.autoCEEffects)) {
					const onLabel = i18n("midi-qol.convenientEffectsOn");
					const currentEffect = getProperty(app.object, "flags.midi-qol.forceCEOn") ?? false;
					const effect = `<div class="form-group"><label>${onLabel}</label><input type="checkbox" name="flags.midi-qol.forceCEOn" data-dtype="Boolean" ${currentEffect ? "checked" : ""}></div>`;
					element.append(effect);
				}
			}
		}
		let config = getSystemCONFIG();
		//@ts-ignore
		const midiProps = config.midiProperties;
		setProperty(data, "flags.midiProperties", app.object.flags.midiProperties ?? {});
		if (!data.flags?.midiProperties)
			setProperty(data, "flags.midiProperties", {});
		if (app.object && ["spell", "feat", "weapon", "consumable"].includes(app.object.type)) {
			const item = app.object;
			if (item.flags.midiProperties === undefined) {
				item.flags.midiProperties = {};
				for (let prop of Object.keys(midiProps)) {
					if (getProperty(item.system, `properties.${prop}`) && data.flags.midiProperties[prop] === undefined) {
						data.flags.midiProperties[prop] = true;
						delete item.system.properties.nodam;
					}
				}
			}
			if (item.system.properties?.fulldam !== undefined) {
				app.object.updateSource({
					"system.properties.-=fulldam": null,
					"system.properties.-=halfdam": null,
					"system.properties.-=nodam": null,
					"system.properties.-=critOther": null,
					"flags.midiProperties": data.flags.midiProperties
				});
			}
			let newHtml = `<div><div class="form-group stacked weapon-properties">
		<label>${i18n("midi-qol.MidiProperties")}</label>`;
			for (let prop of Object.keys(midiProps)) {
				newHtml += `<label class="checkbox">
		<input type="checkbox" name="flags.midiProperties.${prop}" ${data.flags.midiProperties[prop] ? "checked" : ""} /> ${midiProps[prop]}
		</label>`;
			}
			newHtml += "</div></div>";
			element.append(newHtml);
			//@ts-expect-error
			if (isNewerVersion(game.system.version, "2.2") && game.system.id === "dnd5e") {
				if (item.system.hasScalarTarget && !item.hasAreaTarget) { // stop gap for dnd5e2.2 hiding this field sometimes
					const targetElement = html.find('select[name="system.target.type"]');
					const targetUnitHTML = `
			<select name="system.target.units" data-tooltip="${i18n(getSystemCONFIG().TargetUnits)}">
			<option value="" ${item.system.target.units === '' ? "selected" : ''}></option>
			<option value="ft" ${item.system.target.units === 'ft' ? "selected" : ''}>Feet</option>
			<option value="mi " ${item.system.target.units === 'mi' ? "selected" : ''}>Miles</option>
			<option value="m" ${item.system.target.units === 'm' ? "selected" : ''}>Meters</option>
			<option value="km" ${item.system.target.units === 'km' ? "selected" : ''}>Kilometers</option>
			</select>
		`;
					targetElement.before(targetUnitHTML);
				}
			}
		}
		activateMacroListeners(app, html);
	});
	function _chatListeners(html) {
		html.on("click", '.card-buttons button', onChatCardAction.bind(this));
	}
	Hooks.on("renderChatLog", (app, html, data) => _chatListeners(html));
	Hooks.on('dropCanvasData', function (canvas, dropData) {
		if (!dragDropTargeting)
			return true;
		if (dropData.type !== "Item")
			return true;
		if (!canvas?.grid?.grid)
			return;
		//@ts-ignore .grid v10
		let grid_size = canvas.scene?.grid;
		let coords = canvas.grid.grid.getPixelsFromGridPosition(...canvas.grid.grid.getGridPositionFromPixels(dropData.x, dropData.y));
		const targetCount = canvas.tokens?.targetObjects({
			x: coords[0],
			y: coords[1],
			height: grid_size?.size,
			width: grid_size?.size
		}, { releaseOthers: true });
		if (targetCount === 0) {
			ui.notifications?.warn("No target selected");
			return true;
		}
		const item = MQfromUuid(dropData.uuid);
		if (!item)
			error("actor / item broke ", item);
		item?.use();
		return true;
	});
}
function setupMidiFlagTypes() {
	let config = getSystemCONFIG();
	let attackTypes = allAttackTypes.concat(["heal", "other", "save", "util"]);
	attackTypes.forEach(at => {
		midiFlagTypes[`flags.midi-qol.DR.${at}`] = "number";
		//  midiFlagTypes[`flags.midi-qol.optional.NAME.attack.${at}`] = "string"
		//  midiFlagTypes[`flags.midi-qol.optional.NAME.damage.${at}`] = "string"
	});
	midiFlagTypes["flags.midi-qol.onUseMacroName"] = "string";
	Object.keys(config.abilities).forEach(abl => {
		// midiFlagTypes[`flags.midi-qol.optional.NAME.save.${abl}`] = "string";
		// midiFlagTypes[`flags.midi-qol.optional.NAME.check.${abl}`] = "string";
	});
	Object.keys(config.skills).forEach(skill => {
		// midiFlagTypes[`flags.midi-qol.optional.NAME.skill.${skill}`] = "string";
	});
	if (game.system.id === "dnd5e") {
		midiFlagTypes[`flags.midi-qol.DR.all`] = "string";
		midiFlagTypes[`flags.midi-qol.DR.non-magical`] = "string";
		midiFlagTypes[`flags.midi-qol.DR.non-silver`] = "string";
		midiFlagTypes[`flags.midi-qol.DR.non-adamant`] = "string";
		midiFlagTypes[`flags.midi-qol.DR.non-physical`] = "string";
		midiFlagTypes[`flags.midi-qol.DR.final`] = "number";
		Object.keys(config.damageResistanceTypes).forEach(dt => {
			midiFlagTypes[`flags.midi-qol.DR.${dt}`] = "string";
		});
	}
	// midiFlagTypes[`flags.midi-qol.optional.NAME.attack.all`] = "string";
	// midiFlagTypes[`flags.midi-qol.optional.NAME.damage.all`] = "string";
	// midiFlagTypes[`flags.midi-qol.optional.NAME.check.all`] = "string";
	// midiFlagTypes[`flags.midi-qol.optional.NAME.save.all`] = "string";
	// midiFlagTypes[`flags.midi-qol.optional.NAME.label`] = "string";
	// midiFlagTypes[`flags.midi-qol.optional.NAME.skill.all`] = "string";
	// midiFlagTypes[`flags.midi-qol.optional.NAME.count`] = "string";
	// midiFlagTypes[`flags.midi-qol.optional.NAME.ac`] = "string";
	// midiFlagTypes[`flags.midi-qol.optional.NAME.criticalDamage`] = "string";
	// midiFlagTypes[`flags.midi-qol.OverTime`] = "string";
}
export function setupHooks() {
}
export const overTimeJSONData = {
	"name": "OverTime Item",
	"type": "weapon",
	"img": "icons/svg/aura.svg",
	"system": {
		"description": {
			"value": "",
			"chat": "",
			"unidentified": ""
		},
		"source": "",
		"quantity": 1,
		"weight": 0,
		"price": 0,
		"attuned": false,
		"attunement": 0,
		"equipped": false,
		"rarity": "",
		"identified": true,
		"activation": {
			"type": "special",
			"cost": 0,
			"condition": ""
		},
		"duration": {
			"value": null,
			"units": ""
		},
		"target": {
			"value": null,
			"width": null,
			"units": "",
			"type": "creature"
		},
		"range": {
			"value": null,
			"long": null,
			"units": ""
		},
		"uses": {
			"value": 0,
			"max": "0",
			"per": ""
		},
		"consume": {
			"type": "",
			"target": "",
			"amount": null
		},
		"preparation": { "mode": "atwill" },
		"ability": "",
		"actionType": "save",
		"attackBonus": 0,
		"chatFlavor": "",
		"critical": null,
		"damage": {
			"parts": [],
			"versatile": ""
		},
		"formula": "",
		"save": {
			"ability": "con",
			"dc": 10,
			"scaling": "flat"
		},
		"armor": {
			"value": 0
		},
		"hp": {
			"value": 0,
			"max": 0,
			"dt": null,
			"conditions": ""
		},
		"weaponType": "simpleM",
		"properties": {
			"ada": false,
			"amm": false,
			"fin": false,
			"fir": false,
			"foc": false,
			"hvy": false,
			"lgt": false,
			"lod": false,
			"mgc": false,
			"rch": false,
			"rel": false,
			"ret": false,
			"sil": false,
			"spc": false,
			"thr": false,
			"two": false,
			"ver": false,
			"nodam": false,
			"fulldam": false,
			"halfdam": false
		},
		"proficient": false,
		"attributes": {
			"spelldc": 10
		}
	},
	"effects": [],
	"sort": 0,
	"flags": {
		"midi-qol": {
			"noCE": true
		}
	}
};
export const itemJSONData = {
	"name": "Concentration Check - Midi QOL",
	"type": "weapon",
	"img": "./modules/midi-qol/icons/concentrate.png",
	"system": {
		"description": {
			"value": "",
			"chat": "",
			"unidentified": ""
		},
		"activation": {
			"type": "special",
			"cost": 0,
			"condition": ""
		},
		"target": {
			"type": ""
		},
		"ability": "",
		"actionType": "save",
		"attackBonus": 0,
		"chatFlavor": "",
		"weaponType": "simpleM",
		"proficient": false,
		"attributes": {
			"spelldc": 10
		}
	},
	"effects": [],
	"sort": 0,
	"flags": {
		"midi-qol": {
			"onUseMacroName": "ItemMacro",
			"isConcentrationCheck": true
		},
		"itemacro": {
			"macro": {
				"_id": null,
				"name": "Concentration Check - Midi QOL",
				"type": "script",
				"author": "devnIbfBHb74U9Zv",
				"img": "icons/svg/dice-target.svg",
				"scope": "global",
				"command": `
			if (MidiQOL.configSettings().autoCheckSaves === 'none') return;
			for (let targetUuid of args[0].targetUuids) {
				let target = await fromUuid(targetUuid);
				if (MidiQOL.configSettings().removeConcentration 
				&& (target.actor.system.attributes.hp.value === 0 || args[0].failedSaveUuids.find(uuid => uuid === targetUuid))) {
				const concentrationEffect = MidiQOL.getConcentrationEffect(target.actor);
				if (concentrationEffect) await concentrationEffect.delete();
				}
			}`,
				"folder": null,
				"sort": 0,
				"permission": {
					"default": 0
				},
				"flags": {}
			}
		},
	}
};
