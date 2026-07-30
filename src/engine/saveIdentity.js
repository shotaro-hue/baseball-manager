export function createSaveId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `save-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function ensureSaveId(value) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 120)
    : createSaveId();
}
