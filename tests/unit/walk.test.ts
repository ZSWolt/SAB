import { describe, expect, it } from 'vitest';
import { frameTokens } from '../../src/background/frames';
import { parseWalkId } from '../../src/background/walk';

describe('page/tab walk ids', () => {
  it('parses where a field lives', () => {
    expect(parseWalkId('w|p3.t2|top|0')).toEqual({ page: 3, tab: 2, token: 'top', pos: 0 });
    expect(parseWalkId('w|p1.t0|fabc.1|4')).toEqual({ page: 1, tab: 0, token: 'fabc.1', pos: 4 });
    expect(parseWalkId('p1.0')).toBeNull();
  });

  it('names frames so a rebuilt iframe gets the same name', () => {
    const a = frameTokens([
      { frameId: 0, url: 'https://x/a', top: true },
      { frameId: 7, url: 'https://view.genial.ly/1?x=1', top: false },
      { frameId: 9, url: 'https://view.genial.ly/1?x=2', top: false },
    ]);
    // the same iframes after the site rebuilt them (new frameIds, new query strings)
    const b = frameTokens([
      { frameId: 0, url: 'https://x/a', top: true },
      { frameId: 31, url: 'https://view.genial.ly/1?y', top: false },
      { frameId: 40, url: 'https://view.genial.ly/1', top: false },
    ]);
    expect(a.get(0)).toBe('top');
    expect([a.get(7), a.get(9)]).toEqual([b.get(31), b.get(40)]);
    expect(a.get(7)).not.toBe(a.get(9));
  });
});
