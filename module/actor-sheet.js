export default class TenCandlesActorSheet extends ActorSheet {

    /** @override */
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            classes: ["tencandles", "sheet", "actor", "character"],
            template: "systems/tencandles/templates/actor/actor-sheet.html",
            width: 600,
            height: 650,
            tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main" }]
        });
    }

    /** @override */
    getData() {
        const context = super.getData();
        context.system = context.actor.system;

        // Initialize dynamic lists if they don't exist
        context.system.virtues = context.system.virtues || [];
        context.system.vices = context.system.vices || [];
        context.system.brinks = context.system.brinks || [];

        // Get owned gear items
        context.gear = this.actor.items.filter(i => i.type === "gear");
        
        // Calculate total weight for gear
        context.totalWeight = context.gear.reduce((total, item) => {
            const weight = item.system.weight || 0;
            const quantity = item.system.quantity || 1;
            return total + (weight * quantity);
        }, 0);

        return context;
    }

    /** @override */
    activateListeners(html) {
        super.activateListeners(html);
        html.find('.roll-dice').click(this._onRoll.bind(this));

        // Listeners for dynamic item lists
        html.find('[data-action="add"]').click(this._onItemAdd.bind(this));
        html.find('[data-action="delete"]').click(this._onItemDelete.bind(this));

        // Gear management listeners
        html.find('.item-edit').click(this._onItemEdit.bind(this));
        html.find('.item-delete').click(this._onItemDeleteFromActor.bind(this));
        html.find('.create-gear').click(this._onCreateGear.bind(this));
    }

    /**
     * Handle the roll button click.
     * @param {Event} event   The originating click event
     * @private
     */
    async _onRoll(event) {
        event.preventDefault();

        const litCandles = game.settings.get("tencandles", "litCandles");
        const dicePenalty = game.settings.get("tencandles", "dicePenalty");
        const availableDice = Math.max(0, litCandles - dicePenalty);
        const flavortext =  game.i18n.localize("TENCANDLES.Roll.Flavor");
        const rollindice1text =  game.i18n.localize("TENCANDLES.Roll.RollingDice1");
        const rollindice2text =  game.i18n.localize("TENCANDLES.Roll.RollingDice2");
        const penaltytext =  game.i18n.localize("TENCANDLES.Roll.PenaltyText");
        const candlestext =  game.i18n.localize("TENCANDLES.Roll.CandlesText");
        const successtext =  game.i18n.localize("TENCANDLES.Roll.Success");
        const failuretext =  game.i18n.localize("TENCANDLES.Roll.Failure");


        if (litCandles <= 0) {
            ui.notifications.warn(game.i18n.localize("TENCANDLES.Roll.NoCandles"));
            return;
        }

        if (availableDice <= 0) {
            ui.notifications.warn(game.i18n.localize("TENCANDLES.Roll.NoDiceReset"));
            return;
        }

        const roll = new Roll(`${availableDice}d6`);
        await roll.evaluate({async: true});

        const successes = roll.terms[0].results.filter(r => r.result === 6).length;
        const failures = roll.terms[0].results.filter(r => r.result === 1).length;

        // Update dice penalty based on number of 1s rolled
        if (failures > 0) {
            if (game.user.isGM) {
                const newPenalty = dicePenalty + failures;
                await game.settings.set("tencandles", "dicePenalty", newPenalty);
            } else {
                game.socket.emit('system.tencandles', {
                    type: 'updateDicePenalty',
                    payload: { failures }
                });
            }
        }

        let messageContent = `<div class="tencandles-roll-card tencandles-roll">
            <div class="roll-header">
                <h2>${this.actor.name} ${flavortext}</h2>
                <p>${rollindice1text} ${availableDice} ${rollindice2text}</p>
            </div>`;

        if (dicePenalty > 0) {
            messageContent += `<div class="penalty-text">(${litCandles} ${candlestext} - ${dicePenalty} ${penaltytext})</div>`;
        }

        messageContent += `<div class="roll-results">`;

        // Display dice results visually
        messageContent += `<div class="dice-results">`;
        const diceUnicode = ['<i class="fas fa-dice-one"></i>', '<i class="fas fa-dice-two"></i>', '<i class="fas fa-dice-three"></i>', '<i class="fas fa-dice-four"></i>', '<i class="fas fa-dice-five"></i>', '<i class="fas fa-dice-six"></i>'];
        roll.terms[0].results.forEach(r => {
            const result = r.result;
            let dieClass = 'die';
            if (result === 1) dieClass += ' failure';
            else if (result === 6) dieClass += ' success';
            else dieClass += ' neutral';
            messageContent += `<span class="${dieClass}">${diceUnicode[result - 1]}</span>`;
        });
        messageContent += `</div>`;

        // Simple result text
        if (successes > 0) {
            messageContent += `<div class="result-overlay success">${successtext}</div>`;
        } else {
            messageContent += `<div class="result-overlay failure">${failuretext}</div>`;
        }
        messageContent += `</div>`; // close roll-results
        messageContent += `</div>`; // close tencandles-roll-card

        // Create the chat message
        roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            flavor: messageContent
        });

    }

    /**
     * Handle adding a new item to a list.
     * @param {Event} event   The originating click event
     * @private
     */
    _onItemAdd(event) {
        event.preventDefault();
        const button = event.currentTarget;
        const listPath = button.dataset.listPath;
        const currentList = foundry.utils.getProperty(this.actor.system, listPath) || [];

        // Add a new empty object to the list
        currentList.push({ value: "" });

        // Update the actor data
        this.actor.update({ [listPath]: currentList });
    }

    /**
     * Handle deleting an item from a list.
     * @param {Event} event   The originating click event
     * @private
     */
    _onItemDelete(event) {
        event.preventDefault();
        const button = event.currentTarget;
        const listPath = button.dataset.listPath;
        const index = button.closest('.item-row').dataset.itemIndex;
        const currentList = foundry.utils.getProperty(this.actor.system, listPath) || [];

        // Remove the item at the specified index
        currentList.splice(index, 1);

        // Update the actor data
        this.actor.update({ [listPath]: currentList });
    }

    /** @override */
    async _onDropItem(event, data) {
        if (!this.actor.isOwner) return false;
        
        const item = await Item.implementation.fromDropData(data);
        
        // Handle gear items differently - they become actual owned items
        if (item.type === "gear") {
            // Check if this item type is allowed
            if (!["virtue", "vice", "brink", "gear"].includes(item.type)) {
                ui.notifications.error(game.i18n.localize("TENCANDLES.Items.InvalidType"));
                return false;
            }
            
            // Create a copy of the item on the actor
            return this.actor.createEmbeddedDocuments("Item", [item.toObject()]);
        }
        
        // Handle other item types (virtue, vice, brink) - they go into dynamic lists
        const typeToListMap = {
            virtue: "system.virtues",
            vice: "system.vices", 
            brink: "system.brinks"
        };
        
        const listPath = typeToListMap[item.type];
        if (!listPath) {
            ui.notifications.error(game.i18n.localize("TENCANDLES.Items.InvalidType"));
            return false;
        }
        
        // Get current list and add the item data
        const currentList = foundry.utils.getProperty(this.actor.system, listPath) || [];
        const newItem = {
            value: item.name,
            description: item.system.description || ""
        };
        
        currentList.push(newItem);
        
        // Update the actor data
        await this.actor.update({ [listPath]: currentList });
        
        ui.notifications.info(game.i18n.format("TENCANDLES.Items.AddedToList", {
            itemName: item.name,
            listType: game.i18n.localize(`TENCANDLES.Items.${item.type.charAt(0).toUpperCase() + item.type.slice(1)}`)
        }));
        
        return true;
    }

    /**
     * Handle editing an owned item
     * @param {Event} event   The originating click event
     * @private
     */
    _onItemEdit(event) {
        event.preventDefault();
        const li = $(event.currentTarget).parents(".item");
        const item = this.actor.items.get(li.data("item-id"));
        item.sheet.render(true);
    }

    /**
     * Handle deleting an owned item from the actor
     * @param {Event} event   The originating click event
     * @private
     */
    async _onItemDeleteFromActor(event) {
        event.preventDefault();
        const li = $(event.currentTarget).parents(".item");
        const item = this.actor.items.get(li.data("item-id"));
        
        const confirmDelete = await Dialog.confirm({
            title: game.i18n.localize("TENCANDLES.Items.DeleteConfirmTitle"),
            content: game.i18n.format("TENCANDLES.Items.DeleteConfirmMessage", {name: item.name}),
            yes: () => true,
            no: () => false
        });
        
        if (confirmDelete) {
            await item.delete();
        }
    }

    /**
     * Handle creating a new gear item directly from the actor sheet
     * @param {Event} event   The originating click event
     * @private
     */
    async _onCreateGear(event) {
        event.preventDefault();
        
        const newGearName = game.i18n.localize("TENCANDLES.ActorSheet.NewGearName");
        
        const itemData = {
            name: newGearName,
            type: "gear",
            system: {
                description: "",
                quantity: 1,
                weight: 0,
                itemType: "gear"
            }
        };
        
        // Create the gear item on the actor
        const createdItems = await this.actor.createEmbeddedDocuments("Item", [itemData]);
        
        // Open the sheet for the newly created item for immediate editing
        if (createdItems.length > 0) {
            createdItems[0].sheet.render(true);
        }
    }
}
