module.exports = SFCompiler;

function SFCompiler(obj, gulp){
if(!obj.hotSourceMapContent) obj.hotSourceMapContent = true;
if(!obj.hotReload) obj.hotReload = {};
let { startupCompile } = obj;

// Load dependency
let { collectSourcePath, watchPath } = require('./recipes/_utils.js');
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
	ts:0,
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
		watchPath('ts', Exports.taskTS.addTask, temp);
	},
	deleteConfig(obj){
		// Currently this will only unwatch for file change
		obj.js && Exports.taskJS.removeTask(obj);
		(obj.scss || obj.sass) && Exports.taskSCSS.removeTask(obj);
		obj.html && Exports.taskHTML.removeTask(obj);
		obj.sf && Exports.taskSF.removeTask(obj);
		obj.ts && Exports.taskTS.removeTask(obj);
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

	if(!only || only === 'ts'){
		Exports.taskTS = require('./recipes/ts.js')(pack);
		watchPath('ts', Exports.taskTS.addTask, obj.path);
		console.log(`[${chalk.gray('Prepared')}] .ts handler`);
	}

	obj.onInit && obj.onInit();
	progressCounter(true);
}

let hasProgress = false;
let lastProgress = '';
let lastProgressWait = 1200; // 10 mins (interval 500ms, 600s / 0.5s = 1200)
function progressCounter(newline){
	let temp_ = `${firstCompile.js}${firstCompile.css}${firstCompile.html}${firstCompile.sf}${firstCompile.ts}`;
	if(lastProgress !== temp_) lastProgressWait = 1200;
	else {
		lastProgressWait--;
		if(lastProgressWait <= 0){
			console.error("Compiler was terminated because there are no progress has been detected after 10 mins");
			process.exit(1);
		}
	}

	lastProgress = temp_;
	if(firstCompile.js <= 0 && firstCompile.css <= 0 && firstCompile.html <= 0 && firstCompile.sf <= 0 && firstCompile.ts <= 0){
		if(hasProgress){
			let second = process.env.SF_COMPILER_IDLE_TERMINATE_TIME || 5;
			console.log("Finished, terminating in "+second+" second if not closed");
			setTimeout(()=> process.exit(), second * 1000);
			return true;
		}
		return false;
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

	if(firstCompile.ts > 0){
		if(notFirst) process.stdout.write(', ');
		process.stdout.write(firstCompile.ts+" TS");
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

	Exports.socketSync = function(event, data, notify){
		browserSync.sockets.emit(event, data);
		browserSync.notify(notify || "socketSync");
	};
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

gulp.task('compile', done => compileOnly(done)); // all
gulp.task('compile-js', done => compileOnly(done, 'js'));
gulp.task('compile-css', done => compileOnly(done, 'css'));
gulp.task('compile-html', done => compileOnly(done, 'html'));
gulp.task('compile-sf', done => compileOnly(done, 'sf'));
gulp.task('compile-ts', done => compileOnly(done, 'ts'));

return Exports;
};

SFCompiler.transpileCode = function(code){
	let content = code.split('\n## ');
	if(content.length === 1 && code.slice(0, 2) !== '##'){
		console.log("The .sf file doesn't seems to have any fences, make sure you already put '## js-global' or something else. File: "+root+path);
		return {};
	}

	var lines = 0;
	if(content[0].slice(0, 3) === '## '){
		content[0] = content[0].slice(3);
		lines = 1;
	}
	else{
		lines = content[0].split('\n').length;
		content.shift();
	}

	lines += 1;

	let list = {};
	for (let i=0; i < content.length; i++) {
		let temp = content[i];
		let newLineIndex = temp.indexOf('\n');
		let which = temp.slice(0, newLineIndex).replace('\r', '');
		if(which.indexOf('comment') === 0) continue;

		temp = temp.slice(newLineIndex+1);

		var tags = false;
		if(which.includes('.')){
			[which, ...tags] = which.split(' ').join('').split('.');
		}

		list[which] = {
			code: temp,
			tags,
			map: null, // ToDo
		};
	}

	return list;
}