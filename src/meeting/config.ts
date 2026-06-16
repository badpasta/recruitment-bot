import { readFileSync } from "fs";
import yaml from "js-yaml";
import type { MeetingConfig } from "./types.js";

export function loadMeetingConfig(filePath: string): MeetingConfig {
  const raw = readFileSync(filePath, "utf-8");
  const parsed = yaml.load(raw) as Record<string, unknown>;

  if (typeof parsed.topic_template !== "string") {
    throw new Error("meeting config: topic_template is required and must be a string");
  }
  if (typeof parsed.duration_minutes !== "number") {
    throw new Error("meeting config: duration_minutes is required and must be a number");
  }
  if (typeof parsed.web_url !== "string") {
    throw new Error("meeting config: web_url is required and must be a string");
  }

  return {
    topicTemplate: parsed.topic_template,
    durationMinutes: parsed.duration_minutes,
    meetingPassword: typeof parsed.meeting_password === "string" ? parsed.meeting_password : undefined,
    webUrl: parsed.web_url,
  };
}

export function renderTopic(
  template: string,
  candidateName: string,
  positionName: string,
): string {
  return template
    .replace(/\{candidateName\}/g, candidateName)
    .replace(/\{positionName\}/g, positionName);
}

export function calcEndTime(startTime: string, durationMinutes: number): string {
  const match = startTime.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})([+-])(\d{2}):(\d{2})$/,
  );
  if (!match) {
    throw new Error(`calcEndTime: invalid ISO 8601 datetime: ${startTime}`);
  }
  const [, ys, ms, ds, hs, mins, ss, tzSign, tzH, tzM] = match;
  const y = parseInt(ys), m = parseInt(ms), d = parseInt(ds);
  const h = parseInt(hs), mi = parseInt(mins), s = parseInt(ss);
  const tzHours = parseInt(tzH), tzMinutes = parseInt(tzM);

  // Convert to UTC epoch milliseconds
  const localDate = new Date(Date.UTC(y, m - 1, d, h, mi, s));
  const tzOffsetMs = (tzHours * 60 + tzMinutes) * 60 * 1000;
  const utcEpoch = tzSign === "+"
    ? localDate.getTime() - tzOffsetMs
    : localDate.getTime() + tzOffsetMs;

  // Add duration, convert back to target timezone
  const endEpoch = utcEpoch + durationMinutes * 60 * 1000;
  const endLocalEpoch = tzSign === "+"
    ? endEpoch + tzOffsetMs
    : endEpoch - tzOffsetMs;

  const end = new Date(endLocalEpoch);
  const pad = (n: number) => n.toString().padStart(2, "0");
  const ey = end.getUTCFullYear();
  const em = pad(end.getUTCMonth() + 1);
  const ed = pad(end.getUTCDate());
  const eh = pad(end.getUTCHours());
  const emi = pad(end.getUTCMinutes());
  const es = pad(end.getUTCSeconds());
  return `${ey}-${em}-${ed}T${eh}:${emi}:${es}${tzSign}${tzH}:${tzM}`;
}
