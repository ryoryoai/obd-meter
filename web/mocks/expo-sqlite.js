// expo-sqlite Web mock
export function openDatabaseSync() {
  return {
    execSync: () => {},
    runSync: () => ({ lastInsertRowId: 1, changes: 0 }),
    getFirstSync: () => null,
    getAllSync: () => [],
  };
}
export default { openDatabaseSync };
