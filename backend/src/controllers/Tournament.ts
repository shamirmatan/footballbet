import {Request, Response} from 'express';
import TournamentState from '../models/TournamentState';
import {config} from '../config/config';

export const getTournament = async (_req: Request, res: Response) => {
  try {
    const state = await TournamentState.findOne().sort({updatedAt: -1}).lean();
    res.status(200).json({...(state ?? {}), draftLocked: config.draftLocked});
  } catch (err) {
    res.status(500).json({message: 'Failed to load tournament state'});
  }
};
