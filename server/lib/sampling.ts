/**
 * AICPA / PCAOB attribute sampling tables.
 * Sample sizes are based on AS 2315 guidance and Big 4 standard practice.
 */

export type Frequency = "Annual" | "SemiAnnual" | "Quarterly" | "Monthly" | "Daily" | "Continuous";
export type RiskLevel = "High" | "Medium" | "Low";

// Standard sample sizes per AICPA attribute sampling at 5% risk of overreliance
const SAMPLE_TABLE: Record<Frequency, Record<RiskLevel, number>> = {
  Annual: { High: 40, Medium: 25, Low: 15 },
  SemiAnnual: { High: 25, Medium: 20, Low: 10 },
  Quarterly: { High: 20, Medium: 15, Low: 10 },
  Monthly: { High: 10, Medium: 5, Low: 3 },
  Daily: { High: 40, Medium: 25, Low: 15 },
  Continuous: { High: 40, Medium: 25, Low: 15 },
};

export function getSampleSize(
  frequency: Frequency,
  riskLevel: RiskLevel,
  populationSize: number,
  priorYearException: boolean
): number {
  let base = SAMPLE_TABLE[frequency][riskLevel];
  // Elevated sample if prior year had an exception (Big 4 standard: +25%)
  if (priorYearException) base = Math.ceil(base * 1.25);
  // If population is smaller than sample, test 100%
  return Math.min(base, populationSize);
}

export function selectRandomSample(
  population: string[],
  sampleSize: number
): { index: number; item: string }[] {
  const shuffled = [...population.entries()].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, sampleSize).map(([index, item]) => ({ index, item }));
}

export function getSamplingRationale(
  frequency: Frequency,
  riskLevel: RiskLevel,
  populationSize: number,
  sampleSize: number,
  priorYearException: boolean
): string {
  return (
    `Based on the control frequency (${frequency}) and assessed risk level (${riskLevel}), ` +
    `we applied AICPA attribute sampling standards (AS 2315) to determine a sample size of ${sampleSize} ` +
    `from a population of ${populationSize} items.` +
    (priorYearException ? " Sample size was elevated by 25% due to a prior year exception on this control." : "") +
    " Samples were selected using random sampling methodology."
  );
}
