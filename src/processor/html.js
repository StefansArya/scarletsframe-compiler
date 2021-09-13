// Some information are available on js_global.js

const htmlmin = require('html-minifier');
const {diveObject} = require('../helper.js');

const empty_array = Object.freeze([]);
module.exports = function(path, content, callback, offset, options){
	let result = {lines:1, map: empty_array};

	// Don't minify the HTML on development mode
	// because it may be used for modifying from the browser

	if(options.minify){
		// Avoid enclosed tag
		let temp = [];
		content = content.replace(/{\[(.*?)\]}/gs, function(full, content){
			temp.push(`{[${content.trim()}]}`);
			return '&$;'+(temp.length-1)+'$;&';
		});

		content = content.replace(/{{.*?({{|}})/gs, function(full){
			return avoidQuotes(full, function(full){
				return full.replace(/\/\/.*?$/gm, '').replace(/\/\*.*?\*\//gs, '')
					.split('<').join('*%1#').split('>').join('*%2#');
			});
		});

		// Put back enclosed tag
		content = content.replace(/&\$;([0-9]+)\$;&/g, function(full, index){
			return temp[index];
		});

		content = htmlmin.minify(content, {
			collapseWhitespace: true
		}).replace(/\*%[12]#/g, function(full){
			return full === '*%1#' ? '<' : '>';
		});
	}

	const html = JSON.stringify(content).split('{{ ').join('{{').split(' }}').join('}}');

	let prefix = options.htmlPrefix || '';
	if(options.htmlPrefix) prefix += '/';

	if(options.extra === 'append_to_body'){
		result.content = `_sf_internal.append("${prefix + path.fileName}", ${html})`;
		callback(result);
		return;
	}
	else if(options.extra === 'prepend_to_body'){
		result.content = `_sf_internal.prepend("${prefix + path.fileName}", ${html})`;
		callback(result);
		return;
	}
	else if(options.extra !== void 0){
		callback({map:[], content:'', lines:0});
		return console.error(options.extra, "is not suported for HTML options in", prefix + path.fileName);
	}

	if(path.fileName.indexOf('routes/') === 0){
		let relative = path.fileName.slice(7); // routes/...
		// Skip if already have route
		let exist = diveObject(options.routes, relative.split('/'));
		if(relative.slice(0,1) === '+' && exist === void 0){
			relative = relative.slice(relative.lastIndexOf('+'));

			let ii = -3;
			if(relative.slice(-3) !== '.sf')
				ii = void 0;

			// Also remove .sf extension
			let _path = relative.slice(relative.indexOf('/'), ii).replace('/_', '/:');
			if(_path === '/index')
				_path = '/';

			result.router = {
				path:_path,
				filePath: path.fileName
			};

			diveObject(options.routes, path.fileName.slice(7).split('/'), result);
			exist = result;
		}
		else if(exist.content.includes('html: "'))
			exist.content = exist.content.replace(/html: "[^"\\]*(?:\\.[^"\\]*)*",/, 'html: '+html+',');

		if(exist._routerHTML === void 0)
			exist._routerHTML = result;

		options.routes._$cache = void 0;
		exist._routerHTML.content = html;
		callback(exist._routerHTML);
		return;
	}

	result.content = `__tmplt["${prefix + path.fileName}"]=${html};`;
	callback(result);
}

var _es = '%@~';
function avoidQuotes(str, func, onQuotes){
	str = str.split(_es).join('-');

	var temp = [];
	str = str.replace(/(['"])(?:\1|[\s\S]*?[^\\]\1)/g, function(full){
		temp.push(full);
		return _es+(temp.length-1)+_es;
	});

	if(temp.length === 0)
		return func(str);

	str = func(str);

	if(onQuotes !== void 0){
		for (var i = 0; i < temp.length; i++)
			str = str.replace(_es+i+_es, onQuotes(temp[i]));
	}
	else{
		for (var i = 0; i < temp.length; i++)
			str = str.replace(_es+i+_es, temp[i]);
	}

	return str;
}