import { describe, expect, it } from "vitest";
import {
  addField,
  parseEnum,
  removeField,
  renameField,
  setRequired,
  withEnum,
  type Fields,
} from "./fieldsModel";

const fields: Fields = {
  properties: {
    first: { type: "string" },
    second: { type: "number" },
  },
  required: ["first"],
};

describe("fieldsModel", () => {
  it("renameField keeps order and updates required", () => {
    const result = renameField(fields, "first", "name");
    expect(Object.keys(result.properties)).toEqual(["name", "second"]);
    expect(result.required).toEqual(["name"]);
  });

  it("removeField drops the property and its required entry", () => {
    const result = removeField(fields, "first");
    expect(result.properties).toEqual({ second: { type: "number" } });
    expect(result.required).toEqual([]);
  });

  it("setRequired toggles without duplicates", () => {
    expect(setRequired(fields, "first", true).required).toEqual(["first"]);
    expect(setRequired(fields, "second", true).required).toEqual(["first", "second"]);
    expect(setRequired(fields, "first", false).required).toEqual([]);
  });

  it("addField adds a uniquely named required string field", () => {
    const once = addField({ properties: {}, required: [] });
    const twice = addField(once);
    expect(Object.keys(twice.properties)).toEqual(["field", "field_2"]);
    expect(twice.required).toEqual(["field", "field_2"]);
  });

  it("parseEnum trims, drops blanks and maps empty to undefined", () => {
    expect(parseEnum(" a, b ,, c ")).toEqual(["a", "b", "c"]);
    expect(parseEnum(" , ")).toBeUndefined();
  });

  it("withEnum sets or clears the enum", () => {
    expect(withEnum({ type: "string" }, ["x"])).toEqual({ type: "string", enum: ["x"] });
    expect(withEnum({ type: "string", enum: ["x"] }, undefined)).toEqual({ type: "string" });
  });
});
