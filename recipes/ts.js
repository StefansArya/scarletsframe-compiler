module.exports = function(pack){
let { obj, gulp, SFLang, firstCompile } = pack;
let { startupCompile, path, includeSourceMap, hotSourceMapContent, hotReload } = obj;
let Obj = obj;

let { collectSourcePath, swallowError, versioning, removeOldMap, sourceMapBase64, watchPath, preprocessPath, indexAutoLoad } = require('./_utils.js');
var sourcemaps = require('gulp-sourcemaps');
var header = require('gulp-header');
var fs = require('fs');
var chalk = require('chalk');
var chokidar = require('chokidar');
var esbuild = null;

var through = require('through2');
function pipeCallback(func){
	return through.obj(function(file, encoding, callback){
		func(file, encoding);
		callback(null, file);
	});
};

var taskList = {};
function addTask(name, obj){
	var last = 0;
	name = 'ts-'+name;

	gulp.task(name, tsTask(obj));

	if(obj.autoGenerate)
		indexAutoLoad(obj, 'ts', 'TS');

	var call = gulp.series(name);
	if(Obj._compiling === false){
		function onChange(file, stats){
			if(!stats) return call();

			if(last === stats.ctimeMs)
				return;

			let fileModify = obj.ts.onEvent?.fileModify;
			if(fileModify != null)
				fileModify(fs.readFileSync(file), file);

			last = stats.ctimeMs;
			call();
		}

		let initScan = setTimeout(()=> {
			console.log("Initial scan was longer than 1min:", obj.ts.watch);
		}, 60000);

		taskList[obj.ts.file] = chokidar.watch(obj.ts.watch, {
				ignoreInitial: true,
				ignored: (path => path.includes('node_modules') || path.includes('.git') || path.includes('turbo_modules'))
			})
			.on('add', onChange).on('change', onChange).on('unlink', onChange)
			.on('ready', () => clearTimeout(initScan))
			.on('error', console.error);

		var isExist = obj.ts;
		isExist = fs.existsSync(isExist.folder+isExist.file);

		if(!isExist){
			console.log(`[First-Time] Compiling TS for '${chalk.cyan(name)}'...`);
			call();
		}
		else if(startupCompile)
			setTimeout(call, 500);
	}
	else call();
}

function tsTask(path){
	if(!esbuild) esbuild = require('gulp-esbuild');

	var folderLastPath = path.ts.folder.slice(-1);
	if(folderLastPath !== '/' && folderLastPath !== '\\')
		path.ts.folder += '/';

	let esbuilder = Obj._compiling ? esbuild : esbuild.createGulpEsbuild({ incremental: true });

	let workDir = process.cwd();
	return function(){
		obj.onCompiled && firstCompile.ts++;

		var startTime = Date.now();
		var location = path.ts.folder.replace(path.stripURL || '#$%!.', '')+path.ts.file;
		path.onStart && path.onStart('TS', location);
		path.ts.onStart && path.ts.onStart(location);

		removeOldMap(path.ts.folder, path.ts.file.replace('.ts', ''), '.ts');
		var temp = gulp.src(path.ts.entry, path.ts.opt);

		temp = temp.pipe(esbuilder(Object.assign({
            outfile: path.ts.file,
			sourcemap: 'external',
			sourcesContent: true,
			minify: Obj._compiling || undefined,
            bundle: true,
        }, path.ts.esbuild || {}))).on('error', swallowError);

		if(path.ts.header)
			temp = temp.pipe(header(path.ts.header+"\n"));

		if(path.versioning)
			versioning(path.versioning, location+'?', startTime);

		temp = temp.pipe(gulp.dest(path.ts.folder)).on('end', function(){
			if(obj.onCompiled && --firstCompile.ts === 0)
				obj.onCompiled('TS');

			path.ts.onEvent?.fileCompiled(fs.readFileSync(location, 'utf8'));
			path.ts.onEvent?.scanFinish?.();

			path.onFinish && path.onFinish('TS', location);
			path.ts.onFinish && path.ts.onFinish(location);

			if(Obj._browserSync){
				setTimeout(function(){
					let _path = path.ts.folder+path.ts.file;
					if(hotReload.ts === false){
						Obj._browserSync.reload(_path);
					}
					else {
						var temp = fs.readFileSync(_path, {encoding:'utf8', flag:'r'});

						let address = Obj._browserSync.instance.server.address();
						address = `http://${
							address.address === '::' ? 'localhost' : address.address
						}:${address.port}`;

						let fileLocation = _path.replace(workDir.replace(/\\/g, '/'), '');
						if(fileLocation === _path){
							return console.log("Current working directory for server is not in relative directory with the bundled module directory, hot reload will inactive");
						}

						temp = `!async function(){
						${temp.replace(/import\.meta/g, `({ url: ${
							JSON.stringify(address+fileLocation)
						}})`)}}();`;

						Obj._browserSync.sockets.emit('sf-hot-js', temp);
						Obj._browserSync.notify("TS Reloaded");
					}

					Obj._browserSync.notify("TS Reloaded");
				}, 100);
			}
		});

		return temp;
	}
}

function removeTask(obj){
	preprocessPath('unknown', obj, 'ts');
	taskList[obj.ts.file].close();

	if(obj.autoGenerate){
		if(!obj.versioning)
			throw ".autoGenerate property was found, but .versioning was not found";

		let temp = obj.autoGenerate.split('**')[0]+obj.ts.file+'?';
		let data = fs.readFileSync(obj.versioning, 'utf8');

		data = data.split(temp);
		data[1] = data[1].replace(/^.*?\n[\t\r ]+/s, '');

		fs.writeFileSync(obj.versioning, data.join(''), 'utf8');
	}
}

return { addTask, removeTask };
}