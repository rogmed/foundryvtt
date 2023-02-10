import { __classPrivateFieldSet, __classPrivateFieldGet, Fuse, SvelteComponent, init, safe_not_equal, empty, insert, noop, detach, createEventDispatcher, afterUpdate, element, attr, update_keyed_each, space, text, toggle_class, append, listen, set_data, destroy_each, run_all, binding_callbacks, destroy_block, stop_propagation, src_url_equal, HtmlTag } from './vendor.js';

const MODULE_NAME = "quick-insert";
function registerSetting(setting, callback, { ...options }) {
    game.settings.register(MODULE_NAME, setting, {
        config: true,
        scope: "client",
        ...options,
        onChange: callback || undefined,
    });
}
function getSetting(setting) {
    return game.settings.get(MODULE_NAME, setting);
}
function setSetting(setting, value) {
    return game.settings.set(MODULE_NAME, setting, value);
}
function registerMenu({ menu, ...options }) {
    game.settings.registerMenu(MODULE_NAME, menu, options);
}

const SAVE_SETTINGS_REVISION = 1;
var ModuleSetting;
(function (ModuleSetting) {
    // QUICKOPEN = "quickOpen", // dead setting
    ModuleSetting["ENABLE_GLOBAL_CONTEXT"] = "enableGlobalContext";
    ModuleSetting["INDEXING_DISABLED"] = "indexingDisabled";
    ModuleSetting["FILTERS_CLIENT"] = "filtersClient";
    ModuleSetting["FILTERS_WORLD"] = "filtersWorld";
    ModuleSetting["FILTERS_SHEETS"] = "filtersSheets";
    ModuleSetting["FILTERS_SHEETS_ENABLED"] = "filtersSheetsEnabled";
    ModuleSetting["GM_ONLY"] = "gmOnly";
    ModuleSetting["AUTOMATIC_INDEXING"] = "automaticIndexing";
    ModuleSetting["INDEX_TIMEOUT"] = "indexTimeout";
    ModuleSetting["SEARCH_BUTTON"] = "searchButton";
    ModuleSetting["KEY_BIND"] = "keyBind";
    ModuleSetting["DEFAULT_ACTION_SCENE"] = "defaultSceneAction";
    ModuleSetting["DEFAULT_ACTION_ROLL_TABLE"] = "defaultActionRollTable";
    ModuleSetting["DEFAULT_ACTION_MACRO"] = "defaultActionMacro";
    ModuleSetting["SEARCH_TOOLTIPS"] = "searchTooltips";
    ModuleSetting["EMBEDDED_INDEXING"] = "embeddedIndexing";
})(ModuleSetting || (ModuleSetting = {}));

const i18n = (name, replacements) => {
    let namespace = "QUICKINSERT";
    if (name.includes(".")) {
        [namespace, name] = name.split(".", 2);
    }
    if (replacements) {
        return game.i18n.format(`${namespace}.${name}`, replacements);
    }
    return game.i18n.localize(`${namespace}.${name}`);
};
function isTextInputElement(element) {
    return (element.tagName == "TEXTAREA" ||
        (element.tagName == "INPUT" && element.type == "text"));
}
// General utils
const ALPHA = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
function randomId(idLength = 10) {
    const values = new Uint8Array(idLength);
    window.crypto.getRandomValues(values);
    return String.fromCharCode(...values.map((x) => ALPHA.charCodeAt(x % ALPHA.length)));
}
// Some black magic from the internet,
// places caret at end of contenteditable
function placeCaretAtEnd(el) {
    if (!el)
        return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
}
// Simple utility function for async waiting
// Nicer to await waitFor(100) than nesting setTimeout callback hell
function resolveAfter(msec) {
    return new Promise((res) => setTimeout(res, msec));
}
class TimeoutError extends Error {
    constructor(timeoutMsec) {
        super(`did not complete within ${timeoutMsec}ms`);
    }
}
function withDeadline(p, timeoutMsec) {
    return Promise.race([
        p,
        new Promise((res, rej) => setTimeout(() => rej(new TimeoutError(timeoutMsec)), timeoutMsec)),
    ]);
}
function permissionListEq(a, b) {
    return a.length === b.length && [...a].every((value) => b.includes(value));
}
// Match keybinds even if it's in input fields or with explicit context
function customKeybindHandler(evt, context) {
    if (evt.isComposing || (!evt.key && !evt.code)) {
        return;
    }
    if (!context && !game.keyboard?.hasFocus)
        return;
    const ctx = KeyboardManager.getKeyboardEventContext(evt, false);
    if (ctx.event.target?.dataset?.engine === "prosemirror") {
        return;
    }
    if (context) {
        ctx._quick_insert_extra = { context };
    }
    //@ts-expect-error using private, I know
    const actions = KeyboardManager._getMatchingActions(ctx)
        .map((action) => game.keybindings.actions.get(action.action))
        .filter((action) => action?.textInput);
    if (!actions.length)
        return;
    let handled = false;
    for (const action of actions) {
        //@ts-expect-error using private, I know
        handled = KeyboardManager._executeKeybind(action, ctx);
        if (handled)
            break;
    }
    if (handled) {
        evt.preventDefault();
        evt.stopPropagation();
    }
}

var _EmbeddedEntitySearchItem_tagline, _EmbeddedCompendiumSearchItem_tagline;
var DocumentType;
(function (DocumentType) {
    DocumentType["ACTOR"] = "Actor";
    DocumentType["ITEM"] = "Item";
    DocumentType["JOURNALENTRY"] = "JournalEntry";
    DocumentType["MACRO"] = "Macro";
    DocumentType["ROLLTABLE"] = "RollTable";
    DocumentType["SCENE"] = "Scene";
})(DocumentType || (DocumentType = {}));
const IndexedDocumentTypes = [
    DocumentType.ACTOR,
    DocumentType.ITEM,
    DocumentType.JOURNALENTRY,
    DocumentType.MACRO,
    DocumentType.ROLLTABLE,
    DocumentType.SCENE,
];
const EmbeddedDocumentTypes = {
    [DocumentType.JOURNALENTRY]: "JournalEntryPage",
};
const EmbeddedDocumentCollections = {
    [DocumentType.JOURNALENTRY]: "pages",
};
const DocumentMeta = {
    [DocumentType.ACTOR]: CONFIG.Actor.documentClass.metadata,
    [DocumentType.ITEM]: CONFIG.Item.documentClass.metadata,
    [DocumentType.JOURNALENTRY]: CONFIG.JournalEntry.documentClass.metadata,
    [DocumentType.MACRO]: CONFIG.Macro.documentClass.metadata,
    [DocumentType.ROLLTABLE]: CONFIG.RollTable.documentClass.metadata,
    [DocumentType.SCENE]: CONFIG.Scene.documentClass.metadata,
};
const documentIcons = {
    [DocumentType.ACTOR]: "fa-user",
    [DocumentType.ITEM]: "fa-suitcase",
    [DocumentType.JOURNALENTRY]: "fa-book-open",
    [DocumentType.MACRO]: "fa-terminal",
    [DocumentType.ROLLTABLE]: "fa-th-list",
    [DocumentType.SCENE]: "fa-map",
};
function extractEmbeddedIndex(item, pack) {
    if (!("pages" in item))
        return;
    if (pack) {
        return item.pages.name.map((name, i) => new EmbeddedCompendiumSearchItem(pack, {
            _id: item.pages._id[i],
            parentName: item.name,
            embeddedName: name,
            parentId: item._id,
            type: "JournalEntryPage",
            tagline: `Pg. ${i} - ${pack?.metadata?.label || pack.title}`,
        }));
    }
    // TODO: Index directory
}
function getCollectionFromType(type) {
    //@ts-expect-error not documented
    return CONFIG[type].collection.instance;
}
const ignoredFolderNames = { _fql_quests: true };
function enabledDocumentTypes() {
    const disabled = getSetting(ModuleSetting.INDEXING_DISABLED);
    return IndexedDocumentTypes.filter((t) => !disabled?.entities?.[t]?.includes(game.user?.role));
}
function enabledEmbeddedDocumentTypes() {
    if (enabledDocumentTypes().includes(DocumentType.JOURNALENTRY) &&
        getSetting(ModuleSetting.EMBEDDED_INDEXING)) {
        return [EmbeddedDocumentTypes[DocumentType.JOURNALENTRY]];
    }
    return [];
}
function packEnabled(pack) {
    const disabled = getSetting(ModuleSetting.INDEXING_DISABLED);
    // Pack entity type enabled?
    if (disabled?.entities?.[pack.metadata.type]?.includes(game.user?.role)) {
        return false;
    }
    // Pack enabled?
    if (disabled?.packs?.[pack.collection]?.includes(game.user?.role)) {
        return false;
    }
    // Pack entity type indexed?
    if (!IndexedDocumentTypes.includes(pack.metadata.type)) {
        return false;
    }
    // Not hidden?
    return !(pack.private && !game.user?.isGM);
}
function getDirectoryName(type) {
    const documentLabel = DocumentMeta[type].labelPlural;
    return i18n("SIDEBAR.DirectoryTitle", {
        type: documentLabel ? i18n(documentLabel) : type,
    });
}
class SearchItem {
    constructor(data) {
        this.id = data.id;
        this.uuid = data.uuid;
        this.name = data.name;
        this.documentType = data.documentType;
        this.img = data.img;
    }
    // Get the drag data for drag operations
    get dragData() {
        return {};
    }
    // Get the html for an icon that represents the item
    get icon() {
        return "";
    }
    // Reference the entity in a journal, chat or other places that support it
    get journalLink() {
        return "";
    }
    // Reference the entity in a script
    get script() {
        return "";
    }
    // Short tagline that explains where/what this is
    get tagline() {
        return "";
    }
    // Additional details for result tooltips
    get tooltip() {
        const type = i18n(DocumentMeta[this.documentType]?.label);
        return `${type}, ${this.tagline}`;
    }
    // Show the sheet or equivalent of this search result
    async show() {
        return;
    }
    // Fetch the original object (or null if no longer available).
    // NEVER call as part of indexing or filtering.
    // It can be slow and most calls will cause a request to the database!
    // Call it once a decision is made, do not call for every SearchItem!
    async get() {
        return null;
    }
}
class EntitySearchItem extends SearchItem {
    constructor(data) {
        super(data);
        const folder = data.folder;
        if (folder) {
            this.folder = {
                id: folder.id,
                name: folder.name,
            };
        }
    }
    static fromEntities(entities) {
        return entities
            .filter((e) => {
            return (e.visible && !(e.folder?.name && ignoredFolderNames[e.folder.name]));
        })
            .map((doc) => {
            let embedded;
            if (EmbeddedDocumentTypes[doc.documentName] &&
                enabledEmbeddedDocumentTypes().includes(EmbeddedDocumentTypes[doc.documentName])) {
                const collection = 
                //@ts-expect-error can't type this right now
                doc[EmbeddedDocumentCollections[doc.documentName]];
                embedded = collection.map(EmbeddedEntitySearchItem.fromDocument);
            }
            return embedded
                ? [...embedded, this.fromDocument(doc)]
                : [this.fromDocument(doc)];
        })
            .flat();
    }
    static fromDocument(doc) {
        if ("PDFoundry" in ui && "pdfoundry" in doc.data.flags) {
            return new PDFoundySearchItem({
                id: doc.id,
                uuid: doc.uuid,
                name: doc.name,
                documentType: doc.documentName,
                //@ts-expect-error data is merged wih doc
                img: doc.img,
                folder: doc.folder || undefined,
            });
        }
        return new EntitySearchItem({
            id: doc.id,
            uuid: doc.uuid,
            name: doc.name,
            documentType: doc.documentName,
            //@ts-expect-error data is merged wih doc
            img: doc.img,
            folder: doc.folder || undefined,
        });
    }
    // Get the drag data for drag operations
    get dragData() {
        return {
            type: this.documentType,
            uuid: this.uuid,
        };
    }
    get icon() {
        return `<i class="fas ${documentIcons[this.documentType]} entity-icon"></i>`;
    }
    // Reference the entity in a journal, chat or other places that support it
    get journalLink() {
        return `@${this.documentType}[${this.id}]{${this.name}}`;
    }
    // Reference the entity in a script
    get script() {
        return `game.${DocumentMeta[this.documentType].collection}.get("${this.id}")`;
    }
    // Short tagline that explains where/what this is
    get tagline() {
        if (this.folder) {
            return `${this.folder.name}`;
        }
        return `${getDirectoryName(this.documentType)}`;
    }
    async show() {
        (await this.get())?.sheet?.render(true);
    }
    async get() {
        return getCollectionFromType(this.documentType).get(this.id);
    }
}
class PDFoundySearchItem extends EntitySearchItem {
    get icon() {
        return `<img class="pdf-thumbnail" src="modules/pdfoundry/assets/pdf_icon.svg" alt="PDF Icon">`;
    }
    get journalLink() {
        return `@PDF[${this.name}|page=1]{${this.name}}`;
    }
    async show() {
        const entity = await this.get();
        ui?.PDFoundry.openPDFByName(this.name, { entity });
    }
}
class CompendiumSearchItem extends SearchItem {
    constructor(pack, item) {
        const packName = pack.collection;
        super({
            id: item._id,
            uuid: `Compendium.${packName}.${item._id}`,
            name: item.name,
            documentType: pack.metadata.type,
            img: item.img,
        });
        this.package = packName;
        this.packageName = pack?.metadata?.label || pack.title;
        this.documentType = pack.metadata.type;
        this.uuid = `Compendium.${this.package}.${this.id}`;
    }
    static fromCompendium(pack) {
        const cIndex = pack.index;
        return cIndex
            .map((item) => {
            const embedded = extractEmbeddedIndex(item, pack);
            const searchItem = new CompendiumSearchItem(pack, item);
            return embedded ? [searchItem, embedded] : searchItem;
        })
            .flat(2);
    }
    // Get the drag data for drag operations
    get dragData() {
        return {
            type: this.documentType,
            uuid: this.uuid,
        };
    }
    get icon() {
        return `<i class="fas ${documentIcons[this.documentType]} entity-icon"></i>`;
    }
    // Reference the entity in a journal, chat or other places that support it
    get journalLink() {
        return `@Compendium[${this.package}.${this.id}]{${this.name}}`;
    }
    // Reference the entity in a script
    get script() {
        return `fromUuid("${this.uuid}")`; // TODO: note that this is async somehow?
    }
    // Short tagline that explains where/what this is
    get tagline() {
        return `${this.packageName}`;
    }
    async show() {
        (await this.get())?.sheet?.render(true);
    }
    async get() {
        return (await fromUuid(this.uuid));
    }
}
class EmbeddedEntitySearchItem extends SearchItem {
    constructor(item) {
        super({
            id: item.id,
            uuid: item.uuid,
            name: `${item.embeddedName} | ${item.parentName}`,
            documentType: item.type,
            img: item.img,
        });
        _EmbeddedEntitySearchItem_tagline.set(this, void 0);
        __classPrivateFieldSet(this, _EmbeddedEntitySearchItem_tagline, item.tagline, "f");
    }
    static fromDocument(document) {
        if (!document.parent || !document.id) {
            throw new Error("Not properly embedded");
        }
        //@ts-expect-error There has to be an easier way...
        const number = [...document.parent[document.collectionName].keys()].indexOf(document.id);
        const parentType = document.parent.documentName;
        return new EmbeddedEntitySearchItem({
            id: document.id,
            uuid: document.uuid,
            parentName: document.parent.name || undefined,
            embeddedName: document.name,
            type: parentType,
            tagline: `Pg. ${number} - ${document.parent.folder?.name || getDirectoryName(parentType)}`,
        });
    }
    // Get the drag data for drag operations
    get dragData() {
        return {
            // TODO: Use type from index
            type: "JournalEntryPage",
            uuid: this.uuid,
        };
    }
    get icon() {
        // TODO: Add table tor subtypes
        return `<i class="fa-duotone fa-book-open entity-icon"></i>`;
    }
    // Reference the entity in a journal, chat or other places that support it
    get journalLink() {
        return `@UUID[${this.uuid}]{${this.name}}`;
    }
    // Reference the entity in a script
    get script() {
        return `fromUuid("${this.uuid}")`;
    }
    // Short tagline that explains where/what this is
    get tagline() {
        return __classPrivateFieldGet(this, _EmbeddedEntitySearchItem_tagline, "f") || "";
    }
    get tooltip() {
        const type = i18n(DocumentMeta[this.documentType]?.label);
        //@ts-expect-error Update types!
        const page = i18n(CONFIG.JournalEntryPage.documentClass.metadata.label);
        return `${type} ${page}, ${__classPrivateFieldGet(this, _EmbeddedEntitySearchItem_tagline, "f")}`;
    }
    async show() {
        //@ts-expect-error This is good enough for now
        (await this.get())?._onClickDocumentLink({
            currentTarget: { dataset: {} },
        });
    }
    async get() {
        return (await fromUuid(this.uuid));
    }
}
_EmbeddedEntitySearchItem_tagline = new WeakMap();
class EmbeddedCompendiumSearchItem extends SearchItem {
    constructor(pack, item) {
        const packName = pack.collection;
        const uuid = `Compendium.${packName}.${item.parentId}.${item.type}.${item._id}`;
        super({
            id: item._id,
            uuid,
            name: `${item.embeddedName} | ${item.parentName}`,
            documentType: item.type,
            img: item.img,
        });
        // Inject overrides??
        _EmbeddedCompendiumSearchItem_tagline.set(this, void 0);
        this.uuid = uuid;
        this.package = packName;
        this.packageName = pack?.metadata?.label || pack.title;
        this.documentType = pack.metadata.type;
        __classPrivateFieldSet(this, _EmbeddedCompendiumSearchItem_tagline, item.tagline, "f");
    }
    static fromDocument(document) {
        if (!document.parent) {
            throw new Error("Document is not embedded");
        }
        if (!document.pack) {
            throw new Error("Document has no pack");
        }
        const pack = game.packs.get(document.pack);
        if (!pack) {
            throw new Error("Document has invalid pack");
        }
        //@ts-expect-error There has to be an easier way...
        const number = [...document.parent[document.collectionName].keys()].indexOf(document.id);
        return new EmbeddedCompendiumSearchItem(pack, {
            _id: document.id,
            parentName: document.parent.name || undefined,
            embeddedName: document.name,
            parentId: document.parent.id,
            type: "JournalEntryPage",
            tagline: `Pg. ${number} - ${pack?.metadata?.label || pack.title}`,
        });
    }
    // Get the drag data for drag operations
    get dragData() {
        return {
            // TODO: Use type from index
            type: "JournalEntryPage",
            uuid: this.uuid,
        };
    }
    get icon() {
        // TODO: Add table tor subtypes
        return `<i class="fa-duotone fa-book-open entity-icon"></i>`;
    }
    // Reference the entity in a journal, chat or other places that support it
    get journalLink() {
        return `@UUID[${this.uuid}]{${this.name}}`;
    }
    // Reference the entity in a script
    get script() {
        return `fromUuid("${this.uuid}")`; // TODO: note that this is async somehow?
    }
    // Short tagline that explains where/what this is
    get tagline() {
        return __classPrivateFieldGet(this, _EmbeddedCompendiumSearchItem_tagline, "f") || `${this.packageName}`;
    }
    get tooltip() {
        const type = i18n(DocumentMeta[this.documentType]?.label);
        //@ts-expect-error Update types!
        const page = i18n(CONFIG.JournalEntryPage.documentClass.metadata.label);
        return `${type} ${page}, ${__classPrivateFieldGet(this, _EmbeddedCompendiumSearchItem_tagline, "f")}`;
    }
    async show() {
        //@ts-expect-error This is good enough for now
        (await this.get())?._onClickDocumentLink({
            currentTarget: { dataset: {} },
        });
    }
    async get() {
        return (await fromUuid(this.uuid));
    }
}
_EmbeddedCompendiumSearchItem_tagline = new WeakMap();
function searchItemFromDocument(document) {
    if (document.parent) {
        if (document.compendium) {
            return EmbeddedCompendiumSearchItem.fromDocument(document);
        }
        return EmbeddedEntitySearchItem.fromDocument(document);
    }
    if (document.compendium) {
        return new CompendiumSearchItem(document.compendium, {
            _id: document.id,
            name: document.name,
            //@ts-ignore
            img: document.img,
        });
    }
    return EntitySearchItem.fromDocument(document);
}
function isEntity(item) {
    return item instanceof EntitySearchItem;
}
function isCompendiumEntity(item) {
    return item instanceof CompendiumSearchItem;
}
class FuseSearchIndex {
    constructor() {
        this.fuse = new Fuse([], {
            keys: ["name"],
            includeMatches: true,
            threshold: 0.3,
        });
    }
    addAll(items) {
        for (const item of items) {
            this.fuse.add(item);
        }
    }
    add(item) {
        this.fuse.add(item);
    }
    removeByUuid(uuid) {
        this.fuse.remove((i) => i?.uuid == uuid);
    }
    search(query) {
        return this.fuse.search(query).map((res) => ({
            item: res.item,
            match: res.matches,
        }));
    }
}
class SearchLib {
    constructor() {
        this.index = new FuseSearchIndex();
    }
    indexCompendium(compendium) {
        if (!compendium)
            return;
        if (packEnabled(compendium)) {
            const index = CompendiumSearchItem.fromCompendium(compendium);
            this.index.addAll(index);
        }
    }
    async indexCompendiums() {
        if (!game.packs)
            return;
        for await (const res of loadIndexes()) {
            if (res.error) {
                console.log("Quick Insert | Index loading failure", res);
                continue;
            }
            console.log("Quick Insert | Index loading success", res);
            this.indexCompendium(game.packs.get(res.pack));
        }
    }
    indexDocuments() {
        for (const type of enabledDocumentTypes()) {
            this.index.addAll(EntitySearchItem.fromEntities(getCollectionFromType(type).contents));
        }
    }
    addItem(item) {
        this.index.add(item);
    }
    removeItem(entityUuid) {
        this.index.removeByUuid(entityUuid);
    }
    replaceItem(item) {
        this.removeItem(item.uuid);
        this.addItem(item);
    }
    search(text, filter, max) {
        if (filter) {
            return this.index.search(text).filter(filter).slice(0, max);
        }
        return this.index.search(text).slice(0, max);
    }
}
function formatMatch(result, formatFn) {
    const match = result.match[0];
    if (!match.value)
        return "";
    let text = match.value;
    [...match.indices].reverse().forEach(([start, end]) => {
        // if (start === end) return;
        text =
            text.substring(0, start) +
                formatFn(text.substring(start, end + 1)) +
                text.substring(end + 1);
    });
    return text;
}
async function* loadIndexes() {
    if (!game.packs) {
        console.error("Can't load indexes before packs are initialized");
        return;
    }
    // Information about failures
    const failures = {};
    const timeout = getSetting(ModuleSetting.INDEX_TIMEOUT);
    const packsRemaining = [];
    for (const pack of game.packs) {
        if (packEnabled(pack)) {
            failures[pack.collection] = { errors: 0 };
            packsRemaining.push(pack);
        }
    }
    while (packsRemaining.length > 0) {
        const pack = packsRemaining.shift();
        if (!pack)
            break;
        let promise;
        try {
            let options;
            if (getSetting(ModuleSetting.EMBEDDED_INDEXING)) {
                if (pack.documentClass.documentName === "JournalEntry") {
                    options = { fields: ["pages.name", "pages._id"] };
                }
            }
            promise = failures[pack.collection].waiting ?? pack.getIndex(options);
            await withDeadline(promise, timeout * (failures[pack.collection].errors + 1));
        }
        catch (error) {
            ++failures[pack.collection].errors;
            if (error instanceof TimeoutError) {
                failures[pack.collection].waiting = promise;
            }
            else {
                delete failures[pack.collection].waiting;
            }
            yield {
                error: error,
                pack: pack.collection,
                packsLeft: packsRemaining.length,
                errorCount: failures[pack.collection].errors,
            };
            if (failures[pack.collection].errors <= 4) {
                // Pack failed, will be retried later.
                packsRemaining.push(pack);
            }
            else {
                console.warn(`Quick Insert | Package "${pack.collection}" could not be indexed `);
            }
            continue;
        }
        yield {
            pack: pack.collection,
            packsLeft: packsRemaining.length,
            errorCount: failures[pack.collection].errors,
        };
    }
}

function checkIndexed(document, embedded = false) {
    if (!document.visible)
        return false;
    // Check embedded state
    if ((embedded && !document.parent) || (!embedded && document.parent)) {
        return false;
    }
    // Check enabled types
    if (document.parent) {
        if (!enabledEmbeddedDocumentTypes().includes(document.documentName))
            return false;
    }
    else {
        if (!enabledDocumentTypes().includes(document.documentName))
            return false;
    }
    // Check disabled packs
    return !(document.pack && !packEnabled(document.compendium));
}
function setupDocumentHooks(quickInsert) {
    enabledDocumentTypes().forEach((type) => {
        Hooks.on(`create${type}`, (document) => {
            if (document.parent || !checkIndexed(document))
                return;
            quickInsert.searchLib?.addItem(searchItemFromDocument(document));
        });
        Hooks.on(`update${type}`, (document) => {
            if (document.parent)
                return;
            if (!checkIndexed(document)) {
                quickInsert.searchLib?.removeItem(document.uuid);
                return;
            }
            quickInsert.searchLib?.replaceItem(searchItemFromDocument(document));
        });
        Hooks.on(`delete${type}`, (document) => {
            if (document.parent || !checkIndexed(document))
                return;
            quickInsert.searchLib?.removeItem(document.uuid);
        });
    });
    enabledEmbeddedDocumentTypes().forEach((type) => {
        Hooks.on(`create${type}`, (document) => {
            if (!document.parent || !checkIndexed(document, true))
                return;
            const item = searchItemFromDocument(document);
            quickInsert.searchLib?.addItem(item);
        });
        Hooks.on(`update${type}`, (document) => {
            if (!document.parent)
                return;
            if (!checkIndexed(document, true)) {
                quickInsert.searchLib?.removeItem(document.uuid);
                return;
            }
            const item = searchItemFromDocument(document);
            quickInsert.searchLib?.replaceItem(item);
        });
        Hooks.on(`delete${type}`, (document) => {
            if (!document.parent || !checkIndexed(document, true))
                return;
            quickInsert.searchLib?.removeItem(document.uuid);
        });
    });
}

var FilterType;
(function (FilterType) {
    FilterType[FilterType["Default"] = 0] = "Default";
    FilterType[FilterType["World"] = 1] = "World";
    FilterType[FilterType["Client"] = 2] = "Client";
})(FilterType || (FilterType = {}));

var ContextMode;
(function (ContextMode) {
    ContextMode[ContextMode["Browse"] = 0] = "Browse";
    ContextMode[ContextMode["Insert"] = 1] = "Insert";
})(ContextMode || (ContextMode = {}));
class SearchContext {
    constructor() {
        this.mode = ContextMode.Insert;
        this.spawnCSS = {};
        this.allowMultiple = true;
    }
    onClose() {
        return;
    }
}
// Default browse context
class BrowseContext extends SearchContext {
    constructor() {
        super();
        this.mode = ContextMode.Browse;
        this.startText = document.getSelection()?.toString();
    }
    onSubmit(item) {
        // Render the sheet for selected item
        item.show();
    }
}
class InputContext extends SearchContext {
    constructor(input) {
        super();
        this.selectionStart = null;
        this.selectionEnd = null;
        this.input = input;
        const targetRect = input.getBoundingClientRect();
        const bodyRect = document.body.getBoundingClientRect();
        const top = targetRect.top - bodyRect.top;
        // TODO: Real calculation!!!
        this.spawnCSS = {
            left: targetRect.left + 5,
            bottom: bodyRect.height - top - 30,
            width: targetRect.width - 10,
        };
        this.selectionStart = input.selectionStart;
        this.selectionEnd = input.selectionEnd;
        if (this.selectionStart !== null && this.selectionEnd !== null) {
            if (this.selectionStart != this.selectionEnd) {
                this.startText = this.input.value.slice(this.selectionStart, this.selectionEnd);
            }
        }
        $(input).addClass("quick-insert-context");
    }
    insertResult(result) {
        if (this.selectionStart !== null && this.selectionEnd !== null) {
            this.input.value =
                this.input.value.slice(0, this.selectionStart) +
                    result +
                    this.input.value.slice(this.selectionEnd);
        }
        else {
            this.input.value = result;
        }
    }
    onSubmit(item) {
        if (typeof item == "string") {
            this.insertResult(item);
        }
        else {
            this.insertResult(item.journalLink);
        }
    }
    onClose() {
        $(this.input).removeClass("quick-insert-context");
        this.input.focus();
    }
}
class ScriptMacroContext extends InputContext {
    onSubmit(item) {
        if (typeof item == "string") {
            this.insertResult(`"${item}"`);
        }
        else {
            this.insertResult(item.script);
        }
    }
}
class RollTableContext extends InputContext {
    constructor(input) {
        super(input);
        this.allowMultiple = false;
        // Set filter depending on selected dropdown!
        // const resultRow = this.input.closest("li.table-result")
    }
    onSubmit(item) {
        if (typeof item == "string") {
            this.insertResult(item);
            return;
        }
        const row = $(this.input).closest(".table-result");
        const resultId = row.data("result-id");
        const appId = row.closest(".window-app").data("appid");
        const app = ui.windows[parseInt(appId)];
        if (isEntity(item)) {
            app.object.updateEmbeddedDocuments("TableResult", [
                {
                    _id: resultId,
                    collection: item.documentType,
                    type: 1,
                    resultId: item.id,
                    text: item.name,
                    img: item.img || null,
                },
            ]);
        }
        else if (isCompendiumEntity(item)) {
            app.object.updateEmbeddedDocuments("TableResult", [
                {
                    _id: resultId,
                    collection: item.package,
                    type: 2,
                    resultId: item.id,
                    text: item.name,
                    img: item.img || null,
                },
            ]);
        }
    }
}
class TinyMCEContext extends SearchContext {
    constructor(editor) {
        super();
        const targetRect = editor.selection.getBoundingClientRect();
        const bodyRect = document.body.getBoundingClientRect();
        const containerRect = editor.contentAreaContainer.getBoundingClientRect();
        const top = containerRect.top + targetRect.top;
        this.spawnCSS = {
            left: containerRect.left + targetRect.left,
            bottom: bodyRect.height - top - 20,
            width: targetRect.width,
            maxHeight: top + 20,
        };
        this.editor = editor;
        this.startText = editor.selection.getContent().trim();
    }
    onSubmit(item) {
        if (typeof item == "string") {
            this.editor.insertContent(item);
        }
        else {
            this.editor.insertContent(item.journalLink);
        }
    }
    onClose() {
        this.editor.focus();
    }
}
class ProseMirrorContext extends SearchContext {
    constructor(state, dispatch, view) {
        super();
        this.state = state;
        this.dispatch = dispatch;
        this.view = view;
        this.startText = document.getSelection()?.toString();
        const start = view.coordsAtPos(state.selection.from);
        const end = view.coordsAtPos(state.selection.to);
        const bodyRect = document.body.getBoundingClientRect();
        const bottom = bodyRect.height - start.top - 22;
        this.spawnCSS = {
            left: start.left,
            bottom,
            width: end.left - start.left,
            maxHeight: bodyRect.height - bottom,
        };
    }
    onSubmit(item) {
        const tr = this.state.tr;
        const text = typeof item == "string" ? item : item.journalLink;
        const textNode = this.state.schema.text(text);
        tr.replaceSelectionWith(textNode);
        this.dispatch(tr);
        this.view.focus();
    }
    onClose() {
        this.view.focus();
    }
}
class CharacterSheetContext extends SearchContext {
    constructor(documentSheet, anchor) {
        super();
        this.restrictTypes = [DocumentType.ITEM];
        this.documentSheet = documentSheet;
        this.anchor = anchor;
        const targetRect = anchor.get()[0].getBoundingClientRect();
        const bodyRect = document.body.getBoundingClientRect();
        const top = bodyRect.top + targetRect.top;
        this.spawnCSS = {
            left: targetRect.left - 280,
            bottom: bodyRect.height - top - 23,
            width: 300,
            maxHeight: top + 23,
        };
    }
    onSubmit(item) {
        if (typeof item == "string")
            return;
        //@ts-ignore
        return this.documentSheet._onDropItem({}, {
            type: item.documentType,
            uuid: item.uuid,
        });
    }
}
function identifyContext(target) {
    if (target && isTextInputElement(target)) {
        if (target.name === "command") {
            if (target
                .closest(".macro-sheet")
                ?.querySelector('select[name="type"]')?.value === "script") {
                return new ScriptMacroContext(target);
            }
            return new InputContext(target);
        }
        else if (target.name.startsWith("results.") &&
            target.closest(".result-details")) {
            return new RollTableContext(target);
        }
        // Right now, only allow in chat!
        if (target.id === "chat-message") {
            return new InputContext(target);
        }
    }
    // No/unknown context, browse only.
    if (getSetting(ModuleSetting.ENABLE_GLOBAL_CONTEXT) === true) {
        return new BrowseContext();
    }
    return null;
}
class EmbeddedContext extends BrowseContext {
    constructor() {
        super(...arguments);
        this.spawnCSS = {
            top: "unset",
            left: "0",
            bottom: "0",
            "max-height": "100%",
            width: "100%",
            "box-shadow": "none",
        };
    }
    onSubmit() {
        return;
    }
}

class SearchFilterCollection {
    constructor() {
        this.disabled = [];
        this.dirty = true;
        this.defaultFilters = [];
        this.clientFilters = [];
        this.worldFilters = [];
        this.combinedFilters = [];
    }
    get filters() {
        if (this.dirty) {
            this.combinedFilters = [
                ...this.defaultFilters,
                ...this.worldFilters,
                ...this.clientFilters,
            ];
            this.combinedFilters.forEach((f) => (f.disabled = this.disabled.includes(f.id)));
            this.dirty = false;
        }
        return this.combinedFilters;
    }
    // Someone changed the filters, will be saved etc.
    filtersChanged(which) {
        if (which === FilterType.Client) {
            this.saveClient();
        }
        else if (which === FilterType.World) {
            this.saveWorld();
        }
        else {
            this.save();
        }
    }
    search(query) {
        if (!query) {
            return [...this.filters];
        }
        return this.filters.filter((f) => f.tag.includes(query));
    }
    getFilter(id) {
        return this.filters.find((f) => f.id == id);
    }
    getFilterByTag(tag) {
        return this.filters.filter((f) => !f.disabled).find((f) => f.tag == tag);
    }
    addFilter(filter) {
        if (filter.type == FilterType.World) {
            this.worldFilters.push(filter);
            this.filtersChanged(filter.type);
        }
        else if (filter.type == FilterType.Client) {
            this.clientFilters.push(filter);
            this.filtersChanged(filter.type);
        }
    }
    deleteFilter(id) {
        const f = this.filters.find((f) => f.id === id);
        if (!f)
            return;
        if (f.type == FilterType.World) {
            const x = this.worldFilters.findIndex((f) => f.id === id);
            if (x != -1) {
                this.worldFilters.splice(x, 1);
            }
        }
        else if (f.type == FilterType.Client) {
            const x = this.clientFilters.findIndex((f) => f.id === id);
            if (x != -1) {
                this.clientFilters.splice(x, 1);
            }
        }
        this.filtersChanged(f.type);
    }
    resetFilters() {
        this.defaultFilters = [];
        this.clientFilters = [];
        this.worldFilters = [];
        this.combinedFilters = [];
        this.dirty = false;
    }
    loadDefaultFilters() {
        this.loadCompendiumFilters();
        // this.loadDirectoryFilters();
        this.loadEntityFilters();
        this.dirty = true;
    }
    loadEntityFilters() {
        this.defaultFilters = this.defaultFilters.concat(enabledDocumentTypes().map((type) => {
            const metadata = DocumentMeta[type];
            return {
                id: metadata.collection,
                type: FilterType.Default,
                tag: metadata.collection,
                subTitle: `${game.i18n.localize(metadata.label)}`,
                filterConfig: {
                    folders: "any",
                    compendiums: "any",
                    entities: [metadata.name],
                },
            };
        }));
    }
    loadDirectoryFilters() {
        // TODO: find a way to find directories that the user is allowed to see
        if (!game.user?.isGM)
            return;
        this.defaultFilters = this.defaultFilters.concat(enabledDocumentTypes().map((type) => {
            const metadata = DocumentMeta[type];
            return {
                id: `dir.${metadata.collection}`,
                type: FilterType.Default,
                tag: `dir.${metadata.collection}`,
                subTitle: getCollectionFromType(type).directory?.title,
                filterConfig: {
                    folders: "any",
                    compendiums: [],
                    entities: [metadata.name],
                },
            };
        }));
    }
    loadCompendiumFilters() {
        if (!game.packs)
            return;
        this.defaultFilters = this.defaultFilters.concat(game.packs.filter(packEnabled).map((pack) => {
            return {
                id: pack.collection,
                type: FilterType.Default,
                tag: pack.collection,
                subTitle: pack.metadata.label,
                filterConfig: {
                    folders: [],
                    compendiums: [pack.collection],
                    entities: "any",
                },
            };
        }));
    }
    loadClientSave() {
        const clientSave = getSetting(ModuleSetting.FILTERS_CLIENT);
        this.disabled = clientSave.disabled || [];
        this.clientFilters = clientSave.filters || [];
        this.dirty = true;
    }
    loadWorldSave() {
        const worldSave = getSetting(ModuleSetting.FILTERS_WORLD);
        this.worldFilters = worldSave.filters || [];
        this.dirty = true;
    }
    loadSave() {
        this.loadClientSave();
        this.loadWorldSave();
        Hooks.call("QuickInsert:FiltersUpdated");
    }
    saveWorld() {
        if (!game.user?.isGM)
            return;
        const worldSave = {
            filters: [],
        };
        for (const filter of this.worldFilters) {
            delete filter.disabled;
            worldSave.filters.push(filter);
        }
        setSetting(ModuleSetting.FILTERS_WORLD, worldSave);
    }
    saveClient() {
        const clientSave = {
            disabled: [],
            filters: [],
        };
        for (const filter of [
            ...this.defaultFilters,
            ...this.worldFilters,
            ...this.clientFilters,
        ]) {
            if (filter.disabled) {
                clientSave.disabled.push(filter.id);
            }
            if (filter.type === FilterType.Client) {
                clientSave.filters.push(filter);
            }
        }
        setSetting(ModuleSetting.FILTERS_CLIENT, clientSave);
    }
    save() {
        this.saveClient();
        this.saveWorld();
    }
}
// Is parentFolder inside targetFolder?
function isInFolder(parentFolder, targetFolder) {
    while (parentFolder) {
        if (parentFolder === targetFolder)
            return true;
        //@ts-expect-error "parent" migrated to "folder"
        parentFolder = game.folders?.get(parentFolder)?.folder;
    }
    return false;
}
function matchFilterConfig(config, item) {
    let folderMatch = false;
    let compendiumMatch = false;
    let entityMatch = true;
    if (isEntity(item.item)) {
        if (config.folders === "any") {
            folderMatch = true;
        }
        else {
            for (const f of config.folders) {
                if (isInFolder(item.item.folder?.id, f)) {
                    folderMatch = true;
                    break;
                }
            }
        }
    }
    else if (isCompendiumEntity(item.item)) {
        if (config.compendiums == "any") {
            compendiumMatch = true;
        }
        else {
            compendiumMatch = config.compendiums.includes(item.item.package);
        }
    }
    if (config.entities == "any") {
        entityMatch = true;
    }
    else {
        entityMatch = config.entities.includes(item.item.documentType);
    }
    return (folderMatch || compendiumMatch) && entityMatch;
}

// Module singleton class that contains everything
class QuickInsertCore {
    constructor() {
        this.filters = new SearchFilterCollection();
    }
    get hasIndex() {
        return Boolean(this.searchLib?.index);
    }
    /**
     * Incorrect to match like this with new keybinds!
     * @deprecated
     */
    matchBoundKeyEvent() {
        return false;
    }
    // If the global key binds are not enough - e.g. in a custom editor,
    // include the custom search context!
    handleKeybind(evt, context) {
        if (!context)
            throw new Error("A custom context is required!");
        customKeybindHandler(evt, context);
    }
    open(context) {
        this.app?.render(true, { context });
    }
    toggle(context) {
        if (this.app?.open) {
            this.app.closeDialog();
        }
        else {
            this.open(context);
        }
    }
    search(text, filter = null, max = 100) {
        return this.searchLib?.search(text, filter, max) || [];
    }
    async forceIndex() {
        return loadSearchIndex();
    }
}
const QuickInsert = new QuickInsertCore();
// Ensure that only one loadSearchIndex function is running at any one time.
let isLoading = false;
async function loadSearchIndex() {
    if (isLoading)
        return;
    isLoading = true;
    console.log("Quick Insert | Preparing search index...");
    const start = performance.now();
    QuickInsert.searchLib = new SearchLib();
    QuickInsert.searchLib.indexDocuments();
    QuickInsert.filters.resetFilters();
    QuickInsert.filters.loadDefaultFilters();
    QuickInsert.filters.loadSave();
    console.log(`Quick Insert | Indexing compendiums with timeout set to ${getSetting(ModuleSetting.INDEX_TIMEOUT)}ms`);
    await QuickInsert.searchLib.indexCompendiums();
    console.log(`Quick Insert | Search index and filters completed. Indexed ${
    // @ts-ignore
    QuickInsert.searchLib?.index?.fuse._docs.length || 0} items in ${performance.now() - start}ms`);
    isLoading = false;
    Hooks.callAll("QuickInsert:IndexCompleted", QuickInsert);
}

function parseFilterConfig(collections) {
    const filters = {
        folders: [],
        compendiums: [],
        entities: [],
    };
    for (const coll of collections) {
        const x = coll.indexOf(".");
        const base = coll.slice(0, x);
        const rest = coll.slice(x + 1);
        if (base === "Folder") {
            if (rest === "Any") {
                filters.folders = "any";
            }
            else if (!(typeof filters.folders === "string")) {
                filters.folders.push(rest);
            }
        }
        else if (base === "Compendium") {
            if (rest === "Any") {
                filters.compendiums = "any";
            }
            else if (!(typeof filters.compendiums === "string")) {
                filters.compendiums.push(rest);
            }
        }
        else if (base === "Document" || base === "Entity") {
            if (rest === "Any") {
                filters.entities = "any";
            }
            else if (!(typeof filters.entities === "string")) {
                filters.entities.push(rest);
            }
        }
    }
    return filters;
}
class FilterEditor extends Application {
    constructor(filter) {
        super({
            title: i18n("FilterEditorTitle"),
            classes: ["filter-editor"],
            template: "modules/quick-insert/templates/filter-editor.hbs",
            resizable: true,
            width: 550,
            height: 560,
            scrollY: [
                ".collection-list.compendium-list",
                ".collection-list.directory-list",
                ".collection-list.entity-list",
            ],
        });
        this.searchInput = "";
        this.filter = filter;
        this.idPrefix = new RegExp(`^${this.filter.id}_`);
    }
    get element() {
        return super.element;
    }
    prefix(name) {
        return `${this.filter.id}_${name}`;
    }
    unPrefix(name) {
        return name.replace(this.idPrefix, "");
    }
    render(force, options) {
        return super.render(force, options);
    }
    isEditable() {
        return Boolean(this.filter.type == FilterType.Client ||
            (this.filter.type == FilterType.World && game.user?.isGM));
    }
    fixAny(type, form, formData) {
        form
            .find(`input[name^="${this.filter.id}_${type}."].disabled`)
            .removeClass("disabled");
        const selectedAny = formData.find((r) => r.name.endsWith(".Any"));
        if (selectedAny) {
            const other = form.find(`input[name^="${this.filter.id}_${type}."]:not(input[name="${this.filter.id}_${selectedAny.name}"])`);
            other.prop("checked", false);
            other.addClass("disabled");
        }
    }
    close() {
        if (this.element.find(".quick-insert").length > 0 && QuickInsert.app) {
            QuickInsert.app.embeddedMode = false;
            QuickInsert.app.closeDialog();
        }
        return super.close();
    }
    processForm() {
        const form = this.element.find("form");
        let formData = form.serializeArray();
        formData.forEach((d) => {
            d.name = this.unPrefix(d.name);
        });
        const name = formData.find((p) => p.name == "name")?.value.trim();
        const title = formData.find((p) => p.name == "title")?.value;
        formData = formData.filter((p) => p.name != "name" && p.name != "title");
        const compendiums = formData.filter((r) => r.name.startsWith("Compendium."));
        const folders = formData.filter((r) => r.name.startsWith("Folder."));
        const entity = formData.filter((r) => r.name.startsWith("Document."));
        this.fixAny("Compendium", form, compendiums);
        this.fixAny("Folder", form, folders);
        this.fixAny("Document", form, entity);
        return {
            name,
            title,
            formData,
        };
    }
    formChange() {
        if (!this.isEditable())
            return;
        const { name, title, formData } = this.processForm();
        const config = parseFilterConfig(formData.map((x) => x.name));
        const oldTag = this.filter.tag;
        if (name != "") {
            this.filter.tag = name;
        }
        this.filter.subTitle = title;
        this.filter.filterConfig = config;
        // Hacky way to keep/update state of input
        this.searchInput =
            QuickInsert.app?.input?.text().replace(`@${oldTag}`, "").trim() || "";
        QuickInsert.filters.filtersChanged(this.filter.type);
    }
    attachQuickInsert() {
        const context = new EmbeddedContext();
        context.filter = this.filter;
        context.startText = this.searchInput;
        if (!QuickInsert.app)
            return;
        if (QuickInsert.app.embeddedMode) {
            this.element.find(".example-out").append(QuickInsert.app.element);
        }
        else {
            Hooks.once(`render${QuickInsert.app?.constructor.name}`, (app) => {
                this.element.find(".example-out").append(app.element);
            });
        }
        QuickInsert.app.embeddedMode = true;
        QuickInsert.app.render(true, { context });
    }
    activateListeners() {
        this.attachQuickInsert();
        const form = this.element.find("form");
        form.on("change", () => {
            this.formChange();
        });
        this.processForm();
        if (this.filter.type == FilterType.Default ||
            (this.filter.type == FilterType.World && !game.user?.isGM)) {
            this.element.find("input").prop("disabled", true);
        }
        this.element.find(".open-here").on("click", (evt) => {
            evt.preventDefault();
            this.attachQuickInsert();
        });
    }
    getData() {
        let folders = [];
        if (!game.packs)
            return {};
        if (game.user?.isGM) {
            folders =
                game.folders?.map((folder) => ({
                    label: folder.name,
                    name: this.prefix(`Folder.${folder.id}`),
                    selected: this.filter.filterConfig?.folders.includes(folder.id),
                })) || [];
        }
        return {
            tag: this.filter.tag,
            subTitle: this.filter.subTitle,
            isDefault: this.filter.type === FilterType.Default,
            forbiddenWorld: this.filter.type == FilterType.World && !game.user?.isGM,
            collections: [
                {
                    name: this.prefix("Compendium.Any"),
                    label: i18n("FilterEditorCompendiumAny"),
                    selected: this.filter.filterConfig?.compendiums === "any",
                },
                ...game.packs
                    .filter((pack) => packEnabled(pack))
                    .map((pack) => ({
                    name: this.prefix(`Compendium.${pack.collection}`),
                    label: `${pack.metadata.label} - ${pack.collection}`,
                    selected: this.filter.filterConfig?.compendiums.includes(pack.collection),
                })),
            ],
            documentTypes: [
                {
                    name: this.prefix("Document.Any"),
                    label: i18n("FilterEditorEntityAny"),
                    selected: this.filter.filterConfig?.entities === "any",
                },
                ...enabledDocumentTypes().map((type) => ({
                    name: this.prefix(`Document.${type}`),
                    label: game.i18n.localize(`DOCUMENT.${type}`),
                    selected: this.filter.filterConfig?.entities.includes(type),
                })),
            ],
            folders: [
                {
                    name: this.prefix("Folder.Any"),
                    label: i18n("FilterEditorFolderAny"),
                    selected: this.filter.filterConfig?.folders === "any",
                },
                ...folders,
            ],
        };
    }
}

const typeIcons = {
    [FilterType.Default]: `<i class="fas fa-lock" title="Default filter"></i>`,
    [FilterType.World]: `<i class="fas fa-globe" title="World filter"></i>`,
    [FilterType.Client]: `<i class="fas fa-user" title="Client filter"></i>`,
};
function cloneFilterConfig(original) {
    const res = {
        compendiums: "any",
        folders: "any",
        entities: "any",
    };
    if (typeof original.compendiums !== "string") {
        res.compendiums = [...original.compendiums];
    }
    if (typeof original.folders !== "string") {
        res.folders = [...original.folders];
    }
    if (typeof original.entities !== "string") {
        res.entities = [...original.entities];
    }
    return res;
}
class FilterList extends FormApplication {
    constructor() {
        super(...arguments);
        this.filterEditors = {};
        this.onFiltersUpdated = () => {
            this.render(true);
            Object.entries(this.filterEditors).forEach(([id, editor]) => {
                const filter = QuickInsert.filters.getFilter(id);
                if (filter)
                    editor.filter = filter;
                editor.rendered && editor.render(true);
            });
        };
    }
    static get defaultOptions() {
        return {
            ...super.defaultOptions,
            title: i18n("FilterListTitle"),
            id: "filter-list",
            template: "modules/quick-insert/templates/filter-list.hbs",
            resizable: true,
            height: 500,
            width: 350,
            scrollY: [".table-container"],
        };
    }
    getData() {
        return {
            filters: [
                ...QuickInsert.filters.filters.map((filter) => ({
                    id: filter.id,
                    icon: typeIcons[filter.type],
                    tag: filter.tag,
                    subTitle: filter.subTitle,
                    disabled: filter.disabled,
                    deletable: filter.type == FilterType.Client ||
                        (filter.type == FilterType.World && game.user?.isGM),
                })),
            ],
        };
    }
    render(force, options) {
        if (this._state <= 0) {
            Hooks.on("QuickInsert:FiltersUpdated", this.onFiltersUpdated);
        }
        return super.render(force, options);
    }
    close() {
        Hooks.off("QuickInsert:FiltersUpdated", this.onFiltersUpdated);
        return super.close();
    }
    activateListeners() {
        this.element.find(".create-filter").on("click", () => {
            this.newFilter();
        });
        this.element.find("i.delete").on("click", (evt) => {
            const id = evt.target.closest("tr")?.dataset["id"];
            if (id)
                QuickInsert.filters.deleteFilter(id);
        });
        this.element.find("i.edit").on("click", (evt) => {
            const id = evt.target.closest("tr")?.dataset["id"];
            if (id)
                this.editFilter(id);
        });
        this.element.find("i.duplicate").on("click", (evt) => {
            const id = evt.target.closest("tr")?.dataset["id"];
            this.newFilter(QuickInsert.filters.filters.find((f) => f.id === id));
        });
        this.element.find("i.enable").on("click", (evt) => {
            const id = evt.target.closest("tr")?.dataset["id"];
            const filter = QuickInsert.filters.filters.find((f) => f.id === id);
            if (filter)
                filter.disabled = false;
            QuickInsert.filters.filtersChanged(FilterType.Client);
        });
        this.element.find("i.disable").on("click", (evt) => {
            const id = evt.target.closest("tr")?.dataset["id"];
            const filter = QuickInsert.filters.filters.find((f) => f.id === id);
            if (filter)
                filter.disabled = true;
            QuickInsert.filters.filtersChanged(FilterType.Client);
        });
    }
    editFilter(id) {
        if (!this.filterEditors[id]) {
            const filter = QuickInsert.filters.filters.find((f) => f.id === id);
            if (filter)
                this.filterEditors[id] = new FilterEditor(filter);
        }
        this.filterEditors[id].render(true);
    }
    newFilter(original) {
        const scope = `
  <p>
    <label>${i18n("FilterListFilterScope")}</label>
    <select>
      <option value="world">${i18n("FilterListFilterScopeWorld")}</option>
      <option value="client">${i18n("FilterListFilterScopeClient")}</option>
    </select>
  </p>`;
        const newDialog = new Dialog({
            title: original
                ? i18n("FilterListDuplicateFilterTitle", { original: original.tag })
                : i18n("FilterListNewFilterTitle"),
            content: `
        <div class="new-filter-name">
          @<input type="text" name="name" id="name" value="" placeholder="${i18n("FilterListFilterTagPlaceholder")}" pattern="[A-Za-z0-9\\._-]+" minlength="1">
        </div>
        ${game.user?.isGM ? scope : ""}
      `,
            buttons: {
                apply: {
                    icon: "<i class='fas fa-plus'></i>",
                    label: i18n("FilterListCreateFilter"),
                    callback: async (html) => {
                        if (!("find" in html))
                            return;
                        const input = html.find("input");
                        const val = html.find("input").val();
                        const selected = html.find("select").val();
                        if (input.get(0)?.checkValidity() && val !== "") {
                            this.createFilter(val, selected === "world" ? FilterType.World : FilterType.Client, original);
                        }
                        else {
                            ui.notifications?.error(`Incorrect filter tag: "${val}"`);
                        }
                    },
                },
            },
            default: "apply",
            close: () => {
                return;
            },
        });
        newDialog.render(true);
    }
    createFilter(tag, scope, original) {
        const newId = randomId(30);
        if (original) {
            QuickInsert.filters.addFilter({
                id: newId,
                type: scope,
                tag,
                subTitle: `${original.subTitle} (Copy)`,
                filterConfig: original.filterConfig && cloneFilterConfig(original.filterConfig),
            });
            return;
        }
        else {
            QuickInsert.filters.addFilter({
                id: newId,
                type: scope,
                tag,
                subTitle: tag,
                filterConfig: {
                    compendiums: [],
                    folders: [],
                    entities: "any",
                },
            });
        }
        if (scope == FilterType.Client) {
            this.editFilter(newId);
        }
        else {
            Hooks.once("QuickInsert:FiltersUpdated", () => this.editFilter(newId));
        }
    }
    async _updateObject() {
        return;
    }
}

class SheetFilters extends FormApplication {
    get element() {
        return super.element;
    }
    static get defaultOptions() {
        return {
            ...super.defaultOptions,
            title: i18n("SheetFiltersTitle"),
            id: "sheet-filters",
            template: "modules/quick-insert/templates/sheet-filters.hbs",
            resizable: true,
        };
    }
    getData() {
        const filters = QuickInsert.filters.filters;
        const customFilters = getSetting(ModuleSetting.FILTERS_SHEETS).baseFilters;
        return {
            filters: Object.entries(customFilters).map(([key, filter]) => ({
                key,
                noFilter: filter === "",
                options: filters.map((f) => ({
                    ...f,
                    selected: filter === f.tag || filter === f.id,
                })),
            })),
        };
    }
    activateListeners(html) {
        super.activateListeners(html);
    }
    async _updateObject(event, formData) {
        setSetting(ModuleSetting.FILTERS_SHEETS, {
            baseFilters: formData,
        });
    }
}

async function importSystemIntegration() {
    let system = null;
    switch (game.system.id) {
        case "dnd5e":
            system = await import('./dnd5e.js');
            break;
        case "pf2e":
            system = await import('./pf2e.js');
            break;
        case "swade":
            system = await import('./swade.js');
            break;
        case "wfrp4e":
            system = await import('./wfrp4e.js');
            break;
        case "sfrpg":
            system = await import('./sfrpg.js');
            break;
        case "demonlord":
            system = await import('./demonlord.js');
            break;
        default:
            return;
    }
    return {
        id: game.system.id,
        ...system,
    };
}

function registerTinyMCEPlugin() {
    // TinyMCE addon registration
    tinymce.PluginManager.add("quickinsert", function (editor) {
        editor.on("keydown", (evt) => {
            const context = new TinyMCEContext(editor);
            customKeybindHandler(evt, context);
        });
        editor.ui.registry.addButton("quickinsert", {
            tooltip: "Quick Insert",
            icon: "search",
            onAction: function () {
                if (QuickInsert.app?.embeddedMode)
                    return;
                // Open window
                QuickInsert.open(new TinyMCEContext(editor));
            },
        });
    });
    CONFIG.TinyMCE.plugins = CONFIG.TinyMCE.plugins + " quickinsert";
    CONFIG.TinyMCE.toolbar = CONFIG.TinyMCE.toolbar + " quickinsert";
}

const DOCUMENTACTIONS = {
    show: (item) => item.show(),
    roll: (item) => item.get().then((d) => d.draw()),
    viewScene: (item) => item.get().then((d) => d.view()),
    activateScene: (item) => item.get().then((d) => {
        game.user?.isGM && d.activate();
    }),
    execute: (item) => item.get().then((d) => d.execute()),
    insert: (item) => item,
    rollInsert: (item) => item.get().then(async (d) => {
        const roll = await d.roll();
        for (const data of roll.results) {
            if (!data.documentId) {
                return data.text;
            }
            if (data.documentCollection.includes(".")) {
                const pack = game.packs.get(data.documentCollection);
                if (!pack)
                    return data.text;
                const indexItem = game.packs
                    .get(data.documentCollection)
                    ?.index.find((i) => i._id === data.documentId);
                return indexItem
                    ? new CompendiumSearchItem(pack, indexItem)
                    : data.text;
            }
            else {
                const entity = getCollectionFromType(data.documentCollection).get(data.documentId);
                return entity ? new EntitySearchItem(entity) : data.text;
            }
        }
    }),
};
const BrowseDocumentActions = (() => {
    const actions = {
        [DocumentType.SCENE]: [
            {
                id: "activateScene",
                icon: "fas fa-bullseye",
                title: "Activate",
            },
            {
                id: "viewScene",
                icon: "fas fa-eye",
                title: "View",
            },
            {
                id: "show",
                icon: "fas fa-cogs",
                title: "Configure",
            },
        ],
        [DocumentType.ROLLTABLE]: [
            {
                id: "roll",
                icon: "fas fa-dice-d20",
                title: "Roll",
            },
            {
                id: "show",
                icon: `fas ${documentIcons[DocumentType.ROLLTABLE]}`,
                title: "Edit",
            },
        ],
        [DocumentType.MACRO]: [
            {
                id: "execute",
                icon: "fas fa-play",
                title: "Execute",
            },
            {
                id: "show",
                icon: `fas ${documentIcons[DocumentType.ROLLTABLE]}`,
                title: "Edit",
            },
        ],
    };
    IndexedDocumentTypes.forEach((type) => {
        if (type in actions)
            return;
        actions[type] = [
            {
                id: "show",
                icon: `fas ${documentIcons[type]}`,
                title: "Show",
            },
        ];
    });
    return actions;
})();
// Same for all inserts
const insertAction = {
    id: "insert",
    icon: `fas fa-plus`,
    title: "Insert",
};
const InsertDocumentActions = (() => {
    const actions = {
        [DocumentType.SCENE]: [
            {
                id: "show",
                icon: "fas fa-cogs",
                title: "Configure",
            },
        ],
        [DocumentType.ROLLTABLE]: [
            {
                id: "rollInsert",
                icon: "fas fa-play",
                title: "Roll and Insert",
            },
            {
                id: "show",
                icon: `fas ${documentIcons[DocumentType.ROLLTABLE]}`,
                title: "Show",
            },
        ],
    };
    // Add others
    IndexedDocumentTypes.forEach((type) => {
        if (!actions[type]) {
            // If nothing else, add "Show"
            actions[type] = [
                {
                    id: "show",
                    icon: `fas ${documentIcons[type]}`,
                    title: "Show",
                },
            ];
        }
        actions[type].push(insertAction);
    });
    return actions;
})();
function getActions(type, isInsertContext) {
    return isInsertContext
        ? InsertDocumentActions[type]
        : BrowseDocumentActions[type];
}
function defaultAction(type, isInsertContext) {
    if (!isInsertContext) {
        switch (type) {
            case DocumentType.SCENE:
                return getSetting(ModuleSetting.DEFAULT_ACTION_SCENE);
            case DocumentType.ROLLTABLE:
                return getSetting(ModuleSetting.DEFAULT_ACTION_ROLL_TABLE);
            case DocumentType.MACRO:
                return getSetting(ModuleSetting.DEFAULT_ACTION_MACRO);
        }
    }
    const actions = getActions(type, isInsertContext);
    return actions[actions.length - 1].id;
}

/* src/app/SearchResults.svelte generated by Svelte v3.49.0 */

function get_each_context$1(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[13] = list[i].item;
	child_ctx[14] = list[i].match;
	child_ctx[15] = list[i].actions;
	child_ctx[16] = list[i].defaultAction;
	child_ctx[18] = i;
	return child_ctx;
}

function get_each_context_1(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[19] = list[i];
	return child_ctx;
}

// (52:0) {#if active}
function create_if_block$1(ctx) {
	let ul;
	let each_blocks = [];
	let each_1_lookup = new Map();
	let each_value = /*results*/ ctx[2];
	const get_key = ctx => /*item*/ ctx[13].uuid;

	for (let i = 0; i < each_value.length; i += 1) {
		let child_ctx = get_each_context$1(ctx, each_value, i);
		let key = get_key(child_ctx);
		each_1_lookup.set(key, each_blocks[i] = create_each_block$1(key, child_ctx));
	}

	return {
		c() {
			ul = element("ul");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			attr(ul, "class", "quick-insert-result");
			attr(ul, "data-tooltip-direction", /*tooltips*/ ctx[0]);
		},
		m(target, anchor) {
			insert(target, ul, anchor);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].m(ul, null);
			}

			/*ul_binding*/ ctx[11](ul);
		},
		p(ctx, dirty) {
			if (dirty & /*getTooltip, results, tooltips, selectedIndex, JSON, callAction, selectedAction, formatMatch*/ 221) {
				each_value = /*results*/ ctx[2];
				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, ul, destroy_block, create_each_block$1, null, get_each_context$1);
			}

			if (dirty & /*tooltips*/ 1) {
				attr(ul, "data-tooltip-direction", /*tooltips*/ ctx[0]);
			}
		},
		d(detaching) {
			if (detaching) detach(ul);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].d();
			}

			/*ul_binding*/ ctx[11](null);
		}
	};
}

// (77:10) {:else}
function create_else_block(ctx) {
	let html_tag;
	let raw_value = /*item*/ ctx[13].icon + "";
	let html_anchor;

	return {
		c() {
			html_tag = new HtmlTag(false);
			html_anchor = empty();
			html_tag.a = html_anchor;
		},
		m(target, anchor) {
			html_tag.m(raw_value, target, anchor);
			insert(target, html_anchor, anchor);
		},
		p(ctx, dirty) {
			if (dirty & /*results*/ 4 && raw_value !== (raw_value = /*item*/ ctx[13].icon + "")) html_tag.p(raw_value);
		},
		d(detaching) {
			if (detaching) detach(html_anchor);
			if (detaching) html_tag.d();
		}
	};
}

// (75:10) {#if item.img}
function create_if_block_1(ctx) {
	let img;
	let img_src_value;

	return {
		c() {
			img = element("img");
			if (!src_url_equal(img.src, img_src_value = /*item*/ ctx[13].img)) attr(img, "src", img_src_value);
		},
		m(target, anchor) {
			insert(target, img, anchor);
		},
		p(ctx, dirty) {
			if (dirty & /*results*/ 4 && !src_url_equal(img.src, img_src_value = /*item*/ ctx[13].img)) {
				attr(img, "src", img_src_value);
			}
		},
		d(detaching) {
			if (detaching) detach(img);
		}
	};
}

// (88:12) {#each actions as action}
function create_each_block_1(ctx) {
	let i;
	let i_class_value;
	let i_title_value;
	let i_data_action_id_value;
	let mounted;
	let dispose;

	function click_handler(...args) {
		return /*click_handler*/ ctx[8](/*action*/ ctx[19], /*item*/ ctx[13], ...args);
	}

	return {
		c() {
			i = element("i");
			attr(i, "class", i_class_value = "" + (/*action*/ ctx[19].icon + " action-icon"));
			attr(i, "title", i_title_value = "" + (/*action*/ ctx[19].title + " '" + /*item*/ ctx[13].name + "'"));
			attr(i, "data-action-id", i_data_action_id_value = /*action*/ ctx[19].id);

			toggle_class(i, "selected", /*i*/ ctx[18] === /*selectedIndex*/ ctx[3] && (/*selectedAction*/ ctx[4]
			? /*action*/ ctx[19].id === /*selectedAction*/ ctx[4]
			: /*action*/ ctx[19].id == /*defaultAction*/ ctx[16]));
		},
		m(target, anchor) {
			insert(target, i, anchor);

			if (!mounted) {
				dispose = listen(i, "click", stop_propagation(click_handler));
				mounted = true;
			}
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;

			if (dirty & /*results*/ 4 && i_class_value !== (i_class_value = "" + (/*action*/ ctx[19].icon + " action-icon"))) {
				attr(i, "class", i_class_value);
			}

			if (dirty & /*results*/ 4 && i_title_value !== (i_title_value = "" + (/*action*/ ctx[19].title + " '" + /*item*/ ctx[13].name + "'"))) {
				attr(i, "title", i_title_value);
			}

			if (dirty & /*results*/ 4 && i_data_action_id_value !== (i_data_action_id_value = /*action*/ ctx[19].id)) {
				attr(i, "data-action-id", i_data_action_id_value);
			}

			if (dirty & /*results, results, selectedIndex, selectedAction*/ 28) {
				toggle_class(i, "selected", /*i*/ ctx[18] === /*selectedIndex*/ ctx[3] && (/*selectedAction*/ ctx[4]
				? /*action*/ ctx[19].id === /*selectedAction*/ ctx[4]
				: /*action*/ ctx[19].id == /*defaultAction*/ ctx[16]));
			}
		},
		d(detaching) {
			if (detaching) detach(i);
			mounted = false;
			dispose();
		}
	};
}

// (58:4) {#each results as { item, match, actions, defaultAction }
function create_each_block$1(key_1, ctx) {
	let li;
	let a;
	let t0;
	let span0;

	let raw_value = formatMatch(
		{
			item: /*item*/ ctx[13],
			match: /*match*/ ctx[14]
		},
		func
	) + "";

	let t1;
	let span1;
	let t2_value = /*item*/ ctx[13].tagline + "";
	let t2;
	let t3;
	let span2;
	let a_title_value;
	let t4;
	let li_data_tooltip_value;
	let mounted;
	let dispose;

	function select_block_type(ctx, dirty) {
		if (/*item*/ ctx[13].img) return create_if_block_1;
		return create_else_block;
	}

	let current_block_type = select_block_type(ctx);
	let if_block = current_block_type(ctx);
	let each_value_1 = /*actions*/ ctx[15];
	let each_blocks = [];

	for (let i = 0; i < each_value_1.length; i += 1) {
		each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
	}

	function dragstart_handler(...args) {
		return /*dragstart_handler*/ ctx[9](/*item*/ ctx[13], ...args);
	}

	function click_handler_1(...args) {
		return /*click_handler_1*/ ctx[10](/*defaultAction*/ ctx[16], /*item*/ ctx[13], ...args);
	}

	return {
		key: key_1,
		first: null,
		c() {
			li = element("li");
			a = element("a");
			if_block.c();
			t0 = space();
			span0 = element("span");
			t1 = space();
			span1 = element("span");
			t2 = text(t2_value);
			t3 = space();
			span2 = element("span");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			t4 = space();
			attr(span0, "class", "title");
			attr(span1, "class", "sub");
			attr(span2, "class", "action-icons");
			attr(a, "draggable", "true");
			attr(a, "title", a_title_value = "" + (/*item*/ ctx[13].name + ", " + /*item*/ ctx[13].tagline));
			attr(li, "data-tooltip", li_data_tooltip_value = /*getTooltip*/ ctx[7](/*item*/ ctx[13], /*tooltips*/ ctx[0]));
			toggle_class(li, "search-selected", /*i*/ ctx[18] === /*selectedIndex*/ ctx[3]);
			this.first = li;
		},
		m(target, anchor) {
			insert(target, li, anchor);
			append(li, a);
			if_block.m(a, null);
			append(a, t0);
			append(a, span0);
			span0.innerHTML = raw_value;
			append(a, t1);
			append(a, span1);
			append(span1, t2);
			append(a, t3);
			append(a, span2);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].m(span2, null);
			}

			append(li, t4);

			if (!mounted) {
				dispose = [
					listen(a, "dragstart", dragstart_handler),
					listen(a, "click", stop_propagation(click_handler_1))
				];

				mounted = true;
			}
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;

			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
				if_block.p(ctx, dirty);
			} else {
				if_block.d(1);
				if_block = current_block_type(ctx);

				if (if_block) {
					if_block.c();
					if_block.m(a, t0);
				}
			}

			if (dirty & /*results*/ 4 && raw_value !== (raw_value = formatMatch(
				{
					item: /*item*/ ctx[13],
					match: /*match*/ ctx[14]
				},
				func
			) + "")) span0.innerHTML = raw_value;
			if (dirty & /*results*/ 4 && t2_value !== (t2_value = /*item*/ ctx[13].tagline + "")) set_data(t2, t2_value);

			if (dirty & /*results, selectedIndex, selectedAction, callAction*/ 92) {
				each_value_1 = /*actions*/ ctx[15];
				let i;

				for (i = 0; i < each_value_1.length; i += 1) {
					const child_ctx = get_each_context_1(ctx, each_value_1, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block_1(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(span2, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value_1.length;
			}

			if (dirty & /*results*/ 4 && a_title_value !== (a_title_value = "" + (/*item*/ ctx[13].name + ", " + /*item*/ ctx[13].tagline))) {
				attr(a, "title", a_title_value);
			}

			if (dirty & /*results, tooltips*/ 5 && li_data_tooltip_value !== (li_data_tooltip_value = /*getTooltip*/ ctx[7](/*item*/ ctx[13], /*tooltips*/ ctx[0]))) {
				attr(li, "data-tooltip", li_data_tooltip_value);
			}

			if (dirty & /*results, selectedIndex*/ 12) {
				toggle_class(li, "search-selected", /*i*/ ctx[18] === /*selectedIndex*/ ctx[3]);
			}
		},
		d(detaching) {
			if (detaching) detach(li);
			if_block.d();
			destroy_each(each_blocks, detaching);
			mounted = false;
			run_all(dispose);
		}
	};
}

function create_fragment$1(ctx) {
	let if_block_anchor;
	let if_block = /*active*/ ctx[1] && create_if_block$1(ctx);

	return {
		c() {
			if (if_block) if_block.c();
			if_block_anchor = empty();
		},
		m(target, anchor) {
			if (if_block) if_block.m(target, anchor);
			insert(target, if_block_anchor, anchor);
		},
		p(ctx, [dirty]) {
			if (/*active*/ ctx[1]) {
				if (if_block) {
					if_block.p(ctx, dirty);
				} else {
					if_block = create_if_block$1(ctx);
					if_block.c();
					if_block.m(if_block_anchor.parentNode, if_block_anchor);
				}
			} else if (if_block) {
				if_block.d(1);
				if_block = null;
			}
		},
		i: noop,
		o: noop,
		d(detaching) {
			if (if_block) if_block.d(detaching);
			if (detaching) detach(if_block_anchor);
		}
	};
}

const func = str => `<strong>${str}</strong>`;

function instance$1($$self, $$props, $$invalidate) {
	const dispatch = createEventDispatcher();
	let { tooltips = "LEFT" } = $$props;
	let { active = false } = $$props;
	let { results = [] } = $$props;
	let { selectedIndex = 0 } = $$props;
	let { selectedAction = "show" } = $$props;
	let resultList;

	afterUpdate(() => {
		const tooltipMode = getSetting(ModuleSetting.SEARCH_TOOLTIPS);

		if (resultList?.children[selectedIndex]) {
			const selected = resultList.children[selectedIndex];
			selected.scrollIntoView({ block: "nearest" });

			if (tooltipMode !== "off" && selected.dataset?.tooltip) {
				//@ts-expect-error update types...
				game.tooltip.activate(selected);
			} else {
				//@ts-expect-error update types...
				game.tooltip.deactivate();
			}
		} else {
			if (tooltipMode !== "off") {
				//@ts-expect-error update types...
				game.tooltip.deactivate();
			}
		}
	});

	function callAction(actionId, item, shiftKey) {
		dispatch("callAction", { actionId, item, shiftKey });
	}

	function getTooltip(item, side) {
		const tooltipMode = getSetting(ModuleSetting.SEARCH_TOOLTIPS);
		if (tooltipMode === "off") return "";
		const showImage = tooltipMode === "full" || tooltipMode === "image";

		const img = showImage && item.img
		? `<img src=${item.img} style="max-width: 120px; float:${side === "LEFT" ? "right" : "left"};"/>`
		: "";

		const text = tooltipMode !== "image"
		? `<p style='margin:0;text-align:left'>${item.icon} ${item.name}</p>
    <p style='font-size: 90%; opacity:0.8;margin:0;'>${item.tooltip}</p>`
		: "";

		return text + img;
	}

	const click_handler = (action, item, e) => callAction(action.id, item, e.shiftKey);
	const dragstart_handler = (item, event) => event.dataTransfer?.setData("text/plain", JSON.stringify(item.dragData));
	const click_handler_1 = (defaultAction, item, e) => callAction(defaultAction, item, e.shiftKey);

	function ul_binding($$value) {
		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
			resultList = $$value;
			$$invalidate(5, resultList);
		});
	}

	$$self.$$set = $$props => {
		if ('tooltips' in $$props) $$invalidate(0, tooltips = $$props.tooltips);
		if ('active' in $$props) $$invalidate(1, active = $$props.active);
		if ('results' in $$props) $$invalidate(2, results = $$props.results);
		if ('selectedIndex' in $$props) $$invalidate(3, selectedIndex = $$props.selectedIndex);
		if ('selectedAction' in $$props) $$invalidate(4, selectedAction = $$props.selectedAction);
	};

	return [
		tooltips,
		active,
		results,
		selectedIndex,
		selectedAction,
		resultList,
		callAction,
		getTooltip,
		click_handler,
		dragstart_handler,
		click_handler_1,
		ul_binding
	];
}

class SearchResults extends SvelteComponent {
	constructor(options) {
		super();

		init(this, options, instance$1, create_fragment$1, safe_not_equal, {
			tooltips: 0,
			active: 1,
			results: 2,
			selectedIndex: 3,
			selectedAction: 4
		});
	}
}

/* src/app/SearchFiltersResults.svelte generated by Svelte v3.49.0 */

function get_each_context(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[8] = list[i];
	child_ctx[10] = i;
	return child_ctx;
}

// (15:0) {#if active}
function create_if_block(ctx) {
	let ul;
	let each_blocks = [];
	let each_1_lookup = new Map();
	let each_value = /*results*/ ctx[1];
	const get_key = ctx => /*item*/ ctx[8].id;

	for (let i = 0; i < each_value.length; i += 1) {
		let child_ctx = get_each_context(ctx, each_value, i);
		let key = get_key(child_ctx);
		each_1_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
	}

	return {
		c() {
			ul = element("ul");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			attr(ul, "class", "quick-insert-result");
		},
		m(target, anchor) {
			insert(target, ul, anchor);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].m(ul, null);
			}

			/*ul_binding*/ ctx[6](ul);
		},
		p(ctx, dirty) {
			if (dirty & /*results, selectedIndex, selected*/ 22) {
				each_value = /*results*/ ctx[1];
				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, ul, destroy_block, create_each_block, null, get_each_context);
			}
		},
		d(detaching) {
			if (detaching) detach(ul);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].d();
			}

			/*ul_binding*/ ctx[6](null);
		}
	};
}

// (17:4) {#each results as item, i (item.id)}
function create_each_block(key_1, ctx) {
	let li;
	let a;
	let span0;
	let t0;
	let t1_value = /*item*/ ctx[8].tag + "";
	let t1;
	let t2;
	let span1;
	let t3_value = /*item*/ ctx[8].subTitle + "";
	let t3;
	let t4;
	let mounted;
	let dispose;

	function click_handler() {
		return /*click_handler*/ ctx[5](/*i*/ ctx[10]);
	}

	return {
		key: key_1,
		first: null,
		c() {
			li = element("li");
			a = element("a");
			span0 = element("span");
			t0 = text("@");
			t1 = text(t1_value);
			t2 = space();
			span1 = element("span");
			t3 = text(t3_value);
			t4 = space();
			attr(span0, "class", "title");
			attr(span1, "class", "sub");
			toggle_class(li, "search-selected", /*i*/ ctx[10] === /*selectedIndex*/ ctx[2]);
			this.first = li;
		},
		m(target, anchor) {
			insert(target, li, anchor);
			append(li, a);
			append(a, span0);
			append(span0, t0);
			append(span0, t1);
			append(a, t2);
			append(a, span1);
			append(span1, t3);
			append(li, t4);

			if (!mounted) {
				dispose = listen(a, "click", click_handler);
				mounted = true;
			}
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;
			if (dirty & /*results*/ 2 && t1_value !== (t1_value = /*item*/ ctx[8].tag + "")) set_data(t1, t1_value);
			if (dirty & /*results*/ 2 && t3_value !== (t3_value = /*item*/ ctx[8].subTitle + "")) set_data(t3, t3_value);

			if (dirty & /*results, selectedIndex*/ 6) {
				toggle_class(li, "search-selected", /*i*/ ctx[10] === /*selectedIndex*/ ctx[2]);
			}
		},
		d(detaching) {
			if (detaching) detach(li);
			mounted = false;
			dispose();
		}
	};
}

function create_fragment(ctx) {
	let if_block_anchor;
	let if_block = /*active*/ ctx[0] && create_if_block(ctx);

	return {
		c() {
			if (if_block) if_block.c();
			if_block_anchor = empty();
		},
		m(target, anchor) {
			if (if_block) if_block.m(target, anchor);
			insert(target, if_block_anchor, anchor);
		},
		p(ctx, [dirty]) {
			if (/*active*/ ctx[0]) {
				if (if_block) {
					if_block.p(ctx, dirty);
				} else {
					if_block = create_if_block(ctx);
					if_block.c();
					if_block.m(if_block_anchor.parentNode, if_block_anchor);
				}
			} else if (if_block) {
				if_block.d(1);
				if_block = null;
			}
		},
		i: noop,
		o: noop,
		d(detaching) {
			if (if_block) if_block.d(detaching);
			if (detaching) detach(if_block_anchor);
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	const dispatch = createEventDispatcher();
	let { active = false } = $$props;
	let { results = [] } = $$props;
	let { selectedIndex = 0 } = $$props;
	let resultList;

	afterUpdate(() => {
		resultList?.children[selectedIndex]?.scrollIntoView({ block: "nearest" });
	});

	function selected(index) {
		dispatch("selected", { index });
	}

	const click_handler = i => selected(i);

	function ul_binding($$value) {
		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
			resultList = $$value;
			$$invalidate(3, resultList);
		});
	}

	$$self.$$set = $$props => {
		if ('active' in $$props) $$invalidate(0, active = $$props.active);
		if ('results' in $$props) $$invalidate(1, results = $$props.results);
		if ('selectedIndex' in $$props) $$invalidate(2, selectedIndex = $$props.selectedIndex);
	};

	return [
		active,
		results,
		selectedIndex,
		resultList,
		selected,
		click_handler,
		ul_binding
	];
}

class SearchFiltersResults extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance, create_fragment, safe_not_equal, { active: 0, results: 1, selectedIndex: 2 });
	}
}

// A search controller controls a specific search output.
// This lets us implement multiple different searches with the same search app,
// e.g. entities and filters, or maybe in the future; commands, open windows, etc.
class SearchController {
    constructor(app) {
        this.results = [];
        this.selectedIndex = -1;
        this.selectedAction = null;
        this.app = app;
    }
    get isInsertMode() {
        return (this.app.attachedContext?.mode == undefined ||
            this.app.attachedContext.mode == ContextMode.Insert);
    }
    activate() {
        const left = this.app.attachedContext?.spawnCSS?.left;
        const tooltipSide = left !== undefined && left < 300 ? "RIGHT" : "LEFT";
        this.view?.$$set?.({ active: true, tooltips: tooltipSide });
    }
    deactivate() {
        this.view?.$$set?.({ active: false });
    }
    selectNext() {
        this.selectedIndex = (this.selectedIndex + 1) % this.results.length;
        this.view?.$$set?.({
            selectedIndex: this.selectedIndex,
            selectedAction: (this.selectedAction = null),
        });
    }
    selectPrevious() {
        this.selectedIndex =
            this.selectedIndex > 0 ? this.selectedIndex - 1 : this.results.length - 1;
        this.view?.$$set?.({
            selectedIndex: this.selectedIndex,
            selectedAction: (this.selectedAction = null),
        });
    }
}
class DocumentController extends SearchController {
    constructor() {
        super(...arguments);
        this.results = [];
        this.selectedAction = null; // null means use defaultAction
        this.search = (textInput) => {
            if (!QuickInsert.searchLib)
                return;
            textInput = textInput.trim();
            if (textInput.length == 0) {
                this.view?.$$set?.({
                    results: [],
                    selectedIndex: (this.selectedIndex = -1),
                });
                return;
            }
            // Set a lower maximum if search is single char (single-character search is fast, but rendering is slow).
            const max = textInput.length == 1 ? 20 : 100;
            let results = [];
            if (this.app.selectedFilter) {
                if (this.app.selectedFilter.filterConfig) {
                    results = QuickInsert.searchLib.search(textInput, (item) => this.app.selectedFilter?.filterConfig
                        ? matchFilterConfig(this.app.selectedFilter.filterConfig, item)
                        : true, max);
                }
            }
            else {
                results = QuickInsert.searchLib.search(textInput, null, max);
            }
            if (this.app.attachedContext &&
                this.app.attachedContext.restrictTypes &&
                this.app.attachedContext.restrictTypes.length > 0) {
                results = results.filter((i) => this.app.attachedContext?.restrictTypes?.includes(i.item.documentType));
            }
            this.results = results.map((res) => ({
                item: res.item,
                match: res.match,
                actions: getActions(res.item.documentType, this.isInsertMode),
                defaultAction: defaultAction(res.item.documentType, this.isInsertMode),
            }));
            this.view?.$$set?.({
                results: this.results.reverse(),
                selectedIndex: (this.selectedIndex = this.results.length - 1),
                selectedAction: (this.selectedAction = null),
            });
        };
    }
    onTab(index) {
        const actions = this.results[index].actions;
        if (actions.length == 0)
            return;
        let idx;
        if (this.selectedAction) {
            idx = actions.findIndex((a) => a.id == this.selectedAction);
        }
        else {
            idx = actions.findIndex((a) => a.id == this.results[index].defaultAction);
        }
        const nextIdx = (idx + 1) % actions.length;
        this.view?.$$set?.({
            selectedAction: (this.selectedAction = actions[nextIdx].id),
        });
    }
    onEnter(index, evt) {
        // TODO: get selected action
        this.onAction(this.selectedAction || this.results[index].defaultAction, this.results[index].item, Boolean(evt.shiftKey));
    }
    async onAction(actionId, item, shiftKey) {
        console.info(`Quick Insert | Invoked Action [${actionId}] on [${item.name}] shiftKey:${shiftKey}`);
        const val = await DOCUMENTACTIONS[actionId](item);
        if (val && this.isInsertMode) {
            this.app.keepOpen = shiftKey; // Keep open until onSubmit completes
            this.app.attachedContext?.onSubmit(val);
        }
        if (this.app.attachedContext?.allowMultiple === false || !shiftKey) {
            this.app.closeDialog();
        }
        this.app.keepOpen = false;
    }
}
class FilterController extends SearchController {
    constructor() {
        super(...arguments);
        this.results = [];
    }
    onTab(index) {
        this.onEnter(index);
    }
    onEnter(index) {
        this.selectFilter(this.results[index]);
    }
    selectFilter(filter) {
        this.app.setFilterTag(filter);
        this.app.selectedFilter = filter;
        this.deactivate();
        this.app.showHint(`Searching: ${filter.subTitle}`);
    }
    onClick(index) {
        this.onEnter(index);
        this.app.focusInput();
    }
    search(textInput) {
        const cleanedInput = textInput.toLowerCase().trim();
        if (/\s$/g.test(textInput)) {
            // User has added a space after tag -> selected
            const matchingFilter = QuickInsert.filters.getFilterByTag(cleanedInput);
            if (matchingFilter) {
                this.selectFilter(matchingFilter);
                return;
            }
        }
        this.results = QuickInsert.filters.filters
            .filter((f) => !f.disabled)
            .filter((f) => f.tag.includes(cleanedInput));
        this.view?.$$set?.({
            results: this.results,
            selectedIndex: (this.selectedIndex = this.results.length - 1),
        });
    }
}
var ActiveMode;
(function (ActiveMode) {
    ActiveMode[ActiveMode["Search"] = 1] = "Search";
    ActiveMode[ActiveMode["Filter"] = 2] = "Filter";
})(ActiveMode || (ActiveMode = {}));
class SearchApp extends Application {
    constructor() {
        super({
            template: "modules/quick-insert/templates/quick-insert.html",
            popOut: false,
        });
        this.debug = false;
        this.mouseFocus = false;
        this.inputFocus = false;
        this.keepOpen = false;
        this.mode = ActiveMode.Search;
        this.selectedFilter = null;
        this.attachedContext = null;
        this.embeddedMode = false;
        this.filterController = new FilterController(this);
        this.documentController = new DocumentController(this);
        this._checkFocus = () => {
            if (this.debug || this.embeddedMode)
                return;
            if (!this.mouseFocus && !this.inputFocus && !this.keepOpen) {
                this.closeDialog();
            }
        };
        this._onKeyTab = (evt) => {
            evt.preventDefault();
            if (!this.embeddedMode)
                this.controller.onTab(this.controller.selectedIndex);
        };
        this._onKeyEsc = (evt) => {
            if (this.embeddedMode)
                return;
            evt.preventDefault();
            evt.stopPropagation();
            this.closeDialog();
        };
        this._onKeyDown = (evt) => {
            evt.preventDefault();
            this.selectNext();
        };
        this._onKeyUp = (evt) => {
            evt.preventDefault();
            this.selectPrevious();
        };
        this._onKeyEnter = (evt) => {
            evt.preventDefault();
            evt.stopImmediatePropagation();
            if (this.controller.selectedIndex > -1) {
                this.controller.onEnter(this.controller.selectedIndex, evt);
            }
        };
    }
    get open() {
        return this._state > 0;
    }
    get controller() {
        if (this.mode === ActiveMode.Filter) {
            return this.filterController;
        }
        return this.documentController;
    }
    activateMode(mode) {
        this.controller?.deactivate();
        this.mode = mode;
        this.controller?.activate();
    }
    resetInput(full = false) {
        if (!full && this.selectedFilter) {
            this.setFilterTag(this.selectedFilter);
        }
        else {
            this.input?.html("");
        }
        this.text = undefined;
        this.focusInput();
    }
    selectNext() {
        this.controller?.selectNext();
    }
    selectPrevious() {
        this.controller?.selectPrevious();
    }
    setFilterTag(filter) {
        if (!this.input)
            return;
        const focus = this.input.is(":focus");
        this.input.html("");
        const editable = this.embeddedMode ? `contenteditable="false"` : "";
        $(`<span class="search-tag" ${editable}>@${filter.tag}</span>`).prependTo(this.input);
        $('<span class="breaker">&nbsp</span>').appendTo(this.input);
        if (focus) {
            this.focusInput();
        }
    }
    closeDialog() {
        if (this.embeddedMode)
            return;
        this.attachedContext?.onClose?.();
        this.selectedFilter = null;
        //@ts-expect-error tooltip not in types yet
        game.tooltip.deactivate();
        this.close();
    }
    render(force, options) {
        if (options && options.context) {
            this.attachedContext = options.context;
            return super.render(force, options);
        }
        // Try to infer context
        const target = document.activeElement;
        if (target) {
            this.attachedContext = identifyContext(target);
        }
        if (!this.attachedContext) {
            return null;
        }
        //@ts-expect-error keyboard is never null really
        game.keyboard.downKeys = new Set();
        return super.render(force, options);
    }
    showHint(notice) {
        this.hint?.html(notice);
    }
    focusInput() {
        if (!this.input)
            return;
        placeCaretAtEnd(this.input.get(0));
        this.inputFocus = true;
    }
    activateListeners(html) {
        // (Re-)set position
        html.removeAttr("style");
        if (this.attachedContext?.spawnCSS) {
            html.css(this.attachedContext.spawnCSS);
        }
        if (this.attachedContext?.classes) {
            html.addClass(this.attachedContext.classes);
        }
        this.input = html.find(".search-editable-input");
        this.hint = html.find(".quick-insert-hint");
        this.input.on("input", () => {
            this.searchInput();
        });
        this.input.on("dragstart", (evt) => evt.stopPropagation());
        this.input.on("keydown", (evt) => {
            switch (evt.which) {
                case 13:
                    return this._onKeyEnter(evt);
                case 40:
                    return this._onKeyDown(evt);
                case 38:
                    return this._onKeyUp(evt);
                case 27:
                    return this._onKeyEsc(evt);
                case 9:
                    return this._onKeyTab(evt);
            }
        });
        $(this.element).hover(() => {
            this.mouseFocus = true;
            this._checkFocus();
        }, (e) => {
            if (e.originalEvent?.shiftKey)
                return;
            this.mouseFocus = false;
            this._checkFocus();
        });
        $(this.element).on("focusout", () => {
            this.inputFocus = false;
            this._checkFocus();
        });
        $(this.element).on("focusin", () => {
            this.inputFocus = true;
            this._checkFocus();
        });
        this.focusInput();
        const node = this.element.get(0);
        if (node) {
            this.documentController.view = new SearchResults({
                target: node,
            });
            this.filterController.view = new SearchFiltersResults({
                target: node,
            });
        }
        this.documentController.view?.$on("callAction", (data) => {
            const { actionId, item, shiftKey } = data.detail;
            this.documentController.onAction(actionId, item, shiftKey);
        });
        this.filterController.view?.$on("selected", (data) => {
            const { index } = data.detail;
            this.filterController.onClick(index);
        });
        if (this.attachedContext?.filter) {
            this.activateMode(ActiveMode.Filter);
            if (typeof this.attachedContext.filter === "string") {
                const found = QuickInsert.filters.getFilterByTag(this.attachedContext.filter) ??
                    QuickInsert.filters.getFilter(this.attachedContext.filter);
                if (found) {
                    this.filterController.selectFilter(found);
                }
            }
            else {
                this.filterController.selectFilter(this.attachedContext.filter);
            }
        }
        if (this.attachedContext?.startText) {
            this.input.append(this.attachedContext.startText);
            this.focusInput();
            this.searchInput();
        }
        if (!QuickInsert.searchLib) {
            this.showHint(`<i class="fas fa-spinner"></i> Loading index...`);
            loadSearchIndex()
                .then(() => {
                if (this.input?.text().trim().length) {
                    this.searchInput();
                }
                else {
                    this.showHint(`Index loaded successfully`);
                }
            })
                .catch((reason) => {
                this.showHint(`Failed to load index ${reason}`);
            });
            // @ts-ignore
        }
        else if (QuickInsert.searchLib?.index?.fuse._docs.length == 0) {
            this.showHint(`Search index is empty for some reason`);
        }
    }
    searchInput() {
        if (!this.input)
            return;
        const text = this.input.text();
        this.text = text;
        const breaker = $(this.input).find(".breaker");
        this.showHint("");
        if (this.selectedFilter) {
            // Text was changed or breaker was removed
            if (!text.startsWith(`@${this.selectedFilter.tag}`) ||
                breaker.length === 0 ||
                breaker.is(":empty") ||
                breaker.html() === "<br>") {
                if (this.embeddedMode) {
                    this.setFilterTag(this.selectedFilter);
                    return;
                }
                // Selectedfilter doesn't match any more :(
                this.input.html(text);
                this.focusInput();
                this.selectedFilter = null;
                this.activateMode(ActiveMode.Filter);
                this.filterController.search(text.substr(1).trim());
            }
            else {
                this.activateMode(ActiveMode.Search);
                const search = text.replace(`@${this.selectedFilter.tag}`, "").trim();
                this.documentController.search(search);
            }
        }
        else if (text.startsWith("@")) {
            this.activateMode(ActiveMode.Filter);
            this.filterController.search(text.substr(1));
        }
        else {
            this.activateMode(ActiveMode.Search);
            this.documentController.search(text);
        }
    }
}

class IndexingSettings extends FormApplication {
    static get defaultOptions() {
        return {
            ...super.defaultOptions,
            title: i18n("IndexingSettingsTitle"),
            id: "indexing-settings",
            template: "modules/quick-insert/templates/indexing-settings.hbs",
            resizable: true,
            width: 660,
        };
    }
    getData() {
        if (!game.packs)
            return null;
        const disabled = getSetting(ModuleSetting.INDEXING_DISABLED);
        return {
            documentTypes: IndexedDocumentTypes.map((type) => ({
                type,
                title: `DOCUMENT.${type}`,
                values: [1, 2, 3, 4].map((role) => ({
                    role,
                    disabled: disabled?.entities?.[type]?.includes(role),
                })),
            })),
            compendiums: [...game.packs.keys()].map((pack) => ({
                pack,
                values: [1, 2, 3, 4].map((role) => ({
                    role,
                    disabled: disabled?.packs?.[pack]?.includes(role),
                })),
            })),
        };
    }
    activateListeners(html) {
        super.activateListeners(html);
        // Set initial state for all
        const disabled = getSetting(ModuleSetting.INDEXING_DISABLED);
        Object.entries(disabled.packs).forEach(([pack, val]) => {
            const check = html.find(`[data-disable="${pack}"]`);
            if (permissionListEq(val, [1, 2, 3, 4])) {
                check.prop("checked", false);
            }
            else {
                check.prop("indeterminate", true);
            }
        });
        // Root check change -> updates regular checks
        html.find("input.disable-pack").on("change", function () {
            const compendium = this.dataset.disable;
            html
                .find(`input[name^="${compendium}."]`)
                .prop("checked", this.checked);
        });
        // Regular check change -> updates root check
        html.find(".form-fields input").on("change", function () {
            const compendium = this.name.slice(0, -2);
            const checks = html
                .find(`input[name^="${compendium}."]`)
                .toArray();
            if (checks.every((e) => e.checked)) {
                html
                    .find(`[data-disable="${compendium}"]`)
                    .prop("checked", true)
                    .prop("indeterminate", false);
            }
            else if (checks.every((e) => !e.checked)) {
                html
                    .find(`[data-disable="${compendium}"]`)
                    .prop("checked", false)
                    .prop("indeterminate", false);
            }
            else {
                html
                    .find(`[data-disable="${compendium}"]`)
                    .prop("checked", checks.some((e) => e.checked))
                    .prop("indeterminate", true);
            }
        });
        // Deselect all button
        html.find("button.deselect-all").on("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            html
                .find(`.form-group.pack input[type="checkbox"]`)
                .prop("checked", false)
                .prop("indeterminate", false);
        });
        // Select all button
        html.find("button.select-all").on("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            html
                .find(`.form-group.pack input[type="checkbox"]`)
                .prop("checked", true)
                .prop("indeterminate", false);
        });
    }
    async _updateObject(event, formData) {
        const res = {
            entities: {},
            packs: {},
        };
        for (const [name, checked] of Object.entries(formData)) {
            if (!checked) {
                const [base, middle, last] = name.split(".");
                if (last) {
                    const pack = `${base}.${middle}`;
                    res.packs[pack] = res.packs[pack] || [];
                    res.packs[pack].push(parseInt(last));
                }
                else {
                    const type = base;
                    res.entities[type] = res.entities[type] || [];
                    res.entities[type].push(parseInt(middle));
                }
            }
        }
        setSetting(ModuleSetting.INDEXING_DISABLED, res);
    }
}

const moduleSettings = {
    [ModuleSetting.GM_ONLY]: {
        setting: ModuleSetting.GM_ONLY,
        name: "QUICKINSERT.SettingsGmOnly",
        hint: "QUICKINSERT.SettingsGmOnlyHint",
        type: Boolean,
        default: false,
        scope: "world",
    },
    [ModuleSetting.FILTERS_SHEETS_ENABLED]: {
        setting: ModuleSetting.FILTERS_SHEETS_ENABLED,
        name: "QUICKINSERT.SettingsFiltersSheetsEnabled",
        hint: "QUICKINSERT.SettingsFiltersSheetsEnabledHint",
        type: Boolean,
        default: true,
        scope: "world",
    },
    [ModuleSetting.AUTOMATIC_INDEXING]: {
        setting: ModuleSetting.AUTOMATIC_INDEXING,
        name: "QUICKINSERT.SettingsAutomaticIndexing",
        hint: "QUICKINSERT.SettingsAutomaticIndexingHint",
        type: Number,
        choices: {
            3000: "QUICKINSERT.SettingsAutomaticIndexing3s",
            5000: "QUICKINSERT.SettingsAutomaticIndexing5s",
            10000: "QUICKINSERT.SettingsAutomaticIndexing10s",
            "-1": "QUICKINSERT.SettingsAutomaticIndexingOnFirstOpen",
        },
        default: -1,
        scope: "client",
    },
    [ModuleSetting.INDEX_TIMEOUT]: {
        setting: ModuleSetting.INDEX_TIMEOUT,
        name: "QUICKINSERT.SettingsIndexTimeout",
        hint: "QUICKINSERT.SettingsIndexTimeoutHint",
        type: Number,
        choices: {
            1500: "QUICKINSERT.SettingsIndexTimeout1_5s",
            3000: "QUICKINSERT.SettingsIndexTimeout3s",
            7000: "QUICKINSERT.SettingsIndexTimeout7s",
            9500: "QUICKINSERT.SettingsIndexTimeou9_5s",
        },
        default: 1500,
        scope: "world",
    },
    [ModuleSetting.SEARCH_BUTTON]: {
        setting: ModuleSetting.SEARCH_BUTTON,
        name: "QUICKINSERT.SettingsSearchButton",
        hint: "QUICKINSERT.SettingsSearchButtonHint",
        type: Boolean,
        default: false,
        scope: "client",
    },
    [ModuleSetting.ENABLE_GLOBAL_CONTEXT]: {
        setting: ModuleSetting.ENABLE_GLOBAL_CONTEXT,
        name: "QUICKINSERT.SettingsEnableGlobalContext",
        hint: "QUICKINSERT.SettingsEnableGlobalContextHint",
        type: Boolean,
        default: true,
    },
    [ModuleSetting.DEFAULT_ACTION_SCENE]: {
        setting: ModuleSetting.DEFAULT_ACTION_SCENE,
        name: "QUICKINSERT.SettingsDefaultActionScene",
        hint: "QUICKINSERT.SettingsDefaultActionSceneHint",
        type: String,
        choices: {
            show: "SCENES.Configure",
            viewScene: "SCENES.View",
            activateScene: "SCENES.Activate",
        },
        default: "show",
    },
    [ModuleSetting.DEFAULT_ACTION_ROLL_TABLE]: {
        setting: ModuleSetting.DEFAULT_ACTION_ROLL_TABLE,
        name: "QUICKINSERT.SettingsDefaultActionRollTable",
        hint: "QUICKINSERT.SettingsDefaultActionRollTableHint",
        type: String,
        choices: {
            show: "QUICKINSERT.ActionEdit",
            roll: "TABLE.Roll",
        },
        default: "show",
    },
    [ModuleSetting.DEFAULT_ACTION_MACRO]: {
        setting: ModuleSetting.DEFAULT_ACTION_MACRO,
        name: "QUICKINSERT.SettingsDefaultActionMacro",
        hint: "QUICKINSERT.SettingsDefaultActionMacroHint",
        type: String,
        choices: {
            show: "QUICKINSERT.ActionEdit",
            execute: "QUICKINSERT.ActionExecute",
        },
        default: "show",
    },
    [ModuleSetting.SEARCH_TOOLTIPS]: {
        setting: ModuleSetting.SEARCH_TOOLTIPS,
        name: "QUICKINSERT.SettingsSearchTooltips",
        hint: "QUICKINSERT.SettingsSearchTooltipsHint",
        type: String,
        choices: {
            off: "QUICKINSERT.SettingsSearchTooltipsValueOff",
            text: "QUICKINSERT.SettingsSearchTooltipsValueText",
            image: "QUICKINSERT.SettingsSearchTooltipsValueImage",
            full: "QUICKINSERT.SettingsSearchTooltipsValueFull",
        },
        default: "text",
    },
    [ModuleSetting.EMBEDDED_INDEXING]: {
        setting: ModuleSetting.EMBEDDED_INDEXING,
        name: "QUICKINSERT.SettingsEmbeddedIndexing",
        hint: "QUICKINSERT.SettingsEmbeddedIndexingHint",
        type: Boolean,
        default: false,
        scope: "world",
    },
    [ModuleSetting.INDEXING_DISABLED]: {
        setting: ModuleSetting.INDEXING_DISABLED,
        name: "Things that have indexing disabled",
        type: Object,
        default: {
            entities: {
                Macro: [1, 2],
                Scene: [1, 2],
                Playlist: [1, 2],
                RollTable: [1, 2],
            },
            packs: {},
        },
        scope: "world",
        config: false, // Doesn't show up in config
    },
    [ModuleSetting.FILTERS_CLIENT]: {
        setting: ModuleSetting.FILTERS_CLIENT,
        name: "Own filters",
        type: Object,
        default: {
            saveRev: SAVE_SETTINGS_REVISION,
            disabled: [],
            filters: [],
        },
        config: false, // Doesn't show up in config
    },
    [ModuleSetting.FILTERS_WORLD]: {
        setting: ModuleSetting.FILTERS_WORLD,
        name: "World filters",
        type: Object,
        default: {
            saveRev: SAVE_SETTINGS_REVISION,
            filters: [],
        },
        scope: "world",
        config: false, // Doesn't show up in config
    },
    [ModuleSetting.FILTERS_SHEETS]: {
        setting: ModuleSetting.FILTERS_SHEETS,
        name: "Sheet filters",
        type: Object,
        default: {},
        scope: "world",
        config: false, // Doesn't show up in config
    },
};
function registerSettings(callbacks = {}) {
    Object.entries(moduleSettings).forEach(([setting, item]) => {
        registerSetting(setting, (value) => {
            callbacks[item.setting]?.(value);
        }, item);
    });
}

function mapKey(key) {
    if (key.startsWith("Key")) {
        return key[key.length - 1].toLowerCase();
    }
    return key;
}
function registerProseMirrorKeys() {
    const binds = game?.keybindings?.bindings?.get("quick-insert." + ModuleSetting.KEY_BIND);
    if (!binds?.length) {
        console.info("Quick Insert | ProseMirror extension found no key binding");
        return;
    }
    function keyCallback(state, dispatch, view) {
        if (QuickInsert.app?.embeddedMode)
            return false;
        // Open window
        QuickInsert.open(new ProseMirrorContext(state, dispatch, view));
        return true;
    }
    const keyMap = Object.fromEntries(binds.map((bind) => {
        return [
            `${bind.modifiers?.map((m) => m + "-").join("")}${mapKey(bind.key)}`,
            keyCallback,
        ];
    }));
    ProseMirror.defaultPlugins.QuickInsert = ProseMirror.keymap(keyMap);
}

function quickInsertDisabled() {
    return !game.user?.isGM && getSetting(ModuleSetting.GM_ONLY);
}
// Client is currently reindexing?
let reIndexing = false;
Hooks.once("init", async function () {
    registerMenu({
        menu: "indexingSettings",
        name: "QUICKINSERT.SettingsIndexingSettings",
        label: "QUICKINSERT.SettingsIndexingSettingsLabel",
        icon: "fas fa-search",
        type: IndexingSettings,
        restricted: false,
    });
    registerMenu({
        menu: "filterMenu",
        name: "QUICKINSERT.SettingsFilterMenu",
        label: "QUICKINSERT.SettingsFilterMenuLabel",
        icon: "fas fa-filter",
        type: FilterList,
        restricted: false,
    });
    registerSettings({
        [ModuleSetting.FILTERS_WORLD]: () => {
            if (quickInsertDisabled())
                return;
            QuickInsert.filters.loadSave();
        },
        [ModuleSetting.FILTERS_CLIENT]: () => {
            if (quickInsertDisabled())
                return;
            QuickInsert.filters.loadSave();
        },
        [ModuleSetting.INDEXING_DISABLED]: async () => {
            if (quickInsertDisabled())
                return;
            // Active users will start reindexing in deterministic order, once per 300ms
            if (reIndexing)
                return;
            reIndexing = true;
            if (game.users && game.userId !== null) {
                const order = [...game.users.contents]
                    .filter((u) => u.active)
                    .map((u) => u.id)
                    .indexOf(game.userId);
                await resolveAfter(order * 300);
            }
            await QuickInsert.forceIndex();
            reIndexing = false;
        },
    });
    game.keybindings.register("quick-insert", ModuleSetting.KEY_BIND, {
        name: "QUICKINSERT.SettingsQuickOpen",
        textInput: true,
        editable: [
            { key: "Space", modifiers: [KeyboardManager.MODIFIER_KEYS.CONTROL] },
        ],
        onDown: (ctx) => {
            QuickInsert.toggle(ctx._quick_insert_extra?.context);
            return true;
        },
        precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
    });
});
Hooks.once("ready", function () {
    if (quickInsertDisabled())
        return;
    console.log("Quick Insert | Initializing...");
    // Initialize application base
    QuickInsert.filters = new SearchFilterCollection();
    QuickInsert.app = new SearchApp();
    registerTinyMCEPlugin();
    registerProseMirrorKeys();
    importSystemIntegration().then((systemIntegration) => {
        if (systemIntegration) {
            QuickInsert.systemIntegration = systemIntegration;
            QuickInsert.systemIntegration.init();
            if (QuickInsert.systemIntegration.defaultSheetFilters) {
                registerMenu({
                    menu: "sheetFilters",
                    name: "QUICKINSERT.SettingsSheetFilters",
                    label: "QUICKINSERT.SettingsSheetFiltersLabel",
                    icon: "fas fa-filter",
                    type: SheetFilters,
                    restricted: false,
                });
            }
        }
    });
    document.addEventListener("keydown", (evt) => {
        // Allow in input fields...
        customKeybindHandler(evt);
    });
    setupDocumentHooks(QuickInsert);
    console.log("Quick Insert | Search Application ready");
    const indexDelay = getSetting(ModuleSetting.AUTOMATIC_INDEXING);
    if (indexDelay != -1) {
        setTimeout(() => {
            console.log("Quick Insert | Automatic indexing initiated");
            loadSearchIndex();
        }, indexDelay);
    }
});
Hooks.on("renderSceneControls", (controls, html) => {
    if (!getSetting(ModuleSetting.SEARCH_BUTTON))
        return;
    const searchBtn = $(`<li class="scene-control" title="Quick Insert" class="quick-insert-open">
          <i class="fas fa-search"></i>
      </li>`);
    html.children(".main-controls").append(searchBtn);
    searchBtn.on("click", () => QuickInsert.open());
});
// Exports and API usage
//@ts-ignore
globalThis.QuickInsert = QuickInsert;

export { CharacterSheetContext, ModuleSetting, QuickInsert, SearchContext, getSetting, setSetting };
//# sourceMappingURL=quick-insert.js.map
