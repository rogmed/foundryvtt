import { i18n, error } from "../dae.js";
import { effectIsTransfer } from "./dae.js";
//@ts-ignore
const EFFECTMODES = CONST.ACTIVE_EFFECT_MODES;
function findDAEItem(item, packs) {
    for (let pack of packs) {
        let matchItem = pack?.find(pd => pd.name === item.name && pd.type === item.type);
        if (matchItem)
            return matchItem;
    }
    return undefined;
}
var packsLoaded = false;
var daeItemPack;
var midiItemPack;
var daeSpellPack;
var midiSpellPack;
var daeFeatsPack;
var midiFeatsPack;
var magicItemsPack;
var dndSRDItemsPack;
var dndSRDSpellsPack;
var dndSRDclassesPack;
var dndSRDClassfeaturesPack;
var dndSRDMonsterfeaturesPack;
export async function loadPacks() {
    if (packsLoaded)
        return;
    daeItemPack = await game.packs.get("Dynamic-Effects-SRD.DAE SRD Items").getDocuments();
    midiItemPack = await game.packs.get("midi-srd.Midi SRD Items").getDocuments();
    daeSpellPack = await game.packs.get("Dynamic-Effects-SRD.DAE SRD Spells")?.getDocuments();
    midiSpellPack = await game.packs.get("midi-srd.Midi SRD Spells").getDocuments();
    daeFeatsPack = await game.packs.get("Dynamic-Effects-SRD.DAE SRD Feats").getDocuments();
    midiFeatsPack = await game.packs.get("midi-srd.Midi SRD Feats").getDocuments();
    magicItemsPack = await game.packs.get("Dynamic-Effects-SRD.DAE SRD Magic Items").getDocuments();
    dndSRDItemsPack = await game.packs.get(`${game.system.id}.items`).getDocuments();
    dndSRDSpellsPack = await game.packs.get(`${game.system.id}.spells`).getDocuments();
    dndSRDclassesPack = await game.packs.get(`${game.system.id}.classes`).getDocuments();
    dndSRDMonsterfeaturesPack = await game.packs.get(`${game.system.id}.monsterfeatures`)?.getDocuments();
    dndSRDClassfeaturesPack = await game.packs.get(`${game.system.id}.classfeatures`)?.getDocuments();
    packsLoaded = true;
}
export async function migrateAllActorsDAESRD(includeSRD = false) {
    if (!game.settings.get("dae", "disableEffects")) {
        ui.notifications.error("Please set DAE disable all effect processing");
        error("Please set DAE disable all effect processing");
        return;
    }
    if (!game.modules.get("Dynamic-Effects-SRD")?.active) {
        ui.notifications.warn("DAE SRD Module not active");
        error("DAE SRD Module not active");
        return;
    }
    for (let a of game.actors) {
        await migrateActorDAESRD(a, includeSRD);
    }
    ;
}
export async function migrateAllNPCDAESRD(includeSRD = false) {
    if (!game.settings.get("dae", "disableEffects")) {
        ui.notifications.error("Please set DAE disable all effect processing");
        error("Please set DAE disable all effect processing");
        return;
    }
    if (!game.modules.get("Dynamic-Effects-SRD")?.active) {
        ui.notifications.warn("DAE SRD Module not active");
        error("DAE SRD Module not active");
        return;
    }
    for (let a of game.actors) {
        //@ts-ignore
        if (a.type !== "character") {
            await migrateActorDAESRD(a, includeSRD);
        }
        ;
    }
}
export async function migrateActorDAESRD(actor, includeSRD = false) {
    if (!game.settings.get("dae", "disableEffects")) {
        ui.notifications.error("Please set DAE disable all effect processing");
        error("Please set DAE disable all effect processing");
        return;
    }
    if (!game.modules.get("Dynamic-Effects-SRD")?.active) {
        ui.notifications.warn("DAE SRD Module not active");
        error("DAE SRD Module not active");
        return;
    }
    if (!packsLoaded)
        await loadPacks();
    const items = actor._source.items;
    let replaceItems = [];
    let count = 0;
    items.forEach(item => {
        let replaceData;
        switch (item.type) {
            case "feat":
                let srdFeats = (actor?.type === "npc") ? dndSRDMonsterfeaturesPack : dndSRDClassfeaturesPack;
                if (includeSRD)
                    replaceData = findDAEItem(item, [daeFeatsPack, midiFeatsPack, dndSRDclassesPack, srdFeats]);
                else
                    replaceData = findDAEItem(item, [midiFeatsPack, daeFeatsPack]);
                if (replaceData)
                    console.warn("migrating", actor.name, replaceData.name, replaceData);
                if (replaceData) {
                    setProperty(replaceData, "equipped", item.equipped);
                    setProperty(replaceData, "attunement", item.attunement);
                    setProperty(replaceData.flags, "dae.migrated", true);
                    replaceItems.push(replaceData.toObject());
                    count++;
                }
                else
                    replaceItems.push(item);
                break;
            case "spell":
                if (includeSRD)
                    replaceData = findDAEItem(item, [daeSpellPack, midiSpellPack, dndSRDSpellsPack]);
                else
                    replaceData = findDAEItem(item, [midiSpellPack, daeSpellPack]);
                if (replaceData)
                    console.warn("migrating ", actor.name, replaceData.name, replaceData);
                if (replaceData) {
                    setProperty(replaceData, "prepared", item.prepared);
                    setProperty(replaceData.flags, "dae.migrated", true);
                    replaceItems.push(replaceData.toObject());
                    count++;
                }
                else
                    replaceItems.push(item);
                break;
            case "equipment":
            case "weapon":
            case "loot":
            case "consumable":
            case "tool":
            case "backpack":
                if (includeSRD)
                    replaceData = findDAEItem(item, [midiItemPack, daeItemPack, magicItemsPack, dndSRDItemsPack]);
                else
                    replaceData = findDAEItem(item, [midiItemPack, daeItemPack, magicItemsPack]);
                if (replaceData)
                    console.warn("migrated", actor.name, replaceData.name, replaceData);
                if (replaceData) {
                    setProperty(replaceData, "data.equipped", item.equipped);
                    setProperty(replaceData, "data.attunement", item.attunement);
                    setProperty(replaceData.flags, "dae.migrated", true);
                    replaceItems.push(replaceData.toObject());
                    count++;
                }
                else
                    replaceItems.push(item);
                break;
            default:
                replaceItems.push(item);
                break;
        }
    });
    let removeItems = actor.items.map(i => i.id);
    await actor.deleteEmbeddedDocuments("ActiveEffect", [], { deleteAll: true });
    await actor.deleteEmbeddedDocuments("Item", [], { deleteAll: true });
    // Adding all at once seems to create a problem.
    // await actor.createEmbeddedDocuments("Item", replaceItems, { addFeatures: true, promptAddFeatures: false });
    for (let item of replaceItems) {
        await actor.createEmbeddedDocuments("Item", [item], { addFeatures: false, promptAddFeatures: false });
    }
    console.warn(actor.name, "replaced ", count, " out of ", replaceItems.length, " items from the DAE SRD");
}
function removeDynamiceffects(actor) {
    actor.update({ "flags.-=dynamiceffects": null });
}
export async function fixupDDBAC(allActors = false) {
    try {
        const itemName = "DDB AC";
        const content = await game.packs.get("dae.premadeitems").getDocuments();
        const item = content.find(i => i.name === itemName);
        let items = game.actors.filter(a => a.flags.ddbimporter && a.flags.ddbimporter.baseAC)
            .filter(a => allActors || a.type === "character")
            .filter(a => !a.items.getName(itemName))
            .forEach(a => a.createEmbeddedDocuments("Item", [item.toObject()]));
    }
    catch (err) {
        error("migration did not complete", err);
    }
}
export function checkLibWrapperVersion() {
    if (isNewerVersion("1.8.0", game.modules.get("lib-wrapper").version)) {
        let d = new Dialog({
            // localize this text
            title: i18n("dae.confirm"),
            content: `<h2>DAE requires libWrapper version 1.8.0 or later</p>`,
            buttons: {
                one: {
                    icon: '<i class="fas fa-cross"></i>',
                },
            },
            default: "one"
        });
        d.render(true);
    }
}
export async function cleanDAEArmorWorld() {
    await removeAllActorArmorItems();
    await removeAllTokenArmorItems();
}
export async function removeAllActorArmorItems() {
    let promises = [];
    for (let actor of game.actors) {
        //@ts-ignore
        await removeActorArmorItems(actor);
    }
}
export async function removeAllTokenArmorItems() {
    let promises = [];
    for (let scene of game.scenes) {
        //@ts-ignore
        for (let tokenDocument of scene.tokens) {
            if (!tokenDocument.isLinked && tokenDocument.actor) {
                await removeActorArmorItems(tokenDocument.actor);
            }
        }
    }
}
export async function removeActorArmorItems(actor) {
    let promises = [];
    for (let item of actor.items) {
        let toDelete = [];
        //@ts-ignore
        if (!item.effects)
            continue;
        //@ts-ignore
        for (let effect of item.effects) {
            for (let change of effect.changes) {
                if (change.key === "data.attributes.ac.value" && change.value === "AutoCalc") {
                    //@ts-ignore
                    console.warn("Removing DAE Item ", actor.name, item.name, item.id);
                    //@ts-ignore
                    toDelete.push(item.id);
                }
            }
        }
        if (toDelete.length > 0) {
            //@ts-ignore
            await actor.deleteEmbeddedDocuments("Item", toDelete);
        }
    }
}
export async function cleanEffectOrigins(processItems = false) {
    await cleanAllActorEffectOrigins();
    await cleanAllTokenEffectOrigins();
    if (processItems) {
        await cleanAllActorItemsEffectOrigins();
        await cleanAllTokenEffectOrigins();
    }
}
export async function cleanAllActorEffectOrigins() {
    //@ts-ignore
    for (let actor of game.actors.contents) {
        //@ts-ignore
        let ownedItemEffects = actor.effects.filter(ef => ef.origin?.includes("OwnedItem"));
        let updates = ownedItemEffects.map(ef => { return { _id: ef.id, origin: ef.origin.replace("OwnedItem", "Item") }; });
        if (updates.length > 0) {
            await actor.updateEmbeddedDocuments("ActiveEffect", updates);
            console.warn("Updates are ", actor.name, updates);
        }
        const itemChanges = [];
        for (let item of actor.items) {
            if (!(item.effects.some(ef => ef.origin?.includes("OwnedItem"))))
                continue;
            const itemData = item.toObject(true);
            for (let effectData of itemData.effects)
                if (effectData.origin)
                    effectData.origin = effectData.origin.replace("OwnedItem", "Item");
            itemChanges.push(itemData);
        }
        if (itemChanges.length > 0) {
            await actor.updateEmbeddedDocuments("Item", itemChanges);
            console.warn("Item changes are", actor.name, itemChanges);
        }
    }
}
export async function cleanAllTokenItemEffectOrigins() {
    for (let scene of game.scenes) {
        //@ts-ignore
        for (let tokenDocument of scene.tokens) {
            if (!tokenDocument.isLinked && tokenDocument.actor) {
                const actor = tokenDocument.actor;
                cleanActorItemsEffectOrigins(actor);
            }
        }
    }
}
export async function cleanAllActorItemsEffectOrigins() {
    //@ts-ignore
    for (let actor of game.actors.contents)
        await cleanActorItemsEffectOrigins(actor);
}
export async function cleanActorItemsEffectOrigins(actor) {
    const itemChanges = [];
    for (let item of actor.items) {
        if (!(item.effects.some(ef => ef.origin?.includes("OwnedItem"))))
            continue;
        const itemData = item.toObject(true);
        for (let effectData of itemData.effects)
            if (effectData.origin)
                effectData.origin = effectData.origin.replace("OwnedItem", "Item");
        itemChanges.push(itemData);
    }
    if (itemChanges.length > 0) {
        await actor.updateEmbeddedDocuments("Item", itemChanges);
        console.warn("Item changes are", actor.name, itemChanges);
    }
}
export async function cleanAllTokenEffectOrigins() {
    for (let scene of game.scenes) {
        //@ts-ignore
        for (let tokenDocument of scene.tokens) {
            if (!tokenDocument.isLinked && tokenDocument.actor) {
                const actor = tokenDocument.actor;
                let ownedItemEffects = actor.effects.filter(ef => ef.origin?.includes("OwnedItem"));
                let updates = ownedItemEffects.map(ef => { return { _id: ef.id, origin: ef.origin.replace("OwnedItem", "Item") }; });
                if (updates.length > 0) {
                    await actor.updateEmbeddedDocuments("ActiveEffect", updates);
                }
            }
        }
    }
}
export async function tobMapper(iconsPath = "icons/TOBTokens") {
    const pack = game.packs.get("tome-of-beasts.beasts");
    await pack.getDocuments();
    let details = pack.contents.map(a => a._source);
    let detailNames = duplicate(details).map(detail => {
        let name = detail.name
            .replace(/[_\-,'"]/g, "")
            .replace(" of", "")
            .replace(" the", "")
            .replace(/\(.*\)/, "")
            .replace(/\s\s*/g, " ")
            .replace("Adult", "")
            .replace("Chieftain", "Chieftan")
            .toLocaleLowerCase();
        name = name.split(" ");
        detail.splitName = name;
        return detail;
    });
    detailNames = detailNames.sort((a, b) => b.splitName.length - a.splitName.length);
    let fields = details.map(a => { return { "name": a.name, "id": a._id, "tokenimg": a.prototypeToken.texture.src }; });
    let count = 0;
    game.socket.emit("manageFiles", { action: "browseFiles", storage: "data", target: iconsPath }, {}, async (result) => {
        for (let fileEntry of result.files) {
            let fileNameParts = fileEntry.split("/");
            const name = fileNameParts[fileNameParts.length - 1]
                .replace(".png", "")
                .replace(/['",\-_,]/g, "")
                .replace(/-/g, "")
                .toLocaleLowerCase();
            detailNames.filter(dtname => {
                if (!dtname.splitName)
                    return false;
                for (let namePart of dtname.splitName) {
                    if (!name.includes(namePart))
                        return false;
                }
                dtname.prototypeToken.texture.src = fileEntry;
                // dtname.img = fileEntry;
                delete dtname.splitName;
                // dtname.img = fileEntry;
                count += 1;
                return true;
            });
        }
        console.log("Matched ", count, "out of", detailNames.length, detailNames);
        console.log("Unmatched ", detailNames.filter(dt => dt.splitName));
        for (let actorData of detailNames) {
            if (actorData.splitName)
                continue;
            let actor = pack.get(actorData._id);
            await actor.update(actorData);
        }
    });
}
export async function fixTransferEffects(actor) {
    let items = actor.items.filter(i => i.effects.some(e => effectIsTransfer(e)));
    let transferEffects = actor.effects.filter(e => (!e.isTemporary || effectIsTransfer(e)) && e.origin.includes("Item."));
    console.warn("Deleing effects", transferEffects);
    await actor.deleteEmbeddedDocuments("ActiveEffect", transferEffects.map(e => e.id));
    const toCreate = items.map(i => i.toObject());
    console.warn("Deleting items ", items.map(i => i.id));
    await actor.deleteEmbeddedDocuments("Item", items.map(i => i.id));
    console.warn("Creating items ", toCreate);
    await actor.createEmbeddedDocuments("Item", toCreate);
}