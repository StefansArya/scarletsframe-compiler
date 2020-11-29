/* Some information if you're trying to understand the function
	path = {
		fileName: "file.ext",
		directory: "./project/path/"
	}

	content = original partial content from ".sf" extension
	callback = Must have {
		content: GeneratedString,	-- From original content to the generated content
		map: Array,					-- Source mapping for the generated content
		lines: TotalGeneratedLines	-- Total lines from the generated content
	}

	offset = original location offset from ".sf" script file

	------
	Generated content must ready for being combined with another global script content
 */
module.exports = function(path, content, callback, offset, options){
	const lines = content.split('\n').length;

	var map = [];
	for (var i = 0; i < lines; i++) {
		map.push({
			originalLine: offset+i,
			originalColumn: 0,
			generatedLine: i,
			generatedColumn: 0,
			source: path.fileName
		});
	}

	callback({content, map, lines});
}