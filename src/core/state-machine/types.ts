// Bot FSM — the V1 state machine from CLAUDE.md.
// Serialized into Session.fsmState so restarts don't lose in-flight sessions
// (PRD §9.4).
//
// States (one-way unless marked ↔):
//
//   welcome        — 3-msg welcome sent; awaiting YES / LATER
//   later_reminder — user picked LATER; scheduled reminder
//   ask_name       — awaiting first name
//   confirm_name   — (voice-only) awaiting YES/NO confirmation of heard name
//   ask_org        — awaiting organisation
//   confirm_org    — (voice-only) awaiting YES/NO confirmation of heard org
//   section_intro  — sending the section intro; advances immediately
//   question       — awaiting A/B/C/D
//   computing      — all answers in, computing result + interpretation
//   results        — dimension msgs + overall sent
//   debrief_cta    — awaiting YES/NO for coaching conversation
//   coaching_interest — awaiting YES/NO for warm-lead notification
//   closed         — closing message sent; no further unprompted msgs
//   reentry        — returning user; awaiting 1 (view results) or 2 (retake)
//   escalated      — safety trigger hit; session suspended

export type FsmState =
  | "welcome"
  | "later_reminder"
  | "ask_name"
  | "confirm_name"
  | "ask_org"
  | "ask_email"
  | "confirm_org"
  | "question"
  | "computing"
  | "results"
  | "debrief_cta"
  | "coaching_interest"
  | "closed"
  | "reentry"
  | "escalated";

export interface FsmContext {
  state: FsmState;
  // For 'question': the display_order of the current question (1..N across all sections).
  currentQuestionIndex?: number;
  // Echo-confirm buffers for voice-captured free text.
  pendingName?: string;
  pendingOrg?: string;
}
