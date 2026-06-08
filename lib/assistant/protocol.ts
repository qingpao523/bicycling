export type AssistantScope = "global" | "activity" | "onboarding" | "analytics";

export interface AssistantRequest {
  conversationId?: string;
  message: string;
  scope: AssistantScope;
  scopeRef?: string;
}

export type FieldInputType = "text" | "password" | "number" | "email" | "select";

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldValidation {
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: string;
}

export type AssistantAction =
  | { kind: "navigate"; path: string }
  | { kind: "sync"; source: "intervals" | "strava" }
  | {
      kind: "collect_field";
      field: string;
      label: string;
      inputType: FieldInputType;
      options?: FieldOption[];
      placeholder?: string;
      validation?: FieldValidation;
      skippable?: boolean;
    }
  | { kind: "set_user_field"; field: string; value: unknown }
  | { kind: "suggest_prompts"; prompts: string[] }
  | { kind: "complete_onboarding" };

export type AssistantChunk =
  | { type: "start"; conversationId: string }
  | { type: "delta"; content: string }
  | { type: "action"; action: AssistantAction }
  | { type: "done"; messageId: string }
  | { type: "error"; error: string };
