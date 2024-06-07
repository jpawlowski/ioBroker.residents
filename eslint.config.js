module.exports = {
    languageOptions: {
        ecmaVersion: 2021,
        sourceType: 'module',
        globals: {
            node: true,
            mocha: true,
        },
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
};
