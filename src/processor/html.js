// Some information are available on js_global.js

const htmlmin = require('html-minifier');

const empty_array = Object.freeze([]);
module.exports = function(path, content, callback, offset, options){
	const html = JSON.stringify(!options.minify
		? content
		: htmlmin.minify(content, { collapseWhitespace: true })
	).split('{{ ').join('{{').split(' }}').join('}}');

	let prefix = options.htmlPrefix || '';
	if(options.htmlPrefix) prefix += '/';

	if(options.extra === 'append_to_body'){
		content = `_sf_internal.append("${prefix + path.fileName}", ${html})`;
		callback({content, lines:1, map: empty_array});
		return;
	}
	else if(options.extra === 'prepend_to_body'){
		content = `_sf_internal.prepend("${prefix + path.fileName}", ${html})`;
		callback({content, lines:1, map: empty_array});
		return;
	}
	else if(options.extra !== void 0)
		return console.error(options.extra, "is not suported for HTML options in", prefix + path.fileName);

	content = `__tmplt["${prefix + path.fileName}"]=${html};`;
	callback({content, lines:1, map: empty_array});
}