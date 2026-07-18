import mongoose, {Document, Schema} from 'mongoose';

export interface ITeam {
  tournamentId: mongoose.Types.ObjectId;
  api_id: number;
  name: string;
  group: string;
  position: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  totalGames: number;
  totalWins: number;
  totalDraws: number;
  totalLosses: number;
  totalGoalsFor: number;
  totalGoalsAgainst: number;
  points: number;
  qualifications: number;
  logo: string;
  eliminated: boolean;
  tier: number;
}

export interface ITeamModel extends ITeam, Document {
}

const TeamSchema: Schema = new Schema(
  {
    tournamentId: {type: Schema.Types.ObjectId, required: true, ref: 'Tournament', index: true},
    name: {type: String, required: true},
    api_id: {type: Number, required: true},
    group: {type: String, required: true},
    position: {type: Number, required: true, default: 0},
    games: {type: Number, required: true, default: 0},
    wins: {type: Number, required: true, default: 0},
    losses: {type: Number, required: true, default: 0},
    draws: {type: Number, required: true, default: 0},
    goalsFor: {type: Number, required: true, default: 0},
    goalsAgainst: {type: Number, required: true, default: 0},
    goalDifference: {type: Number, required: true, default: 0},
    totalGames: {type: Number, required: true, default: 0},
    totalWins: {type: Number, required: true, default: 0},
    totalDraws: {type: Number, required: true, default: 0},
    totalLosses: {type: Number, required: true, default: 0},
    totalGoalsFor: {type: Number, required: true, default: 0},
    totalGoalsAgainst: {type: Number, required: true, default: 0},
    points: {type: Number, required: true, default: 0},
    qualifications: {type: Number, required: true, default: 0},
    logo: {type: String, required: false, default: ''},
    eliminated: {type: Boolean, required: false, default: false},
    tier: {type: Number, required: false, default: 0}
  },
  {
    versionKey: false,
    strict: false,
  }
);

// A team's api_id is only unique within its own tournament — the same
// football-data.org team id can (and will) recur across tournaments.
TeamSchema.index({tournamentId: 1, api_id: 1}, {unique: true});

export default mongoose.model<ITeamModel>('Team', TeamSchema);
