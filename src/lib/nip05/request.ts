import { isReservedNip05Name, validateNip05Name } from "./name";

export type RegisterBodyResult =
  | { ok: true; name: string; relays: string[] }
  | {
      ok: false;
      error:
        | "invalid_request"
        | "invalid_name"
        | "invalid_relays"
        | "consent_required";
    };

export type RecoverBodyResult =
  | {
      ok: true;
      name: string;
      oldRecordJws: string;
      newRecordJws: string;
      binding: string;
    }
  | {
      ok: false;
      error:
        | "invalid_request"
        | "invalid_name"
        | "invalid_binding"
        | "invalid_record"
        | "consent_required";
    };

/**
 * `/id/recover` body. Reserved names are NOT rejected here (unlike register):
 * a name can only be recovered if it is already registered, so reachability
 * is decided by the directory's own state, not by the reserved list.
 */
export function parseRecoverBody(rawBody: string): RecoverBodyResult {
  try {
    const value: unknown = JSON.parse(rawBody);
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      (value as Record<string, unknown>).consent !== true
    ) {
      return { ok: false, error: "consent_required" };
    }

    const record = value as Record<string, unknown>;
    const nameValidation = validateNip05Name(record.name);
    if (!nameValidation.valid) {
      return { ok: false, error: "invalid_name" };
    }

    const binding = record.binding;
    if (typeof binding !== "string" || !binding.startsWith("dns:")) {
      return { ok: false, error: "invalid_binding" };
    }

    const oldRecordJws = record.oldRecordJws;
    const newRecordJws = record.newRecordJws;
    if (
      typeof oldRecordJws !== "string" ||
      typeof newRecordJws !== "string" ||
      oldRecordJws.length === 0 ||
      newRecordJws.length === 0
    ) {
      return { ok: false, error: "invalid_record" };
    }

    return {
      ok: true,
      name: nameValidation.name,
      oldRecordJws,
      newRecordJws,
      binding,
    };
  } catch {
    return { ok: false, error: "invalid_request" };
  }
}

export function parseRegisterBody(rawBody: string): RegisterBodyResult {
  try {
    const value: unknown = JSON.parse(rawBody);
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      (value as Record<string, unknown>).consent !== true
    ) {
      return { ok: false, error: "consent_required" };
    }

    const record = value as Record<string, unknown>;
    const nameValidation = validateNip05Name(record.name);
    if (!nameValidation.valid || isReservedNip05Name(nameValidation.name)) {
      return { ok: false, error: "invalid_name" };
    }

    const relays = record.relays ?? [];
    if (
      !Array.isArray(relays) ||
      relays.length > 10 ||
      !relays.every(
        (relay): relay is string =>
          typeof relay === "string" &&
          relay.startsWith("wss://") &&
          relay.length <= 200,
      )
    ) {
      return { ok: false, error: "invalid_relays" };
    }

    return { ok: true, name: nameValidation.name, relays };
  } catch {
    return { ok: false, error: "invalid_request" };
  }
}
