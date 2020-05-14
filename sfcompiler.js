module.exports = function(obj, gulp){
// Load variables
var path = obj.path;
var includeSourceMap = obj.includeSourceMap;

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
	console.log("[Preparing] .js handler");
	prepareJS();

	console.log("[Preparing] .scss handler");
	prepareSCSS();

	console.log("[Preparing] .html handler");
	prepareHTML();
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
			temp = temp.pipe(sourcemaps.write('.', {
				mapFile: function(mapFilePath) {
					return mapFilePath.replace('js.map', startTime+'.js.map');
				}
			}))

		temp = temp.pipe(gulp.dest(path.js.folder)).on('end', function(){
				if(notifier)
					notifier.notify({
						title: 'Gulp Compilation',
						message: 'JavaScript was finished!'
					});

				if(browserSync)
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
			temp = temp.pipe(sourcemaps.write('.', {
				mapFile: function(mapFilePath) {
					return mapFilePath.replace('css.map', startTime+'.css.map');
				}
			}));

		temp = temp.pipe(gulp.dest(path.scss.folder)).on('end', function(){
				if(notifier)
					notifier.notify({
						title: 'Gulp Compilation',
						message: 'SCSS was finished!'
					});

				if(browserSync){
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
				gulp.watch(obj.html.combine).on('change', function(file, stats){
					if(last === stats.ctimeMs)
						return;

					last = stats.ctimeMs;
					SFLang.scan(file, stats);
				});

				// obj.combine = excludeSource(obj.combine, obj.static);
			}

			gulp.watch(obj.html.combine).on('change', function(file, stats){
				if(last === stats.ctimeMs)
					return;

				last = stats.ctimeMs;
				SFLang.scan(file, stats);

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
			.pipe(header((path.html.header+"\n" || '') + "\nif(window.templates === void 0)"))
			.pipe(gulp.dest(path.html.folder));
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

	notifier = require('node-notifier');
	browserSync = require('browser-sync');
	SFLang.watch();
	browserSync.init(null, obj.browserSync);
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