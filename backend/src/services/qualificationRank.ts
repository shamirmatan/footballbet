import {Stage} from './bracketDefinitions';

/**
 * Qualification rank for reaching (won=false) or advancing past (won=true) a
 * knockout stage, relative to THIS tournament's own bracket depth —
 * knockoutStages is the tournament's ordered knockout-stage list (e.g. 5
 * rounds for a 48-team World Cup, 4 for a 24-team Euro). Reaching the final
 * is always "one below top" and winning it is always "top", regardless of
 * how many rounds it took to get there — so a shorter bracket doesn't
 * silently inherit a longer one's stage-name-keyed bonus tier (e.g. Euro's
 * Round of 16, its first knockout round, must not score the same as WC26's
 * Round of 16, which is its SECOND).
 *
 * GROUP_STAGE, THIRD_PLACE (excluded from the scoring pool), and any stage
 * not in knockoutStages rank as 0.
 */
export const qualificationRank = (
  stage: Stage | string,
  knockoutStages: (Stage | string)[],
  won: boolean
): number => {
  const idx = knockoutStages.indexOf(stage);
  if (idx < 0) return 0;
  const reachedRank = idx + 1; // 1-based: first knockout round = rank 1
  return won ? reachedRank + 1 : reachedRank;
};
