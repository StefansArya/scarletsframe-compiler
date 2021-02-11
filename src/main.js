var fs = require('fs');
const chalk = require('chalk');
const {SourceMapGenerator, SourceMapConsumer} = require('source-map');
// var mergeMap = require('merge-source-map');
var debugging = false;

// Lazy load
var csso, postcss, autoprefixer, terser, babel;

// Contribution welcome :')
const processor = {
	html: require('./processor/html.js'),
	js_global: require('./processor/js-global.js'),
	css_global: require('./processor/css-global.js'),
	scss_global: require('./processor/scss-global.js'),
};

const category = {
	js:['html', 'js', 'js_global'],
	css:['css', 'css_global', 'scss', 'scss_global']
};

function isInCategory(cats, fence){
	for(var i=0; i < cats.length; i++){
		if(fence.indexOf(cats[i]) !== 0)
			continue;

		return true;
	}
	return false;
}

// Initial script before creating combined content
const sourceInit = {
	js:`if(!window.templates) window.templates={};
const _$_ = sf.dom || sf.$;
const __tmplt = window.templates;
const _sf_internal = window._sf_internal = window._sf_internal || {body_map:{},
	_replace(path,html){
		if(this.body_map[path]) this.body_map[path].remove();
		return this.body_map[path] = _$_(html);
	},
	append(path,html){
		_$_(document.body).append(this._replace.apply(this, arguments));
	},
	prepend(path,html){
		_$_(document.body).prepend(this._replace.apply(this, arguments));
	},
};`.split('\n').join('').split('\t').join(''),
	css:''
};

// ========================================

module.exports = class SFCompiler{
	cache = {};
	processing = {};
	static sourceInit = sourceInit;

	constructor(options){
		this.options = options || {};
		for(const key in processor)
			this.processing[key] = new Set();
	}

	firstInit = true;
	firstInitThrottle = 0;
	changesCallback(callback){
		if(this.firstInit !== false){
			callback = this.firstInit;
			this.firstInit = false;
		}

		const temp = this.sourceChanges;
		this.sourceChanges = {};
		callback(temp);
	}

	sourceCallbackWait = 0; // for throttling
	sourceFinish(callback, singleCompile){
		if(--this.sourceCallbackWait !== 0) return;

		if(this.firstInit !== false){
			clearTimeout(this.firstInitThrottle);
			this.firstInitThrottle = setTimeout(this.changesCallback.bind(this), 500);
			this.firstInit = callback || this.firstInit;
			return;
		}

		if(!singleCompile)
			this.changesCallback(callback);
	}

	// Open the source, split it
	sourceChanges = {};
	loadSource(root, path, callback, singleCompile, _opt){
		const that = this;
		const {cache, processing} = this;

		if(_opt === void 0)
			_opt = {opt:{}};

		that.sourceCallbackWait++;

		let cached = cache[path];
		let raw = fs.readFileSync(root+path, 'utf8');

		if(cached !== void 0 && cached.raw !== void 0 && cached.raw === raw){
			that.sourceFinish(callback, singleCompile, _opt);
			if(singleCompile && _opt.instant) callback(cached, true, 'raw', true);
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
			base:_opt.opt.base,
			directory:root
		};

		let hasHTML = -1;
		if(debugging)
			console.log("Path:", path);

		let processed = 0, checkNew = new Set();
		for (let i = 0; i < content.length; i++) {
			const temp = content[i];
			const a = temp.indexOf('\n');
			let which = temp.slice(0, a).split('-').join('_').replace('\r', '');

			if(which.indexOf('comment') === 0){
				if(++processed === content.length){
					that.sourceFinish(callback, singleCompile, _opt);

					if(debugging)
						console.log("-- Skip:", which, `(${processed} / ${content.length})`);
				}
				continue;
			}

			var actual = which, extra = false;
			if(which.includes('.')){
				[which, extra] = which.split('.');
				that.options.extra = extra;
			}

			let current = cached[actual];
			if(current === void 0)
				current = cached[actual] = {};

			checkNew.add(actual);
			const lastOffset = temp.split('\n').length;

			if(current.rawContent === temp){
				if(++processed === content.length){
					that.sourceFinish(callback, singleCompile, _opt);

					if(singleCompile && _opt.instant)
						callback(current, true, which, true);
				}

				if(debugging)
					console.log("-- Skip:", which, `(${processed} / ${content.length})`);

				lines += lastOffset;
				continue;
			}

			current.rawContent = temp;

			var func = processor[which];
			if(!func){
				const errorFile = JSON.stringify(root+path);
				const whichCat = JSON.stringify('## '+which);

				console.log(`[${chalk.red('Error')}] When processing file ${errorFile}, we have found ${whichCat} that was unsupported.\nCurrently the compiler only support "html, js-global, and scss-global".`);

				var data = { // Dummy
					map:[],
					content:`console.error('The compiler doesn\'t support ${whichCat} in file: ${errorFile}');`,
					lines:0
				};

				if(!which.includes('js') || !which.includes('ts'))
					data.content = '';

				delete cached[actual];
				const isComplete = ++processed === content.length;

				if(singleCompile && singleCompile.includes(which))
					callback(data, true, which, isComplete);

				if(isComplete){
					that.sourceFinish(callback, singleCompile);

					if(debugging)
						console.log("-- Skip:", which, `(${processed} / ${content.length})`);
				}

				continue;
			}

			if(isInCategory(category.css, which))
				that.sourceChanges.css = true;
			else if(isInCategory(category.js, which))
				that.sourceChanges.js = true;

			const proc = processing[which];
			proc.add(path);

			if(debugging) console.log("- Which:", which, lines);
			func(splitPath, temp.slice(a+1).trim(), function(data){
				Object.assign(current, data); // map, content, lines
				const isComplete = ++processed === content.length;

				if(debugging)
					console.log("-- Done:", which, isComplete, `(${processed} / ${content.length})`);

				if(singleCompile && singleCompile.includes(which))
					callback(data, true, which, isComplete);

				current.path = path;
				proc.delete(path);

				if(isComplete) that.sourceFinish(callback, singleCompile);
			}, lines, that.options);

			if(extra !== false)
				delete that.options.extra;

			lines += lastOffset;
		}

		// Check old category cache that have been deleted on .sf file
		for(var key in cached){
			if(!checkNew.has(key))
				delete cached[key];
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
			const cat = processing[relations[i]];
			if(cat && cat.size !== 0)
				return callback(false);
		}

		var code = sourceInit[which];
		var currentLines = 1;

		var map = new SourceMapGenerator({
			file: `${distName}.${which}`
		});

		for(const path in cache){
			const content = cache[path];
			map.setSourceContent(path, content.raw);

			for(const fenceName in content){
				if(fenceName === 'raw' || isInCategory(relations, fenceName) === false)
					continue;

				const current = content[fenceName];
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