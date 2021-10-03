module.exports = function(pack){
let { obj, gulp, SFLang, firstCompile } = pack;
let { startupCompile, path, includeSourceMap, hotSourceMapContent, hotReload } = obj;
let Obj = obj;

let { collectSourcePath, swallowError, versioning, removeOldMap, sourceMapBase64, watchPath, preprocessPath, indexAutoLoad } = require('./_utils.js');
var sfExt = require('../gulp-sf-ext.js');
var fs = require('fs');
var chalk = require('chalk');
const { SourceMapGenerator } = require('source-map');
var getRelativePathFromList = require('../sf-relative-path.js');

const SFCompiler = require('../src/main.js');
const SFCompilerHelper = require('../src/helper.js');
const SFInstantReload = ['js', 'js_global', 'html'];

var taskList = {};
function addTask(name, obj){
	var last = 0;

	let check = obj.sf.combine;
	if(check.constructor !== Array) check = [check];

	let _getSrcPath = false;
	for (var i = 0; i < check.length; i++) {
		if(!check[i].includes('*')) continue;
		let temp = check[i].split('*')[0].slice(0, -1);

		if(_getSrcPath === false || temp.length < _getSrcPath.length)
			_getSrcPath = temp;
	}

	let hasRoutes = false;
	try{
		fs.accessSync(_getSrcPath+'/routes', fs.constants.R_OK);
		hasRoutes = true;
	}catch(e){}

	const instance = new SFCompiler({
		htmlPrefix: obj.sf.prefix || '',
		minify: Obj._compiling,
		srcPath: _getSrcPath,
		routes: hasRoutes && {}
	});

	name = 'sf-'+name;

	gulp.task(name, sfTask(obj, instance));

	if(obj.autoGenerate){
		indexAutoLoad(obj, 'sf', 'SF.CSS');

		if((obj.sf.wrapped === 'mjs' || obj.sf.wrapped === 'async-mjs'))
			indexAutoLoad(obj, 'sf', 'SF.MJS');
		else indexAutoLoad(obj, 'sf', 'SF.JS');
	}

	var call = gulp.series(name);
	if(Obj._compiling === false){
		var basePath = obj.sf.opt.base+'/';
		function onChange(file, stats){
			if(last === stats.ctimeMs)
				return;

			last = stats.ctimeMs;
			if(Obj._browserSync && hotReload.sf === true){
				file = file.split('\\').join('/');
				try{
					let pendingHTML = [];
					let pendingHTMLTimer = false;
					let pendingHTMLSend = ()=> {
						Obj._browserSync.sockets.emit('sf-hot-js', pendingHTML.join(';'));
						Obj._browserSync.notify("HTML Reloaded");
						pendingHTML.length = 0;
					};

					const path = getRelativePathFromList(file, obj.sf.combine, obj.sf.root);
					const root = file.replace(path, '');
					instance.loadSource(root, path, function(data, isData, which, isComplete, cache){
						if(!isData){
							if(isComplete && pendingHTML.length !== 0)
								pendingHTMLSend();
							return;
						}

						let jsMap = true, content = '', isHTML = false;

						// When it's a router
						if(data.router){
							// Generate sourcemap for JS fence
							let map = data._routerJS && new SourceMapGenerator({
								file: `unused.text`
							});

							var tempObj = {};
							SFCompilerHelper.diveObject(tempObj, data.router.filePath.slice(7).split('/'), data);

							let treeDiver = SFCompilerHelper.createTreeDiver(map, true);
							treeDiver.route(tempObj);
							content = treeDiver.getCode();

							isHTML = true;
						}
						else {
							if(obj.sf._tempData === void 0)
								obj.sf._tempData = {keys:[], types:{}};

							content = SFCompilerHelper.jsGetScopeVar(data.content, obj.sf.file, obj.sf.wrapped, Obj._compiling, obj.sf._tempData, true, {
								fileName: path,
								base: root,
							});

							// Auto activate HTML template's hot reload
							if(content.slice(0, 8) === '__tmplt['){
								jsMap = false;
								content = "window.__tmplt=window.templates;"+content+';window.templates=window.templates;';
								isHTML = true;
							}
						}

						if(jsMap){
							// Generate sourcemap for JS fence
							var map = new SourceMapGenerator({
								file: `unused.text`
							});

							if(hotSourceMapContent && data.map[0])
								map.setSourceContent(data.map[0].source,
									"\n".repeat(data.map[0].originalLine)
									+ content.split(';{\nif(!window._sf1cmplr)', 1)[0]) + '// This may have additional script for development, added by the compiler'; // Remove additional compiler script

							// console.log(data.map);
							for (let a = 0, n=data.map; a < n.length; a++) {
								const t = n[a];
								map.addMapping({
									original: {line: t.originalLine, column: t.originalColumn},
									generated: {line: t.generatedLine+2, column: t.generatedColumn},
									source: t.source,
								});
							}

							content += sourceMapBase64(map.toString());
						}

						if(isHTML){
							pendingHTML.push(content);

							if(isComplete){
								pendingHTMLSend();
								return;
							}

							clearTimeout(pendingHTMLTimer);
							pendingHTMLTimer = setTimeout(pendingHTMLSend, 10000);
							return;
						}

						Obj._browserSync.sockets.emit('sf-hot-js', content);
						Obj._browserSync.notify("JavaScript Reloaded");

						if(isComplete && pendingHTML.length !== 0){
							clearTimeout(pendingHTMLTimer);
							pendingHTMLSend();
						}
					}, SFInstantReload, obj.sf, true, function(){
						// after all completed

						if(pendingHTML.length !== 0){
							clearTimeout(pendingHTMLTimer);
							pendingHTMLSend();
						}
					});
				}catch(e){console.error(e)}
			}

			call();
		}

		// Delete cache
		function onRemove(file){
			file = file.split('\\').join('/');

			const path = getRelativePathFromList(file, obj.sf.combine, obj.sf.root);
			delete instance.cache[path];

			if(instance.options.routes){
				SFCompilerHelper.diveDelete(instance.options.routes, path.slice(7).split('/'));
				instance.options.routes._$cache = false;
			}
		}

		taskList[obj.sf.file] = gulp.watch(obj.sf.combine, obj.sf.opt)
			.on('add', onChange).on('change', onChange).on('unlink', onRemove)
			.on('error', console.error);

		var isExist = obj.sf;
		let filePath;
		if((isExist.wrapped === 'mjs' || isExist.wrapped === 'async-mjs')){
			filePath = isExist.folder+isExist.file+'.mjs';
			isExist = fs.existsSync(filePath);
		}
		else{
			filePath = isExist.folder+isExist.file+'.js';
			isExist = fs.existsSync(filePath);
		}

		if(!isExist){
			console.log(`[First-Time] Compiling '.sf' files for '${chalk.cyan(name)}'...`);
			call();
		}
		else if(startupCompile)
			setTimeout(call, 500);
		else {
			// If reach here, that's mean the compiled version was already exist
			let oldContent = fs.readFileSync(filePath, 'utf8');
			if(obj.sf._tempData === void 0)
				obj.sf._tempData = {keys:[], types:{}};

			SFCompilerHelper.jsGetScopeVar(oldContent, obj.sf.file, obj.sf.wrapped, false, obj.sf._tempData, false, void 0, true);
		}
	}

	else call();
}

let unfinishedTask = new WeakSet();
let unfinishedTask_ = 0;
function sfTask(path, instance){
	var folderLastPath = path.sf.folder.slice(-1);
	if(folderLastPath !== '/' && folderLastPath !== '\\')
		path.sf.folder += '/';

	let isStartup = {counter:0};

	return function(done){
		if(unfinishedTask.has(path)){
			console.log("Similar task still unfinished, this new task will be dropped. Please trigger again after previous task was finished. Try restarting this compiler if this message keep showing up.");
			console.log('Total unfinished task: '+unfinishedTask_+'\nDropped for: '+path.sf.file);
			return done();
		}

		obj.onCompiled && firstCompile.sf++;

		var startTime = Date.now();
		var location = path.sf.folder.replace(path.stripURL || '#$%!.', '')+path.sf.file;

		path.onStart && path.onStart('SF', location);
		path.sf.onStart && path.sf.onStart(location);

		if(path.versioning)
			versioning(path.versioning, location+'?', startTime);

		const options = Obj._compiling ? {autoprefixer:true, minify:true} : {};
		options._opt = path.sf;

		let sfExtOption = {instance, onFinish, options, data:isStartup};

		// Only run after the last file on startup
		let _changes = {};
		let timeEnd = false, timeWait = 0;

		function onFinish(changes, afterThrottle){
			if(afterThrottle === 'throttled') isStartup = false;

			if(isStartup !== false){
				_changes.js = _changes.js || changes.js;
				_changes.css = _changes.css || changes.css;

				if(--isStartup.counter !== 0 || timeEnd === false){
					// Start the wait timer
					clearTimeout(timeWait);
					timeWait = setTimeout(()=> {
						timeEnd = true;
						if(isStartup === false) return;
						onFinish(_changes, 'throttled');
					}, 3000);

					return;
				}
			}

			if(_changes !== false){
				changes.js = changes.js || _changes.js;
				changes.css = changes.css || _changes.css;

				_changes = isStartup = false;
				delete sfExtOption.data;
			}

			unfinishedTask.delete(path);
			unfinishedTask_--;

			if(process.env.debug)
				console.log(1, changes);

			let waitCount = changes.js && changes.css ? 2 : 1;
			function extraction(data){
				if(data === false) return;
				let {sourceRoot, distName, which, code, map} = data;

				if(which === 'js'){
					if(path.sf._tempData === void 0)
						path.sf._tempData = {keys:[], types:{}};

					code = SFCompilerHelper.jsGetScopeVar(code, path.sf.file, path.sf.wrapped, Obj._compiling, path.sf._tempData, false, void 0);
				}

				if((path.sf.wrapped === 'mjs' || path.sf.wrapped === 'async-mjs') && which === 'js')
					which = 'mjs';

				fs.writeFileSync(`${sourceRoot}${distName}.${which}`, code);

				if(includeSourceMap)
					fs.writeFileSync(`${sourceRoot}${distName}.${which}.map`, map);

				if(Obj._browserSync && hotReload.scss !== false && which === 'css'){
					setTimeout(function(){
						Obj._browserSync.reload(`${sourceRoot}${distName}.${which}`);
						Obj._browserSync.notify("CSS Reloaded");
					}, 50);
				}

				if(obj.onCompiled && --waitCount === 0 && --firstCompile.sf === 0)
					obj.onCompiled('SF');

				path.onFinish && path.onFinish('SF', location, which);
				path.sf.onFinish && path.sf.onFinish(location, which);
			}

			for(const key in changes)
				instance.extractAll(key, path.sf.folder, path.sf.file, extraction, options);
		}

		unfinishedTask.add(path);
		unfinishedTask_++;
		return gulp.src(path.sf.combine).pipe(sfExt(sfExtOption));
	}
}

function removeTask(obj){
	preprocessPath('unknown', obj, 'sf');
	taskList[obj.sf.file].close();

	if(obj.autoGenerate){
		if(!obj.versioning)
			throw ".autoGenerate property was found, but .versioning was not found";

		let temp = obj.autoGenerate.split('**')[0];
		let data = fs.readFileSync(obj.versioning, 'utf8');

		data = data.split(temp+obj.sf.file+((obj.sf.wrapped === 'mjs' || obj.sf.wrapped === 'async-mjs') ? '.mjs' : '.js')+'?');
		data[1] = data[1].replace(/^.*?\n[\t\r ]+/s, '');

		data = data.join('').split(temp+obj.sf.file+'.css?');
		data[1] = data[1].replace(/^.*?\n[\t\r ]+/s, '');

		fs.writeFileSync(obj.versioning, data.join(''), 'utf8');
	}
}

return { addTask, removeTask };
}