import { beforeEach, describe, expect, it } from 'vitest';
import { findPagination } from '../../src/content/extract/pages';

beforeEach(() => {
  document.body.innerHTML = '';
});

const pager = (current: number, order = [3, 2, 1]) =>
  `<div class="pager">${order
    .map((n) => `<span style="background:${n === current ? 'rgb(255, 69, 0)' : 'rgb(136, 136, 136)'}">${n}</span>`)
    .join('')}</div>`;

describe('findPagination', () => {
  it('finds 3-2-1 page buttons and the orange (current) one', () => {
    document.body.innerHTML = `<div><p>שאלה</p><textarea></textarea></div>${pager(1)}`;
    const p = findPagination();
    expect(p?.buttons.map((b) => b.textContent)).toEqual(['1', '2', '3']);
    expect(p?.current).toBe(1);
    document.body.innerHTML = pager(2, [1, 2, 3]);
    expect(findPagination()?.current).toBe(2);
  });

  it('uses aria-current / active class when there is one', () => {
    document.body.innerHTML = `<ul class="pages"><li><a href="#">1</a></li><li class="active"><a href="#">2</a></li><li><a href="#">3</a></li></ul>`;
    const p = findPagination();
    expect(p?.buttons).toHaveLength(3);
    expect(p?.buttons[0].tagName).toBe('A');
    expect(p?.current).toBe(2);
  });

  it('ignores 1–5 rating scales and lone numbers', () => {
    document.body.innerHTML = `
      <fieldset><legend>כמה אהבת?</legend>
        ${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="s">${n}</label>`).join('')}
      </fieldset>
      <p>שאלה <span>4</span></p>`;
    expect(findPagination()).toBeNull();
  });

  it('needs consecutive numbers starting at 1', () => {
    document.body.innerHTML = `<div><button>2</button><button>3</button></div>`;
    expect(findPagination()).toBeNull();
  });
});
