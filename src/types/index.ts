/** Candidate profile data extracted from Boss直聘 */
export interface Candidate {
  id: string;
  name: string;
  profileUrl: string;
  rawProfile: CandidateProfile;
  createdAt?: string;
  updatedAt?: string;
}

/** Structured profile data from a candidate's detail page */
export interface CandidateProfile {
  status?: string;
  skills: string[];
  experienceYears?: number;
  salaryExpectation?: number;
  education?: string;
  workHistory: WorkEntry[];
  projectHistory: ProjectEntry[];
  selfEvaluation?: string;
}

export interface WorkEntry {
  company: string;
  title: string;
  startDate?: string;
  endDate?: string;
  description?: string;
}

export interface ProjectEntry {
  name: string;
  description?: string;
}

/** Status of a screening result */
export type ScreeningStatus = "passed" | "rejected" | "pending" | "eliminated" | "interview";

const VALID_STATUSES: ScreeningStatus[] = ["passed", "rejected", "pending", "eliminated", "interview"];

export function isValidScreeningStatus(s: string): s is ScreeningStatus {
  return VALID_STATUSES.includes(s as ScreeningStatus);
}

/** Status of an interview candidate in the scheduling pipeline */
export type InterviewScheduleStatus =
  | "waiting_time"
  | "time_proposed"
  | "confirmed"
  | "scheduled"
  | "cancelled";

const VALID_SCHEDULE_STATUSES: InterviewScheduleStatus[] = [
  "waiting_time",
  "time_proposed",
  "confirmed",
  "scheduled",
  "cancelled",
];

export function isValidScheduleStatus(s: string): s is InterviewScheduleStatus {
  return VALID_SCHEDULE_STATUSES.includes(s as InterviewScheduleStatus);
}

/** Direction of an interview message (Boss直聘 chat) */
export type InterviewMessageDirection = "sent" | "received";

/** A candidate who has entered the interview scheduling pipeline */
export interface InterviewCandidate {
  id?: number;
  candidateId: string;
  positionName: string;
  scheduleStatus: InterviewScheduleStatus;
  resumeSummary?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** A scheduled interview with meeting details */
export interface InterviewSchedule {
  id?: number;
  candidateId: string;
  positionName: string;
  interviewTime?: string;
  meetingLink?: string;
  calendarEventId?: string;
  status: InterviewScheduleStatus;
  createdAt?: string;
  updatedAt?: string;
}

/** A Boss直聘 chat message with a candidate during the interview process */
export interface InterviewMessage {
  id?: number;
  candidateId: string;
  positionName: string;
  direction: InterviewMessageDirection;
  content: string;
  createdAt?: string;
}

/** Interview scheduling configuration */
export interface InterviewConfig {
  availableSlots: string[];
  durationMinutes: number;
  meetingSubject: string;
}

/** Record of a candidate being eliminated from a position */
export interface EliminationRecord {
  id?: number;
  candidateId: string;
  positionName: string;
  reason?: string;
  templateUsed?: string;
  platformReplied: boolean;
  eliminatedAt?: string;
}

/** Screening result for a candidate on a specific position */
export interface ScreeningResult {
  id?: number;
  candidateId: string;
  positionName: string;
  status: ScreeningStatus;
  score: number;
  matchDetails: MatchDetails;
  screenedAt?: string;
}

/** Detailed breakdown of how rules matched */
export interface MatchDetails {
  requiredMatched: RuleMatch[];
  preferredMatched: PreferredMatch[];
  totalScore: number;
  threshold: number;
}

export interface RuleMatch {
  field: string;
  rule: string;
  matched?: string[];
  passed: boolean;
}

export interface PreferredMatch extends RuleMatch {
  weight: number;
}

/** Position configuration from YAML */
export interface PositionConfig {
  name: string;
  bossUrl: string;
  screening: ScreeningConfig;
  interview?: InterviewConfig;
}

export interface ScreeningConfig {
  required: RequiredRule[];
  preferred: PreferredRule[];
  passThreshold: number;
}

export interface RequiredRule {
  field: string;
  containsAny?: string[];
  containsAll?: string[];
  notIn?: string[];
  in?: string[];
  min?: number;
  max?: number;
}

export interface PreferredRule extends RequiredRule {
  weight: number;
}

/** Top-level YAML config structure */
export interface AppConfig {
  positions: PositionConfig[];
}

/** Elimination message templates config from templates.yaml */
export interface TemplatesConfig {
  elimination: {
    templates: string[];
  };
}

/** Status of an interview event */
export type InterviewEventStatus = "scheduled" | "completed" | "cancelled" | "no_show";

/** Type of interview */
export type InterviewType = "phone" | "video" | "onsite";

/** An interview event for a candidate */
export interface InterviewEvent {
  id?: number;
  candidateId: string;
  positionName: string;
  interviewType: InterviewType;
  scheduledAt: string;
  status: InterviewEventStatus;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** A single dimension rating in interview feedback */
export interface FeedbackDimension {
  name: string;
  rating: number;
  comment?: string;
}

/** Feedback from an interview */
export interface InterviewFeedback {
  id?: number;
  interviewEventId: number;
  candidateId: string;
  dimensions: FeedbackDimension[];
  overallComment: string;
  recommended: boolean;
  interviewerName: string;
  createdAt?: string;
}

/** Status of a strategy suggestion */
export type SuggestionStatus = "pending" | "accepted" | "rejected";

/** A strategy suggestion derived from interview feedback */
export interface StrategySuggestion {
  id?: number;
  content: string;
  status: SuggestionStatus;
  relatedFeedbackIds: number[];
  priority: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Runtime guard for Candidate objects */
export function isCandidate(obj: unknown): obj is Candidate {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    typeof o.profileUrl === "string" &&
    o.rawProfile !== null &&
    typeof o.rawProfile === "object"
  );
}
