import TenCandlesActorSheet from "./actor-sheet.js";
import TenCandlesItemSheet from "./item-sheet.js";
import { GMPanel } from "./gm-panel.js";

let gmPanelInstance = null; // Store the GMPanel instance

Hooks.once('init', async function() {
    console.log('tencandles | Initializing Ten Candles System');

    // Register the 'add' Handlebars helper
    Handlebars.registerHelper('add', function (a, b) {
        return a + b;
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
        types: ["virtue", "vice", "brink"],
        makeDefault: true,
        label: "Ten Candles Item Sheet"
    });


});

Hooks.on("renderActorDirectory", (app, html, data) => {
    if (!game.user.isGM) {
        return;
    }

    // Convert the plain JavaScript 'html' element to a jQuery object
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
            <button class="candle-tracker-btn flex1" style="margin-bottom: 5px; width: 100%;">
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