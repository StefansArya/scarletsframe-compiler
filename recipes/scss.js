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
var csso = null;
var autoprefixer = null;
var sass = null;

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
			if(!stats) return call();

			if(last === stats.ctimeMs)
				return;

			last = stats.ctimeMs;
			call();
		}

		taskList[obj.scss.file] = gulp.watch(obj.scss.combine)
			.on('add', onChange).on('change', onChange).on('unlink', onChange)
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
		sass = require('../gulp-sass.js');

	var folderLastPath = path.scss.folder.slice(-1);
	if(folderLastPath !== '/' && folderLastPath !== '\\')
		path.scss.folder += '/';

	return function(){
		obj.onCompiled && firstCompile.css++;

		var startTime = Date.now();
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

		var location = path.scss.folder.replace(path.stripURL || '#$%!.', '')+path.scss.file;
		versioning(path.versioning, location+'?', startTime);

		temp = temp.pipe(gulp.dest(path.scss.folder)).on('end', function(){
			if(obj.onCompiled && --firstCompile.css === 0)
				obj.onCompiled('SCSS');

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