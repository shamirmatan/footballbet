import {Request, Response} from 'express';
import mongoose from 'mongoose';
import Team from '../models/Team';

const toTitleCase = (phrase: string) => {
  return phrase
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};
const createTeam = (req: Request, res: Response) => {
  const {logo, name, api_id} = req.body;
  const team = new Team({
    _id: new mongoose.Types.ObjectId(),
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

const readTeam = (req: Request, res: Response) => {
  const teamName = toTitleCase(req.params.teamName);

  return Team.findOne({name: teamName})
    .then((team) => (team ? res.status(200).json({team}) : res.status(404).json({message: 'not found'})))
    .catch((error) => res.status(500).json({error}));
};

const readAll = (req: Request, res: Response) => {
  return Team.find()
    .then((teams) => res.status(200).json({teams}))
    .catch((error) => res.status(500).json({error}));
};

const updateTeam = (req: Request, res: Response) => {
  const teamName = toTitleCase(req.params.teamName);

  return Team.findOne({name: teamName})
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


const updateTeamById = (req: Request, res: Response) => {
  const teamId = req.params.teamId;

  return Team.findById(teamId)
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
