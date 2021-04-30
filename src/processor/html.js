// Some information are available on js_global.js

const htmlmin = require('html-minifier');
const {diveObject} = require('../helper.js');

const empty_array = Object.freeze([]);
module.exports = function(path, content, callback, offset, options){
	let result = {lines:1, map: empty_array};
	const html = JSON.stringify(!options.minify
		? content
		: htmlmin.minify(content, { collapseWhitespace: true })
	).split('{{ ').join('{{').split(' }}').join('}}');

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
	else if(options.extra !== void 0)
		return console.error(options.extra, "is not suported for HTML options in", prefix + path.fileName);

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