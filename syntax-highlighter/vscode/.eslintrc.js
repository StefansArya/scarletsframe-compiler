/**@type {import('eslint').Linter.Config} */
// eslint-disable-next-line no-undef
module.exports = {
	root: true,
	parser: '@typescript-eslint/parser',
	plugins: [
		'@typescript-eslint',
	],
	extends: [
		'eslint:recommended',
		// 'plugin:@typescript-eslint/recommended',
	],
	rules: {
		'semi': [2, "always"],
		'no-unused-vars': 0,
		'no-explicit-any': 0,
	}
};