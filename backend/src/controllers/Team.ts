import {Response} from 'express';
import mongoose from 'mongoose';
import Team from '../models/Team';
import {TournamentRequest} from '../middleware/resolveTournament';

const toTitleCase = (phrase: string) => {
  return phrase
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};
const createTeam = (req: TournamentRequest, res: Response) => {
  const {logo, name, api_id} = req.body;
  const team = new Team({
    _id: new mongoose.Types.ObjectId(),
    tournamentId: req.tournament!._id,
    name: name,
    api_id: api_id,
    games: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    qualifications: 0,
    points: 0,
    logo: logo,
  });

  return team
    .save()
    .then((team) => res.status(201).json({team}))
    .catch((error) => res.status(500).json({error}));
};

const readTeam = (req: TournamentRequest, res: Response) => {
  const teamName = toTitleCase(req.params.teamName);

  return Team.findOne({name: teamName, tournamentId: req.tournament!._id})
    .then((team) => (team ? res.status(200).json({team}) : res.status(404).json({message: 'not found'})))
    .catch((error) => res.status(500).json({error}));
};

const readAll = (req: TournamentRequest, res: Response) => {
  return Team.find({tournamentId: req.tournament!._id})
    .then((teams) => res.status(200).json({teams}))
    .catch((error) => res.status(500).json({error}));
};

const updateTeam = (req: TournamentRequest, res: Response) => {
  const teamName = toTitleCase(req.params.teamName);

  return Team.findOne({name: teamName, tournamentId: req.tournament!._id})
    .then((team) => {
      if (team) {
        team.set(req.body);

        return team
          .save()
          .then((team) => res.status(201).json({team}))
          .catch((error) => res.status(500).json({error}));
      } else {
        return res.status(404).json({message: 'not found'});
      }
    })
    .catch((error) => res.status(500).json({error}));
};


const updateTeamById = (req: TournamentRequest, res: Response) => {
  const teamId = req.params.teamId;

  return Team.findOne({_id: teamId, tournamentId: req.tournament!._id})
    .then((team) => {
      if (team) {
        team.set(req.body);
        return team
          .save()
          .then((team) => res.status(201).json({team}))
          .catch((error) => res.status(500).json({error}));
      } else {
        return res.status(404).json({message: 'not found'});
      }
    })
    .catch((error) => res.status(500).json({error}));
};

export default {createTeam, readTeam, readAll, updateTeam, updateTeamById};
