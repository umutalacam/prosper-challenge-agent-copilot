import { useState } from "react";
import type { FieldSchema, FieldType } from "@/shared/types/agent";
import { Checkbox, CommitInput, IconButton, Input, Select } from "@/shared/ui";
import { isIdentifier } from "../../lib/naming";
import { parseEnum, withEnum } from "../FieldsEditor/fieldsModel";
import styles from "./FieldRow.module.scss";

const FIELD_TYPES = [
  { value: "string" },
  { value: "number" },
  { value: "boolean" },
] as const satisfies readonly { value: FieldType }[];

export interface FieldRowProps {
  name: string;
  schema: FieldSchema;
  required: boolean;
  /** Other field names on the same action, for duplicate checks. */
  siblingNames: string[];
  onRename: (to: string) => void;
  onChange: (schema: FieldSchema) => void;
  onRequiredChange: (required: boolean) => void;
  onRemove: () => void;
}

export function FieldRow({
  name,
  schema,
  required,
  siblingNames,
  onRename,
  onChange,
  onRequiredChange,
  onRemove,
}: FieldRowProps) {
  const [nameError, setNameError] = useState<string | null>(null);

  const validateName = (value: string) => {
    if (!isIdentifier(value)) return "Use letters, digits and _ (not starting with a digit).";
    if (siblingNames.includes(value)) return "Another field already has this name.";
    return null;
  };

  return (
    <div className={styles.row} role="group" aria-label={`Field ${name}`}>
      <div className={styles.header}>
        <CommitInput
          className={styles.name}
          aria-label="Field name"
          aria-invalid={nameError ? true : undefined}
          value={name}
          placeholder="field_name"
          validate={validateName}
          onErrorChange={setNameError}
          onCommit={onRename}
        />
        <Select
          className={styles.type}
          aria-label="Field type"
          value={schema.type}
          options={FIELD_TYPES}
          onChange={(type) => {
            onChange(
              type === "string" ? { ...schema, type } : withEnum({ ...schema, type }, undefined),
            );
          }}
        />
        <IconButton label={`Remove field ${name}`} onClick={onRemove}>
          ×
        </IconButton>
      </div>
      {nameError && (
        <p className={styles.error} role="alert">
          {nameError}
        </p>
      )}
      <Input
        aria-label="Field description"
        value={schema.description ?? ""}
        placeholder="Description, e.g. the caller's full name"
        onChange={(e) => {
          onChange({ ...schema, description: e.target.value });
        }}
      />
      {schema.type === "string" && (
        <CommitInput
          aria-label="Allowed values"
          value={(schema.enum ?? []).join(", ")}
          placeholder="Allowed values (optional, comma-separated)"
          onCommit={(input) => {
            onChange(withEnum(schema, parseEnum(input)));
          }}
        />
      )}
      <Checkbox label="Required" checked={required} onChange={onRequiredChange} />
    </div>
  );
}
