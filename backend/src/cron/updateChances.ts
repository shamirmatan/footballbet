import mongoose from 'mongoose';
import {config} from '../config/config';
import Logging from '../library/Logging';
import Team from '../models/Team';
import Participant from '../models/Participant';
import Match from '../models/Match';
import {
  SimTeam,
  SimMatch,
  SimParticipant,
  computeChances,
} from '../services/chances';

const RUNS = Number(process.env.CHANCES_RUNS || 20000);

function groupLetter(g: string | null | undefined): string {
  if (!g) return '?';
  const m = g.match(/([A-Z])$/i);
  return m ? m[1].toUpperCase() : g.toUpperCase();
}

async function main() {
  await mongoose.connect(config.mongo.url, {retryWrites: true, w: 'majority'});
  Logging.info('Chances: connected to Mongo.');

  const teamDocs = await Team.find().lean();
  const participantDocs = await Participant.find().lean();
  const matchDocs = await Match.find({stage: 'GROUP_STAGE'}).lean();

  const teams: SimTeam[] = teamDocs.map((t: any) => ({
    api_id: t.api_id,
    group: groupLetter(t.group),
    tier: t.tier || 6,
    achievedQual: t.qualifications || 0,
    eliminated: !!t.eliminated,
  }));

  const matches: SimMatch[] = matchDocs
    .filter((m: any) => m.homeTeam?.api_id && m.awayTeam?.api_id)
    .map((m: any) => ({
      group: groupLetter(m.group),
      status: m.status,
      homeId: m.homeTeam.api_id,
      awayId: m.awayTeam.api_id,
      scoreHome: m.scoreHome ?? null,
      scoreAway: m.scoreAway ?? null,
    }));

  // map team ObjectId -> api_id so participant.teams (ObjectIds) become api_ids
  const apiIdByObjId = new Map<string, number>();
  for (const t of teamDocs as any[]) apiIdByObjId.set(String(t._id), t.api_id);

  const participants: SimParticipant[] = participantDocs.map((p: any) => ({
    lastName: p.lastName,
    teamIds: (p.teams || [])
      .map((id: any) => apiIdByObjId.get(String(id)))
      .filter((x: any): x is number => typeof x === 'number'),
  }));

  const chances = computeChances(teams, participants, matches, {
    runs: RUNS,
    seed: Date.now(),
  });

  for (const p of participantDocs as any[]) {
    const pct = chances[p.lastName] ?? 0;
    await Participant.updateOne({_id: p._id}, {$set: {chances: pct}});
    Logging.info(`Chances: ${p.lastName} = ${pct}%`);
  }

  Logging.info(`Chances: done (${RUNS} runs).`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  Logging.error(err);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
