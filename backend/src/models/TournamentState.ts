import mongoose, {Document, Schema} from 'mongoose';

export interface IMatchSummary {
  home: string;
  away: string;
  homeLogo?: string;
  awayLogo?: string;
  utcDate: string;
  group?: string | null;
  stage: string;
  status: string;
  scoreHome?: number | null;
  scoreAway?: number | null;
}

export interface ITournamentState {
  tournamentId: mongoose.Types.ObjectId;
  stage: string;
  currentMatchday: number | null;
  nextMatch: IMatchSummary | null;
  liveMatch: IMatchSummary | null;
  seasonStart: string;
  seasonEnd: string;
  updatedAt: Date;
}

export interface ITournamentStateModel extends ITournamentState, Document {
}

const MatchSummarySchema: Schema = new Schema(
  {
    home: {type: String, required: true},
    away: {type: String, required: true},
    homeLogo: String,
    awayLogo: String,
    utcDate: {type: String, required: true},
    group: {type: String, default: null},
    stage: {type: String, required: true},
    status: {type: String, required: true},
    scoreHome: {type: Number, default: null},
    scoreAway: {type: Number, default: null}
  },
  {_id: false}
);

const TournamentStateSchema: Schema = new Schema(
  {
    tournamentId: {type: Schema.Types.ObjectId, required: true, ref: 'Tournament'},
    stage: {type: String, required: true},
    currentMatchday: {type: Number, default: null},
    nextMatch: {type: MatchSummarySchema, default: null},
    liveMatch: {type: MatchSummarySchema, default: null},
    seasonStart: {type: String, required: true},
    seasonEnd: {type: String, required: true},
    updatedAt: {type: Date, default: Date.now}
  },
  {versionKey: false}
);

// One live-state snapshot per tournament.
TournamentStateSchema.index({tournamentId: 1}, {unique: true});

export default mongoose.model<ITournamentStateModel>('TournamentState', TournamentStateSchema);
