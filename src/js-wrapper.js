module.exports = {
	'true': [";(function(window, module){'use strict';", `})(
typeof window !== 'undefined' ? window : this,
typeof module !== 'undefined' ? module : {exports: this});`.replace(/\n+/, '')
	],

	'async': [";(async function(window, module){'use strict';", `})(
typeof window !== 'undefined' ? window : this,
typeof module !== 'undefined' ? module : {exports: this});`.replace(/\n+/, '')
	],
};