export interface RankGroup {
  rank: number;
  teams: string[];
}

export const RANK_GROUPS: RankGroup[] = [
  {
    rank: 1,
    teams: ['Argentina', 'Spain', 'France', 'Brazil', 'England', 'Portugal', 'Germany', 'Netherlands']
  },
  {
    rank: 2,
    teams: ['Belgium', 'Croatia', 'Morocco', 'Colombia', 'Uruguay', 'Switzerland', 'United States', 'Japan']
  },
  {
    rank: 3,
    teams: ['Mexico', 'Senegal', 'Ivory Coast', 'Türkiye', 'Austria', 'South Korea', 'Ecuador', 'Australia']
  },
  {
    rank: 4,
    teams: ['Egypt', 'Sweden', 'Norway', 'Czechia', 'Scotland', 'Iran', 'Canada', 'Paraguay']
  },
  {
    rank: 5,
    teams: ['Tunisia', 'Algeria', 'Ghana', 'Qatar', 'Saudi Arabia', 'Uzbekistan', 'South Africa', 'Bosnia & Herz.']
  },
  {
    rank: 6,
    teams: ['DR Congo', 'Jordan', 'New Zealand', 'Panama', 'Iraq', 'Haiti', 'Curacao', 'Cape Verde']
  }
];
