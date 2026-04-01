// Don't silently swallow unhandled rejections
process.on('unhandledRejection', (e) => {
    throw e;
});

// enable the should interface with sinon
// and load chai-as-promised and sinon-chai by default
// Use .default to handle ESM modules loaded via require()
// Resolve from @iobroker/testing since these packages are bundled there
const _testingDir = require('path').dirname(require.resolve('@iobroker/testing/package.json'));
const _sinonChai = require(require.resolve('sinon-chai', { paths: [_testingDir] }));
const sinonChai = _sinonChai.default ?? _sinonChai;
const _chaiAsPromised = require('chai-as-promised');
const chaiAsPromised = _chaiAsPromised.default ?? _chaiAsPromised;
const { should, use } = require('chai');

should();
use(sinonChai);
use(chaiAsPromised);
