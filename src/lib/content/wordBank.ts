import entries from 'virtual:word-bank';
import { makeBank } from './bank';

/** The word bank built into the app. */
export const bank = makeBank(entries);
