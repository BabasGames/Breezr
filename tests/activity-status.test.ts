import { describe, expect, test } from 'bun:test';
import { statusFields } from '../src/main/rpc/status';

// Discord's StatusDisplayType: 0 the activity name, 1 the state line, 2 the details line.
describe('status shown in Discord\'s member list', () => {
  test('the name doubles as the app name on the activity card: title and artist statuses keep "Deezer"', () => {
    expect(statusFields('song_title', 'Get Lucky', 'Daft Punk')).toEqual({ name: 'Deezer', statusDisplayType: 2 });
    expect(statusFields('artists_song', 'Get Lucky', 'Daft Punk')).toEqual({ name: 'Deezer', statusDisplayType: 1 });
  });

  test('combined texts have no other field: they replace the name', () => {
    expect(statusFields('artists_and_title', 'Get Lucky', 'Daft Punk')).toEqual({ name: 'Daft Punk - Get Lucky', statusDisplayType: 0 });
    expect(statusFields('title_and_artists', 'Get Lucky', 'Daft Punk')).toEqual({ name: 'Get Lucky - Daft Punk', statusDisplayType: 0 });
  });

  test('default: Deezer', () => {
    expect(statusFields('app_name', 'Get Lucky', 'Daft Punk')).toEqual({ name: 'Deezer', statusDisplayType: 0 });
    expect(statusFields(undefined, 'Get Lucky', 'Daft Punk')).toEqual({ name: 'Deezer', statusDisplayType: 0 });
  });
});
