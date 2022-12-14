type Match = {
  total: number;
};

export type Fixtures = {
  played: Match,
  wins: Match,
  draws: Match,
  loses: Match,
};

type Team = {
  id: number,
  name: string,
  logo: string,
};

type Response = {
  team: Team;
  fixtures: Fixtures;
};
export type GetTeamResponse = {
  response: Response;
};
