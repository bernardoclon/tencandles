export default class TenCandlesItemSheet extends ItemSheet {

    /** @override */
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            classes: ["tencandles", "sheet", "item"],
            template: "systems/tencandles/templates/item/item-sheet.html",
            width: 520,
            height: 480,
            tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main" }]
        });
    }

    /** @override */
    getData() {
        const context = super.getData();
        context.system = context.item.system;
        
        // Determine the item type for display
        context.itemTypeName = this._getItemTypeName(context.item.type);
        
        return context;
    }

    /**
     * Get the localized name for the item type
     * @param {string} type - The item type
     * @returns {string} The localized type name
     */
    _getItemTypeName(type) {
        const typeNames = {
            virtue: game.i18n.localize("TENCANDLES.Items.Virtue"),
            vice: game.i18n.localize("TENCANDLES.Items.Vice"),
            brink: game.i18n.localize("TENCANDLES.Items.Brink")
        };
        return typeNames[type] || type;
    }

    /** @override */
    activateListeners(html) {
        super.activateListeners(html);
        
        // Nothing special needed for now
    }
}