
/****************
 * HOOKS
 ***************/

Hooks.once('init', () => {

    game.settings.register('babele', 'directory', {
        name: game.i18n.localize("BABELE.TranslationDirTitle"),
        hint: game.i18n.localize("BABELE.TranslationDirHint"),
        type: String,
        scope: 'world',
        config: true,
        filePicker: "folder",
        default: '',
        onChange: directory => {
            window.location.reload();
        }
    });

    game.settings.register('babele', 'export', {
        name: game.i18n.localize("BABELE.EnableTranslationExportTile"),
        hint: game.i18n.localize("BABELE.EnableTranslationExportHint"),
        scope: 'world',
        type: Boolean,
        config: true,
        default: true
    });

    game.settings.register('babele', 'showOriginalName', {
        name: game.i18n.localize("BABELE.ShowOriginalName"),
        hint: game.i18n.localize("BABELE.ShowOriginalNameHint"),
        scope: 'client',
        type: Boolean,
        config: true,
        default: false
    });

    game.settings.register('babele', 'showTranslateOption', {
        name: game.i18n.localize("BABELE.ShowTranslateOption"),
        hint: game.i18n.localize("BABELE.ShowTranslateOptionHint"),
        scope: 'client',
        type: Boolean,
        config: true,
        default: true
    });

    game.settings.register('babele', 'translationFiles', {
        type: Array,
        default: [],
        scope: 'world',
        config: false
    });

    if(!game.modules.get('lib-wrapper')?.active && game.user.isGM) {
        ui.notifications.error(game.i18n.localize("BABELE.requireLibWrapperMessage"));
    }

    /**
     * Since foundry 0.8.+, translations are directly applied replacing the default ClientDatabaseBackend _getDocuments implementation
     * with a code that merge the incoming data with the mapped translations.
     */
    libWrapper.register('babele', 'ClientDatabaseBackend.prototype._getDocuments', async function (wrapped, ...args) {
        const result = await wrapped(...args);
        if(!game.babele || !game.babele.initialized) {
            return result;
        }

        const documentClass = args[0], query = args[1].query, options = args[1].options, pack = args[1].pack, user = args[2];
        if(!pack || !result || !game.babele.isTranslated(pack)) {
            return result;
        }

        if(options.index) {
            return game.babele.translateIndex(result, pack);
        } else {
            return result.map(data => {
                return new documentClass(game.babele.translate(pack, data.toObject()), {pack});
            });
        }
    }, 'WRAPPER');

    /**
     * Necessary to solve a problem caused by the replacement of the index, even if already present, after reading the document.
     */
    libWrapper.register('babele', 'CompendiumCollection.prototype.indexDocument', function (wrapped, ...args) {
        const id = args[0].id;
        const idx = this.index.get(id);
        wrapped(...args);
        this.index.set(id, mergeObject(this.index.get(id), idx));
    }, 'WRAPPER');

});

Hooks.once('ready', async () => {

    if(!game.modules.get('lib-wrapper')?.active && game.user.isGM) {
        ui.notifications.error(game.i18n.localize("BABELE.requireLibWrapperMessage"));
    }

    game.babele = Babele.get();
    await game.babele.init();
    game.packs.contents.forEach(pack => {
        const index = game.babele.translateIndex(pack.index.contents, pack.collection);
        pack.index = new foundry.utils.Collection();
        for ( let i of index ) {
            if ( i.thumb ) {
                i.img = i.thumb;
                delete i.thumb;
            }
            pack.index.set(i._id, i);
        }
    });
    Hooks.callAll(`babele.ready`);
    ui.sidebar.tabs.compendium.render();
});

Hooks.on('renderActorSheet', (app, html, data) => {
    const exportEnabled = game.settings.get('babele', 'showTranslateOption');
    if(exportEnabled && game.user.isGM && data.editable) {
        let title = game.i18n.localize("BABELE.TranslateActorHeadBtn");
        HtmlUtils.appendHeaderButton(html, title, ev => {
            game.babele.translateActor(app.actor);
        });
    }
});

Hooks.on('renderCompendium', (app, html, data) => {
    const exportEnabled = game.settings.get('babele', 'export');
    if(game.user.isGM && exportEnabled) {
        let title = game.i18n.localize("BABELE.CompendiumTranslations");
        HtmlUtils.appendHeaderButton(html, title, ev => {
            game.babele.exportTranslationsFile(app.collection)
        });
    }

    const showOriginalName = game.settings.get('babele', 'showOriginalName');
    if(showOriginalName) {
        const items = html[0].querySelector(".directory-list")?.children;
        if(items) {
            for (let li of items) {
                const entryName = li.querySelector(".entry-name")||li.querySelector(".document-name");
                const entry = data.index.find(i => i.name === entryName.textContent);
                if(entry && entry.translated && entry.hasTranslation) {
                    const entryNameText = li.querySelector('.entry-name > a')||li.querySelector('.document-name > a');
                    entryName.setAttribute("style", "display: flex; flex-direction: column;");
                    entryNameText.setAttribute("style", "line-height: normal; padding-top: 10px;");
                    const entryNameOriginalText = $(
                        `<div style="line-height: normal; font-size: 12px; color: gray;">
                        ${entry.originalName}
                    </div>`
                    );
                    entryNameOriginalText.insertAfter(entryNameText);
                }
            }
        }
    }
});

/**
 * Simple utility class to inject a custom button to the window header.
 */
class HtmlUtils {

    static appendHeaderButton(html, title, fn) {
        let openBtn = $(`<a class="translate" title="${title}"><i class="fas fa-globe"></i>${title}</a>`);
        openBtn.click(fn);
        html.closest('.app').find('.translate').remove();
        let titleElement = html.closest('.app').find('.window-title');
        openBtn.insertAfter(titleElement);
    }
}

/**
 * Utility class with all predefined converters
 */
class Converters {

    /**
     *
     * @param mapping
     * @param entityType
     * @returns {function(*, *=): *}
     */
    static fromPack(mapping, entityType = 'Item') {
        let dynamicMapping = new CompendiumMapping(entityType, mapping);
        return function(items, translations) {
            return items.map(data => {

                if(translations) {

                    let translation;
                    if(Array.isArray(translations)) {
                        translation = translations.find(t => t.id === data._id || t.id === data.name);
                    } else {
                        translation = translations[data._id] || translations[data.name];
                    }
                    if(translation) {
                        let translatedData = dynamicMapping.map(data, translation);
                        return mergeObject(data, mergeObject(translatedData, { translated: true }));
                    }
                }

                let pack = game.babele.packs.find(pack => pack.translated && pack.hasTranslation(data));
                if(pack) {
                    return pack.translate(data);
                }
                return data;
            });
        }
    }

    /**
     *
     * @param field
     * @returns {function(*, *, *=, *): *|{translated}}
     */
    static mappedField(field) {
        return function (value, translation, data, tc) {
            return tc.translateField(field, data);
        }
    }

    static tableResults() {
        return function (results, translations) {
            return results.map(data => {
                if(translations) {
                    let translation = translations[`${data.range[0]}-${data.range[1]}`];
                    if(translation) {
                        return mergeObject(data, mergeObject({ "text": translation}, { translated: true }));
                    }
                }
                if(data.documentCollection) {
                    let text = game.babele.translateField("name", data.documentCollection, { "name": data.text });
                    if(text) {
                        return mergeObject(data, mergeObject({ "text": text}, { translated: true }));
                    } else {
                        return data;
                    }
                }
                return data;
            });
        }
    }

    static pages() {
        return function (pages, translations) {
            return pages.map(data => {
                if(translations) {
                    let translation = translations[data.name];
                    if(translation) {
                        return mergeObject(data, {
                            name: translation.name,
                            text: { content: translation.text },
                            translated: true
                        });
                    }
                }
                return data;
            });
        }
    }
}

/**
 * Main facade class with init logic and on API for on demand translations based on loaded mapping files.
 */
class Babele {

    static get SUPPORTED_PACKS() {
        return ['Actor', 'Item', 'JournalEntry', 'RollTable', 'Scene'];
    }

    static get DEFAULT_MAPPINGS() {
        return {
            "Actor": {
                "name": "name",
                "description": "system.details.biography.value",
                "items": {
                    "path": "items",
                    "converter": "fromPack"
                },
                "tokenName": {
                    "path": "prototypeToken.name",
                    "converter": "name"
                }
            },
            "Item": {
                "name": "name",
                "description": "system.description.value"
            },
            "JournalEntry": {
                "name": "name",
                "description": "content",
                "pages": {
                    "path": "pages",
                    "converter": "pages"
                }
            },
            "RollTable": {
                "name": "name",
                "description": "description",
                "results": {
                    "path": "results",
                    "converter": "tableResults"
                }
            },
            "Scene": {
                "name": "name"
            }
        }
    }

    /**
     * Singleton implementation.
     *
     * @returns {Babele}
     */
    static get() {
        if(!Babele.instance) {
            Babele.instance = new Babele();
        }
        return Babele.instance;
    }

    constructor() {
        this.modules = [];
        this.converters = {};
        this.translations = null;
        this.systemTranslationsDir = null;
        this.initialized = false;
        this.registerDefaultConverters();
    }

    /**
     * Register the default provided converters.
     */
    registerDefaultConverters() {
        this.registerConverters({
            "fromPack": Converters.fromPack(),
            "name": Converters.mappedField("name"),
            "tableResults": Converters.tableResults(),
            "pages": Converters.pages()
        })
    }

    /**
     *
     * @param module
     */
    register(module) {
        this.modules.push(module);
    }

    /**
     *
     * @param converters
     */
    registerConverters(converters) {
        this.converters = mergeObject(this.converters, converters);
    }

    /**
     *
     * @param pack
     * @returns {boolean}
     */
    supported(pack) {
        return Babele.SUPPORTED_PACKS.includes(pack.type);
    }

    /**
     *
     * @param dir
     */
    setSystemTranslationsDir(dir) {
        this.systemTranslationsDir = dir;
    }

    /**
     * Initialize babele downloading the available translations files and instantiating the associated
     * translated compendium class.
     *
     * @returns {Promise<void>}
     */
    async init() {
        if(!this.translations) {
            this.translations = await this.loadTranslations();
        }
        this.packs = new foundry.utils.Collection();
        for ( let metadata of game.data.packs ) {
            const collection = `${metadata.packageName}.${metadata.name}`;
            if(this.supported(metadata)) {
                let translation = this.translations.find(t => t.collection === collection);
                this.packs.set(collection, new TranslatedCompendium(metadata, translation));
            }
        }
        this.initialized = true;
        Hooks.callAll(`babele.ready`);
    }

    /**
     * Find and download the translation files for each compendium present on the world.
     * Verify the effective presence of each file using the FilePicker API.
     *
     * @returns {Promise<[]>}
     */
    async loadTranslations() {
        const lang = game.settings.get('core', 'language');
        const directory = game.settings.get('babele', 'directory');
        const directories = this.modules
            .filter(module => module.lang === lang)
            .map(module => `modules/${module.module}/${module.dir}`);

        if(directory && directory.trim && directory.trim()) {
            directories.push(`${directory}/${lang}`);
        }

        if(this.systemTranslationsDir) {
            directories.push(`systems/${game.system.data.name}/${this.systemTranslationsDir}/${lang}`);
        }

        let files = [];
        if(game.user.hasPermission('FILES_BROWSE')) {
            for(let i=0; i<directories.length; i++) {
                try {
                    let result = await FilePicker.browse("data", directories[i]);
                    result.files.forEach(file => files.push(file));
                } catch (err) {
                    console.warn("Babele: " + err)
                }
            }
            if(game.user.isGM) {
                game.settings.set('babele', 'translationFiles', files);
            }
        } else {
            files = game.settings.get('babele', 'translationFiles');
        }

        let allTranslations = [];
        if(files.length === 0) {
            console.log(`Babele | no compendium translation files found for ${lang} language.`);
        } else {
            for ( let metadata of game.data.packs ) {
                const collection = `${metadata.packageName}.${metadata.name}`;
                if(this.supported(metadata)) {
                    const urls = files.filter(file => file.endsWith(`${collection}.json`));
                    if(urls.length === 0) {
                        console.log(`Babele | no translation file found for ${collection} pack`);
                    } else {
                        const [translations] = await Promise.all(
                                [Promise.all(urls.map((url) => fetch(url).then((r) => r.json()).catch(e => {})))]
                        );

                        let translation;
                        translations.forEach(t => {
                            if(t) {
                                translation = t; // the last valid
                            }
                        });
                        if(translation) {
                            console.log(`Babele | translation for ${collection} pack successfully loaded`);
                            allTranslations.push(mergeObject(translation, { collection: collection }));
                        }
                    }
                }
            }
        }
        return allTranslations;
    }

    /**
     * Translate & sort the compendium index.
     *
     * @param index the untranslated index
     * @param pack the pack name
     * @returns {*} the translated & sorted index
     */
    translateIndex(index, pack) {
        const prevIndex = game.packs.get(pack).index;
        const lang = game.settings.get('core', 'language');
        const collator = new Intl.Collator(Intl.Collator.supportedLocalesOf([ lang ]).length > 0 ? lang : 'en');
        return index
                .map(data => {
                    let translated = prevIndex.get(data._id)?.translated;
                    if(translated) {
                        return mergeObject(data, this.translate(pack, data, true));
                    } else {
                        return this.translate(pack, data);
                    }
                })
                .sort((a, b) => {
                  return collator.compare(a.name, b.name);
                });
    }

    /**
     * Check if the compendium pack is translated (exists an associated translation file).
     *
     * @param pack compendium name (ex. dnd5e.classes)
     * @returns {boolean|*} true if the compendium is translated.
     */
    isTranslated(pack) {
        const tc = this.packs.get(pack);
        return tc && tc.translated;
    }

    /**
     * Translate the
     *
     * @param pack
     * @param data
     * @param translationsOnly
     * @returns {*}
     */
    translate(pack, data, translationsOnly) {
        const tc = this.packs.get(pack);
        if(!tc || !(tc.hasTranslation(data) || tc.mapping.isDynamic())) {
            return data;
        }
        return tc.translate(data, translationsOnly);
    }

    /**
     *
     * @param field
     * @param pack
     * @param data
     * @returns {*}
     */
    translateField(field, pack, data) {
        const tc = this.packs.get(pack);
        if(!tc) {
            return null;
        }
        if(!(tc.hasTranslation(data) || tc.mapping.isDynamic())) {
            return tc.extractField(field, data);
        }
        return tc.translateField(field, data);
    }

    /**
     *
     * @param pack
     * @param data
     * @returns {*}
     */
    extract(pack, data) {
        return this.packs.get(pack)?.extract(data);
    }

    /**
     *
     * @param pack
     * @param field
     * @param data
     * @returns {*}
     */
    extractField(pack, field, data) {
        return this.packs.get(pack)?.extractField(field, data);
    }

    /**
     *
     * @param pack
     */
    exportTranslationsFile(pack) {

        ExportTranslationsDialog.create(pack).then(async conf => {

            if (conf) {

                let file = {
                    label: pack.metadata.label,
                    entries: conf.format === 'legacy' ? [] : {}
                };

                let index = await pack.getIndex();
                Promise.all(index.map(entry => pack.getDocument(entry._id))).then(entities => {
                    entities.forEach((entity, idx) => {
                        const name = entity.getFlag("babele", "translated") ? entity.getFlag("babele", "originalName") : entity.name;
                        if (conf.format === 'legacy') {
                            let entry = mergeObject({id: name}, this.extract(pack.collection, entity.data));
                            file.entries.push(entry);
                        } else {
                            file.entries[`${name}`] = this.extract(pack.collection, entity.data);
                        }
                    });

                    let dataStr = JSON.stringify(file, null, '\t');
                    let exportFileDefaultName = pack.collection + '.json';

                    var zip = new JSZip();
                    zip.file(exportFileDefaultName, dataStr);
                    zip.generateAsync({type: "blob"})
                        .then(content => {
                            saveAs(content, pack.collection + ".zip");
                        });
                });
            }
        });
    }

    /**
     *
     * @param actor
     */
    translateActor(actor) {
        let d = new OnDemandTranslateDialog(actor);
        d.render(true);
    }

    importCompendium(folderName, compendiumName) {
        let compendium = game.packs.find(p => p.collection === compendiumName);
        let folder = game.folders.entities.filter((f) => f.data.name === folderName)[0];
        if (compendium && folder) {
            compendium.getIndex().then(index => {
                index.forEach(entity => {
                    compendium.getEntity(entity._id)
                        .then(entity => {
                            console.log(entity.data);
                            if (!entity.data.hasTranslation) {
                                entity.constructor.create(
                                    mergeObject(entity.data, {
                                        folder: folder.id
                                    }),
                                    {displaySheet: false}
                                ).then(
                                    e => {
                                        e.setFlag('world', 'name', entity.data.name);
                                        console.log(e);
                                    }
                                );
                            }
                        })
                        .catch(err => {
                            console.error(`Unable import entity... ${err}`);
                        });
                });
            });
        }
    }
}

/**
 * Class to map, translate or extract value for a single field defined by a mapping.
 *
 * ex: new FieldMapping("desc", "data.description.value", tc)
 */
class FieldMapping {

    constructor(field, mapping, tc) {
        this.field = field;
        this.tc = tc;
        if(typeof mapping === "object") {
            this.path = mapping["path"];
            this.converter = Babele.get().converters[mapping["converter"]];
            this.dynamic = true;
        } else {
            this.path = mapping;
            this.converter = null;
            this.dynamic = false;
        }
    }

    /**
     * Extract the
     *
     * @param data the original entity data to translate
     * @param translations the static available translations for the entity
     * @returns {{}} an object with expanded field path and a translated value.
     */
    map(data, translations) {
        const map = {};
        const value = this.translate(data, translations);
        if(value) {
            this.path.split('.').reduce((a,f,i,r) => { a[f] = (i<r.length-1) ? {} : value; return a[f]; }, map);    
        }
        return map;    
    }

    /**
     *
     * @param data
     * @param translations
     * @returns {*}
     */
    translate(data, translations) {
        const originalValue = this.extractValue(data);
        let value;
        if(this.converter && originalValue) {
            value = this.converter(originalValue, translations[this.field], data, this.tc, translations)
        } else {
            value = translations[this.field];
        }
        return value;
    }

    /**
     * Extracts the value corresponding to the field path configured within the passed data.
     *
     * ex:
     * const data = { "data": { "description": { "value": "bla bla" } } };
     * const value = new FieldMapping("desc", "data.description.value").extractValue(data);
     * console.log(value) // -> "bla bla"
     *
     * @param data
     * @returns {*}
     */
    extractValue(data) {
        return this.path.split('.').reduce((o, k) => {return o && o[k]; }, data);
    }


    /**
     * Extract the value corresponding to the field path in object format.
     *
     * ex:
     * const data = { "data": { "description": { "value": "bla bla" } } };
     * const value = new FieldMapping("desc", "data.description.value").extractValue(data);
     * console.log(value) // -> { "desc": "bla bla" }
     *
     * @param data
     * @returns {*}
     */
    extract(data) {
        const extract = {};
        extract[this.field] = this.extractValue(data);
        return extract;
    }

    /**
     * If this field mapping is based on a converter.
     *
     * @returns {boolean} true if is based on a converter.
     */
    isDynamic() {
        return this.dynamic;
    }
}

/**
 *
 */
class CompendiumMapping {

    constructor(entityType, mapping, tc) {
        this.mapping = mergeObject(Babele.DEFAULT_MAPPINGS[entityType], mapping || {});
        this.fields = Object.keys(this.mapping).map(key => new FieldMapping(key, this.mapping[key], tc));
    }

    /**
     *
     * @param data original data to translate
     * @returns {*} an object with expanded mapped fields path and a translated value.
     */
    map(data, translations) {
        return this.fields.reduce((m, f) => mergeObject(m, f.map(data, translations)), {});
    }

    /**
     *
     */
    translateField(field, data, translations) {
        return this.fields.find(f => f.field === field)?.translate(data, translations);
    }

    /**
     *
     */
    extractField(field, data) {
        return this.fields.find(f => f.field === field)?.extractValue(field, data);
    }

    /**
     *
     * @param data
     * @returns {*}
     */
    extract(data) {
        return this.fields
            .filter(f => !f.isDynamic())
            .reduce((m, f) => mergeObject(m, f.extract(data)), {});
    }

    /**
     * If almost one of the mapped field is dynamic, the compendium is considered dynamic.
     */
    isDynamic() {
        return this.fields.map(f => f.isDynamic()).reduce((result, dynamic) => result || dynamic, false);
    }

}

/**
 *
 */
class TranslatedCompendium {

    constructor(metadata, translations) {
        this.metadata = metadata;
        this.translations = [];
        this.mapping = new CompendiumMapping(metadata.type, translations ? translations.mapping : null, this);
        if(translations) {
            mergeObject(metadata, { label: translations.label });

            this.translated = true;
            this.reference = null;
            if(translations.reference) {
                this.reference = Array.isArray(translations.reference) ? translations.reference : [translations.reference];
            }

            if(translations.entries) {
                if(Array.isArray(translations.entries)) {
                    translations.entries.forEach(t => {
                        this.translations[t.id] = t;
                    });
                } else {
                    this.translations = translations.entries;
                }
            }
        }
    }

    /**
     *
     * @param data
     * @returns {boolean|*|{translated}}
     */
    hasTranslation(data) {
        return !!this.translations[data._id] || !!this.translations[data.name] || this.hasReferenceTranslations(data);
    }

    /**
     *
     * @param data
     * @returns {*|{}}
     */
    translationsFor(data) {
        return this.translations[data._id] || this.translations[data.name] || {}
    }

    /**
     *
     * @param data
     * @returns {boolean|boolean|*|{translated}}
     */
    hasReferenceTranslations(data) {
        if(this.reference) {
            for (let ref of this.reference) {
                let referencePack = game.babele.packs.get(ref);
                if(referencePack.translated && referencePack.hasTranslation(data)) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Delegate extract to the compendium mapping relative method.
     *
     * @see CompendiumMapping.extract()
     * @param data
     * @returns {*}
     */
    extract(data) {
        return this.mapping.extract(data);
    }

    /**
     * Delegate extractField to the compendium mapping relative method.
     *
     * @see CompendiumMapping.extractField()
     * @param data
     * @returns {*}
     */
    extractField(field, data) {
        return this.mapping.extractField(field, data);
    }


    /**
     *
     * @param field
     * @param data
     * @returns {*}
     */
    translateField(field, data) {
        if(data == null) {
            return data;
        }

        if(data.translated) {
            return this.mapping.extractField(field, data);
        }

        return this.mapping.translateField(field, data, this.translationsFor(data));
    }

    /**
     *
     * @param data
     * @param translationsOnly
     * @returns {{translated}|*}
     */
    translate(data, translationsOnly) {

        if(data == null) {
            return data;
        }

        if(data.translated) {
            return data;
        }

        let translatedData = this.mapping.map(data, this.translationsFor(data));

        if(this.reference) {
            for (let ref of this.reference) {
                let referencePack = game.babele.packs.get(ref);
                if(referencePack.translated && referencePack.hasTranslation(data)) {
                    let fromReference = referencePack.translate(data, true);
                    translatedData = mergeObject(fromReference, translatedData);
                }
            }
        }

        if(translationsOnly) {
            return translatedData;
        } else {
            return mergeObject(
                data,
                mergeObject(
                    translatedData, {
                        translated: true,
                        hasTranslation: this.hasTranslation(data),
                        originalName: data.name,
                        flags: {
                            babele: {
                                translated: true,
                                hasTranslation: this.hasTranslation(data),
                                originalName: data.name
                            }
                        }
                    },
                    {inplace: false}
                ),
                { inplace: false }
            );
        }
    }
}

/**
 *
 */
class ExportTranslationsDialog extends Dialog {

    constructor(pack, dialogData={}, options={}) {
        super(dialogData, options);
        this.pack = pack;
    }

    static async create(pack) {
        const html = await renderTemplate("modules/babele/templates/export-translations-dialog.html", pack);

        return new Promise((resolve) => {
            const dlg = new this(pack, {
                title: pack.metadata.label + ': ' + game.i18n.localize("BABELE.ExportTranslationTitle"),
                content: html,
                buttons: {
                    exp: {
                        icon: `<i class="fas fa-download"></i>`,
                        label: game.i18n.localize("BABELE.ExportTranslationBtn"),
                        callback: html => {
                            const fd = new FormDataExtended(html[0].querySelector("form"));
                            resolve(fd.toObject());
                        }
                    }
                },
                default: "exp",
                close: () => resolve(null)
            });
            dlg.render(true);
        });
    }
}

/**
 *
 */
class OnDemandTranslateDialog extends Dialog {

    constructor(actor) {
        super({
            title: game.i18n.localize("BABELE.TranslateActorTitle"),
            content:
                `<p>${game.i18n.localize("BABELE.TranslateActorHint")}</p>
                <textarea rows="10" cols="50" id="actor-translate-log" style="font-family: Courier, monospace"></textarea>`,
            buttons: {
              translate: {
                  icon: '<i class="fas fa-globe"></i>',
                  label: game.i18n.localize("BABELE.TranslateActorBtn"),
                  callback: async () => {
                      let area = $('#actor-translate-log');
                      area.append(`start...\n`);
                      let items = actor.items.contents.length;
                      let translated = 0;
                      let untranslated = 0;

                      let updates = [];
                      for (let idx = 0; idx < items; idx++) {
                          let item = actor.items.contents[idx];
                          let data = item.toObject();

                          let pack = game.babele.packs.find(pack => pack.translated && pack.hasTranslation(data));
                          if(pack) {
                              let translatedData =  pack.translate(data, true);
                              updates.push(mergeObject(translatedData, { _id: item.id }));
                              area.append(`${data.name.padEnd(68,'.')}ok\n`);
                              translated++;
                          } else {
                              area.append(`${data.name.padEnd(61,'.')}not found\n`);
                              untranslated++;
                          }
                      }
                      if(updates.length) {
                          area.append(`Updating...\n`);
                          await actor.updateEmbeddedDocuments("Item", updates);
                      }
                      area.append(`\nDone. tot items: ${items}, tot translated: ${translated}, tot untranslated: ${untranslated}  
                      \n`);
                  }
              }
            },
            default: "translate"
        });
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            width: 600
        });
    }

    submit(button) {
        try {
            button.callback();
        } catch(err) {
            ui.notifications.error(err);
            throw new Error(err);
        }
    }

}
