import {Request, Response} from 'express';
import Team, {ITeam} from "../models/Team";
import axios from "axios";
import {Fixtures, GetTeamResponse} from '../models/Update';
import Participant from "../models/Participant";
import {delay} from "rxjs";

export const updateParticipantsPeriodically = async () => {
  try {
    for await (const participant of Participant.find().populate('teams')) {
      participant.set(sumTeamPoints(participant.teams));
      await participant.save()
    }
  } catch (e) {
    console.log("Updated Failed!");
  }
};

export const updateTeamsPeriodically = async () => {
  try {
    for await(const team of Team.find()) {
      console.log(`Updating ${team.name}...`)
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
              qualifications: getQualifications(data.fixtures),
              // @ts-ignore
              logo: data.team.logo,
            }
          )
        })
      await team.save()
      await delay(5000)
    }
    await updateParticipantsPeriodically()
    console.log("Updated Successfully!");
  } catch (error) {
    console.log("Updated Failed!");
  }
}
const updateParticipants = async (_req: Request, res: Response) => {
  try {
    for await (const participant of Participant.find().populate('teams')) {
      console.log(`Updating ${participant.lastName}`)
      participant.set(sumTeamPoints(participant.teams));
      await participant.save()
    }
    res.status(201).json({message: "Updated Successfully!"});
  } catch (e) {
    res.status(500).json({message: "Updated Failed!"});
  }
};

const updateTeams = async (req: Request, res: Response) => {
  const {names} = req.body
  try {
    for await(const team of Team.find({name: {$in: names}})) {
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
              qualifications: getQualifications(data.fixtures),
              // @ts-ignore
              logo: data.team.logo,
            }
          )
        })
      await team.save()
    }
    res.status(201).json({message: "Updated Successfully!"});
  } catch (error) {
    res.status(500).json({message: "Updated Failed!"});
  }
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
  const qualificationRules: any = {
    0: 0,
    1: 2,
    2: 4,
    3: 6,
    4: 8,
    5: 13
  }
  return fixtures.wins.total * 3 + fixtures.draws.total + qualificationRules[getQualifications(fixtures).toString()]
}

const getQualifications = (fixtures: Fixtures): number => {
  return fixtures.played.total >= 3 ? fixtures.played.total - 3 : 0
}

const sumTeamPoints = (teams: [ITeam]): any => {
  let sum = 0;
  teams.forEach((team) => {
    sum += team.points;
  });
  return {points: sum}
}
export default {updateTeams, updateParticipants};
