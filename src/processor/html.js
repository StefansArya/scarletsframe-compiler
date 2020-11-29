// Some information are available on js_global.js

const htmlmin = require('html-minifier');

module.exports = function(path, content, callback, offset, options){
	content = `__tmplt["${
		(options.htmlPrefix || '') + path.fileName
	}"]=${JSON.stringify(htmlmin.minify(content))};`;

	callback({content, lines:1, map:[]});
}