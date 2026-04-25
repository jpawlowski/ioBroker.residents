import { execFileSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const requiredFiles = ['admin/index.html', 'admin/build/index.js'];

function runPackDryRun() {
    const output = execFileSync(npmCommand, ['pack', '--dry-run', '--json'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    const trimmedOutput = output.trim();
    const jsonStart = trimmedOutput.lastIndexOf('\n[');
    const jsonText = jsonStart >= 0 ? trimmedOutput.slice(jsonStart + 1) : trimmedOutput;

    const result = JSON.parse(jsonText);
    if (!Array.isArray(result) || result.length === 0 || !Array.isArray(result[0].files)) {
        throw new Error('npm pack --dry-run --json did not return a package file list.');
    }

    return result[0].files.map(file => file.path);
}

function main() {
    const packagedFiles = runPackDryRun();
    const missingFiles = requiredFiles.filter(file => !packagedFiles.includes(file));

    if (missingFiles.length > 0) {
        console.error('Package verification failed. Missing files:');
        for (const file of missingFiles) {
            console.error(`- ${file}`);
        }
        process.exit(1);
    }

    console.log('Package verification passed. Required admin files are included.');
}

main();
