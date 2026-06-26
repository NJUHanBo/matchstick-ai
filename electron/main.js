const { app, BrowserWindow, shell } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PROD_API = 'https://matchstick-ai.xyz';

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
};

function startLocalServer(rootDir) {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            if (req.url.startsWith('/api/')) {
                proxyAPI(req, res);
                return;
            }
            serveStatic(rootDir, req, res);
        });
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}

function proxyAPI(req, res) {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        });
        res.end();
        return;
    }

    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
        try {
            const target = PROD_API + req.url;
            const resp = await fetch(target, {
                method: req.method,
                headers: { 'Content-Type': 'application/json' },
                body: req.method !== 'GET' ? body : undefined,
            });
            const data = await resp.text();
            res.writeHead(resp.status, { 'Content-Type': 'application/json' });
            res.end(data);
        } catch {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Proxy error' }));
        }
    });
}

function serveStatic(rootDir, req, res) {
    const urlPath = req.url.split('?')[0];
    const filePath = path.join(rootDir, urlPath === '/' ? 'index.html' : urlPath);

    if (!filePath.startsWith(rootDir)) {
        res.writeHead(403);
        res.end();
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
    });
}

let mainWindow;
let server;
let serverPort;

app.setAsDefaultProtocolClient('matchstick-ai');

app.on('open-url', (event, url) => {
    event.preventDefault();
    const hashIndex = url.indexOf('#');
    if (hashIndex !== -1 && mainWindow && serverPort) {
        mainWindow.loadURL(`http://127.0.0.1:${serverPort}/${url.substring(hashIndex)}`);
        mainWindow.focus();
    }
});

app.whenReady().then(async () => {
    const rootDir = path.resolve(__dirname, '..');
    server = await startLocalServer(rootDir);
    serverPort = server.address().port;
    const port = serverPort;

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: '火柴人的时光管理',
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 12, y: 12 },
        backgroundColor: '#0b0b14',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    mainWindow.loadURL(`http://127.0.0.1:${port}`);

    // 外部链接在系统浏览器中打开
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http')) shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
});

app.on('window-all-closed', () => {
    if (server) server.close();
    app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && server) {
        const port = server.address().port;
        mainWindow = new BrowserWindow({
            width: 1200,
            height: 800,
            title: '火柴人的时光管理',
            titleBarStyle: 'hiddenInset',
            trafficLightPosition: { x: 12, y: 12 },
            backgroundColor: '#0b0b14',
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
            },
        });
        mainWindow.loadURL(`http://127.0.0.1:${port}`);
    }
});
