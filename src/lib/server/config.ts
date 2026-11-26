export const numberEnv = (key: string, fallback: number, min = 0, max = 1e8) => {
  const v = Number(process.env[key] || fallback);
  return Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
};
export const settings = () => ({
  maxSeconds: numberEnv('MAX_CALL_SECONDS', 600, 30, 900),
  maxSessions: numberEnv('MAX_DEMO_SESSIONS', 60, 1, 10000),
  warning: numberEnv('BUDGET_WARNING_USD', 15),
  budget: numberEnv('BUDGET_LIMIT_USD', 20),
  voiceRate: numberEnv('VOICE_USD_PER_MINUTE', 0.05),
  backendInput: numberEnv('BACKEND_INPUT_USD_PER_MILLION', 0),
  backendOutput: numberEnv('BACKEND_OUTPUT_USD_PER_MILLION', 0),
});
