import {Request, Response} from 'express';
import Team, {ITeam} from '../models/Team';
import Match, {IMatch} from '../models/Match';
import {buildBracket} from '../services/bracket';

export const getBracket = async (_req: Request, res: Response) => {
  try {
    const [teams, matches] = await Promise.all([
      Team.find().lean<ITeam[]>(),
      Match.find().lean<IMatch[]>()
    ]);
    res.status(200).json(buildBracket(teams, matches));
  } catch (err) {
    res.status(500).json({message: 'Failed to load bracket'});
  }
};
