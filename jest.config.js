export default {
    clearMocks: true,
    moduleFileExtensions: ['js', 'ts', 'json'],
    testMatch: ['**/*.test.ts'],
    transform: {
        '^.+\\.(ts|js)$': 'babel-jest'
    },
    transformIgnorePatterns: ['/node_modules/(?!@octokit/rest)/']
};
