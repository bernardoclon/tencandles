export default class TenCandlesActorSheet extends ActorSheet {

    /** @override */
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            classes: ["tencandles", "sheet", "actor", "character"],
            template: "systems/tencandles/templates/actor/actor-sheet.html",
            width: 600,
            height: 790
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
    context.moments = itemTypes.moment ? [...itemTypes.moment] : fallback("moment");
    // Whether the actor has the special Hope checkbox enabled
    context.hope = this.actor.getFlag('tencandles', 'hope') || false;

    // Flags para deshabilitar botón de creación si ya existe uno
    context.hasVirtue = context.virtues.length >= 1;
    context.hasVice   = context.vices.length   >= 1;
    context.hasBrink  = context.brinks.length  >= 1;
    context.hasMoment = context.moments.length >= 1;

        // Sort for stability (alphabetical)
        context.virtues.sort((a,b)=>a.name.localeCompare(b.name,"es"));
        context.vices.sort((a,b)=>a.name.localeCompare(b.name,"es"));
    context.brinks.sort((a,b)=>a.name.localeCompare(b.name,"es"));
    context.moments.sort((a,b)=>a.name.localeCompare(b.name,"es"));

        // Defensive fallbacks
        if (!context.virtues) context.virtues = [];
        if (!context.vices) context.vices = [];
    if (!context.brinks) context.brinks = [];
    if (!context.moments) context.moments = [];

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
    // Button shown on actor sheet to repeat the actor's last roll (die-shaped button)
    html.find('.repeat-last-roll').click(this._onRepeatLastRoll.bind(this));
    html.find('.hope-checkbox').change(this._onToggleHope.bind(this));

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

    async _onToggleHope(event) {
        event.preventDefault();
        const checked = event.currentTarget.checked;
        // Prevent enabling hope if actor has any Moment
        const hasMoment = this.actor.items.filter(i => i.type === 'moment').length > 0;
        if (checked && hasMoment) {
            ui.notifications.warn(game.i18n.localize('TENCANDLES.ActorSheet.MomentBlocksHope') || 'Cannot enable Hope while Momento exists.');
            // Force uncheck visually
            event.currentTarget.checked = false;
            return;
        }
        // Persist on actor flag
        await this.actor.setFlag('tencandles', 'hope', checked);
        // Re-render sheet to reflect change
        this.render();
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
    if (!['virtue','vice','brink','moment'].includes(type)) return;

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
            // If a Moment was created, clear the Hope flag so the checkbox deactivates
            if (type === 'moment') {
                try {
                    await this.actor.setFlag('tencandles', 'hope', false);
                } catch (err) {
                    // ignore
                }
            }
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

        // Determine if actor has Hope enabled and no Moments
        const hopeFlag = (await this.actor.getFlag('tencandles', 'hope')) || false;
        const hasMoments = this.actor.items.filter(i => i.type === 'moment').length > 0;
        const hopeActive = hopeFlag && !hasMoments;

        // Build a combined roll notation so Dice So Nice can render all dice together
        const combinedNotation = hopeActive ? `${availableDice}d6 + 1d6` : `${availableDice}d6`;
        const combinedRoll = new Roll(combinedNotation);
        await combinedRoll.evaluate({ async: true });

        // Extract dice term results: main dice are the first dice-term, hope is the last if present
        const diceTerms = combinedRoll.terms.filter(t => t.results && t.results.length > 0);
        const mainResults = diceTerms.length > 0 ? diceTerms[0].results : [];
        const hopeResults = (hopeActive && diceTerms.length > 1) ? diceTerms[diceTerms.length - 1].results : null;

        const successesMain = mainResults.filter(r => r.result === 6).length;
        const failuresMain = mainResults.filter(r => r.result === 1).length;

        let successesHope = 0;
        let hopeRolledOne = false;
        if (hopeResults) {
            const hr = hopeResults[0].result;
            if (hr >= 5) successesHope = 1; // special die counts success on 5 or 6
            if (hr === 1) hopeRolledOne = true; // special die 1 does NOT add penalty
        }

        const successes = successesMain + successesHope;
        const failures = failuresMain; // Do NOT count the hope die's 1 as a failure for penalty

        // Store last roll info on the actor so other UI can repeat it; include whether hope applied
        try {
            await this.actor.setFlag('tencandles', 'lastRoll', { numDice: availableDice, failures: failuresMain, hopeApplied: hopeActive, timestamp: Date.now() });
        } catch (err) {
            // Silently ignore flag write errors
        }

        // Update dice penalty based only on main roll 1s
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

        // Display dice results visually (main dice)
        messageContent += `<div class="dice-results">`;
        const diceUnicode = ['<i class="fas fa-dice-one"></i>', '<i class="fas fa-dice-two"></i>', '<i class="fas fa-dice-three"></i>', '<i class="fas fa-dice-four"></i>', '<i class="fas fa-dice-five"></i>', '<i class="fas fa-dice-six"></i>'];
        mainResults.forEach(r => {
            const result = r.result;
            let dieClass = 'die';
            if (result === 1) dieClass += ' failure';
            else if (result === 6) dieClass += ' success';
            else dieClass += ' neutral';
            messageContent += `<span class="${dieClass}">${diceUnicode[result - 1]}</span>`;
        });

        // If hope die was rolled, display it with a distinct class so it's visually distinguishable
        if (hopeResults) {
            const hr = hopeResults[0].result;
            let hopeClass = 'die hope-die';
            if (hr === 1) hopeClass += ' neutral'; // visually neutral for penalty purposes
            else if (hr >= 5) hopeClass += ' success';
            else hopeClass += ' neutral';
            messageContent += `<span class="${hopeClass}">${diceUnicode[hr - 1]}</span>`;
        }
        messageContent += `</div>`;

        // Simple result text
        if (successes > 0) {
            messageContent += `<div class="result-overlay success">${successtext}</div>`;
        } else {
            messageContent += `<div class="result-overlay failure">${failuretext}</div>`;
        }
        // If no successes (no 6s), offer a full re-roll of the same dice count.
    // Only show chat re-roll buttons to the actor who rolled and only if they have a Virtue or Vice
    // and only if the roll produced one or more 1s (failures)
    const hasVirtueOrVice = this.actor.items.some(i => i.type === 'virtue' || i.type === 'vice');
    const hasFailures = (failures > 0);
    // Show a single re-roll button that re-rolls only the dice that showed 1s (failures)
    if (hasVirtueOrVice && hasFailures) {
        messageContent += `<button type="button" class="reroll-dice-button" data-num-dice="${failures}" data-actor-id="${this.actor.id}" data-original-failures="${failures}" data-reroll-type="failures" style="
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
            ">Re-roll ${failures} ${rollindice2text}</button>`; // Re-roll only the failures
    }
        messageContent += `</div>`; // close roll-results
        messageContent += `</div>`; // close tencandles-roll-card

        // Create the chat message
        // Send the combined roll so Dice So Nice and other modules render all dice
        const chatData = {
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            flavor: messageContent
        };
        await combinedRoll.toMessage(chatData);

        // Attempt to color the Hope die in Dice So Nice if available.
        // This is a best-effort call: if the Dice So Nice API isn't present or differs, we silently ignore errors.
        try {
            if (game?.dice3d && typeof game.dice3d.show === 'function' && hopeResults) {
                // Ask Dice So Nice to show the same Roll animation. Many Dice So Nice versions accept a Roll
                // and optional options. We attempt a generic call with a color override for the last die.
                // Note: This may be ignored by Dice So Nice if it doesn't support these options.
                const hopeIndex = mainResults.length; // zero-based index of the hope die in the combined roll
                const dsnOptions = {
                    // speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                    // colors: [{ index: hopeIndex, color: '#ffd166' }]
                };
                // Call show as best-effort. Many DSN builds accept (roll, options).
                await game.dice3d.show(combinedRoll, dsnOptions);
            }
        } catch (err) {
            // Silently ignore any Dice So Nice integration errors
            // console.debug('Dice3D coloring not applied', err);
        }

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
    if (["virtue","vice","brink","moment"].includes(item.type)) {
            const count = this.actor.items.filter(i=>i.type===item.type).length;
            if (count >= 1) {
                ui.notifications.warn(game.i18n.format('TENCANDLES.Warnings.SingleItemExists', {
                    itemType: game.i18n.localize(`TENCANDLES.Items.${item.type.charAt(0).toUpperCase()+item.type.slice(1)}`)
                }));
                return false;
            }
            // Create and, if it's a Moment, clear the Hope flag so the checkbox deactivates
            const created = await this.actor.createEmbeddedDocuments('Item', [item.toObject()]);
            if (created?.length && item.type === 'moment') {
                try {
                    await this.actor.setFlag('tencandles', 'hope', false);
                } catch (err) {
                    // ignore
                }
            }
            return created;
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

    /**
     * Repeat the actor's last roll (special button shown when actor has no virtues nor vices).
     * This repeats the last roll's dice count and adds any 1s rolled to the global dice penalty.
     * @param {Event} event
     */
    async _onRepeatLastRoll(event) {
        event.preventDefault();

        // Only allowed if actor truly has no virtues and no vices (UI should already enforce this)
        const hasVirtue = this.actor.items.filter(i => i.type === 'virtue').length > 0;
        const hasVice = this.actor.items.filter(i => i.type === 'vice').length > 0;
        if (hasVirtue || hasVice) {
            ui.notifications.warn(game.i18n.localize('TENCANDLES.ActorSheet.RepeatNotAllowed'));
            return;
        }

        const last = this.actor.getFlag('tencandles', 'lastRoll');
        if (!last || !last.numDice) {
            ui.notifications.warn(game.i18n.localize('TENCANDLES.Roll.NoPreviousRoll'));
            return;
        }

        const numDice = last.numDice;

        // If the last roll had failures, restore those dice first (remove their penalty)
        if (last.failures && last.failures > 0) {
            const restore = last.failures;
            if (game.user.isGM) {
                const currentPenalty = game.settings.get("tencandles", "dicePenalty");
                const newPenalty = Math.max(0, currentPenalty - restore);
                await game.settings.set("tencandles", "dicePenalty", newPenalty);
            } else {
                game.socket.emit('system.tencandles', {
                    type: 'subtractDicePenalty',
                    payload: { failures: restore }
                });
            }
        }

        const flavortext =  game.i18n.localize("TENCANDLES.Roll.Flavor");
        const rollindice1text =  game.i18n.localize("TENCANDLES.Roll.RollingDice1");
        const rollindice2text =  game.i18n.localize("TENCANDLES.Roll.RollingDice2");
        const repeattext =  game.i18n.localize("TENCANDLES.Roll.Repeatroll");
        const successtext =  game.i18n.localize("TENCANDLES.Roll.Success");
        const failuretext =  game.i18n.localize("TENCANDLES.Roll.Failure");

        // Determine whether to apply Hope special die for repeats: only if last indicated it was applied and actor still has hope and no moments exist
        const lastHope = last.hopeApplied || false;
        const hopeFlag = (await this.actor.getFlag('tencandles', 'hope')) || false;
        const hasMomentsNow = this.actor.items.filter(i => i.type === 'moment').length > 0;
        const hopeActive = lastHope && hopeFlag && !hasMomentsNow;

        // Build a combined roll so Dice So Nice can render all dice together
        const combinedNotation = hopeActive ? `${numDice}d6 + 1d6` : `${numDice}d6`;
        const combinedRoll = new Roll(combinedNotation);
        await combinedRoll.evaluate({ async: true });

        const diceTerms = combinedRoll.terms.filter(t => t.results && t.results.length > 0);
        const mainResults = diceTerms.length > 0 ? diceTerms[0].results : [];
        const hopeResults = (hopeActive && diceTerms.length > 1) ? diceTerms[diceTerms.length - 1].results : null;

        const successesMain = mainResults.filter(r => r.result === 6).length;
        const failuresMain = mainResults.filter(r => r.result === 1).length;

        let successesHope = 0;
        let hopeRolledOne = false;
        if (hopeResults) {
            const hr = hopeResults[0].result;
            if (hr >= 5) successesHope = 1;
            if (hr === 1) hopeRolledOne = true;
        }

        const successes = successesMain + successesHope;
        const failures = failuresMain; // do not count hope die 1 as penalty

        // Update dice penalty based only on main roll 1s
        if (failures > 0) {
            if (game.user.isGM) {
                const currentPenalty = game.settings.get("tencandles", "dicePenalty");
                const newPenalty = currentPenalty + failures;
                await game.settings.set("tencandles", "dicePenalty", newPenalty);
            } else {
                game.socket.emit('system.tencandles', {
                    type: 'updateDicePenalty',
                    payload: { failures }
                });
            }
        }

        // Build chat message content
        let messageContent = `<div class="tencandles-roll-card tencandles-roll">
            <div class="roll-header">
                <h2>${this.actor.name} ${flavortext} (${repeattext}})</h2>
                <p>${rollindice1text} ${numDice} ${rollindice2text}</p>
            </div>`;

        messageContent += `<div class="roll-results">`;
        messageContent += `<div class="dice-results">`;
        const diceUnicode = ['<i class="fas fa-dice-one"></i>', '<i class="fas fa-dice-two"></i>', '<i class="fas fa-dice-three"></i>', '<i class="fas fa-dice-four"></i>', '<i class="fas fa-dice-five"></i>', '<i class="fas fa-dice-six"></i>'];
        mainResults.forEach(r => {
            const result = r.result;
            let dieClass = 'die';
            if (result === 1) dieClass += ' failure';
            else if (result === 6) dieClass += ' success';
            else dieClass += ' neutral';
            messageContent += `<span class="${dieClass}">${diceUnicode[result - 1]}</span>`;
        });

        if (hopeResults) {
            const hr = hopeResults[0].result;
            let hopeClass = 'die hope-die';
            if (hr === 1) hopeClass += ' neutral';
            else if (hr >= 5) hopeClass += ' success';
            else hopeClass += ' neutral';
            messageContent += `<span class="${hopeClass}">${diceUnicode[hr - 1]}</span>`;
        }
        messageContent += `</div>`;

        if (successes > 0) {
            messageContent += `<div class="result-overlay success">${successtext}</div>`;
        } else {
            messageContent += `<div class="result-overlay failure">${failuretext}</div>`;
        }

        messageContent += `</div>`; // close roll-results
        messageContent += `</div>`; // close tencandles-roll-card

        const chatData = { speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: messageContent };
        await combinedRoll.toMessage(chatData);

        try {
            if (game?.dice3d && typeof game.dice3d.show === 'function' && hopeResults) {
                const hopeIndex = mainResults.length;
                const dsnOptions = {};
                await game.dice3d.show(combinedRoll, dsnOptions);
            }
        } catch (err) {
            // ignore
        }

        // Update lastRoll with the results of this repeat so future repeats use the new baseline
        try {
            await this.actor.setFlag('tencandles', 'lastRoll', { numDice: numDice, failures: failuresMain, hopeApplied: hopeActive, timestamp: Date.now() });
        } catch (err) {
            // Silently ignore flag update errors
        }

        // If this repeat produced no successes, consume (delete) one Brink from the actor
        if (successes === 0) {
            const brinks = this.actor.items.filter(i => i.type === 'brink');
            if (brinks.length > 0) {
                // Choose the last brink (visual/UX: consume the most recently listed)
                const toDelete = brinks[brinks.length - 1];
                try {
                    await toDelete.delete();
                    ui.notifications.info(game.i18n.localize('TENCANDLES.ActorSheet.BrinkRemoved'));
                } catch (err) {
                    console.error('Could not remove brink after failed repeat', err);
                    // If we're not the GM, ask the GM to remove it via socket
                    if (!game.user.isGM) {
                        game.socket.emit('system.tencandles', {
                            type: 'deleteBrink',
                            payload: { actorId: this.actor.id, itemId: toDelete.id }
                        });
                    } else {
                        ui.notifications.warn(game.i18n.localize('TENCANDLES.ActorSheet.BrinkRemoveFailed'));
                    }
                }
            }
        }
    }
}
