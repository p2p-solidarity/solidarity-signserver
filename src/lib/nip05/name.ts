import {
  NIP05_NAME_MAX_LENGTH,
  NIP05_NAME_MIN_LENGTH,
  RESERVED_NIP05_NAMES,
} from "./constants";

export type Nip05NameValidation =
  | { valid: true; name: string }
  | { valid: false; name: string };

/**
 * Punctuation is deliberately absent. Besides avoiding collisions with the
 * dotted ATProto/ENS/DNS namespace, v1 keeps the issued alphabet to lowercase
 * ASCII letters and digits so every accepted name has one obvious spelling.
 */
const NAME_PATTERN = new RegExp(
  `^[a-z0-9]{${String(NIP05_NAME_MIN_LENGTH)},${String(NIP05_NAME_MAX_LENGTH)}}$`,
);

export function validateNip05Name(value: unknown): Nip05NameValidation {
  const name = typeof value === "string" ? value.toLowerCase() : "";
  if (!NAME_PATTERN.test(name)) {
    return { valid: false, name };
  }
  return { valid: true, name };
}

export function isReservedNip05Name(value: string): boolean {
  return RESERVED_NIP05_NAMES.has(value.toLowerCase());
}
