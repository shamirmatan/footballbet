import {Request, Response} from 'express';
import TournamentState from '../models/TournamentState';

export const getTournament = async (_req: Request, res: Response) => {
  try {
    const state = await TournamentState.findOne().sort({updatedAt: -1}).lean();
    res.status(200).json(state ?? null);
  } catch (err) {
    res.status(500).json({message: 'Failed to load tournament state'});
  }
};
