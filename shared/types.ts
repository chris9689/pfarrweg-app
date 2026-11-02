export type RecurrenceType = 'none' | 'daily' | 'weekly' | 'weekdays';
export type ExceptionType = 'cancelled' | 'modified';
export type EditScope = 'occurrence' | 'future' | 'series';

export interface Schedule {
  id: string;
  parkingSpaceId: string;
  /** First occurrence start (ISO, UTC). */
  start: string;
  /** First occurrence end (ISO, UTC). */
  end: string;
  recurrenceType: RecurrenceType;
  /** ISO weekdays 1 (Mon) – 7 (Sun); used by 'weekdays'. */
  recurrenceDays: number[];
  /** Last local date on which an occurrence may start (inclusive), or null. */
  recurrenceEndDate: string | null;
  timezone: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleException {
  id: string;
  scheduleId: string;
  /** Local date (YYYY-MM-DD) of the original occurrence start. */
  occurrenceDate: string;
  type: ExceptionType;
  modifiedStart: string | null;
  modifiedEnd: string | null;
}

export interface Occurrence {
  scheduleId: string;
  parkingSpaceId: string;
  occurrenceDate: string;
  start: number;
  end: number;
  recurring: boolean;
  modified: boolean;
}

export interface RepeatInput {
  type: Exclude<RecurrenceType, 'none'>;
  days: number[];
  until: string | null;
}

/** Wall-clock input in the building timezone. */
export interface ScheduleInput {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  repeat: RepeatInput | null;
}

export interface AvailabilityBlock {
  space: number;
  start: string;
  end: string;
}

export interface OverviewResponse {
  timezone: string;
  buildingName: string;
  generatedAt: string;
  spaces: number[];
  blocks: AvailabilityBlock[];
}

export interface SpaceInfo {
  id: string;
  number: number;
}

export interface MeResponse {
  timezone: string;
  apartment: { id: string; name: string };
  spaces: SpaceInfo[];
  schedules: Schedule[];
  exceptions: ScheduleException[];
}

export interface AdminApartment {
  id: string;
  name: string;
  hasCode: boolean;
  codeUpdatedAt: string | null;
}

export interface AdminSpace {
  id: string;
  number: number;
  apartmentId: string | null;
}

export interface AdminStateResponse {
  timezone: string;
  apartments: AdminApartment[];
  spaces: AdminSpace[];
  schedules: Schedule[];
  exceptions: ScheduleException[];
}

export interface ActivityEntry {
  id: number;
  createdAt: string;
  actor: 'apartment' | 'admin';
  action: string;
  apartmentName: string | null;
  spaceNumber: number | null;
  details: Record<string, unknown>;
}

export interface ApiErrorBody {
  error: { code: string; details?: Record<string, unknown> };
}
