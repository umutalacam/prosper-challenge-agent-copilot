// Pure edits to an action's collected fields (JSON-schema `properties` + `required`).
// Field names are object keys, so renames rebuild the object to preserve order.

import type { AgentAction, FieldSchema } from "@/shared/types/agent";
import { uniqueName } from "../../lib/naming";

export type Fields = Pick<AgentAction, "properties" | "required">;

export function setField(fields: Fields, name: string, schema: FieldSchema): Fields {
  return { ...fields, properties: { ...fields.properties, [name]: schema } };
}

export function renameField(fields: Fields, from: string, to: string): Fields {
  return {
    properties: Object.fromEntries(
      Object.entries(fields.properties).map(([k, v]) => [k === from ? to : k, v]),
    ),
    required: fields.required.map((r) => (r === from ? to : r)),
  };
}

export function removeField(fields: Fields, name: string): Fields {
  return {
    properties: Object.fromEntries(Object.entries(fields.properties).filter(([k]) => k !== name)),
    required: fields.required.filter((r) => r !== name),
  };
}

export function setRequired(fields: Fields, name: string, required: boolean): Fields {
  const rest = fields.required.filter((r) => r !== name);
  return { ...fields, required: required ? [...rest, name] : rest };
}

/** Adds a required string field with a fresh name. */
export function addField(fields: Fields): Fields {
  const name = uniqueName("field", Object.keys(fields.properties));
  return {
    properties: { ...fields.properties, [name]: { type: "string", description: "" } },
    required: [...fields.required, name],
  };
}

/** Parse the comma-separated "allowed values" input; empty means unrestricted. */
export function parseEnum(input: string): string[] | undefined {
  const values = input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return values.length ? values : undefined;
}

export function withEnum(schema: FieldSchema, values: string[] | undefined): FieldSchema {
  const { enum: _previous, ...rest } = schema;
  return values ? { ...rest, enum: values } : rest;
}
