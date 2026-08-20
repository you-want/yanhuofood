import type {
  NearbyRecommendation,
  NearbyRecommendationMode,
} from "@/lib/places/types";

const MODE_CONFIG: Record<NearbyRecommendationMode, { poolSize: number; temperature: number }> = {
  safe: { poolSize: 5, temperature: 0.3 },
  balanced: { poolSize: 15, temperature: 0.7 },
  surprise: { poolSize: 30, temperature: 1.2 },
};

function weightedIndex(
  candidates: NearbyRecommendation[],
  temperature: number,
  random: () => number
) {
  const bestScore = Math.max(...candidates.map((candidate) => candidate.score));
  const weights = candidates.map((candidate) =>
    Math.exp((candidate.score - bestScore) / Math.max(1, 10 * temperature))
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let target = Math.min(Math.max(random(), 0), 0.999999999) * total;

  for (let index = 0; index < weights.length; index += 1) {
    target -= weights[index];
    if (target <= 0) return index;
  }
  return weights.length - 1;
}

export function pickWeightedRecommendations(
  ranked: NearbyRecommendation[],
  mode: NearbyRecommendationMode,
  count = 1,
  random: () => number = Math.random
) {
  if (ranked.length === 0 || count <= 0) return [];
  const config = MODE_CONFIG[mode];
  const pool = ranked.slice(0, config.poolSize);
  const selected: NearbyRecommendation[] = [];
  const remaining = [...pool];

  while (remaining.length > 0 && selected.length < count) {
    const index = weightedIndex(remaining, config.temperature, random);
    selected.push(remaining[index]);
    remaining.splice(index, 1);
  }

  return selected;
}
