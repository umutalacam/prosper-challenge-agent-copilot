import type { AgentAction } from "@/shared/types/agent";
import { Button, Section } from "@/shared/ui";
import { FieldRow } from "../FieldRow/FieldRow";
import {
  addField,
  removeField,
  renameField,
  setField,
  setRequired,
  type Fields,
} from "./fieldsModel";

export interface FieldsEditorProps {
  action: AgentAction;
  onChange: (fields: Fields) => void;
}

/** Edits the information an action collects from the caller before it runs. */
export function FieldsEditor({ action, onChange }: FieldsEditorProps) {
  const fields: Fields = { properties: action.properties, required: action.required };
  const names = Object.keys(fields.properties);

  return (
    <Section
      title="Fields to collect"
      description="Information the caller must give before this action runs."
    >
      {Object.entries(fields.properties).map(([name, schema]) => (
        <FieldRow
          key={name}
          name={name}
          schema={schema}
          required={fields.required.includes(name)}
          siblingNames={names.filter((n) => n !== name)}
          onRename={(to) => {
            onChange(renameField(fields, name, to));
          }}
          onChange={(next) => {
            onChange(setField(fields, name, next));
          }}
          onRequiredChange={(required) => {
            onChange(setRequired(fields, name, required));
          }}
          onRemove={() => {
            onChange(removeField(fields, name));
          }}
        />
      ))}
      <Button
        block
        onClick={() => {
          onChange(addField(fields));
        }}
      >
        + Add field
      </Button>
    </Section>
  );
}
