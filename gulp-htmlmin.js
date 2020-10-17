// Modified version of: https://github.com/jonschlinkert/gulp-htmlmin/blob/master/index.js

'use strict';

const PluginError = require('plugin-error');
const htmlmin = require('html-minifier');
const through = require('through2');

module.exports = options => {
  return through.obj(function(file, enc, next) {
    if (file.isNull()) {
      next(null, file);
      return;
    }

    const minify = (buf, _, cb) => {
      try {
        buf = Buffer.from(htmlmin.minify(buf.toString(), options));
      } catch (err) {}

      if (next === cb) {
        file.contents = buf;
        cb(null, file);
        return;
      }

      cb(null, buf);
      next(null, file);
    };

    if (file.isStream()) {
      file.contents = file.contents.pipe(through(minify));
    } else {
      minify(file.contents, null, next);
    }
  });
};