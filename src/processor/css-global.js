// Some information are available on js.js

module.exports = function(path, content, callback, offset, options){
	const lines = content.split('\n').length;

	var map = [];
	for (var i = 0; i < lines; i++) {
		map.push({
			originalLine: offset+i,
			originalColumn: 0,
			generatedLine: i,
			generatedColumn: 0,
			source: path.relativePath
		});
	}

	callback({content, map, lines});
}