const REDACTED_VALUE = '[REDACTED]';

const SENSITIVE_KEY_PATTERNS = [
  /email/i,
  /invit(e|ation)/i,
  /password/i,
  /passphrase/i,
  /secret/i,
  /token/i,
  /api[-_]?key/i,
  /^authorization$/i,
  /^cookie$/i,
  /^set-cookie$/i,
  /session[-_]?id/i,
];

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function redactValue(value: unknown, seen: WeakSet<object>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, seen));
  }

  if (value && typeof value === 'object') {
    if (seen.has(value)) {
      return '[Circular]';
    }

    seen.add(value);

    const redactedEntries = Object.entries(value).map(([key, nestedValue]) => [
      key,
      isSensitiveKey(key) ? REDACTED_VALUE : redactValue(nestedValue, seen),
    ]);

    seen.delete(value);
    return Object.fromEntries(redactedEntries);
  }

  return value;
}

export function redactLogData(value: unknown): unknown {
  return redactValue(value, new WeakSet<object>());
}

export { REDACTED_VALUE };
