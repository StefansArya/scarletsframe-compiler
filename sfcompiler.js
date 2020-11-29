module.exports = function(obj, gulp){
// Load variables
var path = obj.path;
var includeSourceMap = obj.includeSourceMap;
var hotReload = obj.hotReload || {};
var startupCompile = obj.startupCompile;

// Load dependency
var concat = require('gulp-concat');
var sourcemaps = require('gulp-sourcemaps');
var htmlToJs = require('gulp-html-to-js');
var htmlmin = require('./gulp-htmlmin.js');
var header = require('gulp-header');
// var footer = require('gulp-footer');
var fs = require('fs');
var SFLang = require('./sf-lang')(obj.translate);

// lazy init to improve startup performance
var browserSync = false;
var csso = null;
var terser = null;
var autoprefixer = null;
var babel = null;
var sass = null;

var compiling = false;
var firstCompile = {
	js:0,
	css:0,
	html:0,
	sf:0,
};

function progressCounter(newline){
	if(firstCompile.js === 0 && firstCompile.css === 0 && firstCompile.html === 0 && firstCompile.sf === 0)
		return true;

	process.stdout.write("Compiling: ");
	var notFirst = false;

	if(firstCompile.js !== 0){
		process.stdout.write(firstCompile.js+" JS");
		notFirst = true;
	}

	if(firstCompile.css !== 0){
		if(notFirst) process.stdout.write(', ');
		process.stdout.write(firstCompile.css+" CSS");
		notFirst = true;
	}

	if(firstCompile.html !== 0){
		if(notFirst) process.stdout.write(', ');
		process.stdout.write(firstCompile.html+" HTML");
	}

	if(firstCompile.sf !== 0){
		if(notFirst) process.stdout.write(', ');
		process.stdout.write(firstCompile.sf+" SF");
	}

	process.stdout.write(newline ? "\n" : "\r");
	return false;
}

function init(only){
	if(!only || only === 'js'){
		prepareJS();
		console.log("[Prepared] .js handler");
	}

	if(!only || only === 'css'){
		prepareSCSS();
		console.log("[Prepared] .scss handler");
	}

	if(!only || only === 'html'){
		prepareHTML();
		console.log("[Prepared] .html handler");
	}

	if(!only || only === 'sf'){
		prepareSF();
		console.log("[Prepared] .sf handler");
	}

	progressCounter(true);
}

// === Javascript Recipe ===
//
function prepareJS(){
	watchPath('js', function(name, obj){
		var last = 0;

		name = 'js-'+name;

		var folderLastPath = obj.js.folder.slice(-1);
		if(folderLastPath !== '/' && folderLastPath !== '\\')
			obj.js.folder += '/';

		if(obj.js.combine)
			gulp.task(name, jsTask(obj));
		else if(obj.js.module)
			gulp.task(name, jsTaskModule(obj));
		else
			console.error(".js settings only support 'combine' or 'module'");

		var call = gulp.series(name);
		if(compiling === false){
			var rootPath = obj.js.combine || obj.js.module.from;
			if(obj.js.module !== void 0){
				rootPath = rootPath.split('\\').join('/').split('/');
				rootPath.pop();
				rootPath = rootPath.join('/') + '/**/*.js';
			}

			gulp.watch(rootPath).on('change', function(file, stats){
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

			var isExist = obj.js;
			isExist = fs.existsSync(isExist.folder+isExist.file);

			if(!isExist){
				console.log("[First-Time] Compiling JavaScript for '"+name+"'..");
				call();
			}
			else if(startupCompile)
				setTimeout(call, 500);
		}

		else call();
	});
}
function jsTask(path){
	return function(){
		obj.onCompiled && firstCompile.js++;

		var startTime = Date.now();
		removeOldMap(path.js.folder, path.js.file.replace('.js', ''), '.js');
		var temp = gulp.src(path.js.combine);

		if(includeSourceMap)
			temp = temp.pipe(sourcemaps.init());

		temp = temp.pipe(concat(path.js.file)).pipe(SFLang.jsPipe());

		if(compiling){
			if(!terser) terser = require('gulp-terser');
			if(!babel) babel = require('gulp-babel');

			temp = temp.pipe(babel()).on('error', swallowError).pipe(terser()).on('error', swallowError);
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
				if(obj.onCompiled && --firstCompile.js === 0)
					obj.onCompiled('JavaScript');

				if(browserSync && hotReload.js === void 0)
					browserSync.reload(path.js.folder+path.js.file);
			});

		versioning(path.versioning, path.js.folder.replace(path.stripURL || '#$%!.', '')+path.js.file+'?', startTime);
		return temp;
	}
}

var jsModule = {};
function jsTaskModule(path){
	return function(){
		obj.onCompiled && firstCompile.js++;

		var startTime = Date.now();
		removeOldMap(path.js.folder, path.js.file.replace('.js', ''), '.js');

		var temp, jm;
		temp = gulp.src(path.js.combine || path.js.module.from);

		if(path.js.module){
			jm = jsModule;

			if(!jm.rollup)
				jm.rollup = require('gulp-better-rollup');
			if(!jm.commonjs)
				jm.commonjs = require('@rollup/plugin-commonjs');
			if(!jm.resolve)
				jm.resolve = require('@rollup/plugin-node-resolve');

			var plugins = [jm.commonjs(), jm.resolve.nodeResolve()];
			if(compiling){
				if(!jm.babel)
					jm.babel = require('@rollup/plugin-babel');
				plugins.shift(jm.babel());
			}

			temp = temp.pipe(jm.rollup({
		    	plugins: plugins
		    }, {
		    	format: path.js.module.format || 'cjs'
		    }));
		}

		if(includeSourceMap)
			temp = temp.pipe(sourcemaps.init());

		temp = temp.pipe(concat(path.js.file)).pipe(SFLang.jsPipe());
		if(!jm && compiling){
			if(!terser) terser = require('gulp-terser');

			temp = temp.pipe(terser()).on('error', swallowError);
		}

		if(path.js.header)
			temp = temp.pipe(header(path.js.header+"\n"));

		if(includeSourceMap)
			temp = temp.pipe(sourcemaps.mapSources(function(sourcePath, file) {
		        return path.js.folder + sourcePath;
		    })).pipe(sourcemaps.write('.', obj.timestampSourceMap ? {
				mapFile: function(mapFilePath) {
					return mapFilePath.replace('js.map', startTime+'.js.map');
				}
			} : void 0))

		temp = temp.pipe(gulp.dest(path.js.folder)).on('end', function(){
				if(obj.onCompiled && --firstCompile.js === 0)
					obj.onCompiled('JavaScript');

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

			var isExist = obj.scss;
			isExist = fs.existsSync(isExist.folder+isExist.file);

			if(!isExist){
				console.log("[First-Time] Compiling SCSS for '"+name+"'..");
				call();
			}
			else if(startupCompile)
				setTimeout(call, 500);
		}
		else call();
	});
}
function scssTask(path){
	if(!sass){
		sass = require('gulp-sass');
		sass.compiler = require('node-sass');
	}

	var folderLastPath = path.scss.folder.slice(-1);
	if(folderLastPath !== '/' && folderLastPath !== '\\')
		path.scss.folder += '/';

	return function(){
		obj.onCompiled && firstCompile.css++;

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
			if(obj.onCompiled && --firstCompile.css === 0)
				obj.onCompiled('SCSS');

			if(browserSync && hotReload.scss !== false){
				browserSync.reload(path.scss.folder+path.scss.file);
				browserSync.notify("SCSS Reloaded");
			}
		});

		versioning(path.versioning, path.scss.folder.replace(path.stripURL || '#$%!.', '')+path.scss.file+'?', startTime);
		return temp;
	}
}

function extractHTMLPathPrefix(paths){
	if(paths.constructor === String)
		return [paths.split('*')[0].split('\\').join('/')];

	var htmlPath = paths.slice(0);
	for (var i = 0; i < htmlPath.length; i++)
		htmlPath[i] = htmlPath[i].split('*')[0].split('\\').join('/');

	return htmlPath;
}

function getPureHTMLPathPrefix(paths, currentPath){
	var file = currentPath.split('\\').join('/');
	for (var i = 0; i < paths.length; i++) {
		if(file.indexOf(paths[i]) === 0){
			file = file.replace(paths[i], '');
			break;
		}
	}

	return file;
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

			var htmlPath = extractHTMLPathPrefix(obj.html.combine);
			gulp.watch(obj.html.combine).on('change', function(file, stats){
				if(last === stats.ctimeMs)
					return;

				last = stats.ctimeMs;
				SFLang.scan(file, stats);

				if(browserSync && hotReload.html === true){
					file = file.split('\\').join('/');
					var content = fs.readFileSync(file, {encoding:'utf8', flag:'r'});
					content = content.replace(/\r/g, "").replace(/\n/g, '\\n');

					file = getPureHTMLPathPrefix(htmlPath, file);

					if(obj.html.prefix !== void 0)
						file = obj.html.prefix+'/'+file;

					content = `window.templates['${file}'] = ${JSON.stringify(content)};window.templates=window.templates`;
					browserSync.sockets.emit('sf-hot-html', content);
					browserSync.notify("HTML Reloaded");
				}

				call();
			});

			var isExist = obj.html;
			isExist = fs.existsSync(isExist.folder+isExist.file);

			if(!isExist){
				console.log("[First-Time] Compiling HTML for '"+name+"'..");
				call();
			}
			else if(startupCompile)
				setTimeout(call, 500);
		}

		else call();
	});
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
			src = src.pipe(sourcemaps.write('.', obj.timestampSourceMap ? {
				mapFile: function(mapFilePath) {
					return mapFilePath.replace('js.map', startTime+'.js.map');
				}
			} : void 0));

		return src.pipe(gulp.dest(path.html.folder)).on('end', function(){
				if(obj.onCompiled && --firstCompile.html === 0)
					obj.onCompiled('HTML');
			});
	}
}

// === SF Recipe ===
//
const SFCompiler = require('./src/main.js');
const SFInstantReload = ['js_global', 'html'];
function prepareSF(){
	watchPath('sf', function(name, obj){
		var last = 0;

		const instance = new SFCompiler({
			htmlPrefix: obj.sf.prefix || ''
		});

		name = 'sf-'+name;
		gulp.task(name, sfTask(obj));

		var call = gulp.series(name);
		if(compiling === false){
			var htmlPath = extractHTMLPathPrefix(obj.sf.combine);
			gulp.watch(obj.sf.combine).on('change', function(file, stats){
				if(last === stats.ctimeMs)
					return;

				last = stats.ctimeMs;

				browserSync = true// todo
				if(browserSync && hotReload.sf === true){
					file = file.split('\\').join('/');
					try{
						const path = getPureHTMLPathPrefix(htmlPath, file);
						instance.loadSource(file.replace(path, ''), path, function(data, isData){
							if(!isData) return;

							if(data.content.slice(0, 8) === '__tmplt[')
								data = "window.__tmplt=window.templates;"+data+';window.templates=window.templates;';

							// browserSync.sockets.emit('sf-hot-js', data.content);
							// browserSync.notify("JavaScript Reloaded");
						}, SFInstantReload);
					}catch(e){console.error(e)}
				}

				call();
			});

			var isExist = obj.sf;
			isExist = fs.existsSync(isExist.folder+isExist.file);

			if(!isExist){
				console.log("[First-Time] Compiling '.sf' for '"+name+"'..");
				call();
			}
			else if(startupCompile)
				setTimeout(call, 500);
		}

		else call();
	});
}
function sfTask(path){
	var folderLastPath = path.sf.folder.slice(-1);
	if(folderLastPath !== '/' && folderLastPath !== '\\')
		path.sf.folder += '/';

	return function(){
		obj.onCompiled && firstCompile.sf++;

		var startTime = Date.now();
		versioning(path.versioning, path.sf.folder.replace(path.stripURL || '#$%!.', '')+path.sf.file+'?', startTime);

		var src = gulp.src(path.sf.combine);

		if(includeSourceMap)
			src = src.pipe(sourcemaps.init());

		//

		if(includeSourceMap)
			src = src.pipe(sourcemaps.write('.', obj.timestampSourceMap ? {
				mapFile: function(mapFilePath) {
					return mapFilePath.replace('js.map', startTime+'.js.map');
				}
			} : void 0));

		return src.pipe(gulp.dest(path.sf.folder)).on('end', function(){
			if(obj.onCompiled && --firstCompile.sf === 0)
				obj.onCompiled('SF');
		});
	}
}

// === Other ===
//
gulp.task('browser-sync', function(){
	init();

	if(!obj.browserSync)
		return;

	if(startupCompile === 'prod')
		compiling = true;

	console.log("[Preparing] BrowserSync as server");

	browserSync = require('browser-sync');
	SFLang.watch();
	browserSync = browserSync.init(null, obj.browserSync);
});

// To be executed on Development computer
gulp.task('default', gulp.series('browser-sync'));

// === Compiling Recipe ===
// To be executed on Continuous Delivery
function compileOnly(done, which){
	compiling = true;
	init(which);

	var interval = setInterval(function(){
		if(progressCounter()){
			clearInterval(interval);
			done();
		}
	}, 500);
}

gulp.task('compile', (done)=>compileOnly(done)); // all
gulp.task('compile-js', (done)=>compileOnly(done, 'js'));
gulp.task('compile-css', (done)=>compileOnly(done, 'css'));
gulp.task('compile-html', (done)=>compileOnly(done, 'html'));
gulp.task('compile-sf', (done)=>compileOnly(done, 'sf'));


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

// Check if some file type haven't been supported
function checkIncompatiblePath(name, obj){
	if(obj.css !== void 0)
		console.error("[Paths: "+name+"] Currently plain CSS haven't been supported, use SCSS instead");
	if(obj.sass !== void 0)
		obj.scss = obj.sass;
	if(obj.jsx !== void 0)
		console.error("[Paths: "+name+"] JSX haven't been supported, use HTML instead");
	if(obj.stylus !== void 0)
		console.error("[Paths: "+name+"] Sytlus haven't been supported yet, use SCSS instead..");
	if(obj.less !== void 0)
		console.error("[Paths: "+name+"] 'Less' compiler haven't been supported yet, use SCSS instead..");
}

function watchPath(which, watch){
	var default_ = path.default;
	delete path.default;

	for(var key in path){
		var temp = path[key];
		checkIncompatiblePath('key', temp);

		// Check if default was exist
		// if(default_ && default_[which])
		// 	default_[which].combine = excludeSource(default_[which].combine, temp[which].combine);

		if(temp[which] === void 0)
			continue;

		// Separate file name and folder path
		temp[which].file = splitFolderPath(temp[which].file);
		temp[which].folder = temp[which].file.pop();
		temp[which].file = temp[which].file[0];

		watch(key, temp);
	}

	if(default_){
		checkIncompatiblePath('default', default_);

		// Separate file name and folder path
		default_[which].file = splitFolderPath(default_[which].file);
		default_[which].folder = default_[which].file.pop();
		default_[which].file = default_[which].file[0];

		path.default = default_;
		watch('default', default_);
	}
}

};