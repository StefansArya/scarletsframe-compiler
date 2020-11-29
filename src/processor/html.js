// Some information are available on js_global.js

const htmlmin = require('html-minifier');

module.exports = function(path, content, callback, offset, options){
	content = `__tmplt["${
		(options.htmlPrefix + '/' || '') + path.fileName
	}"]=${
		JSON.stringify(
			!options.minify
				? content
				: htmlmin.minify(content, { collapseWhitespace: true })
		).split('{{ ').join('{{').split(' }}').join('}}')
	};`;

	callback({content, lines:1, map:[]});
}