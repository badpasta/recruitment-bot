export interface MeetingRequest {
  candidateName: string;
  positionName: string;
  startTime: string;
}

export interface MeetingResult {
  meetingId: string;
  meetingCode: string;
  joinUrl: string;
}

export interface MeetingConfig {
  topicTemplate: string;
  durationMinutes: number;
  meetingPassword?: string;
  webUrl: string;
}

export class LoginExpiredError extends Error {
  constructor(message = "Login expired") {
    super(message);
    this.name = "LoginExpiredError";
  }
}

export class TimeConflictError extends Error {
  constructor(message = "Time conflict") {
    super(message);
    this.name = "TimeConflictError";
  }
}

export class PageStructureError extends Error {
  constructor(message = "Page structure changed") {
    super(message);
    this.name = "PageStructureError";
  }
}
