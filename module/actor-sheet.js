export default class TenCandlesActorSheet extends ActorSheet {

    /** @override */
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            classes: ["tencandles", "sheet", "actor", "character"],
            template: "systems/tencandles/templates/actor/actor-sheet.html",
            width: 600,
            height: 745
            // Removed tabs configuration - using custom hidden attribute system
        });
    }

    /** @override */
    getData() {
        const context = super.getData();
        context.system = context.actor.system;
        
        // Prefer actor.itemTypes if available (Foundry provides grouped arrays)
        const itemTypes = this.actor.itemTypes || {};
        const fallback = (t) => this.actor.items.filter(i => i.type === t);

        context.gear    = itemTypes.gear   ? [...itemTypes.gear]   : fallback("gear");
        context.virtues = itemTypes.virtue ? [...itemTypes.virtue] : fallback("virtue");
        context.vices   = itemTypes.vice   ? [...itemTypes.vice]   : fallback("vice");
        context.brinks  = itemTypes.brink  ? [...itemTypes.brink]  : fallback("brink");

    // Flags para deshabilitar botón de creación si ya existe uno
    context.hasVirtue = context.virtues.length >= 1;
    context.hasVice   = context.vices.length   >= 1;
    context.hasBrink  = context.brinks.length  >= 1;

        // Sort for stability (alphabetical)
        context.virtues.sort((a,b)=>a.name.localeCompare(b.name,"es"));
        context.vices.sort((a,b)=>a.name.localeCompare(b.name,"es"));
        context.brinks.sort((a,b)=>a.name.localeCompare(b.name,"es"));

        // Defensive fallbacks
        if (!context.virtues) context.virtues = [];
        if (!context.vices) context.vices = [];
        if (!context.brinks) context.brinks = [];

        // Removed debug logging for production cleanliness
        
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

        // Create embedded virtue/vice/brink (limited to 1 each)
        html.find('[data-action="create-entry"]').click(this._onCreateEntry.bind(this));

        // Gear management listeners
        html.find('.item-edit').click(this._onItemEdit.bind(this));
        html.find('.item-delete').click(this._onItemDeleteFromActor.bind(this));
        html.find('.create-gear').click(this._onCreateGear.bind(this));

        // Custom tab handling with hidden attribute
        html.find('.sheet-tabs .item').click(this._onTabClick.bind(this));
        
        // Initialize tabs - restore previous active tab or show main by default
        const activeTab = this._activeTab || 'main';
        this._showTab(html, activeTab);
    }

    /**
     * Open (or create) an Item sheet corresponding to a dynamic list entry (virtue/vice/brink).
     * If an embedded Item already exists with the same name and type, open it.
     * Otherwise prompt the user to convert this entry into a real Item.
     * @param {Event} event
     * @private
     */
    async _onCreateEntry(event) {
        event.preventDefault();
        const btn = event.currentTarget;
        const type = btn.dataset.type;
        if (!['virtue','vice','brink'].includes(type)) return;

        // Evitar más de uno por tipo
        const existing = this.actor.items.filter(i => i.type === type);
        if (existing.length >= 1) {
            ui.notifications.warn(game.i18n.format('TENCANDLES.Warnings.SingleItemExists', {
                itemType: game.i18n.localize(`TENCANDLES.Items.${type.charAt(0).toUpperCase()+type.slice(1)}`)
            }));
            return;
        }
        const localizedType = game.i18n.localize(`TENCANDLES.Items.${type.charAt(0).toUpperCase()+type.slice(1)}`);
        const itemData = { name: localizedType, type, system: { description: '' }};
        const created = await this.actor.createEmbeddedDocuments('Item', [itemData]);
        if (created?.length && created[0]?.sheet) {
            created[0].sheet.render(true);
        } else if (!created?.length) {
            ui.notifications.warn(game.i18n.localize('TENCANDLES.Items.CreateFailed'));
        }
    }

    /**
     * Handle tab navigation using hidden attribute
     * @param {Event} event   The originating click event
     * @private
     */
    _onTabClick(event) {
        event.preventDefault();
        const element = event.currentTarget;
        const tabName = element.dataset.tab;
        
        if (tabName) {
            this._showTab($(element).closest('.sheet'), tabName);
        }
    }

    /**
     * Show specific tab by managing hidden attributes
     * @param {jQuery} html     The sheet HTML
     * @param {string} tabName  The tab to show
     * @private
     */
    _showTab(html, tabName) {
        // Remember the active tab
        this._activeTab = tabName;
        
        // Hide all tabs
        html.find('.sheet-body .tab').each(function() {
            this.setAttribute('hidden', '');
        });
        
        // Show selected tab
        const selectedTab = html.find(`.sheet-body .tab[data-tab="${tabName}"]`)[0];
        if (selectedTab) {
            selectedTab.removeAttribute('hidden');
        }
        
        // Update tab navigation visual state
        html.find('.sheet-tabs .item').removeClass('active');
        html.find(`.sheet-tabs .item[data-tab="${tabName}"]`).addClass('active');
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
        // Add re-roll button if there are failures (1s), regardless of successes
        if (failures > 0) {
            messageContent += `<button type="button" class="reroll-dice-button" data-num-dice="${failures}" data-actor-id="${this.actor.id}" data-original-failures="${failures}" style="
                background: linear-gradient(45deg, #2a2a2a, #1a1a1a);
                color: #c2c2c2; /* --color-text-light */
                border: 2px solid #e76f51; /* --color-dying-flame */
                border-radius: 8px;
                padding: 5px 10px; /* Keep it smaller than the main roll button */
                margin-top: 10px;
                cursor: pointer;
                font-size: 14px; /* Keep it smaller than the main roll button */
                width: 100%;
                box-sizing: border-box;
                text-transform: uppercase;
                letter-spacing: 1px; /* Slightly less than main roll button */
                font-family: 'Special Elite', cursive; /* Use the correct font */
                font-weight: bold;
                text-shadow: 0 0 8px rgba(255, 196, 0, 0.4); /* --glow-flame-medium */
                box-shadow: 0 4px 8px rgba(0, 0, 0, 0.5);
            ">Re-roll ${failures} dice</button>`; // Updated button text
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
    // Removed _onItemAdd and _onItemDelete (dynamic arrays replaced by embedded documents)

    /** @override */
    async _onDropItem(event, data) {
        if (!this.actor.isOwner) return false;
        const item = await Item.implementation.fromDropData(data);

        // Normalize to embedded items only; enforce single virtue/vice/brink rule.
        if (["virtue","vice","brink"].includes(item.type)) {
            const count = this.actor.items.filter(i=>i.type===item.type).length;
            if (count >= 1) {
                ui.notifications.warn(game.i18n.format('TENCANDLES.Warnings.SingleItemExists', {
                    itemType: game.i18n.localize(`TENCANDLES.Items.${item.type.charAt(0).toUpperCase()+item.type.slice(1)}`)
                }));
                return false;
            }
            return this.actor.createEmbeddedDocuments('Item', [item.toObject()]);
        }

        if (item.type === 'gear') {
            return this.actor.createEmbeddedDocuments('Item', [item.toObject()]);
        }

        ui.notifications.error(game.i18n.localize('TENCANDLES.Items.InvalidType'));
        return false;
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
        const itemData = { name: game.i18n.localize("TENCANDLES.ActorSheet.NewGearName"), type: 'gear', system: { description: '', quantity: 1, weight: 0, itemType: 'gear' } };
        const created = await this.actor.createEmbeddedDocuments('Item', [itemData]);
        if (created?.length && created[0]?.sheet) {
            created[0].sheet.render(true);
        } else if (!created?.length) {
            ui.notifications.warn(game.i18n.localize('TENCANDLES.Items.CreateFailed'));
        }
    }
}
