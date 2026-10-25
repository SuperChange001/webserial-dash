import { encodeText, unescapeString } from '../bytes';
import { DelimiterFramer } from './delimiter-framer';
import { LengthFramer } from './length-framer';
import { StartEndFramer } from './start-end-framer';
import type { Framer, FramingConfig } from './types';

export * from './types';
export { DelimiterFramer, StartEndFramer, LengthFramer };

/** Build a framer from dashboard config. Marker strings accept escapes like "\n" or "\x02". */
export function createFramer(config: FramingConfig): Framer {
  switch (config.mode) {
    case 'delimiter':
      return new DelimiterFramer(encodeText(unescapeString(config.delimiter)), config.maxLength);
    case 'startEnd':
      return new StartEndFramer(
        encodeText(unescapeString(config.start)),
        encodeText(unescapeString(config.end)),
        config.maxLength,
        config.includeMarkers,
      );
    case 'length':
      return new LengthFramer(config.length);
  }
}
