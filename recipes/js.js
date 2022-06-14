module.exports = function(pack){
let { obj, gulp, SFLang, firstCompile } = pack;
let { startupCompile, path, includeSourceMap, hotSourceMapContent, hotReload } = obj;
let Obj = obj;

let { collectSourcePath, swallowError, versioning, removeOldMap, sourceMapBase64, watchPath, preprocessPath, indexAutoLoad } = require('./_utils.js');
var sourcemaps = require('gulp-sourcemaps');
var concat = require('gulp-concat');
var header = require('gulp-header');
var fs = require('fs');
var chalk = require('chalk');
var chokidar = require('chokidar');
const { SourceMapGenerator } = require('source-map');
const JSWrapper = require('../src/js-wrapper.js');
var getRelativePathFromList = require('../sf-relative-path.js');
const SFCompilerHelper = require('../src/helper.js');
var terser = null;
var babel = null;

var through = require('through2');
function pipeCallback(func){
	return through.obj(function(file, encoding, callback){
		func(file, encoding);
		callback(null, file);
	});
};

function JSWrapperMerge(wrapper, es6Module){
	return through.obj(function(file, encoding, callback){
		let temp = [
			Buffer.from(wrapper[0]),
			Buffer.from(JSWrapper._imports),
			file.contents,
			Buffer.from(wrapper[1])
		];

		if(es6Module) temp.unshift(JSWrapper._exports);
		file.contents = Buffer.concat(temp);

		callback(null, file);
	});
}

function jsGetScopeVar(fullPath, wrapped, minify, data, isHot, path){
	return through.obj(function(file, encoding, callback){
		if(file.extname !== '.map'){
			let text = file.contents.toString('utf8');
			text = SFCompilerHelper.jsGetScopeVar(text, fullPath, wrapped, minify, data, isHot, path);
			file.contents = Buffer.from(text);
		}

		callback(null, file);
	});
}

function footer(text){
	return through.obj(function(file, encoding, callback){
		if(file.extname !== '.map'){
			file.contents = Buffer.concat([
				file.contents,
				Buffer.from(text)
			]);
		}

		callback(null, file);
	});
}

function changeExt(text){
	return through.obj(function(file, encoding, callback){
		if(file.extname !== '.map'){
			file.extname = text;

			if(file.sourceMap !== void 0 && file.sourceMap.file.slice(-3) === '.js')
				file.sourceMap.file = file.sourceMap.file.slice(0, -3) + text;
		}

		callback(null, file);
	});
}

var taskList = {};
function addTask(name, obj){
	var last = 0;
	name = 'js-'+name;

	var folderLastPath = obj.js.folder.slice(-1);
	if(folderLastPath !== '/' && folderLastPath !== '\\')
		obj.js.folder += '/';

	if(obj.js.combine)
		gulp.task(name, jsTask(obj));
	else if(obj.js.module)
		gulp.task(name, jsTaskModule(obj));
	else
		console.error(".js settings only support 'combine' or 'module'");

	if(obj.autoGenerate){
		if(obj.js.wrapped === 'mjs' || obj.js.wrapped === 'async-mjs')
			indexAutoLoad(obj, 'js', 'MJS');
		else indexAutoLoad(obj, 'js', 'JS');
	}

	var call = gulp.series(name);
	if(Obj._compiling === false){
		var rootPath = obj.js.combine || obj.js.module.from;
		if(obj.js.module !== void 0){
			rootPath = rootPath.split('\\').join('/').split('/');
			rootPath.pop();
			rootPath = rootPath.join('/') + '/**/*.js';
		}

		function onChange(file, stats){
			if(!stats) return call();
			if(last === stats.ctimeMs)
				return;

			last = stats.ctimeMs;
			if(SFLang.scan(file, stats))
				return;

			let fileContent;
			let fileModify =  obj.js.onEvent?.fileModify;

			if(fileModify){
				fileContent ??= fs.readFileSync(file, {encoding:'utf8', flag:'r'});
				fileModify(fileContent, file);
			}

			if(Obj._browserSync && hotReload.js === true){
				let relativePath = getRelativePathFromList(file, rootPath, obj.js.root);
				var changed = fileContent ??= fs.readFileSync(file, {encoding:'utf8', flag:'r'});

				// Generate sourcemap
				var map = new SourceMapGenerator({
					file: `unknown.file`
				});

				if(hotSourceMapContent)
					map.setSourceContent(relativePath, changed);

				let lines = changed.split('\n').length;
				for (let a = 1; a <= lines; a++) {
					map.addMapping({
						original: {line: a, column: 0},
						generated: {line: a+2, column: 0},
						source: relativePath,
					});
				}

				if(obj.js._tempData === void 0)
					obj.js._tempData = {keys:[], types:{}};

				changed = SFCompilerHelper.jsGetScopeVar(changed, obj.js.file, obj.js.wrapped, Obj._compiling, obj.js._tempData, true, {
					fileName: relativePath,
					base: file.replace(relativePath, ''),
				});
				changed = changed.replace(/import\.meta/g, 'p_sf1cmplr.__import_meta');
				changed += sourceMapBase64(map.toString());

				Obj._browserSync.sockets.emit('sf-hot-js', changed);
				Obj._browserSync.notify("JS Reloaded");
			}

			call();
		}

		let initScan = setTimeout(()=> {
			console.log("Initial scan was longer than 1min:", rootPath);
		}, 60000);

		taskList[obj.js.file] = chokidar.watch(rootPath, {
				ignoreInitial: true,
				ignored: (path => path.includes('node_modules') || path.includes('.git') || path.includes('turbo_modules'))
			})
			.on('add', onChange)
			.on('change', onChange)
			.on('unlink', onChange)
			.on('ready', () => clearTimeout(initScan))
			.on('error', console.error);

		var isExist = obj.js;
		let filePath = isExist.folder+isExist.file;
		isExist = fs.existsSync(filePath);

		if(!isExist){
			console.log(`[First-Time] Compiling JS for '${chalk.cyan(name)}'...`);
			call();
		}
		else if(startupCompile)
			setTimeout(call, 500);
		else {
			// If reach here, that's mean the compiled version was already exist
			let oldContent = fs.readFileSync(filePath, 'utf8');
			if(obj.js._tempData === void 0)
				obj.js._tempData = {keys:[], types:{}};

			SFCompilerHelper.jsGetScopeVar(oldContent, obj.js.file, obj.js.wrapped, false, obj.js._tempData, false, void 0, true);
		}
	}

	else call();
}

function jsTask(path){
	return function(){
		obj.onCompiled && firstCompile.js++;

		var startTime = Date.now();
		var location = path.js.folder.replace(path.stripURL || '#$%!.', '')+path.js.file;
		path.onStart && path.onStart('JS', location);
		path.js.onStart && path.js.onStart(location);

		let isModule = false;
		if(path.js.wrapped === 'mjs' || path.js.wrapped === 'async-mjs'){
			removeOldMap(path.js.folder, path.js.file.replace('.mjs', ''), '.mjs');
			isModule = true;
		}
		else removeOldMap(path.js.folder, path.js.file.replace('.js', ''), '.js');

		var temp = gulp.src(path.js.combine, path.js.opt);

		if(includeSourceMap)
			temp = temp.pipe(sourcemaps.init());

		temp = temp.pipe(concat(path.js.file)).pipe(SFLang.jsPipe());

		if(!Obj._compiling){
			if(path.js._tempData === void 0)
				path.js._tempData = {keys:[], types:{}};

			temp = temp.pipe(jsGetScopeVar(path.js.file, path.js.wrapped, false, path.js._tempData, false, void 0));
		}

		if(path.js.wrapped !== void 0){
			if(path.js.wrapped === true)
				temp = temp.pipe(JSWrapperMerge(JSWrapper.true));
			else if(path.js.wrapped === 'async')
				temp = temp.pipe(JSWrapperMerge(JSWrapper.async));
			else if(path.js.wrapped === 'mjs')
				temp = temp.pipe(JSWrapperMerge(JSWrapper.mjs));
			else if(path.js.wrapped === 'async-mjs')
				temp = temp.pipe(JSWrapperMerge(JSWrapper.async));
		}
		else temp = temp.pipe(JSWrapperMerge(JSWrapper.default));

		if(Obj._compiling){
			if(!terser) terser = require('gulp-terser');
			if(!babel) babel = require('gulp-babel');

			temp = temp.pipe(babel()).on('error', swallowError)
				.pipe(terser()).on('error', swallowError);
		}

		if(isModule)
			temp = temp.pipe(changeExt('.mjs'));

		if(path.js.header)
			temp = temp.pipe(header(path.js.header+"\n"));

		if(includeSourceMap)
			temp = temp.pipe(sourcemaps.write('.'));

		if(/\.mjs$/m.test(path.js.file))
			temp = temp.pipe(footer('\n//# sourceMappingURL='+path.js.file+'.map'));

		if(path.versioning)
			versioning(path.versioning, location+'?', startTime);

		temp = temp.pipe(gulp.dest(path.js.folder)).on('end', function(){
			if(obj.onCompiled && --firstCompile.js === 0)
				obj.onCompiled('JS');

			path.js.onEvent?.fileCompiled(fs.readFileSync(location, 'utf8'));
			path.js.onEvent?.scanFinish?.();

			path.onFinish && path.onFinish('JS', location);
			path.js.onFinish && path.js.onFinish(location);

			if(Obj._browserSync && hotReload.js === void 0)
				Obj._browserSync.reload(path.js.folder+path.js.file);
		});

		return temp;
	}
}

var jsModule = {};
function jsTaskModule(path){
	return function(){
		obj.onCompiled && firstCompile.js++;

		var startTime = Date.now();
		var location = path.js.folder.replace(path.stripURL || '#$%!.', '')+path.js.file;
		path.onStart || path.onStart('JS', location);
		path.js.onStart && path.js.onStart(location);

		let isModule = false;
		if(path.js.wrapped === 'mjs' || path.js.wrapped === 'async-mjs'){
			removeOldMap(path.js.folder, path.js.file.replace('.mjs', ''), '.mjs');
			isModule = true;
		}
		else removeOldMap(path.js.folder, path.js.file.replace('.js', ''), '.js');

		var temp, jm;
		temp = gulp.src(path.js.combine || path.js.module.from, path.js.opt);

		if(path.js.module){
			jm = jsModule;

			if(!jm.rollup)
				jm.rollup = require('gulp-better-rollup');
			if(!jm.commonjs)
				jm.commonjs = require('@rollup/plugin-commonjs');
			if(!jm.resolve)
				jm.resolve = require('@rollup/plugin-node-resolve');

			var plugins = [jm.commonjs(), jm.resolve.nodeResolve()];
			if(Obj._compiling){
				if(!jm.babel)
					jm.babel = require('@rollup/plugin-babel');
				plugins.shift(jm.babel());
			}

			temp = temp.pipe(jm.rollup({
		    	plugins: plugins
		    }, {
		    	format: path.js.module.format || 'cjs'
		    }));
		}

		if(includeSourceMap)
			temp = temp.pipe(sourcemaps.init());

		temp = temp.pipe(concat(path.js.file)).pipe(SFLang.jsPipe());

		if(path.js.wrapped !== void 0){
			if(path.js.wrapped === true)
				temp = temp.pipe(JSWrapperMerge(JSWrapper.true));
			else if(path.js.wrapped === 'async')
				temp = temp.pipe(JSWrapperMerge(JSWrapper.async));
			else if(path.js.wrapped === 'mjs')
				temp = temp.pipe(JSWrapperMerge(JSWrapper.mjs));
			else if(path.js.wrapped === 'async-mjs')
				temp = temp.pipe(JSWrapperMerge(JSWrapper.async));
		}

		if(!jm && Obj._compiling){
			if(!terser) terser = require('gulp-terser');

			temp = temp.pipe(terser()).on('error', swallowError);
		}

		if(path.js.header)
			temp = temp.pipe(header(path.js.header+"\n"));

		if(isModule)
			temp = temp.pipe(changeExt('.mjs'));

		if(includeSourceMap)
			temp = temp.pipe(sourcemaps.mapSources(function(sourcePath, file) {
		        return path.js.folder + sourcePath;
		    })).pipe(sourcemaps.write('.'));

		if(/\.mjs$/m.test(path.js.file))
			temp = temp.pipe(footer('\n//# sourceMappingURL='+path.js.file+'.map'));

		if(path.versioning)
			versioning(path.versioning, location+'?', startTime);

		temp = temp.pipe(gulp.dest(path.js.folder)).on('end', function(){
			if(obj.onCompiled && --firstCompile.js === 0)
				obj.onCompiled('JS');

			path.onFinish || path.onFinish('JS', location);
			path.js.onFinish && path.js.onFinish(location);

			if(Obj._browserSync && hotReload.js === void 0)
				Obj._browserSync.reload(path.js.folder+path.js.file);
		});

		return temp;
	}
}

function removeTask(obj){
	preprocessPath('unknown', obj, 'js');
	taskList[obj.js.file].close();

	if(obj.autoGenerate){
		if(!obj.versioning)
			throw ".autoGenerate property was found, but .versioning was not found";

		let temp = obj.autoGenerate.split('**')[0]+obj.js.file+'?';
		let data = fs.readFileSync(obj.versioning, 'utf8');

		data = data.split(temp);
		data[1] = data[1].replace(/^.*?\n[\t\r ]+/s, '');

		fs.writeFileSync(obj.versioning, data.join(''), 'utf8');
	}
}

return { addTask, removeTask };
}