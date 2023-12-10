import { debug } from '../../../dae.js';
/**
 * Handles all the logic related to the Active Effect itself
 * This is an extension of the core ActiveEffect document class which
 * overrides `update` and `delete` to make them work.
 *
 * THIS IS UNSTABLE, BRITTLE, AND NOT MADE FOR USE BEYOND THIS MODULE'S USE CASE
 */
export class EditOwnedItemEffectsActiveEffect extends CONFIG.ActiveEffect.documentClass {
    constructor(effectData, owner) {
        debug('Attempting instanciation of Owned Item Effect', effectData, owner);
        // manually set the parent
        super(effectData, { parent: owner });
        debug('Instanciated Owned Item Effect', this);
    }
    /**
     * Fake Create this effect by instead updating the parent embedded Item document's array of effects.
     */
    async create(context) {
        const dataToCreate = this.toJSON();
        dataToCreate.transfer = false;
        this.transfer = false;
        debug('Attempting create on Owned Item Effect', context, dataToCreate);
        try {
            await this._preCreate(dataToCreate, context, game.userId);
        }
        catch (error) {
            console.error(error);
        }
        debug('Updating Parent', this.parent, this.toJSON(), { effect: dataToCreate });
        if (this.parent.actor?.isToken) {
            const effects = [dataToCreate].concat(this.parent.effects._source);
            await this.parent.update({
                effects
            }, context);
        }
        else {
            await this.parent.update({
                effects: [dataToCreate]
            }, context);
        }
        try {
            await this._onCreate(dataToCreate, { ...context, renderSheet: false }, game.userId);
        }
        catch (e) {
            console.error(e);
        }
    }
    /**
     * Fake delete this effect by instead updating the parent embedded Item document's array of effects.
     */
    async delete(context) {
        debug('Attempting delete on Owned Item Effect', context);
        try {
            await this._preDelete(context, game.user);
        }
        catch (error) {
            console.error(error);
        }
        const effectIdToDelete = this.id;
        let newParentEffects = this.parent.effects.filter(effect => effect.id !== effectIdToDelete);
        newParentEffects = newParentEffects.map(ef => ef.toObject());
        debug('Updating Parent', {
            effectIdToDelete,
            newParentEffects,
        });
        await this.parent.update({
            effects: newParentEffects
        }, { ...context, recursive: false });
        try {
            await this._onDelete(context, game.userId);
        }
        catch (e) {
            console.error(e);
        }
    }
    /**
     * Fake Update this Effect Document by instead updating the parent embedded Item document's array of effects.
     */
    async update(data = {}, context = {}) {
        debug('Attempting update on Owned Item Effect', data, context);
        const embeddedItem = this.parent;
        if (!(embeddedItem instanceof Item) && (embeddedItem.parent instanceof Actor)) {
            debug('Attempted to update a non owned item effect with the owned Item effect update method', data, context);
            return;
        }
        const newEffects = embeddedItem.effects.toObject();
        const originalEffectIndex = newEffects.findIndex(effect => effect._id === this.id);
        // means somehow we are editing an effect which does not exist on the item
        if (originalEffectIndex < 0) {
            return;
        }
        // merge updates directly into the array of objects
        mergeObject(newEffects[originalEffectIndex], data, context);
        const diff = diffObject(this._source, expandObject(data));
        try {
            await this._preUpdate(diff, context, game.userId);
        }
        catch (e) {
            console.error(e);
        }
        debug('Attempting update on Owned Item Effect', newEffects);
        try {
            await embeddedItem.update({
                effects: newEffects
            });
        }
        catch (e) {
            console.error(e);
        }
        this.updateSource(diff);
        try {
            await this._onUpdate(diff, context, game.userId);
        }
        catch (e) {
            console.error(e);
        }
        this.updateSource(diff);
        this.sheet.getData();
        this.sheet.render();
    }
    /**
     * Applies the effect to the grandparent actor.
     */
    async transferToActor() {
        const actor = this.parent?.parent;
        if (!actor || !(actor instanceof Actor)) {
            debug('Attempted to Transfer an effect on an unowned item.');
            return;
        }
        debug('Attempting to Transfer an effect to an Actor', { effectUuid: this.uuid, actor });
        return CONFIG.ActiveEffect.documentClass.create({
            ...this.toJSON(),
            origin: this.parent.uuid,
        }, { parent: actor });
    }
    /**
     * Gets default duration values from the provided item.
     * Assumes dnd5e data model, falls back to 1 round default.
     */
    static getDurationFromItem(item, passive) {
        if (passive === true) {
            return undefined;
        }
        if (!!item?.system.duration?.value) {
            let duration = {};
            switch (item.system.duration.units) {
                case 'hour':
                    duration.seconds = item.system.duration?.value * 60 * 60;
                    break;
                case 'minute':
                    duration.seconds = item.system.duration?.value * 60;
                    break;
                case 'day':
                    duration.seconds = item.system.duration?.value * 60 * 60 * 24;
                    break;
                case 'month':
                    duration.seconds = item.system.duration?.value * 60 * 60 * 24 * 28;
                    break;
                case 'year':
                    duration.seconds = item.system.duration?.value * 60 * 60 * 24 * 365;
                    break;
                case 'turn':
                    duration.turns = item.system.duration?.value;
                    break;
                case 'round':
                    duration.rounds = item.system.duration?.value;
                    break;
                default:
                    duration.rounds = 1;
                    break;
            }
            return duration;
        }
        return {
            rounds: 1
        };
    }
    /**
     * Overridden handlers for the buttons on the item sheet effect list
     * Assumes core active effect list controls (what 5e uses)
     */
    static onManageOwnedItemActiveEffect(event, owner) {
        event.preventDefault();
        const a = event.currentTarget;
        const li = a.closest("li");
        const effect = li.dataset.effectId ? owner.effects.get(li.dataset.effectId) : null;
        const initialEffectFromItem = {
            label: owner.name,
            icon: owner.img,
            origin: owner.uuid,
            duration: this.getDurationFromItem(owner, li.dataset.effectType === "passive"),
            disabled: li.dataset.effectType === "inactive"
        };
        const effectData = effect?.toJSON() ?? initialEffectFromItem;
        const ownedItemEffect = new EditOwnedItemEffectsActiveEffect(effectData, owner);
        switch (a.dataset.action) {
            case "create":
                //@ts-ignore
                return ownedItemEffect.create();
            case "transfer":
                return ownedItemEffect.transferToActor();
            case "delete":
                //@ts-ignore
                return ownedItemEffect.delete();
            case "edit":
                return ownedItemEffect.sheet.render(true);
        }
    }
    static create(effectData, context) {
        const parent = context.parent;
        if (!parent) {
            throw new Error('Parent must be provided on the creation context');
        }
        const ownedItemEffect = new this(effectData, parent);
        //@ts-ignore
        return ownedItemEffect.create();
    }
}