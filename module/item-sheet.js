export default class TenCandlesItemSheet extends ItemSheet {

    /** @override */
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            classes: ["tencandles", "sheet", "item", "trait"],
            template: "systems/tencandles/templates/item/item-sheet.html",
            width: 520,
            height: 480
        });
    }

    /** @override */
    getData() {
        const context = super.getData();
        context.system = context.item.system;
        return context;
    }
}
