class ForceClientSettings {
  static moduleName = "force-client-settings";
  static version = "2.0.0";
  static migration = false;
  static forced = new Map();
  static unlocked = new Map();
  static hideForced = false;

  static isGM(defaultResult = false) {
    if (game.user) {
      return game.user.role >= CONST.USER_ROLES.GAMEMASTER;
    } else {
      try {
        return game.data.users.find((u) => u._id === game.userId).role >= CONST.USER_ROLES.GAMEMASTER;
      } catch {
        return defaultResult;
      }
    }
  }

  static initialize() {
    game.settings.register(ForceClientSettings.moduleName, "forced", {
      name: `${game.i18n.localize("FORCECLIENTSETTINGS.settings.forced.name")}`,
      hint: `${game.i18n.localize("FORCECLIENTSETTINGS.settings.forced.hint")}`,
      scope: "world",
      config: false,
      type: Object,
      default: {},
    });
    game.settings.register(ForceClientSettings.moduleName, "unlocked", {
      name: `${game.i18n.localize("FORCECLIENTSETTINGS.settings.unlocked.name")}`,
      hint: `${game.i18n.localize("FORCECLIENTSETTINGS.settings.unlocked.hint")}`,
      scope: "client",
      config: false,
      type: Object,
      default: {},
    });
    game.settings.registerMenu(ForceClientSettings.moduleName, "forcedConfig", {
      name: `${game.i18n.localize("FORCECLIENTSETTINGS.settings.forced-config.name")}`,
      label: `${game.i18n.localize("FORCECLIENTSETTINGS.settings.forced-config.label")}`,
      restricted: true,
      icon: "fas fa-lock",
      type: ForceClientSettingsConfig,
    });
    game.settings.register(ForceClientSettings.moduleName, "hideForced", {
      name: `${game.i18n.localize("FORCECLIENTSETTINGS.settings.hide-forced.name")}`,
      hint: `${game.i18n.localize("FORCECLIENTSETTINGS.settings.hide-forced.hint")}`,
      scope: "world",
      config: true,
      type: Boolean,
      default: false,
      onChange: (value) => {
        ForceClientSettings.hideForced = value;
      },
    });

    ForceClientSettings.forced = new Map(Object.entries(game.settings.get(ForceClientSettings.moduleName, "forced")));
    ForceClientSettings.unlocked = new Map(
      Object.entries(game.settings.get(ForceClientSettings.moduleName, "unlocked"))
    );
    ForceClientSettings.hideForced = game.settings.get(ForceClientSettings.moduleName, "hideForced");

    libWrapper.register(
      ForceClientSettings.moduleName,
      "SettingsConfig.defaultOptions",
      ForceClientSettings.settingsConfigDefaultOptions,
      "WRAPPER"
    );

    libWrapper.register(
      ForceClientSettings.moduleName,
      "ClientSettings.prototype.register",
      ForceClientSettings.settingsRegister,
      "WRAPPER"
    );
    libWrapper.register(
      ForceClientSettings.moduleName,
      "ClientSettings.prototype.get",
      ForceClientSettings.settingsGet,
      "MIXED"
    );
    libWrapper.register(
      ForceClientSettings.moduleName,
      "ClientSettings.prototype.set",
      ForceClientSettings.settingsSet,
      "WRAPPER"
    );

    for (const [key, value] of game.settings.settings) {
      ((ForceClientSettings.forced.has(key) && console.warn) || console.debug)(
        `Force Client Settings | Came late for registration of ${key}, issues may ensue`
      );
      game.settings.register(value.namespace, value.key, value);
    }

    Hooks.on("renderSettingsConfig", ForceClientSettings.renderSettingsConfig);
    Hooks.on("ready", ForceClientSettings.migrate);
  }

  static settingsConfigDefaultOptions(wrapped, ...args) {
    return foundry.utils.mergeObject(wrapped(...args), { scrollY: [".tab.active .settings-list", ".scrollable"] });
  }

  static settingsRegister(wrapped, namespace, key, data, ...args) {
    if (
      !ForceClientSettings.migration &&
      ForceClientSettings.forced.has(`${namespace}.${key}`) &&
      data?.scope !== "world"
    ) {
      if (
        ForceClientSettings.hideForced &&
        !ForceClientSettings.isGM(true) &&
        ForceClientSettings.forced.get(`${namespace}.${key}`).mode !== "soft"
      ) {
        data = { ...data, config: false };
      }
      const result = wrapped(namespace, key, data, ...args);
      console.log(`Force Client Settings | Forcing ${namespace}.${key}`);
      wrapped(
        ForceClientSettings.moduleName,
        `_${namespace}.${key}`,
        { ...data, scope: "world", config: false, onChange: null },
        ...args
      );
      return result;
    } else {
      return wrapped(namespace, key, data, ...args);
    }
  }

  static settingsGet(wrapped, namespace, key, ...args) {
    if (
      !ForceClientSettings.migration &&
      ForceClientSettings.forced.has(`${namespace}.${key}`) &&
      game.settings.settings.get(`${namespace}.${key}`)?.scope !== "world"
    ) {
      const forced = ForceClientSettings.forced.get(`${namespace}.${key}`);
      if (
        forced.mode !== "soft" ||
        ForceClientSettings.isGM() ||
        !ForceClientSettings.unlocked.has(`${namespace}.${key}`)
      ) {
        return wrapped(ForceClientSettings.moduleName, `_${namespace}.${key}`, ...args);
      }
    }
    return wrapped(namespace, key, ...args);
  }

  static async settingsSet(wrapped, namespace, key, value, ...args) {
    if (
      !ForceClientSettings.migration &&
      ForceClientSettings.forced.has(`${namespace}.${key}`) &&
      game.settings.settings.get(`${namespace}.${key}`)?.scope !== "world"
    ) {
      const forced = ForceClientSettings.forced.get(`${namespace}.${key}`);
      if (ForceClientSettings.isGM()) {
        await wrapped(ForceClientSettings.moduleName, `_${namespace}.${key}`, value, ...args);
        return await wrapped(namespace, key, value, ...args);
      } else {
        if (forced.mode !== "soft" || !ForceClientSettings.unlocked.has(`${namespace}.${key}`)) {
          let forcedValue = game.settings.get(ForceClientSettings.moduleName, `_${namespace}.${key}`);
          return await wrapped(namespace, key, forcedValue, ...args);
        } else {
          return await wrapped(namespace, key, value, ...args);
        }
      }
    } else {
      return await wrapped(namespace, key, value, ...args);
    }
  }

  static async renderSettingsConfig(app, html) {
    while (!app.rendered) {
      await new Promise((resolve) => resolve());
    }
    const isGM = ForceClientSettings.isGM();
    const fa = {
      "hard-gm": "fa-lock",
      "soft-gm": "fa-unlock-keyhole",
      "open-gm": "fa-lock-keyhole-open",
      "hard-client": "fa-lock",
      "soft-client": "fa-unlock-keyhole",
      "unlocked-client": "fa-lock-keyhole-open",
    };

    const elem = html.find(".form-group:not(.submenu)");
    elem.each(function () {
      const key = $(this).find("input,select").first().prop("name");
      if (key && game.settings.settings.has(key) && game.settings.settings.get(key).scope !== "world") {
        const label = $(this).find("label").first();
        let mode = ForceClientSettings.forced.get(key)?.mode ?? "open";
        if (mode === "soft" && !isGM && ForceClientSettings.unlocked.has(key)) mode = "unlocked";
        mode += isGM ? "-gm" : "-client";
        if (mode !== "open-client") {
          label.prepend(
            $("<span>")
              .html("&nbsp;")
              .prop("title", game.i18n.localize(`FORCECLIENTSETTINGS.ui.${mode}-hint`))
              .data("settings-key", key)
              .addClass(`fas ${fa[mode]}`)
              .click(async function (event) {
                await ForceClientSettings.clickToggleForceSettings(event, key, app);
              })
          );
        }
        if (["hard-client", "soft-client"].includes(mode)) {
          $(this).find("input,select").prop("disabled", "true");
        }
      }
    });
  }

  static async clickToggleForceSettings(event, key, app) {
    await app.submit({ preventClose: true, preventRender: true });
    if (ForceClientSettings.isGM()) {
      event.preventDefault();
      let mode = ForceClientSettings.forced.get(key)?.mode ?? "open";
      switch (mode) {
        case "open":
          await ForceClientSettings.forceSetting(key, "soft");
          break;
        case "soft":
          await ForceClientSettings.forceSetting(key, "hard");
          break;
        default:
          await ForceClientSettings.unforceSetting(key);
          break;
      }
    } else {
      if (ForceClientSettings.forced.get(key)?.mode === "soft") {
        event.preventDefault();
        if (ForceClientSettings.unlocked.has(key)) {
          await ForceClientSettings.lockSetting(key);
        } else {
          await ForceClientSettings.unlockSetting(key);
        }
      }
    }
    app.render();
  }

  static async forceSetting(key, mode) {
    if (!ForceClientSettings.isGM()) return;
    try {
      const settings = { ...game.settings.settings.get(key), scope: "world", config: false, onChange: null };
      const value = game.settings.get(...key.split(/\.(.*)/).slice(0, 2));
      game.settings.register(ForceClientSettings.moduleName, `_${key}`, settings);
      await game.settings.set(ForceClientSettings.moduleName, `_${key}`, value);
      ForceClientSettings.forced.set(key, { mode: mode });
      await game.settings.set(ForceClientSettings.moduleName, "forced", Object.fromEntries(ForceClientSettings.forced));
    } catch (exc) {
      console.log(`Force Client Settings | Unable to force ${key}`);
    }
  }
  static async unforceSetting(key) {
    if (!ForceClientSettings.isGM()) return;
    ForceClientSettings.forced.delete(key);
    await game.settings.set(ForceClientSettings.moduleName, "forced", Object.fromEntries(ForceClientSettings.forced));
  }
  static async unlockSetting(key) {
    if (ForceClientSettings.isGM()) return;
    if (ForceClientSettings.forced.has(key)) {
      const forced = ForceClientSettings.forced.get(key);
      if (forced.mode === "soft") {
        ForceClientSettings.unlocked.set(key, true);
        await game.settings.set(
          ForceClientSettings.moduleName,
          "unlocked",
          Object.fromEntries(ForceClientSettings.unlocked)
        );
        const settings = game.settings.settings.get(key);
        if (settings.onChange instanceof Function)
          settings.onChange(game.settings.get(settings.namespace, settings.key));
      }
    }
  }
  static async lockSetting(key) {
    if (ForceClientSettings.isGM()) return;
    if (ForceClientSettings.forced.has(key)) {
      const forced = ForceClientSettings.forced.get(key);
      if (forced.mode === "soft") {
        ForceClientSettings.unlocked.delete(key);
        await game.settings.set(
          ForceClientSettings.moduleName,
          "unlocked",
          Object.fromEntries(ForceClientSettings.unlocked)
        );
        const settings = game.settings.settings.get(key);
        if (settings.onChange instanceof Function)
          settings.onChange(game.settings.get(settings.namespace, settings.key));
      }
    }
  }

  static async migrate() {
    ForceClientSettings.migration = true;
    if (ForceClientSettings.isGM()) {
      game.settings.register(ForceClientSettings.moduleName, "versionWorld", {
        name: `${game.i18n.localize("FORCECLIENTSETTINGS.settings.migration.name")}`,
        hint: `${game.i18n.localize("FORCECLIENTSETTINGS.settings.migration.hint")}`,
        scope: "world",
        config: false,
        type: String,
        default: "1.0.0",
      });
      let versionWorld = game.settings.get(ForceClientSettings.moduleName, "versionWorld");
      const compareVersion = function (a, b) {
        a = a.split(".").map((x) => parseInt(x));
        return b
          .split(".")
          .map((x) => parseInt(x))
          .reduce((acc, x, i) => (acc === 0 ? a[i] - x : acc), 0);
      };
      if (compareVersion(versionWorld, "2.0.0") < 0) {
        // Migration from 1.x.x to 2.0.0
        game.settings.register(ForceClientSettings.moduleName, "forcedSettings", {
          name: `${game.i18n.localize("FORCECLIENTSETTINGS.settings.forced-settings.name")}`,
          hint: `${game.i18n.localize("FORCECLIENTSETTINGS.settings.forced-settings.hint")}`,
          scope: "world",
          config: false,
          type: String,
          default: "{}",
        });
        let forcedSettings = game.settings.get(ForceClientSettings.moduleName, "forcedSettings");
        if (forcedSettings !== "{}") {
          forcedSettings = JSON.parse(forcedSettings);
          for (const key of Object.keys(forcedSettings)) {
            try {
              const settings = game.settings.settings.get(key);
              game.settings.register(settings.namespace, settings.key, {
                ...settings,
                scope: "world",
                onChange: null,
              });
              const value = game.settings.get(settings.namespace, settings.key);
              game.settings.register(settings.namespace, settings.key, { ...settings, onChange: null });
              await game.settings.set(settings.namespace, settings.key, value);
              await ForceClientSettings.forceSetting(`${settings.namespace}.${settings.key}`, "hard");
              console.log(`Force Client Settings | Successfully migrated ${key}`);
            } catch (exc) {
              console.log(`Force Client Settings | Could not migrate ${key}`);
            }
          }
        }
        console.log(`Force Client Settings | Finished migration to 2.0.0`);
        ui.notifications.notify(game.i18n.localize("FORCECLIENTSETTINGS.ui.migration-note"), "warning", {
          permanent: true,
        });
        game.settings.set(ForceClientSettings.moduleName, "versionWorld", "2.0.0");
      }
    }
    ForceClientSettings.migration = false;
  }
}

class ForceClientSettingsConfig extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      title: game.i18n.localize("FORCECLIENTSETTINGS.settings.forced-config.title"),
      id: "force-client-settings-app",
      template: `modules/${ForceClientSettings.moduleName}/templates/forced-config.html`,
      width: 600,
      height: "auto",
      scrollY: [".settings-list"],
    });
  }
  static filter = true;

  getData(options) {
    const fa = {
      hard: "fa-lock",
      soft: "fa-unlock-keyhole",
      open: "fa-lock-keyhole-open",
    };
    const namespace_blacklist = ["force-client-settings", "force-client-controls"];
    return {
      data: {
        filter: ForceClientSettingsConfig.filter,
        namespaces: Array.from(game.settings.settings)
          .filter(
            ([, item]) =>
              item.scope !== "world" &&
              !namespace_blacklist.includes(item.namespace) &&
              (!item.config || !ForceClientSettingsConfig.filter)
          )
          .map(([, item]) => ({ namespace: item.namespace, key: item.key, name: item.name, fa: "fa-lock" }))
          .reduce(
            (acc, item) => ({
              ...acc,
              [item.namespace]: {
                namespace: item.namespace,
                keys: {
                  ...acc[item.namespace]?.keys,
                  [item.key]: {
                    key: item.key,
                    namespace: item.namespace,
                    name:
                      (game.modules.get("df-settings-clarity")?.active ? item.name.substr(2) : item.name) +
                      (`${item.namespace}.${item.key}` === "core.keybindings"
                        ? " "  + game.i18n.localize("FORCECLIENTSETTINGS.settings.forced-config.keybindings")
                        : ""),
                    fa: fa[ForceClientSettings.forced.get(`${item.namespace}.${item.key}`)?.mode ?? "open"],
                    hint: game.i18n.localize(
                      `FORCECLIENTSETTINGS.ui.${
                        ForceClientSettings.forced.get(`${item.namespace}.${item.key}`)?.mode ?? "open"
                      }-gm-hint`
                    ),
                  },
                },
              },
            }),
            {}
          ),
      },
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    const app = this;
    html.find("span.fas").click(async function (event) {
      await ForceClientSettings.clickToggleForceSettings(event, $(event.currentTarget).data("settings-key"), app);
    });
    html.find("button[name='unlock-all'").click(async function (event) {
      new Dialog({
        title: "Force Client Settings",
        content: "Unlock all client settings?",
        buttons: {
          yes: {
            icon: '<i class="fas fa-check"></i>',
            label: game.i18n.localize("FORCECLIENTSETTINGS.ui.yes"),
            callback: async function () {
              ForceClientSettings.forced.clear();
              ForceClientSettings.unlocked.clear();
              await game.settings.set(ForceClientSettings.moduleName, "forced", {});
              await game.settings.set(ForceClientSettings.moduleName, "unlocked", {});
              app.render();
            },
          },
          no: { icon: '<i class="fas fa-times"></i>', label: game.i18n.localize("FORCECLIENTSETTINGS.ui.no") },
        },
      }).render(true);
    });
    html.find("input[name='force-client-settings-filter']").on("change", function (event) {
      ForceClientSettingsConfig.filter = event.currentTarget.checked;
      app.render();
    });
  }

  _updateObject() {}
}

Hooks.once("libWrapper.Ready", ForceClientSettings.initialize);
