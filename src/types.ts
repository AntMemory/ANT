export type MemoryContext = {
  language: string;
  framework: string;
  package_name: string;
  package_version: string;
  runtime: string;
  os: string;
  tool: string;
};

export type MemorySolution = {
  summary: string;
  steps: string[];
  commands: string[];
  patch_example: string;
};

export type MemoryEvidence = {
  verification_type: string;
  commands_run: string[];
};

export type MemoryPrivacy = {
  redacted: boolean;
  public_safe: boolean;
  redaction_warnings: string[];
};

export type Memory = {
  id: string;
  title: string;
  problem: string;
  error_signature: string;
  context: MemoryContext;
  cause: string;
  solution: MemorySolution;
  evidence: MemoryEvidence;
  privacy: MemoryPrivacy;
  created_at: string;
  updated_at: string;
};

export type NewMemoryInput = Omit<Memory, "id" | "created_at" | "updated_at">;

export type MemoryOutcomeStatus = "worked" | "failed";

export type MemoryOutcome = {
  id: string;
  memory_id: string;
  status: MemoryOutcomeStatus;
  note: string;
  created_at: string;
};
