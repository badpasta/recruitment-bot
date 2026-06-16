import type Database from "better-sqlite3";
import type { InterviewSlot, InterviewConfig } from "../types/index.js";

/**
 * SlotManager: generates available interview time slots from config,
 * excluding already-booked slots and handling conflicts.
 */
export class SlotManager {
  constructor(private db: Database.Database, private config: InterviewConfig) {}

  /**
   * Generate available time slots for a candidate.
   * Splits configured time ranges into duration_minutes chunks,
   * excludes already-booked slots, and returns top maxOptionsPerRound.
   */
  getAvailableSlots(): InterviewSlot[] {
    const rawSlots = this.splitIntoSlots();
    const available = this.excludeBooked(rawSlots);
    return available.slice(0, this.config.maxOptionsPerRound);
  }

  /**
   * Check if a time slot conflicts with any existing booking.
   */
  hasConflict(startTime: string, endTime: string): boolean {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as cnt FROM interview_schedule
         WHERE status IN ('waiting_time', 'time_proposed', 'confirmed', 'scheduled')
           AND REPLACE(interview_time, 'T', ' ') < REPLACE(@endTime, 'T', ' ')
           AND datetime(REPLACE(interview_time, 'T', ' '), '+' || @duration || ' minutes') > REPLACE(@startTime, 'T', ' ')`,
      )
      .get({
        startTime,
        endTime,
        duration: this.config.durationMinutes,
      }) as { cnt: number };

    return row.cnt > 0;
  }

  // ── private ──

  private splitIntoSlots(): InterviewSlot[] {
    const slots: InterviewSlot[] = [];

    for (const range of this.config.availableSlots) {
      const parts = range.split(" ");
      if (parts.length < 2) continue;

      const date = parts[0];
      const times = parts[1];
      const [startHM, endHM] = times.split("-");
      if (!startHM || !endHM) continue;

      const [startH, startM] = startHM.split(":").map(Number);
      const [endH, endM] = endHM.split(":").map(Number);

      let cursorMin = startH * 60 + startM;
      const endMin = endH * 60 + endM;

      while (cursorMin + this.config.durationMinutes <= endMin) {
        const slotEndMin = cursorMin + this.config.durationMinutes;

        const sH = Math.floor(cursorMin / 60);
        const sM = cursorMin % 60;
        const eH = Math.floor(slotEndMin / 60);
        const eM = slotEndMin % 60;

        const slotStart = `${date}T${this.pad(sH)}:${this.pad(sM)}:00`;
        const slotEnd = `${date}T${this.pad(eH)}:${this.pad(eM)}:00`;

        const month = parseInt(date.split("-")[1], 10);
        const day = parseInt(date.split("-")[2], 10);

        slots.push({
          startTime: slotStart,
          endTime: slotEnd,
          label: `${month}月${day}日 ${this.pad(sH)}:${this.pad(sM)}-${this.pad(eH)}:${this.pad(eM)}`,
          available: true,
        });

        cursorMin = slotEndMin + this.config.bufferMinutes;
      }
    }

    return slots;
  }

  private excludeBooked(slots: InterviewSlot[]): InterviewSlot[] {
    return slots.filter((slot) => !this.hasConflict(slot.startTime, slot.endTime));
  }

  private pad(n: number): string {
    return String(n).padStart(2, "0");
  }
}
