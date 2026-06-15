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

/** Email configuration for SMTP/IMAP */
export interface EmailConfig {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  fromName: string;
  to: string;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  replyKeywords: Record<string, string[]>;
}

/** An entry in the email_log table */
export interface EmailLogEntry {
  id?: number;
  candidateId: string;
  positionName: string;
  direction: "sent" | "received";
  messageId?: string;
  inReplyTo?: string;
  subject?: string;
  body?: string;
  keywordDetected?: string;
  statusUpdated: boolean;
  processedAt?: string;
}

/** An entry in the elimination_log table */
export interface EliminationLogEntry {
  id?: number;
  candidateId: string;
  positionName: string;
  reason: string;
  templateUsed?: string;
  platformReplied: boolean;
  eliminatedAt?: string;
}

/** Elimination configuration */
export interface EliminationConfig {
  templates: string[];
}

/** Top-level YAML config structure */
export interface AppConfig {
  positions: PositionConfig[];
  email?: EmailConfig;
  elimination?: EliminationConfig;
}

/** Abstraction for sending messages on Boss直聘 platform */
export interface PlatformMessenger {
  sendMessage(candidateId: string, candidateName: string, message: string): Promise<boolean>;
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
