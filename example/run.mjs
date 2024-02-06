#!/usr/bin/env node

import child_process from 'node:child_process';

main();
//wrapped in a function so we can `await`:
async function main() {
	await run('build', ['node', 'Maekfile.js']);
	await run('test-O0', ['bin/test-math_O0']);
	await run('test-O2', ['bin/test-math_O2']);
}

//helper that runs a command, passing through stdin/out/err, and also marks the run nicely:
async function run(name, command) {
	console.log(`BEGIN ${name}`);
	const before = performance.now();

	await new Promise((resolve, reject) => {
		const child = child_process.spawn(
			command[0], command.slice(1),
			{ stdio:'inherit' }
		);
		child.on('error', (err) => {
			console.error(`ERROR: Failed to run command:\n  ${err}`);
			process.exit(1);
		});
		child.on('close', (code, signal) => {
			if (code === 0) {
				resolve();
				//if the process exited with an error code or signal, exit this script:
			} else if (code !== null) {
				console.error(`ERROR: Command exited with non-zero code ${code}.`);
				process.exit(1);
			} else {
				console.error(`ERROR: Command terminated by signal ${signal}.`);
				process.exit(1);
			}
		});
	});

	const after = performance.now();
	console.log(`END ${name} ${after-before}ms`);
}
