module.exports = function(pack){
let { obj, gulp, SFLang, firstCompile } = pack;
let { startupCompile, path, includeSourceMap, hotSourceMapContent, hotReload } = obj;

let { collectSourcePath, swallowError, versioning, removeOldMap, sourceMapBase64 } = require('./_utils.js');
var htmlmin = require('../gulp-htmlmin.js');
var sourcemaps = require('gulp-sourcemaps');
var concat = require('gulp-concat');
var htmlToJs = require('gulp-html-to-js');
var header = require('gulp-header');
var fs = require('fs');
var chalk = require('chalk');
var getRelativePathFromList = require('../sf-relative-path.js');

var taskList = {};
function addTask(name, obj){
	var last = 0;

	name = 'html-'+name;
	taskList[obj.html.file] = gulp.task(name, htmlTask(obj));

	var call = gulp.series(name);
	if(compiling === false){
		if(obj.static !== void 0){
			function onChange(file, stats){
				if(!stats) return;
				if(last === stats.ctimeMs)
					return;

				last = stats.ctimeMs;
				SFLang.scan(file, stats);

				if(browserSync && hotReload.static === true){
					browserSync.sockets.emit('sf-hot-static', file);
					browserSync.notify("Static HTML have an update");
				}
			}

			gulp.watch(obj.static)
			.on('add', onChange).on('change', onChange).on('unlink', onChange)
			.on('error', console.error);

			// obj.combine = excludeSource(obj.combine, obj.static);
		}

		var basePath = obj.html.opt.base+'/';
		function onChange(file, stats){
			if(!stats) return call();
			if(last === stats.ctimeMs)
				return;

			last = stats.ctimeMs;
			SFLang.scan(file, stats);

			if(browserSync && hotReload.html === true){
				file = file.split('\\').join('/');
				var content = fs.readFileSync(file, {encoding:'utf8', flag:'r'});
				content = content.replace(/\r/g, "");

				file = getRelativePathFromList(file, obj.html.combine, obj.html.root);

				if(obj.html.prefix !== void 0)
					file = obj.html.prefix+'/'+file;

				content = `window.templates['${file}'] = ${JSON.stringify(content)};window.templates=window.templates`;

				browserSync.sockets.emit('sf-hot-html', content);
				browserSync.notify("HTML Reloaded");
			}

			call();
		}

		gulp.watch(obj.html.combine)
			.on('add', onChange).on('change', onChange).on('unlink', onChange)
			.on('error', console.error);

		var isExist = obj.html;
		isExist = fs.existsSync(isExist.folder+isExist.file);

		if(!isExist){
			console.log(`[First-Time] Compiling HTML for '${chalk.cyan(name)}'...`);
			call();
		}
		else if(startupCompile)
			setTimeout(call, 500);
	}

	else call();
}

function htmlTask(path){
	var folderLastPath = path.html.folder.slice(-1);
	if(folderLastPath !== '/' && folderLastPath !== '\\')
		path.html.folder += '/';

	return function(){
		obj.onCompiled && firstCompile.html++;

		var startTime = Date.now();
		versioning(path.versioning, path.html.folder.replace(path.stripURL || '#$%!.', '')+path.html.file+'?', startTime);

		var src = gulp.src(path.html.combine);

		if(includeSourceMap)
			src = src.pipe(sourcemaps.init());

		if(path.html.whitespace !== true)
			src = src.pipe(htmlmin({ collapseWhitespace: true }));

		src = src.pipe(htmlToJs({global:'window.templates', concat:path.html.file, prefix:path.html.prefix}))
			.pipe(header(((path.html.header || '')+"\n") + "\nif(window.templates === void 0)"))

		if(includeSourceMap)
			src = src.pipe(sourcemaps.write('.'));

		return src.pipe(gulp.dest(path.html.folder)).on('end', function(){
				if(obj.onCompiled && --firstCompile.html === 0)
					obj.onCompiled('HTML');
			});
	}
}

function removeTask(obj){
	// taskList[obj.scss.file]
}

return { addTask, removeTask };
}