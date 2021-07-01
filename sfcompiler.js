module.exports = function(obj, gulp){
if(!obj.hotSourceMapContent) obj.hotSourceMapContent = true;
if(!obj.hotReload) obj.hotReload = {};
let { startupCompile } = obj;

// Load dependency
let { collectSourcePath, watchPath } = require('./recipes/_utils.js');
var SFLang = require('./sf-lang')(obj.translate);
var chalk = require('chalk');

obj._browserSync = false; // lazy init to improve startup performance

obj._compiling = false;
var firstCompile = {
	js:0,
	css:0,
	html:0,
	sf:0,
};

var Exports = {
	onInit: false
};

function init(only){
	let pack = { obj, gulp, SFLang, firstCompile };

	if(!only || only === 'js'){
		Exports.taskJS = require('./recipes/js.js')(pack);
		watchPath('js', Exports.taskJS.addTask);
		console.log(`[${chalk.gray('Prepared')}] .js handler`);
	}

	if(!only || only === 'css'){
		Exports.taskSCSS = require('./recipes/scss.js')(pack);
		watchPath('scss', Exports.taskSCSS.addTask);
		console.log(`[${chalk.gray('Prepared')}] .scss handler`);
	}

	if(!only || only === 'html'){
		Exports.taskHTML = require('./recipes/html.js')(pack);
		watchPath('html', Exports.taskHTML.addTask);
		console.log(`[${chalk.gray('Prepared')}] .html handler`);
	}

	if(!only || only === 'sf'){
		Exports.taskSF = require('./recipes/sf.js')(pack);
		watchPath('sf', Exports.taskSF.addTask);
		console.log(`[${chalk.gray('Prepared')}] .sf handler`);
	}

	obj.onInit && obj.onInit();
	progressCounter(true);
}

function progressCounter(newline){
	if(firstCompile.js <= 0 && firstCompile.css <= 0 && firstCompile.html <= 0 && firstCompile.sf <= 0)
		return true;

	process.stdout.write("Compiling: ");
	var notFirst = false;

	if(firstCompile.js > 0){
		process.stdout.write(firstCompile.js+" JS");
		notFirst = true;
	}

	if(firstCompile.css > 0){
		if(notFirst) process.stdout.write(', ');
		process.stdout.write(firstCompile.css+" CSS");
		notFirst = true;
	}

	if(firstCompile.html > 0){
		if(notFirst) process.stdout.write(', ');
		process.stdout.write(firstCompile.html+" HTML");
	}

	if(firstCompile.sf > 0){
		if(notFirst) process.stdout.write(', ');
		process.stdout.write(firstCompile.sf+" SF");
	}

	process.stdout.write(newline ? "\n" : "\r");
	return false;
}

gulp.task('browser-sync', function(){
	init();

	if(!obj.browserSync)
		return;

	if(startupCompile === 'prod')
		obj._compiling = true;

	console.log(`[${chalk.gray('Preparing')}] BrowserSync as server`);
	let browserSync = obj._browserSync = require('browser-sync');

	SFLang.watch();
	browserSync = browserSync.init(obj.browserSync, function(){
		require('./src/browser-cmd.js')(browserSync.sockets, collectSourcePath, obj.editor);
	});
});

// To be executed on Development computer
gulp.task('default', gulp.series('browser-sync'));

// === Compiling Recipe ===
// To be executed on Continuous Delivery
function compileOnly(done, which){
	obj._compiling = true;
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

return Exports;
};