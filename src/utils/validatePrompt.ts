export const PROMPT_MAX_LENGTH = 500;

export interface PromptValidation {
  valid: boolean;
  length: number;
  error: string | null;
}

export function validatePrompt(prompt: string): PromptValidation {
  const length = prompt.length;
  if (length > PROMPT_MAX_LENGTH) {
    return {
      valid: false,
      length,
      error: `프롬프트는 ${PROMPT_MAX_LENGTH}자 이하로 입력해주세요.`,
    };
  }
  return { valid: true, length, error: null };
}
