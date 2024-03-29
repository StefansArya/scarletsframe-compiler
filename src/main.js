var fs = require('fs');
const chalk = require('chalk');
const {SourceMapGenerator, SourceMapConsumer} = require('source-map');
const {createTreeDiver} = require('./helper.js');
const SFCompilerHelper = require('./helper.js');
const JSWrapper = require('./js-wrapper.js');
// var mergeMap = require('source-map-merger');
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
var _$_ = sf.dom || sf.$;
var __tmplt = window.templates;
var _sf_internal = window._sf_internal = window._sf_internal || {body_map:{},
	_replace(path,html){
		let h = _$_(html);
		if(this.body_map[path]) this.body_map[path].remove();

		this.reinitViews && this.reinitViews(h);
		return this.body_map[path] = h;
	},
	append(path,html){
		_$_(document.body).append(this._replace.apply(this, arguments));
	},
	prepend(path,html){
		_$_(document.body).prepend(this._replace.apply(this, arguments));
	},
};`.split('\n').join('').split('\t').join(''), // make it one line
	css:''
};

function JSWrapperMerge(wrapper, code){
	return wrapper[0] + JSWrapper._imports + code +	wrapper[1];
}

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

		let afterThrottle = this.afterCallbackThrottle;
		this.afterCallbackThrottle = false;

		callback(temp, afterThrottle);
	}

	sourceCallbackWait = 0; // for throttling
	afterCallbackThrottle = false;
	sourceFinish(callback, singleCompile, onComplete){
		if(--this.sourceCallbackWait !== 0){
			this.afterCallbackThrottle = 'throttled';
			return;
		}

		if(!singleCompile){
			if(this.firstInit !== false){
				clearTimeout(this.firstInitThrottle);
				this.firstInitThrottle = setTimeout(this.changesCallback.bind(this), 500);
				this.firstInit = callback || this.firstInit;
			}
			else this.changesCallback(callback);
		}

		if(onComplete) onComplete();
		else if(!singleCompile) return false;
	}

	// Open the source, split it
	sourceChanges = {};
	sourcePending = {};
	loadSource(root, path, callback, singleCompile, _opt, pending, onComplete){
		const that = this;
		const {cache, processing} = this;

		if(_opt === void 0)
			_opt = {opt:{}};

		let cached = cache[path];

		try{
			var raw = fs.readFileSync(root+path, 'utf8');
		} catch(e) {
			console.error("Failed to read file:", root+path);
			that.sourceFinish(callback, singleCompile, onComplete);
			if(singleCompile && _opt.instant) callback(cached, true, 'raw', true, cached);
			return;
		}

		that.sourceCallbackWait++;

		if(cached !== void 0 && cached.raw !== void 0 && cached.raw === raw){
			that.sourceFinish(callback, singleCompile, onComplete);
			if(singleCompile && _opt.instant) callback(cached, true, 'raw', true, cached);
			return;
		}

		if(cached === void 0){
			if(pending !== true){
				if(this.sourcePending[path] !== void 0){
					cached = cache[path] = this.sourcePending[path];
					delete this.sourcePending[path];
				}
				else cached = cache[path] = {};
			}
			else cached = this.sourcePending[path] = {};
		}

		let splitPath = {
			fileName: path,
			base: _opt.opt.base,
			directory: root,
			relativePath: (root+path).replace(process.cwd().split('\\').join('/')+'/', ''),
		};

		cached.raw = raw;
		cached._splitPath = splitPath;

		let content = raw.split('\n## ');
		if(content.length === 1 && raw.slice(0, 2) !== '##'){
			console.log("The .sf file doesn't seems to have any fences, make sure you already put '## js-global' or something else. File: "+root+path);

			that.sourceFinish(callback, singleCompile, onComplete);
			if(singleCompile && _opt.instant) callback(cached, true, 'raw', true, cached);
			return;
		}

		var lines = 0;
		if(content[0].slice(0, 3) === '## '){
			content[0] = content[0].slice(3);
			lines = 1;
		}
		else{
			lines = content[0].split('\n').length;
			content.shift();
		}

		lines += 1;

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
					that.sourceFinish(callback, singleCompile, onComplete);

					if(debugging)
						console.log("-- Skip:", which, `(${processed} / ${content.length})`);
				}

				lines += temp.split('\n').length;
				continue;
			}

			var actual = which, extra = false;
			if(which.includes('.')){
				[which, extra] = which.split(' ').join('').split('.');
				that.options.extra = extra;
			}

			let current = cached[actual];
			if(current === void 0)
				current = cached[actual] = {};

			checkNew.add(actual);
			const lastOffset = temp.split('\n').length;

			if(current.rawContent === temp){
				if(++processed === content.length){
					that.sourceFinish(callback, singleCompile, onComplete);

					if(singleCompile && _opt.instant)
						callback(current, true, which, true, cached);
				}

				if(debugging)
					console.log("-- Skip:", which, `(${processed} / ${content.length})`);

				lines += lastOffset;

				if(extra !== false)
					delete that.options.extra;
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
					callback(data, true, which, isComplete, cached);

				if(isComplete){
					that.sourceFinish(callback, singleCompile, onComplete);

					if(debugging)
						console.log("-- Skip:", which, `(${processed} / ${content.length})`);
				}

				lines += lastOffset;

				if(extra !== false)
					delete that.options.extra;
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

				// console.log(JSON.stringify(current.map));

				if(debugging)
					console.log("-- Done:", which, isComplete, `(${processed} / ${content.length})`);

				current.path = path;
				proc.delete(path);

				if(isInCategory(category.css, which))
					that.sourceChanges.css = true;
				else if(isInCategory(category.js, which))
					that.sourceChanges.js = true;

				if(singleCompile && singleCompile.includes(which))
					callback(data, true, which, isComplete, cached);

				if(isComplete){
					let success = that.sourceFinish(callback, singleCompile, onComplete);

					if(singleCompile === void 0 && onComplete === void 0 && success === false){
						callback(that.sourceChanges, true, which, isComplete, cached);
					}
				}
			}, lines, that.options, _opt);

			if(extra !== false)
				delete that.options.extra;

			lines += lastOffset;
		}

		// Check old category cache that have been deleted on .sf file
		for(var key in cached){
			if(key === 'raw' || key === '_splitPath') continue;
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
		if(!relations) throw new Error(`'${which}' is not a recognized category for extraction`);

		// Return if the compiler still processing the same category
		for (var i = 0; i < relations.length; i++) {
			const cat = processing[relations[i]];
			if(cat && cat.size !== 0)
				return callback(false);
		}

		var code = sourceInit[which];
		var currentLines = 1;

		options._opt ??= {};
		if(options._opt.header){
			code = options._opt.header + '\n' + code;
			currentLines = options._opt.header.split('\n').length+1;
		}

		const mappingURL = `${distName}.${which === 'js' ? ((options._opt.wrapped === 'mjs' || options._opt.wrapped === 'async-mjs') ? 'mjs' : 'js') : which}`;
		var map = new SourceMapGenerator({
			file: mappingURL
		});

		for(const path in cache){
			const content = cache[path];

			map.setSourceContent(content._splitPath.relativePath, content.raw);
			for(const fenceName in content){
				if(fenceName === 'raw' || isInCategory(relations, fenceName) === false)
					continue;

				const current = content[fenceName];

				// Will be processed later
				if(current.router !== void 0)
					continue;

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

		if(which === 'js'){
			if(this.options.routes){
				let treeDiver = createTreeDiver(map);
				let optRoutes = this.options.routes;

				if(optRoutes._$cache === void 0){
					treeDiver.route(optRoutes);
					optRoutes._$cache = treeDiver.getCode();
				}

				code += optRoutes._$cache;
				treeDiver.mapRoute(optRoutes);
			}

			let obj = options._opt;
			if(obj._tempData === void 0)
				obj._tempData = {keys:[], types:{}};

			code = SFCompilerHelper.jsGetScopeVar(code, obj.file, obj.wrapped, options.minify, obj._tempData, false, void 0);

			if(options._opt.wrapped === true)
				code = JSWrapperMerge(JSWrapper.true, code);
			else if(options._opt.wrapped === 'async')
				code = JSWrapperMerge(JSWrapper.async, code);
			else if(options._opt.wrapped === 'mjs')
				code = JSWrapperMerge(JSWrapper.mjs, code);
			else if(options._opt.wrapped === 'async-mjs')
				code = JSWrapperMerge(JSWrapper.async, code);
			else code = JSWrapperMerge(JSWrapper.default, code);
		}

		const sourceMapURL = which === 'js'
			? `//# sourceMappingURL=${mappingURL}.map`
			: `/*# sourceMappingURL=${mappingURL}.map */`;

		code += '\n'+sourceMapURL;

		if(which === 'css' && options.autoprefixer){
			if(autoprefixer === void 0){
				postcss = require('postcss');
				autoprefixer = require('autoprefixer');
			}

			const result = await postcss([autoprefixer]).process(code, {
				from: void 0,
				// to: mappingURL,
				map: { annotation: false, prev: map.toString(), inline: false },
			});

			code = result.css;
			map = result.map;
		}

		let rawCode;
		if(options.minify){
			if(which === 'js'){
				if(terser === void 0){
					terser = require('terser');
					babel = require('@babel/core');
				}

				rawCode = code;
				const babeled = await babel.transform(code, {
					inputSourceMap: map,
					sourceMaps: true
				});

				const result = await terser.minify(babeled.code, {
					sourceMap: {content: babeled.map}
				});

				code = result.code;
				map = result.map;
			}
			else{
				if(csso === void 0)
					csso = require('csso');

				const result = await csso.minify(code, {
					filename: mappingURL,
					restructure: true,
					sourceMap: true,
				});

				let consumer = await new SourceMapConsumer(map.toString());
				result.map.applySourceMap(consumer, mappingURL);
				consumer.destroy();

				code = result.css;
				map = result.map;
			}

			// map = JSON.stringify(map);
			code = code.split('/*# sourceMappingURL')[0] + "\n" + sourceMapURL;
		}

		callback({
			sourceRoot,
			distName,
			which,

			rawCode,
			code,
			map: map.toString()
		});
	}
}