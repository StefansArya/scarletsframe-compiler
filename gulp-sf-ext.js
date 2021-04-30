var through = require('through2');

module.exports = function(options) {
  function transform(file, encoding, callback) {
    if(options.data && options.data.counter !== void 0)
      options.data.counter++;

    options.instance.loadSource(
      file.base.split('\\').join('/')+'/',
      file.relative.split('\\').join('/'),
      options.onFinish,
      void 0,
      options.options._opt
    );

    this.push(file);
    callback();
  }

  return through.obj(transform);
};