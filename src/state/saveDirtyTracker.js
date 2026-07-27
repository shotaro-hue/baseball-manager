function normalizeScopes(scopes) {
  if (!Array.isArray(scopes)) return [];
  return [...new Set(scopes.filter((scope) => typeof scope === 'string' && scope))];
}

export function createSaveDirtyTracker() {
  let mutationVersion = 0;
  const scopeVersions = new Map();

  return {
    mark(scopes = []) {
      mutationVersion += 1;
      for (const scope of normalizeScopes(scopes)) {
        scopeVersions.set(scope, mutationVersion);
      }
      return mutationVersion;
    },

    reset() {
      mutationVersion += 1;
      scopeVersions.clear();
      return mutationVersion;
    },

    snapshot({ persistAll = false } = {}) {
      return {
        mutationVersion,
        dirtyScopes: persistAll ? null : [...scopeVersions.keys()],
        scopeVersions: [...scopeVersions.entries()],
      };
    },

    complete(snapshot) {
      for (const [scope, savedVersion] of snapshot?.scopeVersions || []) {
        if (scopeVersions.get(scope) === savedVersion) {
          scopeVersions.delete(scope);
        }
      }
      return {
        isCurrent: snapshot?.mutationVersion === mutationVersion,
        dirtyScopes: [...scopeVersions.keys()],
      };
    },
  };
}
