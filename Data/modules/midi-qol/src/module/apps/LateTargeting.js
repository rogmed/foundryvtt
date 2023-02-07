import { i18n, i18nFormat } from "../../midi-qol.js";
import { getAutoRollAttack, getTokenPlayerName, isAutoFastAttack } from "../utils.js";
export class LateTargetingDialog extends Application {
	//@ts-ignore .Actor, .Item
	constructor(actor, item, user, options = {}) {
		super(options);
		this.data = { actor, item, user, targets: [] };
		// Handle alt/ctrl etc keypresses when completing the dialog
		this.callback = function (value) {
			setProperty(options, "workflowOptions.advantage", options.worfkflowOptions?.advantage || options.pressedKeys.advantage);
			setProperty(options, "workflowOptions.disadvantage", options.worfkflowOptions?.disadvantage || options.pressedKeys.disadvantage);
			setProperty(options, "workflowOptions.versatile", options.worfkflowOptions?.versatile || options.pressedKeys.versatile);
			setProperty(options, "workflowOptions.fastForward", options.worfkflowOptions?.fastForward || options.pressedKeys.fastForward);
			return options.callback(value);
		};
		// this.callback = options.callback;
		return this;
	}
	static get defaultOptions() {
		//@ts-ignore _collapsed
		let left = window.innerWidth - 310 - (ui.sidebar?._collapsed ? 10 : (ui.sidebar?.position.width ?? 300));
		let top = window.innerHeight - 200;
		return foundry.utils.mergeObject(super.defaultOptions, {
			title: i18n("midi-qol.LateTargeting.Name"),
			classes: ["midi-targeting"],
			template: "modules/midi-qol/templates/lateTargeting.html",
			id: "midi-qol-lateTargeting",
			width: 300,
			left: (getAutoRollAttack() && isAutoFastAttack()) ? undefined : left,
			top: (getAutoRollAttack() && isAutoFastAttack()) ? undefined : top,
			height: "auto",
			resizeable: "true",
			closeOnSubmit: true
		});
	}
	async getData(options = {}) {
		let data = mergeObject(this.data, await super.getData(options));
		data.targets = Array.from(game.user?.targets ?? []);
		data.targets = data.targets.map(t => {
			return {
				name: game.user?.isGM ? t.name : getTokenPlayerName(t),
				img: t.document.texture.src
			};
		});
		if (this.data.item) {
			if (this.data.item.system.target.type === "creature" && this.data.item.system.target.value)
				data.targetCount = this.data.item.system.target.value;
			else
				data.targetCount = "";
			data.blurb = i18nFormat("midi-qol.LateTargeting.Blurb", { targetCount: data.targetCount });
		}
		return data;
	}
	activateListeners(html) {
		super.activateListeners(html);
		if (!this.hookId) {
			this.hookId = Hooks.on("targetToken", (user, token, targeted) => {
				if (user !== game.user)
					return;
				this.data.targets = Array.from(game.user?.targets ?? []);
				this.render();
			});
		}
		html.find(".midi-roll-confirm").on("click", () => {
			if (this.callback)
				this.callback(true);
			this.callback = undefined;
			this.close();
		});
		html.find(".midi-roll-cancel").on("click", () => {
			if (this.callback)
				this.callback(false);
			this.callback = undefined;
			this.close();
		});
	}
	close(options = {}) {
		Hooks.off("targetToken", this.hookId);
		if (this.callback)
			this.callback(false);
		return super.close(options);
	}
}
