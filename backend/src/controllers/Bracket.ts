import {Response} from 'express';
import Team, {ITeam} from '../models/Team';
import Match, {IMatch} from '../models/Match';
import {buildBracket} from '../services/bracket';
import {TournamentRequest} from '../middleware/resolveTournament';

export const getBracket = async (req: TournamentRequest, res: Response) => {
  try {
    const tournamentId = req.tournament!._id;
    const [teams, matches] = await Promise.all([
      Team.find({tournamentId}).lean<ITeam[]>(),
      Match.find({tournamentId}).lean<IMatch[]>()
    ]);
    res.status(200).json(buildBracket(teams, matches));
  } catch (err) {
    res.status(500).json({message: 'Failed to load bracket'});
  }
};
