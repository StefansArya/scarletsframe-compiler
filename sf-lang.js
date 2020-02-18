var through = require('through2');
var _ = require('lodash');
var fs = require('fs');
var cheerio = require('cheerio');
var strSimilar = require('string-similarity');
var writtingFile = new Set();

var langs = {};
var langsSave = {};
var config = null; // being set after configure
var forJS = false; // being set after initialize

// Avoid multiple file signal
var fileChanged = {};

function fileChanges(lang){
	fileChanged[lang] = true;
	setTimeout(function(){
	    fileChanged[lang] = false;
	}, 1000);
}

function initLang(){
	var saveDir = config.saveDir;
	if(config.defaultLang.indexOf('-') !== -1)
		console.error("[sf-lang] Please use _ instead of - when specifying default language");

	for (var i = 0; i < config.translate.length; i++) {
		if(config.translate[i].indexOf('-') !== -1)
			console.error("[sf-lang] Please use _ instead of - when specifying language: "+config.translate[i]);
	}

	try{
		var path = config.saveDir+'/'+config.defaultLang+'.json';
		langs[config.defaultLang] = JSON.parse(fs.readFileSync(path).toString('utf8'));
	}catch(e){}

	if(langs[config.defaultLang] === void 0)
		langs[config.defaultLang] = {};

	for (var i = 0; i < config.translate.length; i++) {
		let lang = config.translate[i];
		let langPath = config.saveDir+'/'+lang+'.json';

		try{
			langs[lang] = JSON.parse(fs.readFileSync(langPath).toString('utf8'));
		}catch(e){}

		langsSave[lang] = _.debounce(function(){
			// Avoid multiple changed file signal
			fileChanges(lang+'.json');

			fs.writeFileSync(langPath, JSON.stringify(langs[lang], null, "\t"));
		}, 1000);
	}

	if(config.jsFunc)
		forJS = RegExp('\\b'+config.jsFunc+'\\(([\'"`])(.*?)\\1[),]', 'gs');

	// Get js flag list
	config.jsFlag = [];
	for (var i = 0; i < config.folder.length; i++) {
		if(config.folder[i].flag)
			config.jsFlag.push(config.folder[i].prefix);
	}
}

var masked1 = [];
var masked2 = [];
function translate(keyPath, text, force){
	for (let i = 0; i < config.translate.length; i++) {
		if(config.defaultLang === config.translate[i])
			continue;

		var val = _.get(langs, config.translate[i]+'.'+keyPath);
		if(!force && config.retranslate === false && val)
			continue;

		if(force === 'if-similar'){
			if(val && val !== text)
				continue;
		}

		if(config.on && config.on.translate){
			config.on.translate(text.replace(/{(.*?)}/, function(full, val){
				masked1.push(full);
				return '{{@'+(masked1.length-1)+'@}}';
			}).replace(/\[(.*?)\]/, function(full, val){
				masked2.push(full);
				return '[/ '+val+' '+(masked2.length-1)+'/]';
			}), config.translate[i], function(newText){
				_.set(langs, config.translate[i]+'.'+keyPath, newText.replace(/{{@(?:.*?|)([0-9]+)(?:.*?|)@}}/, function(full, val){
					return masked1[val];
				}).replace(/\[\/(?: +|)(.*?)([0-9]+)(?:.*?|)\/\]/, function(full, val){
					return `[${val.trim()}]`;
				}));

				langsSave[config.translate[i]]();
			});
			continue;
		}

		_.set(langs, config.translate[i]+'.'+keyPath, text);
		langsSave[config.translate[i]]();
	}
}

function newChanges(file, stats){
	file = file.split('\\').join('/');

	if(writtingFile.has(file))
		return;

	// console.log("[sf-lang] scanning "+file);

	// Get keys from folder structure and the prefix
	var keys = config.folder;
	var prefix;
	for (var i = 0; i < keys.length; i++) {
		if(file.indexOf(keys[i].path) === 0){
			prefix = keys[i].prefix;
			keys = file.replace(keys[i].path, keys[i].prefix).split('/');

			var fileName = keys.pop().split('.');
			fileName.pop();

			keys.push(fileName.join('_'));
			break;
		}
	}

	if(prefix === void 0)
		return console.error('[sf-lang] prefix not found');

	// Read HTML/script
	var html = fs.readFileSync(file).toString('utf8');
	var isJS = file.indexOf('.js') !== -1;

	// Parse HTML if not JS
	var match, lang = [];
	if(isJS === false){
		var $ = cheerio.load(html, {
			decodeEntities: false
		});
		html = $('[sf-lang]');
		var htmlRef = {};

		for (var i = 0; i < html.length; i++) {
			var current = html.eq(i);

			var value = current.attr('placeholder');
			if(value === void 0)
				value = current.html();

			value = value.trim().replace(/{+(.*?)}+/, function(full, match){
				return '{'+match.trim()+'}';
			}).split('\\n').join("\n").split('\\\\').join('\\');

			if(value.length === 0)
				continue;

			var invalid = false;
			value = value.replace(/<([a-zA-Z\-]+).*?>(.*?)<\/\1>/g, function(full, tag, match){
				if(match.indexOf('<') !== -1){
					console.error('[sf-lang]', "Invalid usage: HTML tag too deep");
					invalid = true;
				}

				return '['+match.trim()+']';
			}).split('\\n').join("\n").split('\\\\').join('\\');

			if(invalid)
				continue;

			lang.push(value);

			if(htmlRef[value] === void 0)
				htmlRef[value] = [];

			htmlRef[value].push(current);
		}
	}
	// Extract text from script
	else{
		while((match = forJS.exec(html)) !== null){
			var temp = match[2].trim().replace(/{+(.*?)}+/, function(full, match){
				return '{'+match.trim()+'}';
			}).split('\\n').join("\n").split('\\\\').join('\\');

			if(temp.length === 0)
				continue;

			lang.push(temp);
		}
	}

	// Return if no sf-lang found
	if(lang.length === 0)
		return;

	if(_.has(langs[config.defaultLang], keys))
		var data = _.get(langs[config.defaultLang], keys);
	else{
		var data = [];
		_.set(langs[config.defaultLang], keys, data);
	}

	var savePath = config.saveDir+'/';
	var unused = _.fill(Array(data.length), true);
	var pendingCreate = [];
	var similarText = {};
	var jsonChanged = false;

	// Save data for next scan
	keys = keys.join('.')+'.';
	for (var i = 0; i < lang.length; i++) {
		// Find similar text from other place
		var similar = deepFind(langs[config.defaultLang], lang[i]);
		if(similar !== false){
			similarText[lang[i]] = similar; // Save key into the value
			unused[i] = false;
			continue;
		}
		else{
			if(data.length !== 0){
				var match = strSimilar.findBestMatch(lang[i], data);
				var rating = match.bestMatch.rating;
			}
			else var rating = 0;
		}

		// Nothing changed because already exist
		if(rating === 1){
			unused[match.bestMatchIndex] = false;
			continue;
		}

		jsonChanged = true;

		// Create new index
		if(rating < config.similarity){
			if(config.on && config.on.create)
				lang[i] = config.on.create(lang[i]);

			// Let find the unused key first
			pendingCreate.push(lang[i]);
		}

		// Modify index
		else{
			if(config.on && config.on.modify)
				lang[i] = config.on.modify(lang[i]);

			data[match.bestMatchIndex] = lang[i];

			var keyPath = data.indexOf(lang[i]);
			if(keyPath === -1){
				console.error('[sf-lang] Error: Unexpected -1 index', '('+match.bestMatchIndex+'):', lang[i]);

				// Error recovery
				data.push(lang[i]);
				keyPath = data.indexOf(lang[i]);
			}

			keyPath = keys+keyPath;

			translate(keyPath, lang[i]);
			console.log('[sf-lang] Modified:', keyPath);

			unused[match.bestMatchIndex] = false;
		}
	}

	for (var i = 0; i < pendingCreate.length; i++) {
		var z = unused.indexOf(true);

		if(z === -1)
			data.push(pendingCreate[i]);
		else{
			data[z] = pendingCreate[i];
			unused[z] = false;
		}

		var keyPath = keys+data.indexOf(pendingCreate[i]);
		translate(keyPath, pendingCreate[i], true);

		console.log('[sf-lang] Created:', keyPath);
	}

	if(jsonChanged){
		// Avoid multiple changed file signal
		fileChanges(config.defaultLang+'.json');

		fs.writeFileSync(savePath+config.defaultLang+'.json', JSON.stringify(langs[config.defaultLang], null, "\t"));
	}

	// Directly rewrite key to html only
	if(!isJS){
		var changes = false;
		for (var i = 0; i < lang.length; i++) {
			var current = htmlRef[lang[i]];

			if(similarText[lang[i]])
				var keyPath = similarText[lang[i]];
			else
				var keyPath = keys+data.indexOf(lang[i]);

			for (var a = 0; a < current.length; a++) {
				if(current[a].attr('sf-lang') === keyPath)
					continue;

				current[a].attr('sf-lang', keyPath);
				changes = true;
			}
		}

		if(changes === false)
			return;

		html = $('body').html();

		var wFD = setInterval(function(){
			writtingFile.add(file);
			try{
				fs.writeFileSync(file, html);
			}catch(e){return}

			clearInterval(wFD);

			setTimeout(function(){
				writtingFile.delete(file);
			}, 50);
		}, 50);
	}
}

function flattenFlip(obj, prefix){
	var data = {};

	function dive(obj_, path){
		var keys = Object.keys(obj_);
		for (var i = 0; i < keys.length; i++) {
			var type = obj_[keys[i]].constructor;
			if(type === Object || type === Array){
				dive(obj_[keys[i]], path+keys[i]+'.');
				continue;
			}

			data[obj_[keys[i]]] = path+keys[i];
		}
	}

	dive(obj, prefix ? prefix+'.' : '');
	return data;
}

function deepFind(obj, value){
	var found = false;

	function dive(obj_, path){
		var keys = Object.keys(obj_);
		for (var i = 0; i < keys.length; i++) {
			var type = obj_[keys[i]].constructor;
			if(type === Object || type === Array){
				dive(obj_[keys[i]], path+keys[i]+'.');
				continue;
			}

			if(found) return;
        	if(obj_[keys[i]] === value)
				found = path+keys[i];
		}
	}

	dive(obj, '');
	return found;
}

module.exports = function(config_){
	config = config_;
	initLang();

	return {
		scan:newChanges,
		jsPipe:function(){
			return through.obj(function(file, encode, callback){
				if(langs[config.defaultLang] === void 0)
					return callback(null, file);

				var data = flattenFlip(langs[config.defaultLang]);
				var changes = file.contents.toString('utf8');

				for (var i = 0; i < config.jsFlag.length; i++) {
					changes = changes.replace(forJS, function(full, quote, value){
						value = data[value.trim()];
						if(value === void 0)
							return full;

						return `${config.jsFunc}(${quote}${value}${quote})`;
					});
				}

				file.contents = Buffer.from(changes, 'utf8');
				callback(null, file);
			})
		},
		watch:function(){
			// Enable auto reload if file was changed not from the program
			fs.watch(config.saveDir, {recursive:true}, function(eventType, filename){
				if(eventType !== 'change' || !filename || fileChanged[filename])
					return;

				// Avoid multiple changed file signal
				fileChanges(filename);

				var name = filename.split('.json');

				if(name.length === 2 && name[1] === ''){
					try{
						langs[name[0]] = JSON.parse(fs.readFileSync(config.saveDir+'/'+filename).toString('utf8'));
						console.log('[sf-lang]', name[0], "was reloaded");
					}catch(e){
						console.log('[sf-lang]', filename, "is either invalid JSON or can't be opened");
					}

					// Check if some data was missing/broken with other language
					if(name[0] === config.defaultLang){
						var keys = Object.values(flattenFlip(langs[name[0]]));
						var reprocess = [];

						for (var i = 0; i < keys.length; i++) {
							var similarCount = 0;
							var defaultValue = _.get(langs[config.defaultLang], keys[i]);

							for (var a = 0; a < config.translate.length; a++) {
								if(config.translate[a] === config.defaultLang)
									continue;

								var check = _.get(langs[config.translate[a]], keys[i]);
								if(check === void 0 || check === ''){
									reprocess.push(keys[i]);
									break;
								}

								if(check === defaultValue){
									if(similarCount++ === 3){
										reprocess.push(keys[i]);
										break;
									}
								}
							}
						}

						if(reprocess.length === 0)
							return;

						for (var i = 0; i < reprocess.length; i++) {
							console.log('[sf-lang]', 'Reprocessing:', reprocess[i]);
							translate(reprocess[i], _.get(langs[config.defaultLang], reprocess[i]), 'if-similar');
						}
					}
				}
			});
		}
	};
};