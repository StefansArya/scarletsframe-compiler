const regex = /(?:^|^ )(class|function|var) (\w+)/gm;

module.exports = {
	diveObject(obj, parts, setValue){
		for (let i = 0, n = parts.length-1; i <= n; i++) {
			const key = parts[i];

			if(setValue === void 0){ // get only
		    	if(!(key in obj))
		    		return;

		    	obj = obj[key];
			}
			else{ // set
				if(i === n){
					obj[key] = setValue;
					return;
				}

				if(!(key in obj))
	                obj = obj[key] = {};
	            else obj = obj[key];
			}
	    }

	    return obj;
	},
	diveDelete(obj, path){
		let hasChild = false;
		function diveDelete(obj, path, i){
			if(i+1 === path.length){
				delete obj[path[i]];
				return;
			}

			let dive = obj[path[i]];
			diveDelete(dive, path, i+1);

			if(hasChild) return;
			for(let key in dive){
				hasChild = true;
				return;
			}

			delete obj[path[i]];
		}

		diveDelete(obj, path, 0);
	},
	createTreeDiver(map, isSingle){
		let insideOfView = false, code = '';
		let thePath = '';

		function diveRoute(routes){
			let skip = {_$cache: true};
			for(let key in routes){
				if(skip[key]) continue;

				// If directory
				let route = routes[key];
				let content = route.content;
				if(content === void 0 || content.constuctor === Object){
					if(key.includes('+')){
						let [parent, view] = key.split('+');
						view = JSON.stringify(view); // view-selector

						if(parent !== ''){
							if(!isSingle){
								parent += '.sf';
								skip[parent] = true;

								// console.log(21, routes, parent);
								route = routes[parent];
								if(route._routerJS === void 0)
									code += `{path: ${JSON.stringify(route.router.path)}, html: ${route.content}`;
								else
									code += route.content.replace('{', '{path:'+JSON.stringify(route.router.path)+',').slice(0, -1);
							}
							else{
								route = routes[key];
								if(route._routerJS === void 0)
									code += `{path: `;
								else route.content.replace('{', `{path: `);

								if(parent === 'index')
									parent = '';

								code += JSON.stringify(thePath+'/'+parent.replace('_', ':'));
								thePath = '';
							}

							code += `,${view}:[`;
							diveRoute(routes[key]);
							code += ']},';
						}
						else{
							if(insideOfView)
								throw "Views '"+view+"'must be placed on the /routes root folder, or relative with other page routes (page+"+view+").";

							insideOfView = true;
							code += `sf.Views._$edit(${view}, [`;
							if(routes['index.sf'] === void 0)
								code += '{path:"/", html:"\'index.sf\' was not found"},';

							diveRoute(routes[key]);
							code += ']);';
							insideOfView = false;
						}
					}
					else{
						if(isSingle)
							thePath += key === 'index' ? '/' : '/'+key;

						diveRoute(routes[key]);
					}
				}
				else {
					if(route._routerJS === void 0)
						code += `{path: ${JSON.stringify(route.router.path)}, html: ${route.content}},`;
					else
						code += content.replace('{', '{path:'+JSON.stringify(route.router.path)+',')+',';
				}
			}
		}

		// For source map
		function diveMapRoute(routes){
			let skip = {_$cache: true};
			for(let key in routes){
				if(skip[key]) continue;

				let route = routes[key];
				if(route._routerJS !== void 0){
					for (let a = 0; a < route.map.length; a++) {
						const t = route.map[a];
						map.addMapping({
							original: {line: t.originalLine, column: t.originalColumn},
							generated: {line: t.generatedLine+currentLines, column: t.generatedColumn},
							source: t.source,
						});
					}

					// console.log(t.generatedLine, currentLines);
					currentLines += route.lines;
				}

				// If directory
				let content = route.content;
				if(content === void 0 || content.constuctor === Object){
					if(key.includes('+')){
						let [parent] = key.split('+');

						if(parent !== ''){
							parent += '.sf';
							skip[parent] = true;
						}
						diveRoute(route);
					}
					else diveRoute(route);
				}
			}
		}

		function getCode(){
			return code.split(',]').join(']').split(',}').join('}');
		}

		return {route: diveRoute, mapRoute: diveMapRoute, getCode}
	},
	jsGetScopeVar(content, path){
		const prop = {};
		var has = false;
		content.replace(regex, function(full, key, word){
			has = true;
			prop[word] = key === 'class';
			return full;
		});

		if(has === false) return content;

		// Note: late window assignment, to avoid possible memory leak
		var addition = '\n;';
		let propArr = [];
		for(let word in prop){
			propArr.push(word);

			if(!prop[word]) // not a Class
				addition += `window.${word}=${word};`;
			else {
				addition += `if(!window.${word})window.${word}=${word};else{
const glob = window.${word};
if(window.sf$hotReload === void 0)
	alert("This hot reload feature need framework v0.34.9 or higher");
window.sf$hotReload.replaceClass(glob, ${word});
${word}=glob;
if(glob.sf$refresh)glob.sf$refresh.forEach(v=>v());
}`;
			}
		}

		propArr = JSON.stringify(propArr);

		// Don't use var inside this
		addition += `;{
if(!window._sf1cmplr) window._sf1cmplr={};
let temp = window._sf1cmplr["${path}"];
if(!temp) window._sf1cmplr["${path}"] = ${propArr};
else{
	const propArr = ${propArr};
	for (let i = 0; i < temp.length; i++) {
		if(!propArr.includes(temp[i]))
			delete window[temp[i]];
	}
	window._sf1cmplr["${path}"] = propArr
}};
`;

		return content+addition;
	}
};