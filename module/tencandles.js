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
        types: ["virtue", "vice", "brink", "gear"],
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
    game.socket.on('system.tencandles', (data) => {
        if (game.user.isGM) {
            if (data.type === 'updateDicePenalty') {
                const { failures } = data.payload;
                const currentPenalty = game.settings.get("tencandles", "dicePenalty");
                const newPenalty = currentPenalty + failures;
                game.settings.set("tencandles", "dicePenalty", newPenalty);
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
    const rerollButton = html.find('.reroll-dice-button');
    if (rerollButton.length > 0) {
        rerollButton.on('click', (event) => {
            const numDice = parseInt(event.currentTarget.dataset.numDice);
            const actorId = event.currentTarget.dataset.actorId;
            _onRerollDice(numDice, actorId);
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