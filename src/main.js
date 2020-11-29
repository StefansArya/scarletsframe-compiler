var fs = require('fs');
const {SourceMapGenerator} = require('source-map');

// Contribution welcome :')
const processor = {
	html: require('./processor/html.js'),
	js_global: require('./processor/js_global.js'),
	scss_global: require('./processor/scss_global.js'),
};

const category = {
	js:['html', 'js_global'],
	css:['scss_global']
};

// Initial script before creating combined content
const sourceInit = {
	js:'if(!window.templates)window.templates={};const __tmplt=window.templates;',
	css:''
};


// ========================================

module.exports = class SFCompiler{
	cache = {};
	processing = {};

	constructor(options){
		this.options = options || {};
		for(const key in processor)
			this.processing[key] = new Set();
	}

	// Open the source, split it
	sourceCallbackWait = 0; // for throttling
	sourceChanges = {};
	loadSource(root, path, callback, singleCompile){
		const that = this;
		const {cache, processing} = this;

		that.sourceCallbackWait++;

		let cached = cache[path];
		let raw = fs.readFileSync(root+path, 'utf8');

		if(cached !== void 0 && cached.raw !== void 0 && cached.raw === raw){
			if(--that.sourceCallbackWait === 0){
				const temp = that.sourceChanges;
				that.sourceChanges = {};

				if(!singleCompile) callback(temp);
			}

			return;
		}

		if(cached === void 0)
			cached = cache[path] = { raw };

		let content = raw.split('\n## ');

		var lines = 0;
		if(content[0].slice(0, 3) === '## ')
			content[0] = content[0].slice(3);
		else{
			lines = content[0].split('\n').length;
			content.shift();
		}

		lines += 2;

		let splitPath = {
			fileName:path,
			directory:root
		};

		let processed = 0;
		for (let i = 0; i < content.length; i++) {
			const temp = content[i];
			const a = content[i].indexOf('\n');
			let which = temp.slice(0, a).split('-').join('_');

			if(which === 'comment'){
				processed++;
				continue;
			}

			let current = cached[which];
			if(current === void 0)
				current = cached[which] = {};

			if(cached[which].rawContent === temp)
				continue;

			current.rawContent = temp;

			var func = processor[which];
			if(!func) throw new Error(`'${which}' is not ready yet`);

			if(category.css.includes(which))
				that.sourceChanges.css = true;
			else if(category.js.includes(which))
				that.sourceChanges.js = true;

			const proc = processing[which];
			proc.add(path);

			func(splitPath, temp.slice(a+1).trim(), function(data){
				Object.assign(current, data); // map, content, lines

				if(singleCompile && singleCompile.includes(which))
					callback(data, true);

				current.path = path;
				proc.delete(path);

				if(++processed === content.length){
					if(--that.sourceCallbackWait === 0){
						const temp = that.sourceChanges;
						that.sourceChanges = {};
						callback(temp);
					}
				}
			}, lines, that.options);

			lines += temp.split('\n').length;
		}
	}

	// which: js, css
	extractAll(which, sourceRoot, distName, callback){
		const that = this;
		const {cache, processing} = this;
		const relations = category[which];

		// Return if the compiler still processing the same category
		for (var i = 0; i < relations.length; i++) {
			if(processing[relations[i]].size !== 0)
				return callback(false);
		}

		var currentLines = 1;
		var init = sourceInit[which];
		var map = new SourceMapGenerator({
			file: `${distName}.${which}`, sourceRoot
		});

		for(var path in cache){
			const content = cache[path];
			map.setSourceContent(path, content.raw);

			for(let i=0; i<relations.length; i++){
				const current = content[relations[i]];

				for (let a = 0; a < current.map.length; a++) {
					const t = current.map[a];
					map.addMapping({
						original: {line: t.originalLine, column: t.originalColumn},
						generated: {line: t.generatedLine+currentLines, column: t.generatedColumn},
						source: t.source,
					});
				}

				// console.log(t.generatedLine, currentLines);
			    currentLines += current.lines;
				init += current.content+'\n';
			}
		}

		init += which === 'js'
			? `//# sourceMappingURL=${distName}.${which}.map`
			: `/*# sourceMappingURL=${distName}.${which}.map */`;

		callback({
			sourceRoot,
			distName,
			which,

			code: init,
			map: map.toString()
		});
	}
}