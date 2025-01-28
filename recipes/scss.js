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
var csso = null;
var autoprefixer = null;
var sass = null;

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
	name = 'scss-'+name;

	gulp.task(name, scssTask(obj));

	if(obj.autoGenerate)
		indexAutoLoad(obj, 'scss', 'CSS');

	var call = gulp.series(name);
	if(Obj._compiling === false){
		function onChange(file, stats){
			if(stats == null) stats = fs.statSync(file);
			if(!stats) return call();

			if(last === stats.ctimeMs)
				return;

			let fileModify = obj.scss.onEvent?.fileModify;
			if(fileModify != null)
				fileModify(fs.readFileSync(file), file);

			last = stats.ctimeMs;
			call();
		}

		let initScan = setTimeout(()=> {
			console.log("Initial scan was longer than 1min:", obj.scss.combine);
		}, 60000);

		taskList[obj.scss.file] = chokidar.watch(obj.scss.combine, {
				ignoreInitial: true,
				ignored: (path => path.includes('node_modules') || path.includes('.git') || path.includes('turbo_modules'))
			})
			.on('add', onChange).on('change', onChange).on('unlink', onChange)
			.on('ready', () => clearTimeout(initScan))
			.on('error', console.error);

		var isExist = obj.scss;
		isExist = fs.existsSync(isExist.folder+isExist.file);

		if(!isExist){
			console.log(`[First-Time] Compiling SCSS for '${chalk.cyan(name)}'...`);
			call();
		}
		else if(startupCompile)
			setTimeout(call, 500);
	}
	else call();
}

function scssTask(path){
	if(!sass)
		sass = require('gulp-sass')(require('sass'));

	var folderLastPath = path.scss.folder.slice(-1);
	if(folderLastPath !== '/' && folderLastPath !== '\\')
		path.scss.folder += '/';

	return function(){
		obj.onCompiled && firstCompile.css++;

		var startTime = Date.now();
		var location = path.scss.folder.replace(path.stripURL || '#$%!.', '')+path.scss.file;
		path.onStart && path.onStart('SCSS', location);
		path.scss.onStart && path.scss.onStart(location);

		removeOldMap(path.scss.folder, path.scss.file.replace('.css', ''), '.css');
		var temp = gulp.src(path.scss.combine, path.scss.opt);

		if(includeSourceMap)
			temp = temp.pipe(sourcemaps.init());

		temp = temp.pipe(sass()).on('error', swallowError);

		if(Obj._compiling){
			if(!csso) csso = require('gulp-csso');
			if(!autoprefixer) autoprefixer = require('gulp-autoprefixer');

			temp = temp.pipe(autoprefixer()).pipe(csso());
		}

		temp = temp.pipe(concat(path.scss.file));

		if(path.scss.header)
			temp = temp.pipe(header(path.scss.header+"\n"));

		if(includeSourceMap)
			temp = temp.pipe(sourcemaps.write('.'));

		if(path.versioning)
			versioning(path.versioning, location+'?', startTime);

		temp = temp.pipe(gulp.dest(path.scss.folder)).on('end', function(){
			if(obj.onCompiled && --firstCompile.css === 0)
				obj.onCompiled('SCSS');

			path.scss.onEvent?.fileCompiled(fs.readFileSync(location, 'utf8'));
			path.scss.onEvent?.scanFinish?.();

			path.onFinish && path.onFinish('SCSS', location);
			path.scss.onFinish && path.scss.onFinish(location);

			if(Obj._browserSync && hotReload.scss !== false){
				setTimeout(function(){
					Obj._browserSync.reload(path.scss.folder+path.scss.file);
					Obj._browserSync.notify("SCSS Reloaded");
				}, 100);
			}
		});

		return temp;
	}
}

function removeTask(obj){
	preprocessPath('unknown', obj, 'scss');
	taskList[obj.scss.file].close();

	if(obj.autoGenerate){
		if(!obj.versioning)
			throw ".autoGenerate property was found, but .versioning was not found";

		let temp = obj.autoGenerate.split('**')[0]+obj.scss.file+'?';
		let data = fs.readFileSync(obj.versioning, 'utf8');

		data = data.split(temp);
		data[1] = data[1].replace(/^.*?\n[\t\r ]+/s, '');

		fs.writeFileSync(obj.versioning, data.join(''), 'utf8');
	}
}

return { addTask, removeTask };
}