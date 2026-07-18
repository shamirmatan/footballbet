import Tournament from '../models/Tournament';
import resolveTournament, {TournamentRequest} from './resolveTournament';

describe('resolveTournament', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('attaches the tournament and calls next() when the slug resolves', async () => {
    const fakeTournament = {_id: 'abc123', slug: 'wc26'} as any;
    jest.spyOn(Tournament, 'findOne').mockResolvedValue(fakeTournament);

    const req = {params: {tournamentSlug: 'wc26'}} as unknown as TournamentRequest;
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const res = {status, json} as any;
    const next = jest.fn();

    await resolveTournament(req, res, next);

    expect(Tournament.findOne).toHaveBeenCalledWith({slug: 'wc26'});
    expect(req.tournament).toBe(fakeTournament);
    expect(next).toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });

  it('responds 404 for an unknown slug', async () => {
    jest.spyOn(Tournament, 'findOne').mockResolvedValue(null);

    const req = {params: {tournamentSlug: 'nope'}} as unknown as TournamentRequest;
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const res = {status, json} as any;
    const next = jest.fn();

    await resolveTournament(req, res, next);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({message: expect.stringContaining('nope')}));
    expect(next).not.toHaveBeenCalled();
  });

  it('responds 500 when the lookup throws', async () => {
    jest.spyOn(Tournament, 'findOne').mockRejectedValue(new Error('db down'));

    const req = {params: {tournamentSlug: 'wc26'}} as unknown as TournamentRequest;
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const res = {status, json} as any;
    const next = jest.fn();

    await resolveTournament(req, res, next);

    expect(status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });
});
