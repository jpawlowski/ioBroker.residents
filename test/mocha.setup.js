// Don't silently swallow unhandled rejections
process.on('unhandledRejection', e => {
    throw e;
});

// enable the should interface with sinon
// and load chai-as-promised and sinon-chai by default
// Use .default to handle ESM modules loaded via require()
// Resolve from @iobroker/testing since these packages are bundled there
const _testingDir = require('path').dirname(require.resolve('@iobroker/testing/package.json'));
const _resolve = (name) => require.resolve(name, { paths: [_testingDir] });
const _sinonChai = require(_resolve('sinon-chai'));
const sinonChai = _sinonChai.default ?? _sinonChai;
const _chaiAsPromised = require(_resolve('chai-as-promised'));
const chaiAsPromised = _chaiAsPromised.default ?? _chaiAsPromised;
const { should, use } = require(_resolve('chai'));

should();
use(sinonChai);
use(chaiAsPromised);
