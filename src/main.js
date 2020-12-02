var fs = require('fs');
const {SourceMapGenerator, SourceMapConsumer} = require('source-map');
// var mergeMap = require('merge-source-map');

// Lazy load
var csso, postcss, autoprefixer, terser, babel;

// Contribution welcome :')
const processor = {
	html: require('./processor/html.js'),
	js_global: require('./processor/js_global.js'),
	css_global: require('./processor/css_global.js'),
	scss_global: require('./processor/scss_global.js'),
};

const category = {
	js:['html', 'js_global'],
	css:['css_global', 'scss_global']
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

	sourceCallbackWait = 0; // for throttling
	sourceFinish(callback, singleCompile){
		if(--this.sourceCallbackWait === 0 && !singleCompile){
			const temp = this.sourceChanges;
			this.sourceChanges = {};
			callback(temp);
		}
	}

	// Open the source, split it
	sourceChanges = {};
	loadSource(root, path, callback, singleCompile){
		const that = this;
		const {cache, processing} = this;

		that.sourceCallbackWait++;

		let cached = cache[path];
		let raw = fs.readFileSync(root+path, 'utf8');

		if(cached !== void 0 && cached.raw !== void 0 && cached.raw === raw){
			that.sourceFinish(callback, singleCompile);
			return;
		}

		if(cached === void 0)
			cached = cache[path] = {};

		cached.raw = raw;

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
			const a = temp.indexOf('\n');
			let which = temp.slice(0, a).split('-').join('_');

			if(which === 'comment'){
				if(++processed === content.length)
					that.sourceFinish(callback, singleCompile);
				continue;
			}

			let current = cached[which];
			if(current === void 0)
				current = cached[which] = {};

			const lastOffset = temp.split('\n').length;

			if(current.rawContent === temp){
				if(++processed === content.length)
					that.sourceFinish(callback, singleCompile);

				lines += lastOffset;
				continue;
			}

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

				if(++processed === content.length)
					that.sourceFinish(callback, singleCompile);
			}, lines, that.options);

			lines += lastOffset;
		}
	}

	// which: js, css
	async extractAll(which, sourceRoot, distName, callback, options){
		if(options === void 0) options = {};

		const that = this;
		const {cache, processing} = this;
		const relations = category[which];

		// Return if the compiler still processing the same category
		for (var i = 0; i < relations.length; i++) {
			if(processing[relations[i]].size !== 0)
				return callback(false);
		}

		var currentLines = 1;
		var code = sourceInit[which];
		var map = new SourceMapGenerator({
			file: `${distName}.${which}`, sourceRoot
		});

		for(var path in cache){
			const content = cache[path];
			map.setSourceContent(path, content.raw);

			for(let i=0; i<relations.length; i++){
				const current = content[relations[i]];
				if(current === void 0) continue;

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
				code += current.content+'\n';
			}
		}

		const mappingURL = `${distName}.${which}`;
		const sourceMapURL = which === 'js'
			? `//# sourceMappingURL=${mappingURL}.map`
			: `/*# sourceMappingURL=${mappingURL}.map */`;

		code += sourceMapURL;

		if(which === 'css' && options.autoprefixer){
			if(autoprefixer === void 0){
				postcss = require('postcss');
				autoprefixer = require('autoprefixer');
			}

			const result = await postcss([autoprefixer]).process(code, {
				from: void 0,
				// to: mappingURL
			});

			// map = mergeMap(JSON.parse(map.toString()), JSON.parse(result.map.toString()));
			// code = result.css.split('/*# sourceMappingURL')[0] + sourceMapURL;
		}

		if(options.minify){
			if(which === 'js'){
				if(terser === void 0){
					terser = require('terser');
					babel = require('@babel/core');
				}

				const babeled = await babel.transform(code, {
					inputSourceMap: map,
					sourceMaps: true
				});

				const result = await terser.minify(babeled.code);
				code = result.code;
				map = JSON.stringify(babeled.map);

				// map = mergeMap(babeled.map, JSON.parse(result.map));
			}
			else{
				if(csso === void 0)
					csso = require('csso');

				const result = await csso.minify(code);
				code = result.css;
				// map = mergeMap(JSON.parse(map.toString()), JSON.parse(result.map));
			}

			// map = JSON.stringify(map);
			code = code.split('/*# sourceMappingURL')[0] + sourceMapURL;
		}

		callback({
			sourceRoot,
			distName,
			which,

			code,
			map: map.toString()
		});
	}
}