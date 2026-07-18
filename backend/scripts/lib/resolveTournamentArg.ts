import Tournament, {ITournamentModel} from '../../src/models/Tournament';

/** Reads --tournament <slug> from argv and resolves it, or exits with an error. */
export async function resolveTournamentArg(argv: string[]): Promise<ITournamentModel> {
  const idx = argv.indexOf('--tournament');
  const slug = idx >= 0 ? argv[idx + 1] : undefined;
  if (!slug) {
    console.error('Missing --tournament <slug> (e.g. --tournament wc26).');
    process.exit(1);
  }
  const tournament = await Tournament.findOne({slug});
  if (!tournament) {
    console.error(`No tournament found with slug "${slug}".`);
    process.exit(1);
  }
  return tournament;
}
