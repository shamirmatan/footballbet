import {Request, Response} from 'express';
import Team, {ITeam} from '../models/Team';

export const getGroups = async (_req: Request, res: Response) => {
  try {
    const teams = await Team.find().lean<ITeam[]>();
    const byGroup: Record<string, ITeam[]> = {};
    for (const team of teams) {
      const g = team.group || '?';
      byGroup[g] = byGroup[g] ?? [];
      byGroup[g].push(team);
    }
    // Group standings use group-stage points only (wins * 3 + draws).
    // team.points is our custom total that includes the qualification
    // bonus and must NOT leak into the group table.
    const groupPoints = (t: ITeam): number => t.wins * 3 + t.draws;
    const groups = Object.keys(byGroup)
      .sort()
      .map((letter) => ({
        group: letter,
        teams: byGroup[letter].sort((a, b) => {
          const ap = groupPoints(a);
          const bp = groupPoints(b);
          if (bp !== ap) return bp - ap;
          if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
          if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
          return a.name.localeCompare(b.name);
        })
      }));
    res.status(200).json({groups});
  } catch (err) {
    res.status(500).json({message: 'Failed to load groups'});
  }
};
