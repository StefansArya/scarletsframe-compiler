// Some information are available on js_global.js

var sass, SourceMapConsumer;
module.exports = function(path, content, callback, offset, options){
	// Must implement lazy load
	if(sass === void 0){
		sass = require('node-sass');
		SourceMapConsumer = require('source-map').SourceMapConsumer;
	}

	sass.render({
		file:path.fileName,
		data: content,
		includePaths: [path.directory],
		sourceMap: 'nyam' // /*# sourceMappingURL=nyam */
	}, async function(err, result){
		if(err) throw err;
		const consumer = await new SourceMapConsumer(result.map.toString('utf8'));

		var map = [];
		consumer.eachMapping((m)=> {
			map.push(m);
			m.originalLine += offset;
			m.source = path.fileName;
		});

		consumer.destroy();

		const content = result.css.toString('utf8').split('/*# sourceMappingURL')[0];
		const lines = content.split('\n').length;
		callback({content, lines, map});
	});
}