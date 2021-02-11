const regex = /(?:^|^ )(class|function|var) (\w+)/gm;

module.exports = {
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
		var addition = ';';
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