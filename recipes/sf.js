module.exports = function(pack){
let { obj, gulp, SFLang, firstCompile } = pack;
let { startupCompile, path, includeSourceMap, hotSourceMapContent, hotReload } = obj;
let Obj = obj;

let { collectSourcePath, swallowError, versioning, removeOldMap, sourceMapBase64, watchPath } = require('./_utils.js');
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
	taskList[obj.sf.file] = gulp.task(name, sfTask(obj, instance));

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
					instance.loadSource(file.replace(path, ''), path, function(data, isData, which, isComplete, cache){
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
							content = SFCompilerHelper.jsGetScopeVar(data.content, path);
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

		gulp.watch(obj.sf.combine, obj.sf.opt)
			.on('add', onChange).on('change', onChange).on('unlink', onRemove)
			.on('error', console.error);

		var isExist = obj.sf;
		isExist = fs.existsSync(isExist.folder+isExist.file+'.js');

		if(!isExist){
			console.log(`[First-Time] Compiling '.sf' files for '${chalk.cyan(name)}'...`);
			call();
		}
		else if(startupCompile)
			setTimeout(call, 500);
	}

	else call();
}

function sfTask(path, instance){
	var folderLastPath = path.sf.folder.slice(-1);
	if(folderLastPath !== '/' && folderLastPath !== '\\')
		path.sf.folder += '/';

	let isStartup = {counter:0};

	return function(){
		path.onCompiled && firstCompile.sf++;

		var startTime = Date.now();
		versioning(path.versioning, path.sf.folder.replace(path.stripURL || '#$%!.', '')+path.sf.file+'?', startTime);

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

				_changes = isStartup = false;
				delete sfExtOption.data;
			}

			if(process.env.debug)
				console.log(1, changes);

			function extraction(data){
				if(data === false) return;
				const {sourceRoot,distName,which,code,map} = data;

				code | 0;
				fs.writeFileSync(`${sourceRoot}${distName}.${which}`, code);

				if(includeSourceMap)
					fs.writeFileSync(`${sourceRoot}${distName}.${which}.map`, map);

				if(Obj._browserSync && hotReload.scss !== false && which === 'css'){
					setTimeout(function(){
						Obj._browserSync.reload(`${sourceRoot}${distName}.${which}`);
						Obj._browserSync.notify("CSS Reloaded");
					}, 50);
				}

				if(path.onCompiled && --firstCompile.sf === 0)
					path.onCompiled('SF');
			}

			for(const key in changes)
				instance.extractAll(key, path.sf.folder, path.sf.file, extraction, options);
		}

		return gulp.src(path.sf.combine).pipe(sfExt(sfExtOption));
	}
}

function removeTask(obj){
	// taskList[obj.scss.file]
}

return { addTask, removeTask };
}