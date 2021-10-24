module.exports = {
	'true': [";(function(window, module){'use strict';", `})(
		typeof window !== 'undefined' ? window : this,
		typeof module !== 'undefined' ? module : {exports: this});`.replace(/[\n\t]+/g, ''),
	],

	'async': [";(async function(window, module){'use strict';", `})(
		typeof window !== 'undefined' ? window : this,
		typeof module !== 'undefined' ? module : {exports: this});`.replace(/[\n\t]+/g, ''),
	],

	'mjs': ['"use strict";', ''],
	'default': [';{', '};'],

	'es6-function': ["if(typeof window === 'undefined'){var window = this}; async function _init_(){'use strict'; let module = {exports:{}};", ';return module.exports}; export default _init_;'], // Don't change the '_init_'

	'_imports': `async function imports(urls){
		if(typeof sf !== 'undefined' && sf.loader !== void 0)
			return await sf.loader.mjs(urls);
		return Promise.all(urls.map(v => import(v)));
	};
	imports.task = function(){
		return typeof sf !== 'undefined' && sf.loader !== void 0 ? sf.loader.task : null
	};`.replace(/[\n\t]+/g, ''),
};