export class GMPanel extends Application {

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: "gm-panel",
            classes: ["tencandles", "gm-panel"],
            template: "systems/tencandles/templates/gm-panel.html",
            title: game.i18n.localize("TENCANDLES.GM.TrackerTitle"),
            width: 480,
            height: "auto",
            resizable: false
        });
    }

    getData() {
        const litCandles = game.settings.get("tencandles", "litCandles");
        const dicePenalty = game.settings.get("tencandles", "dicePenalty");
        const availableDice = Math.max(0, litCandles - dicePenalty);
        
        const candles = Array.from({ length: 10 }, (_, i) => ({
            lit: i < litCandles,
            index: i
        }));
        
        return {
            litCandles: litCandles,
            candles: candles,
            dicePenalty: dicePenalty,
            availableDice: availableDice
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find('.extinguish-btn').click(this._onExtinguish.bind(this));
        html.find('.candle-icon').click(ev => this._onCandleClick(ev));
        html.find('#dice-penalty-input').change(this._onDicePenaltyChange.bind(this));
    }

    async _onExtinguish(event) {
        event.preventDefault();
        const litCandles = game.settings.get("tencandles", "litCandles");
        if (litCandles > 0) {
            await game.settings.set("tencandles", "litCandles", litCandles - 1);
            // Reset dice penalty when a candle is extinguished
            await game.settings.set("tencandles", "dicePenalty", 0);
            
            const newDiceCount = litCandles - 1;
            const Mvelaapagada1 = game.i18n.localize("TENCANDLES.GM.CandleOut1");
            const Mvelaapagada2 = game.i18n.localize("TENCANDLES.GM.CandleOut2");
            const Mreserva1 = game.i18n.localize("TENCANDLES.GM.Mreserva1");
            const Mreserva2 = game.i18n.localize("TENCANDLES.GM.Mreserva2");

            
            let content = `${Mvelaapagada1} ${newDiceCount}. ${Mvelaapagada2}`;
            
            if (newDiceCount > 0) {
                content += `  ${Mreserva1} ${newDiceCount}`;
            } else {
                content += `${Mreserva2}`;
            }
            
            ChatMessage.create({
                user: game.user.id,
                content: content,
                speaker: { alias: game.i18n.localize("TENCANDLES.GM.NarratorAlias") }
            });
        }
    }

    async _onCandleClick(event) {
        const candleIndex = Number(event.currentTarget.dataset.index);
        const litCandles = game.settings.get("tencandles", "litCandles");
        const Mvelaencendida1 = game.i18n.localize("TENCANDLES.GM.Mvelaencendida1");
        const Mvelaencendida2 = game.i18n.localize("TENCANDLES.GM.Mvelaencendida2");
        
        // If clicking on the last lit candle, extinguish it
        if (candleIndex === litCandles - 1 && litCandles > 0) {
             await this._onExtinguish(event);
        }
        // If clicking on an unlit candle, light all candles up to that position
        else if (candleIndex >= litCandles) {
            const newLitCandles = candleIndex + 1;
            await game.settings.set("tencandles", "litCandles", newLitCandles);
            ChatMessage.create({
                user: game.user.id,
                content: `${Mvelaencendida1} ${newLitCandles} ${Mvelaencendida2}`,
                speaker: { alias: game.i18n.localize("TENCANDLES.GM.NarratorAlias") }
            });
        }
    }

    async _onDicePenaltyChange(event) {
        event.preventDefault();
        const newPenalty = parseInt(event.target.value) || 0;
        const litCandles = game.settings.get("tencandles", "litCandles");
        
        // Ensure penalty doesn't exceed lit candles
        const clampedPenalty = Math.max(0, Math.min(newPenalty, litCandles));
        
        await game.settings.set("tencandles", "dicePenalty", clampedPenalty);
        
        // Update the input value if it was clamped
        if (clampedPenalty !== newPenalty) {
            event.target.value = clampedPenalty;
        }
        
        // Refresh the panel to update available dice display
        this.render();
    }
}
