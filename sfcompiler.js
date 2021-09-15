module.exports = function(obj, gulp){
if(!obj.hotSourceMapContent) obj.hotSourceMapContent = true;
if(!obj.hotReload) obj.hotReload = {};
let { startupCompile } = obj;

// Load dependency
let { collectSourcePath, watchPath, preprocessPath } = require('./recipes/_utils.js');
var SFLang = require('./sf-lang')(obj.translate);
var chalk = require('chalk');
var fs = require('fs');

obj._browserSync = false; // lazy init to improve startup performance

obj._compiling = obj._compiling || false;
var firstCompile = {
	js:0,
	css:0,
	html:0,
	sf:0,
};

var Exports = {
	onInit: false,
	clearGenerateImport(htmlPath){
		let data = fs.readFileSync(htmlPath, 'utf8');
		data = data
			.replace(/(?<=\/\/\#SF\-SF\.CSS\-BEGIN\n).*?\n(?=[\t ]+\/\/\#SF\-SF\.CSS\-END)/s, '')
			.replace(/(?<=\/\/\#SF\-SF\.JS\-BEGIN\n).*?\n(?=[\t ]+\/\/\#SF\-SF\.JS\-END)/s, '')
			.replace(/(?<=\/\/\#SF\-SF\.MJS\-BEGIN\n).*?\n(?=[\t ]+\/\/\#SF\-SF\.MJS\-END)/s, '')
			.replace(/(?<=\/\/\#SF\-CSS\-BEGIN\n).*?\n(?=[\t ]+\/\/\#SF\-CSS\-END)/s, '')
			.replace(/(?<=\/\/\#SF\-JS\-BEGIN\n).*?\n(?=[\t ]+\/\/\#SF\-JS\-END)/s, '');

		fs.writeFileSync(htmlPath, data, 'utf8');
	},
	importConfig(name, obj){
		let temp = {[name]: obj};
		watchPath('js', Exports.taskJS.addTask, temp);
		watchPath('scss', Exports.taskSCSS.addTask, temp);
		watchPath('html', Exports.taskHTML.addTask, temp);
		watchPath('sf', Exports.taskSF.addTask, temp);
	},
	deleteConfig(obj){
		// Currently this will only unwatch for file change
		obj.js && Exports.taskJS.removeTask(obj);
		(obj.scss || obj.sass) && Exports.taskSCSS.removeTask(obj);
		obj.html && Exports.taskHTML.removeTask(obj);
		obj.sf && Exports.taskSF.removeTask(obj);
	},
};

function init(only){
	let pack = { obj, gulp, SFLang, firstCompile };
	obj.beforeInit && obj.beforeInit();

	if(!only || only === 'js'){
		Exports.taskJS = require('./recipes/js.js')(pack);
		watchPath('js', Exports.taskJS.addTask, obj.path); // dont remove the space
		console.log(`[${chalk.gray('Prepared')}] .js handler        `);
	}

	if(!only || only === 'css'){
		Exports.taskSCSS = require('./recipes/scss.js')(pack);
		watchPath('scss', Exports.taskSCSS.addTask, obj.path);
		console.log(`[${chalk.gray('Prepared')}] .scss handler`);
	}

	if(!only || only === 'html'){
		Exports.taskHTML = require('./recipes/html.js')(pack);
		watchPath('html', Exports.taskHTML.addTask, obj.path);
		console.log(`[${chalk.gray('Prepared')}] .html handler`);
	}

	if(!only || only === 'sf'){
		Exports.taskSF = require('./recipes/sf.js')(pack);
		watchPath('sf', Exports.taskSF.addTask, obj.path);
		console.log(`[${chalk.gray('Prepared')}] .sf handler`);
	}

	obj.onInit && obj.onInit();
	progressCounter(true);
}

let hasProgress = false;
function progressCounter(newline){
	if(firstCompile.js <= 0 && firstCompile.css <= 0 && firstCompile.html <= 0 && firstCompile.sf <= 0){
		if(hasProgress){
			console.log("Finished, terminating in 5 second if not closed");
			setTimeout(function(){
				process.exit();
			}, 5000);
		}
		return true;
	}

	hasProgress = true;
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
		notFirst = true;
	}

	if(firstCompile.sf > 0){
		if(notFirst) process.stdout.write(', ');
		process.stdout.write(firstCompile.sf+" SF");
		notFirst = true;
	}

	process.stdout.write(newline ? "\n" : "\r");
	return false;
}

// To be executed on Development computer
gulp.task('default', function(done){
	if(obj._compiling === true)
		return compileOnly(done);

	init();

	if(!obj.browserSync)
		return;

	if(startupCompile === 'prod')
		obj._compiling = true;

	console.log(`[${chalk.gray('Preparing')}] BrowserSync as server`);
	let browserSync = require('browser-sync');

	SFLang.watch();
	browserSync = obj._browserSync = browserSync.init(obj.browserSync, function(){
		require('./src/browser-cmd.js')(browserSync.sockets, collectSourcePath, obj.editor || 'sublime');
	});
});

// === Compiling Recipe ===
// To be executed on Continuous Delivery
function compileOnly(done, which){
	obj._compiling = true;

	if(!obj.onCompiled)
		obj.onCompiled = ()=>{};

	init(which);

	var interval = setInterval(function(){
		if(progressCounter()){
			clearInterval(interval);
			done && done();
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