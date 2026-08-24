export type BackoffPolicy = {
  baseMinutes: number;
  capMinutes: number;
};

export function escalate(policy: BackoffPolicy, consecutive: number) {
  const minutes = policy.baseMinutes * 2 ** Math.max(0, consecutive);

  return Math.min(minutes, policy.capMinutes);
}
