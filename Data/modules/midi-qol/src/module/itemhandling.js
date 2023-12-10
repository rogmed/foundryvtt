import { warn, debug, error, i18n, MESSAGETYPES, i18nFormat, gameStats, debugEnabled, log, debugCallTiming, allAttackTypes } from "../midi-qol.js";
import { BetterRollsWorkflow, DummyWorkflow, TrapWorkflow, Workflow, WORKFLOWSTATES } from "./workflow.js";
import { configSettings, enableWorkflow, checkRule, checkMechanic } from "./settings.js";
import { checkRange, computeTemplateShapeDistance, getAutoRollAttack, getAutoRollDamage, getConcentrationEffect, getLateTargeting, getRemoveDamageButtons, getSelfTargetSet, getSpeaker, getUnitDist, isAutoConsumeResource, itemHasDamage, itemIsVersatile, processAttackRollBonusFlags, processDamageRollBonusFlags, validTargetTokens, isInCombat, setReactionUsed, hasUsedReaction, checkIncapacitated, needsReactionCheck, needsBonusActionCheck, setBonusActionUsed, hasUsedBonusAction, asyncHooksCall, addAdvAttribution, getSystemCONFIG, evalActivationCondition, createDamageList, getDamageType, getDamageFlavor, completeItemUse, hasDAE, tokenForActor, getRemoveAttackButtons, doReactions, displayDSNForRoll, isTargetable } from "./utils.js";
import { installedModules } from "./setupModules.js";
import { mapSpeedKeys } from "./MidiKeyManager.js";
import { LateTargetingDialog } from "./apps/LateTargeting.js";
import { defaultRollOptions, removeConcentration } from "./patching.js";
import { saveUndoData } from "./undo.js";
import { socketlibSocket } from "./GMAction.js";
export async function doItemUse(wrapped, config = {}, options = {}) {
	const pressedKeys = duplicate(globalThis.MidiKeyManager.pressedKeys);
	let tokenToUse;
	//  if (configSettings.mergeCard && (configSettings.attackPerTarget === true || options.workflowOptions?.attackPerTarget === true) && this.hasAttack && options?.singleTarget !== true && game?.user?.targets) {
	if (((configSettings.attackPerTarget === true || options.workflowOptions?.attackPerTarget === true) && options.workflowOptions?.attackPerTarget !== false)
		&& this.hasAttack
		&& options?.singleTarget !== true
		&& game?.user?.targets
		&& !game.settings.get("midi-qol", "itemUseHooks")) {
		Workflow.removeWorkflow(this.uuid);
		const lateTargetingSetting = getLateTargeting();
		let lateTargetingSet = lateTargetingSetting === "all" || (lateTargetingSetting === "noTargetsSelected" && game?.user?.targets.size === 0);
		if (options.workflowOptions?.lateTargeting && options.workflowOptions?.lateTargeting !== "none")
			lateTargetingSet = true;
		if (game.user.targets.size === 0 && lateTargetingSet)
			await resolveLateTargeting(this, options, pressedKeys);
		const targets = [];
		for (let target of game?.user?.targets)
			targets.push(target);
		if (targets.length > 0) {
			for (let target of targets) {
				const newOptions = mergeObject(options, { singleTarget: true, targetUuids: [target.document.uuid], workflowOptions: { lateTargeting: "none" } }, { inplace: false, overwrite: true });
				await completeItemUse(this, {}, newOptions);
			}
		}
		else {
			const newOptions = mergeObject(options, { singleTarget: true, targetUuids: [], workflowOptions: { lateTargeting: "none" } }, { inplace: false, overwrite: true });
			await completeItemUse(this, {}, newOptions);
		}
		// The workflow only refers to the last target.
		// If there was more than one should remove the workflow.
		if (targets.length > 1)
			Workflow.removeWorkflow(this.uuid);
		return;
	}
	options = mergeObject({
		systemCard: false,
		createWorkflow: true,
		versatile: false,
		configureDialog: true,
		createMessage: true,
		workflowOptions: { lateTargeting: undefined, notReaction: false }
	}, options, { insertKeys: true, insertValues: true, overWrite: true });
	const itemRollStart = Date.now();
	let systemCard = options?.systemCard ?? false;
	let createWorkflow = options?.createWorkflow ?? true;
	let versatile = options?.versatile ?? false;
	if (!enableWorkflow || createWorkflow === false) {
		return await wrapped(config, options);
	}
	if (!options.workflowOptions.allowIncapacitated && checkMechanic("incapacitated") && checkIncapacitated(this.actor, this, null)) {
		ui.notifications?.warn(`${this.actor.name} is incapacitated`);
		return;
	}
	const isRangeSpell = ["ft", "m"].includes(this.system.target?.units) && ["creature", "ally", "enemy"].includes(this.system.target?.type);
	const isAoESpell = this.hasAreaTarget;
	const requiresTargets = configSettings.requiresTargets === "always" || (configSettings.requiresTargets === "combat" && (game.combat ?? null) !== null);
	const lateTargetingSetting = getLateTargeting();
	const lateTargetingSet = lateTargetingSetting === "all" || (lateTargetingSetting === "noTargetsSelected" && game?.user?.targets.size === 0);
	const shouldCheckLateTargeting = (allAttackTypes.includes(this.system.actionType) || (this.hasTarget && !this.hasAreaTarget))
		&& ((options.workflowOptions?.lateTargeting ? (options.workflowOptions?.lateTargeting !== "none") : lateTargetingSet));
	let speaker = getSpeaker(this.actor);
	// Call preTargeting hook/onUse macro. Create a dummy workflow if one does not already exist for the item
	const existingWorkflow = Workflow.getWorkflow(this.uuid);
	let theWorkflow = existingWorkflow;
	if (!existingWorkflow)
		theWorkflow = new DummyWorkflow(this.parent, this, speaker, game?.user?.targets ?? new Set(), {});
	if (await asyncHooksCall("midi-qol.preTargeting", theWorkflow) === false || await asyncHooksCall(`midi-qol.preTargeting.${this.uuid}`, { item: this }) === false) {
		console.warn("midi-qol | attack roll blocked by preTargeting hook");
		if (!existingWorkflow)
			Workflow.removeWorkflow(theWorkflow.id);
		return;
	}
	if (configSettings.allowUseMacro) {
		const results = await theWorkflow.callMacros(this, theWorkflow.onUseMacros?.getMacros("preTargeting"), "OnUse", "preTargeting");
		if (results.some(i => i === false)) {
			console.warn("midi-qol | item roll blocked by preTargeting macro");
			ui.notifications?.notify(`${this.name ?? ""} use blocked by preTargeting macro`);
			if (!existingWorkflow)
				Workflow.removeWorkflow(theWorkflow.id);
			return;
		}
	}
	if (!existingWorkflow)
		Workflow.removeWorkflow(theWorkflow.id);
	if (shouldCheckLateTargeting && !isRangeSpell && !isAoESpell) {
		// normal targeting and auto rolling attack so allow late targeting
		let canDoLateTargeting = this.system.target.type !== "self";
		//explicit don't do late targeting passed
		if (options.workflowOptions?.lateTargeting === "none")
			canDoLateTargeting = false;
		// TODO look at this if AoE spell and not auto targeting need to work out how to deal with template placement
		if (false && isAoESpell && configSettings.autoTarget === "none")
			canDoLateTargeting = true;
		// TODO look at this if range spell and not auto targeting
		const targetDetails = this.system.target;
		if (false && configSettings.rangeTarget === "none" && ["ft", "m"].includes(targetDetails?.units) && ["creature", "ally", "enemy"].includes(targetDetails?.type))
			canDoLateTargeting = true;
		// TODO consider template and range spells when not template targeting?
		if (canDoLateTargeting) {
			if (!(await resolveLateTargeting(this, options, pressedKeys)))
				return null;
		}
	}
	const myTargets = game.user?.targets && validTargetTokens(game.user?.targets);
	let shouldAllowRoll = !requiresTargets // we don't care about targets
		|| ((myTargets?.size || 0) > 0) // there are some target selected
		|| (this.system.target?.type === "self") // self target
		|| isAoESpell // area effect spell and we will auto target
		|| isRangeSpell // range target and will autotarget
		|| (!this.hasAttack && !itemHasDamage(this) && !this.hasSave); // does not do anything - need to chck dynamic effects
	if (requiresTargets && !isRangeSpell && !isAoESpell && this.system.target?.type === "creature" && (myTargets?.size || 0) === 0) {
		ui.notifications?.warn(i18n("midi-qol.noTargets"));
		if (debugEnabled > 0)
			warn(`${game.user?.name} attempted to roll with no targets selected`);
		return false;
	}
	// only allow weapon attacks against at most the specified number of targets
	let allowedTargets = (this.system.target?.type === "creature" ? this.system.target?.value : 9999) ?? 9999;
	const inCombat = isInCombat(this.actor);
	let AoO = false;
	let activeCombatants = game.combats?.combats.map(combat => combat.combatant?.token?.id);
	const isTurn = activeCombatants?.includes(speaker.token);
	const checkReactionAOO = configSettings.recordAOO === "all" || (configSettings.recordAOO === this.actor.type);
	let itemUsesReaction = false;
	const hasReaction = await hasUsedReaction(this.actor);
	if (!options.workflowOptions.notReaction && ["reaction", "reactiondamage", "reactionmanual", "reactionpreattack"].includes(this.system.activation?.type) && this.system.activation?.cost > 0) {
		itemUsesReaction = true;
	}
	if (!options.workflowOptions.notReaction && checkReactionAOO && !itemUsesReaction && this.hasAttack) {
		let activeCombatants = game.combats?.combats.map(combat => combat.combatant?.token?.id);
		const isTurn = activeCombatants?.includes(speaker.token);
		if (!isTurn && inCombat) {
			itemUsesReaction = true;
			AoO = true;
		}
	}
	// do pre roll checks
	if (checkRule("checkRange") && !isAoESpell && !isRangeSpell && !AoO && speaker.token) {
		tokenToUse = canvas?.tokens?.get(speaker.token);
		const { result, attackingToken } = checkRange(this, tokenToUse, myTargets);
		if (speaker.token && result === "fail")
			return null;
		else
			tokenToUse = attackingToken;
	}
	if ((game.system.id === "dnd5e" || game.system.id === "n5e") && requiresTargets && myTargets && myTargets.size > allowedTargets) {
		ui.notifications?.warn(i18nFormat("midi-qol.wrongNumberTargets", { allowedTargets }));
		if (debugEnabled > 0)
			warn(`${game.user?.name} ${i18nFormat("midi-qol.midi-qol.wrongNumberTargets", { allowedTargets })}`);
		return null;
	}
	if (this.type === "spell" && shouldAllowRoll) {
		const midiFlags = this.actor.flags["midi-qol"];
		const needsVerbal = this.system.components?.vocal;
		const needsSomatic = this.system.components?.somatic;
		const needsMaterial = this.system.components?.material;
		//TODO Consider how to disable this check for DamageOnly workflows and trap workflows
		if (midiFlags?.fail?.spell?.all) {
			ui.notifications?.warn("You are unable to cast the spell");
			return null;
		}
		if ((midiFlags?.fail?.spell?.verbal || midiFlags?.fail?.spell?.vocal) && needsVerbal) {
			ui.notifications?.warn("You make no sound and the spell fails");
			return null;
		}
		if (midiFlags?.fail?.spell?.somatic && needsSomatic) {
			ui.notifications?.warn("You can't make the gestures and the spell fails");
			return null;
		}
		if (midiFlags?.fail?.spell?.material && needsMaterial) {
			ui.notifications?.warn("You can't use the material component and the spell fails");
			return null;
		}
	}
	const needsConcentration = this.system.components?.concentration
		|| this.flags.midiProperties?.concentration
		|| this.system.activation?.condition?.toLocaleLowerCase().includes(i18n("midi-qol.concentrationActivationCondition").toLocaleLowerCase());
	const checkConcentration = configSettings.concentrationAutomation;
	if (needsConcentration && checkConcentration) {
		const concentrationEffect = getConcentrationEffect(this.actor);
		if (concentrationEffect) {
			//@ts-ignore
			const concentrationEffectName = (concentrationEffect._sourceName && concentrationEffect._sourceName !== "None") ? concentrationEffect._sourceName : "";
			shouldAllowRoll = false;
			let d = await Dialog.confirm({
				title: i18n("midi-qol.ActiveConcentrationSpell.Title"),
				content: i18n(concentrationEffectName ? "midi-qol.ActiveConcentrationSpell.ContentNamed" : "midi-qol.ActiveConcentrationSpell.ContentGeneric").replace("@NAME@", concentrationEffectName),
				yes: () => { shouldAllowRoll = true; },
			});
			if (!shouldAllowRoll)
				return; // user aborted spell
		}
	}
	if (!shouldAllowRoll) {
		return null;
	}
	const targets = (this?.system.target?.type === "self") ? getSelfTargetSet(this.actor) : myTargets;
	let workflow;
	workflow = Workflow.getWorkflow(this.uuid);
	/* TODO this is not working correctly (for not auto roll cases) always create the workflow
	if (!workflow || workflow.currentState === WORKFLOWSTATES.ROLLFINISHED) {
	workflow = new Workflow(this.actor, this, speaker, targets, { event: options.event || event, pressedKeys, workflowOptions: options.workflowOptions });
	}
	*/
	workflow = new Workflow(this.actor, this, speaker, targets, { event: config.event || options.event || event, pressedKeys, workflowOptions: options.workflowOptions });
	workflow.inCombat = inCombat ?? false;
	workflow.isTurn = isTurn ?? false;
	workflow.AoO = AoO;
	workflow.config = config;
	workflow.options = options;
	workflow.attackingToken = tokenToUse;
	workflow.castData = {
		baseLevel: this.system.level,
		castLevel: workflow.itemLevel,
		itemUuid: workflow.itemUuid
	};
	if (configSettings.undoWorkflow)
		await saveUndoData(workflow);
	workflow.rollOptions.versatile = workflow.rollOptions.versatile || versatile || workflow.isVersatile;
	// if showing a full card we don't want to auto roll attacks or damage.
	workflow.noAutoDamage = systemCard;
	workflow.noAutoAttack = systemCard;
	const consume = this.system.consume;
	if (consume?.type === "ammo") {
		workflow.ammo = this.actor.items.get(consume.target);
	}
	workflow.reactionQueried = false;
	const blockReaction = itemUsesReaction && hasReaction && workflow.inCombat && needsReactionCheck(this.actor);
	if (blockReaction) {
		let shouldRoll = false;
		let d = await Dialog.confirm({
			title: i18n("midi-qol.EnforceReactions.Title"),
			content: i18n("midi-qol.EnforceReactions.Content"),
			yes: () => { shouldRoll = true; },
		});
		if (!shouldRoll)
			return; // user aborted roll TODO should the workflow be deleted?
	}
	const hasBonusAction = await hasUsedBonusAction(this.actor);
	const itemUsesBonusAction = ["bonus"].includes(this.system.activation?.type);
	const blockBonus = workflow.inCombat && itemUsesBonusAction && hasBonusAction && needsBonusActionCheck(this.actor);
	if (blockBonus) {
		let shouldRoll = false;
		let d = await Dialog.confirm({
			title: i18n("midi-qol.EnforceBonusActions.Title"),
			content: i18n("midi-qol.EnforceBonusActions.Content"),
			yes: () => { shouldRoll = true; },
		});
		if (!shouldRoll)
			return; // user aborted roll TODO should the workflow be deleted?
	}
	if (await asyncHooksCall("midi-qol.preItemRoll", workflow) === false || await asyncHooksCall(`midi-qol.preItemRoll.${this.uuid}`, workflow) === false) {
		console.warn("midi-qol | attack roll blocked by preItemRoll hook");
		return workflow.next(WORKFLOWSTATES.ROLLFINISHED);
		// Workflow.removeWorkflow(workflow.id);
		// return;
	}
	if (configSettings.allowUseMacro) {
		const results = await workflow.callMacros(this, workflow.onUseMacros?.getMacros("preItemRoll"), "OnUse", "preItemRoll");
		if (results.some(i => i === false)) {
			console.warn("midi-qol | item roll blocked by preItemRoll macro");
			ui.notifications?.notify(`${this.name ?? ""} use blocked by preItemRoll macro`);
			workflow.aborted = true;
			return workflow.next(WORKFLOWSTATES.ROLLFINISHED);
			// Workflow.removeWorkflow(workflow.id);
			// return;
		}
	}
	if (options.configureDialog) {
		if (this.type === "spell") {
			if (["both", "spell"].includes(isAutoConsumeResource(workflow))) { // && !workflow.rollOptions.fastForward) {
				options.configureDialog = false;
				// Check that there is a spell slot of the right level
				const spells = this.actor.system.spells;
				if (spells[`spell${this.system.level}`]?.value === 0 &&
					(spells.pact.value === 0 || spells.pact.level < this.system.level)) {
					options.configureDialog = true;
				}
				if (!options.configureDialog && this.hasAreaTarget && this.actor?.sheet) {
					setTimeout(() => {
						this.actor?.sheet.minimize();
					}, 100);
				}
			}
		}
		else
			options.configureDialog = !(["both", "item"].includes(isAutoConsumeResource(workflow)));
	}
	workflow.processAttackEventOptions();
	await workflow.checkAttackAdvantage();
	workflow.showCard = true;
	const wrappedRollStart = Date.now();
	// let result = await wrapped(config, mergeObject(options, { createMessage: false }, { inplace: false }));
	let result = await wrapped(workflow.config, mergeObject(options, { workflowId: workflow.id }, { inplace: false }));
	if (!result) {
		//TODO find the right way to clean this up
		console.warn("midi-qol | itemhandling wrapped returned ", result);
		// Workflow.removeWorkflow(workflow.id); ?
		return null;
	}
	if (itemUsesBonusAction && !hasBonusAction && configSettings.enforceBonusActions !== "none" && workflow.inCombat)
		await setBonusActionUsed(this.actor);
	if (itemUsesReaction && !hasReaction && configSettings.enforceReactions !== "none" && workflow.inCombat)
		await setReactionUsed(this.actor);
	if (needsConcentration && checkConcentration) {
		const concentrationEffect = getConcentrationEffect(this.actor);
		if (concentrationEffect)
			await removeConcentration(this.actor, concentrationEffect.uuid);
	}
	if (debugCallTiming)
		log(`wrapped item.roll() elapsed ${Date.now() - wrappedRollStart}ms`);
	if (debugCallTiming)
		log(`item.roll() elapsed ${Date.now() - itemRollStart}ms`);
	// Need concentration removal to complete before allowing workflow to continue so have workflow wait for item use to complete
	workflow.preItemUseComplete = true;
	if (workflow.currentState === WORKFLOWSTATES.AWAITITEMCARD)
		workflow.next(WORKFLOWSTATES.AWAITITEMCARD);
	return result;
}
// export async function doAttackRoll(wrapped, options = { event: { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false }, versatile: false, resetAdvantage: false, chatMessage: undefined, createWorkflow: true, fastForward: false, advantage: false, disadvantage: false, dialogOptions: {}, isDummy: false }) {
// workflow.advantage/disadvantage/fastforwrd set by settings and conditions
// workflow.rollOptions advantage/disadvantage/fastforward set by keyboard moeration
// workflow.workflowOptions set by options passed to do item.use/item.attackRoll
export async function doAttackRoll(wrapped, options = { versatile: false, resetAdvantage: false, chatMessage: undefined, createWorkflow: true, fastForward: false, advantage: false, disadvantage: false, dialogOptions: {}, isDummy: false }) {
	let workflow = options.isDummy ? undefined : Workflow.getWorkflow(this.uuid);
	// if rerolling the attack re-record the rollToggle key.
	if (workflow?.attackRoll) {
		workflow.advantage = false;
		workflow.disadvantage = false;
		workflow.rollOptions.rollToggle = globalThis.MidiKeyManager.pressedKeys.rollToggle;
	}
	if (workflow && !workflow.reactionQueried) {
		workflow.rollOptions = mergeObject(workflow.rollOptions, mapSpeedKeys(globalThis.MidiKeyManager.pressedKeys, "attack", workflow.rollOptions?.rollToggle), { overwrite: true, insertValues: true, insertKeys: true });
	}
	//@ts-ignore
	if (CONFIG.debug.keybindings && workflow) {
		log("itemhandling doAttackRoll: workflow.rolloptions", workflow.rollOption);
		log("item handling newOptions", mapSpeedKeys(globalThis.MidiKeyManager.pressedKeys, "attack", workflow.rollOptions?.rollToggle));
	}
	const attackRollStart = Date.now();
	if (debugEnabled > 1)
		debug("Entering item attack roll ", event, workflow, Workflow._workflows);
	if (!workflow || !enableWorkflow) { // TODO what to do with a random attack roll
		if (enableWorkflow && debugEnabled > 0)
			warn("Roll Attack: No workflow for item ", this.name, this.id, event);
		const roll = await wrapped(options);
		return roll;
	}
	workflow.systemCard = options.systemCard;
	if (["Workflow"].includes(workflow.workflowType)) {
		if (this.system.target?.type === self) {
			workflow.targets = getSelfTargetSet(this.actor);
		}
		else if (game.user?.targets?.size ?? 0 > 0)
			workflow.targets = validTargetTokens(game.user?.targets);
		if (workflow?.attackRoll && workflow.currentState === WORKFLOWSTATES.ROLLFINISHED) {
			// we are re-rolling the attack.
			workflow.damageRoll = undefined;
			await Workflow.removeAttackDamageButtons(this.id);
			if (workflow.damageRollCount > 0) { // re-rolling damage counts as new damage
				const itemCard = await this.displayCard(mergeObject(options, { systemCard: false, workflowId: workflow.id, minimalCard: false, createMessage: true }));
				workflow.itemCardId = itemCard.id;
			}
		}
	}
	if (options.resetAdvantage) {
		workflow.advantage = false;
		workflow.disadvantage = false;
		workflow.rollOptions = deepClone(defaultRollOptions);
	}
	if (workflow.workflowType === "TrapWorkflow")
		workflow.rollOptions.fastForward = true;
	const promises = [];
	for (let targetToken of workflow.targets) {
		promises.push(new Promise(async (resolve) => {
			//@ts-expect-error targetToken Type
			const result = await doReactions(targetToken, workflow.tokenUuid, null, "reactionpreattack", { item: this.item, workflow, workflowOptions: mergeObject(workflow.workflowOptions, { sourceActorUuid: this.actor.uuid, sourceItemUuid: this.item?.uuid }, { inplace: false, overwrite: true }) });
			if (result?.name) {
				targetToken.actor?.prepareData(); // allow for any items applied to the actor - like shield spell
			}
			resolve(result);
		}));
	}
	await Promise.allSettled(promises);
	// Compute advantage
	await workflow.checkAttackAdvantage();
	if (await asyncHooksCall("midi-qol.preAttackRoll", workflow) === false || await asyncHooksCall(`midi-qol.preAttackRoll.${this.uuid}`, workflow) === false) {
		console.warn("midi-qol | attack roll blocked by preAttackRoll hook");
		return;
	}
	// Active defence resolves by triggering saving throws and returns early
	if (game.user?.isGM && workflow.useActiveDefence) {
		let result = await wrapped(mergeObject(options, {
			advantage: false,
			disadvantage: workflow.rollOptions.disadvantage,
			chatMessage: false,
			fastForward: true,
			messageData: {
				speaker: getSpeaker(this.actor)
			}
		}, { overwrite: true, insertKeys: true, insertValues: true }));
		return workflow.activeDefence(this, result);
	}
	// Advantage is true if any of the sources of advantage are true;
	let advantage = options.advantage || workflow.options.advantage || workflow?.advantage || workflow?.rollOptions.advantage || workflow?.workflowOptions.advantage || workflow.flankingAdvantage;
	// Attribute advantaage
	if (workflow.rollOptions.advantage) {
		workflow.attackAdvAttribution.add(`ADV:keyPress`);
		workflow.advReminderAttackAdvAttribution.add(`ADV:keyPress`);
	}
	if (workflow.flankingAdvantage) {
		workflow.attackAdvAttribution.add(`ADV:flanking`);
		workflow.advReminderAttackAdvAttribution.add(`ADV:Flanking`);
	}
	let disadvantage = options.disadvantage || workflow.options.disadvantage || workflow?.disadvantage || workflow?.workflowOptions.disadvantage || workflow.rollOptions.disadvantage;
	if (workflow.rollOptions.disadvantage) {
		workflow.attackAdvAttribution.add(`DIS:keyPress`);
		workflow.advReminderAttackAdvAttribution.add(`DIS:keyPress`);
	}
	if (workflow.workflowOptions.disadvantage)
		workflow.attackAdvAttribution.add(`DIS:workflowOptions`);
	if (advantage && disadvantage) {
		advantage = false;
		disadvantage = false;
	}
	const wrappedRollStart = Date.now();
	workflow.attackRollCount += 1;
	if (workflow.attackRollCount > 1)
		workflow.damageRollCount = 0;
	// create an options object to pass to the roll.
	// advantage/disadvantage are already set (in options)
	const wrappedOptions = mergeObject(options, {
		chatMessage: (["TrapWorkflow", "Workflow"].includes(workflow.workflowType)) ? false : options.chatMessage,
		fastForward: workflow.workflowOptions.fastForwardAttack ?? workflow.rollOptions.fastForwardAttack ?? options.fastForward,
		messageData: {
			speaker: getSpeaker(this.actor)
		}
	}, { insertKeys: true, overwrite: true });
	if (workflow.rollOptions.rollToggle)
		wrappedOptions.fastForward = !wrappedOptions.fastForward;
	if (advantage)
		wrappedOptions.advantage = true; // advantage passed to the roll takes precedence
	if (disadvantage)
		wrappedOptions.disadvantage = true; // disadvantage passed to the roll takes precedence
	// Setup labels for advantage reminder
	const advantageLabels = Array.from(workflow.advReminderAttackAdvAttribution).filter(s => s.startsWith("ADV:")).map(s => s.replace("ADV:", ""));
	;
	if (advantageLabels.length > 0)
		setProperty(wrappedOptions, "dialogOptions.adv-reminder.advantageLabels", advantageLabels);
	const disadvantageLabels = Array.from(workflow.advReminderAttackAdvAttribution).filter(s => s.startsWith("DIS:")).map(s => s.replace("DIS:", ""));
	if (disadvantageLabels.length > 0)
		setProperty(wrappedOptions, "dialogOptions.adv-reminder.disadvantageLabels", disadvantageLabels);
	// It seems that sometimes the option is true/false but when passed to the roll the critical threshold needs to be a number
	if (wrappedOptions.critical === true || wrappedOptions.critical === false)
		wrappedOptions.critical = this.criticalThreshold;
	if (wrappedOptions.fumble === true || wrappedOptions.fumble === false)
		delete wrappedOptions.fumble;
	wrappedOptions.chatMessage = false;
	let result = await wrapped(wrappedOptions);
	if (!result)
		return result;
	result = Roll.fromJSON(JSON.stringify(result.toJSON()));
	const maxflags = getProperty(workflow.actor.flags, "midi-qol.max") ?? {};
	if ((maxflags.attack && (maxflags.attack.all || maxflags.attack[this.system.actionType])) ?? false)
		result = await result.reroll({ maximize: true });
	const minflags = getProperty(this.flags, "midi-qol.min") ?? {};
	if ((minflags.attack && (minflags.attack.all || minflags.attack[this.system.actionType])) ?? false)
		result = await result.reroll({ minimize: true });
	await workflow.setAttackRoll(result);
	workflow.ammo = this._ammo;
	if (workflow.workflowOptions.attackRollDSN !== false)
		await displayDSNForRoll(result, "attackRollD20");
	result = await processAttackRollBonusFlags.bind(workflow)();
	if (configSettings.keepRollStats) {
		const terms = result.terms;
		const rawRoll = Number(terms[0].total);
		const total = result.total;
		const options = terms[0].options;
		const fumble = rawRoll <= options.fumble;
		const critical = rawRoll >= options.critical;
		gameStats.addAttackRoll({ rawRoll, total, fumble, critical }, this);
	}
	if (workflow.targets?.size === 0) { // no targets recorded when we started the roll grab them now
		workflow.targets = validTargetTokens(game.user?.targets);
	}
	if (!result) { // attack roll failed.
		error("itemhandling.rollAttack failed");
		return;
	}
	if (["formulaadv", "adv"].includes(configSettings.rollAlternate))
		workflow.attackRollHTML = addAdvAttribution(workflow.attackRollHTML, workflow.attackAdvAttribution);
	if (debugCallTiming)
		log(`final item.rollAttack():  elapsed ${Date.now() - attackRollStart}ms`);
	await workflow.next(WORKFLOWSTATES.ATTACKROLLCOMPLETE);
	return result;
}
export async function doDamageRoll(wrapped, { event = {}, systemCard = false, spellLevel = null, powerLevel = null, versatile = null, options = {} } = {}) {
	const pressedKeys = globalThis.MidiKeyManager.pressedKeys; // record the key state if needed
	let workflow = Workflow.getWorkflow(this.uuid);
	if (workflow && systemCard)
		workflow.systemCard = true;
	if (workflow && !workflow.shouldRollDamage) // if we did not auto roll then process any keys
		workflow.rollOptions = mergeObject(workflow.rollOptions, mapSpeedKeys(pressedKeys, "damage", workflow.rollOptions?.rollToggle), { insertKeys: true, insertValues: true, overwrite: true });
	//@ts-expect-error
	if (CONFIG.debug.keybindings) {
		log("itemhandling: workflow.rolloptions", workflow.rollOption);
		log("item handling newOptions", mapSpeedKeys(globalThis.MidiKeyManager.pressedKeys, "attack", workflow.rollOptions?.rollToggle));
	}
	if (workflow?.workflowType === "TrapWorkflow")
		workflow.rollOptions.fastForward = true;
	const damageRollStart = Date.now();
	if (!enableWorkflow || !workflow) {
		if (!workflow && debugEnabled > 0)
			warn("Roll Damage: No workflow for item ", this.name);
		return await wrapped({ event, versatile, spellLevel, powerLevel, options });
	}
	const midiFlags = workflow.actor.flags["midi-qol"];
	if (workflow.currentState !== WORKFLOWSTATES.WAITFORDAMAGEROLL && workflow.noAutoAttack) {
		// allow damage roll to go ahead if it's an ordinary roll
		workflow.currentState = WORKFLOWSTATES.WAITFORDAMAGEROLL;
	}
	if (workflow.currentState !== WORKFLOWSTATES.WAITFORDAMAGEROLL) {
		switch (workflow?.currentState) {
			case WORKFLOWSTATES.AWAITTEMPLATE:
				return ui.notifications?.warn(i18n("midi-qol.noTemplateSeen"));
			case WORKFLOWSTATES.WAITFORATTACKROLL:
				return ui.notifications?.warn(i18n("midi-qol.noAttackRoll"));
		}
	}
	if (workflow.damageRollCount > 0) { // we are re-rolling the damage. redisplay the item card but remove the damage
		let chatMessage = game.messages?.get(workflow.itemCardId ?? "");
		//@ts-ignore content v10
		let content = (chatMessage && chatMessage.content) ?? "";
		let data;
		if (content) {
			data = chatMessage?.toObject(); // TODO check this v10
			content = data.content || "";
			let searchRe = /<div class="midi-qol-damage-roll">[\s\S\n\r]*<div class="end-midi-qol-damage-roll">/;
			let replaceString = `<div class="midi-qol-damage-roll"><div class="end-midi-qol-damage-roll">`;
			content = content.replace(searchRe, replaceString);
			searchRe = /<div class="midi-qol-other-roll">[\s\S\n\r]*<div class="end-midi-qol-other-roll">/;
			replaceString = `<div class="midi-qol-other-roll"><div class="end-midi-qol-other-roll">`;
			content = content.replace(searchRe, replaceString);
			searchRe = /<div class="midi-qol-bonus-roll">[\s\S\n\r]*<div class="end-midi-qol-bonus-roll">/;
			replaceString = `<div class="midi-qol-bonus-roll"><div class="end-midi-qol-bonus-roll">`;
			content = content.replace(searchRe, replaceString);
		}
		if (data) {
			await Workflow.removeAttackDamageButtons(this.uuid);
			delete data._id;
			workflow.itemCardId = (await ChatMessage.create(data))?.id;
		}
	}
	;
	workflow.processDamageEventOptions();
	// Allow overrides form the caller
	if (spellLevel)
		workflow.rollOptions.spellLevel = spellLevel;
	if (powerLevel)
		workflow.rollOptions.spellLevel = powerLevel;
	if (workflow.isVersatile || versatile)
		workflow.rollOptions.versatile = true;
	if (debugEnabled > 0)
		warn("rolling damage  ", this.name, this);
	if (await asyncHooksCall("midi-qol.preDamageRoll", workflow) === false || await asyncHooksCall(`midi-qol.preDamageRoll.${this.uuid}`, workflow) === false) {
		console.warn("midi-qol | Damage roll blocked via pre-hook");
		return;
	}
	const wrappedRollStart = Date.now();
	workflow.damageRollCount += 1;
	let result;
	let result2;
	if (!workflow.rollOptions.other) {
		const damageRollOptions = mergeObject(options, {
			fastForward: workflow.workflowOptions.fastForwardDamage ?? workflow.rollOptions.fastForwardDamage,
			chatMessage: false
		}, { overwrite: true, insertKeys: true, insertValues: true });
		const damageRollData = {
			critical: workflow.workflowOptions?.critical || (workflow.rollOptions.critical || workflow.isCritical),
			spellLevel: workflow.rollOptions.spellLevel,
			powerLevel: workflow.rollOptions.spellLevel,
			versatile: workflow.rollOptions.versatile,
			event: {},
			options: damageRollOptions
		};
		result = await wrapped(damageRollData);
		if (getProperty(this.parent, "flags.midi-qol.damage.advantage"))
			result2 = await wrapped(damageRollData);
		if (debugCallTiming)
			log(`wrapped item.rollDamage():  elapsed ${Date.now() - wrappedRollStart}ms`);
	}
	else { // roll other damage instead of main damage.
		//@ts-ignore
		result = new CONFIG.Dice.DamageRoll(workflow.otherDamageFormula, workflow.otherDamageItem?.getRollData(), { critical: workflow.rollOptions.critical || workflow.isCritical });
		result = await result?.evaluate({ async: true });
	}
	if (!result) { // user backed out of damage roll or roll failed
		return;
	}
	const firstTarget = workflow.targets?.values().next().value?.actor;
	const targetMaxFlags = getProperty(firstTarget, "flags.midi-qol.grants.max.damage");
	const maxFlags = getProperty(workflow.actor.flags, "midi-qol.max") ?? {};
	let needsMaxDamage = maxFlags.damage && (maxFlags.damage.all || maxFlags.damage[this.system.actionType]);
	needsMaxDamage = needsMaxDamage || (targetMaxFlags && (targetMaxFlags.all || targetMaxFlags[this.system.actionType]));
	const targetMinFlags = getProperty(firstTarget, "flags.midi-qol.grants.min.damage");
	const minFlags = getProperty(workflow.actor.flags, "midi-qol.min") ?? {};
	let needsMinDamage = minFlags && (minFlags.all || minFlags[this.system.actionType]);
	needsMinDamage = needsMinDamage || (targetMinFlags && (targetMinFlags.damage.all || targetMinFlags.damage[this.system.actionType]));
	if (needsMaxDamage && needsMinDamage) {
		needsMaxDamage = false;
		needsMinDamage = false;
	}
	let actionFlavor;
	switch (game.system.id) {
		case "sw5e":
			actionFlavor = game.i18n.localize(this.system.actionType === "heal" ? "SW5E.Healing" : "SW5E.DamageRoll");
			break;
		case "n5e":
			actionFlavor = game.i18n.localize(this.system.actionType === "heal" ? "N5E.Healing" : "N5E.DamageRoll");
			break;
		case "dnd5e":
		default:
			actionFlavor = game.i18n.localize(this.system.actionType === "heal" ? "DND5E.Healing" : "DND5E.DamageRoll");
	}
	const title = `${this.name} - ${actionFlavor}`;
	const speaker = getSpeaker(this.actor);
	let messageData = mergeObject({
		title,
		flavor: this.labels.damageTypes.length ? `${title} (${this.labels.damageTypes})` : title,
		speaker,
	}, { "flags.dnd5e.roll": { type: "damage", itemId: this.id } });
	if (game.system.id === "sw5e")
		setProperty(messageData, "flags.sw5e.roll", { type: "damage", itemId: this.id });
	if (needsMaxDamage)
		result = await new Roll(result.formula).roll({ maximize: true });
	else if (needsMinDamage)
		result = await new Roll(result.formula).roll({ minimize: true });
	else if (getProperty(this.parent, "flags.midi-qol.damage.reroll-kh") || getProperty(this.parent, "flags.midi-qol.damage.reroll-kl")) {
		result2 = await result.reroll({ async: true });
		if (result2?.total && result?.total) {
			if ((getProperty(this.parent, "flags.midi-qol.damage.reroll-kh") && (result2?.total > result?.total)) ||
				(getProperty(this.parent, "flags.midi-qol.damage.reroll-kl") && (result2?.total < result?.total))) {
				[result, result2] = [result2, result];
			}
			// display roll not being used.
			if (workflow.workflowOptions.damageRollDSN !== false)
				await displayDSNForRoll(result2, "damageRoll");
			await result2.toMessage(messageData, { rollMode: game.settings.get("core", "rollMode") });
		}
	}
	if (result?.total) {
		for (let term of result.terms) {
			// I don't like the default display and it does not look good for dice so nice - fiddle the results for maximised rolls
			if (term instanceof Die && term.modifiers.includes(`min${term.faces}`)) {
				for (let result of term.results) {
					result.result = term.faces;
				}
			}
		}
		if (this.system.actionType === "heal" && !Object.keys(getSystemCONFIG().healingTypes).includes(workflow.defaultDamageType ?? ""))
			workflow.defaultDamageType = "healing";
		workflow.damageDetail = createDamageList({ roll: result, item: this, ammo: workflow.ammo, versatile: workflow.rollOptions.versatile, defaultType: workflow.defaultDamageType });
		await workflow.setDamageRoll(result);
		if (workflow.workflowOptions.damageRollDSN !== false)
			await displayDSNForRoll(result, "damageRoll");
		result = await processDamageRollBonusFlags.bind(workflow)();
		await workflow.setDamageRoll(result);
		let card;
		if (!configSettings.mergeCard)
			card = await result.toMessage(messageData, { rollMode: game.settings.get("core", "rollMode") });
		if (workflow && configSettings.undoWorkflow) {
			// Assumes workflow.undoData.chatCardUuids has been initialised
			if (workflow.undoData && card) {
				workflow.undoData.chatCardUuids = workflow.undoData.chatCardUuids.concat([card.uuid]);
				socketlibSocket.executeAsGM("updateUndoChatCardUuids", workflow.undoData);
			}
		}
	}
	// await workflow.setDamageRoll(result);
	let otherResult = undefined;
	let otherResult2 = undefined;
	workflow.shouldRollOtherDamage = shouldRollOtherDamage.bind(this)(workflow, configSettings.rollOtherDamage, configSettings.rollOtherSpellDamage);
	if (workflow.shouldRollOtherDamage) {
		const otherRollOptions = {};
		if (game.settings.get("midi-qol", "CriticalDamage") === "default") {
			otherRollOptions.powerfulCritical = game.settings.get(game.system.id, "criticalDamageMaxDice");
			otherRollOptions.multiplyNumeric = game.settings.get(game.system.id, "criticalDamageModifiers");
		}
		otherRollOptions.critical = (this.flags.midiProperties?.critOther ?? false) && (workflow.isCritical || workflow.rollOptions.critical);
		if ((workflow.otherDamageFormula ?? "") !== "") { // other damage formula swaps in versatile if needed
			//@ts-ignore
			let otherRollResult = new CONFIG.Dice.DamageRoll(workflow.otherDamageFormula, workflow.otherDamageItem?.getRollData(), otherRollOptions);
			otherResult = await otherRollResult?.evaluate({ async: true, maximize: needsMaxDamage, minimize: needsMinDamage });
			if (otherResult?.total) {
				switch (game.system.id) {
					case "sw5e":
						actionFlavor = game.i18n.localize(this.system.actionType === "heal" ? "SW5E.Healing" : "SW5E.OtherFormula");
						break;
					case "n5e":
						actionFlavor = game.i18n.localize(this.system.actionType === "heal" ? "N5E.Healing" : "N5E.OtherFormula");
						break;
					case "dnd5e":
					default:
						actionFlavor = game.i18n.localize(this.system.actionType === "heal" ? "DND5E.Healing" : "DND5E.OtherFormula");
				}
				const title = `${this.name} - ${actionFlavor}`;
				messageData = mergeObject({
					title,
					flavor: title,
					speaker,
				}, { "flags.dnd5e.roll": { type: "damage", itemId: this.id } });
				if (game.system.id === "sw5e")
					setProperty(messageData, "flags.sw5e.roll", { type: "other", itemId: this.id });
				if ((getProperty(this.parent, "flags.midi-qol.damage.reroll-kh")) ||
					(getProperty(this.parent, "flags.midi-qol.damage.reroll-kl"))) {
					otherResult2 = await otherResult.reroll({ async: true });
					if (otherResult2?.total && otherResult?.total) {
						if ((getProperty(this.parent, "flags.midi-qol.damage.reroll-kh") && (otherResult2?.total > otherResult?.total)) ||
							(getProperty(this.parent, "flags.midi-qol.damage.reroll-kl") && (otherResult2?.total < otherResult?.total))) {
							[otherResult, otherResult2] = [otherResult2, otherResult];
						}
						// display roll not being used
						if (workflow.workflowOptions.damageRollDSN !== false)
							await displayDSNForRoll(otherResult2, "damageRoll");
						await otherResult2.toMessage(messageData, { rollMode: game.settings.get("core", "rollMode") });
					}
				}
				for (let term of otherResult.terms) {
					// I don't like the default display and it does not look good for dice so nice - fiddle the results for maximised rolls
					if (term instanceof Die && term.modifiers.includes(`min${term.faces}`)) {
						for (let result of term.results) {
							result.result = term.faces;
						}
					}
					if (term.options?.flavor) {
						term.options.flavor = getDamageType(term.options.flavor);
					}
				}
				workflow.otherDamageDetail = createDamageList({ roll: otherResult, item: null, ammo: null, versatile: false, defaultType: "" });
				for (let term of otherResult.terms) { // set the damage flavor
					if (term.options?.flavor) {
						term.options.flavor = getDamageFlavor(term.options.flavor);
					}
				}
				await displayDSNForRoll(otherResult, "damageRoll");
				if (!configSettings.mergeCard)
					await otherResult?.toMessage(messageData, { rollMode: game.settings.get("core", "rollMode") });
				await workflow.setOtherDamageRoll(otherResult);
			}
		}
	}
	workflow.bonusDamageRoll = null;
	workflow.bonusDamageHTML = null;
	if (debugCallTiming)
		log(`item.rollDamage():  elapsed ${Date.now() - damageRollStart}ms`);
	workflow.next(WORKFLOWSTATES.DAMAGEROLLCOMPLETE);
	return result;
}
// WIP
export function preItemUseHook(item, config, options) { return true; }
// WIP
export function useItemHook(item, config, options, templates) {
}
//WIP
export function preRollAttackHook(item, rollConfig) { }
// WIP
export function rollAttackHook(item, roll, ammoUpdate) { }
// in use
export function preRollDamageHook(item, rollConfig) {
	if (item.flags.midiProperties?.offHandWeapon) {
		rollConfig.data.mod = Math.max(0, rollConfig.data.mod);
	}
	return true;
}
// WIP
export function rollDamageHook(item, roll) {
}
// WIP
export function preDisplayCardHook(item, chatData, options) { }
// WIP - probably not use
export function displayCardHook(item, card) { }
;
// in use
export function preItemUsageConsumptionHook(item, config, options) {
	/* Spell level can be fetched in preItemUsageConsumption */
	const workflow = Workflow.getWorkflow(item.uuid);
	if (!workflow) {
		if (!game.settings.get("midi-qol", "EnableWorkflow"))
			console.error("Failed to find workflow in preItemUsageConsumption");
		return true;
	}
	// need to get spell level from the html returned in result
	if (item.type === "spell") {
		workflow.itemLevel = item.system.level;
		workflow.castData.castLevel = item.system.level;
	}
	if (item.type === "power") {
		workflow.itemLevel = item.system.level;
		workflow.castData.castLevel = item.system.level;
	}
	return true;
}
// WIP
export function itemUsageConsumptionHook(item, config, options, usage) {
	// if mergecard set options.createMessage = false;
	return true;
}
// If we are blocking the roll let anyone waiting on the roll know it is complete
function blockRoll(item, workflow) {
	if (item) {
		if (workflow)
			workflow.aborted = true;
		let hookName = `midi-qol.RollComplete.${item?.uuid}`;
		Hooks.callAll(hookName, workflow);
	}
	return false;
}
// Override default display card method. Can't use a hook since a template is rendefed async
export async function wrappedDisplayCard(wrapped, options) {
	let { systemCard, workflowId, minimalCard, createMessage, workflow } = options ?? {};
	// let workflow = options.workflow; // Only DamageOnlyWorkflow passes this in
	if (workflowId)
		workflow = Workflow.getWorkflow(this.uuid);
	if (workflow)
		workflow.itemLevel = this.system.level;
	if (systemCard === undefined)
		systemCard = false;
	if (!workflow)
		return wrapped(options);
	if (debugEnabled > 0)
		warn("show item card ", this, this.actor, this.actor.token, systemCard, workflow);
	const systemString = game.system.id.toUpperCase();
	let token = tokenForActor(this.actor);
	let needAttackButton = !getRemoveAttackButtons() ||
		(!workflow.someAutoRollEventKeySet() && !getAutoRollAttack(workflow) && !workflow.rollOptions.autoRollAttack);
	const needDamagebutton = itemHasDamage(this) && ((["none", "saveOnly"].includes(getAutoRollDamage(workflow)) || workflow.rollOptions?.rollToggle)
		|| !getRemoveDamageButtons()
		|| systemCard);
	const needVersatileButton = itemIsVersatile(this) && (systemCard || ["none", "saveOnly"].includes(getAutoRollDamage(workflow)) || !getRemoveDamageButtons());
	// not used const sceneId = token?.scene && token.scene.id || canvas?.scene?.id;
	const isPlayerOwned = this.actor.hasPlayerOwner;
	const hideItemDetails = (["none", "cardOnly"].includes(configSettings.showItemDetails) || (configSettings.showItemDetails === "pc" && !isPlayerOwned))
		|| !configSettings.itemTypeList.includes(this.type);
	const hasEffects = !["applyNoButton"].includes(configSettings.autoItemEffects) && hasDAE(workflow) && workflow.workflowType === "Workflow" && this.effects.find(ae => !ae.transfer);
	let dmgBtnText = (this.system?.actionType === "heal") ? i18n(`${systemString}.Healing`) : i18n(`${systemString}.Damage`);
	if (workflow.rollOptions.fastForwardDamage && configSettings.showFastForward)
		dmgBtnText += ` ${i18n("midi-qol.fastForward")}`;
	let versaBtnText = i18n(`${systemString}.Versatile`);
	if (workflow.rollOptions.fastForwardDamage && configSettings.showFastForward)
		versaBtnText += ` ${i18n("midi-qol.fastForward")}`;
	const templateData = {
		actor: this.actor,
		// tokenId: token?.id,
		tokenId: token?.document?.uuid ?? token?.uuid ?? null,
		tokenUuid: token?.document?.uuid ?? token?.uuid ?? null,
		item: this,
		itemUuid: this.uuid,
		data: await this.getChatData(),
		labels: this.labels,
		condensed: this.hasAttack && configSettings.mergeCardCondensed,
		hasAttack: !minimalCard && this.hasAttack && (systemCard || needAttackButton),
		isHealing: !minimalCard && this.isHealing && (systemCard || configSettings.autoRollDamage !== "always"),
		hasDamage: needDamagebutton,
		isVersatile: needVersatileButton,
		isSpell: this.type === "spell",
		isPower: this.type === "power",
		hasSave: !minimalCard && this.hasSave && (systemCard || configSettings.autoCheckSaves === "none"),
		hasAreaTarget: !minimalCard && this.hasAreaTarget,
		hasAttackRoll: !minimalCard && this.hasAttack,
		configSettings,
		hideItemDetails,
		dmgBtnText,
		versaBtnText,
		showProperties: workflow.workflowType === "Workflow",
		hasEffects,
		isMerge: configSettings.mergeCard,
		RequiredMaterials: i18n(`${systemString}.RequiredMaterials`),
		Attack: i18n(`${systemString}.Attack`),
		SavingThrow: i18n(`${systemString}.SavingThrow`),
		OtherFormula: i18n(`${systemString}.OtherFormula`),
		PlaceTemplate: i18n(`${systemString}.PlaceTemplate`),
		Use: i18n(`${systemString}.Use`)
	};
	const templateType = ["tool"].includes(this.type) ? this.type : "item";
	const template = `modules/midi-qol/templates/${templateType}-card.html`;
	const html = await renderTemplate(template, templateData);
	if (debugEnabled > 1)
		debug(" Show Item Card ", configSettings.useTokenNames, (configSettings.useTokenNames && token) ? token?.name : this.actor.name, token, token?.name, this.actor.name);
	let theSound = configSettings.itemUseSound;
	if (this.type === "weapon") {
		theSound = configSettings.weaponUseSound;
		if (["rwak"].includes(this.system.actionType))
			theSound = configSettings.weaponUseSoundRanged;
	}
	else if (["spell", "power"].includes(this.type)) {
		theSound = configSettings.spellUseSound;
		if (["rsak", "rpak"].includes(this.system.actionType))
			theSound = configSettings.spellUseSoundRanged;
	}
	else if (this.type === "consumable" && this.name.toLowerCase().includes(i18n("midi-qol.potion").toLowerCase()))
		theSound = configSettings.potionUseSound;
	const chatData = {
		user: game.user?.id,
		type: CONST.CHAT_MESSAGE_TYPES.OTHER,
		content: html,
		flavor: this.system.chatFlavor || this.name,
		//@ts-expect-error token vs tokenDocument
		speaker: ChatMessage.getSpeaker({ actor: this.actor, token: (token?.document ?? token) }),
		flags: {
			"midi-qol": {
				itemUuid: workflow.item.uuid,
				actorUuid: workflow.actor.uuid,
				sound: theSound,
				type: MESSAGETYPES.ITEM,
				itemId: workflow.itemId,
				workflowId: workflow.item.uuid
			},
			"core": { "canPopout": true }
		}
	};
	if (workflow.flagTags)
		chatData.flags = mergeObject(chatData.flags ?? "", workflow.flagTags);
	// Temp items (id undefined) or consumables that were removed need itemData set.
	if (!this.id || (this.type === "consumable" && !this.actor.items.has(this.id))) {
		chatData.flags[`${game.system.id}.itemData`] = this.toObject(); // TODO check this v10
	}
	chatData.flags = mergeObject(chatData.flags, options.flags);
	Hooks.callAll("dnd5e.preDisplayCard", this, chatData, options);
	workflow.babonus = getProperty(chatData, "flags.babonus") ?? {};
	ChatMessage.applyRollMode(chatData, options.rollMode ?? game.settings.get("core", "rollMode"));
	const card = createMessage !== false ? ChatMessage.create(chatData) : chatData;
	Hooks.callAll("dnd5e.displayCard", this, card);
	return card;
}
async function resolveLateTargeting(item, options, pressedKeys) {
	const workflow = Workflow.getWorkflow(item?.uuid);
	const lateTargetingSetting = getLateTargeting(workflow);
	if (lateTargetingSetting === "none")
		return true; // workflow options override the user settings
	if (workflow)
		workflow.targets = new Set();
	if (workflow && lateTargetingSetting === "noTargetsSelected" && workflow.targets.size !== 0)
		return true;
	const savedSettings = { control: ui.controls?.control?.name, tool: ui.controls?.tool };
	const savedActiveLayer = canvas?.activeLayer;
	await canvas?.tokens?.activate();
	ui.controls?.initialize({ tool: "target", control: "token" });
	const wasMaximized = !(item.actor.sheet?._minimized);
	// Hide the sheet that originated the preview
	if (wasMaximized)
		await item.actor.sheet.minimize();
	let targets = new Promise((resolve, reject) => {
		// no timeout since there is a dialog to close
		// create target dialog which updates the target display
		let lateTargeting = new LateTargetingDialog(item.actor, item, game.user, { callback: resolve, workflowOptions: options, pressedKeys }).render(true);
	});
	let shouldContinue = await targets;
	if (savedActiveLayer)
		await savedActiveLayer.activate();
	if (savedSettings.control && savedSettings.tool)
		//@ts-ignore savedSettings.tool is really a string
		ui.controls?.initialize(savedSettings);
	if (wasMaximized)
		await item.actor.sheet.maximize();
	return shouldContinue ? true : false;
}
export async function showItemInfo() {
	const token = this.actor.token;
	const sceneId = token?.scene && token.scene.id || canvas?.scene?.id;
	const templateData = {
		actor: this.actor,
		// tokenId: token?.id,
		tokenId: token?.document?.uuid ?? token?.uuid,
		tokenUuid: token?.document?.uuid ?? token?.uuid,
		item: this,
		itemUuid: this.uuid,
		data: await this.getChatData(),
		labels: this.labels,
		condensed: false,
		hasAttack: false,
		isHealing: false,
		hasDamage: false,
		isVersatile: false,
		isSpell: this.type === "spell",
		isPower: this.type === "power",
		hasSave: false,
		hasAreaTarget: false,
		hasAttackRoll: false,
		configSettings,
		hideItemDetails: false,
		hasEffects: false,
		isMerge: false,
	};
	const templateType = ["tool"].includes(this.type) ? this.type : "item";
	const template = `modules/midi-qol/templates/${templateType}-card.html`;
	const html = await renderTemplate(template, templateData);
	const chatData = {
		user: game.user?.id,
		type: CONST.CHAT_MESSAGE_TYPES.OTHER,
		content: html,
		flavor: this.system.chatFlavor || this.name,
		speaker: getSpeaker(this.actor),
		flags: {
			"core": { "canPopout": true }
		}
	};
	// Toggle default roll mode
	let rollMode = game.settings.get("core", "rollMode");
	if (["gmroll", "blindroll"].includes(rollMode))
		chatData["whisper"] = ChatMessage.getWhisperRecipients("GM").filter(u => u.active);
	if (rollMode === "blindroll")
		chatData["blind"] = true;
	if (rollMode === "selfroll")
		chatData["whisper"] = [game.user?.id];
	// Create the chat message
	return ChatMessage.create(chatData);
}
function isTokenInside(templateDetails, token, wallsBlockTargeting) {
	//@ts-ignore grid v10
	const grid = canvas?.scene?.grid;
	if (!grid)
		return false;
	const templatePos = { x: templateDetails.x, y: templateDetails.y };
	if (!isTargetable(token))
		return false;
	// Check for center of  each square the token uses.
	// e.g. for large tokens all 4 squares
	//@ts-ignore document.width
	const startX = token.document.width >= 1 ? 0.5 : (token.document.width / 2);
	//@ts-ignore document.height
	const startY = token.document.height >= 1 ? 0.5 : (token.document.height / 2);
	//@ts-ignore document.width
	for (let x = startX; x < token.document.width; x++) {
		//@ts-ignore document.height
		for (let y = startY; y < token.document.height; y++) {
			const currGrid = {
				x: token.x + x * grid.size - templatePos.x,
				y: token.y + y * grid.size - templatePos.y,
			};
			let contains = templateDetails.shape?.contains(currGrid.x, currGrid.y);
			if (contains && wallsBlockTargeting) {
				let tx = templatePos.x;
				let ty = templatePos.y;
				if (templateDetails.shape.type === 1) { // A rectangle
					tx = tx + templateDetails.shape.width / 2;
					ty = ty + templateDetails.shape.height / 2;
				}
				const r = new Ray({ x: tx, y: ty }, { x: currGrid.x + templatePos.x, y: currGrid.y + templatePos.y });
				// If volumetric templates installed always leave targeting to it.
				if (configSettings.optionalRules.wallsBlockRange === "centerLevels"
					&& installedModules.get("levels")
					&& !installedModules.get("levelsvolumetrictemplates")) {
					let p1 = {
						x: currGrid.x + templatePos.x, y: currGrid.y + templatePos.y,
						//@ts-ignore
						z: token.elevation
					};
					// installedModules.get("levels").lastTokenForTemplate.elevation no longer defined
					//@ts-ignore .elevation CONFIG.Levels.UI v10
					const p2z = _token?.document?.elevation ?? CONFIG.Levels.UI.nextTemplateHeight ?? 0;
					let p2 = {
						x: tx, y: ty,
						//@ts-ignore
						z: p2z
					};
					contains = getUnitDist(p2.x, p2.y, p2.z, token) <= templateDetails.distance;
					//@ts-ignore
					contains = contains && !CONFIG.Levels.API.testCollision(p1, p2, "collision");
					//@ts-ignore
				}
				else if (!installedModules.get("levelsvolumetrictemplates")) {
					//@ts-expect-error
					if (isNewerVersion(game.version, "11.0")) {
						//@ts-expect-error polygonBackends
						contains = !CONFIG.Canvas.polygonBackends.sight.testCollision({ x: tx, y: ty }, { x: currGrid.x + templatePos.x, y: currGrid.y + templatePos.y }, { mode: "any", type: "move" });
					}
					else {
						//@ts-expect-error
						contains = !CONFIG.Canvas.losBackend.testCollision({ x: tx, y: ty }, { x: currGrid.x + templatePos.x, y: currGrid.y + templatePos.y }, { mode: "any", type: "move" });
					}
				}
			}
			// Check the distance from origin.
			if (contains)
				return true;
		}
	}
	return false;
}
export function templateTokens(templateDetails) {
	if (configSettings.autoTarget === "none")
		return [];
	const wallsBlockTargeting = ["wallsBlock", "wallsBlockIgnoreDefeated"].includes(configSettings.autoTarget);
	const tokens = canvas?.tokens?.placeables ?? []; //.map(t=>t)
	let targets = [];
	const targetTokens = [];
	for (const token of tokens) {
		if (!isTargetable(token))
			continue;
		if (token.actor && isTokenInside(templateDetails, token, wallsBlockTargeting)) {
			// const actorData: any = token.actor?.data;
			//@ts-expect-error .system v10
			if (token.actor.system.details.type?.custom.toLocaleLowerCase().includes("notarget")
				//@ts-expect-error system
				|| token.actor.system.details.race?.toLocaleLowerCase().includes("notarget"))
				continue;
			//@ts-ignore .system
			if (["wallsBlock", "always"].includes(configSettings.autoTarget) || !checkIncapacitated(token.actor)) {
				if (token.id) {
					targetTokens.push(token);
					targets.push(token.id);
				}
			}
		}
	}
	game.user?.updateTokenTargets(targets);
	game.user?.broadcastActivity({ targets });
	return targetTokens;
}
export function selectTargets(templateDocument, data, user) {
	//@ts-expect-error
	const hasWorkflow = this.currentState ?? Workflow.getWorkflow(templateDocument.flags?.dnd5e?.origin);
	if (hasWorkflow === undefined)
		return true;
	if ((game.user?.targets.size === 0 || user !== game.user?.id)
		&& templateDocument?.object && !installedModules.get("levelsvolumetrictemplates")) {
		//@ts-ignore
		const mTemplate = templateDocument.object;
		if (mTemplate.shape)
			//@ts-ignore templateDocument.x, mtemplate.distance TODO check this v10
			templateTokens({ x: templateDocument.x, y: templateDocument.y, shape: mTemplate.shape, distance: mTemplate.distance });
		else {
			let { shape, distance } = computeTemplateShapeDistance(templateDocument);
			if (debugEnabled > 0)
				warn(`selectTargets computed shape ${shape} distance${distance}`);
			//@ts-ignore .x, .y v10
			templateTokens({ x: templateDocument.x, y: templateDocument.y, shape, distance });
		}
	}
	let item = this?.item;
	let targeting = configSettings.autoTarget;
	this.templateId = templateDocument?.id;
	this.templateUuid = templateDocument?.uuid;
	if (user === game.user?.id)
		templateDocument.setFlag("midi-qol", "originUuid", this.uuid); // set a refernce back to the item that created the template.
	if (targeting === "none") { // this is no good
		Hooks.callAll("midi-qol-targeted", this.targets);
		return true;
	}
	// if the item specifies a range of "special" don't target the caster.
	let selfTarget = (item?.system.range?.units === "spec") ? canvas?.tokens?.get(this.tokenId) : null;
	if (selfTarget && game.user?.targets.has(selfTarget)) {
		// we are targeted and should not be
		selfTarget.setTarget(false, { user: game.user, releaseOthers: false });
	}
	this.saves = new Set();
	const userTargets = game.user?.targets;
	this.targets = new Set(userTargets);
	this.hitTargets = new Set(userTargets);
	this.templateData = templateDocument.toObject(); // TODO check this v10
	this.needTemplate = false;
	if (this instanceof BetterRollsWorkflow) {
		if (this.needItemCard)
			return;
		else
			return this.next(WORKFLOWSTATES.NONE);
	}
	if (this instanceof TrapWorkflow)
		return;
	this.needTemplate = false;
	return this.next(WORKFLOWSTATES.AWAITTEMPLATE);
}
;
export function activationConditionToUse(workflow) {
	let conditionToUse = undefined;
	let conditionFlagToUse = undefined;
	if (this.type === "spell" && configSettings.rollOtherSpellDamage === "activation") {
		return workflow.otherDamageItem?.system.activation?.condition;
	}
	else if (["rwak", "mwak"].includes(this.system.actionType) && configSettings.rollOtherDamage === "activation") {
		return workflow.otherDamageItem?.system.activation?.condition;
	}
	if (workflow.otherDamageItem?.flags?.midiProperties?.rollOther)
		return workflow.otherDamageItem?.system.activation?.condition;
	return undefined;
}
// TODO work out this in new setup
export function shouldRollOtherDamage(workflow, conditionFlagWeapon, conditionFlagSpell) {
	let rollOtherDamage = false;
	let conditionToUse = undefined;
	let conditionFlagToUse = undefined;
	// if (["rwak", "mwak", "rsak", "msak", "rpak", "mpak"].includes(this.system.actionType) && workflow?.hitTargets.size === 0) return false;
	if (this.type === "spell" && conditionFlagSpell !== "none") {
		rollOtherDamage = (conditionFlagSpell === "ifSave" && this.hasSave)
			|| conditionFlagSpell === "activation";
		conditionFlagToUse = conditionFlagSpell;
		conditionToUse = workflow.otherDamageItem?.system.activation?.condition;
	}
	else if (["rwak", "mwak"].includes(this.system.actionType) && conditionFlagWeapon !== "none") {
		rollOtherDamage =
			(conditionFlagWeapon === "ifSave" && workflow.otherDamageItem.hasSave) ||
				((conditionFlagWeapon === "activation") && (this.system.attunement !== getSystemCONFIG().attunementTypes.REQUIRED));
		conditionFlagToUse = conditionFlagWeapon;
		conditionToUse = workflow.otherDamageItem?.system.activation?.condition;
	}
	if (workflow.otherDamageItem?.flags?.midiProperties?.rollOther && this.system.attunement !== getSystemCONFIG().attunementTypes.REQUIRED) {
		rollOtherDamage = true;
		conditionToUse = workflow.otherDamageItem?.system.activation?.condition;
		conditionFlagToUse = "activation";
	}
	//@ts-ignore
	if (rollOtherDamage && conditionFlagToUse === "activation" && workflow?.hitTargets.size > 0) {
		rollOtherDamage = false;
		for (let target of workflow.hitTargets) {
			rollOtherDamage = evalActivationCondition(workflow, conditionToUse, target);
			if (rollOtherDamage)
				break;
		}
	}
	return rollOtherDamage;
}
