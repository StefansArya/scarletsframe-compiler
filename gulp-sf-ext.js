var through = require('through2');

module.exports = function(options) {
  function transform(file, encoding, callback) {
    options.instance.loadSource(
      file.base.split('\\').join('/')+'/',
      file.relative.split('\\').join('/'),
      options.onFinish
    );

    this.push(file);
    callback();
  }

  return through.obj(transform);
};