module.exports = function(pack){
let { obj, gulp, SFLang, firstCompile } = pack;
let { startupCompile, path, includeSourceMap, hotSourceMapContent, hotReload } = obj;

let { collectSourcePath, swallowError, versioning, removeOldMap, sourceMapBase64, watchPath } = require('./_utils.js');
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
	taskList[obj.scss.file] = gulp.task(name, scssTask(obj));

	var call = gulp.series(name);
	if(compiling === false){
		function onChange(file, stats){
			if(!stats) return call();

			if(last === stats.ctimeMs)
				return;

			last = stats.ctimeMs;
			call();
		}

		gulp.watch(obj.scss.combine)
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

		if(compiling){
			if(!csso) csso = require('gulp-csso');
			if(!autoprefixer) autoprefixer = require('gulp-autoprefixer');

			temp = temp.pipe(autoprefixer()).pipe(csso());
		}

		temp = temp.pipe(concat(path.scss.file));

		if(path.scss.header)
			temp = temp.pipe(header(path.scss.header+"\n"));

		if(includeSourceMap)
			temp = temp.pipe(sourcemaps.write('.'));

		temp = temp.pipe(gulp.dest(path.scss.folder)).on('end', function(){
			if(obj.onCompiled && --firstCompile.css === 0)
				obj.onCompiled('SCSS');

			if(browserSync && hotReload.scss !== false){
				setTimeout(function(){
					browserSync.reload(path.scss.folder+path.scss.file);
					browserSync.notify("SCSS Reloaded");
				}, 100);
			}
		});

		versioning(path.versioning, path.scss.folder.replace(path.stripURL || '#$%!.', '')+path.scss.file+'?', startTime);
		return temp;
	}
}

function removeTask(obj){
	// taskList[obj.scss.file]
}

return { addTask, removeTask };
}