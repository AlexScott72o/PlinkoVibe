/** Win intensity for slot landing animation: ≤1x minimal, >1x&<10x bolder, ≥10x dramatic */
export type WinIntensity = 'minimal' | 'bolder' | 'dramatic';

export function winIntensityFromMultiplier(mult: number): WinIntensity {
  if (mult <= 1) return 'minimal';
  if (mult < 10) return 'bolder';
  return 'dramatic';
}
