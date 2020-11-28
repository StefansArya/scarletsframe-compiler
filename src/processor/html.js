// Some information are available on js_global.js

module.exports = function(path, content, callback, offset){
	content = `__tmplt["${path.directory+path.fileName}"]=${JSON.stringify(content)};`;
	callback({content, lines:1, map:[]});
}