// Some information are available on js_global.js

module.exports = function(path, content, callback, offset, options){
	content = `__tmplt["${
		(options.htmlPrefix || '') + path.fileName
	}"]=${JSON.stringify(content)};`;

	callback({content, lines:1, map:[]});
}