import { describe, expect, it } from 'vitest';
import { encodeText, decodeText } from '../bytes';
import { createFramer, DelimiterFramer, LengthFramer, StartEndFramer } from './index';

const text = (frames: Uint8Array[]) => frames.map(decodeText);

describe('DelimiterFramer', () => {
  it('splits on newline and strips CR, keeping partial tail', () => {
    const f = new DelimiterFramer(encodeText('\n'));
    expect(text(f.push(encodeText('a,1\r\nb,2\nc,')))).toEqual(['a,1', 'b,2']);
    expect(text(f.push(encodeText('3\n')))).toEqual(['c,3']);
  });
  it('handles delimiter split across chunks', () => {
    const f = new DelimiterFramer(encodeText('\r\n'), 100, false);
    expect(text(f.push(encodeText('abc\r')))).toEqual([]);
    expect(text(f.push(encodeText('\ndef\r\n')))).toEqual(['abc', 'def']);
  });
  it('drops oldest bytes when no delimiter arrives within maxLength', () => {
    const f = new DelimiterFramer(encodeText('\n'), 4);
    f.push(encodeText('abcdefgh'));
    expect(text(f.push(encodeText('\n')))).toEqual(['efgh']);
  });
});

describe('StartEndFramer', () => {
  it('extracts frames between markers and discards junk', () => {
    const f = new StartEndFramer(encodeText('$'), encodeText(';'));
    expect(text(f.push(encodeText('junk$1,2;more$3,')))).toEqual(['1,2']);
    expect(text(f.push(encodeText('4;')))).toEqual(['3,4']);
  });
  it('can include markers', () => {
    const f = new StartEndFramer(encodeText('<'), encodeText('>'), 100, true);
    expect(text(f.push(encodeText('<a><b>')))).toEqual(['<a>', '<b>']);
  });
});

describe('LengthFramer', () => {
  it('emits fixed-size frames', () => {
    const f = new LengthFramer(3);
    expect(f.push(new Uint8Array([1, 2, 3, 4, 5])).map((x) => [...x])).toEqual([[1, 2, 3]]);
    expect(f.push(new Uint8Array([6, 7])).map((x) => [...x])).toEqual([[4, 5, 6]]);
  });
});

describe('createFramer', () => {
  it('unescapes delimiter strings from config', () => {
    const f = createFramer({ mode: 'delimiter', delimiter: '\\r\\n', maxLength: 100 });
    expect(text(f.push(encodeText('x\r\ny\r\n')))).toEqual(['x', 'y']);
  });
});
