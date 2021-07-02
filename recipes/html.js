module.exports = function(pack){
let { obj, gulp, SFLang, firstCompile } = pack;
let { startupCompile, path, includeSourceMap, hotSourceMapContent, hotReload } = obj;
let Obj = obj;

let { collectSourcePath, swallowError, versioning, removeOldMap, sourceMapBase64, preprocessPath, indexAutoLoad } = require('./_utils.js');
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
	gulp.task(name, htmlTask(obj));

	if(obj.autoGenerate)
		indexAutoLoad(obj, 'html', 'JS');

	var call = gulp.series(name);
	if(Obj._compiling === false){
		let hasObjStatic;

		if(obj.static !== void 0){
			function onChange(file, stats){
				if(!stats) return;
				if(last === stats.ctimeMs)
					return;

				last = stats.ctimeMs;
				SFLang.scan(file, stats);

				if(Obj._browserSync && hotReload.static === true){
					Obj._browserSync.sockets.emit('sf-hot-static', file);
					Obj._browserSync.notify("Static HTML have an update");
				}
			}

			hasObjStatic = gulp.watch(obj.static)
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

			if(Obj._browserSync && hotReload.html === true){
				file = file.split('\\').join('/');
				var content = fs.readFileSync(file, {encoding:'utf8', flag:'r'});
				content = content.replace(/\r/g, "");

				file = getRelativePathFromList(file, obj.html.combine, obj.html.root);

				if(obj.html.prefix !== void 0)
					file = obj.html.prefix+'/'+file;

				content = `window.templates['${file}'] = ${JSON.stringify(content)};window.templates=window.templates`;

				Obj._browserSync.sockets.emit('sf-hot-html', content);
				Obj._browserSync.notify("HTML Reloaded");
			}

			call();
		}

		let _task = taskList[obj.html.file] = gulp.watch(obj.html.combine)
			.on('add', onChange).on('change', onChange).on('unlink', onChange)
			.on('error', console.error);

		_task.hasObjStatic = hasObjStatic;

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
	preprocessPath('unknown', obj, 'html');
	let temp = taskList[obj.html.file];

	temp.close();
	if(temp.hasObjStatic) temp.hasObjStatic.close();

	if(obj.autoGenerate){
		if(!obj.versioning)
			throw ".autoGenerate property was found, but .versioning was not found";

		let temp = obj.autoGenerate.split('**')[0]+obj.html.file+'?';
		let data = fs.readFileSync(obj.versioning, 'utf8');

		data = data.split(temp);
		data[1] = data[1].replace(/^.*?\n[\t\r ]+/s, '');

		fs.writeFileSync(obj.versioning, data.join(''), 'utf8');
	}
}

return { addTask, removeTask };
}