var through = require('through2');
var getRelativePathFromList = require('./sf-relative-path.js');

module.exports = function(options) {
  let opt = options.options._opt;

  function transform(file, encoding, callback) {
    if(options.data && options.data.counter !== void 0)
      options.data.counter++;

    const fullPath = file.path.split('\\').join('/');
    const path = getRelativePathFromList(fullPath, opt.combine, opt.root);

    options.instance.loadSource(
      fullPath.replace(path, ''),
      path,
      options.onFinish,
      void 0,
      options.options._opt,
      false
    );

    this.push(file);
    callback();
  }

  return through.obj(transform);
};