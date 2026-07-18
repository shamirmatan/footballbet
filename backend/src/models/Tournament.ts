import mongoose, {Document, Schema} from 'mongoose';

export type TournamentStatus = 'upcoming' | 'live' | 'archived';

export interface ITournament {
  slug: string;
  name: string;
  shortName: string;
  // football-data.org competition code (e.g. "WC"). Empty until the admin
  // wires up the next tournament's data source.
  competitionCode: string;
  status: TournamentStatus;
  // Independent per tournament: WC26's draft can stay locked forever while
  // Euro 2028's draft is still open, or vice versa.
  draftLocked: boolean;
  seasonStart: string;
  seasonEnd: string;
  // Display order for the tournament switcher.
  sortOrder: number;
  // Number of group-stage groups (informational — the group letters
  // themselves come from whatever the data source reports).
  groupsCount: number;
  // Ordered list of this tournament's knockout stages, group stage and any
  // non-scoring stage (e.g. a third-place match) excluded — e.g.
  // ['LAST_32', 'LAST_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'FINAL'] for a
  // 48-team World Cup, or ['LAST_16', 'QUARTER_FINALS', 'SEMI_FINALS',
  // 'FINAL'] for a 24-team Euro. Drives both which matches count as knockout
  // fixtures and each stage's qualification-bonus rank (by position in this
  // list), so a shorter bracket doesn't inherit a longer one's stage-name bonuses.
  knockoutStages: string[];
  // How many third-placed group teams advance to the knockout stage (e.g. 8
  // of 12 for WC26, 4 of 6 for Euro).
  thirdPlaceSlots: number;
}

export interface ITournamentModel extends ITournament, Document {
}

const TournamentSchema: Schema = new Schema(
  {
    slug: {type: String, required: true, unique: true, index: true},
    name: {type: String, required: true},
    shortName: {type: String, required: true},
    competitionCode: {type: String, default: ''},
    status: {type: String, enum: ['upcoming', 'live', 'archived'], required: true, default: 'upcoming'},
    draftLocked: {type: Boolean, required: true, default: true},
    seasonStart: {type: String, default: ''},
    seasonEnd: {type: String, default: ''},
    sortOrder: {type: Number, required: true, default: 0},
    groupsCount: {type: Number, required: true, default: 12},
    knockoutStages: {
      type: [String],
      required: true,
      default: ['LAST_32', 'LAST_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'FINAL']
    },
    thirdPlaceSlots: {type: Number, required: true, default: 8}
  },
  {
    versionKey: false
  }
);

export default mongoose.model<ITournamentModel>('Tournament', TournamentSchema);
