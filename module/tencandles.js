import TenCandlesActorSheet from "./actor-sheet.js";
import TenCandlesItemSheet from "./item-sheet.js";
import { GMPanel } from "./gm-panel.js";

let gmPanelInstance = null; // Store the GMPanel instance

Hooks.once('init', async function() {

    // Register Handlebars helpers
    Handlebars.registerHelper('add', function (a, b) {
        return a + b;
    });
    
    Handlebars.registerHelper('eq', function (a, b) {
        return a === b;
    });

    // Game setting for candle count
    game.settings.register("tencandles", "litCandles", {
        name: "Lit Candles",
        hint: "The number of currently lit candles.",
        scope: "world",
        config: false, // GM will manage this through a custom panel
        type: Number,
        default: 10,
        onChange: value => {
            // Optional: Add logic to refresh UI elements when the value changes
            if (gmPanelInstance) {
                gmPanelInstance.render(true);
            }
        }
    });

    // Game setting for dice penalty from rolling 1s
    game.settings.register("tencandles", "dicePenalty", {
        name: "Dice Penalty",
        hint: "The number of dice lost due to rolling 1s.",
        scope: "world",
        config: false,
        type: Number,
        default: 0,
        onChange: value => {
            // Refresh UI when penalty changes
            if (gmPanelInstance) {
                gmPanelInstance.render(true);
            }
        }
    });

    // Unregister core sheets
    Actors.unregisterSheet("core", ActorSheet);
    Items.unregisterSheet("core", ItemSheet);

    // Register Ten Candles sheet application classes
    Actors.registerSheet("tencandles", TenCandlesActorSheet, {
        types: ["character"],
        makeDefault: true,
        label: "Ten Candles Character Sheet"
    });
    Items.registerSheet("tencandles", TenCandlesItemSheet, {
        types: ["virtue", "vice", "brink", "moment", "gear"],
        makeDefault: true,
        label: "Ten Candles Item Sheet"
    });


});

Hooks.on("renderActorDirectory", (app, html, data) => {
    if (!game.user.isGM) {
        return;
    }

    const jqHtml = $(html);

    const header = jqHtml.find(".directory-header");
    if (header.length === 0) {
        return;
    }

    // Prevent adding the button multiple times
    if (jqHtml.find(".candle-tracker-btn").length > 0) {
        return;
    }

    const TrackerTitleb = game.i18n.localize("TENCANDLES.GM.TrackerTitle");
    
    const button = $(`
        <div class="header-actions action-buttons flexrow">
            <button class="candle-tracker-btn flex1" style="margin-bottom: 5px; width: 90%; margin-left: 5%; margin-right: 5%;">
                <i class="fas fa-fire"></i> ${TrackerTitleb} </button>
        </div>
    `);

    button.on("click", (ev) => {
        ev.preventDefault();
        if (!gmPanelInstance) {
            gmPanelInstance = new GMPanel();
        }

        if (gmPanelInstance.rendered === false) {
            gmPanelInstance.render(true);
        } else {
            gmPanelInstance.close();
        }
    });

    header.after(button);
});

Hooks.on('ready', function() {
    game.socket.on('system.tencandles', async (data) => {
        if (game.user.isGM) {
            if (data.type === 'updateDicePenalty') {
                const { failures } = data.payload;
                const currentPenalty = game.settings.get("tencandles", "dicePenalty");
                const newPenalty = currentPenalty + failures;
                game.settings.set("tencandles", "dicePenalty", newPenalty);
            } else if (data.type === 'subtractDicePenalty') { // New handler for subtracting penalty
                const { failures } = data.payload;
                const currentPenalty = game.settings.get("tencandles", "dicePenalty");
                const newPenalty = Math.max(0, currentPenalty - failures); // Ensure penalty doesn't go below 0
                game.settings.set("tencandles", "dicePenalty", newPenalty);
            } else if (data.type === 'performReroll') {
                // Perform a reroll on the GM and update penalty atomically.
                // Supports two modes: simple chat re-rolls and 'repeat' re-rolls (from Brinks) which include Hope die and actor updates.
                const { numDice, actorId, originalFailures, requestUserId, hopeActive, repeat, consumeBrink } = data.payload || {};
                const actor = game.actors.get(actorId);
                if (!actor) return;

                // Build notation including Hope die when requested
                const notation = (repeat && hopeActive) ? `${numDice}d6 + 1d6` : `${numDice}d6`;
                const roll = new Roll(notation);
                await roll.evaluate({ async: true });

                // Extract main and hope results
                const diceTerms = roll.terms.filter(t => t.results && t.results.length > 0);
                const mainResults = diceTerms.length > 0 ? diceTerms[0].results : [];
                const hopeResults = (repeat && hopeActive && diceTerms.length > 1) ? diceTerms[diceTerms.length - 1].results : null;

                const failuresMain = mainResults.filter(r => r.result === 1).length;
                const successesMain = mainResults.filter(r => r.result === 6).length;

                let successesHope = 0;
                let hopeRolledOne = false;
                if (hopeResults) {
                    const hr = hopeResults[0].result;
                    if (hr >= 5) successesHope = 1; // 5 or 6 counts as success
                    if (hr === 1) hopeRolledOne = true; // hope 1 is neutral for penalty
                }

                const successes = successesMain + successesHope;

                // Update dice penalty atomically: subtract originalFailures and add failuresMain
                const currentPenalty = game.settings.get("tencandles", "dicePenalty");
                const newPenalty = Math.max(0, currentPenalty - (originalFailures || 0) + failuresMain);
                await game.settings.set("tencandles", "dicePenalty", newPenalty);

                // Build chat message content
                const flavortext = game.i18n.localize("TENCANDLES.Roll.Flavor");
                const rollindice1text = game.i18n.localize("TENCANDLES.Roll.RollingDice1");
                const rollindice2text = game.i18n.localize("TENCANDLES.Roll.RollingDice2");
                const successtext = game.i18n.localize("TENCANDLES.Roll.Success");
                const failuretext = game.i18n.localize("TENCANDLES.Roll.Failure");

                const kindLabel = repeat ? game.i18n.localize("TENCANDLES.Roll.Repeatroll") : game.i18n.localize("TENCANDLES.Chat.ReRolled") || "Re-roll";

                let messageContent = `<div class="tencandles-roll-card tencandles-roll">
                    <div class="roll-header">
                        <h2>${actor.name} ${flavortext} ${repeat ? `(${kindLabel})` : `(${kindLabel})`}</h2>
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

                // Post the chat message as the GM
                await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: actor }), flavor: messageContent });

                // If this was a repeat-style reroll, update actor flags and possibly consume a Brink
                if (repeat) {
                    try {
                        await actor.setFlag('tencandles', 'lastRoll', { numDice: numDice, failures: failuresMain, hopeApplied: !!hopeActive, timestamp: Date.now() });
                    } catch (err) {
                        // ignore
                    }

                    // If no successes, consume (delete) one Brink from the actor
                    if (successes === 0 && consumeBrink) {
                        const brinks = actor.items.filter(i => i.type === 'brink');
                        if (brinks.length > 0) {
                            const toDelete = brinks[brinks.length - 1];
                            try {
                                await toDelete.delete();
                                ui.notifications.info(game.i18n.localize('TENCANDLES.ActorSheet.BrinkRemoved'));
                                // Re-render the actor sheet if open
                                const sheet = actor.sheet;
                                if (sheet && sheet.rendered) sheet.render(true);
                            } catch (err) {
                                console.error('Could not remove brink after repeat performed by GM', err);
                                ui.notifications.warn(game.i18n.localize('TENCANDLES.ActorSheet.BrinkRemoveFailed'));
                            }
                        }
                    }
                }
            } else if (data.type === 'deleteBrink') {
                // GM processes deletion requests for brinks coming from non-GM clients
                const { actorId, itemId } = data.payload || {};
                const actor = game.actors.get(actorId);
                if (actor && itemId) {
                    const item = actor.items.get(itemId);
                    if (item) {
                        try {
                            await item.delete();
                            // Re-render any open actor sheet for that actor
                            const sheet = actor.sheet;
                            if (sheet && sheet.rendered) sheet.render(true);
                            ui.notifications.info(game.i18n.localize('TENCANDLES.ActorSheet.BrinkRemoved'));
                        } catch (err) {
                            console.error('GM failed to delete brink via socket request', err);
                            ui.notifications.warn(game.i18n.localize('TENCANDLES.ActorSheet.BrinkRemoveFailed'));
                        }
                    }
                }
            }
        }
    });
});

// NOTE: Rerolls are handled by the GM atomically via the 'performReroll' socket message.

Hooks.on('renderChatMessage', (app, html, data) => {
    const rerollButtons = html.find('.reroll-dice-button');
    if (rerollButtons.length > 0) {
        rerollButtons.each((i, el) => {
            const $btn = $(el);
            const actorId = $btn.data('actor-id');
            const actor = game.actors.get(actorId);
            // Only allow the user who owns the actor to see/use the reroll button
            if (!actor || !actor.isOwner) {
                // Hide the button for users who did not perform the roll
                $btn.hide();
                return;
            }
            // Attach click handler for the owner
            $btn.on('click', async (event) => {
                const button = event.currentTarget;
                if (button.disabled) return; // Prevent multiple clicks

                button.disabled = true; // Disable the button
                button.innerText = game.i18n.localize('TENCANDLES.Chat.ReRolled') || "Re-rolled"; // Localized
                const numDice = parseInt(button.dataset.numDice);
                const rerollType = button.dataset.rerollType || 'failures';

                // For failures-based rerolls we request the GM to perform the reroll atomically
                if (rerollType === 'failures') {
                    const originalFailures = parseInt(button.dataset.originalFailures) || 0; // Get original failures
                    // Send a single request to the GM to perform the reroll and update penalty atomically.
                    game.socket.emit('system.tencandles', {
                        type: 'performReroll',
                        payload: { numDice, actorId, originalFailures, requestUserId: game.user.id }
                    });
                    // If the current user is the GM, also perform it locally so the GM sees the result immediately.
                    if (game.user.isGM) {
                        // Call the same flow that the GM would run on receipt of the socket message.
                        // Re-use the handler path by emitting to self via the socket handler isn't necessary; instead
                        // directly perform the same actions by invoking the socket handler logic inline.
                        // (The GM-side socket handler already performs the roll and posts a chat message.)
                        // No further local action is needed here.
                    }
                } else {
                    // For any other re-roll types, fall back to the original behavior: just reroll the numDice locally
                    game.socket.emit('system.tencandles', {
                        type: 'performReroll',
                        payload: { numDice, actorId, originalFailures: 0, requestUserId: game.user.id }
                    });
                }
            });
        });
    }
});

Hooks.on("updateSetting", (setting, data, options, userId) => {
    if (setting.key === "tencandles.dicePenalty") {
        // Re-render all actor sheets
        Object.values(ui.windows).forEach(app => {
            if (app instanceof TenCandlesActorSheet) {
                app.render(true);
            }
        });
    }
});