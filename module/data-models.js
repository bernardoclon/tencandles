/**
 * Data model for characters in Ten Candles.
 */
export class CharacterData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      biography: new fields.HTMLField({required: false, blank: true, initial: ""}),
      traits: new fields.SchemaField({
        virtue: new fields.StringField({required: false, blank: true, initial: ""}),
        vice: new fields.StringField({required: false, blank: true, initial: ""})
      }),
      brink: new fields.StringField({required: false, blank: true, initial: ""}),
      moment: new fields.StringField({required: false, blank: true, initial: ""}),
      truths: new fields.StringField({required: false, blank: true, initial: ""})
    };
  }
}

/**
 * Base Data model for simple Ten Candles items (Virtues, Vices, Brinks, Moments).
 */
export class ItemData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      description: new fields.HTMLField({required: false, blank: true, initial: ""}),
      itemType: new fields.StringField({required: false, blank: true, initial: ""})
    };
  }
}

/**
 * Extended data model for Gear items which include quantity and weight.
 */
export class GearData extends ItemData {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      quantity: new fields.NumberField({required: true, initial: 1, integer: true, min: 0}),
      weight: new fields.NumberField({required: true, initial: 0, min: 0})
    };
  }
}