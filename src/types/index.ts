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
export type ScreeningStatus = "passed" | "rejected" | "pending" | "interview" | "eliminated";

const VALID_STATUSES: ScreeningStatus[] = ["passed", "rejected", "pending", "interview", "eliminated"];

export function isValidScreeningStatus(s: string): s is ScreeningStatus {
  return VALID_STATUSES.includes(s as ScreeningStatus);
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
  emailNotifiedAt?: string;
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
  email?: EmailConfig;
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

/** Type of a strategy adjustment: add a new rule, modify existing, or delete */
export type StrategyAdjustmentType = "add" | "modify" | "delete";

/** Describes a specific rule to adjust in the screening config */
export interface TargetRule {
  field: string;
  position: "required" | "preferred";
  containsAny?: string[];
  containsAll?: string[];
  notIn?: string[];
  in?: string[];
  min?: number;
  max?: number;
  weight?: number;
}

/** A structured adjustment suggestion from AI analysis */
export interface StrategyAdjustment {
  type: StrategyAdjustmentType;
  targetRule: TargetRule;
  reason: string;
}

/** Result of an AI strategy analysis run */
export interface StrategyAnalysisResult {
  adjustments: StrategyAdjustment[];
  analyzedFeedbackCount: number;
  analyzedAt: string;
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

/** Email configuration from YAML config */
export interface EmailConfig {
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
  };
  imap: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
  };
  from: string;
  to: string;
  pollIntervalMs: number;
}

/** A record of a sent email */
export interface SentEmail {
  messageId: string;
  candidateId: string;
  positionName: string;
  resultId?: number;
  sentAt?: string;
}

/** A processed reply email */
export interface ProcessedReply {
  messageId: string;
  inReplyTo?: string;
  candidateId?: string;
  action?: string;
  processedAt?: string;
}

/** Action parsed from a reply email */
export type ReplyAction = "interview" | "eliminated" | "unknown";

/** Data needed to send a notification email for a passed candidate */
export interface EmailNotificationData {
  candidateName: string;
  positionName: string;
  score: number;
  skills: string[];
  profileUrl: string;
  candidateId: string;
  resultId: number;
}
