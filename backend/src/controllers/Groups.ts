import {Response} from 'express';
import Team, {ITeam} from '../models/Team';
import {TournamentRequest} from '../middleware/resolveTournament';

export const getGroups = async (req: TournamentRequest, res: Response) => {
  try {
    const teams = await Team.find({tournamentId: req.tournament!._id}).lean<ITeam[]>();
    const byGroup: Record<string, ITeam[]> = {};
    for (const team of teams) {
      const g = team.group || '?';
      byGroup[g] = byGroup[g] ?? [];
      byGroup[g].push(team);
    }
    // Order by football-data's computed position — they apply the official
    // FIFA tiebreaker chain (head-to-head, discipline, lots), which we
    // can't replicate from persisted stats alone.
    const groups = Object.keys(byGroup)
      .sort()
      .map((letter) => ({
        group: letter,
        teams: byGroup[letter].sort((a, b) => (a.position || 99) - (b.position || 99))
      }));
    res.status(200).json({groups});
  } catch (err) {
    res.status(500).json({message: 'Failed to load groups'});
  }
};
