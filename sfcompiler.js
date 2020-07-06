module.exports = function(obj, gulp){
// Load variables
var path = obj.path;
var includeSourceMap = obj.includeSourceMap;
var hotReload = obj.hotReload || {};

// Load dependency
var concat = require('gulp-concat');
var sourcemaps = require('gulp-sourcemaps');
var htmlToJs = require('gulp-html-to-js');
var header = require('gulp-header');
var fs = require('fs');
var SFLang = require('./sf-lang')(obj.translate);

// lazy init to improve startup performance
var notifier = false;
var browserSync = false;
var csso = null;
var uglify = null;
var autoprefixer = null;
var babel = null;
var sass = null;

var compiling = false;

function init(){
	prepareJS();
	console.log("[Prepared] .js handler");

	prepareSCSS();
	console.log("[Prepared] .scss handler");

	prepareHTML();
	console.log("[Prepared] .html handler");
}

// === Javascript Recipe ===
//
function prepareJS(){
	watchPath('js', function(name, obj){
		var last = 0;

		name = 'js-'+name;
		gulp.task(name, jsTask(obj));

		var call = gulp.series(name);
		if(compiling === false){
			gulp.watch(obj.js.combine).on('change', function(file, stats){
				if(last === stats.ctimeMs)
					return;

				last = stats.ctimeMs;
				if(SFLang.scan(file, stats))
					return;

				if(browserSync && hotReload.js === true){
					var changed = fs.readFileSync(file, {encoding:'utf8', flag:'r'});
					browserSync.sockets.emit('sf-hot-js', changed);
					browserSync.notify("JavaScript Reloaded");
				}

				call();
			});

			if(obj.startupCompile)
				setTimeout(call, 500);
		}

		else call();
	});
}
function jsTask(path){
	return function(){
		var startTime = Date.now();
		removeOldMap(path.js.folder, path.js.file.replace('.js', ''), '.js');
		var temp = gulp.src(path.js.combine);

		if(includeSourceMap)
			temp = temp.pipe(sourcemaps.init());

		temp = temp.pipe(concat(path.js.file)).pipe(SFLang.jsPipe());

		if(compiling){
			if(!uglify) uglify = require('gulp-uglify-es').default;
			if(!babel) babel = require('gulp-babel');

			temp = temp.pipe(babel({
				babelrc: false,
				presets: [
					["@babel/preset-env", {
						targets: {
							ie: "11"
						},
						modules: false,
						loose: true
					}]
				]
			})).on('error', swallowError).pipe(uglify({mangle: {toplevel: true}})).on('error', swallowError);
		}

		if(path.js.header)
			temp = temp.pipe(header(path.js.header+"\n"));

		if(includeSourceMap)
			temp = temp.pipe(sourcemaps.write('.', obj.timestampSourceMap ? {
				mapFile: function(mapFilePath) {
					return mapFilePath.replace('js.map', startTime+'.js.map');
				}
			} : void 0))

		temp = temp.pipe(gulp.dest(path.js.folder)).on('end', function(){
				if(notifier)
					notifier.notify({
						title: 'Gulp Compilation',
						message: 'JavaScript was finished!'
					});

				if(browserSync && hotReload.js === void 0)
					browserSync.reload(path.js.folder+path.js.file);
			});

		versioning(path.versioning, path.js.folder.replace(path.stripURL || '#$%!.', '')+path.js.file+'?', startTime);
		return temp;
	}
}

// === SCSS Recipe ===
//
function prepareSCSS(){
	watchPath('scss', function(name, obj){
		var last = 0;

		name = 'scss-'+name;
		gulp.task(name, scssTask(obj));

		var call = gulp.series(name);
		if(compiling === false){
			gulp.watch(obj.scss.combine).on('change', function(file, stats){
				if(last === stats.ctimeMs)
					return;

				last = stats.ctimeMs;
				call();
			});

			if(obj.startupCompile)
				setTimeout(call, 500);
		}

		else call();
	});
}
function scssTask(path){
	if(!sass) sass = require('gulp-sass');

	return function(){
		var startTime = Date.now();
		removeOldMap(path.scss.folder, path.scss.file.replace('.css', ''), '.css');
		var temp = gulp.src(path.scss.combine);

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
			temp = temp.pipe(sourcemaps.write('.', obj.timestampSourceMap ? {
				mapFile: function(mapFilePath) {
					return mapFilePath.replace('css.map', startTime+'.css.map');
				}
			} : void 0));

		temp = temp.pipe(gulp.dest(path.scss.folder)).on('end', function(){
			if(notifier)
				notifier.notify({
					title: 'Gulp Compilation',
					message: 'SCSS was finished!'
				});

			if(browserSync && hotReload.scss !== false){
				browserSync.reload(path.scss.folder+path.scss.file);
				browserSync.notify("SCSS Reloaded");
			}
		});

		versioning(path.versioning, path.scss.folder.replace(path.stripURL || '#$%!.', '')+path.scss.file+'?', startTime);
		return temp;
	}
}

// === HTML Recipe ===
//
function prepareHTML(){
	watchPath('html', function(name, obj){
		var last = 0;

		name = 'html-'+name;
		gulp.task(name, htmlTask(obj));

		var call = gulp.series(name);
		if(compiling === false){
			if(obj.static !== void 0){
				gulp.watch(obj.static).on('change', function(file, stats){
					if(last === stats.ctimeMs)
						return;

					last = stats.ctimeMs;
					SFLang.scan(file, stats);

					if(browserSync && hotReload.static === true){
						browserSync.sockets.emit('sf-hot-static', file);
						browserSync.notify("Static HTML have an update");
					}
				});

				// obj.combine = excludeSource(obj.combine, obj.static);
			}

			var htmlPath;
			gulp.watch(obj.html.combine).on('change', function(file, stats){
				if(last === stats.ctimeMs)
					return;

				last = stats.ctimeMs;
				SFLang.scan(file, stats);

				if(browserSync && hotReload.html === true){
					if(htmlPath === void 0){
						if(obj.html.combine.constructor === String)
							htmlPath = [obj.html.combine.split('*')[0].split('\\').join('/')];
						else{
							htmlPath = obj.html.combine.slice(0);
							for (var i = 0; i < htmlPath.length; i++) {
								htmlPath[i] = htmlPath[i].split('*')[0].split('\\').join('/');
							}
						}
					}

					var content = fs.readFileSync(file, {encoding:'utf8', flag:'r'});
					content = content.replace(/'/g, "\\'").replace(/\r/g, "").replace(/\n/g, '\\n');

					file = file.split('\\').join('/');
					for (var i = 0; i < htmlPath.length; i++) {
						if(file.indexOf(htmlPath[i]) === 0){
							file = file.replace(htmlPath[i], '');
							break;
						}
					}

					content = `window.templates['${file}'] = '${content}';window.templates=window.templates`;
					browserSync.sockets.emit('sf-hot-html', content);
					browserSync.notify("HTML Reloaded");
				}

				call();
			});

			if(obj.startupCompile)
				setTimeout(call, 500);
		}

		else call();
	});
}
function htmlTask(path){
	return function(){
		var startTime = Date.now();
		versioning(path.versioning, path.html.folder.replace(path.stripURL || '#$%!.', '')+path.html.file+'?', startTime);

		return gulp.src(path.html.combine)
			.pipe(htmlToJs({global:'window.templates', concat:path.html.file, prefix:path.html.prefix}))
			.pipe(header(((path.html.header || '')+"\n") + "\nif(window.templates === void 0)"))
			.pipe(gulp.dest(path.html.folder)).on('end', function(){
				if(notifier)
					notifier.notify({
						title: 'Gulp Compilation',
						message: 'HTML was finished!'
					});
			});
	}
}

// === Other ===
//
gulp.task('browser-sync', function(){
	if(!obj.browserSync)
		return;

	init();

	if(obj.startupCompile === 'prod')
		compiling = true;

	console.log("[Preparing] BrowserSync");

	notifier = require('node-notifier');
	browserSync = require('browser-sync');
	SFLang.watch();
	browserSync = browserSync.init(null, obj.browserSync);
});

// To be executed on Development computer
gulp.task('default', gulp.series('browser-sync'));

// === Compiling Recipe ===
// To be executed on Continuous Delivery
gulp.task('compile', function(done){
	compiling = true;
	init();
	done();
});


// === No need to edit below ===
function swallowError(error){
	console.log(error.message);
	this.emit('end');
}

function versioning(target, prefixStart, timestamp){
	var regex = prefixStart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

	var data = fs.readFileSync(target, 'utf8');
	fs.writeFileSync(target, data.replace(RegExp(regex + '[0-9a-z]+', 'g'), prefixStart+timestamp), 'utf8');
}

function removeOldMap(path, filename, format){
	fs.readdir(path, function(err, files){
		if(files === void 0)
			return;

		for (var i = 0, len = files.length; i < len; i++) {
			if(files[i].indexOf(filename) === 0 && files[i].indexOf(format+'.map') !== -1)
				fs.unlinkSync(path+files[i]);
		}
	});
}

function excludeSource(old, news){
	if(old.constructor !== Array)
		old = [old];

	if(news.constructor === Array){
		for (var i = 0; i < news.length; i++) {
			if(news[i][0] !== '!')
				old.push('!'+news[i]);
		}
	}
	else old.push(news);

	return old;
}

function splitFolderPath(fullPath){
	fullPath = fullPath.replace(/\\/g, '/').split('/');
	var file = fullPath.pop();
	var folder = fullPath.join('/');

	if(folder.length !== 0)
		folder += '/';

	return [file, folder];
}

function watchPath(which, watch){
	var default_ = path.default;
	delete path.default;

	var list = Object.keys(path);
	for (var i = 0; i < list.length; i++) {
		var temp = path[list[i]];

		// Check if default was exist
		// if(default_ && default_[which])
		// 	default_[which].combine = excludeSource(default_[which].combine, temp[which].combine);

		if(temp[which] === void 0)
			continue;

		// Separate file name and folder path
		temp[which].file = splitFolderPath(temp[which].file);
		temp[which].folder = temp[which].file.pop();
		temp[which].file = temp[which].file[0];

		watch(list[i], temp);
	}

	if(default_){
		// Separate file name and folder path
		default_[which].file = splitFolderPath(default_[which].file);
		default_[which].folder = default_[which].file.pop();
		default_[which].file = default_[which].file[0];

		path.default = default_;
		watch('default', default_);
	}
}

};