import { fetchParams } from "./dae.js";
export const registerSettings = function () {
    game.settings.register("dae", "useDAESheet", {
        scope: "world",
        default: true,
        config: true,
        type: Boolean,
        onChange: fetchParams,
        name: game.i18n.localize("dae.useDAESheet.Name"),
        hint: game.i18n.localize("dae.useDAESheet.Hint"),
    });
    game.settings.register("dae", "noDupDamageMacro", {
        name: "dae.noDupDamageMacro.Name",
        hint: "dae.noDupDamageMacro.Hint",
        scope: "world",
        default: false,
        type: Boolean,
        config: true,
        onChange: fetchParams
    });
    game.settings.register("dae", "expireRealTime", {
        name: "dae.expireRealTime.Name",
        hint: "dae.expireRealTime.Hint",
        scope: "world",
        default: true,
        type: Boolean,
        config: true,
        onChange: fetchParams
    });
    game.settings.register("dae", "showInline", {
        scope: "client",
        name: game.i18n.localize("dae.ShowInline.Name"),
        hint: game.i18n.localize("dae.ShowInline.Hint"),
        default: false,
        config: true,
        type: Boolean,
        onChange: fetchParams
    });
    game.settings.register("dae", "confirmDelete", {
        name: game.i18n.localize("dae.confirmDelete.Name"),
        hint: game.i18n.localize("dae.confirmDelete.Hint"),
        scope: "world",
        default: false,
        type: Boolean,
        config: true,
        onChange: fetchParams
    });
    game.settings.register("dae", "DAETitleBar", {
        name: game.i18n.localize("dae.DAETitleBar.Name"),
        hint: game.i18n.localize("dae.DAETitleBar.Hint"),
        scope: "world",
        default: true,
        type: Boolean,
        config: true,
        onChange: fetchParams
    });
    game.settings.register("dae", "DAENoTitleText", {
        name: game.i18n.localize("dae.DAENoTitleText.Name"),
        hint: game.i18n.localize("dae.DAENoTitleText.Hint"),
        scope: "world",
        default: false,
        type: Boolean,
        config: true,
        onChange: fetchParams
    });
    game.settings.register("dae", "DAEUntestedSystems", {
        name: game.i18n.localize("dae.DAEUntestedSystems.Name"),
        hint: game.i18n.localize("dae.DAEUntestedSystems.Hint"),
        scope: "world",
        default: false,
        type: Boolean,
        config: true,
        onChange: fetchParams
    });
    game.settings.register("dae", "ZZDebug", {
        name: "dae.Debug.Name",
        hint: "dae.Debug.Hint",
        scope: "world",
        default: "none",
        type: String,
        config: true,
        choices: { none: "None", warn: "warnings", debug: "debug", all: "all" },
        onChange: fetchParams
    });
    game.settings.register("dae", "disableEffects", {
        name: "dae.DisableEffects.Name",
        hint: "dae.DisableEffects.Hint",
        scope: "world",
        default: false,
        type: Boolean,
        config: true,
        onChange: () => window.location.reload()
    });
};