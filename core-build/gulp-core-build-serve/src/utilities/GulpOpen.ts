// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';

export function open(opts: { uri?: string }): NodeJS.WritableStream {
  /* eslint-disable @typescript-eslint/typedef */
  const open = require('open');
  const through = require('through2');
  /* eslint-enable @typescript-eslint/typedef */

  /* eslint-disable-next-line @typescript-eslint/typedef */
  return through.obj(function (file, enc, cb) {
    const uri: string | undefined = opts.uri || file.path;

    console.log(colors.blue(`Opening ${colors.green(uri)} using the ${colors.green('default OS app')}`));
    // Open with the default app defined by the os
    open(uri, { wait: false });
    return cb(null, file);
  });
}
