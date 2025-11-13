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

// Function to handle re-rolling dice
async function _onRerollDice(numDice, actorId) {
    const actor = game.actors.get(actorId);
    if (!actor) {
        ui.notifications.error("Actor not found for re-roll.");
        return;
    }

    const flavortext =  game.i18n.localize("TENCANDLES.Roll.Flavor");
    const rollindice1text =  game.i18n.localize("TENCANDLES.Roll.RollingDice1");
    const rollindice2text =  game.i18n.localize("TENCANDLES.Roll.RollingDice2");
    const successtext =  game.i18n.localize("TENCANDLES.Roll.Success");
    const failuretext =  game.i18n.localize("TENCANDLES.Roll.Failure");

    const roll = new Roll(`${numDice}d6`);
    await roll.evaluate({async: true});

    const successes = roll.terms[0].results.filter(r => r.result === 6).length;
    const failures = roll.terms[0].results.filter(r => r.result === 1).length; // Calculate failures for re-roll

    // Update dice penalty based on number of 1s rolled in the re-roll
    if (failures > 0) {
        if (game.user.isGM) {
            const currentPenalty = game.settings.get("tencandles", "dicePenalty");
            const newPenalty = currentPenalty + failures;
            await game.settings.set("tencandles", "dicePenalty", newPenalty);
        } else {
            game.socket.emit('system.tencandles', {
                type: 'updateDicePenalty', // Use existing type for adding
                payload: { failures }
            });
        }
    }

    let messageContent = `<div class="tencandles-roll-card tencandles-roll">
        <div class="roll-header">
            <h2>${actor.name} ${flavortext} (Re-roll)</h2>
            <p>${rollindice1text} ${numDice} ${rollindice2text}</p>
        </div>`;

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
    } else { // Add failure text for re-roll if no successes
        messageContent += `<div class="result-overlay failure">${failuretext}</div>`;
    }
    messageContent += `</div>`; // close roll-results
    messageContent += `</div>`; // close tencandles-roll-card

    // Create the chat message
    roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: actor }),
        flavor: messageContent
    });
}

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

                // If this is a failures-based re-roll we need to subtract the original failures first
                if (rerollType === 'failures') {
                    const originalFailures = parseInt(button.dataset.originalFailures) || 0; // Get original failures
                    if (originalFailures > 0) {
                        if (game.user.isGM) {
                            const currentPenalty = game.settings.get("tencandles", "dicePenalty");
                            const newPenalty = Math.max(0, currentPenalty - originalFailures); // Ensure penalty doesn't go below 0
                            await game.settings.set("tencandles", "dicePenalty", newPenalty);
                        } else {
                            game.socket.emit('system.tencandles', {
                                type: 'subtractDicePenalty', // New type for subtracting
                                payload: { failures: originalFailures }
                            });
                        }
                    }
                }

                // Perform the reroll. For full re-roll we simply reroll the provided dice count.
                _onRerollDice(numDice, actorId);
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