// Some information are available on js.js

var sass, SourceMapConsumer;
module.exports = function(path, content, callback, offset, options){
	// Must implement lazy load
	if(sass === void 0){
		sass = require('sass');
		SourceMapConsumer = require('source-map').SourceMapConsumer;
	}

	sass.compileStringAsync(content, {
		loadPaths: [path.directory],
		sourceMapIncludeSources: true,
		sourceMap: true,
	}).then(async function(result){
		const consumer = await new SourceMapConsumer(result.sourceMap);

		var map = [];
		consumer.eachMapping((m)=> {
			map.push(m);
			m.originalLine += offset;
			m.source = path.relativePath;
		});

		consumer.destroy();

		const content = result.css.split('/*# sourceMappingURL')[0];
		const lines = content.split('\n').length;
		callback({content, lines, map});
	}).catch(err => {
		if(err){
			callback({content:'', lines:1, map:[]});
			return console.error(err);
		}
	});
}