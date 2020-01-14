module.exports = {
    env: {
        es6: true,
        node: true
    },
    extends: [
        'eslint:recommended',
        'plugin:mocha/recommended',
        'plugin:prettier/recommended'
    ],
    globals: {
        Atomics: 'readonly',
        SharedArrayBuffer: 'readonly'
    },
    parserOptions: {
        ecmaVersion: 2018,
        sourceType: 'module'
    },
    rules: {}
};
