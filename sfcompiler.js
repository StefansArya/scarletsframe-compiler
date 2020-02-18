module.exports = function(obj, gulp){
// Load variables
var path = obj.path;
var compilePath = obj.compilePath;
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

// === Javascript Recipe ===
// 
gulp.task('watch-js', function(done){
	var js = gulp.series('js');
	var last = 0;
	gulp.watch(compilePath.js).on('change', function(file, stats){
		if(last === stats.ctimeMs)
			return;

		last = stats.ctimeMs;
		if(SFLang.scan(file, stats))
			return;

		js();
	});
	done();
});
gulp.task('js', function(){
	removeOldMap(path.js.folder);
	var temp = gulp.src(compilePath.js);

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

	if(includeSourceMap)
		temp = temp.pipe(sourcemaps.write('.', {
			mapFile: function(mapFilePath) {
				return mapFilePath.replace('js.map', Date.now()+'.js.map');
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

	versioning(path.versioning, path.js.folder.replace('public/', '')+path.js.file+'?');
	return temp;
});

// === SCSS Recipe ===
// 
gulp.task('watch-css', function(done){
	gulp.watch(compilePath.css, gulp.series('scss'));
	done();
});
gulp.task('scss', function(){
	if(!sass) sass = require('gulp-sass');

	removeOldMap(path.css.folder);
	var temp = gulp.src(compilePath.css);

	if(includeSourceMap)
		temp = temp.pipe(sourcemaps.init());

	temp = temp.pipe(sass()).on('error', swallowError);

	if(compiling){
		if(!csso) csso = require('gulp-csso');
		if(!autoprefixer) autoprefixer = require('gulp-autoprefixer');

		temp = temp.pipe(autoprefixer()).pipe(csso());
	}

	temp = temp.pipe(concat(path.css.file));

	if(includeSourceMap)
		temp = temp.pipe(sourcemaps.write('.', {
			mapFile: function(mapFilePath) {
				return mapFilePath.replace('css.map', Date.now()+'.css.map');
			}
		}));

	temp = temp.pipe(gulp.dest(path.css.folder)).on('end', function(){
			if(notifier)
				notifier.notify({
					title: 'Gulp Compilation',
					message: 'SCSS was finished!'
				});

			if(browserSync){
				browserSync.reload(path.css.folder+path.css.file);
				browserSync.notify("SCSS Reloaded");
			}
		});

	versioning(path.versioning, path.css.folder.replace('public/', '')+path.css.file+'?');
	return temp;
});

// === HTML Recipe ===
// 
gulp.task('watch-html', function(done){
	var last = 0

	// Combine all html into one js file
	var html = gulp.series('html');
	gulp.watch(compilePath.html).on('change', function(file, stats){
		if(last === stats.ctimeMs)
			return;

		last = stats.ctimeMs;
		SFLang.scan(file, stats);

		html();
	});

	// Watch changes on PHP/HTML
	if(compilePath.template){
		gulp.watch(compilePath.template).on('change', function(file, stats){
			if(last === stats.ctimeMs)
				return;

			last = stats.ctimeMs;
			SFLang.scan(file, stats);
		});
	}
	done();
});
gulp.task('html', function(){
	versioning(path.versioning, path.html.folder.replace('public/', '')+path.html.file+'?');

	return gulp.src(compilePath.html)
		.pipe(htmlToJs({global:'window.templates', concat:path.html.file}))
		.pipe(gulp.dest(path.html.folder));
});

// === Other ===
// 
gulp.task('browser-sync', function(){
	if(!obj.browserSync)
		return;

	notifier = require('node-notifier');
	browserSync = require('browser-sync');
	SFLang.watch();
	browserSync.init(null, obj.browserSync);
});

// To be executed on Development computer
gulp.task('default', gulp.parallel(['browser-sync', 'watch-css', 'watch-js', 'watch-html']));

// === Compiling Recipe ===
// 
gulp.task('compiling', function(done){
	compiling = true;
	includeSourceMap = false;
	done();
});

// To be executed on Continuous Delivery
gulp.task('compile', gulp.series('compiling', gulp.parallel(['js', 'scss', 'html'])));

gulp.task('compilejs', gulp.series(['compiling', 'js']));
gulp.task('compilecss', gulp.series(['compiling', 'scss']));
gulp.task('extractlang', gulp.series(['compiling', 'scss']));


// === No need to edit below ===
function swallowError(error){
	console.log(error.message);
	this.emit('end');
}

function versioning(target, prefixStart){
	var regex = prefixStart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

	var data = fs.readFileSync(target, 'utf8');
	fs.writeFileSync(target, data.replace(RegExp(regex + '[0-9]+', 'g'), prefixStart+Date.now()), 'utf8');
}

function removeOldMap(path){
	fs.readdir(path, function(err, files){
		for (var i = 0, len = files.length; i < len; i++) {
			if(files[i].match(/.*\.min.*\.(js|css)\.map/) !== null)
				fs.unlinkSync(path+files[i]);
		}
	});
}

};