import candidatesFile from '../../../content/candidates.json';
import sampleFile from '../../../content/entries/000-sample.json';
import { joinBank, makeBank, type Bank, type CandidateRow } from '../content/bank';
import type { Entry } from '../content/types';

/** The 20 sample entries joined with the real candidate list, as the app builds them. */
export function sampleBank(): Bank {
  const rows = (candidatesFile as unknown as { candidates: CandidateRow[] }).candidates;
  return makeBank(joinBank(sampleFile as unknown as Entry[], rows));
}
