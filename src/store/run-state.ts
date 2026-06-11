import type Database from "better-sqlite3";

export class RunStateStore {
  constructor(private db: Database.Database) {}

  get(key: string): string | null {
    const row = this.db
      .prepare("SELECT value FROM run_state WHERE key = ?")
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  set(key: string, value: string): void {
    this.db
      .prepare(`
        INSERT INTO run_state (key, value, updated_at)
        VALUES (@key, @value, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = CURRENT_TIMESTAMP
      `)
      .run({ key, value });
  }
}
