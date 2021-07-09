module.exports = {
	'true': [";(function(window, module){'use strict';", `})(
typeof window !== 'undefined' ? window : this,
typeof module !== 'undefined' ? module : {exports: this});`
	],

	'async': [";(async function(window, module){'use strict';", `})(
typeof window !== 'undefined' ? window : this,
typeof module !== 'undefined' ? module : {exports: this});`
	],
};