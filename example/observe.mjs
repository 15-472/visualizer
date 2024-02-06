#!/usr/bin/env node

import child_process from 'node:child_process';

//Runs a command and returns a nice timestamped log of the output

export async function observe(command, {cwd, timeout, reportCb=null} = {}) {


	//TODO:-------- useful extra measurements ---------

	//what core?
	//using: /proc/10944/task/10944/stat
	//or maybe: ps -mo pid,tid,%cpu,psr -p 10944

	//what temp?
	// (hey turbostat woo)
	// `sensors` also seems to get some info for CPU and (at least locally) nvme drives

	//what freq?
	//`turbostat` (needs root or read access to MSRs + rawio)
	// sudo setcap cap_sys_rawio,cap_sys_admin,cap_sys_nice=ep /usr/sbin/turbostat

	// `nvidia-smi` for (nvidia) GPU...

	//Or maybe something like:
	// /usr/sbin/turbostat -q  -i0.1 --show Core,CPU,Avg_MHz,Busy%,Bzy_MHz,TSC_MHz,CoreTmp,PkgTmp

	//maybe: cpupower -c 0-11 frequency-info

	//--------------------------------------------


	//format for the log:
	//[source (uint8)][timestamp (float64)][length (uint8)][data (length x byte)]

	const SRC_FAILED = 0;
	const SRC_STDOUT = 1;
	const SRC_STDERR = 2;
	const SRC_EXTRA = 3;

	let log_buffers = [];
	function log(source, timestamp, data) {
		for (let begin = 0; begin < data.length; begin += 255) {
			const end = Math.min(begin + 255, data.length);
			const length = end - begin;

			const buffer = Buffer.alloc(1 + 8 + 1 + length);
			let offset = 0;
			buffer.writeUInt8(source, offset); offset += 1;
			buffer.writeDoubleLE(timestamp, offset); offset += 8;
			buffer.writeUInt8(length, offset); offset += 1;
			data.copy(buffer, offset, begin, end);
			if (reportCb) {
				reportCb(buffer);
			} else {
				log_buffers.push(buffer);
			}
		}
	}

	try {
	await new Promise((resolve, reject) => {
		const child = child_process.spawn(command[0], command.slice(1), {
			cwd, timeout,
			stdio:['inherit', 'pipe', 'pipe'],
			encoding:'buffer' //read raw bytes
		});
	
		child.stdout.on('data', (data) => {
			log(SRC_STDOUT, performance.now(), data);
		});
		child.stdout.on('end', (data) => {
			//not much to do here? I suppose could add a newline or something.
		});

		child.stderr.on('data', (data) => {
			log(SRC_STDERR, performance.now(), data);
		});
		child.stderr.on('end', (data) => {
			//not much to do here? I suppose could add a newline or something.
		});

		let rejected = false;

		//if the spawn command fails, reject:
		child.on('error', (err) => {
			if (rejected) return;
			rejected = true;
			reject(new Error(`Failed to run command:\n  ${err}`));
		});

		//if the child exits with a non-zero code or signal, reject:
		child.on('close', (code, signal) => {
			if (rejected) return;
			if (code === 0) {
				resolve();
			//if the process exited with an error code or signal, reject:
			} else if (code !== null) {
				reject(new Error(`Command exited with non-zero code ${code}.`));
				rejected = true;
			} else {
				reject(new Error(`Command terminated by signal ${signal}.`));
				rejected = true;
			}
		});
	});
	} catch (err) {
		log(SRC_FAILED, performance.now(), Buffer.from(`Failed: ${err}\n`, 'utf8'));
		throw err;
	}

	return Buffer.concat(log_buffers);
}

export default {observe};



//-----------------------------------------------------------------------

//Handle direct (command-line) invocation:
import url from 'node:url';
import fs from 'node:fs';
if (import.meta.url.startsWith('file:') && url.fileURLToPath(import.meta.url) === process.argv[1]) {

	(async () => {

	function usage() {
		console.error("Usage:"
			+ "\n\tnode observe.mjs <out.log> <command> [args...]"
			);
		process.exit(1);
	}
	
	if (process.argv.length < 4) {
		usage();
	}

	const LOG = process.argv[2];
	const COMMAND = process.argv.slice(3);

	console.log(`Observing command \`${COMMAND.join(' ')}\`; writing log to '${LOG}'.`);

	const stream = fs.createWriteStream(LOG);


	try {
		await observe(COMMAND, {
			reportCb:(buffer) => {
				stream.write(buffer);
			}
		});
	} catch (err) {
		console.error(`Failed -- ${err}`);
	}

	stream.end();

	console.log("done.");


	})();

}
