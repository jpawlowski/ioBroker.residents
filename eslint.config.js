module.exports = {
    root: true,
    env: {
        es6: true,
        node: true,
        mocha: true,
    },
    extends: ['eslint:recommended'],
    plugins: [],
    rules: {
        indent: [
            'error',
            4,
            {
                SwitchCase: 1,
            },
        ],
        'no-console': 'off',
        'no-unused-vars': [
            'error',
            {
                ignoreRestSiblings: true,
                argsIgnorePattern: '^_',
            },
        ],
        'no-var': 'error',
        'no-trailing-spaces': 'error',
        'prefer-const': 'error',
        quotes: [
            'error',
            'single',
            {
                avoidEscape: true,
                allowTemplateLiterals: true,
            },
        ],
        semi: ['error', 'always'],
    },
    parserOptions: {
        ecmaVersion: 2020,
    },
    ignorePatterns: ['.prettierrc.js', 'node_modules/', 'dist/', 'coverage/', 'test/'],
};
