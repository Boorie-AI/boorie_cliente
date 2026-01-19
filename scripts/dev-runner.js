const { spawn } = require('child_process');
const net = require('net');

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
};

// Logger function
function log(processName, message, color = colors.cyan) {
    console.log(`${color}[${processName}]${colors.reset} ${message}`);
}

// Function to check if a port is in use by trying to connect to it
function isPortTaken(port) {
    return new Promise((resolve) => {
        // Check IPv4
        const client4 = new net.Socket();
        let status4 = 'free';

        client4.setTimeout(200);
        client4.on('connect', () => {
            client4.destroy();
            status4 = 'taken';
            checkIPv6();
        });
        client4.on('timeout', () => {
            client4.destroy();
            checkIPv6();
        });
        client4.on('error', (err) => {
            client4.destroy();
            checkIPv6();
        });

        client4.connect(port, '127.0.0.1');

        function checkIPv6() {
            if (status4 === 'taken') {
                resolve(true);
                return;
            }

            const client6 = new net.Socket();
            client6.setTimeout(200);
            client6.on('connect', () => {
                client6.destroy();
                resolve(true);
            });
            client6.on('timeout', () => {
                client6.destroy();
                resolve(false);
            });
            client6.on('error', (err) => {
                client6.destroy();
                resolve(false);
            });

            client6.connect(port, '::1');
        }
    });
}

// Function to check if we can bind to the port (double check)
function canBind(port) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', (err) => {
            resolve(false);
        });
        server.once('listening', () => {
            server.close(() => {
                resolve(true);
            });
        });
        server.listen(port, '0.0.0.0');
    });
}

async function getFreePort(startPort) {
    let port = startPort;
    while (port < startPort + 100) {
        const taken = await isPortTaken(port);
        if (!taken) {
            // Double check if we can actually bind
            const bindable = await canBind(port);
            if (bindable) {
                return port;
            }
        }
        port++;
    }
    throw new Error('No free ports found');
}

async function start() {
    try {
        log('System', 'Checking for available ports...');
        const port = await getFreePort(3000);

        if (port !== 3000) {
            log('System', `Port 3000 is busy. Found free port: ${port}`, colors.yellow);
        } else {
            log('System', `Using default port: ${port}`, colors.green);
        }

        // Set environment variables
        process.env.VITE_PORT = port;
        process.env.ELECTRON_START_URL = `http://localhost:${port}`;

        // Start Milvus Lite Server
        log('Milvus', 'Starting Milvus Lite server...', colors.cyan);
        const milvus = spawn('python3', ['scripts/start_milvus.py'], {
            stdio: 'pipe',
            shell: true
        });

        milvus.stdout.on('data', (data) => {
            log('Milvus', data.toString().trim(), colors.cyan);
        });

        milvus.stderr.on('data', (data) => {
            // Milvus often logs to stderr for info
            log('Milvus', data.toString().trim(), colors.cyan);
        });

        log('Vite', 'Starting frontend server...');

        // Start Vite with specific port and strict mode preventing auto-switching
        const vite = spawn('npx', ['vite', '--port', port, '--strictPort'], {
            stdio: 'pipe',
            shell: true,
            env: { ...process.env }
        });

        vite.stdout.on('data', (data) => {
            const output = data.toString().trim();
            if (output) log('Vite', output, colors.green);
        });

        vite.stderr.on('data', (data) => {
            const output = data.toString().trim();
            if (output) log('Vite', output, colors.red);
        });

        vite.on('close', (code) => {
            log('Vite', `Process exited with code ${code}`, colors.red);
            process.exit(code);
        });

        // Wait for Vite to be ready
        const waitOn = require('wait-on');
        const opts = {
            resources: [`http://localhost:${port}`],
            delay: 1000,
            interval: 1000,
            timeout: 30000,
            tcpTimeout: 1000,
            window: 1000,
        };

        log('System', `Waiting for frontend to be ready at http://localhost:${port}...`);

        try {
            await waitOn(opts);
            log('System', 'Frontend is ready!', colors.green);

            log('Electron', 'Building and starting Electron...');

            const { spawnSync } = require('child_process');
            const buildResult = spawnSync('npm', ['run', 'build:electron-ts'], {
                stdio: 'inherit',
                shell: true
            });

            if (buildResult.error || buildResult.status !== 0) {
                throw new Error('Electron build failed');
            }

            // Start Electron
            const electronPath = require('path').join(__dirname, '../node_modules/.bin/electron');
            log('Electron', `Starting electron from: ${electronPath}`);
            const electron = spawn(electronPath, ['.'], {
                stdio: 'inherit',
                shell: true,
                env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined }
            });

            electron.on('close', (code) => {
                log('Electron', `Process exited with code ${code}`);
                vite.kill();
                process.exit(code);
            });

        } catch (err) {
            log('System', `Error waiting for frontend: ${err.message}`, colors.red);
            vite.kill();
            process.exit(1);
        }

    } catch (error) {
        console.error('Failed to start application:', error);
        process.exit(1);
    }
}

start();
