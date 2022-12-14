import {Request, Response} from 'express';
import Team from "../models/Team";
import axios from "axios";
import {Fixtures, GetTeamResponse} from '../models/Update';

const updateTeams = (req: Request, res: Response) => {
  const {name} = req.body
  return Team.findOne({name: name})
    .then(async (team) => {
      if (team) {
        await getTeam(team.api_id).then(
          (data) => {
            team.set(
              {
                // @ts-ignore
                games: data.fixtures.played.total,
                // @ts-ignore
                wins: data.fixtures.wins.total,
                // @ts-ignore
                losses: data.fixtures.loses.total,
                // @ts-ignore
                draws: data.fixtures.draws.total,
                // @ts-ignore
                points: getPoints(data.fixtures),
                // @ts-ignore
                qualifications: getQualifications(data.fixtures)
              }
            )
          })
        return team
          .save()
          .then((team) => res.status(201).json({team}))
          .catch((error) => res.status(500).json({error}));
      } else {
        return res.status(404).json({message: 'not found'});
      }
    })
    .catch((error) => res.status(500).json({error}));
}

async function getTeam(apiId: number) {
  try {
    const {data} = await axios.get<GetTeamResponse>(
      `https://v3.football.api-sports.io/teams/statistics?team=${apiId}&league=1&season=2022`,
      {
        headers: {
          'x-rapidapi-host': 'v3.football.api-sports.io',
          'x-rapidapi-key': 'a334149f067c28ebb0ca60e48822c0cc'
        }
      },
    );
    return data.response;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.log('error message: ', error.message);
      return error.message;
    } else {
      console.log('unexpected error: ', error);
      return 'An unexpected error occurred';
    }
  }
}

const getPoints = (fixtures: Fixtures): number => {
  return fixtures.wins.total * 3 + fixtures.draws.total + getQualifications(fixtures) * 2
}

const getQualifications = (fixtures: Fixtures): number => {
  return fixtures.played.total >= 3 ? fixtures.played.total - 3 : 0
}
export default {updateTeams};
